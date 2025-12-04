# 詳細設計書 - Issue #208

## 0. Planning Document確認

Planning Documentから以下の重要な戦略を確認しました：

- **実装戦略**: EXTEND（既存コード拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニット + インテグレーション）
- **複雑度**: 中程度
- **見積もり工数**: 8~12時間
- **リスク評価**: 中（影響範囲が広く、根本原因が不明）

## 1. アーキテクチャ設計

### 1.1. システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                     Rollback Command                            │
│                  (src/commands/rollback.ts)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐          │
│  │ validateRollbackOptions()                        │          │
│  │  ├─ Phase name validation                        │          │
│  │  ├─ Step name validation                         │          │
│  │  └─ Phase status check ← 【改善対象】            │ ─┐      │
│  │      - 現在: status === 'pending' のみチェック    │  │      │
│  │      - 改善: completed_steps も考慮              │  │      │
│  └──────────────────────────────────────────────────┘  │      │
│                                                          │      │
└──────────────────────────────────────────────────────────┼──────┘
                                                           │
                                                           │
┌──────────────────────────────────────────────────────────┼──────┐
│                   MetadataManager                         │      │
│               (src/core/metadata-manager.ts)              │      │
│                                                           │      │
│  ┌──────────────────────────────────────────────────┐   │      │
│  │ 新規メソッド: validatePhaseConsistency()        │ ←─┘      │
│  │  ├─ status vs completed_steps の整合性チェック  │          │
│  │  ├─ 警告ログ出力（エラーで停止しない）         │          │
│  │  └─ 検証結果を返却                              │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐          │
│  │ updatePhaseForRollback() ← 統合                 │          │
│  │  └─ validatePhaseConsistency() 呼び出し         │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐          │
│  │ resetSubsequentPhases() ← 統合                  │          │
│  │  ├─ completed_steps: [] を明示的に設定         │ ─┐      │
│  │  └─ validatePhaseConsistency() 呼び出し         │  │      │
│  └──────────────────────────────────────────────────┘  │      │
└─────────────────────────────────────────────────────────┼──────┘
                                                           │
                                                           │
┌──────────────────────────────────────────────────────────┼──────┐
│                 Evaluation Phase                          │      │
│              (src/phases/evaluation.ts)                   │      │
│                                                           │      │
│  ┌──────────────────────────────────────────────────┐   │      │
│  │ rollbackToPhase() メソッド（行247付近）         │   │      │
│  │  └─ MetadataManager.rollbackToPhase() 呼び出し  │   │      │
│  │      └─ completed_steps が正しくリセットされるか │ ←─┘      │
│  │         確認（調査対象）                         │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. コンポーネント間の関係

```mermaid
graph TD
    A[Rollback Command] -->|calls| B[validateRollbackOptions]
    B -->|checks| C[Phase status + completed_steps]

    D[Evaluation Phase] -->|calls| E[MetadataManager.rollbackToPhase]
    E -->|calls| F[resetSubsequentPhases]
    F -->|sets| G[status: pending, completed_steps: []]

    H[MetadataManager] -->|new method| I[validatePhaseConsistency]
    I -->|validates| J[status vs completed_steps consistency]

    K[updatePhaseForRollback] -->|integrates| I
    F -->|integrates| I

    style B fill:#fff3cd
    style I fill:#d4edda
    style F fill:#fff3cd
```

### 1.3. データフロー

```
1. Rollback実行時
   User → rollback command → validateRollbackOptions()
                                ├─ status check (改善前: status === 'pending' のみ)
                                └─ completed_steps check (改善後: 追加)
                                    → 'pending' でも completed_steps が存在すれば「開始済み」と判定

2. Evaluation Phase実行時
   Evaluation Phase → FAIL_PHASE_X 判定
                    → MetadataManager.rollbackToPhase()
                    → resetSubsequentPhases()
                       ├─ status: 'pending' 設定
                       ├─ completed_steps: [] 設定（明示的）
                       └─ validatePhaseConsistency() 呼び出し
                          → 不整合検出 → 警告ログ出力

3. メタデータ更新時
   updatePhaseForRollback() → validatePhaseConsistency()
                             → 不整合検出 → 警告ログ出力（処理継続）
```

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
1. **既存コードへの拡張が中心**：
   - `validateRollbackOptions()` の判定ロジック拡張（`completed_steps` 考慮）
   - `resetSubsequentPhases()` の処理追加（`completed_steps: []` 明示的設定）
   - `MetadataManager` への新規メソッド追加（`validatePhaseConsistency()`）

