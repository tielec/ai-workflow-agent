# 詳細設計書: Issue #888

## PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装

---

## 0. Planning Document / 要件定義書の確認

### Planning Documentの方針

Planning Document（`.ai-workflow/issue-888/00_planning/output/planning.md`）で策定された以下の方針を本設計に反映する。

- **実装戦略**: EXTEND（既存の `src/commands/finalize.ts` への機能拡張が中心）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト＋統合テストの組み合わせ）
- **テストコード戦略**: BOTH_TEST（既存テストファイルの拡充＋新規テストファイル作成）
- **複雑度**: 中程度（主要実装は完了済み、テスト拡充・ドキュメント更新が主な残作業）
- **見積もり工数**: 12〜16時間

### 要件定義書との整合性

要件定義書（`.ai-workflow/issue-888/01_requirements/output/requirements.md`）で定義されたFR-001〜FR-013の機能要件、NFR-001〜NFR-006の非機能要件、AC-001〜AC-012の受け入れ基準を本設計に反映している。

### 実装状況の確認

コードベースの精査により、**主要な実装はすでに完了**していることを確認した。

| コンポーネント | 状態 | 設計レビュー結果 |
|---|---|---|
| `src/commands/finalize.ts`（AIリライトロジック全体） | ✅ 実装完了 | 設計妥当性確認済み（後述） |
| `src/main.ts`（CLIオプション `--ai-rewrite`, `--agent`） | ✅ 実装完了 | 正常に登録済み |
| `src/templates/{ja,en}/pr_body_finalize_template.md` | ✅ 作成済み | セクション構成適切 |
| `src/prompts/finalize/{ja,en}/rewrite_pr_body.txt` | ✅ 作成済み | プロンプト品質良好 |
| `src/core/prompt-loader.ts`（`finalize`カテゴリ） | ✅ 対応済み | `PromptCategory`型に含まれている |
| `tests/unit/commands/finalize.test.ts` | ⚠️ AIリライト固有テスト未実装 | 追加必要 |
| `tests/integration/finalize-command.test.ts` | ⚠️ AIリライト固有テスト未実装 | 追加必要 |
| `docs/CLI_REFERENCE.md` | ❌ 未更新 | `--ai-rewrite`、`--agent`の記載なし |
| `README.md` | ❌ 未更新 | finalize説明にAIリライト未記載 |
| Jenkins Finalize Jenkinsfile | ⚠️ `AGENT_MODE`のみ対応 | `AI_REWRITE`パラメータ未追加 |

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI Layer (src/main.ts)                                        │
│  finalize --issue <NUM> --ai-rewrite [--agent auto|codex|claude]│
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Command Layer (src/commands/finalize.ts)                        │
│                                                                 │
│  handleFinalizeCommand(options)                                  │
│  ├─ 1. validateFinalizeOptions()                                │
│  ├─ 2. loadWorkflowMetadata()                                   │
│  ├─ 3. [dryRun?] → previewFinalize()                           │
│  ├─ 4. [aiRewrite?] → collectPhaseOutputs()   ★事前収集        │
│  ├─ 5. executeStep1() → base_commit + HEAD                     │
│  ├─ 6. executeStep2() → .ai-workflow/ 削除                     │
│  ├─ 7. executeStep3() → コミットスカッシュ                      │
│  └─ 8. executeStep4And5() → PR 更新 + ドラフト解除             │
│       ├─ fallbackBody = generateFinalPrBody()                   │
│       ├─ [aiRewrite?] → generateAiRewrittenPrBody()             │
│       │   ├─ getDiffForPrompt()                                 │
│       │   ├─ buildPromptContext()                                │
│       │   ├─ setupAgentClients()                                │
│       │   ├─ executeAgentTask()                                 │
│       │   └─ validateRequiredSections()                         │
│       └─ prClient.updatePullRequest()                           │
└─────────────┬───────────────────────────────────────────────────┘
              │
    ┌─────────┼─────────┬────────────┬──────────────┐
    ▼         ▼         ▼            ▼              ▼
┌────────┐┌────────┐┌─────────┐┌──────────┐┌────────────────┐
│Metadata││Prompt  ││Agent    ││GitHub    ││Git             │
│Manager ││Loader  ││Clients  ││Client    ││Manager         │
│        ││        ││         ││          ││                │
│.ai-    ││prompts/││Claude   ││PR Client ││ArtifactCleaner │
│workflow││templates││Codex   ││ ├ getDiff ││SquashManager   │
│/issue-*││        ││         ││ ├ update  ││                │
│        ││        ││         ││ └ ready   ││                │
└────────┘└────────┘└─────────┘└──────────┘└────────────────┘
```

### 1.2 コンポーネント間の関係

| コンポーネント | 役割 | 依存先 |
|---|---|---|
| `handleFinalizeCommand()` | エントリーポイント、オーケストレーション | MetadataManager, GitManager, ArtifactCleaner, GitHubClient |
| `collectPhaseOutputs()` | フェーズ成果物の事前収集（FR-004） | MetadataManager（workflowDir）, fs |
| `getDiffForPrompt()` | diff取得・トランケーション（FR-003） | PullRequestClient |
| `buildPromptContext()` | プロンプト構築（FR-005） | PromptLoader |
| `executeAgentTask()` | エージェント実行・フォールバック（FR-007） | ClaudeAgentClient, CodexAgentClient |
| `validateRequiredSections()` | 必須セクション検証（FR-008） | なし（純粋関数） |
| `generateAiRewrittenPrBody()` | AIリライト統合オーケストレーション | 上記すべて + agent-setup |
| `generateFinalPrBody()` | 従来のPRボディ生成（FR-009: フォールバック） | MetadataManager |

### 1.3 データフロー

```
入力データ:
  ├─ CLI オプション: --issue, --ai-rewrite, --agent
  ├─ メタデータ: issue_number, issue_title, language, phases, pr_number
  ├─ フェーズ成果物: planning.md, requirements.md, design.md, ...
  └─ PR diff: GitHub API 経由

