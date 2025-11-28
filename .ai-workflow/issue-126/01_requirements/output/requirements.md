# 要件定義書 - Issue #126

**Issue番号**: #126
**タイトル**: auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装
**親Issue**: #121 AIエージェントによる自動Issue作成機能の実装
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-126/00_planning/output/planning.md`）で策定された開発計画を確認しました：

### 開発戦略の要約
- **実装戦略**: CREATE（新規サブシステムの基盤構築）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **見積もり工数**: 20~28時間（2.5~3.5日程度）
- **総合リスク**: 中（主要リスク: ts-morph学習曲線、LLM統合の安定性）

### 主要な制約事項
- Phase 1 MVPとして明確にスコープが限定（**バグ検出のみ**、リファクタリング・拡張機能はPhase 2以降）
- 新規依存パッケージ `ts-morph` の追加が必要
- 既存の `rollback` コマンド実装パターンを参考にする

### クリティカルパス
Planning → Requirements → Design → Implementation → Test Implementation → Testing → Documentation

本要件定義書は、この開発計画を踏まえて詳細化します。

---

## 1. 概要

### 1.1 背景

AI Workflow Agent プロジェクトは、GitHub Issue を起点として planning から evaluation までの10フェーズのワークフローを自動化するツールキットです。現在、開発者が手動でコードレビューを行い、バグや改善点を Issue として起票していますが、以下の課題があります：

1. **Issue作成の負荷**: コードベース全体を手動レビューし、問題箇所を特定してIssue本文を作成する作業は時間がかかる
2. **Issue品質のばらつき**: レビュアーによって Issue の詳細度や優先度判断が異なる
3. **重複Issueの発生**: 既存 Issue と重複する内容が投稿される場合がある

親Issue #121 では、これらの課題を解決するために「AIエージェントによる自動Issue作成機能」を提案しています。本Issue #126 は、その**Phase 1 MVP**として、**CLIコマンド基盤とバグ検出機能**を実装します。

### 1.2 目的

Phase 1 MVPの目的は以下の通りです：

1. **CLIコマンドの提供**: `auto-issue` コマンドにより、開発者がコマンド一発でバグ候補を検出しIssue作成できる
2. **バグ検出の自動化**: TypeScript AST解析により、エラーハンドリング欠如、`any`型過剰使用、リソースリーク等のバグパターンを自動検出
3. **重複Issue防止**: 既存Issueとの類似度を計算し、重複するIssue作成を防止
4. **dry-runモードの提供**: 実際にIssue作成する前に候補を確認できる

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- **開発効率の向上**: 手動コードレビューの時間を削減し、開発者がコア機能開発に集中できる
- **Issue品質の均質化**: AIによる自動検出により、Issue品質が均一化される
- **技術的負債の早期発見**: バグパターンの自動検出により、潜在的な問題を早期に発見

**技術的価値**:
- **拡張可能な基盤構築**: Phase 1で構築したCLI基盤・解析エンジンは、Phase 2以降でリファクタリング検出、拡張機能検出へ拡張可能
- **既存エコシステムとの統合**: AI Workflow Agentの既存コマンド（`init`, `execute`, `rollback` 等）と整合性を保った設計
- **LLM統合のノウハウ蓄積**: OpenAI API統合による意味的類似度判定のノウハウを蓄積

---

## 2. 機能要件

### 2.1 CLIコマンド基盤（優先度: 高）

**FR-1.1**: `auto-issue` コマンドの提供
**説明**: 開発者が `node dist/index.js auto-issue` 形式でコマンドを実行できる
**優先度**: 高
**受け入れ基準**:
- Given: ビルド済みのCLI（`dist/index.js`）が存在する
- When: `node dist/index.js auto-issue --help` を実行する
- Then: コマンドのヘルプメッセージが表示される

**FR-1.2**: CLIオプションの実装
**説明**: 以下のCLIオプションをサポートする
- `--category <bug|refactor|enhancement|all>`: 検出カテゴリ（Phase 1では `bug` のみ実装、他はエラー表示）
- `--limit <NUM>`: Issue候補の最大数（デフォルト: 5、範囲: 1-20）
- `--dry-run`: ドライランモード（候補のみ表示、Issue作成なし）
- `--similarity-threshold <0-1>`: 重複判定の類似度閾値（デフォルト: 0.8、範囲: 0.0-1.0）

**優先度**: 高
**受け入れ基準**:
- Given: `auto-issue` コマンドが実装されている
- When: `--category refactor` を指定して実行する
- Then: 「Phase 1では `bug` カテゴリのみサポート」というエラーメッセージが表示され、終了コード1で終了する

**FR-1.3**: `src/main.ts` へのコマンド登録
**説明**: `src/main.ts` のcommander定義に `auto-issue` コマンドを追加する
**優先度**: 高
**受け入れ基準**:
- Given: `src/main.ts` が既存のコマンド（`init`, `execute`, `rollback` 等）を登録している
- When: `auto-issue` コマンドを追加する
- Then: 既存コマンドと同様のパターン（`handleAutoIssueCommand()` の呼び出し）で実装される

### 2.2 リポジトリ探索エンジン（バグ検出のみ）（優先度: 高）

**FR-2.1**: TypeScript AST解析によるバグ検出
**説明**: `ts-morph` パッケージを使用して、TypeScriptソースコードを解析し、以下の3つのバグパターンを検出する
1. **エラーハンドリング欠如**: `async` 関数内で `try-catch` ブロックがない
2. **型安全性の問題**: `any` 型の使用箇所が閾値（例: 5箇所）を超える
3. **リソースリーク**: ファイルストリーム、ネットワーク接続等のリソース解放漏れ

**優先度**: 高
**受け入れ基準**:
- Given: `src/core/repository-analyzer.ts` が実装されている
- When: `async` 関数で `try-catch` がないコード（例: `async function foo() { await bar(); }`）を解析する
- Then: 「エラーハンドリング欠如」のバグ情報（ファイルパス、行番号、関数名）が返される

**FR-2.2**: リポジトリ全体のスキャン
**説明**: `src/` ディレクトリ配下のすべての `.ts` ファイルを対象にバグ検出を実行する（除外パターン: `tests/`, `dist/`, `node_modules/`）
**優先度**: 高
**受け入れ基準**:
- Given: リポジトリ内に複数の `.ts` ファイルが存在する
- When: `auto-issue` コマンドを実行する
- Then: `src/` 配下のすべてのファイルが解析され、バグ候補がリスト化される

**FR-2.3**: バグ情報の構造化
**説明**: 検出されたバグ情報を以下の形式で保持する
```typescript
interface BugPattern {
  type: 'error-handling' | 'type-safety' | 'resource-leak';
  severity: 'high' | 'medium' | 'low';
  filePath: string;
  lineNumber: number;
  functionName?: string;
  description: string;
  suggestedFix?: string;
}
```
**優先度**: 高
**受け入れ基準**:
- Given: バグパターンが検出された
- When: バグ情報を構造化する
- Then: `BugPattern` 型の形式で保持され、後続のIssue生成処理で利用できる

### 2.3 重複Issue検出機能（優先度: 高）

**FR-3.1**: GitHub API経由での既存Issue取得
**説明**: 対象リポジトリのすべてのOpen Issuesを取得する（ラベル `auto-generated` で絞り込み可能）
**優先度**: 高
**受け入れ基準**:
- Given: GitHub API認証情報（`GITHUB_TOKEN`）が設定されている
- When: `auto-issue` コマンドを実行する
- Then: リポジトリの Open Issues が取得され、タイトル・本文が後続の類似度計算に利用される

**FR-3.2**: コサイン類似度による初期フィルタリング
**説明**: Issue候補のタイトル・本文と既存Issueのタイトル・本文を比較し、コサイン類似度を計算する
**優先度**: 高
**受け入れ基準**:
- Given: Issue候補「エラーハンドリング欠如: src/main.ts:123」と既存Issue「src/main.tsのエラーハンドリング改善」が存在する
- When: コサイン類似度を計算する
- Then: 類似度スコア（0.0-1.0）が返される（TF-IDF等のテキストベクトル化手法を使用）

**FR-3.3**: LLM（OpenAI API）による意味的類似度判定
**説明**: コサイン類似度が閾値（例: 0.5）以上のIssue候補について、OpenAI APIで意味的類似度を判定する
**優先度**: 高
**受け入れ基準**:
- Given: コサイン類似度が0.6のIssue候補と既存Issueが存在する
- When: OpenAI API（既存の `ContentParser` パターンを参考）でプロンプトを送信する
- Then: 「類似/非類似」の判定結果が返され、類似度スコアが更新される

**FR-3.4**: 重複Issueのスキップ
**説明**: 類似度スコアが `--similarity-threshold`（デフォルト: 0.8）以上のIssue候補は重複と判定し、スキップする
**優先度**: 高
**受け入れ基準**:
- Given: Issue候補の類似度スコアが0.85、閾値が0.8
- When: 重複判定を実行する
- Then: 「重複Issueとしてスキップ」のログが出力され、Issue作成処理が実行されない

### 2.4 Issue生成エンジン（基本版）（優先度: 高）

**FR-4.1**: テンプレートベースのIssue本文生成
**説明**: バグ情報（`BugPattern`）を元に、以下のセクションを含むIssue本文を生成する
- **概要**: バグの種類（エラーハンドリング欠如等）
- **検出箇所**: ファイルパス、行番号、関数名
- **問題の説明**: バグの詳細（例: 「`async` 関数 `foo()` で例外処理が実装されていません」）
- **推奨修正方法**: 修正案（例: 「`try-catch` ブロックでラップしてください」）
- **関連情報**: バグの影響範囲、優先度

**優先度**: 高
**受け入れ基準**:
- Given: `BugPattern` オブジェクトが存在する
- When: Issue本文を生成する
- Then: 上記5つのセクションを含むMarkdown形式のテキストが生成される

**FR-4.2**: GitHub API経由でのIssue作成
**説明**: 生成したIssue本文を使用して、GitHub API経由でIssueを作成する
**優先度**: 高
**受け入れ基準**:
- Given: `--dry-run` オプションが指定されていない
- When: Issue候補が重複判定をパスした
- Then: GitHub APIで新しいIssueが作成され、Issue URLが返される

**FR-4.3**: ラベル自動付与
**説明**: 作成されたIssueに以下のラベルを自動付与する
- `auto-generated`: 自動生成されたIssueであることを示す
- `bug`: バグ報告であることを示す

**優先度**: 高
**受け入れ基準**:
- Given: Issue作成が成功した
- When: ラベルを自動付与する
- Then: 作成されたIssueに `auto-generated` と `bug` ラベルが設定される

**FR-4.4**: dry-runモードの実装
**説明**: `--dry-run` オプション指定時は、Issue候補を標準出力に表示するのみで、実際のIssue作成は行わない
**優先度**: 高
**受け入れ基準**:
- Given: `--dry-run` オプションが指定されている
- When: `auto-issue` コマンドを実行する
- Then: Issue候補（タイトル、本文のプレビュー、重複判定結果）がコンソールに表示され、GitHub APIは呼び出されない

### 2.5 エラーハンドリングとロギング（優先度: 中）

**FR-5.1**: 包括的なエラーハンドリング
**説明**: 以下のエラーケースを適切に処理する
- ts-morphパースエラー（不正なTypeScriptコード）
- GitHub API エラー（401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error）
- OpenAI API エラー（タイムアウト、レート制限、APIキー不正）

**優先度**: 中
**受け入れ基準**:
- Given: GitHub APIが403エラーを返す
- When: `auto-issue` コマンドを実行する
- Then: 「GitHub API権限不足」の明確なエラーメッセージが表示され、終了コード1で終了する

**FR-5.2**: ログ出力
**説明**: 統一loggerモジュール（`src/utils/logger.ts`）を使用して、以下のログを出力する
- **INFO**: バグ検出開始、Issue候補数、重複判定結果、Issue作成成功
- **WARN**: OpenAI API タイムアウト、類似度判定失敗
- **ERROR**: GitHub API エラー、ts-morphパースエラー

**優先度**: 中
**受け入れ基準**:
- Given: `auto-issue` コマンドが実行されている
- When: バグ検出が開始される
- Then: 「Analyzing repository for bug patterns...」のINFOログが出力される

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

**NFR-1.1**: バグ検出速度
**説明**: 500ファイル程度のリポジトリ（約50,000行のTypeScriptコード）に対して、バグ検出処理を60秒以内に完了する
**受け入れ基準**: 500ファイル、50,000行のテストリポジトリで計測し、60秒以内に完了することを確認

**NFR-1.2**: LLM呼び出しの並列化
**説明**: 複数のIssue候補に対する重複判定（OpenAI API呼び出し）を並列実行し、全体の実行時間を短縮する
**受け入れ基準**: 10個のIssue候補に対して、順次実行（約30秒）に比べて並列実行（約10秒）が3倍高速であることを確認

### 3.2 セキュリティ要件

**NFR-2.1**: GitHub Token の適切な管理
**説明**: `GITHUB_TOKEN` 環境変数を使用し、コード内にトークンをハードコードしない
**受け入れ基準**: コードレビューでトークンのハードコードが存在しないことを確認

**NFR-2.2**: OpenAI APIキーの適切な管理
**説明**: `OPENAI_API_KEY` 環境変数を使用し、コード内にAPIキーをハードコードしない
**受け入れ基準**: コードレビューでAPIキーのハードコードが存在しないことを確認

### 3.3 可用性・信頼性要件

**NFR-3.1**: LLM統合の自動フォールバック
**説明**: OpenAI API呼び出し失敗時（タイムアウト、レート制限）は、コサイン類似度のみで重複判定を継続する
**受け入れ基準**: OpenAI APIがタイムアウトした場合でも、コマンドが異常終了せず、「LLM判定をスキップ」のWARNログが出力される

**NFR-3.2**: リトライロジック
**説明**: GitHub API / OpenAI API の一時的なエラー（500 Internal Server Error、タイムアウト）に対して、最大3回までリトライする（指数バックオフ戦略）
**受け入れ基準**: GitHub APIが一時的に500エラーを返す場合、1秒後、2秒後、4秒後にリトライし、3回すべて失敗した場合にエラー終了する

### 3.4 保守性・拡張性要件

**NFR-4.1**: モジュール分離
**説明**: CLIハンドラ、リポジトリ解析、重複検出、Issue生成の4つの責務を独立したモジュール（`auto-issue.ts`, `repository-analyzer.ts`, `issue-deduplicator.ts`, `issue-generator.ts`）に分離する
**受け入れ基準**: 各モジュールが単一責任原則（SRP）に従い、インターフェースが明確に定義されている

**NFR-4.2**: Phase 2以降への拡張性
**説明**: Phase 1で実装したバグ検出エンジンを、Phase 2（リファクタリング検出）、Phase 3（拡張機能検出）へ容易に拡張できる設計とする
**受け入れ基準**: `RepositoryAnalyzer` クラスに新しい検出パターン（例: `detectRefactoringOpportunities()`）を追加できるインターフェースが定義されている

**NFR-4.3**: 既存コマンドとの整合性
**説明**: `rollback` コマンド等の既存コマンド実装パターン（CLIオプション解析、エラーハンドリング、ロギング）と整合性を保つ
**受け入れ基準**: `auto-issue` コマンドのCLIオプション解析が `rollback` コマンドと同様のパターン（commander.jsの使用）で実装されている

---

## 4. 制約事項

### 4.1 技術的制約

**C-1.1**: TypeScript 5.x + Node.js 20
**説明**: 既存のAI Workflow Agentプロジェクトと同じランタイム環境を使用する

**C-1.2**: ts-morph パッケージの学習曲線
**説明**: TypeScript AST解析の経験が少ない場合、ts-morphパッケージの学習に時間がかかる（Planning Documentで「中リスク」と評価）

**C-1.3**: Phase 1 MVPのスコープ制限
**説明**: **バグ検出のみ**を実装し、リファクタリング検出・拡張機能検出はPhase 2以降に延期する

**C-1.4**: 既存コードの変更範囲
**説明**: `src/main.ts` への新規コマンド登録のみで、既存コマンドハンドラ（`init.ts`, `execute.ts`, `rollback.ts` 等）は変更しない

### 4.2 リソース制約

**C-2.1**: 実装期間
**説明**: Planning Documentの見積もり（20~28時間、2.5~3.5日程度）に従う

**C-2.2**: OpenAI API コスト
**説明**: 重複判定時のLLM呼び出し回数を最小化し、コストを抑える（コサイン類似度による初期フィルタリングを活用）

### 4.3 ポリシー制約

**C-3.1**: ロギング規約（Issue #61）
**説明**: `console.log/error/warn` の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用する

**C-3.2**: 環境変数アクセス規約（Issue #51）
**説明**: `process.env` への直接アクセスは禁止。Config クラス（`src/core/config.ts`）の `config.getXxx()` メソッドを使用する

**C-3.3**: エラーハンドリング規約（Issue #48）
**説明**: `as Error` 型アサーションの使用は禁止。エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）の `getErrorMessage()`, `getErrorStack()` を使用する

---

## 5. 前提条件

### 5.1 システム環境

**P-1.1**: Node.js 20以上、npm 10以上がインストールされている
**P-1.2**: TypeScript 5.xコンパイラがインストールされている（`package.json` の devDependencies）
**P-1.3**: `npm install` 実行済み（既存依存パッケージがインストール済み）

### 5.2 依存コンポーネント

**P-2.1**: ts-morph パッケージ
**説明**: TypeScript AST解析に使用する新規依存パッケージ（バージョン: `^21.0.0`）

**P-2.2**: 既存の openai パッケージ
**説明**: 重複判定の意味的類似度計算に使用（`src/core/content-parser.ts` で既に利用中）

**P-2.3**: 既存の GitHubClient
**説明**: Issue取得・作成、ラベル付与に使用（`src/core/github-client.ts`）

### 5.3 外部システム連携

**P-3.1**: GitHub API
**説明**: 既存Issueの取得、新規Issue作成、ラベル付与に使用
**認証**: `GITHUB_TOKEN` 環境変数（repo, workflow, read:org スコープ）

**P-3.2**: OpenAI API
**説明**: 意味的類似度判定に使用
**認証**: `OPENAI_API_KEY` 環境変数

---

## 6. 受け入れ基準

各機能要件の受け入れ基準を Given-When-Then 形式で記述します。

### 6.1 CLIコマンド基盤

**AC-1.1**: `auto-issue` コマンドの基本動作
- **Given**: ビルド済みのCLI（`dist/index.js`）が存在する
- **When**: `node dist/index.js auto-issue --category bug --dry-run` を実行する
- **Then**: バグ検出処理が実行され、Issue候補が標準出力に表示される（GitHub APIは呼び出されない）

**AC-1.2**: CLIオプションのバリデーション
- **Given**: `auto-issue` コマンドが実装されている
- **When**: `node dist/index.js auto-issue --category refactor` を実行する
- **Then**: 「Phase 1では `bug` カテゴリのみサポート」のエラーメッセージが表示され、終了コード1で終了する

**AC-1.3**: `--limit` オプションの動作
- **Given**: リポジトリ内に10個のバグ候補が検出された
- **When**: `--limit 3` オプションを指定する
- **Then**: 上位3個のバグ候補のみがIssue候補として処理される

**AC-1.4**: `--similarity-threshold` オプションの動作
- **Given**: Issue候補の類似度スコアが0.75、デフォルト閾値が0.8
- **When**: `--similarity-threshold 0.7` を指定する
- **Then**: 類似度0.75のIssue候補は重複と判定され、スキップされる

### 6.2 リポジトリ探索エンジン（バグ検出）

**AC-2.1**: エラーハンドリング欠如の検出
- **Given**: `src/example.ts` に以下のコードが存在する
  ```typescript
  async function fetchData() {
    await fetch('https://api.example.com/data');
  }
  ```
- **When**: `auto-issue` コマンドを実行する
- **Then**: 「エラーハンドリング欠如: src/example.ts:1 - 関数 fetchData」のバグ情報が返される

**AC-2.2**: `any` 型過剰使用の検出
- **Given**: `src/example.ts` に10箇所の `any` 型使用がある（閾値: 5箇所）
- **When**: `auto-issue` コマンドを実行する
- **Then**: 「型安全性の問題: src/example.ts - any型が10箇所で使用されています（閾値: 5）」のバグ情報が返される

**AC-2.3**: リソースリークの検出
- **Given**: `src/example.ts` に以下のコードが存在する
  ```typescript
  const stream = fs.createReadStream('file.txt');
  // stream.close() が呼び出されていない
  ```
- **When**: `auto-issue` コマンドを実行する
- **Then**: 「リソースリーク: src/example.ts:1 - ストリームが閉じられていません」のバグ情報が返される

**AC-2.4**: 除外パターンの適用
- **Given**: `tests/unit/example.test.ts` にバグパターンが存在する
- **When**: `auto-issue` コマンドを実行する
- **Then**: `tests/` 配下のファイルは解析対象外となり、バグ候補に含まれない

### 6.3 重複Issue検出機能

**AC-3.1**: 既存Issueの取得
- **Given**: GitHub API認証情報（`GITHUB_TOKEN`）が設定されている
- **When**: `auto-issue` コマンドを実行する
- **Then**: リポジトリのすべてのOpen Issuesが取得され、タイトル・本文が類似度計算に使用される

**AC-3.2**: コサイン類似度の計算
- **Given**: Issue候補「エラーハンドリング欠如: src/main.ts:123」と既存Issue「src/main.tsのエラーハンドリング改善」が存在する
- **When**: コサイン類似度を計算する
- **Then**: 類似度スコア（0.0-1.0）が返される（期待値: 0.6以上）

**AC-3.3**: LLM意味的類似度判定
- **Given**: コサイン類似度が0.6のIssue候補が存在する
- **When**: OpenAI APIで意味的類似度を判定する
- **Then**: 「類似/非類似」の判定結果が返され、類似度スコアが更新される（例: 0.6 → 0.85）

**AC-3.4**: 重複Issueのスキップ
- **Given**: Issue候補の類似度スコアが0.85、閾値が0.8
- **When**: 重複判定を実行する
- **Then**: 「Skipping duplicate issue: ...」のINFOログが出力され、Issue作成がスキップされる

**AC-3.5**: OpenAI API エラー時のフォールバック
- **Given**: OpenAI APIがタイムアウトする
- **When**: 意味的類似度判定を実行する
- **Then**: 「LLM判定をスキップ（コサイン類似度のみで判定）」のWARNログが出力され、処理が継続される

### 6.4 Issue生成エンジン

**AC-4.1**: Issue本文の生成
- **Given**: `BugPattern` オブジェクト（エラーハンドリング欠如）が存在する
- **When**: Issue本文を生成する
- **Then**: 以下のセクションを含むMarkdown形式のテキストが生成される
  - 概要（「## 概要」）
  - 検出箇所（「## 検出箇所」）
  - 問題の説明（「## 問題の説明」）
  - 推奨修正方法（「## 推奨修正方法」）
  - 関連情報（「## 関連情報」）

**AC-4.2**: GitHub APIでのIssue作成
- **Given**: `--dry-run` オプションが指定されていない
- **When**: Issue候補が重複判定をパスした
- **Then**: GitHub APIで新しいIssueが作成され、「Created issue #XXX」のINFOログが出力される

**AC-4.3**: ラベル自動付与
- **Given**: Issue作成が成功した
- **When**: ラベル付与処理が実行される
- **Then**: 作成されたIssueに `auto-generated` と `bug` ラベルが設定される

**AC-4.4**: dry-runモードでのプレビュー表示
- **Given**: `--dry-run` オプションが指定されている
- **When**: `auto-issue` コマンドを実行する
- **Then**: 以下の情報が標準出力に表示され、GitHub APIは呼び出されない
  - Issue候補のタイトル
  - Issue本文のプレビュー（先頭500文字）
  - 重複判定結果（類似度スコア、重複Issue番号）

### 6.5 エラーハンドリング

**AC-5.1**: GitHub API 403エラーのハンドリング
- **Given**: GitHub APIが403エラー（権限不足）を返す
- **When**: `auto-issue` コマンドを実行する
- **Then**: 「GitHub API権限不足: GITHUB_TOKENに repo スコープが必要です」のERRORログが出力され、終了コード1で終了する

**AC-5.2**: ts-morphパースエラーのハンドリング
- **Given**: `src/example.ts` に構文エラーが存在する
- **When**: `auto-issue` コマンドを実行する
- **Then**: 「TypeScript parse error: src/example.ts」のWARNログが出力され、該当ファイルはスキップされ、処理が継続される

**AC-5.3**: OpenAI APIレート制限のハンドリング
- **Given**: OpenAI APIがレート制限エラー（429 Too Many Requests）を返す
- **When**: リトライロジックが実行される
- **Then**: 1秒、2秒、4秒後にリトライし、3回すべて失敗した場合は「OpenAI APIレート制限に達しました」のWARNログが出力され、LLM判定がスキップされる

---

## 7. スコープ外

以下の機能は**Phase 1のスコープ外**とし、Phase 2以降で実装します：

### 7.1 Phase 2以降の機能

**OUT-1.1**: リファクタリング検出
**説明**: コードの重複、長大な関数、過度なネスト等のリファクタリング候補を検出する機能
**理由**: Phase 1はバグ検出のみに集中し、Phase 2で拡張する

**OUT-1.2**: 拡張機能検出
**説明**: コードベースから機能拡張の余地（例: 欠けているバリデーション、ログ不足）を検出する機能
**理由**: Phase 1はバグ検出のみに集中し、Phase 3で拡張する

**OUT-1.3**: GitHub Projects連携
**説明**: 作成されたIssueを自動的にGitHub Projectsに追加する機能
**理由**: Phase 1では基本的なIssue作成のみを実装し、Project統合はPhase 4で検討する

**OUT-1.4**: Slack通知
**説明**: Issue作成時にSlackへ通知を送信する機能
**理由**: Phase 1では基本機能のみを実装し、通知機能はPhase 4で検討する

### 7.2 将来的な拡張候補

**OUT-2.1**: GitLab、Bitbucket対応
**説明**: GitHub以外のGitプラットフォームでのIssue作成をサポート
**理由**: Phase 1ではGitHub APIのみに限定し、他プラットフォームは将来的な拡張とする

**OUT-2.2**: カスタムバグパターン定義
**説明**: ユーザーが独自のバグパターンを定義できる機能（設定ファイル、DSL）
**理由**: Phase 1では3つの固定パターンのみを実装し、カスタマイズ機能は将来的な拡張とする

**OUT-2.3**: 修正パッチの自動生成
**説明**: 検出されたバグに対して自動的に修正パッチ（Pull Request）を生成する機能
**理由**: Phase 1ではIssue作成のみを実装し、自動修正は将来的な拡張とする

---

## 8. 補足情報

### 8.1 参考実装パターン

Planning Documentで言及されている既存コマンド実装パターンを参考にします：

**rollback コマンド（Issue #90）**:
- CLIオプション解析: commander.jsの使用パターン
- エラーハンドリング: `validateRollbackOptions()` パターン
- 入力方法の多様化: `--reason`, `--reason-file`, `--interactive` の3つの入力方法
- メタデータ操作: `MetadataManager` の拡張メソッド活用

**execute コマンド（Issue #46）**:
- ファサードパターン: `handleExecuteCommand()` が専門モジュールに委譲
- オプション解析: `options-parser.ts` による分離
- エージェント初期化: `agent-setup.ts` による分離

### 8.2 技術リソース

Planning Documentで推奨されている技術リソース：

- **ts-morph公式ドキュメント**: https://ts-morph.com/
- **TypeScript AST Explorer**: https://ts-ast-viewer.com/
- **OpenAI API リファレンス**: https://platform.openai.com/docs/api-reference
- **GitHub REST API**: https://docs.github.com/en/rest/issues

### 8.3 リスク管理

Planning Documentで特定されたリスクへの対処方針：

**リスク1: ts-morph パッケージの学習曲線（中リスク、高確率）**
**軽減策**:
- Phase 1 Task 1-2（技術調査）でサンプルコード作成
- 公式ドキュメントとサンプルリポジトリを参照
- 既存のTypeScript AST解析ツール（ESLintプラグイン等）のソースコードを参考

**リスク2: OpenAI API のレート制限・タイムアウト（中リスク、中確率）**
**軽減策**:
- コサイン類似度による初期フィルタリング（類似度が低いものはLLM呼び出しをスキップ）
- LLM呼び出しにタイムアウトとリトライロジックを実装
- 環境変数 `OPENAI_API_KEY` が未設定の場合は、LLM統合をスキップしてコサイン類似度のみで判定

**リスク3: バグ検出パターンの精度不足（False Positive/Negative）（中リスク、中確率）**
**軽減策**:
- Phase 1 MVP では3つのパターンのみに限定（エラーハンドリング欠如、any型、リソースリーク）
- Phase 3（テストシナリオ）でテストケースを充実させ、False Positive/Negative のケースを洗い出し
- `--dry-run` モードで検出結果をレビューし、パターンを調整

### 8.4 成功基準

Planning Documentの「8. 成功基準（受け入れ基準の詳細化）」に基づき、以下を成功基準とします：

#### 8.4.1 機能要件
- [ ] `node dist/index.js auto-issue --category bug --dry-run` が正常に動作する
- [ ] `--limit` オプションでIssue候補数を制限できる（デフォルト: 5）
- [ ] `--similarity-threshold` オプションで重複判定の閾値を調整できる（デフォルト: 0.8）
- [ ] `--dry-run` モードでは候補のみを表示し、実際のIssue作成は行わない
- [ ] `--dry-run` なしでは、GitHub API経由でIssueを実際に作成する

#### 8.4.2 バグ検出パターン
- [ ] エラーハンドリング欠如（async関数のtry-catch欠如）を検出できる
- [ ] 型安全性の問題（`any`型の過剰使用）を検出できる
- [ ] リソースリーク（unclosed streams等）を検出できる

#### 8.4.3 重複Issue検出
- [ ] GitHub APIで既存Issue一覧を取得できる
- [ ] コサイン類似度で初期フィルタリングを実施できる
- [ ] LLM（OpenAI API）で意味的類似度を判定できる
- [ ] 重複と判定されたIssueはスキップされる

#### 8.4.4 Issue生成
- [ ] テンプレートベースでIssue本文を生成できる
- [ ] ラベル `auto-generated`, `bug` を自動付与できる
- [ ] 生成されたIssueに検出されたバグ情報が含まれる

#### 8.4.5 品質要件
- [ ] ユニットテストが追加されている（重複検出ロジック、バグ検出パターン）
- [ ] インテグレーションテストが追加されている（コマンド全体のフロー）
- [ ] カバレッジが80%以上である
- [ ] CLAUDE.mdに基本的なドキュメントが追加されている

---

## 9. まとめ

本要件定義書は、Issue #126「auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装」の詳細な機能要件、非機能要件、制約事項、受け入れ基準を定義しました。

### 9.1 要件定義の品質ゲート（Phase 1）確認

本要件定義書は、Planning Documentで定義された品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: セクション2で12個の機能要件（FR-1.1 〜 FR-5.2）を明確に定義
- ✅ **受け入れ基準が定義されている**: セクション6で各機能要件のAcceptance Criteria（AC-1.1 〜 AC-5.3）をGiven-When-Then形式で定義
- ✅ **スコープが明確である**: セクション7でPhase 1のスコープ外事項（Phase 2以降の機能、将来的な拡張候補）を明確化
- ✅ **論理的な矛盾がない**: 機能要件、非機能要件、制約事項、受け入れ基準が整合性を保っている

### 9.2 次フェーズへの引き継ぎ事項

次のフェーズ（Design Phase）で詳細化すべき事項：

1. **バグ検出パターンの具体的なAST解析ロジック**（Planning Document 9. 次のフェーズへの引き継ぎ事項より）
   - エラーハンドリング欠如の検出パターン（`async` 関数の `try-catch` チェック）
   - `any` 型の過剰使用の判定基準（閾値: 5箇所）
   - リソースリークの検出パターン（ファイルストリーム、ネットワーク接続等）

2. **重複Issue検出のアルゴリズム詳細**（Planning Document 9. 次のフェーズへの引き継ぎ事項より）
   - コサイン類似度の計算方法（TF-IDF、単語埋め込み等）
   - LLM統合のプロンプト設計（OpenAI APIへの入力フォーマット）
   - 類似度閾値のデフォルト値（0.8）の妥当性検証

3. **Issueテンプレートの構造**（Planning Document 9. 次のフェーズへの引き継ぎ事項より）
   - Issue本文のセクション構成（概要、検出されたコード、推奨修正方法等）
   - Markdownフォーマットの詳細（コードブロック、チェックリスト等）

### 9.3 最終確認

本要件定義書は、Planning Documentの開発計画（実装戦略: CREATE、テスト戦略: UNIT_INTEGRATION、見積もり: 20~28時間）を踏まえて詳細化されています。次のDesign Phaseでは、これらの要件を具体的なアーキテクチャ設計・モジュール設計に落とし込みます。