2. **新規ファイル作成は不要**：
   - すべて既存ファイルへの変更で対応可能
   - 変更対象ファイル: 3ファイルのみ
     - `src/commands/rollback.ts`
     - `src/core/metadata-manager.ts`
     - `src/phases/evaluation.ts`（調査・確認のみ、修正は必要に応じて）

3. **既存機能との統合度が高い**：
   - rollback機能、MetadataManager、Evaluation Phaseすべてが既存機能
   - 新しいモジュール作成ではなく、既存モジュールの改善

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
1. **ユニットテストが必要な理由**：
   - `validateRollbackOptions()` の判定ロジック変更（ユニット単体でテスト可能）
   - `validatePhaseConsistency()` の新規メソッド（独立してテスト可能）
   - 不整合パターンの網羅的な検証が必要

2. **インテグレーションテストが必要な理由**：
   - ワークフロー全体での動作確認が必要（Evaluation Phase → rollback → resume）
   - 既存の正常なワークフローへの影響確認（リグレッション防止）
   - 複数コンポーネント間の連携動作の検証

3. **BDDテストは不要**：
   - エンドユーザー向けのユーザーストーリーではなく、内部バリデーションロジックの改善
   - 技術的な不整合検出機能であり、振る舞い駆動テストのスコープ外

## 4. テストコード戦略判断

### テストコード戦略: EXTEND_TEST

**判断根拠**:
1. **既存テストファイルへの追加**：
   - `tests/unit/commands/rollback.test.ts` は存在しないが、新規作成する
   - `tests/unit/core/metadata-manager.test.ts` は存在しないため、新規作成する
   - ただし、これらは既存のテスト構造に沿った拡張

2. **新規テストファイルの作成**：
   - インテグレーションテスト用に新規ファイルを作成
   - `tests/integration/rollback-inconsistent-metadata.test.ts`

3. **両方のアプローチが必要**：
   - 既存のテスト構造に従いつつ、新規シナリオのテストファイルも作成
   - 結果として **BOTH_TEST** に近いが、既存テスト構造の拡張が主目的のため **EXTEND_TEST** とする

## 5. 影響範囲分析

### 5.1. 既存コードへの影響

#### 変更が必要なファイル

1. **`src/commands/rollback.ts`** (行91-136):
   - **変更内容**: `validateRollbackOptions()` メソッドの改善
   - **現在の実装**:
     ```typescript
     // 3. 対象フェーズの状態チェック
     const phaseStatus = metadataManager.getPhaseStatus(toPhase);
     if (phaseStatus === 'pending') {
       throw new Error(
         `Cannot rollback to phase '${options.toPhase}' ` +
         `because it has not been started yet.`
       );
     }
     ```
   - **改善後の実装**:
     ```typescript
     // 3. 対象フェーズの状態チェック（completed_steps も考慮）
     const phaseStatus = metadataManager.getPhaseStatus(toPhase);
     const completedSteps = metadataManager.getCompletedSteps(toPhase);

     if (phaseStatus === 'pending' && completedSteps.length === 0) {
       throw new Error(
         `Cannot rollback to phase '${options.toPhase}' ` +
         `because it has not been started yet.`
       );
     }

     // 警告: status が 'pending' でも completed_steps がある場合
     if (phaseStatus === 'pending' && completedSteps.length > 0) {
       logger.warn(
         `Phase ${options.toPhase}: status is 'pending' but completed_steps is not empty. ` +
         `Treating as started phase (completed_steps: ${JSON.stringify(completedSteps)})`
       );
     }
     ```
   - **影響**: エラーメッセージの改善、不整合状態でもrollback可能に

