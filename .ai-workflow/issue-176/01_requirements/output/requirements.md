# 要件定義書

## Issue概要

- **Issue番号**: #176
- **タイトル**: auto-close-issue: Issue検品と自動クローズ機能の実装
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/176
- **状態**: open
- **ラベル**: enhancement

## 0. Planning Documentの確認

Planning Phase（Issue #176）で策定された以下の戦略を踏まえて要件定義を実施します：

### 実装戦略: EXTEND
- 既存の `auto-issue` コマンド（`src/commands/auto-issue.ts`）のアーキテクチャを参考にする
- 既存のエージェント連携インフラ（`AgentExecutor`, `setupAgentClients`, `resolveAgentCredentials`）を再利用
- 既存のGitHub API連携（`src/core/github/issue-client.ts`）を拡張してIssue検品機能を追加

### テスト戦略: UNIT_INTEGRATION
- **ユニットテスト**: CLIオプションパース、カテゴリフィルタリング条件、エージェント出力JSONパース、`confidence`閾値フィルタリング、Issue除外ロジック
- **インテグレーションテスト**: GitHub API連携、エージェント統合、`--dry-run`モード動作確認、エンドツーエンドコマンド実行フロー

### 見積もり工数: 10~14時間
- Phase 1 (要件定義): 1.5~2時間
- Phase 2 (設計): 2~3時間
- Phase 3 (テストシナリオ): 1~1.5時間
- Phase 4 (実装): 3~4時間
- Phase 5 (テストコード実装): 1~1.5時間
- Phase 6 (テスト実行): 0.5~1時間
- Phase 7 (ドキュメント): 0.5~1時間
- Phase 8 (レポート): 0.5~1時間

### リスク評価: 中
- エージェント判定の精度が要件（`confidence`閾値）に依存するため、プロンプト設計の品質が重要
- 既存Issueの誤クローズを防ぐための安全機能（`needs_discussion`, ラベルフィルタ、最近更新除外）が必要
- GitHub APIレート制限（最大100件のIssue取得）に注意が必要

## 1. 概要

### 背景
現在、AI Workflow Agentプロジェクトでは以下の問題が存在する：

1. **FOLLOW-UP Issueの放置**: `auto-issue`コマンド（Issue #121〜#128）で生成されたFOLLOW-UP Issueが、元Issueクローズ後も残り続ける
2. **古いIssueの蓄積**: 対応済みや関連性が低下したIssueがリポジトリに溜まり、管理コストが増加
3. **手動クローズの負担**: Issueの状況確認とクローズ判断を手動で行う必要があり、開発者の時間を消費

### 目的
エージェント（Codex/Claude）ベースのIssue検品機能を実装し、以下を実現する：

1. **自動検品**: 既存Issueの対応状況、重要度、関連性、クローズのリスクを自動分析
2. **安全なクローズ**: 誤クローズを防ぐ多層防御機能（`confidence`閾値、ラベルフィルタ、最近更新除外、dry-run）により、安全にIssueをクローズ
3. **運用効率化**: Issue管理の手動作業を削減し、開発者がコア業務に集中できる環境を提供

### ビジネス価値・技術的価値

**ビジネス価値**:
- Issue管理の運用コストを30%削減（手動レビュー時間の削減）
- FOLLOW-UP Issueの放置率を80%削減（自動クローズにより）
- リポジトリの見通しを改善（古いIssueの整理により）

**技術的価値**:
- エージェント統合パターンの再利用（`auto-issue`コマンドの実績を活用）
- GitHub API連携の拡張（既存の`IssueClient`を活用）
- 多層防御アーキテクチャの確立（誤クローズを防ぐ安全設計）

## 2. 機能要件

### FR-1: CLIコマンドインターフェース
**優先度**: 高

**説明**: `auto-close-issue`コマンドを実装し、以下の基本機能を提供する。

**受け入れ基準**:
- **Given**: リポジトリに未クローズのIssueが存在する
- **When**: `node dist/index.js auto-close-issue --category followup --dry-run`を実行
- **Then**: FOLLOW-UP Issueの検品結果がコンソールに表示される（実際にはクローズされない）

**サブ要件**:
- FR-1.1: コマンド名は `auto-close-issue` とする
- FR-1.2: `--help` オプションで使用方法を表示する
- FR-1.3: 必須環境変数（`GITHUB_TOKEN`, `GITHUB_REPOSITORY`）が未設定の場合、明確なエラーメッセージを表示する

