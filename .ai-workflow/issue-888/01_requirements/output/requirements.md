# 要件定義書: Issue #888

## PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Phase（`.ai-workflow/issue-888/00_planning/output/planning.md`）で策定された計画に基づき、以下の戦略を踏まえて要件定義を実施する。

| 項目 | 判定 |
|------|------|
| **実装戦略** | **EXTEND** - 既存 `src/commands/finalize.ts` の拡張 |
| **テスト戦略** | **UNIT_INTEGRATION** - ユニット＋統合テスト |
| **テストコード戦略** | **BOTH_TEST** - 既存テスト拡張＋新規テスト作成 |
| **複雑度** | 中程度 |
| **見積もり工数** | 12〜16時間 |
| **リスク** | 中 |

### スコープ確認

- **変更対象**: `finalize.ts`、`main.ts`、`prompt-loader.ts`、および新規テンプレート・プロンプトファイル
- **変更方針**: 既存の `generateFinalPrBody` 関数はフォールバックとして完全に維持し、新規ロジックを分岐追加する
- **新規モジュール作成**: 不要（既存アーキテクチャの範囲内で完結）

### リスク確認

Planning Document で識別された主要リスク5件（大規模diffトークン制限、AI品質ばらつき、既存フロー回帰、エージェント初期化複雑さ、ビルドコピー漏れ）を認識し、要件定義に反映する。

---

## 1. 概要

### 1.1 背景

現在の `src/commands/finalize.ts` の `generateFinalPrBody` 関数は、`FINALIZE_TEXT` としてハードコードされたテキストを使用してPRボディを生成している。その内容は以下の通り、ワークフロー内部の管理情報が中心である。

- フェーズステータス一覧（✅/⏳ の10フェーズ）
- コミットスカッシュの完了状況
- クリーンアップステータス（ワークフローディレクトリ削除状況）
- テスト結果（Passed/Pending）

これらの情報はワークフロー実行者にとっては有用だが、PRレビュアーが最も必要とする「何がなぜ変わったのか」「どこに注意してレビューすべきか」「テストは十分か」という情報が欠落している。

### 1.2 目的

PR Finalize 実行後に、AIエージェント（Codex / Claude）を活用して、レビュアー向けに最適化されたPRボディを自動生成する機能を追加する。具体的には、PR の diff 情報と各フェーズの成果物を AI に分析させ、レビュアーにとって実用的なPRボディを生成する。

### 1.3 ビジネス価値

| 価値 | 説明 |
|------|------|
| **レビュー品質の向上** | 変更の意図・影響範囲・注目ポイントが明示されることで、レビュアーが適切な観点でレビューできる |
| **レビュー時間の短縮** | コンテキスト情報が充実することで、diff を一から精読する必要が軽減される |
| **レビュアーの認知負荷軽減** | 大規模変更を含むPRでも、構造化された情報によりレビュー開始までの理解コストが大幅に削減される |

### 1.4 技術的価値

| 価値 | 説明 |
|------|------|
| **既存パターンの活用** | `AgentExecutor`、`PromptLoader`、`PullRequestClient` 等の既存モジュールを再利用し、一貫性のある実装を実現する |
| **フォールバック安全性** | AI生成失敗時は既存の `generateFinalPrBody` 出力に自動フォールバックし、信頼性を保証する |
| **多言語対応の拡張** | 既存の日英テンプレート・プロンプト配置パターンに従い、多言語対応を自然に実現する |

---

## 2. 機能要件

### FR-001: `--ai-rewrite` CLIオプションの追加（優先度: 高）

**説明**: `finalize` コマンドに `--ai-rewrite` フラグオプションを追加する。

**詳細仕様**:
- **オプション名**: `--ai-rewrite`
- **型**: Boolean フラグ
- **デフォルト値**: `false`
- **配置**: `src/main.ts` の finalize コマンド定義内
- **影響**: `FinalizeCommandOptions` インターフェースに `aiRewrite?: boolean` プロパティを追加

**既存オプションとの組み合わせ**:
- `--dry-run` と `--ai-rewrite` の同時指定: `--dry-run` が優先され、AI リライトのプレビュー情報（「AI リライトが有効です」等）を表示するが、実際のAI呼び出しは行わない
- `--skip-pr-update` と `--ai-rewrite` の同時指定: `--skip-pr-update` が優先され、AI リライトは実行されない（PR更新ステップ自体がスキップされるため）
- `--skip-squash` と `--ai-rewrite`: 独立して動作する（スカッシュスキップとAIリライトは無関係）

