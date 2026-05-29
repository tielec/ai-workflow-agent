# 要件定義書: Issue #888

## PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Document（`.ai-workflow/issue-888/00_planning/output/planning.md`）を精査した結果、以下の戦略が策定されている。

- **実装戦略**: EXTEND（既存の `src/commands/finalize.ts` への機能拡張が中心。新規モジュール作成不要）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト＋統合テストの組み合わせ）
- **テストコード戦略**: BOTH_TEST（既存テストファイルの拡充＋新規テストファイル作成）
- **複雑度**: 中程度（主要実装は完了済み、テスト拡充・ドキュメント更新が主な残作業）
- **見積もり工数**: 12〜16時間

### 実装状況の確認

コードベースの精査により、以下が確認された。

| コンポーネント | 状態 |
|---|---|
| `src/commands/finalize.ts`（AIリライトロジック） | 実装完了 |
| `src/main.ts`（CLIオプション登録） | 実装完了 |
| `src/templates/{ja,en}/pr_body_finalize_template.md` | 作成済み |
| `src/prompts/finalize/{ja,en}/rewrite_pr_body.txt` | 作成済み |
| `src/core/prompt-loader.ts`（`finalize`カテゴリ） | 対応済み |
| `tests/unit/commands/finalize.test.ts` | 基本テスト実装済み（AIリライト固有テスト未実装） |
| `tests/integration/finalize-command.test.ts` | 基本テスト実装済み（AIリライト固有テスト未実装） |
| `docs/CLI_REFERENCE.md` | 未更新（`--ai-rewrite`未記載） |
| Jenkins Finalize Jenkinsfile | 未更新（`--ai-rewrite`パラメータ未追加） |

### Planning Documentとの整合性

本要件定義書は、Planning Documentで策定されたスコープ・リスク・スケジュールを踏まえ、機能要件・非機能要件・受け入れ基準を詳細化するものである。Planning Documentが特定した「残課題」（テスト拡充・ドキュメント更新・プロンプトチューニング）は、本要件定義書の機能要件FR-010〜FR-012として明文化している。

---

## 1. 概要

### 1.1 背景

現在の `src/commands/finalize.ts` の `generateFinalPrBody` 関数は、フェーズステータス（`✅`/`⏳` の一覧）、コミットスカッシュの完了状況、クリーンアップステータスなど、ワークフロー内部の管理情報を中心としたPRボディを生成している。レビュアーが最も必要とする「何がなぜ変わったのか」「どこに注意してレビューすべきか」「テストは十分か」といった情報が欠落しており、レビュー品質の低下とレビュー時間の増大を招いている。

### 1.2 目的

`finalize` コマンドに `--ai-rewrite` オプションを追加し、AIエージェント（Claude / Codex）を活用して、diff情報と各フェーズの成果物（`planning.md`、`requirements.md`、`design.md`、`test-scenario.md`、`implementation.md`、`test-result.md`、`documentation-update-log.md`）を分析させ、レビュアー視点で最適化されたPRボディを自動生成する。

### 1.3 ビジネス価値

- **レビュー品質の向上**: PRボディにレビュー観点・注目ポイントが明記されることで、レビュアーの確認精度が向上する
- **レビュー時間の短縮**: 変更概要・影響範囲が構造化されて提供されるため、diffの精読前に変更の全体像を把握できる
- **レビュアーの認知負荷軽減**: 内部ワークフロー情報ではなく、レビュアーが必要とする情報（変更理由・変更点・テスト結果）に特化したPRボディが提供される

### 1.4 技術的価値

- **既存アーキテクチャの自然な拡張**: `PromptLoader`、エージェントクライアント、`PullRequestClient` など既存モジュールを再利用
- **完全な後方互換性**: `--ai-rewrite` 未指定時は従来の `generateFinalPrBody` がそのまま使用される
- **多言語対応**: 日本語・英語のテンプレートとプロンプトを個別に提供

---

## 2. 機能要件

### FR-001: `--ai-rewrite` オプションの追加（優先度: 高）

`finalize` コマンドに `--ai-rewrite` ブーリアンフラグを追加する。

