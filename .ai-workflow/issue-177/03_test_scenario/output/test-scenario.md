# テストシナリオ - Issue #177

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY** (Phase 2 Design Document より)

### 1.2 テスト対象の範囲

1. **Config.canAgentInstallPackages() メソッド** (`src/core/config.ts`)
   - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` の解析ロジック
   - 各環境変数パターン（true、1、false、0、未設定、空文字列、その他）の動作検証

2. **BasePhase.loadPrompt() メソッドの拡張部分** (`src/phases/base-phase.ts`)
   - プロンプト先頭への環境情報注入ロジック
   - `config.canAgentInstallPackages()` の条件分岐

3. **BasePhase.buildEnvironmentInfoSection() メソッド** (`src/phases/base-phase.ts`)
   - 環境情報Markdownセクションの生成ロジック
   - インストール可能な言語リスト（Python、Go、Java、Rust、Ruby）の記載

### 1.3 テストの目的

1. **機能要件の検証**:
   - FR-4: Config クラスの拡張（環境変数解析ロジック）
   - FR-5: プロンプトへの環境情報注入（条件分岐、Markdown生成）
   - FR-6: ユニットテストの追加（テストカバレッジ80%以上）

2. **非機能要件の検証**:
   - NFR-3: 保守性（既存パターンの踏襲）
   - NFR-4: 後方互換性（環境変数未設定時のデフォルト動作）

3. **受け入れ基準の検証**:
   - AC-5: Config クラスの動作確認（環境変数パターン網羅）
   - AC-6: プロンプト注入の動作確認（注入あり/なし）

---

## 2. Unitテストシナリオ

### 2.1 Config.canAgentInstallPackages() メソッド

#### テストスイート: Config.canAgentInstallPackages()

**テスト対象**: `src/core/config.ts` の `Config.canAgentInstallPackages()` メソッド

**テストファイル**: `tests/unit/core/config.test.ts`

**テストフレームワーク**: Jest (既存テストと同様)

---

#### TC-001: 環境変数が "true" の場合、true を返す（正常系）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"true"` の場合、パッケージインストールが許可されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"true"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `true` が返される
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "true"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(true)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="true", When canAgentInstallPackages() is called, Then true is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(true);
});
```

---

#### TC-002: 環境変数が "1" の場合、true を返す（正常系）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"1"` の場合、パッケージインストールが許可されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"1"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `true` が返される
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "1"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(true)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="1", When canAgentInstallPackages() is called, Then true is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = '1';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(true);
});
```

---

#### TC-003: 環境変数が "false" の場合、false を返す（正常系）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"false"` の場合、パッケージインストールが拒否されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"false"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `false` が返される
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "false"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(false)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="false", When canAgentInstallPackages() is called, Then false is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'false';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(false);
});
```

---

#### TC-004: 環境変数が "0" の場合、false を返す（正常系）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"0"` の場合、パッケージインストールが拒否されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"0"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `false` が返される
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "0"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(false)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="0", When canAgentInstallPackages() is called, Then false is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = '0';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(false);
});
```

---

#### TC-005: 環境変数が未設定の場合、false を返す（正常系・デフォルト動作）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が未設定の場合、デフォルト動作（パッケージインストール拒否）が実行されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（明示的に削除）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が未設定であることを確認（`delete process.env.AGENT_CAN_INSTALL_PACKAGES`）
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `false` が返される（デフォルト値）
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES` が `undefined`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(false)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES is not set, When canAgentInstallPackages() is called, Then false is returned (default)', () => {
  // Given
  delete process.env.AGENT_CAN_INSTALL_PACKAGES;
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(false);
});
```

---

#### TC-006: 環境変数が空文字列の場合、false を返す（境界値テスト）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が空文字列 `""` の場合、デフォルト動作（パッケージインストール拒否）が実行されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `""` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `false` が返される（デフォルト値）
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = ""`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(false)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="", When canAgentInstallPackages() is called, Then false is returned (default)', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = '';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(false);
});
```

---

#### TC-007: 環境変数が "TRUE"（大文字）の場合、true を返す（境界値テスト）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"TRUE"`（大文字）の場合、大文字小文字を区別せずに `true` と解釈されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
  - `parseBoolean()` メソッドが `toLowerCase()` を使用していること（設計書より）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"TRUE"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `true` が返される（大文字小文字を区別しない）
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "TRUE"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(true)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="TRUE" (uppercase), When canAgentInstallPackages() is called, Then true is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'TRUE';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(true);
});
```

---

#### TC-008: 環境変数が " true "（前後に空白）の場合、true を返す（境界値テスト）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `" true "`（前後に空白）の場合、空白を除去して `true` と解釈されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
  - `parseBoolean()` メソッドが `trim()` を使用していること（設計書より）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `" true "` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `true` が返される（前後の空白を除去）
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = " true "`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(true)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES=" true " (with whitespace), When canAgentInstallPackages() is called, Then true is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = ' true ';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(true);
});
```

---

#### TC-009: 環境変数が "yes" の場合、false を返す（異常系）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"yes"`（許可されていない値）の場合、パッケージインストールが拒否されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
  - `parseBoolean()` メソッドは `"true"` と `"1"` のみを `true` と解釈（設計書より）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"yes"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `false` が返される（"yes" は許可されていない）
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "yes"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(false)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="yes" (invalid value), When canAgentInstallPackages() is called, Then false is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'yes';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(false);
});
```

---

#### TC-010: 環境変数が "2" の場合、false を返す（異常系）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"2"`（許可されていない数値）の場合、パッケージインストールが拒否されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（テスト開始時）
  - `parseBoolean()` メソッドは `"1"` のみを `true` と解釈（設計書より）
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"2"` に設定
  2. `Config` インスタンスを作成
  3. `config.canAgentInstallPackages()` を呼び出し
- **期待結果**: `false` が返される（"2" は許可されていない）
- **テストデータ**: `process.env.AGENT_CAN_INSTALL_PACKAGES = "2"`
- **検証項目**:
  - `expect(config.canAgentInstallPackages()).toBe(false)`

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES="2" (invalid value), When canAgentInstallPackages() is called, Then false is returned', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = '2';
  const config = new Config();

  // When
  const result = config.canAgentInstallPackages();

  // Then
  expect(result).toBe(false);
});
```

