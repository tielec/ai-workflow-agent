# 要件定義書 - Issue #174

**Issue番号**: #174
**タイトル**: FOLLOW-UP Issue生成をエージェントベースに拡張する
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 0. Planning Documentの確認

Planning Document（@.ai-workflow/issue-174/00_planning/output/planning.md）を確認し、以下の開発戦略を踏まえて要件定義を実施します：

### 開発戦略の概要

- **実装戦略**: EXTEND（既存の `IssueClient` クラスに新規メソッド追加、新規クラス `IssueAgentGenerator` を作成）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **見積もり工数**: 12〜18時間（Phase 1〜8の合計）
- **複雑度**: 中程度
- **リスク評価**: 中（エージェント実行の不安定性、プロンプト品質、既存機能との互換性）

### 主要な技術的判断

1. **既存機能との共存**: `IssueAIGenerator`（LLM APIベース）は互換性維持のため残し、フォールバック先として使用
2. **auto-issue機能の設計パターン再利用**: ファイルベース出力方式、エージェント選択ロジックを踏襲
3. **フォールバック機構**: エージェント失敗時 → `IssueAIGenerator` へ自動フォールバック

---

## 1. 概要

### 背景

現在のAI Workflowでは、Evaluation Phase（Phase 9）で残タスクが検出された場合、FOLLOW-UP Issueを自動生成する機能が実装されている（Issue #119で追加）。しかし、現在の実装（`IssueAIGenerator`）はOpenAI API / Anthropic APIベースであり、以下の問題がある：

1. **内容がわかりにくい**: 生成されるIssue本文が形式的で、具体的なアクションが不明確
2. **コンテキスト不足**: 残タスクのリストだけでは、なぜそのタスクが必要なのか、どのように実装すべきかの詳細が欠けている
3. **auto-issue機能との一貫性がない**: auto-issue（Issue #121〜#128）ではエージェントベースの生成を採用しており、より詳細で実用的なIssue本文を生成している

### 目的

FOLLOW-UP Issue生成にエージェント（Codex/Claude Agent）ベースの生成機能を追加し、以下を実現する：

1. **Issue本文の品質向上**: 背景・目的・実行内容・受け入れ基準・参考情報を含む詳細なIssue本文を生成
2. **auto-issue機能との一貫性確保**: ファイルベース出力方式、エージェント選択ロジックを統一
3. **既存機能との互換性維持**: 既存のLLM APIベース生成（`--followup-llm-mode openai|claude`）はそのまま動作させる
4. **フォールバック機構の実装**: エージェント失敗時は既存の `IssueAIGenerator` へ自動的にフォールバック

### ビジネス価値・技術的価値

**ビジネス価値**:
- 残タスクの実行可能性向上（具体的なアクションと受け入れ基準が明確）
- 開発者の認知負荷軽減（Issue本文から実装方針を理解できる）
- ワークフロー完了率の向上（残タスクが放置されにくい）

**技術的価値**:
- コードベース全体の一貫性向上（auto-issueとFOLLOW-UPで同じ生成パターン）
- エージェント統合の知見蓄積（ファイルベース出力方式の汎用化）
- 保守性向上（既存実装を破壊せず拡張）

---

## 2. 機能要件

### 優先度の定義

- **高**: Phase 4（実装）で必須、MVP（Minimum Viable Product）に含む
- **中**: MVP後のブラッシュアップで実装
- **低**: 将来的な拡張候補

---

### FR-1: エージェントベースFOLLOW-UP Issue生成機能

**優先度**: 高

#### FR-1.1: プロンプトテンプレートの作成

- `src/prompts/followup/generate-followup-issue.txt` を新規作成
- プロンプトテンプレートには以下の変数プレースホルダーを含む：
  - `{remaining_tasks_json}`: 残タスクのJSON配列
  - `{issue_context_json}`: 元IssueのコンテキストJSON（番号、タイトル、URL、本文サマリー）
  - `{evaluation_report_path}`: Evaluation Reportのファイルパス（`@filepath`形式）
  - `{output_file_path}`: 出力先ファイルパス（エージェントがIssue本文を保存）
- プロンプトは5つの必須セクション（背景、目的、実行内容、受け入れ基準、参考情報）を含むIssue本文を生成するよう指示

#### FR-1.2: IssueAgentGeneratorクラスの実装

- `src/core/github/issue-agent-generator.ts` を新規作成
- 以下のメソッドを提供：
  - `constructor(agentClient: CodexAgentClient | ClaudeAgentClient)`: エージェントクライアント注入
  - `async generate(context: FollowUpContext): Promise<GeneratedIssue>`: Issue生成メインメソッド
  - `private buildPrompt(context: FollowUpContext): string`: プロンプト構築
  - `private async readOutputFile(filePath: string): Promise<string>`: 出力ファイル読み込み
