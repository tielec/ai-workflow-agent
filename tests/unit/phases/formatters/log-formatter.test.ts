/**
 * ユニットテスト: log-formatter.ts
 *
 * テスト対象:
 * - LogFormatter.formatAgentLog()
 * - LogFormatter.formatCodexAgentLog()
 * - JSON解析エラーハンドリング
 * - 4000文字切り詰め処理
 */

import { describe, test, expect } from '@jest/globals';
import { LogFormatter } from '../../../../src/phases/formatters/log-formatter.js';

describe('LogFormatter - Claude Agent ログフォーマット', () => {
  const formatter = new LogFormatter();

  test('1-1: Claude Agent の正常系ログが正しくMarkdownに変換される', () => {
    // Given: Claude エージェントの生ログ
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'session_123', model: 'claude-3-5-sonnet-20241022', permissionMode: 'auto', tools: ['Read', 'Write', 'Glob'] }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ファイルを読み込みます' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/path/to/file.ts' } }] } }),
      JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 120000, num_turns: 3, result: 'ファイル読み込み成功' }),
    ];
    const startTime = 1706000000000; // 2024-01-23 12:00:00
    const endTime = 1706000120000; // 2024-01-23 12:02:00
    const duration = 120000; // 2分
    const error = null;
    const agentName = 'Claude Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: Markdown 形式のログが返される
    expect(result).toContain('# Claude Agent 実行ログ');
    expect(result).toContain('session_123');
    expect(result).toContain('claude-3-5-sonnet-20241022');
    expect(result).toContain('Read, Write, Glob');
    expect(result).toContain('ファイルを読み込みます');
    expect(result).toContain('Read');
    expect(result).toContain('/path/to/file.ts');
    expect(result).toContain('実行完了');
    expect(result).toContain('120000ms');
    expect(result).not.toContain('エラー');
  });

  test('1-2: Claude Agent のエラー時ログにエラー情報が含まれる', () => {
    // Given: エラーが発生したケース
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'session_456' }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000;
    const error = new Error('Authentication failed: invalid bearer token');
    const agentName = 'Claude Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: エラー情報が含まれる
    expect(result).toContain('# Claude Agent 実行ログ');
    expect(result).toContain('**エラー**: Authentication failed: invalid bearer token');
  });

  test('1-3: Claude Agent の空メッセージ配列でも正常にフォーマットされる', () => {
    // Given: 空のメッセージ配列
    const messages: string[] = [];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000;
    const error = null;
    const agentName = 'Claude Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: 基本情報のみのログが返される
    expect(result).toContain('# Claude Agent 実行ログ');
    expect(result).toContain('60000ms');
    // 日本語ロケール (ja-JP) では 2024/1/23 形式で出力される
    expect(result).toMatch(/2024\/1\/23|2024-01-23/);
  });
});

describe('LogFormatter - Codex Agent ログフォーマット', () => {
  const formatter = new LogFormatter();

  test('2-1: Codex Agent の正常系ログが正しくMarkdownに変換される', () => {
    // Given: Codex エージェントの JSON イベントストリーム
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_abc123' }),
      JSON.stringify({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls -la' } }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'ls -la', status: 'completed', exit_code: 0, aggregated_output: 'total 10\ndrwxr-xr-x 5 user group' } }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 60000, turns: 2 }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000; // 1分
    const error = null;
    const agentName = 'Codex Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: Markdown 形式のログが返される
    expect(result).toContain('# Codex Agent 実行ログ');
    expect(result).toContain('thread_abc123');
    expect(result).toContain('コマンド実行');
    expect(result).toContain('ls -la');
    expect(result).toContain('completed');
    expect(result).toContain('exit_code=0');
    expect(result).toContain('total 10');
    expect(result).toContain('60000ms');
    expect(result).toContain('**ターン数**: 2');
  });

  test('2-2: Codex Agent の4000文字超過出力が切り詰められる', () => {
    // Given: 4000文字を超える出力
    const longOutput = 'a'.repeat(5000);
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_xyz' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item_2', type: 'command_execution', status: 'completed', aggregated_output: longOutput } }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000;
    const error = null;
    const agentName = 'Codex Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: 出力が4000文字に切り詰められる
    expect(result).toContain('# Codex Agent 実行ログ');
    expect(result).toContain('... (truncated)');
    expect(result.length).toBeLessThan(longOutput.length + 1000); // 元の長さより大幅に短い
  });

  test('2-3: Codex Agent のエラー時ログにエラー情報が含まれる', () => {
    // Given: エラーが発生したケース
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_error' }),
      JSON.stringify({ type: 'response.completed', status: 'failed', duration_ms: 30000, turns: 1 }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000030000;
    const duration = 30000;
    const error = new Error('Codex API error');
    const agentName = 'Codex Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: エラー情報が含まれる
    expect(result).toContain('# Codex Agent 実行ログ');
    expect(result).toContain('**エラー**: Codex API error');
  });

  test('2-4: Codex Agent の不正なJSONがある場合でも部分的にフォーマットされる', () => {
    // Given: 不正なJSONを含むメッセージ
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_123' }),
      'invalid json {{{', // 不正なJSON
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 60000, turns: 1 }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000;
    const error = null;
    const agentName = 'Codex Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: 有効なJSONのみがフォーマットされる
    expect(result).toContain('# Codex Agent 実行ログ');
    expect(result).toContain('thread_123');
    expect(result).toContain('実行完了');
    // 不正なJSONはスキップされる
  });

  test('2-5: Codex Agent のパース完全失敗時はフォールバックログが返される', () => {
    // Given: すべてのメッセージが不正なJSON
    const messages = [
      'invalid json 1',
      'invalid json 2',
    ];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000;
    const error = null;
    const agentName = 'Codex Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: フォールバックログが返される
    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain('```json');
    expect(result).toContain('invalid json 1');
    expect(result).toContain('invalid json 2');
    expect(result).toContain('60000ms');
  });
});

