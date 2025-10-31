# 詳細設計書 - Issue #90: フェーズ差し戻し機能の実装

**作成日**: 2025-01-30
**Issue番号**: #90
**プロジェクト**: AI Workflow Agent
**バージョン**: v0.4.0

---

## 0. Planning Document の確認

Planning Document（`planning.md`）で策定された開発計画を確認しました：

**実装戦略**: EXTEND
**テスト戦略**: UNIT_INTEGRATION
**複雑度**: 中程度
**見積もり工数**: 12~16時間
**リスク評価**: 中

**クリティカルパス**:
Phase 1（要件定義）→ Phase 2（設計）→ Phase 3（テストシナリオ）→ Phase 4（実装）→ Phase 5（テストコード実装）→ Phase 6（テスト実行）→ Phase 7（ドキュメント）→ Phase 8（レポート）

---

## 1. アーキテクチャ設計

### 1.1. システム全体図

```
┌───────────────────────────────────────────────────────────────┐
│                      Rollback コマンド                         │
│              (src/commands/rollback.ts)                       │
│                                                               │
│  • バリデーション                                              │
│  • 差し戻し理由の読み込み                                       │
│  • 確認プロンプト                                              │
│  • メタデータ更新のオーケストレーション                          │
└───────────────┬───────────────────────────────────────────────┘
                │
                │ 委譲
                ↓
┌───────────────────────────────────────────────────────────────┐
│              MetadataManager (拡張)                           │
│           (src/core/metadata-manager.ts)                      │
│                                                               │
│  新規メソッド:                                                 │
│  • setRollbackContext(phase, context)                        │
│  • getRollbackContext(phase)                                 │
│  • clearRollbackContext(phase)                               │
│  • addRollbackHistory(entry)                                 │
│  • updatePhaseForRollback(phase, step)                       │
│  • resetSubsequentPhases(fromPhase)                          │
└───────────────┬───────────────────────────────────────────────┘
                │
                │ 参照
                ↓
┌───────────────────────────────────────────────────────────────┐
│               BasePhase (拡張)                                │
│            (src/phases/base-phase.ts)                         │
│                                                               │
│  拡張ポイント:                                                 │
│  • loadPrompt() - 差し戻しコンテキストの注入                    │
│  • buildRollbackPromptSection() - Markdown生成                │
│  • run() - revise完了後のクリア処理                            │
└───────────────┬───────────────────────────────────────────────┘
                │
                │ 利用
                ↓
┌───────────────────────────────────────────────────────────────┐
│           ContentParser (拡張)                                │
│         (src/core/content-parser.ts)                          │
│                                                               │
│  新規メソッド:                                                 │
│  • extractBlockers(reviewResult)                             │
│  • extractSuggestions(reviewResult)                          │
└───────────────────────────────────────────────────────────────┘

                ┌─────────────────┐
                │  metadata.json  │
                │                 │
                │  新規フィールド: │
                │  • rollback_    │
                │    context      │
                │  • rollback_    │
                │    history      │
                └─────────────────┘
```

### 1.2. コンポーネント間の関係

**Rollback コマンド（新規）**
- `handleRollbackCommand()`: エントリーポイント、全体フローのオーケストレーション
- `MetadataManager` の新規メソッドを呼び出してメタデータを更新
- `ContentParser` の新規メソッドでレビュー結果からブロッカー情報を抽出（オプション）

**MetadataManager（拡張）**
- 差し戻しコンテキストの CRUD 操作を担当
- 差し戻し履歴の記録を担当
- 既存の `rollbackToPhase()` メソッドを拡張せず、新規メソッドで実装

**BasePhase（拡張）**
- `loadPrompt()` メソッドを拡張し、差し戻しコンテキストがある場合はプロンプトに注入
- `buildRollbackPromptSection()` メソッドで Markdown 形式の差し戻し情報を生成
- revise ステップ完了後に `rollback_context` をクリア

**ContentParser（拡張）**
- レビュー結果ファイルから構造化データとしてブロッカー情報を抽出
- OpenAI API を使用して自然言語をパース

### 1.3. データフロー

**差し戻し実行時のフロー**:

```
1. ユーザーがコマンド実行
   ↓
2. バリデーション（前提条件チェック）
   ↓
3. 差し戻し理由の読み込み
   - --reason: 直接指定
   - --reason-file: ファイル読み込み → ContentParser でパース（オプション）
   ↓
4. 確認プロンプト表示（--force でスキップ可能）
   ↓
5. MetadataManager.setRollbackContext() 呼び出し
   ↓
6. MetadataManager.updatePhaseForRollback() 呼び出し
   ↓
7. MetadataManager.resetSubsequentPhases() 呼び出し
   ↓
8. ROLLBACK_REASON.md 生成
   ↓
9. MetadataManager.addRollbackHistory() 呼び出し
   ↓
10. メタデータ保存
```

**差し戻し後のフェーズ実行フロー**:

