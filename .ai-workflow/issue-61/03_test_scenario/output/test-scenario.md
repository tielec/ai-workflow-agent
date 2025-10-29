# テストシナリオ - Issue #61

**Issue**: [FOLLOW-UP] Issue #50 - 残タスク
**プロジェクト**: ai-workflow-agent
**作成日**: 2025-01-22
**バージョン**: 1.0

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）の成果物を確認し、以下のテスト戦略が策定されていることを確認しました：

### テスト戦略: UNIT_INTEGRATION

#### 判断根拠

1. **ユニットテスト必須**:
   - logger.tsモジュール自体の単体動作検証
   - 各ログレベル（debug/info/warn/error）の出力検証
   - カラーリング、タイムスタンプ、環境変数による制御

2. **インテグレーションテスト必須**:
   - 既存システムとの統合検証
   - 既存の26ファイルでlogger置き換え後の動作確認
   - エンドツーエンド（init → execute → review）ワークフローでのログ出力検証

3. **BDD不要**:
   - エンドユーザー向け機能ではなく、開発者向けインフラ機能

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**（Phase 2で決定）

### テスト対象の範囲

1. **Unitテスト対象**:
   - `src/utils/logger.ts` モジュール（新規作成）
   - ログレベル制御機能
   - カラーリング機能
   - タイムスタンプ機能
   - 環境変数制御機能

2. **Integrationテスト対象**:
   - commands/ モジュール（4ファイル、89箇所）
   - core/ モジュール（14ファイル、96箇所）
   - phases/ モジュール（6ファイル、91箇所）
   - 既存ユニットテスト・インテグレーションテスト（リグレッション検証）

### テストの目的

1. **Unitテスト目的**:
   - logger.tsモジュールが仕様通り動作することを検証
   - 各ログレベルが正しく制御されることを検証
   - 環境変数による制御が正しく動作することを検証
   - カラーリングが正しく適用されることを検証

2. **Integrationテスト目的**:
   - logger.ts導入後、既存システムが正常に動作することを検証
   - console.X → logger.X 置き換え後、ログ出力が正しく行われることを検証
   - 既存のユニット・インテグレーションテストが成功することを検証（リグレッション防止）

---

## 2. Unitテストシナリオ

### 2.1 ログレベル制御のテスト

#### テストケース 2.1.1: logger.debug() - デフォルト設定

- **目的**: LOG_LEVEL未設定時（デフォルト: info）、debug()が出力されないことを検証
- **前提条件**:
  - `process.env.LOG_LEVEL` が未設定
  - console.log/console.error がモック化されている
- **入力**: `logger.debug('debug message')`
- **期待結果**:
  - console.log が呼ばれない
  - console.error が呼ばれない
- **テストデータ**: 'debug message'

#### テストケース 2.1.2: logger.info() - デフォルト設定