---

### 2.2 BasePhase.loadPrompt() メソッド（プロンプト注入ロジック）

#### テストスイート: BasePhase.loadPrompt() - Environment Info Injection

**テスト対象**: `src/phases/base-phase.ts` の `BasePhase.loadPrompt()` メソッド（環境情報注入ロジック）

**テストファイル**: `tests/unit/phases/base-phase.test.ts` (新規作成または既存ファイルに追加)

**テストフレームワーク**: Jest

---

#### TC-011: AGENT_CAN_INSTALL_PACKAGES=true の場合、プロンプト先頭に環境情報が注入される（正常系）

- **目的**: `config.canAgentInstallPackages()` が `true` の場合、プロンプトの先頭に環境情報セクションが注入されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"true"` に設定されている
  - プロンプトテンプレートファイル（例: `prompts/planning/execute.txt`）が存在する
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"true"` に設定
  2. `Config` インスタンスを作成
  3. `BasePhase` のサブクラス（例: `PlanningPhase`）のインスタンスを作成
  4. `loadPrompt('execute')` を呼び出し
- **期待結果**:
  - プロンプト文字列が返される
  - プロンプトの先頭に `## 🛠️ 開発環境情報` セクションが含まれる
  - セクション内に Python、Go、Java、Rust、Ruby のインストールコマンドが含まれる
- **テストデータ**:
  - `process.env.AGENT_CAN_INSTALL_PACKAGES = "true"`
  - プロンプトテンプレート: 任意の内容（例: `"Execute planning phase..."`）