| 項目 | 仕様 |
|---|---|
| オプション名 | `--ai-rewrite` |
| 型 | `boolean` |
| デフォルト値 | `false` |
| 動作 | `true` の場合、AIエージェントによるPRボディリライトを実行する |
| CLI登録 | `src/main.ts` に登録済み |
| 実装状態 | `src/commands/finalize.ts` に実装済み |

**検証ポイント**: `--ai-rewrite` 指定時にAIリライトフローが起動すること、未指定時に従来動作が維持されること。

### FR-002: `--agent` オプションの追加（優先度: 高）

AIリライト時に使用するエージェントモードを指定するオプションを追加する。

| 項目 | 仕様 |
|---|---|
| オプション名 | `--agent` |
| 型 | `'auto' \| 'codex' \| 'claude'` |
| デフォルト値 | `'auto'` |
| 有効条件 | `--ai-rewrite` が有効な場合のみ機能する |
| `auto`の動作 | `claude-first` 優先順位に基づきClaude を優先、失敗時にCodex にフォールバック |
| CLI登録 | `src/main.ts` に登録済み |
| 実装状態 | `src/commands/finalize.ts` に実装済み |

### FR-003: diff情報の取得とトランケーション（優先度: 高）

PRのdiff情報を `PullRequestClient.getPullRequestDiff()` 経由で取得し、プロンプトのコンテキストとして使用する。大規模diffに対してはトランケーション戦略を適用する。

| 条件 | 動作 |
|---|---|
| diff文字数 ≤ 50,000 かつ 変更ファイル数 ≤ 300 | diff全文をプロンプトに含める |
| diff文字数 > 50,000 または 変更ファイル数 > 300 | ファイル変更リストのサマリー（ファイル名 + 追加/削除行数）のみをプロンプトに含める |
| diff取得失敗（GitHub APIエラー） | diff情報なしでプロンプトを構築し、フェーズ成果物のみでPRボディを生成する |

**定数定義**:
- `MAX_DIFF_LENGTH = 50,000`（文字）
- `MAX_DIFF_FILES_THRESHOLD = 300`（ファイル）

**実装状態**: `getDiffForPrompt()` 関数および `extractDiffFileSummary()` 関数として実装済み。

### FR-004: フェーズ成果物の収集（優先度: 高）

`.ai-workflow/issue-<NUM>/` ディレクトリ配下の各フェーズ成果物を収集し、AIプロンプトのコンテキストとして使用する。

| 収集対象フェーズ | ファイルパス |
|---|---|
| planning | `00_planning/output/planning.md` |
| requirements | `01_requirements/output/requirements.md` |
| design | `02_design/output/design.md` |
| test_scenario | `03_test_scenario/output/test-scenario.md` |
| implementation | `04_implementation/output/implementation.md` |
| test_result | `06_testing/output/test-result.md` |
| documentation | `07_documentation/output/documentation-update-log.md` |

| 条件 | 動作 |
|---|---|
| ファイルが存在する場合 | 内容を読み込み、`MAX_PHASE_OUTPUT_LENGTH`（10,000文字）に切り詰める |
| ファイルが存在しない場合 | フォールバックテキスト「（このフェーズの成果物は利用できません）」を使用する |
| ファイル読み込み失敗 | フォールバックテキスト「（このフェーズの成果物の読み込みに失敗しました）」を使用し、警告ログを出力する |

**重要**: 収集は `.ai-workflow/` ディレクトリの削除（Step 2）の**前**に実行する必要がある（TC-007）。

**実装状態**: `collectPhaseOutputs()` 関数として実装済み。

### FR-005: プロンプトコンテキストの構築（優先度: 高）

`PromptLoader` を使用してプロンプトテンプレートとPRボディテンプレートを読み込み、コンテキスト変数を埋め込んでプロンプト文字列を構築する。

| プレースホルダー | 置換内容 |
|---|---|
| `{issue_number}` | Issue番号（整数） |
| `{issue_title}` | Issueタイトル（メタデータから取得） |
| `{diff_content}` | FR-003で取得したdiff情報 |
| `{phase_outputs}` | FR-004で収集したフェーズ成果物（結合テキスト） |
| `{template_structure}` | PRボディテンプレートの構造（出力形式の指示用） |

