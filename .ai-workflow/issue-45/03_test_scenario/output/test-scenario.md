# テストシナリオ書: Issue #45 - リファクタリング: コマンドハンドラの型安全性を改善（any型を削除）

## 0. Planning Document / Requirements Document / Design Documentの確認

### Planning Phaseからの指針

- **実装戦略**: EXTEND（既存の型定義ファイル `src/types/commands.ts` を拡張）
- **テスト戦略**: UNIT_ONLY（コンパイル時型チェック + ユニットテスト）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルに型検証テストを追加）
- **見積もり工数**: 3~5時間
- **複雑度**: 簡単
- **リスク評価**: 低

### 要件定義書からの受け入れ基準（抜粋）

- AC-1: `ExecuteCommandOptions` インターフェースが正しく定義されている
- AC-2: `ReviewCommandOptions` インターフェースが正しく定義されている
- AC-3: `handleExecuteCommand()` の型シグネチャが修正されている
- AC-4: `handleReviewCommand()` の型シグネチャが修正されている
- AC-5: `MigrateOptions` が `src/types/commands.ts` に移行されている
- AC-6: TypeScript コンパイルが成功する
- AC-7: ESLint チェックが成功する
- AC-8: すべてのテストが通過する

### 設計書からのテスト方針

- **型推論テスト**: TypeScript の型チェックが正しく機能することを `@ts-expect-error` コメントで検証
- **コンパイル時検証**: 不正な型を代入した場合にコンパイルエラーが発生することを確認
- **既存テストとの整合性**: Given-When-Then 形式を踏襲

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY**（Phase 2で決定）

### 1.2 テスト対象の範囲

**実装成果物**:
1. `src/types/commands.ts` - 新規インターフェース（`ExecuteCommandOptions`, `ReviewCommandOptions`, `MigrateOptions`）
2. `src/commands/execute.ts` - `handleExecuteCommand()` 関数の型シグネチャ
3. `src/commands/review.ts` - `handleReviewCommand()` 関数の型シグネチャ
4. `src/commands/migrate.ts` - `MigrateOptions` インポート

**テストファイル**:
- `tests/unit/commands/execute.test.ts` - 既存テストに型推論テストを追加
- `tests/unit/types/commands.test.ts` - 型定義の完全性検証（オプション）

### 1.3 テストの目的

1. **型定義の完全性検証**: すべてのフィールドが正しく定義されているか
2. **型推論の正確性検証**: TypeScript コンパイラが正しく型チェックを実行するか
3. **必須フィールドの検証**: 必須フィールドが省略された場合にエラーが発生するか
4. **型リテラルの検証**: `agent` フィールド等の型リテラルが正しく機能するか
5. **後方互換性の保証**: 既存テストがすべて通過し、ランタイム動作に影響がないか

### 1.4 テスト方針

- **コンパイル時検証を優先**: TypeScript の型チェック機能を最大限活用
- **`@ts-expect-error` によるネガティブテスト**: 不正な型がコンパイルエラーとなることを検証
- **軽量なユニットテスト**: 型推論と必須フィールド検証に焦点を当てる
- **既存テストの活用**: 統合テストが後方互換性を保証するため、新規統合テストは不要

---

## 2. Unitテストシナリオ

### 2.1 `ExecuteCommandOptions` インターフェースの型推論テスト

#### 2.1.1 正常系: すべてのフィールドが定義されている

**テストケース名**: `ExecuteCommandOptions_正常系_全フィールド指定`

- **目的**: `ExecuteCommandOptions` の全14フィールドが正しく型推論されることを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: 全フィールドを指定したオブジェクト
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '123',
    phase: 'all',
    preset: 'quick-fix',
    gitUser: 'Test User',
    gitEmail: 'test@example.com',
    forceReset: false,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    agent: 'auto',
    cleanupOnComplete: false,
    cleanupOnCompleteForce: false,
    requirementsDoc: '/path/to/requirements.md',
    designDoc: '/path/to/design.md',
    testScenarioDoc: '/path/to/test-scenario.md',
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `options.issue` が `'123'` である
  - `options.phase` が `'all'` である
  - `options.agent` が `'auto'` である
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.1.2 正常系: 必須フィールドのみ指定

**テストケース名**: `ExecuteCommandOptions_正常系_必須フィールドのみ`

