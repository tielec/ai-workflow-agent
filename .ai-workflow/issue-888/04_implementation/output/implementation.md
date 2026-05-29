# 実装ログ - PR Finalize後のPRボディをレビュアー向けに全面リライトする機能

## 基本情報

- **Issue番号**: #888
- **Issueタイトル**: PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装
- **実装日**: 2025-05-29
- **実装戦略**: EXTEND（既存の `finalize.ts` を拡張）

## 実装サマリー

| 項目 | 値 |
|------|-----|
| 実装戦略 | EXTEND |
| 変更ファイル数 | 2 |
| 新規ファイル数 | 4 |
| 新規TypeScriptモジュール | 0（設計方針通り） |
| ビルド結果 | ✅ 成功（`npm run build` / `npm run lint` パス） |

### 完了項目

- ✅ `--ai-rewrite` CLIオプション（FR-001）
- ✅ `--agent <mode>` CLIオプション（FR-002）
- ✅ diff取得・トランケーション処理（FR-003）
- ✅ フェーズ成果物収集・トランケーション（FR-004）
- ✅ プロンプト構築・変数置換（FR-005）
- ✅ エージェント初期化・実行（FR-006, FR-007）
- ✅ フォールバックチェーン（FR-008）
- ✅ 既存動作100%保持（FR-009）
- ✅ ドライランモードのAIリライトステータス表示（FR-011）
- ✅ テンプレートファイル（日英）作成
- ✅ AIプロンプトファイル（日英）作成

### スキップ項目

なし。設計書の全要件を実装済み。

## 変更ファイル一覧

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/commands/finalize.ts` | AI リライト機能の全実装（新規関数8個、型定義3個、定数3個の追加） |
| `src/main.ts` | `--ai-rewrite` および `--agent <mode>` CLIオプションの追加（2行） |

### 新規ファイル

| ファイル | 内容 |
|----------|------|
| `src/templates/ja/pr_body_finalize_template.md` | 日本語PRボディテンプレート（変更概要、背景・目的、主要な変更点、レビューポイント、テスト結果、影響範囲） |
| `src/templates/en/pr_body_finalize_template.md` | 英語PRボディテンプレート（同上構造の英語版） |
| `src/prompts/finalize/ja/rewrite_pr_body.txt` | 日本語AIリライトプロンプト（ロール定義、コンテキスト変数、セクション記述ガイドライン、品質要件、出力例） |
| `src/prompts/finalize/en/rewrite_pr_body.txt` | 英語AIリライトプロンプト（同上構造の英語版） |

## 実装詳細

### 1. `src/core/prompt-loader.ts`

#### 変更内容
`PromptCategory` 型に `'finalize'` を追加。

```typescript
export type PromptCategory =
  | 'auto-issue'
  | 'auto-close'
  // ... 既存のカテゴリ
  | 'impact-analysis'
  | 'finalize';  // ← 追加
