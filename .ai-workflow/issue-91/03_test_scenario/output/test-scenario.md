# テストシナリオ - Issue #91

**Issue番号**: #91
**タイトル**: [FOLLOW-UP] Issue #49 - 残タスク
**作成日**: 2025-01-30
**バージョン**: 1.0
**ステータス**: Draft

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY**（Phase 2で決定）

### 1.2 テスト対象の範囲

本Issueでは、Issue #49のBasePhaseモジュール分解リファクタリングで残った以下のテストインフラ改善を対象とします：

1. **テスト失敗修正**（15個のテスト）
   - PhaseRunner: 10テスト
   - StepExecutor: 3テスト
   - Integration: 2テスト

2. **カバレッジ向上**（60-87% → 90%+）
   - ArtifactCleaner: 64.4% → 90%
   - PhaseRunner: 62% → 90%
   - ContextBuilder: 80.48% → 90%
   - StepExecutor: 87.67% → 90%

3. **パフォーマンス検証**
   - AC-8（実行時間±5%）の検証

### 1.3 テストの目的

- **品質保証ギャップの解消**: 15個のテスト失敗を修正し、100%合格率を達成
- **カバレッジ目標達成**: 各モジュール90%以上のカバレッジを達成
- **パフォーマンス検証**: AC-8（実行時間±5%）を検証し、文書化
- **Issue #49の完全完了**: すべてのブロッキングタスクを解消し、マージ準備完了

---

## 2. Unitテストシナリオ

### 2.1 Task 5-1: PhaseRunner mock修正（10テスト）

#### UC-91-01: PhaseRunner依存モジュールのmock設定

**テストケース名**: `PhaseRunner_mock_jest.mock追加_正常系`

- **目的**: `phase-dependencies.js` のmock設定が正しく機能することを検証
- **前提条件**:
  - `tests/unit/phases/lifecycle/phase-runner.test.ts` が存在する
  - ファイル先頭に `jest.mock('../../../../src/core/phase-dependencies.js')` が未追加
- **修正内容**:
  - ファイル先頭（import文の直後）に以下を追加：
    ```typescript
    jest.mock('../../../../src/core/phase-dependencies.js');
    ```
- **期待結果**:
  - `phase-dependencies.js` の依存関係検証関数がmock化される
  - 既存テストケースで `validatePhaseDependencies` が呼び出された際、mockが使用される
- **検証方法**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/phase-runner.test.ts
  ```
- **成功基準**: エラー「Cannot find module '../../../../src/core/phase-dependencies.js'」が発生しない

---

#### UC-91-02: MetadataManager mockへの `getAllPhasesStatus` 追加

**テストケース名**: `PhaseRunner_mock_getAllPhasesStatus追加_正常系`

- **目的**: MetadataManager mockに `getAllPhasesStatus` メソッドが追加され、正しく動作することを検証
- **前提条件**:
  - `createMockMetadataManager()` 関数が存在する
  - `getAllPhasesStatus` メソッドが未定義
- **修正内容**:
  - `createMockMetadataManager()` 関数内に以下を追加：
    ```typescript
    getAllPhasesStatus: jest.fn().mockReturnValue([])
    ```
- **期待結果**:
  - PhaseRunnerが `metadataManager.getAllPhasesStatus()` を呼び出した際、空配列 `[]` が返される
  - 「Property 'getAllPhasesStatus' does not exist」エラーが発生しない
- **検証方法**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/phase-runner.test.ts
  ```
- **成功基準**: 10テストすべてで `getAllPhasesStatus` の呼び出しが成功

---

#### UC-91-03: logger.info spyの追加（10テストケース）

**テストケース名**: `PhaseRunner_logger.info_spy追加_正常系`

- **目的**: 各テストケースで `logger.info` がspyされ、呼び出しが検証されることを確認
- **前提条件**:
  - PhaseRunnerの各テストケース（10個）が存在する
  - `logger.info` spyが未追加
- **修正内容**:
  - 各テストケース内（Act実行前）に以下を追加：
    ```typescript
    const loggerInfoSpy = jest.spyOn(logger, 'info');
    ```
  - Assert部分に以下を追加：
    ```typescript
    expect(loggerInfoSpy).toHaveBeenCalled();
    loggerInfoSpy.mockRestore();
    ```
- **期待結果**:
  - PhaseRunner実行中に `logger.info` が呼び出される
  - spyが呼び出しを検出し、テストが合格
  - spy後のクリーンアップが正常に実行される
- **検証方法**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/phase-runner.test.ts
  ```
- **成功基準**: 10/10テスト合格

---

### 2.2 Task 5-2: StepExecutor期待値修正（3テスト）

#### UC-91-04: UC-SE-03 execute失敗時のエラーハンドリング

**テストケース名**: `StepExecutor_execute失敗_期待値修正_正常系`

- **目的**: StepExecutorが例外をスローせず `{ success: false, error }` を返すことを検証
- **前提条件**:
  - UC-SE-03テストケースが存在
  - テストが `await expect(...).rejects.toThrow()` を使用している
- **修正内容**:
  - **修正前**:
    ```typescript
    await expect(stepExecutor.executeStep('execute')).rejects.toThrow('Execution failed');
    ```
  - **修正後**:
    ```typescript
    const result = await stepExecutor.executeStep('execute');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Execution failed');
    ```
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'Execution failed' が含まれる
  - 例外がスローされない
- **検証方法**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/step-executor.test.ts
  ```
- **成功基準**: UC-SE-03テストが合格

---

#### UC-91-05: UC-SE-09 review失敗時のエラーハンドリング

**テストケース名**: `StepExecutor_review失敗_期待値修正_正常系`

