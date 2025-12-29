# テストシナリオ書 - Issue #558

**Issue タイトル**: metadata.json に不適切なマススキング処理がされてしまう
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/558
**作成日**: 2025-01-02
**プロジェクト**: AI Workflow Agent

---

## 0. Planning & Requirements & Design 成果物確認

### 開発計画の要約
- **実装戦略**: REFACTOR - 既存のSecretMaskerクラスの構造的問題を修正
- **テスト戦略**: UNIT_INTEGRATION - 個別メソッドテストと統合テストの両方を実装
- **テストコード戦略**: EXTEND_TEST - 既存のsecret-masker.test.ts（720行）にテストケースを追加
- **複雑度**: 中程度（10~14時間の見積もり）
- **リスク**: 中（機密性の高いマスキング機能への変更）

### 根本原因分析結果
Issue分析により特定された3つの構造的問題：
1. **URL復元ロジックの問題**: maskString()メソッドでGitHub URLのプレースホルダー復元が失敗
2. **キー名マスキングの誤動作**: オブジェクトのキー名が汎用トークン正規表現に誤マッチ
3. **ignoredPathsの未活用**: maskObject()で`ignoredPaths: []`が空指定されているため不要なマスキングが発生

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略: UNIT_INTEGRATION

**テスト戦略の根拠**：
- **UNIT**: SecretMaskerの個別メソッド（maskString、maskObject）の動作検証が必須
- **INTEGRATION**: metadata.json全体のマスキング動作とIssue生成プロセスでの統合テストが必要
- BDDは不要：エンドユーザーのストーリーではなく、内部的なセキュリティ処理の修正
- 既存テストケース（720行）の回帰防止が重要
- セキュリティ機能のため、詳細な境界値テストと異常系テストが必要

### テスト対象の範囲
- **主要テスト対象**: SecretMaskerクラスのmaskString()、maskObject()メソッド
- **統合テスト対象**: IssueAIGeneratorのsanitizePayload()とSecretMaskerの連携
- **回帰テスト対象**: 既存のマスキング機能（GitHub Token、メール、環境変数等）

### テストの目的
- Issue #558で報告された3つの不適切マスキング問題の解決検証
- 既存のマスキング機能に回帰が発生しないことの確認
- metadata.json保存時の正常マスキング動作の保証

---

## 2. Unitテストシナリオ

### 2.1 SecretMasker.maskString()メソッドのテスト

#### テストケース1: URL復元機能（REQ-001）

**テストケース名**: maskString_GitHub_URL復元_正常系
**目的**: GitHub URLがプレースホルダーではなく完全形式で保持されることを検証
**前提条件**: GitHub URLを含む文字列が入力される
**入力**:
```typescript
const input = "issue_url: https://github.com/tielec/ai-code-companion/issues/49, pr_url: https://github.com/tielec/ai-code-companion/pull/51";
```
**期待結果**:
```typescript
const expected = "issue_url: https://github.com/tielec/ai-code-companion/issues/49, pr_url: https://github.com/tielec/ai-code-companion/pull/51";
```
**テストデータ**: 実際のGitHub URLパターンを含むテスト文字列

**テストケース名**: maskString_GitHub_URL復元_境界値
**目的**: リポジトリ名が20文字以上の場合のURL復元動作を検証
**前提条件**: 長いリポジトリ名を含むGitHub URLが入力される
**入力**:
```typescript
const input = "Repository: https://github.com/very-long-organization-name/extremely-long-repository-name-that-exceeds-limits/issues/123";
```
**期待結果**: URLは保持され、個別の長い部分のみが適切に処理される
**テストデータ**: 20文字を超えるowner/repo名を含むURL

#### テストケース2: キー名保護機能（REQ-002）

**テストケース名**: maskString_キー名保護_正常系
**目的**: オブジェクトキー名が誤ってマスキングされないことを検証
**前提条件**: JSON形式のオブジェクトキーを含む文字列が入力される
**入力**:
```typescript
const input = '"implementation_strategy": null, "test_code_strategy": "extend"';
```
**期待結果**:
```typescript
const expected = '"implementation_strategy": null, "test_code_strategy": "extend"';
```
**テストデータ**: design_decisions内のキー名パターン

**テストケース名**: maskString_キー名保護_境界値
**目的**: 20文字以上のキー名も保護されることを検証
**前提条件**: 長いキー名を含む文字列が入力される
**入力**:
```typescript
const input = '"very_long_implementation_strategy_name_over_twenty_chars": true';
```
**期待結果**: キー名が保持される
**テストデータ**: 20文字を超える長いキー名

#### テストケース3: 汎用トークン正規表現改善（REQ-004）