### FR-002: `--agent` CLIオプションの追加（優先度: 高）

**説明**: `finalize` コマンドに `--agent` オプションを追加し、AIリライト時に使用するエージェントモードを指定可能にする。

**詳細仕様**:
- **オプション名**: `--agent <mode>`
- **選択肢**: `auto` | `codex` | `claude`
- **デフォルト値**: `auto`
- **動作**: `--ai-rewrite` が有効な場合のみ使用される。`--ai-rewrite` が無効な場合は無視される
- **エージェント優先順**: `auto` モード時は `claude-first`（PRボディ生成はドキュメント作成タスクのため、Claude を優先する）

### FR-003: diff 情報の取得（優先度: 高）

**説明**: `PullRequestClient.getPullRequestDiff()` を利用してPRの diff 情報を取得し、AI プロンプトのコンテキストとして渡す。

**詳細仕様**:
- **使用メソッド**: `PullRequestClient.getPullRequestDiff(prNumber)`
- **戻り値**: `DiffResult { diff: string; truncated: boolean; filesChanged: number; }`
- **トランケーション戦略**:
  - `filesChanged <= 300` かつ `diff.length <= 50,000 文字`: diff 全文をプロンプトに含める
  - `filesChanged > 300` または `diff.length > 50,000 文字`: ファイル変更リスト（ファイル名 + 追加/削除行数のサマリー）のみをプロンプトに含める。プロンプト内で「diff が大規模なためサマリーのみ提供」と明示する
  - diff 取得失敗: diff なしでプロンプトを構築する（フェーズ成果物のみベース）。警告ログを出力する
- **トランケーション閾値**: 50,000 文字（定数として定義）

### FR-004: フェーズ成果物の収集（優先度: 高）

**説明**: `report.ts` の `getPhaseOutputs()` と同等のロジックで、各フェーズの成果物ファイルを収集し、AIプロンプトのコンテキストとして渡す。

**詳細仕様**:
- **収集対象フェーズ成果物**:

  | フェーズ | ファイルパス | 用途 |
  |---------|------------|------|
  | Planning | `00_planning/output/planning.md` | 実装戦略・タスク概要の理解 |
  | Requirements | `01_requirements/output/requirements.md` | 要件の把握 |
  | Design | `02_design/output/design.md` | 設計方針の理解 |
  | Test Scenario | `03_test_scenario/output/test-scenario.md` | テスト観点の理解 |
  | Implementation | `04_implementation/output/implementation.md` | 実装内容の詳細 |
  | Test Result | `06_testing/output/test-result.md` | テスト結果の把握 |
  | Documentation | `07_documentation/output/documentation-update-log.md` | ドキュメント更新内容 |

- **ファイル不在時の処理**: ファイルが存在しない場合はスキップし、利用可能な成果物のみでプロンプトを構築する。フォールバックテキスト（例: 「（このフェーズの成果物は利用できません）」）を使用する
- **成果物サイズ制限**: 各成果物ファイルの内容は最大 10,000 文字に制限し、超過時はトランケーションする（先頭から 10,000 文字を使用）

**重要な注意点**: finalize コマンドの Step 2（`executeStep2`）で `.ai-workflow/` ディレクトリが削除されるため、AIリライトのフェーズ成果物収集は Step 2 実行**前**に行う必要がある。具体的には、`handleFinalizeCommand` のフロー内で Step 2 実行前に成果物を収集・保持し、Step 4-5 の `executeStep4And5` でそのデータを使用する設計とする。

### FR-005: AIプロンプトの構築と実行（優先度: 高）

**説明**: 収集した情報を元にAIプロンプトを構築し、エージェントに送信してレビュアー向けPRボディを生成する。

**詳細仕様**:
- **プロンプトロード**: `PromptLoader.loadPrompt('finalize', 'rewrite_pr_body', language)` を使用
- **プロンプトコンテキスト変数**:
  - `{issue_number}`: Issue 番号
  - `{issue_title}`: Issue タイトル
  - `{diff_content}`: diff 情報（FR-003 に基づく）
  - `{phase_outputs}`: フェーズ成果物（FR-004 に基づく）
  - `{template_structure}`: テンプレートのセクション構成（出力の構造を指示するため）
