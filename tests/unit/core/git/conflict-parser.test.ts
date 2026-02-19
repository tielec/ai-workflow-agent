import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { ConflictError } from '../../../../src/utils/error-utils.js';
import { hasConflictMarkers, parseConflictMarkers } from '../../../../src/core/git/conflict-parser.js';

describe('ConflictParser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseConflictMarkers', () => {
    it('単一コンフリクトブロック_通常形式_正しくパースされる', () => {
      // Given: 通常形式のコンフリクト
      const fileContent =
        'line1\nline2\n<<<<<<< HEAD\nours content line1\nours content line2\n=======\ntheirs content line1\n>>>>>>> feature-branch\nline3\n';

      // When: パース実行
      const blocks = parseConflictMarkers(fileContent, 'src/example.ts');

      // Then: 1件のブロックが返る
      expect(blocks).toHaveLength(1);
      expect(blocks[0].filePath).toBe('src/example.ts');
      expect(blocks[0].startLine).toBe(3);
      expect(blocks[0].endLine).toBe(8);
      expect(blocks[0].oursContent).toBe('ours content line1\nours content line2');
      expect(blocks[0].theirsContent).toBe('theirs content line1');
      expect(blocks[0].baseContent).toBeUndefined();
    });

    it('複数コンフリクトブロック_通常形式_すべて正しくパースされる', () => {
      // Given: 複数ブロック
      const fileContent =
        '<<<<<<< HEAD\nours1\n=======\ntheirs1\n>>>>>>> branch\nsome code\n<<<<<<< HEAD\nours2\n=======\ntheirs2\n>>>>>>> branch\n';

      // When: パース実行
      const blocks = parseConflictMarkers(fileContent, 'src/multi.ts');

      // Then: 2件のブロックが返る
      expect(blocks).toHaveLength(2);
      expect(blocks[0].oursContent).toBe('ours1');
      expect(blocks[0].theirsContent).toBe('theirs1');
      expect(blocks[1].oursContent).toBe('ours2');
      expect(blocks[1].theirsContent).toBe('theirs2');
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[0].endLine).toBe(5);
      expect(blocks[1].startLine).toBe(7);
      expect(blocks[1].endLine).toBe(11);
    });

    it('diff3形式_baseContentが正しく抽出される', () => {
      // Given: diff3形式
      const fileContent =
        '<<<<<<< HEAD\nours content\n||||||| merged common ancestors\nbase content\n=======\ntheirs content\n>>>>>>> feature\n';

      // When: パース実行
      const blocks = parseConflictMarkers(fileContent, 'src/diff3.ts');

      // Then: baseContentが含まれる
      expect(blocks).toHaveLength(1);
      expect(blocks[0].oursContent).toBe('ours content');
      expect(blocks[0].baseContent).toBe('base content');
      expect(blocks[0].theirsContent).toBe('theirs content');
    });

    it('コンフリクトなし_空配列を返す', () => {
      // Given: コンフリクト無し
      const fileContent = 'const a = 1;\nconst b = 2;\nconsole.log(a + b);\n';

      // When: パース実行
      const blocks = parseConflictMarkers(fileContent, 'src/clean.ts');

      // Then: 空配列
      expect(blocks).toEqual([]);
    });

    it('空ファイル_空配列を返す', () => {
      // Given: 空文字
      const fileContent = '';

      // When: パース実行
      const blocks = parseConflictMarkers(fileContent, 'src/empty.ts');

      // Then: 空配列
      expect(blocks).toEqual([]);
    });

    it('不完全なマーカー_開始のみ_ConflictErrorがスローされる', () => {
      // Given: 不完全なマーカー
      const fileContent = '<<<<<<< HEAD\nsome content\nno closing markers\n';

      // When / Then: ConflictError
      expect(() => parseConflictMarkers(fileContent, 'src/broken.ts')).toThrow(ConflictError);
    });

    it('Unicode文字を含むコンフリクト_正しくパースされる', () => {
      // Given: 日本語を含むコンフリクト
      const fileContent =
        "<<<<<<< HEAD\nconst msg = '変更A';\n=======\nconst msg = '変更B';\n>>>>>>> feature\n";

      // When: パース実行
      const blocks = parseConflictMarkers(fileContent, 'src/i18n.ts');

      // Then: 日本語が保持される
      expect(blocks).toHaveLength(1);
      expect(blocks[0].oursContent).toBe("const msg = '変更A';");
      expect(blocks[0].theirsContent).toBe("const msg = '変更B';");
    });

    it('大量のコンフリクトブロック_パフォーマンスが許容範囲内', () => {
      // Given: 50ブロックのコンフリクト
      const blocks = Array.from({ length: 50 }, () =>
        '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n',
      ).join('');

      const start = Date.now();
      const result = parseConflictMarkers(blocks, 'src/many.ts');
      const elapsed = Date.now() - start;

      // Then: 50件がパースされ、30秒以内
      expect(result).toHaveLength(50);
      expect(elapsed).toBeLessThan(30000);
    });
  });

  describe('hasConflictMarkers', () => {
    it('コンフリクトマーカーあり_trueを返す', () => {
      // Given: マーカーあり
      const fileContent = '<<<<<<< HEAD\nfoo\n=======\nbar\n>>>>>>> branch\n';

      // When / Then
      expect(hasConflictMarkers(fileContent)).toBe(true);
    });

    it('コンフリクトマーカーなし_falseを返す', () => {
      // Given: マーカーなし
      const fileContent = 'normal code\nno markers\n';

      // When / Then
      expect(hasConflictMarkers(fileContent)).toBe(false);
    });

    it('部分的なマーカー文字列_falseを返す', () => {
      // Given: 不完全なマーカー
      const fileContent = '// This is not a <<<<<<< marker\nregular code\n';

      // When / Then
      expect(hasConflictMarkers(fileContent)).toBe(false);
    });
  });
});