処理フロー:
  1. フェーズ成果物を .ai-workflow/ 削除前に収集
     → CollectedPhaseOutputs { outputs, collectedCount, totalCount }

  2. PR diff を GitHub API 経由で取得
     → DiffContext { content, wasTruncated, filesChanged }

  3. プロンプトテンプレート + テンプレート構造を読み込み
     → プレースホルダー置換でプロンプト文字列を構築

  4. エージェントにプロンプトを送信
     → 生成されたPRボディ（Markdown文字列）

  5. 必須セクション検証
     → 成功: AI生成ボディ / 失敗: フォールバック

出力:
  └─ PR 本文（Markdown）→ GitHub PR 更新
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- 主要な実装はすべて既存の `src/commands/finalize.ts` に追加済みであり、新規モジュールやクラスの作成は不要
- `src/main.ts` への `--ai-rewrite`、`--agent` オプション登録も完了済み
- テンプレート（`src/templates/{ja,en}/pr_body_finalize_template.md`）とプロンプト（`src/prompts/finalize/{ja,en}/rewrite_pr_body.txt`）も作成済み
- `PromptLoader` の `finalize` カテゴリサポートも実装済み
- 残作業はテストの拡充、ドキュメント更新、Jenkinsパラメータ追加であり、すべて既存コードベースの拡張に該当する
- 新規ファイル作成はテストファイル（1件）のみであり、既存パターンに準拠する

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
- **ユニットテスト**: AIリライト機能の各ヘルパー関数（`collectPhaseOutputs`、`getDiffForPrompt`、`buildPromptContext`、`validateRequiredSections`、`executeAgentTask`、`generateAiRewrittenPrBody`）は外部依存（GitHub API、AIエージェント、ファイルシステム）をモック化して個別にテスト可能であり、ユニットテストが最も効率的
- **統合テスト**: `--ai-rewrite` フラグ有効時のエンドツーエンドフロー（CLI → finalize → AIリライト → PR更新）は複数モジュールの連携を検証する統合テストが必要
- BDDテストは不要: エンドユーザー向けUIではなくCLIツールであり、ユーザーストーリー駆動のテストよりも機能的なテストが適切
- 既存テスト（`finalize.test.ts`、`finalize-command.test.ts`）のパターンとの整合性を維持

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:
- **EXTEND_TEST（既存テストの拡張）**:
  - `tests/unit/commands/finalize.test.ts`: 既存のバリデーション・PRボディ生成・プレビューモードテストに、AIリライト有効時のドライラン表示テストケースを追加
  - `tests/integration/finalize-command.test.ts`: 既存の統合テストに、AIリライトフロー（モック使用）の統合テストケースを追加
- **CREATE_TEST（新規テスト作成）**:
  - `tests/unit/commands/finalize-ai-rewrite.test.ts`: AIリライト固有のヘルパー関数群（`collectPhaseOutputs`、`getDiffForPrompt`、`buildPromptContext`、`validateRequiredSections`、`executeAgentTask`）は関心の分離のため新規テストファイルでカバー。既存テストファイルとの責務を明確に分離し、テストの可読性と保守性を向上させる
- 既存テストファイルは従来の finalize 機能（バリデーション、generateFinalPrBody、プレビュー、エラーケース）に集中しており、AIリライト固有の大量のテストケース（モック戦略が異なる）を同一ファイルに混在させると肥大化するため

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

