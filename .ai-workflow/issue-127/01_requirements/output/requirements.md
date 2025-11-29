# 要件定義書 - Issue #127

## 0. Planning Documentの確認

本要件定義は、Planning Phase（Phase 0）で策定された以下の開発計画に基づいて実施します：

### 開発計画の概要
- **実装戦略**: EXTEND（既存のPhase 1コードを拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **見積もり工数**: 12〜16時間
- **複雑度**: 中程度
- **リスク評価**: 中（エージェントプロンプト設計、Phase 1互換性、言語非依存性検証）

### 実装方針の継承
Planning Documentで策定された以下の方針を踏襲します：
1. Phase 1（Issue #126）で実装済みの `RepositoryAnalyzer`, `IssueDeduplicator`, `IssueGenerator`, `handleAutoIssueCommand` を拡張
2. 新規クラス・モジュールの作成は不要（プロンプトテンプレート、型定義の追加のみ）
3. コアアーキテクチャ（エージェント→解析→重複除外→Issue生成）は変更せず、検出ロジックのみ追加
4. 既存の `--category` オプションを `'refactor'` に対応させる形で拡張

---

## 1. 概要

### 背景
Issue #121「AIエージェントによる自動Issue作成機能の実装」のサブタスクとして、Phase 2ではリファクタリング検出機能を追加します。Phase 1（Issue #126）では `--category bug` によるバグ検出機能を実装済みであり、同様のアーキテクチャを活用して、リファクタリングが必要なコードやドキュメントを自動検出する機能を提供します。

### 目的
AIエージェント（Codex / Claude）を活用し、以下のリファクタリング候補を自動検出してGitHub Issueとして生成することで、コード品質の継続的な改善を支援します：
- コード品質問題（大きすぎるファイル・関数、複雑な条件分岐）
- コード重複（類似コードブロック、コピー＆ペースト）
- 未使用コード（Dead code、到達不能コード）
- ドキュメント品質（コメント欠落、古い記述）

### ビジネス価値・技術的価値
- **ビジネス価値**: 保守性の向上、技術的負債の削減、開発速度の向上
- **技術的価値**: 言語非依存のリファクタリング検出、エージェント活用による高精度な分析、既存アーキテクチャの再利用による開発効率向上

### スコープ
- **Phase 2 MVP**: `--category refactor` オプションによるリファクタリング検出機能の実装
- **将来拡張**: `--category all` でバグ + リファクタリング同時検出（Phase 3以降）

---

## 2. 機能要件

以下の機能要件は、Planning Documentの「4. タスク分割」セクションに基づいて抽出し、優先度を付与しています。

### FR-1: リファクタリング検出エンジンの実装
**優先度**: 高

**説明**: `src/core/repository-analyzer.ts` を拡張し、AIエージェント（Codex / Claude）を使用してリファクタリング候補を検出する機能を追加します。

**詳細要件**:
- `RepositoryAnalyzer.analyzeForRefactoring()` メソッドを実装
- エージェント（Codex / Claude）を呼び出し、リポジトリ全体を分析
- 以下の4つの検出パターンをサポート:
  1. **コード品質問題**: 大きすぎるファイル（500行以上）、大きすぎる関数（50行以上）、複雑な条件分岐（ネスト深さ4以上）
  2. **コード重複**: 類似コードブロック、コピー＆ペーストされたロジック、共通化可能なパターン
  3. **未使用コード**: 未使用のインポート・変数・関数、Dead code、到達不能コード
  4. **ドキュメント品質**: コメント・ドキュメントの欠落、古い・不正確なドキュメント、README等の更新漏れ
- 検出結果を `RefactorCandidate[]` 形式で返却

**成功条件**:
- 4つの検出パターンすべてに対応したリファクタリング候補を検出できる
- エージェントの出力を正しくパースし、構造化データに変換できる

---

### FR-2: エージェントプロンプトテンプレートの作成
**優先度**: 高

**説明**: リファクタリング検出用のプロンプトテンプレート `src/prompts/auto-issue/detect-refactoring.txt` を作成します。

**詳細要件**:
- 4つの検出パターン（コード品質、重複、未使用、ドキュメント）ごとに具体的な指示を記述
- エージェントの出力形式をJSON形式で明示（`RefactorCandidate` 型に準拠）
- 言語非依存性を考慮した汎用的な指示文を記述
- 検出基準を明確化（例: ファイル行数500行以上、関数行数50行以上、ネスト深さ4以上）
- 出力例を含め、エージェントの理解を助ける

**成功条件**:
- プロンプトテンプレートがPhase 1のバグ検出プロンプトと整合性を保つ
- エージェントが4つの検出パターンすべてを理解し、適切な候補を返す

---

### FR-3: 型定義の拡張
**優先度**: 高

**説明**: `src/types/auto-issue.ts` に `RefactorCandidate` 型定義を追加します。

