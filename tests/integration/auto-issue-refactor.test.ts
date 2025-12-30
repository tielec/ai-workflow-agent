/**
 * インテグレーションテスト: auto-issue refactor カテゴリ
 *
 * テスト対象: src/commands/auto-issue.ts - refactor カテゴリのエンドツーエンドフロー
 * テストシナリオ: test-scenario.md の 3.3.x
 */

import { jest } from '@jest/globals';
import type { RefactoringProposal } from '../../src/types/auto-issue.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

jest.setTimeout(20000);

// モック関数の事前定義
const mockAnalyzeForRefactoring = jest.fn<any>();
const mockGenerateRefactorIssue = jest.fn<any>();
const mockGetGitHubToken = jest.fn<any>();
const mockGetGitHubRepository = jest.fn<any>();
const mockGetHomeDir = jest.fn<any>();
const mockResolveLocalRepoPath = jest.fn<any>();
const mockResolveAgentCredentials = jest.fn<any>();
const mockSetupAgentClients = jest.fn<any>();

// モジュールの ESM モック
await jest.unstable_mockModule('../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    analyzeForRefactoring: mockAnalyzeForRefactoring,
  })),
}));

await jest.unstable_mockModule('../../src/core/issue-generator.js', () => ({
  __esModule: true,
  IssueGenerator: jest.fn().mockImplementation(() => ({
    generateRefactorIssue: mockGenerateRefactorIssue,
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

// モック設定後にモジュールをインポート
const { handleAutoIssueCommand } = await import('../../src/commands/auto-issue.js');

describe('Integration: auto-issue refactor category', () => {
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
    mockAnalyzeForRefactoring.mockClear();
    mockGenerateRefactorIssue.mockClear();
    mockGetGitHubToken.mockClear();
    mockGetGitHubRepository.mockClear();
    mockGetHomeDir.mockClear();
    mockResolveLocalRepoPath.mockClear();
    mockResolveAgentCredentials.mockClear();
    mockSetupAgentClients.mockClear();

    // resolveLocalRepoPath が実際のテストディレクトリを返すように設定
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);

    // デフォルトの動作設定
    mockAnalyzeForRefactoring.mockResolvedValue([]);
    mockGenerateRefactorIssue.mockResolvedValue({ success: true });
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
   * シナリオ 3.3.1: refactor カテゴリのエンドツーエンドフロー（dry-runモード）
   */
  describe('Scenario 3.3.1: End-to-end flow with dry-run mode', () => {
    it('should execute complete workflow in dry-run mode', async () => {
      // Given: 有効なリファクタリング提案が生成される
      const mockProposals: RefactoringProposal[] = [
        {
          type: 'large-file',
          title: 'src/core/large-file.ts のファイル分割 - 500行を3つのモジュールに分割',
          file_path: 'src/core/large-file.ts',
          rationale: 'ファイルサイズが大きすぎるため、保守性が低下している。',
          suggested_improvements: ['モジュール分割', '責務の明確化'],
          priority: 'high',
        },
        {
          type: 'large-function',
          title: 'processData 関数の分割 - 複雑な処理を複数の小さな関数に分割',
          file_path: 'src/utils/processor.ts',
          rationale: '関数が長すぎて理解しづらい。',
          suggested_improvements: ['関数分割', 'ヘルパー関数の抽出'],
          priority: 'medium',
        },
        {
          type: 'duplication',
          title: '重複コードの統合 - 類似処理を共通関数に統合',
          file_path: 'src/services/service-a.ts',
          rationale: '複数のファイルで同じロジックが重複している。',
          suggested_improvements: ['共通関数の作成', 'ユーティリティモジュールの作成'],
          priority: 'low',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockProposals);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: dry-run モードで実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
        limit: '3',
      });

      // Then: 各モジュールが正しく呼び出される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        testRepoDir,
        'auto',
        expect.objectContaining({ customInstruction: undefined }),
      );
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(3);
      expect(mockGenerateRefactorIssue).toHaveBeenCalledWith(
        expect.any(Object),
        'auto',
        true, // dry-run = true
      );
    });
  });

  /**
   * 追加テスト: エージェント選択
   */
  describe('Additional: Agent selection for refactor category', () => {
    it('should use specified agent (codex)', async () => {
      // Given: エージェントとしてcodexを指定
      mockAnalyzeForRefactoring.mockResolvedValue([]);

      // When: codex エージェントで実行
      await handleAutoIssueCommand({
        category: 'refactor',
        agent: 'codex',
        dryRun: true,
      });

      // Then: codex エージェントが使用される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        testRepoDir,
        'codex',
        expect.objectContaining({ customInstruction: undefined }),
      );
    });

    it('should use specified agent (claude)', async () => {
      // Given: エージェントとしてclaudeを指定
      mockAnalyzeForRefactoring.mockResolvedValue([]);

      // When: claude エージェントで実行
      await handleAutoIssueCommand({
        category: 'refactor',
        agent: 'claude',
        dryRun: true,
      });

      // Then: claude エージェントが使用される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        testRepoDir,
        'claude',
        expect.objectContaining({ customInstruction: undefined }),
      );
    });
  });

  /**
   * 追加テスト: limit オプション
   */
  describe('Additional: Limit option for refactor category', () => {
    it('should respect limit option', async () => {
      // Given: 5件の提案が生成される
      const mockProposals: RefactoringProposal[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'large-file',
        title: `Refactor proposal ${i + 1} - This is a valid title`,
        file_path: `src/file-${i}.ts`,
        rationale: 'Valid rationale for refactoring',
        suggested_improvements: ['Improvement 1'],
        priority: 'medium',
      }));

      mockAnalyzeForRefactoring.mockResolvedValue(mockProposals);
      mockGenerateRefactorIssue.mockResolvedValue({ success: true, skippedReason: 'dry-run' });

      // When: limit = 2 で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
        limit: '2',
      });

      // Then: 2件のみ Issue 生成される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * 追加テスト: priority によるソート
   */
  describe('Additional: Sorting by priority', () => {
    it('should sort proposals by priority (high > medium > low)', async () => {
      // Given: 異なる priority の提案が生成される
      const mockProposals: RefactoringProposal[] = [
        {
          type: 'large-file',
          title: 'Low priority proposal',
          file_path: 'src/low.ts',
          rationale: 'Rationale',
          suggested_improvements: ['Improvement'],
          priority: 'low',
        },
        {
          type: 'large-function',
          title: 'High priority proposal',
          file_path: 'src/high.ts',
          rationale: 'Rationale',
          suggested_improvements: ['Improvement'],
          priority: 'high',
        },
        {
          type: 'duplication',
          title: 'Medium priority proposal',
          file_path: 'src/medium.ts',
          rationale: 'Rationale',
          suggested_improvements: ['Improvement'],
          priority: 'medium',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockProposals);
      mockGenerateRefactorIssue.mockResolvedValue({ success: true, skippedReason: 'dry-run' });

      // When: 実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
      });

      // Then: high priority が最初に処理される
      const calls = mockGenerateRefactorIssue.mock.calls;
      const firstCall = calls[0][0] as RefactoringProposal;
      const secondCall = calls[1][0] as RefactoringProposal;
      const thirdCall = calls[2][0] as RefactoringProposal;
      expect(firstCall.priority).toBe('high');
      expect(secondCall.priority).toBe('medium');
      expect(thirdCall.priority).toBe('low');
    });
  });
});
