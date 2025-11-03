# 要件定義書 - Issue #121

**Issue番号**: #121
**タイトル**: AIエージェントによる自動Issue作成機能の実装
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認し、以下の戦略に基づいて要件定義を実施します：

### 開発計画の概要
- **複雑度**: 複雑（新規サブシステム追加、複数の外部システム統合、高度なLLM活用）
- **見積もり工数**: 40〜56時間（約5〜7日）
- **リスク評価**: 高（LLMコスト、誤検知率、プライバシー問題）
- **実装戦略**: CREATE（新規機能実装）
- **テスト戦略**: UNIT_INTEGRATION（ユニット重点 + 統合テスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）

### 主要リスクと軽減策
1. **LLMコスト超過** → コスト制限、トークン削減、キャッシュ活用
2. **誤検知率が高い** → ドライランモード必須、信頼度スコア表示、人間によるレビュー
3. **重複検出精度が低い** → 2段階判定（コサイン類似度 + LLM意味的判定）
4. **プライバシー・セキュリティ問題** → SecretMasker統合、警告表示、環境変数制御
5. **創造的提案の品質が低い** → プロンプトエンジニアリング、コンテキスト充実、フィルタリング

### 段階的リリース戦略
- **Phase 1（MVP）**: バグ検出機能のみ実装（20〜28時間）
- **Phase 2（拡張）**: リファクタリング検出を追加（+8〜12時間）
- **Phase 3（完全版）**: 機能拡張提案を追加（+12〜16時間）

**推奨**: Phase 1から順次リリースし、ユーザーフィードバックを反映しながら拡張

---

## 1. 概要

### 背景
AI Workflow Agentは、GitHub IssueベースのワークフローをCodex/Claude Code エージェントで自動化するツールです。現在、開発者は手動でIssueを作成してからワークフローを開始していますが、この作業自体が負担になっています。また、リポジトリ全体を探索して潜在的な問題や改善点を発見する仕組みがないため、技術的負債の可視化や継続的改善が困難です。

### 目的
リポジトリを自動探索し、以下の3つのカテゴリでIssueを自動生成する機能を追加します：
1. **潜在的な不具合の報告** - コード品質とセキュリティの向上
2. **リファクタリングすべきコードの報告** - 技術的負債の可視化
3. **将来的な機能拡張のアイデアの提案** - イノベーション促進

これにより、Issue作成作業の自動化、見落としがちな問題の早期発見、既存Issueとの重複回避、AIによる創造的な機能提案を実現します。

### ビジネス価値
- **開発効率の向上**: Issue作成作業の自動化により、開発者はコーディングに集中可能
- **品質向上**: 人間が見落としがちな潜在的問題を早期発見
- **継続的改善**: 定期的な自動Issue作成による技術的負債の可視化
- **イノベーション促進**: AIによる創造的な機能提案により、新しい可能性を発見

### 技術的価値
- **既存ワークフローへの影響なし**: オプトイン機能として独立実装
- **拡張性**: 段階的リリース戦略により、フィードバックを反映しながら拡張可能
- **再利用性**: 既存モジュール（GitHubClient、logger、config）を活用

---

## 2. 機能要件

### FR-001: 新しいCLIコマンド `auto-issue` の追加
**優先度**: 高

#### 説明
リポジトリを探索してIssueを自動生成するCLIコマンドを追加します。

#### 詳細仕様
```bash
node dist/index.js auto-issue [OPTIONS]
```

#### 必須オプション
- `--category <bug|refactor|enhancement|all>`: 作成するIssueのカテゴリ
  - `bug`: 潜在的な不具合の報告
  - `refactor`: リファクタリングすべきコードの報告
  - `enhancement`: 機能拡張のアイデアの提案
  - `all`: 3つのカテゴリすべて（デフォルト）