- **エージェント初期化**: `resolveAgentCredentials()` + `setupAgentClients()` パターンを使用（`impact-analysis.ts`、`auto-issue.ts` の実装パターンに準拠）
- **エージェント実行**: `agent.executeTask()` を直接呼び出し（`AgentExecutor` クラスは使用せず、コマンドレベルで直接エージェントクライアントを利用する。`impact-analysis.ts` と同じパターン）
- **出力処理**: エージェントの出力からPRボディテキストを抽出する

### FR-006: PRボディテンプレートの作成（優先度: 高）

**説明**: レビュアー向けに最適化されたPRボディテンプレートを日英2言語で作成する。

**詳細仕様**:
- **テンプレートファイルパス**:
  - 日本語: `src/templates/ja/pr_body_finalize_template.md`
  - 英語: `src/templates/en/pr_body_finalize_template.md`
- **必須セクション構成**:

  | セクション | 説明 | 必須/任意 |
  |-----------|------|----------|
  | 変更概要 | PR全体の要約（1〜3文） | 必須 |
  | 変更の背景・目的 | Issue の内容を踏まえた変更理由 | 必須 |
  | 主要な変更点 | ファイル単位またはモジュール単位の変更内容リスト | 必須 |
  | レビュー時の注目ポイント | レビュアーが特に確認すべき箇所の提示 | 必須 |
  | テスト結果サマリー | テスト実行結果の要約 | 必須 |
  | 影響範囲 | 変更が影響する機能・モジュールの範囲 | 必須 |
  | スクリーンショット/動作確認 | 必要に応じた視覚的な確認情報 | 任意 |

- **Issue参照**: テンプレートには `Closes #<issue_number>` のリンクを含める

### FR-007: AIプロンプトファイルの作成（優先度: 高）

**説明**: AIエージェントがPRボディを生成するためのプロンプトファイルを日英2言語で作成する。

**詳細仕様**:
- **プロンプトファイルパス**:
  - 日本語: `src/prompts/finalize/ja/rewrite_pr_body.txt`
  - 英語: `src/prompts/finalize/en/rewrite_pr_body.txt`
- **プロンプト内容の要件**:
  - diff 情報、フェーズ成果物、Issue 情報をコンテキストとして含める
  - テンプレートのセクション構成に沿った出力を指示する
  - 具体的な出力例（few-shot）を含めて品質を安定させる
  - 各言語での出力指示を明示する（例: 「すべての内容を日本語で記述してください」）
- **`PromptCategory` 拡張**: `src/core/prompt-loader.ts` の `PromptCategory` 型に `'finalize'` を追加する

### FR-008: AI生成失敗時のフォールバック処理（優先度: 高）

**説明**: AI によるPRボディ生成が失敗した場合、既存の `generateFinalPrBody` 関数の出力にフォールバックする。

**詳細仕様**:
- **フォールバックチェーン**:
  1. AI リライト成功 → 生成されたPRボディを使用
  2. AI リライト失敗（エージェントエラー）→ 既存 `generateFinalPrBody()` 出力を使用 + 警告ログ出力
  3. AI リライト失敗（空出力 / 必須セクション欠落）→ 既存 `generateFinalPrBody()` 出力を使用 + 警告ログ出力
  4. AI リライトタイムアウト → 既存 `generateFinalPrBody()` 出力を使用 + 警告ログ出力
  5. エージェント認証エラー → 代替エージェントにフォールバック → それも失敗時は既存 `generateFinalPrBody()` 出力を使用
- **フォールバック条件の詳細**:
  - エージェント `executeTask()` が例外をスローした場合
  - エージェント出力が空（メッセージ配列が空、または結合テキストが空文字列）の場合
  - 生成されたPRボディに必須セクション（「変更概要」「主要な変更点」に相当するヘッダー）が1つも含まれない場合
- **フォールバック時のログ出力**: `logger.warn()` で警告メッセージを出力し、フォールバック理由を記録する

### FR-009: `--ai-rewrite` 未指定時の既存動作保持（優先度: 高）

**説明**: `--ai-rewrite` オプションが指定されていない場合、既存の finalize フローを100%保持する。

