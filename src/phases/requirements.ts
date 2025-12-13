import { getFsExtra } from '../utils/fs-proxy.js';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

const fs = getFsExtra();

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

    // Issue #47: executePhaseTemplate() を使用してコード削減
    // Issue #113: enableFallback: true を追加
    return this.executePhaseTemplate('requirements.md', {
      planning_document_path: this.getPlanningDocumentReference(issueInfo.number),
      issue_info: this.formatIssueInfo(issueInfo),
      issue_number: String(issueInfo.number),
    }, {
      enableFallback: true  // Issue #113: フォールバック機構を有効化
    });

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
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

    // Issue #113: 前回のログスニペットを取得
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');
    let previousLogSnippet = '';
    if (fs.existsSync(agentLogPath)) {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
      previousLogSnippet = agentLog.substring(0, 2000);  // 最初の2000文字
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number))
      .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）');  // Issue #113

    logger.info(`Phase ${this.phaseName}: Starting revise with previous log snippet`);
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
