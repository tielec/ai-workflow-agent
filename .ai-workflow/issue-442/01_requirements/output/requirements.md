# 要件定義書: Issue #442

## pr-comment execute コマンドでエージェントログをファイルに保存すべき

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Documentに基づき、以下の開発戦略が策定されています：

| 項目 | 決定事項 |
|------|---------|
| **複雑度** | 簡単 |
| **見積もり工数** | 3〜5時間 |
| **実装戦略** | EXTEND（既存クラスの拡張） |
| **テスト戦略** | UNIT_ONLY（ユニットテストのみ） |
| **テストコード戦略** | EXTEND_TEST（既存テストファイルを拡張） |
| **リスク評価** | 低 |

### スコープ

- **対象ファイル**: `src/core/pr-comment/comment-analyzer.ts`
- **テストファイル**: `tests/unit/pr-comment/comment-analyzer.test.ts`
- **参考実装**: `src/commands/pr-comment/analyze.ts` の `persistAgentLog()` 関数

### リスク

1. LogFormatter の出力フォーマットの不一致（低確率・低影響）
2. テストのモック設定の複雑化（中確率・中影響）
3. パフォーマンスへの影響（低確率・低影響）
4. 既存テストの破損（低確率・中影響）

---

## 1. 概要

### 1.1 背景

`pr-comment execute` コマンドは、PRレビューコメントを分析し、適切な対応（コード変更、返信、ディスカッション、スキップ）を実行するコマンドです。このコマンドは内部で `ReviewCommentAnalyzer` クラスを使用してエージェント（Codex Agent または Claude Agent）を実行し、コメントの分析を行います。

現状では、エージェント実行結果は `analysis-{comment_id}.json` として保存されますが、エージェントの実行ログ（どのようなツールを使用したか、実行時間、エラー情報など）は保存されていません。

### 1.2 目的

エージェント実行ログをファイルに保存することで、以下を実現します：

1. **デバッグ効率向上**: エージェントが何を実行したか、どのツールを使用したかを確認可能にする
2. **エラー調査**: エージェント実行時のエラーやタイムアウトの原因を特定可能にする
3. **トレーサビリティ**: コメント対応の完全な実行履歴を記録する
4. **一貫性**: `ai-workflow execute` や `pr-comment analyze` コマンドと同様のログ保存方式を適用する

### 1.3 ビジネス価値

| 価値カテゴリ | 説明 |
|-------------|------|
| **運用効率** | トラブルシューティング時間の短縮 |
| **品質向上** | 問題発生時の原因特定が容易になり、修正精度が向上 |
| **透明性** | AI エージェントの動作を可視化し、信頼性を担保 |
| **一貫性** | 他のコマンドと同様のログ出力により、運用ルールの統一 |

### 1.4 技術的価値

| 価値カテゴリ | 説明 |
|-------------|------|
| **保守性** | 既存の `LogFormatter` クラスを再利用し、コードの重複を防止 |
| **拡張性** | 将来的なログ分析機能の基盤を構築 |
| **テスト容易性** | ログ出力によりエージェント動作の検証が可能 |

---

## 2. 機能要件

### FR-001: エージェント実行成功時のログ保存

**優先度**: 高

**説明**: `ReviewCommentAnalyzer.runAgent()` メソッドでエージェントが正常に実行完了した場合、実行ログを Markdown ファイルとして保存する。

**詳細**:
- エージェント実行結果（messages 配列）を `LogFormatter.formatAgentLog()` で整形する
- 保存先: `.ai-workflow/pr-{NUM}/execute/agent_log_comment_{commentId}.md`
- 保存内容:
  - エージェント名（Codex Agent または Claude Agent）
  - 実行開始時刻・終了時刻
  - 実行時間（duration）
  - 実行ログ（messages）
- ログ保存処理の失敗がコメント分析処理全体を中断しないこと

### FR-002: エージェント実行失敗時のログ保存

**優先度**: 高

**説明**: `ReviewCommentAnalyzer.runAgent()` メソッドでエージェント実行がエラーで失敗した場合も、エラー情報を含むログを Markdown ファイルとして保存する。

