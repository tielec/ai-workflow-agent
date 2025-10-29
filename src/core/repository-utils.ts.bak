import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import fs from 'fs-extra';
import simpleGit from 'simple-git';

import type { IssueInfo } from '../types/commands.js';

/**
 * GitHub Issue URLからリポジトリ情報を抽出
 * @param issueUrl - GitHub Issue URL（例: https://github.com/tielec/my-app/issues/123）
 * @returns Issue情報（owner, repo, issueNumber, repositoryName）
 * @throws URL形式が不正な場合はエラー
 */
export function parseIssueUrl(issueUrl: string): IssueInfo {
  // 末尾スラッシュの有無を許容する正規表現
  const pattern = /github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)(?:\/)?$/;
  const match = issueUrl.match(pattern);

  if (!match) {
    throw new Error(`Invalid GitHub Issue URL: ${issueUrl}`);
  }

  const owner = match[1];
  const repo = match[2];
  const issueNumber = Number.parseInt(match[3], 10);
  const repositoryName = `${owner}/${repo}`;

  return {
    owner,
    repo,
    issueNumber,
    repositoryName,
  };
}

/**
 * リポジトリ名からローカルパスを解決
 * @param repoName - リポジトリ名（例: my-app）
 * @returns ローカルリポジトリパス
 * @throws リポジトリが見つからない場合はエラー
 */
export function resolveLocalRepoPath(repoName: string): string {
  const candidatePaths: string[] = [];

  // 1. 環境変数REPOS_ROOTが設定されている場合は優先的に使用
  const reposRoot = process.env.REPOS_ROOT;
  if (reposRoot) {
    candidatePaths.push(path.join(reposRoot, repoName));
  }

  // 2. フォールバック候補パス
  const homeDir = os.homedir();
  candidatePaths.push(
    path.join(homeDir, 'TIELEC', 'development', repoName),
    path.join(homeDir, 'projects', repoName),
    path.join(process.cwd(), '..', repoName),
  );

  // 3. 各候補パスを順番に確認
  for (const candidatePath of candidatePaths) {
    const resolvedPath = path.resolve(candidatePath);
    const gitPath = path.join(resolvedPath, '.git');

    if (fs.existsSync(resolvedPath) && fs.existsSync(gitPath)) {
      return resolvedPath;
    }
  }

  // 4. すべての候補で見つからない場合はエラー
  throw new Error(
    `Repository '${repoName}' not found.\nPlease set REPOS_ROOT environment variable or clone the repository.`,
  );
}

/**
 * Issue番号から対応するメタデータを探索
 * @param issueNumber - Issue番号（例: "123"）
 * @returns リポジトリルートパスとメタデータパス
 * @throws メタデータが見つからない場合はエラー
 */
export async function findWorkflowMetadata(
  issueNumber: string,
): Promise<{ repoRoot: string; metadataPath: string }> {
  const searchRoots: string[] = [];

  // 1. 環境変数REPOS_ROOTが設定されている場合
  const reposRoot = process.env.REPOS_ROOT;
  if (reposRoot && fs.existsSync(reposRoot)) {
    searchRoots.push(reposRoot);
  }

  // 2. フォールバック探索ルート
  const homeDir = os.homedir();
  const fallbackRoots = [
    path.join(homeDir, 'TIELEC', 'development'),
    path.join(homeDir, 'projects'),
    path.join(process.cwd(), '..'),
  ];

  for (const root of fallbackRoots) {
    if (fs.existsSync(root)) {
      searchRoots.push(root);
    }
  }

  // 3. 各探索ルート配下のリポジトリを探索
  for (const searchRoot of searchRoots) {
    try {
      const entries = fs.readdirSync(searchRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const repoPath = path.join(searchRoot, entry.name);
        const gitPath = path.join(repoPath, '.git');

        // .gitディレクトリが存在するか確認
        if (!fs.existsSync(gitPath)) {
          continue;
        }

        // メタデータの存在を確認
        const metadataPath = path.join(
          repoPath,
          '.ai-workflow',
          `issue-${issueNumber}`,
          'metadata.json',
        );

        if (fs.existsSync(metadataPath)) {
          return {
            repoRoot: repoPath,
            metadataPath,
          };
        }
      }
    } catch (error) {
      // ディレクトリ読み込みエラーは無視して次へ
      continue;
    }
  }

  // 4. すべての候補で見つからない場合はエラー
  throw new Error(
    `Workflow metadata for issue ${issueNumber} not found.\nPlease run init first or check the issue number.`,
  );
}

/**
 * Gitリポジトリのルートパスを取得
 * @returns リポジトリルートパス
 */
export async function getRepoRoot(): Promise<string> {
  const git = simpleGit(process.cwd());
  try {
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch {
    return process.cwd();
  }
}