- エラーハンドリング（`getErrorMessage()` 使用）
- ファイルベース出力方式（`os.tmpdir()` に一時ファイル生成 → エージェント実行 → ファイル読み込み → クリーンアップ）

**受け入れ基準**:
- Given: 残タスク情報とEvaluation Reportが提供されている
- When: `IssueAgentGenerator.generate()` を呼び出す
- Then: 5つの必須セクション（背景、目的、実行内容、受け入れ基準、参考情報）を含むIssue本文が生成される

#### FR-1.3: IssueClientの拡張

- `src/core/github/issue-client.ts` に以下のメソッドを追加：
  - `async generateFollowUpWithAgent(context: FollowUpContext): Promise<GeneratedIssue>`: エージェントベースのFOLLOW-UP Issue生成
- 既存メソッド `createIssueFromEvaluation()` にエージェントモード分岐を追加：
  - `options.mode === 'agent'` の場合、`generateFollowUpWithAgent()` を呼び出す
  - それ以外の場合、既存の `IssueAIGenerator` を呼び出す（後方互換性維持）

**受け入れ基準**:
- Given: `IssueGenerationOptions` で `mode: 'agent'` が指定されている
- When: `createIssueFromEvaluation()` を呼び出す
- Then: `IssueAgentGenerator` がIssue本文を生成し、GitHub Issueが作成される

---

### FR-2: CLIオプションの拡張

**優先度**: 高

#### FR-2.1: `--followup-llm-mode agent` オプション追加

- `src/commands/execute.ts` の `parseExecuteOptions()` に `--followup-llm-mode agent` パース処理を追加
- `src/types/commands.ts` の `IssueGenerationOptions` 型に `mode: 'agent'` を追加
  - 既存の `'auto' | 'openai' | 'claude' | 'off'` に `'agent'` を追加
- `src/phases/evaluation.ts` の `handlePassWithIssues()` メソッドから `IssueClient.createIssueFromEvaluation()` を呼び出す際、`mode: 'agent'` を渡す

**受け入れ基準**:
- Given: `--followup-llm-mode agent` オプションが指定されている
- When: Evaluation Phaseを実行し、残タスクが検出される
- Then: エージェントベースのFOLLOW-UP Issue生成が実行される

#### FR-2.2: 既存オプションの互換性維持

- `--followup-llm-mode openai|claude|off` は従来通り動作すること
- `--followup-llm-mode` 未指定時は `off` がデフォルト（既存動作）

**受け入れ基準**:
- Given: `--followup-llm-mode openai` オプションが指定されている
- When: Evaluation Phaseを実行し、残タスクが検出される
- Then: 既存の `IssueAIGenerator` によるLLM API生成が実行される（変更なし）

---

### FR-3: フォールバック機構

**優先度**: 高

#### FR-3.1: エージェント失敗時のフォールバック

- エージェント実行失敗時（ファイル不在、エラー発生）、自動的に `IssueAIGenerator` へフォールバック
- フォールバック発生時、`logger.warn()` でフォールバック理由を記録
- フォールバック情報を `metadata.json` の `evaluation.followup_issue_metadata` に記録：
  ```json
  {
    "generation_mode": "agent",
    "agent_used": "codex",
    "fallback_occurred": true,
    "fallback_reason": "エージェント実行でファイル生成失敗",
    "duration_ms": 12345
  }
  ```

**受け入れ基準**:
- Given: エージェント実行でファイル生成に失敗した
- When: フォールバック機構が動作する
- Then: `IssueAIGenerator` による生成が実行され、WARNING ログが記録され、FOLLOW-UP Issueが正常に作成される

---

### FR-4: ビルドスクリプト更新

**優先度**: 中

#### FR-4.1: プロンプトファイルのコピー処理追加

- `scripts/copy-static-assets.mjs` に `src/prompts/followup/*.txt` のコピー処理を追加
  - ただし、既存の `src/prompts/**/*.txt` で対応済みの可能性あり（要確認）
- ビルド後、`dist/prompts/followup/generate-followup-issue.txt` が存在することを確認

**受け入れ基準**:
- Given: `npm run build` を実行する
- When: ビルドが完了する
- Then: `dist/prompts/followup/generate-followup-issue.txt` が存在する

---

### FR-5: メタデータ拡張

**優先度**: 中

#### FR-5.1: 生成元情報の記録

- `metadata.json` の `evaluation.followup_issue_metadata` に以下の情報を追加（後方互換性あり）：
  ```json
  {
    "generation_mode": "agent",
    "agent_used": "codex",
    "duration_ms": 12345,
    "fallback_occurred": false
  }
  ```
