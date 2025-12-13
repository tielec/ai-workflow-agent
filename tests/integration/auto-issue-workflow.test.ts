/**
 * インテグレーションテスト: auto-issue ワークフロー
 *
 * テスト対象: auto-issue コマンド全体のエンドツーエンドワークフロー
 * テストシナリオ: test-scenario.md の TC-INT-001 〜 TC-INT-014
 *
 * 注意: このテストは実際のエージェント・GitHub API を使用しないため、
 * 主要なモックを使用してワークフロー全体を検証します。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { handleAutoIssueCommand } from '../../src/commands/auto-issue.js';
import { RepositoryAnalyzer } from '../../src/core/repository-analyzer.js';
import { IssueDeduplicator } from '../../src/core/issue-deduplicator.js';
import { IssueGenerator } from '../../src/core/issue-generator.js';
import * as autoIssueOutput from '../../src/commands/auto-issue-output.js';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../src/core/repository-analyzer.js', () => ({
  RepositoryAnalyzer: jest.fn(),
}));
jest.mock('../../src/core/issue-deduplicator.js', () => ({
  IssueDeduplicator: jest.fn(),
}));
jest.mock('../../src/core/issue-generator.js', () => ({
  IssueGenerator: jest.fn(),
}));
jest.mock('../../src/commands/execute/agent-setup.js');
jest.mock('../../src/core/repository-utils.js', () => ({
  resolveLocalRepoPath: jest.fn(() => '/tmp/mock-repo'),
}));
jest.mock('../../src/core/config.js', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'test-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    getHomeDir: jest.fn(() => '/home/test'),
    getReposRoot: jest.fn(() => null),
    getLogLevel: jest.fn(() => 'info'),
    getLogNoColor: jest.fn(() => false),
    getOpenAiApiKey: jest.fn(() => 'test-openai-api-key'),
    getClaudeCodeApiKey: jest.fn(() => 'test-claude-api-key'),
    getClaudeOAuthToken: jest.fn(() => 'test-claude-oauth'),
    getClaudeCodeToken: jest.fn(() => 'test-claude-token'),
    getClaudeDangerouslySkipPermissions: jest.fn(() => false),
    getClaudeModel: jest.fn(() => null),
    getCodexModel: jest.fn(() => null),
    isCI: jest.fn(() => false),
  },
}));
jest.mock('../../src/utils/logger.js');
jest.mock('@octokit/rest', () => {
  const issuesApi = {
    listForRepo: jest.fn().mockResolvedValue({ data: [] }),
    create: jest.fn().mockResolvedValue({ data: { number: 1, html_url: 'https://example.com/1' } }),
  };
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      issues: issuesApi,
    })),
  };
});
jest.mock('../../src/commands/auto-issue-output.js', () => {
  const actual = jest.requireActual('../../src/commands/auto-issue-output.js');
  return {
    ...actual,
    writeAutoIssueOutputFile: jest.fn(actual.writeAutoIssueOutputFile),
  };
});

describe('auto-issue workflow integration tests', () => {
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

    // 安全なデフォルトを設定
    mockAnalyzer.analyze.mockResolvedValue([]);
    mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
    mockGenerator.generate.mockResolvedValue({ success: true });

    // config のモック
    const config = require('../../src/core/config.js');
    config.getGitHubToken = jest.fn().mockReturnValue('test-token');
    config.getGitHubRepository = jest.fn().mockReturnValue('owner/repo');
    config.getHomeDir = jest.fn().mockReturnValue('/home/test');

    // agent-setup のモック
    const agentSetup = require('../../src/commands/execute/agent-setup.js');
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
   * TC-INT-001: エンドツーエンド_正常系_dry-runモード
   *
   * シナリオ: auto-issueコマンド全体（dry-runモード）
   */
  describe('TC-INT-001: End-to-end workflow with dry-run mode', () => {
    it('should execute complete workflow in dry-run mode', async () => {
      // Given: テストリポジトリとdry-runモード
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

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: auto-issue コマンドを dry-run モードで実行
      await handleAutoIssueCommand({
        category: 'bug',
        dryRun: true,
        limit: '3',
      });

      // Then: ワークフロー全体が正常に完了
      expect(mockAnalyzer.analyze).toHaveBeenCalledTimes(1);
      expect(mockDeduplicator.filterDuplicates).toHaveBeenCalledTimes(1);
      expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
      // dry-run モードなので Issue 作成はスキップ
      expect(mockGenerator.generate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        true
      );
    });
  });

  /**
   * TC-INT-002: エンドツーエンド_正常系_実際のIssue作成
   *
   * シナリオ: auto-issueコマンド全体（本番モード）
   */
  describe('TC-INT-002: End-to-end workflow with actual issue creation', () => {
    it('should create issues successfully', async () => {
      // Given: テストリポジトリと本番モード
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

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/456',
        issueNumber: 456,
      });

      // When: auto-issue コマンドを本番モードで実行
      await handleAutoIssueCommand({
        category: 'bug',
        limit: '2',
        dryRun: false,
      });

      // Then: Issue が作成される
      expect(mockGenerator.generate).toHaveBeenCalledTimes(1);
      expect(mockGenerator.generate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        false
      );
    });
  });

  /**
   * TC-INT-003: エンドツーエンド_正常系_重複検出によるスキップ
   *
   * シナリオ: 重複Issueのスキップ検証
   */
  describe('TC-INT-003: End-to-end workflow with duplicate detection', () => {
    it('should skip duplicate issues', async () => {
      // Given: 重複を含むバグ候補
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

      // 重複検出で1つ目が除外される
      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockResolvedValue([mockCandidates[1]]);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/789',
        issueNumber: 789,
      });

      // When: auto-issue コマンドを実行
      await handleAutoIssueCommand({
        category: 'bug',
        limit: '5',
        dryRun: false,
      });

      // Then: 重複が除外され、1件のみ作成される
      expect(mockDeduplicator.filterDuplicates).toHaveBeenCalledTimes(1);
      expect(mockGenerator.generate).toHaveBeenCalledTimes(1); // 1件のみ
    });
  });

  /**
   * TC-INT-004: エージェント選択_正常系_Codex使用
   *
   * シナリオ: Codexエージェントでバグ検出
   */
  describe('TC-INT-004: Agent selection with Codex', () => {
    it('should use Codex agent when specified', async () => {
      // Given: Codex エージェント指定
      mockAnalyzer.analyze.mockResolvedValue([]);

      // When: --agent codex で実行
      await handleAutoIssueCommand({
        category: 'bug',
        agent: 'codex',
        dryRun: true,
      });

      // Then: Codex エージェントが使用される
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(expect.any(String), 'codex');
    });
  });

  /**
   * TC-INT-005: エージェント選択_正常系_Claude使用
   *
   * シナリオ: Claudeエージェントでバグ検出
   */
  describe('TC-INT-005: Agent selection with Claude', () => {
    it('should use Claude agent when specified', async () => {
      // Given: Claude エージェント指定
      mockAnalyzer.analyze.mockResolvedValue([]);

      // When: --agent claude で実行
      await handleAutoIssueCommand({
        category: 'bug',
        agent: 'claude',
        dryRun: true,
      });

      // Then: Claude エージェントが使用される
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(expect.any(String), 'claude');
    });
  });

  /**
   * TC-INT-006: エージェント選択_正常系_autoモードでフォールバック
   *
   * シナリオ: autoモードでCodex→Claudeフォールバック
   *
   * 注意: フォールバックは RepositoryAnalyzer 内で実装されているため、
   * ここではautoモードが正しく渡されることを検証
   */
  describe('TC-INT-006: Agent selection with auto mode fallback', () => {
    it('should use auto mode for agent selection', async () => {
      // Given: auto モード指定
      mockAnalyzer.analyze.mockResolvedValue([]);

      // When: --agent auto で実行
      await handleAutoIssueCommand({
        category: 'bug',
        agent: 'auto',
        dryRun: true,
      });

      // Then: auto モードが渡される
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(expect.any(String), 'auto');
    });
  });

  /**
   * TC-INT-013: オプション統合_正常系_limit制限
   *
   * シナリオ: --limit オプションで候補数を制限
   */
  describe('TC-INT-013: Option integration with limit', () => {
    it('should limit number of issues created', async () => {
      // Given: 5件の候補があるが limit = 3
      const mockCandidates = Array.from({ length: 5 }, (_, i) => ({
        title: `Bug ${i + 1} with sufficient length for validation`,
        file: `test${i + 1}.ts`,
        line: i + 1,
        severity: 'high' as const,
        description: `Description ${i + 1} with enough characters for proper validation.`,
        suggestedFix: `Fix ${i + 1}`,
        category: 'bug' as const,
      }));

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: limit = 3 で実行
      await handleAutoIssueCommand({
        category: 'bug',
        limit: '3',
        dryRun: true,
      });

      // Then: 3件のみ処理される
      expect(mockGenerator.generate).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * TC-INT-014: オプション統合_正常系_similarity-threshold調整
   *
   * シナリオ: --similarity-threshold オプションで閾値調整
   */
  describe('TC-INT-014: Option integration with similarity threshold', () => {
    it('should use specified similarity threshold', async () => {
      // Given: カスタム閾値指定
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

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: similarity-threshold = 0.9 で実行
      await handleAutoIssueCommand({
        category: 'bug',
        similarityThreshold: '0.9',
        dryRun: true,
      });

      // Then: 指定した閾値が filterDuplicates に渡される
      expect(mockDeduplicator.filterDuplicates).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        0.9
      );
    });
  });

  /**
   * エラーハンドリング統合テスト
   */
  describe('Error handling integration', () => {
    it('should handle analyzer failure gracefully', async () => {
      // Given: アナライザーが失敗
      mockAnalyzer.analyze.mockRejectedValue(new Error('Analyzer failed'));

      // When & Then: エラーが適切に伝播
      await expect(
        handleAutoIssueCommand({
          category: 'bug',
          dryRun: true,
        })
      ).rejects.toThrow('Analyzer failed');
    });

    it('should handle partial failure in issue generation', async () => {
      // Given: 一部のIssue生成が失敗
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

      mockAnalyzer.analyze.mockResolvedValue(mockCandidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);

      // 1つ目は成功、2つ目は失敗
      mockGenerator.generate
        .mockResolvedValueOnce({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          issueNumber: 1,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'GitHub API failed',
        });

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand({
        category: 'bug',
        dryRun: false,
      });

      // Then: 部分的な失敗でも処理が継続される
      expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Issue #257: --output-file オプションのエンドツーエンド検証
   */
  describe('Issue #257: JSON output integration', () => {
    const baseDir = path.join(process.cwd(), 'tmp', 'auto-issue-workflow-tests');
    const writeSpy = autoIssueOutput.writeAutoIssueOutputFile as jest.Mock;
    const defaultWriteImplementation = writeSpy.getMockImplementation();

    const restoreWriteSpy = () => {
      writeSpy.mockImplementation(defaultWriteImplementation ?? (() => Promise.resolve()));
    };

    const cleanupOutput = async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
    };

    beforeEach(async () => {
      restoreWriteSpy();
      await cleanupOutput();
    });

    afterEach(async () => {
      await cleanupOutput();
      restoreWriteSpy();
    });

    /**
     * TC-INT-257-001: CLI_正常系_JSON出力
     *
     * 目的: `--output-file` 指定時に JSON が生成されることを検証 (FR1/FR2/AC1)
     */
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

      mockAnalyzer.analyze.mockResolvedValue([candidate]);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/321',
        issueNumber: 321,
        title: 'Fix CLI crash when writing JSON',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'results.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: false,
        limit: '1',
      });

      const payload = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));
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

    /**
     * TC-INT-257-002: CLI_dryRun_JSONカウント
     *
     * 目的: dry-run指定でも JSON が生成され summary.skipped が増加することを確認 (FR3/AC2)
     */
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

      mockAnalyzer.analyze.mockResolvedValue([candidate]);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
        title: 'Add JSON export option',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'dry-run.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
        limit: '1',
      });

      const payload = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));
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

    /**
     * TC-INT-257-003: CLI_outputFile_missingDir_エラー
     *
     * 目的: 書き込み不可パス指定時に CLI が非0終了でエラーを表示することを確認 (FR5/AC3)
     */
    it('should propagate output file errors so the CLI exits with failure', async () => {
      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'error.json');
      const writeSpy = autoIssueOutput.writeAutoIssueOutputFile as jest.Mock;
      writeSpy.mockRejectedValue(new Error('permission denied'));

      await expect(
        handleAutoIssueCommand({
          category: 'bug',
          outputFile: relativePath,
        }),
      ).rejects.toThrow('permission denied');

      // 元の実装に戻して以降のテストの副作用を防ぐ
      restoreWriteSpy();
    });

    /**
     * TC-INT-257-004: JSON出力_timestampがISO8601形式
     *
     * 目的: execution.timestamp が ISO8601 UTC 形式であることを確認
     */
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

      mockAnalyzer.analyze.mockResolvedValue([candidate]);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
        title: 'Test timestamp format validation',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'timestamp.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
      });

      const payload = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));

      // ISO8601 形式の検証 (YYYY-MM-DDTHH:mm:ss.sssZ)
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(payload.execution.timestamp).toMatch(iso8601Regex);

      // 有効な日付かどうかを検証
      const parsedDate = new Date(payload.execution.timestamp);
      expect(parsedDate.toISOString()).toBe(payload.execution.timestamp);
    });

    /**
     * TC-INT-257-005: JSON出力_カテゴリ別の整合性
     *
     * 目的: カテゴリが正しく execution に含まれることを確認
     */
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

      mockAnalyzer.analyze.mockResolvedValue([candidate]);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
        title: 'Test category tracking',
      });

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'category.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
      });

      const payload = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));
      expect(payload.execution.category).toBe('bug');
      expect(payload.execution.dryRun).toBe(true);
    });

    /**
     * TC-INT-257-006: JSON出力_複数件処理
     *
     * 目的: 複数の Issue 候補が正しく JSON に含まれることを確認
     */
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

      mockAnalyzer.analyze.mockResolvedValue(candidates);
      mockDeduplicator.filterDuplicates.mockImplementation(async (c) => c);

      // 1件目成功、2件目失敗、3件目スキップ
      mockGenerator.generate
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

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: false,
        limit: '3',
      });

      const payload = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));

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

    /**
     * TC-INT-257-007: JSON出力_空の候補リスト
     *
     * 目的: 候補がゼロの場合でも JSON が正しく生成されることを確認
     */
    it('should generate valid JSON even with zero candidates', async () => {
      mockAnalyzer.analyze.mockResolvedValue([]);

      const relativePath = path.join('tmp', 'auto-issue-workflow-tests', 'empty.json');
      const absolutePath = path.resolve(process.cwd(), relativePath);

      await handleAutoIssueCommand({
        category: 'bug',
        outputFile: relativePath,
        dryRun: true,
      });

      const payload = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));

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
