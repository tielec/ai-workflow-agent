# 要件定義書 - Issue #128

**Issue**: auto-issue: Phase 3 - 機能拡張提案（創造的提案）機能の実装
**日付**: 2025-01-30
**担当フェーズ**: Phase 1 (Requirements)

---

## 0. Planning Documentの確認

### 開発計画の概要

Planning Phase（Phase 0）で策定された計画に基づき、以下の戦略で実装を進めます：

- **実装戦略**: **EXTEND** - 既存の `auto-issue` 機能（Phase 1: バグ検出、Phase 2: リファクタリング検出）を拡張し、第3カテゴリ（enhancement）として実装
- **テスト戦略**: **UNIT_INTEGRATION** - ユニットテストとインテグレーションテストの両方を実装
- **テストコード戦略**: **BOTH_TEST** - 既存テストファイルの拡張と新規テストファイルの作成

### 開発スコープ

- **見積もり工数**: 40〜56時間（5〜7営業日）
- **リスク評価**: 高（High）- エージェント出力の構造化、提案品質のばらつき、重複検出の精度低下
- **複雑度**: 複雑（Complex）- 創造的提案生成という新しい分析アプローチが必要

### 主要リスクと軽減策

1. **エージェント出力の構造化困難**: JSON出力形式の厳格化、フォールバック処理、寛容なパーサー実装
2. **提案品質のばらつき**: バリデーション強化、品質スコア算出、初期リリースでは少数生成推奨
3. **リポジトリ特性の誤解**: 主要ドキュメント参照の強制、根拠フィールド必須化

---

## 1. 概要

### 背景

AI Workflow Agent では、Issue #121「AIエージェントによる自動Issue作成機能」の実装を3つのフェーズに分けて進めており、本Issue（#128）はその第3フェーズに該当します。

- **Phase 1（Issue #126）**: バグ検出機能（完了）
- **Phase 2（Issue #127）**: リファクタリング機会検出機能（完了）
- **Phase 3（Issue #128）**: 機能拡張提案（創造的提案）機能 ← 本Issue

Phase 1/2では、既存コードの問題点を検出する機能を実装しましたが、Phase 3では「**リポジトリの特性を理解し、将来的な改善や拡張のアイデアを創造的に提案する**」という新しい価値を提供します。

### 目的

本機能の目的は以下の通りです：

1. **開発者の創造性支援**: AIエージェント（Codex/Claude）がリポジトリを深く分析し、人間では見落としがちな改善アイデアを提案
2. **プロダクトロードマップの加速**: 技術的負債の解消だけでなく、新機能の発案を支援
3. **ユーザー価値の最大化**: ユーザビリティ改善、他ツール連携、自動化拡張などの提案により、プロダクトの魅力を向上
4. **既存アーキテクチャの活用**: Phase 1/2で確立した `RepositoryAnalyzer`, `IssueGenerator`, `IssueDeduplicator` を最大限再利用

### ビジネス価値

- **時間短縮**: 機能拡張のアイデア出しにかかる時間を削減（週次レビュー会議の効率化）
- **品質向上**: AIによる網羅的な分析により、見落としがちな改善点を発見
- **開発者体験（DX）向上**: 開発者がルーチンワークから解放され、クリエイティブな作業に集中可能

### 技術的価値

- **拡張性の実証**: 既存の `auto-issue` アーキテクチャが新しいユースケース（創造的提案）にも対応可能であることを実証
- **エージェント活用の深化**: Phase 1/2よりも高度なプロンプト設計により、エージェントの創造性を引き出す
- **多様なリポジトリ対応**: TypeScript以外（Go、Python等）のリポジトリでも動作する汎用性を確保

---

## 2. 機能要件

### FR-001: リポジトリ特性分析機能（優先度: 高）

**説明**:
AIエージェント（Codex/Claude）を使用して、対象リポジトリの特性を深く分析する機能。

**詳細**:
- **FR-001-1**: プロジェクト構造分析
  - 使用技術スタック（言語、フレームワーク、ライブラリ）を自動検出
  - アーキテクチャパターン（モノリス、マイクロサービス、レイヤードアーキテクチャ等）を識別
  - ディレクトリ構造とモジュール構成を解析
- **FR-001-2**: 既存機能の理解
  - README.md、ARCHITECTURE.md、package.json等の主要ドキュメントを解析
  - 主要な機能・ワークフローを抽出
  - 設定可能なオプション、拡張ポイントを特定