**詳細仕様**:
- `generateFinalPrBody` 関数の署名・実装は一切変更しない
- `executeStep4And5` 内に `--ai-rewrite` の分岐を追加するのみで、既存のコードパスには手を加えない
- 既存のユニットテスト（`tests/unit/commands/finalize.test.ts`）がすべてパスすることを保証する

### FR-010: 多言語対応（優先度: 中）

**説明**: AIリライト機能は日本語・英語の両方に対応する。

**詳細仕様**:
- `--language` オプション（または `config.getLanguage()`）で指定された言語に応じて、適切なプロンプトとテンプレートを使用する
- `PromptLoader` の言語フォールバック機構（指定言語が存在しない場合はデフォルト言語 `ja` にフォールバック）を活用する
- 生成されたPRボディの出力言語は、プロンプト内の言語指示に基づきAIが生成する

### FR-011: dry-run モード対応（優先度: 中）

**説明**: `--dry-run` モードで `--ai-rewrite` が指定された場合、AIリライトが実行される旨をプレビュー情報に含める。

**詳細仕様**:
- `previewFinalize()` 関数内で、`--ai-rewrite` フラグの状態を表示する
- 実際のAIエージェント呼び出しは行わない
- 表示例（日本語）: `[Step 4-5] PR更新: AI リライトが有効（エージェント: auto）`
- 表示例（英語）: `[Step 4-5] PR Update: AI rewrite enabled (agent: auto)`

---

## 3. 非機能要件

### NFR-001: パフォーマンス

| 要件 | 仕様 |
|------|------|
| **AIリライト処理時間** | 通常の PR（diff 50,000 文字以下）に対して、エージェント呼び出しからPRボディ生成完了まで 120 秒以内 |
| **diff トランケーション処理** | 50,000 文字超の diff に対するトランケーション処理は 1 秒以内に完了する |
| **フェーズ成果物収集** | 全成果物ファイルの読み込みは 5 秒以内に完了する |
| **フォールバック切り替え** | AI生成失敗からフォールバック出力の使用開始まで 3 秒以内 |

### NFR-002: セキュリティ

| 要件 | 仕様 |
|------|------|
| **認証情報の管理** | エージェント認証は既存の `resolveAgentCredentials()` パターンを使用し、`config.getCodexApiKey()` / `config.getClaudeCodeToken()` 経由でアクセスする。`process.env` の直接アクセスは行わない |
| **diff 内の機密情報** | AI プロンプトに含める diff はそのまま送信する（diff はGitHub API経由で取得した公開情報であり、PRの閲覧権限を持つユーザーと同等のアクセス範囲）。ただし、`.env` ファイルや `credentials.json` の diff が含まれる場合、これらはPR自体に含まれるものであり、AIエージェントに送信されてもセキュリティリスクの増大にはならない |
| **ReDoS 防止** | テンプレート変数の置換は `String.prototype.replaceAll()` を使用し、`new RegExp()` による動的正規表現生成は行わない（Issue #140, #161 準拠） |

### NFR-003: 可用性・信頼性

| 要件 | 仕様 |
|------|------|
| **フォールバック保証** | AIリライトが失敗した場合でも、既存の `generateFinalPrBody()` 出力によりPR更新は必ず完了する |
| **エージェントフォールバック** | `auto` モード時、プライマリエージェント失敗後に代替エージェントへの自動フォールバックを行う |
| **既存フローの安定性** | `--ai-rewrite` 未指定時は、既存フローに一切の影響を与えない（コードパスの分岐追加のみ） |
| **部分的な情報での動作** | diff 取得失敗、フェーズ成果物の部分欠落など、不完全な入力でもAI生成を試行する。十分な情報がない場合はフォールバックに切り替わる |

### NFR-004: 保守性・拡張性

| 要件 | 仕様 |
|------|------|
| **コーディング規約準拠** | ロギング規約（`logger` モジュール使用）、エラーハンドリング規約（`getErrorMessage()` 使用）、環境変数規約（`config` クラス使用）を厳守する |
| **既存パターンの再利用** | エージェント初期化は `resolveAgentCredentials()` + `setupAgentClients()` パターン、プロンプトは `PromptLoader`、テンプレートは既存ディレクトリ構造に従う |
| **テンプレート変更容易性** | PRボディのセクション構成はテンプレートファイル（Markdown）で管理し、TypeScript コードの変更なしにセクション構成を変更可能にする |
| **プロンプトのチューニング容易性** | AIプロンプトは `.txt` ファイルとして外部管理し、コード変更なしにプロンプトの改善を行える |