- **検証項目**:
  - `expect(prompt).toContain('## 🛠️ 開発環境情報')`
  - `expect(prompt).toContain('Python')`
  - `expect(prompt).toContain('apt-get update && apt-get install -y python3 python3-pip')`
  - `expect(prompt).toContain('Go')`
  - `expect(prompt).toContain('Java')`
  - `expect(prompt).toContain('Rust')`
  - `expect(prompt).toContain('Ruby')`
  - プロンプトの先頭に環境情報セクションが配置されている（`prompt.indexOf('## 🛠️') < prompt.indexOf('Execute planning')`）

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt() is called, Then environment info is injected at the beginning', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';
  const config = new Config();
  const phase = new PlanningPhase(config, workflowContext);

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).toContain('## 🛠️ 開発環境情報');
  expect(prompt).toContain('Python');
  expect(prompt).toContain('apt-get update && apt-get install -y python3 python3-pip');
  expect(prompt).toContain('Go');
  expect(prompt).toContain('Java');
  expect(prompt).toContain('Rust');
  expect(prompt).toContain('Ruby');

  // 環境情報セクションがプロンプトの先頭に配置されていることを確認
  const envInfoIndex = prompt.indexOf('## 🛠️');
  const templateContentIndex = prompt.indexOf('Execute planning'); // テンプレート内容の一部
  expect(envInfoIndex).toBeLessThan(templateContentIndex);
});
```

---

#### TC-012: AGENT_CAN_INSTALL_PACKAGES=false の場合、環境情報が注入されない（正常系）

- **目的**: `config.canAgentInstallPackages()` が `false` の場合、プロンプトに環境情報セクションが注入されないことを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"false"` に設定されている
  - プロンプトテンプレートファイル（例: `prompts/planning/execute.txt`）が存在する
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"false"` に設定
  2. `Config` インスタンスを作成
  3. `BasePhase` のサブクラス（例: `PlanningPhase`）のインスタンスを作成
  4. `loadPrompt('execute')` を呼び出し
- **期待結果**:
  - プロンプト文字列が返される
  - プロンプトに `## 🛠️ 開発環境情報` セクションが含まれない
  - プロンプト内容は元のテンプレート内容のみ（環境情報なし）
- **テストデータ**:
  - `process.env.AGENT_CAN_INSTALL_PACKAGES = "false"`
  - プロンプトテンプレート: 任意の内容（例: `"Execute planning phase..."`）
- **検証項目**:
  - `expect(prompt).not.toContain('## 🛠️ 開発環境情報')`
  - `expect(prompt).toContain('Execute planning')` (元のテンプレート内容が保持されている)

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES=false, When loadPrompt() is called, Then environment info is NOT injected', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'false';
  const config = new Config();
  const phase = new PlanningPhase(config, workflowContext);

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).not.toContain('## 🛠️ 開発環境情報');
  expect(prompt).toContain('Execute planning'); // 元のテンプレート内容が保持されている
});
```

---

#### TC-013: AGENT_CAN_INSTALL_PACKAGES が未設定の場合、環境情報が注入されない（正常系・デフォルト動作）

- **目的**: 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が未設定の場合、デフォルト動作（環境情報注入なし）が実行されることを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が設定されていない（明示的に削除）
  - プロンプトテンプレートファイル（例: `prompts/planning/execute.txt`）が存在する
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が未設定であることを確認（`delete process.env.AGENT_CAN_INSTALL_PACKAGES`）
  2. `Config` インスタンスを作成
  3. `BasePhase` のサブクラス（例: `PlanningPhase`）のインスタンスを作成
  4. `loadPrompt('execute')` を呼び出し
- **期待結果**:
  - プロンプト文字列が返される
  - プロンプトに `## 🛠️ 開発環境情報` セクションが含まれない（デフォルト動作）
  - プロンプト内容は元のテンプレート内容のみ
- **テストデータ**:
  - `process.env.AGENT_CAN_INSTALL_PACKAGES` が `undefined`
  - プロンプトテンプレート: 任意の内容（例: `"Execute planning phase..."`）