```
1. execute コマンド実行（--issue <NUM> --phase <PHASE>）
   ↓
2. BasePhase.run() 呼び出し
   ↓
3. current_step が 'revise' の場合
   ↓
4. BasePhase.loadPrompt('revise') 呼び出し
   ↓
5. MetadataManager.getRollbackContext() で差し戻しコンテキストを取得
   ↓
6. 存在する場合、buildRollbackPromptSection() で Markdown 生成
   ↓
7. プロンプトの先頭に差し戻し情報を注入
   ↓
8. エージェントに渡してrevise実行
   ↓
9. revise完了後、MetadataManager.clearRollbackContext() 呼び出し
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:

1. **既存コードとの統合度**: 差し戻し機能は既存のワークフロー機構（`MetadataManager`、`BasePhase`、`ContentParser`）と密接に連携するため、これらのクラスを拡張する必要がある。

2. **新規モジュールの最小化**: 新規作成が必要なのは `src/commands/rollback.ts`（コマンドハンドラ）のみで、その他は既存クラスへのメソッド追加で実現可能。

3. **後方互換性の確保**: 既存のメソッドを変更せず、新規メソッドの追加とオプショナルフィールドの活用により、既存のワークフローに影響を与えない。

4. **アーキテクチャの一貫性**: 既存のコマンド構造（`src/commands/init.ts`, `src/commands/execute.ts` 等）に従い、同じパターンで実装できる。

5. **Planning Document との整合性**: Planning Document で「EXTEND」戦略が推奨されており、複数モジュールへの影響（MetadataManager, BasePhase, ContentParser, Commands）が明記されている。

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

1. **ユニットテストの必要性**: 各クラスの新規メソッド（`MetadataManager.setRollbackContext()`, `BasePhase.buildRollbackPromptSection()`, `ContentParser.extractBlockers()` 等）は独立してテスト可能であり、ユニットテストで動作を検証する。

2. **インテグレーションテストの必要性**: エンドツーエンドの差し戻しシナリオ（Phase 6 → Phase 4）、プロンプト注入の検証、メタデータ更新の検証は、複数のコンポーネントが連携するため、インテグレーションテストが必須。

3. **BDD テストは不要**: ユーザーストーリーよりも、システム内部の状態遷移とデータフローの検証が重要なため、BDD テストは不要。

4. **既存ワークフローへの影響確認**: 既存のフェーズ実行フローが正常に動作することを確認するため、インテグレーションテストが必要。

5. **Planning Document との整合性**: Planning Document で「UNIT_INTEGRATION」戦略が推奨されており、ユニットテストとインテグレーションテストの両方が必要と明記されている。

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:

1. **既存テストファイルの拡張**: 以下の既存テストファイルに新規メソッドのテストケースを追加する必要がある。
   - `tests/unit/core/metadata-manager.test.ts` - 新規メソッドのテスト追加
   - `tests/unit/phases/base-phase.test.ts` - `buildRollbackPromptSection()` のテスト追加
   - `tests/unit/core/content-parser.test.ts` - `extractBlockers()` のテスト追加

2. **新規テストファイルの作成**: 以下の新規テストファイルを作成する必要がある。
   - `tests/unit/commands/rollback.test.ts` - rollback コマンドのユニットテスト
   - `tests/integration/rollback-workflow.test.ts` - エンドツーエンドのインテグレーションテスト

3. **既存テストとの整合性**: 既存のテストファイル構造（`tests/unit/`, `tests/integration/`）に従い、一貫性のあるテストコードを作成できる。

4. **Planning Document との整合性**: Planning Document で「BOTH_TEST」戦略が推奨されており、既存テストの拡張と新規テストの作成の両方が必要と明記されている。

---

## 5. 影響範囲分析

### 5.1. 既存コードへの影響

**変更が必要なファイル**:

1. **`src/core/metadata-manager.ts`**（約239行、Issue #26で9.5%削減）
   - 影響度: 中
   - 変更内容: 新規メソッド追加（6個）、型定義追加
   - 後方互換性: 既存メソッドは変更なし、新規フィールドはオプショナル

2. **`src/phases/base-phase.ts`**（約445行、v0.3.1で40%削減）
   - 影響度: 中
   - 変更内容: `loadPrompt()` メソッドの拡張、`buildRollbackPromptSection()` メソッドの追加、`run()` メソッドの拡張
   - 後方互換性: 既存の動作は維持、差し戻しコンテキストがない場合は既存ロジックを使用

3. **`src/core/content-parser.ts`**
   - 影響度: 低
   - 変更内容: 新規メソッド追加（2個）
   - 後方互換性: 既存メソッドは変更なし

4. **`src/main.ts`**（約118行、v0.3.0でリファクタリング）
   - 影響度: 低
   - 変更内容: `rollback` コマンドの定義追加
   - 後方互換性: 既存コマンドに影響なし

5. **`src/types/commands.ts`**（約150行、Issue #45で拡張）
   - 影響度: 低
   - 変更内容: 新規型定義追加（3個）
   - 後方互換性: 既存型定義に影響なし

6. **`src/types.ts`**
   - 影響度: 低
   - 変更内容: `WorkflowMetadata` 型の拡張（オプショナルフィールド追加）
   - 後方互換性: 既存フィールドに影響なし

**新規作成ファイル**:

1. **`src/commands/rollback.ts`**
   - 約300行（見積もり）
   - `handleRollbackCommand()` 関数とヘルパー関数を実装

### 5.2. 依存関係の変更

**新規依存の追加**: なし（既存の依存関係のみを使用）

**既存依存の変更**: なし

### 5.3. マイグレーション要否

**不要**:
- `rollback_context` と `rollback_history` フィールドはオプショナル（後方互換性あり）
- 既存のメタデータ（`metadata.json`）は変更不要
- 新規フィールドは差し戻し実行時に自動的に追加される

---

## 6. 詳細設計

### 6.1. 型定義設計

#### 6.1.1. `src/types/commands.ts` への追加

```typescript
/**
 * Rollback コマンドのオプション定義
 */
export interface RollbackCommandOptions {
  /**
   * Issue番号（必須）
   */
  issue: string;

  /**
   * 差し戻し先フェーズ（必須）
   */
  toPhase: string;

  /**
   * 差し戻し理由（--reason で指定された場合）
   */
  reason?: string;

  /**
   * 差し戻し理由ファイルパス（--reason-file で指定された場合）
   */
  reasonFile?: string;

  /**
   * 差し戻し先ステップ（オプション、デフォルト: 'revise'）
   */
  toStep?: string;

  /**
   * 差し戻し元フェーズ（オプション、自動検出可能）
   */
  fromPhase?: string;

  /**
   * 確認プロンプトをスキップ（オプション、デフォルト: false）
   */
  force?: boolean;

  /**
   * ドライランモード（オプション、デフォルト: false）
   */
  dryRun?: boolean;

  /**
   * 対話的入力モード（オプション、デフォルト: false）
   */
  interactive?: boolean;
}

/**
 * 差し戻しコンテキスト（metadata.json の各フェーズに記録）
 */
export interface RollbackContext {
  /**
   * 差し戻し実行時刻（ISO 8601形式、UTC）
   */
  triggered_at: string;

  /**
   * 差し戻し元フェーズ（オプション）
   */
  from_phase?: string | null;

  /**
   * 差し戻し元ステップ（オプション）
   */
  from_step?: StepName | null;

  /**
   * 差し戻し理由（必須、1000文字以内）
   */
  reason: string;

  /**
   * レビュー結果ファイルへの @filepath 形式の参照（オプション）
   */
  review_result?: string | null;

  /**
   * 追加詳細情報（オプション）
   */
  details?: {
    blocker_count?: number;
    suggestion_count?: number;
    affected_tests?: string[];
    [key: string]: unknown;
  } | null;
}

/**
 * 差し戻し履歴エントリ（metadata.json のルートレベルに記録）
 */
export interface RollbackHistoryEntry {
  /**
   * 差し戻し実行時刻（ISO 8601形式、UTC）
   */
  timestamp: string;

