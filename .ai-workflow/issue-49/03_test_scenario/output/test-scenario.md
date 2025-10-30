# テストシナリオ - Issue #49: base-phase.ts のモジュール分解リファクタリング

## 0. Planning Document・要件定義書・設計書の確認

### Planning Document の確認結果

Planning Document（`.ai-workflow/issue-49/00_planning/output/planning.md`）において、以下のテスト戦略が策定されています：

- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **テストカバレッジ目標**: 90%以上
- **テスト成功率**: 100%（既存テスト含む）

### 要件定義書の確認結果

要件定義書（`.ai-workflow/issue-49/01_requirements/output/requirements.md`）において、以下の受け入れ基準が定義されています：

**機能要件**:
- FR-1: StepExecutor モジュールの作成
- FR-2: PhaseRunner モジュールの作成
- FR-3: ContextBuilder モジュールの作成
- FR-4: ArtifactCleaner モジュールの作成
- FR-5: BasePhase のモジュール統合

**非機能要件**:
- NFR-1~9: パフォーマンス、セキュリティ、保守性要件

**受け入れ基準**: AC-1 〜 AC-13（13個の受け入れ基準）

### 設計書の確認結果

設計書（`.ai-workflow/issue-49/02_design/output/design.md`）において、以下が定義されています：

- **実装戦略**: REFACTOR（リファクタリング）
- **テスト戦略**: UNIT_INTEGRATION
- **4つの新規モジュール**: StepExecutor、PhaseRunner、ContextBuilder、ArtifactCleaner
- **後方互換性**: 100%維持（public メソッドのシグネチャは不変）

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**（ユニットテスト + インテグレーションテスト）

### 1.2 テスト対象の範囲

#### ユニットテスト対象
- **StepExecutor**: ステップ実行ロジック（execute/review/revise、Git コミット＆プッシュ）
- **PhaseRunner**: フェーズライフサイクル管理（run、依存関係検証、エラーハンドリング）
- **ContextBuilder**: コンテキスト構築（ファイル参照、@filepath 生成）
- **ArtifactCleaner**: クリーンアップロジック（ログ削除、アーティファクト削除、確認プロンプト）

#### インテグレーションテスト対象
- **BasePhase 全体**: execute → review → revise のライフサイクル
- **Git 統合**: ステップ単位のコミット＾プッシュ（Issue #10）
- **GitHub 統合**: 進捗コメント投稿
- **全10フェーズ**: 既存機能のリグレッション防止
- **エラーリカバリ**: 途中失敗時のレジューム動作

### 1.3 テストの目的

1. **後方互換性の保証**: BasePhase の public メソッドのシグネチャが不変であることを検証
2. **機能保全**: リファクタリング前後で外部から見た振る舞いが同一であることを検証
3. **モジュール分離の検証**: 各モジュールが単一責任の原則に準拠していることを検証
4. **エラーハンドリングの検証**: 各モジュールが適切に例外処理を実装していることを検証
5. **リグレッション防止**: 全10フェーズの既存機能が正常動作することを検証

---

## 2. ユニットテストシナリオ

### 2.1 StepExecutor モジュール

#### テストファイル: `tests/unit/phases/lifecycle/step-executor.test.ts`（約150行）

---

#### UC-SE-01: executeStep() - 正常系

**目的**: execute ステップが正常に実行され、completed_steps に 'execute' が追加されることを検証

**前提条件**:
- StepExecutor インスタンスが生成されている
- completed_steps に 'execute' が含まれていない
- BasePhase.execute() がモック化されている（成功を返す）
- GitManager がモック化されている

**入力**:
- gitManager: GitManager モック（コミット＆プッシュ成功）

**期待結果**:
- BasePhase.execute() が1回呼び出される
- GitManager.commit() が1回呼び出される（メッセージ: `[ai-workflow] Phase {number} ({name}) - execute completed`）
- GitManager.push() が1回呼び出される
- metadata.addCompletedStep('execute') が1回呼び出される
- metadata.setCurrentStep('execute') が1回呼び出される（実行中）
- metadata.setCurrentStep(null) が1回呼び出される（完了後）
- PhaseExecutionResult の success が true

**テストデータ**:
```typescript
const mockExecuteResult: PhaseExecutionResult = {
  success: true,
  message: 'Execute completed successfully'
};
```

---

#### UC-SE-02: executeStep() - 既に execute が完了している場合（スキップ）

**目的**: completed_steps に 'execute' が含まれている場合、実行をスキップすることを検証

**前提条件**:
- completed_steps に 'execute' が既に含まれている

**入力**:
- gitManager: GitManager モック

**期待結果**:
- BasePhase.execute() が呼び出されない
- Git コミット＆プッシュが実行されない
- PhaseExecutionResult の success が true（スキップ成功）

**テストデータ**:
```typescript
metadata.data.completed_steps = ['execute'];
```

---

#### UC-SE-03: executeStep() - execute 失敗時のエラーハンドリング

**目的**: BasePhase.execute() が失敗した場合、エラーが適切に処理されることを検証

**前提条件**:
- BasePhase.execute() がモック化されている（失敗を返す）

**入力**:
- gitManager: GitManager モック

**期待結果**:
- BasePhase.execute() が1回呼び出される
- Git コミット＆プッシュが実行されない
- PhaseExecutionResult の success が false
- PhaseExecutionResult の error にエラーメッセージが含まれる

**テストデータ**:
```typescript
const mockExecuteResult: PhaseExecutionResult = {
  success: false,
  error: 'Execute failed: some error'
};
```

---

#### UC-SE-04: reviewStep() - 正常系（レビュー実行）

**目的**: review ステップが正常に実行され、completed_steps に 'review' が追加されることを検証

**前提条件**:
- skipReview が false
- completed_steps に 'review' が含まれていない
- BasePhase.review() がモック化されている（成功を返す）

**入力**:
- gitManager: GitManager モック
- skipReview: false

**期待結果**:
- BasePhase.review() が1回呼び出される
- Git コミット＾プッシュが実行される
- metadata.addCompletedStep('review') が1回呼び出される
- PhaseExecutionResult の success が true