- **目的**: `issue` フィールド（必須）のみを指定した場合に型チェックが通ることを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: 必須フィールド `issue` のみを指定したオブジェクト
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '123',
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `options.issue` が `'123'` である
  - `options.phase` が `undefined` である
  - `options.preset` が `undefined` である
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.1.3 正常系: オプショナルフィールドの部分指定

**テストケース名**: `ExecuteCommandOptions_正常系_部分指定`

- **目的**: 一部のオプショナルフィールドを指定した場合に型チェックが通ることを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: 必須フィールド + 一部のオプショナルフィールドを指定
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '456',
    phase: 'implementation',
    agent: 'claude',
    cleanupOnComplete: true,
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `options.issue` が `'456'` である
  - `options.phase` が `'implementation'` である
  - `options.agent` が `'claude'` である
  - `options.cleanupOnComplete` が `true` である
  - `options.preset` が `undefined` である
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.1.4 異常系: 必須フィールド `issue` を省略

**テストケース名**: `ExecuteCommandOptions_異常系_必須フィールド省略`

- **目的**: 必須フィールド `issue` を省略した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: `issue` フィールドを省略したオブジェクト
  ```typescript
  // @ts-expect-error - 必須フィールドの省略テスト
  const options: ExecuteCommandOptions = {
    phase: 'all',
  };
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'issue' is missing in type '{ phase: string; }' but required in type 'ExecuteCommandOptions'.`
  - テストは `@ts-expect-error` により通過する（コンパイルエラーが期待通り発生）
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.1.5 異常系: `agent` フィールドに不正な値を指定

**テストケース名**: `ExecuteCommandOptions_異常系_agent型リテラル違反`