**詳細**:
- catch 句内でエラー情報を含むログを保存する
- 保存先: `.ai-workflow/pr-{NUM}/execute/agent_log_comment_{commentId}.md`（成功時と同じパス）
- 保存内容:
  - エージェント名
  - 実行開始時刻・終了時刻
  - 実行時間
  - エラー情報（Error オブジェクト）
  - 実行ログ（エラー発生前に取得できた messages があれば含める）

### FR-003: ログファイルのフォーマット

**優先度**: 高

**説明**: 保存されるログファイルは `LogFormatter.formatAgentLog()` が出力する Markdown フォーマットに準拠する。

**詳細**:
- `pr-comment analyze` コマンドが出力する `agent_log.md` と同じフォーマット
- Codex Agent の場合:
  - イベントタイプ別の出力（thread.started, item.started, item.completed など）
  - ターン番号、ステータス、終了コード、コマンド出力
- Claude Agent の場合:
  - メッセージタイプ別の出力（system, assistant, result）
  - 思考過程、ツール使用、パラメータ
- 長い出力は 4000 文字で切り詰め

### FR-004: コメントID の識別

**優先度**: 中

**説明**: 各コメント分析のログファイルは、コメントIDで一意に識別できる命名規則を使用する。

**詳細**:
- ファイル名パターン: `agent_log_comment_{commentId}.md`
- `commentId` は GitHub PR コメントの ID（整数値）
- 複数コメント処理時も、個別のログファイルとして保存（統合しない）

### FR-005: LogFormatter インスタンスの初期化

**優先度**: 中

**説明**: `ReviewCommentAnalyzer` クラスのコンストラクタで `LogFormatter` インスタンスを初期化する。

**詳細**:
- `LogFormatter` を `../../phases/formatters/log-formatter.js` からインポート
- コンストラクタ内で `this.logFormatter = new LogFormatter()` を実行
- クラスのプライベートプロパティとして保持

### FR-006: runAgent() メソッドのシグネチャ変更

**優先度**: 中

**説明**: `runAgent()` メソッドに `commentId` パラメータを追加し、ログファイル名の生成に使用する。

**詳細**:
- 変更前: `runAgent(agent, prompt, repoPath)`
- 変更後: `runAgent(agent, prompt, repoPath, commentId)`
- `analyze()` メソッドからの呼び出し箇所も修正

---

## 3. 非機能要件

### NFR-001: パフォーマンス

**優先度**: 中

| 要件 | 基準 |
|------|------|
| ログ保存処理時間 | 1 コメントあたり 100ms 以下 |
| ファイルサイズ | 1 ログファイルあたり 1MB 以下（通常は数 KB） |

**根拠**: 既存の `pr-comment analyze` コマンドで同等の処理が問題なく動作している。

### NFR-002: 信頼性

**優先度**: 高

| 要件 | 基準 |
|------|------|
| ログ保存失敗時の挙動 | コメント分析処理は継続（ログ保存失敗は警告ログのみ） |
| エラーハンドリング | try-catch でログ保存処理を囲み、例外を握りつぶす |

**根拠**: ログ保存は補助機能であり、メイン処理（コメント分析）を阻害すべきではない。

### NFR-003: 保守性

**優先度**: 中

| 要件 | 基準 |
|------|------|
| コード重複 | 既存の `LogFormatter` クラスを再利用し、新規フォーマッタを作成しない |
| コーディング規約 | プロジェクトの既存コードパターンに準拠 |
| JSDoc | 変更メソッドの JSDoc コメントを更新 |

### NFR-004: テスト容易性

**優先度**: 中

| 要件 | 基準 |
|------|------|
| モック可能性 | `fs.writeFile` のモックによりファイル書き込みをテスト可能 |
| テストカバレッジ | 追加コードの 80% 以上をユニットテストでカバー |

---

## 4. 制約事項

### 4.1 技術的制約

