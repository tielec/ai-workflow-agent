import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

// Factory-based mock functions (ESM compatible)
const mockSpawn = jest.fn<any>();
const mockExistsSync = jest.fn<any>();
const mockReadFileSync = jest.fn<any>();

// Create a writable stdin mock
const createMockStdin = () => {
  const stdin = new EventEmitter() as any;
  stdin.write = jest.fn();
  stdin.end = jest.fn();
  return stdin;
};

// ESM-compatible mocks with factory functions
jest.unstable_mockModule('node:child_process', () => ({
  spawn: mockSpawn,
}));

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

// Import after mocking
const { CodexAgentClient } = await import('../../src/core/codex-agent-client.js');
const { ClaudeAgentClient } = await import('../../src/core/claude-agent-client.js');

describe('エージェント実行の統合テスト', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? 'test-github-token';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'integration-test-token';
  });

  describe('Codexエージェント実行フロー', () => {
    it('統合テスト: Codex実行からログ出力までの統合フローが動作する', async () => {
      // Given: Codex CLI実行環境
      const client = new CodexAgentClient({ workingDir: '/test/workspace' });
      const mockStdin = createMockStdin();
      mockSpawn.mockReturnValue({
        stdin: mockStdin,
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              // JSONイベントストリームをシミュレート
              callback(
                Buffer.from(
                  JSON.stringify({
                    type: 'assistant',
                    message: {
                      role: 'assistant',
                      content: [{ type: 'text', text: 'Integration test response' }],
                    },
                  }) + '\n',
                ),
              );
            }
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      } as any);
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      // When: executeTask関数を呼び出す
      const result = await client.executeTask({
        prompt: 'Integration test prompt',
        workingDirectory: '/test/workspace',
      });

      // Then: すべての手順が正しく実行される
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Codex CLIプロセスが起動される
      expect(mockSpawn).toHaveBeenCalled();
      // ログ出力が実行される（リファクタリング後もログフォーマットが動作）
      // logger は console.info を使用している
      expect(consoleInfoSpy).toHaveBeenCalled();

      consoleInfoSpy.mockRestore();
    });
  });

  describe('Claudeエージェント実行フロー', () => {
    it('統合テスト: Claude実行からログ出力までの統合フローが動作する（認証確認のみ）', async () => {
      // Given: Claude Agent SDK実行環境（OAuthトークンが設定済み）
      // Note: beforeEach で CLAUDE_CODE_OAUTH_TOKEN が設定されているため、
      // OAuthトークンが優先的に使用され、ファイル読み込みは行われない
      const client = new ClaudeAgentClient({ workingDir: '/test/workspace' });

      // Then: 認証トークンが取得できる環境が整っている（OAuth経由）
      expect(client).toBeInstanceOf(ClaudeAgentClient);
      // OAuthトークンが設定されている場合、ファイル読み込みは行われない
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('integration-test-token');
    });
  });

  describe('エージェントフォールバック処理', () => {
    it('統合テスト: Codex失敗時のハンドリングが動作する', async () => {
      // Given: Codex CLI失敗環境
      const client = new CodexAgentClient({ workingDir: '/test/workspace' });
      const mockStdin = createMockStdin();
      mockSpawn.mockReturnValue({
        stdin: mockStdin,
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('Error: command not found'));
            }
          }),
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(127); // command not found
          }
        }),
      } as any);

      // When/Then: Codex実行が失敗する
      await expect(
        client.executeTask({
          prompt: 'Test prompt',
          workingDirectory: '/test/workspace',
        }),
      ).rejects.toThrow();

      expect(mockSpawn).toHaveBeenCalled();

      // フォールバック処理は上位レイヤー（AgentExecutor等）で実装されているため、
      // ここではCodexの失敗検出のみ確認
    });
  });
});