- **FR-001-3**: ドキュメント分析
  - 既存のロードマップ、TODO、技術的負債の記述を収集
  - Issue、PR、コミットメッセージから開発の方向性を推測

**受け入れ基準**:
- **Given**: 対象リポジトリのパスが指定されている
- **When**: `analyzeForEnhancements()` メソッドを実行
- **Then**: 以下の情報を含む分析結果が返される
  - 技術スタック（配列）
  - アーキテクチャパターン（文字列）
  - 主要機能リスト（配列）
  - 既存ドキュメントの要約（文字列）

### FR-002: 創造的提案生成機能（優先度: 高）

**説明**:
AIエージェントが、リポジトリ分析結果を踏まえて創造的な機能拡張提案を生成する機能。

**詳細**:
- **FR-002-1**: 既存機能の改善提案
  - ユーザビリティ改善（CLI UI、エラーメッセージの改善等）
  - パフォーマンス最適化（並列実行、キャッシュ導入等）
  - テストカバレッジ向上（未テスト領域の検出）
  - CI/CD改善（ビルド時間短縮、自動デプロイ等）
- **FR-002-2**: 新機能の提案
  - 他ツール・サービスとの連携（Slack、Jira、VSCode拡張等）
  - ワークフロー自動化の拡張（定期実行、トリガーベース実行等）
  - 開発者体験（DX）向上（設定ファイル生成、対話的セットアップ等）
  - 品質保証の強化（静的解析、セキュリティスキャン等）
  - データ駆動の意思決定支援（メトリクス収集、レポート生成等）
  - エコシステム拡張（プラグインシステム、テンプレート機能等）
- **FR-002-3**: 提案の構造化
  - 各提案は `EnhancementProposal` 型に準拠（type, title, description, rationale, implementation_hints, expected_impact, effort_estimate, related_files）
  - JSON形式でエージェントから出力され、TypeScriptオブジェクトにパース可能

**受け入れ基準**:
- **Given**: リポジトリ分析が完了している
- **When**: エージェントに創造的提案生成プロンプトを実行
- **Then**: 以下を満たす提案が生成される
  - 最低3件以上の提案が含まれる
  - 各提案が `EnhancementProposal` 型の全フィールドを持つ
  - 各提案の `description` が100文字以上
  - 各提案の `rationale` が50文字以上（根拠が明確）
  - 各提案の `related_files` が1つ以上含まれる

### FR-003: EnhancementProposal型定義（優先度: 高）

**説明**:
機能拡張提案を表現するTypeScript型定義。

**詳細**:
```typescript
interface EnhancementProposal {
  type: 'improvement' | 'integration' | 'automation' | 'dx' | 'quality' | 'ecosystem';
  title: string;  // 提案タイトル（50〜100文字）
  description: string;  // 提案の詳細説明（100文字以上）
  rationale: string;  // なぜこの提案が有用か（50文字以上）
  implementation_hints: string[];  // 実装のヒント（配列、最低1つ）
  expected_impact: 'low' | 'medium' | 'high';  // 期待される効果
  effort_estimate: 'small' | 'medium' | 'large';  // 実装の難易度
  related_files: string[];  // 関連するファイル・モジュール（配列、最低1つ）
}
```

**受け入れ基準**:
- **Given**: `src/types/auto-issue.ts` に型定義を追加
- **When**: TypeScriptコンパイルを実行
- **Then**: 型定義がエラーなくコンパイルされる
- **Then**: 各フィールドにTSDocコメントが追加されている

### FR-004: プロンプトテンプレート設計（優先度: 高）

**説明**:
AIエージェントに創造的提案を生成させるためのプロンプトテンプレート。

**詳細**:
- **FR-004-1**: リポジトリ分析セクション
  - 技術スタック検出の指示
  - アーキテクチャ理解の指示
  - ドキュメント解析の指示
- **FR-004-2**: 提案生成セクション
  - 既存機能改善の指示
  - 新機能提案の指示
  - 創造的発想の促進（既存の枠にとらわれない）
- **FR-004-3**: 出力形式セクション
  - JSON構造の指定
  - フィールド定義の明示
  - サンプル出力の提示
- **FR-004-4**: `--creative-mode` オプション対応
  - 通常モード: 実現可能性重視、保守的な提案
  - 創造的モード: 実験的な提案を含める、より自由な発想