  /**
   * 差し戻し元フェーズ（オプション）
   */
  from_phase?: string | null;

  /**
   * 差し戻し元ステップ（オプション）
   */
  from_step?: StepName | null;

  /**
   * 差し戻し先フェーズ（必須）
   */
  to_phase: string;

  /**
   * 差し戻し先ステップ（必須）
   */
  to_step: string;

  /**
   * 差し戻し理由（必須、1000文字以内）
   */
  reason: string;

  /**
   * トリガー元（manual | automatic、現在は manual のみ）
   */
  triggered_by: 'manual' | 'automatic';

  /**
   * レビュー結果ファイルのパス（オプション）
   */
  review_result_path?: string | null;
}
```

#### 6.1.2. `src/types.ts` への追加

```typescript
import type { RollbackContext, RollbackHistoryEntry } from './types/commands.js';

export interface PhaseMetadata {
  status: PhaseStatus;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  review_result: string | null;
  output_files?: string[];
  current_step?: StepName | null;
  completed_steps?: StepName[];

  // 新規フィールド: 差し戻しコンテキスト（オプショナル）
  rollback_context?: RollbackContext | null;
}

export interface WorkflowMetadata {
  issue_number: string;
  issue_url: string;
  issue_title: string;
  repository?: string | null;
  target_repository?: TargetRepository | null;
  workflow_version: string;
  current_phase: PhaseName;
  design_decisions: DesignDecisions;
  cost_tracking: CostTracking;
  phases: PhasesMetadata;
  pr_number?: number | null;
  pr_url?: string | null;
  branch_name?: string | null;
  github_integration?: {
    progress_comment_id?: number;
    progress_comment_url?: string;
  };
  external_documents?: Record<string, string>;
  created_at: string;
  updated_at: string;

  // 新規フィールド: 差し戻し履歴（オプショナル）
  rollback_history?: RollbackHistoryEntry[];
}
```

### 6.2. MetadataManager の拡張設計

#### 6.2.1. 新規メソッド一覧

```typescript
/**
 * 差し戻しコンテキストを設定
 * @param phaseName - 対象フェーズ名
 * @param context - 差し戻しコンテキスト
 */
public setRollbackContext(phaseName: PhaseName, context: RollbackContext): void;

/**
 * 差し戻しコンテキストを取得
 * @param phaseName - 対象フェーズ名
 * @returns 差し戻しコンテキスト（存在しない場合は null）
 */
public getRollbackContext(phaseName: PhaseName): RollbackContext | null;

/**
 * 差し戻しコンテキストをクリア
 * @param phaseName - 対象フェーズ名
 */
public clearRollbackContext(phaseName: PhaseName): void;

/**
 * 差し戻し履歴を追加
 * @param entry - 差し戻し履歴エントリ
 */
public addRollbackHistory(entry: RollbackHistoryEntry): void;

/**
 * フェーズを差し戻し用に更新（status, current_step, completed_at を変更）
 * @param phaseName - 対象フェーズ名
 * @param toStep - 差し戻し先ステップ（'execute' | 'review' | 'revise'）
 */
public updatePhaseForRollback(phaseName: PhaseName, toStep: StepName): void;

/**
 * 後続フェーズをリセット（指定フェーズより後のすべてのフェーズを pending に戻す）
 * @param fromPhase - 起点となるフェーズ名
 * @returns リセットされたフェーズ名の配列
 */
public resetSubsequentPhases(fromPhase: PhaseName): PhaseName[];
```

#### 6.2.2. 実装の詳細

**`setRollbackContext()` の実装**:

```typescript
public setRollbackContext(phaseName: PhaseName, context: RollbackContext): void {
  const phaseData = this.state.data.phases[phaseName];
  phaseData.rollback_context = context;
  this.save();

  logger.info(`Rollback context set for phase ${phaseName}`);
}
```

**`getRollbackContext()` の実装**:

```typescript
public getRollbackContext(phaseName: PhaseName): RollbackContext | null {
  const phaseData = this.state.data.phases[phaseName];
  return phaseData.rollback_context ?? null;
}
```

**`clearRollbackContext()` の実装**:

```typescript
public clearRollbackContext(phaseName: PhaseName): void {
  const phaseData = this.state.data.phases[phaseName];
  phaseData.rollback_context = null;
  this.save();

  logger.info(`Rollback context cleared for phase ${phaseName}`);
}
```

**`addRollbackHistory()` の実装**:

```typescript
public addRollbackHistory(entry: RollbackHistoryEntry): void {
  if (!this.state.data.rollback_history) {
    this.state.data.rollback_history = [];
  }

  this.state.data.rollback_history.push(entry);
  this.save();

  logger.info(`Rollback history entry added: ${entry.to_phase} <- ${entry.from_phase ?? 'unknown'}`);
}
```

**`updatePhaseForRollback()` の実装**:

```typescript
public updatePhaseForRollback(phaseName: PhaseName, toStep: StepName): void {
  const phaseData = this.state.data.phases[phaseName];

  phaseData.status = 'in_progress';
  phaseData.current_step = toStep;
  phaseData.completed_at = null;

  // completed_steps は維持（execute, review は完了済みとして保持）
  // toStep が 'execute' の場合は completed_steps をクリア
  if (toStep === 'execute') {
    phaseData.completed_steps = [];
  }

  this.save();

  logger.info(`Phase ${phaseName} updated for rollback: status=in_progress, current_step=${toStep}`);
}
```

**`resetSubsequentPhases()` の実装**:

```typescript
public resetSubsequentPhases(fromPhase: PhaseName): PhaseName[] {
  const phases = Object.keys(this.state.data.phases) as PhaseName[];
  const startIndex = phases.indexOf(fromPhase);

  if (startIndex === -1) {
    logger.warn(`Phase ${fromPhase} not found in metadata`);
    return [];
  }

  // 指定フェーズより後のフェーズをリセット
  const subsequentPhases = phases.slice(startIndex + 1);

  for (const phase of subsequentPhases) {
    const phaseData = this.state.data.phases[phase];
    phaseData.status = 'pending';
    phaseData.started_at = null;
    phaseData.completed_at = null;
    phaseData.current_step = null;
    phaseData.completed_steps = [];
    phaseData.retry_count = 0;
    phaseData.rollback_context = null; // 既存の差し戻しコンテキストもクリア
  }

  this.save();

  logger.info(`Reset subsequent phases: ${subsequentPhases.join(', ')}`);
  return subsequentPhases;
}
```

### 6.3. BasePhase の拡張設計

#### 6.3.1. `loadPrompt()` メソッドの拡張

**現在の実装**:

```typescript
protected loadPrompt(promptType: 'execute' | 'review' | 'revise'): string {
  const promptPath = path.join(promptsRoot, this.phaseName, `${promptType}.txt`);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  return fs.readFileSync(promptPath, 'utf-8');
}
```

**拡張後の実装**:

```typescript
protected loadPrompt(promptType: 'execute' | 'review' | 'revise'): string {
  const promptPath = path.join(promptsRoot, this.phaseName, `${promptType}.txt`);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }

  let prompt = fs.readFileSync(promptPath, 'utf-8');

  // 差し戻しコンテキストがある場合、プロンプトの先頭に追加
  // revise ステップのみに差し戻し情報を注入
  if (promptType === 'revise') {
    const rollbackContext = this.metadata.getRollbackContext(this.phaseName);
    if (rollbackContext) {
      const rollbackSection = this.buildRollbackPromptSection(rollbackContext);
      prompt = rollbackSection + '\n\n' + prompt;

      logger.info(`Rollback context injected into revise prompt for phase ${this.phaseName}`);
    }
  }

  return prompt;
}
```

#### 6.3.2. `buildRollbackPromptSection()` メソッドの実装

```typescript
/**
 * 差し戻し情報をMarkdown形式で生成
 * @param context - 差し戻しコンテキスト
 * @returns Markdown形式の差し戻し情報
 */