**セキュリティ要件**: プレースホルダー置換には `String.prototype.replaceAll()` を使用し、ReDoS攻撃を防止する（NFR-002準拠）。

**実装状態**: `buildPromptContext()` 関数として実装済み。

### FR-006: PRボディテンプレートの提供（優先度: 高）

レビュアー向けに最適化されたPRボディの構造を定義するテンプレートファイルを日本語・英語で提供する。

**日本語テンプレート** (`src/templates/ja/pr_body_finalize_template.md`):

| セクション | 説明 |
|---|---|
| 変更概要 | PR全体の要約（1〜3文）。`Closes #{issue_number}` を含む |
| 変更の背景・目的 | Issueの内容を踏まえた変更理由 |
| 主要な変更点 | ファイル単位またはモジュール単位の変更内容リスト |
| レビュー時の注目ポイント | レビュアーが特に確認すべき箇所の提示 |
| テスト結果サマリー | テスト実行結果の要約 |
| 影響範囲 | 変更が影響する機能・モジュールの範囲 |

**英語テンプレート** (`src/templates/en/pr_body_finalize_template.md`): 日本語テンプレートと同一構造の英語版。

**実装状態**: 両言語とも作成済み。

### FR-007: AIエージェント実行とフォールバックチェーン（優先度: 高）

AIエージェントに構築済みプロンプトを送信し、PRボディを生成させる。エージェント実行は `claude-first` 優先順位に基づくフォールバックチェーンを使用する。

| ステップ | 動作 |
|---|---|
| 1. Claude で試行 | `ClaudeAgentClient.executeTask()` を呼び出す（`maxTurns: 30`） |
| 2. Claude成功 | 出力メッセージを返却 |
| 3. Claude失敗（例外またはempty result） | 警告ログを出力し、Codex にフォールバック |
| 4. Codex で試行 | `CodexAgentClient.executeTask()` を呼び出す（`maxTurns: 30`） |
| 5. Codex成功 | 出力メッセージを返却 |
| 6. Codex失敗 | 例外をスロー（上位で捕捉してフォールバック） |

**実装状態**: `executeAgentTask()` 関数として実装済み。

### FR-008: 必須セクション検証（優先度: 高）

AI生成されたPRボディに最低限の構造品質が保たれているか検証する。

| 言語 | 必須セクション見出し |
|---|---|
| 日本語 (`ja`) | `変更概要`, `主要な変更点` |
| 英語 (`en`) | `Summary`, `Key Changes` |

**検証ロジック**: 上記の必須セクション見出しのうち、少なくとも1つがPRボディに含まれていれば検証通過とする（AIの出力は完全一致しない場合があるため、厳密すぎる検証は避ける）。

**検証失敗時**: 警告ログを出力し、従来の `generateFinalPrBody` 出力にフォールバックする。

**実装状態**: `validateRequiredSections()` 関数として実装済み。

### FR-009: 後方互換性の完全保持（優先度: 高）

`--ai-rewrite` オプションが未指定の場合、finalize コマンドの動作は従来と100%同一であること。

| 条件 | PRボディ生成 |
|---|---|
| `--ai-rewrite` 未指定 | `generateFinalPrBody()` による従来のPRボディ |
| `--ai-rewrite` 指定 + AI生成成功 | AI生成PRボディ |
| `--ai-rewrite` 指定 + AI生成失敗 | `generateFinalPrBody()` による従来のPRボディ（フォールバック） |
| `--ai-rewrite` 指定 + エージェント認証情報なし | `generateFinalPrBody()` による従来のPRボディ（フォールバック） |
| `--ai-rewrite` 指定 + 必須セクション検証失敗 | `generateFinalPrBody()` による従来のPRボディ（フォールバック） |

**実装状態**: `generateAiRewrittenPrBody()` 関数内のtry-catchおよびフォールバック分岐として実装済み。

### FR-010: AIリライト固有のユニットテスト追加（優先度: 中）

既存の `tests/unit/commands/finalize.test.ts` にAIリライト固有のテストケースを追加し、かつ必要に応じてヘルパー関数群の新規テストファイルを作成する。