**受け入れ基準**:
- **Given**: `src/prompts/auto-issue/detect-enhancements.txt` を作成
- **When**: プロンプトをエージェントに送信
- **Then**: 以下の条件を満たす出力が得られる
  - JSON形式で出力される
  - 出力が `EnhancementProposal[]` にパース可能
  - 最低3件以上の提案が含まれる
  - 各提案が具体的で実現可能性がある

### FR-005: RepositoryAnalyzer拡張（優先度: 高）

**説明**:
`src/core/repository-analyzer.ts` に `analyzeForEnhancements()` メソッドを追加。

**詳細**:
- **FR-005-1**: 新規メソッド追加
  - メソッド名: `analyzeForEnhancements(repoPath: string, agent: 'codex' | 'claude', options?: { creativeMode?: boolean }): Promise<EnhancementProposal[]>`
  - プロンプトパス: `src/prompts/auto-issue/detect-enhancements.txt` を読み込み
  - 変数置換: `{repository_path}`, `{output_file_path}`, `{creative_mode}` 等をプロンプトに埋め込み
  - エージェント実行: Codex → Claude フォールバック機構を適用
- **FR-005-2**: バリデーション
  - `validateEnhancementProposal()` メソッドを追加
  - 各フィールドの文字数制限をチェック（title: 50〜100文字、description: 100文字以上、rationale: 50文字以上）
  - 必須フィールドの存在チェック
  - 無効な提案を除外し、ログに警告を出力

**受け入れ基準**:
- **Given**: 対象リポジトリのパスとエージェントモードが指定されている
- **When**: `analyzeForEnhancements()` を呼び出す
- **Then**: 以下の条件を満たす
  - `EnhancementProposal[]` が返される
  - 各提案がバリデーションを通過している
  - エージェント失敗時は空配列が返される（エラーをスローしない）
  - ログに実行結果（成功/失敗、提案数）が出力される

### FR-006: IssueGenerator拡張（優先度: 高）

**説明**:
`src/core/issue-generator.ts` に `generateEnhancementIssue()` メソッドを追加。

**詳細**:
- **FR-006-1**: 新規メソッド追加
  - メソッド名: `generateEnhancementIssue(candidate: EnhancementProposal, agent: 'codex' | 'claude', dryRun: boolean): Promise<IssueCreationResult>`
  - タイトル生成: `generateEnhancementTitle(candidate)` - 提案タイプごとのプレフィックス（例: "[Enhancement] ", "[Integration] "）
  - ラベル生成: `generateEnhancementLabels(candidate)` - `auto-generated`, `enhancement`, `priority:high/medium/low`, タイプ別ラベル（`integration`, `automation`, `dx`, `quality`, `ecosystem`）
  - 本文生成: エージェントに Issue 本文生成を依頼（フォールバック: `createEnhancementFallbackBody()`）
- **FR-006-2**: フォールバックテンプレート
  - エージェント失敗時の定型テンプレート
  - 提案の全フィールドを含む Markdown 形式

**受け入れ基準**:
- **Given**: `EnhancementProposal` オブジェクトが渡される
- **When**: `generateEnhancementIssue()` を呼び出す
- **Then**: 以下の条件を満たす
  - `IssueCreationResult` が返される（issueNumber, issueUrl, title, body, labels）
  - タイトルが提案タイプに応じたプレフィックスを含む
  - ラベルに `auto-generated`, `enhancement` が含まれる
  - ラベルに優先度（`priority:high/medium/low`）が含まれる
  - ラベルにタイプ別ラベル（`integration`, `automation` 等）が含まれる
  - dry-run モード時は GitHub API を呼び出さない

### FR-007: CLIコマンド拡張（優先度: 高）

**説明**:
`auto-issue` コマンドに `--category enhancement` と `--creative-mode` オプションを追加。

**詳細**:
- **FR-007-1**: `src/commands/auto-issue.ts` 拡張
  - `handleAutoIssueCommand()` に `category === 'enhancement'` の分岐を追加
  - `processEnhancementCandidates()` ヘルパー関数を実装
    - `RepositoryAnalyzer.analyzeForEnhancements()` を呼び出し
    - `IssueDeduplicator.filterDuplicates()` で重複除外（※ 初期リリースでは重複検出の精度を検証後に有効化）
    - `IssueGenerator.generateEnhancementIssue()` で Issue 生成
- **FR-007-2**: `src/main.ts` 拡張
  - `--creative-mode` オプションの追加（boolean、デフォルト: false）
  - オプションの説明: "より創造的で実験的な提案を含める"