| ファイル | 変更種別 | 影響範囲 | FR対応 |
|---|---|---|---|
| `src/commands/finalize.ts` | 実装済み・微調整のみ | AIリライト関数群は実装完了。プロンプトチューニング時に微調整の可能性あり | FR-001〜FR-009 |
| `src/main.ts` | 実装済み・変更不要 | `--ai-rewrite`、`--agent`オプションは登録済み | FR-001, FR-002 |
| `src/templates/{ja,en}/pr_body_finalize_template.md` | 作成済み・チューニング | セクション構成は完成。実運用テスト後に微調整の可能性あり | FR-006 |
| `src/prompts/finalize/{ja,en}/rewrite_pr_body.txt` | 作成済み・チューニング | プロンプト品質の検証と改善 | FR-005 |
| `src/core/prompt-loader.ts` | 実装済み・変更不要 | `finalize`カテゴリは既にサポート済み | FR-005 |
| `tests/unit/commands/finalize.test.ts` | **テスト追加必要** | AIリライトドライラン表示テストケース追加 | FR-010 |
| `tests/integration/finalize-command.test.ts` | **テスト追加必要** | AIリライトフロー統合テスト追加 | FR-010 |
| `docs/CLI_REFERENCE.md` | **更新必要** | `--ai-rewrite`、`--agent`オプション説明追加 | FR-012 |
| `README.md` | **更新必要** | finalizeコマンド説明にAIリライト機能追記 | FR-012 |
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` | **更新必要** | `AI_REWRITE`パラメータ追加 | FR-013 |

### 5.2 依存関係の変更

- **新規依存の追加**: なし（既存の `PromptLoader`、`ClaudeAgentClient`、`CodexAgentClient`、`PullRequestClient`、`resolveAgentCredentials`、`setupAgentClients` を再利用）
- **既存依存の変更**: なし
- **使用する既存モジュール**:

| モジュール | 用途 | ファイルパス |
|---|---|---|
| PromptLoader | プロンプト・テンプレートの読み込み | `src/core/prompt-loader.ts` |
| resolveAgentCredentials | エージェント認証情報の解決 | `src/commands/execute/agent-setup.ts` |
| setupAgentClients | エージェントクライアントの初期化 | `src/commands/execute/agent-setup.ts` |
| ClaudeAgentClient | Claudeエージェントのタスク実行 | `src/core/claude-agent-client.ts` |
| CodexAgentClient | Codexエージェントのタスク実行 | `src/core/codex-agent-client.ts` |
| PullRequestClient | PRのdiff取得・本文更新・ドラフト解除 | `src/core/github/pull-request-client.ts` |
| MetadataManager | メタデータの読み込み・フェーズ情報取得 | `src/core/metadata-manager.ts` |
| config | 環境変数アクセス | `src/core/config.ts` |
| logger | ログ出力 | `src/utils/logger.ts` |
| getErrorMessage | エラーメッセージ取得 | `src/utils/error-utils.ts` |

### 5.3 マイグレーション要否

- **データベーススキーマ変更**: 不要
- **設定ファイル変更**: 不要（新規環境変数の追加なし）
- **メタデータ形式変更**: 不要（`metadata.json`のスキーマ変更なし）
- **後方互換性**: 完全維持（`--ai-rewrite`未指定時は従来と100%同一動作: FR-009）

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

| ファイルパス | 目的 |
|---|---|
| `tests/unit/commands/finalize-ai-rewrite.test.ts` | AIリライト固有のヘルパー関数群のユニットテスト |

### 6.2 修正が必要な既存ファイル

| ファイルパス | 変更内容 | 優先度 |
|---|---|---|
| `tests/unit/commands/finalize.test.ts` | AIリライトドライラン表示テストケース追加 | 高 |
| `tests/integration/finalize-command.test.ts` | AIリライトフロー統合テスト追加 | 高 |
| `docs/CLI_REFERENCE.md` | `--ai-rewrite`、`--agent`オプション説明追加 | 中 |
| `README.md` | finalizeコマンド説明にAIリライト機能追記 | 中 |
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` | `AI_REWRITE`パラメータ追加 | 低 |
| `src/prompts/finalize/{ja,en}/rewrite_pr_body.txt` | プロンプト品質チューニング（必要に応じて） | 低 |
| `src/templates/{ja,en}/pr_body_finalize_template.md` | テンプレートチューニング（必要に応じて） | 低 |

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 既存実装の設計レビュー

#### 7.1.1 型定義

`finalize.ts` に定義されている型は要件定義書のデータ構造と整合している。

```typescript
// CLIオプション型
interface FinalizeCommandOptions {
  issue: string;
  dryRun?: boolean;
  skipSquash?: boolean;
  skipPrUpdate?: boolean;
  baseBranch?: string;
  aiRewrite?: boolean;   // FR-001
  agent?: 'auto' | 'codex' | 'claude';  // FR-002
}

// フェーズ成果物の収集結果型
interface CollectedPhaseOutputs {
  outputs: Record<string, string>;  // フェーズ名 → 成果物テキスト
  collectedCount: number;           // 実在ファイル数
  totalCount: number;               // 全フェーズ数
}

// プロンプト用diff情報型
interface DiffContext {
  content: string;       // diffテキストまたはサマリー
  wasTruncated: boolean; // トランケーション実施有無
  filesChanged: number;  // 変更ファイル数
}
```

#### 7.1.2 定数定義

```typescript
const MAX_PHASE_OUTPUT_LENGTH = 10_000;  // FR-004: 成果物の最大文字数
const MAX_DIFF_LENGTH = 50_000;          // FR-003: diffの最大文字数
const MAX_DIFF_FILES_THRESHOLD = 300;    // FR-003: diffファイル数上限
```

### 7.2 関数設計の詳細レビュー

#### 7.2.1 `collectPhaseOutputs()` — フェーズ成果物収集（FR-004）

```
入力: metadataManager: MetadataManager
出力: CollectedPhaseOutputs

処理フロー:
1. workflowDir を MetadataManager から取得
2. 7つのフェーズ成果物ファイルパスを構築:
   - 00_planning/output/planning.md
   - 01_requirements/output/requirements.md
   - 02_design/output/design.md
   - 03_test_scenario/output/test-scenario.md
   - 04_implementation/output/implementation.md
   - 06_testing/output/test-result.md
   - 07_documentation/output/documentation-update-log.md
3. 各ファイルに対して:
   a. ファイル存在チェック (fs.existsSync)
   b. 存在する場合: fs.readFileSync で読み込み
      - 10,000文字超の場合は切り詰め + '... (以降省略)' 付加
   c. 存在しない場合: フォールバックテキスト設定
   d. 読み込みエラー: フォールバックテキスト + 警告ログ
4. CollectedPhaseOutputs を返却

エラーハンドリング:
- try-catch で個別ファイルの読み込みエラーを捕捉
- getErrorMessage() で安全にエラーメッセージを取得（NFR-006準拠）
- ファイルごとに独立して処理し、1件の失敗が全体に波及しない
```

**設計レビュー結果**: 妥当。以下の点を確認済み。
- `fs.readFileSync` は同期I/Oだが、ローカルファイルの読み込みであり性能問題なし
- 個別ファイルの例外が全体に伝播しないtry-catchが適切に配置
- ロギング規約（`logger`モジュール使用）準拠
- エラーハンドリング規約（`getErrorMessage()`使用）準拠

#### 7.2.2 `getDiffForPrompt()` — diff取得・トランケーション（FR-003）

