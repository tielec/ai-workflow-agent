# 要件定義書 - Issue #558

**Issue タイトル**: metadata.json に不適切なマススキング処理がされてしまう
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/558
**作成日**: 2025-01-02
**プロジェクト**: AI Workflow Agent

---

## 0. Planning Documentの確認

### 開発計画の全体像
計画書（planning.md）により、以下の戦略が確定されている：

- **実装戦略**: REFACTOR - 既存のSecretMaskerクラスの構造的問題を修正
- **テスト戦略**: UNIT_INTEGRATION - 個別メソッドテストと統合テストの両方を実装
- **テストコード戦略**: EXTEND_TEST - 既存のsecret-masker.test.ts（720行）にテストケースを追加
- **複雑度**: 中程度（10~14時間の見積もり）
- **リスク**: 中（機密性の高いマスキング機能への変更）

### 根本原因分析
計画書で特定された3つの構造的問題：
1. **URL復元ロジックの問題**: maskString()メソッドでGitHub URLのプレースホルダー復元が失敗
2. **キー名マスキングの誤動作**: オブジェクトのキー名が汎用トークン正規表現に誤マッチ
3. **ignoredPathsの未活用**: maskObject()で`ignoredPaths: []`が空指定されているため不要なマスキングが発生

---

## 1. 概要

### 背景
AI Workflow Agentのワークフロー実行時に、metadata.jsonファイルに不適切なマスキング処理が適用され、必要な情報が失われている。具体的には、GitHub URLやオブジェクトキー名など、本来マスキングすべきでない箇所がマスキングされ、正常な動作を妨げている。

### 目的
SecretMaskerクラスのマスキング処理を修正し、以下を実現する：
- GitHub URL（issue_url、pr_url）の適切な保持
- オブジェクトキー名（implementation_strategy等）の保護
- 真の機密情報（トークン、API Key等）のマスキング維持
- metadata.json保存時の正常動作確保

### ビジネス価値
- **運用継続性**: ワークフロー実行後のメタデータが正しく保持され、トレーサビリティが向上
- **セキュリティ維持**: 機密情報の適切なマスキングにより、セキュリティレベルを維持
- **保守性向上**: マスキング処理の明確化により、将来の機能拡張が容易になる

### 技術的価値
- **コード品質向上**: マスキング処理の構造的問題解決により、保守性が向上
- **テスト充実**: 具体的なマスキングケースのテスト追加により、回帰防止が強化される
- **仕様明確化**: マスキング対象・非対象の明確な基準策定

---

## 2. 機能要件

### 2.1 URL復元機能の修正（高優先度）

**要件ID**: REQ-001
**要件**: SecretMasker.maskString()のGitHub URL復元ロジックを修正し、issue_urlおよびpr_urlが正常なURLとして保持されるようにする

**詳細**:
- 現状: `"issue_url": "https://__GITHUB_URL_0__/issues/49"`
- 期待: `"issue_url": "https://github.com/tielec/ai-code-companion/issues/49"`
- 対象URL: issue_url、pr_url、その他のGitHub URL
- トークンを含まないGitHub URLは完全な形式で保持される

### 2.2 キー名保護機能の実装（高優先度）

**要件ID**: REQ-002
**要件**: オブジェクトのキー名が汎用トークン正規表現による誤マスキングを受けないよう、キー名保護機能を実装する

**詳細**:
- 現状: `"[REDACTED_TOKEN]": null` （implementation_strategyキーがマスキング）
- 期待: `"implementation_strategy": null`
- 対象: design_decisions内のキー名、その他すべてのJSONオブジェクトキー
- 20文字以上のキー名も保護される

### 2.3 ignoredPaths機能の活用（中優先度）

**要件ID**: REQ-003
**要件**: IssueAIGenerator.sanitizePayload()でignoredPathsパラメータを適切に設定し、metadata.json内の特定パスをマスキング除外する