### NFR-005: ビルド・デプロイ

| 要件 | 仕様 |
|------|------|
| **ビルドコピー** | `npm run build` で新規プロンプト・テンプレートファイルが `dist/` ディレクトリに正しくコピーされること |
| **ビルド検証** | `npm run validate`（lint + test + build）が成功すること |
| **既存ビルドプロセス互換性** | 既存の `copy-prompts` / `copy-templates` スクリプトの仕組みを利用し、新規ビルド設定の追加は不要であること |

---

## 4. 制約事項

### 4.1 技術的制約

| 制約 | 説明 |
|------|------|
| **TC-001: TypeScript** | 実装は TypeScript で行い、既存のプロジェクト設定（`tsconfig.json`）に従う |
| **TC-002: 既存依存のみ使用** | 新規 npm パッケージの追加は行わない。`@octokit/rest`、`simple-git`、`@anthropic-ai/claude-agent-sdk` 等の既存依存のみ使用する |
| **TC-003: PromptLoader 準拠** | プロンプトの読み込みは `PromptLoader` を使用し、独自のファイル読み込みロジックは実装しない |
| **TC-004: エージェントクライアント準拠** | エージェント呼び出しは `CodexAgentClient` / `ClaudeAgentClient` の `executeTask()` メソッドを使用する |
| **TC-005: finalize フロー順序** | finalize コマンドの 5 ステップの実行順序（Step 1→2→3→4-5）は変更しない。AIリライトは Step 4-5 内で実行する |
| **TC-006: diff トークン制限** | AIプロンプトに含める diff テキストは最大 50,000 文字とし、超過時はトランケーションする |
| **TC-007: 成果物収集タイミング** | フェーズ成果物の収集は Step 2（`.ai-workflow/` 削除）の実行前に行う必要がある |

### 4.2 ポリシー制約

| 制約 | 説明 |
|------|------|
| **PC-001: ロギング規約** | `console.log` / `console.error` 等の直接使用は禁止。`src/utils/logger.ts` の `logger` モジュールを使用する（Issue #61, #829） |
| **PC-002: エラーハンドリング規約** | `as Error` 型アサーションは禁止。`src/utils/error-utils.ts` の `getErrorMessage()` / `getErrorStack()` を使用する（Issue #48） |
| **PC-003: 環境変数アクセス規約** | `process.env` の直接アクセスは禁止。`src/core/config.ts` の `config` クラスを使用する（Issue #51） |
| **PC-004: ReDoS 防止** | テンプレート変数置換には `String.prototype.replaceAll()` を使用する（Issue #140, #161） |
| **PC-005: テストコード品質** | モッククリーンアップ（`jest.restoreAllMocks()`）を `afterEach()` で必ず実行する。TypeScript 5.x + Jest の型互換性に注意する |

---

## 5. 前提条件

### 5.1 システム環境

| 前提条件 | 説明 |
|---------|------|
| **Node.js** | バージョン 20 以上 |
| **npm** | バージョン 10 以上 |
| **TypeScript** | プロジェクトの `tsconfig.json` に従うバージョン |
| **Git** | ローカルリポジトリがクリーンな作業ツリーを持つこと |

### 5.2 認証環境

| 前提条件 | 説明 |
|---------|------|
| **GitHub Token** | `GITHUB_TOKEN` が設定されていること（PRの読み取り・更新に必要） |
| **エージェント認証** | `--ai-rewrite` 使用時は、Codex または Claude のいずれかの認証情報が設定されていること。未設定の場合はフォールバック（既存 `generateFinalPrBody` 出力）を使用する |

### 5.3 依存コンポーネント

| コンポーネント | 説明 |
|--------------|------|
| **PullRequestClient** | `getPullRequestDiff()` メソッドが正常に動作すること（GitHub API アクセス） |
| **PromptLoader** | `loadPrompt()` メソッドが `'finalize'` カテゴリに対応すること |
| **CodexAgentClient / ClaudeAgentClient** | `executeTask()` メソッドが正常に動作すること |
| **MetadataManager** | メタデータファイル（`metadata.json`）からIssue情報を取得できること |
| **既存 finalize フロー** | Step 1〜3 が正常に完了した状態で Step 4-5 が実行されること |