**テストケース名**: maskString_汎用トークン_除外パターン確認
**目的**: 除外パターンは保持され、真のトークンのみマスキングされることを検証
**前提条件**: リポジトリ名、プレースホルダー、実際のトークンが混在する
**入力**:
```typescript
const input = "Repository: tielec/infrastructure-as-code, Token: AKIAIOSFODNN7EXAMPLE1234567890, Placeholder: __GITHUB_URL_0__, Key: implementation_strategy";
```
**期待結果**:
```typescript
const expected = "Repository: tielec/infrastructure-as-code, Token: [REDACTED_TOKEN], Placeholder: __GITHUB_URL_0__, Key: implementation_strategy";
```
**テストデータ**: 複数パターンが混在するテスト文字列

#### テストケース4: 既存マスキング機能維持

**テストケース名**: maskString_既存マスキング_GitHub_Token
**目的**: 既存のGitHubトークンマスキングが維持されることを検証
**前提条件**: GitHubトークンを含む文字列が入力される
**入力**:
```typescript
const input = "Token: ghp_1234567890abcdefghij, PAT: github_pat_1234567890abcdefghij";
```
**期待結果**:
```typescript
const expected = "Token: [REDACTED_GITHUB_TOKEN], PAT: [REDACTED_GITHUB_TOKEN]";
```
**テストデータ**: ghp_、github_pat_プレフィックスを含むトークン

**テストケース名**: maskString_既存マスキング_メール
**目的**: 既存のメールアドレスマスキングが維持されることを検証
**前提条件**: メールアドレスを含む文字列が入力される
**入力**:
```typescript
const input = "Contact: user@example.com, Admin: admin@company.org";
```
**期待結果**:
```typescript
const expected = "Contact: [REDACTED_EMAIL], Admin: [REDACTED_EMAIL]";
```
**テストデータ**: 標準的なメールアドレス形式

### 2.2 SecretMasker.maskObject()メソッドのテスト

#### テストケース5: ignoredPathsパラメータ機能（REQ-003）

**テストケース名**: maskObject_ignoredPaths_正常系
**目的**: 指定されたパスがマスキングから除外されることを検証
**前提条件**: ignoredPathsが適切に設定されている
**入力**:
```typescript
const input = {
  issue_url: "https://github.com/tielec/ai-code-companion/issues/49",
  secret_token: "AKIAIOSFODNN7EXAMPLE1234567890",
  design_decisions: {
    implementation_strategy: null
  }
};
const options = { ignoredPaths: ["issue_url", "design_decisions.implementation_strategy"] };
```
**期待結果**:
```typescript
const expected = {
  issue_url: "https://github.com/tielec/ai-code-companion/issues/49",
  secret_token: "[REDACTED_TOKEN]",
  design_decisions: {
    implementation_strategy: null
  }
};
```
**テストデータ**: metadata.jsonの構造を模擬したオブジェクト

#### テストケース6: ネストしたオブジェクトのマスキング

**テストケース名**: maskObject_ネスト構造_正常系
**目的**: ネストしたオブジェクトでも適切にマスキングされることを検証
**前提条件**: 多層構造のオブジェクトが入力される
**入力**:
```typescript
const input = {
  metadata: {
    repository: "tielec/ai-code-companion",
    secrets: {
      api_key: "AKIAIOSFODNN7EXAMPLE1234567890"
    }
  }
};
```
**期待結果**: repository は保持、api_key はマスキング
**テストデータ**: 3層ネスト構造のテストオブジェクト

---

## 3. Integrationテストシナリオ

### 3.1 IssueAIGenerator.sanitizePayload()との統合テスト

#### シナリオ1: metadata.json全体のマスキング統合動作

**シナリオ名**: IssueAIGenerator_SecretMasker統合_metadata全体
**目的**: Issue生成プロセスでのメタデータマスキングが期待通りに動作することを検証
**前提条件**: IssueAIGeneratorのsanitizePayload()でignoredPathsが適切に設定されている
**テスト手順**:
1. Issue #558で報告された実際のmetadata.json構造を用意
2. sanitizePayload()メソッドを実行
3. 戻り値のpayloadオブジェクトを検証
4. issue_url、pr_urlが正常なURL形式で保持されていることを確認
5. design_decisionsのキー名が保持されていることを確認
6. 実際の機密情報（base_commit等）がマスキングされていることを確認

**期待結果**:
- issue_url: "https://github.com/tielec/ai-code-companion/issues/49"（プレースホルダーではない）
- pr_url: "https://github.com/tielec/ai-code-companion/pull/51"（プレースホルダーではない）
- design_decisions.implementation_strategy: キー名が保持される
- base_commit: "[REDACTED_TOKEN]"（マスキングされる）

**確認項目**:
- [ ] GitHub URLが完全形式で保持される
- [ ] オブジェクトキー名が保護される
- [ ] 機密情報は適切にマスキングされる
- [ ] ignoredPathsが正しく機能する