**テストデータ**:
```typescript
const mockReviewResult: PhaseExecutionResult = {
  success: true,
  approved: true
};
```

---

#### UC-SE-05: reviewStep() - skipReview が true の場合（スキップ）

**目的**: skipReview が true の場合、レビューをスキップすることを検証

**前提条件**:
- skipReview が true

**入力**:
- gitManager: GitManager モック
- skipReview: true

**期待結果**:
- BasePhase.review() が呼び出されない
- Git コミット＆プッシュが実行されない
- PhaseExecutionResult の success が true（スキップ成功）

**テストデータ**:
```typescript
skipReview = true;
```

---

#### UC-SE-06: reviewStep() - レビュー失敗時（revise が必要）

**目的**: review が失敗した場合、revise が必要であることを示す結果を返すことを検証

**前提条件**:
- BasePhase.review() がモック化されている（失敗を返す）

**入力**:
- gitManager: GitManager モック
- skipReview: false

**期待結果**:
- BasePhase.review() が1回呼び出される
- PhaseExecutionResult の success が false
- PhaseExecutionResult の approved が false
- PhaseExecutionResult の feedback にフィードバックが含まれる

**テストデータ**:
```typescript
const mockReviewResult: PhaseExecutionResult = {
  success: false,
  approved: false,
  feedback: 'Needs revision: XYZ issue found'
};
```

---

#### UC-SE-07: reviseStep() - ReviewCycleManager への委譲

**目的**: revise ステップが ReviewCycleManager に正しく委譲されることを検証

**前提条件**:
- ReviewCycleManager.performReviseStepWithRetry() がモック化されている

**入力**:
- gitManager: GitManager モック
- initialReviewResult: PhaseExecutionResult（レビュー失敗）
- reviewFn: () => Promise<PhaseExecutionResult>
- reviseFn: (feedback: string) => Promise<PhaseExecutionResult>
- postProgressFn: (status, details?) => Promise<void>

**期待結果**:
- ReviewCycleManager.performReviseStepWithRetry() が1回呼び出される
- 引数が正しく渡される

**テストデータ**:
```typescript
const initialReviewResult = {
  success: false,
  approved: false,
  feedback: 'Needs revision'
};
```

---

#### UC-SE-08: commitAndPushStep() - Git コミット＆プッシュ成功

**目的**: Git コミット＆プッシュが正しく実行されることを検証

**前提条件**:
- GitManager がモック化されている（成功を返す）

**入力**:
- gitManager: GitManager モック
- step: 'execute'

**期待結果**:
- GitManager.commit() が1回呼び出される
- コミットメッセージが `[ai-workflow] Phase {number} ({name}) - execute completed` の形式
- GitManager.push() が1回呼び出される

**テストデータ**:
```typescript
const phaseNumber = 1;
const phaseName = 'Planning';
const expectedMessage = '[ai-workflow] Phase 1 (Planning) - execute completed';
```

---

#### UC-SE-09: commitAndPushStep() - Git コミット失敗時のエラーハンドリング

**目的**: Git コミットが失敗した場合、例外がスローされることを検証

**前提条件**:
- GitManager.commit() がモック化されている（失敗を返す）

**入力**:
- gitManager: GitManager モック
- step: 'execute'

**期待結果**:
- GitManager.commit() が1回呼び出される
- 例外がスローされる
- GitManager.push() が呼び出されない

**テストデータ**:
```typescript
GitManager.commit.mockRejectedValue(new Error('Commit failed'));
```

---

### 2.2 PhaseRunner モジュール

#### テストファイル: `tests/unit/phases/lifecycle/phase-runner.test.ts`（約180行）

---

#### UC-PR-01: run() - 正常系（全ステップ成功）

**目的**: フェーズ全体が正常に実行され、ステータスが completed に更新されることを検証

**前提条件**:
- 依存関係検証が成功
- StepExecutor の各ステップがモック化されている（成功を返す）

**入力**:
- options: PhaseRunOptions（skipReview: false, ignoreDependencies: false）

**期待結果**:
- validateDependencies() が1回呼び出される
- metadata.updatePhaseStatus('in_progress') が1回呼び出される
- postProgress() が2回呼び出される（開始時、完了時）
- stepExecutor.executeStep() が1回呼び出される
- stepExecutor.reviewStep() が1回呼び出される
- metadata.updatePhaseStatus('completed') が1回呼び出される
- 戻り値が true

**テストデータ**:
```typescript
const options: PhaseRunOptions = {
  skipReview: false,
  ignoreDependencies: false
};
```

---

#### UC-PR-02: run() - レビュー失敗時に revise 実行

**目的**: レビューが失敗した場合、revise ステップが実行されることを検証

**前提条件**:
- stepExecutor.reviewStep() がモック化されている（失敗を返す）
- stepExecutor.reviseStep() がモック化されている（成功を返す）

**入力**:
- options: PhaseRunOptions（skipReview: false）

**期待結果**:
- stepExecutor.executeStep() が1回呼び出される
- stepExecutor.reviewStep() が1回呼び出される
- stepExecutor.reviseStep() が1回呼び出される
- metadata.updatePhaseStatus('completed') が1回呼び出される
- 戻り値が true

**テストデータ**:
```typescript
const mockReviewResult: PhaseExecutionResult = {
  success: false,
  approved: false,
  feedback: 'Needs revision'
};
```

---

#### UC-PR-03: validateDependencies() - 依存関係違反時のエラー

**目的**: 依存関係が満たされていない場合、エラーログを出力して false を返すことを検証

**前提条件**:
- validatePhaseDependencies() がモック化されている（violations あり）

**入力**:
- options: PhaseRunOptions（ignoreDependencies: false）

**期待結果**:
- logger.error() が呼び出される（依存関係違反メッセージ）
- handleFailure() が1回呼び出される
- 戻り値が false

**テストデータ**:
```typescript
const validationResult: DependencyValidationResult = {
  valid: false,
  violations: ['Requirements phase is not completed'],
  warnings: []
};
```

---

