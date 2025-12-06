# テストシナリオ

## Issue概要

- **Issue番号**: #248
- **タイトル**: preset実行時にフェーズステータスがin_progressのまま完了しない
- **状態**: open
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/248
- **作成日**: 2025-01-30

## 1. テスト戦略サマリー

### 1.1. 選択されたテスト戦略

**テスト戦略**: UNIT_INTEGRATION（Phase 2で決定）

### 1.2. テスト対象の範囲

本Issueのテスト対象は以下の3つのコンポーネント：

1. **MetadataManager** (`src/core/metadata-manager.ts`)
   - ステータス遷移バリデーション
   - 冪等性確保
   - ステータス更新の確実性

2. **PhaseRunner** (`src/phases/lifecycle/phase-runner.ts`)
   - try-catch-finallyブロックのエラーハンドリング
   - `finalizePhase()` メソッドによるステータス更新保証
   - `ensurePhaseStatusUpdated()` メソッドによるステータス更新漏れ検出

3. **ReviewCycleManager** (`src/phases/core/review-cycle-manager.ts`)
   - 最大リトライ回数超過時のステータス更新
   - revise失敗時のステータス更新

### 1.3. テストの目的

- **主目的**: preset実行時にフェーズステータスが確実に `completed` または `failed` に更新されることを検証
- **副目的**: エラーハンドリングの改善により、例外発生時も適切にステータスが更新されることを検証
- **品質目標**: ステータス管理の信頼性向上、ワークフロー状態の整合性保証

## 2. Unitテストシナリオ

### 2.1. MetadataManager.updatePhaseStatus() のテスト

#### 2.1.1. 冪等性チェック - 正常系

**テストケース名**: `updatePhaseStatus_冪等性_同じステータスへの重複更新`

- **目的**: 同じステータスへの重複更新をスキップすることを検証
- **前提条件**:
  - design フェーズのステータスが `completed`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'completed'`
- **期待結果**:
  - INFO ログ「Status already set to 'completed', skipping update」が出力される
  - metadata.json への書き込みはスキップされる（save() が呼ばれない）
  - ステータスは `completed` のまま
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'completed',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: '2025-01-30T11:00:00Z'
      }
    }
  }
  ```

#### 2.1.2. 冪等性チェック - 異なるステータスへの更新

**テストケース名**: `updatePhaseStatus_冪等性_異なるステータスへの更新`

- **目的**: 異なるステータスへの更新は正常に実行されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'completed'`
- **期待結果**:
  - ステータスが `completed` に更新される
  - metadata.json への書き込みが実行される（save() が呼ばれる）
  - DEBUG ログ「Status updated from 'in_progress' to 'completed'」が出力される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null
      }
    }
  }
  ```

#### 2.1.3. ステータス遷移バリデーション - 不正な遷移（completed → in_progress）

**テストケース名**: `updatePhaseStatus_バリデーション_completed_to_in_progress`

- **目的**: 不正なステータス遷移を検出してWARNINGログを出力することを検証
- **前提条件**:
  - design フェーズのステータスが `completed`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'in_progress'`
- **期待結果**:
  - WARNING ログ「Invalid status transition detected: completed -> in_progress」が出力される
  - ステータスは `in_progress` に更新される（エラーにはならない）
  - metadata.json への書き込みが実行される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'completed',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: '2025-01-30T11:00:00Z'
      }
    }
  }
  ```

#### 2.1.4. ステータス遷移バリデーション - 正常な遷移（in_progress → completed）

**テストケース名**: `updatePhaseStatus_バリデーション_in_progress_to_completed`

- **目的**: 正常なステータス遷移では警告が出力されないことを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'completed'`
- **期待結果**:
  - WARNING ログは出力されない
  - ステータスが `completed` に更新される
  - metadata.json への書き込みが実行される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null
      }
    }
  }
  ```

#### 2.1.5. ステータス遷移バリデーション - 不正な遷移（failed → in_progress）

**テストケース名**: `updatePhaseStatus_バリデーション_failed_to_in_progress`

- **目的**: failed から in_progress への遷移が不正と検出されることを検証
- **前提条件**:
  - design フェーズのステータスが `failed`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'in_progress'`
- **期待結果**:
  - WARNING ログ「Invalid status transition detected: failed -> in_progress」が出力される
  - ステータスは `in_progress` に更新される（エラーにはならない）
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'failed',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: '2025-01-30T11:00:00Z'
      }
    }
  }
  ```

#### 2.1.6. ステータス遷移バリデーション - 不正な遷移（pending → completed）

**テストケース名**: `updatePhaseStatus_バリデーション_pending_to_completed`

- **目的**: pending から completed への直接遷移が不正と検出されることを検証
- **前提条件**:
  - design フェーズのステータスが `pending`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'completed'`
- **期待結果**:
  - WARNING ログ「Invalid status transition detected: pending -> completed」が出力される
  - ステータスは `completed` に更新される（エラーにはならない）
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'pending',
        started_at: null,
        completed_at: null
      }
    }
  }
  ```