---

### FR-2: カテゴリフィルタリング
**優先度**: 高

**説明**: 4つのカテゴリ（`followup`, `stale`, `old`, `all`）でIssueをフィルタリングする。

**受け入れ基準**:
- **Given**: リポジトリに以下のIssueが存在する
  - Issue #1: タイトル `[FOLLOW-UP] Refactor user service`、作成30日前
  - Issue #2: タイトル `Bug: Login failure`、最終更新100日前
  - Issue #3: タイトル `Feature: Add dashboard`、作成200日前
- **When**: 各カテゴリで検品を実行
- **Then**:
  - `--category followup`: Issue #1のみ対象
  - `--category stale`: Issue #2のみ対象（最終更新90日以上）
  - `--category old`: Issue #3のみ対象（作成180日以上）
  - `--category all`: Issue #1, #2, #3すべて対象

**サブ要件**:
- FR-2.1: `followup` カテゴリはタイトルが `[FOLLOW-UP]` で始まるIssueを対象とする
- FR-2.2: `stale` カテゴリは最終更新から90日以上経過したIssueを対象とする（`--days-threshold`で変更可能）
- FR-2.3: `old` カテゴリは作成から180日以上経過したIssueを対象とする（`--days-threshold`で変更可能）
- FR-2.4: `all` カテゴリは全てのオープンIssueを対象とする
- FR-2.5: デフォルトカテゴリは `followup` とする

---

### FR-3: エージェントベースIssue検品
**優先度**: 高

**説明**: エージェント（Codex/Claude）がIssueを分析し、クローズの可否を判定する。

**受け入れ基準**:
- **Given**: Issue #123（タイトル: `[FOLLOW-UP] Add logging to API endpoints`）が存在し、元Issue #100はクローズ済み、関連ファイル `src/api/endpoints.ts` にログ機能が実装済み
- **When**: エージェント検品を実行
- **Then**:
  - `recommendation: "close"` が返却される
  - `confidence: 0.85` 以上が返却される（高精度）
  - `reasoning` に「元Issueクローズ済み、ログ機能実装済み」が含まれる
  - `close_comment` にクローズ理由が含まれる

**サブ要件**:
- FR-3.1: エージェントに以下の情報を提供する
  - **Issue情報**: タイトル、本文、ラベル、作成日、最終更新日、コメント履歴
  - **関連情報**: 元Issue（FOLLOW-UPの場合）のステータスと内容、関連するPRのステータス
  - **コードベース情報**: Issueで言及されているファイルの存在確認、残タスクに関連するコードの現状
- FR-3.2: エージェントは以下の4つの観点から判断する
  - **対応状況**: 残タスクはコードベースで対応済みか？元Issueの目的は達成されているか？
  - **重要度・緊急度**: 長期間放置されていても重要なIssueか？セキュリティやパフォーマンスに関わるか？
  - **関連性**: 現在の開発方針と整合しているか？他のIssueと重複していないか？
  - **クローズのリスク**: クローズすることで失われる情報はあるか？将来的に再度必要になる可能性はあるか？
- FR-3.3: エージェントの出力は以下のJSON形式とする
  ```json
  {
    "issue_number": 123,
    "recommendation": "close" | "keep" | "needs_discussion",
    "confidence": 0.0-1.0,
    "reasoning": "判定理由の詳細説明",
    "close_comment": "クローズ時に投稿するコメント（推奨の場合）",
    "suggested_actions": ["代替アクションの提案（あれば）"]
  }
  ```
- FR-3.4: エージェント選択は `--agent` オプションで制御する（`auto`, `codex`, `claude`）

---

### FR-4: クローズ判定とフィルタリング
**優先度**: 高

**説明**: エージェントの判定結果を基に、`confidence`閾値でフィルタリングしてクローズ候補を絞り込む。

**受け入れ基準**:
- **Given**: エージェントが3件のIssueを分析し、以下の結果を返却
  - Issue #1: `recommendation: "close"`, `confidence: 0.85`
  - Issue #2: `recommendation: "close"`, `confidence: 0.65`
  - Issue #3: `recommendation: "keep"`, `confidence: 0.80`