#### 任意オプション
- `--limit <NUM>`: 作成するIssueの最大数（デフォルト: 5、最小: 1、最大: 50）
- `--dry-run`: 実際には作成せず、候補のみ表示
- `--similarity-threshold <0-1>`: 重複判定の類似度閾値（デフォルト: 0.8、範囲: 0.0〜1.0）
- `--creative-mode`: 創造的な機能提案を優先的に生成（`enhancement` カテゴリ専用）

#### 受け入れ基準
- **Given**: 有効なリポジトリディレクトリで実行
- **When**: `auto-issue --category bug --limit 3 --dry-run` を実行
- **Then**: 最大3件のバグ関連Issue候補が表示され、実際には作成されない

---

### FR-002: リポジトリ探索エンジンの実装
**優先度**: 高

#### 説明
コードベース全体を探索し、3つのカテゴリで問題・改善点を検出します。

#### 詳細仕様

##### a. 潜在的な不具合の検出（`bug` カテゴリ）
以下のパターンを検出します：
- **エラーハンドリングの欠如**: try-catch未使用の非同期関数、未処理のPromise
- **型安全性の問題**: `any`型の過剰使用、型アサーション（`as`）の多用
- **リソースリーク**: unclosed streams（fs.createReadStream）、event listeners未解除
- **セキュリティ上の懸念**: credentials漏洩（ハードコードされたAPIキー）、XSS脆弱性（innerHTML使用）
- **依存関係の脆弱性**: `npm audit` 結果の解析（高リスク以上の脆弱性）

##### b. リファクタリング候補の検出（`refactor` カテゴリ）
以下のメトリクスで検出します：
- **大きすぎるファイル・関数**:
  - ファイル: 500行以上（warning）、1000行以上（critical）
  - 関数: 50行以上（warning）、100行以上（critical）
- **重複コード**: 10行以上の連続した重複ブロック
- **複雑度が高いコード**: Cyclomatic Complexity 10以上（warning）、20以上（critical）
- **未使用のインポート・変数**: ESLintルール `no-unused-vars` 違反
- **ドキュメントの欠落**: JSDocコメント欠落の公開関数・クラス

##### c. 機能拡張のアイデア提案（`enhancement` カテゴリ）
以下の2つのアプローチで提案を生成します：

**既存機能の改善**（分析ベース）:
- ユーザビリティ改善: CLIオプションの不足、エラーメッセージの不親切さ
- パフォーマンス最適化: 非効率なループ、キャッシュ未使用
- テストカバレッジ向上: カバレッジ70%未満のファイル
- CI/CD改善: ビルド時間短縮、自動デプロイの提案

**創造的な新機能の提案**（LLMベース、`--creative-mode`）:
- **他ツール・サービスとの連携**: Slack/Discord通知、Jiraチケット自動生成、VSCode拡張機能
- **ワークフロー自動化の拡張**: 定期実行、依存関係自動更新
- **開発者体験（DX）向上**: インタラクティブCLI、進捗ダッシュボード
- **品質保証の強化**: セキュリティスキャン統合、アクセシビリティチェック
- **データ駆動の意思決定支援**: メトリクスダッシュボード、コスト分析レポート
- **エコシステム拡張**: プラグインシステム、カスタムフェーズ定義
- **その他、リポジトリ固有のアイデア**: README、ARCHITECTURE.md、コミット履歴から着想

#### 技術的実装
- `src/core/repository-analyzer.ts`: `RepositoryAnalyzer` クラス
  - `analyzeForBugs()`: 静的解析（TypeScript AST解析、ESLintルール活用）
  - `analyzeForRefactoring()`: メトリクス計測（複雑度、行数、重複検出）
  - `analyzeForEnhancements()`: LLM活用（コンテキスト充実、創造的提案生成）

#### 受け入れ基準
- **Given**: TypeScriptリポジトリ（`src/` ディレクトリ存在）
- **When**: `analyzeForBugs()` を実行
- **Then**: エラーハンドリング欠如の関数が検出され、ファイルパスと行番号が返却される

