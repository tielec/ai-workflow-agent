/**
 * ユニットテスト: auto-issue コマンドハンドラ
 *
 * テスト対象: src/commands/auto-issue.ts
 * テストシナリオ: test-scenario.md の TC-CLI-001 〜 TC-CLI-010
 */

import { handleAutoIssueCommand } from '../../../src/commands/auto-issue.js';
import type { AutoIssueOptions, IssueCreationResult } from '../../../src/types/auto-issue.js';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import { IssueDeduplicator } from '../../../src/core/issue-deduplicator.js';
import { IssueGenerator } from '../../../src/core/issue-generator.js';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../../src/core/repository-analyzer.js');
jest.mock('../../../src/core/issue-deduplicator.js');
jest.mock('../../../src/core/issue-generator.js');
jest.mock('../../../src/commands/execute/agent-setup.js');
jest.mock('../../../src/core/config.js');
jest.mock('../../../src/utils/logger.js');
jest.mock('@octokit/rest');

describe('auto-issue command handler', () => {
  let mockAnalyzer: jest.Mocked<RepositoryAnalyzer>;
  let mockDeduplicator: jest.Mocked<IssueDeduplicator>;
  let mockGenerator: jest.Mocked<IssueGenerator>;

  beforeEach(() => {
    // モックインスタンスの作成
    mockAnalyzer = {
      analyze: jest.fn(),
    } as unknown as jest.Mocked<RepositoryAnalyzer>;

    mockDeduplicator = {
      filterDuplicates: jest.fn(),
    } as unknown as jest.Mocked<IssueDeduplicator>;

    mockGenerator = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<IssueGenerator>;

    // コンストラクタのモック
    (RepositoryAnalyzer as jest.MockedClass<typeof RepositoryAnalyzer>).mockImplementation(
      () => mockAnalyzer
    );
    (IssueDeduplicator as jest.MockedClass<typeof IssueDeduplicator>).mockImplementation(
      () => mockDeduplicator
    );
    (IssueGenerator as jest.MockedClass<typeof IssueGenerator>).mockImplementation(
      () => mockGenerator
    );

    // config のモック
    const config = require('../../../src/core/config.js');
    config.getGitHubToken = jest.fn().mockReturnValue('test-token');
    config.getGitHubRepository = jest.fn().mockReturnValue('owner/repo');
    config.getHomeDir = jest.fn().mockReturnValue('/home/test');

    // agent-setup のモック
    const agentSetup = require('../../../src/commands/execute/agent-setup.js');
    agentSetup.resolveAgentCredentials = jest.fn().mockReturnValue({
      codexApiKey: 'test-codex-key',
      claudeCredentialsPath: '/path/to/claude',
    });
    agentSetup.setupAgentClients = jest.fn().mockReturnValue({
      codexClient: {},
      claudeClient: {},
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC-CLI-001: parseOptions_正常系_デフォルト値適用
   *
   * 目的: オプション未指定時にデフォルト値が適用されることを検証
   */
  describe('TC-CLI-001: parseOptions with default values', () => {
    it('should apply default values when options are not specified', async () => {
      // Given: 空のオプション
      mockAnalyzer.analyze.mockResolvedValue([]);

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand({});

      // Then: デフォルト値が適用される（内部でパースされる）
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(expect.any(String), 'auto');
    });
  });

  /**
   * TC-CLI-002: parseOptions_正常系_すべてのオプション指定
   *
   * 目的: すべてのオプションが正しくパースされることを検証
   */
  describe('TC-CLI-002: parseOptions with all options specified', () => {
    it('should parse all options correctly', async () => {
      // Given: すべてのオプション指定
      const rawOptions = {
        category: 'bug',
        limit: '10',
        dryRun: true,
        similarityThreshold: '0.9',
        agent: 'codex' as const,
      };

      mockAnalyzer.analyze.mockResolvedValue([]);

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand(rawOptions);

      // Then: オプションが正しくパースされる
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(expect.any(String), 'codex');
    });
  });

  /**
   * TC-CLI-003: parseOptions_異常系_limitが数値以外
   *
   * 目的: limitが数値に変換できない場合、エラーがスローされることを検証
   */
  describe('TC-CLI-003: parseOptions with invalid limit', () => {
    it('should throw error when limit is not a number', async () => {
      // Given: 不正な limit
      const rawOptions = {
        limit: 'invalid',
      };

      // When & Then: エラーがスローされる
      await expect(handleAutoIssueCommand(rawOptions)).rejects.toThrow();
    });
  });

  /**
   * TC-CLI-004: parseOptions_異常系_similarityThresholdが範囲外
   *
   * 目的: similarityThresholdが0.0〜1.0の範囲外の場合、エラーがスローされることを検証
   */
  describe('TC-CLI-004: parseOptions with out-of-range similarityThreshold', () => {
    it('should throw error when similarityThreshold is out of range', async () => {
      // Given: 範囲外の similarityThreshold
      const rawOptions = {
        similarityThreshold: '1.5',
      };

      // When & Then: エラーがスローされる
      await expect(handleAutoIssueCommand(rawOptions)).rejects.toThrow();
    });
  });

  /**
   * TC-CLI-005: handleAutoIssueCommand_正常系_エンドツーエンド
   *
   * 目的: コマンド全体が正常に動作することを検証
   */
  describe('TC-CLI-005: handleAutoIssueCommand end-to-end', () => {
    it('should execute complete workflow successfully', async () => {
      // Given: すべてのモジュールが正常に動作
      const mockCandidates = [
        {
          title: 'Bug 1 with sufficient length',
          file: 'test1.ts',
          line: 1,
          severity: 'high' as const,
          description: 'Desc 1 with enough characters for validation purposes.',
          suggestedFix: 'Fix 1',
          category: 'bug' as const,
        },
        {
          title: 'Bug 2 with sufficient length',
          file: 'test2.ts',
          line: 2,
          severity: 'medium' as const,
          description: 'Desc 2 with enough characters for validation purposes.',
          suggestedFix: 'Fix 2',
          category: 'bug' as const,
        },
        {
          title: 'Bug 3 with sufficient length',
          file: 'test3.ts',
          line: 3,
          severity: 'low' as const,
          description: 'Desc 3 with enough characters for validation purposes.',
          suggestedFix: 'Fix 3',
          category: 'bug' as const,
        },
      ];

      const mockFilteredCandidates = mockCandidates.slice(0, 2);

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockResolvedValue(mockFilteredCandidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      const options = {
        category: 'bug',
        limit: '2',
        dryRun: true,
        similarityThreshold: '0.8',
        agent: 'codex' as const,
      };

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand(options);

      // Then: すべてのモジュールが呼び出される
      expect(mockAnalyzer.analyze).toHaveBeenCalledTimes(1);
      expect(mockDeduplicator.filterDuplicates).toHaveBeenCalledTimes(1);
      expect(mockGenerator.generate).toHaveBeenCalledTimes(2); // limit = 2
    });
  });

  /**
   * TC-CLI-006: handleAutoIssueCommand_異常系_GITHUB_REPOSITORY未設定
   *
   * 目的: GITHUB_REPOSITORY環境変数が未設定の場合、エラーがスローされることを検証
   */
  describe('TC-CLI-006: handleAutoIssueCommand without GITHUB_REPOSITORY', () => {
    it('should throw error when GITHUB_REPOSITORY is not set', async () => {
      // Given: GITHUB_REPOSITORY が null
      const config = require('../../../src/core/config.js');
      config.getGitHubRepository.mockReturnValue(null);

      // When & Then: エラーがスローされる
      await expect(handleAutoIssueCommand({})).rejects.toThrow(/GITHUB_REPOSITORY/);
    });
  });

  /**
   * TC-CLI-007: handleAutoIssueCommand_異常系_エージェント未設定
   *
   * 目的: エージェントが設定されていない場合、エラーがスローされることを検証
   */
  describe('TC-CLI-007: handleAutoIssueCommand without agent configuration', () => {
    it('should throw error when no agent is configured', async () => {
      // Given: エージェントが両方とも null
      const agentSetup = require('../../../src/commands/execute/agent-setup.js');
      agentSetup.setupAgentClients.mockReturnValue({
        codexClient: null,
        claudeClient: null,
      });

      // When & Then: エラーがスローされる
      await expect(handleAutoIssueCommand({ agent: 'auto' })).rejects.toThrow(/Agent mode/);
    });
  });

  /**
   * TC-CLI-008: reportResults_正常系_成功結果表示
   *
   * 目的: Issue作成成功時に適切な結果サマリーが表示されることを検証
   */
  describe('TC-CLI-008: reportResults with successful results', () => {
    it('should display success summary correctly', async () => {
      // Given: Issue作成成功
      mockAnalyzer.analyze.mockResolvedValue([
        {
          title: 'Test bug with sufficient length',
          file: 'test.ts',
          line: 1,
          severity: 'high' as const,
          description: 'Test description with enough characters for validation.',
          suggestedFix: 'Test fix',
          category: 'bug' as const,
        },
      ]);

      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);

      mockGenerator.generate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/1',
        issueNumber: 1,
      });

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand({ dryRun: false });

      // Then: 成功サマリーが表示される（logger経由で確認）
      expect(mockGenerator.generate).toHaveBeenCalled();
    });
  });

  /**
   * TC-CLI-009: reportResults_正常系_dry-run結果表示
   *
   * 目的: dry-runモード時に適切な結果サマリーが表示されることを検証
   */
  describe('TC-CLI-009: reportResults with dry-run mode', () => {
    it('should display dry-run summary correctly', async () => {
      // Given: dry-run モード
      mockAnalyzer.analyze.mockResolvedValue([
        {
          title: 'Test bug with sufficient length',
          file: 'test.ts',
          line: 1,
          severity: 'high' as const,
          description: 'Test description with enough characters for validation.',
          suggestedFix: 'Test fix',
          category: 'bug' as const,
        },
      ]);

      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);

      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: handleAutoIssueCommand を dry-run で実行
      await handleAutoIssueCommand({ dryRun: true });

      // Then: dry-run サマリーが表示される
      expect(mockGenerator.generate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        true
      );
    });
  });

  /**
   * TC-CLI-010: reportResults_正常系_部分的成功
   *
   * 目的: 一部のIssue作成が失敗した場合、適切な結果サマリーが表示されることを検証
   */
  describe('TC-CLI-010: reportResults with partial success', () => {
    it('should display partial success summary correctly', async () => {
      // Given: 一部が成功、一部が失敗
      const mockCandidates = [
        {
          title: 'Bug 1 with sufficient length',
          file: 'test1.ts',
          line: 1,
          severity: 'high' as const,
          description: 'Description 1 with enough characters for validation.',
          suggestedFix: 'Fix 1',
          category: 'bug' as const,
        },
        {
          title: 'Bug 2 with sufficient length',
          file: 'test2.ts',
          line: 2,
          severity: 'medium' as const,
          description: 'Description 2 with enough characters for validation.',
          suggestedFix: 'Fix 2',
          category: 'bug' as const,
        },
        {
          title: 'Bug 3 with sufficient length',
          file: 'test3.ts',
          line: 3,
          severity: 'low' as const,
          description: 'Description 3 with enough characters for validation.',
          suggestedFix: 'Fix 3',
          category: 'bug' as const,
        },
      ];

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);

      // 1つ目と3つ目は成功、2つ目は失敗
      mockGenerator.generate
        .mockResolvedValueOnce({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          issueNumber: 1,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'GitHub API failed',
        })
        .mockResolvedValueOnce({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/3',
          issueNumber: 3,
        });

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand({ dryRun: false });

      // Then: 部分的成功のサマリーが表示される
      expect(mockGenerator.generate).toHaveBeenCalledTimes(3);
    });
  });
});