```

#### 理由
`PromptLoader.loadPrompt('finalize', 'rewrite_pr_body', language)` が型安全に呼び出せるようにするため。

#### 注意点
既存の `PromptCategory` の最後に追加しているため、他のカテゴリには影響なし。

### 2. `src/commands/finalize.ts` - 型定義・定数

#### 変更内容

**FinalizeCommandOptions の拡張**（L85-L109）:
```typescript
export interface FinalizeCommandOptions {
  // ... 既存フィールド
  aiRewrite?: boolean;    // FR-001
  agent?: 'auto' | 'codex' | 'claude';  // FR-002
}
```

**新規インターフェース**:
- `CollectedPhaseOutputs`（L118-L128）: フェーズ成果物の収集結果を表す型。`outputs` マップ、`collectedCount`、`totalCount` を持つ。
- `DiffContext`（L133-L142）: プロンプト用に整形されたdiff情報。`content`、`wasTruncated`、`filesChanged` を持つ。

**新規定数**（L148-L155）:
- `MAX_PHASE_OUTPUT_LENGTH = 10_000`: 各フェーズ成果物の最大文字数（FR-004）
- `MAX_DIFF_LENGTH = 50_000`: diffテキストの最大文字数（FR-003）
- `MAX_DIFF_FILES_THRESHOLD = 300`: diffファイル数の上限閾値（FR-003）

### 3. `src/commands/finalize.ts` - handleFinalizeCommand 拡張

#### 変更内容（L164-L207）

`handleFinalizeCommand()` のメインフローにフェーズ成果物の事前収集ロジックを追加:

```typescript
// ★ 新規（Issue #888）: Step 2 実行前にフェーズ成果物を収集
// TC-007: .ai-workflow/ 削除前に成果物を保持する必要がある
let collectedOutputs: CollectedPhaseOutputs | null = null;
if (options.aiRewrite) {
  collectedOutputs = collectPhaseOutputs(metadataManager);
}
```

`executeStep4And5()` に `collectedOutputs` パラメータを追加して呼び出し:

```typescript
await executeStep4And5(metadataManager, options, collectedOutputs);
```

#### 理由
TC-007（テストシナリオ）の要件：Step 2 で `.ai-workflow/` ディレクトリが削除されるため、それ以前にフェーズ成果物を収集する必要がある。この時系列制約は設計の最重要ポイント。

### 4. `src/commands/finalize.ts` - executeStep4And5 拡張

#### 変更内容（L371-L450）

PRボディ生成の分岐ロジックを追加:

```typescript
// FR-009: --ai-rewrite 未指定時は従来動作を100%保持
const fallbackBody = generateFinalPrBody(metadataManager, issueNumber);

if (options.aiRewrite && collectedOutputs) {
  // FR-001: --ai-rewrite 指定時のAIリライトフロー
  prBody = await generateAiRewrittenPrBody(
    metadataManager, options, prNumber, prClient,
    collectedOutputs, fallbackBody,
  );
} else {
  prBody = fallbackBody;
}
```

#### 理由
FR-009（既存動作100%保持）を実現するため、常に `fallbackBody` を先に生成し、AIリライトが失敗した場合のセーフティネットとして使用。

### 5. `src/commands/finalize.ts` - collectPhaseOutputs

#### 変更内容（L606-L653）

7つのフェーズ成果物ファイルを読み込む関数:

- 対象ファイル: planning.md, requirements.md, design.md, test-scenario.md, implementation.md, test-result.md, documentation-update-log.md
- 各ファイルは `MAX_PHASE_OUTPUT_LENGTH`（10,000文字）で切り詰め
- ファイルが存在しない場合はフォールバックテキスト「（このフェーズの成果物は利用できません）」を設定
- エラー時も安全にフォールバックテキストを設定（`getErrorMessage()` 使用）

#### 注意点
`error: unknown` + `getErrorMessage()` パターンでPC-002（CLAUDE.md コーディング規約）に準拠。

### 6. `src/commands/finalize.ts` - getDiffForPrompt

#### 変更内容（L665-L702）

PullRequestClient からdiffを取得し、トランケーション戦略を適用:

- `filesChanged > 300` または `diff.length > 50,000` の場合: `extractDiffFileSummary()` でファイル変更リストのサマリーのみに変換
- 通常サイズの場合: diff全文を返却
- diff取得失敗時: エラーを吸収し、フォールバックテキストを返却

#### 理由
FR-003のトランケーション要件。大規模PRでもプロンプトが爆発しないよう制御。

### 7. `src/commands/finalize.ts` - extractDiffFileSummary

#### 変更内容（L713-L745）

diffテキストからファイル変更リストのサマリーを抽出する関数:

- `diff --git` ヘッダー行をパースしてファイル名を抽出
- 各ファイルの追加行数・削除行数をカウント
- Markdownフォーマットのサマリーを生成

### 8. `src/commands/finalize.ts` - buildPromptContext

#### 変更内容（L760-L794）

AIリライト用のプロンプトを構築する関数:

- `PromptLoader.loadPrompt('finalize', 'rewrite_pr_body', language)` でプロンプトテンプレート読み込み
- `PromptLoader.loadTemplate('pr_body_finalize_template.md', language)` でPRボディテンプレート読み込み
- フェーズ成果物を `### phase_name\n\ncontent` 形式で結合
- PC-004準拠: `replaceAll()` を使用してReDoS防止（`new RegExp()` 不使用）

