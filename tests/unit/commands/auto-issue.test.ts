/**
 * ユニットテスト: auto-issue コマンドハンドラ
 *
 * テスト対象: src/commands/auto-issue.ts
 * テストシナリオ: test-scenario.md の TC-CLI-001 〜 TC-CLI-010
 */

import path from 'node:path';
import { handleAutoIssueCommand } from '../../../src/commands/auto-issue.js';
import type { AutoIssueOptions, IssueCreationResult } from '../../../src/types/auto-issue.js';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import { IssueDeduplicator } from '../../../src/core/issue-deduplicator.js';
import { IssueGenerator } from '../../../src/core/issue-generator.js';
import * as autoIssueOutput from '../../../src/commands/auto-issue-output.js';
import { config } from '../../../src/core/config.js';
import { logger } from '../../../src/utils/logger.js';
import * as agentSetup from '../../../src/commands/execute/agent-setup.js';
import * as repositoryUtils from '../../../src/core/repository-utils.js';
import { jest } from '@jest/globals';

// モック関数の事前定義（グローバルスコープで定義）
const mockAnalyze = jest.fn<any>();
const mockAnalyzeForRefactoring = jest.fn<any>();
const mockAnalyzeForEnhancements = jest.fn<any>();
const mockFilterDuplicates = jest.fn<any>();
const mockGenerate = jest.fn<any>();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const resolveLocalRepoPathMock = jest.fn();

// モック設定
jest.mock('../../../src/core/repository-analyzer.js', () => ({
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
    analyzeForRefactoring: mockAnalyzeForRefactoring,
    analyzeForEnhancements: mockAnalyzeForEnhancements,
  })),
}));

jest.mock('../../../src/core/issue-deduplicator.js', () => ({
  IssueDeduplicator: jest.fn().mockImplementation(() => ({
    filterDuplicates: mockFilterDuplicates,
  })),
}));

jest.mock('../../../src/core/issue-generator.js', () => ({
  IssueGenerator: jest.fn().mockImplementation(() => ({
    generate: mockGenerate,
  })),
}));
jest.mock('../../../src/commands/auto-issue-output.js', () => ({
  buildAutoIssueJsonPayload: jest.fn(),
  writeAutoIssueOutputFile: jest.fn(),
}));

jest.mock('../../../src/commands/execute/agent-setup.js', () => ({
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));
jest.mock('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  ...jest.requireActual('../../../src/core/repository-utils.js'),
  resolveLocalRepoPath: resolveLocalRepoPathMock,
}));
jest.mock('@octokit/rest');