- **検証項目**:
  - `expect(prompt).not.toContain('## 🛠️ 開発環境情報')`
  - `expect(prompt).toContain('Execute planning')` (元のテンプレート内容が保持されている)

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES is not set, When loadPrompt() is called, Then environment info is NOT injected (default)', () => {
  // Given
  delete process.env.AGENT_CAN_INSTALL_PACKAGES;
  const config = new Config();
  const phase = new PlanningPhase(config, workflowContext);

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).not.toContain('## 🛠️ 開発環境情報');
  expect(prompt).toContain('Execute planning'); // 元のテンプレート内容が保持されている
});
```

---

#### TC-014: 環境情報注入後、テンプレート変数が正しく置換される（正常系）

- **目的**: 環境情報注入後も、テンプレート変数の置換ロジック（既存機能）が正しく動作することを検証
- **前提条件**:
  - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が `"true"` に設定されている
  - プロンプトテンプレートに変数（例: `{issueNumber}`）が含まれている
- **テスト手順**:
  1. 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を `"true"` に設定
  2. `Config` インスタンスを作成
  3. `BasePhase` のサブクラス（例: `PlanningPhase`）のインスタンスを作成
  4. `loadPrompt('execute', { issueNumber: '177' })` を呼び出し
- **期待結果**:
  - プロンプト文字列が返される
  - プロンプトの先頭に環境情報セクションが注入される
  - テンプレート変数 `{issueNumber}` が `"177"` に置換される
- **テストデータ**:
  - `process.env.AGENT_CAN_INSTALL_PACKAGES = "true"`
  - テンプレート変数: `{ issueNumber: '177' }`
  - プロンプトテンプレート: `"Execute planning phase for issue {issueNumber}..."`
- **検証項目**:
  - `expect(prompt).toContain('## 🛠️ 開発環境情報')`
  - `expect(prompt).toContain('Execute planning phase for issue 177')`
  - `expect(prompt).not.toContain('{issueNumber}')` (変数が置換されている)

**実装例**:
```typescript
test('Given AGENT_CAN_INSTALL_PACKAGES=true and template variables, When loadPrompt() is called, Then environment info is injected AND variables are replaced', () => {
  // Given
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';
  const config = new Config();
  const phase = new PlanningPhase(config, workflowContext);

  // When
  const prompt = phase.loadPrompt('execute', { issueNumber: '177' });

  // Then
  expect(prompt).toContain('## 🛠️ 開発環境情報');
  expect(prompt).toContain('Execute planning phase for issue 177');
  expect(prompt).not.toContain('{issueNumber}'); // 変数が置換されている
});
```

---

### 2.3 BasePhase.buildEnvironmentInfoSection() メソッド

#### テストスイート: BasePhase.buildEnvironmentInfoSection()

**テスト対象**: `src/phases/base-phase.ts` の `BasePhase.buildEnvironmentInfoSection()` メソッド

**テストファイル**: `tests/unit/phases/base-phase.test.ts` (新規作成または既存ファイルに追加)

**テストフレームワーク**: Jest

**注意**: `buildEnvironmentInfoSection()` は `private` メソッドであるため、直接テストするのではなく、`loadPrompt()` 経由でテストすることを推奨します。ただし、以下は参考として記載します。

---

#### TC-015: buildEnvironmentInfoSection() が正しいMarkdown形式を返す（正常系）

- **目的**: `buildEnvironmentInfoSection()` メソッドが、正しいMarkdown形式の環境情報セクションを返すことを検証
- **前提条件**:
  - `BasePhase` のサブクラス（例: `PlanningPhase`）のインスタンスが存在する
- **テスト手順**:
  1. `BasePhase` のサブクラスのインスタンスを作成
  2. `buildEnvironmentInfoSection()` メソッドを呼び出し（TypeScript の型アサーション `(phase as any).buildEnvironmentInfoSection()` を使用）
- **期待結果**:
  - Markdown形式の文字列が返される
  - セクションヘッダー `## 🛠️ 開発環境情報` が含まれる
  - Python、Go、Java、Rust、Ruby の5言語のインストールコマンドが含まれる
  - 各言語のインストールコマンドがコードブロック（`` ` ``）で囲まれている
- **テストデータ**: なし
- **検証項目**:
  - `expect(result).toContain('## 🛠️ 開発環境情報')`
  - `expect(result).toContain('Python')`
  - `expect(result).toContain('apt-get update && apt-get install -y python3 python3-pip')`
  - `expect(result).toContain('Go')`
  - `expect(result).toContain('apt-get update && apt-get install -y golang-go')`
  - `expect(result).toContain('Java')`
  - `expect(result).toContain('apt-get update && apt-get install -y default-jdk')`
  - `expect(result).toContain('Rust')`
  - `expect(result).toContain("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y")`
  - `expect(result).toContain('Ruby')`
  - `expect(result).toContain('apt-get update && apt-get install -y ruby ruby-dev')`

**実装例**:
```typescript
test('When buildEnvironmentInfoSection() is called, Then correct Markdown format is returned', () => {
  // Given
  const config = new Config();
  const phase = new PlanningPhase(config, workflowContext);

  // When
  const result = (phase as any).buildEnvironmentInfoSection();

  // Then
  expect(result).toContain('## 🛠️ 開発環境情報');
  expect(result).toContain('Python');
  expect(result).toContain('apt-get update && apt-get install -y python3 python3-pip');
  expect(result).toContain('Go');
  expect(result).toContain('apt-get update && apt-get install -y golang-go');
  expect(result).toContain('Java');
  expect(result).toContain('apt-get update && apt-get install -y default-jdk');
  expect(result).toContain('Rust');
  expect(result).toContain("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y");
  expect(result).toContain('Ruby');
  expect(result).toContain('apt-get update && apt-get install -y ruby ruby-dev');
});
```

---

## 3. テストデータ

### 3.1 環境変数パターン

以下の環境変数パターンをテストでカバーします：

| パターン | 値 | 期待結果 | テストケース |
|---------|----|---------|-----------|
| 正常系（true） | `"true"` | `true` | TC-001 |
| 正常系（1） | `"1"` | `true` | TC-002 |
| 正常系（false） | `"false"` | `false` | TC-003 |
| 正常系（0） | `"0"` | `false` | TC-004 |
| 正常系（未設定） | `undefined` | `false` (デフォルト) | TC-005 |
| 境界値（空文字列） | `""` | `false` (デフォルト) | TC-006 |
| 境界値（大文字） | `"TRUE"` | `true` | TC-007 |
| 境界値（空白） | `" true "` | `true` | TC-008 |
| 異常系（yes） | `"yes"` | `false` | TC-009 |
| 異常系（2） | `"2"` | `false` | TC-010 |

### 3.2 プロンプトテンプレート

テストで使用するプロンプトテンプレートのサンプル：

```
Execute planning phase for issue {issueNumber}.