- **目的**: `agent` フィールドに型リテラル（'auto' | 'codex' | 'claude'）以外の値を指定した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: `agent` フィールドに不正な値 `'invalid-agent'` を指定
  ```typescript
  // @ts-expect-error - 不正な agent 値のテスト
  const options: ExecuteCommandOptions = {
    issue: '123',
    agent: 'invalid-agent',
  };
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Type '"invalid-agent"' is not assignable to type '"auto" | "codex" | "claude" | undefined'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.1.6 異常系: 存在しないフィールドへのアクセス

**テストケース名**: `ExecuteCommandOptions_異常系_未定義フィールドアクセス`

- **目的**: 存在しないフィールドにアクセスした場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: 存在しないフィールド `nonExistentField` にアクセス
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '123',
  };

  // @ts-expect-error - 未定義フィールドのアクセステスト
  const value = options.nonExistentField;
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'nonExistentField' does not exist on type 'ExecuteCommandOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.1.7 境界値: ブール値フィールドの検証

**テストケース名**: `ExecuteCommandOptions_境界値_ブール値フィールド`

- **目的**: ブール値フィールド（`forceReset`, `skipDependencyCheck`, `ignoreDependencies`, `cleanupOnComplete`, `cleanupOnCompleteForce`）が `true` と `false` の両方を受け入れることを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: ブール値フィールドに `true` と `false` を交互に指定
  ```typescript
  const optionsTrue: ExecuteCommandOptions = {
    issue: '123',
    forceReset: true,
    skipDependencyCheck: true,
    ignoreDependencies: true,
    cleanupOnComplete: true,
    cleanupOnCompleteForce: true,
  };

  const optionsFalse: ExecuteCommandOptions = {
    issue: '123',
    forceReset: false,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    cleanupOnComplete: false,
    cleanupOnCompleteForce: false,
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `optionsTrue` のすべてのブール値フィールドが `true` である
  - `optionsFalse` のすべてのブール値フィールドが `false` である
- **テストデータ**: 上記 `optionsTrue`, `optionsFalse` オブジェクト

---

#### 2.1.8 境界値: `agent` フィールドのすべての有効な値

**テストケース名**: `ExecuteCommandOptions_境界値_agent型リテラル全値`

- **目的**: `agent` フィールドが 'auto', 'codex', 'claude' のすべての値を受け入れることを検証
- **前提条件**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
- **入力**: `agent` フィールドに各有効な値を指定
  ```typescript
  const optionsAuto: ExecuteCommandOptions = {
    issue: '123',
    agent: 'auto',
  };

  const optionsCodex: ExecuteCommandOptions = {
    issue: '123',
    agent: 'codex',
  };

  const optionsClaude: ExecuteCommandOptions = {
    issue: '123',
    agent: 'claude',
  };

  const optionsUndefined: ExecuteCommandOptions = {
    issue: '123',
    agent: undefined,
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `optionsAuto.agent` が `'auto'` である
  - `optionsCodex.agent` が `'codex'` である
  - `optionsClaude.agent` が `'claude'` である
  - `optionsUndefined.agent` が `undefined` である
- **テストデータ**: 上記オブジェクト

---

### 2.2 `ReviewCommandOptions` インターフェースの型推論テスト

#### 2.2.1 正常系: すべてのフィールドが定義されている

**テストケース名**: `ReviewCommandOptions_正常系_全フィールド指定`

- **目的**: `ReviewCommandOptions` の全2フィールドが正しく型推論されることを検証
- **前提条件**: `src/types/commands.ts` に `ReviewCommandOptions` インターフェースが存在する
- **入力**: 全フィールドを指定したオブジェクト
  ```typescript
  const options: ReviewCommandOptions = {
    phase: 'requirements',
    issue: '123',
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `options.phase` が `'requirements'` である
  - `options.issue` が `'123'` である
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.2.2 異常系: 必須フィールド `phase` を省略

**テストケース名**: `ReviewCommandOptions_異常系_phase省略`

- **目的**: 必須フィールド `phase` を省略した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ReviewCommandOptions` インターフェースが存在する
- **入力**: `phase` フィールドを省略したオブジェクト
  ```typescript
  // @ts-expect-error - 必須フィールドの省略テスト
  const options: ReviewCommandOptions = {
    issue: '123',
  };
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'phase' is missing in type '{ issue: string; }' but required in type 'ReviewCommandOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.2.3 異常系: 必須フィールド `issue` を省略

**テストケース名**: `ReviewCommandOptions_異常系_issue省略`

- **目的**: 必須フィールド `issue` を省略した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ReviewCommandOptions` インターフェースが存在する
- **入力**: `issue` フィールドを省略したオブジェクト
  ```typescript
  // @ts-expect-error - 必須フィールドの省略テスト
  const options: ReviewCommandOptions = {
    phase: 'design',
  };
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'issue' is missing in type '{ phase: string; }' but required in type 'ReviewCommandOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.2.4 異常系: 両方の必須フィールドを省略

**テストケース名**: `ReviewCommandOptions_異常系_全フィールド省略`

- **目的**: 両方の必須フィールドを省略した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ReviewCommandOptions` インターフェースが存在する
- **入力**: 空のオブジェクト
  ```typescript
  // @ts-expect-error - すべての必須フィールドの省略テスト
  const options: ReviewCommandOptions = {};
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Type '{}' is missing the following properties from type 'ReviewCommandOptions': phase, issue`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.2.5 異常系: 存在しないフィールドへのアクセス

**テストケース名**: `ReviewCommandOptions_異常系_未定義フィールドアクセス`

- **目的**: 存在しないフィールドにアクセスした場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `ReviewCommandOptions` インターフェースが存在する
- **入力**: 存在しないフィールド `preset` にアクセス
  ```typescript
  const options: ReviewCommandOptions = {
    phase: 'testing',
    issue: '789',
  };

  // @ts-expect-error - 未定義フィールドのアクセステスト
  const value = options.preset;
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'preset' does not exist on type 'ReviewCommandOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

### 2.3 `MigrateOptions` インターフェースの型推論テスト

#### 2.3.1 正常系: すべてのフィールドが定義されている

**テストケース名**: `MigrateOptions_正常系_全フィールド指定`

- **目的**: `MigrateOptions` の全4フィールドが正しく型推論されることを検証
- **前提条件**: `src/types/commands.ts` に `MigrateOptions` インターフェースが存在する（`src/commands/migrate.ts` から移行済み）
- **入力**: 全フィールドを指定したオブジェクト
  ```typescript
  const options: MigrateOptions = {
    sanitizeTokens: true,
    dryRun: false,
    issue: '123',
    repo: '/path/to/repo',
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `options.sanitizeTokens` が `true` である
  - `options.dryRun` が `false` である
  - `options.issue` が `'123'` である
  - `options.repo` が `'/path/to/repo'` である
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.3.2 正常系: 必須フィールドのみ指定

**テストケース名**: `MigrateOptions_正常系_必須フィールドのみ`

- **目的**: 必須フィールド（`sanitizeTokens`, `dryRun`）のみを指定した場合に型チェックが通ることを検証
- **前提条件**: `src/types/commands.ts` に `MigrateOptions` インターフェースが存在する
- **入力**: 必須フィールドのみを指定したオブジェクト
  ```typescript
  const options: MigrateOptions = {
    sanitizeTokens: false,
    dryRun: true,
  };
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `options.sanitizeTokens` が `false` である
  - `options.dryRun` が `true` である
  - `options.issue` が `undefined` である
  - `options.repo` が `undefined` である
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.3.3 異常系: 必須フィールド `sanitizeTokens` を省略

**テストケース名**: `MigrateOptions_異常系_sanitizeTokens省略`

- **目的**: 必須フィールド `sanitizeTokens` を省略した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `MigrateOptions` インターフェースが存在する
- **入力**: `sanitizeTokens` フィールドを省略したオブジェクト
  ```typescript
  // @ts-expect-error - 必須フィールドの省略テスト
  const options: MigrateOptions = {
    dryRun: true,
  };
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'sanitizeTokens' is missing in type '{ dryRun: boolean; }' but required in type 'MigrateOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.3.4 異常系: 必須フィールド `dryRun` を省略

**テストケース名**: `MigrateOptions_異常系_dryRun省略`

- **目的**: 必須フィールド `dryRun` を省略した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/types/commands.ts` に `MigrateOptions` インターフェースが存在する
- **入力**: `dryRun` フィールドを省略したオブジェクト
  ```typescript
  // @ts-expect-error - 必須フィールドの省略テスト
  const options: MigrateOptions = {
    sanitizeTokens: true,
  };
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'dryRun' is missing in type '{ sanitizeTokens: boolean; }' but required in type 'MigrateOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記 `options` オブジェクト

---

### 2.4 `handleExecuteCommand()` 関数シグネチャの型推論テスト

#### 2.4.1 正常系: 型安全な関数呼び出し

**テストケース名**: `handleExecuteCommand_正常系_型安全な呼び出し`

- **目的**: `handleExecuteCommand()` が `ExecuteCommandOptions` 型の引数を受け入れることを検証
- **前提条件**: `src/commands/execute.ts` の `handleExecuteCommand()` 関数シグネチャが `options: ExecuteCommandOptions` に修正されている
- **入力**: `ExecuteCommandOptions` 型のオブジェクト
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '123',
    phase: 'all',
    agent: 'auto',
  };

  // 関数呼び出し
  await handleExecuteCommand(options);
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - 関数が正常に実行される（既存の統合テストで検証）
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.4.2 異常系: 不正な型の引数を渡す

**テストケース名**: `handleExecuteCommand_異常系_不正な型の引数`

- **目的**: `handleExecuteCommand()` に不正な型の引数を渡した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/commands/execute.ts` の `handleExecuteCommand()` 関数シグネチャが `options: ExecuteCommandOptions` に修正されている
- **入力**: 必須フィールド `issue` が欠けたオブジェクト
  ```typescript
  // @ts-expect-error - 不正な型の引数テスト
  await handleExecuteCommand({
    phase: 'all',
  });
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'issue' is missing in type '{ phase: string; }' but required in type 'ExecuteCommandOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記オブジェクト

---

### 2.5 `handleReviewCommand()` 関数シグネチャの型推論テスト

#### 2.5.1 正常系: 型安全な関数呼び出し

**テストケース名**: `handleReviewCommand_正常系_型安全な呼び出し`

- **目的**: `handleReviewCommand()` が `ReviewCommandOptions` 型の引数を受け入れることを検証
- **前提条件**: `src/commands/review.ts` の `handleReviewCommand()` 関数シグネチャが `options: ReviewCommandOptions` に修正されている
- **入力**: `ReviewCommandOptions` 型のオブジェクト
  ```typescript
  const options: ReviewCommandOptions = {
    phase: 'design',
    issue: '456',
  };

  // 関数呼び出し
  await handleReviewCommand(options);
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - 関数が正常に実行される（既存の統合テストで検証）
- **テストデータ**: 上記 `options` オブジェクト

---

#### 2.5.2 異常系: 不正な型の引数を渡す

**テストケース名**: `handleReviewCommand_異常系_不正な型の引数`

- **目的**: `handleReviewCommand()` に不正な型の引数を渡した場合にコンパイルエラーが発生することを検証
- **前提条件**: `src/commands/review.ts` の `handleReviewCommand()` 関数シグネチャが `options: ReviewCommandOptions` に修正されている
- **入力**: 必須フィールド `issue` が欠けたオブジェクト
  ```typescript
  // @ts-expect-error - 不正な型の引数テスト
  await handleReviewCommand({
    phase: 'testing',
  });
  ```
- **期待結果**:
  - TypeScript コンパイラがエラーを検出する
  - エラーメッセージ: `Property 'issue' is missing in type '{ phase: string; }' but required in type 'ReviewCommandOptions'.`
  - テストは `@ts-expect-error` により通過する
- **テストデータ**: 上記オブジェクト

---

### 2.6 `handleMigrateCommand()` 関数の import 検証テスト

#### 2.6.1 正常系: `MigrateOptions` が正しく import されている

**テストケース名**: `handleMigrateCommand_正常系_MigrateOptions_import検証`

- **目的**: `src/commands/migrate.ts` が `MigrateOptions` を `src/types/commands.ts` から正しく import していることを検証
- **前提条件**:
  - `src/types/commands.ts` に `MigrateOptions` インターフェースが存在する
  - `src/commands/migrate.ts` から `MigrateOptions` 定義が削除されている
  - `src/commands/migrate.ts` に `import type { MigrateOptions } from '../types/commands.js';` が追加されている
- **入力**: `MigrateOptions` 型のオブジェクト
  ```typescript
  const options: MigrateOptions = {
    sanitizeTokens: true,
    dryRun: false,
    issue: '789',
  };

  // 関数呼び出し
  await handleMigrateCommand(options);
  ```
- **期待結果**:
  - コンパイルエラーが発生しない
  - `MigrateOptions` が `src/types/commands.ts` から正しく import されている
  - 関数が正常に実行される（既存の統合テストで検証）
- **テストデータ**: 上記 `options` オブジェクト

---

### 2.7 コンパイル検証テスト

#### 2.7.1 正常系: TypeScript コンパイルが成功する

**テストケース名**: `コンパイル検証_正常系_npm_run_build成功`

- **目的**: すべての型定義とコマンドハンドラの修正後、TypeScript コンパイルが成功することを検証
- **前提条件**: すべての実装が完了している
- **入力**: コマンド `npm run build`
- **期待結果**:
  - コンパイルエラーが0件である
  - `dist/` ディレクトリに JavaScript ファイルが生成される
  - 終了コードが0である
- **テストデータ**: なし

---

#### 2.7.2 正常系: ESLint チェックが成功する

**テストケース名**: `コンパイル検証_正常系_ESLint成功`

- **目的**: すべての型定義とコマンドハンドラの修正後、ESLint チェックが成功することを検証
- **前提条件**: すべての実装が完了している
- **入力**: コマンド `npx eslint --ext .ts src`
- **期待結果**:
  - ESLint エラーが0件である
  - ESLint 警告が既存と同等またはそれ以下である
  - 終了コードが0である
- **テストデータ**: なし

---

### 2.8 後方互換性検証テスト

#### 2.8.1 正常系: すべての既存テストが通過する

**テストケース名**: `後方互換性検証_正常系_全テスト通過`

- **目的**: 型定義の追加が既存のランタイム動作に影響を与えていないことを検証
- **前提条件**: すべての実装が完了している
- **入力**: コマンド `npm test`
- **期待結果**:
  - すべてのユニットテストが通過する
  - すべての統合テストが通過する
  - テストカバレッジが低下していない
  - 終了コードが0である
- **テストデータ**: 既存のテストデータ（変更なし）

---

## 3. テストデータ

### 3.1 正常データ

#### 3.1.1 `ExecuteCommandOptions` の正常データ

```typescript
// 最小構成（必須フィールドのみ）
const minimalExecuteOptions: ExecuteCommandOptions = {
  issue: '123',
};

// 標準構成（頻繁に使用されるフィールド）
const standardExecuteOptions: ExecuteCommandOptions = {
  issue: '456',
  phase: 'implementation',
  preset: 'quick-fix',
  agent: 'auto',
};

// 完全構成（すべてのフィールド）
const fullExecuteOptions: ExecuteCommandOptions = {
  issue: '789',
  phase: 'all',
  preset: 'review-requirements',
  gitUser: 'Test User',
  gitEmail: 'test@example.com',
  forceReset: false,
  skipDependencyCheck: false,
  ignoreDependencies: false,
  agent: 'claude',
  cleanupOnComplete: true,
  cleanupOnCompleteForce: false,
  requirementsDoc: '/docs/requirements.md',
  designDoc: '/docs/design.md',
  testScenarioDoc: '/docs/test-scenario.md',
};
```

#### 3.1.2 `ReviewCommandOptions` の正常データ

```typescript
// 標準構成（両方の必須フィールド）
const standardReviewOptions: ReviewCommandOptions = {
  phase: 'requirements',
  issue: '123',
};

// 異なるフェーズ
const designReviewOptions: ReviewCommandOptions = {
  phase: 'design',
  issue: '456',
};

const testingReviewOptions: ReviewCommandOptions = {
  phase: 'testing',
  issue: '789',
};
```

#### 3.1.3 `MigrateOptions` の正常データ

```typescript
// 最小構成（必須フィールドのみ）
const minimalMigrateOptions: MigrateOptions = {
  sanitizeTokens: true,
  dryRun: false,
};

// 標準構成（issue 指定）
const standardMigrateOptions: MigrateOptions = {
  sanitizeTokens: true,
  dryRun: true,
  issue: '123',
};

// 完全構成（すべてのフィールド）
const fullMigrateOptions: MigrateOptions = {
  sanitizeTokens: false,
  dryRun: false,
  issue: '456',
  repo: '/path/to/repo',
};
```

### 3.2 異常データ

#### 3.2.1 `ExecuteCommandOptions` の異常データ

```typescript
// 必須フィールド `issue` 欠落
const missingIssue = {
  phase: 'all',
};

// 不正な `agent` 値
const invalidAgent = {
  issue: '123',
  agent: 'gpt-4', // 'auto' | 'codex' | 'claude' 以外
};

// 不正な型（`forceReset` が文字列）
const invalidType = {
  issue: '123',
  forceReset: 'true', // boolean ではない
};
```

#### 3.2.2 `ReviewCommandOptions` の異常データ

```typescript
// `phase` フィールド欠落
const missingPhase = {
  issue: '123',
};

// `issue` フィールド欠落
const missingIssue = {
  phase: 'design',
};

// 両方のフィールド欠落
const missingAll = {};
```

#### 3.2.3 `MigrateOptions` の異常データ

```typescript
// `sanitizeTokens` フィールド欠落
const missingSanitizeTokens = {
  dryRun: true,
};

// `dryRun` フィールド欠落
const missingDryRun = {
  sanitizeTokens: true,
};

// 不正な型（`dryRun` が文字列）
const invalidType = {
  sanitizeTokens: true,
  dryRun: 'yes', // boolean ではない
};
```

### 3.3 境界値データ

#### 3.3.1 `agent` フィールドの境界値

```typescript
const agentAuto: ExecuteCommandOptions = {
  issue: '123',
  agent: 'auto',
};

const agentCodex: ExecuteCommandOptions = {
  issue: '123',
  agent: 'codex',
};

const agentClaude: ExecuteCommandOptions = {
  issue: '123',
  agent: 'claude',
};

const agentUndefined: ExecuteCommandOptions = {
  issue: '123',
  agent: undefined,
};
```

#### 3.3.2 ブール値フィールドの境界値

```typescript
const allTrue: ExecuteCommandOptions = {
  issue: '123',
  forceReset: true,
  skipDependencyCheck: true,
  ignoreDependencies: true,
  cleanupOnComplete: true,
  cleanupOnCompleteForce: true,
};

const allFalse: ExecuteCommandOptions = {
  issue: '123',
  forceReset: false,
  skipDependencyCheck: false,
  ignoreDependencies: false,
  cleanupOnComplete: false,
  cleanupOnCompleteForce: false,
};

const allUndefined: ExecuteCommandOptions = {
  issue: '123',
  forceReset: undefined,
  skipDependencyCheck: undefined,
  ignoreDependencies: undefined,
  cleanupOnComplete: undefined,
  cleanupOnCompleteForce: undefined,
};
```

---

## 4. テスト環境要件

### 4.1 ローカル開発環境

**必須コンポーネント**:
- Node.js 20 以上
- npm 10 以上
- TypeScript 5.x（`package.json` で指定されたバージョン）

**必須ツール**:
- TypeScript コンパイラ（`tsc`）
- ESLint（`.eslintrc.json` に定義された設定）
- Jest（ユニットテストランナー）

**推奨IDE**:
- VSCode（TypeScript サポート、オートコンプリート、型ヒントの検証用）
- WebStorm（同上）

### 4.2 CI/CD環境

**CI環境**:
- GitHub Actions（既存のCI設定を使用）
- Node.js 20 以上

**必須ステップ**:
1. `npm ci` - 依存関係のインストール
2. `npm run build` - TypeScript コンパイル
3. `npx eslint --ext .ts src` - ESLint チェック
4. `npm test` - すべてのテストの実行

### 4.3 モック/スタブの必要性

**不要**

理由:
- 本Issue は型定義の追加のみであり、外部システムとの連携やランタイム動作の変更はない
- TypeScript コンパイラによる型チェックが主な検証手段であり、モック/スタブは不要
- 既存の統合テストが後方互換性を保証するため、新規のモック作成は不要

---

## 5. テスト実施手順

### 5.1 事前準備

1. **リポジトリのクローン**:
   ```bash
   git clone https://github.com/tielec/ai-workflow-agent.git
   cd ai-workflow-agent
   ```

2. **依存関係のインストール**:
   ```bash
   npm ci
   ```

3. **ブランチの切り替え**（Issue #45 のブランチ）:
   ```bash
   git checkout feature/issue-45-type-safety
   ```

### 5.2 実装後のテスト実行

#### Step 1: TypeScript コンパイル検証

```bash
npm run build
```

**期待結果**:
- コンパイルエラーが0件
- `dist/` ディレクトリに JavaScript ファイルが生成される
- 終了コード: 0

#### Step 2: ESLint チェック

```bash
npx eslint --ext .ts src
```

**期待結果**:
- ESLint エラーが0件
- 終了コード: 0

#### Step 3: ユニットテストの実行

```bash
npm test
```

**期待結果**:
- すべてのユニットテストが通過
- 新規追加された型推論テストが通過
- テストカバレッジが低下していない
- 終了コード: 0

#### Step 4: IDE での型ヒント確認

**VSCode での確認手順**:
1. `src/commands/execute.ts` を開く
2. `handleExecuteCommand()` 関数内で `options.` を入力
3. **期待結果**: `ExecuteCommandOptions` のフィールド一覧がオートコンプリートで表示される
4. `options.issue` にホバー
5. **期待結果**: JSDoc コメントが表示される

**WebStorm での確認手順**:
1. 上記と同様の手順で、オートコンプリートと型ヒントが機能することを確認

### 5.3 CI/CD での自動テスト

**GitHub Actions ワークフロー**:
```yaml
name: CI

on:
  push:
    branches: [ feature/issue-45-type-safety ]
  pull_request:
    branches: [ develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npx eslint --ext .ts src
      - run: npm test
```

**期待結果**:
- すべてのステップが成功
- CI ビルドがグリーン

---

## 6. 品質ゲート（Phase 3）の確認

このテストシナリオ書は、以下の品質ゲート（Phase 3）を満たしています：

- ✅ **Phase 2の戦略（UNIT_ONLY）に沿ったテストシナリオである**: セクション2でユニットテストシナリオのみを記載（統合テスト・BDDテストは含まない）
- ✅ **主要な正常系がカバーされている**:
  - `ExecuteCommandOptions` 正常系: 全フィールド指定、必須フィールドのみ、部分指定（2.1.1, 2.1.2, 2.1.3）
  - `ReviewCommandOptions` 正常系: 全フィールド指定（2.2.1）
  - `MigrateOptions` 正常系: 全フィールド指定、必須フィールドのみ（2.3.1, 2.3.2）
  - コンパイル検証正常系: TypeScript コンパイル成功、ESLint 成功（2.7.1, 2.7.2）
  - 後方互換性検証正常系: 全テスト通過（2.8.1）
- ✅ **主要な異常系がカバーされている**:
  - `ExecuteCommandOptions` 異常系: 必須フィールド省略、型リテラル違反、未定義フィールドアクセス（2.1.4, 2.1.5, 2.1.6）
  - `ReviewCommandOptions` 異常系: 必須フィールド省略（phase, issue, 両方）、未定義フィールドアクセス（2.2.2, 2.2.3, 2.2.4, 2.2.5）
  - `MigrateOptions` 異常系: 必須フィールド省略（sanitizeTokens, dryRun）（2.3.3, 2.3.4）
  - 関数シグネチャ異常系: 不正な型の引数（2.4.2, 2.5.2）
- ✅ **期待結果が明確である**: すべてのテストケースで「期待結果」セクションが明確に記述されており、検証可能

---

## 7. リスクと軽減策（テスト観点）

### リスク1: 型定義の漏れ（テストで検出漏れ）

- **影響度**: 中
- **確率**: 低
- **軽減策**:
  1. セクション2.1で `ExecuteCommandOptions` の全14フィールドをテストカバー
  2. TypeScript コンパイラが未定義フィールドをエラーとして検出するため、コンパイル時に発見可能
  3. 異常系テストケース（2.1.6, 2.2.5）で未定義フィールドアクセスを検証

### リスク2: `@ts-expect-error` の誤用

- **影響度**: 低
- **確率**: 低
- **軽減策**:
  1. `@ts-expect-error` は異常系テストのみで使用（正常系では使用しない）
  2. 各 `@ts-expect-error` の直後に、期待されるエラーメッセージをコメントで記載
  3. テストコードレビューで `@ts-expect-error` の使用箇所を重点的にチェック

### リスク3: 既存テストの失敗（型変更による副作用）

- **影響度**: 低
- **確率**: 極めて低
- **軽減策**:
  1. セクション2.8.1で後方互換性検証テストを定義
  2. すべての実装後、必ず `npm test` を実行して既存テストが通過することを確認
  3. CI/CD パイプラインで自動的に全テストを実行

---

## 8. 受け入れ基準との対応

| 受け入れ基準（要件定義書） | 対応テストシナリオ | セクション |
|-------------------------|------------------|-----------|
| AC-1: `ExecuteCommandOptions` が正しく定義されている | `ExecuteCommandOptions` の型推論テスト（全8ケース） | 2.1 |
| AC-2: `ReviewCommandOptions` が正しく定義されている | `ReviewCommandOptions` の型推論テスト（全5ケース） | 2.2 |
| AC-3: `handleExecuteCommand()` の型シグネチャが修正されている | `handleExecuteCommand()` 関数シグネチャテスト（全2ケース） | 2.4 |
| AC-4: `handleReviewCommand()` の型シグネチャが修正されている | `handleReviewCommand()` 関数シグネチャテスト（全2ケース） | 2.5 |
| AC-5: `MigrateOptions` が移行されている | `MigrateOptions` の型推論テスト（全4ケース）+ import 検証テスト | 2.3, 2.6 |
| AC-6: TypeScript コンパイルが成功する | コンパイル検証テスト（`npm run build`） | 2.7.1 |
| AC-7: ESLint チェックが成功する | コンパイル検証テスト（`npx eslint`） | 2.7.2 |
| AC-8: すべてのテストが通過する | 後方互換性検証テスト（`npm test`） | 2.8.1 |
| AC-9: IDE サポートが機能する | テスト実施手順 Step 4（IDE での型ヒント確認） | 5.2 Step 4 |
| AC-10: JSDoc コメントが適切に記述されている | テスト実施手順 Step 4（IDE でのホバー確認） | 5.2 Step 4 |

---

## 9. まとめ

### 9.1 テストシナリオの特徴

1. **コンパイル時検証中心**: TypeScript の型チェック機能を最大限活用し、`@ts-expect-error` によるネガティブテストを多用
2. **網羅的なフィールド検証**: `ExecuteCommandOptions`（14フィールド）、`ReviewCommandOptions`（2フィールド）、`MigrateOptions`（4フィールド）のすべてをカバー
3. **正常系・異常系・境界値のバランス**: 8つの `ExecuteCommandOptions` テストケースで正常系3件、異常系3件、境界値2件をカバー
4. **後方互換性の保証**: セクション2.8で既存テストの通過を確認し、ランタイム動作への影響がないことを検証

### 9.2 テストカバレッジ

**型推論テスト**: 全19ケース
- `ExecuteCommandOptions`: 8ケース
- `ReviewCommandOptions`: 5ケース
- `MigrateOptions`: 4ケース
- `handleExecuteCommand()`: 2ケース
- `handleReviewCommand()`: 2ケース
- `handleMigrateCommand()`: 1ケース

**コンパイル検証テスト**: 2ケース
- TypeScript コンパイル成功
- ESLint チェック成功

**後方互換性検証テスト**: 1ケース
- 全テスト通過

**合計**: 22テストケース

### 9.3 次のステップ

**Phase 4: Implementation** へ進み、設計書とテストシナリオに基づいて実装を開始します。

実装時の重点事項:
1. セクション5.2のテスト実施手順に従い、各ステップで品質を確認
2. TypeScript コンパイルエラーが発生した場合、セクション3のテストデータを参考に型定義を修正
3. すべてのテストケースが通過することを確認してから次のPhaseに進む

---

**文書バージョン**: 1.0
**作成日**: 2025-01-XX
**最終更新日**: 2025-01-XX
**承認状態**: レビュー待ち
