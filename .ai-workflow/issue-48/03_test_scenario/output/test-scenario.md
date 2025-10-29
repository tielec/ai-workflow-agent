# テストシナリオ: エラーハンドリングユーティリティへのリファクタリング

**Issue**: #48
**タイトル**: リファクタリング: 過剰な 'as Error' キャストを適切なエラーハンドリングユーティリティに置き換え
**作成日**: 2025-01-21
**バージョン**: 1.0

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

### 1.2 テスト対象の範囲

**Unitテスト対象**:
- 新規作成する `src/utils/error-utils.ts` の3つの関数
  - `getErrorMessage(error: unknown): string`
  - `getErrorStack(error: unknown): string | undefined`
  - `isError(error: unknown): error is Error`

**Integrationテスト対象**:
- 既存22ファイル、67箇所の `as Error` キャスト置き換え後の動作
- 既存の統合テスト（52ファイル）が引き続き成功することを検証
- エラーハンドリングパスが正しく動作するか

### 1.3 テストの目的

1. **型安全性の保証**: すべてのエラー型（Error、string、number、null、undefined、カスタムオブジェクト）が安全に処理されることを検証
2. **機能的同等性の保証**: 既存の `as Error` キャストと同等の動作をすることを検証
3. **リグレッション防止**: 既存の統合テストがすべて成功することを確認
4. **エッジケース対応**: 循環参照オブジェクト、カスタムtoString()等のエッジケースが安全に処理されることを検証
5. **never throw保証**: エラーユーティリティ関数が決して例外をスローしないことを検証

---

## 2. Unitテストシナリオ

### 2.1 `getErrorMessage()` のテストシナリオ

#### TC-U001: Error オブジェクトからメッセージを抽出（正常系）

- **目的**: Error オブジェクトの message プロパティが正しく抽出されることを検証
- **前提条件**: なし
- **入力**: `new Error('Test error message')`
- **期待結果**: `'Test error message'` が返される
- **テストデータ**: 標準的な Error オブジェクト
- **優先度**: 高（最も一般的なケース）

---

#### TC-U002: Error サブクラスからメッセージを抽出（正常系）

- **目的**: TypeError、SyntaxError等のErrorサブクラスでも正しく動作することを検証
- **前提条件**: なし
- **入力**:
  - `new TypeError('Type error message')`
  - `new SyntaxError('Syntax error message')`
  - `new RangeError('Range error message')`
- **期待結果**:
  - `'Type error message'`
  - `'Syntax error message'`
  - `'Range error message'`
- **テストデータ**: 各種Errorサブクラス
- **優先度**: 高（実際のコードで頻出）

---

#### TC-U003: 文字列からメッセージを抽出（正常系）

- **目的**: throwされた文字列がそのまま返されることを検証
- **前提条件**: なし
- **入力**: `'String error message'`
- **期待結果**: `'String error message'` が返される
- **テストデータ**: 文字列リテラル
- **優先度**: 高（JavaScriptでは文字列throwが可能）

---

#### TC-U004: 数値からメッセージを抽出（正常系）

- **目的**: throwされた数値が文字列化されることを検証
- **前提条件**: なし
- **入力**:
  - `404`
  - `0`
  - `-1`
  - `Infinity`
  - `NaN`
- **期待結果**:
  - `'404'`
  - `'0'`
  - `'-1'`
  - `'Infinity'`
  - `'NaN'`
- **テストデータ**: 各種数値
- **優先度**: 中（稀だが対応必要）

---

#### TC-U005: null からメッセージを抽出（境界値）

- **目的**: null が安全に処理されることを検証
- **前提条件**: なし
- **入力**: `null`
- **期待結果**: `'null'` が返される
- **テストデータ**: null
- **優先度**: 高（エッジケースで発生可能）

---

#### TC-U006: undefined からメッセージを抽出（境界値）

- **目的**: undefined が安全に処理されることを検証
- **前提条件**: なし
- **入力**: `undefined`
- **期待結果**: `'undefined'` が返される
- **テストデータ**: undefined
- **優先度**: 高（エッジケースで発生可能）

---

#### TC-U007: オブジェクトからメッセージを抽出（正常系）

