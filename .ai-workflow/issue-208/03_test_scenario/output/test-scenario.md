# テストシナリオ - Issue #208

## 0. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION** (Planning Documentより)

- **ユニットテスト**: バリデーションロジックの単体テスト（MetadataManager、Rollbackコマンド）
- **インテグレーションテスト**: ワークフロー全体での動作確認

### テスト対象の範囲

**対象ファイル**:
1. `src/commands/rollback.ts`: `validateRollbackOptions()` メソッド
2. `src/core/metadata-manager.ts`: `validatePhaseConsistency()`, `rollbackToPhase()`, `updatePhaseForRollback()`, `resetSubsequentPhases()` メソッド

**対象機能**:
- メタデータの整合性チェック（`status` vs `completed_steps`）
- Rollbackバリデーションロジックの改善
- フェーズリセット処理の修正

### テストの目的

1. **不整合状態の許容**: `status: "pending"` かつ `completed_steps: ["execute", "review"]` の状態でもrollbackが成功すること
2. **整合性チェックの動作確認**: 不整合パターンを検出し、警告ログを出力すること
3. **既存機能への影響確認**: 正常なワークフローが影響を受けないこと（後方互換性）
4. **フェーズリセットの完全性**: `rollbackToPhase()` が `completed_steps` と `current_step` を確実にリセットすること

---

## 1. ユニットテストシナリオ

### 1.1. validateRollbackOptions() のテスト

#### TC-UR-001: 正常系 - in_progress フェーズへのrollback

- **目的**: `status: 'in_progress'` のフェーズへのrollbackが正常に動作することを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'in_progress'`, `completed_steps: ['execute']`
- **入力**:
  ```typescript
  options = {
    issue: '194',
    toPhase: 'test_implementation',
    toStep: 'review',
    reason: 'Fix implementation issue'
  }
  ```
- **期待結果**: エラーが発生しない（バリデーション成功）
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "in_progress",
      "completed_steps": ["execute"],
      "started_at": "2025-01-30T10:00:00Z"
    }
  }
  ```

#### TC-UR-002: 正常系 - completed フェーズへのrollback

- **目的**: `status: 'completed'` のフェーズへのrollbackが正常に動作することを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'completed'`, `completed_steps: ['execute', 'review']`
- **入力**:
  ```typescript
  options = {
    issue: '194',
    toPhase: 'test_implementation',
    toStep: 'revise',
    reason: 'Need to revise tests'
  }
  ```
- **期待結果**: エラーが発生しない（バリデーション成功）
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T10:00:00Z",
      "completed_at": "2025-01-30T11:00:00Z"
    }
  }
  ```

#### TC-UR-003: 異常系 - pending かつ completed_steps が空

- **目的**: `status: 'pending'` かつ `completed_steps: []` の未開始フェーズへのrollbackがエラーになることを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'pending'`, `completed_steps: []`
- **入力**:
  ```typescript
  options = {
    issue: '194',
    toPhase: 'test_implementation',
    toStep: 'execute',
    reason: 'Test'
  }
  ```
- **期待結果**:
  - エラーが発生: `Cannot rollback to phase 'test_implementation' because it has not been started yet.`
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null
    }
  }
  ```

#### TC-UR-004: 改善 - pending でも completed_steps が存在（不整合状態）

- **目的**: **Issue #208の本質** - 不整合状態でもrollbackが成功し、警告ログが出力されることを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'pending'`, `completed_steps: ['execute', 'review']` （**不整合状態**）
- **入力**:
  ```typescript
  options = {
    issue: '194',
    toPhase: 'test_implementation',
    toStep: 'revise',
    reason: 'Fix inconsistent state'
  }
  ```
- **期待結果**:
  - エラーが発生しない（バリデーション成功）
  - 警告ログが出力される: `Phase test_implementation: status is 'pending' but completed_steps is not empty. Treating as started phase (completed_steps: ["execute","review"])`
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "pending",
      "completed_steps": ["execute", "review"],
      "started_at": null
    }
  }
  ```

#### TC-UR-005: 境界値 - completed_steps が undefined

- **目的**: `completed_steps` が `undefined` の場合の挙動を検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'pending'`, `completed_steps: undefined`
- **入力**:
  ```typescript
  options = {
    issue: '194',
    toPhase: 'test_implementation',
    toStep: 'execute',
    reason: 'Test'
  }
  ```
