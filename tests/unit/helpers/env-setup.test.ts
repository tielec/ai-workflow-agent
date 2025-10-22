import {
  setupCodexEnvironment,
  setupGitHubEnvironment,
} from '../../../src/core/helpers/env-setup.js';

describe('env-setup', () => {
  describe('setupCodexEnvironment', () => {
    // REQ-003: 環境変数設定処理の抽出
    it('正常系: CODEX_API_KEYがOPENAI_API_KEYに変換される', () => {
      // Given: CODEX_API_KEYを含む環境変数
      const baseEnv = { CODEX_API_KEY: 'test-key' };

      // When: setupCodexEnvironment関数を呼び出す
      const result = setupCodexEnvironment(baseEnv);

      // Then: OPENAI_API_KEYが設定される
      expect(result.OPENAI_API_KEY).toBe('test-key');
      // CODEX_API_KEYも保持される
      expect(result.CODEX_API_KEY).toBe('test-key');
    });

    it('正常系: GITHUB_TOKENがGH_TOKENに変換される', () => {
      // Given: GITHUB_TOKENを含む環境変数
      const baseEnv = { GITHUB_TOKEN: 'ghp_test' };

      // When: setupCodexEnvironment関数を呼び出す
      const result = setupCodexEnvironment(baseEnv);

      // Then: GH_TOKENが設定される
      expect(result.GH_TOKEN).toBe('ghp_test');
      // GITHUB_TOKENも保持される
      expect(result.GITHUB_TOKEN).toBe('ghp_test');
    });

    it('正常系: CODEX_AUTH_FILEが削除される', () => {
      // Given: CODEX_AUTH_FILEを含む環境変数
      const baseEnv = {
        CODEX_AUTH_FILE: '/path/to/auth.json',
        OTHER_VAR: 'value',
      };

      // When: setupCodexEnvironment関数を呼び出す
      const result = setupCodexEnvironment(baseEnv);

      // Then: CODEX_AUTH_FILEが存在しない
      expect(result.CODEX_AUTH_FILE).toBeUndefined();
      // OTHER_VARは保持される
      expect(result.OTHER_VAR).toBe('value');
    });

    it('正常系: イミュータブル（元の環境変数オブジェクトが変更されない）', () => {
      // Given: 元の環境変数オブジェクト
      const baseEnv = { CODEX_API_KEY: 'test-key' };

      // When: setupCodexEnvironment関数を呼び出す
      const result = setupCodexEnvironment(baseEnv);

      // Then: 返されたオブジェクトは新しいオブジェクト
      expect(result).not.toBe(baseEnv);
      // 元のbaseEnvは変更されていない
      expect(baseEnv.CODEX_API_KEY).toBe('test-key');
      expect((baseEnv as any).OPENAI_API_KEY).toBeUndefined();
    });
  });

  describe('setupGitHubEnvironment', () => {
    it('正常系: GITHUB_TOKENがGH_TOKENに変換される', () => {
      // Given: GITHUB_TOKENを含む環境変数
      const baseEnv = { GITHUB_TOKEN: 'ghp_test' };

      // When: setupGitHubEnvironment関数を呼び出す
      const result = setupGitHubEnvironment(baseEnv);

      // Then: GH_TOKENが設定される
      expect(result.GH_TOKEN).toBe('ghp_test');
      // GITHUB_TOKENも保持される
      expect(result.GITHUB_TOKEN).toBe('ghp_test');
    });

    it('正常系: イミュータブル（元の環境変数オブジェクトが変更されない）', () => {
      // Given: 元の環境変数オブジェクト
      const baseEnv = { GITHUB_TOKEN: 'ghp_test' };

      // When: setupGitHubEnvironment関数を呼び出す
      const result = setupGitHubEnvironment(baseEnv);

      // Then: 返されたオブジェクトは新しいオブジェクト
      expect(result).not.toBe(baseEnv);
      // 元のbaseEnvは変更されていない
      expect(baseEnv.GITHUB_TOKEN).toBe('ghp_test');
    });
  });
});