describe('LogFormatter - formatCodexAgentLog 直接呼び出し', () => {
  const formatter = new LogFormatter();

  test('3-1: formatCodexAgentLog が正常なログを返す', () => {
    // Given: 正常なCodex ログ
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_direct' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 10000, turns: 1 }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000010000;
    const duration = 10000;
    const error = null;

    // When: formatCodexAgentLog を直接呼び出し
    const result = formatter.formatCodexAgentLog(messages, startTime, endTime, duration, error);

    // Then: Markdown ログが返される
    expect(result).not.toBeNull();
    expect(result).toContain('# Codex Agent 実行ログ');
    expect(result).toContain('thread_direct');
  });

  test('3-2: formatCodexAgentLog が不正なJSONのみの場合 null を返す', () => {
    // Given: すべて不正なJSON
    const messages = [
      'invalid json {{{',
    ];
    const startTime = 1706000000000;
    const endTime = 1706000010000;
    const duration = 10000;
    const error = null;

    // When: formatCodexAgentLog を直接呼び出し
    const result = formatter.formatCodexAgentLog(messages, startTime, endTime, duration, error);

    // Then: null が返される
    expect(result).toBeNull();
  });

  test('3-3: formatCodexAgentLog が空配列の場合 null を返す', () => {
    // Given: 空のメッセージ配列
    const messages: string[] = [];
    const startTime = 1706000000000;
    const endTime = 1706000010000;
    const duration = 10000;
    const error = null;

    // When: formatCodexAgentLog を直接呼び出し
    const result = formatter.formatCodexAgentLog(messages, startTime, endTime, duration, error);

    // Then: null が返される
    expect(result).toBeNull();
  });
});

describe('LogFormatter - エッジケース', () => {
  const formatter = new LogFormatter();

  test('4-1: 実行時間が0msの場合でも正常にフォーマットされる', () => {
    // Given: 実行時間が0ms
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'fast' }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000000000;
    const duration = 0;
    const error = null;
    const agentName = 'Claude Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: 0msが表示される
    expect(result).toContain('0ms');
  });

  test('4-2: 非常に長いエラーメッセージでも正常にフォーマットされる', () => {
    // Given: 長いエラーメッセージ
    const longErrorMessage = 'Error: ' + 'x'.repeat(1000);
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'error_test' }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000060000;
    const duration = 60000;
    const error = new Error(longErrorMessage);
    const agentName = 'Claude Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: エラーメッセージ全体が含まれる
    expect(result).toContain('**エラー**:');
    expect(result).toContain('x'.repeat(100)); // エラーメッセージの一部が含まれる
  });

  test('4-3: タイムスタンプが未来日時でも正常にフォーマットされる', () => {
    // Given: 未来の日時 (UTC+9でも2099年のまま)
    const futureTime = Date.UTC(2099, 0, 1, 0, 0, 0); // 2099-01-01 00:00:00 UTC
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'future' }),
    ];
    const startTime = futureTime;
    const endTime = futureTime + 60000;
    const duration = 60000;
    const error = null;
    const agentName = 'Claude Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: 未来の日時が正常に表示される
    expect(result).toContain('2099');
  });

  test('4-4: 特殊文字を含むコマンドでも正常にフォーマットされる', () => {
    // Given: 特殊文字を含むコマンド
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'special' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item_special', command: 'grep "test" | awk \'{print $1}\' && echo "done"', status: 'completed' } }),
    ];
    const startTime = 1706000000000;
    const endTime = 1706000010000;
    const duration = 10000;
    const error = null;
    const agentName = 'Codex Agent';

    // When: ログをフォーマット
    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, agentName);

    // Then: 特殊文字がエスケープされずに含まれる
    expect(result).toContain('grep "test"');
    expect(result).toContain('awk');
    expect(result).toContain('echo "done"');
  });
});

