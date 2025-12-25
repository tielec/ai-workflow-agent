import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SimpleGit } from 'simple-git';

// ESM compatibility: プロンプトルートパスを解決
// dist/core/git/squash-manager.js から dist/prompts/ を参照
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const promptsRoot = path.resolve(moduleDir, '..', '..', 'prompts');
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import type { MetadataManager } from '../metadata-manager.js';
import type { CommitManager } from './commit-manager.js';
import type { RemoteManager } from './remote-manager.js';
import type { CodexAgentClient } from '../codex-agent-client.js';
import type { ClaudeAgentClient } from '../claude-agent-client.js';
import type { PhaseContext } from '../../types/commands.js';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * FinalizeContext - finalize コマンド用のシンプルなコンテキスト
 *
 * PhaseContext の代替として、finalize コマンド専用のコンテキストを定義。
 */
export interface FinalizeContext {
  /** Issue番号 */
  issueNumber: number;

  /** ワークフロー開始時のコミットハッシュ */
  baseCommit: string;

  /** マージ先ブランチ（デフォルト: main） */
  targetBranch: string;

  /**
   * スカッシュ範囲の終点コミットハッシュ（オプショナル）
   *
   * Step 2 で pull が発生し HEAD が更新された場合でも、
   * pull 前の HEAD を使用してスカッシュ範囲を固定するために使用。
   */
  headCommit?: string;
}

/**
 * SquashManager - スカッシュ処理の専門マネージャー（Issue #194）
 *
 * 責務:
 * - ワークフロー開始時点からのコミット範囲の特定
 * - エージェントによるコミットメッセージ生成
 * - スカッシュ実行（reset + commit + push）
 * - メタデータ記録
 *
 * 設計パターン:
 * - ファサードパターン: GitManagerから委譲される形で統合
 * - 依存性注入: CommitManager、RemoteManager、エージェントクライアントをコンストラクタ注入
 * - 単一責任原則（SRP）: スカッシュ処理のみを担当
 */
export class SquashManager {
  private readonly git: SimpleGit;
  private readonly metadataManager: MetadataManager;
  private readonly commitManager: CommitManager;
  private readonly remoteManager: RemoteManager;
  private readonly codexAgent: CodexAgentClient | null;
  private readonly claudeAgent: ClaudeAgentClient | null;
  private readonly workingDir: string;

  constructor(
    git: SimpleGit,
    metadataManager: MetadataManager,
    commitManager: CommitManager,
    remoteManager: RemoteManager,
    codexAgent: CodexAgentClient | null,
    claudeAgent: ClaudeAgentClient | null,
    workingDir: string,
  ) {
    this.git = git;
    this.metadataManager = metadataManager;
    this.commitManager = commitManager;
    this.remoteManager = remoteManager;
    this.codexAgent = codexAgent;
    this.claudeAgent = claudeAgent;
    this.workingDir = workingDir;
  }

  /**
   * スカッシュ全体のオーケストレーション
   *
   * @param context - フェーズ実行コンテキスト
   * @throws Error - ブランチ保護違反時、スカッシュ失敗時
   */
  public async squashCommits(context: PhaseContext): Promise<void> {
    try {
      logger.info('Starting commit squash process...');

      // 1. base_commitの取得
      const baseCommit = this.metadataManager.getBaseCommit();
      if (!baseCommit) {
        logger.warn('base_commit not found in metadata. Skipping squash.');
        return;
      }

      // 2. コミット範囲の特定
      const commits = await this.getCommitsToSquash(baseCommit);
      if (commits.length <= 1) {
        logger.info(`Only ${commits.length} commit(s) found. Skipping squash.`);
        return;
      }

      logger.info(`Found ${commits.length} commits to squash.`);

      // 3. ブランチ保護チェック
      await this.validateBranchProtection();

      // 4. スカッシュ前のコミットハッシュを記録
      this.metadataManager.setPreSquashCommits(commits);

      // 5. コミットメッセージ生成
      let message: string;
      try {
        message = await this.generateCommitMessage(context);

        // バリデーション
        if (!this.isValidCommitMessage(message)) {
          logger.warn('Generated commit message is invalid. Using fallback.');
          message = this.generateFallbackMessage(context);
        }
      } catch (error) {
        logger.error(`Failed to generate commit message with agent: ${getErrorMessage(error)}`);
        message = this.generateFallbackMessage(context);
      }

      logger.info('Generated commit message:', message);

      // 6. スカッシュ実行
      await this.executeSquash(baseCommit, message);

      // 7. スカッシュ完了時刻を記録
      this.metadataManager.setSquashedAt(new Date().toISOString());

      logger.info('✅ Commit squash completed successfully.');
    } catch (error) {
      logger.error(`❌ Commit squash failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * スカッシュ対象のコミット範囲を特定
   *
   * @param baseCommit - ワークフロー開始時のコミットハッシュ
   * @param targetHead - スカッシュ範囲の終点（デフォルト: HEAD）
   * @returns コミットハッシュの配列（古い順）
   * @throws Error - Gitコマンド失敗時
   */
  private async getCommitsToSquash(baseCommit: string, targetHead: string = 'HEAD'): Promise<string[]> {
    try {
      logger.debug(
        `getCommitsToSquash: base_commit=${baseCommit.slice(0, 7)}, ` +
          `targetHead=${targetHead === 'HEAD' ? 'HEAD' : targetHead.slice(0, 7)}`,
      );

      // git log <base_commit>..<targetHead> --format=%H --reverse
      const result = await this.git.log({
        from: baseCommit,
        to: targetHead,
        format: { hash: '%H' },
      });

      const commits = result.all.map((commit) => commit.hash);
      logger.debug(`getCommitsToSquash: found ${commits.length} commit(s)`);

      return commits;
    } catch (error) {
      throw new Error(`Failed to get commits to squash: ${getErrorMessage(error)}`);
    }
  }

  /**
   * ブランチ保護チェック（main/masterへのフォースプッシュ禁止）
   *
   * @throws Error - main/masterブランチの場合
   */
  private async validateBranchProtection(): Promise<void> {
    try {
      const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      const branchName = currentBranch.trim();

      if (branchName === 'main' || branchName === 'master') {
        throw new Error(
          `Cannot squash commits on protected branch: ${branchName}. ` +
            `Squashing is only allowed on feature branches.`,
        );
      }

      logger.info(`Branch protection check passed: ${branchName}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('protected branch')) {
        throw error;
      }
      throw new Error(`Failed to check branch protection: ${getErrorMessage(error)}`);
    }
  }