---

### FR-003: 重複Issue検出エンジンの実装
**優先度**: 高

#### 説明
既存Issueとの重複を自動的に検出し、重複Issueの作成をスキップします。

#### 詳細仕様

##### 2段階判定方式
1. **第1段階: コサイン類似度判定**（高速フィルタリング）
   - Issueタイトル・本文をベクトル化
   - コサイン類似度を計算
   - 閾値以上（デフォルト: 0.6）の候補を抽出

2. **第2段階: LLM意味的判定**（精密判定）
   - 第1段階の候補のみをLLMで判定
   - OpenAI APIまたはAnthropic APIを使用
   - 意味的類似度を判定（0.0〜1.0のスコア）
   - 閾値以上（デフォルト: 0.8）の場合、重複と判定

##### キャッシュ機構
- 同じIssueを複数回LLMで判定しないようにキャッシュ
- メモリキャッシュ（Map構造）で実装
- キャッシュキー: `issue_number:candidate_title_hash`

#### 技術的実装
- `src/core/issue-deduplicator.ts`: `IssueDeduplicator` クラス
  - `findSimilarIssues()`: 既存Issue一覧取得、類似度計算
  - `calculateSemanticSimilarity()`: LLM活用の意味的類似度判定
  - `cosine-similarity` ライブラリ使用

#### 受け入れ基準
- **Given**: 既存Issue「エラーハンドリングの欠如」が存在
- **When**: 新規Issue候補「例外処理が不足している」を判定
- **Then**: 意味的類似度0.85と判定され、重複としてスキップされる

---

### FR-004: Issue自動生成エンジンの実装
**優先度**: 高

#### 説明
検出した問題・改善点から、GitHub Issue を自動生成します。

#### 詳細仕様

##### Issueテンプレート構造
```markdown
## 概要
[AIが生成した問題・改善点のサマリー（50〜100文字）]

## 詳細
[具体的な問題の説明（200〜500文字）]

## 該当箇所
- ファイル: src/path/to/file.ts:123-145
- 関連コード:
\`\`\`typescript
[コードスニペット（前後10行）]
\`\`\`

## 提案される解決策
[AIによる解決策の提案（3〜5つの箇条書き）]

## 期待される効果
[この改善による具体的なメリット（3つまで）]

## 優先度
[Low / Medium / High]

## カテゴリ
[bug / refactor / enhancement]

---

🤖 この Issue は AI Workflow Agent により自動生成されました。
```

##### LLMによる本文生成
- OpenAI APIまたはAnthropic APIを使用
- プロンプト設計:
  - リポジトリのREADME、ARCHITECTURE.md、過去のIssue履歴をコンテキストに含める
  - 創造的提案の場合、「既存の枠にとらわれず、自由に発想してください」という指示を追加
  - 出力形式（JSON）を厳格に指定

##### ラベル自動付与
- カテゴリに応じたラベル: `auto-issue:bug`, `auto-issue:refactor`, `auto-issue:enhancement`
- 優先度ラベル: `priority:high`, `priority:medium`, `priority:low`

#### 技術的実装
- `src/core/issue-generator.ts`: `IssueGenerator` クラス
  - `generateIssueContent()`: LLM活用でIssue本文生成
  - `formatIssueTemplate()`: テンプレート整形
  - `createGitHubIssue()`: GitHub API経由でIssue作成

#### 受け入れ基準
- **Given**: リポジトリ探索で「エラーハンドリングの欠如」を検出
- **When**: `createGitHubIssue()` を実行
- **Then**: GitHub上にIssueが作成され、テンプレート構造に従った本文と適切なラベルが付与される

---

### FR-005: ドライランモードの実装
**優先度**: 中

#### 説明
実際にはIssueを作成せず、候補のみを表示するモードを提供します。