/**
 * Issue #597: i18n Language Support Tests
 *
 * Test coverage for LogFormatter internationalization:
 * - Constructor language parameter handling
 * - Claude Agent log formatting in Japanese and English
 * - Codex Agent log formatting in Japanese and English
 * - Item type translations
 * - Timestamp locale formatting
 * - Backward compatibility
 */
describe('LogFormatter - Constructor Tests', () => {
  // Test Case: constructor_default_language_is_japanese
  test('6-1: default constructor uses Japanese language, messages, and locale', () => {
    // Given: LogFormatter instantiated without parameters
    const formatter = new LogFormatter();

    // When: Format a basic Claude Agent log
    const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-default',
        model: 'claude-3',
        permissionMode: 'default',
        tools: ['read'],
      }),
    ];
    const result = formatter.formatAgentLog(messages, startTime, startTime + 1000, 1000, null, 'Claude Agent');

    // Then: Output uses Japanese labels and ja-JP locale
    expect(result).toContain('# Claude Agent 実行ログ');
    expect(result).toContain('生成日時:');
    expect(result).toContain('システム初期化');
    expect(result).toContain('**セッションID**:');
    expect(result).toContain('**モデル**:');
    expect(result).toContain('**権限モード**:');
    expect(result).toContain('**利用可能ツール**:');
    expect(result).toContain('**経過時間**:');
    expect(result).toContain('**開始**:');
    expect(result).toContain('**終了**:');
  });

  // Test Case: constructor_explicit_japanese_language
  test('6-2: explicit Japanese language parameter produces same output as default', () => {
    // Given: LogFormatter instantiated with explicit 'ja' parameter
    const formatterDefault = new LogFormatter();
    const formatterExplicitJa = new LogFormatter('ja');

    const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-ja-explicit',
        model: 'claude-3',
        permissionMode: 'default',
        tools: ['read'],
      }),
    ];

    // When: Both formatters format the same input
    const resultDefault = formatterDefault.formatAgentLog(messages, startTime, startTime + 1000, 1000, null, 'Claude Agent');
    const resultExplicitJa = formatterExplicitJa.formatAgentLog(messages, startTime, startTime + 1000, 1000, null, 'Claude Agent');

    // Then: Both outputs match
    expect(resultDefault).toEqual(resultExplicitJa);
    expect(resultExplicitJa).toContain('# Claude Agent 実行ログ');
    expect(resultExplicitJa).toContain('生成日時:');
  });

  // Test Case: constructor_explicit_english_language
  test('6-3: explicit English language parameter uses English labels and en-US locale', () => {
    // Given: LogFormatter instantiated with 'en' parameter
    const formatter = new LogFormatter('en');

    const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-en-explicit',
        model: 'claude-3',
        permissionMode: 'default',
        tools: ['read'],
      }),
    ];
    const result = formatter.formatAgentLog(messages, startTime, startTime + 1000, 1000, null, 'Claude Agent');

    // Then: Output uses English labels and en-US locale
    expect(result).toContain('# Claude Agent Execution Log');
    expect(result).toContain('Generated At:');
    expect(result).toContain('System Initialization');
    expect(result).toContain('**Session ID**:');
    expect(result).toContain('**Model**:');
    expect(result).toContain('**Permission Mode**:');
    expect(result).toContain('**Available Tools**:');
    expect(result).toContain('**Total Elapsed**:');
    expect(result).toContain('**Started**:');
    expect(result).toContain('**Finished**:');
  });
});