#### UC-PR-04: validateDependencies() - 警告がある場合（継続）

**目的**: 依存関係に警告がある場合、警告ログを出力して継続することを検証

**前提条件**:
- validatePhaseDependencies() がモック化されている（warnings あり）

**入力**:
- options: PhaseRunOptions

**期待結果**:
- logger.warn() が呼び出される（警告メッセージ）
- run() が継続される
- DependencyValidationResult の valid が true

**テストデータ**:
```typescript
const validationResult: DependencyValidationResult = {
  valid: true,
  violations: [],
  warnings: ['Planning phase output may be incomplete']
};
```

---

#### UC-PR-05: validateDependencies() - skipDependencyCheck フラグ

**目的**: skipDependencyCheck が true の場合、検証をスキップすることを検証

**前提条件**:
- options.skipDependencyCheck が true

**入力**:
- options: PhaseRunOptions（skipDependencyCheck: true）

**期待結果**:
- validatePhaseDependencies() が呼び出されない
- logger.info() が呼び出される（スキップメッセージ）
- DependencyValidationResult の valid が true

**テストデータ**:
```typescript
const options: PhaseRunOptions = {
  skipDependencyCheck: true
};
```

---

#### UC-PR-06: handleFailure() - フェーズ失敗時の処理

**目的**: フェーズ失敗時にステータスが failed に更新され、GitHub Issue にコメント投稿されることを検証

**前提条件**:
- GitHubClient がモック化されている

**入力**:
- reason: 'Execute step failed: some error'

**期待結果**:
- metadata.updatePhaseStatus('failed') が1回呼び出される
- postProgress() が1回呼び出される（失敗メッセージ）

**テストデータ**:
```typescript
const reason = 'Execute step failed: some error';
```

---

#### UC-PR-07: postProgress() - GitHub Issue への進捗投稿

**目的**: 進捗状況が GitHub Issue に正しく投稿されることを検証

**前提条件**:
- GitHubClient がモック化されている
- ProgressFormatter がモック化されている

**入力**:
- status: 'in_progress'
- details: undefined

**期待結果**:
- progressFormatter.format() が1回呼び出される
- github.postComment() が1回呼び出される
- コメント内容が ProgressFormatter の出力に一致

**テストデータ**:
```typescript
const status: PhaseStatus = 'in_progress';
const formattedProgress = '## Phase 1: Planning\nStatus: In Progress';
```

---

### 2.3 ContextBuilder モジュール

#### テストファイル: `tests/unit/phases/context/context-builder.test.ts`（約120行）

---

#### UC-CB-01: buildOptionalContext() - ファイル存在時（@filepath 参照）

**目的**: ファイルが存在する場合、@filepath 参照が返されることを検証

**前提条件**:
- ファイルが存在する（fs.existsSync が true を返す）
- getAgentFileReference() がモック化されている（@filepath 参照を返す）

**入力**:
- phaseName: 'Requirements'
- filename: 'requirements.md'
- fallbackMessage: 'Requirements document not found'

**期待結果**:
- fs.existsSync() が1回呼び出される
- getAgentFileReference() が1回呼び出される
- 戻り値が '@.ai-workflow/issue-1/01_requirements/output/requirements.md'

**テストデータ**:
```typescript
const filePath = '/path/to/.ai-workflow/issue-1/01_requirements/output/requirements.md';
const expectedReference = '@.ai-workflow/issue-1/01_requirements/output/requirements.md';
```

---

#### UC-CB-02: buildOptionalContext() - ファイル不在時（フォールバック）

**目的**: ファイルが存在しない場合、フォールバックメッセージが返されることを検証

**前提条件**:
- ファイルが存在しない（fs.existsSync が false を返す）

**入力**:
- phaseName: 'Requirements'
- filename: 'requirements.md'
- fallbackMessage: 'Requirements document not found'

**期待結果**:
- fs.existsSync() が1回呼び出される
- getAgentFileReference() が呼び出されない
- 戻り値が 'Requirements document not found'

**テストデータ**:
```typescript
const fallbackMessage = 'Requirements document not found';
```

---

#### UC-CB-03: getAgentFileReference() - 正常系（相対パス解決）

**目的**: 絶対パスから @filepath 形式の相対パス参照が生成されることを検証

**前提条件**:
- workingDir が '/path/to/repo' に設定されている
- filePath が '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md'

**入力**:
- filePath: '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md'

**期待結果**:
- path.relative() が呼び出される
- 戻り値が '@.ai-workflow/issue-1/01_requirements/output/requirements.md'
- パス区切り文字が '/' に正規化される

**テストデータ**:
```typescript
const filePath = '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md';
const workingDir = '/path/to/repo';
const expectedReference = '@.ai-workflow/issue-1/01_requirements/output/requirements.md';
```

---

#### UC-CB-04: getAgentFileReference() - 相対パス解決失敗（'..' で始まる）

**目的**: 相対パスが '..' で始まる場合、null を返すことを検証

**前提条件**:
- filePath が workingDir の外部にある

**入力**:
- filePath: '/path/to/outside/.ai-workflow/issue-1/01_requirements/output/requirements.md'
- workingDir: '/path/to/repo'

**期待結果**:
- path.relative() が呼び出される
- 相対パスが '../outside/.ai-workflow/...' になる
- 戻り値が null

**テストデータ**:
```typescript
const filePath = '/path/to/outside/.ai-workflow/issue-1/01_requirements/output/requirements.md';
const workingDir = '/path/to/repo';
```

---

#### UC-CB-05: getPlanningDocumentReference() - Planning Phase 参照

**目的**: Planning Phase の output/planning.md を正しく参照できることを検証

**前提条件**:
- Planning Phase の output/planning.md が存在する

**入力**:
- issueNumber: 1

**期待結果**:
- buildOptionalContext('Planning', 'planning.md', ..., 1) が呼び出される
- 戻り値が '@.ai-workflow/issue-1/00_planning/output/planning.md'

**テストデータ**:
```typescript
const issueNumber = 1;
const expectedReference = '@.ai-workflow/issue-1/00_planning/output/planning.md';
```

