/**
 * ユニットテスト: rollback コマンドモジュール
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - validateRollbackOptions()
 * - loadRollbackReason()
 * - confirmRollback()
 * - generateRollbackReasonMarkdown()
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  validateRollbackOptions,
  loadRollbackReason,
  generateRollbackReasonMarkdown,
  getPhaseNumber
} from '../../../src/commands/rollback.js';
import type { RollbackCommandOptions } from '../../../src/types/commands.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import * as fs from 'fs-extra';
import * as path from 'node:path';

// モジュールのモック
jest.mock('fs-extra');

describe('Rollback コマンド - バリデーション', () => {
  let metadataManager: MetadataManager;
  const testWorkflowDir = '/test/.ai-workflow/issue-90';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);
    metadataManager = new MetadataManager(testMetadataPath);

    // メタデータの初期化（implementation フェーズが完了している状態）
    metadataManager.data.phases.implementation.status = 'completed';
  });

  // =============================================================================
  // UC-RC-01: validateRollbackOptions() - 有効なオプション
  // =============================================================================
  describe('UC-RC-01: validateRollbackOptions() - 有効なオプション', () => {
    test('有効なオプションでバリデーションが成功する', () => {
      // Given: 有効なオプション
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'Type definition missing...',
        toStep: 'revise'
      };

      // When & Then: バリデーションが成功する（例外がスローされない）
      expect(() => validateRollbackOptions(options, metadataManager)).not.toThrow();
    });
  });

  // =============================================================================
  // UC-RC-02: validateRollbackOptions() - 無効なフェーズ名
  // =============================================================================
  describe('UC-RC-02: validateRollbackOptions() - 無効なフェーズ名', () => {
    test('無効なフェーズ名が指定された場合にエラーがスローされる', () => {
      // Given: 無効なフェーズ名
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'invalid-phase',
        reason: 'Test'
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/Invalid phase name/);
    });
  });

  // =============================================================================
  // UC-RC-03: validateRollbackOptions() - 無効なステップ名
  // =============================================================================
  describe('UC-RC-03: validateRollbackOptions() - 無効なステップ名', () => {
    test('無効なステップ名が指定された場合にエラーがスローされる', () => {
      // Given: 無効なステップ名
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        toStep: 'invalid-step',
        reason: 'Test'
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/Invalid step/);
    });
  });

  // =============================================================================
  // UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し
  // =============================================================================
  describe('UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し', () => {
    test('未開始（pending）フェーズへの差し戻しがエラーになる', () => {
      // Given: 未開始フェーズ（documentation）
      metadataManager.data.phases.documentation.status = 'pending';
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'documentation',
        reason: 'Test'
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/has not been started yet/);
    });
  });

  // =============================================================================
  // UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定
  // =============================================================================
  describe('UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定', () => {
    test('差し戻し理由が指定されていない場合にエラーがスローされる', () => {
      // Given: 差し戻し理由が未指定
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation'
        // reason, reasonFile, interactive が未指定
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/Rollback reason is required/);
    });
  });
});

describe('Rollback コマンド - 差し戻し理由の読み込み', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-90';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）
  // =============================================================================
  describe('UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）', () => {
    test('--reasonオプションで差し戻し理由が正しく読み込まれる', async () => {
      // Given: --reasonオプションが指定されている
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: '  Type definition missing...  '
      };

      // When: loadRollbackReason()を呼び出す
      const reason = await loadRollbackReason(options, testWorkflowDir);

      // Then: トリムされた理由が返される
      expect(reason).toBe('Type definition missing...');
    });
  });

  // =============================================================================
  // UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）
  // =============================================================================
  describe('UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）', () => {
    test('空文字列が指定された場合にエラーがスローされる', async () => {
      // Given: 空文字列
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: '   '
      };

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/cannot be empty/);
    });
  });

  // =============================================================================
  // UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）
  // =============================================================================
  describe('UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）', () => {
    test('1000文字を超える理由が指定された場合にエラーがスローされる', async () => {
      // Given: 1000文字超の理由
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'a'.repeat(1001)
      };

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/1000 characters or less/);
    });
  });

  // =============================================================================
  // UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）
  // =============================================================================
  describe('UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）', () => {
    test('--reason-fileオプションでファイルから差し戻し理由が読み込まれる', async () => {
      // Given: ファイルが存在する
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reasonFile: '/path/to/review/result.md'
      };
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.statSync as jest.MockedFunction<typeof fs.statSync>).mockReturnValue({ size: 1024 } as any);
      (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue('Review result content' as any);

      // When: loadRollbackReason()を呼び出す
      const reason = await loadRollbackReason(options, testWorkflowDir);

      // Then: ファイルの内容が返される
      expect(reason).toBe('Review result content');
    });
  });

  // =============================================================================
  // UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）
  // =============================================================================
  describe('UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）', () => {
    test('指定されたファイルが存在しない場合にエラーがスローされる', async () => {
      // Given: ファイルが存在しない
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reasonFile: '/non-existent-file.md'
      };
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/not found/);
    });
  });

  // =============================================================================
  // UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）
  // =============================================================================
  describe('UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）', () => {
    test('ファイルサイズが100KBを超える場合にエラーがスローされる', async () => {
      // Given: ファイルサイズが100KB超
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reasonFile: '/large-file.md'
      };
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.statSync as jest.MockedFunction<typeof fs.statSync>).mockReturnValue({ size: 200 * 1024 } as any);

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/100KB or less/);
    });
  });
});

describe('Rollback コマンド - ROLLBACK_REASON.md生成', () => {
  // =============================================================================
  // UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報
  // =============================================================================
  describe('UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報', () => {
    test('差し戻し理由ドキュメントが正しく生成される', () => {
      // Given: 完全な差し戻し情報
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        fromPhase: 'testing',
        reasonFile: '.ai-workflow/issue-49/06_testing/review/result.md'
      };
      const reason = 'Type definition missing...';
      const details = {
        blocker_count: 2,
        suggestion_count: 4,
        affected_tests: ['StepExecutor', 'PhaseRunner']
      };

      // When: generateRollbackReasonMarkdown()を呼び出す
      const markdown = generateRollbackReasonMarkdown(options, reason, details);

      // Then: Markdown形式のドキュメントが返される
      expect(markdown).toContain('# Phase 04 (implementation) への差し戻し理由');
      expect(markdown).toContain('**差し戻し元**: Phase testing');
      expect(markdown).toContain('Type definition missing...');
      expect(markdown).toContain('ブロッカー数: 2');
      expect(markdown).toContain('@.ai-workflow/issue-49/06_testing/review/result.md');
    });
  });

  // =============================================================================
  // UC-RC-16: generateRollbackReasonMarkdown() - 最小限の情報
  // =============================================================================
  describe('UC-RC-16: generateRollbackReasonMarkdown() - 最小限の情報', () => {
    test('最小限の情報でもドキュメントが生成される', () => {
      // Given: 最小限の情報
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation'
      };
      const reason = 'Manual rollback for testing';
      const details = null;

      // When: generateRollbackReasonMarkdown()を呼び出す
      const markdown = generateRollbackReasonMarkdown(options, reason, details);

      // Then: Markdown形式のドキュメントが返される
      expect(markdown).toContain('# Phase 04 (implementation) への差し戻し理由');
      expect(markdown).toContain('Manual rollback for testing');
      expect(markdown).not.toContain('詳細情報');
      expect(markdown).not.toContain('参照ドキュメント');
    });
  });
});

describe('Rollback コマンド - ヘルパー関数', () => {
  // =============================================================================
  // getPhaseNumber() のテスト
  // =============================================================================
  describe('getPhaseNumber()', () => {
    test('フェーズ名から正しいフェーズ番号が返される', () => {
      // Then: 各フェーズ名に対応する番号が返される
      expect(getPhaseNumber('planning')).toBe('00');
      expect(getPhaseNumber('requirements')).toBe('01');
      expect(getPhaseNumber('design')).toBe('02');
      expect(getPhaseNumber('test_scenario')).toBe('03');
      expect(getPhaseNumber('implementation')).toBe('04');
      expect(getPhaseNumber('test_implementation')).toBe('05');
      expect(getPhaseNumber('testing')).toBe('06');
      expect(getPhaseNumber('documentation')).toBe('07');
      expect(getPhaseNumber('report')).toBe('08');
      expect(getPhaseNumber('evaluation')).toBe('09');
    });
  });
});