- **When**: `--confidence-threshold 0.7` で検品を実行
- **Then**:
  - Issue #1のみがクローズ候補として表示される
  - Issue #2は閾値未満でスキップされる
  - Issue #3は `keep` 推奨でスキップされる

**サブ要件**:
- FR-4.1: `confidence`が閾値未満の場合はクローズ候補から除外する（デフォルト: 0.7）
- FR-4.2: `recommendation: "needs_discussion"` の場合はクローズせず報告のみ行う
- FR-4.3: `--confidence-threshold` オプションで閾値を変更可能（範囲: 0.0-1.0）

---

### FR-5: 安全機能（多層防御）
**優先度**: 高

**説明**: 誤クローズを防ぐための多層防御機能を実装する。

**受け入れ基準**:
- **Given**: 以下のIssueが存在する
  - Issue #1: ラベル `do-not-close` 付き、エージェント推奨 `close`
  - Issue #2: 最終更新3日前、エージェント推奨 `close`
  - Issue #3: ラベル `bug`、最終更新30日前、エージェント推奨 `close`
- **When**: `auto-close-issue` を実行
- **Then**:
  - Issue #1は除外される（`do-not-close`ラベル）
  - Issue #2は除外される（最近更新）
  - Issue #3のみクローズ候補として表示される

**サブ要件**:
- FR-5.1: `do-not-close`, `pinned` ラベルを持つIssueは除外する
- FR-5.2: 最近更新されたIssue（7日以内）は除外する
- FR-5.3: `--exclude-labels` オプションで除外ラベルをカスタマイズ可能（カンマ区切り）
- FR-5.4: `--dry-run` モードをデフォルトで有効にする（`--dry-run=false` で無効化）
- FR-5.5: `--require-approval` オプションで対話的確認を要求可能

---

### FR-6: GitHub API連携
**優先度**: 高

**説明**: GitHub APIを使用してIssue情報を取得し、クローズ処理を実行する。

**受け入れ基準**:
- **Given**: Issue #123がクローズ候補として選択される
- **When**: `--dry-run=false` でクローズを実行
- **Then**:
  - Issue #123がクローズされる
  - エージェントが生成した `close_comment` がコメントとして投稿される
  - `auto-closed` ラベルが付与される
  - クローズ履歴がログに記録される

**サブ要件**:
- FR-6.1: GitHub APIを使用してオープンIssue一覧を取得する（最大100件）
- FR-6.2: Issue詳細情報（コメント履歴を含む）を取得する
- FR-6.3: 関連PR情報を取得する（Phase 2で実装予定）
- FR-6.4: Issueをクローズする（`state: "closed"` に変更）
- FR-6.5: クローズ理由をコメントとして投稿する
- FR-6.6: `auto-closed` ラベルを付与する
- FR-6.7: 既存の `IssueClient` (`src/core/github/issue-client.ts`) を拡張して実装する

---

### FR-7: CLIオプション
**優先度**: 高

**説明**: 柔軟な運用を可能にするCLIオプションを提供する。

**受け入れ基準**:
- **Given**: `auto-close-issue` コマンドが実装されている
- **When**: `--help` オプションを実行
- **Then**: 以下のオプションが表示される
  - `--category <type>`: フィルタカテゴリ（followup|stale|old|all）
  - `--limit <number>`: 処理するIssue上限（1-50）
  - `--dry-run`: 実際にはクローズせず候補のみ表示
  - `--confidence-threshold <n>`: クローズ判定の信頼度閾値（0.0-1.0）
  - `--days-threshold <n>`: stale/old判定の日数閾値
  - `--require-approval`: 対話的確認を要求
  - `--exclude-labels <labels>`: 除外するラベル（カンマ区切り）
  - `--agent <type>`: 使用エージェント（auto|codex|claude）

**サブ要件**:
- FR-7.1: デフォルト値
  - `--category`: `followup`
  - `--limit`: `10`
  - `--dry-run`: `true`
  - `--confidence-threshold`: `0.7`
  - `--days-threshold`: `90`
  - `--agent`: `auto`
- FR-7.2: バリデーション
  - `--limit`: 1-50の範囲内
  - `--confidence-threshold`: 0.0-1.0の範囲内
  - `--days-threshold`: 正の整数
  - `--category`: `followup`, `stale`, `old`, `all` のいずれか
  - `--agent`: `auto`, `codex`, `claude` のいずれか

---

### FR-8: プロンプト設計
**優先度**: 高

