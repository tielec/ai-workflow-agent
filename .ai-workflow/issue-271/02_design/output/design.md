# 詳細設計書

**Issue番号**: #271
**タイトル**: feat(rollback): Add auto mode with agent-based rollback target detection
**作成日**: 2025-12-07
**バージョン**: 1.0

---

## 0. Planning Document確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### 実装戦略（Planning）
- **EXTEND戦略**: 既存の `rollback.ts` に `auto` サブコマンドを追加
- 既存関数（`executeRollback()` 等）を再利用

### テスト戦略（Planning）
- **UNIT_INTEGRATION戦略**: ユニットテストと統合テストの両方で網羅的にカバー

### テストコード戦略（Planning）
- **BOTH_TEST戦略**: 既存テストの拡張 + 新規テストファイルの作成

### リスク（Planning）
- エージェント出力の不安定性（高影響、中確率）
- エージェント判断精度の問題（中影響、中確率）

本設計書では、Planning Phaseの決定を踏まえて詳細設計を行います。

---

## 1. 実装戦略の判断

### 実装戦略: EXTEND

**判断根拠**:
1. **既存コマンドとの統合**: `rollback` コマンドは既に存在し、`executeRollback()` 関数が完成している。`auto` サブコマンドを追加し、エージェント判断後に既存ロジックを再利用することで、コード重複を回避できる。
2. **メタデータ管理の再利用**: `MetadataManager` の既存メソッド（`setRollbackContext()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を活用できる。
3. **CLIパーサーの拡張**: `src/commands/rollback.ts` にサブコマンド判定ロジックとエージェント統合ロジックを追加するのみで実現可能。
4. **影響範囲の限定**: 新規ファイルはプロンプトテンプレート（`src/prompts/rollback/auto-analyze.txt`）のみで、既存機能への影響を最小限に抑えられる。

**実装方針**:
- 既存の `handleRollbackCommand()` にサブコマンド分岐を追加
- `handleRollbackAutoCommand()` を新規作成し、エージェント判断ロジックを実装
- 判断完了後、既存の `executeRollback()` を呼び出す

---

## 2. テスト戦略の判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
1. **ユニットテストの必要性**:
   - JSON パース処理（複数パターンのフォールバック）は単独でテスト可能
   - バリデーション処理（`needs_rollback`, `to_phase`, `confidence` の検証）は独立して検証すべき
   - confidence レベルに応じた確認プロンプト制御ロジックは決定論的にテスト可能
2. **統合テストの必要性**:
   - エージェント呼び出し → JSONパース → 確認プロンプト → executeRollback() のエンドツーエンドフローが複雑
   - 既存の `rollback` コマンドとの統合（サブコマンド分岐）を検証する必要がある
   - エージェント出力のモック化により、決定論的なテストが可能
3. **BDD不要の理由**:
   - ユーザーストーリーは単純（「エージェントが差し戻し先を自動判断する」）
   - CLI操作のシナリオテストは統合テストで十分にカバー可能

**テスト方針**:
- **ユニットテスト**: JSONパース、バリデーション、confidence制御ロジックを個別にテスト
- **統合テスト**: エージェント呼び出しからrollback実行までのE2Eフローをテスト

---

## 3. テストコード戦略の判断

### テストコード戦略: BOTH_TEST

**判断根拠**:
1. **既存テストの拡張**:
   - `tests/commands/rollback.test.ts` が既に存在し、手動モードのテストをカバーしている
   - 既存テストに `auto` モードのケースを追加することで、リグレッションテストを強化できる
2. **新規テストファイルの作成**:
   - `auto` モード専用の複雑なテストケース（JSON パース、エージェント出力モック、confidence制御）は、独立したファイル（`rollback-auto.test.ts`）で管理すべき
   - ファイル分離により、テストコードの可読性と保守性が向上する
3. **テストケースの分離**:
   - 既存テスト: 手動モードと `auto` モードの基本的な統合テスト
   - 新規テスト: `auto` モード専用のユニットテスト・統合テスト

**テストファイル構成**:
```
tests/
├── commands/
│   ├── rollback.test.ts         # 既存（拡張: autoモード統合テスト追加）
│   └── rollback-auto.test.ts    # 新規（autoモード専用ユニット・統合テスト）
```

---

## 4. アーキテクチャ設計

### 4.1 システム全体図

```
┌──────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  src/commands/rollback.ts                                    │
│    - handleRollbackCommand()                                 │
│      ├─ サブコマンド判定（auto / manual）                   │
│      ├─ handleRollbackAutoCommand() [新規]                   │
│      └─ executeRollback() [既存]                             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                    Agent Integration Layer                   │
│  handleRollbackAutoCommand()                                 │
│    1. metadata.json 読み込み（MetadataManager）              │
│    2. 最新レビュー結果・テスト結果ファイルの特定              │
│    3. プロンプト生成（テンプレート読み込み + 変数置換）       │
│    4. エージェント呼び出し（AgentExecutor）                  │
│    5. JSON パース・バリデーション                            │
│    6. confidence 制御（確認プロンプト）                      │
│    7. executeRollback() 呼び出し [既存ロジック]             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                      Data Access Layer                       │
│  - MetadataManager (metadata.json 読み書き)                  │
│  - FileSystem (レビュー結果・テスト結果ファイル読み込み)      │
│  - AgentExecutor (Codex/Claude エージェント実行)             │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 コンポーネント間の関係

