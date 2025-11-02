import path from 'node:path';
import { logger } from '../utils/logger.js';
import fs from 'fs-extra';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

export class PlanningPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'planning' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueInfo = await this.getIssueInfo();

    // Issue #47: executePhaseTemplate() を使用してコード削減
    // Issue #113: enableFallback: true を追加
    const result = await this.executePhaseTemplate('planning.md', {
      issue_info: this.formatIssueInfo(issueInfo),
      issue_number: issueInfo.number.toString(),
    }, {
      maxTurns: 50,
      enableFallback: true  // Issue #113: フォールバック機構を有効化
    });

    // 特殊ロジック: 設計決定の抽出（Planning Phase 特有のロジック）
    if (result.success && result.output) {
      const content = fs.readFileSync(result.output, 'utf-8');
      const decisions = await this.contentParser.extractDesignDecisions(content);
      if (Object.keys(decisions).length) {
        for (const [key, value] of Object.entries(decisions)) {
          this.metadata.setDesignDecision(key, value);
        }
      }
    }

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
    // await this.postOutput(content, '企画フェーズ成果');

    return result;
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueInfo = await this.getIssueInfo();
    const planningFile = path.join(this.outputDir, 'planning.md');

    if (!fs.existsSync(planningFile)) {
      return {
        success: false,
        error: 'planning.md が存在しません。',
      };
    }

    const reviewTemplate = this.loadPrompt('review');
    const prompt = reviewTemplate
      .replace('{issue_number}', issueInfo.number.toString())
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{planning_document_path}', `@${path.relative(this.workingDir, planningFile)}`);

    const messages = await this.executeWithAgent(prompt, { maxTurns: 50, logDir: this.reviewDir });
    const parsed = await this.contentParser.parseReviewResult(messages);

    await this.github.postReviewResult(
      issueInfo.number,
      this.phaseName,
      parsed.result,
      parsed.feedback,
      parsed.suggestions,
    );

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, parsed.feedback, 'utf-8');

    return {
      success: parsed.result !== 'FAIL',
      output: parsed.result,
    };
  }

  public async revise(reviewFeedback: string): Promise<PhaseExecutionResult> {
    const issueInfo = await this.getIssueInfo();
    const planningFile = path.join(this.outputDir, 'planning.md');
    const planningDocumentPath = this.getAgentFileReference(planningFile) ?? planningFile;

    // Issue #113: 前回のログスニペットを取得
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');
    let previousLogSnippet = '';
    if (fs.existsSync(agentLogPath)) {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
      previousLogSnippet = agentLog.substring(0, 2000);  // 最初の2000文字
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{planning_document_path}', planningDocumentPath)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{issue_number}', String(issueInfo.number))
      .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）');  // Issue #113

    logger.info(`Phase ${this.phaseName}: Starting revise with previous log snippet`);
    await this.executeWithAgent(revisePrompt, { maxTurns: 50, logDir: this.reviseDir });

    // Check if file was created
    if (!fs.existsSync(planningFile)) {
      return {
        success: false,
        output: null,
        error: [
          `planning.md が見つかりません: ${planningFile}`,
          `Revise ステップでもファイルが作成されませんでした。`,
          `エージェントログを確認してください: ${path.join(this.reviseDir, 'agent_log.md')}`,
        ].join('\n'),
      };
    }

    logger.info(`Phase ${this.phaseName}: Revise succeeded, planning.md created`);
    return {
      success: true,
      output: planningFile,
    };
  }

}