### 5.4 データ前提条件

| 前提条件 | 説明 |
|---------|------|
| **PRの存在** | finalize 対象の Issue に紐づくPRが存在すること |
| **フェーズ成果物** | 必須ではないが、少なくとも一部のフェーズ成果物（`.ai-workflow/issue-<NUM>/` 配下）が存在することが望ましい。全成果物が不在の場合でもフォールバックが機能する |

---

## 6. 受け入れ基準

### AC-001: `--ai-rewrite` オプションの基本動作

```
Given: finalize コマンドに --ai-rewrite オプションが定義されている
When: ユーザーが `node dist/index.js finalize --issue 123 --ai-rewrite` を実行する
Then: AIエージェントがPRの diff とフェーズ成果物を分析し、レビュアー向けのPRボディを生成してPRを更新する
```

### AC-002: `--ai-rewrite` 未指定時の既存動作

```
Given: finalize コマンドが --ai-rewrite なしで実行される
When: ユーザーが `node dist/index.js finalize --issue 123` を実行する
Then: 既存の generateFinalPrBody() が生成するPRボディ（フェーズステータス一覧、クリーンアップ状況）でPRが更新される
And: 既存のテストケース（UC-32, UC-33 等）がすべてパスする
```

### AC-003: AI生成PRボディの必須セクション

```
Given: --ai-rewrite オプションが有効で、AIエージェントが正常にPRボディを生成する
When: 生成されたPRボディが検証される
Then: PRボディに以下の必須セクションがすべて含まれる:
  - 変更概要（Summary of Changes）
  - 変更の背景・目的（Background & Purpose）
  - 主要な変更点（Key Changes）
  - レビュー時の注目ポイント（Review Focus Points）
  - テスト結果サマリー（Test Results Summary）
  - 影響範囲（Impact Scope）
```

### AC-004: AI生成失敗時のフォールバック

```
Given: --ai-rewrite オプションが有効だが、AIエージェントがエラーを返す（認証エラー、タイムアウト、空出力）
When: エージェント呼び出しが失敗する
Then: 既存の generateFinalPrBody() の出力がフォールバックとして使用される
And: logger.warn() で警告メッセージが出力される
And: PRは正常に更新される（finalize プロセス全体は失敗しない）
```

### AC-005: 大規模 diff のトランケーション

```
Given: PR の diff が 50,000 文字を超える、または filesChanged が 300 を超える
When: AI リライトが実行される
Then: diff 情報はトランケーションされ、ファイル変更リストのサマリーのみがプロンプトに含まれる
And: プロンプト内で「diff が大規模なためサマリーのみ提供」と明示される
And: AI は利用可能な情報のみでPRボディを生成する
```

### AC-006: フェーズ成果物の部分欠落

```
Given: 一部のフェーズ成果物ファイルが存在しない（例: test-result.md が未生成）
When: フェーズ成果物の収集が実行される
Then: 存在するファイルのみが収集される
And: 不在のファイルに対してはフォールバックテキストが使用される
And: AI は利用可能な成果物のみでPRボディを生成する
```

### AC-007: 全フェーズ成果物が不在の場合

```
Given: すべてのフェーズ成果物ファイルが存在しない
When: AI リライトが実行される
Then: diff 情報のみでPRボディ生成を試行する
And: diff も取得できない場合はフォールバック（既存 generateFinalPrBody 出力）を使用する
```

### AC-008: 日本語テンプレート・プロンプトの動作

```
Given: --language ja が指定されている（またはデフォルト言語が ja）
When: AI リライトが実行される
Then: 日本語のプロンプト（src/prompts/finalize/ja/rewrite_pr_body.txt）が使用される
And: 生成されるPRボディは日本語で記述される
```

### AC-009: 英語テンプレート・プロンプトの動作

```
Given: --language en が指定されている
When: AI リライトが実行される
Then: 英語のプロンプト（src/prompts/finalize/en/rewrite_pr_body.txt）が使用される
And: 生成されるPRボディは英語で記述される
```

### AC-010: --dry-run との組み合わせ

```
Given: --dry-run と --ai-rewrite が同時に指定されている
When: finalize コマンドが実行される
Then: AIリライトのプレビュー情報（「AI リライトが有効です」等）が表示される
And: 実際のAIエージェント呼び出しは行われない
And: PR は更新されない
```

