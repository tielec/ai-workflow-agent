import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

type IssueInfo = {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: string[];
  body: string;
};

export class DesignPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'design' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;

    // requirements はオプショナル（Issue #405, #396）
    const requirementsReference = this.buildOptionalContext(
      'requirements',
      'requirements.md',
      '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。',
      issueInfo.number,
    );

    // Issue #47: executePhaseTemplate() を使用してコード削減
    const result = await this.executePhaseTemplate('design.md', {
      planning_document_path: this.getPlanningDocumentReference(issueInfo.number),
      requirements_document_path: requirementsReference,
      issue_info: this.formatIssueInfo(issueInfo),
      issue_number: String(issueInfo.number),
    }, { maxTurns: 40 });

    // 特殊ロジック: 設計決定の抽出（Design Phase 特有のロジック）
    if (result.success && result.output) {
      const designContent = fs.readFileSync(result.output, 'utf-8');
      const decisions = this.metadata.data.design_decisions;

      if (decisions.implementation_strategy === null) {
        const extracted = await this.contentParser.extractDesignDecisions(designContent);
        if (Object.keys(extracted).length) {
          Object.assign(this.metadata.data.design_decisions, extracted);
          this.metadata.save();
          logger.info(`Design decisions updated: ${JSON.stringify(extracted)}`);
        }
      } else {
        logger.info('Using design decisions captured during planning phase.');
      }
    }

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）

    return result;
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;
    const designFile = path.join(this.outputDir, 'design.md');

    if (!fs.existsSync(designFile)) {
      return {
        success: false,
        error: 'design.md が存在しません。execute() を先に実行してください。',
      };
    }

    const requirementsFile = this.getRequirementsFile(issueInfo.number);

    const designReference = this.getAgentFileReference(designFile);
    if (!designReference) {
      return {
        success: false,
        error: 'Agent が design.md を参照できません。',
      };
    }

    // requirements はオプショナル（Issue #405）
    let requirementsReference: string;
    if (requirementsFile) {
      const ref = this.getAgentFileReference(requirementsFile);
      requirementsReference = ref ?? '要件定義書は利用できません。設計内容から要件を推測してレビューしてください。';
    } else {
      requirementsReference = '要件定義書は利用できません。設計内容から要件を推測してレビューしてください。';
    }

    const planningReference = this.getPlanningDocumentReference(issueInfo.number);

    const reviewPrompt = this.loadPrompt('review')
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{design_document_path}', designReference)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number));

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 40, logDir: this.reviewDir });
    const reviewResult = await this.contentParser.parseReviewResult(messages);

    await this.github.postReviewResult(
      issueInfo.number,
      this.phaseName,
      reviewResult.result,
      reviewResult.feedback,
      reviewResult.suggestions,
    );

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, reviewResult.feedback, 'utf-8');

    return {
      success: reviewResult.result !== 'FAIL',
      output: reviewResult.result,
      error: reviewResult.result === 'FAIL' ? reviewResult.feedback : undefined,
    };
  }

  public async revise(reviewFeedback: string): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;
    const designFile = path.join(this.outputDir, 'design.md');

    if (!fs.existsSync(designFile)) {
      return {
        success: false,
        error: 'design.md が存在しません。execute() を先に実行してください。',
      };
    }

    const requirementsFile = this.getRequirementsFile(issueInfo.number);

    const designReference = this.getAgentFileReference(designFile);
    if (!designReference) {
      return {
        success: false,
        error: 'Agent が design.md を参照できません。',
      };
    }

    // requirements はオプショナル（Issue #405）
    let requirementsReference: string;
    if (requirementsFile) {
      const ref = this.getAgentFileReference(requirementsFile);
      requirementsReference = ref ?? '要件定義書は利用できません。設計内容から要件を推測してください。';
    } else {
      requirementsReference = '要件定義書は利用できません。設計内容から要件を推測してください。';
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{design_document_path}', designReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number));

    await this.executeWithAgent(revisePrompt, { maxTurns: 40, logDir: this.reviseDir });

    if (!fs.existsSync(designFile)) {
      return {
        success: false,
        error: '改訂後の design.md を確認できませんでした。',
      };
    }

    const decisions = this.metadata.data.design_decisions;
    if (decisions.implementation_strategy === null) {
      const content = fs.readFileSync(designFile, 'utf-8');
      const extracted = await this.contentParser.extractDesignDecisions(content);
      if (Object.keys(extracted).length) {
        Object.assign(this.metadata.data.design_decisions, extracted);
        this.metadata.save();
        logger.info(`Design decisions updated after revise: ${JSON.stringify(extracted)}`);
      }
    }

    return {
      success: true,
      output: designFile,
    };
  }

  private getRequirementsFile(issueNumber: number): string | null {
    return this.getPhaseOutputFile('requirements', 'requirements.md', issueNumber);
  }
}