| 制約 | 説明 |
|------|------|
| TypeScript | プロジェクト言語。型安全性を維持すること |
| Node.js fs/promises | ファイル操作は `fs/promises` モジュールを使用 |
| LogFormatter | 既存の `LogFormatter` クラスを使用。独自フォーマッタは作成しない |
| 非同期処理 | `async/await` パターンを使用 |

### 4.2 既存システムとの整合性

| 制約 | 説明 |
|------|------|
| 出力ディレクトリ構造 | `.ai-workflow/pr-{NUM}/execute/` 配下に保存 |
| 既存ファイルとの共存 | `analysis-{id}.json` と同じディレクトリに保存 |
| LogFormatter API | `formatAgentLog(messages, startTime, endTime, duration, error, agentName)` を使用 |

### 4.3 リソース制約

| 制約 | 説明 |
|------|------|
| 工数 | Planning Phase の見積もり 3〜5 時間以内 |
| 変更範囲 | 1 ファイル（+ テストファイル）に限定 |

### 4.4 ポリシー制約

| 制約 | 説明 |
|------|------|
| コーディング規約 | CLAUDE.md に準拠 |
| テスト方針 | 実装前にテストシナリオを定義（TDD 志向） |
| エラーハンドリング | `getErrorMessage()` ヘルパーを使用してエラーメッセージを取得 |

---

## 5. 前提条件

### 5.1 システム環境

| 前提 | 説明 |
|------|------|
| Node.js | v18.x 以上 |
| TypeScript | プロジェクト設定に従う |
| ファイルシステム | 書き込み権限あり |

### 5.2 依存コンポーネント

| コンポーネント | 説明 | 場所 |
|---------------|------|------|
| LogFormatter | ログ整形クラス | `src/phases/formatters/log-formatter.ts` |
| ReviewCommentAnalyzer | コメント分析クラス（変更対象） | `src/core/pr-comment/comment-analyzer.ts` |
| CodexAgentClient | Codex エージェントクライアント | `src/core/codex-agent-client.ts` |
| ClaudeAgentClient | Claude エージェントクライアント | `src/core/claude-agent-client.ts` |

### 5.3 外部システム連携

| 連携先 | 説明 |
|--------|------|
| ファイルシステム | ログファイルの書き込み先 |

**注**: GitHub API との連携は本機能では発生しない（ログ保存はローカルファイルのみ）。

---

## 6. 受け入れ基準

### AC-001: エージェント実行成功時のログ保存

**対応する機能要件**: FR-001

```gherkin
Given ReviewCommentAnalyzer が初期化されている
  And outputDir が ".ai-workflow/pr-123/execute" に設定されている
When runAgent() が Codex Agent で実行され、正常に完了する
  And コメントID が 456 である
Then ".ai-workflow/pr-123/execute/agent_log_comment_456.md" にログファイルが作成される
  And ログファイルに "Codex Agent" というエージェント名が含まれる
  And ログファイルに実行開始時刻と終了時刻が含まれる
  And ログファイルに実行時間（duration）が含まれる
  And ログファイルにエージェント実行ログ（messages）が含まれる
```

### AC-002: エージェント実行失敗時のログ保存

**対応する機能要件**: FR-002

```gherkin
Given ReviewCommentAnalyzer が初期化されている
  And outputDir が ".ai-workflow/pr-123/execute" に設定されている
When runAgent() が Claude Agent で実行され、エラーが発生する
  And コメントID が 789 である
  And エラーメッセージが "Agent execution timeout" である
Then ".ai-workflow/pr-123/execute/agent_log_comment_789.md" にログファイルが作成される
  And ログファイルに "Claude Agent" というエージェント名が含まれる
  And ログファイルにエラー情報 "Agent execution timeout" が含まれる
  And runAgent() は null を返す（既存動作を維持）
```

### AC-003: ログ保存失敗時の挙動

**対応する機能要件**: FR-001, FR-002 / NFR-002

```gherkin
Given ReviewCommentAnalyzer が初期化されている
  And ログ保存先ディレクトリへの書き込み権限がない
When runAgent() が実行され、正常に完了する
  And ログ保存処理が失敗する
Then 警告ログ "Failed to save agent log: ..." が出力される
  And runAgent() は正常な結果を返す（分析処理は継続）
  And コメント分析全体は正常に完了する
```

