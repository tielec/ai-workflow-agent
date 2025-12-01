/**
 * ユニットテスト: RepositoryAnalyzer
 *
 * テスト対象: src/core/repository-analyzer.ts
 * テストシナリオ: test-scenario.md の TC-RA-001 〜 TC-RA-010
 */

import path from 'node:path';
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

  /**
   * Phase 5: Issue #155 - リファクタリング後の新規メソッドテスト
   * 新規メソッド: executeAgentWithFallback, validateAnalysisResult
   */

  /**
   * 2.1 executeAgentWithFallback メソッドのユニットテスト
   */

  /**
   * TC-3.1.1: executeAgentWithFallback_正常系_Codex成功パターン
   *
   * 目的: agent='codex'でCodexエージェントが利用可能な場合、Codexが実行され正常に完了することを検証
   */
  describe('TC-3.1.1: executeAgentWithFallback - Codex success', () => {
    it('should execute Codex agent successfully when agent=codex', async () => {
      // Given: Codex クライアントが利用可能
      const mockPromptPath = path.resolve(__dirname, '../../../src/prompts/auto-issue/detect-bugs.txt');
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Test bug with enough length',
            file: 'test.ts',
            line: 1,
            severity: 'high',
            description: 'Test description with at least 50 characters for validation.',
            suggestedFix: 'Test fix suggestion',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を codex モードで実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: Codex エージェントが1回呼び出され、Claude は呼び出されない
      expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaudeClient.executeTask).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-3.1.2: executeAgentWithFallback_正常系_Codex利用不可→Claudeフォールバック
   *
   * 目的: agent='auto'でCodexが利用不可の場合、自動的にClaudeにフォールバックすることを検証
   */
  describe('TC-3.1.2: executeAgentWithFallback - Codex unavailable fallback to Claude', () => {
    it('should fallback to Claude when Codex is not available', async () => {
      // Given: Codex が null（利用不可）
      const analyzerWithoutCodex = new RepositoryAnalyzer(null, mockClaudeClient);

      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Test bug with enough length for validation',
            file: 'test.ts',
            line: 1,
            severity: 'high',
            description: 'Test description with at least 50 characters to pass validation.',
            suggestedFix: 'Test fix suggestion with minimum length',
            category: 'bug',
          },
        ],
      });

      mockClaudeClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を auto モードで実行
      const result = await analyzerWithoutCodex.analyze('/path/to/repo', 'auto');

      // Then: Claude にフォールバック
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-3.1.3: executeAgentWithFallback_正常系_Codex実行失敗→Claudeフォールバック
   *
   * 目的: agent='auto'でCodex実行中にエラーが発生した場合、自動的にClaudeにフォールバックすることを検証
   */
  describe('TC-3.1.3: executeAgentWithFallback - Codex failure fallback to Claude', () => {
    it('should fallback to Claude when Codex execution fails', async () => {
      // Given: Codex が実行失敗
      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API error'));

      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Test bug with enough length for validation',
            file: 'test.ts',
            line: 1,
            severity: 'high',
            description: 'Test description with at least 50 characters to pass validation.',
            suggestedFix: 'Test fix suggestion with minimum length',
            category: 'bug',
          },
        ],
      });

      mockClaudeClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を auto モードで実行
      const result = await analyzer.analyze('/path/to/repo', 'auto');

      // Then: Codex が失敗し、Claude にフォールバック
      expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-3.1.4: executeAgentWithFallback_異常系_両エージェント利用不可
   *
   * 目的: agent='auto'でCodexとClaudeの両方が利用不可の場合、適切なエラーがスローされることを検証
   */
  describe('TC-3.1.4: executeAgentWithFallback - both agents unavailable', () => {
    it('should throw error when both agents are unavailable', async () => {
      // Given: 両エージェントが null
      const analyzerWithoutAgents = new RepositoryAnalyzer(null, null);

      // When/Then: analyze() を実行するとエラーがスローされる
      await expect(analyzerWithoutAgents.analyze('/path/to/repo', 'auto')).rejects.toThrow(
        'Claude agent is not available.',
      );
    });
  });

  /**
   * TC-3.1.5: executeAgentWithFallback_異常系_Codex強制モードで失敗
   *
   * 目的: agent='codex'でCodex実行失敗時、フォールバックせずエラーがスローされることを検証
   */
  describe('TC-3.1.5: executeAgentWithFallback - Codex forced mode failure', () => {
    it('should throw error when Codex fails in forced mode', async () => {
      // Given: Codex が実行失敗
      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex authentication failed'));

      // When/Then: analyze() を codex 強制モードで実行するとエラーがスローされる
      await expect(analyzer.analyze('/path/to/repo', 'codex')).rejects.toThrow(
        'Codex authentication failed',
      );

      // Claude は呼び出されない（フォールバックなし）
      expect(mockClaudeClient.executeTask).not.toHaveBeenCalled();
    });
  });

  /**
   * 2.2 validateAnalysisResult メソッドのユニットテスト
   */

  /**
   * TC-3.2.1: validateAnalysisResult_正常系_バグ候補全て有効
   *
   * 目的: candidateType='bug'で全ての候補が有効な場合、全候補が返されることを検証
   */
  describe('TC-3.2.1: validateAnalysisResult - all valid bug candidates', () => {
    it('should return all candidates when all are valid', async () => {
      // Given: 有効なバグ候補3つ
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Bug 1 with enough length',
            file: 'a.ts',
            line: 10,
            severity: 'high',
            description: 'Description 1 with at least 50 characters for validation.',
            suggestedFix: 'Fix 1 with minimum length',
            category: 'bug',
          },
          {
            title: 'Bug 2 with enough length',
            file: 'b.ts',
            line: 20,
            severity: 'medium',
            description: 'Description 2 with at least 50 characters for validation.',
            suggestedFix: 'Fix 2 with minimum length',
            category: 'bug',
          },
          {
            title: 'Bug 3 with enough length',
            file: 'c.ts',
            line: 30,
            severity: 'low',
            description: 'Description 3 with at least 50 characters for validation.',
            suggestedFix: 'Fix 3 with minimum length',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: 3個全てが返される
      expect(result).toHaveLength(3);
    });
  });

  /**
   * TC-3.2.2: validateAnalysisResult_正常系_バグ候補一部無効
   *
   * 目的: candidateType='bug'で一部の候補が無効な場合、有効な候補のみが返されることを検証
   */
  describe('TC-3.2.2: validateAnalysisResult - some invalid bug candidates', () => {
    it('should return only valid candidates when some are invalid', async () => {
      // Given: 3個の候補のうち1個が無効（titleが短すぎる）
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Bug 1 with enough length',
            file: 'a.ts',
            line: 10,
            severity: 'high',
            description: 'Description 1 with at least 50 characters for validation.',
            suggestedFix: 'Fix 1 with minimum length',
            category: 'bug',
          },
          {
            title: 'Short', // 無効（10文字未満）
            file: 'b.ts',
            line: 20,
            severity: 'medium',
            description: 'Description 2 with at least 50 characters for validation.',
            suggestedFix: 'Fix 2 with minimum length',
            category: 'bug',
          },
          {
            title: 'Bug 3 with enough length',
            file: 'c.ts',
            line: 30,
            severity: 'low',
            description: 'Description 3 with at least 50 characters for validation.',
            suggestedFix: 'Fix 3 with minimum length',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: 2個の有効な候補のみが返される
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Bug 1 with enough length');
      expect(result[1].title).toBe('Bug 3 with enough length');
    });
  });

  /**
   * TC-3.2.3: validateAnalysisResult_正常系_リファクタリング候補全て有効
   *
   * 目的: candidateType='refactor'で全ての候補が有効な場合、全候補が返されることを検証
   */
  describe('TC-3.2.3: validateAnalysisResult - all valid refactor candidates', () => {
    it('should return all refactor candidates when all are valid', async () => {
      // Given: 有効なリファクタリング候補2つ
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'a.ts',
          description: 'Description with minimum 20 characters',
          suggestion: 'Suggestion with minimum 20 characters',
          priority: 'high',
        },
        {
          type: 'duplication',
          filePath: 'b.ts',
          lineRange: { start: 10, end: 20 },
          description: 'Another description with enough length',
          suggestion: 'Another suggestion with enough length',
          priority: 'medium',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: 2個全てが返される
      expect(result).toHaveLength(2);
    });
  });

  /**
   * TC-3.2.4: validateAnalysisResult_正常系_リファクタリング候補一部無効
   *
   * 目的: candidateType='refactor'で一部の候補が無効な場合、有効な候補のみが返されることを検証
   */
  describe('TC-3.2.4: validateAnalysisResult - some invalid refactor candidates', () => {
    it('should return only valid refactor candidates when some are invalid', async () => {
      // Given: 2個の候補のうち1個が無効（descriptionが短すぎる）
      const mockOutput = JSON.stringify([
        {
          type: 'large-file',
          filePath: 'a.ts',
          description: 'Description with minimum 20 characters',
          suggestion: 'Suggestion with minimum 20 characters',
          priority: 'high',
        },
        {
          type: 'duplication',
          filePath: 'b.ts',
          description: 'Too short', // 無効（20文字未満）
          suggestion: 'Another suggestion with enough length',
          priority: 'medium',
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForRefactoring() を実行
      const result = await analyzer.analyzeForRefactoring('/path/to/repo', 'codex');

      // Then: 1個の有効な候補のみが返される
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('large-file');
    });
  });

  /**
   * TC-3.2.5: validateAnalysisResult_境界値_空の候補リスト
   *
   * 目的: 候補リストが空の場合、空配列が返されることを検証
   */
  describe('TC-3.2.5: validateAnalysisResult - empty candidate list', () => {
    it('should return empty array when candidate list is empty', async () => {
      // Given: 空の候補リスト
      const mockOutput = JSON.stringify({ bugs: [] });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: 空配列が返される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-3.2.6: validateAnalysisResult_境界値_全ての候補が無効
   *
   * 目的: 全ての候補が無効な場合、空配列が返されることを検証
   */
  describe('TC-3.2.6: validateAnalysisResult - all candidates invalid', () => {
    it('should return empty array when all candidates are invalid', async () => {
      // Given: 全て無効な候補
      const mockOutput = JSON.stringify({
        bugs: [
          {
            title: 'Short', // 無効
            file: 'a.ts',
            line: 1,
            severity: 'high',
            description: 'Description with at least 50 characters for validation.',
            suggestedFix: 'Fix with minimum length',
            category: 'bug',
          },
          {
            title: 'Another short', // 無効
            file: 'b.ts',
            line: 1,
            severity: 'high',
            description: 'Description with at least 50 characters for validation.',
            suggestedFix: 'Fix with minimum length',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: 空配列が返される
      expect(result).toEqual([]);
    });
  });

  /**
   * Phase 3: Enhancement proposal 機能のテスト
   * テストシナリオ: test-scenario.md のセクション2（ユニットテスト）- Enhancement関連
   */

  /**
   * TC-4.1.1: analyzeForEnhancements_正常系_Codexエージェント使用
   *
   * 目的: Codexエージェントを使用して機能拡張提案を正しく生成できることを検証
   */
  describe('TC-4.1.1: analyzeForEnhancements with Codex agent', () => {
    it('should generate enhancement proposals using Codex agent', async () => {
      // Given: Codex クライアントが正常な JSON 出力を返す
      const mockOutput = JSON.stringify([
        {
          type: 'improvement',
          title: 'CLI UI の改善 - プログレスバーとカラフルな出力を追加する',
          description:
            'CLI実行時にプログレスバーとカラフルな出力を追加することで、ユーザー体験を向上させる機能。実行中の進捗状況が視覚的に分かりやすくなる。',
          rationale: '長時間のタスク実行時にユーザーがフリーズしているのか判断できない問題を解決する。',
          implementation_hints: ['ora ライブラリを使用してスピナーを追加', 'chalk ライブラリでカラフルな出力を実装'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/commands/auto-issue.ts', 'src/main.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: 機能拡張提案が返される
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('improvement');
      expect(result[0].title).toContain('CLI UI の改善');
      expect(result[0].expected_impact).toBe('high');
      expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-4.1.2: analyzeForEnhancements_正常系_Claudeエージェント使用
   *
   * 目的: Claudeエージェントを使用して機能拡張提案を正しく生成できることを検証
   */
  describe('TC-4.1.2: analyzeForEnhancements with Claude agent', () => {
    it('should generate enhancement proposals using Claude agent', async () => {
      // Given: Claude クライアントが正常な JSON 出力を返す
      const mockOutput = JSON.stringify([
        {
          type: 'integration',
          title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
          description:
            'AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。チーム全体でワークフローの進捗を共有できる。',
          rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
          implementation_hints: ['Slack Incoming Webhook を使用', '@slack/web-api パッケージを導入'],
          expected_impact: 'medium',
          effort_estimate: 'small',
          related_files: ['src/phases/evaluation.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockClaudeClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'claude', {
        creativeMode: false,
      });

      // Then: 機能拡張提案が返される
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('integration');
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodexClient.executeTask).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-4.1.3: analyzeForEnhancements_正常系_creativeMode有効
   *
   * 目的: creativeMode有効時、より創造的な提案が生成されることを検証
   */
  describe('TC-4.1.3: analyzeForEnhancements with creative mode enabled', () => {
    it('should generate creative proposals when creativeMode is true', async () => {
      // Given: creative mode 有効
      const mockOutput = JSON.stringify([
        {
          type: 'ecosystem',
          title: 'プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構を実装する',
          description:
            'ユーザーが独自のフェーズを定義できるプラグインシステムを実装する機能。プラグインローダーとフェーズインターフェースを提供する。',
          rationale: 'プロダクトの拡張性を大幅に向上させ、コミュニティ主導の成長を促進する。',
          implementation_hints: ['プラグインローダーを実装', 'フェーズインターフェースを定義'],
          expected_impact: 'high',
          effort_estimate: 'large',
          related_files: ['src/core/plugin-loader.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を creative mode で実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: true,
      });

      // Then: 創造的な提案が返される
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('ecosystem');
      expect(result[0].effort_estimate).toBe('large');
    });
  });

  /**
   * TC-4.1.4: analyzeForEnhancements_正常系_autoモードでCodex→Claudeフォールバック
   *
   * 目的: autoモードでCodex失敗時にClaudeにフォールバックすることを検証
   */
  describe('TC-4.1.4: analyzeForEnhancements with auto mode fallback', () => {
    it('should fallback to Claude when Codex fails in auto mode', async () => {
      // Given: Codex が失敗し、Claude が成功する
      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));

      const mockOutput = JSON.stringify([
        {
          type: 'automation',
          title: '自動テスト生成機能の追加 - 既存コードから単体テストを自動生成する機能',
          description:
            '既存コードを解析して単体テストのスケルトンを自動生成する機能。テストカバレッジの向上に貢献する。',
          rationale: 'テスト作成の手間を削減し、開発速度を向上させる。',
          implementation_hints: ['AST解析でコード構造を把握', 'テストテンプレートを自動生成'],
          expected_impact: 'medium',
          effort_estimate: 'medium',
          related_files: ['src/core/test-generator.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockClaudeClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を auto モードで実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'auto', {
        creativeMode: false,
      });

      // Then: Claude にフォールバックして成功
      expect(result).toHaveLength(1);
      expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-4.1.5: analyzeForEnhancements_異常系_エージェント出力が不正なJSON
   *
   * 目的: エージェント出力が不正なJSON形式の場合、空配列を返すことを検証
   */
  describe('TC-4.1.5: analyzeForEnhancements with invalid JSON output', () => {
    it('should return empty array when agent output is invalid JSON', async () => {
      // Given: Codex が不正な JSON を返す
      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue(['```json\n{ invalid json }\n```']);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: 空配列が返される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-4.2.1: validateEnhancementProposal_正常系_有効な提案
   *
   * 目的: すべてのフィールドが有効な提案がバリデーションを通過することを検証
   */
  describe('TC-4.2.1: validateEnhancementProposal with valid proposal', () => {
    it('should accept valid enhancement proposal', async () => {
      // Given: 有効な機能拡張提案
      const mockOutput = JSON.stringify([
        {
          type: 'improvement',
          title: 'エラーメッセージの改善 - より詳細で分かりやすいエラーメッセージを提供する機能',
          description:
            'エラー発生時に、原因と解決方法を含む詳細なエラーメッセージを表示する機能。ユーザーが問題を自己解決できるようになる。この機能により、サポートコストの削減にも貢献できる。',
          rationale:
            '現状のエラーメッセージは簡素すぎて、ユーザーが原因を特定できないケースが多い。詳細なエラーメッセージによりユーザー体験が向上する。',
          implementation_hints: ['エラークラスを拡張して詳細情報を保持', 'エラーフォーマッターを実装'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/utils/error-handler.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('improvement');
    });
  });

  /**
   * TC-4.2.2: validateEnhancementProposal_異常系_タイトルが短すぎる
   *
   * 目的: タイトルが50文字未満の場合、バリデーションに失敗することを検証
   */
  describe('TC-4.2.2: validateEnhancementProposal with short title', () => {
    it('should reject proposal with title shorter than 50 characters', async () => {
      // Given: タイトルが短すぎる提案
      const mockOutput = JSON.stringify([
        {
          type: 'improvement',
          title: '短いタイトル', // 7文字（50文字未満）
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['実装ヒント1'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-4.2.3: validateEnhancementProposal_異常系_descriptionが短すぎる
   *
   * 目的: descriptionが100文字未満の場合、バリデーションに失敗することを検証
   */
  describe('TC-4.2.3: validateEnhancementProposal with short description', () => {
    it('should reject proposal with description shorter than 100 characters', async () => {
      // Given: description が短すぎる提案
      const mockOutput = JSON.stringify([
        {
          type: 'improvement',
          title: 'これは有効なタイトルです。50文字以上を満たすために十分な長さのテキストを記載しています。',
          description: '短い説明', // 5文字（100文字未満）
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['実装ヒント1'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-4.2.4: validateEnhancementProposal_異常系_無効なtype
   *
   * 目的: 定義されていない型が指定された場合にバリデーションで弾かれることを検証
   */
  describe('TC-4.2.4: validateEnhancementProposal with invalid type', () => {
    it('should reject proposal with invalid type value', async () => {
      // Given: 無効な type の提案
      const mockOutput = JSON.stringify([
        {
          type: 'invalid-type', // 無効な type
          title: 'これは有効なタイトルです。50文字以上を満たすために十分な長さのテキストを記載しています。',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['実装ヒント1'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: バリデーションで除外される
      expect(result).toEqual([]);
    });
  });

  /**
   * TC-4.2.5: validateEnhancementProposal_正常系_全てのtype検証
   *
   * 目的: 6つすべての type フィールド値が正しく処理されることを検証
   */
  describe('TC-4.2.5: validateEnhancementProposal with all enhancement types', () => {
    it('should accept all valid enhancement types', async () => {
      // Given: 6つすべての type を含む提案
      const mockOutput = JSON.stringify([
        {
          type: 'improvement',
          title: 'improvement type - これは50文字以上の有効なタイトルです。',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['hint'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
        {
          type: 'integration',
          title: 'integration type - これは50文字以上の有効なタイトルです。',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['hint'],
          expected_impact: 'medium',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
        {
          type: 'automation',
          title: 'automation type - これは50文字以上の有効なタイトルです。',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['hint'],
          expected_impact: 'high',
          effort_estimate: 'medium',
          related_files: ['src/test.ts'],
        },
        {
          type: 'dx',
          title: 'dx type - これは50文字以上の有効なタイトルです。開発者体験を向上させる機能',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['hint'],
          expected_impact: 'medium',
          effort_estimate: 'medium',
          related_files: ['src/test.ts'],
        },
        {
          type: 'quality',
          title: 'quality type - これは50文字以上の有効なタイトルです。品質を向上させる機能',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['hint'],
          expected_impact: 'high',
          effort_estimate: 'small',
          related_files: ['src/test.ts'],
        },
        {
          type: 'ecosystem',
          title: 'ecosystem type - これは50文字以上の有効なタイトルです。エコシステムを拡張する機能',
          description:
            'これは有効な説明文です。最小100文字以上を満たすために、十分な長さのテキストを記載する必要があります。この説明は適切な長さを持っています。',
          rationale: 'これは有効な理由文です。最小50文字以上を満たすために、十分な長さのテキストを記載します。',
          implementation_hints: ['hint'],
          expected_impact: 'high',
          effort_estimate: 'large',
          related_files: ['src/test.ts'],
        },
      ]);

      jest.spyOn(analyzer as any, 'collectRepositoryCode').mockReturnValue('mock repository code');
      mockCodexClient.executeTask.mockResolvedValue([`\`\`\`json\n${mockOutput}\n\`\`\``]);

      // When: analyzeForEnhancements() を実行
      const result = await analyzer.analyzeForEnhancements('/path/to/repo', 'codex', {
        creativeMode: false,
      });

      // Then: すべての候補がバリデーションを通過
      expect(result).toHaveLength(6);
      expect(result.map((r) => r.type)).toEqual([
        'improvement',
        'integration',
        'automation',
        'dx',
        'quality',
        'ecosystem',
      ]);
    });
  });
});