- **FR-007-3**: `src/types/auto-issue.ts` 拡張
  - `AutoIssueOptions` インターフェースに `creativeMode?: boolean` フィールドを追加

**受け入れ基準**:
- **Given**: CLI で以下のコマンドを実行
  ```bash
  ai-workflow auto-issue --category enhancement --creative-mode --dry-run --limit 3
  ```
- **When**: コマンドが実行される
- **Then**: 以下の動作を確認
  - リポジトリ分析が実行される
  - 創造的提案が生成される（最大3件）
  - 重複チェックが実行される
  - dry-run モードのため Issue は生成されない
  - コンソールに提案内容（タイトル、説明、ラベル）が表示される

### FR-008: 重複検出機能の統合（優先度: 中）

**説明**:
Phase 1 で実装した `IssueDeduplicator` を enhancement カテゴリに適用。

**詳細**:
- **FR-008-1**: 類似度閾値の調整
  - enhancement カテゴリでは、デフォルト類似度閾値を 0.85 に引き上げ（Phase 1 のデフォルト 0.75 より厳格）
  - 理由: 提案は抽象度が高く、誤って重複判定されやすいため
- **FR-008-2**: 既存 Issue との重複チェック
  - GitHub API で `label:enhancement` の既存 Issue を取得
  - Stage 1: TF-IDF + コサイン類似度で高速フィルタリング
  - Stage 2: LLM による意味的類似性判定
- **FR-008-3**: 検出された提案同士の重複チェック
  - 同一実行内で複数の提案が生成された場合、提案同士の重複もチェック

**受け入れ基準**:
- **Given**: 既存 Issue に "CI/CD の改善" という Enhancement Issue が存在
- **When**: 新しく "ビルド時間の短縮" という提案が生成される
- **Then**: 以下の動作を確認
  - Stage 1 で類似度 0.87 が算出される（閾値 0.85 以上）
  - Stage 2 で LLM が "内容が重複している" と判定
  - 提案が重複として除外される
  - ログに重複除外の理由が出力される

### FR-009: エージェントフォールバック機構（優先度: 中）

**説明**:
Phase 1/2 と同様、Codex → Claude のフォールバック機構を適用。

**詳細**:
- **FR-009-1**: `--agent auto` モード（デフォルト）
  - `CODEX_API_KEY` が設定されていれば Codex を優先
  - Codex 失敗時（認証エラー、空出力）は Claude にフォールバック
- **FR-009-2**: `--agent codex` モード
  - Codex のみ使用、失敗時はエラーを返す（フォールバックなし）
- **FR-009-3**: `--agent claude` モード
  - Claude のみ使用、Codex は無視

