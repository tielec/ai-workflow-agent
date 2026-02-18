/**
 * ユニットテスト: CodexAgentClient - ARM64 依存エラー検知 (Issue #706)
 *
 * テスト対象:
 * - CodexAgentClient.executeTask() における ARM64 依存エラーの検出と CODEX_CLI_NOT_FOUND 変換
 * - 通常の失敗が CODEX_CLI_NOT_FOUND に誤変換されないことの確認
 *
 * テストシナリオ参照:
 * - 2.1 CodexAgentClient.executeTask
 *   - executeTask_ARM64依存エラー検出_異常系
 *   - executeTask_通常失敗_異常系
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { CodexAgentClient } from '../../src/core/codex-agent-client.js';

describe('CodexAgentClient - ARM64依存エラー検知（Issue #706）', () => {
  let client: CodexAgentClient;
  let workingDir: string;

  type RunCodexProcess = (
    args: string[],
    options: { cwd: string; verbose: boolean; stdinPayload: string }
  ) => Promise<string[]>;

  const spyOnRunCodexProcess = () =>
    jest.spyOn(client as unknown as { runCodexProcess: RunCodexProcess }, 'runCodexProcess');

  beforeEach(() => {
    workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-agent-client-arm64-'));
    client = new CodexAgentClient({ workingDir });
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (workingDir && fs.existsSync(workingDir)) {
      fs.removeSync(workingDir);
    }
  });

  // テストケース: executeTask_ARM64依存エラー検出_異常系
  // 目的: `Missing optional dependency @openai/codex-linux-*` を CODEX_CLI_NOT_FOUND として判定できることを確認
  test('ARM64依存エラー（codex-linux-arm64）がCODEX_CLI_NOT_FOUNDとして検出される', async () => {
    // Given: ARM64 プラットフォームでの依存パッケージ欠落エラー
    const dependencyError = new Error(
      'Missing optional dependency @openai/codex-linux-arm64'
    ) as NodeJS.ErrnoException;
    spyOnRunCodexProcess().mockRejectedValue(dependencyError);

    // When: executeTask を呼び出す
    // Then: CODEX_CLI_NOT_FOUND コードを持つエラーがスローされる
    try {
      await client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      });
      // ここに到達しないことを確認
      expect(true).toBe(false);
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { cause?: unknown };
      expect(err.code).toBe('CODEX_CLI_NOT_FOUND');
      // エラーメッセージにプラットフォーム依存情報が含まれる
      expect(err.message).toContain('optional dependency');
      // 元のエラーが cause に保持される
      expect(err.cause).toBe(dependencyError);
    }
  });

  // テストケース: ARM64以外のプラットフォーム依存エラーでも同様にCODEX_CLI_NOT_FOUNDとなる
  test('ARM64以外のプラットフォーム依存エラーもCODEX_CLI_NOT_FOUNDとして検出される', async () => {
    // Given: x86_64 プラットフォームでの依存パッケージ欠落エラー（仮想シナリオ）
    const dependencyError = new Error(
      'Missing optional dependency @openai/codex-linux-x64'
    ) as NodeJS.ErrnoException;
    spyOnRunCodexProcess().mockRejectedValue(dependencyError);

    // When/Then: CODEX_CLI_NOT_FOUND として検出される
    await expect(
      client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      })
    ).rejects.toMatchObject({ code: 'CODEX_CLI_NOT_FOUND' });
  });

  // テストケース: executeTask_通常失敗_異常系
  // 目的: ARM64 依存エラー以外の失敗が従来通り扱われることを確認
  test('通常のエラーはCODEX_CLI_NOT_FOUNDに変換されない', async () => {
    // Given: Codex CLI 実行が汎用エラーを投げる
    const genericError = new Error('unexpected error') as NodeJS.ErrnoException;
    spyOnRunCodexProcess().mockRejectedValue(genericError);

    // When: executeTask を呼び出す
    // Then: CODEX_CLI_NOT_FOUND には変換されず、元のエラーとして扱われる
    try {
      await client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      });
      expect(true).toBe(false);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // CODEX_CLI_NOT_FOUND ではない
      expect(err.code).toBeUndefined();
      expect(err.message).toBe('unexpected error');
    }
  });

  // テストケース: ENOENT エラーも CODEX_CLI_NOT_FOUND として検出される
  test('ENOENT（バイナリ未検出）エラーもCODEX_CLI_NOT_FOUNDとして検出される', async () => {
    // Given: Codex CLI バイナリが見つからない ENOENT エラー
    const enoentError = new Error('spawn codex ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    spyOnRunCodexProcess().mockRejectedValue(enoentError);

    // When/Then: CODEX_CLI_NOT_FOUND として検出される
    await expect(
      client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      })
    ).rejects.toMatchObject({ code: 'CODEX_CLI_NOT_FOUND' });
  });

  // テストケース: ENOENT を含むメッセージ（コードなし）もCODEX_CLI_NOT_FOUNDとして検出される
  test('ENOENTを含むメッセージ（codeなし）もCODEX_CLI_NOT_FOUNDとして検出される', async () => {
    // Given: code プロパティなしの ENOENT メッセージ
    const enoentMessage = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    spyOnRunCodexProcess().mockRejectedValue(enoentMessage);

    // When/Then: CODEX_CLI_NOT_FOUND として検出される
    await expect(
      client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      })
    ).rejects.toMatchObject({ code: 'CODEX_CLI_NOT_FOUND' });
  });

  // テストケース: ネットワークエラーは CODEX_CLI_NOT_FOUND にならない
  test('ネットワークエラーはCODEX_CLI_NOT_FOUNDに変換されない', async () => {
    // Given: ネットワーク関連のエラー
    const networkError = new Error('ETIMEDOUT: connection timed out') as NodeJS.ErrnoException;
    networkError.code = 'ETIMEDOUT';
    spyOnRunCodexProcess().mockRejectedValue(networkError);

    // When/Then: 元のエラーとしてスローされる
    await expect(
      client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      })
    ).rejects.toThrow('ETIMEDOUT');
  });

  // テストケース: 非ゼロ終了コードのエラーは CODEX_CLI_NOT_FOUND にならない
  test('Codex CLI非ゼロ終了コードエラーはCODEX_CLI_NOT_FOUNDに変換されない', async () => {
    // Given: Codex CLI が非ゼロで終了
    const exitError = new Error('Codex CLI exited with code 1. stderr: API key invalid');
    spyOnRunCodexProcess().mockRejectedValue(exitError);

    // When/Then: 元のエラーとしてスローされる
    try {
      await client.executeTask({
        prompt: 'Test prompt',
        workingDirectory: workingDir,
      });
      expect(true).toBe(false);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      expect(err.code).toBeUndefined();
      expect(err.message).toContain('Codex CLI exited with code 1');
    }
  });
});