- **期待結果**:
  - エラーが発生: `Cannot rollback to phase 'test_implementation' because it has not been started yet.`
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "pending",
      "started_at": null
    }
  }
  ```

---

### 1.2. validatePhaseConsistency() のテスト

#### TC-VM-001: 正常系 - status と completed_steps が整合

- **目的**: 整合性のあるメタデータに対して警告が出力されないことを検証
- **前提条件**:
  - `implementation` フェーズが `status: 'in_progress'`, `completed_steps: ['execute']`
- **入力**: `phaseName = 'implementation'`
- **期待結果**:
  ```typescript
  {
    valid: true,
    warnings: []
  }
  ```
- **テストデータ**:
  ```json
  {
    "implementation": {
      "status": "in_progress",
      "completed_steps": ["execute"],
      "started_at": "2025-01-30T10:00:00Z"
    }
  }
  ```

#### TC-VM-002: 不整合1 - pending + completed_steps 存在

- **目的**: `status: 'pending'` かつ `completed_steps` が存在する不整合を検出することを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'pending'`, `completed_steps: ['execute']`
- **入力**: `phaseName = 'test_implementation'`
- **期待結果**:
  ```typescript
  {
    valid: false,
    warnings: [
      "Phase test_implementation: status is 'pending' but completed_steps is not empty ([\"execute\"])"
    ]
  }
  ```
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "pending",
      "completed_steps": ["execute"],
      "started_at": null
    }
  }
  ```

#### TC-VM-003: 不整合2 - completed + completed_steps 空

- **目的**: `status: 'completed'` かつ `completed_steps: []` の不整合を検出することを検証
- **前提条件**:
  - `testing` フェーズが `status: 'completed'`, `completed_steps: []`
- **入力**: `phaseName = 'testing'`
- **期待結果**:
  ```typescript
  {
    valid: false,
    warnings: [
      "Phase testing: status is 'completed' but completed_steps is empty"
    ]
  }
  ```
- **テストデータ**:
  ```json
  {
    "testing": {
      "status": "completed",
      "completed_steps": [],
      "completed_at": "2025-01-30T12:00:00Z"
    }
  }
  ```

#### TC-VM-004: 不整合3 - in_progress + started_at null

- **目的**: `status: 'in_progress'` かつ `started_at: null` の不整合を検出することを検証
- **前提条件**:
  - `documentation` フェーズが `status: 'in_progress'`, `started_at: null`
- **入力**: `phaseName = 'documentation'`
- **期待結果**:
  ```typescript
  {
    valid: false,
    warnings: [
      "Phase documentation: status is 'in_progress' but started_at is null"
    ]
  }
  ```
- **テストデータ**:
  ```json
  {
    "documentation": {
      "status": "in_progress",
      "started_at": null,
      "current_step": "execute"
    }
  }
  ```

#### TC-VM-005: 複合不整合 - 複数の不整合が同時に存在

- **目的**: 複数の不整合パターンが同時に検出されることを検証
- **前提条件**:
  - `report` フェーズが `status: 'in_progress'`, `started_at: null`, `completed_steps: []`
- **入力**: `phaseName = 'report'`
- **期待結果**:
  ```typescript
  {
    valid: false,
    warnings: [
      "Phase report: status is 'in_progress' but started_at is null"
    ]
  }
  ```
- **テストデータ**:
  ```json
  {
    "report": {
      "status": "in_progress",
      "started_at": null,
      "completed_steps": []
    }
  }
  ```

---

### 1.3. rollbackToPhase() のテスト

#### TC-RP-001: 正常系 - completed_steps と current_step が正しくリセットされる

- **目的**: `rollbackToPhase()` が `completed_steps` と `current_step` を確実にリセットすることを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'completed'`, `completed_steps: ['execute', 'review']`
  - 後続フェーズ（testing, documentation, report）も完了済み