### 3.2 エンドツーエンド統合テスト

#### シナリオ2: ワークフロー実行時のマスキング統合検証

**シナリオ名**: ワークフロー_マスキング_エンドツーエンド
**目的**: 実際のワークフロー実行時と同等の条件でマスキングが正常動作することを検証
**前提条件**:
- 環境変数にダミーのGITHUB_TOKEN等が設定されている
- テスト用のmetadata.jsonファイルが準備されている
**テスト手順**:
1. SecretMaskerインスタンスを作成
2. Issue #558の問題を含むmetadata.jsonを用意
3. maskSecretsInWorkflowDir()メソッドを実行
4. ファイルが適切に更新されることを確認
5. マスキング結果を検証

**期待結果**: ファイル内のマスキングが期待通りに実行される
**確認項目**:
- [ ] ファイルの読み書きが正常実行される
- [ ] マスキング統計が正確である
- [ ] 元ファイルから期待される変更のみが適用される

---

## 4. Issue #558具体的ケースのテストシナリオ

### 4.1 実際の問題再現テスト

#### テストケース7: Issue #558問題の再現と解決確認

**テストケース名**: Issue558_実際問題_再現テスト
**目的**: Issue #558で報告された実際の問題を再現し、修正後に解決されることを確認
**前提条件**: Issue #558のmetadata.jsonの実際のデータ構造を使用
**入力**:
```typescript
const issue558_metadata = {
  "issue_number": "49",
  "issue_url": "https://github.com/tielec/ai-code-companion/issues/49",
  "pr_url": "https://github.com/tielec/ai-code-companion/pull/51",
  "design_decisions": {
    "implementation_strategy": null,
    "test_strategy": null,
    "test_code_strategy": null
  },
  "base_commit": "a1b2c3d4e5f6789012345678901234567890abcd"
};
```
**期待結果**:
```typescript
const expected = {
  "issue_number": "49",
  "issue_url": "https://github.com/tielec/ai-code-companion/issues/49",  // プレースホルダーではない
  "pr_url": "https://github.com/tielec/ai-code-companion/pull/51",      // プレースホルダーではない
  "design_decisions": {
    "implementation_strategy": null,  // キー名が保持される
    "test_strategy": null,
    "test_code_strategy": null
  },
  "base_commit": "[REDACTED_TOKEN]"   // マスキングされる
};
```
**テストデータ**: Issue #558で実際に報告されたmetadata.json構造

### 4.2 修正前後の比較テスト

#### テストケース8: 修正前後の動作比較

**テストケース名**: Issue558_修正前後_動作比較
**目的**: 修正前の問題のある動作と修正後の正常動作を比較検証
**前提条件**: 修正前と修正後のSecretMaskerの動作を比較する
**テスト手順**:
1. 問題のあるマスキング結果のスナップショットを作成
2. 修正後のマスキング処理を実行
3. 結果を比較し、期待される修正が適用されていることを確認

**確認項目**:
- [ ] __GITHUB_URL_X__ プレースホルダーが解決されている
- [ ] [REDACTED_TOKEN] キー名が復元されている
- [ ] 真の機密情報は引き続きマスキングされている

---

## 5. テストデータ

### 5.1 正常データ

```typescript
// GitHub URL テストパターン
const validGitHubUrls = [
  "https://github.com/owner/repo",
  "https://github.com/owner/repo.git",
  "https://github.com/owner-name/repo-name/issues/123",
  "https://github.com/owner_name/repo_name/pull/456"
];

// オブジェクトキー名テストパターン
const validObjectKeys = [
  "implementation_strategy",
  "test_code_strategy",
  "very_long_implementation_strategy_name_over_twenty_characters",
  "design_decisions"
];

// metadata.json 構造テストデータ
const sampleMetadata = {
  issue_number: "49",
  issue_url: "https://github.com/tielec/ai-code-companion/issues/49",
  pr_url: "https://github.com/tielec/ai-code-companion/pull/51",
  repository: "tielec/ai-code-companion",
  target_repository: {
    github_name: "tielec/ai-code-companion",
    remote_url: "https://github.com/tielec/ai-code-companion.git"
  },
  design_decisions: {
    implementation_strategy: null,
    test_strategy: null,
    test_code_strategy: null
  },
  base_commit: "a1b2c3d4e5f6789012345678901234567890abcd"
};
```

### 5.2 異常データ