---

#### UC-CB-06: getPhaseOutputFile() - ファイルパス解決

**目的**: 各フェーズの出力ファイルパスが正しく解決されることを検証

**前提条件**:
- metadata.data.target_repository.path が '/path/to/repo' に設定されている

**入力**:
- targetPhase: 'Requirements'
- fileName: 'requirements.md'
- issueNumberOverride: 1

**期待結果**:
- 戻り値が '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md'

**テストデータ**:
```typescript
const targetPhase = 'Requirements';
const fileName = 'requirements.md';
const issueNumber = 1;
const expectedPath = '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md';
```

---

### 2.4 ArtifactCleaner モジュール

#### テストファイル: `tests/unit/phases/cleanup/artifact-cleaner.test.ts`（約100行）

---

#### UC-AC-01: cleanupWorkflowLogs() - 正常系

**目的**: phases 00-08 の execute/review/revise ディレクトリが削除され、metadata.json と output/*.md が保持されることを検証

**前提条件**:
- workflowDir が '.ai-workflow/issue-1' に設定されている
- phases 00-08 のディレクトリが存在する

**入力**: なし

**期待結果**:
- fs.removeSync() が phases 00-08 の execute/review/revise ディレクトリに対して呼び出される
- metadata.json と output/*.md が削除されない
- logger.info() が呼び出される（完了メッセージ）

**テストデータ**:
```typescript
const workflowDir = '.ai-workflow/issue-1';
const phasesToClean = ['00_planning', '01_requirements', ..., '08_report'];
const dirsToRemove = ['execute', 'review', 'revise'];
```

---

#### UC-AC-02: cleanupWorkflowLogs() - 削除失敗時（WARNING ログ）

**目的**: ディレクトリ削除が失敗した場合、WARNING ログを出力してワークフローを継続することを検証

**前提条件**:
- fs.removeSync() がモック化されている（エラーをスロー）

**入力**: なし

**期待結果**:
- fs.removeSync() が呼び出される
- logger.warn() が呼び出される（削除失敗メッセージ）
- 例外がスローされない（ワークフロー継続）

**テストデータ**:
```typescript
fs.removeSync.mockImplementation(() => {
  throw new Error('Permission denied');
});
```

---

#### UC-AC-03: cleanupWorkflowArtifacts() - 正常系（force=true）

**目的**: force=true の場合、確認プロンプトなしで .ai-workflow/issue-<NUM>/ ディレクトリ全体が削除されることを検証

**前提条件**:
- workflowDir が '.ai-workflow/issue-1' に設定されている
- パス検証が成功
- シンボリックリンクチェックが成功

**入力**:
- force: true

**期待結果**:
- validatePath() が1回呼び出される（パス検証）
- isSymbolicLink() が1回呼び出される（シンボリックリンクチェック）
- promptUserConfirmation() が呼び出されない
- fs.removeSync() が1回呼び出される（.ai-workflow/issue-1 ディレクトリ）
- logger.info() が呼び出される（削除完了メッセージ）

**テストデータ**:
```typescript
const workflowDir = '.ai-workflow/issue-1';
const force = true;
```

---

#### UC-AC-04: cleanupWorkflowArtifacts() - CI環境（確認スキップ）

**目的**: CI環境の場合、確認プロンプトなしで削除されることを検証

**前提条件**:
- config.isCI() が true を返す
- force が false

**入力**:
- force: false

**期待結果**:
- isCIEnvironment() が1回呼び出される
- promptUserConfirmation() が呼び出されない
- fs.removeSync() が1回呼び出される

**テストデータ**:
```typescript
config.isCI.mockReturnValue(true);
const force = false;
```

---

#### UC-AC-05: cleanupWorkflowArtifacts() - 非CI環境（確認プロンプト表示）

**目的**: 非CI環境かつ force=false の場合、確認プロンプトが表示されることを検証

**前提条件**:
- config.isCI() が false を返す
- force が false
- promptUserConfirmation() がモック化されている（true を返す）

**入力**:
- force: false

**期待結果**:
- isCIEnvironment() が1回呼び出される
- promptUserConfirmation() が1回呼び出される
- ユーザーが "yes" を入力した場合、fs.removeSync() が呼び出される

**テストデータ**:
```typescript
config.isCI.mockReturnValue(false);
promptUserConfirmation.mockResolvedValue(true);
const force = false;
```

---

#### UC-AC-06: cleanupWorkflowArtifacts() - パス検証失敗

**目的**: パス検証が失敗した場合、エラーログを出力して例外をスローすることを検証

**前提条件**:
- workflowDir が不正なパス（例: '.ai-workflow/malicious-path'）

**入力**:
- force: true

**期待結果**:
- validatePath() が false を返す
- logger.error() が呼び出される（パス検証エラーメッセージ）
- 例外がスローされる
- fs.removeSync() が呼び出されない

**テストデータ**:
```typescript
const workflowDir = '.ai-workflow/malicious-path';
const pattern = /\\.ai-workflow[\\/\\\\]issue-\\d+$/;
// pattern.test(workflowDir) === false
```

---

#### UC-AC-07: cleanupWorkflowArtifacts() - シンボリックリンク検出

**目的**: シンボリックリンクを検出した場合、エラーログを出力して例外をスローすることを検証

**前提条件**:
- workflowDir がシンボリックリンク
- fs.lstatSync() がモック化されている（isSymbolicLink() が true を返す）

**入力**:
- force: true

**期待結果**:
- isSymbolicLink() が true を返す
- logger.error() が呼び出される（シンボリックリンク検出メッセージ）
- 例外がスローされる
- fs.removeSync() が呼び出されない

**テストデータ**:
```typescript
fs.lstatSync.mockReturnValue({
  isSymbolicLink: () => true
});
```

---

#### UC-AC-08: promptUserConfirmation() - ユーザーが "yes" を入力

**目的**: ユーザーが "yes" を入力した場合、true を返すことを検証

**前提条件**:
- readline.question() がモック化されている（"yes" を返す）

**入力**:
- workflowDir: '.ai-workflow/issue-1'

**期待結果**:
- readline.question() が呼び出される
- ユーザーへの確認メッセージが表示される
- 戻り値が true

**テストデータ**:
```typescript
readline.question.mockResolvedValue('yes');
```

---

#### UC-AC-09: promptUserConfirmation() - ユーザーが "no" を入力

**目的**: ユーザーが "no" を入力した場合、false を返すことを検証

**前提条件**:
- readline.question() がモック化されている（"no" を返す）

**入力**:
- workflowDir: '.ai-workflow/issue-1'

**期待結果**:
- readline.question() が呼び出される
- 戻り値が false
- logger.info() が呼び出される（キャンセルメッセージ）

**テストデータ**:
```typescript
readline.question.mockResolvedValue('no');
```

---

## 3. インテグレーションテストシナリオ

### 3.1 BasePhase 全体のライフサイクルテスト

#### テストファイル: `tests/integration/phases/base-phase-refactored.test.ts`（約200行）

---

#### IC-BP-01: 完全なフェーズライフサイクル（execute → review → revise）

**目的**: リファクタリング後の BasePhase が完全なライフサイクルを正常に実行できることを検証

**前提条件**:
- テスト用のフェーズインスタンス（例: Planning Phase）が生成されている
- Git リポジトリが初期化されている
- GitHub Issue が作成されている（モック可）
- metadata.json が初期状態

**テスト手順**:
1. BasePhase.run(options) を呼び出す（skipReview: false）
2. execute ステップが実行される
3. Git コミット＆プッシュが実行される（execute 完了）
4. review ステップが実行される
5. レビューが失敗したと仮定（approved: false）
6. revise ステップが実行される
7. ReviewCycleManager がリトライロジックを実行
8. Git コミット＆プッシュが実行される（revise 完了）
9. フェーズステータスが completed に更新される

**期待結果**:
- metadata.data.status が 'completed'
- metadata.data.completed_steps が ['execute', 'review', 'revise'] を含む
- Git ログに3つのコミットが存在する:
  - `[ai-workflow] Phase {number} ({name}) - execute completed`
  - `[ai-workflow] Phase {number} ({name}) - review completed`
  - `[ai-workflow] Phase {number} ({name}) - revise completed`
- GitHub Issue に進捗コメントが2回投稿される（開始時、完了時）

**確認項目**:
- [ ] execute ステップが正常に実行された
- [ ] review ステップが正常に実行された
- [ ] revise ステップが正常に実行された
- [ ] Git コミット＆プッシュが3回実行された
- [ ] metadata.json が正しく更新された
- [ ] GitHub Issue に進捗コメントが投稿された

---

#### IC-BP-02: skipReview フラグによるレビュースキップ

**目的**: skipReview フラグが true の場合、レビューとリバイズがスキップされることを検証

**前提条件**:
- テスト用のフェーズインスタンスが生成されている

**テスト手順**:
1. BasePhase.run(options) を呼び出す（skipReview: true）
2. execute ステップが実行される
3. review ステップがスキップされる
4. revise ステップがスキップされる
5. フェーズステータスが completed に更新される

**期待結果**:
- metadata.data.status が 'completed'
- metadata.data.completed_steps が ['execute'] のみを含む（'review'、'revise' は含まない）
- Git ログに1つのコミットのみ存在する（execute）

**確認項目**:
- [ ] execute ステップが正常に実行された
- [ ] review ステップがスキップされた
- [ ] revise ステップがスキップされた
- [ ] Git コミットが1回のみ実行された

---

#### IC-BP-03: ステップ単位のレジューム動作（Issue #10）

**目的**: フェーズ実行途中で失敗した場合、レジューム時に completed_steps から再開できることを検証

**前提条件**:
- metadata.data.completed_steps に ['execute'] が既に含まれている
- metadata.data.current_step が null

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. execute ステップがスキップされる（既に完了済み）
3. review ステップから再開される
4. レビューが成功する
5. フェーズステータスが completed に更新される

**期待結果**:
- execute ステップが実行されない
- review ステップが実行される
- metadata.data.completed_steps が ['execute', 'review'] を含む
- Git ログに新規コミットが1つのみ追加される（review）

**確認項目**:
- [ ] execute ステップがスキップされた
- [ ] review ステップが正常に実行された
- [ ] Git コミットが1回のみ実行された（review）
- [ ] completed_steps が正しく管理された

---

### 3.2 Git 統合テスト

---

#### IC-GIT-01: ステップ単位の Git コミット＆プッシュ

**目的**: 各ステップ完了後に Git コミット＆プッシュが正しく実行されることを検証

**前提条件**:
- Git リポジトリが初期化されている
- リモートリポジトリが設定されている

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. execute ステップ完了後、Git コミット＆プッシュが実行される
3. review ステップ完了後、Git コミット＾プッシュが実行される

**期待結果**:
- Git ログに2つのコミットが存在する:
  - `[ai-workflow] Phase {number} ({name}) - execute completed`
  - `[ai-workflow] Phase {number} ({name}) - review completed`
- リモートリポジトリにコミットがプッシュされている

**確認項目**:
- [ ] Git コミットメッセージが正しい形式
- [ ] Git プッシュが実行された
- [ ] リモートリポジトリにコミットが存在する

---

#### IC-GIT-02: Git コミット失敗時のエラーハンドリング

**目的**: Git コミットが失敗した場合、フェーズが失敗し、適切なエラーメッセージが記録されることを検証

**前提条件**:
- Git リポジトリが初期化されているが、コミット権限がない（モック）

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. execute ステップが成功する
3. Git コミットが失敗する（例外がスローされる）
4. フェーズが失敗する

**期待結果**:
- metadata.data.status が 'failed'
- logger.error() が呼び出される（Git コミット失敗メッセージ）
- GitHub Issue に失敗コメントが投稿される

**確認項目**:
- [ ] フェーズが失敗した
- [ ] エラーログが出力された
- [ ] GitHub Issue に失敗コメントが投稿された

---

### 3.3 GitHub 統合テスト

---

#### IC-GH-01: 進捗コメントの投稿

**目的**: フェーズ開始時と完了時に GitHub Issue へ進捗コメントが投稿されることを検証

**前提条件**:
- GitHub Issue が作成されている
- GitHubClient が初期化されている

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. フェーズ開始時に進捗コメントが投稿される（status: 'in_progress'）
3. フェーズ完了時に進捗コメントが投稿される（status: 'completed'）

**期待結果**:
- GitHub Issue に2つのコメントが投稿される
- コメント内容が ProgressFormatter の出力に一致

**確認項目**:
- [ ] GitHub Issue に進捗コメントが投稿された（開始時）
- [ ] GitHub Issue に進捗コメントが投稿された（完了時）
- [ ] コメント内容が正しい

---

#### IC-GH-02: フェーズ失敗時のコメント投稿

**目的**: フェーズが失敗した場合、GitHub Issue へ失敗コメントが投稿されることを検証

**前提条件**:
- execute ステップが失敗する（モック）

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. execute ステップが失敗する
3. handleFailure() が呼び出される
4. GitHub Issue へ失敗コメントが投稿される

**期待結果**:
- GitHub Issue に失敗コメントが投稿される
- コメント内容に失敗理由が含まれる

**確認項目**:
- [ ] GitHub Issue に失敗コメントが投稿された
- [ ] コメント内容に失敗理由が含まれる

---

### 3.4 全10フェーズのリグレッションテスト

---

#### IC-REG-01: Planning Phase の動作保証

**目的**: リファクタリング後の BasePhase を継承した Planning Phase が正常動作することを検証

**前提条件**:
- Planning Phase のインスタンスが生成されている
- 既存の Planning Phase の実装コードは無変更

**テスト手順**:
1. Planning Phase の run() を呼び出す
2. execute ステップが実行される（planning.md 生成）
3. フェーズが完了する

**期待結果**:
- planning.md が生成される
- metadata.data.status が 'completed'
- 既存テストが成功する

**確認項目**:
- [ ] Planning Phase が正常に実行された
- [ ] planning.md が生成された
- [ ] 既存テストが成功した

---

#### IC-REG-02: Requirements Phase の動作保証

**目的**: リファクタリング後の BasePhase を継承した Requirements Phase が正常動作することを検証

**前提条件**:
- Requirements Phase のインスタンスが生成されている
- Planning Phase が完了している

**テスト手順**:
1. Requirements Phase の run() を呼び出す
2. execute ステップが実行される（requirements.md 生成）
3. buildOptionalContext() で Planning Phase の planning.md を参照
4. フェーズが完了する

**期待結果**:
- requirements.md が生成される
- Planning Phase の planning.md が正しく参照される
- metadata.data.status が 'completed'

**確認項目**:
- [ ] Requirements Phase が正常に実行された
- [ ] requirements.md が生成された
- [ ] Planning Phase の planning.md が参照された

---

#### IC-REG-03: Report Phase のクリーンアップ動作

**目的**: Report Phase 完了後、cleanupWorkflowLogs() が正常動作することを検証

**前提条件**:
- Report Phase のインスタンスが生成されている
- phases 00-08 のディレクトリが存在する

**テスト手順**:
1. Report Phase の run() を呼び出す
2. execute ステップが実行される（report.md 生成）
3. cleanupWorkflowLogs() が呼び出される
4. phases 00-08 の execute/review/revise ディレクトリが削除される

**期待結果**:
- report.md が生成される
- phases 00-08 の execute/review/revise ディレクトリが削除される
- metadata.json と output/*.md が保持される

**確認項目**:
- [ ] Report Phase が正常に実行された
- [ ] cleanupWorkflowLogs() が実行された
- [ ] execute/review/revise ディレクトリが削除された
- [ ] metadata.json と output/*.md が保持された

---

#### IC-REG-04: Evaluation Phase のクリーンアップ動作

**目的**: Evaluation Phase 完了後、cleanupWorkflowArtifacts() が正常動作することを検証（オプション）

**前提条件**:
- Evaluation Phase のインスタンスが生成されている
- .ai-workflow/issue-<NUM>/ ディレクトリが存在する

**テスト手順**:
1. Evaluation Phase の run() を呼び出す
2. execute ステップが実行される（evaluation.md 生成）
3. cleanupWorkflowArtifacts(force=true) が呼び出される
4. .ai-workflow/issue-<NUM>/ ディレクトリ全体が削除される

**期待結果**:
- evaluation.md が生成される
- .ai-workflow/issue-<NUM>/ ディレクトリが削除される

**確認項目**:
- [ ] Evaluation Phase が正常に実行された
- [ ] cleanupWorkflowArtifacts() が実行された
- [ ] .ai-workflow/issue-<NUM>/ ディレクトリが削除された

---

### 3.5 エラーリカバリテスト

---

#### IC-ERR-01: execute ステップ失敗時のリカバリ

**目的**: execute ステップが失敗した場合、フェーズが失敗し、metadata が正しく更新されることを検証

**前提条件**:
- BasePhase.execute() が失敗する（モック）

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. execute ステップが失敗する
3. handleFailure() が呼び出される

**期待結果**:
- metadata.data.status が 'failed'
- metadata.data.current_step が null
- GitHub Issue に失敗コメントが投稿される

**確認項目**:
- [ ] フェーズが失敗した
- [ ] metadata.data.status が 'failed'
- [ ] GitHub Issue に失敗コメントが投稿された

---

#### IC-ERR-02: review ステップ失敗後の revise 実行

**目的**: review ステップが失敗した場合、revise ステップが実行されることを検証

**前提条件**:
- BasePhase.review() が失敗する（approved: false）

**テスト手順**:
1. BasePhase.run(options) を呼び出す
2. execute ステップが成功する
3. review ステップが失敗する
4. revise ステップが実行される
5. ReviewCycleManager がリトライロジックを実行
6. フェーズが完了する

**期待結果**:
- metadata.data.completed_steps が ['execute', 'review', 'revise'] を含む
- metadata.data.status が 'completed'

**確認項目**:
- [ ] review ステップが失敗した
- [ ] revise ステップが実行された
- [ ] フェーズが完了した

---

#### IC-ERR-03: 依存関係違反時のエラーハンドリング

**目的**: 依存関係が満たされていない場合、フェーズが実行されずにエラーが返されることを検証

**前提条件**:
- Requirements Phase が未完了（Planning Phase の依存関係）

**テスト手順**:
1. Requirements Phase の run() を呼び出す
2. validateDependencies() が依存関係違反を検出
3. handleFailure() が呼び出される

**期待結果**:
- logger.error() が呼び出される（依存関係違反メッセージ）
- metadata.data.status が 'failed'
- execute ステップが実行されない

**確認項目**:
- [ ] 依存関係違反が検出された
- [ ] execute ステップが実行されなかった
- [ ] フェーズが失敗した

---

## 4. テストデータ

### 4.1 モックデータ

#### MetadataManager モックデータ

```typescript
const mockMetadata = {
  data: {
    issue_number: 1,
    status: 'pending' as PhaseStatus,
    completed_steps: [] as string[],
    current_step: null as string | null,
    target_repository: {
      path: '/path/to/repo'
    },
    workflow_dir: '.ai-workflow/issue-1'
  },
  updatePhaseStatus: jest.fn(),
  addCompletedStep: jest.fn(),
  setCurrentStep: jest.fn()
};
```

#### GitManager モックデータ

```typescript
const mockGitManager = {
  commit: jest.fn().mockResolvedValue(undefined),
  push: jest.fn().mockResolvedValue(undefined),
  getCurrentBranch: jest.fn().mockResolvedValue('feature/issue-1')
};
```

#### GitHubClient モックデータ

```typescript
const mockGitHubClient = {
  postComment: jest.fn().mockResolvedValue(undefined),
  updateComment: jest.fn().mockResolvedValue(undefined)
};
```

#### PhaseExecutionResult モックデータ

```typescript
const mockExecuteSuccess: PhaseExecutionResult = {
  success: true,
  message: 'Execute completed successfully'
};

const mockReviewSuccess: PhaseExecutionResult = {
  success: true,
  approved: true
};

const mockReviewFailure: PhaseExecutionResult = {
  success: false,
  approved: false,
  feedback: 'Needs revision: XYZ issue found'
};
```

### 4.2 テストフィクスチャ

#### ディレクトリ構造（テスト用）

```
.ai-workflow/issue-1/
├── 00_planning/
│   ├── execute/
│   ├── review/
│   ├── revise/
│   ├── metadata.json
│   └── output/
│       └── planning.md
├── 01_requirements/
│   ├── execute/
│   ├── review/
│   ├── revise/
│   ├── metadata.json
│   └── output/
│       └── requirements.md
...
└── 08_report/
    ├── metadata.json
    └── output/
        └── report.md
```

### 4.3 境界値データ

#### パス検証テスト用データ

```typescript
// 有効なパス
const validPaths = [
  '.ai-workflow/issue-1',
  '.ai-workflow/issue-123',
  '/absolute/path/.ai-workflow/issue-1'
];

// 無効なパス
const invalidPaths = [
  '.ai-workflow/malicious-path',
  '.ai-workflow/issue-abc',
  '.ai-workflow/issue-',
  '.ai-workflow/'
];
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

- **ローカル環境**: 開発者のローカルマシン（ユニットテスト実行）
- **CI/CD環境**: GitHub Actions（インテグレーションテスト実行）

### 5.2 必要な外部サービス

- **Git**: ステップ単位のコミット＆プッシュテスト用
  - テスト用のローカル Git リポジトリを初期化
  - リモートリポジトリはモック化
- **GitHub API**: 進捗コメント投稿テスト用
  - GitHubClient をモック化
  - 実際の GitHub API 呼び出しは行わない

### 5.3 必要なデータベース

- **なし**: このリファクタリングはデータベースを使用しない
- **metadata.json**: ファイルベースのメタデータ管理

### 5.4 モック/スタブの必要性

#### ユニットテストでモック化する対象

1. **BasePhase**: execute()、review() メソッド
2. **MetadataManager**: updatePhaseStatus()、addCompletedStep()、setCurrentStep()
3. **GitManager**: commit()、push()
4. **GitHubClient**: postComment()、updateComment()
5. **ReviewCycleManager**: performReviseStepWithRetry()
6. **Config**: isCI()
7. **fs-extra**: existsSync()、lstatSync()、removeSync()
8. **readline**: question()

#### インテグレーションテストでモック化する対象

1. **GitHubClient**: postComment()、updateComment()（実際の GitHub API 呼び出しを避けるため）
2. **リモートリポジトリ**: push()（実際のリモートプッシュを避けるため）

---

## 6. 非機能要件のテストシナリオ

### 6.1 パフォーマンステスト

#### NFR-PT-01: 依存性注入のオーバーヘッド測定

**目的**: リファクタリング前後で実行時間が同等（±5%以内）であることを検証

**前提条件**:
- リファクタリング前の BasePhase の実行時間が計測されている

**テスト手順**:
1. リファクタリング後の BasePhase で Planning Phase を実行
2. 実行時間を計測
3. リファクタリング前の実行時間と比較

**期待結果**:
- 実行時間の差が ±5% 以内

**測定方法**:
```typescript
const startTime = Date.now();
await basePhase.run(options);
const endTime = Date.now();
const executionTime = endTime - startTime;
```

---

### 6.2 セキュリティテスト

#### NFR-SEC-01: パストラバーサル攻撃の防止

**目的**: ArtifactCleaner がパストラバーサル攻撃を防止することを検証

**前提条件**:
- workflowDir に不正なパスが設定されている

**テスト手順**:
1. cleanupWorkflowArtifacts() を呼び出す（workflowDir: '.ai-workflow/../../../etc/passwd'）
2. パス検証が失敗する
3. 例外がスローされる

**期待結果**:
- validatePath() が false を返す
- 例外がスローされる
- fs.removeSync() が呼び出されない

---

#### NFR-SEC-02: シンボリックリンク攻撃の防止

**目的**: ArtifactCleaner がシンボリックリンク攻撃を防止することを検証

**前提条件**:
- workflowDir がシンボリックリンク

**テスト手順**:
1. cleanupWorkflowArtifacts() を呼び出す
2. シンボリックリンクチェックが失敗する
3. 例外がスローされる

**期待結果**:
- isSymbolicLink() が true を返す
- 例外がスローされる
- fs.removeSync() が呼び出されない

---

### 6.3 保守性テスト

#### NFR-MAINT-01: 循環的複雑度の削減

**目的**: run() メソッドの行数が99行から約20行に削減されることを検証

**前提条件**:
- リファクタリング前の BasePhase.run() が99行

**テスト手順**:
1. リファクタリング後の BasePhase.run() のソースコードを確認
2. 行数をカウント

**期待結果**:
- BasePhase.run() の行数が約20行以下

---

#### NFR-MAINT-02: テストカバレッジ90%以上

**目的**: テストカバレッジが90%以上であることを検証

**前提条件**:
- Jest カバレッジレポートが生成されている

**テスト手順**:
1. `npm run test:coverage` を実行
2. カバレッジレポートを確認

**期待結果**:
- 全モジュールのカバレッジが90%以上
- 特に新規モジュール（StepExecutor、PhaseRunner、ContextBuilder、ArtifactCleaner）が90%以上

---

## 7. テスト実行順序

### 7.1 推奨実行順序

1. **ユニットテスト**: 各モジュール単体の動作を検証
   - StepExecutor ユニットテスト
   - PhaseRunner ユニットテスト
   - ContextBuilder ユニットテスト
   - ArtifactCleaner ユニットテスト

2. **インテグレーションテスト**: モジュール間連携を検証
   - BasePhase 全体のライフサイクルテスト
   - Git 統合テスト
   - GitHub 統合テスト

3. **リグレッションテスト**: 既存機能の動作を検証
   - 全10フェーズのリグレッションテスト

4. **非機能要件テスト**: パフォーマンス、セキュリティ、保守性を検証
   - パフォーマンステスト
   - セキュリティテスト
   - 保守性テスト

### 7.2 並行実行可能なテスト

- ユニットテスト（StepExecutor、PhaseRunner、ContextBuilder、ArtifactCleaner）は並行実行可能
- インテグレーションテストは直列実行を推奨（Git リポジトリの状態管理のため）

---

## 8. テスト成功基準

### 8.1 ユニットテストの成功基準

- [ ] すべてのユニットテストが成功（0件の失敗）
- [ ] テストカバレッジが90%以上
- [ ] エッジケース（エラーハンドリング、null/undefined 処理）がカバーされている

### 8.2 インテグレーションテストの成功基準

- [ ] BasePhase 全体のライフサイクルテストが成功
- [ ] Git 統合テストが成功
- [ ] GitHub 統合テストが成功
- [ ] 全10フェーズのリグレッションテストが成功

### 8.3 非機能要件テストの成功基準

- [ ] パフォーマンステストが成功（実行時間 ±5% 以内）
- [ ] セキュリティテストが成功（パストラバーサル攻撃、シンボリックリンク攻撃の防止）
- [ ] 保守性テストが成功（run() メソッド約20行以下、テストカバレッジ90%以上）

---

## 9. 品質ゲートチェックリスト

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_INTEGRATION
  - ユニットテストシナリオ（セクション 2）: 4モジュール × 約10ケース = 40ケース
  - インテグレーションテストシナリオ（セクション 3）: 5カテゴリ × 約3ケース = 15ケース

- [x] **主要な正常系がカバーされている**
  - UC-SE-01: executeStep() 正常系
  - UC-PR-01: run() 正常系（全ステップ成功）
  - UC-CB-01: buildOptionalContext() 正常系（ファイル存在時）
  - UC-AC-01: cleanupWorkflowLogs() 正常系
  - IC-BP-01: 完全なフェーズライフサイクル（execute → review → revise）

- [x] **主要な異常系がカバーされている**
  - UC-SE-03: executeStep() 失敗時のエラーハンドリング
  - UC-PR-03: validateDependencies() 依存関係違反時のエラー
  - UC-AC-06: cleanupWorkflowArtifacts() パス検証失敗
  - IC-ERR-01: execute ステップ失敗時のリカバリ
  - IC-ERR-03: 依存関係違反時のエラーハンドリング

- [x] **期待結果が明確である**
  - 各テストケースに「期待結果」セクションを記載
  - 検証項目を明確にリストアップ（確認項目チェックリスト）
  - モックの呼び出し回数、引数、戻り値を具体的に記載

---

## 10. まとめ

### 10.1 テストシナリオの概要

本テストシナリオは、Issue #49（base-phase.ts のモジュール分解リファクタリング）における包括的なテスト計画です。

**テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）

**テスト対象**:
- 新規4モジュール（StepExecutor、PhaseRunner、ContextBuilder、ArtifactCleaner）
- リファクタリング後の BasePhase
- 全10フェーズのリグレッション防止

**テストケース数**:
- ユニットテスト: 約40ケース（4モジュール × 約10ケース）
- インテグレーションテスト: 約15ケース（5カテゴリ × 約3ケース）
- 非機能要件テスト: 約5ケース

### 10.2 期待される効果

1. **後方互換性の保証**: BasePhase の public メソッドのシグネチャが不変であることを検証
2. **機能保全**: リファクタリング前後で外部から見た振る舞いが同一であることを検証
3. **高品質の担保**: テストカバレッジ90%以上、テスト成功率100%を達成
4. **リグレッション防止**: 全10フェーズの既存機能が正常動作することを検証
5. **エラーハンドリングの検証**: 各モジュールが適切に例外処理を実装していることを検証

### 10.3 次のステップ

本テストシナリオが承認されたら、**Phase 4: 実装**に進みます。

---

**作成日**: 2025-01-21
**バージョン**: 1.0
**複雑度**: Complex
**テスト戦略**: UNIT_INTEGRATION
**テストケース総数**: 約60ケース