```
┌─────────────────┐
│   User Input    │
│  rollback auto  │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  handleRollbackCommand()                                    │
│   ├─ args[0] === 'auto' を判定                              │
│   ├─ handleRollbackAutoCommand() へ委譲                     │
│   └─ 手動モードの場合は既存ロジックを実行                   │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  handleRollbackAutoCommand()                                │
│   ├─ Step 1: metadata.json 読み込み                         │
│   ├─ Step 2: ファイル検索（最新レビュー結果・テスト結果）    │
│   ├─ Step 3: プロンプト生成                                 │
│   ├─ Step 4: エージェント呼び出し                           │
│   ├─ Step 5: JSON パース                                    │
│   ├─ Step 6: バリデーション                                 │
│   ├─ Step 7: 確認プロンプト（confidence による）            │
│   └─ Step 8: executeRollback() 呼び出し                     │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  executeRollback() [既存]                                   │
│   ├─ updatePhaseForRollback()                               │
│   ├─ resetSubsequentPhases()                                │
│   ├─ addRollbackHistory()                                   │
│   ├─ ROLLBACK_REASON.md 生成                                │
│   └─ Git commit & push                                      │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 データフロー

```
┌──────────────────────────────────────────────────────────────┐
│ Step 1: CLI 入力                                             │
│  rollback auto --issue 271 [--dry-run] [--force] [--agent]  │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 2: metadata.json 読み込み                               │
│  - MetadataManager.loadMetadata(issueNumber)                 │
│  - current_phase, phases.*.status, rollback_history 取得     │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 3: 最新ファイル検索                                     │
│  - findLatestReviewResult(metadata) → @filepath              │
│  - findLatestTestResult(metadata) → @filepath                │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 4: プロンプト生成                                       │
│  - テンプレート読み込み: auto-analyze.txt                    │
│  - 変数置換:                                                 │
│    - {issue_number}                                          │
│    - {latest_review_result_reference}                        │
│    - {test_result_reference}                                 │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 5: エージェント呼び出し                                 │
│  - AgentExecutor.execute(prompt, options)                    │
│  - Codex/Claude 選択（--agent オプション）                   │
│  - タイムアウト: 120秒                                       │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 6: JSON パース                                          │
│  - extractJsonFromResponse(agentOutput)                      │
│  - フォールバックパターン:                                   │
│    1. Markdownコードブロック内JSON                           │
│    2. プレーンテキスト内JSON                                 │
│    3. JSON開始・終了探索                                     │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 7: バリデーション                                       │
│  - validateRollbackDecision(decision)                        │
│    - needs_rollback: boolean                                 │
│    - to_phase: PhaseName (needs_rollback=true時必須)         │
│    - to_step: StepName (デフォルト: 'revise')                │
│    - confidence: 'high' | 'medium' | 'low'                   │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 8: 確認プロンプト制御                                   │
│  - confidence が high かつ --force → スキップ                │
│  - confidence が medium/low → 必ず確認                       │
│  - --dry-run → 実行せずプレビュー表示                        │
└─────────────────────┬────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 9: executeRollback() 呼び出し [既存]                   │
│  - updatePhaseForRollback(to_phase, to_step)                 │
│  - resetSubsequentPhases(to_phase)                           │
│  - addRollbackHistory(entry)                                 │
│  - generateRollbackReasonMarkdown(reason)                    │
│  - Git commit & push                                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

| コンポーネント | 影響内容 | 影響度 |
|---------------|---------|--------|
| `src/commands/rollback.ts` | サブコマンド分岐追加、`handleRollbackAutoCommand()` 実装 | **高** |
| `src/core/metadata-manager.ts` | 影響なし（既存メソッドを再利用） | なし |
| `src/core/codex-agent-client.ts` | 影響なし（既存のAgentExecutor利用） | なし |
| `src/core/claude-agent-client.ts` | 影響なし（既存のAgentExecutor利用） | なし |
| `src/types/commands.ts` | `RollbackDecision` 型定義追加 | **中** |
| `src/main.ts` | 影響なし（サブコマンドは `rollback.ts` 内で処理） | なし |