**テスト対象関数**:
- `collectPhaseOutputs()`: フェーズ成果物収集（全件存在/一部欠損/全件欠損/10,000文字超切り詰め）
- `getDiffForPrompt()`: diff取得（小規模diff/大規模diff切り詰め/300ファイル超サマリー/APIエラー）
- `buildPromptContext()`: プロンプトコンテキスト構築（プレースホルダー置換/テンプレート読み込み）
- `validateRequiredSections()`: セクション検証（日本語/英語/必須ヘッダー有/無）
- `executeAgentTask()`: エージェント実行（Claude成功/Claude失敗→Codexフォールバック/両方失敗）
- `generateAiRewrittenPrBody()`: 統合オーケストレーション（正常系/フォールバック系）

### FR-011: ドライランモードでのAIリライト情報表示（優先度: 中）

`--dry-run` モードで `--ai-rewrite` が指定されている場合、プレビュー出力にAIリライトが有効であること（エージェントモードを含む）を表示する。

**実装状態**: `previewFinalize()` 関数内に実装済み。日本語・英語の両方でメッセージを表示する。

### FR-012: ドキュメント更新（優先度: 中）

以下のドキュメントに `--ai-rewrite` および `--agent` オプションの説明を追加する。

| ドキュメント | 更新内容 |
|---|---|
| `docs/CLI_REFERENCE.md` | finalize コマンドのオプション一覧に `--ai-rewrite` と `--agent` を追加。使用例を追記。 |
| `README.md` | 主要コマンド表の `finalize` 説明にAIリライト機能を追記。 |

### FR-013: Jenkins パラメータ対応（優先度: 低）

`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` に `--ai-rewrite` と `--agent` パラメータを追加し、Jenkins UI からAIリライトを有効化できるようにする。

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `AI_REWRITE` | boolean | `false` | AIエージェントによるPRボディリライトの有効化 |
| `AGENT_MODE` | choice | `auto` | AIリライト時のエージェントモード（`auto`/`codex`/`claude`） |

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件

| 要件 | 仕様 |
|---|---|
| エージェント実行のターン数上限 | 最大30ターン（`maxTurns: 30`） |
| diff取得のタイムアウト | GitHub API のデフォルトタイムアウトに従う |
| フェーズ成果物の読み込み | ローカルファイルシステムからの同期読み込み（低レイテンシ） |
| 全体のAIリライト処理時間 | エージェント実行時間に依存（通常30秒〜3分）。フォールバック発生時は即座に従来PRボディを返却（追加遅延なし） |

### NFR-002: セキュリティ要件

| 要件 | 仕様 |
|---|---|
| ReDoS防止 | プレースホルダー置換には `String.prototype.replaceAll()` を使用。`new RegExp()` にユーザー入力を直接渡すことを禁止（CLAUDE.md §4 準拠） |
| 認証情報の安全な取り扱い | エージェント認証情報は `config` クラスおよび `resolveAgentCredentials()` 経由で取得。環境変数への直接アクセスを禁止（CLAUDE.md §2 準拠） |
| diff内容の漏洩防止 | diff情報はプロンプトとしてエージェントに送信されるが、永続化やログ出力は行わない |

### NFR-003: トークン制限対応

| リソース | 上限値 | 超過時の対処 |
|---|---|---|
| diff テキスト | 50,000文字 | ファイル変更リストのサマリーのみをプロンプトに含める |
| フェーズ成果物（各ファイル） | 10,000文字 | 先頭10,000文字に切り詰め、「... (以降省略)」を付加 |
| 変更ファイル数 | 300ファイル | ファイル変更リストのサマリーのみをプロンプトに含める |

### NFR-004: 多言語対応要件

| 要件 | 仕様 |
|---|---|
| 対応言語 | 日本語（`ja`）、英語（`en`） |
| 言語判定 | `metadataManager.getLanguage()` から取得。未設定時は `ja` をデフォルトとする |
| テンプレート | `src/templates/{ja,en}/pr_body_finalize_template.md` |
| プロンプト | `src/prompts/finalize/{ja,en}/rewrite_pr_body.txt` |
| 言語フォールバック | `PromptLoader` の既存フォールバック機構（指定言語 → デフォルト言語）を活用 |
| 必須セクション検証 | 言語別の見出し名で検証（日本語: `変更概要`/`主要な変更点`、英語: `Summary`/`Key Changes`） |