- **目的**: 一般的なオブジェクトが文字列化されることを検証
- **前提条件**: なし
- **入力**:
  - `{ code: 500, message: 'Internal error' }`
  - `{ toString() { return 'Custom error'; } }`
  - `[]`
  - `[1, 2, 3]`
- **期待結果**:
  - `'[object Object]'`
  - `'Custom error'`（カスタムtoString()が呼ばれる）
  - `''`（空配列）
  - `'1,2,3'`（配列の文字列化）
- **テストデータ**: 各種オブジェクト
- **優先度**: 中（稀だが対応必要）

---

#### TC-U008: Symbol からメッセージを抽出（エッジケース）

- **目的**: Symbol が安全に文字列化されることを検証
- **前提条件**: なし
- **入力**: `Symbol('test')`
- **期待結果**: `'Symbol(test)'` が返される
- **テストデータ**: Symbol
- **優先度**: 低（極めて稀）

---

#### TC-U009: 循環参照オブジェクトからメッセージを抽出（エッジケース）

- **目的**: 循環参照オブジェクトでクラッシュしないことを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const obj: any = { name: 'circular' };
  obj.self = obj;
  ```
- **期待結果**: `'[Unparseable error]'` が返される（String()が失敗した場合のフォールバック）
- **テストデータ**: 循環参照オブジェクト
- **優先度**: 中（never throw保証のため重要）

---

#### TC-U010: 空文字列からメッセージを抽出（境界値）

- **目的**: 空文字列が正しく処理されることを検証
- **前提条件**: なし
- **入力**: `''`
- **期待結果**: `''`（空文字列がそのまま返される）
- **テストデータ**: 空文字列
- **優先度**: 中（エッジケース）

---

### 2.2 `getErrorStack()` のテストシナリオ

#### TC-U101: Error オブジェクトからスタックトレースを抽出（正常系）

- **目的**: Error オブジェクトの stack プロパティが正しく抽出されることを検証
- **前提条件**: なし
- **入力**: `new Error('Test error')`
- **期待結果**: スタックトレース文字列（`'Error: Test error\n    at ...'` 形式）が返される
- **テストデータ**: 標準的な Error オブジェクト
- **優先度**: 高（最も一般的なケース）

---

#### TC-U102: スタックトレースのない Error オブジェクト（異常系）

- **目的**: stack プロパティが存在しない場合、undefined を返すことを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const error = new Error('Test error');
  delete error.stack;
  ```
- **期待結果**: `undefined` が返される
- **テストデータ**: stack プロパティが削除された Error オブジェクト
- **優先度**: 中（エッジケース）

---

#### TC-U103: 非 Error オブジェクトからスタックトレースを抽出（異常系）

- **目的**: 非 Error オブジェクトの場合、undefined を返すことを検証
- **前提条件**: なし
- **入力**:
  - `'string error'`
  - `404`
  - `null`
  - `undefined`
  - `{ message: 'fake error' }`
- **期待結果**: すべて `undefined` が返される
- **テストデータ**: 各種非 Error 型
- **優先度**: 高（非 Error のケースも想定）

---

#### TC-U104: Error サブクラスからスタックトレースを抽出（正常系）

- **目的**: TypeError、SyntaxError等のErrorサブクラスでも正しく動作することを検証
- **前提条件**: なし
- **入力**:
  - `new TypeError('Type error')`
  - `new SyntaxError('Syntax error')`
- **期待結果**: スタックトレース文字列が返される
- **テストデータ**: 各種Errorサブクラス
- **優先度**: 高（実際のコードで頻出）

---

### 2.3 `isError()` のテストシナリオ

#### TC-U201: Error オブジェクトの判定（正常系）

- **目的**: Error オブジェクトに対して true を返すことを検証
- **前提条件**: なし
- **入力**: `new Error('Test error')`
- **期待結果**: `true` が返される
- **テストデータ**: 標準的な Error オブジェクト
- **優先度**: 高（最も一般的なケース）

---

#### TC-U202: Error サブクラスの判定（正常系）

- **目的**: Error のサブクラスに対しても true を返すことを検証
- **前提条件**: なし
- **入力**:
  - `new TypeError('Type error')`
  - `new SyntaxError('Syntax error')`
  - `new RangeError('Range error')`
  - `new ReferenceError('Reference error')`