### AC-004: ログファイルのフォーマット確認

**対応する機能要件**: FR-003

```gherkin
Given ReviewCommentAnalyzer が初期化されている
When runAgent() が Codex Agent で実行され、正常に完了する
Then 保存されたログファイルは Markdown 形式である
  And LogFormatter.formatAgentLog() が生成したフォーマットと一致する
  And ログファイルに適切なセクション見出しが含まれる
```

### AC-005: 複数コメント処理時のログ分離

**対応する機能要件**: FR-004

```gherkin
Given ReviewCommentAnalyzer が初期化されている
  And 3 つのコメント（ID: 100, 200, 300）を処理する
When analyze() が各コメントに対して実行される
Then 以下の 3 つのログファイルが作成される:
  - agent_log_comment_100.md
  - agent_log_comment_200.md
  - agent_log_comment_300.md
  And 各ログファイルは対応するコメントの分析結果のみを含む
```

### AC-006: LogFormatter インスタンスの初期化確認

**対応する機能要件**: FR-005

```gherkin
Given ReviewCommentAnalyzer クラスのコンストラクタが実行される
When インスタンスが生成される
Then this.logFormatter が LogFormatter のインスタンスである
  And this.logFormatter.formatAgentLog() が呼び出し可能である
```

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

| 項目 | 理由 |
|------|------|
| 統合ログファイル | 各コメントのログを 1 ファイルに統合する機能は、Issue の提案オプションに含まれるが、初期実装では個別ファイルのみとする |
| ログのローテーション | 古いログファイルの自動削除は対象外 |
| ログの圧縮 | ファイルサイズが小さいため、圧縮は不要 |
| リモートログ保存 | クラウドストレージへのログ転送は対象外 |
| ログの暗号化 | 機密情報を含まないため、暗号化は不要 |
| `pr-comment execute` コマンド自体のログ | 既存の `persistExecuteLog()` で処理されており、本 Issue の対象外 |

### 7.2 将来的な拡張候補

| 項目 | 説明 |
|------|------|
| 統合ログファイル | `agent_log.md` に全コメントのログを統合する機能（Issue 提案の代替案） |
| ログ分析ダッシュボード | エージェント実行ログを可視化する Web UI |
| ログベースのメトリクス収集 | 実行時間、エラー率などの統計情報収集 |
| ログレベル設定 | 詳細度を調整可能にする（verbose / normal / minimal） |

---

## 8. 用語集

| 用語 | 説明 |
|------|------|
| ReviewCommentAnalyzer | PRレビューコメントを分析するクラス。エージェントを使用してコメントの種類と対応方法を判定する |
| LogFormatter | エージェント実行ログを Markdown 形式に整形するクラス |
| Codex Agent | OpenAI の Codex モデルを使用するエージェントクライアント |
| Claude Agent | Anthropic の Claude モデルを使用するエージェントクライアント |
| commentId | GitHub PR コメントの一意識別子（整数値） |
| outputDir | ログファイルの出力先ディレクトリ |
| messages | エージェント実行結果のメッセージ配列 |

---

## 9. 関連ドキュメント

| ドキュメント | 説明 |
|-------------|------|
| Planning Document | `.ai-workflow/issue-442/00_planning/output/planning.md` |
| GitHub Issue #442 | 本要件の元となる Issue |
| GitHub Issue #441 | pr-comment analyze コマンドの agent_log.md フォーマット問題（関連） |
| GitHub Issue #23 | BasePhase アーキテクチャ分割（LogFormatter の導入） |

---

## 10. 品質ゲートチェックリスト（Phase 1）

- [x] **機能要件が明確に記載されている**: FR-001 〜 FR-006 として明確化
- [x] **受け入れ基準が定義されている**: AC-001 〜 AC-006 として Given-When-Then 形式で定義
- [x] **スコープが明確である**: セクション 7 でスコープ外を明記
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準が一対一で対応

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | - | 初版作成 |