**受け入れ基準**:
- **Given**: `CODEX_API_KEY` が設定されておらず、`CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- **When**: `--agent auto` で実行
- **Then**: 以下の動作を確認
  - Codex のスキップログが出力される
  - Claude が実行される
  - 提案が正常に生成される

### FR-010: エラーハンドリング（優先度: 高）

**説明**:
エージェント実行の失敗、JSON パースエラー、バリデーションエラーを適切に処理。

**詳細**:
- **FR-010-1**: エージェント実行失敗
  - エージェントがエラーを返した場合、ログに詳細を出力し、空配列を返す
  - ユーザーには「提案生成に失敗しました」というメッセージを表示
- **FR-010-2**: JSON パースエラー
  - エージェント出力が不正な JSON の場合、寛容なパーサーで最初の有効な JSON 配列/オブジェクトを抽出
  - それでも失敗した場合、フォールバックテンプレートを使用
- **FR-010-3**: バリデーションエラー
  - 各提案をバリデーションし、無効な提案を除外
  - ログに「X件の提案がバリデーションを通過できませんでした」と警告を出力
  - 有効な提案のみを返す

**受け入れ基準**:
- **Given**: エージェントが不正な JSON を出力（例: `{title: "test", description: ...}` ← クォート不足）
- **When**: JSON パースを試みる
- **Then**: 以下の動作を確認
  - 寛容なパーサーが有効な部分を抽出
  - 抽出失敗時はフォールバックテンプレートを使用
  - ログに警告が出力される
  - プロセスは正常終了する（エラーをスローしない）

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件

- **NFR-001-1**: リポジトリ分析実行時間
  - 対象: 中規模リポジトリ（1,000ファイル、100,000行以下）
  - 基準: 分析完了まで5分以内
  - 計測方法: Phase 6（Testing）で実行時間を計測
- **NFR-001-2**: Issue 生成時間
  - 対象: 提案3件のIssue生成
  - 基準: 30秒以内（GitHub API呼び出しを含む）
  - 計測方法: dry-run モードと本番実行の比較
- **NFR-001-3**: メモリ使用量
  - 基準: 512MB以下（エージェント実行を含む）
  - 計測方法: Node.js の `process.memoryUsage()` で監視

### NFR-002: セキュリティ要件

- **NFR-002-1**: シークレットマスキング
  - エージェントに送信するプロンプトに、環境変数（`GITHUB_TOKEN`, `CODEX_API_KEY` 等）が含まれないこと
  - コミットメッセージ、ログファイルにシークレットが漏洩しないこと
- **NFR-002-2**: パストラバーサル防止
  - リポジトリパス解決時に `../` を使用した不正なパスアクセスを防ぐ
  - `resolveLocalRepoPath()` で絶対パス検証を実施

### NFR-003: 可用性・信頼性要件

- **NFR-003-1**: エージェント失敗時の復旧
  - Codex 失敗時は Claude にフォールバック
  - 両方失敗時は空配列を返し、プロセスは正常終了
- **NFR-003-2**: GitHub API エラーハンドリング
  - レート制限エラー（429）時は適切なエラーメッセージを表示
  - ネットワークエラー時は3回までリトライ（指数バックオフ）

### NFR-004: 保守性・拡張性要件

- **NFR-004-1**: コードの可読性
  - 各メソッドに TSDoc コメントを追加
  - 複雑なロジック（重複検出、バリデーション）はコメントで説明
- **NFR-004-2**: テストカバレッジ
  - ユニットテスト: 80%以上
  - インテグレーションテスト: 主要フローをカバー
- **NFR-004-3**: 拡張性
  - Phase 4（`--category all`）への拡張を見据えた設計
  - 新しい提案タイプ（`type`）の追加が容易

---

## 4. 制約事項

### 技術的制約

- **CON-001**: 既存アーキテクチャの維持
  - Phase 1/2 で確立した `RepositoryAnalyzer`, `IssueGenerator`, `IssueDeduplicator` のインターフェースを変更しない
  - 新規メソッドの追加のみ許可
- **CON-002**: 使用技術
  - TypeScript 5.x
  - Node.js 20 以上
  - 既存の依存パッケージ（`@octokit/rest`, `simple-git` 等）を使用
  - 新規 NPM パッケージの追加は不可（Phase 1/2 と同じ制約）
- **CON-003**: エージェント API
  - Codex: `gpt-5-codex` モデル
  - Claude: Claude Agent SDK
  - OpenAI API: レビュー判定、重複検出に使用

### リソース制約

- **CON-004**: 開発期間
  - 見積もり工数: 40〜56時間（5〜7営業日）
  - Phase 0〜Phase 8 まで完了させる
- **CON-005**: API コスト
  - Codex API: 月額予算内で運用（具体的な金額は未定）
  - OpenAI API（重複検出用）: 1実行あたり $0.10 以下を目標

### ポリシー制約

- **CON-006**: コーディング規約
  - CLAUDE.md、ARCHITECTURE.md に従う
  - ESLint ルールに準拠（`no-console`, `no-any` 等）
  - `process.env` への直接アクセス禁止（`src/core/config.ts` 経由）
  - `as Error` 型アサーション禁止（`src/utils/error-utils.ts` 使用）
- **CON-007**: Git 運用
  - ブランチ名: `ai-workflow/issue-128`
  - コミットメッセージ: `[ai-workflow] Phase {number} ({name}) - {step} completed` 形式
  - PR タイトル: Issue タイトルをそのまま使用

---

## 5. 前提条件

### システム環境

- **PRE-001**: 対象リポジトリ
  - Git リポジトリであること
  - GitHub でホストされていること
  - `src/` ディレクトリ配下にソースコードが存在すること
- **PRE-002**: 実行環境
  - Node.js 20 以上
  - npm 10 以上
  - Git 2.30 以上
  - 対象リポジトリへの読み取り権限

### 依存コンポーネント

- **PRE-003**: Phase 1（Issue #126）完了
  - `RepositoryAnalyzer.analyze()` が実装済み
  - `IssueDeduplicator.filterDuplicates()` が実装済み
  - `IssueGenerator.generate()` が実装済み
- **PRE-004**: Phase 2（Issue #127）完了（推奨）
  - `RepositoryAnalyzer.analyzeForRefactoring()` が実装済み
  - `IssueGenerator.generateRefactorIssue()` が実装済み

### 外部システム連携

- **PRE-005**: GitHub API
  - `GITHUB_TOKEN` 環境変数が設定されている
  - トークンに `repo`, `workflow`, `read:org` スコープが付与されている
- **PRE-006**: Codex API
  - `CODEX_API_KEY` または `OPENAI_API_KEY` が設定されている（任意）
- **PRE-007**: Claude Code SDK
  - `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている（任意）
  - `credentials.json` が有効である