protected buildRollbackPromptSection(context: RollbackContext): string {
  const sections: string[] = [];

  // ヘッダー
  sections.push('# ⚠️ 差し戻し情報');
  sections.push('');

  // 差し戻し元フェーズ
  const fromPhaseText = context.from_phase
    ? `Phase ${context.from_phase}`
    : '不明なフェーズ';
  sections.push(`**このフェーズは ${fromPhaseText} から差し戻されました。**`);
  sections.push('');

  // 差し戻しの理由
  sections.push('## 差し戻しの理由:');
  sections.push(context.reason);
  sections.push('');

  // 詳細情報（存在する場合）
  if (context.details) {
    sections.push('## 詳細情報:');

    if (context.details.blocker_count !== undefined) {
      sections.push(`- ブロッカー数: ${context.details.blocker_count}`);
    }

    if (context.details.suggestion_count !== undefined) {
      sections.push(`- 改善提案数: ${context.details.suggestion_count}`);
    }

    if (context.details.affected_tests && context.details.affected_tests.length > 0) {
      sections.push(`- 影響を受けるテスト: ${context.details.affected_tests.join(', ')}`);
    }

    sections.push('');
  }

  // 参照すべきドキュメント
  if (context.review_result) {
    sections.push('## 参照すべきドキュメント:');
    sections.push(`- ${context.review_result}`);
    sections.push('');
  }

  // 区切り線
  sections.push('---');
  sections.push('');

  return sections.join('\n');
}
```

#### 6.3.3. `run()` メソッドの拡張

**PhaseRunner の拡張（Issue #49 で既にモジュール化されている）**:

`src/phases/lifecycle/phase-runner.ts` の `finalizePhase()` メソッドで、revise ステップ完了後に `rollback_context` をクリアする処理を追加します。

```typescript
// src/phases/lifecycle/phase-runner.ts の finalizePhase() メソッド内

private async finalizePhase(
  gitManager: import('../../core/git-manager.js').GitManager | null,
  options: PhaseRunOptions
): Promise<void> {
  // ... 既存の処理 ...

  // revise 完了後、rollback_context をクリア
  const completedSteps = this.metadata.getCompletedSteps(this.phaseName);
  if (completedSteps.includes('revise')) {
    const rollbackContext = this.metadata.getRollbackContext(this.phaseName);
    if (rollbackContext) {
      this.metadata.clearRollbackContext(this.phaseName);
      logger.info(`Rollback context cleared after revise completion for phase ${this.phaseName}`);
    }
  }

  // ... 既存の処理 ...
}
```

### 6.4. ContentParser の拡張設計

#### 6.4.1. `extractBlockers()` メソッドの実装

```typescript
/**
 * レビュー結果からブロッカー情報を抽出
 * @param reviewResult - レビュー結果のMarkdownテキスト
 * @returns ブロッカー情報の配列
 */
public async extractBlockers(reviewResult: string): Promise<ReviewBlocker[]> {
  // OpenAI API を使用してブロッカー情報を抽出
  const prompt = `
以下のレビュー結果から、ブロッカー（BLOCKER）情報を抽出してください。
各ブロッカーについて、以下の情報をJSON配列として返してください：

- title: ブロッカーのタイトル
- problem: 問題の説明
- impact: 影響の説明
- solution: 対策の説明

レビュー結果:
${reviewResult}

JSON配列のみを返してください（他の説明は不要）。
ブロッカーが存在しない場合は空配列 [] を返してください。
`;

  try {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0,
    });

    const content = response.choices?.[0]?.message?.content ?? '[]';
    const parsed = JSON.parse(content) as ReviewBlocker[];

    logger.info(`Extracted ${parsed.length} blockers from review result`);
    return parsed;
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(`Failed to extract blockers: ${message}`);
    return [];
  }
}
```

#### 6.4.2. `extractSuggestions()` メソッドの実装

```typescript
/**
 * レビュー結果から改善提案を抽出
 * @param reviewResult - レビュー結果のMarkdownテキスト
 * @returns 改善提案の配列
 */
public async extractSuggestions(reviewResult: string): Promise<string[]> {
  // OpenAI API を使用して改善提案を抽出
  const prompt = `
以下のレビュー結果から、改善提案（SUGGESTION）を抽出してください。
各改善提案を1行ずつ、JSON配列として返してください。

レビュー結果:
${reviewResult}

JSON配列のみを返してください（他の説明は不要）。
改善提案が存在しない場合は空配列 [] を返してください。
`;

  try {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0,
    });

    const content = response.choices?.[0]?.message?.content ?? '[]';
    const parsed = JSON.parse(content) as string[];

    logger.info(`Extracted ${parsed.length} suggestions from review result`);
    return parsed;
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(`Failed to extract suggestions: ${message}`);
    return [];
  }
}
```

#### 6.4.3. 型定義

```typescript
/**
 * レビューブロッカー情報
 */
export interface ReviewBlocker {
  /**
   * ブロッカーのタイトル
   */
  title: string;

