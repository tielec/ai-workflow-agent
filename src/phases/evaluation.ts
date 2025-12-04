import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams, type PhaseRunOptions } from './base-phase.js';
import { PhaseExecutionResult, RemainingTask, PhaseName, IssueContext } from '../types.js';
import { getErrorMessage } from '../utils/error-utils.js';

type PhaseOutputInfo = {
  path: string;
  exists: boolean;
};

type PhaseOutputMap = Record<string, PhaseOutputInfo>;

export class EvaluationPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'evaluation' });
  }

  public async run(options: PhaseRunOptions = {}): Promise<boolean> {
    // 親クラスの run() を実行（execute + review cycle）
    const success = await super.run(options);

    // すべての処理が成功し、かつ --cleanup-on-complete 未指定の場合、ログをクリーンアップ（Issue #16）
    if (success && !options.cleanupOnComplete) {
      const gitManager = options.gitManager ?? null;
      const issueNumber = parseInt(this.metadata.data.issue_number, 10);

      try {
        // BasePhase の cleanupWorkflowLogs() を使用（Issue #49）
        await this.cleanupWorkflowLogs();
        logger.info('Workflow logs cleaned up successfully.');

        // ログクリーンナップによる削除をコミット・プッシュ（Issue #16）
        if (gitManager) {
          const commitResult = await gitManager.commitCleanupLogs(issueNumber, 'evaluation');

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
        // クリーンアップ失敗時もワークフロー全体は成功として扱う（Report Phaseと同じパターン）
      }
    }

    // オプションが指定されている場合は、ワークフロー全体を削除（Issue #2）
    if (success && options.cleanupOnComplete) {
      const force = options.cleanupOnCompleteForce ?? false;

      try {
        await this.cleanupWorkflowArtifacts(force);
        logger.info('Workflow artifacts cleanup completed.');
      } catch (error) {
        const message = getErrorMessage(error);
        logger.warn(`Failed to cleanup workflow artifacts: ${message}`);
        // エラーでもワークフローは成功として扱う
      }
    }

    return success;
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const outputs = this.getAllPhaseOutputs(issueNumber);

    const requiredPhases: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
    ];

    for (const phase of requiredPhases) {
      if (!outputs[phase]?.exists) {
        return {
          success: false,
          output: null,
          decision: null,
          error: `${phase} の成果物が見つかりません: ${outputs[phase]?.path ?? 'N/A'}`,
        };
      }
    }

    const planningReference = this.getPlanningDocumentReference(issueNumber);
    const issueTitle = this.metadata.data.issue_title ?? `Issue #${issueNumber}`;
    const repoName = this.metadata.data.repository ?? 'unknown';
    const branchName =
      this.metadata.data.branch_name ?? `ai-workflow/issue-${this.metadata.data.issue_number}`;
    const workflowDir = this.metadata.workflowDir;
    const agentWorkingDir = this.getAgentWorkingDirectory();

    const relPaths: Record<string, string> = {};
    for (const [phase, info] of Object.entries(outputs)) {
      const relative = this.getAgentFileReference(info.path);
      relPaths[phase] = relative ?? info.path;
    }

    const phaseOutputsList = Object.entries(relPaths)
      .map(([phase, ref]) => `- **${this.formatPhaseName(phase)}**: ${ref}`)
      .join('\n');

    const executePrompt = this.loadPrompt('execute')
      .replace('{issue_number}', String(issueNumber))
      .replace('{issue_title}', issueTitle)
      .replace('{repo_name}', repoName)
      .replace('{branch_name}', branchName)
      .replace('{workflow_dir}', workflowDir)
      .replace('{phase_outputs}', phaseOutputsList)
      .replace('{planning_document_path}', planningReference)
      .replace('{requirements_document_path}', relPaths.requirements)
      .replace('{design_document_path}', relPaths.design)
      .replace('{test_scenario_document_path}', relPaths.test_scenario)
      .replace('{implementation_document_path}', relPaths.implementation)
      .replace('{test_implementation_document_path}', relPaths.test_implementation)
      .replace('{test_result_document_path}', relPaths.testing)
      .replace('{documentation_update_log_path}', relPaths.documentation)
      .replace('{report_document_path}', relPaths.report);

    logger.info(`Phase ${this.phaseName}: Starting agent execution with maxTurns=50`);
    logger.info(`Expected output file: ${path.join(this.outputDir, 'evaluation_report.md')}`);

    await this.executeWithAgent(executePrompt, { maxTurns: 50 });

    logger.info(`Phase ${this.phaseName}: Agent execution completed`);
    const evaluationFile = path.join(this.outputDir, 'evaluation_report.md');
    logger.info(`Checking for output file existence: ${evaluationFile}`);

    if (!fs.existsSync(evaluationFile)) {
      logger.warn(`Phase ${this.phaseName}: Output file not found on first attempt: ${evaluationFile}`);
      logger.warn(`Attempting fallback: extracting evaluation from agent log`);

      // フォールバック処理: エージェントログから評価内容を抽出
      const fallbackResult = await this.handleMissingEvaluationFile(evaluationFile, executePrompt);

      if (!fallbackResult.success) {
        return fallbackResult;
      }

      logger.info(`Fallback succeeded: evaluation_report.md created from agent log`);
    }

    try {
      const content = fs.readFileSync(evaluationFile, 'utf-8');

      // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
      // await this.postOutput(content, 'プロジェクト評価レポート');

      const decisionResult = await this.contentParser.parseEvaluationDecision(content);

      logger.debug(`Decision extraction result: ${JSON.stringify(decisionResult)}`);

      if (!decisionResult.success || !decisionResult.decision) {
        logger.error(`Failed to determine decision: ${decisionResult.error}`);
        logger.error(`Content snippet: ${content.substring(0, 500)}`);
        return {
          success: false,
          output: evaluationFile,
          decision: decisionResult.decision ?? null,
          error: decisionResult.error ?? '判定タイプの解析に失敗しました',
        };
      }

      const decision = decisionResult.decision;
      logger.info(`評価判定: ${decision}`);

      if (decision === 'PASS') {
        this.metadata.setEvaluationDecision({ decision: 'PASS' });
        return {
          success: true,
          output: evaluationFile,
          decision,
        };
      }

      if (decision === 'PASS_WITH_ISSUES') {
        const remainingTasks = decisionResult.remainingTasks ?? [];
        const passResult = await this.handlePassWithIssues(remainingTasks, issueNumber, evaluationFile);

        if (!passResult.success) {
          this.metadata.setEvaluationDecision({
            decision: 'PASS_WITH_ISSUES',
            remainingTasks,
            createdIssueUrl: null,
          });
          return {
            success: false,
            output: evaluationFile,
            decision,
            error: passResult.error ?? '残タスク Issue の作成に失敗しました',
          };
        }

        this.metadata.setEvaluationDecision({
          decision: 'PASS_WITH_ISSUES',
          remainingTasks,
          createdIssueUrl: passResult.createdIssueUrl ?? null,
        });

        return {
          success: true,
          output: evaluationFile,
          decision,
        };
      }

      if (decision.startsWith('FAIL_PHASE_')) {
        const failedPhase = decisionResult.failedPhase;

        // FAIL_PHASE_UNKNOWN: フェーズ名が特定できない場合
        if (!failedPhase || decision === 'FAIL_PHASE_UNKNOWN') {
          logger.warn('FAIL_PHASE detected but specific phase could not be identified.');
          logger.warn('Evaluation Phase will complete successfully, but manual rollback may be required.');

          this.metadata.setEvaluationDecision({
            decision: 'FAIL_PHASE_UNKNOWN',
            failedPhase: null,
          });

          // フェーズ自体は成功として終了（後続のクリーンアップ等が実行される）
          return {
            success: true,
            output: evaluationFile,
            decision: 'FAIL_PHASE_UNKNOWN',
          };
        }

        const failResult = this.metadata.rollbackToPhase(failedPhase);
        if (!failResult.success) {
          logger.warn(`Failed to rollback to phase ${failedPhase}: ${failResult.error}`);
          logger.warn('Evaluation Phase will complete successfully, but metadata rollback failed.');

          this.metadata.setEvaluationDecision({
            decision,
            failedPhase,
          });

          // ロールバック失敗でもフェーズ自体は成功として終了
          return {
            success: true,
            output: evaluationFile,
            decision,
          };
        }

        this.metadata.setEvaluationDecision({
          decision,
          failedPhase,
        });

        return {
          success: true,
          output: evaluationFile,
          decision,
        };
      }

      if (decision === 'ABORT') {
        const abortReason =
          decisionResult.abortReason ?? 'プロジェクトを継続できない重大な問題が検出されました。';
        const abortResult = await this.handleAbort(abortReason, issueNumber);

        this.metadata.setEvaluationDecision({
          decision: 'ABORT',
          abortReason,
        });

        if (!abortResult.success) {
          return {
            success: false,
            output: evaluationFile,
            decision,
            error: abortResult.error ?? 'ワークフロー中止処理に失敗しました',
          };
        }

        return {
          success: true,
          output: evaluationFile,
          decision,
        };
      }

      logger.error(`Invalid decision type: ${decision}`);
      logger.error(`Valid decisions: PASS, PASS_WITH_ISSUES, FAIL_PHASE_*, ABORT`);
      logger.error(`Content snippet for debugging: ${content.substring(0, 1000)}`);
      return {
        success: false,
        output: evaluationFile,
        decision,
        error: `不正な判定タイプ: ${decision}. 有効な判定: PASS, PASS_WITH_ISSUES, FAIL_PHASE_*, ABORT`,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      return {
        success: false,
        output: evaluationFile,
        decision: null,
        error: message,
      };
    }
  }

  protected async review(): Promise<PhaseExecutionResult> {
    // Evaluation phase does not require review
    // But we save a placeholder result.md for consistency
    const reviewFile = path.join(this.reviewDir, 'result.md');
    const content = '# 評価フェーズレビュー\n\n評価フェーズにはレビューは不要です。\n\n**判定**: PASS\n';
    fs.writeFileSync(reviewFile, content, 'utf-8');

    return {
      success: true,
      output: null,
    };
  }

  protected async revise(feedback: string): Promise<PhaseExecutionResult> {
    // Revise is used for two scenarios:
    // 1. File not created on first attempt (feedback will contain error message)
    // 2. Review failed (standard revise scenario, but Evaluation Phase has no review)

    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const issueTitle = this.metadata.data.issue_title ?? `Issue #${issueNumber}`;
    const repoName = this.metadata.data.repository ?? 'unknown';
    const evaluationFile = path.join(this.outputDir, 'evaluation_report.md');
    const evaluationReportPath = this.getAgentFileReference(evaluationFile) ?? evaluationFile;

    // Get previous log snippet
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');
    let previousLogSnippet = '';
    if (fs.existsSync(agentLogPath)) {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
      previousLogSnippet = agentLog.substring(0, 2000);
    }

    // Get existing evaluation content if available
    let evaluationContent = '';
    if (fs.existsSync(evaluationFile)) {
      evaluationContent = fs.readFileSync(evaluationFile, 'utf-8');
    }

    // Get phase outputs
    const outputs = this.getAllPhaseOutputs(issueNumber);
    const relPaths: Record<string, string> = {};
    for (const [phase, info] of Object.entries(outputs)) {
      const relative = this.getAgentFileReference(info.path);
      relPaths[phase] = relative ?? info.path;
    }
    const phaseOutputsList = Object.entries(relPaths)
      .map(([phase, ref]) => `- **${this.formatPhaseName(phase)}**: ${ref}`)
      .join('\n');

    const revisePrompt = this.loadPrompt('revise')
      .replace('{issue_number}', String(issueNumber))
      .replace('{issue_title}', issueTitle)
      .replace('{repo_name}', repoName)
      .replace('{evaluation_report_path}', evaluationReportPath)
      .replace('{review_feedback}', feedback)
      .replace('{evaluation_content}', evaluationContent || '（評価レポートファイルが存在しません）')
      .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）')
      .replace('{phase_outputs}', phaseOutputsList);

    logger.info(`Phase ${this.phaseName}: Starting revise with explicit file save instruction`);
    await this.executeWithAgent(revisePrompt, { maxTurns: 30, logDir: this.reviseDir });

    // Check if file was created
    if (!fs.existsSync(evaluationFile)) {
      return {
        success: false,
        output: null,
        decision: null,
        error: [
          `evaluation_report.md が見つかりません: ${evaluationFile}`,
          `Revise ステップでもファイルが作成されませんでした。`,
          `エージェントログを確認してください: ${path.join(this.reviseDir, 'agent_log.md')}`,
        ].join('\n'),
      };
    }

    logger.info(`Phase ${this.phaseName}: Revise succeeded, evaluation_report.md created`);
    return {
      success: true,
      output: evaluationFile,
    };
  }

  private getAllPhaseOutputs(issueNumber: number): PhaseOutputMap {
    const baseDir = path.resolve(this.metadata.workflowDir, '..', `issue-${issueNumber}`);

    const entries: Record<string, string> = {
      planning: path.join(baseDir, '00_planning', 'output', 'planning.md'),
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
      testing: path.join(baseDir, '06_testing', 'output', 'test-result.md'),
      documentation: path.join(
        baseDir,
        '07_documentation',
        'output',
        'documentation-update-log.md',
      ),
      report: path.join(baseDir, '08_report', 'output', 'report.md'),
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

  /**
   * Evaluation 結果が「Pass with Issues」の場合の処理
   * フォローアップ Issue を作成する
   */
  private async handlePassWithIssues(
    remainingTasks: RemainingTask[],
    issueNumber: number,
    evaluationFile: string,
  ): Promise<{ success: boolean; createdIssueUrl?: string | null; error?: string }> {
    if (!remainingTasks.length) {
      logger.warn('Evaluation result is "Pass with Issues", but no remaining tasks found');
      return { success: true, createdIssueUrl: null };
    }

    logger.info(`Creating follow-up issue for ${remainingTasks.length} remaining tasks`);

    try {
      const agentWorkingDir = this.getAgentWorkingDirectory();
      const repoRoot = path.resolve(agentWorkingDir, '..', '..');
      const relativeReportPath = path.relative(repoRoot, evaluationFile);

      // ===== 新規: Issue コンテキストの構築 =====

      // Issue Summary: issueTitle から取得（メタデータに存在する場合）
      const issueTitle = this.metadata.data.issue_title ?? `Issue #${issueNumber}`;

      // Blocker Status: デフォルト値（Evaluation レポートからの抽出は Phase 1 で調査）
      // TODO: 将来的には Evaluation レポートから抽出する（Phase 9 改善、別 Issue として提案）
      const blockerStatus = 'すべてのブロッカーは解決済み';

      // Deferred Reason: デフォルト値（同上）
      // TODO: 将来的には Evaluation レポートから抽出する（Phase 9 改善、別 Issue として提案）
      const deferredReason = 'タスク優先度の判断により後回し';

      const issueContext: IssueContext = {
        summary: `この Issue は、Issue #${issueNumber}「${issueTitle}」の Evaluation フェーズで特定された残タスクをまとめたものです。`,
        blockerStatus,
        deferredReason,
      };

      const generationOptions = { ...this.issueGenerationOptions };

      // ===== 既存: フォローアップ Issue 作成 =====

      const result = await this.github.createIssueFromEvaluation(
        issueNumber,
        remainingTasks,
        relativeReportPath,
        issueContext, // 新規パラメータ
        generationOptions,
      );

      if (result.success) {
        logger.info(`Follow-up issue created: #${result.issue_number}`);
        logger.info(`Follow-up issue URL: ${result.issue_url}`);
        return { success: true, createdIssueUrl: result.issue_url ?? null };
      }

      return { success: false, error: result.error ?? 'Issue 作成に失敗しました' };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to create follow-up issue: ${message}`);
      return { success: false, error: message };
    }
  }

  private async handleAbort(
    abortReason: string,
    issueNumber: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const issueResult = await this.github.closeIssueWithReason(issueNumber, abortReason);
      if (!issueResult.success) {
        logger.warn(`Issue クローズに失敗: ${issueResult.error ?? '不明なエラー'}`);
      }

      const prNumber = await this.github.getPullRequestNumber(issueNumber);
      if (prNumber) {
        const prResult = await this.github.closePullRequest(prNumber, abortReason);
        if (!prResult.success) {
          logger.warn(`PR クローズに失敗: ${prResult.error ?? '不明なエラー'}`);
        }
      }

      return { success: true };
    } catch (error) {
      const message = getErrorMessage(error);
      return { success: false, error: message };
    }
  }

  private formatPhaseName(phase: string): string {
    return phase
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  /**
   * ファイルが作成されなかった場合のフォールバック処理（Issue #82）
   *
   * 1. エージェントログから評価内容を抽出して保存
   * 2. 抽出失敗時は revise() メソッドを使用（他のフェーズと同じパターン）
   */
  private async handleMissingEvaluationFile(
    evaluationFile: string,
    originalPrompt: string
  ): Promise<PhaseExecutionResult> {
    // Step 1: エージェントログから評価内容を抽出
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');

    if (!fs.existsSync(agentLogPath)) {
      logger.error(`Agent log not found: ${agentLogPath}`);

      // ログが存在しない場合はエラー（revise しても意味がない）
      return {
        success: false,
        output: null,
        decision: null,
        error: [
          `evaluation_report.md が見つかりません: ${evaluationFile}`,
          `エージェントログも見つかりません: ${agentLogPath}`,
          `エージェントが正常に実行されなかった可能性があります。`,
        ].join('\n'),
      };
    }

    try {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');

      // ログから評価内容を抽出（基準評価、決定、理由などを含むセクション）
      const extractedContent = this.extractEvaluationFromLog(agentLog);

      if (extractedContent && this.isValidEvaluationContent(extractedContent)) {
        // 抽出した内容が妥当な場合、ファイルとして保存
        logger.info(`Extracted valid evaluation content from agent log (${extractedContent.length} chars)`);
        fs.writeFileSync(evaluationFile, extractedContent, 'utf-8');
        logger.info(`Saved extracted evaluation to: ${evaluationFile}`);

        return { success: true, output: evaluationFile };
      }

      // Step 2: 内容が不十分な場合、revise() で再実行（他のフェーズと同じパターン）
      logger.warn(`Extracted content is insufficient or invalid.`);
      logger.info(`Attempting revise step to create evaluation_report.md`);

      const feedback = [
        `evaluation_report.md が見つかりません: ${evaluationFile}`,
        `エージェントが Write ツールを呼び出していない可能性があります。`,
        `前回のログから評価内容を抽出するか、新たに評価を実行してファイルを作成してください。`,
      ].join('\n');

      // revise() メソッドを使用（BasePhase のパターンに従う）
      const reviseResult = await this.revise(feedback);

      return reviseResult;
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      logger.error(`Error during fallback processing: ${message}`);
      return {
        success: false,
        output: null,
        decision: null,
        error: `フォールバック処理中にエラーが発生しました: ${message}`,
      };
    }
  }

  /**
   * エージェントログから評価内容を抽出
   */
  private extractEvaluationFromLog(agentLog: string): string | null {
    // パターン1: "# 評価レポート" または "# Evaluation Report" から始まるセクションを探す
    const reportHeaderPattern = /^#+ (評価レポート|Evaluation Report|プロジェクト評価|Project Evaluation)/im;
    const match = agentLog.match(reportHeaderPattern);

    if (match && match.index !== undefined) {
      // ヘッダー以降のコンテンツを抽出
      const content = agentLog.substring(match.index).trim();

      // 最低限の構造チェック：DECISION キーワードが含まれているか
      if (content.includes('DECISION:')) {
        return content;
      }
    }

    // パターン2: DECISION キーワードを含む大きなブロックを探す
    const lines = agentLog.split('\n');
    let startIndex = -1;
    let hasDecision = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 評価っぽいセクションの開始を探す
      if (startIndex === -1 && /^#+\s+(エグゼクティブサマリー|Executive Summary|評価|Evaluation)/i.test(line)) {
        startIndex = i;
      }

      // DECISION キーワードを探す
      if (line.includes('DECISION:')) {
        hasDecision = true;
        if (startIndex === -1) {
          startIndex = Math.max(0, i - 50); // DECISION の50行前から開始
        }
      }
    }

    if (hasDecision && startIndex !== -1) {
      const extracted = lines.slice(startIndex).join('\n').trim();
      return extracted;
    }

    return null;
  }

  /**
   * 抽出した評価内容が妥当かチェック
   */
  private isValidEvaluationContent(content: string): boolean {
    // 最低限の要件：
    // 1. DECISION キーワードが含まれている
    // 2. 100文字以上（極端に短いものは除外）
    // 3. 評価基準らしきセクション（## または ### で始まる）が複数ある

    if (content.length < 100) {
      logger.debug(`Content too short: ${content.length} chars`);
      return false;
    }

    if (!content.includes('DECISION:')) {
      logger.debug(`Missing DECISION keyword`);
      return false;
    }

    // セクションヘッダーのカウント
    const sectionCount = (content.match(/^##+ /gm) || []).length;
    if (sectionCount < 2) {
      logger.debug(`Insufficient sections: ${sectionCount}`);
      return false;
    }

    return true;
  }
}