- **期待結果**: すべて `true` が返される
- **テストデータ**: 各種Errorサブクラス
- **優先度**: 高（実際のコードで頻出）

---

#### TC-U203: 非 Error オブジェクトの判定（正常系）

- **目的**: 非 Error オブジェクトに対して false を返すことを検証
- **前提条件**: なし
- **入力**:
  - `'string error'`
  - `404`
  - `null`
  - `undefined`
  - `{ message: 'fake error' }`
  - `[]`
  - `Symbol('error')`
- **期待結果**: すべて `false` が返される
- **テストデータ**: 各種非 Error 型
- **優先度**: 高（型ガードの正確性を保証）

---

#### TC-U204: 型ナローイングの検証（TypeScript型システム）

- **目的**: `isError()` による型ナローイングが機能することを検証
- **前提条件**: TypeScript の型チェックが有効
- **入力**:
  ```typescript
  const error: unknown = new Error('Test');
  if (isError(error)) {
    // ここで error は Error 型にナローイングされる
    const message: string = error.message;  // コンパイルエラーにならない
    const stack: string | undefined = error.stack;  // コンパイルエラーにならない
  }
  ```
- **期待結果**: TypeScript コンパイルが成功する
- **テストデータ**: TypeScript型チェック
- **優先度**: 高（型安全性の保証）

---

### 2.4 never throw 保証のテストシナリオ

#### TC-U301: getErrorMessage() が例外をスローしないことを検証

- **目的**: あらゆる入力に対して例外をスローしないことを検証
- **前提条件**: なし
- **入力**:
  - 循環参照オブジェクト
  - Proxy オブジェクト（toString()がエラーをthrow）
  - Frozen オブジェクト
  - null、undefined、各種プリミティブ
- **期待結果**: すべての入力に対して文字列が返される（例外がスローされない）
- **テストデータ**: 異常な入力パターン
- **優先度**: 高（never throw保証のため重要）

---

#### TC-U302: getErrorStack() が例外をスローしないことを検証

- **目的**: あらゆる入力に対して例外をスローしないことを検証
- **前提条件**: なし
- **入力**:
  - 循環参照オブジェクト
  - null、undefined、各種プリミティブ
  - オブジェクト（stack プロパティが関数）
- **期待結果**: すべての入力に対して `string | undefined` が返される（例外がスローされない）
- **テストデータ**: 異常な入力パターン
- **優先度**: 高（never throw保証のため重要）

---

#### TC-U303: isError() が例外をスローしないことを検証

- **目的**: あらゆる入力に対して例外をスローしないことを検証
- **前提条件**: なし
- **入力**:
  - 循環参照オブジェクト
  - null、undefined、各種プリミティブ
  - Proxy オブジェクト
- **期待結果**: すべての入力に対して `boolean` が返される（例外がスローされない）
- **テストデータ**: 異常な入力パターン
- **優先度**: 高（never throw保証のため重要）

---

## 3. Integrationテストシナリオ

### 3.1 既存テストスイートのリグレッション検証

#### TC-I001: 既存の全ユニットテストが成功することを検証

- **目的**: リファクタリング後も既存のユニットテストがすべて成功することを確認
- **前提条件**:
  - 22ファイル、67箇所のリファクタリングが完了している
  - `npm run test:unit` が実行可能
- **テスト手順**:
  1. `npm run test:unit` を実行
  2. テスト結果を確認
- **期待結果**:
  - すべてのテストが成功（成功率100%）
  - 新たな失敗テストが発生しない
- **確認項目**:
  - [ ] 既存のユニットテストがすべて成功している
  - [ ] リファクタリングによる新たな失敗がない
  - [ ] テスト実行時間が著しく増加していない（±10%以内）
- **優先度**: 高（リグレッション防止の最重要項目）

---

#### TC-I002: 既存の全統合テストが成功することを検証

- **目的**: リファクタリング後も既存の統合テスト（52ファイル）がすべて成功することを確認
- **前提条件**:
  - 22ファイル、67箇所のリファクタリングが完了している
  - `npm run test:integration` が実行可能
- **テスト手順**:
  1. `npm run test:integration` を実行
  2. テスト結果を確認
- **期待結果**:
  - すべてのテストが成功（成功率100%）
  - 新たな失敗テストが発生しない