Analyze the issue and create a development plan.
```

### 3.3 環境情報セクション（期待値）

`buildEnvironmentInfoSection()` が返すべき環境情報セクションのサンプル：

```markdown
## 🛠️ 開発環境情報

このDocker環境では、以下のプログラミング言語をインストール可能です:

- **Python**: `apt-get update && apt-get install -y python3 python3-pip`
- **Go**: `apt-get update && apt-get install -y golang-go`
- **Java**: `apt-get update && apt-get install -y default-jdk`
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`
- **Ruby**: `apt-get update && apt-get install -y ruby ruby-dev`

テスト実行や品質チェックに必要な言語環境は、自由にインストールしてください。
```

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

- **ローカル開発環境**: Node.js 20.x、npm、TypeScript
- **CI/CD環境**: GitHub Actions または Jenkins（既存パイプライン）
- **テストフレームワーク**: Jest（既存テストと同様）

### 4.2 必要な外部サービス・データベース

- **なし**: ユニットテストは外部システム連携不要

### 4.3 モック/スタブの必要性

#### 必要なモック

1. **プロンプトテンプレートファイル** (`prompts/*/execute.txt` 等):
   - `fs.readFileSync()` のモック化
   - テスト用の簡易なテンプレート文字列を返す

2. **WorkflowContext**:
   - BasePhase のコンストラクタに渡す `workflowContext` のモック
   - 最小限のプロパティ（例: `{ issueNumber: '177', repoPath: '/tmp/test' }`）を持つオブジェクト

#### モック不要

- **Config クラス**: 実際のインスタンスを使用（環境変数の読み取りのみ）
- **BasePhase のサブクラス**: 実際のインスタンスを使用（テスト対象のメソッドを呼び出す）

---

## 5. テスト実行方法

### 5.1 ローカル環境でのテスト実行

```bash
# すべてのテストを実行
npm test

# 特定のテストファイルのみ実行
npm test tests/unit/core/config.test.ts

# カバレッジレポート生成
npm run test:coverage
```

### 5.2 CI/CD環境でのテスト実行

- **GitHub Actions**: `.github/workflows/test.yml` で自動実行
- **Jenkins**: `Jenkinsfile` の `test` ステージで自動実行

### 5.3 テストカバレッジ目標

- **新規コードのカバレッジ**: 80%以上（Planning Document の非機能要件より）
- **既存コードへの影響**: なし（既存テストが引き続きパスすること）

---

## 6. テストシナリオサマリー

### 6.1 テストケース一覧