### 5.2 依存関係の変更

**新規依存関係**: なし（既存モジュールのみ使用）

**既存依存関係の変更**: なし

### 5.3 マイグレーション要否

**マイグレーション不要**:
- metadata.json のスキーマ変更なし（既存フィールドのみ使用）
- 既存の `rollback` コマンドとの後方互換性を完全に維持

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

| ファイルパス | 説明 | 行数見積 |
|-------------|------|---------|
| `src/prompts/rollback/auto-analyze.txt` | エージェント判断プロンプトテンプレート | 150行 |
| `tests/commands/rollback-auto.test.ts` | autoモード専用ユニット・統合テスト | 500行 |

### 6.2 修正が必要な既存ファイル

| ファイルパス | 修正内容 | 影響度 | 行数見積 |
|-------------|---------|--------|---------|
| `src/commands/rollback.ts` | `handleRollbackAutoCommand()` 追加、CLIパーサー拡張 | **高** | +300行 |
| `src/types/commands.ts` | `RollbackDecision` 型定義追加 | **中** | +30行 |
| `tests/commands/rollback.test.ts` | autoモード統合テスト追加（リグレッション） | **中** | +100行 |
| `README.md` | CLI ヘルプ、使用例の追加 | **低** | +50行 |

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 型定義（`src/types/commands.ts`）

#### 7.1.1 RollbackDecision 型

```typescript
/**
 * エージェントが返す差し戻し判断結果
 */
export interface RollbackDecision {
  /**
   * 差し戻しが必要かどうか
   */
  needs_rollback: boolean;

  /**
   * 差し戻し先のフェーズ（needs_rollback=true の場合は必須）
   */
  to_phase?: PhaseName;

  /**
   * 差し戻し先のステップ（デフォルト: 'revise'）
   */
  to_step?: StepName;

  /**
   * 差し戻し理由（ROLLBACK_REASON.md に記載される）
   * 具体的な問題箇所と修正内容を含む
   */
  reason: string;

  /**
   * 判断の信頼度
   * - high: 問題原因が明確で、差し戻し先が確実
   * - medium: 問題原因が推定でき、差し戻し先が妥当
   * - low: 問題原因が不明確、または判断に不確実性がある
   */
  confidence: 'high' | 'medium' | 'low';

  /**
   * 判断根拠の詳細説明
   * ユーザーが判断の妥当性を評価するための情報
   */
  analysis: string;
}
```

#### 7.1.2 RollbackAutoOptions 型

```typescript
/**
 * rollback auto コマンドのオプション
 */
export interface RollbackAutoOptions {
  /**
   * Issue番号
   */
  issueNumber: number;

  /**
   * ドライランモード（実際には差し戻さない）
   */
  dryRun?: boolean;

  /**
   * 確認プロンプトをスキップ（high confidence のみ）
   */
  force?: boolean;

  /**
   * 使用するエージェント
   */
  agent?: 'auto' | 'codex' | 'claude';
}
```

### 7.2 関数設計

#### 7.2.1 handleRollbackAutoCommand()

```typescript
/**
 * rollback auto コマンドのハンドラ
 *
 * @param options - rollback auto オプション
 * @returns 実行結果
 */
async function handleRollbackAutoCommand(
  options: RollbackAutoOptions
): Promise<void> {
  try {
    // Step 1: metadata.json 読み込み
    const metadata = await loadMetadata(options.issueNumber);

    // Step 2: ワークフロー状態の検証
    validateWorkflowState(metadata);

    // Step 3: 最新ファイル検索
    const context = await collectAnalysisContext(metadata);

    // Step 4: プロンプト生成
    const prompt = await buildAgentPrompt(options.issueNumber, context);

    // Step 5: エージェント呼び出し
    const agentOutput = await executeAgent(prompt, options.agent);

    // Step 6: JSON パース
    const decision = parseRollbackDecision(agentOutput);

    // Step 7: バリデーション
    validateRollbackDecision(decision);

    // Step 8: 差し戻し不要の場合
    if (!decision.needs_rollback) {
      logger.info('No rollback needed.');
      logger.info(`Reason: ${decision.reason}`);
      logger.info(`Analysis: ${decision.analysis}`);
      return;
    }

    // Step 9: 確認プロンプト制御
    if (options.dryRun) {
      displayDryRunPreview(decision);
      return;
    }

    const shouldProceed = await confirmRollback(decision, options.force);
    if (!shouldProceed) {
      logger.info('Rollback cancelled by user.');
      return;
    }

    // Step 10: executeRollback() 呼び出し
    await executeRollback({
      issueNumber: options.issueNumber,
      toPhase: decision.to_phase!,
      toStep: decision.to_step || 'revise',
      reason: decision.reason,
      force: true, // 既に確認済み
      dryRun: false,
    });

  } catch (error) {
    logger.error('Failed to execute rollback auto:', getErrorMessage(error));
    throw error;
  }
}
```

