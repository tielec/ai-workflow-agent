/**
 * Rollback コマンドハンドラ（Issue #90）
 *
 * フェーズ差し戻し機能を実装するコマンドハンドラ。
 * - 差し戻し理由の読み込み（--reason、--reason-file、--interactive）
 * - メタデータ更新（rollback_context、rollback_history、フェーズステータス）
 * - ROLLBACK_REASON.md の生成
 * - 後続フェーズのリセット
 */

import fs from 'fs-extra';
import path from 'node:path';
import readline from 'node:readline';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { findWorkflowMetadata } from '../core/repository-utils.js';
import { PhaseName, StepName } from '../types.js';
import type { RollbackCommandOptions, RollbackContext, RollbackHistoryEntry, RollbackAutoOptions, RollbackDecision } from '../types/commands.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { CodexAgentClient } from '../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../core/claude-agent-client.js';
import { AgentExecutor } from '../phases/core/agent-executor.js';
import { detectCodexCliAuth, isValidCodexApiKey } from '../core/helpers/codex-credentials.js';
import { glob } from 'glob';

/**
 * Rollback コマンドのエントリーポイント
 */
export async function handleRollbackCommand(options: RollbackCommandOptions): Promise<void> {
  logger.info('Starting rollback command...');

  // 1. メタデータ読み込み
  const { metadataManager, workflowDir } = await loadWorkflowMetadata(options.issue);

  // 2. バリデーション
  validateRollbackOptions(options, metadataManager);

  // 3. 差し戻し理由の読み込み
  const reason = await loadRollbackReason(options, workflowDir);

  // 4. 確認プロンプト（--force でスキップ）
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmRollback(
      options.toPhase,
      reason,
      metadataManager
    );

    if (!confirmed) {
      logger.info('Rollback cancelled.');
      return;
    }
  }

  // 5. ドライランモードの処理
  if (options.dryRun) {
    previewRollback(options, metadataManager, reason);
    return;
  }

  // 6. 差し戻し実行
  await executeRollback(
    options,
    metadataManager,
    workflowDir,
    reason
  );

  logger.info('Rollback completed successfully.');
}

/**
 * ワークフローメタデータを読み込む
 */
async function loadWorkflowMetadata(issueNumber: string): Promise<{
  metadataManager: MetadataManager;
  workflowDir: string;
}> {
  // メタデータの探索
  const result = await findWorkflowMetadata(issueNumber);
  const metadataPath = result.metadataPath;

  const metadataManager = new MetadataManager(metadataPath);
  const workflowDir = metadataManager.workflowDir;

  logger.info(`Loaded workflow metadata: ${metadataPath}`);
  return { metadataManager, workflowDir };
}

/**
 * Rollback オプションをバリデーション
 * Issue #90: テストのためにエクスポート
 */
export function validateRollbackOptions(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager
): void {
  // 1. to-phase の有効性チェック
  const validPhases: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];

  const toPhase = options.toPhase as PhaseName;
  if (!validPhases.includes(toPhase)) {
    throw new Error(
      `Invalid phase name: ${options.toPhase}. ` +
      `Use 'list-presets' command to see valid phase names.`
    );
  }

  // 2. to-step の有効性チェック
  const validSteps: StepName[] = ['execute', 'review', 'revise'];
  const toStep = (options.toStep ?? 'revise') as StepName;
  if (!validSteps.includes(toStep)) {
    throw new Error(
      `Invalid step: ${options.toStep}. ` +
      `Valid steps are: execute, review, revise.`
    );
  }

  // 3. 対象フェーズの状態チェック（Issue #208: completed_steps も考慮）
  const phaseStatus = metadataManager.getPhaseStatus(toPhase);
  const completedSteps = metadataManager.getCompletedSteps(toPhase);

  // Issue #208: completed_steps が空でない場合は「開始済み」と判定
  if (phaseStatus === 'pending' && completedSteps.length === 0) {
    throw new Error(
      `Cannot rollback to phase '${options.toPhase}' ` +
      `because it has not been started yet.`
    );
  }

  // Issue #208: 警告 - status が 'pending' でも completed_steps がある場合
  if (phaseStatus === 'pending' && completedSteps.length > 0) {
    logger.warn(
      `Phase ${options.toPhase}: status is 'pending' but completed_steps is not empty. ` +
      `Treating as started phase (completed_steps: ${JSON.stringify(completedSteps)})`
    );
  }

  // 4. 差し戻し理由の提供チェック
  if (!options.reason && !options.reasonFile && !options.interactive) {
    throw new Error(
      'Rollback reason is required. ' +
      'Use --reason, --reason-file, or --interactive option.'
    );
  }
}