#### 注意点
プレースホルダーの置換には `replaceAll()` を使用。NFR-002/PC-004のReDoS防止要件に準拠。

### 9. `src/commands/finalize.ts` - validateRequiredSections

#### 変更内容（L806-L822）

AI生成PRボディの品質検証関数:

- 言語別の必須セクション見出しをチェック（ja: 変更概要/主要な変更点、en: Summary/Key Changes）
- 少なくとも1つの見出しが含まれていればOK（AIの出力は完全一致しない場合があるため）

### 10. `src/commands/finalize.ts` - executeAgentTask

#### 変更内容（L836-L877）

エージェントタスク実行関数（Claude-first フォールバック）:

1. Claude エージェントで試行（`claudeClient.executeTask({ prompt, maxTurns: 30 })`)
2. Claude 失敗時は Codex にフォールバック（`codexClient.executeTask({ prompt, maxTurns: 30 })`)
3. 両方失敗時は `Error` をスロー（呼び出し元でキャッチしてフォールバック）

#### 理由
FR-007/FR-008のClaude-first優先順位とフォールバックチェーンの実装。`impact-analysis.ts` のエージェント呼び出しパターンを踏襲。

### 11. `src/commands/finalize.ts` - generateAiRewrittenPrBody

#### 変更内容（L893-L966）

AI リライトのメインオーケストレーター関数:

1. diff取得（`getDiffForPrompt()`）
2. プロンプト構築（`buildPromptContext()`）
3. エージェント初期化（`resolveAgentCredentials()` + `setupAgentClients()`）
4. エージェント実行（`executeAgentTask()`）
5. 出力テキスト抽出（`messages.join('\n').trim()`）
6. 必須セクション検証（`validateRequiredSections()`）
7. 全ステップでエラー時は `fallbackBody` にフォールバック

#### 理由
FR-008のフォールバックチェーン: AI生成 → バリデーション失敗 → `generateFinalPrBody()` フォールバック。try-catch で全体を囲み、あらゆるエラーでも安全にリカバリー。

### 12. `src/commands/finalize.ts` - previewFinalize 拡張

#### 変更内容（L552-L591）

ドライランモードに `--ai-rewrite` ステータス表示を追加:

```typescript
if (options.aiRewrite) {
  const agentMode = options.agent ?? 'auto';
  const language = metadataManager.getLanguage() || 'ja';
  const text = language === 'ja'
    ? `  4. PR更新: AI リライトが有効（エージェント: ${agentMode}）`
    : `  4. PR Update: AI rewrite enabled (agent: ${agentMode})`;
  logger.info(text);
}
```

#### 理由
FR-011: ドライランモードでAIリライトの有効状態を確認できるようにする。

### 13. `src/main.ts`

#### 変更内容（L515-L516）

finalize コマンドにCLIオプション2つを追加:

```typescript
.option('--ai-rewrite', 'Rewrite PR body using AI agent for reviewer-optimized content', false)
.option('--agent <mode>', 'Agent mode for AI rewrite (auto|codex|claude)', 'auto')
```

#### 理由
FR-001/FR-002: CLIからAIリライト機能を制御するオプション。Commander.js の `.option()` パターンに準拠。

## 重要な決定事項

### 1. フェーズ成果物収集のタイミング

**決定**: `handleFinalizeCommand()` 内で Step 2（.ai-workflow 削除）の前に `collectPhaseOutputs()` を呼び出す。

**理由**: TC-007の時系列制約。Step 2 で成果物ファイルが削除されるため、事前に収集してメモリに保持する必要がある。

### 2. エージェント初期化パターン

**決定**: `impact-analysis.ts` と同じ `resolveAgentCredentials()` + `setupAgentClients()` パターンを使用。`AgentExecutor` クラスは使用しない。

**理由**: `AgentExecutor` は execute コマンド専用の高レベルラッパーであり、finalize のようなスポット的なエージェント利用には `setupAgentClients()` + 直接 `executeTask()` が適切。

### 3. フォールバック戦略

**決定**: 常に `generateFinalPrBody()` を先に生成し、AI失敗時のフォールバックとして使用。