describe('LogFormatter - Claude Agent Japanese Tests (Default Behavior)', () => {
  const formatter = new LogFormatter('ja');
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: formatAgentLog_claude_japanese_ai_response_section
  test('7-1: AI response section uses Japanese label', () => {
    const messages = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'これはAI応答です' }] },
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('AI応答');
    expect(result).toContain('これはAI応答です');
  });

  // Test Case: formatAgentLog_claude_japanese_tool_use_section
  test('7-2: tool use section uses Japanese labels', () => {
    const messages = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'read',
            input: { file_path: '/test/file.txt' },
          }],
        },
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('ツール使用');
    expect(result).toContain('**ツール**: `read`');
    expect(result).toContain('**パラメータ**:');
    expect(result).toContain('`file_path`: `/test/file.txt`');
  });

  // Test Case: formatAgentLog_claude_japanese_execution_complete_section
  test('7-3: execution complete section uses Japanese labels', () => {
    const messages = [
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 5000,
        num_turns: 3,
        result: '処理が完了しました',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('実行完了');
    expect(result).toContain('**ステータス**: success');
    expect(result).toContain('**所要時間**: 5000ms');
    expect(result).toContain('**ターン数**: 3');
  });

  // Test Case: formatAgentLog_claude_japanese_footer_section
  test('7-4: footer section uses Japanese labels', () => {
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-footer',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('**経過時間**: 60000ms');
    expect(result).toContain('**開始**:');
    expect(result).toContain('**終了**:');
  });

  // Test Case: formatAgentLog_claude_japanese_error_section
  test('7-5: error section uses Japanese label', () => {
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-error',
      }),
    ];
    const error = new Error('テストエラー');

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, 'Claude Agent');

    expect(result).toContain('**エラー**: テストエラー');
  });
});

describe('LogFormatter - Claude Agent English Tests', () => {
  const formatter = new LogFormatter('en');
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: formatAgentLog_claude_english_ai_response_section
  test('8-1: AI response section uses English label', () => {
    const messages = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'This is an AI response' }] },
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('AI Response');
    expect(result).toContain('This is an AI response');
    expect(result).not.toContain('AI応答');
  });

  // Test Case: formatAgentLog_claude_english_tool_use_section
  test('8-2: tool use section uses English labels', () => {
    const messages = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'write',
            input: { file_path: '/output/result.txt', content: 'Hello' },
          }],
        },
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('Tool Use');
    expect(result).toContain('**Tool**: `write`');
    expect(result).toContain('**Parameters**:');
    expect(result).not.toContain('ツール使用');
    expect(result).not.toContain('パラメータ');
  });

  // Test Case: formatAgentLog_claude_english_execution_complete_section
  test('8-3: execution complete section uses English labels', () => {
    const messages = [
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 10000,
        num_turns: 5,
        result: 'Task completed successfully',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('Execution Complete');
    expect(result).toContain('**Status**: success');
    expect(result).toContain('**Elapsed**: 10000ms');
    expect(result).toContain('**Turns**: 5');
    expect(result).not.toContain('実行完了');
    expect(result).not.toContain('所要時間');
    expect(result).not.toContain('ターン数');
  });

  // Test Case: formatAgentLog_claude_english_footer_section
  test('8-4: footer section uses English labels', () => {
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-footer-en',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('**Total Elapsed**: 60000ms');
    expect(result).toContain('**Started**:');
    expect(result).toContain('**Finished**:');
    expect(result).not.toContain('経過時間');
    expect(result).not.toContain('開始');
    expect(result).not.toContain('終了');
  });

  // Test Case: formatAgentLog_claude_english_error_section
  test('8-5: error section uses English label', () => {
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-error-en',
      }),
    ];
    const error = new Error('Test error message');

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, 'Claude Agent');

    expect(result).toContain('**Error**: Test error message');
    expect(result).not.toContain('エラー');
  });
});