```
入力: prClient: PullRequestClient, prNumber: number
出力: DiffContext

処理フロー:
1. prClient.getPullRequestDiff(prNumber) でdiffを取得
2. トランケーション判定:
   a. filesChanged > 300 OR diff.length > 50,000
      → extractDiffFileSummary() でファイル変更サマリーを生成
      → wasTruncated = true
   b. それ以外
      → diff全文を返却
      → wasTruncated = false
3. diff取得失敗時:
   → フォールバックテキスト返却
   → wasTruncated = false, filesChanged = 0

extractDiffFileSummary() の処理:
- diff テキストを行ごとにパース
- 'diff --git' ヘッダーからファイル名を抽出
- '+'/'-' で始まる行をカウント（追加/削除）
- Markdownリスト形式でサマリーを生成
```

**設計レビュー結果**: 妥当。以下の点を確認済み。
- `PullRequestClient.getPullRequestDiff()` の `DiffResult` 型（`diff`, `truncated`, `filesChanged`）と整合
- トランケーション戦略が要件（FR-003）と一致
- エラー時のフォールバックが実装され、diff取得失敗がAIリライト全体をブロックしない
- `extractDiffFileSummary()` の正規表現は `line.match(/diff --git a\/.+ b\/(.+)/)` のみで、リテラルパターンであるためReDoSリスクなし

#### 7.2.3 `buildPromptContext()` — プロンプト構築（FR-005）

```
入力:
  issueNumber: number
  issueTitle: string
  diffContext: DiffContext
  phaseOutputs: CollectedPhaseOutputs
  language: SupportedLanguage
出力: string（構築されたプロンプト文字列）

処理フロー:
1. PromptLoader.loadPrompt('finalize', 'rewrite_pr_body', language) でプロンプトテンプレート読み込み
2. PromptLoader.loadTemplate('pr_body_finalize_template.md', language) でPRボディテンプレート読み込み
3. フェーズ成果物を結合テキストに変換（'### <phase>\n\n<content>' 形式）
4. replaceAll() でプレースホルダーを置換:
   - {issue_number} → Issue番号
   - {issue_title} → Issueタイトル
   - {diff_content} → diff情報
   - {phase_outputs} → フェーズ成果物テキスト
   - {template_structure} → PRボディテンプレート
5. 構築されたプロンプト文字列を返却
```

**設計レビュー結果**: 妥当。以下の点を確認済み。
- `replaceAll()` 使用でReDoS防止（NFR-002準拠、CLAUDE.md §4準拠）
- `PromptLoader` の言語フォールバック機構を活用（NFR-004準拠）
- 5つのプレースホルダーが要件定義のFR-005と一致

#### 7.2.4 `validateRequiredSections()` — 必須セクション検証（FR-008）

```
入力: body: string, language: SupportedLanguage
出力: boolean

処理フロー:
1. 言語別の必須セクション見出しを定義:
   - ja: ['変更概要', '主要な変更点']
   - en: ['Summary', 'Key Changes']
2. body.includes(header) で各見出しの存在をチェック
3. 少なくとも1つ見つかれば true（緩い検証）
```

**設計レビュー結果**: 妥当。以下の点を確認済み。
- 緩い検証戦略（1つ以上の一致でOK）はAI出力の不確実性を考慮した適切な判断
- `includes()` による部分一致検索は安全（正規表現不使用）
- 言語フォールバック（未知の言語 → `ja`）が実装されている

#### 7.2.5 `executeAgentTask()` — エージェント実行（FR-007）

```
入力:
  prompt: string
  claudeClient: ClaudeAgentClient | null
  codexClient: CodexAgentClient | null
出力: string[]（エージェント出力メッセージ配列）

処理フロー:
1. Claude で試行:
   a. claudeClient が null でなければ executeTask({prompt, maxTurns: 30}) を呼び出し
   b. 結果が非空ならメッセージを返却
   c. 空結果または例外: 警告ログ出力、Codex にフォールバック
2. Codex で試行:
   a. codexClient が null でなければ executeTask({prompt, maxTurns: 30}) を呼び出し
   b. 結果が非空ならメッセージを返却
   c. 空結果または例外: 警告ログ出力
3. 両方失敗: Error をスロー
```

**設計レビュー結果**: 妥当。以下の点を確認済み。
- `claude-first` 優先順位に基づくフォールバックチェーンが正しく実装
- `maxTurns: 30` でエージェントの暴走を防止（NFR-001準拠）
- 各エージェントの失敗が独立して処理される

#### 7.2.6 `generateAiRewrittenPrBody()` — 統合オーケストレーション

```
入力:
  metadataManager: MetadataManager
  options: FinalizeCommandOptions
  prNumber: number
  prClient: PullRequestClient
  collectedOutputs: CollectedPhaseOutputs
  fallbackBody: string
出力: string（AI生成またはフォールバックのPRボディ）

処理フロー:
1. diff取得: getDiffForPrompt()
2. プロンプト構築: buildPromptContext()
3. エージェント初期化:
   a. config.getHomeDir() でホームディレクトリ取得
   b. resolveAgentCredentials() で認証情報解決
   c. setupAgentClients() でクライアント初期化
4. 認証情報なし判定:
   → 両クライアントがnull → fallbackBody を返却 + 警告ログ
5. エージェント実行: executeAgentTask()
6. 出力テキスト抽出: messages.join('\n').trim()
7. 空出力判定: → fallbackBody を返却
8. 必須セクション検証: validateRequiredSections()
   → 検証失敗: fallbackBody を返却 + 警告ログ
9. 成功: AI生成ボディを返却

例外処理:
- try-catch で全体を囲み、任意の例外で fallbackBody を返却
- 「AI rewrite failed: <message>. Falling back to default PR body.」ログ出力
```

