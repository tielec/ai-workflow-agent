import {
  formatCodexLog,
  formatClaudeLog,
  truncateInput,
  MAX_LOG_PARAM_LENGTH,
} from '../../../src/core/helpers/log-formatter.js';
import type { CodexEvent } from '../../../src/core/helpers/agent-event-parser.js';

describe('log-formatter', () => {
  describe('formatCodexLog', () => {
    // REQ-002: ログフォーマット処理の分離
    it('正常系: thinkingイベントを正しくフォーマットできる', () => {
      // Given: assistantタイプのthinkingイベント
      const eventType = 'assistant';
      const payload: CodexEvent = {
        message: {
          content: [{ type: 'text', text: 'Thinking...' }],
        },
      };

      // When: formatCodexLog関数を呼び出す
      const result = formatCodexLog(eventType, payload);

      // Then: [CODEX THINKING]形式の文字列が返される
      expect(result).toContain('[CODEX THINKING]');
      expect(result).toContain('Thinking...');
    });

    it('正常系: tool_useイベントを正しくフォーマットできる', () => {
      // Given: assistantタイプのtool_useイベント
      const eventType = 'assistant';
      const payload: CodexEvent = {
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'bash',
              input: { command: 'ls -la' },
            },
          ],
        },
      };

      // When: formatCodexLog関数を呼び出す
      const result = formatCodexLog(eventType, payload);

      // Then: [CODEX ACTION]形式の文字列が返される
      expect(result).toContain('[CODEX ACTION]');
      expect(result).toContain('bash');
    });

    it('正常系: resultイベントを正しくフォーマットできる', () => {
      // Given: resultタイプのイベント
      const eventType = 'result';
      const payload: CodexEvent = {
        result: 'success',
        status: 'completed',
      };

      // When: formatCodexLog関数を呼び出す
      const result = formatCodexLog(eventType, payload);

      // Then: [CODEX RESULT]形式の文字列が返される
      expect(result).toContain('[CODEX RESULT]');
      expect(result).toContain('success');
    });

    it('正常系: systemイベントを正しくフォーマットできる', () => {
      // Given: systemタイプのイベント
      const eventType = 'system';
      const payload: CodexEvent = {
        message: {
          role: 'system',
          content: [{ type: 'text', text: 'System message' }],
        },
      };

      // When: formatCodexLog関数を呼び出す
      const result = formatCodexLog(eventType, payload);

      // Then: [CODEX SYSTEM]形式の文字列が返される
      expect(result).toContain('[CODEX SYSTEM]');
    });
  });

  describe('formatClaudeLog', () => {
    // REQ-005: ログフォーマット処理の分離（Claude）
    it('正常系: assistantメッセージ（thinking）を正しくフォーマットできる', () => {
      // Given: assistantタイプのthinkingメッセージ
      const message: any = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Thinking...' }],
        },
      };

      // When: formatClaudeLog関数を呼び出す
      const result = formatClaudeLog(message);

      // Then: [AGENT THINKING]形式の文字列が返される
      expect(result).toContain('[AGENT THINKING]');
      expect(result).toContain('Thinking...');
    });

    it('正常系: tool_useメッセージを正しくフォーマットできる', () => {
      // Given: tool_useを含むassistantメッセージ
      const message: any = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/path/to/file.ts' },
            },
          ],
        },
      };

      // When: formatClaudeLog関数を呼び出す
      const result = formatClaudeLog(message);

      // Then: [AGENT ACTION]形式の文字列が返される
      expect(result).toContain('[AGENT ACTION]');
      expect(result).toContain('Read');
    });
  });

  describe('truncateInput', () => {
    it('正常系: 500文字以下の文字列はそのまま返される', () => {
      // Given: 短い文字列（11文字）
      const input = 'Hello World';

      // When: truncateInput関数を呼び出す
      const result = truncateInput(input);

      // Then: 入力文字列がそのまま返される
      expect(result).toBe('Hello World');
    });

    it('境界値: ちょうど500文字の文字列はそのまま返される', () => {
      // Given: ちょうど500文字の文字列
      const input = 'a'.repeat(500);

      // When: truncateInput関数を呼び出す
      const result = truncateInput(input);

      // Then: 入力文字列がそのまま返される
      expect(result).toBe(input);
      expect(result.length).toBe(500);
    });

    it('正常系: 501文字以上の文字列は切り詰められる', () => {
      // Given: 600文字の文字列
      const input = 'a'.repeat(600);

      // When: truncateInput関数を呼び出す
      const result = truncateInput(input);

      // Then: 最初の500文字 + '…'が返される
      expect(result).toBe('a'.repeat(500) + '…');
      expect(result.length).toBe(501); // 500 + 1（'…'）
    });

    it('正常系: カスタムmaxLengthパラメータが正しく動作する', () => {
      // Given: 'Hello World'文字列とmaxLength=5
      const input = 'Hello World';
      const maxLength = 5;

      // When: truncateInput関数をカスタムmaxLengthで呼び出す
      const result = truncateInput(input, maxLength);

      // Then: 'Hello…'が返される
      expect(result).toBe('Hello…');
    });

    it('定数: MAX_LOG_PARAM_LENGTHが500である', () => {
      // Then: MAX_LOG_PARAM_LENGTHが500である
      expect(MAX_LOG_PARAM_LENGTH).toBe(500);
    });
  });
});
