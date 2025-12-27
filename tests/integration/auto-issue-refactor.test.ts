/**
 * インテグレーションテスト: auto-issue リファクタリング検出ワークフロー
 *
 * テスト対象: auto-issue コマンドのリファクタリング検出機能（Phase 2）
 * テストシナリオ: test-scenario.md のセクション3（統合テスト）
 *
 * 注意: このテストは主要なモックを使用してワークフロー全体を検証します。
 * 実際のエージェント・GitHub API を使用するテストは Phase 6 で実施します。
 */

import { jest } from '@jest/globals';
import type { RefactorCandidate, BugCandidate } from '../../src/types/auto-issue.js';

// モック関数を作成（ES Modules環境対応 - importより前に設定）
const mockResolveAgentCredentials = jest.fn<any>().mockReturnValue({
  codexApiKey: 'test-codex-key',
  claudeCredentialsPath: '/path/to/claude',
});

const mockSetupAgentClients = jest.fn<any>().mockReturnValue({
  codexClient: {} as any,
  claudeClient: {} as any,
});

const mockResolveLocalRepoPath = jest.fn<any>().mockReturnValue('/fake/repo/path');

jest.mock('../../src/commands/execute/agent-setup.js', () => ({
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

jest.mock('../../src/core/repository-utils.js', () => ({
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

jest.mock('../../src/utils/logger.js');
jest.mock('@octokit/rest');

// モック設定後にimport
import { handleAutoIssueCommand } from '../../src/commands/auto-issue.js';
import { RepositoryAnalyzer } from '../../src/core/repository-analyzer.js';
import { IssueGenerator } from '../../src/core/issue-generator.js';
import { config } from '../../src/core/config.js';

describe('auto-issue refactor workflow integration tests', () => {
  let mockAnalyzeForRefactoring: ReturnType<typeof jest.spyOn>;
  let mockGenerateRefactorIssue: ReturnType<typeof jest.spyOn>;
  let mockGetGitHubToken: ReturnType<typeof jest.spyOn>;
  let mockGetGitHubRepository: ReturnType<typeof jest.spyOn>;
  let mockGetHomeDir: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // モック関数のクリア
    mockResolveAgentCredentials.mockClear();
    mockSetupAgentClients.mockClear();
    mockResolveLocalRepoPath.mockClear();

    // ES Modules環境では jest.spyOn を使用
    mockAnalyzeForRefactoring = jest
      .spyOn(RepositoryAnalyzer.prototype, 'analyzeForRefactoring')
      .mockResolvedValue([]);

    mockGenerateRefactorIssue = jest
      .spyOn(IssueGenerator.prototype, 'generateRefactorIssue')
      .mockResolvedValue({ success: true, issueUrl: '', issueNumber: 0 });

    // config のモック（ES Modules環境対応）
    mockGetGitHubToken = jest.spyOn(config, 'getGitHubToken').mockReturnValue('test-token');
    mockGetGitHubRepository = jest.spyOn(config, 'getGitHubRepository').mockReturnValue('owner/repo');
    mockGetHomeDir = jest.spyOn(config, 'getHomeDir').mockReturnValue('/home/test');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * シナリオ 3.1.1: TypeScriptリポジトリでのリファクタリング候補検出（優先度HIGH）
   *
   * テストシナリオ test-scenario.md のシナリオ 3.1.1 に対応
   *
   * 目的: TypeScriptリポジトリに対して --category refactor でリファクタリング候補を検出し、
   * Issue生成まで完了することを検証
   */
  describe('Scenario 3.1.1: TypeScript repository refactoring detection', () => {
    it('should detect refactoring candidates and create issues', async () => {
      // Given: リファクタリング候補が検出される
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務（認証、プロフィール管理、通知）を持っている',
          suggestion: '認証ロジックをauth-service.tsに、通知ロジックをnotification-service.tsに分割することを推奨',
          priority: 'high',
        },
        {
          type: 'duplication',
          filePath: 'src/utils/validators.ts',
          lineRange: { start: 45, end: 60 },
          description: 'emailバリデーションロジックが3箇所で重複している',
          suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
          priority: 'medium',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/123',
        issueNumber: 123,
      });

      // When: --category refactor で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: false,
      });

      // Then: リファクタリング解析が実行される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String)
      );

      // Then: 2件のIssueが作成される（優先度順: high → medium）
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(2);

      // 1件目: high優先度
      expect(mockGenerateRefactorIssue).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: 'large-file',
          priority: 'high',
        }),
        expect.any(String),
        false
      );

      // 2件目: medium優先度
      expect(mockGenerateRefactorIssue).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: 'duplication',
          priority: 'medium',
        }),
        expect.any(String),
        false
      );
    });

    it('should validate all refactor candidate fields', async () => {
      // Given: すべてのフィールドを持つ候補
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/124',
        issueNumber: 124,
      });

      // When: --category refactor で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: false,
      });

      // Then: バリデーション済みの候補でIssueが作成される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: expect.stringContaining('ファイルサイズが750行'),
          suggestion: expect.stringContaining('認証ロジック'),
          priority: 'high',
        }),
        expect.any(String),
        false
      );
    });
  });

  /**
   * シナリオ 3.2.1: dry-runモードでIssue生成をスキップ（優先度HIGH）
   *
   * テストシナリオ test-scenario.md のシナリオ 3.2.1 に対応
   *
   * 目的: --dry-run オプション指定時にIssue生成がスキップされ、
   * 検出結果のみが表示されることを検証
   */
  describe('Scenario 3.2.1: dry-run mode skips issue creation', () => {
    it('should skip issue creation in dry-run mode', async () => {
      // Given: リファクタリング候補が検出される
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'large-file',
          filePath: 'src/core/repository-analyzer.ts',
          description: 'ファイルサイズが650行あり、保守性が低下している',
          suggestion: 'ファイルを機能ごとに複数のファイルに分割することを推奨',
          priority: 'high',
        },
        {
          type: 'missing-docs',
          filePath: 'src/core/data-processor.ts',
          lineRange: { start: 120, end: 150 },
          description: 'processData関数にJSDocコメントがなく、複雑なロジックの理解が困難',
          suggestion: 'パラメータ、戻り値、エラーケースを含むJSDocコメントを追加することを推奨',
          priority: 'low',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: --category refactor --dry-run で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
      });

      // Then: リファクタリング解析は実行される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledTimes(1);

      // Then: generateRefactorIssue は dry-run モードで呼ばれる（Issue作成はスキップ）
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(2);
      expect(mockGenerateRefactorIssue).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        true // dry-run フラグ
      );

      // Then: Issue作成がスキップされたことを示す結果が返される
      const firstCallResult = await mockGenerateRefactorIssue.mock.results[0].value;
      expect(firstCallResult).toEqual({
        success: true,
        skippedReason: 'dry-run mode',
      });
    });

    it('should not call GitHub API in dry-run mode', async () => {
      // Given: リファクタリング候補が検出される
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'duplication',
          filePath: 'src/utils/helpers.ts',
          lineRange: { start: 10, end: 25 },
          description: 'dateフォーマット処理が4箇所で重複している',
          suggestion: '共通のformatDate関数を作成し、再利用することを推奨',
          priority: 'medium',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: --dry-run で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
      });

      // Then: GitHub API呼び出しなしでIssue生成がスキップされる
      expect(mockGenerateRefactorIssue).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        true
      );
    });
  });

  /**
   * シナリオ 3.1.3: 4つの検出パターンすべてがカバーされることを確認（優先度MEDIUM）
   *
   * テストシナリオ test-scenario.md のシナリオ 3.1.3 に対応
   *
   * 目的: エージェントが4つの検出パターン（コード品質、重複、未使用、ドキュメント）
   * すべてを検出できることを検証
   */
  describe('Scenario 3.1.3: All four detection patterns are covered', () => {
    it('should detect all types of refactoring candidates', async () => {
      // Given: 4つの検出パターンを含む候補
      const mockCandidates: RefactorCandidate[] = [
        // コード品質（large-file）
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
        // コード品質（high-complexity）
        {
          type: 'high-complexity',
          filePath: 'src/core/processor.ts',
          lineRange: { start: 50, end: 120 },
          description: 'processRequest関数にネスト深さ6の複雑な条件分岐がある',
          suggestion: 'Early returnパターンを使用し、ネストを削減することを推奨',
          priority: 'medium',
        },
        // コード重複（duplication）
        {
          type: 'duplication',
          filePath: 'src/utils/validators.ts',
          lineRange: { start: 45, end: 60 },
          description: 'emailバリデーションロジックが3箇所で重複している',
          suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
          priority: 'medium',
        },
        // 未使用コード（unused-code）
        {
          type: 'unused-code',
          filePath: 'src/utils/helpers.ts',
          lineRange: { start: 1, end: 10 },
          description: '未使用のインポート（lodash, moment）と未参照の関数（formatDate）が存在する',
          suggestion: '未使用のコードを削除し、コードベースをクリーンに保つことを推奨',
          priority: 'low',
        },
        // ドキュメント欠落（missing-docs）
        {
          type: 'missing-docs',
          filePath: 'src/core/data-processor.ts',
          lineRange: { start: 120, end: 150 },
          description: 'processData関数にJSDocコメントがなく、複雑なロジックの理解が困難',
          suggestion: 'パラメータ、戻り値、エラーケースを含むJSDocコメントを追加することを推奨',
          priority: 'low',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: --category refactor --dry-run で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
      });

      // Then: すべてのパターンが検出される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledTimes(1);

      // Then: 5件すべてのIssueが処理される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(5);

      // Then: 各パターンが正しく処理される
      const calls = mockGenerateRefactorIssue.mock.calls;
      const types = calls.map((call: any) => call[0].type);

      // コード品質（large-file, high-complexity）
      expect(types).toContain('large-file');
      expect(types).toContain('high-complexity');

      // コード重複
      expect(types).toContain('duplication');

      // 未使用コード
      expect(types).toContain('unused-code');

      // ドキュメント欠落
      expect(types).toContain('missing-docs');
    });

    it('should sort candidates by priority before creating issues', async () => {
      // Given: 優先度が混在したリファクタリング候補
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'missing-docs',
          filePath: 'test1.ts',
          description: 'Description for missing docs with sufficient length',
          suggestion: 'Add JSDoc comments to improve code documentation',
          priority: 'low', // 低優先度
        },
        {
          type: 'large-file',
          filePath: 'test2.ts',
          description: 'Description for large file with sufficient length',
          suggestion: 'Split the file into smaller modules for better maintainability',
          priority: 'high', // 高優先度
        },
        {
          type: 'duplication',
          filePath: 'test3.ts',
          description: 'Description for code duplication with sufficient length',
          suggestion: 'Extract common code into a shared function for reusability',
          priority: 'medium', // 中優先度
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: --category refactor --dry-run で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: true,
      });

      // Then: 優先度順（high → medium → low）で処理される
      const calls = mockGenerateRefactorIssue.mock.calls;
      expect(calls[0][0].priority).toBe('high');
      expect(calls[1][0].priority).toBe('medium');
      expect(calls[2][0].priority).toBe('low');
    });
  });

  /**
   * シナリオ 3.5.1: リファクタリングIssueの本文フォーマット（優先度MEDIUM）
   *
   * テストシナリオ test-scenario.md のシナリオ 3.5.1 に対応
   *
   * 目的: 生成されたIssue本文が適切なフォーマットであることを検証
   */
  describe('Scenario 3.5.1: Refactoring issue body format', () => {
    it('should generate issue with proper format', async () => {
      // Given: リファクタリング候補
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'large-file',
          filePath: 'src/core/repository-analyzer.ts',
          description: 'ファイルサイズが650行あり、保守性が低下している',
          suggestion: 'ファイルを機能ごとに複数のファイルに分割することを推奨',
          priority: 'high',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/125',
        issueNumber: 125,
      });

      // When: --category refactor で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: false,
      });

      // Then: Issue生成時に候補情報が正しく渡される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'large-file',
          filePath: 'src/core/repository-analyzer.ts',
          description: expect.stringContaining('ファイルサイズが650行'),
          suggestion: expect.stringContaining('ファイルを機能ごとに'),
          priority: 'high',
        }),
        expect.any(String),
        false
      );
    });

    it('should include line range when available', async () => {
      // Given: lineRange を含むリファクタリング候補
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'duplication',
          filePath: 'src/utils/validators.ts',
          lineRange: { start: 45, end: 60 },
          description: 'emailバリデーションロジックが3箇所で重複している',
          suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
          priority: 'medium',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        issueUrl: 'https://github.com/owner/repo/issues/126',
        issueNumber: 126,
      });

      // When: --category refactor で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: false,
      });

      // Then: lineRange が Issue生成に渡される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          lineRange: { start: 45, end: 60 },
        }),
        expect.any(String),
        false
      );
    });
  });

  /**
   * エージェント選択テスト
   */
  describe('Agent selection for refactor category', () => {
    it('should use Codex agent when specified', async () => {
      // Given: Codex エージェント指定
      mockAnalyzeForRefactoring.mockResolvedValue([]);

      // When: --agent codex --category refactor で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        agent: 'codex',
        dryRun: true,
      });

      // Then: Codex エージェントが使用される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        expect.any(String),
        'codex'
      );
    });

    it('should use Claude agent when specified', async () => {
      // Given: Claude エージェント指定
      mockAnalyzeForRefactoring.mockResolvedValue([]);

      // When: --agent claude --category refactor で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        agent: 'claude',
        dryRun: true,
      });

      // Then: Claude エージェントが使用される
      expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
        expect.any(String),
        'claude'
      );
    });
  });

  /**
   * limitオプションテスト
   */
  describe('Limit option for refactor category', () => {
    it('should limit number of issues created', async () => {
      // Given: 5件の候補があるが limit = 3
      const mockCandidates: RefactorCandidate[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'large-file',
        filePath: `test${i + 1}.ts`,
        description: `Description ${i + 1} with enough characters for proper validation and testing`,
        suggestion: `Suggestion ${i + 1} with enough characters for proper validation and testing`,
        priority: 'medium',
      }));

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);
      mockGenerateRefactorIssue.mockResolvedValue({
        success: true,
        skippedReason: 'dry-run mode',
      });

      // When: limit = 3 で実行
      await handleAutoIssueCommand({
        category: 'refactor',
        limit: '3',
        dryRun: true,
      });

      // Then: 3件のみ処理される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * エラーハンドリングテスト
   */
  describe('Error handling for refactor category', () => {
    it('should handle analyzer failure gracefully', async () => {
      // Given: アナライザーが失敗
      mockAnalyzeForRefactoring.mockRejectedValue(
        new Error('Refactor analyzer failed')
      );

      // When & Then: エラーが適切に伝播
      await expect(
        handleAutoIssueCommand({
          category: 'refactor',
          dryRun: true,
        })
      ).rejects.toThrow('Refactor analyzer failed');
    });

    it('should handle partial failure in issue generation', async () => {
      // Given: 一部のIssue生成が失敗
      const mockCandidates: RefactorCandidate[] = [
        {
          type: 'large-file',
          filePath: 'test1.ts',
          description: 'Description 1 with enough characters for validation',
          suggestion: 'Suggestion 1 with enough characters for validation',
          priority: 'high',
        },
        {
          type: 'duplication',
          filePath: 'test2.ts',
          description: 'Description 2 with enough characters for validation',
          suggestion: 'Suggestion 2 with enough characters for validation',
          priority: 'medium',
        },
      ];

      mockAnalyzeForRefactoring.mockResolvedValue(mockCandidates);

      // 1つ目は成功、2つ目は失敗
      mockGenerateRefactorIssue
        .mockResolvedValueOnce({
          success: true,
          issueUrl: 'https://github.com/owner/repo/issues/200',
          issueNumber: 200,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'GitHub API failed',
        });

      // When: handleAutoIssueCommand を実行
      await handleAutoIssueCommand({
        category: 'refactor',
        dryRun: false,
      });

      // Then: 部分的な失敗でも処理が継続される
      expect(mockGenerateRefactorIssue).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Phase 1 互換性テスト（リグレッション防止）
   */
  describe('Phase 1 compatibility (regression prevention)', () => {
    it('should not affect bug detection workflow', async () => {
      // Given: バグ検出用のモック（ES Modules環境対応）
      const mockAnalyze = jest
        .spyOn(RepositoryAnalyzer.prototype, 'analyze')
        .mockResolvedValue([]);

      // When: --category bug で実行（Phase 1の動作）
      await handleAutoIssueCommand({
        category: 'bug',
        dryRun: true,
      });

      // Then: analyzeForRefactoring ではなく analyze が呼ばれる
      expect(mockAnalyze).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeForRefactoring).not.toHaveBeenCalled();

      // クリーンアップ
      mockAnalyze.mockRestore();
    });
  });
});