---

## 6. 受け入れ基準

### AC-001: 機能動作の受け入れ基準

#### AC-001-1: 基本フロー（プレビューモード）
- **Given**: 対象リポジトリが存在し、環境変数が設定されている
- **When**: 以下のコマンドを実行
  ```bash
  ai-workflow auto-issue --category enhancement --dry-run --limit 3
  ```
- **Then**: 以下の動作を確認
  - リポジトリ分析が実行される
  - 最大3件の提案が生成される
  - 各提案が `EnhancementProposal` 型に準拠
  - 重複チェックが実行される
  - コンソールに提案内容（タイトル、説明、ラベル）が表示される
  - Issue は生成されない（dry-run モード）

#### AC-001-2: 本番実行（Issue生成）
- **Given**: 対象リポジトリが存在し、環境変数が設定されている
- **When**: 以下のコマンドを実行
  ```bash
  ai-workflow auto-issue --category enhancement --limit 5
  ```
- **Then**: 以下の動作を確認
  - 最大5件の提案が生成される
  - 重複チェックで既存 Issue との重複が除外される
  - 各提案が GitHub Issue として作成される
  - Issue のラベルに `auto-generated`, `enhancement`, 優先度、タイプ別ラベルが含まれる
  - コンソールに生成された Issue の URL が表示される

#### AC-001-3: 創造的モード
- **Given**: 対象リポジトリが存在し、環境変数が設定されている
- **When**: 以下のコマンドを実行
  ```bash
  ai-workflow auto-issue --category enhancement --creative-mode --dry-run --limit 3
  ```
- **Then**: 以下の動作を確認
  - 通常モードより実験的な提案が含まれる
  - 提案の `expected_impact` が "high" の割合が増える
  - エージェントに渡されるプロンプトに「創造的発想を促進」セクションが含まれる

#### AC-001-4: エージェント選択
- **Given**: `CODEX_API_KEY` と `CLAUDE_CODE_CREDENTIALS_PATH` が両方設定されている
- **When**: 以下のコマンドを実行
  ```bash
  ai-workflow auto-issue --category enhancement --agent codex --dry-run
  ```
- **Then**: 以下の動作を確認
  - Codex のみが実行される
  - Claude にフォールバックしない
  - Codex 失敗時はエラーメッセージが表示される

### AC-002: 品質の受け入れ基準

#### AC-002-1: 提案の具体性
- **Given**: 提案が生成されている
- **Then**: 各提案は以下の条件を満たす
  - `title` が50〜100文字
  - `description` が100文字以上
  - `rationale` が50文字以上
  - `implementation_hints` が最低1つ含まれる
  - `related_files` が最低1つ含まれる

#### AC-002-2: 提案の多様性
- **Given**: 5件の提案が生成されている
- **Then**: 以下の条件を満たす
  - 少なくとも3種類の `type`（improvement, integration, automation, dx, quality, ecosystem）が含まれる
  - 同じ `title` の提案が複数存在しない

#### AC-002-3: 重複検出の精度
- **Given**: 既存 Issue に "Slack 通知機能の追加" という Enhancement Issue が存在
- **When**: "Slack Integration for Notifications" という提案が生成される
- **Then**: 以下の動作を確認
  - 重複チェックで類似度 0.92 が算出される（閾値 0.85 以上）
  - LLM が重複と判定
  - 提案が除外される
  - ログに重複除外の理由が出力される

### AC-003: 非機能要件の受け入れ基準

#### AC-003-1: パフォーマンス
- **Given**: 中規模リポジトリ（1,000ファイル、100,000行）
- **When**: `auto-issue --category enhancement --limit 5` を実行
- **Then**: 以下の条件を満たす
  - 分析完了まで5分以内
  - Issue生成完了まで30秒以内（dry-run モード除く）

#### AC-003-2: エラーハンドリング
- **Given**: エージェントが不正な JSON を出力
- **When**: JSON パースを試みる
- **Then**: 以下の動作を確認
  - プロセスがクラッシュしない
  - ログに警告が出力される
  - フォールバックテンプレートが使用される