/**
 * 差し戻し理由を読み込む
 * Issue #90: テストのためにエクスポート
 */
export async function loadRollbackReason(
  options: RollbackCommandOptions,
  workflowDir: string
): Promise<string> {
  // 1. --reason オプション（直接指定）
  if (options.reason) {
    if (options.reason.trim().length === 0) {
      throw new Error('Rollback reason cannot be empty.');
    }

    if (options.reason.length > 1000) {
      throw new Error('Rollback reason must be 1000 characters or less.');
    }

    logger.info('Using rollback reason from --reason option');
    return options.reason.trim();
  }

  // 2. --reason-file オプション（ファイル読み込み）
  if (options.reasonFile) {
    const reasonFilePath = path.resolve(options.reasonFile);

    if (!fs.existsSync(reasonFilePath)) {
      throw new Error(`Reason file not found: ${reasonFilePath}`);
    }

    // ファイルサイズ上限チェック（100KB）
    const stats = fs.statSync(reasonFilePath);
    if (stats.size > 100 * 1024) {
      throw new Error('Reason file must be 100KB or less.');
    }

    const reason = fs.readFileSync(reasonFilePath, 'utf-8').trim();

    if (reason.length === 0) {
      throw new Error('Reason file is empty.');
    }

    logger.info(`Loaded rollback reason from file: ${reasonFilePath}`);
    return reason;
  }

  // 3. --interactive オプション（対話的入力）
  if (options.interactive) {
    return await promptUserForReason();
  }

  throw new Error('Rollback reason is required.');
}

/**
 * 確認プロンプトを表示
 */