- **入力**: `phaseName = 'test_implementation'`
- **期待結果**:
  - 後続フェーズ（testing, documentation, report）のメタデータが以下にリセットされる:
    ```json
    {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "current_step": null,
      "rollback_context": null
    }
    ```
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T10:00:00Z",
      "completed_at": "2025-01-30T11:00:00Z"
    },
    "testing": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T11:05:00Z",
      "completed_at": "2025-01-30T12:00:00Z"
    }
  }
  ```

#### TC-RP-002: 異常系 - 存在しないフェーズへのrollback

- **目的**: 存在しないフェーズ名が指定された場合のエラーハンドリングを検証
- **前提条件**: なし
- **入力**: `phaseName = 'non_existent_phase'`
- **期待結果**:
  - エラーが返される: `error: "Unknown phase name: non_existent_phase"`
- **テストデータ**: なし

---

### 1.4. resetSubsequentPhases() のテスト

#### TC-RS-001: 正常系 - 後続フェーズが正しくリセットされる

- **目的**: `resetSubsequentPhases()` が後続フェーズを正しくリセットし、整合性チェックを呼び出すことを検証
- **前提条件**:
  - `implementation` フェーズ以降のフェーズが進行中または完了済み
- **入力**: `fromPhase = 'implementation'`
- **期待結果**:
  - 後続フェーズ（test_implementation, testing, documentation, report, evaluation）がすべて以下にリセット:
    ```json
    {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "retry_count": 0,
      "rollback_context": null
    }
    ```
  - `validatePhaseConsistency()` が各フェーズに対して呼び出される
- **テストデータ**:
  ```json
  {
    "implementation": {
      "status": "completed",
      "completed_steps": ["execute", "review"]
    },
    "test_implementation": {
      "status": "in_progress",
      "completed_steps": ["execute"],
      "started_at": "2025-01-30T11:00:00Z"
    }
  }
  ```

#### TC-RS-002: 境界値 - 最後のフェーズからのリセット

- **目的**: 最後のフェーズ（evaluation）からのリセットでエラーが発生しないことを検証
- **前提条件**:
  - `evaluation` フェーズが完了済み
- **入力**: `fromPhase = 'evaluation'`
- **期待結果**:
  - リセット対象のフェーズが0件
  - エラーが発生しない
- **テストデータ**:
  ```json
  {
    "evaluation": {
      "status": "completed",
      "completed_steps": ["execute", "review"]
    }
  }
  ```

---

### 1.5. updatePhaseForRollback() のテスト

#### TC-UP-001: 正常系 - 整合性チェックが統合されている

- **目的**: `updatePhaseForRollback()` が `validatePhaseConsistency()` を呼び出すことを検証
- **前提条件**:
  - `test_implementation` フェーズが存在
- **入力**:
  ```typescript
  phaseName = 'test_implementation'
  toStep = 'revise'
  ```
- **期待結果**:
  - `validatePhaseConsistency('test_implementation')` が呼び出される
  - フェーズのステータスが正しく更新される
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "completed",
      "completed_steps": ["execute", "review"]
    }
  }
  ```

#### TC-UP-002: 不整合状態での動作確認

- **目的**: 不整合状態でも `updatePhaseForRollback()` が処理を継続することを検証
- **前提条件**:
  - `test_implementation` フェーズが `status: 'pending'`, `completed_steps: ['execute']` （不整合状態）
- **入力**:
  ```typescript
  phaseName = 'test_implementation'
  toStep = 'revise'
  ```
- **期待結果**:
  - 警告ログが出力される
  - 処理が継続され、フェーズステータスが更新される
  - エラーで停止しない
- **テストデータ**:
  ```json
  {
    "test_implementation": {
      "status": "pending",
      "completed_steps": ["execute"],
      "started_at": null
    }
  }
  ```

---

## 2. インテグレーションテストシナリオ

### 2.1. シナリオ1: 不整合状態でのrollback成功（End-to-End）

#### IT-E2E-001: Issue #208の再現と修正確認

- **目的**: Issue #208で報告された不整合状態からrollbackが成功することをEnd-to-Endで検証
- **前提条件**:
  - Issue #194 のワークフローメタデータが存在
  - `test_implementation` フェーズが `status: 'pending'`, `completed_steps: ['execute', 'review']` （不整合状態）
  - 同様の不整合が `testing`, `documentation`, `report` フェーズにも存在