### NFR-005: 可用性・信頼性要件

| 要件 | 仕様 |
|---|---|
| AIエージェント障害時の可用性 | フォールバックチェーン（Claude → Codex → 従来PRボディ）により、AIエージェントが完全に利用不可でもfinalize処理自体は正常完了する |
| エラーの非伝播 | AIリライト処理内のすべてのエラーはtry-catchで捕捉され、PR更新処理（Step 4-5）をブロックしない |
| 部分的なコンテキスト不足への耐性 | フェーズ成果物やdiff情報が一部欠損していても、利用可能な情報のみでPRボディ生成を試行する |

### NFR-006: 保守性・拡張性要件

| 要件 | 仕様 |
|---|---|
| コーディング規約準拠 | CLAUDE.md に定義された統一ロギング規約（`logger`）、環境変数アクセス規約（`config`）、エラーハンドリング規約（`getErrorMessage()`）に準拠 |
| プロンプトの外部化 | AIプロンプトは `src/prompts/finalize/{lang}/` に外部ファイルとして配置。コード変更なしにプロンプトチューニングが可能 |
| テンプレートの外部化 | PRボディテンプレートは `src/templates/{lang}/` に外部ファイルとして配置。セクション構成の変更がコード変更なしに可能 |
| モジュール分離 | AIリライト関連関数群（`collectPhaseOutputs`、`getDiffForPrompt`、`buildPromptContext`、`validateRequiredSections`、`executeAgentTask`、`generateAiRewrittenPrBody`）は `finalize.ts` 内で独立した関数として実装され、単体テストが容易 |

---

## 4. 制約事項

### 4.1 技術的制約

| 制約 | 詳細 |
|---|---|
| ランタイム | Node.js 20以上が必須（`String.prototype.replaceAll()` は Node.js 15.0.0以降でネイティブサポート） |
| エージェントクライアント | 既存の `ClaudeAgentClient` および `CodexAgentClient` を再利用。新規エージェントクライアントの作成は不要 |
| GitHub API | `PullRequestClient.getPullRequestDiff()` のレスポンスサイズはGitHub APIの制約に依存（非常に大きなdiffはGitHub側でtruncateされる場合がある） |
| ビルドパイプライン | `npm run build` 時にプロンプトファイル（`src/prompts/`）とテンプレートファイル（`src/templates/`）が `dist/` にコピーされることが必須 |

### 4.2 既存システムとの整合性

| 制約 | 詳細 |
|---|---|
| `generateFinalPrBody()` の不変性 | 従来のPRボディ生成関数は一切変更しない。AIリライトはその出力をフォールバックとして使用する |
| メタデータ構造の不変性 | `metadata.json` のスキーマ変更は行わない |
| 既存テストのリグレッション | 既存のユニットテスト・統合テストが全件通過すること |

### 4.3 ポリシー制約

| 制約 | 詳細 |
|---|---|
| ロギング規約 | `console.log` 等の直接使用は禁止。`logger` モジュール（`src/utils/logger.ts`）を使用（Issue #61, #829） |
| 環境変数アクセス規約 | `process.env` への直接アクセスは禁止。`config` クラス（`src/core/config.ts`）を使用（Issue #51） |
| エラーハンドリング規約 | `as Error` 型アサーションは禁止。`getErrorMessage()` / `getErrorStack()` / `isError()` を使用（Issue #48） |
| ReDoS防止 | 動的正規表現の使用を禁止。文字列置換には `replaceAll()` を使用（Issue #140, #161） |

---

## 5. 前提条件

### 5.1 システム環境

| 前提条件 | 詳細 |
|---|---|
| Node.js | バージョン20以上がインストールされていること |
| npm | バージョン10以上がインストールされていること |
| GitHub Token | `GITHUB_TOKEN` 環境変数が設定されていること（PR更新・diff取得に必要） |

### 5.2 エージェント認証情報

AIリライト機能を使用する場合、以下のいずれかの認証情報が設定されている必要がある。