#### 2.1.7. ステータス遷移バリデーション - 正常な遷移（pending → in_progress）

**テストケース名**: `updatePhaseStatus_バリデーション_pending_to_in_progress`

- **目的**: pending から in_progress への遷移が正常と判定されることを検証
- **前提条件**:
  - design フェーズのステータスが `pending`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'in_progress'`
- **期待結果**:
  - WARNING ログは出力されない
  - ステータスが `in_progress` に更新される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'pending',
        started_at: null,
        completed_at: null
      }
    }
  }
  ```

#### 2.1.8. ステータス遷移バリデーション - 正常な遷移（in_progress → failed）

**テストケース名**: `updatePhaseStatus_バリデーション_in_progress_to_failed`

- **目的**: in_progress から failed への遷移が正常と判定されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - metadata.json が存在する
- **入力**:
  - `phaseName = 'design'`
  - `status = 'failed'`
- **期待結果**:
  - WARNING ログは出力されない
  - ステータスが `failed` に更新される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null
      }
    }
  }
  ```

### 2.2. MetadataManager.validateStatusTransition() のテスト

#### 2.2.1. 許可される遷移パターンの検証

**テストケース名**: `validateStatusTransition_正常系_許可される遷移パターン`

- **目的**: 許可される遷移パターンがすべて正常と判定されることを検証
- **前提条件**: validateStatusTransition() メソッドが実装されている
- **入力**:
  - `fromStatus = 'pending'`, `toStatus = 'in_progress'`
  - `fromStatus = 'in_progress'`, `toStatus = 'completed'`
  - `fromStatus = 'in_progress'`, `toStatus = 'failed'`
- **期待結果**:
  - すべてのパターンで WARNING ログが出力されない
  - 例外がスローされない
- **テストデータ**: N/A（ステータス文字列のみ）

#### 2.2.2. 不正な遷移パターンの検証

**テストケース名**: `validateStatusTransition_異常系_不正な遷移パターン`

- **目的**: 不正な遷移パターンがすべて検出されることを検証
- **前提条件**: validateStatusTransition() メソッドが実装されている
- **入力**:
  - `fromStatus = 'completed'`, `toStatus = 'in_progress'`
  - `fromStatus = 'failed'`, `toStatus = 'in_progress'`
  - `fromStatus = 'pending'`, `toStatus = 'completed'`
  - `fromStatus = 'pending'`, `toStatus = 'failed'`
- **期待結果**:
  - すべてのパターンで WARNING ログが出力される
  - 例外はスローされない（警告のみ）
- **テストデータ**: N/A（ステータス文字列のみ）

### 2.3. PhaseRunner.finalizePhase() のテスト

#### 2.3.1. 正常系 - ステータス更新と進捗投稿

**テストケース名**: `finalizePhase_正常系_ステータス更新と進捗投稿`

- **目的**: フェーズ完了時にステータスが completed に更新され、進捗が投稿されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - GitHubClient の createOrUpdateProgressComment が正常動作する
- **入力**: N/A（引数なし）
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'completed')` が呼ばれる
  - `github.createOrUpdateProgressComment()` が呼ばれる
  - INFO ログ「Phase design: Status updated to 'completed'」が出力される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null
      }
    }
  }
  ```

#### 2.3.2. 異常系 - 進捗投稿失敗時

**テストケース名**: `finalizePhase_異常系_進捗投稿失敗時`

- **目的**: 進捗投稿が失敗しても例外がスローされず、ステータス更新は成功することを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - GitHubClient の createOrUpdateProgressComment が例外をスロー
- **入力**: N/A（引数なし）
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'completed')` は呼ばれる
  - `finalizePhase()` は例外をスローしない
  - ステータスは `completed` に更新される
  - ERROR ログ「Failed to finalize phase」が出力される
- **テストデータ**: 同上

#### 2.3.3. 異常系 - ステータス更新失敗時

**テストケース名**: `finalizePhase_異常系_ステータス更新失敗時`

- **目的**: ステータス更新が失敗しても例外がスローされないことを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - metadata.updatePhaseStatus が例外をスロー
- **入力**: N/A（引数なし）
- **期待結果**:
  - `finalizePhase()` は例外をスローしない
  - ERROR ログ「Failed to finalize phase」が出力される
- **テストデータ**: 同上

### 2.4. PhaseRunner.ensurePhaseStatusUpdated() のテスト

#### 2.4.1. 正常系 - ステータスが適切に更新されている場合

**テストケース名**: `ensurePhaseStatusUpdated_正常系_ステータスが適切に更新されている`

- **目的**: ステータスが適切に更新されている場合、エラーログが出力されないことを検証
- **前提条件**:
  - design フェーズのステータスが `completed`
  - executionSuccess = true
- **入力**:
  - `executionSuccess = true`