**説明**: エージェントに対する検品プロンプトを設計し、高精度な判定を実現する。

**受け入れ基準**:
- **Given**: プロンプトテンプレート `src/prompts/auto-close/inspect-issue.txt` が作成されている
- **When**: エージェントがプロンプトを実行
- **Then**:
  - 4つの判定観点（対応状況、重要度・緊急度、関連性、クローズのリスク）が明示されている
  - JSON形式の出力例が詳細に記載されている
  - `confidence`スコアの算出方法が説明されている
  - 重要なIssueは `keep` を推奨するよう指示されている
  - 判断が難しい場合は `needs_discussion` を選択するよう指示されている

**サブ要件**:
- FR-8.1: プロンプトには以下を含める
  - **コンテキスト**: Issue情報、関連情報、コードベース状態
  - **判定基準**: 4つの観点を明示
  - **出力形式**: JSON形式で構造化出力を要求
  - **制約事項**: 重要なIssueは `keep`、判断困難は `needs_discussion`、`close` 推奨時は詳細な理由を提供
- FR-8.2: 変数プレースホルダー（`{issue_info}`, `{related_info}`, `{codebase_info}`）を使用する

---

### FR-9: レート制限対策
**優先度**: 中

**説明**: GitHub APIレート制限に対応し、大量のIssue処理時もエラーを防ぐ。

**受け入れ基準**:
- **Given**: リポジトリに200件のオープンIssueが存在する
- **When**: `--limit 50` で検品を実行
- **Then**:
  - 最大50件のIssueのみ処理される
  - GitHub APIレート制限エラーが発生しない
  - 処理進捗がログに表示される（例: "Processing 10/50 issues..."）

**サブ要件**:
- FR-9.1: `--limit` オプションでバッチサイズを制限する（デフォルト: 10、最大: 50）
- FR-9.2: レート制限エラーをハンドリングし、適切なエラーメッセージを表示する
- FR-9.3: 処理進捗をログに表示する（例: "Processing 5/100 issues..."）

---

### FR-10: ログ記録
**優先度**: 中

**説明**: クローズ履歴を記録し、監査・トラブルシューティングを可能にする。

**受け入れ基準**:
- **Given**: Issue #123がクローズされる
- **When**: クローズ処理が完了
- **Then**:
  - 以下の情報がログファイルに記録される
    - Issue番号、タイトル
    - クローズ日時
    - エージェント判定結果（`recommendation`, `confidence`, `reasoning`）
    - クローズコメントの内容

**サブ要件**:
- FR-10.1: クローズ履歴を `.ai-workflow/auto-close/history.log` に記録する
- FR-10.2: ログ形式はJSON Lines形式とする
- FR-10.3: ログには以下を含める
  - `timestamp`: クローズ日時
  - `issue_number`: Issue番号
  - `issue_title`: Issueタイトル
  - `category`: 検品カテゴリ
  - `recommendation`: エージェント推奨
  - `confidence`: 信頼度スコア
  - `reasoning`: 判定理由
  - `close_comment`: クローズコメント

## 3. 非機能要件

### NFR-1: パフォーマンス要件
**優先度**: 中

- **NFR-1.1**: 100件のIssue処理を5分以内に完了する
- **NFR-1.2**: エージェント呼び出しのタイムアウトは60秒とする
- **NFR-1.3**: GitHub API呼び出しのタイムアウトは30秒とする

---

### NFR-2: セキュリティ要件
**優先度**: 高

- **NFR-2.1**: `GITHUB_TOKEN` は環境変数から取得し、ログに出力しない
- **NFR-2.2**: エージェントAPIキー（`CODEX_API_KEY`, `OPENAI_API_KEY`）は環境変数から取得し、ログに出力しない
- **NFR-2.3**: エージェントに送信する情報にシークレット（APIキー、トークン、パスワード）が含まれないよう、SecretMaskerを統合する

---

### NFR-3: 可用性・信頼性要件
**優先度**: 中

- **NFR-3.1**: エージェント呼び出し失敗時は、該当Issueをスキップして次のIssueを処理する（全体処理は継続）
- **NFR-3.2**: GitHub API呼び出し失敗時は、明確なエラーメッセージを表示して処理を中断する
- **NFR-3.3**: JSON parse エラー時は、該当Issueをスキップして警告ログを出力する

---