### AC-004: テストの受け入れ基準

#### AC-004-1: ユニットテスト
- **Given**: ユニットテストが実装されている
- **When**: `npm run test:unit` を実行
- **Then**: 以下の条件を満たす
  - 全テストが成功する
  - テストカバレッジが80%以上
  - 以下のテストケースが含まれる
    - `validateEnhancementProposal()` の正常系・異常系
    - `parseOptions()` の `--creative-mode` パース
    - タイトル・ラベル生成ロジック

#### AC-004-2: インテグレーションテスト
- **Given**: インテグレーションテストが実装されている
- **When**: `npm run test:integration` を実行
- **Then**: 以下の条件を満たす
  - 全テストが成功する
  - 以下のテストケースが含まれる
    - `category: 'enhancement'` のエンドツーエンドフロー
    - dry-run モードのテスト
    - エージェントフォールバック動作のテスト

### AC-005: ドキュメントの受け入れ基準

#### AC-005-1: CLAUDE.md 更新
- **Given**: CLAUDE.md が更新されている
- **Then**: 以下の内容が含まれる
  - `auto-issue` コマンドの `--category enhancement` オプション説明
  - `--creative-mode` オプション説明
  - Phase 3 実装完了のマーク（✅）
  - `EnhancementProposal` 型の説明

#### AC-005-2: README.md 更新
- **Given**: README.md が更新されている
- **Then**: 以下の内容が含まれる
  - `auto-issue` コマンドの使用例（`--category enhancement`）
  - `--creative-mode` オプションの説明
  - enhancement カテゴリの使用例（プレビューモード、本番実行）

---

## 7. スコープ外

以下の事項は、本Issue（#128）のスコープ外とします：

### OUT-001: Phase 4（`--category all`）の実装
- Phase 1/2/3 を統合した `--category all` オプションは別 Issue で実装
- 理由: Phase 3 の機能検証を先に完了させる必要がある

### OUT-002: 他ツール連携の実装
- 提案として「Slack 通知機能」「Jira 連携」等が生成されるが、実際の連携実装は別 Issue
- 理由: 提案生成機能と実装は分離

### OUT-003: 提案の自動優先度判定
- AI による自動優先度判定（`expected_impact` の自動算出）は将来実装予定
- 現バージョン: エージェントが手動で設定

### OUT-004: カスタムプロンプトのサポート
- ユーザーが独自のプロンプトテンプレートを指定する機能は将来実装予定
- 現バージョン: `src/prompts/auto-issue/detect-enhancements.txt` のみ

### OUT-005: 複数リポジトリの横断分析
- 複数のリポジトリを横断して提案を生成する機能は将来実装予定
- 現バージョン: 単一リポジトリのみ対象

### OUT-006: 提案の投票・評価機能
- 生成された提案に対してチームメンバーが投票・評価する機能は将来実装予定
- 現バージョン: Issue のコメント・リアクションで代替

---

## 8. 付録

### 付録A: Phase 1/2 との対応表

| 項目 | Phase 1 (Bug) | Phase 2 (Refactor) | Phase 3 (Enhancement) |
|------|--------------|-------------------|----------------------|
| **カテゴリ名** | `bug` | `refactor` | `enhancement` |
| **分析メソッド** | `analyze()` | `analyzeForRefactoring()` | `analyzeForEnhancements()` |
| **Issue 生成メソッド** | `generate()` | `generateRefactorIssue()` | `generateEnhancementIssue()` |
| **重複検出** | 有効（2段階アルゴリズム） | 無効 | 有効（閾値 0.85） |
| **プロンプトパス** | `detect-bugs.txt` | `detect-refactoring.txt` | `detect-enhancements.txt` |
| **データ型** | `BugCandidate` | `RefactorCandidate` | `EnhancementProposal` |
| **ラベル** | `bug`, `priority:*` | `refactoring`, `priority:*`, タイプ別 | `enhancement`, `priority:*`, タイプ別 |

### 付録B: エージェントプロンプトのサンプル

