/**
 * ユニットテスト: RepositoryAnalyzer
 *
 * テスト対象: src/core/repository-analyzer.ts
 * テストシナリオ: test-scenario.md の TC-RA-001 〜 TC-RA-010
 */

import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import type { BugCandidate } from '../../../src/types/auto-issue.js';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../../src/core/codex-agent-client.js');
jest.mock('../../../src/core/claude-agent-client.js');
jest.mock('../../../src/utils/logger.js');

describe('RepositoryAnalyzer', () => {
  let mockCodexClient: jest.Mocked<CodexAgentClient>;
  let mockClaudeClient: jest.Mocked<ClaudeAgentClient>;
  let analyzer: RepositoryAnalyzer;

  beforeEach(() => {
    // Codex クライアントのモック
    mockCodexClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<CodexAgentClient>;

    // Claude クライアントのモック
    mockClaudeClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAgentClient>;

    // RepositoryAnalyzer インスタンス作成
    analyzer = new RepositoryAnalyzer(mockCodexClient, mockClaudeClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC-RA-001: analyze_正常系_Codexエージェント使用
   *
   * 目的: Codexエージェントを使用してバグ候補を正しく検出できることを検証
   */
  describe('TC-RA-001: analyze with Codex agent', () => {
    it('should detect bug candidates using Codex agent', async () => {
      // Given: Codex クライアントが正常な JSON 出力を返す
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'エラーハンドリングの欠如',
            file: 'src/core/codex-agent-client.ts',
            line: 42,
            severity: 'high',
            description: 'executeTask()メソッドでエラーハンドリングが不足しています。APIコールの失敗時に適切なエラー処理が行われていません。',
            suggestedFix: 'try-catchブロックを追加して、エラーを適切にハンドリングしてください。',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バグ候補が返される
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('エラーハンドリングの欠如');
      expect(result[0].file).toBe('src/core/codex-agent-client.ts');
      expect(result[0].severity).toBe('high');
      expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-RA-002: analyze_正常系_Claudeエージェント使用
   *
   * 目的: Claudeエージェントを使用してバグ候補を正しく検出できることを検証
   */
  describe('TC-RA-002: analyze with Claude agent', () => {
    it('should detect bug candidates using Claude agent', async () => {
      // Given: Claude クライアントが正常な JSON 出力を返す
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: '型安全性の問題',
            file: 'src/types/auto-issue.ts',
            line: 10,
            severity: 'medium',
            description: 'any型が過度に使用されています。'.repeat(3), // 50文字以上
            suggestedFix: '具体的な型定義を追加してください。',
            category: 'bug',
          },
        ],
      });

      mockClaudeClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'claude');

      // Then: バグ候補が返される
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('型安全性の問題');
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodexClient.executeTask).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-RA-003: analyze_正常系_autoモードでCodex→Claudeフォールバック
   *
   * 目的: autoモードでCodex失敗時にClaudeにフォールバックすることを検証
   */
  describe('TC-RA-003: analyze with auto mode fallback', () => {
    it('should fallback to Claude when Codex fails', async () => {
      // Given: Codex が失敗し、Claude が成功する
      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));

      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'test bug with enough length for validation',
            file: 'test.ts',
            line: 1,
            severity: 'low',
            description: 'test description with at least 50 characters for validation purposes.',
            suggestedFix: 'fix suggestion text',
            category: 'bug',
          },
        ],
      });

      mockClaudeClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を auto モードで実行
      const result = await analyzer.analyze('/path/to/repo', 'auto');

      // Then: Claude にフォールバックして成功
      expect(result).toHaveLength(1);
      expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-RA-004: analyze_異常系_エージェント出力が不正なJSON
   *
   * 目的: エージェント出力が不正なJSON形式の場合、空配列を返すことを検証
   */
  describe('TC-RA-004: analyze with invalid JSON output', () => {
    it('should return empty array when agent output is invalid JSON', async () => {
      // Given: Codex が不正な JSON を返す
      mockCodexClient.executeTask.mockResolvedValue(['```json\n{ invalid json }\n```']);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: 空配列が返される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-RA-005: parseAgentOutput_正常系_JSON形式出力
   *
   * 目的: JSON形式のエージェント出力を正しくパースできることを検証
   */
  describe('TC-RA-005: parseAgentOutput with JSON format', () => {
    it('should parse JSON format output correctly', () => {
      // Given: JSON ブロックを含む出力
      const rawOutput = `
ここはテキスト

\`\`\`json
{
  "bugs": [
    {
      "title": "test bug title with enough length for validation",
      "file": "test.ts",
      "line": 1,
      "severity": "high",
      "description": "test description with at least 50 characters to pass validation check",
      "suggestedFix": "test fix with minimum length requirement",
      "category": "bug"
    }
  ]
}
\`\`\`

追加テキスト
`;

      // When: parseAgentOutput を実行（privateメソッドなので、analyze経由でテスト）
      mockCodexClient.executeTask.mockResolvedValue([rawOutput]);

      // Then: 正しくパースされる
      return analyzer.analyze('/path/to/repo', 'codex').then((result) => {
        expect(result).toHaveLength(1);
        expect(result[0].title).toContain('test bug title');
      });
    });
  });

  /**
   * TC-RA-006: parseAgentOutput_異常系_JSONブロックなし
   *
   * 目的: JSONブロックが含まれない出力の場合、空配列を返すことを検証
   */
  describe('TC-RA-006: parseAgentOutput without JSON block', () => {
    it('should return empty array when no JSON block is found', async () => {
      // Given: JSON ブロックを含まない出力
      mockCodexClient.executeTask.mockResolvedValue(['This is plain text without JSON block']);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: 空配列が返される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-RA-007: validateBugCandidate_正常系_有効な候補
   *
   * 目的: すべてのフィールドが有効な候補がバリデーションを通過することを検証
   */
  describe('TC-RA-007: validateBugCandidate with valid candidate', () => {
    it('should accept valid bug candidate', async () => {
      // Given: 有効なバグ候補
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Valid bug title with enough length for validation',
            file: 'src/core/test.ts',
            line: 42,
            severity: 'high',
            description:
              'This is a valid description with at least 50 characters to pass the validation check.',
            suggestedFix: 'This is a valid fix suggestion with minimum required length.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-RA-008: validateBugCandidate_異常系_タイトルが短すぎる
   *
   * 目的: タイトルが10文字未満の場合、バリデーションに失敗することを検証
   */
  describe('TC-RA-008: validateBugCandidate with short title', () => {
    it('should reject candidate with title shorter than 10 characters', async () => {
      // Given: タイトルが短すぎる候補
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Short',
            file: 'src/core/test.ts',
            line: 42,
            severity: 'high',
            description:
              'This is a valid description with at least 50 characters to pass the validation.',
            suggestedFix: 'This is a valid fix with sufficient length for validation requirements.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-RA-009: validateBugCandidate_異常系_非対応言語
   *
   * 目的: TypeScript/Python以外のファイルがバリデーションに失敗することを検証
   */
  describe('TC-RA-009: validateBugCandidate with unsupported language', () => {
    it('should reject candidate with unsupported file extension', async () => {
      // Given: Java ファイル（Phase 1では非対応）
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Valid bug title with enough length',
            file: 'src/core/test.java', // Java は Phase 1 非対応
            line: 42,
            severity: 'high',
            description:
              'This is a valid description with at least 50 characters to pass the validation.',
            suggestedFix: 'This is a valid fix with minimum required length of 20 characters.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-RA-010: validateBugCandidate_境界値_タイトル10文字ちょうど
   *
   * 目的: タイトルが10文字ちょうどの場合、バリデーションを通過することを検証
   */
  describe('TC-RA-010: validateBugCandidate with 10-character title', () => {
    it('should accept candidate with title of exactly 10 characters', async () => {
      // Given: タイトルがちょうど10文字
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: '1234567890', // ちょうど10文字
            file: 'test.ts',
            line: 1,
            severity: 'high',
            description: 'This is a valid description with at least 50 characters to pass.',
            suggestedFix: 'This is a valid fix suggestion with required minimum length.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
    });
  });

  /**
   * Phase 2: リファクタリング検出機能のテスト
   * テストシナリオ: test-scenario.md の セクション2（ユニットテスト）
   */

  /**
   * TC-2.1.1: validateRefactorCandidate_正常系_有効なlarge-file候補
   *
   * 目的: すべての必須フィールドが正しく設定された候補がバリデーションを通過することを検証
   */
  describe('TC-2.1.1: validateRefactorCandidate with valid large-file candidate', () => {
    it('should accept valid refactor candidate with all required fields', async () => {
      // Given: 有効なリファクタリング候補
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('large-file');
      expect(result[0].filePath).toBe('src/services/user-service.ts');
      expect(result[0].priority).toBe('high');
    });
  });

  /**
   * TC-2.1.2: validateRefactorCandidate_正常系_duplication候補（lineRange付き）
   *
   * 目的: オプショナルフィールド（lineRange）が設定された候補がバリデーションを通過することを検証
   */
  describe('TC-2.1.2: validateRefactorCandidate with duplication and lineRange', () => {
    it('should accept candidate with optional lineRange field', async () => {
      // Given: lineRange付きのリファクタリング候補
      const mockOutput = JSON.stringify([
        {
          type: 'duplication',
          filePath: 'src/utils/validators.ts',
          lineRange: { start: 45, end: 60 },
          description: 'emailバリデーションロジックが3箇所で重複している',
          suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
          priority: 'medium',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('duplication');
      expect(result[0].lineRange).toEqual({ start: 45, end: 60 });
    });
  });

  /**
   * TC-2.1.3: validateRefactorCandidate_正常系_missing-docs候補（priority: low）
   *
   * 目的: すべての type と priority の組み合わせが正しく処理されることを検証
   */
  describe('TC-2.1.3: validateRefactorCandidate with missing-docs and low priority', () => {
    it('should accept candidate with all type and priority combinations', async () => {
      // Given: missing-docs タイプのリファクタリング候補
      const mockOutput = JSON.stringify([
        {
          type: 'missing-docs',
          filePath: 'src/core/data-processor.ts',
          lineRange: { start: 120, end: 150 },
          description: 'processData関数にJSDocコメントがなく、複雑なロジックの理解が困難',
          suggestion: 'パラメータ、戻り値、エラーケースを含むJSDocコメントを追加することを推奨',
          priority: 'low',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('missing-docs');
      expect(result[0].priority).toBe('low');
    });
  });

  /**
   * TC-2.2.1: validateRefactorCandidate_異常系_type欠落
   *
   * 目的: 必須フィールド type が欠落した候補がバリデーションで弾かれることを検証
   */
  describe('TC-2.2.1: validateRefactorCandidate with missing type field', () => {
    it('should reject candidate with missing type field', async () => {
      // Given: type が欠落した候補
      const mockOutput = JSON.stringify([
        {
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-2.2.2: validateRefactorCandidate_異常系_description欠落
   *
   * 目的: description欠落時にバリデーションで弾かれることを検証
   */
  describe('TC-2.2.2: validateRefactorCandidate with missing description', () => {
    it('should reject candidate with missing description field', async () => {
      // Given: description が欠落した候補
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-2.2.3: validateRefactorCandidate_異常系_無効なtype
   *
   * 目的: 定義されていない型が指定された場合にバリデーションで弾かれることを検証
   */
  describe('TC-2.2.3: validateRefactorCandidate with invalid type', () => {
    it('should reject candidate with invalid type value', async () => {
      // Given: 無効な type の候補
      const mockOutput = JSON.stringify([
        {
          type: 'invalid-type',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-2.2.4: validateRefactorCandidate_異常系_description最小文字数違反
   *
   * 目的: description が20文字未満の場合にバリデーションで弾かれることを検証
   */
  describe('TC-2.2.4: validateRefactorCandidate with short description', () => {
    it('should reject candidate with description shorter than 20 characters', async () => {
      // Given: 短すぎる description
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'Too short', // 9文字
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-2.2.5: validateRefactorCandidate_異常系_suggestion最小文字数違反
   *
   * 目的: suggestion が20文字未満の場合にバリデーションで弾かれることを検証
   */
  describe('TC-2.2.5: validateRefactorCandidate with short suggestion', () => {
    it('should reject candidate with suggestion shorter than 20 characters', async () => {
      // Given: 短すぎる suggestion
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: 'Split it', // 8文字
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-2.2.6: validateRefactorCandidate_異常系_無効なpriority
   *
   * 目的: 定義されていない優先度が指定された場合にバリデーションで弾かれることを検証
   */
  describe('TC-2.2.6: validateRefactorCandidate with invalid priority', () => {
    it('should reject candidate with invalid priority value', async () => {
      // Given: 無効な priority
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'critical', // 無効な値
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-2.3.1: validateRefactorCandidate_境界値_description正確に20文字
   *
   * 目的: description が最小文字数（20文字）ちょうどの場合にバリデーションを通過することを検証
   */
  describe('TC-2.3.1: validateRefactorCandidate with 20-character description', () => {
    it('should accept candidate with description of exactly 20 characters', async () => {
      // Given: description がちょうど20文字
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'This is exactly 20!', // 正確に20文字
          suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-2.3.2: validateRefactorCandidate_境界値_suggestion正確に20文字
   *
   * 目的: suggestion が最小文字数（20文字）ちょうどの場合にバリデーションを通過することを検証
   */
  describe('TC-2.3.2: validateRefactorCandidate with 20-character suggestion', () => {
    it('should accept candidate with suggestion of exactly 20 characters', async () => {
      // Given: suggestion がちょうど20文字
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'src/services/user-service.ts',
          description: 'ファイルサイズが750行あり、複数の責務を持っている',
          suggestion: 'This is exactly 20!', // 正確に20文字
          priority: 'high',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-2.3.3: validateRefactorCandidate_境界値_すべてのtype検証
   *
   * 目的: 6つすべての type フィールド値が正しく処理されることを検証
   */
  describe('TC-2.3.3: validateRefactorCandidate with all refactor types', () => {
    it('should accept all valid refactor types', async () => {
      // Given: 6つすべての type を含む候補
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'test.ts',
          description: 'Large file description here',
          suggestion: 'Split the file suggestion',
          priority: 'high',
        },
        {
          type: 'large-function',
          filePath: 'test.ts',
          description: 'Large function description',
          suggestion: 'Split the function now',
          priority: 'high',
        },
        {
          type: 'high-complexity',
          filePath: 'test.ts',
          description: 'High complexity description',
          suggestion: 'Simplify the logic here',
          priority: 'medium',
        },
        {
          type: 'duplication',
          filePath: 'test.ts',
          description: 'Code duplication found here',
          suggestion: 'Extract common function',
          priority: 'medium',
        },
        {
          type: 'unused-code',
          filePath: 'test.ts',
          description: 'Unused code detected here',
          suggestion: 'Remove the unused code',
          priority: 'low',
        },
        {
          type: 'missing-docs',
          filePath: 'test.ts',
          description: 'Missing docs detected now',
          suggestion: 'Add JSDoc comments here',
          priority: 'low',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: すべての候補がバリデーションを通過
      expect(result).toHaveLength(6);
      expect(result.map((r) => r.type)).toEqual([
        'large-file',
        'large-function',
        'high-complexity',
        'duplication',
        'unused-code',
        'missing-docs',
      ]);
    });
  });
});
