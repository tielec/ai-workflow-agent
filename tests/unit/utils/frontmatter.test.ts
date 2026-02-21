import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  generateFrontmatter,
  insertFrontmatter,
  parseFrontmatter,
} from '../../../src/utils/frontmatter.js';
import type { IssueDifficultyAssessment } from '../../../src/types.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('frontmatter utils', () => {
  describe('generateFrontmatter', () => {
    it('全フィールド指定のassessmentから正しいfrontmatterを生成する (TC-FM-GEN-001)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'C',
        label: 'moderate',
        bug_risk: { expected_bugs: 2, probability: 35, risk_score: 0.7 },
        rationale: '複数ファイルの変更が必要であり中程度の難易度と判定。',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:30:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('---');
      expect(frontmatter).toContain('difficulty: C');
      expect(frontmatter).toContain('difficulty_label: moderate');
      expect(frontmatter).toContain('bug_risk:');
      expect(frontmatter).toContain('  expected_bugs: 2');
      expect(frontmatter).toContain('  probability: 35');
      expect(frontmatter).toContain('  risk_score: 0.70');
      expect(frontmatter).toContain('rationale: |');
      expect(frontmatter).toContain('  複数ファイルの変更が必要であり中程度の難易度と判定。');
      expect(frontmatter).toContain('assessed_by: claude');
      expect(frontmatter).toContain('assessed_at: 2025-01-15T10:30:00Z');
    });

    it('グレードAが正しいdifficultyとlabelで出力される (TC-FM-GEN-002)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'A',
        label: 'trivial',
        bug_risk: { expected_bugs: 0, probability: 5, risk_score: 0 },
        rationale: 'タイポ修正のみ。',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:00:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('difficulty: A');
      expect(frontmatter).toContain('difficulty_label: trivial');
    });

    it('グレードEが正しいdifficultyとlabelで出力される (TC-FM-GEN-003)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'E',
        label: 'critical',
        bug_risk: { expected_bugs: 8, probability: 80, risk_score: 6.4 },
        rationale: 'システム全体に影響する大規模変更。',
        assessed_by: 'codex',
        assessed_at: '2025-01-15T12:00:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('difficulty: E');
      expect(frontmatter).toContain('difficulty_label: critical');
      expect(frontmatter).toContain('risk_score: 6.40');
    });

    it('risk_scoreが小数点以下2桁で出力される (TC-FM-GEN-004)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'C',
        label: 'moderate',
        bug_risk: { expected_bugs: 3, probability: 33, risk_score: 0.99 },
        rationale: 'テスト',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:00:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('risk_score: 0.99');
      expect(frontmatter).not.toContain('risk_score: 0.990');
      expect(frontmatter).not.toContain('risk_score: 1');
    });

    it('複数行rationaleがブロックスカラー形式で出力される (TC-FM-GEN-005)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'D',
        label: 'complex',
        bug_risk: { expected_bugs: 3, probability: 50, risk_score: 1.5 },
        rationale: '複数ファイルの変更が必要。\nアーキテクチャ変更を伴う。\nテスト追加も必須。',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:00:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('rationale: |');
      expect(frontmatter).toContain('  複数ファイルの変更が必要。');
      expect(frontmatter).toContain('  アーキテクチャ変更を伴う。');
      expect(frontmatter).toContain('  テスト追加も必須。');
    });

    it('単一行rationaleがブロックスカラー形式で出力される (TC-FM-GEN-006)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'B',
        label: 'simple',
        bug_risk: { expected_bugs: 1, probability: 20, risk_score: 0.2 },
        rationale: '単一行の判定根拠テキスト。',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:00:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('rationale: |');
      expect(frontmatter).toContain('  単一行の判定根拠テキスト。');
    });

    it('空文字のrationaleでもエラーなく出力される (TC-FM-GEN-007)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'C',
        label: 'moderate',
        bug_risk: { expected_bugs: 2, probability: 35, risk_score: 0.7 },
        rationale: '',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:30:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('rationale: |');
      expect(frontmatter).toContain('  ');
    });

    it('ゼロ値でも正しく出力される (TC-FM-GEN-008)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'A',
        label: 'trivial',
        bug_risk: { expected_bugs: 0, probability: 0, risk_score: 0 },
        rationale: 'リスクなし',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:00:00Z',
      };

      // When
      const frontmatter = generateFrontmatter(assessment);

      // Then
      expect(frontmatter).toContain('expected_bugs: 0');
      expect(frontmatter).toContain('probability: 0');
      expect(frontmatter).toContain('risk_score: 0.00');
    });
  });

  describe('insertFrontmatter', () => {
    it('通常のbodyにfrontmatterを挿入する (TC-FM-INS-001)', () => {
      // Given
      const body = '## 概要\nIssue本文です。';
      const frontmatter = '---\ndifficulty: C\n---';

      // When
      const result = insertFrontmatter(body, frontmatter);

      // Then
      expect(result).toBe('---\ndifficulty: C\n---\n\n## 概要\nIssue本文です。');
    });

    it('空文字のbodyはfrontmatterのみ返す (TC-FM-INS-002)', () => {
      // Given
      const body = '';
      const frontmatter = '---\ndifficulty: A\n---';

      // When
      const result = insertFrontmatter(body, frontmatter);

      // Then
      expect(result).toBe('---\ndifficulty: A\n---');
    });

    it('既存frontmatterがある場合は置換する (TC-FM-INS-003)', () => {
      // Given
      const body = '---\nold_key: old_value\n---\n\n## 概要\n既存の本文。';
      const frontmatter = '---\ndifficulty: D\n---';

      // When
      const result = insertFrontmatter(body, frontmatter);

      // Then
      expect(result).toBe('---\ndifficulty: D\n---\n\n## 概要\n既存の本文。');
      expect(result).not.toContain('old_key');
    });

    it('閉じ---がない場合は先頭に挿入する (TC-FM-INS-004)', () => {
      // Given
      const body = '---\nこれはfrontmatterではない';
      const frontmatter = '---\ndifficulty: B\n---';

      // When
      const result = insertFrontmatter(body, frontmatter);

      // Then
      expect(result).toBe('---\ndifficulty: B\n---\n\n---\nこれはfrontmatterではない');
    });

    it('既存frontmatter後の余分な空行を整理して結合する (TC-FM-INS-005)', () => {
      // Given
      const body = '---\nold: value\n---\n\n\n\n## 概要\n本文。';
      const frontmatter = '---\ndifficulty: C\n---';

      // When
      const result = insertFrontmatter(body, frontmatter);

      // Then
      expect(result).toBe('---\ndifficulty: C\n---\n\n## 概要\n本文。');
    });
  });

  describe('parseFrontmatter', () => {
    it('frontmatter付き本文からmetadataとcontentを分離する (TC-FM-PRS-001)', () => {
      // Given
      const body = '---\ndifficulty: C\ndifficulty_label: moderate\n---\n\n## 概要\n本文。';

      // When
      const result = parseFrontmatter(body);

      // Then
      expect(result.metadata).not.toBeNull();
      expect(result.metadata?.difficulty).toBe('C');
      expect(result.metadata?.difficulty_label).toBe('moderate');
      expect(result.content.startsWith('\n## 概要')).toBe(true);
    });

    it('frontmatterがない場合はmetadata=nullで本文を返す (TC-FM-PRS-002)', () => {
      // Given
      const body = '## 概要\nこれはfrontmatterなしのテキストです。';

      // When
      const result = parseFrontmatter(body);

      // Then
      expect(result.metadata).toBeNull();
      expect(result.content).toBe(body);
    });

    it('空文字列入力はmetadata=nullで空文字列を返す (TC-FM-PRS-003)', () => {
      // Given
      const body = '';

      // When
      const result = parseFrontmatter(body);

      // Then
      expect(result.metadata).toBeNull();
      expect(result.content).toBe('');
    });

    it('不正フォーマット（閉じ---なし）はmetadata=nullで元本文を返す (TC-FM-PRS-004)', () => {
      // Given
      const body = '---\nkey: value\nこれは閉じられていない';

      // When
      const result = parseFrontmatter(body);

      // Then
      expect(result.metadata).toBeNull();
      expect(result.content).toBe(body);
    });

    it('ネストされたオブジェクト（bug_risk）をパースする (TC-FM-PRS-005)', () => {
      // Given
      const body =
        '---\n' +
        'difficulty: D\n' +
        'bug_risk:\n' +
        '  expected_bugs: 3\n' +
        '  probability: 50\n' +
        '  risk_score: 1.50\n' +
        '---\n\n本文';

      // When
      const result = parseFrontmatter(body);

      // Then
      expect(result.metadata).not.toBeNull();
      expect(result.metadata?.difficulty).toBe('D');
      const bugRisk = result.metadata?.bug_risk as Record<string, unknown>;
      expect(bugRisk.expected_bugs).toBe('3');
      expect(bugRisk.probability).toBe('50');
      expect(bugRisk.risk_score).toBe('1.50');
    });

    it('ブロックスカラー（rationale）を結合してパースする (TC-FM-PRS-006)', () => {
      // Given
      const body =
        '---\n' +
        'rationale: |\n' +
        '  1行目のテキスト\n' +
        '  2行目のテキスト\n' +
        'assessed_by: claude\n' +
        '---\n\n本文';

      // When
      const result = parseFrontmatter(body);

      // Then
      expect(result.metadata).not.toBeNull();
      expect(result.metadata?.rationale).toBe('1行目のテキスト\n2行目のテキスト');
      expect(result.metadata?.assessed_by).toBe('claude');
    });

    it('generate→insert→parseのラウンドトリップができる (TC-FM-PRS-007)', () => {
      // Given
      const assessment: IssueDifficultyAssessment = {
        grade: 'C',
        label: 'moderate',
        bug_risk: { expected_bugs: 2, probability: 35, risk_score: 0.7 },
        rationale: '判定根拠テキスト',
        assessed_by: 'claude',
        assessed_at: '2025-01-15T10:30:00Z',
      };
      const frontmatter = generateFrontmatter(assessment);
      const bodyWithFm = insertFrontmatter('本文', frontmatter);

      // When
      const result = parseFrontmatter(bodyWithFm);

      // Then
      expect(result.metadata).not.toBeNull();
      expect(result.metadata?.difficulty).toBe('C');
      expect(result.metadata?.difficulty_label).toBe('moderate');
      expect(result.content).toContain('本文');
    });
  });
});