- **テスト手順**:
  1. メタデータを不整合状態に設定:
     ```json
     {
       "test_implementation": {
         "status": "pending",
         "started_at": null,
         "completed_steps": ["execute", "review"]
       },
       "testing": {
         "status": "pending",
         "started_at": null,
         "completed_steps": ["execute", "review"]
       }
     }
     ```
  2. Rollbackコマンドを実行:
     ```bash
     node dist/index.js rollback --issue 194 --to-phase test_implementation --to-step revise --reason "Fix inconsistent metadata"
     ```
  3. ログを確認
  4. メタデータの変更を確認
- **期待結果**:
  - Rollbackが成功する（エラーで失敗しない）
  - 警告ログに以下が含まれる:
    ```
    [WARN] Phase test_implementation: status is 'pending' but completed_steps is not empty. Treating as started phase (completed_steps: ["execute","review"])
    ```
  - `test_implementation` フェーズのメタデータが以下に更新される:
    ```json
    {
      "status": "in_progress",
      "current_step": "revise",
      "rollback_context": {
        "reason": "Fix inconsistent metadata",
        "timestamp": "<現在時刻>"
      }
    }
    ```
- **確認項目**:
  - [ ] Rollbackコマンドがエラーなく完了する
  - [ ] 警告ログが出力される
  - [ ] メタデータが正しく更新される
  - [ ] 後続のワークフロー実行が可能になる

---

### 2.2. シナリオ2: Evaluation Phase → フェーズリセット → Rollback

#### IT-EVAL-001: Evaluation PhaseでのFAIL判定後のrollback

- **目的**: Evaluation PhaseでFAIL判定が発生した後、フェーズリセットとrollbackが正しく動作することを検証
- **前提条件**:
  - ワークフローがEvaluation Phaseまで進行
  - Evaluation Phaseで `FAIL_PHASE_TEST_IMPLEMENTATION` 判定が発生
- **テスト手順**:
  1. Evaluation Phaseを実行し、`FAIL_PHASE_TEST_IMPLEMENTATION` 判定をシミュレート
  2. `rollbackToPhase('test_implementation')` が呼び出される
  3. 後続フェーズ（testing, documentation, report）のメタデータを確認
  4. Rollbackコマンドを実行
- **期待結果**:
  - `resetSubsequentPhases()` により、後続フェーズが以下にリセットされる:
    ```json
    {
      "testing": {
        "status": "pending",
        "completed_steps": [],
        "started_at": null,
        "current_step": null
      },
      "documentation": {
        "status": "pending",
        "completed_steps": [],
        "started_at": null,
        "current_step": null
      },
      "report": {
        "status": "pending",
        "completed_steps": [],
        "started_at": null,
        "current_step": null
      }
    }
    ```
  - Rollbackコマンドが成功する
  - 不整合が検出されない（警告ログが出力されない）
- **確認項目**:
  - [ ] `rollbackToPhase()` が `completed_steps` と `current_step` をリセットする
  - [ ] 後続フェーズのメタデータが完全にリセットされる
  - [ ] Rollbackコマンドが正常に動作する
  - [ ] 不整合が発生しない

---

### 2.3. シナリオ3: 既存ワークフローへの影響なし（後方互換性）

#### IT-COMPAT-001: 正常なワークフローでのrollback

- **目的**: 整合性のある正常なメタデータに対して、既存の動作が変更されないことを検証
- **前提条件**:
  - 正常なワークフローが実行されている
  - すべてのフェーズで `status` と `completed_steps` が整合している
- **テスト手順**:
  1. 正常なワークフローを実行（planning → requirements → design → ...）
  2. 各フェーズでメタデータを確認（整合性あり）
  3. 途中のフェーズ（例: design）へのrollbackを実行
  4. 後続フェーズがリセットされることを確認
  5. Resume機能で再開
- **期待結果**:
  - Rollbackが正常に動作する
  - **不要な警告ログが出力されない**（重要）
  - メタデータの整合性が維持される
  - Resume機能が正常に動作する
- **確認項目**:
  - [ ] 既存の動作が変更されていない
  - [ ] 不要な警告ログが出力されない
  - [ ] メタデータの整合性が維持される
  - [ ] Resume機能が影響を受けない

#### IT-COMPAT-002: 複数回のrollbackとresume

- **目的**: 複数回のrollback/resumeサイクルでメタデータの整合性が維持されることを検証
- **前提条件**:
  - ワークフローがimplementationフェーズまで進行
