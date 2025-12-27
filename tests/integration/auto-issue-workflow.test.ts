/**
 * インテグレーションテスト: auto-issue ワークフロー
 *
 * テスト対象: auto-issue コマンド全体のエンドツーエンドワークフロー
 * テストシナリオ: test-scenario.md の TC-INT-001 〜 TC-INT-014
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import fsPromises from 'node:fs/promises';

// モック関数の事前定義
const mockAnalyze = jest.fn<any>();
const mockFilterDuplicates = jest.fn<any>();
const mockGenerate = jest.fn<any>();
const mockGetGitHubToken = jest.fn<any>();
const mockGetGitHubRepository = jest.fn<any>();
const mockGetHomeDir = jest.fn<any>();
const mockResolveLocalRepoPath = jest.fn<any>();
const mockResolveAgentCredentials = jest.fn<any>();
const mockSetupAgentClients = jest.fn<any>();
const mockWriteAutoIssueOutputFile = jest.fn<any>();

// モジュールの ESM モック
await jest.unstable_mockModule('../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
  })),
}));

await jest.unstable_mockModule('../../src/core/issue-deduplicator.js', () => ({
  __esModule: true,
  IssueDeduplicator: jest.fn().mockImplementation(() => ({
    filterDuplicates: mockFilterDuplicates,
  })),
}));

await jest.unstable_mockModule('../../src/core/issue-generator.js', () => ({
  __esModule: true,
  IssueGenerator: jest.fn().mockImplementation(() => ({
    generate: mockGenerate,
  })),
}));

await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubToken: mockGetGitHubToken,
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
    getOpenAiApiKey: jest.fn().mockReturnValue(null),
    getAnthropicApiKey: jest.fn().mockReturnValue(null),
    getCodexApiKey: jest.fn().mockReturnValue('test-codex-key'),
    getClaudeCodeToken: jest.fn().mockReturnValue('test-claude-token'),
    getReposRoot: jest.fn().mockReturnValue(null),
    isCI: jest.fn().mockReturnValue(false),
  },
}));

await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

await jest.unstable_mockModule('@octokit/rest', () => ({
  __esModule: true,
  Octokit: class {
    issues = { listForRepo: jest.fn().mockResolvedValue({ data: [] }) };
  },
}));

await jest.unstable_mockModule('../../src/commands/auto-issue-output.js', () => ({
  __esModule: true,
  buildAutoIssueJsonPayload: jest.fn((params: any) => {
    const { execution, results } = params;
    const issues = results.map((result: any) => ({
      success: result.success,
      title: result.title ?? 'Unknown title',
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
      error: result.error,
      skippedReason: result.skippedReason,
    }));

    const summary = {
      total: results.length,
      success: results.filter((r: any) => r.success && !r.skippedReason).length,
      failed: results.filter((r: any) => !r.success).length,
      skipped: results.filter((r: any) => Boolean(r.skippedReason)).length,
    };

    return {
      execution,
      summary,
      issues,
    };
  }),
  writeAutoIssueOutputFile: mockWriteAutoIssueOutputFile,
}));

// モック設定後にモジュールをインポート
const { handleAutoIssueCommand } = await import('../../src/commands/auto-issue.js');

describe('auto-issue workflow integration tests', () => {
  let testRepoDir: string;

  beforeEach(async () => {
    // 実際のテストリポジトリディレクトリを作成
    testRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
    await fs.ensureDir(path.join(testRepoDir, '.git'));

    // 環境変数を設定
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.HOME = '/home/test';

    // モック関数のクリア
    mockAnalyze.mockClear();
    mockFilterDuplicates.mockClear();
    mockGenerate.mockClear();
    mockGetGitHubToken.mockClear();
    mockGetGitHubRepository.mockClear();
    mockGetHomeDir.mockClear();
    mockResolveLocalRepoPath.mockClear();
    mockResolveAgentCredentials.mockClear();
    mockSetupAgentClients.mockClear();
    mockWriteAutoIssueOutputFile.mockClear();

    // resolveLocalRepoPath が実際のテストディレクトリを返すように設定
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);

    // デフォルトの動作設定
    mockAnalyze.mockResolvedValue([]);
    mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
    mockGenerate.mockResolvedValue({ success: true });
    mockGetGitHubToken.mockReturnValue('test-token');
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveAgentCredentials.mockReturnValue({
      codexApiKey: 'test-codex-key',
      claudeCredentialsPath: '/path/to/claude',
    });
    mockSetupAgentClients.mockReturnValue({
      codexClient: {},
      claudeClient: {},
    });
    mockWriteAutoIssueOutputFile.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // 環境変数をクリーンアップ
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.HOME;

    // テストディレクトリをクリーンアップ
    if (testRepoDir && (await fs.pathExists(testRepoDir))) {
      await fs.remove(testRepoDir);
    }

    // モック関数をクリア
    jest.clearAllMocks();
  });

  /**
   * TC-INT-001: エンドツーエンド_正常系_dry-runモード
   */
  describe('TC-INT-001: End-to-end workflow with dry-run mode', () => {
    it('should execute complete workflow in dry-run mode', async () => {
      const mockCandidates = [
        {
          title: 'Error handling missing in CodexAgentClient',
          file: 'src/core/codex-agent-client.ts',
          line: 42,
          severity: 'high' as const,
          description:
            'The executeTask method lacks proper error handling which could cause unhandled rejections.',
          suggestedFix: 'Add try-catch block around API calls.',
          category: 'bug' as const,
        },
        {
          title: 'Type safety issue in auto-issue types',
          file: 'src/types/auto-issue.ts',
          line: 10,
          severity: 'medium' as const,
          description: 'Excessive use of any type reduces type safety in the codebase.',
          suggestedFix: 'Replace any types with specific type definitions.',
          category: 'bug' as const,
        },
      ];

      mockAnalyze.mockResolvedValue(mockCandidates);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      await handleAutoIssueCommand({
        category: 'bug',
        dryRun: true,
        limit: '3',
      });

      expect(mockAnalyze).toHaveBeenCalledTimes(1);
      expect(mockFilterDuplicates).toHaveBeenCalledTimes(1);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate).toHaveBeenCalledWith(expect.any(Object), expect.any(String), true);
    });
  });

  /**
   * TC-INT-002: エンドツーエンド_正常系_実際のIssue作成
   */
  describe('TC-INT-002: End-to-end workflow with actual issue creation', () => {
    it('should create issues successfully', async () => {
      const mockCandidates = [
        {
          title: 'Memory leak in IssueGenerator component',
          file: 'src/core/issue-generator.ts',
          line: 50,
          severity: 'high' as const,
          description:
            'Memory leak detected in createIssueOnGitHub method when handling large payloads.',
          suggestedFix: 'Add proper cleanup after GitHub API calls.',
          category: 'bug' as const,
        },
      ];

      mockAnalyze.mockResolvedValue(mockCandidates);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/456',
        issueNumber: 456,
      });

      await handleAutoIssueCommand({
        category: 'bug',
        limit: '2',
        dryRun: false,
      });

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockGenerate).toHaveBeenCalledWith(expect.any(Object), expect.any(String), false);
    });
  });

  /**
   * TC-INT-003: エンドツーエンド_正常系_重複検出によるスキップ
   */
  describe('TC-INT-003: End-to-end workflow with duplicate detection', () => {
    it('should skip duplicate issues', async () => {
      const mockCandidates = [
        {
          title: 'Fix memory leak in CodexAgentClient component',
          file: 'src/core/codex-agent-client.ts',
          line: 42,
          severity: 'high' as const,
          description:
            'Memory leak occurs when executeTask fails and resources are not properly cleaned up.',
          suggestedFix: 'Add proper cleanup in catch block to prevent memory leaks.',
          category: 'bug' as const,
        },
        {
          title: 'Unique bug that should not be filtered',
          file: 'src/core/unique.ts',
          line: 10,
          severity: 'medium' as const,
          description: 'This is a unique bug that has no duplicates in existing issues.',
          suggestedFix: 'Fix the unique issue.',
          category: 'bug' as const,
        },
      ];

      mockAnalyze.mockResolvedValue(mockCandidates);
      mockFilterDuplicates.mockResolvedValue([mockCandidates[1]]);
      mockGenerate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/789',
        issueNumber: 789,
      });

      await handleAutoIssueCommand({
        category: 'bug',
        limit: '5',
        dryRun: false,
      });

      expect(mockFilterDuplicates).toHaveBeenCalledTimes(1);
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-INT-004: エージェント選択_正常系_Codex使用
   */
  describe('TC-INT-004: Agent selection with Codex', () => {
    it('should use Codex agent when specified', async () => {
      mockAnalyze.mockResolvedValue([]);

      await handleAutoIssueCommand({
        category: 'bug',
        agent: 'codex',
        dryRun: true,
      });

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(String),
        'codex',
        expect.objectContaining({ customInstruction: undefined }),
      );
    });
  });

  /**
   * TC-INT-005: エージェント選択_正常系_Claude使用
   */
  describe('TC-INT-005: Agent selection with Claude', () => {
    it('should use Claude agent when specified', async () => {
      mockAnalyze.mockResolvedValue([]);

      await handleAutoIssueCommand({
        category: 'bug',
        agent: 'claude',
        dryRun: true,
      });

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(String),
        'claude',
        expect.objectContaining({ customInstruction: undefined }),
      );
    });
  });

  /**
   * TC-INT-006: エージェント選択_正常系_autoモードでフォールバック
   */
  describe('TC-INT-006: Agent selection with auto mode fallback', () => {
    it('should use auto mode for agent selection', async () => {
      mockAnalyze.mockResolvedValue([]);

      await handleAutoIssueCommand({
        category: 'bug',
        agent: 'auto',
        dryRun: true,
      });

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(String),
        'auto',
        expect.objectContaining({ customInstruction: undefined }),
      );
    });
  });

  /**
   * TC-INT-013: オプション統合_正常系_limit制限
   */
  describe('TC-INT-013: Option integration with limit', () => {
    it('should limit number of issues created', async () => {
      const mockCandidates = Array.from({ length: 5 }, (_, i) => ({
        title: `Bug ${i + 1} with sufficient length for validation`,
        file: `test${i + 1}.ts`,
        line: i + 1,
        severity: 'high' as const,
        description: `Description ${i + 1} with enough characters for proper validation.`,
        suggestedFix: `Fix ${i + 1}`,
        category: 'bug' as const,
      }));

      mockAnalyze.mockResolvedValue(mockCandidates);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      await handleAutoIssueCommand({
        category: 'bug',
        limit: '3',
        dryRun: true,
      });

      expect(mockGenerate).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * TC-INT-014: オプション統合_正常系_similarity-threshold調整
   */
  describe('TC-INT-014: Option integration with similarity threshold', () => {
    it('should use specified similarity threshold', async () => {
      const mockCandidates = [
        {
          title: 'Test bug with sufficient length',
          file: 'test.ts',
          line: 1,
          severity: 'high' as const,
          description: 'Test description with enough characters for validation.',
          suggestedFix: 'Test fix',
          category: 'bug' as const,
        },
      ];

      mockAnalyze.mockResolvedValue(mockCandidates);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      await handleAutoIssueCommand({
        category: 'bug',
        similarityThreshold: '0.9',
        dryRun: true,
      });

      expect(mockFilterDuplicates).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        0.9,
      );
    });
  });

  /**
   * エラーハンドリング統合テスト
   */
  describe('Error handling integration', () => {
    it('should handle analyzer failure gracefully', async () => {
      mockAnalyze.mockRejectedValue(new Error('Analyzer failed'));

      await expect(
        handleAutoIssueCommand({
          category: 'bug',
          dryRun: true,
        }),
      ).rejects.toThrow('Analyzer failed');
    });

    it('should handle partial failure in issue generation', async () => {
      const mockCandidates = [
        {
          title: 'Bug 1 with sufficient length',
          file: 'test1.ts',
          line: 1,
          severity: 'high' as const,
          description: 'Description 1 with enough characters.',
          suggestedFix: 'Fix 1',
          category: 'bug' as const,
        },
        {
          title: 'Bug 2 with sufficient length',
          file: 'test2.ts',
          line: 2,
          severity: 'medium' as const,
          description: 'Description 2 with enough characters.',
          suggestedFix: 'Fix 2',
          category: 'bug' as const,
        },
      ];

      mockAnalyze.mockResolvedValue(mockCandidates);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);

      mockGenerate
        .mockResolvedValueOnce({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          issueNumber: 1,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'GitHub API failed',
        });

      await handleAutoIssueCommand({
        category: 'bug',
        dryRun: false,
      });

      expect(mockGenerate).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Issue #257: --output-file オプションのエンドツーエンド検証
   */
  describe('Issue #257: JSON output integration', () => {
    const baseDir = path.join(process.cwd(), 'tmp', 'auto-issue-workflow-tests');

    const cleanupOutput = async () => {
      await fsPromises.rm(baseDir, { recursive: true, force: true });
    };

    beforeEach(async () => {
      await cleanupOutput();
    });

    afterEach(async () => {
      await cleanupOutput();
    });

    it('should create JSON file with execution summary when output file is provided', async () => {
      const candidate = {
        title: 'Fix CLI crash when writing JSON',
        file: 'src/commands/auto-issue.ts',
        line: 50,
        severity: 'high' as const,
        description: 'Ensure CLI handles JSON output errors gracefully.',
        suggestedFix: 'Wrap file writes with try/catch and tests.',
        category: 'bug' as const,
      };

      mockAnalyze.mockResolvedValue([candidate]);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/321',
        issueNumber: 321,
        title: 'Fix CLI crash when writing JSON',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'results.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      // Setup mock to actually write the file
      mockWriteAutoIssueOutputFile.mockImplementation(async (filePath: string, payload: any) => {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, payload, { spaces: 2 });
      });

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: false,
        limit: '1',
      });

      const payload = JSON.parse(await fsPromises.readFile(absolutePath, 'utf-8'));
      expect(payload.summary).toEqual({
        total: 1,
        success: 1,
        failed: 0,
        skipped: 0,
      });
      expect(payload.execution.repository).toBe('owner/repo');
      expect(payload.issues[0]).toEqual(
        expect.objectContaining({
          issueNumber: 321,
          issueUrl: 'https://github.com/owner/repo/issues/321',
          title: 'Fix CLI crash when writing JSON',
        }),
      );
    });

    it('should record skipped entries in JSON when running in dry-run mode', async () => {
      const candidate = {
        title: 'Add JSON export option',
        file: 'src/commands/auto-issue.ts',
        line: 75,
        severity: 'medium' as const,
        description: 'Verify dry-run mode still produces JSON output.',
        suggestedFix: 'Add integration test to cover JSON writer.',
        category: 'bug' as const,
      };

      mockAnalyze.mockResolvedValue([candidate]);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
        title: 'Add JSON export option',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'dry-run.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      mockWriteAutoIssueOutputFile.mockImplementation(async (filePath: string, payload: any) => {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, payload, { spaces: 2 });
      });

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
        limit: '1',
      });

      const payload = JSON.parse(await fsPromises.readFile(absolutePath, 'utf-8'));
      expect(payload.summary).toEqual({
        total: 1,
        success: 0,
        failed: 0,
        skipped: 1,
      });
      expect(payload.issues[0]).toEqual(
        expect.objectContaining({
          skippedReason: 'dry-run mode',
          title: 'Add JSON export option',
        }),
      );
      expect(payload.issues[0].issueNumber).toBeUndefined();
      expect(payload.issues[0].issueUrl).toBeUndefined();
    });

    it('should propagate output file errors so the CLI exits with failure', async () => {
      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'error.json');

      mockWriteAutoIssueOutputFile.mockRejectedValue(new Error('permission denied'));

      await expect(
        handleAutoIssueCommand({
          category: 'bug',
          outputFile: relativePath,
        }),
      ).rejects.toThrow('permission denied');
    });

    it('should generate execution timestamp in ISO8601 UTC format', async () => {
      const candidate = {
        title: 'Test timestamp format validation',
        file: 'src/test.ts',
        line: 1,
        severity: 'low' as const,
        description: 'Verify timestamp is ISO8601 format.',
        suggestedFix: 'Check date formatting.',
        category: 'bug' as const,
      };

      mockAnalyze.mockResolvedValue([candidate]);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
        title: 'Test timestamp format validation',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'timestamp.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      mockWriteAutoIssueOutputFile.mockImplementation(async (filePath: string, payload: any) => {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, payload, { spaces: 2 });
      });

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
      });

      const payload = JSON.parse(await fsPromises.readFile(absolutePath, 'utf-8'));

      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(payload.execution.timestamp).toMatch(iso8601Regex);

      const parsedDate = new Date(payload.execution.timestamp);
      expect(parsedDate.toISOString()).toBe(payload.execution.timestamp);
    });

    it('should include correct category in execution info', async () => {
      const candidate = {
        title: 'Test category tracking',
        file: 'src/test.ts',
        line: 1,
        severity: 'medium' as const,
        description: 'Verify category is correctly recorded.',
        suggestedFix: 'Check category field.',
        category: 'bug' as const,
      };

      mockAnalyze.mockResolvedValue([candidate]);
      mockFilterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
        title: 'Test category tracking',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'category.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      mockWriteAutoIssueOutputFile.mockImplementation(async (filePath: string, payload: any) => {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, payload, { spaces: 2 });
      });

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
      });

      const payload = JSON.parse(await fsPromises.readFile(absolutePath, 'utf-8'));
      expect(payload.execution.category).toBe('bug');
      expect(payload.execution.dryRun).toBe(true);
    });

    it('should include multiple issues in JSON output', async () => {
      const candidates = [
        {
          title: 'Bug 1 with sufficient length',
          file: 'src/test1.ts',
          line: 10,
          severity: 'high' as const,
          description: 'First bug candidate with enough detail.',
          suggestedFix: 'Fix suggestion 1.',
          category: 'bug' as const,
        },
        {
          title: 'Bug 2 with sufficient length',
          file: 'src/test2.ts',
          line: 20,
          severity: 'medium' as const,
          description: 'Second bug candidate with enough detail.',
          suggestedFix: 'Fix suggestion 2.',
          category: 'bug' as const,
        },
        {
          title: 'Bug 3 with sufficient length',
          file: 'src/test3.ts',
          line: 30,
          severity: 'low' as const,
          description: 'Third bug candidate with enough detail.',
          suggestedFix: 'Fix suggestion 3.',
          category: 'bug' as const,
        },
      ];

      mockAnalyze.mockResolvedValue(candidates);
      mockFilterDuplicates.mockImplementation(async (c) => c);

      mockGenerate
        .mockResolvedValueOnce({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          issueNumber: 1,
          title: 'Bug 1 with sufficient length',
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'API rate limit exceeded',
          title: 'Bug 2 with sufficient length',
        })
        .mockResolvedValueOnce({
          success: true,
          skippedReason: 'dry-run mode',
          title: 'Bug 3 with sufficient length',
        });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'multiple.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      mockWriteAutoIssueOutputFile.mockImplementation(async (filePath: string, payload: any) => {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, payload, { spaces: 2 });
      });

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: false,
        limit: '3',
      });

      const payload = JSON.parse(await fsPromises.readFile(absolutePath, 'utf-8'));

      expect(payload.summary).toEqual({
        total: 3,
        success: 1,
        failed: 1,
        skipped: 1,
      });

      expect(payload.issues).toHaveLength(3);
      expect(payload.issues[0].success).toBe(true);
      expect(payload.issues[0].issueNumber).toBe(1);
      expect(payload.issues[1].success).toBe(false);
      expect(payload.issues[1].error).toBe('API rate limit exceeded');
      expect(payload.issues[2].skippedReason).toBe('dry-run mode');
    });

    it('should generate valid JSON even with zero candidates', async () => {
      mockAnalyze.mockResolvedValue([]);

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'empty.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      mockWriteAutoIssueOutputFile.mockImplementation(async (filePath: string, payload: any) => {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, payload, { spaces: 2 });
      });

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
      });

      const payload = JSON.parse(await fsPromises.readFile(absolutePath, 'utf-8'));

      expect(payload.summary).toEqual({
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
      });
      expect(payload.issues).toEqual([]);
      expect(payload.execution.repository).toBe('owner/repo');
      expect(payload.execution.category).toBe('bug');
    });
  });
});