### NFR-4: 保守性・拡張性要件
**優先度**: 中

- **NFR-4.1**: 既存の `auto-issue` コマンドのアーキテクチャパターンを踏襲する
- **NFR-4.2**: `IssueInspector` クラスは単一責任原則（SRP）に従い、Issue検品ロジックのみを担当する
- **NFR-4.3**: プロンプトテンプレート（`src/prompts/auto-close/inspect-issue.txt`）は外部ファイルとして管理し、コード変更なしで修正可能にする
- **NFR-4.4**: Phase 2（精度向上）、Phase 3（運用機能）への拡張を考慮した設計とする

---

### NFR-5: テスト容易性要件
**優先度**: 高

- **NFR-5.1**: ユニットテストカバレッジ80%以上を達成する
- **NFR-5.2**: エージェント呼び出し部分はモック可能な設計とする
- **NFR-5.3**: GitHub API呼び出し部分はモック可能な設計とする

## 4. 制約事項

### TC-1: 技術的制約

- **TC-1.1**: TypeScript 5.x を使用する
- **TC-1.2**: Node.js 20.x 以上を前提とする
- **TC-1.3**: 既存の `src/commands/auto-issue.ts` のパターンを踏襲する
- **TC-1.4**: 既存の `src/core/github/issue-client.ts` を拡張する（破壊的変更は不可）
- **TC-1.5**: 既存のエージェント連携インフラ（`AgentExecutor`, `setupAgentClients`, `resolveAgentCredentials`）を再利用する

---

### TC-2: GitHub API制約

- **TC-2.1**: GitHub API レート制限（認証済み: 5000リクエスト/時）を考慮する
- **TC-2.2**: Issue一覧取得は最大100件とする（`per_page=100`）
- **TC-2.3**: コメント履歴取得はIssueごとに1回のAPI呼び出しとする

---

### TC-3: エージェント制約

- **TC-3.1**: Codex APIのタイムアウトは60秒とする
- **TC-3.2**: Claude Agent SDKのタイムアウトは60秒とする
- **TC-3.3**: エージェント出力は必ずJSON形式とする（パースエラー時はスキップ）

---

### TC-4: リソース制約

- **TC-4.1**: 見積もり工数: 10~14時間（Planning Documentに基づく）
- **TC-4.2**: Phase 1（MVP）のみを実装対象とする（Phase 2, 3は別Issue）

---

### TC-5: ポリシー制約

- **TC-5.1**: CLAUDE.mdのコーディング規約に従う
  - ロギングは `src/utils/logger.ts` の統一loggerモジュールを使用
  - 環境変数アクセスは `src/core/config.ts` のConfig クラスを使用
  - エラーハンドリングは `src/utils/error-utils.ts` を使用
- **TC-5.2**: ESLintエラーを残さない
- **TC-5.3**: TypeScriptコンパイルエラーを残さない

## 5. 前提条件

### PC-1: システム環境

- **PC-1.1**: Node.js 20.x 以上がインストールされている
- **PC-1.2**: npm 10.x 以上がインストールされている
- **PC-1.3**: Git 2.x 以上がインストールされている

---

### PC-2: 環境変数