#### 詳細仕様
- `--dry-run` オプションが指定された場合、以下の動作を行う:
  1. リポジトリ探索を実行
  2. 重複検出を実行
  3. Issue候補をコンソールに表示（Markdown形式）
  4. GitHub APIでのIssue作成はスキップ
  5. サマリー情報を表示（候補数、重複スキップ数、推定トークン使用量）

#### 出力形式
```
[Dry Run] 以下のIssueを作成する予定です:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Issue #1: エラーハンドリングの欠如 (bug)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
優先度: High
該当箇所: src/core/git-manager.ts:123-145
[Issue本文のプレビュー...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
サマリー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 候補数: 8件
- 重複スキップ: 2件
- 作成予定: 6件
- 推定トークン使用量: 約12,000トークン
- 推定コスト: $0.06 USD
```

#### 受け入れ基準
- **Given**: `--dry-run` オプション指定
- **When**: `auto-issue --category all --limit 10 --dry-run` を実行
- **Then**: Issue候補がコンソールに表示され、GitHub APIは呼び出されない

---

### FR-006: 信頼度スコアの表示
**優先度**: 中

#### 説明
各Issue候補に信頼度スコア（0.0〜1.0）を付与し、低スコアの場合は警告を表示します。

#### 詳細仕様
- 信頼度スコアの計算基準:
  - 静的解析ベースの検出（AST解析、ESLintルール）: 0.9〜1.0
  - メトリクスベースの検出（行数、複雑度）: 0.7〜0.9
  - LLMベースの検出（創造的提案）: 0.5〜0.8
- 閾値: 0.6未満の場合、⚠️ 警告マークを表示
- ドライラン出力に信頼度スコアを含める

#### 受け入れ基準
- **Given**: LLMベースの創造的提案を生成
- **When**: 信頼度スコア0.55のIssue候補を表示
- **Then**: ⚠️ 警告マークとともに「信頼度: 55%（要レビュー）」と表示される

---

### FR-007: 進捗表示とログ出力
**優先度**: 低

#### 説明
リポジトリ探索の進捗をリアルタイム表示し、詳細なログを出力します。

#### 詳細仕様
- 進捗表示:
  ```
  [auto-issue] リポジトリ探索中...
  [auto-issue] ファイル解析: 123/456 (27%) ━━━━━━━━━━━━━━━━━━━━━━━━━
  [auto-issue] バグ検出: 5件
  [auto-issue] リファクタリング候補: 12件
  [auto-issue] 機能拡張アイデア: 3件
  ```
- ログ出力: 既存 `logger.ts` を活用
  - `logger.debug()`: ファイル解析の詳細
  - `logger.info()`: 検出結果サマリー
  - `logger.warn()`: 低信頼度スコア、LLMエラー時のフォールバック
  - `logger.error()`: GitHub API障害、トークン不足

#### 受け入れ基準
- **Given**: 大規模リポジトリ（1000ファイル以上）
- **When**: `auto-issue` を実行
- **Then**: 進捗バーがリアルタイムで更新され、完了まで10分以内に終了する

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件
- **リポジトリサイズ**: 1000ファイル以下のリポジトリで10分以内に完了
- **並列処理**: ファイル解析を並列実行（Worker Threads活用）
- **タイムアウト**: 10分で強制終了、途中結果を出力
- **キャッシュ**: 同じIssue候補を複数回LLMで判定しない（メモリキャッシュ）

### NFR-002: セキュリティ要件
- **SecretMasker統合**: APIキー、トークン、メールアドレスを自動マスキング
  - 既存の `src/core/secret-masker.ts` を活用
  - プロンプト送信前に自動マスキング
- **プライベートリポジトリ警告**: 初回実行時に「コード内容をLLMに送信する」旨の警告を表示
- **環境変数制御**: `AUTO_ISSUE_ALLOW_PRIVATE_REPO=true` で明示的に許可
- **オプトアウト**: `.ai-workflow-ignore` ファイルでセンシティブなファイルを除外