| エージェント | 認証情報 |
|---|---|
| Claude | `CLAUDE_CODE_OAUTH_TOKEN` または `CLAUDE_CODE_API_KEY` |
| Codex | `CODEX_API_KEY` または `~/.codex/auth.json` |

認証情報が一切設定されていない場合、AIリライトは実行されず従来のPRボディ生成にフォールバックする（エラーとはならない）。

### 5.3 依存コンポーネント

| コンポーネント | 用途 |
|---|---|
| `src/core/prompt-loader.ts`（PromptLoader） | プロンプト・テンプレートファイルの読み込み |
| `src/commands/execute/agent-setup.ts`（resolveAgentCredentials, setupAgentClients） | エージェント認証情報の解決とクライアント初期化 |
| `src/core/claude-agent-client.ts`（ClaudeAgentClient） | Claude エージェントのタスク実行 |
| `src/core/codex-agent-client.ts`（CodexAgentClient） | Codex エージェントのタスク実行 |
| `src/core/github/pull-request-client.ts`（PullRequestClient） | PRのdiff取得・本文更新・ドラフト解除 |
| `src/core/metadata-manager.ts`（MetadataManager） | ワークフローメタデータの読み込み・フェーズ情報取得 |

### 5.4 ワークフロー前提

| 前提条件 | 詳細 |
|---|---|
| ワークフロー初期化済み | `init` コマンドによるブランチ作成・メタデータ初期化・PR作成が完了していること |
| フェーズ実行済み | 少なくとも一部のフェーズ（planning〜evaluation）が実行され、成果物が生成されていること（全フェーズ完了は必須ではない） |
| PR存在 | メタデータに `pr_number` が記録されているか、GitHub API経由でPRが検索可能であること |

---

## 6. 受け入れ基準

### AC-001: `--ai-rewrite` オプションによるAI生成PRボディの出力

**Given**: ワークフローが初期化済みで、少なくとも1つのフェーズが完了しており、エージェント認証情報が設定されている
**When**: `node dist/index.js finalize --issue <NUM> --ai-rewrite` を実行する
**Then**:
- AIエージェント（Claude または Codex）がPRボディを生成する
- 生成されたPRボディに「変更概要」または「Summary」セクションが含まれる
- PRの本文がAI生成されたコンテンツで更新される
- ログに「AI rewrite of PR body completed successfully.」が出力される

### AC-002: `--ai-rewrite` 未指定時の従来動作維持

**Given**: ワークフローが初期化済みで、フェーズが完了している
**When**: `node dist/index.js finalize --issue <NUM>` を実行する（`--ai-rewrite` なし）
**Then**:
- 従来の `generateFinalPrBody()` によるPRボディが生成される
- PRボディにフェーズステータス（`✅`/`⏳`）、テスト結果、クリーンアップ状況が含まれる
- AIエージェントは呼び出されない
- 既存テストケースが全件通過する

### AC-003: AI生成失敗時のフォールバック

**Given**: ワークフローが初期化済みで、エージェント認証情報が設定されているが、エージェント実行が失敗する条件がある
**When**: `node dist/index.js finalize --issue <NUM> --ai-rewrite` を実行する
**Then**:
- 警告ログ「AI rewrite failed: ...」が出力される
- 従来の `generateFinalPrBody()` による PRボディでPRが更新される（フォールバック）
- finalize コマンド全体は正常完了する（エラー終了しない）

### AC-004: エージェント認証情報未設定時のフォールバック

**Given**: ワークフローが初期化済みだが、エージェント認証情報（`CLAUDE_CODE_OAUTH_TOKEN`、`CLAUDE_CODE_API_KEY`、`CODEX_API_KEY`）が一切設定されていない
**When**: `node dist/index.js finalize --issue <NUM> --ai-rewrite` を実行する
**Then**:
- 警告ログ「No agent credentials available. Falling back to default PR body.」が出力される
- 従来のPRボディでPRが更新される
- finalize コマンド全体は正常完了する

### AC-005: 必須セクション検証失敗時のフォールバック