describe('auto-issue command handler', () => {
  // 変数名のエイリアス（既存コードとの互換性のため）
  const mockAnalyzer = {
    analyze: mockAnalyze,
    analyzeForRefactoring: mockAnalyzeForRefactoring,
    analyzeForEnhancements: mockAnalyzeForEnhancements,
  };
  const mockDeduplicator = { filterDuplicates: mockFilterDuplicates };
  const mockGenerator = { generate: mockGenerate };

  beforeAll(() => {
    process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? 'test-github-token';
    process.env.GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? 'owner/repo';
  });

  beforeEach(async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    // モック関数のクリア
    mockAnalyze.mockClear();
    mockAnalyzeForRefactoring.mockClear();
    mockAnalyzeForEnhancements.mockClear();
    mockFilterDuplicates.mockClear();
    mockGenerate.mockClear();
    mockResolveAgentCredentials.mockClear();
    mockSetupAgentClients.mockClear();

    // デフォルトの動作設定
    mockAnalyze.mockResolvedValue([]);
    mockAnalyzeForRefactoring.mockResolvedValue([]);
    mockAnalyzeForEnhancements.mockResolvedValue([]);
    mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
    mockGenerate.mockResolvedValue({ success: true });

    // config のモック
    config.getGitHubToken = jest.fn().mockReturnValue('test-token');
    config.getGitHubRepository = jest.fn().mockReturnValue('owner/repo');
    config.getHomeDir = jest.fn().mockReturnValue('/home/test');
    config.getReposRoot = jest.fn().mockReturnValue('/tmp/ai-workflow-repos-68-07cff8cd');

    logger.info = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();

    // repositoryUtils.resolveLocalRepoPath のモック
    resolveLocalRepoPathMock.mockReset();
    resolveLocalRepoPathMock.mockReturnValue('/tmp/ai-workflow-repos-68-07cff8cd/ai-workflow-agent');

    // agent-setup のモック
    mockResolveAgentCredentials.mockReturnValue({
      codexApiKey: 'test-codex-key',
      claudeCredentialsPath: '/path/to/claude',
    } as any);
    mockSetupAgentClients.mockReturnValue({
      codexClient: {},
      claudeClient: {},
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
        expect.any(String),
        'auto',
        expect.objectContaining({ customInstruction: undefined }),
      );
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
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
        expect.any(String),
        'codex',
        expect.objectContaining({ customInstruction: undefined }),
      );
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

  describe('Custom instruction handling', () => {
    it('trims and forwards custom instruction to analyzer', async () => {
      mockAnalyzer.analyze.mockResolvedValue([]);

      await handleAutoIssueCommand({ customInstruction: '  重複関数を検出してください  ' });

      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
        expect.any(String),
        'auto',
        expect.objectContaining({ customInstruction: '重複関数を検出してください' }),
      );
    });

    it('throws when custom instruction includes dangerous pattern', async () => {
      await expect(
        handleAutoIssueCommand({ customInstruction: '古いファイルを削除してください' }),
      ).rejects.toThrow(/削除/);

      expect(mockAnalyzer.analyze).not.toHaveBeenCalled();
      expect(mockAnalyzeForRefactoring).not.toHaveBeenCalled();
      expect(mockAnalyzeForEnhancements).not.toHaveBeenCalled();
    });

    it('throws when custom instruction exceeds maximum length', async () => {
      const longInstruction = 'a'.repeat(501);

      await expect(handleAutoIssueCommand({ customInstruction: longInstruction })).rejects.toThrow(
        /500 characters/,
      );
    });

    it('passes custom instruction to refactor category', async () => {
      mockAnalyzeForRefactoring.mockResolvedValue([]);

      await handleAutoIssueCommand({
        category: 'refactor',
        customInstruction: '重複コードを重点的に検出してください',
      });

      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        expect.any(String),
        'auto',
        expect.objectContaining({ customInstruction: '重複コードを重点的に検出してください' }),
      );
    });

    it('passes custom instruction to enhancement category with creativeMode', async () => {
      mockAnalyzeForEnhancements.mockResolvedValue([]);

      await handleAutoIssueCommand({
        category: 'enhancement',
        customInstruction: 'CI/CD改善に焦点を当ててください',
        creativeMode: true,
      });

      expect(mockAnalyzeForEnhancements).toHaveBeenCalledWith(
        expect.any(String),
        'auto',
        expect.objectContaining({
          customInstruction: 'CI/CD改善に焦点を当ててください',
          creativeMode: true,
        }),
      );
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
      config.getGitHubRepository.mockReturnValue(null);

      // When & Then: エラーがスローされる
      await expect(handleAutoIssueCommand({})).rejects.toThrow(/GITHUB_REPOSITORY/);
    });
  });

  /**
   * Issue #153: Jenkins環境で対象リポジトリではなくワークスペースを解析してしまう問題の修正
   *
   * テスト対象: リポジトリパス解決ロジック
   */
  describe('Issue #153: Repository path resolution in Jenkins environment', () => {
    /**
     * UT-1-1: GITHUB_REPOSITORY が設定されている場合（正常系）
     *
     * 目的: GITHUB_REPOSITORY環境変数からowner/repoを正しく取得できることを検証
     */
    describe('UT-1-1: GITHUB_REPOSITORY is set correctly', () => {
      it('should extract owner and repo from GITHUB_REPOSITORY', async () => {
        // Given: GITHUB_REPOSITORY が tielec/reflection-cloud-api に設定されている
        config.getGitHubRepository.mockReturnValue('tielec/reflection-cloud-api');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockReturnValue('/tmp/ai-workflow-repos-12345/reflection-cloud-api');

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: resolveLocalRepoPath が "reflection-cloud-api" で呼び出される
        expect(repositoryUtils.resolveLocalRepoPath).toHaveBeenCalledWith('reflection-cloud-api');

        // And: RepositoryAnalyzer.analyze が正しいパスで呼び出される
        expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
          '/tmp/ai-workflow-repos-12345/reflection-cloud-api',
          'auto',
          expect.objectContaining({ customInstruction: undefined }),
        );
      });
    });

    /**
     * UT-1-2: GITHUB_REPOSITORY が未設定の場合（異常系）
     *
     * 目的: GITHUB_REPOSITORY環境変数が未設定の場合にエラーがスローされることを検証
     */
    describe('UT-1-2: GITHUB_REPOSITORY is not set', () => {
      it('should throw error with meaningful message', async () => {
        // Given: GITHUB_REPOSITORY が未設定
        config.getGitHubRepository.mockReturnValue(null);

        // When & Then: エラーがスローされる
        await expect(handleAutoIssueCommand({})).rejects.toThrow(
          'GITHUB_REPOSITORY environment variable is required.',
        );
      });
    });

    /**
     * UT-1-3: GITHUB_REPOSITORY の形式が不正な場合（異常系）
     *
     * 目的: GITHUB_REPOSITORYの形式がowner/repoでない場合にエラーがスローされることを検証
     */
    describe('UT-1-3: GITHUB_REPOSITORY has invalid format', () => {
      const invalidFormats = [
        { value: 'invalid-format', description: 'スラッシュなし' },
        { value: 'owner/', description: 'repo部分が空' },
        { value: '/repo', description: 'owner部分が空' },
        { value: '', description: '空文字列' },
      ];

      test.each(invalidFormats)(
        'should throw error when GITHUB_REPOSITORY is $description',
        async ({ value }) => {
          // Given: GITHUB_REPOSITORY が不正な形式
          config.getGitHubRepository.mockReturnValue(value);

          // When & Then: エラーがスローされる
          await expect(handleAutoIssueCommand({})).rejects.toThrow(/Invalid repository name/);
        },
      );
    });

    /**
     * UT-2-1: REPOS_ROOT が設定されている場合（正常系）
     *
     * 目的: REPOS_ROOTが設定されている場合、正しいパスが解決されることを検証
     */
    describe('UT-2-1: REPOS_ROOT is set', () => {
      it('should resolve repository path from REPOS_ROOT', async () => {
        // Given: REPOS_ROOT が設定されている
        config.getGitHubRepository.mockReturnValue('tielec/reflection-cloud-api');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockReturnValue('/tmp/ai-workflow-repos-12345/reflection-cloud-api');

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: resolveLocalRepoPath が呼び出される
        expect(repositoryUtils.resolveLocalRepoPath).toHaveBeenCalledWith('reflection-cloud-api');

        // And: 正しいパスが解決される
        expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
          '/tmp/ai-workflow-repos-12345/reflection-cloud-api',
          'auto',
          expect.objectContaining({ customInstruction: undefined }),
        );
      });
    });

    /**
     * UT-2-3: リポジトリが見つからない場合（異常系）
     *
     * 目的: リポジトリが見つからない場合に適切なエラーメッセージが表示されることを検証
     */
    describe('UT-2-3: Repository not found', () => {
      it('should throw error with helpful message when repository is not found', async () => {
        // Given: リポジトリが見つからない
        config.getGitHubRepository.mockReturnValue('tielec/non-existent-repo');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockImplementation(() => {
          throw new Error("Repository 'non-existent-repo' not found.");
        });

        // When & Then: エラーがスローされる
        await expect(handleAutoIssueCommand({})).rejects.toThrow(
          /Repository 'non-existent-repo' not found locally/,
        );

        // And: エラーメッセージに REPOS_ROOT 設定の提案が含まれる
        await expect(handleAutoIssueCommand({})).rejects.toThrow(/REPOS_ROOT/);
      });
    });

    /**
     * UT-4-1: 正常系のログ出力確認
     *
     * 目的: 正常系の実行時に期待されるログが正しく出力されることを検証
     */
    describe('UT-4-1: Log output in normal case', () => {
      it('should log correct repository information', async () => {
        // Given: 正常な環境変数設定
        config.getGitHubRepository.mockReturnValue('tielec/reflection-cloud-api');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockReturnValue('/tmp/ai-workflow-repos-12345/reflection-cloud-api');

        logger.info = jest.fn();

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: ログに正しい情報が出力される
        expect(logger.info).toHaveBeenCalledWith('GitHub repository: tielec/reflection-cloud-api');
        expect(logger.info).toHaveBeenCalledWith(
          'Resolved repository path: /tmp/ai-workflow-repos-12345/reflection-cloud-api',
        );
        expect(logger.info).toHaveBeenCalledWith('REPOS_ROOT: /tmp/ai-workflow-repos-12345');
        expect(logger.info).toHaveBeenCalledWith(
          'Analyzing repository: /tmp/ai-workflow-repos-12345/reflection-cloud-api',
        );
      });
    });

    /**
     * UT-4-2: REPOS_ROOT が未設定の場合のログ出力確認
     *
     * 目的: REPOS_ROOTが未設定の場合、ログに(not set)が表示されることを検証
     */
    describe('UT-4-2: Log output when REPOS_ROOT is not set', () => {
      it('should log "(not set)" when REPOS_ROOT is undefined', async () => {
        // Given: REPOS_ROOT が未設定
        config.getGitHubRepository.mockReturnValue('tielec/ai-workflow-agent');
        config.getReposRoot.mockReturnValue(null);

        resolveLocalRepoPathMock.mockReturnValue('/home/user/TIELEC/development/ai-workflow-agent');

        logger.info = jest.fn();

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: ログに "(not set)" が出力される
        expect(logger.info).toHaveBeenCalledWith('REPOS_ROOT: (not set)');
      });
    });

    /**
     * IT-1-1: Jenkins環境でのエンドツーエンドフロー（正常系）
     *
     * 目的: Jenkins環境でGITHUB_REPOSITORYからリポジトリパスを解決し、
     *       RepositoryAnalyzer.analyzeが正しいパスで呼び出されることを検証
     */
    describe('IT-1-1: End-to-end flow in Jenkins environment', () => {
      it('should resolve repository path and analyze correctly', async () => {
        // Given: Jenkins環境の設定
        config.getGitHubRepository.mockReturnValue('tielec/reflection-cloud-api');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockReturnValue('/tmp/ai-workflow-repos-12345/reflection-cloud-api');

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ agent: 'codex' });

        // Then: resolveLocalRepoPath が正しいパラメータで呼び出される
        expect(repositoryUtils.resolveLocalRepoPath).toHaveBeenCalledWith('reflection-cloud-api');

        // And: RepositoryAnalyzer.analyze が正しいパラメータで呼び出される
        expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
          '/tmp/ai-workflow-repos-12345/reflection-cloud-api',
          'codex',
          expect.objectContaining({ customInstruction: undefined }),
        );
      });
    });

    /**
     * IT-1-2: ローカル環境でのエンドツーエンドフロー（正常系）
     *
     * 目的: ローカル環境でREPOS_ROOT未設定の場合、フォールバック候補から
     *       リポジトリパスを解決し、解析が実行されることを検証
     */
    describe('IT-1-2: End-to-end flow in local environment', () => {
      it('should resolve repository path from fallback candidates', async () => {
        // Given: ローカル環境の設定（REPOS_ROOT未設定）
        config.getGitHubRepository.mockReturnValue('tielec/ai-workflow-agent');
        config.getReposRoot.mockReturnValue(null);

        resolveLocalRepoPathMock.mockReturnValue('/home/user/TIELEC/development/ai-workflow-agent');

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: フォールバック候補からリポジトリパスが解決される
        expect(repositoryUtils.resolveLocalRepoPath).toHaveBeenCalledWith('ai-workflow-agent');

        // And: RepositoryAnalyzer.analyze が正しいパラメータで呼び出される
        expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
          '/home/user/TIELEC/development/ai-workflow-agent',
          'auto',
          expect.objectContaining({ customInstruction: undefined }),
        );
      });
    });

    /**
     * IT-2-1: リポジトリが見つからない場合のエラーフロー（異常系）
     *
     * 目的: リポジトリが見つからない場合、適切なエラーメッセージが表示され、
     *       解析が実行されないことを検証
     */
    describe('IT-2-1: Error flow when repository is not found', () => {
      it('should display helpful error message and not execute analysis', async () => {
        // Given: リポジトリが見つからない環境
        config.getGitHubRepository.mockReturnValue('tielec/non-existent-repo');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockImplementation(() => {
          throw new Error(
            "Repository 'non-existent-repo' not found.\nPlease set REPOS_ROOT environment variable or clone the repository.",
          );
        });

        // When & Then: エラーがスローされる
        await expect(handleAutoIssueCommand({})).rejects.toThrow(
          /Repository 'non-existent-repo' not found locally/,
        );

        // And: エラーメッセージに REPOS_ROOT 設定の提案が含まれる
        await expect(handleAutoIssueCommand({})).rejects.toThrow(
          /Please ensure REPOS_ROOT is set correctly in Jenkins environment/,
        );

        // And: RepositoryAnalyzer.analyze が呼び出されない
        expect(mockAnalyzer.analyze).not.toHaveBeenCalled();
      });
    });

    /**
     * IT-2-2: GITHUB_REPOSITORY が不正な形式の場合のエラーフロー（異常系）
     *
     * 目的: GITHUB_REPOSITORYが不正な形式の場合、早期にエラーが発生し、
     *       解析が実行されないことを検証
     */
    describe('IT-2-2: Error flow when GITHUB_REPOSITORY has invalid format', () => {
      it('should throw error early without executing analysis', async () => {
        // Given: GITHUB_REPOSITORY が不正な形式
        config.getGitHubRepository.mockReturnValue('invalid-format');

        // When & Then: エラーがスローされる
        await expect(handleAutoIssueCommand({})).rejects.toThrow(
          'Invalid repository name: invalid-format',
        );

        // And: RepositoryAnalyzer.analyze が呼び出されない
        expect(mockAnalyzer.analyze).not.toHaveBeenCalled();
      });
    });

    /**
     * IT-3-1: Jenkins環境での動作確認
     *
     * 目的: Jenkins環境（REPOS_ROOT設定あり）で正しく動作することを検証
     */
    describe('IT-3-1: Verification in Jenkins environment', () => {
      it('should work correctly with REPOS_ROOT set', async () => {
        // Given: Jenkins環境を模擬
        config.getGitHubRepository.mockReturnValue('tielec/reflection-cloud-api');
        config.getReposRoot.mockReturnValue('/tmp/ai-workflow-repos-12345');

        resolveLocalRepoPathMock.mockReturnValue('/tmp/ai-workflow-repos-12345/reflection-cloud-api');

        logger.info = jest.fn();

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: REPOS_ROOT配下のリポジトリが解析される
        expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
          '/tmp/ai-workflow-repos-12345/reflection-cloud-api',
          'auto',
          expect.objectContaining({ customInstruction: undefined }),
        );

        // And: ログに REPOS_ROOT が出力される
        expect(logger.info).toHaveBeenCalledWith('REPOS_ROOT: /tmp/ai-workflow-repos-12345');
      });
    });

    /**
     * IT-3-2: ローカル環境での動作確認
     *
     * 目的: ローカル環境（REPOS_ROOT未設定）で既存動作が維持されることを検証
     */
    describe('IT-3-2: Verification in local environment', () => {
      it('should work correctly without REPOS_ROOT using fallback', async () => {
        // Given: ローカル環境を模擬（REPOS_ROOT未設定）
        config.getGitHubRepository.mockReturnValue('tielec/ai-workflow-agent');
        config.getReposRoot.mockReturnValue(null);

        resolveLocalRepoPathMock.mockReturnValue('/home/user/TIELEC/development/ai-workflow-agent');

        logger.info = jest.fn();

        mockAnalyzer.analyze.mockResolvedValue([]);

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({});

        // Then: フォールバック候補からリポジトリパスが解決される
        expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
          '/home/user/TIELEC/development/ai-workflow-agent',
          'auto',
          expect.objectContaining({ customInstruction: undefined }),
        );

        // And: ログに "(not set)" が出力される
        expect(logger.info).toHaveBeenCalledWith('REPOS_ROOT: (not set)');
      });
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
        mockSetupAgentClients.mockReturnValue({
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

      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);

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

      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);

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
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);

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

  /**
   * Issue #144: 言語サポートの汎用化に関するテスト
   *
   * テスト対象: validateBugCandidate() の言語制限撤廃と除外パターン
   */
  describe('Issue #144: Multi-language support and exclusion patterns', () => {
    /**
     * TC-LANG-001: Go言語ファイルが検証を通過する（正常系）
     *
     * 目的: 言語制限撤廃後、Go言語（.go）ファイルがバリデーションを通過することを検証
     */
    describe('TC-LANG-001: Go language file validation', () => {
      it('should accept Go language files (.go)', async () => {
        // Given: Go言語ファイルのバグ候補
        const goCandidates = [
          {
            title: 'Nil pointer dereference in GetUser function',
            file: 'src/services/user-service.go',
            line: 42,
            severity: 'high' as const,
            description:
              'GetUser()メソッドでnilポインタデリファレンスが発生する可能性があります。ユーザーが存在しない場合、nilチェックなしでポインタを参照しています。',
            suggestedFix: 'nilチェックを追加し、エラーハンドリングを実装してください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(goCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          issueNumber: 1,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Go言語ファイルが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'src/services/user-service.go',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-002: Java言語ファイルが検証を通過する（正常系）
     *
     * 目的: Java言語（.java）ファイルがバリデーションを通過することを検証
     */
    describe('TC-LANG-002: Java language file validation', () => {
      it('should accept Java language files (.java)', async () => {
        // Given: Java言語ファイルのバグ候補
        const javaCandidates = [
          {
            title: 'Unclosed resource in FileReader implementation',
            file: 'src/main/java/com/example/FileProcessor.java',
            line: 85,
            severity: 'medium' as const,
            description:
              'FileReaderがtry-with-resources構文で管理されておらず、リソースリークの可能性があります。',
            suggestedFix: 'try-with-resources構文を使用してFileReaderを自動的にクローズしてください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(javaCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/2',
          issueNumber: 2,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Java言語ファイルが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'src/main/java/com/example/FileProcessor.java',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-003: Ruby言語ファイルが検証を通過する（正常系）
     *
     * 目的: Ruby言語（.rb）ファイルがバリデーションを通過することを検証
     */
    describe('TC-LANG-003: Ruby language file validation', () => {
      it('should accept Ruby language files (.rb)', async () => {
        // Given: Ruby言語ファイルのバグ候補
        const rubyCandidates = [
          {
            title: 'Exception not rescued in process_data method',
            file: 'lib/data_processor.rb',
            line: 23,
            severity: 'high' as const,
            description:
              'process_data()メソッドで例外がrescueされておらず、エラーハンドリングが不足しています。',
            suggestedFix: 'begin-rescueブロックを追加し、適切なエラーハンドリングを実装してください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(rubyCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/3',
          issueNumber: 3,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Ruby言語ファイルが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'lib/data_processor.rb',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-004: Groovy言語ファイルが検証を通過する（正常系）
     *
     * 目的: Groovy言語（.groovy）ファイルがバリデーションを通過することを検証
     */
    describe('TC-LANG-004: Groovy language file validation', () => {
      it('should accept Groovy language files (.groovy)', async () => {
        // Given: Groovy言語ファイルのバグ候補
        const groovyCandidates = [
          {
            title: 'Command injection in executeShell method',
            file: 'scripts/deployment.groovy',
            line: 67,
            severity: 'high' as const,
            description:
              'executeShell()でユーザー入力が直接シェルコマンドに渡されており、コマンドインジェクションの可能性があります。',
            suggestedFix: '入力をサニタイズし、パラメータ化されたコマンド実行を使用してください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(groovyCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/4',
          issueNumber: 4,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Groovy言語ファイルが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'scripts/deployment.groovy',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-005: Jenkinsfile（拡張子なし）が検証を通過する（正常系）
     *
     * 目的: 拡張子のないCI/CD設定ファイル（Jenkinsfile）がバリデーションを通過することを検証
     */
    describe('TC-LANG-005: Jenkinsfile validation', () => {
      it('should accept Jenkinsfile (extensionless file)', async () => {
        // Given: Jenkinsfileのバグ候補
        const jenkinsfileCandidates = [
          {
            title: 'Hardcoded credential in pipeline configuration',
            file: 'Jenkinsfile',
            line: 12,
            severity: 'high' as const,
            description:
              'パイプライン定義でクレデンシャルがハードコードされており、セキュリティリスクがあります。',
            suggestedFix:
              'Jenkins Credentials Pluginを使用して、クレデンシャルを安全に管理してください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(jenkinsfileCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/5',
          issueNumber: 5,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Jenkinsfileが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'Jenkinsfile',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-006: Dockerfile（拡張子なし）が検証を通過する（正常系）
     *
     * 目的: Dockerfileがバリデーションを通過することを検証
     */
    describe('TC-LANG-006: Dockerfile validation', () => {
      it('should accept Dockerfile (extensionless file)', async () => {
        // Given: Dockerfileのバグ候補
        const dockerfileCandidates = [
          {
            title: 'Root user in production Docker image',
            file: 'Dockerfile',
            line: 8,
            severity: 'medium' as const,
            description:
              '本番環境イメージでrootユーザーが使用されており、セキュリティリスクがあります。',
            suggestedFix: '非特権ユーザーを作成し、USERディレクティブで切り替えてください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(dockerfileCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/6',
          issueNumber: 6,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Dockerfileが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'Dockerfile',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-007: TypeScriptファイルが引き続き検証を通過する（回帰テスト）
     *
     * 目的: 言語制限撤廃後も、既存のTypeScriptファイルが正しく検証を通過することを確認
     */
    describe('TC-LANG-007: TypeScript regression test', () => {
      it('should still accept TypeScript files (.ts)', async () => {
        // Given: TypeScriptファイルのバグ候補
        const tsCandidates = [
          {
            title: 'Unhandled promise rejection in fetchData method',
            file: 'src/services/api-client.ts',
            line: 34,
            severity: 'high' as const,
            description:
              'fetchData()メソッドでPromiseの拒否が適切にハンドリングされておらず、エラーがキャッチされません。',
            suggestedFix: 'async/awaitを使用し、try-catchブロックでエラーをハンドリングしてください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(tsCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/7',
          issueNumber: 7,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: TypeScriptファイルが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'src/services/api-client.ts',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-LANG-008: Pythonファイルが引き続き検証を通過する（回帰テスト）
     *
     * 目的: 言語制限撤廃後も、既存のPythonファイルが正しく検証を通過することを確認
     */
    describe('TC-LANG-008: Python regression test', () => {
      it('should still accept Python files (.py)', async () => {
        // Given: Pythonファイルのバグ候補
        const pyCandidates = [
          {
            title: 'File handle not closed in read_config function',
            file: 'src/utils/config_loader.py',
            line: 19,
            severity: 'medium' as const,
            description:
              'read_config()でファイルハンドルがクローズされておらず、リソースリークの可能性があります。',
            suggestedFix: 'with文を使用して、ファイルハンドルを自動的にクローズしてください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(pyCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/8',
          issueNumber: 8,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: Pythonファイルが正常に処理される
        expect(mockGenerator.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: 'src/utils/config_loader.py',
          }),
          expect.any(String),
          false,
        );
      });
    });

    /**
     * TC-EXCL-001: 複数言語のファイルが同時に処理される（統合テスト）
     *
     * 目的: TypeScript, Python, Go, Java, Rubyのファイルが同時に処理されることを検証
     */
    describe('TC-EXCL-001: Multi-language integration test', () => {
      it('should process multiple languages simultaneously', async () => {
        // Given: 複数言語のバグ候補
        const multiLangCandidates = [
          {
            title: 'TypeScript bug with minimum length',
            file: 'src/services/api.ts',
            line: 10,
            severity: 'high' as const,
            description:
              'TypeScriptファイルのバグです。このバグは重要な問題を引き起こす可能性があります。',
            suggestedFix: '適切な修正を適用してください。',
            category: 'bug' as const,
          },
          {
            title: 'Python bug with minimum length',
            file: 'src/utils/helper.py',
            line: 20,
            severity: 'medium' as const,
            description:
              'Pythonファイルのバグです。このバグは中程度の問題を引き起こす可能性があります。',
            suggestedFix: '適切な修正を適用してください。',
            category: 'bug' as const,
          },
          {
            title: 'Go bug with minimum length',
            file: 'pkg/service/user.go',
            line: 30,
            severity: 'low' as const,
            description: 'Goファイルのバグです。このバグは軽微な問題を引き起こす可能性があります。',
            suggestedFix: '適切な修正を適用してください。',
            category: 'bug' as const,
          },
          {
            title: 'Java bug with minimum length',
            file: 'src/main/java/App.java',
            line: 40,
            severity: 'high' as const,
            description:
              'Javaファイルのバグです。このバグは重要な問題を引き起こす可能性があります。',
            suggestedFix: '適切な修正を適用してください。',
            category: 'bug' as const,
          },
          {
            title: 'Ruby bug with minimum length',
            file: 'lib/processor.rb',
            line: 50,
            severity: 'medium' as const,
            description:
              'Rubyファイルのバグです。このバグは中程度の問題を引き起こす可能性があります。',
            suggestedFix: '適切な修正を適用してください。',
            category: 'bug' as const,
          },
        ];

        mockAnalyzer.analyze.mockResolvedValue(multiLangCandidates);
        mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
        mockGenerator.generate.mockResolvedValue({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/999',
          issueNumber: 999,
        });

        // When: handleAutoIssueCommand を実行
        await handleAutoIssueCommand({ dryRun: false });

        // Then: すべての言語のファイルが処理される
        expect(mockGenerator.generate).toHaveBeenCalledTimes(5);
      });
    });
  });

  /**
   * Issue #257: --output-file オプションとJSON出力
   */
  describe('Issue #257: JSON output option', () => {
    it('should resolve output file path and invoke JSON writer when option is provided', async () => {
      const outputRelativePath = './tmp/auto-issue/result.json';
      const expectedPath = path.resolve(process.cwd(), outputRelativePath);

      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as AutoIssueOptions['category'],
          dryRun: true,
        },
        summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        issues: [],
      };

      const buildSpy = jest.mocked(autoIssueOutput.buildAutoIssueJsonPayload);
      const writeSpy = jest.mocked(autoIssueOutput.writeAutoIssueOutputFile);
      buildSpy.mockReturnValue(payload as any);
      writeSpy.mockResolvedValue(undefined);

      await handleAutoIssueCommand({
        outputFile: outputRelativePath,
        dryRun: true,
      });

      expect(buildSpy).toHaveBeenCalledWith({
        execution: expect.objectContaining({
          repository: 'owner/repo',
          category: 'bug',
          dryRun: true,
        }),
        results: [],
      });
      expect(writeSpy).toHaveBeenCalledWith(expectedPath, payload);
    });

    it('should throw when output file option is blank', async () => {
      await expect(
        handleAutoIssueCommand({
          outputFile: '   ',
        }),
      ).rejects.toThrow('output-file must not be empty.');
    });

    it('should propagate JSON write errors so the CLI fails loudly', async () => {
      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as AutoIssueOptions['category'],
          dryRun: false,
        },
        summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        issues: [],
      };

      const buildSpy = jest.mocked(autoIssueOutput.buildAutoIssueJsonPayload);
      const writeSpy = jest.mocked(autoIssueOutput.writeAutoIssueOutputFile);
      buildSpy.mockReturnValue(payload as any);
      writeSpy.mockRejectedValue(new Error('disk full'));

      await expect(
        handleAutoIssueCommand({
          outputFile: './tmp/auto-issue/error.json',
          dryRun: false,
        }),
      ).rejects.toThrow('disk full');
    });

    /**
     * TC-CLI-257-004: parseOptions_outputFile_正常系_絶対パス変換
     *
     * 目的: 相対パスから絶対パスへの変換が正しく行われることを検証
     */
    it('should resolve relative output file path to absolute path', async () => {
      const outputRelativePath = 'results/auto-issue-report.json';
      const expectedPath = path.resolve(process.cwd(), outputRelativePath);

      const buildSpy = jest.mocked(autoIssueOutput.buildAutoIssueJsonPayload);
      const writeSpy = jest.mocked(autoIssueOutput.writeAutoIssueOutputFile);
      buildSpy.mockReturnValue({
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as AutoIssueOptions['category'],
          dryRun: true,
        },
        summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        issues: [],
      } as any);
      writeSpy.mockResolvedValue(undefined);

      await handleAutoIssueCommand({
        outputFile: outputRelativePath,
        dryRun: true,
      });

      // path.resolve が呼ばれ、絶対パスに変換されていることを確認
      expect(writeSpy).toHaveBeenCalledWith(expectedPath, expect.any(Object));
      expect(expectedPath.startsWith('/')).toBe(true);
    });

    /**
     * TC-CLI-257-005: parseOptions_outputFile_正常系_ログ出力
     *
     * 目的: outputFile オプション指定時にログに出力されることを検証
     */
    it('should log output file path when option is provided', async () => {
      logger.info = jest.fn();

      const outputRelativePath = './tmp/results.json';

      const buildSpy = jest.mocked(autoIssueOutput.buildAutoIssueJsonPayload);
      const writeSpy = jest.mocked(autoIssueOutput.writeAutoIssueOutputFile);
      buildSpy.mockReturnValue({
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as AutoIssueOptions['category'],
          dryRun: true,
        },
        summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        issues: [],
      } as any);
      writeSpy.mockResolvedValue(undefined);

      await handleAutoIssueCommand({
        outputFile: outputRelativePath,
        dryRun: true,
      });

      // Options ログに outputFile が含まれることを確認
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('outputFile='),
      );
    });

    /**
     * TC-CLI-257-006: handleAutoIssueCommand_正常系_outputFile未指定
     *
     * 目的: outputFile 未指定時は JSON 出力を行わないことを検証
     */
    it('should skip JSON output when outputFile is not specified', async () => {
      mockAnalyzer.analyze.mockResolvedValue([]);

      const buildSpy = jest.mocked(autoIssueOutput.buildAutoIssueJsonPayload);
      const writeSpy = jest.mocked(autoIssueOutput.writeAutoIssueOutputFile);

      await handleAutoIssueCommand({
        dryRun: true,
      });

      // JSON 出力が行われない
      expect(buildSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    /**
     * TC-CLI-257-007: handleAutoIssueCommand_正常系_結果付きJSON出力
     *
     * 目的: Issue作成結果がJSON出力に含まれることを検証
     */
    it('should include issue results in JSON output', async () => {
      const candidate = {
        title: 'Bug fix test with proper title',
        file: 'test.ts',
        line: 1,
        severity: 'high' as const,
        description: 'Test description with enough characters for validation to pass.',
        suggestedFix: 'Test fix suggestion',
        category: 'bug' as const,
      };

      mockAnalyzer.analyze.mockResolvedValue([candidate]);
      mockDeduplicator.filterDuplicates.mockImplementation(async (candidates: any) => candidates);
      mockGenerator.generate.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/100',
        issueNumber: 100,
        title: 'Bug fix test with proper title',
      });

      const buildSpy = jest.mocked(autoIssueOutput.buildAutoIssueJsonPayload);
      const writeSpy = jest.mocked(autoIssueOutput.writeAutoIssueOutputFile);
      buildSpy.mockReturnValue({
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as AutoIssueOptions['category'],
          dryRun: false,
        },
        summary: { total: 1, success: 1, failed: 0, skipped: 0 },
        issues: [{
          success: true,
          title: 'Bug fix test with proper title',
          issueNumber: 100,
          issueUrl: 'https://github.com/owner/repo/issues/100',
        }],
      } as any);
      writeSpy.mockResolvedValue(undefined);

      await handleAutoIssueCommand({
        outputFile: './results.json',
        dryRun: false,
      });

      expect(buildSpy).toHaveBeenCalledWith({
        execution: expect.objectContaining({
          repository: 'owner/repo',
          category: 'bug',
          dryRun: false,
        }),
        results: [
          expect.objectContaining({
            success: true,
            issueNumber: 100,
            issueUrl: 'https://github.com/owner/repo/issues/100',
          }),
        ],
      });
    });
  });
});