- **確認項目**:
  - [ ] 既存の統合テストがすべて成功している
  - [ ] エラーハンドリングパスが正しく動作している
  - [ ] リファクタリングによる新たな失敗がない
- **優先度**: 高（リグレッション防止の最重要項目）

---

### 3.2 Commands モジュールの統合テスト

#### TC-I101: execute コマンドのエラーハンドリング検証

- **目的**: `src/commands/execute.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/commands/execute.ts` の3箇所が `getErrorMessage()` に置き換わっている
  - テスト環境が準備されている
- **テスト手順**:
  1. エラーが発生するシナリオで execute コマンドを実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - エラーメッセージが正しくログに出力される
  - Error オブジェクト以外がthrowされた場合でもクラッシュしない
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] logger.error() にエラーメッセージが渡されている
  - [ ] 文字列エラー（throw 'error'）でもクラッシュしない
  - [ ] null/undefined がthrowされてもクラッシュしない
- **優先度**: 高（エントリーポイントのコマンド）

---

#### TC-I102: init コマンドのエラーハンドリング検証

- **目的**: `src/commands/init.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/commands/init.ts` の4箇所が `getErrorMessage()` に置き換わっている
  - テスト環境が準備されている
- **テスト手順**:
  1. エラーが発生するシナリオで init コマンドを実行（例: 無効なブランチ名）
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - エラーメッセージが正しくログに出力される
  - Error オブジェクト以外がthrowされた場合でもクラッシュしない
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] logger.error() にエラーメッセージが渡されている
  - [ ] Gitエラーが正しくハンドリングされる
  - [ ] GitHubエラーが正しくハンドリングされる
- **優先度**: 高（エントリーポイントのコマンド）

---

### 3.3 Git モジュールの統合テスト

#### TC-I201: branch-manager のエラーハンドリング検証

- **目的**: `src/core/git/branch-manager.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/core/git/branch-manager.ts` の3箇所が `getErrorMessage()` に置き換わっている
  - テスト環境にGitリポジトリが存在する
- **テスト手順**:
  1. 無効なブランチ操作（存在しないブランチへの切り替え等）を実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - Gitコマンドのエラーメッセージが正しくログに出力される
  - simple-git からのエラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] simple-git のエラーが正しくハンドリングされる
  - [ ] エラーメッセージが logger に渡されている
  - [ ] スタックトレースが debug レベルでログに出力される（必要に応じて）
- **優先度**: 高（Gitオペレーションは頻繁に使用）

---

#### TC-I202: commit-manager のエラーハンドリング検証

- **目的**: `src/core/git/commit-manager.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/core/git/commit-manager.ts` の10箇所が `getErrorMessage()` に置き換わっている
  - テスト環境にGitリポジトリが存在する
- **テスト手順**:
  1. コミット失敗シナリオ（空のコミット、無効なコミットメッセージ等）を実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - Gitコマンドのエラーメッセージが正しくログに出力される
  - simple-git からのエラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] simple-git のエラーが正しくハンドリングされる
  - [ ] エラーメッセージが logger に渡されている
  - [ ] 複数の catch ブロックで一貫したエラーハンドリング
- **優先度**: 高（コミット操作は頻繁に使用）

---

#### TC-I203: remote-manager のエラーハンドリング検証

- **目的**: `src/core/git/remote-manager.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/core/git/remote-manager.ts` の8箇所が `getErrorMessage()` に置き換わっている
  - テスト環境にGitリポジトリが存在する
- **テスト手順**:
  1. リモート操作失敗シナリオ（無効なURL、認証失敗等）を実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - Gitコマンドのエラーメッセージが正しくログに出力される
  - simple-git からのエラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] simple-git のエラーが正しくハンドリングされる
  - [ ] エラーメッセージが logger に渡されている
  - [ ] push/pull/fetch のエラーが正しくハンドリングされる
- **優先度**: 高（リモート操作は頻繁に使用）

---

### 3.4 GitHub モジュールの統合テスト

#### TC-I301: github-client のエラーハンドリング検証

- **目的**: `src/core/github-client.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/core/github-client.ts` の1箇所が `getErrorMessage()` に置き換わっている
  - GitHub API トークンが設定されている
