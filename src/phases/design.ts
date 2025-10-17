import fs from 'fs-extra';
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
    const planningReference = this.getPlanningDocumentReference(issueInfo.number);
    const requirementsFile = this.getRequirementsFile(issueInfo.number);

    // requirements はオプショナル（Issue #405）
    let requirementsReference: string;
    if (requirementsFile) {
      const ref = this.getAgentFileReference(requirementsFile);
      requirementsReference = ref ?? '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。';
    } else {
      requirementsReference = '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。';
    }

    const executePrompt = this.loadPrompt('execute')
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number));

    await this.executeWithAgent(executePrompt, { maxTurns: 40 });

    const designFile = path.join(this.outputDir, 'design.md');
    if (!fs.existsSync(designFile)) {
      return {
        success: false,
        error: `design.md が見つかりません: ${designFile}`,
      };
    }

    const designContent = fs.readFileSync(designFile, 'utf-8');
    const decisions = this.metadata.data.design_decisions;

    if (decisions.implementation_strategy === null) {
      const extracted = await this.contentParser.extractDesignDecisions(designContent);
      if (Object.keys(extracted).length) {
        Object.assign(this.metadata.data.design_decisions, extracted);
        this.metadata.save();
        console.info(`[INFO] Design decisions updated: ${JSON.stringify(extracted)}`);
      }
    } else {
      console.info('[INFO] Using design decisions captured during planning phase.');
    }

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
    // try {
    //   await this.postOutput(designContent, '設計ドキュメント');
    // } catch (error) {
    //   const message = (error as Error).message ?? String(error);
    //   console.warn(`[WARNING] GitHub への設計ドキュメント投稿に失敗しました: ${message}`);
    // }

    return {
      success: true,
      output: designFile,
    };
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
        console.info(`[INFO] Design decisions updated after revise: ${JSON.stringify(extracted)}`);
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