- **PC-2.1**: `GITHUB_TOKEN` が設定されている（repo, workflow, read:org スコープ）
- **PC-2.2**: `GITHUB_REPOSITORY` が設定されている（`owner/repo` 形式）
- **PC-2.3**: `CODEX_API_KEY` または `OPENAI_API_KEY` が設定されている（Codex使用時）
- **PC-2.4**: `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている（Claude使用時）

---

### PC-3: 依存コンポーネント

- **PC-3.1**: 既存の `src/core/github/issue-client.ts` が正常に動作している
- **PC-3.2**: 既存の `src/commands/execute/agent-setup.ts` が正常に動作している
- **PC-3.3**: 既存の `src/core/config.ts` が正常に動作している
- **PC-3.4**: 既存の `src/utils/logger.ts` が正常に動作している
- **PC-3.5**: 既存の `src/utils/error-utils.ts` が正常に動作している

---

### PC-4: 外部システム連携

- **PC-4.1**: GitHub APIが利用可能である
- **PC-4.2**: Codex API（OpenAI API）が利用可能である
- **PC-4.3**: Claude Code API（Anthropic API）が利用可能である

## 6. 受け入れ基準

### AC-1: コマンド実行（基本機能）

**Given**: リポジトリに以下のIssueが存在する
- Issue #100: タイトル `[FOLLOW-UP] Add logging to API endpoints`、最終更新30日前、元Issue #50はクローズ済み、関連ファイル `src/api/endpoints.ts` にログ機能実装済み

**When**: 以下のコマンドを実行
```bash
node dist/index.js auto-close-issue --category followup --dry-run
```

**Then**:
- Issue #100が検品対象として表示される
- エージェント判定結果が表示される（`recommendation: "close"`, `confidence: 0.85`, `reasoning: "元Issueクローズ済み、ログ機能実装済み"`）
- 実際にはクローズされない（`--dry-run` モード）

---

### AC-2: カテゴリフィルタリング

**Given**: リポジトリに以下のIssueが存在する
- Issue #1: タイトル `[FOLLOW-UP] Refactor user service`、作成30日前
- Issue #2: タイトル `Bug: Login failure`、最終更新100日前
- Issue #3: タイトル `Feature: Add dashboard`、作成200日前

**When**: 各カテゴリで検品を実行

**Then**:
- `--category followup`: Issue #1のみ対象
- `--category stale`: Issue #2のみ対象（最終更新90日以上）
- `--category old`: Issue #3のみ対象（作成180日以上）
- `--category all`: Issue #1, #2, #3すべて対象

---

### AC-3: エージェント判定

**Given**: Issue #123（タイトル: `[FOLLOW-UP] Add logging to API endpoints`）が存在し、元Issue #100はクローズ済み、関連ファイル `src/api/endpoints.ts` にログ機能が実装済み

**When**: エージェント検品を実行

**Then**:
- `recommendation: "close"` が返却される
- `confidence: 0.85` 以上が返却される
- `reasoning` に「元Issueクローズ済み、ログ機能実装済み」が含まれる
- `close_comment` にクローズ理由が含まれる

---

### AC-4: Confidence閾値フィルタリング

**Given**: エージェントが3件のIssueを分析し、以下の結果を返却
- Issue #1: `recommendation: "close"`, `confidence: 0.85`
- Issue #2: `recommendation: "close"`, `confidence: 0.65`
- Issue #3: `recommendation: "keep"`, `confidence: 0.80`

**When**: `--confidence-threshold 0.7` で検品を実行

**Then**:
- Issue #1のみがクローズ候補として表示される
- Issue #2は閾値未満でスキップされる
- Issue #3は `keep` 推奨でスキップされる

---

### AC-5: 安全機能（ラベルフィルタ）

**Given**: 以下のIssueが存在する
- Issue #1: ラベル `do-not-close` 付き、エージェント推奨 `close`
- Issue #2: ラベル `pinned` 付き、エージェント推奨 `close`
- Issue #3: ラベル `bug`、エージェント推奨 `close`

**When**: `auto-close-issue` を実行

**Then**:
- Issue #1は除外される（`do-not-close`ラベル）
- Issue #2は除外される（`pinned`ラベル）
- Issue #3のみクローズ候補として表示される

---

### AC-6: 安全機能（最近更新除外）

**Given**: 以下のIssueが存在する
- Issue #1: 最終更新3日前、エージェント推奨 `close`
- Issue #2: 最終更新30日前、エージェント推奨 `close`

**When**: `auto-close-issue` を実行

**Then**:
- Issue #1は除外される（最近更新）
- Issue #2のみクローズ候補として表示される

---

### AC-7: 実際のクローズ処理

**Given**: Issue #123がクローズ候補として選択される

**When**: `--dry-run=false` でクローズを実行

**Then**:
- Issue #123がクローズされる（`state: "closed"`）
- エージェントが生成した `close_comment` がコメントとして投稿される
- `auto-closed` ラベルが付与される
- クローズ履歴が `.ai-workflow/auto-close/history.log` に記録される

---

### AC-8: エージェントフォールバック

**Given**: Codex APIキーが設定されているが、Codex API呼び出しが失敗する

**When**: `--agent auto` で検品を実行

**Then**:
- Codex API呼び出し失敗が検出される
- 自動的にClaude Agentにフォールバックする
- 検品処理が継続される

---

### AC-9: レート制限対策

**Given**: リポジトリに200件のオープンIssueが存在する

**When**: `--limit 50` で検品を実行

**Then**:
- 最大50件のIssueのみ処理される
- GitHub APIレート制限エラーが発生しない
- 処理進捗がログに表示される（例: "Processing 10/50 issues..."）

---

### AC-10: CLIオプションバリデーション

**Given**: `auto-close-issue` コマンドが実装されている

**When**: 以下の無効なオプションを指定して実行
```bash
node dist/index.js auto-close-issue --limit 100
```

**Then**:
- エラーメッセージが表示される（"--limit must be between 1 and 50"）
- 処理は実行されない

## 7. スコープ外

以下の機能は本Issue（#176 Phase 1 MVP）のスコープ外とし、Phase 2以降で実装する：

### SO-1: Phase 2（精度向上）

- **SO-1.1**: コードベース分析の強化（関連ファイルの差分確認）
- **SO-1.2**: 関連PR情報の取得と分析
- **SO-1.3**: コメント履歴の分析
- **SO-1.4**: 重複Issue検出との統合

---

### SO-2: Phase 3（運用機能）

- **SO-2.1**: 定期実行スケジューラ（GitHub Actions連携）
- **SO-2.2**: レポート生成機能
- **SO-2.3**: Slack/Teams通知連携

---

### SO-3: その他

- **SO-3.1**: Issue再オープン機能（誤クローズ時の復旧）
- **SO-3.2**: クローズ履歴のWeb UI表示
- **SO-3.3**: 機械学習モデルによる判定精度向上
- **SO-3.4**: マルチリポジトリ対応（現在のリポジトリのみ対象）

## 8. 成果物

以下の成果物を本要件定義書に基づいて作成する：

### 成果物一覧

1. **新規作成ファイル**
   - `src/commands/auto-close-issue.ts` - CLIコマンドハンドラ
   - `src/core/issue-inspector.ts` - Issue検品ロジック
   - `src/prompts/auto-close/inspect-issue.txt` - エージェント用プロンプトテンプレート
   - `src/types/auto-close-issue.ts` - CLIオプション型定義、エージェント出力型定義

2. **拡張ファイル**
   - `src/core/github/issue-client.ts` - Issue情報取得メソッド追加（コメント履歴、関連PR情報を含む）
   - `src/main.ts` - 新規コマンド `auto-close-issue` の追加

3. **テストファイル**
   - `tests/unit/commands/auto-close-issue.test.ts` - CLIオプションパース、フィルタリングロジックのユニットテスト
   - `tests/unit/core/issue-inspector.test.ts` - Issue検品ロジック、エージェント出力パースのユニットテスト
   - `tests/integration/auto-close-issue.test.ts` - エンドツーエンドの統合テスト

4. **ドキュメント**
   - `README.md` - `auto-close-issue` コマンドの説明追加
   - `CLAUDE.md` - `auto-close-issue` コマンドの概要追加

## 9. 品質ゲート確認

本要件定義書は以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: FR-1〜FR-10で10個の機能要件を定義し、各要件に説明、受け入れ基準、サブ要件を記載
- ✅ **受け入れ基準が定義されている**: AC-1〜AC-10で10個の受け入れ基準をGiven-When-Then形式で記載
- ✅ **スコープが明確である**: 第7章「スコープ外」でPhase 2, 3の機能を明示的に除外
- ✅ **論理的な矛盾がない**: 各セクション間で整合性を確認済み（機能要件と受け入れ基準が対応、非機能要件と制約事項が矛盾しない）

## 10. 参考情報

### 関連ドキュメント

- `CLAUDE.md` - プロジェクトの全体方針とコーディングガイドライン
- `ARCHITECTURE.md` - アーキテクチャ設計思想
- `README.md` - プロジェクト概要と使用方法

### 関連ファイル

- `src/commands/auto-issue.ts` - 参考実装（CLIコマンドハンドラのパターン）
- `src/core/repository-analyzer.ts` - 参考実装（エージェント分析のパターン）
- `src/core/issue-generator.ts` - 参考実装（Issue生成のパターン）
- `src/core/github/issue-client.ts` - 拡張対象（Issue情報取得、クローズ、コメント投稿）

### 関連Issue

- Issue #121: auto-issue コマンド基盤
- Issue #174: FOLLOW-UP Issue生成をエージェントベースに拡張

---

**作成日**: 2025-01-30
**バージョン**: 1.0
**ステータス**: 承認待ち