#### 7.2.2 collectAnalysisContext()

```typescript
/**
 * エージェント分析用のコンテキスト収集
 *
 * @param metadata - ワークフローメタデータ
 * @returns 分析コンテキスト
 */
async function collectAnalysisContext(
  metadata: WorkflowState
): Promise<AnalysisContext> {
  const context: AnalysisContext = {
    metadataPath: getMetadataPath(metadata.issue_number),
    latestReviewResult: null,
    latestTestResult: null,
  };

  // 最新のレビュー結果を検索
  const currentPhase = metadata.current_phase;
  if (currentPhase) {
    const reviewResultPath = await findLatestReviewResult(
      metadata.issue_number,
      currentPhase
    );
    if (reviewResultPath) {
      context.latestReviewResult = reviewResultPath;
    }
  }

  // Testing Phase の場合、テスト結果を検索
  if (currentPhase === 'testing' ||
      metadata.phases.testing?.status === 'completed' ||
      metadata.phases.testing?.status === 'failed') {
    const testResultPath = await findLatestTestResult(
      metadata.issue_number
    );
    if (testResultPath) {
      context.latestTestResult = testResultPath;
    }
  }

  return context;
}

interface AnalysisContext {
  metadataPath: string;
  latestReviewResult: string | null;
  latestTestResult: string | null;
}
```

#### 7.2.3 buildAgentPrompt()

```typescript
/**
 * エージェント判断用プロンプトの生成
 *
 * @param issueNumber - Issue番号
 * @param context - 分析コンテキスト
 * @returns プロンプト文字列
 */
async function buildAgentPrompt(
  issueNumber: number,
  context: AnalysisContext
): Promise<string> {
  // テンプレート読み込み
  const templatePath = path.join(
    __dirname,
    '..',
    'prompts',
    'rollback',
    'auto-analyze.txt'
  );
  let template = await fs.readFile(templatePath, 'utf-8');

  // 変数置換
  template = template.replace(/{issue_number}/g, issueNumber.toString());

  // レビュー結果参照の置換
  if (context.latestReviewResult) {
    template = template.replace(
      /{latest_review_result_reference}/g,
      `@${context.latestReviewResult}`
    );
  } else {
    template = template.replace(
      /{latest_review_result_reference}/g,
      '（レビュー結果ファイルは見つかりませんでした）'
    );
  }

  // テスト結果参照の置換
  if (context.latestTestResult) {
    template = template.replace(
      /{test_result_reference}/g,
      `@${context.latestTestResult}`
    );
  } else {
    template = template.replace(
      /{test_result_reference}/g,
      '（テスト結果ファイルは見つかりませんでした）'
    );
  }

  return template;
}
```

#### 7.2.4 parseRollbackDecision()

```typescript
/**
 * エージェント出力からRollbackDecisionをパース
 *
 * @param agentOutput - エージェント出力
 * @returns パース結果
 * @throws {Error} パース失敗時
 */
function parseRollbackDecision(agentOutput: string): RollbackDecision {
  // パターン1: Markdownコードブロック内のJSON
  let jsonMatch = agentOutput.match(/```json\s*([\s\S]*?)\s*```/);

  if (!jsonMatch) {
    // パターン2: プレーンテキスト内のJSON
    jsonMatch = agentOutput.match(/(\{[\s\S]*\})/);
  }

  if (!jsonMatch) {
    // パターン3: JSON開始・終了探索
    const startIndex = agentOutput.indexOf('{');
    const endIndex = agentOutput.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const jsonStr = agentOutput.substring(startIndex, endIndex + 1);
      try {
        return JSON.parse(jsonStr) as RollbackDecision;
      } catch (e) {
        // 次のフォールバックへ
      }
    }
  }

  if (!jsonMatch) {
    throw new Error(
      'Failed to extract JSON from agent output. ' +
      'Please use manual rollback mode: ' +
      'rollback --to-phase <phase> --reason <reason>'
    );
  }

  try {
    const decision = JSON.parse(jsonMatch[1]) as RollbackDecision;
    return decision;
  } catch (e) {
    throw new Error(
      `Failed to parse JSON from agent output: ${getErrorMessage(e)}. ` +
      'Please use manual rollback mode.'
    );
  }
}
```