  /**
   * 問題の説明
   */
  problem: string;

  /**
   * 影響の説明
   */
  impact: string;

  /**
   * 対策の説明
   */
  solution: string;
}
```

### 6.5. Rollback コマンドの実装設計

#### 6.5.1. コマンドエントリーポイント

**`src/main.ts` への追加**:

```typescript
// Rollback コマンド (Issue #90)
program
  .command('rollback')
  .description('Roll back a phase to a previous step')
  .requiredOption('--issue <number>', 'Issue number')
  .requiredOption('--to-phase <phase>', 'Target phase to roll back to')
  .option('--reason <text>', 'Rollback reason (text)')
  .option('--reason-file <path>', 'Rollback reason (file path)')
  .option('--to-step <step>', 'Target step (execute|review|revise)', 'revise')
  .option('--from-phase <phase>', 'Source phase (auto-detected if not specified)')
  .option('--force', 'Skip confirmation prompt', false)
  .option('--dry-run', 'Preview changes without updating metadata', false)
  .option('--interactive', 'Interactive mode for entering rollback reason', false)
  .action(async (options: RollbackCommandOptions) => {
    try {
      await handleRollbackCommand(options);
    } catch (error) {
      reportFatalError('rollback', error);
    }
  });
```

#### 6.5.2. `handleRollbackCommand()` 関数の実装

**ファイル**: `src/commands/rollback.ts`

**全体フロー**:

```typescript
export async function handleRollbackCommand(options: RollbackCommandOptions): Promise<void> {
  // 1. メタデータ読み込み
  const { metadataManager, workflowDir } = await loadWorkflowMetadata(options.issue);

  // 2. バリデーション
  validateRollbackOptions(options, metadataManager);

  // 3. 差し戻し理由の読み込み
  const reason = await loadRollbackReason(options, workflowDir);

  // 4. レビュー結果からブロッカー情報を抽出（--reason-file の場合）
  const details = await extractRollbackDetails(options, reason);

  // 5. 確認プロンプト（--force でスキップ）
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmRollback(
      options.toPhase,
      reason,
      metadataManager
    );

    if (!confirmed) {
      logger.info('Rollback cancelled.');
      return;
    }
  }

  // 6. ドライランモードの処理
  if (options.dryRun) {
    previewRollback(options, metadataManager, reason, details);
    return;
  }

  // 7. 差し戻し実行
  await executeRollback(
    options,
    metadataManager,
    workflowDir,
    reason,
    details
  );

  logger.info('Rollback completed successfully.');
}
```

#### 6.5.3. ヘルパー関数の実装

**`loadWorkflowMetadata()`**:

```typescript
async function loadWorkflowMetadata(issueNumber: string): Promise<{
  metadataManager: MetadataManager;
  workflowDir: string;
}> {
  const issueNum = parseInt(issueNumber, 10);
  if (Number.isNaN(issueNum) || issueNum < 1) {
    throw new Error(`Invalid issue number: ${issueNumber}`);
  }

  // メタデータの探索
  const metadataPath = await findWorkflowMetadata(issueNum);
  if (!metadataPath) {
    throw new Error(
      `Workflow metadata not found for issue ${issueNum}. ` +
      `Please run 'init' command first.`
    );
  }

  const metadataManager = new MetadataManager(metadataPath);
  const workflowDir = metadataManager.workflowDir;

  logger.info(`Loaded workflow metadata: ${metadataPath}`);
  return { metadataManager, workflowDir };
}
```

**`validateRollbackOptions()`**:

```typescript
function validateRollbackOptions(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager
): void {
  // 1. to-phase の有効性チェック
  const validPhases: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];

  const toPhase = options.toPhase as PhaseName;
  if (!validPhases.includes(toPhase)) {
    throw new Error(
      `Invalid phase name: ${options.toPhase}. ` +
      `Use 'list-presets' command to see valid phase names.`
    );
  }

  // 2. to-step の有効性チェック
  const validSteps: StepName[] = ['execute', 'review', 'revise'];
  const toStep = (options.toStep ?? 'revise') as StepName;
  if (!validSteps.includes(toStep)) {
    throw new Error(
      `Invalid step: ${options.toStep}. ` +
      `Valid steps are: execute, review, revise.`
    );
  }

  // 3. 対象フェーズの状態チェック
  const phaseStatus = metadataManager.getPhaseStatus(toPhase);
  if (phaseStatus === 'pending') {
    throw new Error(
      `Cannot rollback to phase '${options.toPhase}' ` +
      `because it has not been started yet.`
    );
  }

  // 4. 差し戻し理由の提供チェック
  if (!options.reason && !options.reasonFile && !options.interactive) {
    throw new Error(
      'Rollback reason is required. ' +
      'Use --reason, --reason-file, or --interactive option.'
    );
  }
}
```

**`loadRollbackReason()`**:

```typescript
async function loadRollbackReason(
  options: RollbackCommandOptions,
  workflowDir: string
): Promise<string> {
  // 1. --reason オプション（直接指定）
  if (options.reason) {
    if (options.reason.trim().length === 0) {
      throw new Error('Rollback reason cannot be empty.');
    }

    if (options.reason.length > 1000) {
      throw new Error('Rollback reason must be 1000 characters or less.');
    }

    logger.info('Using rollback reason from --reason option');
    return options.reason.trim();
  }

  // 2. --reason-file オプション（ファイル読み込み）
  if (options.reasonFile) {
    const reasonFilePath = path.resolve(options.reasonFile);

    if (!fs.existsSync(reasonFilePath)) {
      throw new Error(`Reason file not found: ${reasonFilePath}`);
    }

    // ファイルサイズ上限チェック（100KB）
    const stats = fs.statSync(reasonFilePath);
    if (stats.size > 100 * 1024) {
      throw new Error('Reason file must be 100KB or less.');
    }

    const reason = fs.readFileSync(reasonFilePath, 'utf-8').trim();

    if (reason.length === 0) {
      throw new Error('Reason file is empty.');
    }

    logger.info(`Loaded rollback reason from file: ${reasonFilePath}`);
    return reason;
  }

  // 3. --interactive オプション（対話的入力）
  if (options.interactive) {
    return await promptUserForReason();
  }

  throw new Error('Rollback reason is required.');
}
```

**`extractRollbackDetails()`**:

```typescript
async function extractRollbackDetails(
  options: RollbackCommandOptions,
  reason: string
): Promise<RollbackContext['details'] | null> {
  // --reason-file が指定されていない場合は null を返す
  if (!options.reasonFile) {
    return null;
  }

  try {
    // ContentParser を使用してブロッカー情報を抽出
    const contentParser = new ContentParser();
    const blockers = await contentParser.extractBlockers(reason);
    const suggestions = await contentParser.extractSuggestions(reason);

    // details オブジェクトを構築
    const details: RollbackContext['details'] = {
      blocker_count: blockers.length,
      suggestion_count: suggestions.length,
    };

    // affected_tests などの追加情報は将来的に拡張可能

    logger.info(`Extracted rollback details: ${JSON.stringify(details)}`);
    return details;
  } catch (error) {
    logger.warn(`Failed to extract rollback details: ${getErrorMessage(error)}`);
    return null;
  }
}
```

**`confirmRollback()`**:

```typescript
async function confirmRollback(
  toPhase: string,
  reason: string,
  metadataManager: MetadataManager
): Promise<boolean> {
  // CI環境では自動的にスキップ
  if (config.isCI()) {
    logger.info('CI environment detected. Skipping confirmation prompt.');
    return true;
  }

  // 影響を受けるフェーズをリスト化
  const phases = Object.keys(metadataManager.data.phases) as PhaseName[];
  const toPhaseIndex = phases.indexOf(toPhase as PhaseName);
  const affectedPhases = phases.slice(toPhaseIndex);

  // 警告メッセージを表示
  logger.warn(`Rolling back to phase '${toPhase}' will reset the following phases:`);

  for (const phase of affectedPhases) {
    const phaseData = metadataManager.data.phases[phase];
    logger.warn(`  - ${phase} (status: ${phaseData.status})`);
  }

  logger.warn('All progress in these phases will be lost.');
  logger.warn('');
  logger.warn(`Rollback reason: ${reason.slice(0, 100)}${reason.length > 100 ? '...' : ''}`);
  logger.warn('');

  // ユーザーに確認を求める
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('Do you want to continue? [y/N]: ', (answer: string) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}
```

**`previewRollback()`**:

```typescript
function previewRollback(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager,
  reason: string,
  details: RollbackContext['details'] | null
): void {
  logger.info('[DRY RUN] Rollback preview:');
  logger.info('');

  const toPhase = options.toPhase as PhaseName;
  const toStep = (options.toStep ?? 'revise') as StepName;

  // 対象フェーズの変更内容
  const phaseData = metadataManager.data.phases[toPhase];
  logger.info(`Target phase: ${toPhase}`);
  logger.info(`  status: ${phaseData.status} → in_progress`);
  logger.info(`  current_step: ${phaseData.current_step ?? 'null'} → ${toStep}`);
  logger.info(`  rollback_context: (new)`);
  logger.info(`    triggered_at: ${new Date().toISOString()}`);
  if (options.fromPhase) {
    logger.info(`    from_phase: ${options.fromPhase}`);
  }
  logger.info(`    reason: ${reason.slice(0, 100)}${reason.length > 100 ? '...' : ''}`);
  if (details) {
    logger.info(`    details: ${JSON.stringify(details)}`);
  }
  logger.info('');

  // 後続フェーズのリセット内容
  const phases = Object.keys(metadataManager.data.phases) as PhaseName[];
  const toPhaseIndex = phases.indexOf(toPhase);
  const subsequentPhases = phases.slice(toPhaseIndex + 1);

  logger.info('Subsequent phases to be reset:');
  for (const phase of subsequentPhases) {
    const phaseData = metadataManager.data.phases[phase];
    logger.info(`  - ${phase}: ${phaseData.status} → pending`);
  }
  logger.info('');

  // ROLLBACK_REASON.md の内容プレビュー
  logger.info('ROLLBACK_REASON.md content:');
  logger.info('---');
  logger.info(generateRollbackReasonMarkdown(options, reason, details));
  logger.info('---');
  logger.info('');

  logger.info('[DRY RUN] No changes were made. Remove --dry-run to execute.');
}
```

**`executeRollback()`**:

```typescript
async function executeRollback(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager,
  workflowDir: string,
  reason: string,
  details: RollbackContext['details'] | null
): Promise<void> {
  const toPhase = options.toPhase as PhaseName;
  const toStep = (options.toStep ?? 'revise') as StepName;

  // 1. 差し戻しコンテキストを設定
  const rollbackContext: RollbackContext = {
    triggered_at: new Date().toISOString(),
    from_phase: options.fromPhase ?? null,
    from_step: null, // 将来的に自動検出を実装
    reason: reason,
    review_result: options.reasonFile ?? null,
    details: details,
  };

  metadataManager.setRollbackContext(toPhase, rollbackContext);
  logger.info(`Rollback context set for phase ${toPhase}`);

  // 2. 対象フェーズを更新
  metadataManager.updatePhaseForRollback(toPhase, toStep);
  logger.info(`Phase ${toPhase} updated: status=in_progress, current_step=${toStep}`);

  // 3. 後続フェーズをリセット
  const resetPhases = metadataManager.resetSubsequentPhases(toPhase);
  logger.info(`Reset subsequent phases: ${resetPhases.join(', ')}`);

  // 4. current_phase を更新
  metadataManager.data.current_phase = toPhase;
  metadataManager.save();

  // 5. ROLLBACK_REASON.md を生成
  const rollbackReasonMd = generateRollbackReasonMarkdown(options, reason, details);
  const phaseNumber = getPhaseNumber(toPhase);
  const rollbackReasonPath = path.join(
    workflowDir,
    `${phaseNumber}_${toPhase}`,
    'ROLLBACK_REASON.md'
  );

  fs.writeFileSync(rollbackReasonPath, rollbackReasonMd, 'utf-8');
  logger.info(`ROLLBACK_REASON.md generated: ${rollbackReasonPath}`);

  // 6. 差し戻し履歴を追加
  const historyEntry: RollbackHistoryEntry = {
    timestamp: rollbackContext.triggered_at,
    from_phase: options.fromPhase ?? null,
    from_step: null,
    to_phase: toPhase,
    to_step: toStep,
    reason: reason,
    triggered_by: 'manual',
    review_result_path: options.reasonFile ?? null,
  };

  metadataManager.addRollbackHistory(historyEntry);
  logger.info('Rollback history entry added');
}
```

**`generateRollbackReasonMarkdown()`**:

```typescript
function generateRollbackReasonMarkdown(
  options: RollbackCommandOptions,
  reason: string,
  details: RollbackContext['details'] | null
): string {
  const sections: string[] = [];

  const toPhase = options.toPhase;
  const phaseNumber = getPhaseNumber(toPhase as PhaseName);

  sections.push(`# Phase ${phaseNumber} (${toPhase}) への差し戻し理由`);
  sections.push('');

  if (options.fromPhase) {
    sections.push(`**差し戻し元**: Phase ${options.fromPhase}`);
  }
  sections.push(`**差し戻し日時**: ${new Date().toISOString()}`);
  sections.push('');

  sections.push('## 差し戻しの理由');
  sections.push('');
  sections.push(reason);
  sections.push('');

  if (details) {
    sections.push('## 詳細情報');
    sections.push('');

    if (details.blocker_count !== undefined) {
      sections.push(`- ブロッカー数: ${details.blocker_count}`);
    }

    if (details.suggestion_count !== undefined) {
      sections.push(`- 改善提案数: ${details.suggestion_count}`);
    }

    if (details.affected_tests && details.affected_tests.length > 0) {
      sections.push(`- 影響を受けるテスト: ${details.affected_tests.join(', ')}`);
    }

    sections.push('');
  }

  if (options.reasonFile) {
    sections.push('### 参照ドキュメント');
    sections.push('');
    sections.push(`- レビュー結果: @${options.reasonFile}`);
    sections.push('');
  }

  sections.push('### 修正後の確認事項');
  sections.push('');
  sections.push('1. 差し戻し理由に記載された問題を修正');
  sections.push('2. ビルドが成功することを確認');
  sections.push('3. テストが成功することを確認（該当する場合）');
  sections.push('');

  return sections.join('\n');
}
```

**`promptUserForReason()`**:

```typescript
async function promptUserForReason(): Promise<string> {
  logger.info('Please enter the rollback reason (press Ctrl+D when finished):');
  logger.info('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const lines: string[] = [];

  return new Promise<string>((resolve, reject) => {
    rl.on('line', (line: string) => {
      lines.push(line);
    });

    rl.on('close', () => {
      const reason = lines.join('\n').trim();

      if (reason.length === 0) {
        reject(new Error('Rollback reason cannot be empty.'));
        return;
      }

      if (reason.length > 1000) {
        reject(new Error('Rollback reason must be 1000 characters or less.'));
        return;
      }

      resolve(reason);
    });
  });
}
```

**`getPhaseNumber()`**:

```typescript
function getPhaseNumber(phase: PhaseName): string {
  const mapping: Record<PhaseName, string> = {
    planning: '00',
    requirements: '01',
    design: '02',
    test_scenario: '03',
    implementation: '04',
    test_implementation: '05',
    testing: '06',
    documentation: '07',
    report: '08',
    evaluation: '09',
  };
  return mapping[phase];
}
```

---

## 7. セキュリティ考慮事項

### 7.1. 入力バリデーション

**すべてのコマンドライン引数を厳格に検証**:
- `--issue`: 正の整数値であることを確認
- `--to-phase`: 有効なフェーズ名であることを確認
- `--to-step`: 有効なステップ名（execute | review | revise）であることを確認
- `--reason`: 1000文字以内であることを確認
- `--reason-file`: ファイルパスが安全であることを確認

**実装例**:
```typescript
// Issue番号のバリデーション
const issueNum = parseInt(options.issue, 10);
if (Number.isNaN(issueNum) || issueNum < 1) {
  throw new Error(`Invalid issue number: ${options.issue}`);
}

// 理由の文字数制限
if (reason.length > 1000) {
  throw new Error('Rollback reason must be 1000 characters or less.');
}
```

### 7.2. パストラバーサル対策

**`--reason-file` で指定されたパスの検証**:
- ファイルパスが `.ai-workflow/` ディレクトリ内に限定されることを推奨
- `../` などの相対パスによる不正なファイルアクセスを防止

**実装例**:
```typescript
const reasonFilePath = path.resolve(options.reasonFile);
const workflowRootPath = path.resolve(workflowDir, '..');

// パスが .ai-workflow/ ディレクトリ内にあることを確認
if (!reasonFilePath.startsWith(workflowRootPath)) {
  logger.warn(
    `Reason file is outside the workflow directory. ` +
    `This is allowed but may be a security risk.`
  );
}
```

### 7.3. メタデータ整合性

**`metadata.json` の構造を検証**:
- 不正なデータが書き込まれないようにする
- JSON スキーマバリデーションは既存の `WorkflowState` クラスで実施

**実装例**:
```typescript
// MetadataManager は既に WorkflowState を使用してバリデーション済み
const metadataManager = new MetadataManager(metadataPath);

// rollback_context の型安全性は TypeScript の型システムで保証
metadataManager.setRollbackContext(toPhase, rollbackContext);
```

### 7.4. ファイルサイズ制限

**`--reason-file` で指定されたファイルのサイズ制限**:
- ファイルサイズ上限: 100KB
- メモリ消費量の制限

**実装例**:
```typescript
const stats = fs.statSync(reasonFilePath);
if (stats.size > 100 * 1024) {
  throw new Error('Reason file must be 100KB or less.');
}
```

---

## 8. 非機能要件への対応

### 8.1. パフォーマンス

**要求水準**: コマンド実行時間10秒以内（確認プロンプトを除く）

**設計上の配慮**:
- メタデータの読み書きは同期的に実行（fs-extra の同期API使用）
- OpenAI API 呼び出しは非同期で実行（async/await）
- ファイル操作は最小限に抑える（ROLLBACK_REASON.md のみ生成）

**測定方法**:
- インテグレーションテストで実行時間を測定
- 目標値を超える場合は警告を表示

### 8.2. スケーラビリティ

**要求水準**: 差し戻し履歴が100件以上でも正常に動作

**設計上の配慮**:
- `rollback_history` は配列として保存され、メモリに全件ロードされる
- 差し戻し履歴の取得は O(1)（配列の末尾に追加）

**将来的な改善**:
- 差し戻し履歴の上限を設定（例: 最新100件のみ保持）
- 古い履歴を別ファイルにアーカイブ

### 8.3. 保守性

**要求水準**: コードが読みやすく、変更が容易

**設計上の配慮**:
- 関数を小さく保つ（1関数あたり50行以内を目標）
- 明確な関数名とコメント
- TypeScript の型システムを活用

**JSDoc コメント**:
```typescript
/**
 * 差し戻しコンテキストを設定
 * @param phaseName - 対象フェーズ名
 * @param context - 差し戻しコンテキスト
 */
public setRollbackContext(phaseName: PhaseName, context: RollbackContext): void;
```

---

## 9. 実装の順序

**推奨順序**:

1. **Phase 4 (implementation) - タスク順**:
   1. 型定義の追加（`src/types/commands.ts`, `src/types.ts`）
   2. MetadataManager の拡張（新規メソッド6個）
   3. ContentParser の拡張（新規メソッド2個）
   4. BasePhase の拡張（`loadPrompt()`, `buildRollbackPromptSection()`）
   5. PhaseRunner の拡張（revise完了後のクリア処理）
   6. Rollback コマンドの実装（`src/commands/rollback.ts`）
   7. CLI コマンドの追加（`src/main.ts`）

2. **依存関係の考慮**:
   - 型定義 → MetadataManager → BasePhase → Rollback コマンド
   - ContentParser は独立しており、並行して実装可能

3. **テスト駆動開発（TDD）の推奨**:
   - 各モジュールの実装前にテストケースを作成
   - ユニットテストを先に書き、実装を後から追加

---

## 10. 変更・追加ファイルリスト

### 10.1. 新規作成ファイル

| ファイルパス | 説明 | 行数（見積もり） |
|------------|------|-----------------|
| `src/commands/rollback.ts` | Rollback コマンドハンドラ | 約300行 |
| `tests/unit/commands/rollback.test.ts` | Rollback コマンドのユニットテスト | 約200行 |
| `tests/integration/rollback-workflow.test.ts` | エンドツーエンドのインテグレーションテスト | 約150行 |

### 10.2. 修正が必要な既存ファイル

| ファイルパス | 変更内容 | 影響度 |
|------------|---------|--------|
| `src/core/metadata-manager.ts` | 新規メソッド追加（6個） | 中 |
| `src/phases/base-phase.ts` | `loadPrompt()` 拡張、新規メソッド追加（1個） | 中 |
| `src/phases/lifecycle/phase-runner.ts` | `finalizePhase()` 拡張（revise完了後のクリア処理） | 低 |
| `src/core/content-parser.ts` | 新規メソッド追加（2個） | 低 |
| `src/main.ts` | `rollback` コマンド定義追加 | 低 |
| `src/types/commands.ts` | 新規型定義追加（3個） | 低 |
| `src/types.ts` | `WorkflowMetadata` 型拡張 | 低 |
| `tests/unit/core/metadata-manager.test.ts` | 新規メソッドのテストケース追加 | 低 |
| `tests/unit/phases/base-phase.test.ts` | `buildRollbackPromptSection()` のテストケース追加 | 低 |
| `tests/unit/core/content-parser.test.ts` | `extractBlockers()` のテストケース追加 | 低 |

### 10.3. 削除が必要なファイル

なし

---

## 11. 品質ゲート（Phase 2）

以下の品質ゲートを満たしていることを確認しました：

- [x] **実装戦略の判断根拠が明記されている**
  - EXTEND 戦略を選択
  - 判断根拠: 既存コードとの統合度、新規モジュールの最小化、後方互換性の確保、アーキテクチャの一貫性、Planning Document との整合性

- [x] **テスト戦略の判断根拠が明記されている**
  - UNIT_INTEGRATION 戦略を選択
  - 判断根拠: ユニットテストの必要性、インテグレーションテストの必要性、BDD テストは不要、既存ワークフローへの影響確認、Planning Document との整合性

- [x] **テストコード戦略の判断根拠が明記されている**
  - BOTH_TEST 戦略を選択
  - 判断根拠: 既存テストファイルの拡張、新規テストファイルの作成、既存テストとの整合性、Planning Document との整合性

- [x] **既存コードへの影響範囲が分析されている**
  - セクション5で詳細に分析
  - 変更が必要なファイル: 7個（影響度: 低〜中）
  - 新規作成ファイル: 3個

- [x] **変更が必要なファイルがリストアップされている**
  - セクション10で詳細にリストアップ
  - 修正ファイル: 10個
  - 新規ファイル: 3個

- [x] **設計が実装可能である**
  - すべての設計要素に具体的な実装例を提示
  - TypeScript の型システムを活用した型安全な設計
  - 既存のアーキテクチャパターンに従った設計

---

## 12. まとめ

### 12.1. 設計の特徴

1. **既存アーキテクチャとの整合性**: 既存の `MetadataManager`, `BasePhase`, `ContentParser` を拡張し、一貫性のある設計を実現
2. **後方互換性の確保**: オプショナルフィールドの活用により、既存のワークフローに影響を与えない
3. **型安全性**: TypeScript の型システムを最大限に活用し、コンパイル時にエラーを検出
4. **モジュール性**: 各コンポーネントの責務を明確にし、テスト容易性を確保
5. **拡張性**: 将来的な機能追加（自動差し戻し提案、差し戻し履歴表示コマンド等）を見据えた設計

### 12.2. 実装上の注意点

1. **差し戻し理由の伝達が最重要**: `rollback_context` フィールドと `ROLLBACK_REASON.md` により、エージェントが差し戻し理由を理解できるようにする
2. **プロンプト注入の実装**: `BasePhase.loadPrompt()` の拡張により、revise ステップのプロンプトに差し戻し情報を自動注入
3. **メタデータの整合性**: すべてのメタデータ操作は `MetadataManager` を経由し、整合性を保証
4. **セキュリティ**: 入力バリデーション、パストラバーサル対策、ファイルサイズ制限を実施
5. **テスト戦略**: ユニットテストとインテグレーションテストの両方を実装し、品質を確保

### 12.3. 次のステップ

Phase 2（設計）が完了したら、以下の順序で進めます：

1. **Phase 3（Test Scenario）**: ユニットテストとインテグレーションテストのシナリオを策定
2. **Phase 4（Implementation）**: 型定義、MetadataManager、BasePhase、ContentParser、rollback コマンドを実装
3. **Phase 5（Test Implementation）**: ユニットテストとインテグレーションテストを実装
4. **Phase 6（Testing）**: テストを実行し、品質ゲートをクリア
5. **Phase 7（Documentation）**: README.md、CLAUDE.md、ARCHITECTURE.md を更新
6. **Phase 8（Report）**: 実装サマリーと PR ボディを作成

---

**作成者**: AI Workflow Agent (Phase 2: Design)
**レビュー対象**: Phase 2 品質ゲート（実装戦略、テスト戦略、テストコード戦略、影響範囲分析、ファイルリスト、実装可能性）