**Given**: AIエージェントが応答を返すが、必須セクション（「変更概要」/「主要な変更点」または「Summary」/「Key Changes」）がいずれも含まれていない
**When**: AIリライト処理が実行される
**Then**:
- 警告ログ「AI-generated PR body missing required sections. Falling back to default PR body.」が出力される
- 従来のPRボディでPRが更新される

### AC-006: 大規模diff時のトランケーション

**Given**: PRの変更ファイル数が300を超える、またはdiffテキストが50,000文字を超える
**When**: AIリライト処理が実行される
**Then**:
- diff全文ではなく、ファイル変更リストのサマリー（ファイル名 + 追加/削除行数）がプロンプトに含まれる
- `DiffContext.wasTruncated` が `true` になる
- AIエージェントはサマリー情報を基にPRボディを生成する

### AC-007: フェーズ成果物の事前収集（.ai-workflow削除前）

**Given**: `--ai-rewrite` が指定されている
**When**: finalize コマンドが実行される
**Then**:
- Step 2（`.ai-workflow/` ディレクトリ削除）の**前**にフェーズ成果物が収集される
- 収集された成果物がAIリライト処理に使用される
- Step 2実行後もAIリライト処理が正常に動作する

### AC-008: 日本語・英語でのテンプレート適用

**Given**: ワークフローの言語設定が `ja` または `en` に設定されている
**When**: `--ai-rewrite` が有効でAIリライトが実行される
**Then**:
- 対応する言語のプロンプト（`src/prompts/finalize/{lang}/rewrite_pr_body.txt`）が使用される
- 対応する言語のテンプレート（`src/templates/{lang}/pr_body_finalize_template.md`）がプロンプトに含まれる
- 生成されるPRボディのセクション見出しが指定言語に対応する

### AC-009: ドライランモードでのAIリライト表示

**Given**: `--ai-rewrite` と `--dry-run` の両方が指定されている
**When**: finalize コマンドが実行される
**Then**:
- プレビュー出力にAIリライトが有効であることが表示される
- エージェントモード（`auto`/`codex`/`claude`）が表示される
- 実際のAIリライト処理は実行されない
- PR本文は更新されない

### AC-010: フェーズ成果物の切り詰め

**Given**: 特定のフェーズ成果物ファイルが10,000文字を超える
**When**: `collectPhaseOutputs()` が実行される
**Then**:
- 該当ファイルの内容が先頭10,000文字に切り詰められる
- 末尾に「... (以降省略)」が付加される
- デバッグログに切り詰めが行われた旨が出力される

### AC-011: CLI_REFERENCE.mdの更新

**Given**: ドキュメント更新タスクが実施される
**When**: `docs/CLI_REFERENCE.md` を確認する
**Then**:
- `finalize` コマンドのオプション一覧に `--ai-rewrite` と `--agent` が記載されている
- 各オプションの型、デフォルト値、説明が記載されている
- `--ai-rewrite` 有効時の使用例が記載されている
- フォールバック動作の説明が記載されている

### AC-012: 全テストの通過

**Given**: AIリライト機能の実装・テスト追加が完了している
**When**: `npm run validate` を実行する
**Then**:
- `npm run lint` がエラーなく通過する
- `npm run test:unit` が全件通過する
- `npm run test:integration` が全件通過する
- `npm run build` が成功し、`dist/` にプロンプト・テンプレートがコピーされる

---

## 7. スコープ外

### 7.1 本Issue（#888）のスコープ外とする事項

| スコープ外事項 | 理由 |
|---|---|
| PRボディのインタラクティブ編集機能 | 本Issueはバッチ処理（CLI実行）でのAI生成に特化。インタラクティブな編集はGitHub UIで対応可能 |
| 画像・スクリーンショットの自動生成 | テンプレートに「スクリーンショット/動作確認」セクションの記載はあるが、画像の自動生成・アップロードは対象外。テキストベースの説明のみAI生成する |
| AIモデルの直接呼び出し（非エージェント） | OpenAI API / Anthropic APIの直接呼び出しは対象外。既存のエージェントクライアント（ClaudeAgentClient / CodexAgentClient）経由でのみ実行する |
| PRボディの差分比較・バージョン管理 | AI生成前後のPRボディの比較や履歴管理は対象外 |
| `generateFinalPrBody()` の改修 | 従来のPRボディ生成関数の出力内容の改善は対象外。本Issueでは当該関数をフォールバックとしてのみ使用する |
| 新規依存パッケージの追加 | 既存の依存関係のみで実装する |