#### 7.2.5 validateRollbackDecision()

```typescript
/**
 * RollbackDecisionのバリデーション
 *
 * @param decision - 判断結果
 * @throws {Error} バリデーション失敗時
 */
function validateRollbackDecision(decision: RollbackDecision): void {
  // needs_rollback フィールド必須
  if (typeof decision.needs_rollback !== 'boolean') {
    throw new Error(
      'Invalid agent output: "needs_rollback" field must be a boolean.'
    );
  }

  // needs_rollback=true の場合、to_phase 必須
  if (decision.needs_rollback && !decision.to_phase) {
    throw new Error(
      'Invalid agent output: "to_phase" field is required when needs_rollback=true.'
    );
  }

  // to_phase の値チェック
  if (decision.to_phase) {
    const validPhases: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];
    if (!validPhases.includes(decision.to_phase)) {
      throw new Error(
        `Invalid phase name: ${decision.to_phase}. ` +
        `Valid phases: ${validPhases.join(', ')}.`
      );
    }
  }

  // to_step の値チェック
  if (decision.to_step) {
    const validSteps: StepName[] = ['execute', 'review', 'revise'];
    if (!validSteps.includes(decision.to_step)) {
      throw new Error(
        `Invalid step name: ${decision.to_step}. ` +
        `Valid steps: ${validSteps.join(', ')}.`
      );
    }
  }

  // confidence の値チェック
  if (decision.confidence) {
    const validConfidences = ['high', 'medium', 'low'];
    if (!validConfidences.includes(decision.confidence)) {
      throw new Error(
        `Invalid confidence level: ${decision.confidence}. ` +
        `Valid levels: ${validConfidences.join(', ')}.`
      );
    }
  }

  // reason フィールド必須
  if (!decision.reason || decision.reason.trim().length === 0) {
    throw new Error(
      'Invalid agent output: "reason" field must be a non-empty string.'
    );
  }

  // analysis フィールド必須
  if (!decision.analysis || decision.analysis.trim().length === 0) {
    throw new Error(
      'Invalid agent output: "analysis" field must be a non-empty string.'
    );
  }
}
```

#### 7.2.6 confirmRollback()

```typescript
/**
 * confidence レベルに応じた確認プロンプト
 *
 * @param decision - 判断結果
 * @param force - 強制実行フラグ
 * @returns ユーザー確認結果
 */
async function confirmRollback(
  decision: RollbackDecision,
  force?: boolean
): Promise<boolean> {
  // confidence が high かつ --force の場合はスキップ
  if (decision.confidence === 'high' && force) {
    logger.info('Skipping confirmation (high confidence + --force).');
    return true;
  }

  // 確認プロンプト表示
  logger.info('Agent analysis complete:');
  logger.info(`  - Needs rollback: Yes`);
  logger.info(`  - Confidence: ${decision.confidence}`);
  logger.info(`  - To Phase: ${decision.to_phase}`);
  logger.info(`  - To Step: ${decision.to_step || 'revise'}`);
  logger.info('');
  logger.info('Analysis:');
  logger.info(decision.analysis);
  logger.info('');
  logger.info('Reason:');
  logger.info(decision.reason);
  logger.info('');

  // confidence が medium/low の場合は必ず確認
  if (decision.confidence === 'medium' || decision.confidence === 'low') {
    logger.warn(
      `Agent confidence is ${decision.confidence}. ` +
      'Please review the analysis carefully.'
    );
  }

  // ユーザー入力待ち
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question(
      `Proceed with rollback to ${decision.to_phase} (step: ${decision.to_step || 'revise'})? [y/N]: `,
      (answer: string) => {
        readline.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    );
  });
}
```

#### 7.2.7 displayDryRunPreview()

```typescript
/**
 * dry-run モードでのプレビュー表示
 *
 * @param decision - 判断結果
 */
function displayDryRunPreview(decision: RollbackDecision): void {
  logger.info('[DRY-RUN] Agent analysis complete:');

  if (!decision.needs_rollback) {
    logger.info('  - Needs rollback: No');
    logger.info('');
    logger.info('Reason:');
    logger.info(decision.reason);
    logger.info('');
    logger.info('Analysis:');
    logger.info(decision.analysis);
    logger.info('');
    logger.info('[DRY-RUN] No rollback needed. Exiting.');
    return;
  }

  logger.info('  - Needs rollback: Yes');
  logger.info(`  - Confidence: ${decision.confidence}`);
  logger.info(`  - To Phase: ${decision.to_phase}`);
  logger.info(`  - To Step: ${decision.to_step || 'revise'}`);
  logger.info('');
  logger.info('[DRY-RUN] Analysis:');
  logger.info(decision.analysis);
  logger.info('');
  logger.info('[DRY-RUN] Reason:');
  logger.info(decision.reason);
  logger.info('');
  logger.info(
    `[DRY-RUN] Rollback would be executed to: ${decision.to_phase} (step: ${decision.to_step || 'revise'})`
  );
  logger.info('[DRY-RUN] No actual rollback performed.');
}
```