describe('LogFormatter - Codex Agent Japanese Tests', () => {
  const formatter = new LogFormatter('ja');
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: formatCodexAgentLog_japanese_headers
  test('9-1: Codex Agent log uses Japanese headers', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_ja_test' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('# Codex Agent 実行ログ');
    expect(result).toContain('開始日時:');
    // Verify ja-JP locale format in timestamp
    const expectedDateFormat = new Date(startTime).toLocaleString('ja-JP');
    expect(result).toContain(expectedDateFormat);
  });

  // Test Case: formatCodexAgentLog_japanese_thread_start_section
  test('9-2: thread start section uses Japanese label', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_ja_123' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('スレッド開始');
    expect(result).toContain('thread_ja_123');
  });

  // Test Case: formatCodexAgentLog_japanese_tool_execution_section
  test('9-3: tool execution section uses Japanese labels', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_tool_ja' }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'ls -la',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'output text',
        },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 2000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('ツール実行');
    expect(result).toContain('**種別**: コマンド実行');
    expect(result).toContain('**コマンド**: `ls -la`');
    expect(result).toContain('**ステータス**: completed (exit_code=0)');
  });

  // Test Case: formatCodexAgentLog_japanese_execution_complete_section
  test('9-4: execution complete section uses Japanese labels', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_complete_ja' }),
      JSON.stringify({
        type: 'response.completed',
        status: 'completed',
        duration_ms: 10000,
        turns: 5,
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('実行完了');
    expect(result).toContain('**ステータス**: completed');
    expect(result).toContain('**所要時間**: 10000ms');
    expect(result).toContain('**ターン数**: 5');
  });

  // Test Case: formatCodexAgentLog_japanese_footer_section
  test('9-5: footer section uses Japanese labels', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_footer_ja' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('**経過時間**: 60000ms');
    expect(result).toContain('**開始**:');
    expect(result).toContain('**終了**:');
  });

  // Test Case: formatCodexAgentLog_japanese_error_section
  test('9-6: error section uses Japanese label', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_error_ja' }),
      JSON.stringify({ type: 'response.completed', status: 'failed', duration_ms: 1000, turns: 1 }),
    ];
    const error = new Error('Codex APIエラー');

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, 'Codex Agent');

    expect(result).toContain('**エラー**: Codex APIエラー');
  });
});

describe('LogFormatter - Codex Agent English Tests', () => {
  const formatter = new LogFormatter('en');
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: formatCodexAgentLog_english_headers
  test('10-1: Codex Agent log uses English headers', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_en_test' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain('Started At:');
    // Verify en-US locale format in timestamp
    const expectedDateFormat = new Date(startTime).toLocaleString('en-US');
    expect(result).toContain(expectedDateFormat);
    expect(result).not.toContain('Codex Agent 実行ログ');
    expect(result).not.toContain('開始日時');
  });

  // Test Case: formatCodexAgentLog_english_thread_start_section
  test('10-2: thread start section uses English label', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_en_123' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('Thread Started');
    expect(result).toContain('thread_en_123');
    expect(result).not.toContain('スレッド開始');
  });

  // Test Case: formatCodexAgentLog_english_tool_execution_section
  test('10-3: tool execution section uses English labels', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_tool_en' }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_en_1',
          type: 'command_execution',
          command: 'pwd',
          status: 'completed',
          exit_code: 0,
          aggregated_output: '/home/user',
        },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 2000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('Tool Execution');
    expect(result).toContain('**Type**: Command Execution');
    expect(result).toContain('**Command**: `pwd`');
    expect(result).toContain('**Status**: completed (exit_code=0)');
    expect(result).not.toContain('ツール実行');
    expect(result).not.toContain('種別');
    expect(result).not.toContain('コマンド実行');
  });

  // Test Case: formatCodexAgentLog_english_execution_complete_section
  test('10-4: execution complete section uses English labels', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_complete_en' }),
      JSON.stringify({
        type: 'response.completed',
        status: 'completed',
        duration_ms: 15000,
        turns: 7,
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('Execution Complete');
    expect(result).toContain('**Status**: completed');
    expect(result).toContain('**Elapsed**: 15000ms');
    expect(result).toContain('**Turns**: 7');
    expect(result).not.toContain('実行完了');
    expect(result).not.toContain('ステータス');
    expect(result).not.toContain('所要時間');
    expect(result).not.toContain('ターン数');
  });

  // Test Case: formatCodexAgentLog_english_footer_section
  test('10-5: footer section uses English labels', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_footer_en' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('**Total Elapsed**: 60000ms');
    expect(result).toContain('**Started**:');
    expect(result).toContain('**Finished**:');
    expect(result).not.toContain('経過時間');
    expect(result).not.toContain('開始');
    expect(result).not.toContain('終了');
  });

  // Test Case: formatCodexAgentLog_english_error_section
  test('10-6: error section uses English label', () => {
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_error_en' }),
      JSON.stringify({ type: 'response.completed', status: 'failed', duration_ms: 1000, turns: 1 }),
    ];
    const error = new Error('Codex API error');

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, 'Codex Agent');

    expect(result).toContain('**Error**: Codex API error');
    expect(result).not.toContain('エラー');
  });
});

