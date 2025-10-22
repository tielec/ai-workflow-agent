import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';
import simpleGit from 'simple-git';

import { WorkflowState } from '../core/workflow-state.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { GitHubClient } from '../core/github-client.js';
import { parseIssueUrl, resolveLocalRepoPath, getRepoRoot } from '../core/repository-utils.js';
import { sanitizeGitUrl } from '../utils/git-url-utils.js';
import type { BranchValidationResult } from '../types/commands.js';

/**
 * Gitブランチ名のバリデーション
 * git-check-ref-format の命名規則に基づく
 * @see https://git-scm.com/docs/git-check-ref-format
 * @param branchName - 検証するブランチ名
 * @returns バリデーション結果（valid: boolean, error?: string）
 */
export function validateBranchName(branchName: string): BranchValidationResult {
  // 1. 空文字列チェック
  if (!branchName || branchName.trim() === '') {
    return { valid: false, error: 'Branch name cannot be empty' };
  }

  // 2. ドットで始まらないチェック
  if (branchName.startsWith('.')) {
    return { valid: false, error: 'Branch name cannot start with "."' };
  }

  // 3. スラッシュの位置チェック
  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot start or end with "/"' };
  }

  // 4. 連続ドットチェック
  if (branchName.includes('..')) {
    return { valid: false, error: 'Branch name cannot contain ".."' };
  }

  // 5. 不正文字チェック（~, ^, :, ?, *, [, \, 空白、@{）
  const invalidChars = /[~^:?*[\\\s]|@\{/;
  if (invalidChars.test(branchName)) {
    return {
      valid: false,
      error: 'Branch name contains invalid characters (spaces, ~, ^, :, ?, *, [, \\, @{)',
    };
  }

  // 6. ドットで終わらないチェック
  if (branchName.endsWith('.')) {
    return { valid: false, error: 'Branch name cannot end with "."' };
  }

  return { valid: true };
}

/**
 * ブランチ名を解決（デフォルト vs カスタム）
 * @param customBranch - CLI の --branch オプション値
 * @param issueNumber - Issue番号
 * @returns 解決されたブランチ名
 * @throws バリデーションエラー時はエラーをスロー
 */
export function resolveBranchName(customBranch: string | undefined, issueNumber: number): string {
  // 1. カスタムブランチ名が指定された場合
  if (customBranch) {
    // バリデーション
    const validation = validateBranchName(customBranch);
    if (!validation.valid) {
      throw new Error(`[ERROR] Invalid branch name: ${customBranch}. ${validation.error}`);
    }

    console.info(`[INFO] Using custom branch name: ${customBranch}`);
    return customBranch;
  }

  // 2. デフォルトブランチ名
  const defaultBranch = `ai-workflow/issue-${issueNumber}`;
  console.info(`[INFO] Using default branch name: ${defaultBranch}`);
  return defaultBranch;
}

/**
 * Issue初期化コマンドハンドラ
 * @param issueUrl - GitHub Issue URL
 * @param customBranch - カスタムブランチ名（オプション）
 */
export async function handleInitCommand(issueUrl: string, customBranch?: string): Promise<void> {
  // Issue URLをパース
  let issueInfo;
  try {
    issueInfo = parseIssueUrl(issueUrl);
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    process.exit(1);
  }

  const { owner, repo, issueNumber, repositoryName } = issueInfo;

  // ローカルリポジトリパスを解決
  let repoRoot: string;
  try {
    // まず現在のディレクトリがGitリポジトリか確認
    const currentRepoRoot = await getRepoRoot();

    // Gitリモート URL（origin）からリポジトリ名を抽出
    const git = simpleGit(currentRepoRoot);
    let currentRepoName: string | null = null;
    try {
      const remoteUrl = await git.remote(['get-url', 'origin']);
      const urlString =
        typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();

      // URLからリポジトリ名を抽出
      // 例: https://github.com/tielec/infrastructure-as-code.git -> infrastructure-as-code
      // 例: git@github.com:tielec/infrastructure-as-code.git -> infrastructure-as-code
      const match = urlString.match(/\/([^\/]+?)(\.git)?$/);
      if (match) {
        currentRepoName = match[1];
      }
    } catch {
      // リモート URL取得失敗時はディレクトリ名をフォールバック
      currentRepoName = path.basename(currentRepoRoot);
    }

    // 現在のリポジトリ名が対象と一致する場合はそのまま使用
    if (currentRepoName === repo) {
      repoRoot = currentRepoRoot;
      console.info(`[INFO] Using current repository: ${repositoryName}`);
      console.info(`[INFO] Local path: ${repoRoot}`);
    } else {
      // 別のリポジトリを探索
      console.info(
        `[INFO] Current repository (${currentRepoName}) does not match target (${repo}). Searching...`,
      );
      repoRoot = resolveLocalRepoPath(repo);
      console.info(`[INFO] Target repository: ${repositoryName}`);
      console.info(`[INFO] Local path: ${repoRoot}`);
    }
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    process.exit(1);
  }

  // ワークフローディレクトリ作成（対象リポジトリ配下）
  const workflowDir = path.join(repoRoot, '.ai-workflow', `issue-${issueNumber}`);
  const metadataPath = path.join(workflowDir, 'metadata.json');

  // ブランチ名を解決（カスタムまたはデフォルト）
  const branchName = resolveBranchName(customBranch, issueNumber);

  const git = simpleGit(repoRoot);

  // リモートブランチの存在確認
  await git.fetch();
  const remoteBranches = await git.branch(['-r']);
  const remoteBranchExists = remoteBranches.all.some((ref) => ref.includes(`origin/${branchName}`));

  if (remoteBranchExists) {
    // リモートブランチが存在する場合: チェックアウト → pull → metadata確認
    console.info(`[INFO] Remote branch '${branchName}' found. Checking out...`);

    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(branchName)) {
      await git.checkout(branchName);
      console.info(`[INFO] Switched to existing local branch: ${branchName}`);
    } else {
      await git.checkoutBranch(branchName, `origin/${branchName}`);
      console.info(`[INFO] Created local branch '${branchName}' tracking origin/${branchName}`);
    }

    // リモートの最新状態を取得
    console.info('[INFO] Pulling latest changes from remote...');
    await git.pull('origin', branchName, { '--no-rebase': null });
    console.info('[OK] Successfully pulled latest changes.');

    fs.ensureDirSync(workflowDir);

    if (fs.existsSync(metadataPath)) {
      console.info('[INFO] Workflow already exists. Migrating metadata schema if required...');
      const state = WorkflowState.load(metadataPath);
      const migrated = state.migrate();
      const metadataManager = new MetadataManager(metadataPath);
      metadataManager.data.branch_name = branchName;
      metadataManager.data.repository = repositoryName;

      // target_repository フィールドを設定
      const remoteUrl = await git.remote(['get-url', 'origin']);
      const remoteUrlStr =
        typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
      const sanitizedUrl = sanitizeGitUrl(remoteUrlStr);

      // Issue #54: Warn if token detected in remote URL
      if (sanitizedUrl !== remoteUrlStr) {
        console.warn(
          '[WARNING] GitHub Personal Access Token detected in remote URL. Token has been removed from metadata.',
        );
        console.info(
          `[INFO] Original URL: ${remoteUrlStr.replace(/ghp_[a-zA-Z0-9]+|github_pat_[a-zA-Z0-9_]+/, '***')}`,
        );
        console.info(`[INFO] Sanitized URL: ${sanitizedUrl}`);
      }

      metadataManager.data.target_repository = {
        path: repoRoot,
        github_name: repositoryName,
        remote_url: sanitizedUrl,
        owner: owner,
        repo: repo,
      };
      metadataManager.save();
      console.info(
        migrated
          ? '[OK] Metadata schema updated successfully.'
          : '[INFO] Metadata schema already up to date.',
      );
      return;
    }

    // metadata.jsonが存在しない場合は作成（リモートブランチはあるが未初期化の状態）
    console.info('[INFO] Creating metadata for existing branch...');
  } else {
    // リモートブランチが存在しない場合: 新規作成
    console.info(`[INFO] Remote branch '${branchName}' not found. Creating new branch...`);

    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(branchName)) {
      await git.checkout(branchName);
      console.info(`[INFO] Switched to existing local branch: ${branchName}`);
    } else {
      await git.checkoutLocalBranch(branchName);
      console.info(`[INFO] Created and switched to new branch: ${branchName}`);
    }

    fs.ensureDirSync(workflowDir);
    console.info('[INFO] Creating metadata...');
  }

  // metadata.json作成
  WorkflowState.createNew(metadataPath, String(issueNumber), issueUrl, `Issue #${issueNumber}`);

  const metadataManager = new MetadataManager(metadataPath);
  metadataManager.data.branch_name = branchName;
  metadataManager.data.repository = repositoryName;

  // target_repository フィールドを設定
  const remoteUrl = await git.remote(['get-url', 'origin']);
  const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
  const sanitizedUrl = sanitizeGitUrl(remoteUrlStr);

  // Issue #54: Warn if token detected in remote URL
  if (sanitizedUrl !== remoteUrlStr) {
    console.warn(
      '[WARNING] GitHub Personal Access Token detected in remote URL. Token has been removed from metadata.',
    );
    console.info(
      `[INFO] Original URL: ${remoteUrlStr.replace(/ghp_[a-zA-Z0-9]+|github_pat_[a-zA-Z0-9_]+/, '***')}`,
    );
    console.info(`[INFO] Sanitized URL: ${sanitizedUrl}`);
  }

  metadataManager.data.target_repository = {
    path: repoRoot,
    github_name: repositoryName,
    remote_url: sanitizedUrl,
    owner: owner,
    repo: repo,
  };
  metadataManager.save();

  // コミット & プッシュ (Issue #16: commitWorkflowInit を使用)
  const gitManager = new GitManager(repoRoot, metadataManager);
  console.info('[INFO] Committing metadata.json...');
  const commitResult = await gitManager.commitWorkflowInit(issueNumber, branchName);
  if (!commitResult.success) {
    throw new Error(`Git commit failed: ${commitResult.error ?? 'unknown error'}`);
  }
  console.info(
    `[OK] Commit ${commitResult.commit_hash ? commitResult.commit_hash.slice(0, 7) : ''} created.`,
  );

  console.info('[INFO] Pushing to remote...');
  const pushResult = await gitManager.pushToRemote();
  if (!pushResult.success) {
    throw new Error(`Git push failed: ${pushResult.error ?? 'unknown error'}`);
  }
  console.info('[OK] Push successful.');

  // PR作成
  const githubToken = process.env.GITHUB_TOKEN ?? null;
  if (!githubToken || !repositoryName) {
    console.warn('[WARNING] GITHUB_TOKEN or GITHUB_REPOSITORY not set. PR creation skipped.');
    console.info('[INFO] You can create a PR manually (e.g. gh pr create --draft).');
    return;
  }

  try {
    const githubClient = new GitHubClient(githubToken, repositoryName);
    const existingPr = await githubClient.checkExistingPr(branchName);
    if (existingPr) {
      console.warn(`[WARNING] PR already exists: ${existingPr.pr_url}`);
      metadataManager.data.pr_number = existingPr.pr_number;
      metadataManager.data.pr_url = existingPr.pr_url;
      metadataManager.save();
      return;
    }

    console.info('[INFO] Creating draft PR...');
    const prTitle = `[AI-Workflow] Issue #${issueNumber}`;
    const prBody = githubClient.generatePrBodyTemplate(issueNumber, branchName);
    const prResult = await githubClient.createPullRequest(prTitle, prBody, branchName, 'main', true);

    if (prResult.success) {
      console.info(`[OK] Draft PR created: ${prResult.pr_url}`);
      metadataManager.data.pr_number = prResult.pr_number ?? null;
      metadataManager.data.pr_url = prResult.pr_url ?? null;
      metadataManager.save();
    } else {
      console.warn(
        `[WARNING] PR creation failed: ${prResult.error ?? 'unknown error'}. Please create manually.`,
      );
    }
  } catch (error) {
    console.warn(`[WARNING] Failed to create PR automatically: ${(error as Error).message}`);
  }
}