- **テスト手順**:
  1. GitHub API エラーシナリオ（無効なトークン、レート制限等）を実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - GitHub API のエラーメッセージが正しくログに出力される
  - Octokit からのエラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] Octokit のエラーが正しくハンドリングされる
  - [ ] エラーメッセージが logger に渡されている
  - [ ] HTTP ステータスコードが適切に処理される
- **優先度**: 高（GitHub API は主要機能）

---

#### TC-I302: comment-client のエラーハンドリング検証

- **目的**: `src/core/github/comment-client.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/core/github/comment-client.ts` の2箇所が `getErrorMessage()` に置き換わっている
  - GitHub API トークンが設定されている
- **テスト手順**:
  1. コメント投稿失敗シナリオ（無効なIssue番号等）を実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - GitHub API のエラーメッセージが正しくログに出力される
  - Octokit からのエラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] Octokit のエラーが正しくハンドリングされる
  - [ ] エラーメッセージが logger に渡されている
  - [ ] コメント投稿失敗が適切に報告される
- **優先度**: 中（コメント投稿は重要機能）

---

#### TC-I303: issue-client のエラーハンドリング検証

- **目的**: `src/core/github/issue-client.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/core/github/issue-client.ts` の2箇所が `getErrorMessage()` に置き換わっている
  - GitHub API トークンが設定されている
- **テスト手順**:
  1. Issue取得失敗シナリオ（存在しないIssue番号等）を実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - GitHub API のエラーメッセージが正しくログに出力される
  - Octokit からのエラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] Octokit のエラーが正しくハンドリングされる
  - [ ] エラーメッセージが logger に渡されている
  - [ ] Issue取得失敗が適切に報告される
- **優先度**: 高（Issue情報は主要機能）

---

### 3.5 Phases モジュールの統合テスト

#### TC-I401: base-phase のエラーハンドリング検証

- **目的**: `src/phases/base-phase.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/phases/base-phase.ts` の4箇所が `getErrorMessage()` に置き換わっている
  - テスト環境が準備されている
- **テスト手順**:
  1. Phase実行失敗シナリオを実行
  2. エラーメッセージがログに出力されることを確認
  3. スタックトレースがデバッグログに出力されることを確認（該当する場合）
  4. エラーが適切に処理されることを確認
- **期待結果**:
  - エラーメッセージが正しくログに出力される
  - スタックトレースが debug レベルでログに出力される（該当する場合）
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] logger.error() にエラーメッセージが渡されている
  - [ ] getErrorStack() が使用されている箇所でスタックトレースが出力される
  - [ ] Phase実行失敗が適切に報告される
- **優先度**: 高（Phaseは全体のワークフロー制御）

---

#### TC-I402: evaluation フェーズのエラーハンドリング検証

- **目的**: `src/phases/evaluation.ts` のエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - `src/phases/evaluation.ts` の6箇所が `getErrorMessage()` に置き換わっている
  - テスト環境が準備されている
- **テスト手順**:
  1. Evaluation実行失敗シナリオを実行
  2. エラーメッセージがログに出力されることを確認
  3. エラーが適切に処理されることを確認
- **期待結果**:
  - エラーメッセージが正しくログに出力される
  - Agent実行エラーが正しくハンドリングされる
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] logger.error() にエラーメッセージが渡されている
  - [ ] Agent実行エラーが適切に報告される
  - [ ] 複数の catch ブロックで一貫したエラーハンドリング
- **優先度**: 高（Evaluationは重要なPhase）

---

### 3.6 エンドツーエンド統合テスト

#### TC-I501: 全体ワークフロー（init → execute）の成功シナリオ

- **目的**: リファクタリング後も全体ワークフローが正常に動作することを検証
- **前提条件**:
  - 全リファクタリングが完了している
  - テスト環境が準備されている（Git、GitHub）
- **テスト手順**:
  1. `npm run workflow:init -- --issue 48` を実行
  2. `npm run workflow:execute -- --issue 48 --phase planning` を実行
  3. 各Phaseのログを確認
  4. 最終的な成果物を確認
- **期待結果**:
  - 全Phaseが正常に完了する
  - エラーログが適切に出力される（エラーが発生した場合）
  - 既存の動作と同等の結果