```typescript
// 機密情報テストパターン（マスキング対象）
const secretPatterns = [
  "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
  "github_pat_1234567890abcdefghijklmnopqrstuvwxyz",
  "AKIAIOSFODNN7EXAMPLE1234567890",
  "user@example.com",
  "Bearer ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ"
];

// エッジケースデータ
const edgeCases = {
  emptyString: "",
  nullValue: null,
  undefinedValue: undefined,
  veryLongString: "a".repeat(10000),
  specialCharacters: "特殊文字テスト!@#$%^&*()_+-=[]{}|;':\",./<>?",
  mixedContent: "Repository: owner/repo, Token: AKIAIOSFODNN7EXAMPLE1234567890, URL: https://github.com/owner/repo"
};
```

### 5.3 境界値データ

```typescript
// 文字数境界値
const boundaryStrings = {
  exactly20Chars: "12345678901234567890",
  just19Chars: "1234567890123456789",
  just21Chars: "123456789012345678901"
};

// ignoredPaths パターン
const ignoredPathPatterns = [
  "issue_url",
  "pr_url",
  "target_repository.remote_url",
  "target_repository.github_name",
  "design_decisions.*"
];
```

---

## 6. テスト環境要件

### 6.1 必要なテスト環境
- **ローカル開発環境**: Node.js 18.x以上、TypeScript 5.x
- **テストフレームワーク**: Jest（既存のテスト環境に準拠）
- **CI/CD環境**: GitHub Actionsでのテスト実行

### 6.2 必要な外部サービス・データベース
- 外部サービスへの接続は不要（モック使用）
- データベースは不要
- ファイルシステムへの読み書きテストが必要

### 6.3 モック/スタブの必要性

```typescript
// 環境変数モック
const mockEnvironmentVariables = {
  GITHUB_TOKEN: "ghp_test1234567890abcdefghijklmnopqrstuvwxyz",
  OPENAI_API_KEY: "sk-test1234567890abcdefghijklmnopqrstuvwxyz123456",
  AWS_ACCESS_KEY_ID: "AKIATEST1234567890AB",
  AWS_SECRET_ACCESS_KEY: "testSecretKey1234567890abcdefghijklmnopqrstuvwxyz"
};

// ファイルシステムモック
const mockFileSystem = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  glob: jest.fn()
};
```

### 6.4 テスト実行手順

```bash
# 1. 依存関係インストール
npm install

# 2. 環境変数設定（テスト用ダミー値）
export GITHUB_TOKEN="ghp_test1234567890abcdefghijklmnopqrstuvwxyz"
export OPENAI_API_KEY="sk-test1234567890abcdefghijklmnopqrstuvwxyz123456"

# 3. Unit テスト実行
npm test secret-masker.test.ts

# 4. Integration テスト実行
npm test issue-ai-generator.test.ts

# 5. 全体テスト実行
npm test
```

---

## 7. 品質ゲート（Phase 3）

### 必須要件チェックリスト

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づくユニット・統合テストシナリオを作成
- [x] **主要な正常系がカバーされている**:
  - URL復元機能の正常動作
  - キー名保護機能の正常動作
  - ignoredPaths機能の正常動作
  - 既存マスキング機能の維持
- [x] **主要な異常系がカバーされている**:
  - 境界値テスト（20文字の閾値）
  - エッジケース（空文字列、特殊文字等）
  - 不正データの処理
- [x] **期待結果が明確である**: 各テストケースで具体的な入力・出力例を記載し、検証可能な形で定義

### 追加品質確認項目

- [x] **Issue #558の具体的問題がテストでカバーされている**: 実際のメタデータ構造を使用したテストケースを含む
- [x] **既存テストとの整合性**: EXTEND_TEST戦略に基づき既存のsecret-masker.test.ts拡張を前提とした設計
- [x] **実行可能性**: 具体的なテストデータと環境要件を定義し、実際に実行可能なシナリオを作成
- [x] **セキュリティ考慮**: マスキング機能のテストとして適切なセキュリティレベルでの検証項目を含む

---

## 注意事項

1. **セキュリティ最優先**: テスト実行時も機密情報の漏洩リスクを考慮し、本物の認証情報は使用しない
2. **既存テストとの統合**: 既存のsecret-masker.test.ts（720行）を拡張する形でテストを追加
3. **段階的テスト**: Unit テスト → Integration テスト → 回帰テストの順序でテストを実行
4. **モック使用**: 環境変数や外部依存は適切にモック化してテスト環境の独立性を確保
5. **テストデータ管理**: 実際のIssue #558のデータを基にしつつ、機密情報を含まないテストデータを使用

## 成功の定義

1. **機能的成功**: Issue #558で報告された3つの問題（URL プレースホルダー、キー名マスキング、ignoredPaths 未活用）が全て解決されることをテストで検証
2. **回帰防止**: 既存のマスキング機能（GitHub Token、メール、環境変数等）に影響がないことをテストで確認
3. **保守性向上**: 追加されたテストケースにより、将来のマスキング機能変更時の回帰を防止できる体制を確立