- **期待結果**:
  - ERROR ログは出力されない
  - ステータスは `completed` のまま
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'completed',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: '2025-01-30T11:00:00Z'
      }
    }
  }
  ```

#### 2.4.2. 異常系 - ステータス更新漏れ検出（成功時）

**テストケース名**: `ensurePhaseStatusUpdated_異常系_ステータス更新漏れ検出_成功時`

- **目的**: 実行成功時にステータスが in_progress のままの場合、自動修正されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - executionSuccess = true
- **入力**:
  - `executionSuccess = true`
- **期待結果**:
  - ERROR ログ「Status is still 'in_progress' after execution. Expected: completed」が出力される
  - WARN ログ「Auto-corrected status to 'completed'」が出力される
  - ステータスが `completed` に自動修正される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null
      }
    }
  }
  ```

#### 2.4.3. 異常系 - ステータス更新漏れ検出（失敗時）

**テストケース名**: `ensurePhaseStatusUpdated_異常系_ステータス更新漏れ検出_失敗時`

- **目的**: 実行失敗時にステータスが in_progress のままの場合、自動修正されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - executionSuccess = false
- **入力**:
  - `executionSuccess = false`
- **期待結果**:
  - ERROR ログ「Status is still 'in_progress' after execution. Expected: failed」が出力される
  - WARN ログ「Auto-corrected status to 'failed'」が出力される
  - ステータスが `failed` に自動修正される
- **テストデータ**: 同上

#### 2.4.4. 異常系 - ensurePhaseStatusUpdated 内部で例外発生

**テストケース名**: `ensurePhaseStatusUpdated_異常系_内部で例外発生`

- **目的**: ensurePhaseStatusUpdated 内部で例外が発生しても、外部に例外が伝播しないことを検証
- **前提条件**:
  - metadata.getPhaseStatus が例外をスロー
- **入力**:
  - `executionSuccess = true`
- **期待結果**:
  - `ensurePhaseStatusUpdated()` は例外をスローしない
  - ERROR ログ「Failed to ensure status updated」が出力される
- **テストデータ**: N/A

### 2.5. PhaseRunner.handlePhaseError() のテスト

#### 2.5.1. 正常系 - ステータス更新と進捗投稿

**テストケース名**: `handlePhaseError_正常系_ステータス更新と進捗投稿`

- **目的**: エラー発生時にステータスが failed に更新され、進捗が投稿されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - GitHubClient の createOrUpdateProgressComment が正常動作する
- **入力**:
  - `reason = 'Execute step failed: some error'`
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'failed')` が呼ばれる
  - `github.createOrUpdateProgressComment()` が呼ばれる（エラーメッセージを含む）
  - INFO ログ「Phase design: Status updated to 'failed'」が出力される
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null
      }
    }
  }
  ```

#### 2.5.2. 異常系 - 進捗投稿失敗時

**テストケース名**: `handlePhaseError_異常系_進捗投稿失敗時`

- **目的**: 進捗投稿が失敗しても例外がスローされず、ステータス更新は成功することを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - GitHubClient の createOrUpdateProgressComment が例外をスロー
- **入力**:
  - `reason = 'Execute step failed: some error'`
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'failed')` は呼ばれる
  - `handlePhaseError()` は例外をスローしない
  - ステータスは `failed` に更新される
  - ERROR ログ「Failed to handle phase error」が出力される
- **テストデータ**: 同上

### 2.6. PhaseRunner.run() のテスト

#### 2.6.1. 正常系 - フェーズ実行成功

**テストケース名**: `run_正常系_フェーズ実行成功`

- **目的**: フェーズ全体が正常に実行され、ステータスが completed になることを検証
- **前提条件**:
  - design フェーズのステータスが `pending`
  - execute、review ステップが正常に完了する
- **入力**:
  - `options = { gitManager: mockGitManager, skipReview: false }`
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'in_progress')` が呼ばれる
  - `stepExecutor.executeStep()` が呼ばれる
  - `stepExecutor.reviewStep()` が呼ばれる
  - `finalizePhase()` が呼ばれる
  - `metadata.updatePhaseStatus('design', 'completed')` が呼ばれる
  - `run()` が true を返す
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'pending',
        started_at: null,
        completed_at: null,
        completed_steps: []
      }
    }
  }
  ```

#### 2.6.2. 異常系 - execute ステップ失敗

**テストケース名**: `run_異常系_executeステップ失敗`

- **目的**: execute ステップが失敗した場合、ステータスが failed になることを検証
- **前提条件**:
  - design フェーズのステータスが `pending`
  - stepExecutor.executeStep() が失敗を返す
- **入力**:
  - `options = { gitManager: mockGitManager, skipReview: false }`
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'in_progress')` が呼ばれる
  - `stepExecutor.executeStep()` が呼ばれる
  - `handlePhaseError()` が呼ばれる
  - `metadata.updatePhaseStatus('design', 'failed')` が呼ばれる
  - `run()` が false を返す
- **テストデータ**: 同上

#### 2.6.3. 異常系 - review ステップで例外発生

**テストケース名**: `run_異常系_reviewステップで例外発生`

- **目的**: review ステップで例外が発生した場合、ステータスが failed になることを検証
- **前提条件**:
  - design フェーズのステータスが `pending`
  - stepExecutor.executeStep() が成功
  - stepExecutor.reviewStep() が例外をスロー
