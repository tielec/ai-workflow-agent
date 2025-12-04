/**
 * Environment Setup
 *
 * エージェント実行環境のセットアップを提供するヘルパーモジュール
 */

/**
 * Codex実行用の環境変数をセットアップ
 *
 * Codex CLI は内部で OPENAI_API_KEY 環境変数を使用するため、
 * CODEX_API_KEY を OPENAI_API_KEY に変換します。
 *
 * 注意: この変換は Codex CLI の実行環境のみに適用されます。
 * アプリケーション全体では CODEX_API_KEY（エージェント用）と
 * OPENAI_API_KEY（API用）は別々に管理されます。
 *
 * @param baseEnv - ベース環境変数オブジェクト
 * @returns Codex実行用の環境変数オブジェクト（新しいオブジェクト）
 */
export function setupCodexEnvironment(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv = { ...baseEnv };

  // CODEX_API_KEY → OPENAI_API_KEY 変換（Codex CLI が OPENAI_API_KEY を使用するため）
  // Issue #188: CODEX_API_KEY と OPENAI_API_KEY の用途分離
  if (childEnv.CODEX_API_KEY && typeof childEnv.CODEX_API_KEY === 'string') {
    childEnv.OPENAI_API_KEY = childEnv.CODEX_API_KEY.trim();
  }

  // GitHub CLI用の環境変数を設定
  if (childEnv.GITHUB_TOKEN && typeof childEnv.GITHUB_TOKEN === 'string') {
    childEnv.GH_TOKEN = childEnv.GITHUB_TOKEN.trim();
  }

  // CODEX_AUTH_FILEを削除
  delete childEnv.CODEX_AUTH_FILE;

  return childEnv;
}

/**
 * GitHub CLI用の環境変数をセットアップ
 *
 * @param baseEnv - ベース環境変数オブジェクト
 * @returns GitHub CLI用の環境変数オブジェクト（新しいオブジェクト）
 */
export function setupGitHubEnvironment(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv = { ...baseEnv };

  // GITHUB_TOKEN → GH_TOKEN 変換
  if (childEnv.GITHUB_TOKEN && typeof childEnv.GITHUB_TOKEN === 'string') {
    childEnv.GH_TOKEN = childEnv.GITHUB_TOKEN.trim();
  }

  return childEnv;
}