async function confirmRollback(
  toPhase: string,
  reason: string,
  metadataManager: MetadataManager
): Promise<boolean> {
  // CI環境では自動的にスキップ
  if (config.isCI()) {
    logger.info('CI environment detected. Skipping confirmation prompt.');
    return true;
  }

  // 影響を受けるフェーズをリスト化
  const phases = Object.keys(metadataManager.data.phases) as PhaseName[];
  const toPhaseIndex = phases.indexOf(toPhase as PhaseName);
  const affectedPhases = phases.slice(toPhaseIndex);

  // 警告メッセージを表示
  logger.warn(`Rolling back to phase '${toPhase}' will reset the following phases:`);

  for (const phase of affectedPhases) {
    const phaseData = metadataManager.data.phases[phase];
    logger.warn(`  - ${phase} (status: ${phaseData.status})`);
  }

  logger.warn('All progress in these phases will be lost.');
  logger.warn('');
  logger.warn(`Rollback reason: ${reason.slice(0, 100)}${reason.length > 100 ? '...' : ''}`);
  logger.warn('');

  // ユーザーに確認を求める
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('Do you want to continue? [y/N]: ', (answer: string) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * 対話的に差し戻し理由を入力
 */
async function promptUserForReason(): Promise<string> {
  logger.info('Please enter the rollback reason (press Ctrl+D when finished):');
  logger.info('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const lines: string[] = [];

  return new Promise<string>((resolve, reject) => {
    rl.on('line', (line: string) => {
      lines.push(line);
    });

    rl.on('close', () => {
      const reason = lines.join('\n').trim();

      if (reason.length === 0) {
        reject(new Error('Rollback reason cannot be empty.'));
        return;
      }

      if (reason.length > 1000) {
        reject(new Error('Rollback reason must be 1000 characters or less.'));
        return;
      }

      resolve(reason);
    });
  });
}

/**
 * ドライランモードでプレビュー表示
 */
function previewRollback(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager,
  reason: string
): void {
  logger.info('[DRY RUN] Rollback preview:');
  logger.info('');

  const toPhase = options.toPhase as PhaseName;
  const toStep = (options.toStep ?? 'revise') as StepName;

  // 対象フェーズの変更内容
  const phaseData = metadataManager.data.phases[toPhase];
  logger.info(`Target phase: ${toPhase}`);
  logger.info(`  status: ${phaseData.status} → in_progress`);
  logger.info(`  current_step: ${phaseData.current_step ?? 'null'} → ${toStep}`);
  logger.info(`  rollback_context: (new)`);
  logger.info(`    triggered_at: ${new Date().toISOString()}`);
  if (options.fromPhase) {
    logger.info(`    from_phase: ${options.fromPhase}`);
  }
  logger.info(`    reason: ${reason.slice(0, 100)}${reason.length > 100 ? '...' : ''}`);
  logger.info('');

  // 後続フェーズのリセット内容
  const phases = Object.keys(metadataManager.data.phases) as PhaseName[];
  const toPhaseIndex = phases.indexOf(toPhase);
  const subsequentPhases = phases.slice(toPhaseIndex + 1);

  logger.info('Subsequent phases to be reset:');
  for (const phase of subsequentPhases) {
    const phaseData = metadataManager.data.phases[phase];
    logger.info(`  - ${phase}: ${phaseData.status} → pending`);
  }
  logger.info('');

  // ROLLBACK_REASON.md の内容プレビュー
  logger.info('ROLLBACK_REASON.md content:');
  logger.info('---');
  logger.info(generateRollbackReasonMarkdown(options, reason));
  logger.info('---');
  logger.info('');

  logger.info('[DRY RUN] No changes were made. Remove --dry-run to execute.');
}

/**
 * 差し戻しを実行
 */
async function executeRollback(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager,
  workflowDir: string,
  reason: string
): Promise<void> {
  const toPhase = options.toPhase as PhaseName;
  const toStep = (options.toStep ?? 'revise') as StepName;

  // 1. 差し戻しコンテキストを設定
  const rollbackContext: RollbackContext = {
    triggered_at: new Date().toISOString(),
    from_phase: options.fromPhase ?? null,
    from_step: null, // 将来的に自動検出を実装
    reason: reason,
    review_result: options.reasonFile ?? null,
    details: null, // ブロッカー情報抽出はP1機能として省略
  };

  metadataManager.setRollbackContext(toPhase, rollbackContext);
  logger.info(`Rollback context set for phase ${toPhase}`);

  // 2. 対象フェーズを更新
  metadataManager.updatePhaseForRollback(toPhase, toStep);
  logger.info(`Phase ${toPhase} updated: status=in_progress, current_step=${toStep}`);

  // 3. 後続フェーズをリセット
  const resetPhases = metadataManager.resetSubsequentPhases(toPhase);
  logger.info(`Reset subsequent phases: ${resetPhases.join(', ')}`);

  // 4. current_phase を更新
  metadataManager.data.current_phase = toPhase;
  metadataManager.save();

  // 5. ROLLBACK_REASON.md を生成
  const rollbackReasonMd = generateRollbackReasonMarkdown(options, reason);
  const phaseNumber = getPhaseNumber(toPhase);
  const rollbackReasonPath = path.join(
    workflowDir,
    `${phaseNumber}_${toPhase}`,
    'ROLLBACK_REASON.md'
  );

  fs.writeFileSync(rollbackReasonPath, rollbackReasonMd, 'utf-8');
  logger.info(`ROLLBACK_REASON.md generated: ${rollbackReasonPath}`);

  // 6. 差し戻し履歴を追加
  const historyEntry: RollbackHistoryEntry = {
    timestamp: rollbackContext.triggered_at,
    from_phase: options.fromPhase ?? null,
    from_step: null,
    to_phase: toPhase,
    to_step: toStep,
    reason: reason,
    triggered_by: 'manual',
    review_result_path: options.reasonFile ?? null,
  };

  metadataManager.addRollbackHistory(historyEntry);
  logger.info('Rollback history entry added');

  // 7. Git コミット & プッシュ
  try {
    const gitManager = new GitManager(workflowDir, metadataManager);

    // コミット
    const commitResult = await gitManager.commitRollback(
      [
        rollbackReasonPath,
        metadataManager.metadataPath,
      ],
      toPhase,
      toStep,
      reason
    );

    if (!commitResult.success) {
      throw new Error(commitResult.error ?? 'Commit failed');
    }

    logger.info(`Rollback committed: ${commitResult.commit_hash}`);

    // プッシュ
    const pushResult = await gitManager.pushToRemote();
    if (!pushResult.success) {
      throw new Error(pushResult.error ?? 'Push failed');
    }

    logger.info('Git commit and push completed');
  } catch (error) {
    logger.error(`Failed to commit and push changes: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * ROLLBACK_REASON.md を生成
 * Issue #90: テストのためにエクスポート
 */
export function generateRollbackReasonMarkdown(
  options: RollbackCommandOptions,
  reason: string
): string {
  const sections: string[] = [];

  const toPhase = options.toPhase;
  const phaseNumber = getPhaseNumber(toPhase as PhaseName);

  sections.push(`# Phase ${phaseNumber} (${toPhase}) への差し戻し理由`);
  sections.push('');

  if (options.fromPhase) {
    sections.push(`**差し戻し元**: Phase ${options.fromPhase}`);
  }
  sections.push(`**差し戻し日時**: ${new Date().toISOString()}`);
  sections.push('');

  sections.push('## 差し戻しの理由');
  sections.push('');
  sections.push(reason);
  sections.push('');

  if (options.reasonFile) {
    sections.push('### 参照ドキュメント');
    sections.push('');
    sections.push(`- レビュー結果: @${options.reasonFile}`);
    sections.push('');
  }

  sections.push('### 修正後の確認事項');
  sections.push('');
  sections.push('1. 差し戻し理由に記載された問題を修正');
  sections.push('2. ビルドが成功することを確認');
  sections.push('3. テストが成功することを確認（該当する場合）');
  sections.push('');

  return sections.join('\n');
}

/**
 * フェーズ番号を取得
 * Issue #90: テストのためにエクスポート
 */
export function getPhaseNumber(phase: PhaseName): string {
  const mapping: Record<PhaseName, string> = {
    planning: '00',
    requirements: '01',
    design: '02',
    test_scenario: '03',
    implementation: '04',
    test_implementation: '05',
    testing: '06',
    documentation: '07',
    report: '08',
    evaluation: '09',
  };
  return mapping[phase];
}

// ========================================
// Rollback Auto Mode (Issue #271)
// ========================================

/**
 * Rollback Auto コマンドのエントリーポイント（Issue #271）
 *
 * エージェントを使用して自動的に差し戻しの必要性と対象を判定する
 */
export async function handleRollbackAutoCommand(options: RollbackAutoOptions): Promise<void> {
  logger.info('Starting rollback auto analysis...');

  // 1. メタデータ読み込み
  const { metadataManager, workflowDir } = await loadWorkflowMetadata(String(options.issueNumber));

  // 2. エージェントクライアントの初期化
  const { codexClient, claudeClient } = initializeAgentClients(options.agent);

  if (!codexClient && !claudeClient) {
    throw new Error(
      'No agent client available. Please configure CODEX_API_KEY or CLAUDE_CODE_OAUTH_TOKEN/CLAUDE_CODE_API_KEY.'
    );
  }

  // 3. 分析コンテキストの収集
  const analysisContext = await collectAnalysisContext(
    options.issueNumber,
    metadataManager,
    workflowDir
  );

  // 4. プロンプト生成
  const prompt = buildAgentPrompt(
    options.issueNumber,
    analysisContext,
    metadataManager
  );

  // 5. エージェント実行
  logger.info('Running agent analysis...');
  const agentExecutor = new AgentExecutor(
    codexClient,
    claudeClient,
    metadataManager,
    'evaluation', // ダミーフェーズ名（メトリクス記録用）
    workflowDir,
    () => workflowDir
  );

  const messages = await agentExecutor.executeWithAgent(prompt, {
    maxTurns: 10,
    verbose: false,
  });

  // 6. レスポンスをパース
  const decision = parseRollbackDecision(messages);

  // 7. バリデーション
  validateRollbackDecision(decision);

  // 8. 結果表示
  displayAnalysisResult(decision, options);

  // 9. 差し戻し不要の場合は終了
  if (!decision.needs_rollback) {
    logger.info('Analysis complete: No rollback needed.');
    return;
  }

  // 10. ドライランモードの場合はプレビュー表示して終了
  if (options.dryRun) {
    displayDryRunPreview(decision);
    return;
  }

  // 11. 確認プロンプト（--force かつ high confidence の場合はスキップ）
  const shouldConfirm = !(options.force && decision.confidence === 'high');
  if (shouldConfirm) {
    const confirmed = await confirmRollbackAuto(decision);
    if (!confirmed) {
      logger.info('Rollback cancelled.');
      return;
    }
  } else {
    logger.info('Skipping confirmation (--force with high confidence)');
  }

  // 12. 差し戻し実行
  const rollbackOptions: RollbackCommandOptions = {
    issue: String(options.issueNumber),
    toPhase: decision.to_phase!,
    toStep: decision.to_step,
    reason: decision.reason,
    force: true, // 既に確認済み
    dryRun: false,
  };

  await executeRollback(
    rollbackOptions,
    metadataManager,
    workflowDir,
    decision.reason
  );

  logger.info('Rollback auto completed successfully.');
}

/**
 * エージェントクライアントの初期化（Issue #271）
 */
function initializeAgentClients(agentMode?: 'auto' | 'codex' | 'claude'): {
  codexClient: CodexAgentClient | null;
  claudeClient: ClaudeAgentClient | null;
} {
  const mode = agentMode ?? 'auto';
  let codexClient: CodexAgentClient | null = null;
  let claudeClient: ClaudeAgentClient | null = null;

  // Codex 認証情報のチェック（API キーまたは CLI 認証ファイル）
  const codexApiKey = config.getCodexApiKey();
  const { authFilePath: codexAuthFile } = detectCodexCliAuth();
  const hasCodexCredentials = isValidCodexApiKey(codexApiKey) || codexAuthFile !== null;

  if (mode === 'codex') {
    // Codex 強制
    codexClient = new CodexAgentClient();
    logger.info('Using Codex agent (forced)');
  } else if (mode === 'claude') {
    // Claude 強制
    claudeClient = new ClaudeAgentClient();
    logger.info('Using Claude agent (forced)');
  } else {
    // auto モード: Codex 認証情報があれば Codex、なければ Claude
    if (hasCodexCredentials) {
      codexClient = new CodexAgentClient();
      if (isValidCodexApiKey(codexApiKey)) {
        logger.info('Using Codex agent (auto-selected via CODEX_API_KEY)');
      } else {
        logger.info('Using Codex agent (auto-selected via CODEX_AUTH_JSON)');
      }
    } else if (config.getClaudeCodeToken()) {
      claudeClient = new ClaudeAgentClient();
      logger.info('Using Claude agent (auto-selected)');
    }
  }

  return { codexClient, claudeClient };
}

/**
 * 分析コンテキストの収集（Issue #271）
 */
async function collectAnalysisContext(
  issueNumber: number,
  metadataManager: MetadataManager,
  workflowDir: string
): Promise<{
  latestReviewResultPath: string | null;
  latestTestResultPath: string | null;
}> {
  // 最新のレビュー結果ファイルを検索
  const latestReviewResultPath = await findLatestReviewResult(workflowDir);

  // 最新のテスト結果ファイルを検索
  const latestTestResultPath = await findLatestTestResult(workflowDir);

  if (latestReviewResultPath) {
    logger.info(`Found review result: ${latestReviewResultPath}`);
  } else {
    logger.warn('No review result found');
  }

  if (latestTestResultPath) {
    logger.info(`Found test result: ${latestTestResultPath}`);
  } else {
    logger.warn('No test result found');
  }

  return {
    latestReviewResultPath,
    latestTestResultPath,
  };
}

/**
 * 最新のレビュー結果ファイルを検索（Issue #271）
 */
async function findLatestReviewResult(workflowDir: string): Promise<string | null> {
  const reviewPatterns = [
    '**/review/result.md',
    '**/review/review_result.md',
    '**/review/review-result.md',
    '**/review-result.md',
    '**/REVIEW_RESULT.md',
  ];

  for (const pattern of reviewPatterns) {
    const files = await glob(pattern, {
      cwd: workflowDir,
      absolute: true,
      nodir: true,
    });

    if (files.length > 0) {
      // 最新のファイルを返す（タイムスタンプでソート）
      const sorted = files.sort((a: string, b: string) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtimeMs - statA.mtimeMs;
      });
      return sorted[0];
    }
  }

  return null;
}

/**
 * 最新のテスト結果ファイルを検索（Issue #271）
 */
async function findLatestTestResult(workflowDir: string): Promise<string | null> {
  const testPatterns = [
    '**/06_testing/output/test-result.md',
    '**/testing/output/test-result.md',
    '**/testing/execute/test-result.md',
    '**/testing/test-result.md',
    '**/TEST_RESULT.md',
  ];

  for (const pattern of testPatterns) {
    const files = await glob(pattern, {
      cwd: workflowDir,
      absolute: true,
      nodir: true,
    });

    if (files.length > 0) {
      // 最新のファイルを返す（タイムスタンプでソート）
      const sorted = files.sort((a: string, b: string) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtimeMs - statA.mtimeMs;
      });
      return sorted[0];
    }
  }

  return null;
}

/**
 * エージェント用プロンプトを生成（Issue #271）
 */
function buildAgentPrompt(
  issueNumber: number,
  analysisContext: {
    latestReviewResultPath: string | null;
    latestTestResultPath: string | null;
  },
  metadataManager: MetadataManager
): string {
  // プロンプトテンプレートを読み込む
  const templatePath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../prompts/rollback/auto-analyze.txt'
  );
  let template = fs.readFileSync(templatePath, 'utf-8');

  // 変数の置き換え
  template = template.replace(/{issue_number}/g, String(issueNumber));

  // メタデータJSON
  const metadataJson = JSON.stringify(metadataManager.data, null, 2);
  template = template.replace(/{metadata_json}/g, metadataJson);

  // レビュー結果への参照
  let reviewResultReference = 'No review result available.';
  if (analysisContext.latestReviewResultPath) {
    reviewResultReference = `@${analysisContext.latestReviewResultPath}`;
  }
  template = template.replace(/{latest_review_result_reference}/g, reviewResultReference);

  // テスト結果への参照
  let testResultReference = 'No test result available.';
  if (analysisContext.latestTestResultPath) {
    testResultReference = `@${analysisContext.latestTestResultPath}`;
  }
  template = template.replace(/{test_result_reference}/g, testResultReference);

  return template;
}

/**
 * エージェントレスポンスから RollbackDecision をパース（Issue #271）
 */
export function parseRollbackDecision(messages: string[]): RollbackDecision {
  // 全メッセージを結合
  const fullText = messages.join('\n');

  // パターン1: Markdown コードブロック内の JSON
  const markdownMatch = fullText.match(/```json\s*\n([\s\S]*?)\n```/);
  if (markdownMatch) {
    try {
      const parsed = JSON.parse(markdownMatch[1]) as Record<string, unknown>;
      const normalized = normalizeRollbackDecision(parsed);
      logger.debug('Parsed RollbackDecision from markdown code block');
      return normalized;
    } catch (error) {
      logger.warn(`Failed to parse JSON from markdown block: ${getErrorMessage(error)}`);
    }
  }

  // パターン2: バランスの取れた JSON オブジェクトを抽出
  const jsonObject = extractBalancedJsonObject(fullText);
  if (jsonObject) {
    try {
      const parsed = JSON.parse(jsonObject) as Record<string, unknown>;
      const normalized = normalizeRollbackDecision(parsed);
      logger.debug('Parsed RollbackDecision from balanced JSON extraction');
      return normalized;
    } catch (error) {
      logger.warn(`Failed to parse balanced JSON: ${getErrorMessage(error)}`);
    }
  }

  // パース失敗
  throw new Error(
    'Failed to parse RollbackDecision from agent response. ' +
    'Expected a JSON object with "needs_rollback" field.'
  );
}

/**
 * バランスの取れた JSON オブジェクトを抽出
 *
 * 最初の { から対応する } までを抽出する。
 * ネストされた {} を正しく処理する。
 */
function extractBalancedJsonObject(text: string): string | null {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) {
    return null;
  }

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * RollbackDecision を正規化
 *
 * LLM の応答で文字列 "true"/"false" がブール値として返されることがあるため、
 * 適切な型に変換する。
 */
function normalizeRollbackDecision(raw: Record<string, unknown>): RollbackDecision {
  const decision = { ...raw } as unknown as RollbackDecision;

  // needs_rollback を正規化（文字列 "true"/"false" をブール値に変換）
  if (typeof decision.needs_rollback === 'string') {
    const strValue = (decision.needs_rollback as string).toLowerCase().trim();
    decision.needs_rollback = strValue === 'true';
    logger.debug(`Normalized needs_rollback from string "${strValue}" to boolean ${decision.needs_rollback}`);
  }

  return decision;
}

/**
 * RollbackDecision をバリデーション（Issue #271）
 */
export function validateRollbackDecision(decision: RollbackDecision): void {
  // needs_rollback チェック
  if (typeof decision.needs_rollback !== 'boolean') {
    throw new Error('Invalid RollbackDecision: "needs_rollback" must be a boolean');
  }

  // reason チェック
  if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
    throw new Error('Invalid RollbackDecision: "reason" must be a non-empty string');
  }

  if (decision.reason.length > 1000) {
    throw new Error('Invalid RollbackDecision: "reason" must be 1000 characters or less');
  }

  // confidence チェック
  const validConfidences = ['high', 'medium', 'low'];
  if (!validConfidences.includes(decision.confidence)) {
    throw new Error('Invalid RollbackDecision: "confidence" must be "high", "medium", or "low"');
  }

  // analysis チェック
  if (typeof decision.analysis !== 'string' || decision.analysis.trim().length === 0) {
    throw new Error('Invalid RollbackDecision: "analysis" must be a non-empty string');
  }

  // needs_rollback が true の場合の追加バリデーション
  if (decision.needs_rollback) {
    if (!decision.to_phase) {
      throw new Error('Invalid RollbackDecision: "to_phase" is required when needs_rollback=true');
    }

    // to_phase の有効性チェック
    const validPhases: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'testing',
      'documentation', 'report', 'evaluation'
    ];

    if (!validPhases.includes(decision.to_phase)) {
      throw new Error(`Invalid RollbackDecision: "to_phase" must be one of: ${validPhases.join(', ')}`);
    }

    // to_step の有効性チェック（オプション）
    if (decision.to_step) {
      const validSteps: StepName[] = ['execute', 'review', 'revise'];
      if (!validSteps.includes(decision.to_step)) {
        throw new Error(`Invalid RollbackDecision: "to_step" must be one of: ${validSteps.join(', ')}`);
      }
    }
  }
}