  /**
   * エージェントによるコミットメッセージ生成
   *
   * @param context - フェーズ実行コンテキスト
   * @returns 生成されたコミットメッセージ
   * @throws Error - エージェント実行失敗時
   */
  private async generateCommitMessage(context: PhaseContext): Promise<string> {
    // 1. プロンプトテンプレート読み込み
    const template = await this.loadPromptTemplate();

    // 2. プロンプト変数置換
    const prompt = await this.fillPromptVariables(template, context);

    // 3. エージェント実行
    const codexAgent = this.codexAgent;
    const claudeAgent = this.claudeAgent;
    if (!codexAgent && !claudeAgent) {
      throw new Error('No agent available for commit message generation.');
    }

    // 一時ディレクトリ作成
    const tempDir = path.join(this.workingDir, '.ai-workflow', 'tmp', 'squash');
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // エージェント実行（Codex優先、Claudeにフォールバック）
      if (codexAgent) {
        await codexAgent.executeTask({
          prompt,
          workingDirectory: this.workingDir,
          maxTurns: 5,
        });
      } else if (claudeAgent) {
        await claudeAgent.executeTask({
          prompt,
          workingDirectory: this.workingDir,
          maxTurns: 5,
        });
      }

      // イベントから生成されたメッセージを抽出
      const outputFile = path.join(tempDir, 'commit-message.txt');
      const fileExists = await fs
        .access(outputFile)
        .then(() => true)
        .catch(() => false);

      if (fileExists) {
        const content = await fs.readFile(outputFile, 'utf-8');
        return content.trim();
      }

      throw new Error('Commit message not generated by agent.');
    } finally {
      // 一時ディレクトリクリーンアップ
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Failed to clean up temp directory: ${getErrorMessage(error)}`);
      }
    }
  }

  /**
   * スカッシュ実行（reset + commit + push）
   *
   * @param baseCommit - ワークフロー開始時のコミットハッシュ
   * @param message - コミットメッセージ
   * @throws Error - Gitコマンド失敗時
   */
  private async executeSquash(baseCommit: string, message: string): Promise<void> {
    try {
      // 0. Git設定を確認（user.name, user.email）
      if (typeof (this.commitManager as any).ensureGitConfig === 'function') {
        await this.commitManager.ensureGitConfig();
      }

      // 1. git reset --soft <base_commit>
      logger.info(`Resetting to ${baseCommit}...`);
      await this.git.reset(['--soft', baseCommit]);

      // 2. git commit -m "<message>"
      logger.info('Creating squashed commit...');
      await this.git.commit(message);

      // 3. git push --force-with-lease
      logger.info('Force pushing to remote...');
      await this.remoteManager.forcePushToRemote();

      logger.info('Squash and push completed successfully.');
    } catch (error) {
      throw new Error(`Failed to execute squash: ${getErrorMessage(error)}`);
    }
  }

  /**
   * プロンプトテンプレートの読み込み
   *
   * @returns プロンプトテンプレート内容
   * @throws Error - ファイル読み込み失敗時
   */
  private async loadPromptTemplate(): Promise<string> {
    const templatePath = path.join(promptsRoot, 'squash', 'generate-message.txt');
    try {
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load prompt template: ${getErrorMessage(error)}`);
    }
  }

  /**
   * プロンプト変数の置換
   *
   * @param template - プロンプトテンプレート
   * @param context - フェーズ実行コンテキスト
   * @returns 変数置換後のプロンプト
   */
  private async fillPromptVariables(template: string, context: PhaseContext): Promise<string> {
    const baseCommit = this.metadataManager.getBaseCommit();
    if (!baseCommit) {
      throw new Error('base_commit not found');
    }

    // Issue情報の取得
    const issueNumber = context.issueNumber;
    const issueTitle = context.issueInfo?.title ?? 'Unknown Issue';
    const issueBody = context.issueInfo?.body ?? 'No description available';

    // 変更差分の取得
    const diffStat = await this.git.diff(['--stat', `${baseCommit}..HEAD`]);
    const diffShortstat = await this.git.diff(['--shortstat', `${baseCommit}..HEAD`]);

    // テンプレート変数の置換
    let result = template;
    result = result.replaceAll('{issue_number}', String(issueNumber));
    result = result.replaceAll('{issue_title}', issueTitle);
    result = result.replaceAll('{issue_body}', issueBody);
    result = result.replaceAll('{diff_stat}', diffStat || 'No changes');
    result = result.replaceAll('{diff_shortstat}', diffShortstat || 'No changes');

    return result;
  }

  /**
   * 生成されたコミットメッセージのバリデーション
   *
   * @param message - コミットメッセージ
   * @returns 有効な場合true
   */
  private isValidCommitMessage(message: string): boolean {
    // Conventional Commits形式のバリデーション
    const conventionalCommitPattern = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/;

    // 1行目をチェック
    const firstLine = message.split('\n')[0];
    if (!conventionalCommitPattern.test(firstLine)) {
      return false;
    }

    // 最低限の長さチェック（50文字以内）
    if (firstLine.length > 50) {
      return false;
    }

    // Issue番号の参照を含むかチェック
    if (!message.includes('Fixes #') && !message.includes('Closes #')) {
      return false;
    }

    return true;
  }

  /**
   * フォールバックコミットメッセージ生成
   *
   * @param context - フェーズ実行コンテキスト
   * @returns テンプレートベースのコミットメッセージ
   */
  private generateFallbackMessage(context: PhaseContext): string {
    const issueNumber = context.issueNumber;
    const issueInfo = context.issueInfo;

    // テンプレートベースのフォールバックメッセージ
    return `feat: Complete workflow for Issue #${issueNumber}

${issueInfo?.title || 'AI Workflow completion'}

Fixes #${issueNumber}`;
  }

  /**
   * squashCommitsForFinalize - finalize コマンド用のスカッシュ処理
   *
   * PhaseContext に依存せず、FinalizeContext を受け取る。
   * エージェント生成によるコミットメッセージ生成は省略し、テンプレートベースのメッセージを使用。
   *
   * 注意: finalize コマンドでは .ai-workflow ディレクトリが既に削除されているため、
   * メタデータへの記録（setPreSquashCommits, setSquashedAt）はスキップする。
   *
   * @param context - FinalizeContext
   * @throws Error - ブランチ保護違反時、スカッシュ失敗時
   */
  public async squashCommitsForFinalize(context: FinalizeContext): Promise<void> {
    try {
      logger.info('Starting commit squash for finalize...');

      // 1. base_commitの取得
      const baseCommit = context.baseCommit;
      if (!baseCommit) {
        logger.warn('base_commit not provided. Skipping squash.');
        return;
      }

      // 2. コミット範囲の特定
      const targetHead = context.headCommit ?? 'HEAD';
      logger.debug(
        `Squash range (finalize): ${baseCommit.slice(0, 7)}..${targetHead === 'HEAD' ? 'HEAD' : targetHead.slice(0, 7)}`,
      );

      const commits = await this.getCommitsToSquash(baseCommit, targetHead);
      if (commits.length <= 1) {
        logger.info(`Only ${commits.length} commit(s) found. Skipping squash.`);
        return;
      }

      logger.info(`Found ${commits.length} commits to squash.`);

      // 3. ブランチ保護チェック
      await this.validateBranchProtection();

      // 4. スカッシュ前のコミットハッシュを記録（スキップ: metadata.json は削除済み）
      // finalize コマンドでは .ai-workflow ディレクトリが削除されているため、
      // メタデータへの記録は行わない
      logger.debug(`Pre-squash commits (not saved to metadata): ${commits.length} commits`);

      // 5. フォールバックメッセージを使用（エージェント生成はスキップ）
      const message = this.generateFinalizeMessage(context);

      logger.info('Generated commit message (fallback):', message);

      // 6. スカッシュ実行
      await this.executeSquash(baseCommit, message);

      // 7. スカッシュ完了時刻を記録（スキップ: metadata.json は削除済み）
      logger.debug('Squash completed at:', new Date().toISOString());

      logger.info('✅ Commit squash completed successfully.');
    } catch (error) {
      logger.error(`❌ Commit squash failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * generateFinalizeMessage - finalize 用のフォールバックメッセージ生成
   *
   * @param context - FinalizeContext
   * @returns Conventional Commits形式のコミットメッセージ
   */
  private generateFinalizeMessage(context: FinalizeContext): string {
    const issueNumber = context.issueNumber;

    return `feat: Complete workflow for Issue #${issueNumber}

AI Workflow finalization completed.

Fixes #${issueNumber}`;
  }
}