describe('LogFormatter - Item Type Translation Tests', () => {
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: describeItemType_japanese_command_execution
  test('11-1: command_execution translates to Japanese', () => {
    const formatter = new LogFormatter('ja');
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_cmd_ja' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_cmd', type: 'command_execution', status: 'completed' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('コマンド実行');
  });

  // Test Case: describeItemType_japanese_tool
  test('11-2: tool translates to Japanese', () => {
    const formatter = new LogFormatter('ja');
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_tool_ja' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_tool', type: 'tool', status: 'completed' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('**種別**: ツール');
  });

  // Test Case: describeItemType_english_command_execution
  test('11-3: command_execution translates to English', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_cmd_en' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_cmd_en', type: 'command_execution', status: 'completed' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('Command Execution');
    expect(result).not.toContain('コマンド実行');
  });

  // Test Case: describeItemType_english_tool
  test('11-4: tool translates to English', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_tool_en' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_tool_en', type: 'tool', status: 'completed' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('**Type**: Tool');
    expect(result).not.toContain('ツール');
  });

  // Test Case: describeItemType_unknown_type_passthrough
  test('11-5: unknown item types are returned unchanged', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_unknown' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_unknown', type: 'custom_type', status: 'completed' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('**Type**: custom_type');
  });
});

describe('LogFormatter - Timestamp Locale Tests', () => {
  // Test Case: timestamp_japanese_locale_format
  test('12-1: timestamps use ja-JP locale when language is ja', () => {
    const formatter = new LogFormatter('ja');
    const startTime = Date.UTC(2024, 0, 1, 0, 0, 0); // 2024-01-01 00:00:00 UTC
    const endTime = startTime + 60_000;
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'timestamp_ja' }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, 60_000, null, 'Claude Agent');

    // Verify the timestamp is in ja-JP format
    const expectedStart = new Date(startTime).toLocaleString('ja-JP');
    const expectedEnd = new Date(endTime).toLocaleString('ja-JP');
    expect(result).toContain(expectedStart);
    expect(result).toContain(expectedEnd);
  });

  // Test Case: timestamp_english_locale_format
  test('12-2: timestamps use en-US locale when language is en', () => {
    const formatter = new LogFormatter('en');
    const startTime = Date.UTC(2024, 0, 1, 0, 0, 0); // 2024-01-01 00:00:00 UTC
    const endTime = startTime + 60_000;
    const messages = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'timestamp_en' }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, 60_000, null, 'Claude Agent');

    // Verify the timestamp is in en-US format
    const expectedStart = new Date(startTime).toLocaleString('en-US');
    const expectedEnd = new Date(endTime).toLocaleString('en-US');
    expect(result).toContain(expectedStart);
    expect(result).toContain(expectedEnd);
  });
});

describe('LogFormatter - Fallback Log Tests', () => {
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: fallback_log_remains_english_when_japanese_configured
  test('13-1: fallback log remains English when Japanese configured', () => {
    const formatter = new LogFormatter('ja');
    const messages = ['not valid json', '{broken json'];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    // Fallback log should be in English regardless of language setting
    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain('**Elapsed**:');
    expect(result).toContain('**Started**:');
    expect(result).toContain('**Finished**:');
    expect(result).not.toContain('Codex Agent 実行ログ');
    expect(result).not.toContain('経過時間');
    expect(result).not.toContain('開始日時');
  });

  // Test Case: fallback_log_remains_english_when_english_configured
  test('13-2: fallback log remains English when English configured', () => {
    const formatter = new LogFormatter('en');
    const messages = ['invalid json 1', 'invalid json 2'];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    // Same behavior for English config
    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain('**Elapsed**:');
    expect(result).toContain('**Started**:');
    expect(result).toContain('**Finished**:');
  });

  // Test Case: fallback_log_with_error
  test('13-3: fallback log includes error in English', () => {
    const formatter = new LogFormatter('ja');
    const messages = ['not json'];
    const error = new Error('Parse failure');

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, error, 'Codex Agent');

    expect(result).toContain('**Error**: Parse failure');
    expect(result).not.toContain('エラー');
  });
});