**設計レビュー結果**: 妥当。以下の点を確認済み。
- 多層フォールバック（認証情報なし → 空出力 → セクション検証失敗 → 例外）が網羅的
- `fallbackBody` は事前に `generateFinalPrBody()` で生成済みであり、フォールバック時の追加処理なし
- FR-009（後方互換性）が完全に維持される

### 7.3 フェーズ成果物収集のタイミング設計

**重要な設計判断**: フェーズ成果物の収集は、Step 2（`.ai-workflow/` ディレクトリ削除）の**前**に実行する（TC-007対応）。

```
handleFinalizeCommand(options)
├─ Step 0: バリデーション + メタデータ読み込み
├─ ★ collectPhaseOutputs() ← .ai-workflow/ 削除前に実行
├─ Step 1: base_commit 取得
├─ Step 2: .ai-workflow/ 削除 ← ここでフェーズ成果物が消える
├─ Step 3: コミットスカッシュ
└─ Step 4-5: PR更新 ← 事前収集した成果物を使用
```

この設計により、AIリライトに必要なフェーズ成果物が`.ai-workflow/`ディレクトリの削除後も利用可能となる。`collectedOutputs` はメモリ上に保持される。

### 7.4 プロンプト・テンプレート設計

#### 7.4.1 プロンプト構造（`rewrite_pr_body.txt`）

```
[役割定義] あなたはコードレビューの専門家です。
[コンテキスト]
  ├─ Issue情報: {issue_number}, {issue_title}
  ├─ PR diff情報: {diff_content}
  └─ フェーズ成果物: {phase_outputs}
[出力フォーマット]
  └─ テンプレート構造: {template_structure}
[セクション記述ガイドライン]
  ├─ 変更概要: 1〜3文
  ├─ 背景・目的: ビジネス価値・技術課題
  ├─ 主要な変更点: ファイル/モジュール単位
  ├─ レビュー注目ポイント: セキュリティ・パフォーマンス
  ├─ テスト結果: テスト情報がない場合のフォールバック
  └─ 影響範囲: 既存機能への影響
[品質要件]
  ├─ 具体的かつ簡潔
  ├─ レビュアー向け情報に焦点
  ├─ 内部ワークフロー情報を含めない
  └─ Closes #{issue_number} 形式
[出力例]
  └─ OAuth 2.0実装の模範例
```

#### 7.4.2 テンプレート構造（`pr_body_finalize_template.md`）

| セクション（日本語） | セクション（英語） | FR対応 |
|---|---|---|
| 変更概要 | Summary of Changes | FR-006 |
| 変更の背景・目的 | Background & Purpose | FR-006 |
| 主要な変更点 | Key Changes | FR-006 |
| レビュー時の注目ポイント | Review Focus Points | FR-006 |
| テスト結果サマリー | Test Results Summary | FR-006 |
| 影響範囲 | Impact Scope | FR-006 |

**設計レビュー結果**: テンプレート構造は要件定義書（FR-006）と完全に一致。Issueの提案セクションとも整合している。

### 7.5 エラーハンドリング設計

全エラーパスを網羅的に列挙する。

| エラー発生箇所 | エラー種別 | 対処 | ログ出力 | FR対応 |
|---|---|---|---|---|
| `getDiffForPrompt()` | GitHub API エラー | フォールバックDiffContext返却 | `warn: Failed to get PR diff: <message>` | FR-003 |
| `collectPhaseOutputs()` 個別ファイル | ファイル読み込みエラー | フォールバックテキスト設定 | `warn: Failed to read phase output '<phase>': <message>` | FR-004 |
| `buildPromptContext()` | プロンプト/テンプレート不在 | 例外がスロー → `generateAiRewrittenPrBody` のtry-catchで捕捉 | `warn: AI rewrite failed: <message>` | FR-005 |
| `setupAgentClients()` | 認証情報なし | fallbackBody返却 | `warn: No agent credentials available. Falling back to default PR body.` | FR-007, AC-004 |
| `executeAgentTask()` Claude | 例外/空結果 | Codexにフォールバック | `warn: Claude agent failed: <message>. Trying Codex...` | FR-007 |
| `executeAgentTask()` Codex | 例外/空結果 | Error スロー → 上位で捕捉 | `warn: Codex agent failed: <message>` | FR-007 |
| `executeAgentTask()` 両方失敗 | Error | fallbackBody返却 | `warn: AI rewrite failed: Both Claude and Codex agents failed...` | FR-007, AC-003 |
| AI生成出力 | 空文字列 | fallbackBody返却 | `warn: AI agent returned empty output. Falling back to default PR body.` | FR-008 |
| `validateRequiredSections()` | 必須セクション不在 | fallbackBody返却 | `warn: AI-generated PR body missing required sections. Falling back to default PR body.` | FR-008, AC-005 |
| `generateAiRewrittenPrBody()` 全体 | 任意の未捕捉例外 | fallbackBody返却 | `warn: AI rewrite failed: <message>. Falling back to default PR body.` | FR-009, AC-003 |

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

| 考慮事項 | 対策 | 準拠 |
|---|---|---|
| エージェント認証情報の取得 | `resolveAgentCredentials()` → `config` クラス経由で環境変数を取得。`process.env` への直接アクセスなし | CLAUDE.md §2, NFR-002 |
| GitHub Token | `config.getGitHubToken()` 経由で取得。`GitHubClient` のコンストラクタに渡される | CLAUDE.md §2 |
| 認証情報のログ出力防止 | トークン値はログ出力されない。認証情報の有無のみをログに記録 | NFR-002 |

### 8.2 データ保護