**詳細**:
- 現状: `{ ignoredPaths: [] }` （空指定）
- 期待: issue_url、pr_url、design_decisionsキーなどを除外パスに設定
- パスパターン: "issue_url", "pr_url", "design_decisions.*" など
- ワイルドカード使用は最小限に抑制

### 2.4 汎用トークン正規表現の改善（中優先度）

**要件ID**: REQ-004
**要件**: 汎用トークン正規表現を改善し、除外パターン（REDACTEDプレースホルダー、リポジトリ名等）を追加する

**詳細**:
- GitHub URLプレースホルダー（__GITHUB_URL_X__等）の除外
- REDACTEDプレースホルダーの除外
- リポジトリ名パターン（owner/repo）の除外
- 既存の除外パターン（ghp_、github_pat_等）の維持

---

## 3. 非機能要件

### 3.1 パフォーマンス要件
- マスキング処理のパフォーマンス劣化: 現行比+10%以内
- metadata.jsonファイル（通常1-5KB）の処理時間: 100ms以内
- 大規模ファイル（10MB以上）での処理時間: 現行比+20%以内

### 3.2 セキュリティ要件
- 既存のマスキング機能（環境変数ベース、GitHubトークン、メール等）の完全維持
- 新規追加される除外パターンによる機密情報漏洩の防止
- テストケースによるマスキング動作の検証

### 3.3 可用性・信頼性要件
- 既存テスト（720行のsecret-masker.test.ts）の100%成功維持
- 新規テストケースによる回帰防止
- エラーハンドリングの既存動作維持（読み取り専用ファイル、存在しないディレクトリ等）

### 3.4 保守性・拡張性要件
- マスキング対象・非対象の明確な基準をJSDocで文書化
- プレースホルダー管理の簡素化（Map構造の活用）
- 将来的なマスキングパターン追加の容易性確保

---

## 4. 制約事項

### 4.1 技術的制約
- **既存API維持**: SecretMaskerクラスのpublicメソッド（maskObject、maskSecretsInWorkflowDir等）のシグネチャ変更禁止
- **下位互換性**: 既存のマスキング動作（環境変数値、GitHubトークン、メール等）の完全維持
- **TypeScript環境**: 型安全性を保持し、リントエラーを発生させない
- **Node.js依存**: 現在使用中のNode.jsバージョンでの動作保証

### 4.2 リソース制約
- **開発期間**: 計画書見積もりの10~14時間以内
- **テストファイル**: 新規ファイル作成せず、既存のsecret-masker.test.ts拡張のみ
- **レビュー工数**: 段階的修正による部分レビューで効率化

### 4.3 ポリシー制約
- **セキュリティポリシー**: 機密情報のマスキング漏れは絶対に発生させない
- **コーディング規約**: 既存コードスタイル（ESLint、Prettier設定）の遵守
- **テスト戦略**: UNIT_INTEGRATIONに基づく包括的なテスト実装

---

## 5. 前提条件

### 5.1 システム環境
- Node.js環境での動作
- TypeScript 5.x系での型チェック
- Jest テストフレームワークでのテスト実行
- ESLint/Prettierによる静的解析

### 5.2 依存コンポーネント
- **既存SecretMasker**: src/core/secret-masker.ts（371行）の完全理解
- **IssueAIGenerator**: src/core/github/issue-ai-generator.ts（526行）のsanitizePayload()メソッド
- **既存テスト**: tests/unit/secret-masker.test.ts（720行）のテストケース構造

### 5.3 外部システム連携
- 環境変数によるシークレット管理システム
- Gitリポジトリ管理システム（GitHub URL生成）
- ワークフローファイルシステム（metadata.json保存）

---

## 6. 受け入れ基準

### 6.1 URL復元機能（REQ-001）

**Given**: metadata.jsonにissue_urlとpr_urlが含まれている
**When**: SecretMaskerでマスキング処理を実行する
**Then**: GitHub URLがプレースホルダーではなく完全なURL形式で保持される