2. **`src/core/metadata-manager.ts`**:
   - **新規メソッド追加**: `validatePhaseConsistency()`
     ```typescript
     /**
      * Issue #208: フェーズの整合性チェック
      * @param phaseName - 対象フェーズ名
      * @returns 検証結果オブジェクト
      */
     public validatePhaseConsistency(
       phaseName: PhaseName
     ): {
       valid: boolean;
       warnings: string[];
     } {
       const phaseData = this.state.data.phases[phaseName];
       const warnings: string[] = [];

       // パターン1: status === 'pending' かつ completed_steps が存在
       if (phaseData.status === 'pending' &&
           (phaseData.completed_steps ?? []).length > 0) {
         warnings.push(
           `Phase ${phaseName}: status is 'pending' but completed_steps is not empty ` +
           `(${JSON.stringify(phaseData.completed_steps)})`
         );
       }

       // パターン2: status === 'completed' かつ completed_steps が空
       if (phaseData.status === 'completed' &&
           (phaseData.completed_steps ?? []).length === 0) {
         warnings.push(
           `Phase ${phaseName}: status is 'completed' but completed_steps is empty`
         );
       }

       // パターン3: status === 'in_progress' かつ started_at === null
       if (phaseData.status === 'in_progress' && phaseData.started_at === null) {
         warnings.push(
           `Phase ${phaseName}: status is 'in_progress' but started_at is null`
         );
       }

       // 警告ログ出力（エラーで停止しない）
       for (const warning of warnings) {
         logger.warn(warning);
       }

       return {
         valid: warnings.length === 0,
         warnings,
       };
     }
     ```

   - **既存メソッドの修正**: `updatePhaseForRollback()` (行318-345)
     ```typescript
     public updatePhaseForRollback(phaseName: PhaseName, toStep: StepName): void {
       // 整合性チェック（警告のみ、処理継続）
       this.validatePhaseConsistency(phaseName);

       // （既存の処理は変更なし）
       const phaseData = this.state.data.phases[phaseName];
       phaseData.status = 'in_progress';
       // ... (以下略)
     }
     ```

   - **既存メソッドの修正**: `resetSubsequentPhases()` (行352-379)
     ```typescript
     public resetSubsequentPhases(fromPhase: PhaseName): PhaseName[] {
       // ... (既存の処理)

       for (const phase of subsequentPhases) {
         const phaseData = this.state.data.phases[phase];
         phaseData.status = 'pending';
         phaseData.started_at = null;
         phaseData.completed_at = null;
         phaseData.current_step = null;
         phaseData.completed_steps = []; // 明示的にリセット（既存コードに既にあるが強調）
         phaseData.retry_count = 0;
         phaseData.rollback_context = null;

         // 整合性チェック（警告のみ、処理継続）
         this.validatePhaseConsistency(phase);
       }

       // ... (以下略)
     }
     ```

3. **`src/phases/evaluation.ts`** (行247付近):
   - **調査対象**: `rollbackToPhase()` メソッドの呼び出し
   - **確認事項**:
     - `MetadataManager.rollbackToPhase()` が `completed_steps` を正しくリセットしているか
     - 実装を確認したところ、`MetadataManager.rollbackToPhase()` (metadata-manager.ts 行110-146) は以下を実行:
       ```typescript
       for (const phase of rolledBack) {
         const phaseData = this.state.data.phases[phase];
         phaseData.status = 'pending';
         phaseData.started_at = null;
         phaseData.completed_at = null;
         phaseData.review_result = null;
         phaseData.retry_count = 0;
         // ⚠️ completed_steps と current_step のリセットが欠落
       }
       ```
   - **修正が必要**: `rollbackToPhase()` に以下を追加
     ```typescript
     for (const phase of rolledBack) {
       const phaseData = this.state.data.phases[phase];
       phaseData.status = 'pending';
       phaseData.started_at = null;
       phaseData.completed_at = null;
       phaseData.review_result = null;
       phaseData.retry_count = 0;
       phaseData.current_step = null;        // 追加
       phaseData.completed_steps = [];       // 追加
       phaseData.rollback_context = null;    // 追加（consistency）
     }
     ```

#### 影響を受ける機能

1. **Rollback機能**:
   - バリデーションロジック変更により、不整合状態でもrollback可能に
   - 既存の正常な状態でのrollbackは影響なし（後方互換性維持）

2. **Resume機能**:
   - `completed_steps` を参照する既存ロジックは影響を受けない（参照のみのため）

3. **Evaluation Phase**:
   - `rollbackToPhase()` メソッドが修正される可能性（根本原因の場合）
   - 修正により、後続フェーズのリセット時に `completed_steps` も正しくリセットされる

### 5.2. 依存関係の変更