### NFR-003: 可用性・信頼性要件
- **エラーハンドリング**: すべてのAPI呼び出しにtry-catch、適切なエラーメッセージ表示
- **リトライ制御**: GitHub API障害時、最大3回までリトライ（指数バックオフ）
- **フォールバック**: LLM API障害時、簡易的な静的解析のみで継続
- **ログ記録**: すべてのエラーを `logger.error()` で記録

### NFR-004: 保守性・拡張性要件
- **モジュラー設計**: 3つのエンジンを独立したクラスとして実装
  - `RepositoryAnalyzer`（探索）
  - `IssueDeduplicator`（重複検出）
  - `IssueGenerator`（生成）
- **既存モジュールの活用**: `GitHubClient`, `logger`, `config` を再利用
- **プラグイン拡張**: 将来的にカスタム検出ルールを追加可能な設計
- **JSDocコメント**: すべての公開メソッドにJSDocコメント付与

### NFR-005: コスト要件
- **トークン削減**: ファイル全文送信ではなく、問題箇所のスニペット（前後10行）のみ送信
- **コスト制限**: `--limit` オプションでIssue作成数を制限（デフォルト: 5）
- **コスト試算**: ドライランモードで推定トークン使用量と推定コストを表示
- **段階的実行**: Phase 1（バグ検出のみ）→ Phase 2（リファクタリング）→ Phase 3（機能拡張）

---

## 4. 制約事項

### 技術的制約
- **使用技術**: TypeScript、Node.js 20以上
- **既存システムとの整合性**:
  - CLI フレームワーク: `commander` を使用（既存パターン踏襲）
  - ロギング: `src/utils/logger.ts` を使用
  - 環境変数管理: `src/core/config.ts` を使用
- **新規依存関係**:
  - `ts-morph`: TypeScript AST解析（^21.0.1）
  - `cosine-similarity`: 類似度計算（^1.1.0）
- **既存依存関係の活用**:
  - `openai`: OpenAI API連携
  - `@octokit/rest`: GitHub API連携

### リソース制約
- **時間**: 40〜56時間（約5〜7日）
- **人員**: 1名のAIエージェント（Codex/Claude Code）
- **予算**: LLMコスト上限を設定（トークン使用量の制限）

### ポリシー制約
- **セキュリティポリシー**:
  - プライベートリポジトリのコード内容をLLMに送信する際の警告表示
  - SecretMasker によるAPIキー・トークンの自動マスキング
- **コーディング規約**:
  - ESLintルール準拠
  - JSDocコメント必須（公開メソッド）
  - 統一loggerモジュール使用（`console.log` 禁止）

---

## 5. 前提条件

### システム環境
- Node.js 20以上
- npm 10以上
- TypeScript 5.x
- Git 2.x

### 依存コンポーネント
- **既存モジュール**:
  - `src/core/github-client.ts`: GitHub API連携
  - `src/core/config.ts`: 環境変数管理
  - `src/utils/logger.ts`: ロギング
  - `src/core/secret-masker.ts`: シークレット自動マスキング
- **外部API**:
  - GitHub API（Issue作成、一覧取得）
  - OpenAI API（重複検出、Issue本文生成）
  - Anthropic API（代替LLMプロバイダ）

### 外部システム連携
- **GitHub**:
  - `GITHUB_TOKEN` 環境変数（repo スコープ必須）
  - Issue作成権限
- **OpenAI**:
  - `OPENAI_API_KEY` 環境変数
  - gpt-4o-mini モデル使用可能
- **Anthropic**:
  - `ANTHROPIC_API_KEY` 環境変数（オプション）
  - claude-3-sonnet-20240229 モデル使用可能

---

## 6. 受け入れ基準

