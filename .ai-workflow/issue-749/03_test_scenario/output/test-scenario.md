# テストシナリオ: Issue #749

## 1. テスト戦略サマリー

- 選択されたテスト戦略: UNIT_INTEGRATION
- テスト対象範囲
- `src/core/git/git-config-helper.ts` の `ensureGitUserConfig()` と定数
- `resolve-conflict` 各フェーズ（init / analyze / execute）での Git 設定適用
- `CommitManager.ensureGitConfig()` の委譲による既存挙動の維持
- `pr-comment` のインライン設定置換による既存挙動の維持
- テスト目的
- Git ユーザー設定の優先順位・バリデーション・ログ出力が要件通りであること
- CI 環境で `resolve-conflict` の commit / merge が失敗しないこと
- 既存機能にリグレッションがないこと

## 2. Unitテストシナリオ

### テストケース名: ensureGitUserConfig_正常系_ローカル設定優先
- 目的: 既存のローカル Git 設定がある場合に最優先されることを検証
- 前提条件: `git.listConfig()` が `user.name` / `user.email` を返す
- 入力: `ensureGitUserConfig(git)`
- 期待結果: `git.addConfig('user.name', 既存値, false, 'local')` と `git.addConfig('user.email', 既存値, false, 'local')` が呼び出される
- テストデータ: `user.name='Existing User'`, `user.email='existing@example.com'`

### テストケース名: ensureGitUserConfig_正常系_環境変数優先
- 目的: 環境変数（commit）がローカル設定未設定時に適用されることを検証
- 前提条件: `git.listConfig()` が `user.name` / `user.email` を返さない
- 入力: `config.getGitCommitUserName()` = `Custom User`, `config.getGitCommitUserEmail()` = `custom@example.com`
- 期待結果: `git.addConfig('user.name', 'Custom User', false, 'local')` と `git.addConfig('user.email', 'custom@example.com', false, 'local')` が呼び出される
- テストデータ: `GIT_COMMIT_USER_NAME='Custom User'`, `GIT_COMMIT_USER_EMAIL='custom@example.com'`

### テストケース名: ensureGitUserConfig_正常系_フォールバック環境変数適用
- 目的: commit 系環境変数が未設定の場合に author 系環境変数が適用されることを検証
- 前提条件: `git.listConfig()` が空、`getGitCommitUserName/Email` が null
- 入力: `config.getGitAuthorName()` = `Author User`, `config.getGitAuthorEmail()` = `author@example.com`
- 期待結果: `git.addConfig('user.name', 'Author User', false, 'local')` と `git.addConfig('user.email', 'author@example.com', false, 'local')` が呼び出される
- テストデータ: `GIT_AUTHOR_NAME='Author User'`, `GIT_AUTHOR_EMAIL='author@example.com'`

### テストケース名: ensureGitUserConfig_正常系_デフォルト値適用
- 目的: 環境変数が全て未設定の場合にデフォルト値が適用されることを検証
- 前提条件: `git.listConfig()` が空、`config` が全て null
- 入力: `ensureGitUserConfig(git)`
- 期待結果: `DEFAULT_GIT_USER_NAME='AI Workflow'` と `DEFAULT_GIT_USER_EMAIL='ai-workflow@tielec.local'` が設定される
- テストデータ: なし

### テストケース名: ensureGitUserConfig_異常系_ユーザー名長さ不正
- 目的: ユーザー名が 1〜100 文字外の場合に警告してデフォルトへフォールバックすることを検証
- 前提条件: `getGitCommitUserName()` が 101 文字以上
- 入力: `ensureGitUserConfig(git)`
- 期待結果: `logger.warn()` が呼び出され、`git.addConfig('user.name', DEFAULT_GIT_USER_NAME, false, 'local')` が呼び出される
- テストデータ: 101 文字のユーザー名

### テストケース名: ensureGitUserConfig_異常系_メール形式不正
- 目的: メールに `@` が含まれない場合に警告してデフォルトへフォールバックすることを検証
- 前提条件: `getGitCommitUserEmail()` が `invalid-email`
- 入力: `ensureGitUserConfig(git)`
- 期待結果: `logger.warn()` が呼び出され、`git.addConfig('user.email', DEFAULT_GIT_USER_EMAIL, false, 'local')` が呼び出される
- テストデータ: `invalid-email`

### テストケース名: ensureGitUserConfig_正常系_addConfig引数検証
- 目的: `git.addConfig` が `('user.name' / 'user.email', 値, false, 'local')` で呼ばれることを検証
- 前提条件: `git.listConfig()` が空
- 入力: `ensureGitUserConfig(git)`
- 期待結果: 第3引数が `false`、第4引数が `'local'` である
- テストデータ: デフォルト値または環境変数

### テストケース名: ensureGitUserConfig_正常系_ログ出力
- 目的: 設定後に `logger.info()` でユーザー名・メールがログ出力されることを検証
- 前提条件: 正常な設定値が決定される
- 入力: `ensureGitUserConfig(git)`
- 期待結果: `logger.info()` がユーザー名・メールを含むメッセージで呼ばれる
- テストデータ: `Custom User`, `custom@example.com`