- `generation_mode`: "agent" | "openai" | "claude" | "template"
- `agent_used`: "codex" | "claude" | null（エージェントモード時のみ）
- `duration_ms`: 生成にかかった時間（ミリ秒）
- `fallback_occurred`: フォールバック発生有無

**受け入れ基準**:
- Given: エージェントベースでFOLLOW-UP Issueを生成した
- When: `metadata.json` を確認する
- Then: `evaluation.followup_issue_metadata.generation_mode` が "agent" であり、`agent_used` と `duration_ms` が記録されている

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **NFR-1.1**: エージェント実行時間は60秒以内（タイムアウト）
  - 理由: auto-issue機能と同等のタイムアウト設定
- **NFR-1.2**: フォールバック処理は30秒以内（既存の `IssueAIGenerator` のタイムアウト）
- **NFR-1.3**: プロンプトファイル読み込みは1秒以内
  - 理由: ローカルファイルシステムアクセス、I/Oエラー時も速やかに失敗

### NFR-2: セキュリティ要件

- **NFR-2.1**: プロンプトテンプレートにシークレット（APIキー、トークン）を含めない
- **NFR-2.2**: 一時ファイル（`os.tmpdir()`）は生成後、確実にクリーンアップ
- **NFR-2.3**: エージェントに渡すコンテキスト情報は必要最小限に限定（機密情報を含まない）

### NFR-3: 可用性・信頼性要件

- **NFR-3.1**: エージェント失敗時もFOLLOW-UP Issue作成は必ず成功すること（フォールバック機構）
- **NFR-3.2**: リトライロジックは実装しない（複雑化を避ける、Planning Documentの軽減策に従う）
- **NFR-3.3**: エラー発生時は詳細なログを記録（`logger.error()`、スタックトレース）

### NFR-4: 保守性・拡張性要件

- **NFR-4.1**: 既存の `IssueAIGenerator` を削除せず、フォールバック先として保持
- **NFR-4.2**: `IssueClient.createIssueFromEvaluation()` のシグネチャを変更しない（オプション引数のみ追加）
- **NFR-4.3**: プロンプトテンプレート（`.txt`ファイル）を変更しやすい形で管理
- **NFR-4.4**: auto-issue機能のコードパターンを再利用し、コードの一貫性を維持

---

## 4. 制約事項

### 技術的制約

- **TC-1**: Node.js 20以上、TypeScript 5.x を使用
- **TC-2**: 既存の依存関係のみ使用（新規依存追加なし）
  - `CodexAgentClient` / `ClaudeAgentClient`: 既存
  - `fs-extra`: 既存
  - `path`: 標準ライブラリ
- **TC-3**: エージェント認証情報（`CODEX_API_KEY`, `CLAUDE_CODE_CREDENTIALS_PATH`）が設定されている環境でのみ動作
- **TC-4**: ファイルベース出力方式を採用（エージェントがファイルに保存 → Node.jsが読み込み）
- **TC-5**: プロンプトテンプレートは `src/prompts/` に配置し、ビルド時に `dist/prompts/` へコピー

### リソース制約

- **RC-1**: 見積もり工数: 12〜18時間（Planning Documentより）
- **RC-2**: 実装は Phase 4（4〜6時間）、テストは Phase 5〜6（2.5〜3.5時間）で完了すること

### ポリシー制約

- **PC-1**: 環境変数アクセスは `src/core/config.ts` の Config クラスを経由（`process.env` への直接アクセス禁止）
- **PC-2**: エラーハンドリングは `src/utils/error-utils.ts` の `getErrorMessage()` を使用（`as Error` 型アサーション禁止）
- **PC-3**: ロギングは `src/utils/logger.ts` の統一loggerモジュールを使用（`console.log` 禁止）
- **PC-4**: 正規表現を動的生成する場合、ReDoS攻撃を防ぐため `String.prototype.replaceAll()` を使用（Issue #161で修正済みのパターンを踏襲）

---

## 5. 前提条件

### システム環境

- **ENV-1**: Node.js 20以上がインストールされている
- **ENV-2**: TypeScript 5.x がインストールされている（`devDependencies`）
- **ENV-3**: `npm run build` が正常に実行できる環境

### 依存コンポーネント

- **DEP-1**: `CodexAgentClient` / `ClaudeAgentClient` が正常に動作すること
- **DEP-2**: `IssueAIGenerator` が正常に動作すること（フォールバック先）
- **DEP-3**: `GitHubClient` / `IssueClient` が正常に動作すること
- **DEP-4**: `MetadataManager` が正常に動作すること

### 外部システム連携