### 7.3 プロンプトテンプレート設計

#### 7.3.1 auto-analyze.txt

```
あなたはAI Workflowの差し戻し判断エージェントです。
以下の情報を分析し、差し戻しが必要かどうか、必要な場合はどのフェーズに戻るべきかを判断してください。

## ワークフロー状態
@.ai-workflow/issue-{issue_number}/metadata.json

## 最新のレビュー結果（存在する場合）
{latest_review_result_reference}

## テスト結果（Testing Phase の場合）
{test_result_reference}

## 判断基準

### 1. 差し戻し不要のケース

以下の場合は差し戻しは不要です：
- すべてのフェーズが正常に完了している
- 現在のフェーズで対処可能な問題のみ
- レビュー結果がすべて PASS または INFO のみ
- テスト結果がすべて成功

### 2. 差し戻しが必要なケース

以下の場合は差し戻しが必要です：
- レビュー結果に BLOCKER が存在し、前段フェーズの修正が必要
- レビュー結果に MAJOR が存在し、設計や要件の見直しが必要
- テスト失敗が実装の問題に起因する（テストコードの問題ではない）
- 設計や要件の根本的な問題が発覚し、後続フェーズで対処できない

### 3. 差し戻し先の決定

差し戻し先フェーズは以下の基準で決定してください：
- **問題の根本原因があるフェーズ**を特定
- **最小限の差し戻し**で問題を解決できるフェーズを選択
- フェーズ番号が小さいほど影響範囲が大きいため、慎重に判断

**フェーズ順序**:
0. planning
1. requirements
2. design
3. test_scenario
4. implementation
5. test_implementation
6. testing
7. documentation
8. report
9. evaluation

**差し戻し先の決定例**:
- テストコードのバグ → `test_implementation` (Phase 5)
- 実装のバグ → `implementation` (Phase 4)
- テストシナリオの不足 → `test_scenario` (Phase 3)
- 設計の不備 → `design` (Phase 2)
- 要件の誤解 → `requirements` (Phase 1)
- 計画の見直し → `planning` (Phase 0)

### 4. to_step の決定

差し戻し先のステップは以下の基準で決定してください：
- **`revise`（デフォルト）**: レビューコメントの修正が必要な場合
- **`execute`**: フェーズ全体をやり直す必要がある場合
- **`review`**: 成果物は問題ないが、レビューのみ再実行する場合

### 5. confidence の決定

判断の信頼度を以下の基準で設定してください：
- **`high`**: 問題原因が明確で、差し戻し先が確実に特定できる
  - 例: テスト失敗ログに具体的なエラーメッセージとファイル名がある
- **`medium`**: 問題原因が推定でき、差し戻し先が妥当と思われる
  - 例: レビューコメントから問題のあるフェーズが推測できる
- **`low`**: 問題原因が不明確、または差し戻し先の判断に不確実性がある
  - 例: 複数のフェーズに問題がある可能性がある

## 出力形式（JSON）

以下の形式で出力してください：

```json
{
  "needs_rollback": true,
  "to_phase": "implementation",
  "to_step": "revise",
  "reason": "テスト失敗の原因が実装にあるため、Implementation Phase で修正が必要です。\n\n失敗したテスト:\n- test_commitRollback_converts_paths: 絶対パス変換ロジックが未実装\n- test_filterExistingFiles_handles_absolute_paths: パス結合の問題\n\n修正内容:\n- src/core/git/commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックを追加\n- path.relative() を使用してプロジェクトルートからの相対パスを計算",
  "confidence": "high",
  "analysis": "Testing Phase で 3 件のユニットテストが失敗しています。失敗内容を分析した結果、commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落していることが原因です。テストログには明確なエラーメッセージとファイル名が記載されており、問題箇所が特定できるため、confidence は high です。"
}
```

または差し戻し不要の場合：

```json
{
  "needs_rollback": false,
  "reason": "すべてのテストが成功しており、差し戻しは不要です。",
  "confidence": "high",
  "analysis": "Testing Phase の結果を確認しましたが、全テストが成功しています。レビュー結果にも BLOCKER や MAJOR はありません。現在のワークフローを継続できます。"
}
```

## 注意事項

1. **reason フィールド**:
   - 差し戻し先フェーズの revise ステップで参照されます
   - 具体的なファイル名、関数名、問題箇所を含めてください
   - 修正内容の方向性を示してください

2. **analysis フィールド**:
   - ユーザーが判断の妥当性を評価するための情報です
   - 分析の根拠を明確に記述してください
   - metadata.json、レビュー結果、テスト結果のどの部分を参照したかを示してください

3. **confidence が low の場合**:
   - ユーザーに確認を求めるため、判断理由を詳細に記述してください
   - 複数の可能性がある場合は、それぞれの選択肢を示してください

4. **JSON 形式の厳守**:
   - 必ず有効なJSON形式で出力してください
   - ダブルクォートを使用してください
   - 改行は `\n` でエスケープしてください

5. **フェールセーフ**:
   - 判断が難しい場合は、`confidence: "low"` を設定し、理由を詳しく説明してください
   - 不確実な判断より、ユーザー確認を求める方が安全です
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

- **影響なし**: 既存のGitHub認証（`GITHUB_TOKEN`）とエージェント認証（`CODEX_API_KEY`, `CLAUDE_CODE_CREDENTIALS_PATH`）を使用

### 8.2 データ保護

1. **エージェントに送信するデータの検証**:
   - metadata.json、レビュー結果、テスト結果に機密情報（APIキー、パスワード等）が含まれていないことを確認
   - 万が一含まれている場合は警告を表示

2. **ログファイルのセキュリティ**:
   - エージェント出力ログ（`agent_log.md`）に機密情報が含まれないことを確認
   - ログファイルのパーミッション設定（読み取り権限の制限）

### 8.3 セキュリティリスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| エージェント出力の改ざん | 中 | JSONバリデーションとconfidence制御により、異常な判断を検出 |
| 不正なファイル参照 | 低 | ファイルパス検証（パストラバーサル攻撃防止） |
| エージェント呼び出しタイムアウト | 低 | 120秒のタイムアウト設定とフォールバック処理 |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

| 項目 | 要件 | 実装方針 |
|------|------|---------|
| エージェント呼び出しタイムアウト | 最大120秒 | AgentExecutorのtimeoutオプション設定 |
| JSON パース処理時間 | 最大5秒 | 複数パターンのフォールバック処理で高速化 |
| ファイル読み込み | 最大10MB | fs.readFile()の制限なし（通常数KB程度） |

### 9.2 スケーラビリティ

- **影響なし**: 単一ワークフロー（Issue単位）の処理のため、スケーラビリティ要件なし

### 9.3 保守性

1. **モジュール分離**:
   - `handleRollbackAutoCommand()` を独立した関数として実装
   - ユニットテスト可能な関数設計

2. **エラーハンドリング**:
   - すべての外部呼び出し（エージェント、ファイルI/O）でtry-catchを使用
   - エラーメッセージは具体的で、ユーザーが対処方法を理解できる内容

3. **コーディング規約準拠**:
   - CLAUDE.md、ARCHITECTURE.md の規約に従う
   - 既存の `rollback.ts` のコーディングスタイルを踏襲

---

## 10. 実装の順序

### Phase 1: 基盤整備（1〜2時間）
1. `src/types/commands.ts` に `RollbackDecision` 型定義追加
2. `src/prompts/rollback/auto-analyze.txt` テンプレート作成

### Phase 2: コア機能実装（3〜4時間）
1. `collectAnalysisContext()` 実装（ファイル検索ロジック）
2. `buildAgentPrompt()` 実装（プロンプト生成）
3. `parseRollbackDecision()` 実装（JSON パース）
4. `validateRollbackDecision()` 実装（バリデーション）

### Phase 3: 統合処理実装（2〜3時間）
1. `confirmRollback()` 実装（確認プロンプト）
2. `displayDryRunPreview()` 実装（dry-run表示）
3. `handleRollbackAutoCommand()` 実装（全体統合）

### Phase 4: CLI統合（1〜2時間）
1. `src/commands/rollback.ts` にサブコマンド分岐追加
2. CLIオプション解析（`--dry-run`, `--force`, `--agent`）

### Phase 5: テスト実装（3〜4時間）
1. `tests/commands/rollback-auto.test.ts` 作成
   - ユニットテスト（JSON パース、バリデーション、confidence制御）
   - 統合テスト（エージェント呼び出し〜executeRollback）
2. `tests/commands/rollback.test.ts` 拡張
   - autoモード統合テスト追加（リグレッション）

### Phase 6: ドキュメント更新（1時間）
1. README.md に CLI ヘルプ、使用例の追加

**合計見積もり**: 11〜16時間

---

## 11. 品質ゲート（Phase 2完了条件）

設計書は以下の品質ゲートを満たしています：

- [x] **実装戦略の判断根拠が明記されている**: EXTEND戦略を選択し、既存コードとの統合を明示
- [x] **テスト戦略の判断根拠が明記されている**: UNIT_INTEGRATION戦略を選択し、ユニットテストと統合テストの両方で網羅
- [x] **テストコード戦略の判断根拠が明記されている**: BOTH_TEST戦略を選択し、既存テストの拡張と新規テストの作成を明示
- [x] **既存コードへの影響範囲が分析されている**: `rollback.ts`, `types/commands.ts` への影響を明示
- [x] **変更が必要なファイルがリストアップされている**: 新規2ファイル、修正4ファイルを明示
- [x] **設計が実装可能である**: 詳細な関数設計、型定義、プロンプトテンプレートを含む

---

## 12. 付録

### 12.1 エラーメッセージ一覧

| エラーケース | エラーメッセージ | 終了コード |
|------------|----------------|----------|
| metadata.json 未発見 | "ワークフローメタデータが見つかりません。先に `init` コマンドを実行してください。" | 1 |
| JSON パース失敗 | "エージェントの出力をパースできませんでした。手動モードをお試しください: rollback --to-phase <phase> --reason <reason>" | 1 |
| エージェント呼び出し失敗 | "エージェント呼び出しに失敗しました。手動モードをお試しください。" | 1 |
| エージェントタイムアウト | "エージェント呼び出しがタイムアウトしました（120秒）。手動モードをお試しください。" | 1 |
| 不正な to_phase 値 | "エージェントが不正なフェーズ名を返しました: {to_phase}。有効なフェーズ: planning, requirements, ..." | 1 |
| 不正な to_step 値 | "エージェントが不正なステップ名を返しました: {to_step}。有効なステップ: execute, review, revise" | 1 |
| confidence フィールド欠落 | "エージェントの出力に confidence フィールドがありません。" | 1 |

### 12.2 出力例

#### 12.2.1 成功時の出力

```
$ node dist/index.js rollback auto --issue 261