| 考慮事項 | 対策 | 準拠 |
|---|---|---|
| diff内容のログ出力 | diff内容はプロンプトとしてエージェントに送信されるが、永続化やログ出力は行わない | NFR-002 |
| フェーズ成果物のメモリ保持 | `collectedOutputs` はメモリ上にのみ保持され、処理完了後にGCで回収される | - |
| プロンプト内容のログ出力 | プロンプト全文はログ出力されない。デバッグログに文字数のみ記録 | - |

### 8.3 セキュリティリスクと対策

| リスク | 対策 | 準拠 |
|---|---|---|
| ReDoS攻撃 | プレースホルダー置換に `replaceAll()` を使用。`new RegExp()` にユーザー入力を渡さない | CLAUDE.md §4, NFR-002 |
| `extractDiffFileSummary()` の正規表現 | `/diff --git a\/.+ b\/(.+)/` はリテラルパターンであり、ユーザー入力由来でないためReDoSリスクなし | CLAUDE.md §4 |
| エージェント出力のインジェクション | AI生成PRボディはMarkdownとしてGitHub PR本文に設定されるため、HTML/スクリプトインジェクションはGitHub側のサニタイズで防止される | - |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス（NFR-001）

| 要件 | 実装 | 評価 |
|---|---|---|
| エージェント実行のターン数上限 | `maxTurns: 30` | 適切。エージェントの暴走を防止 |
| diff取得のタイムアウト | GitHub APIのデフォルトタイムアウト | 十分。通常数秒以内に完了 |
| フェーズ成果物の読み込み | 同期I/O（`fs.readFileSync`） | 適切。ローカルファイルの読み込みであり、非同期化のメリットなし |
| 全体のAIリライト処理時間 | エージェント実行時間に依存（通常30秒〜3分） | 許容範囲。フォールバック時は追加遅延なし |
| トランケーション戦略 | 50,000文字/300ファイル閾値 | 適切。トークン制限を考慮した妥当な値 |

### 9.2 スケーラビリティ

| 要件 | 実装 | 評価 |
|---|---|---|
| 大規模diff対応 | `getDiffForPrompt()` のトランケーション戦略 | 50,000文字超は自動的にサマリーに変換 |
| フェーズ成果物の増加 | `MAX_PHASE_OUTPUT_LENGTH` による各ファイルの制限 | 10,000文字/ファイル × 7フェーズ = 最大70,000文字 |
| 新規フェーズの追加 | `phaseFiles` のマップに追加するだけで対応可能 | 拡張性良好 |

### 9.3 保守性（NFR-006）

| 要件 | 実装 | 評価 |
|---|---|---|
| コーディング規約準拠 | `logger`、`config`、`getErrorMessage()` の使用を全関数で確認 | 準拠 |
| プロンプトの外部化 | `src/prompts/finalize/{lang}/` に配置 | コード変更なしにプロンプトチューニング可能 |
| テンプレートの外部化 | `src/templates/{lang}/` に配置 | コード変更なしにセクション構成変更可能 |
| モジュール分離 | 6つのヘルパー関数は独立してテスト可能 | 単体テスト容易性が高い |
| 多言語対応 | `PromptLoader` の言語フォールバック機構を活用 | 新言語追加はファイル追加のみで対応可能 |

---

## 10. テスト設計

### 10.1 新規テストファイル: `tests/unit/commands/finalize-ai-rewrite.test.ts`

#### テスト対象とモック戦略

| テスト対象関数 | モック対象 | テストケース数（推定） |
|---|---|---|
| `collectPhaseOutputs()` | `fs.existsSync`, `fs.readFileSync`, MetadataManager | 5件 |
| `getDiffForPrompt()` | PullRequestClient.getPullRequestDiff | 5件 |
| `buildPromptContext()` | PromptLoader.loadPrompt, PromptLoader.loadTemplate | 3件 |
| `validateRequiredSections()` | なし（純粋関数） | 6件 |
| `executeAgentTask()` | ClaudeAgentClient, CodexAgentClient | 5件 |
| `generateAiRewrittenPrBody()` | 上記すべて + agent-setup | 5件 |

#### テストケース一覧

**collectPhaseOutputs()**:
1. 全フェーズ成果物が存在する場合: 全件読み込み成功
2. 一部のフェーズ成果物が欠損している場合: フォールバックテキスト設定
3. 全フェーズ成果物が存在しない場合: 全件フォールバック
4. 成果物が10,000文字を超える場合: 切り詰め + 省略メッセージ
5. ファイル読み込みエラーの場合: エラーフォールバック + 警告ログ

**getDiffForPrompt()**:
1. 小規模diff（50,000文字未満 かつ 300ファイル以下）: diff全文返却
2. 大規模diff（50,000文字超）: サマリーのみ返却、wasTruncated=true
3. 大規模diff（300ファイル超）: サマリーのみ返却、wasTruncated=true
4. diff取得失敗（GitHub API エラー）: フォールバックDiffContext返却
5. extractDiffFileSummary のパース正確性: ファイル名・追加/削除行数の検証

**buildPromptContext()**:
1. 正常系: 全プレースホルダーが正しく置換される
2. フェーズ成果物の結合テキスト: 各フェーズが '---' 区切りで結合される
3. 言語別テンプレート: ja/en それぞれのプロンプト・テンプレートが読み込まれる

**validateRequiredSections()**:
1. 日本語: '変更概要' を含む → true
2. 日本語: '主要な変更点' を含む → true
3. 日本語: 両方含まない → false
4. 英語: 'Summary' を含む → true
5. 英語: 'Key Changes' を含む → true
6. 英語: 両方含まない → false

