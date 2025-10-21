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
    expect(result).toContain('2024-01-23');
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
    expect(result).toContain('ターン数: 2');
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
    // Given: 未来の日時
    const futureTime = new Date('2099-12-31T23:59:59Z').getTime();
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
