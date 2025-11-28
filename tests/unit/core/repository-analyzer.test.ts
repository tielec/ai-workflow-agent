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
      runTask: jest.fn(),
    } as unknown as jest.Mocked<CodexAgentClient>;

    // Claude クライアントのモック
    mockClaudeClient = {
      runTask: jest.fn(),
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
            description: 'executeTask()メソッドでエラーハンドリングが不足しています。',
            suggestedFix: 'try-catchブロックを追加してください。',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バグ候補が返される
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('エラーハンドリングの欠如');
      expect(result[0].file).toBe('src/core/codex-agent-client.ts');
      expect(result[0].severity).toBe('high');
      expect(mockCodexClient.runTask).toHaveBeenCalledTimes(1);
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

      mockClaudeClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'claude');

      // Then: バグ候補が返される
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('型安全性の問題');
      expect(mockClaudeClient.runTask).toHaveBeenCalledTimes(1);
      expect(mockCodexClient.runTask).not.toHaveBeenCalled();
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
      mockCodexClient.runTask.mockRejectedValue(new Error('Codex API failed'));

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

      mockClaudeClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

      // When: analyze() を auto モードで実行
      const result = await analyzer.analyze('/path/to/repo', 'auto');

      // Then: Claude にフォールバックして成功
      expect(result).toHaveLength(1);
      expect(mockCodexClient.runTask).toHaveBeenCalledTimes(1);
      expect(mockClaudeClient.runTask).toHaveBeenCalledTimes(1);
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
      mockCodexClient.runTask.mockResolvedValue('```json\n{ invalid json }\n```');

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
      mockCodexClient.runTask.mockResolvedValue(rawOutput);

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
      mockCodexClient.runTask.mockResolvedValue('This is plain text without JSON block');

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

      mockCodexClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

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
            suggestedFix: 'This is a valid fix.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

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
            suggestedFix: 'This is a valid fix.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

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
            suggestedFix: 'This is a valid fix suggestion.',
            category: 'bug',
          },
        ],
      });

      mockCodexClient.runTask.mockResolvedValue(`\`\`\`json\n${mockOutput}\n\`\`\``);

      // When: analyze() を実行
      const result = await analyzer.analyze('/path/to/repo', 'codex');

      // Then: バリデーションを通過
      expect(result).toHaveLength(1);
    });
  });
});