**詳細要件**:
```typescript
interface RefactorCandidate {
  type: 'large-file' | 'large-function' | 'high-complexity' | 'duplication' | 'unused-code' | 'missing-docs';
  filePath: string;
  lineRange?: { start: number; end: number };
  description: string;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
}
```
- `AutoIssueOptions.category` の型に `'refactor'` を追加
- バリデーションロジック（最小文字数、必須フィールド）を実装

**成功条件**:
- 型定義がPhase 1の `BugCandidate` と整合性を保つ
- TypeScriptコンパイルエラーが発生しない

---

### FR-4: CLIオプションの拡張
**優先度**: 高

**説明**: `src/commands/auto-issue.ts` の `parseOptions` および `handleAutoIssueCommand` を拡張し、`--category refactor` オプションを処理します。

**詳細要件**:
- `parseOptions` で `--category refactor` を処理
- `handleAutoIssueCommand` でカテゴリに応じて `analyzer.analyze()` または `analyzer.analyzeForRefactoring()` を呼び出す条件分岐を追加
- エラーハンドリング（未対応のカテゴリ指定時）

**成功条件**:
- `--category refactor` でリファクタリング検出が実行される
- `--category bug` で既存のバグ検出が引き続き動作する（リグレッションなし）

---

### FR-5: リファクタリング用Issueテンプレートの生成
**優先度**: 中

**説明**: `src/core/issue-generator.ts` を拡張し、リファクタリング用のIssue本文テンプレートを生成します。

**詳細要件**:
- リファクタリング候補の詳細（ファイルパス、行範囲、問題点、推奨改善策）を含む
- 具体的なリファクタリング手順を提案
- 期待される効果（可読性向上、保守性向上等）を記述
- 優先度に応じたラベル（`priority:high`, `priority:medium`, `priority:low`）を自動付与

**成功条件**:
- 生成されたIssue本文がリファクタリング作業に必要な情報を含む
- Phase 1のバグ用テンプレートと同様の品質を保つ

---

### FR-6: 言語非依存性のサポート
**優先度**: 中

**説明**: TypeScript以外のリポジトリ（Python, Go, Java等）でもリファクタリング検出が動作することを保証します。

**詳細要件**:
- プロンプトテンプレートに「言語を問わず、コード構造の問題を検出する」ことを明記
- 既存の除外パターン（`EXCLUDED_DIRECTORIES`, `EXCLUDED_FILE_PATTERNS`）がTypeScript以外の言語でも機能することを確認
- Phase 5（テストコード実装）でPython（`.py`）、Go（`.go`）のサンプルリポジトリを用意してテスト

**成功条件**:
- Python, Go, Javaのサンプルリポジトリでリファクタリング候補を検出できる
- 言語固有のファイル（`.py`, `.go`, `.java`）が正しく処理される

---

### FR-7: バリデーション機能の実装
**優先度**: 中

**説明**: `RepositoryAnalyzer.validateRefactorCandidate()` メソッドを実装し、エージェント出力の検証を行います。

**詳細要件**:
- 必須フィールド（type, filePath, description, suggestion, priority）の存在チェック
- 最小文字数検証（description: 20文字以上、suggestion: 20文字以上）
- `type` フィールドの値が定義済みの型のいずれかであることを検証
- 無効な候補を除外し、ログに警告を出力

**成功条件**:
- 無効な候補が自動的に除外される
- 検証エラーの詳細がログに出力される

---

### FR-8: 重複除外機能の統合
**優先度**: 低

**説明**: Phase 1で実装済みの `IssueDeduplicator` を再利用し、リファクタリング候補の重複を除外します。

**詳細要件**:
- 既存のGitHub Issueとの重複チェック（コサイン類似度 + LLM判定）
- 検出されたリファクタリング候補同士の重複チェック
- 類似度閾値は `--similarity-threshold` オプションで調整可能（デフォルト: 0.75）

**成功条件**:
- Phase 1と同様の重複除外機能が動作する
- 類似度閾値の調整が正しく反映される

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
- **エージェント実行時間**: 1000行のリポジトリで5分以内に分析完了
- **メモリ使用量**: 大規模リポジトリ（10000行以上）でも1GB以内に収める
- **API呼び出し回数**: 1回のリファクタリング検出で最大3回までのエージェント呼び出し（タイムアウト時のリトライを含む）

### NFR-2: セキュリティ要件
- **認証情報の保護**: エージェントAPI キー（`CODEX_API_KEY`, `CLAUDE_CODE_CREDENTIALS_PATH`）を環境変数で管理し、ハードコーディングしない
- **プロンプトインジェクション対策**: ユーザー入力（リポジトリパス等）をエスケープ処理し、プロンプトインジェクション攻撃を防止
- **シークレットマスキング**: エージェント出力に含まれる可能性のあるAPIキー、トークン等を自動マスキング