**新規依存の追加**: なし

**既存依存の変更**: なし

### 5.3. マイグレーション要否

**不要**:
- 既存の `metadata.json` に対する自動マイグレーションは不要
- バリデーションロジックが追加されるだけで、データ構造の変更はなし
- 不整合状態の `metadata.json` は、rollback実行時またはフェーズ実行時に自動検証される

## 6. 変更・追加ファイルリスト

### 6.1. 修正が必要な既存ファイル

1. **`src/commands/rollback.ts`**:
   - `validateRollbackOptions()` メソッドの改善（行91-136）

2. **`src/core/metadata-manager.ts`**:
   - 新規メソッド `validatePhaseConsistency()` の追加
   - `updatePhaseForRollback()` メソッドへの統合
   - `resetSubsequentPhases()` メソッドへの統合
   - `rollbackToPhase()` メソッドの修正（行110-146）

### 6.2. 新規作成ファイル

1. **`tests/unit/commands/rollback.test.ts`**:
   - `validateRollbackOptions()` のユニットテスト
   - 不整合状態でのバリデーション成功確認

2. **`tests/unit/core/metadata-manager.test.ts`**:
   - `validatePhaseConsistency()` のユニットテスト
   - 不整合パターンの検出確認

3. **`tests/integration/rollback-inconsistent-metadata.test.ts`**:
   - 不整合状態でのrollback成功シナリオ
   - 既存ワークフローへの影響なし確認

### 6.3. 削除が必要なファイル

なし

## 7. 詳細設計

### 7.1. クラス設計

#### MetadataManager クラス拡張

```typescript
export class MetadataManager {
  // （既存メソッドは省略）

  /**
   * Issue #208: フェーズの整合性チェック
   *
   * @param phaseName - 対象フェーズ名
   * @returns 検証結果（valid: boolean, warnings: string[]）
   *
   * @description
   * - status と completed_steps の整合性をチェック
   * - 不整合検出時は警告ログを出力（エラーで停止しない）
   * - 検証パターン:
   *   1. status === 'pending' かつ completed_steps が存在
   *   2. status === 'completed' かつ completed_steps が空
   *   3. status === 'in_progress' かつ started_at === null
   */
  public validatePhaseConsistency(
    phaseName: PhaseName
  ): {
    valid: boolean;
    warnings: string[];
  }

  /**
   * 既存メソッド: rollbackToPhase()
   *
   * @修正内容:
   * - completed_steps と current_step のリセット追加
   * - rollback_context のクリア追加（consistency確保）
   */
  public rollbackToPhase(phaseName: PhaseName): {
    success: boolean;
    error: string | null;
    backup_path: string | null;
    rolled_back_phases: PhaseName[];
  }
}
```

### 7.2. 関数設計

#### validateRollbackOptions() 改善

**現在のシグネチャ** (変更なし):
```typescript
export function validateRollbackOptions(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager
): void
```

**実装の改善**:
```typescript
export function validateRollbackOptions(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager
): void {
  // 1. to-phase の有効性チェック（既存、変更なし）
  // 2. to-step の有効性チェック（既存、変更なし）

  // 3. 対象フェーズの状態チェック（改善）
  const toPhase = options.toPhase as PhaseName;
  const phaseStatus = metadataManager.getPhaseStatus(toPhase);
  const completedSteps = metadataManager.getCompletedSteps(toPhase);

  // 改善: completed_steps も考慮して「開始済み」を判定
  if (phaseStatus === 'pending' && completedSteps.length === 0) {
    throw new Error(
      `Cannot rollback to phase '${options.toPhase}' ` +
      `because it has not been started yet.`
    );
  }

  // 警告: 不整合状態を検出した場合
  if (phaseStatus === 'pending' && completedSteps.length > 0) {
    logger.warn(
      `Phase ${options.toPhase}: status is 'pending' but completed_steps is not empty. ` +
      `Treating as started phase (completed_steps: ${JSON.stringify(completedSteps)})`
    );
  }

  // 4. 差し戻し理由の提供チェック（既存、変更なし）
}
```

#### validatePhaseConsistency() 新規実装

