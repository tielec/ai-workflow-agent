/**
 * ユニットテスト: cleanup コマンドモジュール
 * Issue #212: ワークフローログクリーンアップを独立したコマンドとして実装
 *
 * テスト対象:
 * - validateCleanupOptions()
 * - parsePhaseRange()
 * - handleCleanupCommand()
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  parsePhaseRange,
} from '../../../src/commands/cleanup.js';
import type { CleanupCommandOptions } from '../../../src/commands/cleanup.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import * as path from 'node:path';

// node:fs のモック - モック化してからインポート
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
}));

import * as fs from 'node:fs';

describe('Cleanup コマンド - parsePhaseRange() 正常系', () => {
  // =============================================================================
  // parsePhaseRange_正常系_数値範囲（0-4）
  // =============================================================================
  describe('parsePhaseRange_正常系_数値範囲（0-4）', () => {
    test('数値範囲「0-4」が正しくフェーズ名配列に変換される', () => {
      // Given: 数値範囲「0-4」
      const rangeStr = '0-4';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_数値範囲（0-9）
  // =============================================================================
  describe('parsePhaseRange_正常系_数値範囲（0-9）', () => {
    test('数値範囲「0-9」が全フェーズ名配列に変換される', () => {
      // Given: 数値範囲「0-9」
      const rangeStr = '0-9';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 全フェーズ名が返される
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_フェーズ名リスト（planning,requirements）
  // =============================================================================
  describe('parsePhaseRange_正常系_フェーズ名リスト（planning,requirements）', () => {
    test('フェーズ名リスト「planning,requirements」が正しく配列に変換される', () => {
      // Given: フェーズ名リスト
      const rangeStr = 'planning,requirements';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual(['planning', 'requirements']);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_単一フェーズ（planning）
  // =============================================================================
  describe('parsePhaseRange_正常系_単一フェーズ（planning）', () => {
    test('単一フェーズ名「planning」が正しく配列に変換される', () => {
      // Given: 単一フェーズ名
      const rangeStr = 'planning';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 単一要素の配列が返される
      expect(result).toEqual(['planning']);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_単一数値範囲（0-0）
  // =============================================================================
  describe('parsePhaseRange_正常系_単一数値範囲（0-0）', () => {
    test('数値範囲「0-0」が単一フェーズに変換される', () => {
      // Given: 数値範囲「0-0」
      const rangeStr = '0-0';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 単一要素の配列が返される
      expect(result).toEqual(['planning']);
    });
  });
});

describe('Cleanup コマンド - parsePhaseRange() 異常系', () => {
  // =============================================================================
  // parsePhaseRange_異常系_無効な範囲（10-12）
  // =============================================================================
  describe('parsePhaseRange_異常系_無効な範囲（10-12）', () => {
    test('範囲外の数値範囲が指定された場合にエラーがスローされる', () => {
      // Given: 範囲外の数値範囲
      const rangeStr = '10-12';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase range: 10-12. Valid range is 0-9/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_逆順範囲（4-0）
  // =============================================================================
  describe('parsePhaseRange_異常系_逆順範囲（4-0）', () => {
    test('逆順の範囲が指定された場合にエラーがスローされる', () => {
      // Given: 逆順の範囲
      const rangeStr = '4-0';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase range: 4-0. Start must be less than or equal to end./);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_無効な形式（abc）
  // =============================================================================
  describe('parsePhaseRange_異常系_無効な形式（abc）', () => {
    test('無効な形式が指定された場合にエラーがスローされる', () => {
      // Given: 無効な形式
      const rangeStr = 'abc';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase name: abc/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_空文字列
  // =============================================================================
  describe('parsePhaseRange_異常系_空文字列', () => {
    test('空文字列が指定された場合にエラーがスローされる', () => {
      // Given: 空文字列
      const rangeStr = '';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Phase range cannot be empty/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_無効なフェーズ名を含む
  // =============================================================================
  describe('parsePhaseRange_異常系_無効なフェーズ名を含む', () => {
    test('無効なフェーズ名が含まれる場合にエラーがスローされる', () => {
      // Given: 無効なフェーズ名を含むリスト
      const rangeStr = 'planning,invalid_phase,requirements';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase name: invalid_phase/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_負の数値範囲
  // =============================================================================
  describe('parsePhaseRange_異常系_負の数値範囲', () => {
    test('負の数値範囲が指定された場合にエラーがスローされる', () => {
      // Given: 負の数値範囲
      const rangeStr = '-1-5';

      // When & Then: エラーがスローされる（パターンマッチしないため、フェーズ名として解釈されエラー）
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase name/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_開始が範囲外（-1-0）
  // =============================================================================
  describe('parsePhaseRange_異常系_範囲外の開始値', () => {
    test('開始値が範囲外の場合にエラーがスローされる（境界値テスト）', () => {
      // Given: 開始値10（範囲外）
      const rangeStr = '10-10';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase range: 10-10. Valid range is 0-9/);
    });
  });
});

describe('Cleanup コマンド - エッジケーステスト', () => {
  // =============================================================================
  // parsePhaseRange_エッジケース_前後に空白
  // =============================================================================
  describe('parsePhaseRange_エッジケース_前後に空白', () => {
    test('前後に空白があってもトリムされて処理される', () => {
      // Given: 前後に空白がある文字列
      const rangeStr = '  0-4  ';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_エッジケース_フェーズ名に空白
  // =============================================================================
  describe('parsePhaseRange_エッジケース_フェーズ名に空白', () => {
    test('フェーズ名リストに空白があってもトリムされて処理される', () => {
      // Given: フェーズ名の前後に空白
      const rangeStr = ' planning , requirements , design ';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual(['planning', 'requirements', 'design']);
    });
  });

  // =============================================================================
  // parsePhaseRange_エッジケース_最大範囲（0-9）
  // =============================================================================
  describe('parsePhaseRange_エッジケース_最大範囲（0-9）', () => {
    test('最大範囲「0-9」が正しく処理される', () => {
      // Given: 最大範囲
      const rangeStr = '0-9';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 全10フェーズが返される
      expect(result.length).toBe(10);
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_エッジケース_全フェーズ名リスト
  // =============================================================================
  describe('parsePhaseRange_エッジケース_全フェーズ名リスト', () => {
    test('全フェーズ名をリストで指定した場合に正しく処理される', () => {
      // Given: 全フェーズ名のリスト
      const rangeStr = 'planning,requirements,design,test_scenario,implementation,test_implementation,testing,documentation,report,evaluation';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 全10フェーズが返される
      expect(result.length).toBe(10);
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
    });
  });
});

describe('Cleanup コマンド - 複数フェーズ範囲のテスト', () => {
  // =============================================================================
  // parsePhaseRange_正常系_後半フェーズ（5-9）
  // =============================================================================
  describe('parsePhaseRange_正常系_後半フェーズ（5-9）', () => {
    test('後半フェーズ範囲「5-9」が正しく変換される', () => {
      // Given: 後半フェーズ範囲
      const rangeStr = '5-9';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual([
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_中間フェーズ（3-6）
  // =============================================================================
  describe('parsePhaseRange_正常系_中間フェーズ（3-6）', () => {
    test('中間フェーズ範囲「3-6」が正しく変換される', () => {
      // Given: 中間フェーズ範囲
      const rangeStr = '3-6';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual([
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_複数フェーズ名指定
  // =============================================================================
  describe('parsePhaseRange_正常系_複数フェーズ名指定', () => {
    test('複数のフェーズ名を指定した場合に正しく配列に変換される', () => {
      // Given: 複数フェーズ名
      const rangeStr = 'design,implementation,testing,report';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される（指定順）
      expect(result).toEqual([
        'design',
        'implementation',
        'testing',
        'report'
      ]);
    });
  });
});