- **確認項目**:
  - [ ] init コマンドが成功する
  - [ ] execute コマンドが成功する
  - [ ] エラーハンドリングが適切に動作する
  - [ ] ログ出力が適切である
- **優先度**: 高（エンドツーエンドの動作保証）

---

#### TC-I502: 全体ワークフロー（init → execute）のエラーシナリオ

- **目的**: エラー発生時のワークフロー全体の動作を検証
- **前提条件**:
  - 全リファクタリングが完了している
  - テスト環境が準備されている
- **テスト手順**:
  1. 意図的にエラーを発生させる（例: 無効なGitHubトークン）
  2. ワークフローを実行
  3. エラーメッセージがログに出力されることを確認
  4. エラーが適切に処理されることを確認
- **期待結果**:
  - エラーメッセージが正しくログに出力される
  - ワークフローが適切に停止する
  - クラッシュせずに終了する
- **確認項目**:
  - [ ] エラーメッセージが logger に渡されている
  - [ ] スタックトレースが debug レベルでログに出力される
  - [ ] プロセスが適切に終了する（exit code 1）
- **優先度**: 高（エラーハンドリングの実効性検証）

---

### 3.7 非Error型throwの統合テスト

#### TC-I601: 文字列エラーのハンドリング検証

- **目的**: 文字列がthrowされた場合でもクラッシュしないことを検証
- **前提条件**:
  - 全リファクタリングが完了している
  - テストコードで文字列throwをシミュレート可能
- **テスト手順**:
  1. テストコードで `throw 'String error';` を実行
  2. getErrorMessage() が呼ばれることを確認
  3. エラーメッセージがログに出力されることを確認
- **期待結果**:
  - `'String error'` がログに出力される
  - クラッシュしない
- **確認項目**:
  - [ ] 文字列エラーが正しくハンドリングされる
  - [ ] logger.error() に文字列が渡されている
  - [ ] プロセスがクラッシュしない
- **優先度**: 中（エッジケースだが重要）

---

#### TC-I602: null/undefined エラーのハンドリング検証

- **目的**: null/undefined がthrowされた場合でもクラッシュしないことを検証
- **前提条件**:
  - 全リファクタリングが完了している
  - テストコードで null/undefined throwをシミュレート可能
- **テスト手順**:
  1. テストコードで `throw null;` および `throw undefined;` を実行
  2. getErrorMessage() が呼ばれることを確認
  3. エラーメッセージがログに出力されることを確認
- **期待結果**:
  - `'null'` または `'undefined'` がログに出力される
  - クラッシュしない
- **確認項目**:
  - [ ] null エラーが正しくハンドリングされる
  - [ ] undefined エラーが正しくハンドリングされる
  - [ ] logger.error() に文字列が渡されている
  - [ ] プロセスがクラッシュしない
- **優先度**: 中（エッジケースだが重要）

---

## 4. テストデータ

### 4.1 Unitテスト用テストデータ

#### 4.1.1 Error オブジェクトパターン

```typescript
// 標準的な Error
const error1 = new Error('Standard error message');

// Error サブクラス
const typeError = new TypeError('Type error message');
const syntaxError = new SyntaxError('Syntax error message');
const rangeError = new RangeError('Range error message');
const referenceError = new ReferenceError('Reference error message');

// カスタムメッセージを持つ Error
const errorWithLongMessage = new Error('This is a very long error message that contains multiple sentences. It may include additional context about what went wrong and how to fix it.');

// スタックトレースのない Error
const errorWithoutStack = new Error('No stack trace');
delete errorWithoutStack.stack;
```

#### 4.1.2 非Error型パターン

```typescript
// 文字列
const stringError1 = 'Simple error message';
const stringError2 = 'Error: Failed to connect';
const emptyString = '';

// 数値
const numberError1 = 404;
const numberError2 = 0;
const numberError3 = -1;
const infinity = Infinity;
const nan = NaN;

// null/undefined
const nullError = null;
const undefinedError = undefined;

// オブジェクト
const objectError1 = { code: 500, message: 'Internal error' };
const objectError2 = { toString() { return 'Custom error'; } };
const arrayError1 = [];
const arrayError2 = [1, 2, 3];

// Symbol
const symbolError = Symbol('error');

// 循環参照オブジェクト
const circularError: any = { name: 'circular' };
circularError.self = circularError;
```