### NFR-3: 可用性・信頼性要件
- **エージェントフォールバック**: Codex実行失敗時にClaudeへ自動フォールバック（Phase 1と同様）
- **エラーハンドリング**: エージェント実行エラー、パースエラー、GitHub API エラーを適切にハンドリングし、ユーザーに明確なエラーメッセージを提示
- **リトライロジック**: 一時的なAPIエラー（429 Too Many Requests等）に対して最大3回までリトライ

### NFR-4: 保守性・拡張性要件
- **コードの再利用性**: Phase 1で実装済みの `RepositoryAnalyzer`, `IssueDeduplicator`, `IssueGenerator` を可能な限り再利用
- **拡張性**: 将来的に `--category enhancement` を追加する際に、最小限の変更で対応可能な設計
- **テスタビリティ**: ユニットテスト・統合テストで検証可能な設計（依存性注入パターンの活用）

### NFR-5: ユーザビリティ要件
- **CLIオプションの一貫性**: `--category` オプションはPhase 1の `bug` と同様の使い勝手を提供
- **エラーメッセージの明確性**: エラー発生時に原因と対処法を明確に提示
- **ログの充実**: `--dry-run` モードで検出結果を詳細にプレビュー可能

---

## 4. 制約事項

### 技術的制約
1. **既存アーキテクチャの継承**: Phase 1で実装済みのアーキテクチャ（エージェント→解析→重複除外→Issue生成）を変更しない
2. **エージェント依存**: リファクタリング検出はAIエージェント（Codex / Claude）に依存するため、APIキーが必須
3. **言語サポート**: Phase 2 MVPではすべてのプログラミング言語をサポートするが、特定の言語（TypeScript, Python, Go）でのテストを優先
4. **除外パターン**: Phase 1で定義済みの除外パターン（`node_modules/`, `dist/`, `*.min.js` 等）を継承

### リソース制約
1. **時間**: 見積もり工数12〜16時間（Planning Documentに基づく）
2. **人員**: 1名の開発者（AIエージェント支援）
3. **予算**: OpenAI API / Anthropic API の利用料金を考慮

### ポリシー制約
1. **コーディング規約**: プロジェクトのESLintルールに準拠
2. **テストカバレッジ**: 既存水準（80%以上）を維持
3. **ドキュメント**: README.md、CLAUDE.mdへの機能追加を必須とする

---

## 5. 前提条件

### システム環境
- Node.js 20 以上
- npm 10 以上
- Git 2.30 以上

### 依存コンポーネント
- **Phase 1（Issue #126）の完了**: `RepositoryAnalyzer`, `IssueDeduplicator`, `IssueGenerator`, `handleAutoIssueCommand` が実装済み
- **エージェントAPI**: Codex API キー（`CODEX_API_KEY` または `OPENAI_API_KEY`）、Claude Code 認証ファイル（`CLAUDE_CODE_CREDENTIALS_PATH`）
- **GitHub API**: Personal Access Token（`GITHUB_TOKEN`）

### 外部システム連携
- **GitHub API**: Issue作成、既存Issue検索、ラベル付与
- **OpenAI API**: 重複検出（コサイン類似度計算、LLM判定）
- **Codex / Claude API**: リファクタリング候補検出

---

## 6. 受け入れ基準

以下の受け入れ基準は、Planning Documentの「7. 品質ゲート」セクションに基づいて定義しています。各基準はGiven-When-Then形式で記述し、テスト可能な形にしています。

### AC-1: リファクタリング候補の検出
**Given**: TypeScriptリポジトリが存在し、大きすぎるファイル（500行以上）が含まれる
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: エージェントが大きすぎるファイルを検出し、`RefactorCandidate` オブジェクトとして返す

**検証方法**: ユニットテスト（`validateRefactorCandidate()` の正常系テスト）

---

### AC-2: コード品質問題の検出
**Given**: 複雑な条件分岐（ネスト深さ4以上）を含むコードが存在する
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: エージェントが複雑な条件分岐を検出し、`type: 'high-complexity'` の候補を返す

**検証方法**: 統合テスト（サンプルリポジトリでのE2Eテスト）

---

### AC-3: コード重複の検出
**Given**: 類似したコードブロックが複数存在する
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: エージェントがコード重複を検出し、`type: 'duplication'` の候補を返す

**検証方法**: 統合テスト（サンプルリポジトリでのE2Eテスト）

---

### AC-4: 未使用コードの検出
**Given**: 未使用のインポート・変数・関数が存在する
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: エージェントが未使用コードを検出し、`type: 'unused-code'` の候補を返す

**検証方法**: 統合テスト（サンプルリポジトリでのE2Eテスト）

---