```typescript
/**
 * フェーズの整合性チェック
 *
 * @param phaseName - 対象フェーズ名
 * @returns 検証結果 { valid: boolean, warnings: string[] }
 *
 * @example
 * const result = metadataManager.validatePhaseConsistency('implementation');
 * if (!result.valid) {
 *   console.log('Warnings:', result.warnings);
 * }
 */
public validatePhaseConsistency(
  phaseName: PhaseName
): { valid: boolean; warnings: string[] } {
  const phaseData = this.state.data.phases[phaseName];
  const warnings: string[] = [];

  // パターン1: status === 'pending' かつ completed_steps が存在
  if (
    phaseData.status === 'pending' &&
    (phaseData.completed_steps ?? []).length > 0
  ) {
    warnings.push(
      `Phase ${phaseName}: status is 'pending' but completed_steps is not empty ` +
      `(${JSON.stringify(phaseData.completed_steps)})`
    );
  }

  // パターン2: status === 'completed' かつ completed_steps が空
  if (
    phaseData.status === 'completed' &&
    (phaseData.completed_steps ?? []).length === 0
  ) {
    warnings.push(
      `Phase ${phaseName}: status is 'completed' but completed_steps is empty`
    );
  }

  // パターン3: status === 'in_progress' かつ started_at === null
  if (
    phaseData.status === 'in_progress' &&
    phaseData.started_at === null
  ) {
    warnings.push(
      `Phase ${phaseName}: status is 'in_progress' but started_at is null`
    );
  }

  // 警告ログ出力（エラーで停止しない）
  for (const warning of warnings) {
    logger.warn(warning);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
```

### 7.3. データ構造設計

#### PhaseMetadata（既存、変更なし）

```typescript
export interface PhaseMetadata {
  status: PhaseStatus;                    // 'pending' | 'in_progress' | 'completed' | 'failed'
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  review_result: string | null;
  output_files?: string[];
  current_step?: StepName | null;         // 'execute' | 'review' | 'revise' | null
  completed_steps?: StepName[];           // ['execute', 'review'] など
  rollback_context?: RollbackContext | null;
}
```

#### ValidationResult（新規型定義、不要）

`validatePhaseConsistency()` の戻り値は以下のインライン型で十分：
```typescript
{ valid: boolean; warnings: string[] }
```

### 7.4. インターフェース設計

既存のインターフェース（`PhaseMetadata`、`PhaseName`、`StepName`）を使用し、新規インターフェースの追加は不要。

## 8. セキュリティ考慮事項

### 8.1. 認証・認可

- 本修正には認証・認可の変更なし
- 既存のGitHub Token認証を継続使用

### 8.2. データ保護

- **メタデータの整合性保護**:
  - バリデーション追加により、不整合データの早期検出が可能
  - 警告ログ出力により、問題の可視化と追跡が容易に

### 8.3. セキュリティリスクと対策

| リスク | 対策 |
|--------|------|
| 不整合データの蓄積 | `validatePhaseConsistency()` による定期的な検証 |
| ログの過剰出力 | 警告レベルでの出力（エラーレベルでは出力しない） |

## 9. 非機能要件への対応

### 9.1. パフォーマンス

- **NFR-1.1**: `validatePhaseConsistency()` メソッドは1フェーズあたり **10ms以内** で完了
  - 実装: シンプルな条件チェックのみ、外部API呼び出しなし
  - 計算量: O(1)（フェーズデータのプロパティアクセスのみ）

- **NFR-1.2**: 整合性チェックによるワークフロー全体の実行時間への影響は **1%以内**
  - 実装: `resetSubsequentPhases()` および `updatePhaseForRollback()` の呼び出し時のみ実行
  - 頻度: rollback実行時のみ（通常フローでは実行されない）

### 9.2. スケーラビリティ

- メタデータファイルサイズへの影響なし（新規フィールド追加なし）
- 既存の10フェーズ構造を維持

### 9.3. 保守性

- **単一責任原則 (SRP)**:
  - `validatePhaseConsistency()` は整合性チェックのみを担当
  - 副作用なし（read-only）

- **拡張性**:
  - 新規の不整合パターン追加が容易（`validatePhaseConsistency()` 内に追加するだけ）

- **テスト容易性**:
  - ユニットテストで全パターンを網羅的にテスト可能

## 10. 実装の順序

### 推奨実装順序