### AC-011: --skip-pr-update との組み合わせ

```
Given: --skip-pr-update と --ai-rewrite が同時に指定されている
When: finalize コマンドが実行される
Then: Steps 4-5 がスキップされるため、AI リライトも実行されない
And: 警告やエラーは発生しない
```

### AC-012: エージェント認証情報未設定時の動作

```
Given: --ai-rewrite が有効だが、Codex / Claude のいずれの認証情報も設定されていない
When: finalize コマンドが実行される
Then: エージェント初期化に失敗し、フォールバック（既存 generateFinalPrBody 出力）が使用される
And: logger.warn() でエージェント認証情報が未設定である旨の警告が出力される
And: finalize プロセス全体は正常に完了する
```

### AC-013: ビルド・デプロイの正常性

```
Given: 新規プロンプト・テンプレートファイルが追加されている
When: npm run build が実行される
Then: 新規ファイルが dist/prompts/finalize/ と dist/templates/ に正しくコピーされる
And: npm run validate（lint + test + build）が成功する
```

### AC-014: 既存テストの回帰なし

```
Given: AI リライト機能の実装が完了している
When: npm run test:unit および npm run test:integration が実行される
Then: 既存のすべてのテストケースがパスする
And: 新規テストケースもすべてパスする
```

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

| 項目 | 理由 |
|------|------|
| **PR ボディの手動編集 UI** | 本機能はCLIベースの自動生成であり、UI コンポーネントは提供しない |
| **AI 生成結果の人間による承認フロー** | 生成結果は自動でPRボディに反映される。レビュアーが内容を確認した上でPRをレビューする |
| **AI 生成結果のキャッシュ** | 同一PRに対する複数回の AI リライトで、前回結果を再利用するキャッシュ機構は実装しない |
| **スクリーンショットの自動生成** | PRボディテンプレートにスクリーンショットセクションを含めるが、スクリーンショットの自動キャプチャ機能は実装しない |
| **AI 生成品質のメトリクス収集** | AI生成PRボディの品質を定量的に評価する仕組みは本スコープでは実装しない |
| **`--ai-rewrite` のデフォルト有効化** | 初期リリースではオプトイン（明示的に `--ai-rewrite` を指定する必要がある）とし、デフォルト有効化は行わない |
| **finalize 以外のコマンドへのAIリライト適用** | 本機能は finalize コマンドのみを対象とし、他のコマンド（init, execute 等）への適用は行わない |
| **Jenkinsfile の更新** | Jenkins の finalize ジョブ定義（`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`）への `--ai-rewrite` オプション追加は、本スコープの実装完了後に別途対応する |

### 7.2 将来的な拡張候補

| 候補 | 説明 |
|------|------|
| **`--ai-rewrite` のデフォルト有効化** | 品質が安定した後、`--ai-rewrite` をデフォルト `true` に変更する |
| **PRボディのインタラクティブ編集** | AI 生成結果を人間が編集した上で PR に反映する機能 |
| **AI 生成品質のフィードバックループ** | レビュアーのフィードバックを収集し、プロンプトの自動改善に活用する |
| **diff サマリー生成の高度化** | 大規模 diff に対して、ファイル変更リストだけでなく、変更の意味的なグルーピングとサマリーを生成する |
| **PR レビューコメントとの連携** | AI 生成PRボディに基づいて、レビューコメントのテンプレートを自動生成する |

---

## 付録

### A. 用語集

| 用語 | 説明 |
|------|------|
| **AI リライト** | 既存の finalize PRボディを、AIエージェントを使ってレビュアー向けに最適化された内容に書き換える機能 |
| **フォールバック** | AI 生成が失敗した場合に、既存の `generateFinalPrBody()` 出力を使用する安全機構 |
| **フェーズ成果物** | 10フェーズワークフローの各フェーズで生成される出力ファイル（planning.md, requirements.md 等） |
| **トランケーション** | 大規模な diff やフェーズ成果物を、AI プロンプトのトークン制限に収まるよう切り詰める処理 |
| **エージェントモード** | `auto`（自動選択）、`codex`（Codex のみ）、`claude`（Claude のみ）の3つのエージェント選択モード |