describe('LogFormatter - Unknown Tools Label Tests', () => {
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: unknown_tools_japanese_label
  test('14-1: Unknown tools label in Japanese when tools is null', () => {
    const formatter = new LogFormatter('ja');
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'unknown_ja',
        model: 'claude-3',
        permissionMode: 'default',
        tools: null,
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('**利用可能ツール**: 不明');
  });

  // Test Case: unknown_tools_english_label
  test('14-2: Unknown tools label in English when tools is undefined', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'unknown_en',
        model: 'claude-3',
        permissionMode: 'default',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('**Available Tools**: Unknown');
  });
});

describe('LogFormatter - Backward Compatibility Tests', () => {
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  // Test Case: existing_japanese_output_unchanged
  test('15-1: existing Japanese output matches previous behavior', () => {
    // Given: LogFormatter instantiated without parameters (default)
    const formatter = new LogFormatter();
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'backward_compat',
        model: 'claude-3',
        permissionMode: 'default',
        tools: ['read', 'write'],
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 5000,
        num_turns: 2,
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    // Then: All Japanese labels are present (backward compatible)
    expect(result).toContain('# Claude Agent 実行ログ');
    expect(result).toContain('生成日時:');
    expect(result).toContain('システム初期化');
    expect(result).toContain('**セッションID**:');
    expect(result).toContain('**モデル**:');
    expect(result).toContain('**権限モード**:');
    expect(result).toContain('**利用可能ツール**:');
    expect(result).toContain('実行完了');
    expect(result).toContain('**ステータス**:');
    expect(result).toContain('**所要時間**:');
    expect(result).toContain('**ターン数**:');
    expect(result).toContain('**経過時間**:');
    expect(result).toContain('**開始**:');
    expect(result).toContain('**終了**:');
  });

  // Test Case: no_japanese_strings_in_english_output
  test('15-2: no Japanese characters in English output', () => {
    // Given: LogFormatter instantiated with 'en'
    const formatter = new LogFormatter('en');

    // Comprehensive message array covering all sections
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'no_ja_test',
        model: 'claude-3',
        permissionMode: 'sandbox',
        tools: ['read', 'write', 'glob'],
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'English response text' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'read',
            input: { file_path: '/test/path.txt' },
          }],
        },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 10000,
        num_turns: 4,
        result: 'Success result',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    // Regex to detect Japanese characters (Hiragana, Katakana, Kanji)
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

    expect(japaneseRegex.test(result)).toBe(false);
    expect(result).toContain('# Claude Agent Execution Log');
    expect(result).toContain('Generated At:');
    expect(result).toContain('System Initialization');
  });

  // Test Case: codex_no_japanese_strings_in_english_output
  test('15-3: no Japanese characters in English Codex output', () => {
    const formatter = new LogFormatter('en');

    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_no_ja' }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'echo hello',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'hello',
        },
      }),
      JSON.stringify({
        type: 'response.completed',
        status: 'completed',
        duration_ms: 5000,
        turns: 2,
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    // Regex to detect Japanese characters
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

    expect(japaneseRegex.test(result)).toBe(false);
    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain('Started At:');
    expect(result).toContain('Thread Started');
    expect(result).toContain('Tool Execution');
    expect(result).toContain('Command Execution');
  });
});

