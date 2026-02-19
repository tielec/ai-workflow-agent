import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConflictMetadataManager } from '../../../src/core/conflict/metadata-manager.js';
import type { ConflictResolutionPlan } from '../../../src/types/conflict.js';

const parsePullRequestUrlMock = jest.fn();
const resolveRepoPathFromPrUrlMock = jest.fn();

const simpleGitMock = jest.fn();
const mergeContextCollectMock = jest.fn();
const createPlanMock = jest.fn();
const resolveMock = jest.fn();
const applyMock = jest.fn();

const githubClientInstance = {
  getPullRequestInfo: jest.fn(),
  getMergeableStatus: jest.fn(),
  postComment: jest.fn(),
};

let handleResolveConflictInitCommand: (options: { prUrl: string; language?: string }) => Promise<void>;
let handleResolveConflictAnalyzeCommand: (options: { prUrl: string; agent?: 'auto' | 'codex' | 'claude'; language?: string }) => Promise<void>;
let handleResolveConflictExecuteCommand: (options: { prUrl: string; agent?: 'auto' | 'codex' | 'claude'; dryRun?: boolean; language?: string }) => Promise<void>;
let handleResolveConflictFinalizeCommand: (options: { prUrl: string; push?: boolean; squash?: boolean; language?: string }) => Promise<void>;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: simpleGitMock,
  }));

  await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => githubClientInstance),
  }));

  await jest.unstable_mockModule('../../../src/core/git/merge-context-collector.js', () => ({
    __esModule: true,
    MergeContextCollector: jest.fn().mockImplementation(() => ({
      collect: mergeContextCollectMock,
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/git/conflict-resolver.js', () => ({
    __esModule: true,
    ConflictResolver: jest.fn().mockImplementation(() => ({
      createResolutionPlan: createPlanMock,
      resolve: resolveMock,
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/change-applier.js', () => ({
    __esModule: true,
    CodeChangeApplier: jest.fn().mockImplementation(() => ({
      apply: applyMock,
    })),
  }));

  ({ handleResolveConflictInitCommand } = await import('../../../src/commands/resolve-conflict/init.js'));
  ({ handleResolveConflictAnalyzeCommand } = await import('../../../src/commands/resolve-conflict/analyze.js'));
  ({ handleResolveConflictExecuteCommand } = await import('../../../src/commands/resolve-conflict/execute.js'));
  ({ handleResolveConflictFinalizeCommand } = await import('../../../src/commands/resolve-conflict/finalize.js'));
});

describe('resolve-conflict コマンド統合テスト', () => {
  let repoRoot: string;
  const prUrl = 'https://github.com/owner/repo/pull/42';

  beforeEach(async () => {
    jest.clearAllMocks();

    repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'resolve-conflict-'));
    parsePullRequestUrlMock.mockReturnValue({
      owner: 'owner',
      repo: 'repo',
      prNumber: 42,
      repositoryName: 'owner/repo',
    });
    resolveRepoPathFromPrUrlMock.mockReturnValue(repoRoot);

    githubClientInstance.getPullRequestInfo.mockResolvedValue({ base: 'main', head: 'feature' });
    githubClientInstance.getMergeableStatus.mockResolvedValue({ mergeable: true, mergeableState: 'clean' });
    githubClientInstance.postComment.mockResolvedValue({ success: true });

    applyMock.mockResolvedValue({ success: true, applied_files: ['src/conflict.ts'], skipped_files: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系_コンフリクトありPRの完全解消フロー', async () => {
    // Given: コンフリクトファイルとモック設定
    const conflictFilePath = path.join(repoRoot, 'src/conflict.ts');
    await fsp.mkdir(path.dirname(conflictFilePath), { recursive: true });
    await fsp.writeFile(
      conflictFilePath,
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n',
      'utf-8',
    );

    const plan: ConflictResolutionPlan = {
      prNumber: 42,
      baseBranch: 'main',
      headBranch: 'feature',
      generatedAt: '2024-01-01T00:00:00Z',
      resolutions: [
        { filePath: 'src/conflict.ts', strategy: 'manual-merge', resolvedContent: 'resolved' },
      ],
      skippedFiles: [],
      warnings: [],
    };

    mergeContextCollectMock.mockResolvedValue({
      conflictFiles: [
        { filePath: 'src/conflict.ts', startLine: 1, endLine: 5, oursContent: 'ours', theirsContent: 'theirs' },
      ],
      oursLog: [],
      theirsLog: [],
      prDescription: '',
      relatedIssues: [],
      contextSnippets: [],
    });

    createPlanMock.mockResolvedValue(plan);
    resolveMock.mockResolvedValue(plan.resolutions);

    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] })
        .mockResolvedValueOnce({ files: [{ path: 'src/conflict.ts' }], current: 'main', conflicted: ['src/conflict.ts'] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(''),
    };

    const gitExecute = {
      add: jest.fn().mockResolvedValue(undefined),
      status: jest.fn().mockResolvedValue({ files: [{ path: 'src/conflict.ts' }], current: 'feature' }),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    const gitFinalize = {
      status: jest.fn().mockResolvedValue({ current: 'feature' }),
      push: jest.fn().mockResolvedValue(undefined),
    };

    const gitInstances = [gitInit, gitAnalyze, gitExecute, gitFinalize];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    // When: init -> analyze -> execute -> finalize
    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });
    await handleResolveConflictAnalyzeCommand({ prUrl, agent: 'auto', language: 'ja' });
    await handleResolveConflictExecuteCommand({ prUrl, agent: 'auto', dryRun: false });
    await handleResolveConflictFinalizeCommand({ prUrl, push: true, squash: false });

    // Then: メタデータ/成果物が作成され、最終的にクリーンアップされる
    const metadataManager = new ConflictMetadataManager(repoRoot, 42);
    const metadataPath = metadataManager.getMetadataPath();

    await expect(fsp.access(metadataPath)).rejects.toThrow();
    expect(githubClientInstance.postComment).toHaveBeenCalled();
    expect(gitFinalize.push).toHaveBeenCalledWith('origin', 'feature');
  });

  it('execute_ドライラン_ファイル書き込みとコミットを行わない', async () => {
    // Given: 事前に init/analyze を実行
    const conflictFilePath = path.join(repoRoot, 'src/conflict.ts');
    await fsp.mkdir(path.dirname(conflictFilePath), { recursive: true });
    await fsp.writeFile(
      conflictFilePath,
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n',
      'utf-8',
    );

    const plan: ConflictResolutionPlan = {
      prNumber: 42,
      baseBranch: 'main',
      headBranch: 'feature',
      generatedAt: '2024-01-01T00:00:00Z',
      resolutions: [
        { filePath: 'src/conflict.ts', strategy: 'manual-merge', resolvedContent: 'resolved' },
      ],
      skippedFiles: [],
      warnings: [],
    };

    mergeContextCollectMock.mockResolvedValue({
      conflictFiles: [
        { filePath: 'src/conflict.ts', startLine: 1, endLine: 5, oursContent: 'ours', theirsContent: 'theirs' },
      ],
      oursLog: [],
      theirsLog: [],
      prDescription: '',
      relatedIssues: [],
      contextSnippets: [],
    });

    createPlanMock.mockResolvedValue(plan);
    resolveMock.mockResolvedValue(plan.resolutions);

    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] })
        .mockResolvedValueOnce({ files: [{ path: 'src/conflict.ts' }], current: 'main', conflicted: ['src/conflict.ts'] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(''),
    };

    const gitInstances = [gitInit, gitAnalyze];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });
    await handleResolveConflictAnalyzeCommand({ prUrl, agent: 'auto', language: 'ja' });

    // When: execute を dryRun で実行
    await handleResolveConflictExecuteCommand({ prUrl, agent: 'auto', dryRun: true });

    // Then: 解消結果ファイルが作成されない
    const outputDir = path.join(repoRoot, '.ai-workflow', 'conflict-42');
    await expect(fsp.access(path.join(outputDir, 'resolution-result.json'))).rejects.toThrow();
    await expect(fsp.access(path.join(outputDir, 'resolution-result.md'))).rejects.toThrow();
  });

  it('analyze_コンフリクト無し_早期終了して計画を作成しない', async () => {
    // Given: init 済みのメタデータとコンフリクトなしの状態
    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] })
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main', 'feature'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(''),
    };

    const gitInstances = [gitInit, gitAnalyze];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });

    // When: analyze 実行
    await handleResolveConflictAnalyzeCommand({ prUrl, agent: 'auto', language: 'ja' });

    // Then: analyzed になり、計画ファイルは生成されない
    const metadataManager = new ConflictMetadataManager(repoRoot, 42);
    const metadata = await metadataManager.getMetadata();
    expect(metadata.status).toBe('analyzed');
    expect(metadata.conflictFiles).toHaveLength(0);
    expect(metadata.resolutionPlanPath).toBeUndefined();

    const planJsonPath = path.join(repoRoot, '.ai-workflow', 'conflict-42', 'resolution-plan.json');
    await expect(fsp.access(planJsonPath)).rejects.toThrow();
  });

  it('analyze_merge失敗時_merge_abortを試行して終了する', async () => {
    // Given: merge が失敗する状態
    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest.fn().mockResolvedValue({ files: [], current: 'main', conflicted: [] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main', 'feature'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockImplementation((args: string[]) => {
        if (args[0] === 'merge' && args[1] === '--no-commit') {
          throw new Error('merge failed');
        }
        return Promise.resolve('');
      }),
    };

    const gitInstances = [gitInit, gitAnalyze];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    jest.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`process.exit: ${code}`);
    }) as unknown as jest.SpyInstance;

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });

    // When / Then: analyze でエラー終了し、merge --abort を試行
    await expect(
      handleResolveConflictAnalyzeCommand({ prUrl, agent: 'auto', language: 'ja' }),
    ).rejects.toThrow('process.exit: 1');

    const abortCalled = gitAnalyze.raw.mock.calls.some(
      (call) => call[0][0] === 'merge' && call[0][1] === '--abort',
    );
    expect(abortCalled).toBe(true);

  });

  it('analyze_機密ファイルはskippedFilesに記録される', async () => {
    // Given: .env を含むコンフリクトファイル
    const envFilePath = path.join(repoRoot, '.env');
    const appFilePath = path.join(repoRoot, 'src/app.ts');
    await fsp.mkdir(path.dirname(appFilePath), { recursive: true });
    await fsp.writeFile(
      envFilePath,
      '<<<<<<< HEAD\nSECRET=ours\n=======\nSECRET=theirs\n>>>>>>> feature\n',
      'utf-8',
    );
    await fsp.writeFile(
      appFilePath,
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n',
      'utf-8',
    );

    const plan: ConflictResolutionPlan = {
      prNumber: 42,
      baseBranch: 'main',
      headBranch: 'feature',
      generatedAt: '2024-01-01T00:00:00Z',
      resolutions: [
        { filePath: 'src/app.ts', strategy: 'manual-merge', resolvedContent: 'resolved' },
      ],
      skippedFiles: ['.env'],
      warnings: ['.env は機密ファイルのため自動解消をスキップしました。'],
    };

    mergeContextCollectMock.mockResolvedValue({
      conflictFiles: [
        { filePath: '.env', startLine: 1, endLine: 5, oursContent: 'ours', theirsContent: 'theirs' },
        { filePath: 'src/app.ts', startLine: 1, endLine: 5, oursContent: 'ours', theirsContent: 'theirs' },
      ],
      oursLog: [],
      theirsLog: [],
      prDescription: '',
      relatedIssues: [],
      contextSnippets: [],
    });

    createPlanMock.mockResolvedValue(plan);

    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] })
        .mockResolvedValueOnce({ files: [{ path: '.env' }, { path: 'src/app.ts' }], current: 'main', conflicted: ['.env', 'src/app.ts'] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main', 'feature'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(''),
    };

    const gitInstances = [gitInit, gitAnalyze];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });

    // When: analyze 実行
    await handleResolveConflictAnalyzeCommand({ prUrl, agent: 'auto', language: 'ja' });

    // Then: 解消計画にskippedFilesが含まれる
    const planJsonPath = path.join(repoRoot, '.ai-workflow', 'conflict-42', 'resolution-plan.json');
    const planContent = JSON.parse(await fsp.readFile(planJsonPath, 'utf-8')) as ConflictResolutionPlan;
    expect(planContent.skippedFiles).toContain('.env');
    expect(planContent.warnings.some((warning) => warning.includes('.env'))).toBe(true);
  });

  it('finalize_pushなし_リモートへpushしない', async () => {
    // Given: init 済みのメタデータ
    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitInstances = [gitInit];
    simpleGitMock.mockImplementation(() => {
      const instance = gitInstances.shift();
      if (!instance) {
        throw new Error('unexpected git call');
      }
      return instance;
    });

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });

    // When: finalize を push なしで実行
    await handleResolveConflictFinalizeCommand({ prUrl, push: false, squash: false, language: 'ja' });

    // Then: push が行われず、メタデータがクリーンアップされる
    const metadataManager = new ConflictMetadataManager(repoRoot, 42);
    await expect(fsp.access(metadataManager.getMetadataPath())).rejects.toThrow();
  });

  it('finalize_squashオプション指定でも正常終了する', async () => {
    // Given: init 済みのメタデータと解消結果
    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitInstances = [gitInit];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });

    const metadataManager = new ConflictMetadataManager(repoRoot, 42);
    const outputDir = path.join(repoRoot, '.ai-workflow', 'conflict-42');
    await fsp.mkdir(outputDir, { recursive: true });
    const resultPath = path.join(outputDir, 'resolution-result.md');
    await fsp.writeFile(resultPath, '# result', 'utf-8');
    await metadataManager.setResolutionResult(resultPath);

    // When: finalize を squash 指定で実行
    await handleResolveConflictFinalizeCommand({ prUrl, push: false, squash: true, language: 'ja' });

    // Then: コメント投稿とクリーンアップが行われる
    expect(githubClientInstance.postComment).toHaveBeenCalled();
    await expect(fsp.access(metadataManager.getMetadataPath())).rejects.toThrow();
  });

  it('analyze_agentと言語オプションが解消計画に渡される', async () => {
    // Given: analyze のオプション指定
    const conflictFilePath = path.join(repoRoot, 'src/conflict.ts');
    await fsp.mkdir(path.dirname(conflictFilePath), { recursive: true });
    await fsp.writeFile(
      conflictFilePath,
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n',
      'utf-8',
    );

    const plan: ConflictResolutionPlan = {
      prNumber: 42,
      baseBranch: 'main',
      headBranch: 'feature',
      generatedAt: '2024-01-01T00:00:00Z',
      resolutions: [
        { filePath: 'src/conflict.ts', strategy: 'manual-merge', resolvedContent: 'resolved' },
      ],
      skippedFiles: [],
      warnings: [],
    };

    mergeContextCollectMock.mockResolvedValue({
      conflictFiles: [
        { filePath: 'src/conflict.ts', startLine: 1, endLine: 5, oursContent: 'ours', theirsContent: 'theirs' },
      ],
      oursLog: [],
      theirsLog: [],
      prDescription: '',
      relatedIssues: [],
      contextSnippets: [],
    });

    createPlanMock.mockResolvedValue(plan);

    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] })
        .mockResolvedValueOnce({ files: [{ path: 'src/conflict.ts' }], current: 'main', conflicted: ['src/conflict.ts'] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main', 'feature'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(''),
    };

    const gitInstances = [gitInit, gitAnalyze];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });

    // When: analyze を agent/language 指定で実行
    await handleResolveConflictAnalyzeCommand({ prUrl, agent: 'codex', language: 'en' });

    // Then: ConflictResolver にオプションが渡される
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ agent: 'codex', language: 'en' }),
    );
  });

  it('execute_agentと言語オプションが解消処理に渡される', async () => {
    // Given: 事前に init/analyze を実行
    const conflictFilePath = path.join(repoRoot, 'src/conflict.ts');
    await fsp.mkdir(path.dirname(conflictFilePath), { recursive: true });
    await fsp.writeFile(
      conflictFilePath,
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n',
      'utf-8',
    );

    const plan: ConflictResolutionPlan = {
      prNumber: 42,
      baseBranch: 'main',
      headBranch: 'feature',
      generatedAt: '2024-01-01T00:00:00Z',
      resolutions: [
        { filePath: 'src/conflict.ts', strategy: 'manual-merge', resolvedContent: 'resolved' },
      ],
      skippedFiles: [],
      warnings: [],
    };

    mergeContextCollectMock.mockResolvedValue({
      conflictFiles: [
        { filePath: 'src/conflict.ts', startLine: 1, endLine: 5, oursContent: 'ours', theirsContent: 'theirs' },
      ],
      oursLog: [],
      theirsLog: [],
      prDescription: '',
      relatedIssues: [],
      contextSnippets: [],
    });

    createPlanMock.mockResolvedValue(plan);
    resolveMock.mockResolvedValue(plan.resolutions);

    const gitInit = {
      fetch: jest.fn().mockResolvedValue(undefined),
    };

    const gitAnalyze = {
      fetch: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValueOnce({ files: [], current: 'main', conflicted: [] })
        .mockResolvedValueOnce({ files: [{ path: 'src/conflict.ts' }], current: 'main', conflicted: ['src/conflict.ts'] }),
      branchLocal: jest.fn().mockResolvedValue({ all: ['main'] }),
      checkout: jest.fn().mockResolvedValue(undefined),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(''),
    };

    const gitExecute = {
      add: jest.fn().mockResolvedValue(undefined),
      status: jest.fn().mockResolvedValue({ files: [{ path: 'src/conflict.ts' }], current: 'feature' }),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    const gitInstances = [gitInit, gitAnalyze, gitExecute];
    simpleGitMock.mockImplementation(() => gitInstances.shift());

    await handleResolveConflictInitCommand({ prUrl, language: 'ja' });
    await handleResolveConflictAnalyzeCommand({ prUrl, agent: 'auto', language: 'ja' });

    // When: execute を agent/language 指定で実行
    await handleResolveConflictExecuteCommand({ prUrl, agent: 'claude', dryRun: false, language: 'en' });

    // Then: ConflictResolver にオプションが渡される
    expect(resolveMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ agent: 'claude', language: 'en' }),
    );
  });
});