1. **Phase 1: MetadataManager の改善** (優先度: 高)
   - `validatePhaseConsistency()` メソッドの実装
   - `rollbackToPhase()` メソッドの修正（`completed_steps` リセット追加）
   - ユニットテストの作成

2. **Phase 2: Rollback コマンドの改善** (優先度: 高)
   - `validateRollbackOptions()` メソッドの改善
   - ユニットテストの追加

3. **Phase 3: MetadataManager への統合** (優先度: 中)
   - `updatePhaseForRollback()` への `validatePhaseConsistency()` 統合
   - `resetSubsequentPhases()` への `validatePhaseConsistency()` 統合

4. **Phase 4: インテグレーションテスト** (優先度: 中)
   - 不整合状態でのrollback成功シナリオ
   - 既存ワークフローへの影響なし確認

### 依存関係の考慮

- Phase 1 が完了してから Phase 2 を実施（`validatePhaseConsistency()` が Phase 2 で使用される可能性）
- Phase 1, 2 が完了してから Phase 3 を実施（統合には両方のメソッドが必要）
- Phase 3 が完了してから Phase 4 を実施（インテグレーションテストは全機能統合後）

## 11. テストシナリオ概要

### 11.1. ユニットテスト

#### `validateRollbackOptions()` のテストケース

| テストケース | 入力 | 期待結果 |
|------------|------|---------|
| 正常: in_progress フェーズへのrollback | status: 'in_progress', completed_steps: ['execute'] | エラーなし |
| 正常: completed フェーズへのrollback | status: 'completed', completed_steps: ['execute', 'review'] | エラーなし |
| 異常: pending かつ completed_steps が空 | status: 'pending', completed_steps: [] | エラー: "has not been started yet" |
| **改善: pending でも completed_steps が存在** | status: 'pending', completed_steps: ['execute', 'review'] | **エラーなし、警告ログ出力** |

#### `validatePhaseConsistency()` のテストケース

| テストケース | 入力 | 期待結果 |
|------------|------|---------|
| 正常: status と completed_steps が整合 | status: 'in_progress', completed_steps: ['execute'] | valid: true, warnings: [] |
| 不整合1: pending + completed_steps 存在 | status: 'pending', completed_steps: ['execute'] | valid: false, warnings: ["status is 'pending' but completed_steps is not empty"] |
| 不整合2: completed + completed_steps 空 | status: 'completed', completed_steps: [] | valid: false, warnings: ["status is 'completed' but completed_steps is empty"] |
| 不整合3: in_progress + started_at null | status: 'in_progress', started_at: null | valid: false, warnings: ["status is 'in_progress' but started_at is null"] |

### 11.2. インテグレーションテスト

#### シナリオ1: 不整合状態でのrollback成功

```
Given: metadata.json で test_implementation フェーズが status: 'pending', completed_steps: ['execute', 'review']
When: rollback --issue 194 --to-phase test_implementation --to-step revise --reason "test"
Then: エラーが発生せず、rollback成功
And: 警告ログに不整合が記録される
```

#### シナリオ2: 既存ワークフローへの影響なし

```
Given: 正常な metadata.json（status と completed_steps が整合している）
When: rollback コマンドまたは resetSubsequentPhases() を実行
Then: 既存の動作が変更されず、後方互換性が維持される
And: 不要な警告ログが出力されない
```

## 12. 実装完了の定義 (Definition of Done)

以下をすべて満たした場合、実装完了とする：

- [ ] `validateRollbackOptions()` が `completed_steps` を考慮してフェーズの開始状態を判定している
- [ ] `validatePhaseConsistency()` が不整合パターンを検出し、警告ログを出力している
- [ ] `rollbackToPhase()` が `completed_steps` と `current_step` を正しくリセットしている
- [ ] `updatePhaseForRollback()` および `resetSubsequentPhases()` が `validatePhaseConsistency()` を呼び出している
- [ ] すべてのユニットテストが成功している（カバレッジ90%以上）
- [ ] すべてのインテグレーションテストが成功している
- [ ] 既存テストのリグレッションがない
- [ ] コードレビューが完了している
- [ ] ドキュメント（CLAUDE.md、TROUBLESHOOTING.md）が更新されている

---

**設計書作成日**: 2025-01-30
**作成者**: AI Workflow Agent
**バージョン**: 1.0
**実装戦略**: EXTEND
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: EXTEND_TEST