- **EXT-1**: GitHub API（`GITHUB_TOKEN` 経由）が正常に動作すること
- **EXT-2**: Codex API（`CODEX_API_KEY` 経由）または Claude Code（`CLAUDE_CODE_CREDENTIALS_PATH` 経由）が正常に動作すること
- **EXT-3**: OpenAI API（`OPENAI_API_KEY` 経由）または Anthropic API（`ANTHROPIC_API_KEY` 経由）が正常に動作すること（フォールバック時）

---

## 6. 受け入れ基準

### AC-1: エージェント生成Issue本文の品質

- **Given**: 残タスク情報、元Issue情報、Evaluation Reportが提供されている
- **When**: `--followup-llm-mode agent` でEvaluation Phaseを実行する
- **Then**: 生成されたIssue本文は以下の5つのセクションを含む：
  1. **背景**: 元Issueの概要と残タスク発生理由（最低100文字）
  2. **目的**: 各残タスクの目的と期待される成果（最低100文字）
  3. **実行内容**: 具体的な実装手順、対象ファイル、テスト方法（最低200文字）
  4. **受け入れ基準**: タスク完了の判断基準（Given-When-Then形式推奨、最低100文字）
  5. **参考情報**: 元Issue、Evaluation Report、関連ドキュメントへのリンク（最低50文字）

### AC-2: フォールバック機構の動作

- **Given**: エージェント実行が失敗した（ファイル不在、エラー発生）
- **When**: フォールバック機構が動作する
- **Then**:
  - `IssueAIGenerator` による生成が実行される
  - WARNING ログ（`logger.warn()`）が記録される
  - FOLLOW-UP Issueが正常に作成される
  - `metadata.json` に `fallback_occurred: true` が記録される

### AC-3: CLIオプションの動作

- **Given**: `--followup-llm-mode agent` オプションが指定されている
- **When**: Evaluation Phaseを実行し、残タスクが検出される
- **Then**:
  - エージェントベースのFOLLOW-UP Issue生成が実行される
  - GitHub Issueが作成される
  - `metadata.json` に `generation_mode: "agent"` が記録される

### AC-4: 既存機能との互換性

- **Given**: `--followup-llm-mode openai` オプションが指定されている（既存動作）
- **When**: Evaluation Phaseを実行し、残タスクが検出される
- **Then**:
  - `IssueAIGenerator` による生成が実行される（変更なし）
  - GitHub Issueが作成される
  - `metadata.json` に `generation_mode: "openai"` が記録される

### AC-5: ビルド成功

- **Given**: `npm run build` を実行する
- **When**: ビルドが完了する
- **Then**:
  - `dist/prompts/followup/generate-followup-issue.txt` が存在する
  - ビルドエラーが発生しない

### AC-6: テストカバレッジ

- **Given**: `npm run test:unit` および `npm run test:integration` を実行する
- **When**: テストが完了する
- **Then**:
  - すべてのユニットテストが成功する
  - すべての統合テストが成功する
  - テストカバレッジが80%以上である

---

## 7. スコープ外

### 明確にスコープ外とする事項

- **OUT-1**: FOLLOW-UP Issue生成時のリトライロジック（複雑化を避ける、Planning Documentの軽減策に従う）
- **OUT-2**: FOLLOW-UP Issue生成時のプログレスバー表示（コンソール出力のみ）
- **OUT-3**: FOLLOW-UP Issue生成時のキャンセル機能（一度開始したら完了まで実行）
- **OUT-4**: FOLLOW-UP Issue生成時のプレビューモード（`--dry-run` 等）
- **OUT-5**: エージェント以外の新規LLMプロバイダ追加（既存のOpenAI/Anthropicのみ）
- **OUT-6**: FOLLOW-UP Issue生成時の並列処理（残タスクが複数ある場合でも順次実行）
- **OUT-7**: FOLLOW-UP Issue生成時のカスタムプロンプトテンプレート（`generate-followup-issue.txt` 固定）

### 将来的な拡張候補

- **FUTURE-1**: FOLLOW-UP Issue生成時のプレビューモード（`--dry-run`）
- **FUTURE-2**: FOLLOW-UP Issue生成時の並列処理（複数残タスクを並行生成）
- **FUTURE-3**: カスタムプロンプトテンプレート対応（ユーザー定義のテンプレート使用）
- **FUTURE-4**: FOLLOW-UP Issue生成時のリトライロジック（エージェント失敗時に再試行）
- **FUTURE-5**: FOLLOW-UP Issue生成時のコスト追跡（トークン使用量、API呼び出し回数）

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 担当者 |
|-----------|------|----------|--------|
| 1.0 | 2025-01-30 | 初版作成 | AI Workflow |

---

## 承認

| 役割 | 氏名 | 承認日 | 署名 |
|------|------|--------|------|
| プロダクトオーナー | - | - | - |
| テックリード | - | - | - |
| QAリード | - | - | - |

---

**次フェーズ**: Phase 2 - Design（設計）
