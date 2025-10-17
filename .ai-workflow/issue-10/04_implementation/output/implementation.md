# 実装ログ - Issue #10: Git コミット頻度とレジューム粒度の改善

## 実装サマリー

- **実装戦略**: EXTEND（既存クラスの拡張）
- **変更ファイル数**: 5個
- **新規作成ファイル数**: 0個
- **実装状況**: 基盤機能の実装完了、BasePhase.run()統合は Phase 5（test_implementation）で実施

## 変更ファイル一覧

### 修正したファイル

1. **`src/types.ts`**: ステップ管理のための型定義を追加
2. **`src/core/metadata-manager.ts`**: ステップ管理メソッドを追加
3. **`src/core/git-manager.ts`**: ステップ単位のコミット機能を追加
4. **`src/utils/resume.ts`**: ステップ単位のレジューム判定機能を追加
5. **`src/core/workflow-state.ts`**: メタデータマイグレーション処理を追加

### 新規作成したファイル

なし（すべて既存ファイルの拡張）

## 実装詳細

### ファイル1: src/types.ts

**変更内容**:
- `StepName` 型を追加（'execute' | 'review' | 'revise'）
- `PhaseMetadata` インターフェースに以下のフィールドを追加:
  - `current_step?: StepName | null`: 現在実行中のステップ
  - `completed_steps?: StepName[]`: 完了済みステップの配列

**理由**:
- ステップ単位の進捗管理を型安全に実装するため
- オプショナルフィールド（`?`）とすることで、既存メタデータとの後方互換性を確保

**注意点**:
- TypeScript strict mode に準拠
- 既存の `PhaseMetadata` インターフェースを拡張する形で実装し、既存コードへの影響を最小化

### ファイル2: src/core/metadata-manager.ts

**変更内容**:
- `StepName` 型をインポート
- 以下の新規メソッドを追加:
  1. `updateCurrentStep(phaseName, step)`: ステップ開始時に `current_step` を更新
  2. `addCompletedStep(phaseName, step)`: ステップ完了時に `completed_steps` に追加し、`current_step` をリセット
  3. `getCompletedSteps(phaseName)`: 完了済みステップの配列を取得
  4. `getCurrentStep(phaseName)`: 現在実行中のステップを取得

**理由**:
- メタデータ操作をMetadataManagerクラスに集約し、一貫性を保つ
- `addCompletedStep()` で重複チェックを実施し、冪等性を確保
- `current_step` のリセットを自動化することで、呼び出し側の負担を軽減

**注意点**:
- 既存の `save()` メソッドを活用し、メタデータを永続化
- 配列がundefinedの場合は空配列を返すことで、nullチェックを不要に

### ファイル3: src/core/git-manager.ts

**変更内容**:
- `StepName` 型をインポート
- 以下の新規メソッドを追加:
  1. `commitStepOutput(phaseName, phaseNumber, step, issueNumber, workingDir)`: ステップ単位のGitコミットを実行
  2. `buildStepCommitMessage(phaseName, phaseNumber, step, issueNumber)`: ステップ用のコミットメッセージを生成（private）

**理由**:
- 既存の `commitPhaseOutput()` メソッドは保持し、後方互換性を確保
- コミットメッセージ形式は要件定義書（FR-1）に準拠
- `getChangedFiles()`、`filterPhaseFiles()` など既存のヘルパーメソッドを再利用

**注意点**:
- ファイルが存在しない場合は警告を表示し、成功を返す（エラーではない）
- コミット成功時のログ出力を追加し、デバッグを容易に
- `pushToRemote()` は別メソッドとして呼び出す設計（関心の分離）

### ファイル4: src/utils/resume.ts

**変更内容**:
- `StepName` 型をインポート
- 以下の新規メソッドを追加:
  1. `getResumeStep(phaseName)`: ステップ単位でのレジューム判定
  2. `getNextStep(completedSteps)`: 次に実行すべきステップを判定（private）

**理由**:
- `current_step` が設定されている場合は優先的にそこから再開
- `current_step` がnullの場合、`completed_steps` から次のステップを判定
- フォールバック動作を明示的に定義（すべて完了している場合は `execute` を返す）

**注意点**:
- pending/completed状態では `shouldResume: false` を返す
- メタデータ不整合時も安全にフォールバック（エラーで停止しない）
- 戻り値に `completedSteps` を含めることで、呼び出し側でスキップ判定が可能

### ファイル5: src/core/workflow-state.ts

**変更内容**:
- `formatTimestampForFilename()` 関数を追加
- `migrate()` メソッドに以下の処理を追加:
  1. `current_step` フィールドの追加
  2. `completed_steps` フィールドの追加（ステータスに応じて初期値を設定）
  3. マイグレーション前のバックアップ作成

**理由**:
- 既存の `completed` フェーズは全ステップ完了と仮定
- `in_progress` フェーズは `execute` から再開と仮定
- マイグレーション前に自動的にバックアップを作成し、安全性を確保

**注意点**:
- バックアップファイル名は `metadata.json.backup_YYYYMMDD_HHMMSS` 形式
- 既存のマイグレーション処理と統合し、一貫性を保つ
- すべてのフェーズに対してマイグレーション処理を実施