- **入力**:
  - `options = { gitManager: mockGitManager, skipReview: false }`
- **期待結果**:
  - `metadata.updatePhaseStatus('design', 'in_progress')` が呼ばれる
  - `stepExecutor.executeStep()` が呼ばれる
  - `stepExecutor.reviewStep()` が呼ばれる
  - `handlePhaseError()` が呼ばれる（catch ブロック）
  - `metadata.updatePhaseStatus('design', 'failed')` が呼ばれる
  - `ensurePhaseStatusUpdated(false)` が呼ばれる（finally ブロック）
  - `run()` が false を返す
- **テストデータ**: 同上

#### 2.6.4. 正常系 - finally ブロックでのステータス確認

**テストケース名**: `run_正常系_finallyブロックでのステータス確認`

- **目的**: finally ブロックで ensurePhaseStatusUpdated が確実に呼ばれることを検証
- **前提条件**:
  - design フェーズのステータスが `pending`
  - execute、review ステップが正常に完了する
- **入力**:
  - `options = { gitManager: mockGitManager, skipReview: false }`
- **期待結果**:
  - `ensurePhaseStatusUpdated(true)` が finally ブロックで呼ばれる
  - ステータスが `completed` である
- **テストデータ**: 同上

### 2.7. ReviewCycleManager.performReviseStepWithRetry() のテスト

#### 2.7.1. 正常系 - revise 1回目でレビュー合格

**テストケース名**: `performReviseStepWithRetry_正常系_revise1回目でレビュー合格`

- **目的**: revise 実行後のレビューが合格した場合、正常に完了することを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - reviseFn が成功を返す
  - reviewFn が revise 後に成功を返す
- **入力**:
  - `initialReviewResult = { success: false, review_status: 'FAIL', feedback: 'Design is incomplete', needs_revision: true }`
  - `reviewFn = async () => ({ success: true, review_status: 'PASS' })`
  - `reviseFn = async () => ({ success: true })`