**具体例**:
```json
// Before (現状)
{
  "issue_url": "https://__GITHUB_URL_0__/issues/49",
  "pr_url": "https://__GITHUB_URL_2__/pull/51"
}

// After (期待)
{
  "issue_url": "https://github.com/tielec/ai-code-companion/issues/49",
  "pr_url": "https://github.com/tielec/ai-code-companion/pull/51"
}
```

### 6.2 キー名保護機能（REQ-002）

**Given**: design_decisionsオブジェクトにimplementation_strategyキーが含まれている
**When**: SecretMaskerでマスキング処理を実行する
**Then**: キー名がそのまま保持され、[REDACTED_TOKEN]に置換されない

**具体例**:
```json
// Before (現状)
{
  "design_decisions": {
    "[REDACTED_TOKEN]": null,
    "test_strategy": null
  }
}

// After (期待)
{
  "design_decisions": {
    "implementation_strategy": null,
    "test_strategy": null
  }
}
```

### 6.3 ignoredPaths機能（REQ-003）

**Given**: IssueAIGenerator.sanitizePayload()でignoredPathsが適切に設定されている
**When**: メタデータオブジェクトのマスキング処理を実行する
**Then**: 指定されたパスのデータがマスキングから除外される

**テスト方法**: issue_url、pr_url、design_decisionsパスを指定し、これらの値が保持されることを確認

### 6.4 汎用トークン正規表現改善（REQ-004）

**Given**: リポジトリ名、プレースホルダー、REDACTEDトークンを含むテキストがある
**When**: maskString()メソッドを実行する
**Then**: 除外パターンは保持され、真のトークンのみマスキングされる

**テスト例**:
- Input: `"Repository: tielec/infrastructure-as-code, Token: AKIAIOSFODNN7EXAMPLE1234567890"`
- Output: リポジトリ名は保持、トークンのみ`[REDACTED_TOKEN]`

### 6.5 既存機能維持

**Given**: 既存のsecret-masker.test.ts（720行）のテストケース
**When**: 修正後のSecretMaskerでテストを実行する
**Then**: 全テストケースが成功する

### 6.6 新規テストケース

**Given**: Issue #558の具体的なマスキングシナリオ
**When**: 新規追加されたテストケースを実行する
**Then**: metadata.json全体のマスキング動作が期待通りに動作する

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項
- **新規マスキングパターン追加**: 既存パターン（GitHubトークン、メール、汎用トークン）以外の追加
- **設定ファイル化**: マスキング設定の外部ファイル化や動的変更機能
- **パフォーマンス大幅改善**: アルゴリズム根本変更による高速化
- **他ファイル形式対応**: metadata.json以外の新規ファイル形式（XML、YAML等）への対応
- **暗号化機能**: マスキング以外のセキュリティ機能（暗号化、ハッシュ化等）

### 7.2 将来的な拡張候補
- **設定可能なマスキングパターン**: 設定ファイルによるマスキングパターンのカスタマイズ
- **パフォーマンス最適化**: 大容量ファイルに対するストリーム処理や並列処理
- **高度な除外パターン**: 正規表現ベースのより柔軟な除外パターン
- **監査ログ機能**: マスキング実行履歴の記録と分析機能
- **設定UI**: Webベースのマスキング設定管理インターフェース

---

## 注意事項

1. **セキュリティ最優先**: マスキング処理の修正時は、機密情報の漏洩リスクを最優先で考慮する
2. **段階的修正**: maskString() → sanitizePayload() → 統合テストの順で段階的に修正し、各段階でテスト実行する
3. **既存テストの保護**: 既存のsecret-masker.test.ts（720行）のテストケースは全て維持し、回帰を防止する
4. **実装戦略の重要性**: REFACTORの実装戦略に基づき、新規機能追加ではなく既存コード改善に注力する
5. **テスト戦略の遵守**: UNIT_INTEGRATIONのテスト戦略に基づき、個別メソッドテストと統合テストの両方を確実に実装する
6. **ignoredPaths活用**: EXTEND_TESTのテストコード戦略に基づき、既存テストファイルにテストケースを適切に追加する