**executeAgentTask()**:
1. Claude成功: Claude出力を返却
2. Claude失敗 → Codex成功: Codex出力を返却
3. Claude空結果 → Codex成功: Codex出力を返却
4. 両方失敗: Error スロー
5. 両方null（クライアントなし）: Error スロー

**generateAiRewrittenPrBody()**:
1. 正常系: AI生成ボディを返却
2. 認証情報なし: fallbackBody返却
3. エージェント両方失敗: fallbackBody返却
4. 必須セクション検証失敗: fallbackBody返却
5. 空出力: fallbackBody返却

### 10.2 既存テストファイルへの追加

#### `tests/unit/commands/finalize.test.ts` への追加

| テストケース | 内容 |
|---|---|
| AIリライトドライラン表示（ja） | `--ai-rewrite --dry-run` で日本語のAIリライト表示が出力される |
| AIリライトドライラン表示（en） | `--ai-rewrite --dry-run --agent claude` で英語表示が出力される |

#### `tests/integration/finalize-command.test.ts` への追加

| テストケース | 内容 |
|---|---|
| AIリライトフロー正常系（モック） | `--ai-rewrite` 有効時に全フローが正常実行される（エージェントはモック） |
| AIリライト未指定時の従来動作維持 | `--ai-rewrite` 未指定時に従来のPRボディが生成される |
| AIリライト失敗時のフォールバック | エージェント失敗時に従来PRボディにフォールバックする |

### 10.3 テストにおけるモック戦略

```typescript
// エージェントクライアントのモック
const mockClaudeClient = {
  executeTask: jest.fn().mockResolvedValue(['## 変更概要\n...']),
};

const mockCodexClient = {
  executeTask: jest.fn().mockResolvedValue(['## Summary\n...']),
};

// agent-setup のモック
jest.mock('../../src/commands/execute/agent-setup.js', () => ({
  resolveAgentCredentials: jest.fn().mockReturnValue({
    codexApiKey: 'mock-key',
    claudeToken: 'mock-token',
    codexCredentialsPath: null,
  }),
  setupAgentClients: jest.fn().mockReturnValue({
    claudeClient: mockClaudeClient,
    codexClient: mockCodexClient,
  }),
}));

// PromptLoader のモック
jest.mock('../../src/core/prompt-loader.js', () => ({
  PromptLoader: {
    loadPrompt: jest.fn().mockReturnValue('mock prompt {issue_number}...'),
    loadTemplate: jest.fn().mockReturnValue('mock template...'),
  },
}));

// config のモック
jest.mock('../../src/core/config.js', () => ({
  config: {
    getHomeDir: jest.fn().mockReturnValue('/home/test'),
    getLanguage: jest.fn().mockReturnValue('ja'),
  },
}));
```

---

## 11. ドキュメント更新設計

### 11.1 `docs/CLI_REFERENCE.md` への追加

finalize コマンドセクションのオプション一覧に以下を追加する。

```markdown
### AI リライトオプション（Issue #888）

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `--ai-rewrite` | boolean | `false` | AIエージェントによるPRボディリライトを有効化。有効時、diff情報とフェーズ成果物を分析してレビュアー向けPRボディを自動生成する |
| `--agent <mode>` | `auto\|codex\|claude` | `auto` | AIリライト時のエージェントモード。`--ai-rewrite` 有効時のみ機能する |

#### 使用例

```bash
# AIリライト付きでfinalize
node dist/index.js finalize --issue 123 --ai-rewrite

# エージェントを指定してAIリライト
node dist/index.js finalize --issue 123 --ai-rewrite --agent claude

# ドライランでAIリライト設定を確認
node dist/index.js finalize --issue 123 --ai-rewrite --dry-run
```

#### フォールバック動作

AIリライトが失敗した場合（エージェント認証情報なし、エージェント実行エラー、必須セクション検証失敗）、従来の `generateFinalPrBody` によるPRボディが自動的に使用される。
```

### 11.2 `README.md` への追加

主要コマンド表の `finalize` 行を以下のように更新する。

```markdown
| `finalize` | ワークフロー完了後の最終処理（コミットスカッシュ、PR更新、AIリライト対応） |
```

### 11.3 Jenkins Jenkinsfile への追加

`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` のパラメータ定義に以下を追加する。

```groovy
parameters {
    // ... 既存パラメータ ...
    booleanParam(name: 'AI_REWRITE', defaultValue: false, description: 'AIエージェントによるPRボディリライトを有効化')
    choice(name: 'AGENT_MODE', choices: ['auto', 'codex', 'claude'], description: 'AIリライト時のエージェントモード')
}
```

finalize実行コマンドに `--ai-rewrite` オプションの条件付き追加:

```groovy
def finalizeCmd = "node dist/index.js finalize --issue ${issueNumber} --base-branch ${params.BASE_BRANCH ?: 'main'}"
if (params.AI_REWRITE) {
    finalizeCmd += " --ai-rewrite --agent ${params.AGENT_MODE ?: 'auto'}"
}
```

---

## 12. 実装の順序

### Phase 1: テストコード実装（優先度: 高）

1. **`tests/unit/commands/finalize-ai-rewrite.test.ts` の作成** (1.5〜2h)
   - AIリライトヘルパー関数のユニットテスト実装
   - モック戦略の構築
   - 29件のテストケース実装

2. **`tests/unit/commands/finalize.test.ts` への追加** (0.5h)
   - AIリライトドライラン表示テストケース追加（2件）

3. **`tests/integration/finalize-command.test.ts` への追加** (0.5〜1h)
   - AIリライトフロー統合テスト追加（3件）

### Phase 2: テスト実行・修正（優先度: 高）