### B. 関連ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `src/commands/finalize.ts` | 修正 | `--ai-rewrite` 判定ロジック追加、AI リライト関数追加、`FinalizeCommandOptions` 拡張 |
| `src/main.ts` | 修正 | finalize コマンドに `--ai-rewrite` および `--agent` オプション定義追加 |
| `src/core/prompt-loader.ts` | 修正 | `PromptCategory` 型に `'finalize'` を追加 |
| `src/templates/ja/pr_body_finalize_template.md` | 新規 | 日本語PRボディテンプレート |
| `src/templates/en/pr_body_finalize_template.md` | 新規 | 英語PRボディテンプレート |
| `src/prompts/finalize/ja/rewrite_pr_body.txt` | 新規 | 日本語AIプロンプト |
| `src/prompts/finalize/en/rewrite_pr_body.txt` | 新規 | 英語AIプロンプト |
| `tests/unit/commands/finalize.test.ts` | 修正 | `--ai-rewrite` 関連テストケース追加 |
| `tests/unit/commands/finalize-ai-rewrite.test.ts` | 新規 | AIリライト専用テストファイル |
| `tests/integration/finalize-command.test.ts` | 修正 | `--ai-rewrite` シナリオのテストケース追加 |

### C. データフロー図

```
┌─────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│  finalize CLI   │     │   handleFinalize      │     │   executeStep2    │
│  --ai-rewrite   │────>│   Command()           │────>│   (.ai-workflow   │
│  --agent auto   │     │                       │     │    削除)          │
│  --issue 123    │     │   ┌───────────────┐   │     └───────────────────┘
└─────────────────┘     │   │ 成果物収集     │   │              │
                        │   │ (Step2実行前)  │   │              ▼
                        │   │ ・planning.md  │   │     ┌───────────────────┐
                        │   │ ・design.md    │   │     │   executeStep3    │
                        │   │ ・test-result  │   │     │   (スカッシュ)    │
                        │   │   .md 等       │   │     └───────────────────┘
                        │   └───────┬───────┘   │              │
                        │           │            │              ▼
                        │           ▼            │     ┌───────────────────────┐
                        │   ┌───────────────┐   │     │   executeStep4And5    │
                        │   │ 収集データ保持  │──────>│                       │
                        │   └───────────────┘   │     │   ┌───────────────┐   │
                        └───────────────────────┘     │   │ --ai-rewrite? │   │
                                                      │   └───┬───────┬───┘   │
                                                      │   Yes │       │ No    │
                                                      │       ▼       ▼       │
                                                      │ ┌──────────┐ ┌─────┐ │
                                                      │ │AI Rewrite│ │既存  │ │
                                                      │ │フロー    │ │フロー│ │
                                                      │ └────┬─────┘ └──┬──┘ │
                                                      │      ▼          │     │
                                                      │ ┌──────────┐    │     │
                                                      │ │diff取得   │    │     │
                                                      │ │成果物統合 │    │     │
                                                      │ │プロンプト │    │     │
                                                      │ │構築      │    │     │
                                                      │ └────┬─────┘    │     │
                                                      │      ▼          │     │
                                                      │ ┌──────────┐    │     │
                                                      │ │Agent     │    │     │
                                                      │ │実行      │    │     │
                                                      │ └────┬─────┘    │     │
                                                      │      │          │     │
                                                      │  成功│  失敗    │     │
                                                      │      │   │      │     │
                                                      │      │   ▼      │     │
                                                      │      │ ┌─────┐  │     │
                                                      │      │ │Fall │──┘     │
                                                      │      │ │back │        │
                                                      │      │ └─────┘        │
                                                      │      ▼                │
                                                      │ ┌──────────────┐      │
                                                      │ │PR Body更新   │◄─────┘
                                                      │ │updatePR()    │
                                                      │ └──────────────┘
                                                      └───────────────────────┘
```

### D. 品質ゲートチェックリスト（Phase 1: 要件定義）

- [x] **機能要件が明確に記載されている**: FR-001〜FR-011 で11件の機能要件を定義済み。各要件に詳細仕様を記載
- [x] **受け入れ基準が定義されている**: AC-001〜AC-014 で14件の受け入れ基準を Given-When-Then 形式で定義済み
- [x] **スコープが明確である**: セクション7「スコープ外」で明確にスコープ外事項を定義済み
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準の対応関係を確認済み。非機能要件と制約事項に矛盾なし。フォールバック戦略が一貫している
