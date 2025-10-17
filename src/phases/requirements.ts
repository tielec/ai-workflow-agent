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

export class RequirementsPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'requirements' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;
    const planningReference = this.getPlanningDocumentReference(issueInfo.number);

    const executePrompt = this.loadPrompt('execute')
      .replace('{planning_document_path}', planningReference)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number));

    await this.executeWithAgent(executePrompt, { maxTurns: 30 });

    const outputFile = path.join(this.outputDir, 'requirements.md');
    if (!fs.existsSync(outputFile)) {
      return {
        success: false,
        error: `requirements.md が見つかりません: ${outputFile}`,
      };
    }

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
    // try {
    //   const content = fs.readFileSync(outputFile, 'utf-8');
    //   await this.postOutput(content, '要件定義書');
    // } catch (error) {
    //   const message = (error as Error).message ?? String(error);
    //   console.warn(`[WARNING] GitHubへの要件定義出力に失敗しました: ${message}`);
    // }

    return {
      success: true,
      output: outputFile,
    };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;
    const requirementsFile = path.join(this.outputDir, 'requirements.md');

    if (!fs.existsSync(requirementsFile)) {
      return {
        success: false,
        error: 'requirements.md が存在しません。execute() を先に実行してください。',
      };
    }

    const planningReference = this.getPlanningDocumentReference(issueInfo.number);
    const requirementsReference = this.getAgentFileReference(requirementsFile);

    if (!requirementsReference) {
      return {
        success: false,
        error: 'Agent が requirements.md を参照できません。',
      };
    }

    const reviewPrompt = this.loadPrompt('review')
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number));

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 30, logDir: this.reviewDir });

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
    const planningReference = this.getPlanningDocumentReference(issueInfo.number);
    const requirementsFile = path.join(this.outputDir, 'requirements.md');

    if (!fs.existsSync(requirementsFile)) {
      return {
        success: false,
        error: 'requirements.md が存在しません。execute() を先に実行してください。',
      };
    }

    const requirementsReference = this.getAgentFileReference(requirementsFile);
    if (!requirementsReference) {
      return {
        success: false,
        error: 'Agent が requirements.md を参照できません。',
      };
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number));

    await this.executeWithAgent(revisePrompt, { maxTurns: 30, logDir: this.reviseDir });

    if (!fs.existsSync(requirementsFile)) {
      return {
        success: false,
        error: '改訂後の requirements.md を確認できませんでした。',
      };
    }

    return {
      success: true,
      output: requirementsFile,
    };
  }

}
