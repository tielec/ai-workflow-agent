# Validate Credentials ジョブ概要

このジョブは `validate-credentials` コマンドを Jenkins 上で実行し、Git/GitHub/Codex/Claude/OpenAI/Anthropic の認証情報が正しく設定されているかを事前に確認します。

## 主なパラメータ
- `CHECK_CATEGORY`: チェック対象のカテゴリ（all, git, github, codex, claude, openai, anthropic）
- `VERBOSE`: 詳細ログを出力するかどうか
- `OUTPUT_FORMAT`: 出力形式（text | json）
- `EXIT_ON_ERROR`: 失敗がある場合にビルドを失敗させる
- `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL`: Git設定の上書き（任意）
- 各種APIキー: `GITHUB_TOKEN`, `CODEX_AUTH_JSON`, `CODEX_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

## 実行フロー
1. 共通ライブラリ読み込み
2. Codex auth.json 展開（必要に応じて）
3. パラメータバリデーション
4. Node.js セットアップ
5. `validate-credentials` コマンドを JSON / テキスト出力で実行
6. 結果ファイルをアーカイブ

## 成果物
- `credentials-validation-result.json`
- `credentials-validation-result.txt`

## 注意点
- `EXIT_ON_ERROR` を有効にすると、失敗がある場合にビルドが失敗します。
- Codex auth.json は1行のシークレット入力として渡し、ジョブ終了後にクリーンアップされます。