### AC-5: ドキュメント品質問題の検出
**Given**: コメント・ドキュメントが欠落している関数が存在する
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: エージェントがドキュメント欠落を検出し、`type: 'missing-docs'` の候補を返す

**検証方法**: 統合テスト（サンプルリポジトリでのE2Eテスト）

---

### AC-6: 言語非依存性の確認
**Given**: Python（`.py`）、Go（`.go`）のサンプルリポジトリが存在する
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: TypeScript以外の言語でもリファクタリング候補を検出できる

**検証方法**: 統合テスト（Python, Goのサンプルリポジトリでのテスト）

---

### AC-7: CLIオプションの動作確認
**Given**: `--category refactor` オプションを指定
**When**: `ai-workflow auto-issue --category refactor` を実行
**Then**: `analyzer.analyzeForRefactoring()` が呼び出され、リファクタリング検出が実行される

**検証方法**: ユニットテスト（`parseOptions` の正常系テスト）

---

### AC-8: Phase 1との互換性確認
**Given**: `--category bug` オプションを指定
**When**: `ai-workflow auto-issue --category bug` を実行
**Then**: Phase 1のバグ検出機能が引き続き動作する（リグレッションなし）

**検証方法**: 統合テスト（Phase 1のリグレッションテスト）

---

### AC-9: dry-runモードの動作確認
**Given**: `--dry-run` オプションを指定
**When**: `ai-workflow auto-issue --category refactor --dry-run` を実行
**Then**: Issue生成せず、検出結果のみをコンソールに表示する

**検証方法**: 統合テスト（dry-runモードのE2Eテスト）

---

### AC-10: ユニットテストの追加
**Given**: 新規実装したメソッド（`analyzeForRefactoring()`, `validateRefactorCandidate()`）が存在する
**When**: `npm run test:unit` を実行
**Then**: すべてのユニットテストがパスする

**検証方法**: テストコード実装（Phase 5）後のテスト実行（Phase 6）

---

## 7. スコープ外

以下の項目は、本Phase 2のスコープ外とし、将来的な拡張候補として管理します：

### スコープ外項目
1. **`--category all` オプション**: バグ + リファクタリング同時検出（Phase 3以降で実装予定）
2. **`--category enhancement` オプション**: 機能改善候補の検出（Phase 3以降で実装予定）
3. **カスタム検出パターンの追加**: ユーザー定義の検出ルール（将来拡張）
4. **自動リファクタリング実行**: 検出したリファクタリング候補を自動的に修正する機能（将来拡張）
5. **リファクタリング優先度の自動調整**: AIによる優先度の動的調整（将来拡張）
6. **複数リポジトリ間の重複検出**: 他のリポジトリとのリファクタリング候補重複チェック（将来拡張）

### 将来的な拡張候補
- **Phase 3（enhancement検出機能）**: 機能改善候補の検出（既存機能の拡張、新機能提案）
- **高度な分析機能**: コード複雑度メトリクス（Cyclomatic Complexity）の算出、依存関係グラフの生成
- **カスタマイズ機能**: ユーザー定義の検出ルール、除外パターンのカスタマイズ

---

## 8. 品質ゲート確認

本要件定義書は、以下の品質ゲート（Phase 1）を満たしています：

- [x] **機能要件が明確に記載されている**: FR-1〜FR-8で8つの機能要件を具体的に定義
- [x] **受け入れ基準が定義されている**: AC-1〜AC-10で10個の受け入れ基準をGiven-When-Then形式で記述
- [x] **スコープが明確である**: セクション1で目的とスコープを明示、セクション7でスコープ外を明確化
- [x] **論理的な矛盾がない**: Planning Documentの実装戦略（EXTEND）を踏襲し、Phase 1との整合性を確保

---

## 9. 補足情報

### Planning Documentとの対応関係
本要件定義書は、Planning Documentの以下のセクションに基づいて作成されています：

| 要件定義書のセクション | Planning Documentの対応セクション |
|----------------------|--------------------------------|
| 2. 機能要件 | 4. タスク分割（Phase 4: 実装） |
| 3. 非機能要件 | 6. リスクと軽減策 |
| 4. 制約事項 | 9. 前提条件・制約事項 |
| 5. 前提条件 | 9. 前提条件・制約事項 |
| 6. 受け入れ基準 | 7. 品質ゲート（Phase 1: 要件定義） |

### 次フェーズ（Design Phase）への引き継ぎ事項
- FR-1〜FR-8の機能要件を実現するための詳細設計
- `RefactorCandidate` 型定義の確定
- プロンプトテンプレート（`detect-refactoring.txt`）の具体的な内容設計
- `RepositoryAnalyzer.analyzeForRefactoring()` メソッドのシグネチャ設計

---

**要件定義書作成日**: 2025-01-30
**作成者**: AI Workflow Agent (Requirements Phase)
**レビュー予定日**: Phase 2完了後（クリティカルシンキングレビュー）