/**
 * 分析結果を表示（Issue #271）
 */
function displayAnalysisResult(decision: RollbackDecision, options: RollbackAutoOptions): void {
  logger.info('');
  logger.info('=== Rollback Auto Analysis Result ===');
  logger.info('');
  logger.info(`Needs Rollback: ${decision.needs_rollback ? 'YES' : 'NO'}`);
  logger.info(`Confidence: ${decision.confidence.toUpperCase()}`);

  if (decision.needs_rollback) {
    logger.info(`Target Phase: ${decision.to_phase}`);
    logger.info(`Target Step: ${decision.to_step ?? 'revise'}`);
  }

  logger.info('');
  logger.info('Reason:');
  logger.info(decision.reason);
  logger.info('');
  logger.info('Analysis:');
  logger.info(decision.analysis);
  logger.info('');
  logger.info('======================================');
  logger.info('');
}

/**
 * ドライランプレビューを表示（Issue #271）
 */
function displayDryRunPreview(decision: RollbackDecision): void {
  logger.info('[DRY RUN] Rollback would be executed with the following parameters:');
  logger.info('');
  logger.info(`  to_phase: ${decision.to_phase}`);
  logger.info(`  to_step: ${decision.to_step ?? 'revise'}`);
  logger.info(`  reason: ${decision.reason.slice(0, 100)}${decision.reason.length > 100 ? '...' : ''}`);
  logger.info('');
  logger.info('[DRY RUN] No changes were made. Remove --dry-run to execute.');
}

/**
 * 差し戻し実行の確認プロンプト（auto モード用）（Issue #271）
 */
async function confirmRollbackAuto(decision: RollbackDecision): Promise<boolean> {
  // CI環境では自動的にスキップ
  if (config.isCI()) {
    logger.info('CI environment detected. Skipping confirmation prompt.');
    return true;
  }

  // 警告メッセージを表示
  logger.warn('');
  logger.warn('=== Rollback Confirmation ===');
  logger.warn('');
  logger.warn(`Agent recommends rolling back to phase '${decision.to_phase}'`);
  logger.warn(`Confidence: ${decision.confidence.toUpperCase()}`);
  logger.warn('');
  logger.warn(`Reason: ${decision.reason.slice(0, 200)}${decision.reason.length > 200 ? '...' : ''}`);
  logger.warn('');
  logger.warn('This will reset all progress in the target phase and subsequent phases.');
  logger.warn('');

  // ユーザーに確認を求める
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('Do you want to proceed with the rollback? [y/N]: ', (answer: string) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}