```
# Enhancement Proposal Generation Prompt

あなたは、ソフトウェアリポジトリを分析して機能拡張提案を生成するアシスタントです。

## タスク

以下の手順で、リポジトリの機能拡張提案を生成してください：

### ステップ1: リポジトリ分析

まず、対象リポジトリの特性を把握してください：

1. **技術スタック**
   - 使用言語、フレームワーク、ライブラリを特定
   - 例: TypeScript, Node.js, Express, Jest

2. **アーキテクチャパターン**
   - モノリス、マイクロサービス、レイヤードアーキテクチャ等を識別
   - ディレクトリ構造とモジュール構成を解析

3. **主要機能**
   - README.md、ARCHITECTURE.md、package.json を参照
   - 現在提供している機能・ワークフローを列挙

4. **既存ドキュメント**
   - ROADMAP、TODO、既存 Issue を確認
   - 技術的負債、今後の計画を把握

### ステップ2: 提案生成

以下の観点で、機能拡張の提案を生成してください：

#### A. 既存機能の改善提案

- **ユーザビリティ改善**: CLI UI、エラーメッセージ、ヘルプドキュメントの改善
- **パフォーマンス最適化**: 並列実行、キャッシュ導入、メモリ使用量削減
- **テストカバレッジ向上**: 未テスト領域の検出、E2Eテスト追加
- **CI/CD改善**: ビルド時間短縮、自動デプロイ、リリースフロー最適化

#### B. 新機能の提案

- **他ツール連携**: Slack、Jira、VSCode 拡張、GitHub Actions 等との連携
- **ワークフロー自動化**: 定期実行、トリガーベース実行、バッチ処理
- **開発者体験（DX）向上**: 設定ファイル生成、対話的セットアップ、テンプレート機能
- **品質保証**: 静的解析、セキュリティスキャン、依存関係監視
- **データ駆動**: メトリクス収集、ダッシュボード、レポート生成
- **エコシステム拡張**: プラグインシステム、カスタムルール、サードパーティ統合

#### C. 創造的発想（--creative-mode の場合）

既存の枠にとらわれず、以下のような実験的アイデアも提案してください：

- 業界のトレンド技術（AI/ML、WebAssembly、エッジコンピューティング等）の活用
- 他業界のベストプラクティスの適用
- ユーザーコミュニティからのフィードバックの反映
- 未来を見据えた長期的な戦略提案

### ステップ3: 出力形式

各提案について、以下の JSON 形式で出力してください：

```json
[
  {
    "type": "improvement|integration|automation|dx|quality|ecosystem",
    "title": "提案タイトル（50〜100文字）",
    "description": "提案の詳細説明（100文字以上）",
    "rationale": "なぜこの提案が有用か（50文字以上）",
    "implementation_hints": ["実装のヒント1", "実装のヒント2"],
    "expected_impact": "low|medium|high",
    "effort_estimate": "small|medium|large",
    "related_files": ["src/path/to/file1.ts", "src/path/to/file2.ts"]
  }
]
```

## 出力例

```json
[
  {
    "type": "integration",
    "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知",
    "description": "AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示。",
    "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。",
    "implementation_hints": [
      "Slack Incoming Webhook を使用",
      "EvaluationPhase.run() 完了後に通知処理を追加",
      "環境変数 SLACK_WEBHOOK_URL で設定"
    ],
    "expected_impact": "medium",
    "effort_estimate": "small",
    "related_files": [
      "src/phases/evaluation.ts",
      "src/core/notification-manager.ts"
    ]
  },
  {
    "type": "dx",
    "title": "対話的セットアップウィザードの実装",
    "description": "初回実行時に対話的セットアップウィザードを表示し、環境変数の設定、GitHub 認証、エージェント選択を GUI で完了できる機能。設定内容は .env ファイルに自動保存。",
    "rationale": "新規ユーザーがドキュメントを読まずに即座に利用開始できる。環境変数の設定ミスを防ぎ、オンボーディング時間を短縮。",
    "implementation_hints": [
      "inquirer.js ライブラリを使用",
      "ai-workflow init コマンド拡張",
      ".env.example をテンプレートとして使用"
    ],
    "expected_impact": "high",
    "effort_estimate": "medium",
    "related_files": [
      "src/commands/init.ts",
      "src/utils/interactive-setup.ts"
    ]
  }
]
```

## 注意事項

- 最低3件以上の提案を生成してください
- 各提案は具体的で実現可能性のあるものにしてください
- リポジトリの特性を踏まえた提案にしてください
- JSON 形式で出力してください（他のテキストは含めない）

---

リポジトリパス: {repository_path}
出力ファイルパス: {output_file_path}
創造的モード: {creative_mode}
```

---

**要件定義書の作成日**: 2025-01-30
**次のフェーズ**: Phase 2 (Design) - アーキテクチャ設計とモジュール詳細設計