### 7.2 将来的な拡張候補

| 拡張候補 | 概要 |
|---|---|
| PRボディの品質スコアリング | AI生成されたPRボディの品質を自動評価し、スコアを付与する機能 |
| レビュアー別のPRボディカスタマイズ | レビュアーの専門領域に応じて、注目ポイントを最適化する機能 |
| PR変更の視覚的サマリー | 変更の影響範囲をグラフィカルに表示する機能 |
| テンプレートのカスタマイズ機能 | ユーザーがPRボディテンプレートを独自に定義できる機能 |
| `--ai-rewrite` のデフォルト有効化 | 十分な実績蓄積後、`--ai-rewrite` をデフォルト `true` に変更する検討 |

---

## 付録A: AIリライトフロー全体図

```
handleFinalizeCommand(options)
│
├─ 1. validateFinalizeOptions(options)
│
├─ 2. loadWorkflowMetadata(options.issue)
│
├─ 3. options.dryRun ? → previewFinalize() → return
│
├─ 4. options.aiRewrite ? → collectPhaseOutputs()  ★事前収集
│
├─ 5. executeStep1() → base_commit + headBeforeCleanup
│
├─ 6. executeStep2() → .ai-workflow/ 削除 + コミット
│
├─ 7. !options.skipSquash ? → executeStep3() → コミットスカッシュ
│
└─ 8. !options.skipPrUpdate ? → executeStep4And5()
    │
    ├─ fallbackBody = generateFinalPrBody()  ★従来PRボディ（常に生成）
    │
    ├─ options.aiRewrite && collectedOutputs ?
    │   │
    │   └─ generateAiRewrittenPrBody()
    │       ├─ getDiffForPrompt() → diff取得 + トランケーション
    │       ├─ buildPromptContext() → プロンプト構築
    │       ├─ setupAgentClients() → エージェント初期化
    │       ├─ executeAgentTask() → Claude優先 + Codexフォールバック
    │       ├─ validateRequiredSections() → 必須セクション検証
    │       ├─ 成功 → AI生成PRボディ
    │       └─ 失敗 → fallbackBody
    │
    ├─ prClient.updatePullRequest(prNumber, prBody)
    ├─ options.baseBranch ? → prClient.updateBaseBranch()
    └─ prClient.markPRReady(prNumber)
```

---

## 付録B: 機能要件と受け入れ基準の対応表

| 機能要件 | 関連する受け入れ基準 |
|---|---|
| FR-001: `--ai-rewrite` オプション | AC-001, AC-002 |
| FR-002: `--agent` オプション | AC-001, AC-009 |
| FR-003: diff情報の取得・トランケーション | AC-006 |
| FR-004: フェーズ成果物の収集 | AC-007, AC-010 |
| FR-005: プロンプトコンテキスト構築 | AC-001, AC-008 |
| FR-006: PRボディテンプレート | AC-008 |
| FR-007: エージェント実行・フォールバック | AC-001, AC-003, AC-004 |
| FR-008: 必須セクション検証 | AC-005 |
| FR-009: 後方互換性 | AC-002, AC-003, AC-004, AC-005 |
| FR-010: ユニットテスト追加 | AC-012 |
| FR-011: ドライラン表示 | AC-009 |
| FR-012: ドキュメント更新 | AC-011 |
| FR-013: Jenkinsパラメータ対応 | （独立した検証） |

---

## 付録C: 品質ゲートチェックリスト

- [x] **機能要件が明確に記載されている**: FR-001〜FR-013として13件の機能要件を明文化。各要件に仕様、型、デフォルト値、動作条件を記載。
- [x] **受け入れ基準が定義されている**: AC-001〜AC-012として12件の受け入れ基準をGiven-When-Then形式で記載。各基準は検証可能。
- [x] **スコープが明確である**: §7にスコープ外事項を6件、将来拡張候補を5件明記。
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準の対応を付録Bで確認。非機能要件と制約事項の整合性を確認済み。