### テストケース名: ensureGitUserConfig_異常系_例外発生時継続
- 目的: `git.listConfig()` 等で例外が発生してもエラーを再スローせずワークフローが継続できることを検証
- 前提条件: `git.listConfig()` が例外を投げる
- 入力: `ensureGitUserConfig(git)`
- 期待結果: `logger.warn()` が呼び出され、例外が外に伝播しない
- テストデータ: 例外オブジェクト

### テストケース名: CommitManager.ensureGitConfig_正常系_委譲確認
- 目的: 既存 API のまま共通ヘルパーへ委譲していることを検証
- 前提条件: `CommitManager` が `git` を保持
- 入力: `commitManager.ensureGitConfig()`
- 期待結果: `ensureGitUserConfig(this.git)` が呼び出される
- テストデータ: モック `SimpleGit`

## 3. Integrationテストシナリオ

### シナリオ名: resolve-conflict init + Git設定
- 目的: init フェーズで commit 前に Git 設定が適用されることを検証
- 前提条件: CI 環境相当でグローバル Git 設定なし
- テスト手順:
1. `resolve-conflict init` を実行
2. `git.addConfig('user.name', ...)` / `git.addConfig('user.email', ...)` の呼び出しを監視
3. `git.commit()` の呼び出し順序を確認
- 期待結果: `addConfig` が `commit` より前に呼ばれる
- 確認項目:
- `addConfig` が1回ずつ呼ばれている
- `commit` が失敗しないこと

### シナリオ名: resolve-conflict analyze + Git設定
- 目的: analyze フェーズで merge 前に Git 設定が適用されることを検証
- 前提条件: CI 環境相当でグローバル Git 設定なし
- テスト手順:
1. `resolve-conflict analyze` を実行
2. `git.addConfig(...)` が `git.raw(['merge', '--no-commit', '--no-ff', ...])` より前に呼ばれることを確認
3. `git.commit()` が同一フェーズ内で成功することを確認
- 期待結果: `addConfig` がマージ前に1回呼ばれ、同一フェーズ内の `commit` まで有効
- 確認項目:
- `addConfig` がフェーズ内で1回のみ呼ばれている
- `merge` / `commit` が失敗しないこと

### シナリオ名: resolve-conflict execute + Git設定
- 目的: execute フェーズの複数 `commit` 前に Git 設定が適用されることを検証
- 前提条件: CI 環境相当でグローバル Git 設定なし
- テスト手順:
1. `resolve-conflict execute` を実行
2. `git.addConfig(...)` が最初の `commit` 前に呼ばれていることを確認
3. 2回目の `commit` にも設定が有効であることを確認
- 期待結果: `addConfig` がフェーズ開始時に1回呼ばれ、複数 `commit` でエラーが出ない
- 確認項目:
- `commit` 失敗がないこと

### シナリオ名: resolve-conflict エラー時継続
- 目的: `ensureGitUserConfig()` 内でエラーが発生してもフェーズ処理が継続することを検証
- 前提条件: `git.listConfig()` を例外化するモック
- テスト手順:
1. `resolve-conflict init/analyze/execute` のいずれかを実行
2. `ensureGitUserConfig()` 内で例外を発生させる
3. フェーズ処理が停止しないことを確認
- 期待結果: `logger.warn()` が出力され、フェーズ処理が継続される
- 確認項目:
- 例外が外に伝播しない

### シナリオ名: 既存機能リグレッション（CommitManager / pr-comment）
- 目的: 共通ヘルパー導入後も既存コマンドが正常動作することを検証
- 前提条件: 既存の統合テストが実行可能
- テスト手順:
1. 既存の `pr-comment` 関連テストを実行
2. 既存の `CommitManager` 利用テストを実行
- 期待結果: 既存テストが全て pass
- 確認項目:
- デフォルト値が統一されていること
- 既存の `commit` が失敗しないこと

## 4. テストデータ

- 正常データ
- `GIT_COMMIT_USER_NAME='Custom User'`
- `GIT_COMMIT_USER_EMAIL='custom@example.com'`
- `GIT_AUTHOR_NAME='Author User'`
- `GIT_AUTHOR_EMAIL='author@example.com'`
- ローカル Git 設定: `user.name='Existing User'`, `user.email='existing@example.com'`
- 異常データ
- 101文字以上のユーザー名
- `@` を含まないメールアドレス
- 例外発生用のモック `git.listConfig()`
- 境界値データ
- ユーザー名 1 文字、100 文字
- メールアドレス最小構成（例: `a@b`）

## 5. テスト環境要件

- 環境
- ローカル開発環境
- CI（Jenkins 相当）
- 依存
- Node.js 20 以上
- Git インストール済み
- モック/スタブ
- `simple-git` の `listConfig` / `addConfig` / `commit` / `raw` のモック
- `logger` と `config` のモック

## 6. 品質ゲートチェック

- [x] Phase 2の戦略に沿ったテストシナリオである
- [x] 主要な正常系がカバーされている
- [x] 主要な異常系がカバーされている
- [x] 期待結果が明確である