describe('LogFormatter - language awareness and i18n output', () => {
  const startTime = Date.UTC(2024, 0, 1, 0, 0, 0);
  const endTime = startTime + 60_000;
  const duration = 60_000;

  test('5-1: defaults to Japanese labels and locale', () => {
    const formatter = new LogFormatter();
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'session_ja_default',
        model: 'claude-3',
        permissionMode: 'default',
        tools: ['read', 'write'],
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');
    const expectedDate = new Date(startTime).toLocaleString('ja-JP');

    expect(result).toContain('# Claude Agent 実行ログ');
    expect(result).toContain(`生成日時: ${expectedDate}`);
    expect(result).toContain('**利用可能ツール**: read, write');
    expect(result).not.toContain('Generated At');
  });

  test('5-2: uses English labels and locale when language is en', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'session_en',
        model: 'claude-3',
        permissionMode: 'sandbox',
        tools: ['read'],
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');
    const expectedDate = new Date(startTime).toLocaleString('en-US');

    expect(result).toContain('# Claude Agent Execution Log');
    expect(result).toContain(`Generated At: ${expectedDate}`);
    expect(result).toContain('**Available Tools**: read');
    expect(result).not.toContain('Claude Agent 実行ログ');
  });

  test('5-3: Claude Agent sections are fully localized in English', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-session-123',
        model: 'claude-3-5',
        permissionMode: 'restricted',
        tools: ['read', 'write', 'glob'],
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'This is an English response.' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'read', input: { file_path: '/tmp/file.txt' } }] },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 5000,
        num_turns: 3,
        result: 'Completed successfully',
      }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Claude Agent');

    expect(result).toContain('# Claude Agent Execution Log');
    expect(result).toContain('System Initialization');
    expect(result).toContain('**Session ID**: `test-session-123`');
    expect(result).toContain('**Model**: claude-3-5');
    expect(result).toContain('**Permission Mode**: restricted');
    expect(result).toContain('**Available Tools**: read, write, glob');
    expect(result).toContain('## Turn 2: AI Response');
    expect(result).toContain('This is an English response.');
    expect(result).toContain('## Turn 3: Tool Use');
    expect(result).toContain('**Tool**: `read`');
    expect(result).toContain('**Parameters**:');
    expect(result).toContain('`file_path`: `/tmp/file.txt`');
    expect(result).toContain('## Turn 4: Execution Complete');
    expect(result).toContain('**Status**: success');
    expect(result).toContain('**Elapsed**: 5000ms');
    expect(result).toContain('**Turns**: 3');
    expect(result).toContain('**Total Elapsed**: 60000ms');
    expect(result).toContain('**Started**:');
    expect(result).toContain('**Finished**:');
    expect(result).not.toContain('システム初期化');
  });

  test('5-4: Codex Agent logs translate sections and item types in English', () => {
    const formatter = new LogFormatter('en');
    const messages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_en_1' }),
      JSON.stringify({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls -la' } }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'total 2\nfile.txt',
        },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 10000, turns: 2 }),
    ];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');
    const expectedStart = new Date(startTime).toLocaleString('en-US');

    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain(`Started At: ${expectedStart}`);
    expect(result).toContain('## Turn 1: Thread Started');
    expect(result).toContain('thread_en_1');
    expect(result).toContain('## Turn 2: Tool Execution');
    expect(result).toContain('**Type**: Command Execution');
    expect(result).toContain('**Command**: `ls -la`');
    expect(result).toContain('**Status**: completed (exit_code=0)');
    expect(result).toContain('## Turn 3: Execution Complete');
    expect(result).toContain('**Total Elapsed**: 60000ms');
    expect(result).toContain('**Finished**:');
  });

  test('5-5: Item type translation and passthrough reflect selected language', () => {
    const formatterJa = new LogFormatter('ja');
    const jaMessages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_localized' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_tool', type: 'tool', status: 'completed', aggregated_output: 'done' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 1000, turns: 1 }),
    ];
    const jaResult = formatterJa.formatAgentLog(jaMessages, startTime, endTime, duration, null, 'Codex Agent');

    expect(jaResult).toContain('**種別**: ツール');

    const formatterEn = new LogFormatter('en');
    const enMessages = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_passthrough' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_custom', type: 'custom_type', status: 'completed' },
      }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 2000, turns: 1 }),
    ];
    const enResult = formatterEn.formatAgentLog(enMessages, startTime, endTime, duration, null, 'Codex Agent');

    expect(enResult).toContain('**Type**: custom_type');
  });

  test('5-6: Available tools fall back to localized unknown label', () => {
    const jaFormatter = new LogFormatter('ja');
    const jaMessages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'unknown_tools',
        model: 'claude-3',
        permissionMode: 'default',
        tools: null,
      }),
    ];
    const jaResult = jaFormatter.formatAgentLog(jaMessages, startTime, endTime, duration, null, 'Claude Agent');
    expect(jaResult).toContain('**利用可能ツール**: 不明');

    const enFormatter = new LogFormatter('en');
    const enMessages = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'unknown_tools_en',
        model: 'claude-3',
        permissionMode: 'default',
        tools: undefined,
      }),
    ];
    const enResult = enFormatter.formatAgentLog(enMessages, startTime, endTime, duration, null, 'Claude Agent');
    expect(enResult).toContain('**Available Tools**: Unknown');
  });

  test('5-7: Codex fallback log stays English even when language is en', () => {
    const formatter = new LogFormatter('en');
    const messages = ['not-json', '{broken'];

    const result = formatter.formatAgentLog(messages, startTime, endTime, duration, null, 'Codex Agent');

    expect(result).toContain('# Codex Agent Execution Log');
    expect(result).toContain('```json');
    expect(result).toContain('**Elapsed**: 60000ms');
    expect(result).toContain('**Finished**:');
    expect(result).not.toContain('Codex Agent 実行ログ');
  });
});