| ID | テストケース名 | テスト対象 | テスト種別 | 優先度 |
|----|--------------|-----------|-----------|-------|
| TC-001 | 環境変数が "true" の場合、true を返す | Config.canAgentInstallPackages() | 正常系 | 高 |
| TC-002 | 環境変数が "1" の場合、true を返す | Config.canAgentInstallPackages() | 正常系 | 高 |
| TC-003 | 環境変数が "false" の場合、false を返す | Config.canAgentInstallPackages() | 正常系 | 高 |
| TC-004 | 環境変数が "0" の場合、false を返す | Config.canAgentInstallPackages() | 正常系 | 高 |
| TC-005 | 環境変数が未設定の場合、false を返す | Config.canAgentInstallPackages() | 正常系（デフォルト） | 高 |
| TC-006 | 環境変数が空文字列の場合、false を返す | Config.canAgentInstallPackages() | 境界値 | 中 |
| TC-007 | 環境変数が "TRUE"（大文字）の場合、true を返す | Config.canAgentInstallPackages() | 境界値 | 中 |
| TC-008 | 環境変数が " true "（空白）の場合、true を返す | Config.canAgentInstallPackages() | 境界値 | 中 |
| TC-009 | 環境変数が "yes" の場合、false を返す | Config.canAgentInstallPackages() | 異常系 | 中 |
| TC-010 | 環境変数が "2" の場合、false を返す | Config.canAgentInstallPackages() | 異常系 | 中 |
| TC-011 | AGENT_CAN_INSTALL_PACKAGES=true の場合、環境情報が注入される | BasePhase.loadPrompt() | 正常系 | 高 |
| TC-012 | AGENT_CAN_INSTALL_PACKAGES=false の場合、環境情報が注入されない | BasePhase.loadPrompt() | 正常系 | 高 |
| TC-013 | AGENT_CAN_INSTALL_PACKAGES が未設定の場合、環境情報が注入されない | BasePhase.loadPrompt() | 正常系（デフォルト） | 高 |
| TC-014 | 環境情報注入後、テンプレート変数が正しく置換される | BasePhase.loadPrompt() | 正常系 | 高 |
| TC-015 | buildEnvironmentInfoSection() が正しいMarkdown形式を返す | BasePhase.buildEnvironmentInfoSection() | 正常系 | 中 |

**合計**: 15件のテストケース（Planning Document の見積もり「約10件」を上回るが、網羅性を優先）

### 6.2 テストカバレッジマトリクス

| 機能要件 | 受け入れ基準 | テストケース |
|---------|------------|------------|
| FR-4: Config クラスの拡張 | AC-5: Config クラスの動作確認 | TC-001 ～ TC-010 |
| FR-5: プロンプトへの環境情報注入 | AC-6: プロンプト注入の動作確認 | TC-011 ～ TC-015 |
| NFR-4: 後方互換性 | 環境変数未設定時のデフォルト動作 | TC-005, TC-013 |

---

## 7. 品質ゲート確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **UNIT_ONLY** 戦略に完全準拠
- ユニットテストのみを作成（Integration/BDDシナリオは不要）
- 各関数・メソッド単位のテストケースを網羅

### ✅ 主要な正常系がカバーされている

- TC-001, TC-002: `canAgentInstallPackages()` の正常系（true を返す）
- TC-003, TC-004, TC-005: `canAgentInstallPackages()` の正常系（false を返す）
- TC-011: プロンプト注入の正常系（注入あり）
- TC-012, TC-013: プロンプト注入の正常系（注入なし）
- TC-014: テンプレート変数置換との統合（既存機能との互換性）

### ✅ 主要な異常系がカバーされている

- TC-009: 許可されていない値（"yes"）への対応
- TC-010: 許可されていない数値（"2"）への対応

### ✅ 期待結果が明確である

- すべてのテストケースに「期待結果」セクションを記載
- 検証項目（`expect()` 文）を具体的に記載
- Given/When/Then パターンで構造化

---

## 8. 補足情報

### 8.1 Planning Document との整合性

本テストシナリオは、Planning Document（Phase 0）で策定された以下の方針に準拠しています：

- ✅ **テスト戦略（UNIT_ONLY）**: ユニットテスト中心の変更
- ✅ **テストコード戦略（EXTEND_TEST）**: 既存テストファイル（`config.test.ts`）への追加
- ✅ **見積もり工数**: 約1時間（Planning Document の Phase 3 見積もりに準拠）

### 8.2 テストシナリオの優先度

**高優先度**（Phase 4 実装前に必ず完了すべき）:
- TC-001 ～ TC-005: Config クラスの主要な正常系
- TC-011 ～ TC-014: BasePhase のプロンプト注入ロジック

**中優先度**（実装後の品質向上に貢献）:
- TC-006 ～ TC-010: Config クラスの境界値・異常系
- TC-015: buildEnvironmentInfoSection() の検証

### 8.3 参考資料

- Planning Document: `.ai-workflow/issue-177/00_planning/output/planning.md`
- Requirements Document: `.ai-workflow/issue-177/01_requirements/output/requirements.md`
- Design Document: `.ai-workflow/issue-177/02_design/output/design.md`
- 既存のテストパターン: `tests/unit/core/config.test.ts`

---

**作成日時**: 2025-01-31
**作成者**: AI Workflow Agent (Test Scenario Phase)
**Issue番号**: #177
**バージョン**: v1.0