- **目的**: StepExecutorのreviewステップ失敗時に `{ success: false, error }` を返すことを検証
- **前提条件**:
  - UC-SE-09テストケースが存在
  - テストが `await expect(...).rejects.toThrow()` を使用している
- **修正内容**:
  - **修正前**:
    ```typescript
    await expect(stepExecutor.executeStep('review')).rejects.toThrow('Review cycle failed');
    ```
  - **修正後**:
    ```typescript
    const result = await stepExecutor.executeStep('review');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Review cycle failed');
    ```
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'Review cycle failed' が含まれる
  - 例外がスローされない
- **検証方法**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/step-executor.test.ts
  ```
- **成功基準**: UC-SE-09テストが合格

---

#### UC-91-06: UC-SE-09-2 revise失敗時のエラーハンドリング

**テストケース名**: `StepExecutor_revise失敗_期待値修正_正常系`

- **目的**: StepExecutorのreviseステップ失敗時に `{ success: false, error }` を返すことを検証
- **前提条件**:
  - UC-SE-09-2テストケースが存在
  - テストが `await expect(...).rejects.toThrow()` を使用している
- **修正内容**:
  - **修正前**:
    ```typescript
    await expect(stepExecutor.executeStep('revise')).rejects.toThrow('Revise cycle failed');
    ```
  - **修正後**:
    ```typescript
    const result = await stepExecutor.executeStep('revise');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Revise cycle failed');
    ```
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'Revise cycle failed' が含まれる
  - 例外がスローされない
- **検証方法**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/step-executor.test.ts
  ```
- **成功基準**: UC-SE-09-2テストが合格

---

### 2.3 Task 5-3: Integration公開ラッパー利用（2テスト）

#### UC-91-07: IC-BP-04 cleanupWorkflowArtifacts呼び出し削除

**テストケース名**: `Integration_cleanupWorkflowArtifacts_冗長テスト削除_正常系`

- **目的**: プライベートメソッド直接呼び出しの冗長テストを削除する
- **前提条件**:
  - IC-BP-04テストケースが存在
  - プライベートメソッド `cleanupWorkflowArtifacts` を直接呼び出している
  - ArtifactCleanerのユニットテストで同等のテストがカバー済み
- **修正内容**:
  - **削除対象**:
    ```typescript
    it('IC-BP-04: should cleanup workflow artifacts', async () => {
      await basePhase['cleanupWorkflowArtifacts']('/path/to/workflow', false);
      // assertions...
    });
    ```
  - **理由コメント追加**:
    ```typescript
    // IC-BP-04: cleanupWorkflowArtifacts のテストは削除
    // 理由: ArtifactCleaner のユニットテストで十分にカバー済み
    // 参照: tests/unit/phases/cleanup/artifact-cleaner.test.ts
    ```
- **期待結果**:
  - IC-BP-04テストが削除される
  - 他のIntegrationテストは正常に動作する
  - プロダクションコード（BasePhase）への変更なし
- **検証方法**:
  ```bash
  npm test -- tests/integration/base-phase-refactored.test.ts
  ```
- **成功基準**: 統合テストが正常に実行され、IC-BP-04が存在しない

---

#### UC-91-08: IC-BP-08 cleanupWorkflowArtifacts with force flag削除

**テストケース名**: `Integration_cleanupWorkflowArtifacts_force_flag_冗長テスト削除_正常系`

- **目的**: プライベートメソッド直接呼び出しの冗長テストを削除する
- **前提条件**:
  - IC-BP-08テストケースが存在
  - プライベートメソッド `cleanupWorkflowArtifacts` を force flag付きで直接呼び出している
  - ArtifactCleanerのユニットテストで同等のテストがカバー済み
- **修正内容**:
  - **削除対象**:
    ```typescript
    it('IC-BP-08: should cleanup workflow artifacts with force flag', async () => {
      await basePhase['cleanupWorkflowArtifacts']('/path/to/workflow', true);
      // assertions...
    });
    ```
  - **理由コメント追加**:
    ```typescript
    // IC-BP-08: cleanupWorkflowArtifacts with force flag のテストは削除
    // 理由: ArtifactCleaner のユニットテストで十分にカバー済み
    // 参照: tests/unit/phases/cleanup/artifact-cleaner.test.ts
    ```
- **期待結果**:
  - IC-BP-08テストが削除される
  - 他のIntegrationテストは正常に動作する
  - プロダクションコード（BasePhase）への変更なし
- **検証方法**:
  ```bash
  npm test -- tests/integration/base-phase-refactored.test.ts
  ```
- **成功基準**: 統合テストが正常に実行され、IC-BP-08が存在しない

---

### 2.4 Task 5-4: カバレッジ向上テスト追加

#### 2.4.1 ArtifactCleaner カバレッジ向上（64.4% → 90%）

##### UC-91-09: CI環境判定 - CI環境変数設定時

**テストケース名**: `ArtifactCleaner_isCIEnvironment_CI変数あり_正常系`

- **目的**: CI環境変数が設定されている場合、`isCIEnvironment()` が `true` を返すことを検証
- **前提条件**: `process.env.CI` が未設定
- **入力**: `process.env.CI = 'true'`
- **期待結果**: `isCIEnvironment()` が `true` を返す
- **テストデータ**:
  ```typescript
  process.env.CI = 'true';
  ```