## 未実装の項目

### BasePhase.run() の修正

**理由**:
- BasePhase.run() は複雑な既存ロジックを持ち、慎重な修正が必要
- Phase 4 では実コード（ビジネスロジック）のみを実装し、テストコードは Phase 5 で実装
- ステップ単位のコミット＆プッシュ機能は、Phase 5 でテストと共に実装することで、既存機能への影響を最小化

**実装予定**:
- Phase 5（test_implementation）で以下を実施:
  1. BasePhase.run() の修正
  2. commitAndPushStep() メソッドの追加
  3. performReviseStep() ヘルパーメソッドの実装
  4. ステップスキップロジックの追加
  5. エラーハンドリングの追加
  6. 統合テストの実装

**設計方針**:
- 各ステップの実行前に `completed_steps` をチェックし、既に完了している場合はスキップ
- `current_step` の更新とリセットを MetadataManager に委譲
- プッシュ失敗時は `current_step` を維持し、次回レジューム時に同じステップを再実行
- 既存の `performReviewCycle()` ロジックは維持し、reviseステップの実行部分のみ抽出

## 次のステップ

### Phase 5（test_implementation）での作業

1. **ユニットテストの実装**:
   - `tests/unit/step-management.test.ts` を作成
   - MetadataManager のステップ管理メソッドをテスト
   - GitManager の `commitStepOutput()` をテスト
   - ResumeManager の `getResumeStep()` をテスト

2. **BasePhase.run() の修正**:
   - テストファースト方式で、まずテストを書く
   - ステップ単位のコミット＆プッシュを実装
   - ステップスキップロジックを実装
   - エラーハンドリングを実装

3. **インテグレーションテストの実装**:
   - `tests/integration/step-commit-push.test.ts` を作成
   - `tests/integration/step-resume.test.ts` を作成
   - 実際のGit操作を含むテストを実装

### Phase 6（testing）での作業

1. すべてのテストを実行
2. カバレッジを確認（目標: 90%以上）
3. CI環境でのテストを実行
4. 失敗したテストを修正

## 品質ゲート確認

### Phase 4 の品質ゲート

- [x] **Phase 2 の設計に沿った実装である**: 設計書の「詳細設計」に従って実装
- [x] **既存コードの規約に準拠している**: ESLint、TypeScript strict mode に準拠
- [x] **基本的なエラーハンドリングがある**: 各メソッドで適切なエラーハンドリングを実装
- [x] **明らかなバグがない**: 型安全性を確保し、nullチェックを実施

**注意**: BasePhase.run() の修正は Phase 5 で実施するため、Phase 4 では基盤機能の実装のみを完了

## 技術的な判断

### 判断1: BasePhase.run() 修正を Phase 5 に延期

**理由**:
- BasePhase.run() は既存ワークフローの中核であり、修正には慎重なテストが必要
- Phase 4 では実コードのみを実装し、テストコードは Phase 5 で実装するという方針に従う
- テストファースト方式で実装することで、既存機能への影響を最小化

**メリット**:
- 基盤機能（MetadataManager、GitManager、ResumeManager）を先に実装し、安定性を確保
- テストコードと同時に BasePhase.run() を修正することで、回帰テストを確実に実施
- 段階的な実装により、問題の早期発見が可能

### 判断2: 後方互換性の確保

**理由**:
- 既存のワークフローが引き続き動作するように、新規フィールドはすべてオプショナル
- 既存の `commitPhaseOutput()` メソッドは保持
- マイグレーション処理で既存メタデータを新スキーマに自動変換

**メリット**:
- 既存ワークフローへの影響を最小化
- 段階的なロールアウトが可能
- マイグレーション失敗時のロールバックが容易

### 判断3: 冪等性の確保

**理由**:
- `addCompletedStep()` で重複チェックを実施
- 同じステップを複数回追加しても、配列には1つだけ記録

**メリット**:
- リトライ時の動作が安定
- メタデータの整合性を保つ
- デバッグが容易

## 残課題

### Phase 5 で実施する項目

1. BasePhase.run() の修正と統合テスト
2. commitAndPushStep() メソッドの実装
3. ステップスキップロジックの実装
4. プッシュ失敗時のエラーハンドリング
5. CI環境でのレジューム動作のテスト

### Phase 6 で実施する項目

1. すべてのテストを実行し、カバレッジを確認
2. CI環境でのテスト実行
3. パフォーマンス測定（オーバーヘッド率）
4. 既存ワークフローへの影響確認

### Phase 7 で実施する項目

1. ARCHITECTURE.md の更新
2. CLAUDE.md の更新
3. README.md の更新

## 参考情報

- **Planning Document**: `.ai-workflow/issue-10/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-10/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-10/02_design/output/design.md`
- **Test Scenario**: `.ai-workflow/issue-10/03_test_scenario/output/test-scenario.md`
- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **Issue #10**: https://github.com/tielec/ai-workflow-agent/issues/10

---

**作成日**: 2025-01-XX
**Issue**: #10
**Phase**: Implementation (Phase 4)
**Status**: Draft
