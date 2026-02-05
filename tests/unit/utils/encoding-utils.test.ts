import { describe, it, expect } from '@jest/globals';
import {
  fixMojibake,
  isMojibake,
  isValidUtf8,
  sanitizeForJson,
  sanitizeObjectStrings,
} from '../../../src/utils/encoding-utils.js';

describe('isMojibake', () => {
  it('正常な日本語文字列ではfalseを返す', () => {
    expect(isMojibake('日本語テスト文字列')).toBe(false);
  });

  it('典型的なMojibakeパターン（Ãで始まる）ではtrueを返す', () => {
    expect(isMojibake('ÃA')).toBe(true);
  });

  it('ASCIIのみの文字列ではfalseを返す', () => {
    expect(isMojibake('Hello World 123')).toBe(false);
  });

  it('絵文字を含んでも正常ならfalseのまま', () => {
    expect(isMojibake('テスト🎉完了✅')).toBe(false);
  });
});

describe('fixMojibake', () => {
  it('既に正しいUTF-8の場合は変更しない', () => {
    const text = '日本語テスト';
    expect(fixMojibake(text)).toBe(text);
  });

  it('Mojibakeと判定された文字列を安全な文字列に変換しようとする', () => {
    const mojibake = 'ÃA';
    const fixed = fixMojibake(mojibake);
    expect(typeof fixed).toBe('string');
    expect(isMojibake(fixed)).toBe(false);
  });

  it('空文字列はそのまま返す', () => {
    expect(fixMojibake('')).toBe('');
  });

  it('修正不能な断片は元の文字列を返す', () => {
    expect(fixMojibake('Ã')).toBe('Ã');
  });
});

describe('sanitizeForJson', () => {
  it('Mojibakeらしき文字列でも例外なく処理する', () => {
    const text = 'ÃA';
    const result = sanitizeForJson(text);
    expect(typeof result).toBe('string');
  });

  it('制御文字を除去する（改行・タブは保持）', () => {
    const withControls = 'text\x00null\x01byte\nline2\tcol';
    expect(sanitizeForJson(withControls)).toBe('textnullbyte\nline2\tcol');
  });

  it('空文字列はそのまま返す', () => {
    expect(sanitizeForJson('')).toBe('');
  });
});

describe('sanitizeObjectStrings', () => {
  it('ネストしたオブジェクトもミューテートせず処理する', () => {
    const input = {
      level1: {
        message: 'テスト',
        nested: { content: 'value' },
      },
    };

    const result = sanitizeObjectStrings(input) as any;

    expect(result).not.toBe(input);
    expect(result.level1.message).toBe('テスト');
    expect(result.level1.nested.content).toBe('value');
    expect(input.level1.message).toBe('テスト');
  });

  it('配列内の文字列も処理対象になる', () => {
    const input = { items: ['item1', 'item2'] };
    const result = sanitizeObjectStrings(input) as any;
    expect(result.items).toEqual(['item1', 'item2']);
  });

  it('nullやundefinedは変更しない', () => {
    expect(sanitizeObjectStrings(null)).toBeNull();
    expect(sanitizeObjectStrings(undefined)).toBeUndefined();
  });

  it('プリミティブ型（number/boolean）はそのまま返す', () => {
    const input = { count: 42, active: true, label: 'test' };
    const result = sanitizeObjectStrings(input) as any;
    expect(result).toEqual(input);
  });
});

describe('isValidUtf8', () => {
  it('正しいUTF-8文字列をtrueと判定する', () => {
    expect(isValidUtf8('完了🎉テスト')).toBe(true);
  });

  it('不正なサロゲートを含む文字列はfalseと判定する', () => {
    expect(isValidUtf8('\uD800')).toBe(false);
  });
});