- **テスト手順**:
  1. implementationフェーズでrollback実行
  2. resumeでdesignフェーズから再開
  3. implementationフェーズ完了
  4. 再度rollback実行
  5. resumeで再開
  6. 各ステップでメタデータの整合性を確認
- **期待結果**:
  - すべてのrollback/resumeサイクルで整合性が維持される
  - 不整合が発生しない
  - 警告ログが出力されない
- **確認項目**:
  - [ ] 複数回のrollback/resumeが正常に動作する
  - [ ] メタデータの整合性が常に維持される
  - [ ] `completed_steps` が正しく更新・リセットされる

---

### 2.4. シナリオ4: Jenkins環境でのメタデータ整合性

#### IT-JENKINS-001: Jenkins環境でのワークフロー実行と整合性確認

- **目的**: Jenkins環境で実行されたワークフローのメタデータが整合性を維持することを検証
- **前提条件**:
  - Jenkins環境が構築されている
  - ワークフローがJenkins上で実行可能
- **テスト手順**:
  1. ローカルでワークフローを開始（planning → requirements）
  2. Git push でメタデータをリモートに同期
  3. Jenkins環境でワークフローを継続（design → implementation）
  4. メタデータをローカルにpull
  5. ローカルでメタデータの整合性を確認
  6. Rollbackコマンドを実行
- **期待結果**:
  - Jenkins環境で実行されたフェーズのメタデータが整合している
  - ローカルとJenkins間でメタデータの不整合が発生しない
  - Rollbackコマンドが正常に動作する
- **確認項目**:
  - [ ] Jenkins環境でのメタデータが整合している
  - [ ] Git pull/push でメタデータが正しく同期される
  - [ ] マージ競合が発生しない
  - [ ] Rollbackコマンドが正常に動作する

---

## 3. テストデータ

### 3.1. 不整合状態のメタデータ（Issue #208再現用）

```json
{
  "phases": {
    "planning": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T09:00:00Z",
      "completed_at": "2025-01-30T09:30:00Z"
    },
    "requirements": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T09:35:00Z",
      "completed_at": "2025-01-30T10:00:00Z"
    },
    "design": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T10:05:00Z",
      "completed_at": "2025-01-30T10:30:00Z"
    },
    "test_scenario": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T10:35:00Z",
      "completed_at": "2025-01-30T11:00:00Z"
    },
    "implementation": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T11:05:00Z",
      "completed_at": "2025-01-30T12:00:00Z"
    },
    "test_implementation": {
      "status": "pending",
      "completed_steps": ["execute", "review"],
      "started_at": null,
      "current_step": null
    },
    "testing": {
      "status": "pending",
      "completed_steps": ["execute", "review"],
      "started_at": null,
      "current_step": null
    },
    "documentation": {
      "status": "pending",
      "completed_steps": ["execute", "review"],
      "started_at": null,
      "current_step": null
    },
    "report": {
      "status": "pending",
      "completed_steps": ["execute", "review"],
      "started_at": null,
      "current_step": null
    },
    "evaluation": {
      "status": "in_progress",
      "completed_steps": ["execute"],
      "started_at": "2025-01-30T12:05:00Z",
      "current_step": "review"
    }
  }
}
```

### 3.2. 正常なメタデータ（後方互換性確認用）

```json
{
  "phases": {
    "planning": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T09:00:00Z",
      "completed_at": "2025-01-30T09:30:00Z"
    },
    "requirements": {
      "status": "completed",
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-30T09:35:00Z",
      "completed_at": "2025-01-30T10:00:00Z"
    },
    "design": {
      "status": "in_progress",
      "completed_steps": ["execute"],
      "started_at": "2025-01-30T10:05:00Z",
      "current_step": "review"
    },
    "test_scenario": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "current_step": null
    },
    "implementation": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "current_step": null
    }
  }
}
```

### 3.3. Evaluation Phase FAIL判定後のメタデータ（期待値）

```json
{
  "phases": {
    "test_implementation": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "retry_count": 0,
      "rollback_context": null
    },
    "testing": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "retry_count": 0,
      "rollback_context": null
    },
    "documentation": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "retry_count": 0,
      "rollback_context": null
    },
    "report": {
      "status": "pending",
      "completed_steps": [],
      "started_at": null,
      "completed_at": null,
      "current_step": null,
      "retry_count": 0,
      "rollback_context": null
    }
  }
}
```

