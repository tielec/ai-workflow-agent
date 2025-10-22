import {
  buildErrorMessage,
  buildWarningMessage,
} from '../../../src/core/helpers/dependency-messages.js';
import type { PhaseName } from '../../../src/core/phase-dependencies.js';

describe('dependency-messages', () => {
  describe('buildErrorMessage', () => {
    // REQ-012: エラー/警告メッセージ生成の共通化
    it('正常系: 未完了依存フェーズがある場合のエラーメッセージを生成できる', () => {
      // Given: 未完了依存フェーズのリスト
      const phaseName: PhaseName = 'implementation';
      const missingDependencies: PhaseName[] = ['requirements', 'design'];
      const missingFiles: Array<{ phase: PhaseName; file: string }> = [];

      // When: buildErrorMessage関数を呼び出す
      const result = buildErrorMessage(
        phaseName,
        missingDependencies,
        missingFiles
      );

      // Then: エラーメッセージが正しく生成される
      expect(result).toContain('[ERROR]');
      expect(result).toContain('implementation');
      expect(result).toContain('✗ requirements - NOT COMPLETED');
      expect(result).toContain('✗ design - NOT COMPLETED');
      expect(result).toContain('--phase all');
      expect(result).toContain('--ignore-dependencies');
    });

    it('正常系: ファイル不在がある場合のエラーメッセージを生成できる', () => {
      // Given: ファイル不在のリスト
      const phaseName: PhaseName = 'implementation';
      const missingDependencies: PhaseName[] = [];
      const missingFiles: Array<{ phase: PhaseName; file: string }> = [
        { phase: 'requirements', file: '/path/to/requirements.md' },
      ];

      // When: buildErrorMessage関数を呼び出す
      const result = buildErrorMessage(
        phaseName,
        missingDependencies,
        missingFiles
      );

      // Then: エラーメッセージが正しく生成される
      expect(result).toContain('[ERROR]');
      expect(result).toContain('implementation');
      expect(result).toContain('✗ requirements - /path/to/requirements.md NOT FOUND');
    });

    it('正常系: 未完了とファイル不在の両方がある場合のエラーメッセージを生成できる', () => {
      // Given: 未完了依存とファイル不在の両方
      const phaseName: PhaseName = 'implementation';
      const missingDependencies: PhaseName[] = ['requirements'];
      const missingFiles: Array<{ phase: PhaseName; file: string }> = [
        { phase: 'design', file: '/path/to/design.md' },
      ];

      // When: buildErrorMessage関数を呼び出す
      const result = buildErrorMessage(
        phaseName,
        missingDependencies,
        missingFiles
      );

      // Then: 両方のエラーが含まれるメッセージが生成される
      expect(result).toContain('✗ requirements - NOT COMPLETED');
      expect(result).toContain('✗ design - /path/to/design.md NOT FOUND');
    });
  });

  describe('buildWarningMessage', () => {
    it('正常系: 未完了依存フェーズがある場合の警告メッセージを生成できる', () => {
      // Given: 未完了依存フェーズのリスト
      const phaseName: PhaseName = 'implementation';
      const missingDependencies: PhaseName[] = ['requirements', 'design'];
      const missingFiles: Array<{ phase: PhaseName; file: string }> = [];

      // When: buildWarningMessage関数を呼び出す
      const result = buildWarningMessage(
        phaseName,
        missingDependencies,
        missingFiles
      );

      // Then: 警告メッセージが正しく生成される
      expect(result).toContain('[WARNING]');
      expect(result).toContain('implementation');
      expect(result).toContain('⚠ requirements - NOT COMPLETED');
      expect(result).toContain('⚠ design - NOT COMPLETED');
      expect(result).toContain('proceeding anyway');
    });

    it('正常系: ファイル不在がある場合の警告メッセージを生成できる', () => {
      // Given: ファイル不在のリスト
      const phaseName: PhaseName = 'implementation';
      const missingDependencies: PhaseName[] = [];
      const missingFiles: Array<{ phase: PhaseName; file: string }> = [
        { phase: 'requirements', file: '/path/to/requirements.md' },
      ];

      // When: buildWarningMessage関数を呼び出す
      const result = buildWarningMessage(
        phaseName,
        missingDependencies,
        missingFiles
      );

      // Then: 警告メッセージが正しく生成される
      expect(result).toContain('[WARNING]');
      expect(result).toContain('implementation');
      expect(result).toContain('⚠ requirements - /path/to/requirements.md NOT FOUND');
    });
  });
});