- **期待結果**:
  - `metadata.updateCurrentStep('design', 'revise')` が呼ばれる
  - `reviseFn()` が1回呼ばれる
  - `reviewFn()` が再実行される
  - `metadata.addCompletedStep('design', 'review')` が呼ばれる
  - 例外がスローされない
  - retry_count が 1 になる
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null,
        completed_steps: ['execute'],
        retry_count: 0
      }
    }
  }
  ```

#### 2.7.2. 異常系 - 最大リトライ回数超過

**テストケース名**: `performReviseStepWithRetry_異常系_最大リトライ回数超過`

- **目的**: 最大リトライ回数（3回）を超えた場合、例外がスローされる前にステータスが failed に更新されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - reviseFn が成功を返す
  - reviewFn が常に失敗を返す（3回実行される）
- **入力**:
  - `initialReviewResult = { success: false, review_status: 'FAIL', feedback: 'Design is incomplete', needs_revision: true }`
  - `reviewFn = async () => ({ success: false, review_status: 'FAIL', feedback: 'Still incomplete', needs_revision: true })`
  - `reviseFn = async () => ({ success: true })`
- **期待結果**:
  - `reviseFn()` が3回呼ばれる
  - `reviewFn()` が3回再実行される
  - ERROR ログ「Max revise retries (3) reached」が出力される
  - `metadata.updatePhaseStatus('design', 'failed')` が呼ばれる（例外スロー前）
  - `postProgressFn('failed', ...)` が呼ばれる（例外スロー前）
  - 例外 `Review failed after 3 revise attempts` がスローされる
  - retry_count が 3 になる
- **テストデータ**: 同上

#### 2.7.3. 異常系 - revise ステップ失敗

**テストケース名**: `performReviseStepWithRetry_異常系_reviseステップ失敗`

- **目的**: revise ステップが失敗した場合、例外がスローされる前にステータスが failed に更新されることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - reviseFn が失敗を返す
- **入力**:
  - `initialReviewResult = { success: false, review_status: 'FAIL', feedback: 'Design is incomplete', needs_revision: true }`
  - `reviseFn = async () => ({ success: false, error: 'Revise execution failed' })`
- **期待結果**:
  - `metadata.updateCurrentStep('design', 'revise')` が呼ばれる
  - `reviseFn()` が1回呼ばれる
  - ERROR ログ「Revise failed: Revise execution failed」が出力される
  - `metadata.updatePhaseStatus('design', 'failed')` が呼ばれる（例外スロー前）
  - `postProgressFn('failed', ...)` が呼ばれる（例外スロー前）
  - 例外 `Revise execution failed` がスローされる
- **テストデータ**: 同上

#### 2.7.4. 正常系 - revise ステップが既に完了している場合

**テストケース名**: `performReviseStepWithRetry_正常系_reviseステップが既に完了している場合`

- **目的**: revise ステップが既に完了している場合、スキップされることを検証
- **前提条件**:
  - design フェーズのステータスが `in_progress`
  - completed_steps に 'revise' が含まれている
- **入力**:
  - `initialReviewResult = { success: false, review_status: 'FAIL', feedback: 'Design is incomplete', needs_revision: true }`
- **期待結果**:
  - INFO ログ「Skipping revise step (already completed)」が出力される
  - `reviseFn()` は呼ばれない
  - `reviewFn()` は呼ばれない
  - 例外がスローされない
- **テストデータ**:
  ```typescript
  {
    phases: {
      design: {
        status: 'in_progress',
        started_at: '2025-01-30T10:00:00Z',
        completed_at: null,
        completed_steps: ['execute', 'revise']
      }
    }
  }
  ```

## 3. Integrationテストシナリオ

### 3.1. preset `review-design` 正常実行シナリオ

#### 3.1.1. 全フェーズが正常に完了

**シナリオ名**: `Preset_review-design_全フェーズが正常に完了`

- **目的**: preset `review-design` を実行し、すべてのフェーズが completed になることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - metadata.json が初期状態（すべてのフェーズが pending）
  - GitHub Issue が存在する
- **テスト手順**:
  1. preset `review-design` を実行する
  2. planning フェーズが実行され、completed になることを確認
  3. requirements フェーズが実行され、completed になることを確認
  4. design フェーズが実行され、completed になることを確認
  5. metadata.json を確認する
- **期待結果**:
  - `phases.planning.status === 'completed'`
  - `phases.requirements.status === 'completed'`
  - `phases.design.status === 'completed'`
  - すべてのフェーズで `completed_at` がnull以外
  - GitHub Issue に進捗コメントが投稿されている
- **確認項目**:
  - [ ] planning フェーズのステータスが completed
  - [ ] requirements フェーズのステータスが completed
  - [ ] design フェーズのステータスが completed
  - [ ] metadata.json に completed_at が記録されている
  - [ ] GitHub Issue に進捗コメントが投稿されている
  - [ ] ログに「フェーズが完了しました」が3回出力されている

### 3.2. preset `review-design` でレビュー失敗シナリオ

#### 3.2.1. design フェーズでレビュー失敗、最大リトライ回数超過

**シナリオ名**: `Preset_review-design_designフェーズでレビュー失敗_最大リトライ回数超過`

- **目的**: design フェーズのレビューが FAIL となり、最大リトライ回数（3回）を超えた場合、ステータスが failed になることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - metadata.json が初期状態（すべてのフェーズが pending）
  - design フェーズの review() をモック化し、常に FAIL を返すように設定
- **テスト手順**:
  1. preset `review-design` を実行する
  2. planning フェーズが正常に完了する
  3. requirements フェーズが正常に完了する
  4. design フェーズの execute ステップが完了する
  5. design フェーズの review ステップが FAIL を返す
  6. revise ステップが3回実行される
  7. 3回目のレビューも FAIL となる
  8. design フェーズのステータスが failed に更新される
  9. metadata.json を確認する
- **期待結果**:
  - `phases.planning.status === 'completed'`
  - `phases.requirements.status === 'completed'`
  - `phases.design.status === 'failed'`
  - `phases.design.retry_count === 3`
  - ERROR ログ「Max revise retries (3) reached」が出力される
  - GitHub Issue にエラーメッセージが投稿されている
- **確認項目**:
  - [ ] planning フェーズのステータスが completed
  - [ ] requirements フェーズのステータスが completed
  - [ ] design フェーズのステータスが failed
  - [ ] design フェーズの retry_count が 3
  - [ ] metadata.json に failed ステータスが記録されている
  - [ ] GitHub Issue にエラーメッセージが投稿されている

#### 3.2.2. design フェーズでレビュー失敗、2回目のreviseで合格

**シナリオ名**: `Preset_review-design_designフェーズでレビュー失敗_2回目のreviseで合格`

- **目的**: design フェーズのレビューが FAIL となり、2回目の revise で合格した場合、ステータスが completed になることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - metadata.json が初期状態（すべてのフェーズが pending）
  - design フェーズの review() をモック化し、1回目と2回目は FAIL、3回目は PASS を返すように設定
- **テスト手順**:
  1. preset `review-design` を実行する
  2. planning フェーズが正常に完了する
  3. requirements フェーズが正常に完了する
  4. design フェーズの execute ステップが完了する
  5. design フェーズの review ステップが FAIL を返す（1回目）
  6. revise ステップが実行される（1回目）
  7. review が再実行され、FAIL を返す（2回目）
  8. revise ステップが実行される（2回目）
  9. review が再実行され、PASS を返す（3回目）
  10. design フェーズのステータスが completed に更新される
  11. metadata.json を確認する
- **期待結果**:
  - `phases.design.status === 'completed'`
  - `phases.design.retry_count === 2`
  - INFO ログ「Review passed after revise」が出力される
  - GitHub Issue に成功メッセージが投稿されている
- **確認項目**:
  - [ ] design フェーズのステータスが completed
  - [ ] design フェーズの retry_count が 2
  - [ ] metadata.json に completed ステータスが記録されている
  - [ ] GitHub Issue に成功メッセージが投稿されている

### 3.3. preset `review-design` で revise ステップ例外発生シナリオ

#### 3.3.1. design フェーズの revise ステップで例外発生

**シナリオ名**: `Preset_review-design_designフェーズのreviseステップで例外発生`

- **目的**: design フェーズの revise ステップで例外が発生した場合、ステータスが failed になることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - metadata.json が初期状態（すべてのフェーズが pending）
  - design フェーズの review() をモック化し、FAIL を返すように設定
  - design フェーズの revise() をモック化し、例外をスローするように設定
- **テスト手順**:
  1. preset `review-design` を実行する
  2. planning フェーズが正常に完了する
  3. requirements フェーズが正常に完了する
  4. design フェーズの execute ステップが完了する
  5. design フェーズの review ステップが FAIL を返す
  6. revise ステップが実行され、例外がスローされる
  7. design フェーズのステータスが failed に更新される
  8. metadata.json を確認する
- **期待結果**:
  - `phases.planning.status === 'completed'`
  - `phases.requirements.status === 'completed'`
  - `phases.design.status === 'failed'`
  - ERROR ログ「Revise failed」が出力される
  - `metadata.updatePhaseStatus('design', 'failed')` が例外スロー前に呼ばれる
  - GitHub Issue にエラーメッセージが投稿されている
- **確認項目**:
  - [ ] design フェーズのステータスが failed
  - [ ] metadata.json に failed ステータスが記録されている
  - [ ] GitHub Issue にエラーメッセージが投稿されている
  - [ ] ステータス更新が例外スロー前に実行されている

### 3.4. preset `review-design` で execute ステップ失敗シナリオ

#### 3.4.1. design フェーズの execute ステップで失敗

**シナリオ名**: `Preset_review-design_designフェーズのexecuteステップで失敗`

- **目的**: design フェーズの execute ステップが失敗した場合、ステータスが failed になることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - metadata.json が初期状態（すべてのフェーズが pending）
  - design フェーズの execute() をモック化し、失敗を返すように設定
- **テスト手順**:
  1. preset `review-design` を実行する
  2. planning フェーズが正常に完了する
  3. requirements フェーズが正常に完了する
  4. design フェーズの execute ステップが失敗する
  5. design フェーズのステータスが failed に更新される
  6. metadata.json を確認する
- **期待結果**:
  - `phases.planning.status === 'completed'`
  - `phases.requirements.status === 'completed'`
  - `phases.design.status === 'failed'`
  - `handlePhaseError()` が呼ばれる
  - GitHub Issue にエラーメッセージが投稿されている
- **確認項目**:
  - [ ] design フェーズのステータスが failed
  - [ ] metadata.json に failed ステータスが記録されている
  - [ ] GitHub Issue にエラーメッセージが投稿されている

### 3.5. preset `review-design` でフェーズ再開シナリオ

#### 3.5.1. design フェーズが in_progress の状態から再開

**シナリオ名**: `Preset_review-design_designフェーズがin_progressの状態から再開`

- **目的**: design フェーズが in_progress の状態から再開した場合、正常に completed になることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - metadata.json で design フェーズのステータスが `in_progress`
  - design フェーズの completed_steps に 'execute' が含まれている
- **テスト手順**:
  1. preset `review-design` を実行する
  2. planning フェーズがスキップされる（completed）
  3. requirements フェーズがスキップされる（completed）
  4. design フェーズが再開される（execute ステップはスキップ）
  5. design フェーズの review ステップが実行される
  6. design フェーズのステータスが completed に更新される
  7. metadata.json を確認する
- **期待結果**:
  - `phases.design.status === 'completed'`
  - INFO ログ「Phase design resuming from step: review」が出力される
  - INFO ログ「skipping 'execute' step (already completed)」が出力される
  - GitHub Issue に進捗コメントが投稿されている
- **確認項目**:
  - [ ] design フェーズのステータスが completed
  - [ ] execute ステップがスキップされている
  - [ ] review ステップが実行されている
  - [ ] metadata.json に completed ステータスが記録されている

### 3.6. ステータス更新の確実性検証シナリオ

#### 3.6.1. finally ブロックでのステータス更新漏れ検出

**シナリオ名**: `Preset_review-design_finallyブロックでのステータス更新漏れ検出`

- **目的**: finalizePhase() が呼ばれずに run() が終了した場合、ensurePhaseStatusUpdated() でステータス更新漏れが検出されることを検証
- **前提条件**:
  - テスト用のリポジトリ環境が準備されている
  - finalizePhase() をモック化し、ステータス更新をスキップするように設定
- **テスト手順**:
  1. preset `review-design` を実行する
  2. design フェーズの execute、review ステップが正常に完了する
  3. finalizePhase() がスキップされる（意図的なバグ）
  4. finally ブロックで ensurePhaseStatusUpdated(true) が呼ばれる
  5. ステータスが in_progress のままであることを検出
  6. ステータスが completed に自動修正される
  7. metadata.json を確認する
- **期待結果**:
  - ERROR ログ「Status is still 'in_progress' after execution. Expected: completed」が出力される
  - WARN ログ「Auto-corrected status to 'completed'」が出力される
  - `phases.design.status === 'completed'`
- **確認項目**:
  - [ ] ステータス更新漏れが検出されている
  - [ ] ステータスが自動修正されている
  - [ ] metadata.json に completed ステータスが記録されている

## 4. テストデータ

### 4.1. metadata.json（初期状態）

```json
{
  "issue_number": "248",
  "phases": {
    "planning": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "completed_steps": [],
      "retry_count": 0,
      "output_files": []
    },
    "requirements": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "completed_steps": [],
      "retry_count": 0,
      "output_files": []
    },
    "design": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "completed_steps": [],
      "retry_count": 0,
      "output_files": []
    }
  },
  "cost_tracking": {
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "total_cost_usd": 0.0
  },
  "github_integration": {
    "progress_comment_id": null,
    "progress_comment_url": null
  }
}
```

### 4.2. metadata.json（design フェーズが in_progress）

```json
{
  "issue_number": "248",
  "phases": {
    "planning": {
      "status": "completed",
      "started_at": "2025-01-30T10:00:00Z",
      "completed_at": "2025-01-30T10:10:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["planning.md"]
    },
    "requirements": {
      "status": "completed",
      "started_at": "2025-01-30T10:10:00Z",
      "completed_at": "2025-01-30T10:20:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["requirements.md"]
    },
    "design": {
      "status": "in_progress",
      "started_at": "2025-01-30T10:20:00Z",
      "completed_at": null,
      "current_step": "review",
      "completed_steps": ["execute"],
      "retry_count": 0,
      "output_files": []
    }
  },
  "cost_tracking": {
    "total_input_tokens": 100000,
    "total_output_tokens": 50000,
    "total_cost_usd": 1.5
  },
  "github_integration": {
    "progress_comment_id": 123456,
    "progress_comment_url": "https://github.com/owner/repo/issues/248#issuecomment-123456"
  }
}
```

### 4.3. metadata.json（design フェーズが completed）

```json
{
  "issue_number": "248",
  "phases": {
    "planning": {
      "status": "completed",
      "started_at": "2025-01-30T10:00:00Z",
      "completed_at": "2025-01-30T10:10:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["planning.md"]
    },
    "requirements": {
      "status": "completed",
      "started_at": "2025-01-30T10:10:00Z",
      "completed_at": "2025-01-30T10:20:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["requirements.md"]
    },
    "design": {
      "status": "completed",
      "started_at": "2025-01-30T10:20:00Z",
      "completed_at": "2025-01-30T10:30:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["design.md"]
    }
  },
  "cost_tracking": {
    "total_input_tokens": 150000,
    "total_output_tokens": 75000,
    "total_cost_usd": 2.25
  },
  "github_integration": {
    "progress_comment_id": 123456,
    "progress_comment_url": "https://github.com/owner/repo/issues/248#issuecomment-123456"
  }
}
```

### 4.4. metadata.json（design フェーズが failed、retry_count = 3）

```json
{
  "issue_number": "248",
  "phases": {
    "planning": {
      "status": "completed",
      "started_at": "2025-01-30T10:00:00Z",
      "completed_at": "2025-01-30T10:10:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["planning.md"]
    },
    "requirements": {
      "status": "completed",
      "started_at": "2025-01-30T10:10:00Z",
      "completed_at": "2025-01-30T10:20:00Z",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "retry_count": 0,
      "output_files": ["requirements.md"]
    },
    "design": {
      "status": "failed",
      "started_at": "2025-01-30T10:20:00Z",
      "completed_at": "2025-01-30T10:40:00Z",
      "current_step": null,
      "completed_steps": ["execute"],
      "retry_count": 3,
      "output_files": []
    }
  },
  "cost_tracking": {
    "total_input_tokens": 200000,
    "total_output_tokens": 100000,
    "total_cost_usd": 3.0
  },
  "github_integration": {
    "progress_comment_id": 123456,
    "progress_comment_url": "https://github.com/owner/repo/issues/248#issuecomment-123456"
  }
}
```

## 5. テスト環境要件

### 5.1. 必要なテスト環境

- **ローカル環境**:
  - Node.js 20.x 以上
  - npm 10.x 以上
  - Git 2.x 以上
  - TypeScript 5.x
  - Jest（テストフレームワーク）

- **CI/CD環境**:
  - GitHub Actions
  - Docker（テスト用コンテナ）

### 5.2. 必要な外部サービス

- **GitHub API**:
  - Issue コメント投稿のモック/スタブ
  - テスト環境では実際のGitHub APIは呼ばない（モック化）

### 5.3. モック/スタブの必要性

#### Unitテスト

- **MetadataManager**:
  - ファイルシステム操作（fs.writeFileSync）をモック化
  - logger をモック化

- **PhaseRunner**:
  - MetadataManager をモック化
  - GitHubClient をモック化
  - StepExecutor をモック化
  - logger をモック化

- **ReviewCycleManager**:
  - MetadataManager をモック化
  - reviewFn、reviseFn、postProgressFn をモック化
  - logger をモック化

#### Integrationテスト

- **GitHubClient**:
  - createOrUpdateProgressComment をモック化（実際のGitHub APIは呼ばない）

- **GitManager**:
  - Git操作（commit、push）をモック化（実際のGit操作は実行しない、またはテスト用リポジトリを使用）

- **BasePhase**:
  - execute()、review()、revise() をモック化可能にする（テストシナリオに応じて）

## 6. 品質ゲート（Phase 3: Test Scenario）

本テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - UNIT_INTEGRATION 戦略に基づき、Unitテストシナリオ（2.1〜2.7）とIntegrationテストシナリオ（3.1〜3.6）を作成
  - BDDシナリオは作成していない（戦略に含まれないため）

- [x] **主要な正常系がカバーされている**
  - Unitテスト: updatePhaseStatus（冪等性、正常な遷移）、finalizePhase（正常系）、run（フェーズ実行成功）
  - Integrationテスト: preset `review-design` 正常実行、revise 1回目で合格、フェーズ再開

- [x] **主要な異常系がカバーされている**
  - Unitテスト: updatePhaseStatus（不正な遷移）、ensurePhaseStatusUpdated（ステータス更新漏れ検出）、handlePhaseError（エラー処理）
  - Integrationテスト: 最大リトライ回数超過、revise ステップ例外発生、execute ステップ失敗

- [x] **期待結果が明確である**
  - すべてのテストケースで「期待結果」セクションを明記
  - 具体的なステータス値、ログメッセージ、メソッド呼び出しを記載
  - 確認項目のチェックリストを提供（Integrationテスト）

## 7. テストシナリオの優先度

### 高優先度（クリティカルパス）

1. **Integrationテスト 3.1.1**: preset `review-design` 全フェーズが正常に完了
2. **Integrationテスト 3.2.1**: design フェーズでレビュー失敗、最大リトライ回数超過
3. **Integrationテスト 3.3.1**: design フェーズの revise ステップで例外発生
4. **Unitテスト 2.4.2**: ensurePhaseStatusUpdated（ステータス更新漏れ検出・成功時）
5. **Unitテスト 2.7.2**: performReviseStepWithRetry（最大リトライ回数超過）

### 中優先度

6. **Unitテスト 2.1.1**: updatePhaseStatus（冪等性チェック）
7. **Unitテスト 2.1.3**: updatePhaseStatus（不正な遷移）
8. **Unitテスト 2.3.1**: finalizePhase（正常系）
9. **Unitテスト 2.5.1**: handlePhaseError（正常系）
10. **Integrationテスト 3.2.2**: design フェーズでレビュー失敗、2回目のreviseで合格

### 低優先度

11. **Unitテスト 2.1.2〜2.1.8**: updatePhaseStatus（その他のステータス遷移）
12. **Unitテスト 2.3.2〜2.3.3**: finalizePhase（異常系）
13. **Unitテスト 2.6.1〜2.6.4**: run（その他のケース）
14. **Integrationテスト 3.4.1**: design フェーズの execute ステップで失敗
15. **Integrationテスト 3.5.1**: design フェーズが in_progress の状態から再開

## 8. テスト実行計画

### 8.1. Unitテストの実行

- **実行コマンド**: `npm run test:unit`
- **対象ファイル**:
  - `tests/unit/metadata-manager.test.ts`（既存拡張）
  - `tests/unit/phase-runner.test.ts`（新規作成）
  - `tests/unit/review-cycle-manager.test.ts`（既存拡張）
- **カバレッジ目標**: 変更部分のコードカバレッジ 80% 以上

### 8.2. Integrationテストの実行

- **実行コマンド**: `npm run test:integration`
- **対象ファイル**:
  - `tests/integration/preset-workflow.test.ts`（新規作成）
- **実行時間**: 約5〜10分（preset実行のエンドツーエンドテスト）

### 8.3. テスト実行の順序

1. **Unitテスト実行**: 個別のロジックの正常性を確認
2. **Integrationテスト実行**: エンドツーエンドの動作を確認
3. **カバレッジレポート確認**: 変更部分のカバレッジが80%以上であることを確認
4. **品質ゲート確認**: すべてのテストがパスし、品質ゲートを満たしていることを確認

## 9. 参考情報

- **Planning Document**: @.ai-workflow/issue-248/00_planning/output/planning.md
- **要件定義書**: @.ai-workflow/issue-248/01_requirements/output/requirements.md
- **設計書**: @.ai-workflow/issue-248/02_design/output/design.md
- **Issue #243**: レビュー結果がFAILでもreviseが実行されず後続フェーズに進んでしまうバグ
- **@ARCHITECTURE.md**: Phase実行フロー、メタデータ管理アーキテクチャ

---

**テストシナリオバージョン**: 1.0
**作成日**: 2025-01-30
**Planning Document参照**: @.ai-workflow/issue-248/00_planning/output/planning.md
**Requirements Document参照**: @.ai-workflow/issue-248/01_requirements/output/requirements.md
**Design Document参照**: @.ai-workflow/issue-248/02_design/output/design.md