- **検証方法**:
  ```typescript
  it('UC-AC-CI-01: should return true when CI environment variable is set', () => {
    // Arrange
    process.env.CI = 'true';
    const artifactCleaner = new ArtifactCleaner();

    // Act
    const result = artifactCleaner.isCIEnvironment();

    // Assert
    expect(result).toBe(true);

    // Cleanup
    delete process.env.CI;
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-10: CI環境判定 - CI環境変数未設定時

**テストケース名**: `ArtifactCleaner_isCIEnvironment_CI変数なし_正常系`

- **目的**: CI環境変数が未設定の場合、`isCIEnvironment()` が `false` を返すことを検証
- **前提条件**: `process.env.CI` が未設定
- **入力**: なし（環境変数削除）
- **期待結果**: `isCIEnvironment()` が `false` を返す
- **テストデータ**:
  ```typescript
  delete process.env.CI;
  ```
- **検証方法**:
  ```typescript
  it('UC-AC-CI-02: should return false when CI environment variable is not set', () => {
    // Arrange
    delete process.env.CI;
    const artifactCleaner = new ArtifactCleaner();

    // Act
    const result = artifactCleaner.isCIEnvironment();

    // Assert
    expect(result).toBe(false);
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-11: ユーザープロンプト - "yes"入力

**テストケース名**: `ArtifactCleaner_promptUserConfirmation_yes入力_正常系`

- **目的**: ユーザーが "yes" を入力した場合、`promptUserConfirmation()` が `true` を返すことを検証
- **前提条件**: readline mock未設定
- **入力**: ユーザー入力 "yes"
- **期待結果**: `promptUserConfirmation()` が `true` を返す
- **テストデータ**:
  ```typescript
  mockReadline.mockReturnValue({
    question: (query, callback) => callback('yes'),
    close: jest.fn(),
  });
  ```
- **検証方法**:
  ```typescript
  it('UC-AC-PROMPT-01: should return true when user inputs "yes"', async () => {
    // Arrange
    const artifactCleaner = new ArtifactCleaner();
    const mockReadline = jest.spyOn(require('readline'), 'createInterface');
    mockReadline.mockReturnValue({
      question: (query: string, callback: (answer: string) => void) => {
        callback('yes');
      },
      close: jest.fn(),
    });

    // Act
    const result = await artifactCleaner.promptUserConfirmation('Delete?');

    // Assert
    expect(result).toBe(true);

    // Cleanup
    mockReadline.mockRestore();
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-12: ユーザープロンプト - "no"入力

**テストケース名**: `ArtifactCleaner_promptUserConfirmation_no入力_正常系`

- **目的**: ユーザーが "no" を入力した場合、`promptUserConfirmation()` が `false` を返すことを検証
- **前提条件**: readline mock未設定
- **入力**: ユーザー入力 "no"
- **期待結果**: `promptUserConfirmation()` が `false` を返す
- **テストデータ**:
  ```typescript
  mockReadline.mockReturnValue({
    question: (query, callback) => callback('no'),
    close: jest.fn(),
  });
  ```
- **検証方法**: （UC-91-11と同様のパターン、入力を "no" に変更）
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-13: ユーザープロンプト - 無効入力

**テストケース名**: `ArtifactCleaner_promptUserConfirmation_無効入力_異常系`

- **目的**: ユーザーが無効な文字列を入力した場合、`promptUserConfirmation()` が `false` を返すことを検証
- **前提条件**: readline mock未設定
- **入力**: ユーザー入力 "invalid"
- **期待結果**: `promptUserConfirmation()` が `false` を返す
- **テストデータ**:
  ```typescript
  mockReadline.mockReturnValue({
    question: (query, callback) => callback('invalid'),
    close: jest.fn(),
  });
  ```
- **検証方法**: （UC-91-11と同様のパターン、入力を "invalid" に変更）
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-14: ユーザープロンプト - EOF処理

**テストケース名**: `ArtifactCleaner_promptUserConfirmation_EOF_異常系`

- **目的**: EOFが発生した場合、`promptUserConfirmation()` が適切にエラーハンドリングすることを検証
- **前提条件**: readline mock未設定
- **入力**: EOF（callback未呼び出し）
- **期待結果**: エラーがスローされる、または `false` が返される
- **テストデータ**:
  ```typescript
  mockReadline.mockReturnValue({
    question: (query, callback) => {
      // Simulate EOF by not calling callback
    },
    close: jest.fn(),
  });
  ```
- **検証方法**:
  ```typescript
  it('UC-AC-PROMPT-04: should handle EOF gracefully', async () => {
    // Arrange
    const artifactCleaner = new ArtifactCleaner();
    const mockReadline = jest.spyOn(require('readline'), 'createInterface');
    mockReadline.mockReturnValue({
      question: (query: string, callback: (answer: string) => void) => {
        // Simulate EOF by not calling callback
      },
      close: jest.fn(),
    });

    // Act & Assert
    await expect(artifactCleaner.promptUserConfirmation('Delete?')).rejects.toThrow();

    // Cleanup
    mockReadline.mockRestore();
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-15: cleanupWorkflowArtifacts - CI環境自動確認

**テストケース名**: `ArtifactCleaner_cleanupWorkflowArtifacts_CI環境_正常系`

- **目的**: CI環境では自動確認され、プロンプトなしで削除が実行されることを検証
- **前提条件**: `process.env.CI = 'true'`
- **入力**:
  - workflowPath: '/path/to/.ai-workflow/issue-123'
  - force: false
- **期待結果**:
  - プロンプト未表示
  - `removeWorkflowDirectory()` が呼び出される
- **テストデータ**:
  ```typescript
  process.env.CI = 'true';
  const mockRemoveWorkflowDirectory = jest.spyOn(artifactCleaner as any, 'removeWorkflowDirectory').mockResolvedValue(undefined);
  ```
- **検証方法**:
  ```typescript
  it('UC-AC-CLEANUP-01: should auto-confirm in CI environment', async () => {
    // Arrange
    process.env.CI = 'true';
    const artifactCleaner = new ArtifactCleaner();
    const mockRemoveWorkflowDirectory = jest.spyOn(artifactCleaner as any, 'removeWorkflowDirectory').mockResolvedValue(undefined);

    // Act
    await artifactCleaner.cleanupWorkflowArtifacts('/path/to/.ai-workflow/issue-123', false);

    // Assert
    expect(mockRemoveWorkflowDirectory).toHaveBeenCalledWith('/path/to/.ai-workflow/issue-123');

    // Cleanup
    delete process.env.CI;
    mockRemoveWorkflowDirectory.mockRestore();
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-16: cleanupWorkflowArtifacts - 非CI環境プロンプト表示

**テストケース名**: `ArtifactCleaner_cleanupWorkflowArtifacts_非CI環境_正常系`

- **目的**: 非CI環境ではユーザープロンプトが表示され、確認後に削除が実行されることを検証
- **前提条件**: `process.env.CI` が未設定
- **入力**:
  - workflowPath: '/path/to/.ai-workflow/issue-123'
  - force: false
  - ユーザー入力: "yes"
- **期待結果**:
  - `promptUserConfirmation()` が呼び出される
  - `removeWorkflowDirectory()` が呼び出される
- **テストデータ**:
  ```typescript
  delete process.env.CI;
  const mockPromptUserConfirmation = jest.spyOn(artifactCleaner, 'promptUserConfirmation').mockResolvedValue(true);
  const mockRemoveWorkflowDirectory = jest.spyOn(artifactCleaner as any, 'removeWorkflowDirectory').mockResolvedValue(undefined);
  ```
- **検証方法**: （UC-91-15と同様のパターン、プロンプトmockを追加）
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-17: validateWorkflowPath - パストラバーサル検出

**テストケース名**: `ArtifactCleaner_validateWorkflowPath_パストラバーサル_異常系`

- **目的**: パストラバーサル攻撃が検出され、エラーがスローされることを検証
- **前提条件**: ArtifactCleanerインスタンスが存在
- **入力**: workflowPath: '/path/to/../../etc/passwd'
- **期待結果**: 'Invalid workflow path' エラーがスローされる
- **テストデータ**:
  ```typescript
  const invalidPath = '/path/to/../../etc/passwd';
  ```
- **検証方法**:
  ```typescript
  it('UC-AC-VALIDATE-01: should reject path with path traversal', () => {
    // Arrange
    const artifactCleaner = new ArtifactCleaner();

    // Act & Assert
    expect(() => artifactCleaner.validateWorkflowPath('/path/to/../../etc/passwd')).toThrow('Invalid workflow path');
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-18: validateWorkflowPath - 不正パターン検出

**テストケース名**: `ArtifactCleaner_validateWorkflowPath_不正パターン_異常系`

- **目的**: 期待されるパターンに一致しないパスが検出され、エラーがスローされることを検証
- **前提条件**: ArtifactCleanerインスタンスが存在
- **入力**: workflowPath: '/path/to/random-dir'
- **期待結果**: 'Invalid workflow path' エラーがスローされる
- **テストデータ**:
  ```typescript
  const invalidPath = '/path/to/random-dir';
  ```
- **検証方法**: （UC-91-17と同様のパターン、異なる不正パスを使用）
- **成功基準**: テストが合格し、カバレッジが向上

---

#### 2.4.2 PhaseRunner カバレッジ向上（62% → 90%）

##### UC-91-19: 依存関係検証 - 空違反配列

**テストケース名**: `PhaseRunner_validatePhaseDependencies_空違反配列_正常系`

- **目的**: 依存関係検証で違反がない場合（空配列）、正常に処理されることを検証
- **前提条件**: PhaseRunnerインスタンスが存在
- **入力**:
  - violations: []
  - warnings: ['Warning 1']
- **期待結果**:
  - `result.success` が `true`
  - 警告がログに記録される
- **テストデータ**:
  ```typescript
  const mockValidatePhaseDependencies = jest.fn().mockReturnValue({
    violations: [],
    warnings: ['Warning 1']
  });
  ```
- **検証方法**:
  ```typescript
  it('UC-PR-DEP-01: should handle empty violation array', async () => {
    // Arrange
    const mockMetadataManager = createMockMetadataManager();
    mockMetadataManager.getAllPhasesStatus.mockReturnValue([]);
    const phaseRunner = new PhaseRunner(mockMetadataManager, mockGitManager);
    const mockValidatePhaseDependencies = jest.fn().mockReturnValue({ violations: [], warnings: ['Warning 1'] });
    jest.spyOn(require('../../../../src/core/phase-dependencies'), 'validatePhaseDependencies').mockImplementation(mockValidatePhaseDependencies);

    // Act
    const result = await phaseRunner.validateAndStartPhase();

    // Assert
    expect(result.success).toBe(true);
    expect(mockValidatePhaseDependencies).toHaveBeenCalled();
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-20: 依存関係検証 - 空警告配列

**テストケース名**: `PhaseRunner_validatePhaseDependencies_空警告配列_正常系`

- **目的**: 依存関係検証で警告がない場合（空配列）、正常に処理されることを検証
- **前提条件**: PhaseRunnerインスタンスが存在
- **入力**:
  - violations: []
  - warnings: []
- **期待結果**:
  - `result.success` が `true`
  - 警告ログが記録されない
- **テストデータ**:
  ```typescript
  const mockValidatePhaseDependencies = jest.fn().mockReturnValue({
    violations: [],
    warnings: []
  });
  ```
- **検証方法**: （UC-91-19と同様のパターン、warnings: [] に変更）
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-21: エラーハンドリング - Git操作失敗

**テストケース名**: `PhaseRunner_handlePhaseError_Git失敗_異常系`

- **目的**: Git操作失敗時、適切にエラーハンドリングされることを検証
- **前提条件**: PhaseRunnerインスタンスが存在
- **入力**: Git commit失敗エラー
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'Git commit failed' が含まれる
- **テストデータ**:
  ```typescript
  const mockGitManager = createMockGitManager();
  mockGitManager.commitPhaseOutput.mockRejectedValue(new Error('Git commit failed'));
  ```
- **検証方法**:
  ```typescript
  it('UC-PR-ERROR-01: should handle Git operation failure', async () => {
    // Arrange
    const mockGitManager = createMockGitManager();
    mockGitManager.commitPhaseOutput.mockRejectedValue(new Error('Git commit failed'));
    const phaseRunner = new PhaseRunner(mockMetadataManager, mockGitManager);

    // Act
    const result = await phaseRunner.handlePhaseError(new Error('Phase execution failed'));

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Git commit failed');
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-22: エラーハンドリング - GitHub API失敗

**テストケース名**: `PhaseRunner_handlePhaseError_GitHub失敗_異常系`

- **目的**: GitHub API失敗時、適切にエラーハンドリングされることを検証
- **前提条件**: PhaseRunnerインスタンスが存在
- **入力**: GitHub API失敗エラー
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'GitHub API failed' が含まれる
- **テストデータ**:
  ```typescript
  const mockGitHubClient = createMockGitHubClient();
  mockGitHubClient.postProgressComment.mockRejectedValue(new Error('GitHub API failed'));
  ```
- **検証方法**: （UC-91-21と同様のパターン、GitHub API mockを使用）
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-23: 進捗投稿 - NaN issue番号

**テストケース名**: `PhaseRunner_postProgressToGitHub_NaN_異常系`

- **目的**: Issue番号がNaNの場合、適切にエラーがスローされることを検証
- **前提条件**: PhaseRunnerインスタンスが存在
- **入力**:
  - issueNumber: NaN
  - owner: 'owner'
  - repo: 'repo'
- **期待結果**: 'Invalid issue number' エラーがスローされる
- **テストデータ**:
  ```typescript
  const phaseContext = { issueNumber: NaN, owner: 'owner', repo: 'repo' };
  ```
- **検証方法**:
  ```typescript
  it('UC-PR-PROGRESS-01: should handle NaN issue number', async () => {
    // Arrange
    const mockGitHubClient = createMockGitHubClient();
    const phaseRunner = new PhaseRunner(mockMetadataManager, mockGitManager, mockGitHubClient);
    const phaseContext = { issueNumber: NaN, owner: 'owner', repo: 'repo' };

    // Act & Assert
    await expect(phaseRunner.postProgressToGitHub(phaseContext)).rejects.toThrow('Invalid issue number');
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-24: 進捗投稿 - GitHub API失敗の優雅な処理

**テストケース名**: `PhaseRunner_postProgressToGitHub_API失敗_異常系`

- **目的**: GitHub API失敗時、エラーをログに記録し、例外をスローしないことを検証
- **前提条件**: PhaseRunnerインスタンスが存在
- **入力**:
  - issueNumber: 123
  - owner: 'owner'
  - repo: 'repo'
  - GitHub API失敗
- **期待結果**:
  - エラーがログに記録される
  - 例外がスローされない
- **テストデータ**:
  ```typescript
  const mockGitHubClient = createMockGitHubClient();
  mockGitHubClient.postProgressComment.mockRejectedValue(new Error('GitHub API failed'));
  const phaseContext = { issueNumber: 123, owner: 'owner', repo: 'repo' };
  ```
- **検証方法**: （UC-91-23と同様のパターン、例外なし確認）
- **成功基準**: テストが合格し、カバレッジが向上

---

#### 2.4.3 ContextBuilder カバレッジ向上（80.48% → 90%）

##### UC-91-25: パス解決 - シンボリックリンク検出

**テストケース名**: `ContextBuilder_buildFileReference_シンボリックリンク_異常系`

- **目的**: シンボリックリンクが検出された場合、エラーがスローされることを検証
- **前提条件**: ContextBuilderインスタンスが存在
- **入力**: シンボリックリンクパス
- **期待結果**: 'Symbolic link detected' エラーがスローされる
- **テストデータ**:
  ```typescript
  const mockFsLstatSync = jest.spyOn(require('fs'), 'lstatSync');
  mockFsLstatSync.mockReturnValue({ isSymbolicLink: () => true });
  ```
- **検証方法**:
  ```typescript
  it('UC-CB-PATH-01: should handle symbolic link paths', () => {
    // Arrange
    const contextBuilder = new ContextBuilder();
    const mockFsLstatSync = jest.spyOn(require('fs'), 'lstatSync');
    mockFsLstatSync.mockReturnValue({ isSymbolicLink: () => true });

    // Act & Assert
    expect(() => contextBuilder.buildFileReference('/path/to/symlink')).toThrow('Symbolic link detected');

    // Cleanup
    mockFsLstatSync.mockRestore();
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-26: パス解決 - 存在しないIssue番号

**テストケース名**: `ContextBuilder_buildPlanningDocumentReference_存在しないIssue_異常系`

- **目的**: 存在しないIssue番号の場合、適切なエラーメッセージが返されることを検証
- **前提条件**: ContextBuilderインスタンスが存在
- **入力**: issueNumber: 99999（存在しない）
- **期待結果**: 'Planning document not found for issue 99999' が含まれる
- **テストデータ**:
  ```typescript
  const nonExistentIssueNumber = 99999;
  ```
- **検証方法**:
  ```typescript
  it('UC-CB-PATH-02: should handle non-existent issue number', () => {
    // Arrange
    const contextBuilder = new ContextBuilder();

    // Act
    const result = contextBuilder.buildPlanningDocumentReference(99999);

    // Assert
    expect(result).toContain('Planning document not found for issue 99999');
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

#### 2.4.4 StepExecutor カバレッジ向上（87.67% → 90%）

##### UC-91-27: エラーハンドリング - revise cycle失敗

**テストケース名**: `StepExecutor_executeStep_revise失敗_異常系`

- **目的**: revise cycle失敗時、適切にエラーハンドリングされることを検証
- **前提条件**: StepExecutorインスタンスが存在
- **入力**: revise cycle失敗エラー
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'Revise failed' が含まれる
- **テストデータ**:
  ```typescript
  const mockReviewCycleManager = createMockReviewCycleManager();
  mockReviewCycleManager.runReviseCycle.mockRejectedValue(new Error('Revise failed'));
  ```
- **検証方法**:
  ```typescript
  it('UC-SE-ERROR-01: should handle revise cycle failure', async () => {
    // Arrange
    const mockReviewCycleManager = createMockReviewCycleManager();
    mockReviewCycleManager.runReviseCycle.mockRejectedValue(new Error('Revise failed'));
    const stepExecutor = new StepExecutor(
      mockAgentExecutor,
      mockMetadataManager,
      mockGitManager,
      mockReviewCycleManager
    );

    // Act
    const result = await stepExecutor.executeStep('revise');

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Revise failed');
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

##### UC-91-28: エラーハンドリング - 予期せぬ例外

**テストケース名**: `StepExecutor_executeStep_予期せぬ例外_異常系`

- **目的**: 予期せぬ例外が発生した場合、適切にエラーハンドリングされることを検証
- **前提条件**: StepExecutorインスタンスが存在
- **入力**: 予期せぬエラー
- **期待結果**:
  - `result.success` が `false`
  - `result.error` に 'Unexpected error' が含まれる
- **テストデータ**:
  ```typescript
  const mockAgentExecutor = createMockAgentExecutor();
  mockAgentExecutor.execute.mockRejectedValue(new Error('Unexpected error'));
  ```
- **検証方法**:
  ```typescript
  it('UC-SE-ERROR-02: should handle unexpected exception', async () => {
    // Arrange
    const mockAgentExecutor = createMockAgentExecutor();
    mockAgentExecutor.execute.mockRejectedValue(new Error('Unexpected error'));
    const stepExecutor = new StepExecutor(
      mockAgentExecutor,
      mockMetadataManager,
      mockGitManager
    );

    // Act
    const result = await stepExecutor.executeStep('execute');

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unexpected error');
  });
  ```
- **成功基準**: テストが合格し、カバレッジが向上

---

### 2.5 Task 6-1: ユニットテスト実行・検証

#### UC-91-29: 修正テスト再実行

**テストケース名**: `Task6-1_ユニットテスト再実行_正常系`

- **目的**: 修正後のテストが100%合格することを検証
- **前提条件**:
  - Task 5-1, 5-2, 5-3, 5-4がすべて完了
  - テストコードが修正済み
- **実行コマンド**:
  ```bash
  npm test -- tests/unit/phases/lifecycle/ tests/integration/base-phase-refactored.test.ts
  ```
- **期待結果**:
  - **49/49テスト合格**（100%合格率）
  - **0テスト失敗**
  - **0テストスキップ**
- **検証方法**: テスト実行結果の出力を確認
- **失敗時の対応**: Phase 5（テストコード実装）へ戻り、失敗したテストを修正
- **成功基準**: 49/49テスト合格

---

### 2.6 Task 6-2: カバレッジレポート生成・検証

#### UC-91-30: カバレッジ測定

**テストケース名**: `Task6-2_カバレッジ測定_正常系`

- **目的**: 各モジュールのカバレッジが90%以上であることを検証
- **前提条件**:
  - Task 6-1完了（49/49テスト合格）
  - カバレッジ向上テストが追加済み
- **実行コマンド**:
  ```bash
  npm run test:coverage
  ```
- **期待結果**:

| モジュール | 修正前カバレッジ | 修正後カバレッジ（目標） |
|-----------|----------------|---------------------|
| ArtifactCleaner | 64.4% | **90%以上** |
| PhaseRunner | 62% | **90%以上** |
| ContextBuilder | 80.48% | **90%以上** |
| StepExecutor | 87.67% | **90%以上** |

- **検証方法**:
  ```bash
  # カバレッジレポート生成後、ブラウザで確認
  open coverage/lcov-report/index.html
  ```
- **失敗時の対応**: Phase 5（テストコード実装）へ戻り、未カバーブランチに対するテストケースを追加
- **成功基準**: 各モジュールのカバレッジが90%以上

---

### 2.7 Task 6-3: パフォーマンスベンチマーク実行

#### UC-91-31: ベースライン測定（Issue #49前）

**テストケース名**: `Task6-3_ベースライン測定_正常系`

- **目的**: Issue #49前のコードでPlanningPhase実行時間を測定
- **前提条件**: Issue #49前のコミットにチェックアウト済み
- **実行コマンド**:
  ```bash
  # Issue #49前のコミットにチェックアウト
  git checkout <commit-before-issue-49>

  # Planning Phase実行時間測定（3回測定）
  time node dist/index.js execute --issue <TEST_ISSUE> --phase planning
  time node dist/index.js execute --issue <TEST_ISSUE> --phase planning
  time node dist/index.js execute --issue <TEST_ISSUE> --phase planning
  ```
- **期待結果**:
  - 3回の測定結果が記録される
  - 平均実行時間が算出される（例: 120秒）
- **テストデータ**:
  - 実行時間1: 121秒
  - 実行時間2: 119秒
  - 実行時間3: 120秒
  - **平均実行時間**: 120秒
- **成功基準**: 平均実行時間が記録される

---

#### UC-91-32: 比較測定（Issue #49後）

**テストケース名**: `Task6-3_比較測定_正常系`

- **目的**: Issue #49後のコードでPlanningPhase実行時間を測定
- **前提条件**: Issue #49後のコミットにチェックアウト済み
- **実行コマンド**:
  ```bash
  # Issue #49後のコミットにチェックアウト
  git checkout <commit-after-issue-49>

  # Planning Phase実行時間測定（3回測定）
  time node dist/index.js execute --issue <TEST_ISSUE> --phase planning
  time node dist/index.js execute --issue <TEST_ISSUE> --phase planning
  time node dist/index.js execute --issue <TEST_ISSUE> --phase planning
  ```
- **期待結果**:
  - 3回の測定結果が記録される
  - 平均実行時間が算出される（例: 118秒）
- **テストデータ**:
  - 実行時間1: 119秒
  - 実行時間2: 117秒
  - 実行時間3: 118秒
  - **平均実行時間**: 118秒
- **成功基準**: 平均実行時間が記録される

---

#### UC-91-33: 閾値検証（±5%）

**テストケース名**: `Task6-3_閾値検証_正常系`

- **目的**: 実行時間差が±5%以内であることを検証（AC-8）
- **前提条件**:
  - UC-91-31完了（ベースライン測定）
  - UC-91-32完了（比較測定）
- **計算式**:
  ```
  実行時間差 = (比較測定 - ベースライン) / ベースライン * 100
  例: (118 - 120) / 120 * 100 = -1.67%
  ```
- **期待結果**:
  - 実行時間差が **-5% ≤ 実行時間差 ≤ +5%** の範囲内
  - AC-8達成
- **テストデータ**:
  - ベースライン: 120秒
  - 比較測定: 118秒
  - 実行時間差: -1.67%
- **検証方法**:
  ```markdown
  ### 結果分析
  - 実行時間差: -1.67%（120秒 → 118秒、2秒短縮）
  - **閾値検証**: ✅ PASS（-5% ≤ -1.67% ≤ +5%）
  - **AC-8達成**: ✅ YES
  ```
- **失敗時の対応**:
  - 実行時間差が±5%を超える場合、原因分析を実施
  - ネットワーク遅延、ディスクI/O、実行環境の差異を確認
  - 必要に応じてIssue #49の設計をレビュー
- **成功基準**: 実行時間差が±5%以内

---

## 3. テストデータ

### 3.1 Mock関数のテストデータ

#### MetadataManager Mock
```typescript
const mockMetadataManager = {
  getAllPhasesStatus: jest.fn().mockReturnValue([]),
  getPhaseStatus: jest.fn().mockReturnValue({ status: 'completed' }),
  updatePhaseStatus: jest.fn().mockResolvedValue(undefined),
  // 他のmockメソッド...
};
```

#### GitManager Mock
```typescript
const mockGitManager = {
  commitPhaseOutput: jest.fn().mockResolvedValue(undefined),
  pushChanges: jest.fn().mockResolvedValue(undefined),
  // 他のmockメソッド...
};
```

#### GitHubClient Mock
```typescript
const mockGitHubClient = {
  postProgressComment: jest.fn().mockResolvedValue(undefined),
  updateIssue: jest.fn().mockResolvedValue(undefined),
  // 他のmockメソッド...
};
```

#### ReviewCycleManager Mock
```typescript
const mockReviewCycleManager = {
  runReviewCycle: jest.fn().mockResolvedValue({ success: true }),
  runReviseCycle: jest.fn().mockResolvedValue({ success: true }),
  // 他のmockメソッド...
};
```

### 3.2 環境変数テストデータ

#### CI環境変数
```typescript
// CI環境
process.env.CI = 'true';

// 非CI環境
delete process.env.CI;
```

### 3.3 パストラバーサルテストデータ

#### 不正パスパターン
```typescript
const invalidPaths = [
  '/path/to/../../etc/passwd',
  '/path/to/../../../root/.ssh',
  '/path/to/random-dir',
  '/etc/passwd',
];
```

#### 正常パスパターン
```typescript
const validPaths = [
  '/path/to/.ai-workflow/issue-123',
  '/home/user/project/.ai-workflow/issue-456',
];
```

### 3.4 パフォーマンステストデータ

#### ベースライン測定結果
```markdown
### ベースライン測定（Issue #49前）
- 実行時間1: 121秒
- 実行時間2: 119秒
- 実行時間3: 120秒
- **平均実行時間**: 120秒
```

#### 比較測定結果
```markdown
### 比較測定（Issue #49後）
- 実行時間1: 119秒
- 実行時間2: 117秒
- 実行時間3: 118秒
- **平均実行時間**: 118秒
```

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

- **ローカル開発環境**: macOS/Linux/Windows + Node.js 20以上
- **CI/CD環境**: GitHub Actions（自動テスト実行）

### 4.2 必要な外部サービス

- **GitHub API**: 進捗投稿テスト用（mockで代替可能）
- **Git**: バージョン管理、コミット・プッシュテスト用

### 4.3 必要なデータベース

なし（本Issueではデータベース不要）

### 4.4 モック/スタブの必要性

#### 必須モック
- MetadataManager: フェーズステータス管理
- GitManager: Git操作
- GitHubClient: GitHub API操作
- ReviewCycleManager: レビューサイクル管理
- AgentExecutor: エージェント実行

#### 必須スタブ
- logger: ロギング操作
- readline: ユーザープロンプト（ArtifactCleaner）
- fs.lstatSync: ファイルシステム操作（ContextBuilder）

### 4.5 テスト実行前の準備

1. **依存関係インストール**:
   ```bash
   npm install
   ```

2. **TypeScriptビルド**:
   ```bash
   npm run build
   ```

3. **既存テスト確認**（修正前のベースライン）:
   ```bash
   npm test
   npm run test:coverage
   ```

---

## 5. 品質ゲート（Phase 3）

本テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_ONLY
  - すべてのテストシナリオがユニットテストレベル
  - Integration/BDDシナリオは不要（既存統合テストは修正するが、新規作成なし）

- [x] **主要な正常系がカバーされている**
  - PhaseRunner mock修正（UC-91-01 ~ UC-91-03）
  - StepExecutor期待値修正（UC-91-04 ~ UC-91-06）
  - Integration冗長テスト削除（UC-91-07 ~ UC-91-08）
  - カバレッジ向上テスト追加（UC-91-09 ~ UC-91-28）
  - ユニットテスト実行・検証（UC-91-29）
  - カバレッジレポート生成・検証（UC-91-30）
  - パフォーマンスベンチマーク実行（UC-91-31 ~ UC-91-33）

- [x] **主要な異常系がカバーされている**
  - StepExecutor例外処理（UC-91-04 ~ UC-91-06）
  - ArtifactCleanerユーザープロンプト無効入力（UC-91-13）
  - ArtifactCleanerユーザープロンプトEOF処理（UC-91-14）
  - ArtifactCleanerパストラバーサル検出（UC-91-17）
  - ArtifactCleaner不正パターン検出（UC-91-18）
  - PhaseRunner Git操作失敗（UC-91-21）
  - PhaseRunner GitHub API失敗（UC-91-22）
  - PhaseRunner NaN issue番号（UC-91-23）
  - ContextBuilderシンボリックリンク検出（UC-91-25）
  - ContextBuilder存在しないIssue番号（UC-91-26）
  - StepExecutor revise cycle失敗（UC-91-27）
  - StepExecutor予期せぬ例外（UC-91-28）

- [x] **期待結果が明確である**
  - 各テストシナリオに具体的な期待結果を記載
  - 検証方法（実行コマンド、コードスニペット）を明記
  - 成功基準を明確に定義
  - 失敗時の対応を記載（該当する場合）

---

## 6. テストシナリオサマリー

### 6.1 テストシナリオ数

| カテゴリ | テストシナリオ数 |
|---------|---------------|
| PhaseRunner mock修正 | 3 |
| StepExecutor期待値修正 | 3 |
| Integration冗長テスト削除 | 2 |
| ArtifactCleaner カバレッジ向上 | 10 |
| PhaseRunner カバレッジ向上 | 6 |
| ContextBuilder カバレッジ向上 | 2 |
| StepExecutor カバレッジ向上 | 2 |
| ユニットテスト実行・検証 | 1 |
| カバレッジレポート生成・検証 | 1 |
| パフォーマンスベンチマーク実行 | 3 |
| **合計** | **33** |

### 6.2 カバレッジ向上の期待値

| モジュール | 修正前 | 修正後（目標） | 追加テストケース数 |
|-----------|-------|---------------|------------------|
| ArtifactCleaner | 64.4% | 90%以上 | 10 |
| PhaseRunner | 62% | 90%以上 | 6 |
| ContextBuilder | 80.48% | 90%以上 | 2 |
| StepExecutor | 87.67% | 90%以上 | 2 |

### 6.3 受け入れ基準との対応

| 受け入れ基準 | 対応テストシナリオ | ステータス |
|------------|------------------|----------|
| AC-FR1: PhaseRunner テスト失敗修正 | UC-91-01 ~ UC-91-03 | ✅ カバー済み |
| AC-FR2: StepExecutor テスト失敗修正 | UC-91-04 ~ UC-91-06 | ✅ カバー済み |
| AC-FR3: Integration テスト失敗修正 | UC-91-07 ~ UC-91-08 | ✅ カバー済み |
| AC-FR4: カバレッジ向上 | UC-91-09 ~ UC-91-28 | ✅ カバー済み |
| AC-FR5: パフォーマンスベンチマーク実行 | UC-91-31 ~ UC-91-33 | ✅ カバー済み |
| AC-ALL: 全体受け入れ基準 | UC-91-29 ~ UC-91-30 | ✅ カバー済み |

---

## 7. 承認

本テストシナリオは、Phase 3（Test Scenario）の品質ゲートを満たしています。

- [x] **Phase 2の戦略に沿ったテストシナリオである**（UNIT_ONLY準拠）
- [x] **主要な正常系がカバーされている**（33シナリオ中23シナリオが正常系）
- [x] **主要な異常系がカバーされている**（33シナリオ中10シナリオが異常系）
- [x] **期待結果が明確である**（すべてのシナリオに期待結果・検証方法・成功基準を記載）

次フェーズ（Phase 5: Test Implementation）への移行可能です。

**注意**: Phase 4（Implementation）はスキップ（プロダクションコード変更なし）

---

**作成者**: AI Workflow Orchestrator v0.3.1
**作成日**: 2025-01-30
**次フェーズ**: Phase 5 (Test Implementation)