**理由**: FR-008/FR-009の要件。AIリライトが失敗しても finalize コマンド全体は成功させる必要がある。

### 4. ReDoS 防止

**決定**: プロンプト変数置換に `replaceAll()` を使用。`new RegExp()` は不使用。

**理由**: PC-004/NFR-002。ユーザー入力を含む文字列（Issue タイトル等）をそのまま正規表現に組み込むと ReDoS リスクがあるため。

### 5. バリデーション閾値

**決定**: 必須セクションの見出しが1つでも見つかれば合格とする。

**理由**: AIの出力は必ずしもテンプレートと完全一致しない場合がある。過度に厳しいバリデーションはフォールバック率を上げてしまう。

## 既存機能への影響

### 後方互換性

✅ **100%保持**。`--ai-rewrite` オプション未指定時は従来動作と完全に同一。

具体的な影響分析:

| 既存機能 | 影響 |
|----------|------|
| `finalize --issue N` | 影響なし（`aiRewrite` は undefined/false） |
| `finalize --issue N --dry-run` | 影響なし（AIリライト表示は `--ai-rewrite` 時のみ） |
| `finalize --issue N --skip-squash` | 影響なし |
| `finalize --issue N --skip-pr-update` | 影響なし（Step 4-5 がスキップされるため） |
| `generateFinalPrBody()` | 変更なし（既存関数はそのまま保持） |

### 新規追加された公開API

なし。すべての新規関数は `finalize.ts` 内部のプライベート関数。

## テスト戦略

Phase 5（test_implementation）で以下のテストを実装予定:

### ユニットテスト

1. **collectPhaseOutputs**: 成果物ファイルの読み込み、トランケーション、不在ファイルのフォールバック
2. **getDiffForPrompt**: 通常diff、大規模diffのトランケーション、取得失敗時のフォールバック
3. **extractDiffFileSummary**: diffヘッダーパース、追加/削除行カウント
4. **buildPromptContext**: プレースホルダー置換、テンプレート読み込み
5. **validateRequiredSections**: 必須セクション検出（ja/en）、不足時のfalse返却
6. **executeAgentTask**: Claude成功、Claude失敗→Codexフォールバック、両方失敗

### 統合テスト

1. **handleFinalizeCommand with --ai-rewrite**: フルフロー（成果物収集→diff取得→プロンプト構築→エージェント実行→PRボディ更新）
2. **フォールバックチェーン**: AI失敗時の `generateFinalPrBody()` へのフォールバック
3. **--ai-rewrite 未指定**: 既存動作の保持確認

## 品質ゲート確認

- [x] Phase 2（設計書）の全要件を実装
- [x] 既存コードの規約に準拠（logger, getErrorMessage, config クラス使用）
- [x] ReDoS 防止（replaceAll 使用、new RegExp 不使用）
- [x] エラーハンドリング完備（全箇所で try-catch + フォールバック）
- [x] TypeScript ビルドエラーなし（`npm run build` 成功）
- [x] Lint エラーなし（`npm run lint` 成功）
- [x] 新規 TypeScript モジュール作成なし（EXTEND 戦略準拠）
- [x] `console.log` 不使用（logger モジュール使用）
- [x] `as Error` キャスト不使用（`getErrorMessage()` 使用）
- [x] `process.env` 直接参照なし（config クラス使用）

## 次のステップ

1. **Phase 5（test_implementation）**: 上記テスト戦略に基づくテストコード実装
2. **Phase 6（testing）**: テスト実行・結果確認
3. **Phase 7（documentation）**: README / CLAUDE.md への新オプション記載

## 参考情報

- 設計書: `.ai-workflow/issue-888/02_design/output/design.md`
- テストシナリオ: `.ai-workflow/issue-888/03_test_scenario/output/test-scenario.md`
- 要件定義: `.ai-workflow/issue-888/01_requirements/output/requirements.md`
- 計画書: `.ai-workflow/issue-888/00_planning/output/planning.md`
- 参照実装: `src/commands/impact-analysis.ts`（エージェント初期化パターン）

---

- 作成日: 2025-05-29
- Issue: #888
- フェーズ: 04_implementation
- ステータス: 完了