### AC-001: CLIコマンドの動作確認
- **Given**: 有効なリポジトリディレクトリで実行
- **When**: `auto-issue --category bug --limit 3 --dry-run` を実行
- **Then**:
  - 最大3件のバグ関連Issue候補が表示される
  - GitHub APIは呼び出されない
  - 推定トークン使用量と推定コストが表示される

### AC-002: リポジトリ探索エンジンの動作確認
- **Given**: TypeScriptリポジトリ（`src/` ディレクトリ存在）
- **When**: `analyzeForBugs()` を実行
- **Then**:
  - エラーハンドリング欠如の関数が検出される
  - ファイルパス、行番号、コードスニペットが返却される
  - 検出結果に信頼度スコア（0.9〜1.0）が付与される

### AC-003: 重複Issue検出エンジンの動作確認
- **Given**: 既存Issue「エラーハンドリングの欠如」が存在
- **When**: 新規Issue候補「例外処理が不足している」を判定
- **Then**:
  - 意味的類似度0.85と判定される
  - 重複としてスキップされる
  - ログに「重複スキップ: Issue #123」と記録される

### AC-004: Issue自動生成エンジンの動作確認
- **Given**: リポジトリ探索で「エラーハンドリングの欠如」を検出
- **When**: `createGitHubIssue()` を実行
- **Then**:
  - GitHub上にIssueが作成される
  - テンプレート構造（概要、詳細、該当箇所、提案される解決策、期待される効果、優先度、カテゴリ）に従った本文が付与される
  - ラベル `auto-issue:bug`, `priority:high` が付与される
  - Issue末尾に「🤖 この Issue は AI Workflow Agent により自動生成されました。」と記載される

### AC-005: 創造的提案の動作確認
- **Given**: `--creative-mode` オプション指定
- **When**: `auto-issue --category enhancement --limit 5 --creative-mode` を実行
- **Then**:
  - 既存の枠にとらわれない創造的な機能提案が生成される
  - リポジトリのREADME、ARCHITECTURE.md、コミット履歴からコンテキストを取得している
  - 提案内容が具体的かつ実現可能である（信頼度スコア0.6以上）

### AC-006: エラーハンドリングの動作確認
- **Given**: GitHub API障害が発生
- **When**: `createGitHubIssue()` を実行
- **Then**:
  - 最大3回までリトライされる（指数バックオフ）
  - リトライ失敗後、適切なエラーメッセージが表示される
  - エラーが `logger.error()` で記録される
  - プログラムがクラッシュせず、他のIssue候補の処理を継続する

### AC-007: ユニットテストの合格確認
- **Given**: すべてのユニットテストを実行
- **When**: `npm run test:unit` を実行
- **Then**:
  - すべてのテストが合格する
  - カバレッジ85%以上を達成する
  - 重複検出ロジックのテストケース（完全一致、部分一致、異なるIssue）がすべて合格する

### AC-008: 統合テストの合格確認
- **Given**: すべての統合テストを実行
- **When**: `npm run test:integration` を実行
- **Then**:
  - エンドツーエンドフロー（`auto-issue --category all --dry-run`）が成功する
  - GitHub APIモックサーバーとの連携テストが成功する
  - エラーケース（API障害、トークン不足、権限エラー）のテストが成功する

### AC-009: ドキュメントの整備確認
- **Given**: CLAUDE.mdを確認
- **When**: 新機能のセクションを参照
- **Then**:
  - `auto-issue` コマンドのセクションが追加されている
  - オプション詳細説明が記載されている
  - 使用例（3カテゴリ × 2パターン）が記載されている
  - トラブルシューティングガイドが追加されている

---

## 7. スコープ外

以下の項目は今回の実装範囲外とし、将来的な拡張候補とします：

