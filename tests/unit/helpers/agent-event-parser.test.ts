import {
  parseCodexEvent,
  parseClaudeEvent,
  determineCodexEventType,
  determineClaudeEventType,
  CodexEvent,
} from '../../../src/core/helpers/agent-event-parser.js';

describe('agent-event-parser', () => {
  describe('parseCodexEvent', () => {
    // REQ-001: JSONイベントパース処理の共通化
    it('正常系: 有効なJSONをパースできる', () => {
      // Given: 有効なJSONイベント文字列
      const jsonStr = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      });

      // When: parseCodexEvent関数を呼び出す
      const result = parseCodexEvent(jsonStr);

      // Then: CodexEventオブジェクトが返される
      expect(result).not.toBeNull();
      expect(result?.type).toBe('assistant');
      expect(result?.message?.role).toBe('assistant');
    });

    it('異常系: 不正なJSONの場合nullを返す', () => {
      // Given: 不正なJSON文字列
      const invalidJson = '{ invalid json }';

      // When: parseCodexEvent関数を呼び出す
      const result = parseCodexEvent(invalidJson);

      // Then: nullが返される（例外はスローしない）
      expect(result).toBeNull();
    });

    it('異常系: 空文字列の場合nullを返す', () => {
      // Given: 空文字列
      const emptyStr = '';

      // When: parseCodexEvent関数を呼び出す
      const result = parseCodexEvent(emptyStr);

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  describe('determineCodexEventType', () => {
    it('正常系: assistantイベントタイプを判定できる', () => {
      // Given: assistantタイプのイベント
      const payload: CodexEvent = { type: 'assistant' };

      // When: determineCodexEventType関数を呼び出す
      const result = determineCodexEventType(payload);

      // Then: 'assistant'が返される
      expect(result).toBe('assistant');
    });

    it('正常系: resultイベントタイプを判定できる', () => {
      // Given: resultタイプのイベント
      const payload: CodexEvent = { type: 'result', result: 'success' };

      // When: determineCodexEventType関数を呼び出す
      const result = determineCodexEventType(payload);

      // Then: 'result'が返される
      expect(result).toBe('result');
    });

    it('正常系: typeがなくてもmessage.roleから判定できる', () => {
      // Given: typeがないがmessage.roleがあるイベント
      const payload: CodexEvent = {
        message: { role: 'assistant' },
      };

      // When: determineCodexEventType関数を呼び出す
      const result = determineCodexEventType(payload);

      // Then: 'assistant'が返される
      expect(result).toBe('assistant');
    });

    it('正常系: typeもmessage.roleもない場合unknownを返す', () => {
      // Given: typeもmessage.roleもない空オブジェクト
      const payload: CodexEvent = {};

      // When: determineCodexEventType関数を呼び出す
      const result = determineCodexEventType(payload);

      // Then: 'unknown'が返される
      expect(result).toBe('unknown');
    });
  });

  describe('parseClaudeEvent', () => {
    it('正常系: SDKメッセージをパースできる', () => {
      // Given: Claude SDKメッセージ
      const message: any = {
        type: 'assistant',
        content: [{ type: 'text', text: 'Test message' }],
      };

      // When: parseClaudeEvent関数を呼び出す
      const result = parseClaudeEvent(message);

      // Then: ClaudeEventオブジェクトが返される（現状はSDKメッセージそのまま）
      expect(result).not.toBeNull();
      expect(result?.type).toBe('assistant');
    });
  });

  describe('determineClaudeEventType', () => {
    it('正常系: assistantメッセージタイプを判定できる', () => {
      // Given: assistantタイプのメッセージ
      const message: any = { type: 'assistant' };

      // When: determineClaudeEventType関数を呼び出す
      const result = determineClaudeEventType(message);

      // Then: 'assistant'が返される
      expect(result).toBe('assistant');
    });

    it('正常系: stream_eventメッセージタイプを判定できる', () => {
      // Given: stream_eventタイプのメッセージ
      const message: any = { type: 'stream_event' };

      // When: determineClaudeEventType関数を呼び出す
      const result = determineClaudeEventType(message);

      // Then: 'stream_event'が返される
      expect(result).toBe('stream_event');
    });
  });
});