---

## 4. テスト環境要件

### 4.1. ローカル環境

- **Node.js**: 20.x 以上
- **TypeScript**: 5.x
- **Jest**: 最新版
- **必要な環境変数**:
  - `GITHUB_TOKEN`: GitHub API アクセス用
  - `AI_WORKFLOW_DEBUG`: デバッグログ有効化（テスト時のみ）

### 4.2. CI/CD環境（Jenkins）

- **Jenkins**: 最新版
- **Git**: メタデータ同期用
- **Docker**: コンテナ環境での実行
- **一時ディレクトリ**: `/tmp/jenkins-<random>/workspace/AI_Workflow/...`

### 4.3. モック/スタブの必要性

**ユニットテストでモックが必要な箇所**:
- `MetadataManager`: ファイルI/O（`fs` モジュール）
- `logger`: ログ出力（検証のため）
- `GitHub API`: Issue情報取得

**インテグレーションテストでモックが不要な箇所**:
- メタデータファイル: 実ファイルを使用
- Rollbackコマンド: 実コマンドを実行

---

## 5. テスト実行順序

### 推奨実行順序

1. **ユニットテスト**: `validatePhaseConsistency()` (TC-VM-001 ~ TC-VM-005)
2. **ユニットテスト**: `validateRollbackOptions()` (TC-UR-001 ~ TC-UR-005)
3. **ユニットテスト**: `rollbackToPhase()` (TC-RP-001 ~ TC-RP-002)
4. **ユニットテスト**: `resetSubsequentPhases()` (TC-RS-001 ~ TC-RS-002)
5. **ユニットテスト**: `updatePhaseForRollback()` (TC-UP-001 ~ TC-UP-002)
6. **インテグレーションテスト**: 不整合状態でのrollback (IT-E2E-001)
7. **インテグレーションテスト**: Evaluation Phase → rollback (IT-EVAL-001)
8. **インテグレーションテスト**: 後方互換性確認 (IT-COMPAT-001, IT-COMPAT-002)
9. **インテグレーションテスト**: Jenkins環境（オプション） (IT-JENKINS-001)

---

## 6. カバレッジ目標

### 6.1. ユニットテスト

- **コードカバレッジ**: 90%以上
- **対象メソッド**:
  - `validateRollbackOptions()`: 100%
  - `validatePhaseConsistency()`: 100%
  - `rollbackToPhase()`: 90%以上
  - `resetSubsequentPhases()`: 90%以上
  - `updatePhaseForRollback()`: 90%以上

### 6.2. インテグレーションテスト

- **シナリオカバレッジ**: 主要ユースケース100%
  - Issue #208の再現シナリオ
  - Evaluation Phase → rollback
  - 後方互換性確認

---

## 7. テスト完了の定義 (Definition of Done)

以下をすべて満たした場合、テストシナリオフェーズ完了とする：

- [ ] **すべてのユニットテストシナリオが定義されている**（最低10ケース以上）
- [ ] **すべてのインテグレーションテストシナリオが定義されている**（正常系 + 異常系）
- [ ] **Issue #208の再現シナリオが含まれている**（IT-E2E-001）
- [ ] **既存ワークフローへの影響確認シナリオが含まれている**（IT-COMPAT-001, IT-COMPAT-002）
- [ ] **テストデータが具体的に定義されている**
- [ ] **期待結果が明確である**（曖昧な表現がない）
- [ ] **実行可能なシナリオである**（手順が具体的）

---

## 8. 品質ゲート確認

### Phase 3の品質ゲート

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に準拠
- [x] **主要な正常系がカバーされている**: TC-UR-001, TC-UR-002, TC-VM-001, IT-COMPAT-001 など
- [x] **主要な異常系がカバーされている**: TC-UR-003, TC-VM-002~004, IT-E2E-001 など
- [x] **期待結果が明確である**: すべてのテストケースで期待結果を具体的に記載

---

**テストシナリオ作成日**: 2025-01-30
**作成者**: AI Workflow Agent
**バージョン**: 1.0
**テスト戦略**: UNIT_INTEGRATION
**総テストケース数**: 15（ユニット: 11、インテグレーション: 4）