### 将来的な拡張候補
1. **定期実行機能**: GitHub Actionsとの連携（週次で自動Issue作成）
2. **フィードバック学習**: 「誤検知」ラベルが付けられたIssueを学習データとして活用
3. **カスタムルール**: `.ai-workflow/rules.yaml` で検出ルールをカスタマイズ
4. **Issue優先度予測**: 過去のIssue履歴から優先度を自動予測
5. **Slackボット統合**: Issue作成時にSlack通知、チャンネルでの承認フロー
6. **他言語対応**: JavaScript、Python、Go、Rustリポジトリへの対応
7. **マルチリポジトリ探索**: 複数のリポジトリを一括で探索

### 明確なスコープ外
- **Issue自動クローズ機能**: Issue完了後の自動クローズは対象外
- **既存Issueの自動更新**: 既存Issueの本文を自動修正する機能は対象外
- **プルリクエスト自動作成**: Issueと同時にプルリクエストを作成する機能は対象外
- **他ツールとの双方向連携**: Jira、Asana等の他ツールとの双方向連携は対象外

---

## 8. 付録

### A. 用語集
- **AST（Abstract Syntax Tree）**: 抽象構文木。TypeScriptコードを構造化して解析するためのデータ構造
- **Cyclomatic Complexity**: 循環的複雑度。コードの複雑さを定量的に測るメトリクス
- **コサイン類似度**: 2つのベクトル間の類似度を測る指標（0.0〜1.0）
- **SecretMasker**: APIキー、トークン、メールアドレスを自動的にマスキングするモジュール
- **フォールバック**: エラー発生時に代替手段で処理を継続する仕組み

### B. 参考リンク
- [ts-morph公式ドキュメント](https://ts-morph.com/)
- [GitHub REST API - Issues](https://docs.github.com/en/rest/issues)
- [OpenAI API - Chat Completions](https://platform.openai.com/docs/api-reference/chat)
- [Anthropic API - Messages](https://docs.anthropic.com/claude/reference/messages_post)
- [ESLint Rules](https://eslint.org/docs/latest/rules/)

### C. 実装例（疑似コード）

#### リポジトリ探索エンジン
```typescript
class RepositoryAnalyzer {
  async analyzeForBugs(): Promise<IssueCandidateResult[]> {
    const project = new Project(); // ts-morph
    project.addSourceFilesAtPaths('src/**/*.ts');

    const candidates: IssueCandidateResult[] = [];

    for (const sourceFile of project.getSourceFiles()) {
      // エラーハンドリング欠如の検出
      const asyncFunctions = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)
        .filter(fn => fn.isAsync());

      for (const fn of asyncFunctions) {
        const hasTryCatch = fn.getDescendantsOfKind(SyntaxKind.TryStatement).length > 0;
        if (!hasTryCatch) {
          candidates.push({
            category: 'bug',
            title: 'エラーハンドリングの欠如',
            description: '非同期関数でtry-catchが使用されていません',
            file: sourceFile.getFilePath(),
            lineNumber: fn.getStartLineNumber(),
            confidence: 0.95,
          });
        }
      }
    }

    return candidates;
  }
}
```

#### 重複検出エンジン
```typescript
class IssueDeduplicator {
  async findSimilarIssues(candidate: IssueCandidateResult): Promise<Issue[]> {
    // 第1段階: コサイン類似度フィルタリング
    const allIssues = await this.github.listAllIssues();
    const candidates = allIssues.filter(issue => {
      const similarity = cosineSimilarity(
        this.vectorize(candidate.title),
        this.vectorize(issue.title)
      );
      return similarity >= 0.6;
    });

    // 第2段階: LLM意味的判定
    const similarIssues: Issue[] = [];
    for (const issue of candidates) {
      const score = await this.calculateSemanticSimilarity(candidate, issue);
      if (score >= 0.8) {
        similarIssues.push(issue);
      }
    }

    return similarIssues;
  }
}
```

---

**要件定義書の承認**: このドキュメントはPlanning Phaseの開発計画に基づいて作成されており、実装フェーズに進むための品質ゲートを満たしています。
