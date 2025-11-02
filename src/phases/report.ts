import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams, type PhaseRunOptions } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';
import { getErrorMessage } from '../utils/error-utils.js';

type PhaseOutputInfo = {
  path: string;
  exists: boolean;
};

type PhaseOutputMap = Record<string, PhaseOutputInfo>;

export class ReportPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'report' });
  }

  public async run(options: PhaseRunOptions = {}): Promise<boolean> {
    // 親クラスの run() を実行（execute + review cycle）
    const success = await super.run(options);

    // すべての処理が成功した場合のみ、ログをクリーンアップ（Issue #411）
    if (success) {
      const gitManager = options.gitManager ?? null;
      const issueNumber = parseInt(this.metadata.data.issue_number, 10);
      try {
        // BasePhase の cleanupWorkflowLogs() を使用（Issue #49）
        await this.cleanupWorkflowLogs();
        logger.info('Workflow logs cleaned up successfully.');

        // ログクリーンナップによる削除をコミット・プッシュ（Issue #16: commitCleanupLogs を使用）
        if (gitManager) {
          const commitResult = await gitManager.commitCleanupLogs(issueNumber, 'report');

          if (!commitResult.success) {
            throw new Error(`Git commit failed: ${commitResult.error ?? 'unknown error'}`);
          }

          const pushResult = await gitManager.pushToRemote();
          if (!pushResult.success) {
            throw new Error(`Git push failed: ${pushResult.error ?? 'unknown error'}`);
          }

          logger.info('Cleanup changes committed and pushed.');
        }
      } catch (error) {
        const message = getErrorMessage(error);
        logger.warn(`Failed to cleanup workflow logs: ${message}`);
      }
    }

    return success;
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);

    // オプショナルコンテキストを構築（Issue #398, #396）
    const requirementsContext = this.buildOptionalContext(
      'requirements',
      'requirements.md',
      '要件定義書は利用できません。Issue情報から要件を推測してください。',
      issueNumber,
    );

    const designContext = this.buildOptionalContext(
      'design',
      'design.md',
      '設計書は利用できません。Issue情報から設計内容を推測してください。',
      issueNumber,
    );

    const implementationContext = this.buildOptionalContext(
      'implementation',
      'implementation.md',
      '実装ログは利用できません。リポジトリの実装内容を確認してください。',
      issueNumber,
    );

    const testingContext = this.buildOptionalContext(
      'testing',
      'test-result.md',
      'テスト結果は利用できません。実装内容から推測してください。',
      issueNumber,
    );

    const documentationContext = this.buildOptionalContext(
      'documentation',
      'documentation-update-log.md',
      'ドキュメント更新ログは利用できません。',
      issueNumber,
    );

    // 参考情報（オプショナル）
    const scenarioContext = this.buildOptionalContext('test_scenario', 'test-scenario.md', '', issueNumber);
    const testImplementationContext = this.buildOptionalContext(
      'test_implementation',
      'test-implementation.md',
      '',
      issueNumber,
    );

    // Issue #47: executePhaseTemplate() を使用してコード削減
    // Issue #113: enableFallback: true を追加
    const result = await this.executePhaseTemplate('report.md', {
      planning_document_path: this.getPlanningDocumentReference(issueNumber),
      requirements_context: requirementsContext,
      design_context: designContext,
      implementation_context: implementationContext,
      testing_context: testingContext,
      documentation_context: documentationContext,
      test_scenario_context: scenarioContext,
      test_implementation_context: testImplementationContext,
      issue_number: String(issueNumber),
    }, {
      maxTurns: 30,
      enableFallback: true  // Issue #113: フォールバック機構を有効化
    });

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）

    // 特殊ロジック: PRサマリー更新（Report Phase 特有のロジック）
    if (result.success) {
      const outputs = this.getPhaseOutputs(issueNumber);
      await this.updatePullRequestSummary(issueNumber, outputs);
    }

    return result;
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const reportFile = path.join(this.outputDir, 'report.md');

    if (!fs.existsSync(reportFile)) {
      return {
        success: false,
        error: 'report.md が存在しません。execute() を先に実行してください。',
      };
    }

    const reviewPrompt = this.buildPrompt('review', issueNumber, reportFile);

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 30, logDir: this.reviewDir });
    const reviewResult = await this.contentParser.parseReviewResult(messages);

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, reviewResult.feedback, 'utf-8');

    await this.github.postReviewResult(
      issueNumber,
      this.phaseName,
      reviewResult.result,
      reviewResult.feedback,
      reviewResult.suggestions,
    );

    return {
      success: reviewResult.result !== 'FAIL',
      output: reviewResult.result,
      error: reviewResult.result === 'FAIL' ? reviewResult.feedback : undefined,
    };
  }

  public async revise(reviewFeedback: string): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const reportFile = path.join(this.outputDir, 'report.md');

    if (!fs.existsSync(reportFile)) {
      return {
        success: false,
        error: 'report.md が存在しません。execute() を先に実行してください。',
      };
    }

    // Issue #113: 前回のログスニペットを取得
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');
    let previousLogSnippet = '';
    if (fs.existsSync(agentLogPath)) {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
      previousLogSnippet = agentLog.substring(0, 2000);  // 最初の2000文字
    }

    const revisePrompt = this.buildPrompt('revise', issueNumber, reportFile)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）');  // Issue #113

    logger.info(`Phase ${this.phaseName}: Starting revise with previous log snippet`);
    await this.executeWithAgent(revisePrompt, { maxTurns: 30, logDir: this.reviseDir });

    if (!fs.existsSync(reportFile)) {
      return {
        success: false,
        error: '改訂後の report.md を確認できませんでした。',
      };
    }

    return {
      success: true,
      output: reportFile,
    };
  }

  private buildPrompt(promptType: 'review' | 'revise', issueNumber: number, reportPath: string): string {
    const reportReference = this.getAgentFileReference(reportPath);
    if (!reportReference) {
      throw new Error(`Failed to compute reference for ${reportPath}`);
    }

    const planningReference = this.getPlanningDocumentReference(issueNumber);

    // オプショナルコンテキストを構築（Issue #398）
    const requirementsContext = this.buildOptionalContext('requirements', 'requirements.md', '', issueNumber);
    const designContext = this.buildOptionalContext('design', 'design.md', '', issueNumber);
    const implementationContext = this.buildOptionalContext('implementation', 'implementation.md', '', issueNumber);
    const testingContext = this.buildOptionalContext('testing', 'test-result.md', '', issueNumber);
    const documentationContext = this.buildOptionalContext(
      'documentation',
      'documentation-update-log.md',
      '',
      issueNumber,
    );
    const scenarioContext = this.buildOptionalContext('test_scenario', 'test-scenario.md', '', issueNumber);
    const testImplementationContext = this.buildOptionalContext(
      'test_implementation',
      'test-implementation.md',
      '',
      issueNumber,
    );

    return this.loadPrompt(promptType)
      .replace('{report_document_path}', reportReference)
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_context}', requirementsContext)
      .replace('{design_context}', designContext)
      .replace('{implementation_context}', implementationContext)
      .replace('{testing_context}', testingContext)
      .replace('{documentation_context}', documentationContext)
      .replace('{test_scenario_context}', scenarioContext)
      .replace('{test_implementation_context}', testImplementationContext)
      .replace('{issue_number}', String(issueNumber));
  }

  private getPhaseOutputs(issueNumber: number): PhaseOutputMap {
    const baseDir = path.resolve(this.metadata.workflowDir, '..', `issue-${issueNumber}`);

    const entries: Record<string, string> = {
      requirements: path.join(baseDir, '01_requirements', 'output', 'requirements.md'),
      design: path.join(baseDir, '02_design', 'output', 'design.md'),
      test_scenario: path.join(baseDir, '03_test_scenario', 'output', 'test-scenario.md'),
      implementation: path.join(baseDir, '04_implementation', 'output', 'implementation.md'),
      test_implementation: path.join(
        baseDir,
        '05_test_implementation',
        'output',
        'test-implementation.md',
      ),
      test_result: path.join(baseDir, '06_testing', 'output', 'test-result.md'),
      documentation: path.join(
        baseDir,
        '07_documentation',
        'output',
        'documentation-update-log.md',
      ),
    };

    return Object.fromEntries(
      Object.entries(entries).map(([phase, filePath]) => [
        phase,
        {
          path: filePath,
          exists: fs.existsSync(filePath),
        },
      ]),
    );
  }

  private async updatePullRequestSummary(issueNumber: number, outputs: PhaseOutputMap): Promise<void> {
    try {
      let prNumber = this.metadata.data.pr_number ?? null;
      const branchName =
        this.metadata.data.branch_name ?? `ai-workflow/issue-${this.metadata.data.issue_number}`;

      if (!prNumber) {
        const existing = await this.github.checkExistingPr(branchName);
        if (existing) {
          prNumber = existing.pr_number;
        } else {
          logger.info('No existing PR found. Skipping PR body update.');
          return;
        }
      }

      if (!prNumber) {
        return;
      }

      const extractedInfo = await this.github.extractPhaseOutputs(
        issueNumber,
        Object.fromEntries(
          Object.entries(outputs).map(([key, value]) => [key, value.path]),
        ),
      );

      const prBody = this.github.generatePrBodyDetailed(issueNumber, branchName, extractedInfo);
      const result = await this.github.updatePullRequest(prNumber, prBody);

      if (!result.success) {
        logger.warn(`Failed to update PR body: ${result.error ?? 'unknown error'}`);
      } else {
        logger.info(`Updated PR #${prNumber} summary.`);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to update PR summary: ${message}`);
    }
  }

}