- **目的**: LOG_LEVEL未設定時（デフォルト: info）、info()が出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL` が未設定
  - console.log がモック化されている
- **入力**: `logger.info('info message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージに `[INFO ]` と 'info message' が含まれる
  - タイムスタンプ（YYYY-MM-DD HH:mm:ss形式）が含まれる
- **テストデータ**: 'info message'

#### テストケース 2.1.3: logger.warn() - デフォルト設定

- **目的**: LOG_LEVEL未設定時（デフォルト: info）、warn()が出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL` が未設定
  - console.log がモック化されている
- **入力**: `logger.warn('warning message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージに `[WARN ]` と 'warning message' が含まれる
  - タイムスタンプが含まれる
- **テストデータ**: 'warning message'

#### テストケース 2.1.4: logger.error() - デフォルト設定

- **目的**: LOG_LEVEL未設定時（デフォルト: info）、error()がconsole.errorに出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL` が未設定
  - console.error がモック化されている
- **入力**: `logger.error('error message')`
- **期待結果**:
  - console.error が1回呼ばれる
  - console.log が呼ばれない
  - 出力メッセージに `[ERROR]` と 'error message' が含まれる
  - タイムスタンプが含まれる
- **テストデータ**: 'error message'

#### テストケース 2.1.5: ログレベル制御 - LOG_LEVEL=debug

- **目的**: LOG_LEVEL=debug 時、すべてのログレベルが出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL = 'debug'`
  - console.log/console.error がモック化されている
- **入力**:
  ```typescript
  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');
  ```
- **期待結果**:
  - console.log が3回呼ばれる（debug, info, warn）
  - console.error が1回呼ばれる（error）
- **テストデータ**: 上記4つのメッセージ

#### テストケース 2.1.6: ログレベル制御 - LOG_LEVEL=warn

- **目的**: LOG_LEVEL=warn 時、warn以上のみが出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL = 'warn'`
  - console.log/console.error がモック化されている
- **入力**:
  ```typescript
  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');
  ```
- **期待結果**:
  - console.log が1回呼ばれる（warn のみ）
  - console.error が1回呼ばれる（error のみ）
  - debug, info は出力されない
- **テストデータ**: 上記4つのメッセージ

#### テストケース 2.1.7: ログレベル制御 - LOG_LEVEL=error

- **目的**: LOG_LEVEL=error 時、errorのみが出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL = 'error'`
  - console.error がモック化されている
- **入力**:
  ```typescript
  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');
  ```
- **期待結果**:
  - console.log が呼ばれない
  - console.error が1回呼ばれる（error のみ）
  - debug, info, warn は出力されない
- **テストデータ**: 上記4つのメッセージ

#### テストケース 2.1.8: 不正なログレベル - フォールバック

- **目的**: LOG_LEVEL に不正な値が設定された場合、デフォルト（info）にフォールバックすることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL = 'invalid'`
  - console.log がモック化されている
- **入力**:
  ```typescript
  logger.debug('debug message');
  logger.info('info message');
  ```
- **期待結果**:
  - console.log が1回呼ばれる（info のみ）
  - debug は出力されない（デフォルトの info レベルが適用される）
- **テストデータ**: 上記2つのメッセージ

---

### 2.2 カラーリングのテスト

#### テストケース 2.2.1: カラーリング有効 - デフォルト設定

- **目的**: LOG_NO_COLOR未設定時、カラーリングが適用されることを検証
- **前提条件**:
  - `process.env.LOG_NO_COLOR` が未設定
  - console.log がモック化されている
- **入力**: `logger.info('test message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージにANSIエスケープシーケンス（`\x1b[`）が含まれる
  - 青色のカラーコード（chalk.blue）が適用される
- **テストデータ**: 'test message'

#### テストケース 2.2.2: カラーリング無効 - LOG_NO_COLOR=true

- **目的**: LOG_NO_COLOR=true 時、カラーリングが無効化されることを検証
- **前提条件**:
  - `process.env.LOG_NO_COLOR = 'true'`
  - console.log がモック化されている
- **入力**: `logger.info('test message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージにANSIエスケープシーケンス（`\x1b[`）が含まれない
  - プレーンテキストのみ出力される
- **テストデータ**: 'test message'

#### テストケース 2.2.3: カラーリング無効 - LOG_NO_COLOR=1

- **目的**: LOG_NO_COLOR=1 時、カラーリングが無効化されることを検証（'1'も有効値）
- **前提条件**:
  - `process.env.LOG_NO_COLOR = '1'`
  - console.log がモック化されている
- **入力**: `logger.info('test message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージにANSIエスケープシーケンスが含まれない
- **テストデータ**: 'test message'

#### テストケース 2.2.4: ログレベル別カラーリング

- **目的**: 各ログレベルで正しいカラーが適用されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL = 'debug'`
  - `process.env.LOG_NO_COLOR` が未設定
  - console.log/console.error がモック化されている
- **入力**:
  ```typescript
  logger.debug('debug message');  // グレー
  logger.info('info message');    // 青
  logger.warn('warn message');    // 黄
  logger.error('error message');  // 赤
  ```
- **期待結果**:
  - console.log が3回呼ばれる（debug, info, warn）
  - console.error が1回呼ばれる（error）
  - 各メッセージに適切なカラーコードが適用される:
    - debug: chalk.gray
    - info: chalk.blue
    - warn: chalk.yellow
    - error: chalk.red
- **テストデータ**: 上記4つのメッセージ

---

### 2.3 タイムスタンプのテスト

#### テストケース 2.3.1: タイムスタンプフォーマット検証

- **目的**: タイムスタンプが YYYY-MM-DD HH:mm:ss 形式で付与されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info('test message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージが正規表現 `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}` にマッチする
  - タイムスタンプが現在時刻に近い（±5秒以内）
- **テストデータ**: 'test message'

#### テストケース 2.3.2: タイムスタンプの一貫性

- **目的**: 同一秒内の複数ログで同じタイムスタンプが付与されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**:
  ```typescript
  logger.info('message 1');
  logger.info('message 2');
  ```
- **期待結果**:
  - console.log が2回呼ばれる
  - 両方のメッセージのタイムスタンプが同一または1秒差以内
- **テストデータ**: 'message 1', 'message 2'

---

### 2.4 メッセージフォーマットのテスト

#### テストケース 2.4.1: 文字列メッセージ

- **目的**: 文字列メッセージが正しくフォーマットされることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info('simple string message')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力形式: `YYYY-MM-DD HH:mm:ss [INFO ] simple string message`
- **テストデータ**: 'simple string message'

#### テストケース 2.4.2: オブジェクトメッセージ

- **目的**: オブジェクトがJSON文字列に変換されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info({ key: 'value', number: 123 })`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージに `{"key":"value","number":123}` が含まれる
- **テストデータ**: `{ key: 'value', number: 123 }`

#### テストケース 2.4.3: 複数引数メッセージ

- **目的**: 複数引数がスペース区切りで連結されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info('User', 'John', 'logged in')`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージに `User John logged in` が含まれる
- **テストデータ**: 'User', 'John', 'logged in'

#### テストケース 2.4.4: 混合型引数メッセージ

- **目的**: 文字列・数値・オブジェクトの混合引数が正しく処理されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info('Count:', 42, { status: 'ok' })`
- **期待結果**:
  - console.log が1回呼ばれる
  - 出力メッセージに `Count: 42 {"status":"ok"}` が含まれる
- **テストデータ**: 'Count:', 42, `{ status: 'ok' }`

---

### 2.5 出力先のテスト

#### テストケース 2.5.1: info/warn/debug の出力先

- **目的**: debug/info/warn が console.log に出力されることを検証
- **前提条件**:
  - `process.env.LOG_LEVEL = 'debug'`
  - console.log/console.error がモック化されている
- **入力**:
  ```typescript
  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  ```
- **期待結果**:
  - console.log が3回呼ばれる
  - console.error が呼ばれない
- **テストデータ**: 上記3つのメッセージ

#### テストケース 2.5.2: error の出力先

- **目的**: error が console.error に出力されることを検証
- **前提条件**:
  - console.error がモック化されている
- **入力**: `logger.error('error message')`
- **期待結果**:
  - console.error が1回呼ばれる
  - console.log が呼ばれない
- **テストデータ**: 'error message'

---

### 2.6 境界値・異常系のテスト

#### テストケース 2.6.1: 空文字列メッセージ

- **目的**: 空文字列が正しく処理されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info('')`
- **期待結果**:
  - console.log が1回呼ばれる
  - タイムスタンプとログレベルのみが出力される
- **テストデータ**: ''

#### テストケース 2.6.2: null/undefined 引数

- **目的**: null/undefined が正しく文字列化されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**:
  ```typescript
  logger.info(null);
  logger.info(undefined);
  ```
- **期待結果**:
  - console.log が2回呼ばれる
  - null は 'null' として出力される
  - undefined は 'undefined' として出力される
- **テストデータ**: null, undefined

#### テストケース 2.6.3: 非常に長いメッセージ

- **目的**: 長いメッセージ（1000文字以上）が正しく処理されることを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**: `logger.info('a'.repeat(10000))`
- **期待結果**:
  - console.log が1回呼ばれる
  - メッセージ全体が出力される（切り捨てなし）
- **テストデータ**: 'a' × 10000文字

#### テストケース 2.6.4: 循環参照オブジェクト

- **目的**: 循環参照を持つオブジェクトでエラーが発生しないことを検証
- **前提条件**:
  - console.log がモック化されている
- **入力**:
  ```typescript
  const obj: any = { name: 'test' };
  obj.self = obj;  // 循環参照
  logger.info(obj);
  ```
- **期待結果**:
  - JSON.stringify でエラーが発生する可能性がある
  - エラーが発生しても logger が例外をスローしない（またはフォールバック処理）
- **テストデータ**: 循環参照オブジェクト

---

## 3. Integrationテストシナリオ

### 3.1 commands/ モジュールとの統合

#### シナリオ 3.1.1: execute.ts - ワークフロー実行ログ

- **目的**: execute.ts のconsole呼び出しがloggerに置き換えられ、正常にログ出力されることを検証
- **前提条件**:
  - execute.ts の全console呼び出し（39箇所）がloggerに置き換え済み
  - テスト用のプリセットとリポジトリが設定されている
- **テスト手順**:
  1. `npm run ai-workflow execute --preset test-preset --repo test-repo` を実行
  2. 標準出力・標準エラー出力をキャプチャ
  3. ログ出力を確認
- **期待結果**:
  - コマンドが正常に完了する（exit code 0）
  - ログメッセージに `[INFO ]`, `[WARN ]`, `[ERROR]` が含まれる
  - タイムスタンプ形式が統一されている
  - 既存の機能が正常に動作する（ワークフロー実行が成功）
- **確認項目**:
  - [ ] exit code が 0
  - [ ] エラーメッセージが標準エラー出力に出力される
  - [ ] ログフォーマットが統一されている
  - [ ] 既存のワークフロー実行機能が動作する

#### シナリオ 3.1.2: init.ts - 初期化ログ

- **目的**: init.ts のconsole呼び出しがloggerに置き換えられ、正常にログ出力されることを検証
- **前提条件**:
  - init.ts の全console呼び出し（38箇所）がloggerに置き換え済み
  - 初期化可能なリポジトリが存在する
- **テスト手順**:
  1. `npm run ai-workflow init --repo test-repo` を実行
  2. 標準出力をキャプチャ
  3. ログ出力を確認
- **期待結果**:
  - コマンドが正常に完了する
  - 初期化処理のログメッセージが出力される
  - ログフォーマットが統一されている
- **確認項目**:
  - [ ] exit code が 0
  - [ ] 初期化成功メッセージが出力される
  - [ ] ログフォーマットが統一されている

#### シナリオ 3.1.3: list-presets.ts - プリセット一覧ログ

- **目的**: list-presets.ts のconsole呼び出しがloggerに置き換えられ、正常にログ出力されることを検証
- **前提条件**:
  - list-presets.ts の全console呼び出し（9箇所）がloggerに置き換え済み
- **テスト手順**:
  1. `npm run ai-workflow list-presets` を実行
  2. 標準出力をキャプチャ
  3. プリセット一覧が出力されることを確認
- **期待結果**:
  - コマンドが正常に完了する
  - プリセット一覧が表示される
  - ログフォーマットが統一されている
- **確認項目**:
  - [ ] exit code が 0
  - [ ] プリセット一覧が出力される
  - [ ] ログフォーマットが統一されている

#### シナリオ 3.1.4: review.ts - レビューログ

- **目的**: review.ts のconsole呼び出しがloggerに置き換えられ、正常にログ出力されることを検証
- **前提条件**:
  - review.ts の全console呼び出し（3箇所）がloggerに置き換え済み
  - レビュー可能なワークフロー実行結果が存在する
- **テスト手順**:
  1. `npm run ai-workflow review` を実行
  2. 標準出力をキャプチャ
  3. レビュー結果が出力されることを確認
- **期待結果**:
  - コマンドが正常に完了する
  - レビュー結果が表示される
  - ログフォーマットが統一されている
- **確認項目**:
  - [ ] exit code が 0
  - [ ] レビュー結果が出力される
  - [ ] ログフォーマットが統一されている

---

### 3.2 core/ モジュールとの統合

#### シナリオ 3.2.1: git/commit-manager.ts - Git コミットログ

- **目的**: commit-manager.ts のconsole呼び出しがloggerに置き換えられ、Gitコミット処理が正常に動作することを検証
- **前提条件**:
  - commit-manager.ts の全console呼び出し（29箇所）がloggerに置き換え済み
  - Gitリポジトリが初期化されている
- **テスト手順**:
  1. テストファイルを作成・変更
  2. CommitManager のメソッドを呼び出してコミット作成
  3. ログ出力を確認
  4. `git log` でコミットが作成されたことを確認
- **期待結果**:
  - コミットが正常に作成される
  - コミット処理のログメッセージが出力される
  - エラー時のログが標準エラー出力に出力される
- **確認項目**:
  - [ ] コミットが正常に作成される
  - [ ] ログメッセージが出力される
  - [ ] エラーハンドリングが正常に動作する

#### シナリオ 3.2.2: github/pull-request-client.ts - PR作成ログ

- **目的**: pull-request-client.ts のconsole呼び出しがloggerに置き換えられ、PR作成処理が正常に動作することを検証
- **前提条件**:
  - pull-request-client.ts の全console呼び出し（5箇所）がloggerに置き換え済み
  - GitHub API トークンが設定されている（またはモック化）
- **テスト手順**:
  1. PullRequestClient のメソッドを呼び出してPR作成（またはモック）
  2. ログ出力を確認
  3. PR作成処理が正常に完了することを確認
- **期待結果**:
  - PR作成処理が正常に完了する（またはモックが呼ばれる）
  - PR作成のログメッセージが出力される
  - エラー時のログが標準エラー出力に出力される
- **確認項目**:
  - [ ] PR作成処理が正常に完了する
  - [ ] ログメッセージが出力される
  - [ ] エラーハンドリングが正常に動作する

#### シナリオ 3.2.3: secret-masker.ts - シークレットマスキングログ

- **目的**: secret-masker.ts のconsole呼び出しがloggerに置き換えられ、シークレットマスキング処理が正常に動作することを検証
- **前提条件**:
  - secret-masker.ts の全console呼び出し（7箇所）がloggerに置き換え済み
- **テスト手順**:
  1. SecretMasker のメソッドを呼び出してシークレットマスキング
  2. ログ出力を確認
  3. シークレットが正しくマスクされることを確認
- **期待結果**:
  - シークレットマスキングが正常に動作する
  - マスキング処理のログメッセージが出力される
  - ログ内にシークレットが平文で含まれない
- **確認項目**:
  - [ ] シークレットが正しくマスクされる
  - [ ] ログメッセージが出力される
  - [ ] ログ内にシークレットが平文で含まれない

---

### 3.3 phases/ モジュールとの統合

#### シナリオ 3.3.1: base-phase.ts - フェーズ実行ログ

- **目的**: base-phase.ts のconsole呼び出しがloggerに置き換えられ、各フェーズが正常に動作することを検証
- **前提条件**:
  - base-phase.ts の全console呼び出し（33箇所）がloggerに置き換え済み
- **テスト手順**:
  1. 任意のフェーズ（例: Planning Phase）を実行
  2. ログ出力を確認
  3. フェーズが正常に完了することを確認
- **期待結果**:
  - フェーズが正常に完了する
  - フェーズ開始・進行・完了のログメッセージが出力される
  - エラー時のログが標準エラー出力に出力される
- **確認項目**:
  - [ ] フェーズが正常に完了する
  - [ ] ログメッセージが出力される
  - [ ] エラーハンドリングが正常に動作する

#### シナリオ 3.3.2: evaluation.ts - 評価フェーズログ

- **目的**: evaluation.ts のconsole呼び出しがloggerに置き換えられ、評価フェーズが正常に動作することを検証
- **前提条件**:
  - evaluation.ts の全console呼び出し（25箇所）がloggerに置き換え済み
  - 評価可能なワークフロー実行結果が存在する
- **テスト手順**:
  1. Evaluation Phase を実行
  2. ログ出力を確認
  3. 評価レポートが生成されることを確認
- **期待結果**:
  - 評価フェーズが正常に完了する
  - 評価結果のログメッセージが出力される
  - 評価レポートが生成される
- **確認項目**:
  - [ ] 評価フェーズが正常に完了する
  - [ ] ログメッセージが出力される
  - [ ] 評価レポートが生成される

---

### 3.4 既存テストスイートのリグレッション検証

#### シナリオ 3.4.1: 全ユニットテストの実行

- **目的**: logger導入後、既存の全ユニットテストが成功することを検証
- **前提条件**:
  - 全console呼び出しがloggerに置き換え済み
  - テスト内のconsole mockがlogger mockに置き換え済み（必要に応じて）
- **テスト手順**:
  1. `npm run test:unit` を実行
  2. テスト結果を確認
- **期待結果**:
  - 全ユニットテストが成功する（失敗: 0件）
  - テストカバレッジが既存レベル以上
- **確認項目**:
  - [ ] 全ユニットテストが成功する
  - [ ] テストカバレッジが維持されている
  - [ ] 新規の警告・エラーが発生しない

#### シナリオ 3.4.2: 全インテグレーションテストの実行

- **目的**: logger導入後、既存の全インテグレーションテストが成功することを検証
- **前提条件**:
  - 全console呼び出しがloggerに置き換え済み
- **テスト手順**:
  1. `npm run test:integration` を実行
  2. テスト結果を確認
- **期待結果**:
  - 全インテグレーションテストが成功する（失敗: 0件）
  - 既存のワークフローが正常に動作する
- **確認項目**:
  - [ ] 全インテグレーションテストが成功する
  - [ ] 既存のワークフローが正常に動作する
  - [ ] 新規の警告・エラーが発生しない

#### シナリオ 3.4.3: 全テストスイートの実行

- **目的**: logger導入後、ユニット・インテグレーション含む全テストが成功することを検証
- **前提条件**:
  - 全console呼び出しがloggerに置き換え済み
  - ESLint no-consoleルールが追加済み
- **テスト手順**:
  1. `npm test` を実行
  2. テスト結果を確認
  3. テストカバレッジレポートを確認（`npm run test:coverage`）
- **期待結果**:
  - 全テストスイートが成功する（失敗: 0件）
  - テストカバレッジが既存レベル以上
  - ESLintエラーが0件
- **確認項目**:
  - [ ] 全テストが成功する
  - [ ] テストカバレッジが維持されている
  - [ ] ESLintエラーが0件
  - [ ] 新規の警告・エラーが発生しない

---

### 3.5 エンドツーエンドワークフロー検証

#### シナリオ 3.5.1: init → execute → review ワークフロー

- **目的**: logger導入後、エンドツーエンドのワークフローが正常に動作することを検証
- **前提条件**:
  - 全console呼び出しがloggerに置き換え済み
  - テスト用のプリセットとリポジトリが設定されている
- **テスト手順**:
  1. `npm run ai-workflow init --repo test-repo` を実行
  2. `npm run ai-workflow execute --preset test-preset --repo test-repo` を実行
  3. `npm run ai-workflow review --repo test-repo` を実行
  4. 各ステップのログ出力を確認
  5. 各ステップが正常に完了することを確認
- **期待結果**:
  - 全ステップが正常に完了する（exit code 0）
  - 各ステップでログメッセージが出力される
  - ログフォーマットが全ステップで統一されている
  - 既存のワークフロー機能が正常に動作する
- **確認項目**:
  - [ ] init が正常に完了する
  - [ ] execute が正常に完了する
  - [ ] review が正常に完了する
  - [ ] ログフォーマットが統一されている
  - [ ] 既存のワークフロー機能が動作する

#### シナリオ 3.5.2: CI環境での実行（LOG_NO_COLOR=true）

- **目的**: CI環境（LOG_NO_COLOR=true）でワークフローが正常に動作することを検証
- **前提条件**:
  - 全console呼び出しがloggerに置き換え済み
  - `LOG_NO_COLOR=true` が環境変数に設定されている
- **テスト手順**:
  1. `LOG_NO_COLOR=true npm run ai-workflow execute --preset test-preset` を実行
  2. 標準出力をキャプチャ
  3. ANSIエスケープシーケンスが含まれないことを確認
- **期待結果**:
  - コマンドが正常に完了する
  - ログメッセージにANSIエスケープシーケンスが含まれない
  - プレーンテキストのみ出力される
- **確認項目**:
  - [ ] exit code が 0
  - [ ] ANSIエスケープシーケンスが含まれない
  - [ ] ログメッセージが正常に出力される

---

### 3.6 ESLint統合検証

#### シナリオ 3.6.1: ESLint no-consoleルールの検証

- **目的**: ESLint no-consoleルールが正しく設定され、console使用を検出することを検証
- **前提条件**:
  - `.eslintrc.json` に `"no-console": "error"` が追加されている
  - 全console呼び出しがloggerに置き換え済み
- **テスト手順**:
  1. `npx eslint src/` を実行
  2. ESLintエラーを確認
- **期待結果**:
  - ESLintエラーが0件（console呼び出しが存在しない）
  - `src/utils/logger.ts` はoverridesで除外されている
- **確認項目**:
  - [ ] ESLintエラーが0件
  - [ ] logger.ts でのconsole使用はエラーにならない
  - [ ] 他のファイルでのconsole使用はエラーになる（テスト用に一時的にconsole.log追加して確認）

#### シナリオ 3.6.2: 新規console使用の検出

- **目的**: 新規にconsole.logを追加した場合、ESLintでエラーが検出されることを検証
- **前提条件**:
  - `.eslintrc.json` に `"no-console": "error"` が追加されている
- **テスト手順**:
  1. 一時的にテストファイル（例: `src/commands/execute.ts`）に `console.log('test')` を追加
  2. `npx eslint src/commands/execute.ts` を実行
  3. ESLintエラーを確認
  4. テストファイルを元に戻す
- **期待結果**:
  - ESLintエラーが1件検出される
  - エラーメッセージに "Unexpected console statement" が含まれる
- **確認項目**:
  - [ ] ESLintエラーが検出される
  - [ ] エラーメッセージが適切である

---

## 4. テストデータ

### 4.1 Unitテスト用テストデータ

#### ログメッセージサンプル

```typescript
// 正常系メッセージ
const normalMessages = [
  'Application started',
  'User logged in',
  'Data saved successfully',
  'Process completed',
];

// 異常系メッセージ
const errorMessages = [
  'Failed to connect to database',
  'Invalid user credentials',
  'File not found',
  'Permission denied',
];

// オブジェクトサンプル
const objectSamples = [
  { key: 'value' },
  { user: { id: 1, name: 'John' } },
  { items: [1, 2, 3] },
  { timestamp: new Date().toISOString() },
];

// 複雑なオブジェクト
const complexObject = {
  metadata: {
    version: '1.0.0',
    author: 'Test User',
  },
  data: {
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ],
  },
};
```

#### 環境変数パターン

```typescript
// ログレベルパターン
const logLevelPatterns = [
  { LOG_LEVEL: 'debug' },
  { LOG_LEVEL: 'info' },
  { LOG_LEVEL: 'warn' },
  { LOG_LEVEL: 'error' },
  { LOG_LEVEL: 'invalid' },  // 不正な値
  {},  // 未設定
];

// カラーリングパターン
const colorPatterns = [
  { LOG_NO_COLOR: 'true' },
  { LOG_NO_COLOR: '1' },
  { LOG_NO_COLOR: 'false' },  // 無効値
  {},  // 未設定
];
```

### 4.2 Integrationテスト用テストデータ

#### テスト用プリセット

```yaml
# test-preset.yaml
name: test-preset
phases:
  - planning
  - requirements
  - design
settings:
  output_dir: .ai-workflow/test
```

#### テスト用リポジトリ設定

```json
{
  "name": "test-repo",
  "path": "/tmp/test-repo",
  "branch": "test-branch"
}
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

- **Node.js**: v20 以上
- **npm**: v10 以上
- **Jest**: v29.x（プロジェクトの `package.json` で指定）
- **ESLint**: 既存設定 + no-consoleルール

### 5.2 必要な外部サービス

#### ローカル環境

- **Gitリポジトリ**: ローカルに初期化されたGitリポジトリ
- **GitHub API**: モック化（必要に応じて）

#### CI環境

- **Jenkins**: 既存のCI環境
- **環境変数**: `LOG_NO_COLOR=true` を設定

### 5.3 モック/スタブの必要性

#### Unitテスト

- **console.log/console.error**: Jest spyでモック化
- **process.env**: テストごとに初期化・復元
- **chalk**: 実装をそのまま使用（モック不要）

#### Integrationテスト

- **GitHub API**: 必要に応じてモック化（octokitのモック）
- **Git コマンド**: 実際のGitコマンドを使用（テスト用リポジトリで実行）
- **ファイルシステム**: 実際のファイルシステムを使用（テンポラリディレクトリ）

---

## 6. テスト実行計画

### 6.1 Unitテストの実行

```bash
# logger.tsのユニットテスト単体実行
npm run test:unit -- tests/unit/utils/logger.test.ts

# 全ユニットテストの実行
npm run test:unit

# カバレッジ付きで実行
npm run test:coverage -- tests/unit/utils/logger.test.ts
```

### 6.2 Integrationテストの実行

```bash
# 既存インテグレーションテストの実行
npm run test:integration

# 特定のインテグレーションテストの実行
npm run test:integration -- tests/integration/step-resume.test.ts
```

### 6.3 全テストスイートの実行

```bash
# 全テスト（ユニット + インテグレーション）
npm test

# カバレッジレポート付き
npm run test:coverage
```

### 6.4 ESLint検証

```bash
# 全ソースファイルのESLint検証
npx eslint src/

# 特定ファイルの検証
npx eslint src/commands/execute.ts
```

### 6.5 手動動作確認

```bash
# エンドツーエンドワークフロー
npm run ai-workflow init --repo test-repo
npm run ai-workflow execute --preset test-preset --repo test-repo
npm run ai-workflow review --repo test-repo

# CI環境シミュレーション（カラーリング無効）
LOG_NO_COLOR=true npm run ai-workflow execute --preset test-preset
```

---

## 7. 品質ゲートチェックリスト

Phase 3のテストシナリオは以下の品質ゲートを満たす必要があります：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - UNIT_INTEGRATION戦略に基づき、Unitテスト（2.1〜2.6）とIntegrationテスト（3.1〜3.6）の両方を作成

- [x] **主要な正常系がカバーされている**
  - Unitテスト正常系:
    - ログレベル制御（2.1）
    - カラーリング（2.2）
    - タイムスタンプ（2.3）
    - メッセージフォーマット（2.4）
    - 出力先（2.5）
  - Integrationテスト正常系:
    - commands/モジュール（3.1）
    - core/モジュール（3.2）
    - phases/モジュール（3.3）
    - エンドツーエンドワークフロー（3.5）

- [x] **主要な異常系がカバーされている**
  - Unitテスト異常系:
    - 不正なログレベル（2.1.8）
    - 空文字列・null・undefined（2.6.1, 2.6.2）
    - 長いメッセージ（2.6.3）
    - 循環参照オブジェクト（2.6.4）
  - Integrationテスト異常系:
    - エラーハンドリング（各シナリオの確認項目に含む）
    - リグレッション検証（3.4）

- [x] **期待結果が明確である**
  - 全テストケースに「期待結果」セクションを記載
  - 検証可能な形式（console呼び出し回数、メッセージ内容、正規表現マッチ等）
  - 確認項目チェックリスト（[ ]形式）で明確化

---

## まとめ

本テストシナリオは、Issue #61（Issue #50のフォローアップタスク）のテスト戦略 **UNIT_INTEGRATION** に基づき作成しました。

**テストシナリオの主要な特徴**:

1. **Unitテスト**:
   - logger.tsモジュールの全機能をカバー（ログレベル制御、カラーリング、タイムスタンプ、メッセージフォーマット、出力先）
   - 正常系・異常系・境界値テストを含む
   - 合計24個のテストケース

2. **Integrationテスト**:
   - commands/、core/、phases/ モジュールとの統合検証
   - 既存テストスイートのリグレッション検証
   - エンドツーエンドワークフロー検証
   - ESLint統合検証
   - 合計14個のシナリオ

3. **品質ゲート**:
   - Phase 2の戦略に沿ったテストシナリオ ✓
   - 主要な正常系カバー ✓
   - 主要な異常系カバー ✓
   - 期待結果の明確化 ✓

**次ステップ**:

Phase 4（Implementation Phase）で実装を開始し、Phase 5（Test Code Implementation Phase）で本テストシナリオに基づいたテストコードを実装します。

---

**テストシナリオ 完**

*AI Workflow Phase 3 (Test Scenario) により自動生成*