[INFO] Analyzing workflow state with agent...
[INFO] Using Claude Agent for rollback analysis

[INFO] Agent analysis complete:
  - Needs rollback: Yes
  - Confidence: high
  - To Phase: test_implementation
  - To Step: revise

[INFO] Analysis:
  Testing Phase で 3 件のユニットテストが失敗しています。
  失敗内容を分析した結果、test-implementation.ts のテストケースが
  最新の実装変更に追従していないことが原因です。

[INFO] Reason:
  テストコードの修正が必要です。
  - test_commitRollback_converts_paths: 絶対パス変換のアサーションを追加
  - test_filterExistingFiles_handles_absolute_paths: テストデータを更新

[CONFIRM] Proceed with rollback to test_implementation (step: revise)? [y/N]: y

[INFO] Executing rollback...
[INFO] ROLLBACK_REASON.md generated at .ai-workflow/issue-261/05_test_implementation/ROLLBACK_REASON.md
[INFO] Metadata updated: test_implementation -> in_progress
[INFO] Subsequent phases reset to pending
[INFO] Rollback committed: abc1234
[INFO] Rollback completed successfully.
```

#### 12.2.2 dry-run 時の出力

```
$ node dist/index.js rollback auto --issue 261 --dry-run

[DRY-RUN] Analyzing workflow state with agent...
[DRY-RUN] Using Claude Agent for rollback analysis

[DRY-RUN] Agent analysis complete:
  - Needs rollback: Yes
  - Confidence: high
  - To Phase: implementation
  - To Step: revise

[DRY-RUN] Analysis:
  テスト失敗の原因が実装にあります。

[DRY-RUN] Reason:
  commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落しています。

[DRY-RUN] Rollback would be executed to: implementation (step: revise)
[DRY-RUN] No actual rollback performed.
```

#### 12.2.3 差し戻し不要時の出力

```
$ node dist/index.js rollback auto --issue 261

[INFO] Analyzing workflow state with agent...
[INFO] Using Claude Agent for rollback analysis

[INFO] Agent analysis complete:
  - Needs rollback: No

[INFO] Reason:
  すべてのテストが成功しており、差し戻しは不要です。

[INFO] Analysis:
  Testing Phase の結果を確認しましたが、全テストが成功しています。
  レビュー結果にも BLOCKER や MAJOR はありません。

[INFO] No rollback needed. Exiting.
```

---

**設計書作成者**: AI Workflow Agent
**レビュー対象**: Test Scenario Phase
**次のアクション**: Design Phase Review
