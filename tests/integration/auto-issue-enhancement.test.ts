/**
 * インテグレーションテスト: auto-issue enhancement カテゴリ
 *
 * テスト対象: src/commands/auto-issue.ts - enhancement カテゴリのエンドツーエンドフロー
 * テストシナリオ: test-scenario.md の 3.2.x
 */

import { jest } from '@jest/globals';
import type { EnhancementProposal } from '../../src/types/auto-issue.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

// モック関数の事前定義
const mockAnalyzeForEnhancements = jest.fn<any>();
const mockFilterDuplicates = jest.fn<any>();
const mockGenerateEnhancementIssue = jest.fn<any>();
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
    analyzeForEnhancements: mockAnalyzeForEnhancements,
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
    generateEnhancementIssue: mockGenerateEnhancementIssue,
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

describe('Integration: auto-issue enhancement category', () => {
  let testRepoDir: string;

  beforeEach(async () => {
    // 実際のテストリポジトリディレクトリを作成
    testRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
    await fs.ensureDir(path.join(testRepoDir, '.git'));

    // 環境変数を設定（モックよりも確実）
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.HOME = '/home/test';

    // モック関数のクリア
    mockAnalyzeForEnhancements.mockClear();
    mockFilterDuplicates.mockClear();
    mockGenerateEnhancementIssue.mockClear();
    mockGetGitHubToken.mockClear();
    mockGetGitHubRepository.mockClear();
    mockGetHomeDir.mockClear();
    mockResolveLocalRepoPath.mockClear();
    mockResolveAgentCredentials.mockClear();
    mockSetupAgentClients.mockClear();

    // resolveLocalRepoPath が実際のテストディレクトリを返すように設定
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);

    // デフォルトの動作設定
    mockAnalyzeForEnhancements.mockResolvedValue([]);
    mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
    mockGenerateEnhancementIssue.mockResolvedValue({ success: true });
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
   * シナリオ 3.2.1: enhancement カテゴリのエンドツーエンドフロー（dry-runモード）
   */
  describe('Scenario 3.2.1: End-to-end flow with dry-run mode', () => {
    it('should execute complete workflow in dry-run mode', async () => {
      // Given: 有効な提案が生成される
      const mockProposals: EnhancementProposal[] = [
        {
          type: 'integration',
          title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
          description:
            'AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。',
          rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
          implementation_hints: ['Slack Incoming Webhook を使用'],
          expected_impact: 'medium',
          effort_estimate: 'small',
          related_files: ['src/phases/evaluation.ts'],
        },
        {
          type: 'dx',
          title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化する機能',
          description:
            '初回実行時に対話的セットアップウィザードを表示し、環境変数の設定を GUI で完了できる機能。',
          rationale: '新規ユーザーがドキュメントを読まずに即座に利用開始できる。',
          implementation_hints: ['inquirer.js ライブラリを使用'],
          expected_impact: 'high',
          effort_estimate: 'medium',
          related_files: ['src/commands/init.ts'],
        },
        {
          type: 'quality',
          title: 'セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する機能',
          description: 'npm audit や Snyk を統合し、依存関係の脆弱性を自動検出する機能。',
          rationale: 'セキュリティリスクを早期発見し、脆弱性のある依存関係の使用を防止。',
          implementation_hints: ['npm audit コマンドを実行', 'Snyk API を統合'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/commands/auto-issue.ts'],
        },
      ];

      mockAnalyzeForEnhancements.mockResolvedValue(mockProposals);
      mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
      mockGenerateEnhancementIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: dry-run モードで実行
      await handleAutoIssueCommand({
        category: 'enhancement',
        dryRun: true,
        limit: '3',
      });

      // Then: 各モジュールが正しく呼び出される
      expect(mockAnalyzeForEnhancements).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeForEnhancements).toHaveBeenCalledWith(
        testRepoDir,
        'auto',
        expect.objectContaining({ creativeMode: false }),
      );
      // Note: filterDuplicates is NOT called for enhancement category (only for bug category)
      expect(mockGenerateEnhancementIssue).toHaveBeenCalledTimes(3);
      expect(mockGenerateEnhancementIssue).toHaveBeenCalledWith(
        expect.any(Object),
        'auto',
        true, // dry-run = true
      );
    });
  });

  /**
   * シナリオ 3.2.4: 創造的モードのエンドツーエンドフロー
   */
  describe('Scenario 3.2.4: End-to-end flow with creative mode', () => {
    it('should execute workflow with creative mode enabled', async () => {
      // Given: 創造的モードで提案が生成される
      const mockProposals: EnhancementProposal[] = [
        {
          type: 'ecosystem',
          title: 'プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構を実装する',
          description:
            'ユーザーが独自のフェーズを定義できるプラグインシステムを実装する機能。',
          rationale: 'プロダクトの拡張性を大幅に向上させ、コミュニティ主導の成長を促進する。',
          implementation_hints: ['プラグインローダーを実装', 'フェーズインターフェースを定義'],
          expected_impact: 'high',
          effort_estimate: 'large',
          related_files: ['src/core/plugin-loader.ts'],
        },
      ];

      mockAnalyzeForEnhancements.mockResolvedValue(mockProposals);
      mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
      mockGenerateEnhancementIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: creative mode で実行
      await handleAutoIssueCommand({
        category: 'enhancement',
        creativeMode: true,
        dryRun: true,
        limit: '3',
      });

      // Then: creative mode が有効化される
      expect(mockAnalyzeForEnhancements).toHaveBeenCalledWith(
        testRepoDir,
        'auto',
        expect.objectContaining({ creativeMode: true }),
      );
      expect(mockGenerateEnhancementIssue).toHaveBeenCalled();
    });
  });

  /**
   * 追加テスト: エージェント選択
   */
  describe('Additional: Agent selection for enhancement category', () => {
    it('should use specified agent (codex)', async () => {
      // Given: エージェントとしてcodexを指定
      mockAnalyzeForEnhancements.mockResolvedValue([]);

      // When: codex エージェントで実行
      await handleAutoIssueCommand({
        category: 'enhancement',
        agent: 'codex',
        dryRun: true,
      });

      // Then: codex エージェントが使用される
      expect(mockAnalyzeForEnhancements).toHaveBeenCalledWith(
        testRepoDir,
        'codex',
        expect.objectContaining({ creativeMode: false }),
      );
    });

    it('should use specified agent (claude)', async () => {
      // Given: エージェントとしてclaudeを指定
      mockAnalyzeForEnhancements.mockResolvedValue([]);

      // When: claude エージェントで実行
      await handleAutoIssueCommand({
        category: 'enhancement',
        agent: 'claude',
        dryRun: true,
      });

      // Then: claude エージェントが使用される
      expect(mockAnalyzeForEnhancements).toHaveBeenCalledWith(
        testRepoDir,
        'claude',
        expect.objectContaining({ creativeMode: false }),
      );
    });
  });

  /**
   * 追加テスト: limit オプション
   */
  describe('Additional: Limit option for enhancement category', () => {
    it('should respect limit option', async () => {
      // Given: 5件の提案が生成される
      const mockProposals: EnhancementProposal[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'improvement',
        title: `Proposal ${i + 1} - This is a valid title that meets minimum length requirement`,
        description:
          'This is a valid description that meets the minimum length requirement of 100 characters.',
        rationale:
          'This is a valid rationale that meets the minimum length requirement of 50 characters.',
        implementation_hints: ['Hint 1'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/test.ts'],
      }));

      mockAnalyzeForEnhancements.mockResolvedValue(mockProposals);
      mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
      mockGenerateEnhancementIssue.mockResolvedValue({ success: true, skippedReason: 'dry-run' });

      // When: limit = 2 で実行
      await handleAutoIssueCommand({
        category: 'enhancement',
        dryRun: true,
        limit: '2',
      });

      // Then: 2件のみ Issue 生成される
      expect(mockGenerateEnhancementIssue).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * 追加テスト: expected_impact によるソート
   */
  describe('Additional: Sorting by expected_impact', () => {
    it('should sort proposals by expected_impact (high > medium > low)', async () => {
      // Given: 異なる impact の提案が生成される
      const mockProposals: EnhancementProposal[] = [
        {
          type: 'improvement',
          title: 'Low impact proposal - This is a valid title that meets minimum length',
          description:
            'This is a valid description that meets the minimum length requirement of 100 characters.',
          rationale:
            'This is a valid rationale that meets the minimum length requirement of 50 characters.',
          implementation_hints: ['Hint'],
          expected_impact: 'low',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
        {
          type: 'integration',
          title: 'High impact proposal - This is a valid title that meets minimum length',
          description:
            'This is a valid description that meets the minimum length requirement of 100 characters.',
          rationale:
            'This is a valid rationale that meets the minimum length requirement of 50 characters.',
          implementation_hints: ['Hint'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
        {
          type: 'automation',
          title: 'Medium impact proposal - This is a valid title that meets minimum length',
          description:
            'This is a valid description that meets the minimum length requirement of 100 characters.',
          rationale:
            'This is a valid rationale that meets the minimum length requirement of 50 characters.',
          implementation_hints: ['Hint'],
          expected_impact: 'medium',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
      ];

      mockAnalyzeForEnhancements.mockResolvedValue(mockProposals);
      mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
      mockGenerateEnhancementIssue.mockResolvedValue({ success: true, skippedReason: 'dry-run' });

      // When: 実行
      await handleAutoIssueCommand({
        category: 'enhancement',
        dryRun: true,
      });

      // Then: high impact が最初に処理される
      const calls = mockGenerateEnhancementIssue.mock.calls;
      // Jestモック関数の型推論のため、型アサーションを追加
      const firstCall = calls[0][0] as EnhancementProposal;
      const secondCall = calls[1][0] as EnhancementProposal;
      const thirdCall = calls[2][0] as EnhancementProposal;
      expect(firstCall.expected_impact).toBe('high');
      expect(secondCall.expected_impact).toBe('medium');
      expect(thirdCall.expected_impact).toBe('low');
    });
  });
});