4. **ユニットテスト実行と修正** (0.5〜1h)
   - `npm run test:unit` の実行
   - テスト失敗時の原因調査と修正

5. **統合テスト実行と修正** (0.5〜1h)
   - `npm run test:integration` の実行
   - テスト失敗時の原因調査と修正

6. **統合検証** (0.5h)
   - `npm run validate` の実行（lint + test + build）
   - ビルド成果物確認

### Phase 3: プロンプトチューニング（優先度: 中）

7. **プロンプト品質の検証** (1h)
   - `rewrite_pr_body.txt`（日英）の指示の明確性確認
   - 出力例の実用性確認

### Phase 4: ドキュメント更新（優先度: 中）

8. **`docs/CLI_REFERENCE.md` の更新** (0.5h)
   - `--ai-rewrite`、`--agent`オプション説明追加

9. **`README.md` の更新** (0.5h)
   - finalizeコマンド説明にAIリライト機能追記

### Phase 5: Jenkins対応（優先度: 低）

10. **Jenkins Jenkinsfile の更新** (0.5h)
    - `AI_REWRITE`、`AGENT_MODE`パラメータ追加

### 依存関係

```
Phase 1（テストコード実装）
    └→ Phase 2（テスト実行・修正）
         ├→ Phase 3（プロンプトチューニング）
         ├→ Phase 4（ドキュメント更新）
         └→ Phase 5（Jenkins対応）
```

Phase 3〜5は相互に独立しており、並列実行可能。

---

## 13. 要件トレーサビリティ

### 機能要件とコンポーネントの対応

| 機能要件 | 実装コンポーネント | 状態 | テスト設計 |
|---|---|---|---|
| FR-001: `--ai-rewrite` オプション | `src/main.ts`, `finalize.ts` | ✅ 実装済み | UT: ドライラン表示, IT: 統合フロー |
| FR-002: `--agent` オプション | `src/main.ts`, `finalize.ts` | ✅ 実装済み | UT: ドライラン表示 |
| FR-003: diff取得・トランケーション | `getDiffForPrompt()`, `extractDiffFileSummary()` | ✅ 実装済み | UT: 5件 |
| FR-004: フェーズ成果物収集 | `collectPhaseOutputs()` | ✅ 実装済み | UT: 5件 |
| FR-005: プロンプトコンテキスト構築 | `buildPromptContext()` | ✅ 実装済み | UT: 3件 |
| FR-006: PRボディテンプレート | `src/templates/{ja,en}/pr_body_finalize_template.md` | ✅ 作成済み | プロンプトチューニングで検証 |
| FR-007: エージェント実行・フォールバック | `executeAgentTask()` | ✅ 実装済み | UT: 5件 |
| FR-008: 必須セクション検証 | `validateRequiredSections()` | ✅ 実装済み | UT: 6件 |
| FR-009: 後方互換性 | `handleFinalizeCommand()`, `generateAiRewrittenPrBody()` | ✅ 実装済み | IT: 従来動作維持テスト |
| FR-010: ユニットテスト追加 | `finalize-ai-rewrite.test.ts` | ❌ 未実装 | 本Phase 5で実装 |
| FR-011: ドライラン表示 | `previewFinalize()` | ✅ 実装済み | UT: 2件 |
| FR-012: ドキュメント更新 | `CLI_REFERENCE.md`, `README.md` | ❌ 未更新 | 手動検証 |
| FR-013: Jenkinsパラメータ対応 | `finalize/Jenkinsfile` | ❌ 未追加 | Jenkins環境で検証 |

### 受け入れ基準と検証方法

| 受け入れ基準 | 検証方法 | テスト種別 |
|---|---|---|
| AC-001: AI生成PRボディの出力 | `generateAiRewrittenPrBody()` のUT + IT | UT + IT |
| AC-002: 従来動作維持 | `--ai-rewrite` なしのIT | IT |
| AC-003: AI生成失敗時のフォールバック | `generateAiRewrittenPrBody()` のUT（エージェント失敗モック） | UT + IT |
| AC-004: 認証情報未設定時のフォールバック | `generateAiRewrittenPrBody()` のUT（認証なしモック） | UT |
| AC-005: 必須セクション検証失敗時のフォールバック | `validateRequiredSections()` のUT | UT |
| AC-006: 大規模diff時のトランケーション | `getDiffForPrompt()` のUT | UT |
| AC-007: フェーズ成果物の事前収集 | `handleFinalizeCommand()` 内のフロー検証 | IT |
| AC-008: 日英テンプレート適用 | `buildPromptContext()` のUT（ja/en） | UT |
| AC-009: ドライランモード表示 | `previewFinalize()` のUT | UT |
| AC-010: フェーズ成果物の切り詰め | `collectPhaseOutputs()` のUT（10,000文字超） | UT |
| AC-011: CLI_REFERENCE.md更新 | ドキュメント手動確認 | 手動 |
| AC-012: 全テストの通過 | `npm run validate` | 自動 |

---

## 14. 品質ゲートチェックリスト

- [x] **実装戦略の判断根拠が明記されている**: EXTEND（§2）
- [x] **テスト戦略の判断根拠が明記されている**: UNIT_INTEGRATION（§3）
- [x] **テストコード戦略の判断根拠が明記されている**: BOTH_TEST（§4）
- [x] **既存コードへの影響範囲が分析されている**: §5に10ファイルの影響を分析
- [x] **変更が必要なファイルがリストアップされている**: §6に新規1件、修正7件を列挙
- [x] **設計が実装可能である**: §7〜§10で全関数の詳細設計・テスト設計を記載。主要実装は完了済みであり、テスト・ドキュメント追加のみ