### 4.2 Integrationテスト用テストデータ

#### 4.2.1 Git エラーシミュレーション

```typescript
// simple-git からのエラー（Error オブジェクト）
const gitError = new Error('fatal: not a git repository');

// 文字列エラー（稀だが可能性あり）
const gitStringError = 'git: command not found';
```

#### 4.2.2 GitHub API エラーシミュレーション

```typescript
// Octokit からのエラー（Error オブジェクト）
const githubError = new Error('Not Found');
githubError.status = 404;

// レート制限エラー
const rateLimitError = new Error('API rate limit exceeded');
rateLimitError.status = 403;
```

#### 4.2.3 Agent実行エラーシミュレーション

```typescript
// Agent実行エラー（Error オブジェクト）
const agentError = new Error('Agent execution failed');

// タイムアウトエラー
const timeoutError = new Error('Timeout: Agent did not respond');
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

#### 5.1.1 ローカル開発環境

- **Node.js**: 20 以上
- **npm**: 10 以上
- **TypeScript**: 5.x
- **Jest**: ES modules サポート
- **Git**: 2.x 以上
- **エディタ**: VSCode（TypeScript型チェック用）

#### 5.1.2 CI/CD環境

- **Jenkins**: Docker コンテナ内で実行
- **GitHub Actions**: オプション（将来的に導入予定）
- **環境変数**:
  - `CI=true`
  - `GITHUB_TOKEN`（Integrationテスト用）

### 5.2 必要な外部サービス・データベース

#### 5.2.1 Git

- **ローカルGitリポジトリ**: テスト用の一時リポジトリを作成
- **Gitコマンド**: すべてのGit操作が実行可能

#### 5.2.2 GitHub

- **GitHub Personal Access Token**: 環境変数 `GITHUB_TOKEN` に設定
- **テスト用リポジトリ**: `tielec/ai-workflow-agent`（読み取り専用でOK）
- **テスト用Issue**: Issue #48（実際のIssue）

#### 5.2.3 Claude API

- **Claude API Key**: 環境変数 `ANTHROPIC_API_KEY` に設定
- **API制限**: Integrationテストでは実際のAPI呼び出しを最小限に抑える

### 5.3 モック/スタブの必要性

#### 5.3.1 Unitテスト（モック/スタブ使用）

- **logger**: モジュール全体をモック
- **external modules**: `simple-git`, `@octokit/rest` 等をモック

#### 5.3.2 Integrationテスト（モック/スタブ使用）

- **Claude API**: 一部のテストでモック（コスト削減）
- **GitHub API**: レート制限を考慮してモック（必要に応じて）
- **Git操作**: 実際のGit操作を実行（一時リポジトリ使用）

#### 5.3.3 モック実装例

```typescript
// logger.ts のモック
jest.mock('@/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// simple-git のモック
jest.mock('simple-git', () => {
  return jest.fn(() => ({
    commit: jest.fn().mockRejectedValue(new Error('Git commit failed')),
    push: jest.fn().mockResolvedValue({}),
    // ... 他のメソッド
  }));
});
```

---

## 6. テスト実行計画

### 6.1 テスト実行順序

**Phase 5: テストコード実装**
1. **Task 5-1**: ユニットテストの実装（1.5~2h）
   - `tests/unit/utils/error-utils.test.ts` の作成
   - TC-U001 〜 TC-U303（約30ケース）
2. **Task 5-2**: 統合テストの更新（0.5~1h）
   - 既存テストファイルでエラーモックを更新（必要に応じて）

**Phase 6: テスト実行**
1. **Task 6-1**: ユニットテスト実行（0.5h）
   - `npm run test:unit` の実行
   - カバレッジレポートの確認（100%を目指す）
2. **Task 6-2**: 統合テスト実行（0.5~1h）
   - `npm run test:integration` の実行
   - 既存52テストファイルの成功確認
   - リグレッションの検出と修正
3. **Task 6-3**: 全テスト実行とカバレッジ確認（0.5h）
   - `npm run test:coverage` の実行
   - カバレッジレポートの分析
   - 未カバー箇所の特定と追加テスト実装（必要に応じて）

### 6.2 テスト実行コマンド

```bash
# ユニットテストのみ実行
npm run test:unit

# 統合テストのみ実行
npm run test:integration

# すべてのテストを実行
npm test

# カバレッジ付きでテスト実行
npm run test:coverage

# 特定のテストファイルのみ実行
npm run test:unit -- error-utils.test.ts

# watchモードでテスト実行（開発中）
npm run test:watch
```

### 6.3 カバレッジ目標

**ユニットテスト（error-utils.ts）**:
- **行カバレッジ**: 100%
- **分岐カバレッジ**: 100%
- **関数カバレッジ**: 100%

**統合テスト（全体）**:
- **行カバレッジ**: 既存と同等以上（リグレッションなし）
- **分岐カバレッジ**: 既存と同等以上
- **関数カバレッジ**: 既存と同等以上

### 6.4 テスト成功基準

**Phase 6: テスト実行の品質ゲート**:
- [ ] ユニットテスト（`npm run test:unit`）が全て成功している
- [ ] 統合テスト（`npm run test:integration`）が全て成功している
- [ ] カバレッジレポートが生成されている
- [ ] `error-utils.ts` のカバレッジが100%である
- [ ] リグレッションが検出されていない

---

## 7. リスクと対策

### 7.1 テスト実装のリスク

#### リスク1: ユニットテストでエッジケースの網羅漏れ

- **影響度**: 中
- **確率**: 中
- **対策**:
  - TC-U301 〜 TC-U303（never throw保証）を重点的にテスト
  - レビュー時に入力パターンの網羅性をチェック

#### リスク2: 統合テストの失敗（リグレッション）

- **影響度**: 高
- **確率**: 低〜中
- **対策**:
  - Phase 6で全テストを実行し、失敗ケースを早期検出
  - 失敗したテストのエラーメッセージを分析
  - 必要に応じてリファクタリングを修正

#### リスク3: モック/スタブの設定ミス

- **影響度**: 中
- **確率**: 中
- **対策**:
  - モック実装を明確にドキュメント化（セクション5.3.3）
  - 実際の動作と乖離しないようにモックを設定

### 7.2 テスト実行のリスク

#### リスク4: CI環境でのテスト失敗

- **影響度**: 高
- **確率**: 低
- **対策**:
  - ローカル環境で全テストが成功することを事前確認
  - CI環境固有の設定（環境変数等）を確認

#### リスク5: テスト実行時間の増加

- **影響度**: 低
- **確率**: 低
- **対策**:
  - ユニットテストは軽量（1ms未満/ケース）
  - 統合テストは既存と同等の時間（新規追加は最小限）

---

## 8. 品質ゲート確認（Phase 3）

本テストシナリオは、Phase 3 の品質ゲートを満たしていることを確認します：

- [x] **Phase 2の戦略（UNIT_INTEGRATION）に沿ったテストシナリオである** ✅
  → セクション2でUnitテストシナリオ（30ケース）、セクション3でIntegrationテストシナリオ（16シナリオ）を作成

- [x] **主要な正常系がカバーされている** ✅
  → TC-U001, TC-U101, TC-U201（各関数の基本動作）
  → TC-I001, TC-I002（既存テストスイートのリグレッション検証）
  → TC-I101 〜 TC-I402（各モジュールの統合テスト）

- [x] **主要な異常系がカバーされている** ✅
  → TC-U005, TC-U006（null/undefined）
  → TC-U009（循環参照オブジェクト）
  → TC-U301 〜 TC-U303（never throw保証）
  → TC-I601, TC-I602（非Error型throwの統合テスト）

- [x] **期待結果が明確である** ✅
  → すべてのテストケースで「期待結果」セクションを記載
  → 具体的な入力・出力を明示
  → 確認項目チェックリストを提供

---

## 9. 参考情報

### 9.1 関連ドキュメント

- **Planning Document**: `.ai-workflow/issue-48/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-48/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-48/02_design/output/design.md`

### 9.2 テストフレームワーク

- **Jest**: https://jestjs.io/
- **Jest (ES modules)**: https://jestjs.io/docs/ecmascript-modules
- **TypeScript + Jest**: https://kulshekhar.github.io/ts-jest/

### 9.3 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2025-01-21 | 初版作成 | AI Workflow Agent |

---

**承認者**: _____________
**承認日**: _____________
