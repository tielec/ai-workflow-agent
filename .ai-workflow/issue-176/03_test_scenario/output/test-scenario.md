# テストシナリオ

## Issue概要

- **Issue番号**: #176
- **タイトル**: auto-close-issue: Issue検品と自動クローズ機能の実装
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/176
- **状態**: open
- **ラベル**: enhancement

## 0. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION** (Planning Phase で決定)

### テスト対象の範囲

#### Unitテスト対象
1. **CLIオプションパース** (`parseOptions`, `validateOptions`)
2. **カテゴリフィルタリングロジック** (`filterByCategory`)
3. **エージェント出力JSONパース** (`parseInspectionResult`)
4. **confidence閾値フィルタリング** (`filterBySafetyChecks`)
5. **Issue除外ロジック** (ラベルフィルタ、最近更新除外)
6. **プロンプト変数構築** (`buildPromptVariables`)

#### Integrationテスト対象
1. **GitHub API連携** (Issue一覧取得、Issue詳細取得、クローズ、コメント投稿、ラベル付与)
2. **エージェント統合** (Codex/Claude との実際の統合)
3. **IssueInspector と GitHub API の連携フロー**
4. **`--dry-run` モードの動作確認**
5. **エンドツーエンドのコマンド実行フロー**
6. **エラーケース** (エージェント失敗、GitHub APIエラー、JSON parseエラー)

### テストの目的

1. **機能の正確性保証**: CLIオプション解析、フィルタリング、エージェント判定、クローズ処理が仕様通りに動作することを保証
2. **外部連携の信頼性保証**: GitHub API、エージェント（Codex/Claude）との統合が正常に機能することを保証
3. **エラーハンドリングの堅牢性保証**: 異常系・エッジケースで適切にエラーハンドリングされることを保証
4. **安全機能の検証**: 誤クローズを防ぐ多層防御機能（confidence閾値、ラベルフィルタ、最近更新除外、dry-run）が正しく機能することを保証

## 1. Unitテストシナリオ

### 1.1 CLIオプションパース - parseOptions()

#### TS-UNIT-001: デフォルト値の適用（正常系）

- **目的**: CLIオプションが未指定の場合、適切なデフォルト値が設定されることを検証
- **前提条件**: CLI引数が空のオブジェクト `{}`
- **入力**: `parseOptions({})`
- **期待結果**:
  ```typescript
  {
    category: 'followup',
    limit: 10,
    dryRun: true,
    confidenceThreshold: 0.7,
    daysThreshold: 90,
    requireApproval: false,
    excludeLabels: ['do-not-close', 'pinned'],
    agent: 'auto'
  }
  ```
- **テストデータ**: なし

#### TS-UNIT-002: 全オプション指定（正常系）

- **目的**: 全てのCLIオプションが正しくパースされることを検証
- **前提条件**: 全てのCLI引数が指定される
- **入力**:
  ```typescript
  parseOptions({
    category: 'stale',
    limit: '20',
    dryRun: 'false',
    confidenceThreshold: '0.8',
    daysThreshold: '120',
    requireApproval: 'true',
    excludeLabels: 'wontfix,duplicate',
    agent: 'codex'
  })
  ```
- **期待結果**:
  ```typescript
  {
    category: 'stale',
    limit: 20,
    dryRun: false,
    confidenceThreshold: 0.8,
    daysThreshold: 120,
    requireApproval: true,
    excludeLabels: ['wontfix', 'duplicate'],
    agent: 'codex'
  }
  ```
- **テストデータ**: 上記入力

#### TS-UNIT-003: カテゴリオプションのバリデーション（境界値）

- **目的**: categoryオプションが有効な値のみ受け付けることを検証
- **前提条件**: 各categoryの値でテスト実行
- **入力**:
  - `parseOptions({ category: 'followup' })` → OK
  - `parseOptions({ category: 'stale' })` → OK
  - `parseOptions({ category: 'old' })` → OK
  - `parseOptions({ category: 'all' })` → OK
  - `parseOptions({ category: 'invalid' })` → NG (バリデーションエラー)
- **期待結果**: 有効な値は正常にパース、無効な値は例外スロー
- **テストデータ**: 上記各category値

### 1.2 CLIオプションバリデーション - validateOptions()

#### TS-UNIT-004: limit範囲外チェック（異常系）

- **目的**: limitが範囲外（1-50）の場合、エラーがスローされることを検証
- **前提条件**: limitが範囲外の値
- **入力**:
  - `validateOptions({ limit: 0, ... })` → エラー
  - `validateOptions({ limit: 51, ... })` → エラー
  - `validateOptions({ limit: -5, ... })` → エラー
- **期待結果**: `Error: --limit must be between 1 and 50` が例外としてスローされる
- **テストデータ**: limit値 [0, 51, -5]

#### TS-UNIT-005: limit境界値チェック（境界値）

- **目的**: limitの境界値（1, 50）が正常に受け付けられることを検証
- **前提条件**: limitが境界値
- **入力**:
  - `validateOptions({ limit: 1, ... })` → OK
  - `validateOptions({ limit: 50, ... })` → OK
- **期待結果**: 例外がスローされず、正常に処理される
- **テストデータ**: limit値 [1, 50]

#### TS-UNIT-006: confidenceThreshold範囲外チェック（異常系）

- **目的**: confidenceThresholdが範囲外（0.0-1.0）の場合、エラーがスローされることを検証
- **前提条件**: confidenceThresholdが範囲外の値
- **入力**:
  - `validateOptions({ confidenceThreshold: -0.1, ... })` → エラー
  - `validateOptions({ confidenceThreshold: 1.1, ... })` → エラー
- **期待結果**: `Error: --confidence-threshold must be between 0.0 and 1.0` が例外としてスローされる
- **テストデータ**: confidenceThreshold値 [-0.1, 1.1]

#### TS-UNIT-007: confidenceThreshold境界値チェック（境界値）

- **目的**: confidenceThresholdの境界値（0.0, 1.0）が正常に受け付けられることを検証
- **前提条件**: confidenceThresholdが境界値
- **入力**:
  - `validateOptions({ confidenceThreshold: 0.0, ... })` → OK
  - `validateOptions({ confidenceThreshold: 1.0, ... })` → OK
- **期待結果**: 例外がスローされず、正常に処理される
- **テストデータ**: confidenceThreshold値 [0.0, 1.0]

#### TS-UNIT-008: daysThreshold負の値チェック（異常系）

- **目的**: daysThresholdが負の値の場合、エラーがスローされることを検証
- **前提条件**: daysThresholdが負の値
- **入力**: `validateOptions({ daysThreshold: -10, ... })` → エラー
- **期待結果**: `Error: --days-threshold must be a positive integer` が例外としてスローされる
- **テストデータ**: daysThreshold値 [-10]

### 1.3 カテゴリフィルタリング - filterByCategory()

#### TS-UNIT-009: followupカテゴリフィルタ（正常系）

- **目的**: followupカテゴリで、タイトルが `[FOLLOW-UP]` で始まるIssueのみが抽出されることを検証
- **前提条件**: 複数のIssueが存在する
- **入力**:
  ```typescript
  filterByCategory([
    { number: 1, title: '[FOLLOW-UP] Add logging', created_at: '2024-12-01', updated_at: '2024-12-10' },
    { number: 2, title: 'Bug: Login failure', created_at: '2024-11-01', updated_at: '2024-11-05' },
    { number: 3, title: '[FOLLOW-UP] Refactor API', created_at: '2024-12-15', updated_at: '2024-12-20' }
  ], 'followup', 90)
  ```
- **期待結果**: Issue #1 と Issue #3 のみが返される
- **テストデータ**: 上記Issue配列

#### TS-UNIT-010: staleカテゴリフィルタ（正常系）

- **目的**: staleカテゴリで、最終更新から90日以上経過したIssueのみが抽出されることを検証
- **前提条件**: 複数のIssueが存在し、現在日時が `2025-01-30`
- **入力**:
  ```typescript
  filterByCategory([
    { number: 1, title: 'Issue 1', created_at: '2024-01-01', updated_at: '2024-10-01' }, // 121日前更新
    { number: 2, title: 'Issue 2', created_at: '2024-05-01', updated_at: '2025-01-20' }, // 10日前更新
    { number: 3, title: 'Issue 3', created_at: '2024-03-01', updated_at: '2024-09-01' }  // 151日前更新
  ], 'stale', 90)
  ```
- **期待結果**: Issue #1 と Issue #3 のみが返される（90日以上経過）
- **テストデータ**: 上記Issue配列

#### TS-UNIT-011: staleカテゴリフィルタ境界値（境界値）

- **目的**: staleカテゴリで、最終更新がちょうど90日前のIssueが抽出されることを検証
- **前提条件**: 最終更新が90日前のIssueが存在し、現在日時が `2025-01-30`
- **入力**:
  ```typescript
  filterByCategory([
    { number: 1, title: 'Issue 1', created_at: '2024-01-01', updated_at: '2024-11-01' }, // ちょうど90日前
    { number: 2, title: 'Issue 2', created_at: '2024-01-01', updated_at: '2024-11-02' }  // 89日前
  ], 'stale', 90)
  ```
- **期待結果**: Issue #1 のみが返される（90日以上経過の境界値）
- **テストデータ**: 上記Issue配列

#### TS-UNIT-012: oldカテゴリフィルタ（正常系）

- **目的**: oldカテゴリで、作成から180日以上経過したIssueのみが抽出されることを検証
- **前提条件**: 複数のIssueが存在し、現在日時が `2025-01-30`
- **入力**:
  ```typescript
  filterByCategory([
    { number: 1, title: 'Issue 1', created_at: '2024-01-01', updated_at: '2024-12-01' }, // 394日前作成
    { number: 2, title: 'Issue 2', created_at: '2024-09-01', updated_at: '2024-12-01' }, // 151日前作成
    { number: 3, title: 'Issue 3', created_at: '2024-06-01', updated_at: '2024-12-01' }  // 243日前作成
  ], 'old', 90) // daysThreshold=90 → old判定は180日
  ```
- **期待結果**: Issue #1 と Issue #3 のみが返される（180日以上経過）
- **テストデータ**: 上記Issue配列

#### TS-UNIT-013: allカテゴリフィルタ（正常系）

- **目的**: allカテゴリで、全てのIssueが抽出されることを検証
- **前提条件**: 複数のIssueが存在する
- **入力**:
  ```typescript
  filterByCategory([
    { number: 1, title: '[FOLLOW-UP] Issue 1', created_at: '2024-12-01', updated_at: '2025-01-20' },
    { number: 2, title: 'Bug: Issue 2', created_at: '2024-01-01', updated_at: '2024-05-01' },
    { number: 3, title: 'Feature: Issue 3', created_at: '2024-08-01', updated_at: '2025-01-25' }
  ], 'all', 90)
  ```
- **期待結果**: Issue #1, #2, #3 全てが返される
- **テストデータ**: 上記Issue配列

### 1.4 エージェント出力JSONパース - parseInspectionResult()

#### TS-UNIT-014: 正常なJSON出力のパース（正常系）

- **目的**: エージェントからの正常なJSON出力が正しくパースされることを検証
- **前提条件**: エージェントが仕様通りのJSON文字列を出力
- **入力**:
  ```typescript
  parseInspectionResult(`{
    "issue_number": 123,
    "recommendation": "close",
    "confidence": 0.85,
    "reasoning": "元Issueクローズ済み、ログ機能実装済み",
    "close_comment": "このIssueは対応完了のためクローズします。",
    "suggested_actions": []
  }`)
  ```
- **期待結果**:
  ```typescript
  {
    issue_number: 123,
    recommendation: 'close',
    confidence: 0.85,
    reasoning: '元Issueクローズ済み、ログ機能実装済み',
    close_comment: 'このIssueは対応完了のためクローズします。',
    suggested_actions: []
  }
  ```
- **テストデータ**: 上記JSON文字列

#### TS-UNIT-015: 必須フィールド欠落（異常系）

- **目的**: 必須フィールド（recommendation, confidence, reasoning）が欠落している場合、エラーがスローされることを検証
- **前提条件**: 必須フィールドが欠落したJSON文字列
- **入力**:
  ```typescript
  parseInspectionResult(`{
    "issue_number": 123,
    "confidence": 0.85,
    "reasoning": "理由"
  }`) // recommendation が欠落
  ```
- **期待結果**: `Error: Missing required field: recommendation` が例外としてスローされる
- **テストデータ**: 必須フィールド欠落のJSON文字列

#### TS-UNIT-016: 不正なJSON形式（異常系）

- **目的**: 不正なJSON形式の文字列が渡された場合、エラーがスローされることを検証
- **前提条件**: 不正なJSON文字列
- **入力**: `parseInspectionResult('{ "issue_number": 123, invalid json }')`
- **期待結果**: `Error: Failed to parse inspection result: Invalid JSON` が例外としてスローされる
- **テストデータ**: 不正なJSON文字列

#### TS-UNIT-017: recommendationの値検証（異常系）

- **目的**: recommendationが有効な値（close, keep, needs_discussion）以外の場合、エラーがスローされることを検証
- **前提条件**: recommendationが無効な値
- **入力**:
  ```typescript
  parseInspectionResult(`{
    "issue_number": 123,
    "recommendation": "delete",
    "confidence": 0.85,
    "reasoning": "理由",
    "close_comment": "",
    "suggested_actions": []
  }`)
  ```
- **期待結果**: `Error: Invalid recommendation value: delete` が例外としてスローされる
- **テストデータ**: 無効なrecommendation値

#### TS-UNIT-018: confidence範囲外の値（異常系）

- **目的**: confidenceが範囲外（0.0-1.0）の値の場合、エラーがスローされることを検証
- **前提条件**: confidenceが範囲外
- **入力**:
  ```typescript
  parseInspectionResult(`{
    "issue_number": 123,
    "recommendation": "close",
    "confidence": 1.5,
    "reasoning": "理由",
    "close_comment": "",
    "suggested_actions": []
  }`)
  ```
- **期待結果**: `Error: Confidence must be between 0.0 and 1.0` が例外としてスローされる
- **テストデータ**: 範囲外のconfidence値

### 1.5 安全フィルタ - filterBySafetyChecks()

#### TS-UNIT-019: 除外ラベルチェック（正常系）

- **目的**: 除外ラベル（do-not-close, pinned）を持つIssueがフィルタリングされることを検証
- **前提条件**: Issueが除外ラベルを持つ
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [{ name: 'do-not-close' }, { name: 'bug' }], updated_at: '2024-12-01' },
    { recommendation: 'close', confidence: 0.85, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `false` が返される（フィルタリングされる）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-020: 除外ラベルなし（正常系）

- **目的**: 除外ラベルを持たないIssueがフィルタリングされないことを検証
- **前提条件**: Issueが除外ラベルを持たない
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [{ name: 'bug' }, { name: 'enhancement' }], updated_at: '2024-12-01' },
    { recommendation: 'close', confidence: 0.85, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `true` が返される（フィルタリングされない）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-021: 最近更新除外チェック（正常系）

- **目的**: 最終更新が7日以内のIssueがフィルタリングされることを検証
- **前提条件**: 現在日時が `2025-01-30`、Issueの最終更新が `2025-01-28`（2日前）
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [], updated_at: '2025-01-28T00:00:00Z' },
    { recommendation: 'close', confidence: 0.85, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `false` が返される（フィルタリングされる）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-022: 最近更新除外境界値（境界値）

- **目的**: 最終更新がちょうど7日前のIssueがフィルタリングされないことを検証
- **前提条件**: 現在日時が `2025-01-30`、Issueの最終更新が `2025-01-23`（ちょうど7日前）
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [], updated_at: '2025-01-23T00:00:00Z' },
    { recommendation: 'close', confidence: 0.85, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `true` が返される（7日以上経過でフィルタリングされない）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-023: confidence閾値チェック（正常系）

- **目的**: confidenceが閾値未満の場合、フィルタリングされることを検証
- **前提条件**: confidence=0.65、閾値=0.7
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [], updated_at: '2024-12-01T00:00:00Z' },
    { recommendation: 'close', confidence: 0.65, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `false` が返される（閾値未満でフィルタリングされる）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-024: confidence閾値境界値（境界値）

- **目的**: confidenceがちょうど閾値の場合、フィルタリングされないことを検証
- **前提条件**: confidence=0.7、閾値=0.7
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [], updated_at: '2024-12-01T00:00:00Z' },
    { recommendation: 'close', confidence: 0.7, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `true` が返される（閾値以上でフィルタリングされない）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-025: recommendation="needs_discussion"チェック（正常系）

- **目的**: recommendation="needs_discussion"の場合、フィルタリングされることを検証
- **前提条件**: recommendation="needs_discussion"
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [], updated_at: '2024-12-01T00:00:00Z' },
    { recommendation: 'needs_discussion', confidence: 0.85, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `false` が返される（needs_discussionはクローズ対象外）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

#### TS-UNIT-026: recommendation="keep"チェック（正常系）

- **目的**: recommendation="keep"の場合、フィルタリングされることを検証
- **前提条件**: recommendation="keep"
- **入力**:
  ```typescript
  filterBySafetyChecks(
    { number: 1, labels: [], updated_at: '2024-12-01T00:00:00Z' },
    { recommendation: 'keep', confidence: 0.85, reasoning: '', close_comment: '', suggested_actions: [] },
    { confidenceThreshold: 0.7, excludeLabels: ['do-not-close', 'pinned'], agent: 'auto' }
  )
  ```
- **期待結果**: `false` が返される（keepはクローズ対象外）
- **テストデータ**: 上記Issue、InspectionResult、InspectionOptions

### 1.6 プロンプト変数構築 - buildPromptVariables()

#### TS-UNIT-027: Issue情報のフォーマット（正常系）

- **目的**: Issue情報が正しくフォーマットされることを検証
- **前提条件**: Issue基本情報が存在する
- **入力**:
  ```typescript
  buildPromptVariables(
    {
      number: 123,
      title: '[FOLLOW-UP] Add logging to API endpoints',
      body: 'This issue tracks the implementation of logging.',
      labels: [{ name: 'enhancement' }, { name: 'followup' }],
      created_at: '2024-11-01T00:00:00Z',
      updated_at: '2024-12-01T00:00:00Z'
    },
    {
      issue: { /* 同上 */ },
      comments: [
        { id: 1, author: 'user1', created_at: '2024-11-05T00:00:00Z', body: 'Comment 1' },
        { id: 2, author: 'user2', created_at: '2024-11-10T00:00:00Z', body: 'Comment 2' }
      ]
    }
  )
  ```
- **期待結果**:
  - `issue_info` に以下が含まれる:
    - Issue番号: 123
    - タイトル: [FOLLOW-UP] Add logging to API endpoints
    - 本文: This issue tracks the implementation of logging.
    - ラベル: enhancement, followup
    - 作成日: 2024-11-01
    - 最終更新日: 2024-12-01
  - `related_info` にコメント履歴が含まれる（user1のコメント、user2のコメント）
  - `codebase_info` は空文字列（Phase 1では未実装）
- **テストデータ**: 上記Issue、IssueDetails

#### TS-UNIT-028: コメント履歴のフォーマット（正常系）

- **目的**: コメント履歴が正しくフォーマットされることを検証
- **前提条件**: 複数のコメントが存在する
- **入力**: （TS-UNIT-027と同様）
- **期待結果**:
  - `related_info` に以下が含まれる:
    ```
    ## Comment History
    - 2024-11-05 by user1: Comment 1
    - 2024-11-10 by user2: Comment 2
    ```
- **テストデータ**: 上記IssueDetails

#### TS-UNIT-029: コメント履歴なしの場合（境界値）

- **目的**: コメント履歴がない場合、適切なメッセージが表示されることを検証
- **前提条件**: コメント履歴が空配列
- **入力**:
  ```typescript
  buildPromptVariables(
    { /* Issue情報 */ },
    {
      issue: { /* Issue情報 */ },
      comments: []
    }
  )
  ```
- **期待結果**:
  - `related_info` に以下が含まれる:
    ```
    ## Comment History
    (No comments)
    ```
- **テストデータ**: コメント空配列のIssueDetails

## 2. Integrationテストシナリオ

### 2.1 GitHub API連携

#### TS-INT-001: Issue一覧取得

- **目的**: GitHub APIを使用してオープンIssue一覧が正しく取得できることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - リポジトリにオープンIssueが存在する
- **テスト手順**:
  1. `IssueClient.getIssues('open', 100)` を呼び出す
  2. レスポンスを確認
- **期待結果**:
  - Issue配列が返される
  - 各IssueにはIssue番号、タイトル、本文、ラベル、作成日、最終更新日が含まれる
  - GitHub API の `/repos/{owner}/{repo}/issues?state=open&per_page=100` が呼び出される（モックで確認）
- **確認項目**:
  - [ ] Issue配列が空でない
  - [ ] 各Issueの必須フィールド（number, title, body, labels, created_at, updated_at）が存在する
  - [ ] GitHub API呼び出しのパラメータが正しい

#### TS-INT-002: Issue詳細情報取得（コメント履歴含む）

- **目的**: GitHub APIを使用してIssue詳細情報とコメント履歴が正しく取得できることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - Issue #123が存在し、コメントが2件存在する
- **テスト手順**:
  1. `IssueClient.getIssueDetails(123)` を呼び出す
  2. レスポンスを確認
- **期待結果**:
  - `IssueDetails` オブジェクトが返される
  - `issue` フィールドにIssue基本情報が含まれる
  - `comments` フィールドにコメント配列が含まれる（2件）
  - GitHub API の `/repos/{owner}/{repo}/issues/123` と `/repos/{owner}/{repo}/issues/123/comments` が呼び出される（モックで確認）
- **確認項目**:
  - [ ] IssueDetails オブジェクトの構造が正しい
  - [ ] コメント配列が期待通り（2件）
  - [ ] 各コメントにid, author, created_at, bodyが含まれる
  - [ ] GitHub API呼び出しが2回実行される（Issue取得、コメント取得）

#### TS-INT-003: Issueクローズ処理

- **目的**: GitHub APIを使用してIssueが正しくクローズされることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - Issue #123がオープン状態
- **テスト手順**:
  1. `IssueClient.closeIssue(123)` を呼び出す
  2. GitHub APIのモックレスポンスを確認
- **期待結果**:
  - GitHub API の `PATCH /repos/{owner}/{repo}/issues/123` が呼び出される（モックで確認）
  - リクエストボディに `{ state: 'closed' }` が含まれる
  - 例外がスローされない
- **確認項目**:
  - [ ] GitHub API呼び出しのメソッドが PATCH
  - [ ] リクエストボディが正しい（state: 'closed'）
  - [ ] エラーが発生しない

#### TS-INT-004: コメント投稿処理

- **目的**: GitHub APIを使用してコメントが正しく投稿されることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - Issue #123がオープン状態
- **テスト手順**:
  1. `IssueClient.postComment(123, 'このIssueは対応完了のためクローズします。')` を呼び出す
  2. GitHub APIのモックレスポンスを確認
- **期待結果**:
  - GitHub API の `POST /repos/{owner}/{repo}/issues/123/comments` が呼び出される（モックで確認）
  - リクエストボディに `{ body: 'このIssueは対応完了のためクローズします。' }` が含まれる
  - 例外がスローされない
- **確認項目**:
  - [ ] GitHub API呼び出しのメソッドが POST
  - [ ] リクエストボディが正しい（body: コメント本文）
  - [ ] エラーが発生しない

#### TS-INT-005: ラベル付与処理

- **目的**: GitHub APIを使用してラベルが正しく付与されることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - Issue #123がオープン状態
- **テスト手順**:
  1. `IssueClient.addLabels(123, ['auto-closed'])` を呼び出す
  2. GitHub APIのモックレスポンスを確認
- **期待結果**:
  - GitHub API の `POST /repos/{owner}/{repo}/issues/123/labels` が呼び出される（モックで確認）
  - リクエストボディに `{ labels: ['auto-closed'] }` が含まれる
  - 例外がスローされない
- **確認項目**:
  - [ ] GitHub API呼び出しのメソッドが POST
  - [ ] リクエストボディが正しい（labels: ['auto-closed']）
  - [ ] エラーが発生しない

#### TS-INT-006: GitHub APIエラーハンドリング（認証エラー）

- **目的**: GitHub APIが401エラー（認証エラー）を返した場合、適切にハンドリングされることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - GitHub APIモックが401エラーを返すように設定
- **テスト手順**:
  1. `IssueClient.getIssues('open', 100)` を呼び出す
  2. エラーハンドリングを確認
- **期待結果**:
  - エラーメッセージが表示される: "GitHub token is invalid or expired. Please check GITHUB_TOKEN environment variable."
  - 処理が中断される（例外がスローされる）
- **確認項目**:
  - [ ] 401エラーが適切にキャッチされる
  - [ ] エラーメッセージが明確
  - [ ] 処理が中断される

#### TS-INT-007: GitHub APIエラーハンドリング（レート制限）

- **目的**: GitHub APIが403エラー（レート制限）を返した場合、適切にハンドリングされることを検証
- **前提条件**:
  - GitHub API クライアント（Octokit）が初期化されている
  - GitHub APIモックが403エラー（レート制限）を返すように設定
- **テスト手順**:
  1. `IssueClient.getIssues('open', 100)` を呼び出す
  2. エラーハンドリングを確認
- **期待結果**:
  - エラーメッセージが表示される: "GitHub API rate limit reached. Please try again later."
  - 処理が中断される（例外がスローされる）
- **確認項目**:
  - [ ] 403エラー（レート制限）が適切にキャッチされる
  - [ ] エラーメッセージが明確
  - [ ] 処理が中断される

### 2.2 エージェント統合

#### TS-INT-008: Codexエージェント実行（正常系）

- **目的**: Codexエージェントが正常に実行され、JSON形式の出力が返されることを検証
- **前提条件**:
  - Codex AgentExecutor が初期化されている
  - プロンプトテンプレートが存在する
- **テスト手順**:
  1. `IssueInspector.inspectIssue(issue, options)` を呼び出す
  2. Codexエージェントがプロンプトを受信し、JSON出力を返す（モック使用）
- **期待結果**:
  - Codexエージェントが呼び出される
  - プロンプトにIssue情報、関連情報が含まれる
  - JSON形式の出力が返される（`InspectionResult` 形式）
- **確認項目**:
  - [ ] Codexエージェントが呼び出される
  - [ ] プロンプトにIssue情報が含まれる
  - [ ] JSON出力が正しくパースされる
  - [ ] InspectionResult オブジェクトが返される

#### TS-INT-009: Claudeエージェント実行（正常系）

- **目的**: Claudeエージェントが正常に実行され、JSON形式の出力が返されることを検証
- **前提条件**:
  - Claude AgentExecutor が初期化されている
  - プロンプトテンプレートが存在する
- **テスト手順**:
  1. `IssueInspector.inspectIssue(issue, options)` を呼び出す（agent: 'claude' 指定）
  2. Claudeエージェントがプロンプトを受信し、JSON出力を返す（モック使用）
- **期待結果**:
  - Claudeエージェントが呼び出される
  - プロンプトにIssue情報、関連情報が含まれる
  - JSON形式の出力が返される（`InspectionResult` 形式）
- **確認項目**:
  - [ ] Claudeエージェントが呼び出される
  - [ ] プロンプトにIssue情報が含まれる
  - [ ] JSON出力が正しくパースされる
  - [ ] InspectionResult オブジェクトが返される

#### TS-INT-010: エージェント自動選択（auto）

- **目的**: `--agent auto` 指定時、利用可能なエージェントが自動選択されることを検証
- **前提条件**:
  - Codex APIキーが設定されている（優先）
  - Claude認証情報も設定されている（フォールバック）
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ agent: 'auto', ... })` を呼び出す
  2. エージェント選択ロジックを確認
- **期待結果**:
  - Codex APIキーが設定されている場合、Codexが選択される
  - Codex APIキーが未設定の場合、Claudeが選択される
  - 選択されたエージェントが正常に実行される
- **確認項目**:
  - [ ] エージェント選択ロジックが正しく動作する
  - [ ] 優先順位（Codex → Claude）が守られる
  - [ ] 選択されたエージェントが実行される

#### TS-INT-011: エージェント実行失敗時のスキップ動作

- **目的**: エージェント実行が失敗した場合、該当Issueをスキップして次のIssueを処理することを検証
- **前提条件**:
  - 複数のIssueが検品対象
  - 1件目のIssue検品でエージェントがタイムアウト（エラー）
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ limit: 3, ... })` を呼び出す
  2. 1件目のIssue検品でエージェントエラーを発生させる（モック設定）
  3. 2件目、3件目の処理を確認
- **期待結果**:
  - 1件目のIssueはスキップされる（警告ログ出力）
  - 2件目、3件目のIssueは正常に処理される
  - 全体の処理は継続される（中断されない）
- **確認項目**:
  - [ ] 1件目のエラーで処理が中断されない
  - [ ] 警告ログが出力される
  - [ ] 2件目、3件目が正常に処理される

#### TS-INT-012: エージェントJSON parse エラー時のスキップ動作

- **目的**: エージェント出力がJSON parse エラーの場合、該当Issueをスキップすることを検証
- **前提条件**:
  - 複数のIssueが検品対象
  - 1件目のIssue検品でエージェントが不正なJSON出力を返す
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ limit: 3, ... })` を呼び出す
  2. 1件目のIssue検品でエージェントが不正なJSON出力を返す（モック設定）
  3. 2件目、3件目の処理を確認
- **期待結果**:
  - 1件目のIssueはスキップされる（警告ログ出力: "Failed to parse inspection result"）
  - 2件目、3件目のIssueは正常に処理される
  - 全体の処理は継続される（中断されない）
- **確認項目**:
  - [ ] JSON parseエラーが適切にキャッチされる
  - [ ] 警告ログが出力される
  - [ ] 2件目、3件目が正常に処理される

### 2.3 IssueInspector と GitHub API の連携フロー

#### TS-INT-013: エンドツーエンドの検品フロー（正常系）

- **目的**: Issue一覧取得 → カテゴリフィルタ → エージェント検品 → クローズ判定の全フローが正常に動作することを検証
- **前提条件**:
  - リポジトリに3件のオープンIssueが存在する
  - Issue #1: FOLLOW-UP、最終更新30日前、エージェント推奨 `close`、confidence 0.85
  - Issue #2: FOLLOW-UP、最終更新30日前、エージェント推奨 `keep`、confidence 0.80
  - Issue #3: FOLLOW-UP、最終更新30日前、エージェント推奨 `close`、confidence 0.65
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ category: 'followup', confidenceThreshold: 0.7, dryRun: true })` を呼び出す
  2. 全フローを実行
- **期待結果**:
  - Issue #1のみがクローズ候補として表示される（recommendation=close、confidence≥0.7）
  - Issue #2はスキップされる（recommendation=keep）
  - Issue #3はスキップされる（confidence<0.7）
  - dry-runモードのため、実際にはクローズされない
- **確認項目**:
  - [ ] カテゴリフィルタが正しく動作する（FOLLOW-UP Issueのみ対象）
  - [ ] エージェント検品が全Issue（3件）で実行される
  - [ ] confidence閾値フィルタが正しく動作する
  - [ ] クローズ候補がコンソールに表示される
  - [ ] 実際にはクローズされない（dry-run）

#### TS-INT-014: エンドツーエンドの検品フロー（複数Issue処理）

- **目的**: 複数Issueの検品とクローズが順次実行されることを検証
- **前提条件**:
  - リポジトリに5件のオープンIssueが存在する
  - 全て FOLLOW-UP Issue、最終更新30日前、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ category: 'followup', limit: 5, dryRun: false })` を呼び出す
  2. 全フローを実行
- **期待結果**:
  - 5件全てがクローズ候補として表示される
  - 5件全てが実際にクローズされる（dry-run=false）
  - 各Issueに対してクローズコメントが投稿される
  - 各Issueに `auto-closed` ラベルが付与される
  - クローズ履歴が記録される
- **確認項目**:
  - [ ] 5件全てが処理される
  - [ ] GitHub API の closeIssue() が5回呼び出される
  - [ ] GitHub API の postComment() が5回呼び出される
  - [ ] GitHub API の addLabels() が5回呼び出される
  - [ ] クローズ履歴ファイルに5件のエントリが記録される

### 2.4 dry-runモードの動作確認

#### TS-INT-015: dry-runモード有効時（デフォルト）

- **目的**: dry-runモード有効時、実際にはクローズされないことを検証
- **前提条件**:
  - リポジトリに1件のオープンIssueが存在する
  - Issue #1: FOLLOW-UP、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ category: 'followup', dryRun: true })` を呼び出す
  2. クローズ処理を確認
- **期待結果**:
  - Issue #1がクローズ候補として表示される
  - コンソールに "DRY RUN: The following issues would be closed:" と表示される
  - GitHub API の closeIssue() が呼び出されない
  - GitHub API の postComment() が呼び出されない
  - GitHub API の addLabels() が呼び出されない
  - クローズ履歴が記録されない
- **確認項目**:
  - [ ] クローズ候補が表示される
  - [ ] dry-runメッセージが表示される
  - [ ] GitHub API呼び出しがない
  - [ ] クローズ履歴が記録されない

#### TS-INT-016: dry-runモード無効時

- **目的**: dry-runモード無効時、実際にクローズされることを検証
- **前提条件**:
  - リポジトリに1件のオープンIssueが存在する
  - Issue #1: FOLLOW-UP、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. `handleAutoCloseIssueCommand({ category: 'followup', dryRun: false })` を呼び出す
  2. クローズ処理を確認
- **期待結果**:
  - Issue #1がクローズ候補として表示される
  - GitHub API の closeIssue(1) が呼び出される
  - GitHub API の postComment(1, ...) が呼び出される
  - GitHub API の addLabels(1, ['auto-closed']) が呼び出される
  - クローズ履歴が記録される
- **確認項目**:
  - [ ] クローズ候補が表示される
  - [ ] GitHub API呼び出しが実行される（closeIssue, postComment, addLabels）
  - [ ] クローズ履歴が記録される

### 2.5 エンドツーエンドのコマンド実行フロー

#### TS-INT-017: コマンド実行（followupカテゴリ、dry-run）

- **目的**: CLIコマンド `auto-close-issue --category followup --dry-run` が正常に実行されることを検証
- **前提条件**:
  - リポジトリに3件のオープンIssueが存在する
  - Issue #1: FOLLOW-UP、エージェント推奨 `close`、confidence 0.85
  - Issue #2: Bug（FOLLOW-UPでない）
  - Issue #3: FOLLOW-UP、エージェント推奨 `keep`、confidence 0.80
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue --category followup --dry-run` を実行
  2. 出力を確認
- **期待結果**:
  - Issue #1のみがクローズ候補として表示される
  - Issue #2はカテゴリフィルタでスキップされる
  - Issue #3はエージェント推奨でスキップされる（recommendation=keep）
  - "DRY RUN: The following issues would be closed:" と表示される
  - サマリーが表示される（処理件数、クローズ候補件数、スキップ件数）
- **確認項目**:
  - [ ] コマンドが正常終了する（終了コード0）
  - [ ] クローズ候補が正しく表示される（Issue #1のみ）
  - [ ] dry-runメッセージが表示される
  - [ ] サマリーが表示される

#### TS-INT-018: コマンド実行（staleカテゴリ、実際のクローズ）

- **目的**: CLIコマンド `auto-close-issue --category stale --dry-run=false --limit 5` が正常に実行されることを検証
- **前提条件**:
  - リポジトリに5件のオープンIssueが存在する
  - 全て最終更新100日前、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue --category stale --dry-run=false --limit 5` を実行
  2. 出力とGitHub APIを確認
- **期待結果**:
  - 5件全てがクローズ候補として表示される
  - 5件全てが実際にクローズされる
  - 各Issueに対してクローズコメントが投稿される
  - 各Issueに `auto-closed` ラベルが付与される
  - サマリーが表示される（処理件数: 5、クローズ件数: 5、スキップ件数: 0）
- **確認項目**:
  - [ ] コマンドが正常終了する（終了コード0）
  - [ ] 5件全てがクローズされる
  - [ ] GitHub API呼び出しが実行される
  - [ ] サマリーが正しい

#### TS-INT-019: コマンド実行（limitオプション制限）

- **目的**: `--limit` オプションで処理件数が制限されることを検証
- **前提条件**:
  - リポジトリに20件のオープンIssueが存在する
  - 全て FOLLOW-UP Issue、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue --category followup --limit 10 --dry-run` を実行
  2. 出力を確認
- **期待結果**:
  - 10件のみが処理される（20件中）
  - 10件全てがクローズ候補として表示される
  - サマリーに処理件数: 10と表示される
- **確認項目**:
  - [ ] 10件のみが処理される
  - [ ] サマリーが正しい（処理件数: 10）
  - [ ] 残り10件は処理されない

#### TS-INT-020: コマンド実行（--require-approval オプション）

- **目的**: `--require-approval` オプションで対話的確認が要求されることを検証
- **前提条件**:
  - リポジトリに1件のオープンIssueが存在する
  - Issue #1: FOLLOW-UP、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue --category followup --require-approval --dry-run=false` を実行
  2. 対話的確認プロンプトに "yes" を入力
  3. 出力を確認
- **期待結果**:
  - クローズ候補が表示される（Issue #1）
  - 対話的確認プロンプトが表示される: "Do you want to close these issues? (yes/no)"
  - "yes" 入力後、Issue #1がクローズされる
- **確認項目**:
  - [ ] 対話的確認プロンプトが表示される
  - [ ] "yes" 入力後にクローズされる
  - [ ] "no" 入力時は処理が中断される（別テストケース）

#### TS-INT-021: コマンド実行（--require-approval で拒否）

- **目的**: `--require-approval` オプションで "no" 入力時、処理が中断されることを検証
- **前提条件**:
  - リポジトリに1件のオープンIssueが存在する
  - Issue #1: FOLLOW-UP、エージェント推奨 `close`、confidence 0.85
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue --category followup --require-approval --dry-run=false` を実行
  2. 対話的確認プロンプトに "no" を入力
  3. 出力を確認
- **期待結果**:
  - クローズ候補が表示される（Issue #1）
  - 対話的確認プロンプトが表示される: "Do you want to close these issues? (yes/no)"
  - "no" 入力後、処理が中断される（クローズされない）
  - メッセージが表示される: "Operation cancelled by user."
- **確認項目**:
  - [ ] 対話的確認プロンプトが表示される
  - [ ] "no" 入力後に処理が中断される
  - [ ] Issue #1がクローズされない
  - [ ] メッセージが表示される

### 2.6 エラーケース

#### TS-INT-022: 環境変数未設定エラー（GITHUB_TOKEN）

- **目的**: `GITHUB_TOKEN` 環境変数が未設定の場合、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - `GITHUB_TOKEN` 環境変数が未設定
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue` を実行
  2. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "GITHUB_TOKEN environment variable is required."
  - コマンドが異常終了する（終了コード1）
- **確認項目**:
  - [ ] エラーメッセージが明確
  - [ ] 終了コードが1
  - [ ] 処理が実行されない

#### TS-INT-023: 環境変数未設定エラー（GITHUB_REPOSITORY）

- **目的**: `GITHUB_REPOSITORY` 環境変数が未設定の場合、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY` 環境変数が未設定
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue` を実行
  2. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "GITHUB_REPOSITORY environment variable is required."
  - コマンドが異常終了する（終了コード1）
- **確認項目**:
  - [ ] エラーメッセージが明確
  - [ ] 終了コードが1
  - [ ] 処理が実行されない

#### TS-INT-024: エージェントAPIキー未設定エラー

- **目的**: エージェントAPIキーが全て未設定の場合、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - `CODEX_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_CREDENTIALS_PATH` 全てが未設定
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue` を実行
  2. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "No agent credentials found. Please set CODEX_API_KEY or CLAUDE_CODE_CREDENTIALS_PATH."
  - コマンドが異常終了する（終了コード1）
- **確認項目**:
  - [ ] エラーメッセージが明確
  - [ ] 終了コードが1
  - [ ] 処理が実行されない

#### TS-INT-025: CLIオプションバリデーションエラー

- **目的**: 無効なCLIオプション指定時、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - CLI引数に無効な値を指定
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue --limit 100` を実行（limitが範囲外）
  2. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "--limit must be between 1 and 50"
  - コマンドが異常終了する（終了コード1）
- **確認項目**:
  - [ ] エラーメッセージが明確
  - [ ] 終了コードが1
  - [ ] 処理が実行されない

#### TS-INT-026: Issue一覧取得失敗（GitHub APIエラー）

- **目的**: GitHub APIからIssue一覧取得が失敗した場合、適切にハンドリングされることを検証
- **前提条件**:
  - GitHub APIモックが500エラーを返すように設定
- **テスト手順**:
  1. コマンドラインから `node dist/index.js auto-close-issue` を実行
  2. エラーハンドリングを確認
- **期待結果**:
  - エラーメッセージが表示される: "Failed to fetch issues from GitHub: ..."
  - コマンドが異常終了する（終了コード1）
- **確認項目**:
  - [ ] GitHub APIエラーが適切にキャッチされる
  - [ ] エラーメッセージが表示される
  - [ ] 終了コードが1

## 3. テストデータ

### 3.1 Unitテスト用テストデータ

#### CLIオプションパース用データ

```typescript
// デフォルト値テスト
const defaultOptions = {};

// 全オプション指定テスト
const allOptions = {
  category: 'stale',
  limit: '20',
  dryRun: 'false',
  confidenceThreshold: '0.8',
  daysThreshold: '120',
  requireApproval: 'true',
  excludeLabels: 'wontfix,duplicate',
  agent: 'codex'
};

// 境界値テスト
const limitBoundary = [1, 50, 0, 51, -5];
const confidenceBoundary = [0.0, 1.0, -0.1, 1.1];
const daysThresholdBoundary = [1, 90, 180, -10];
```

#### カテゴリフィルタリング用Issueデータ

```typescript
const testIssues = [
  {
    number: 1,
    title: '[FOLLOW-UP] Add logging',
    body: 'Issue body',
    labels: [{ name: 'enhancement' }],
    created_at: '2024-01-01T00:00:00Z', // 394日前
    updated_at: '2024-10-01T00:00:00Z'  // 121日前
  },
  {
    number: 2,
    title: 'Bug: Login failure',
    body: 'Issue body',
    labels: [{ name: 'bug' }],
    created_at: '2024-05-01T00:00:00Z', // 274日前
    updated_at: '2025-01-20T00:00:00Z'  // 10日前
  },
  {
    number: 3,
    title: '[FOLLOW-UP] Refactor API',
    body: 'Issue body',
    labels: [{ name: 'enhancement' }],
    created_at: '2024-06-01T00:00:00Z', // 243日前
    updated_at: '2024-09-01T00:00:00Z'  // 151日前
  }
];
```

#### エージェント出力JSON用データ

```typescript
// 正常なJSON出力
const validJSON = `{
  "issue_number": 123,
  "recommendation": "close",
  "confidence": 0.85,
  "reasoning": "元Issueクローズ済み、ログ機能実装済み",
  "close_comment": "このIssueは対応完了のためクローズします。",
  "suggested_actions": []
}`;

// 必須フィールド欠落
const missingFieldJSON = `{
  "issue_number": 123,
  "confidence": 0.85,
  "reasoning": "理由"
}`;

// 不正なJSON形式
const invalidJSON = '{ "issue_number": 123, invalid json }';

// 無効なrecommendation値
const invalidRecommendationJSON = `{
  "issue_number": 123,
  "recommendation": "delete",
  "confidence": 0.85,
  "reasoning": "理由",
  "close_comment": "",
  "suggested_actions": []
}`;
```

#### 安全フィルタ用Issueデータ

```typescript
// 除外ラベルあり
const issueWithExcludeLabel = {
  number: 1,
  labels: [{ name: 'do-not-close' }, { name: 'bug' }],
  updated_at: '2024-12-01T00:00:00Z'
};

// 除外ラベルなし
const issueWithoutExcludeLabel = {
  number: 2,
  labels: [{ name: 'bug' }, { name: 'enhancement' }],
  updated_at: '2024-12-01T00:00:00Z'
};

// 最近更新（2日前）
const recentlyUpdatedIssue = {
  number: 3,
  labels: [],
  updated_at: '2025-01-28T00:00:00Z' // 2日前
};

// 古い更新（30日前）
const oldUpdatedIssue = {
  number: 4,
  labels: [],
  updated_at: '2024-12-31T00:00:00Z' // 30日前
};
```

### 3.2 Integrationテスト用テストデータ

#### GitHub API モックレスポンス

```typescript
// Issue一覧取得レスポンス
const getIssuesResponse = {
  data: [
    {
      number: 1,
      title: '[FOLLOW-UP] Add logging',
      body: 'Issue body',
      labels: [{ name: 'enhancement' }],
      created_at: '2024-11-01T00:00:00Z',
      updated_at: '2024-12-01T00:00:00Z',
      state: 'open'
    },
    {
      number: 2,
      title: 'Bug: Login failure',
      body: 'Issue body',
      labels: [{ name: 'bug' }],
      created_at: '2024-11-01T00:00:00Z',
      updated_at: '2024-11-05T00:00:00Z',
      state: 'open'
    }
  ]
};

// Issue詳細取得レスポンス
const getIssueDetailsResponse = {
  issue: {
    number: 123,
    title: '[FOLLOW-UP] Add logging',
    body: 'Issue body',
    labels: [{ name: 'enhancement' }],
    created_at: '2024-11-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    state: 'open'
  },
  comments: [
    {
      id: 1,
      author: 'user1',
      created_at: '2024-11-05T00:00:00Z',
      body: 'Comment 1'
    },
    {
      id: 2,
      author: 'user2',
      created_at: '2024-11-10T00:00:00Z',
      body: 'Comment 2'
    }
  ]
};

// Issueクローズレスポンス
const closeIssueResponse = {
  data: {
    number: 123,
    state: 'closed'
  }
};
```

#### エージェントモック出力

```typescript
// Codex/Claudeエージェント出力（close推奨）
const agentOutputClose = `{
  "issue_number": 123,
  "recommendation": "close",
  "confidence": 0.85,
  "reasoning": "元Issueクローズ済み、ログ機能実装済み",
  "close_comment": "このIssueは対応完了のためクローズします。",
  "suggested_actions": []
}`;

// Codex/Claudeエージェント出力（keep推奨）
const agentOutputKeep = `{
  "issue_number": 123,
  "recommendation": "keep",
  "confidence": 0.80,
  "reasoning": "まだ対応が必要な項目が残っている",
  "close_comment": "",
  "suggested_actions": ["残タスクを完了してからクローズ"]
}`;

// Codex/Claudeエージェント出力（needs_discussion）
const agentOutputNeedsDiscussion = `{
  "issue_number": 123,
  "recommendation": "needs_discussion",
  "confidence": 0.60,
  "reasoning": "判断が難しい。チームで議論が必要",
  "close_comment": "",
  "suggested_actions": ["チームミーティングで議論"]
}`;
```

## 4. テスト環境要件

### 4.1 ローカル開発環境

- **Node.js**: 20.x 以上
- **npm**: 10.x 以上
- **TypeScript**: 5.x
- **テストフレームワーク**: Jest 29.x

### 4.2 CI/CD環境（GitHub Actions）

- **OS**: Ubuntu latest
- **Node.js**: 20.x
- **環境変数**:
  - `GITHUB_TOKEN`: テスト用Personal Access Token（読み取り専用推奨）
  - `GITHUB_REPOSITORY`: テスト用リポジトリ（例: `test-org/test-repo`）
  - `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH`: テスト用エージェント認証情報

### 4.3 モック/スタブの使用

#### Unitテスト

- **モック不要**: 純粋な関数テストのみ
- **例外**: 日付計算関数（`Date.now()` のモック）

#### Integrationテスト

- **GitHub API（Octokit）のモック**: 必須
  - Jestの `jest.mock()` を使用
  - 各APIエンドポイント（`GET /issues`, `PATCH /issues/{number}`, `POST /issues/{number}/comments` 等）のレスポンスをモック
- **エージェント（AgentExecutor）のモック**: 必須
  - Jestの `jest.mock()` を使用
  - `execute()` メソッドの戻り値（JSON文字列）をモック
- **ファイルシステム（プロンプトテンプレート読み込み）のモック**: 必須
  - Jestの `jest.mock('fs')` を使用
  - `readFileSync()` の戻り値をモック

### 4.4 テストデータベース/外部サービス

- **不要**: このプロジェクトはデータベースを使用しない
- **外部サービス**: GitHub API、Codex API、Claude Code APIは全てモックで対応

## 5. 品質ゲート確認

本テストシナリオは以下の品質ゲートを満たしています：

- ✅ **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_INTEGRATION
  - Unitテストシナリオ: 29件（TS-UNIT-001 ～ TS-UNIT-029）
  - Integrationテストシナリオ: 26件（TS-INT-001 ～ TS-INT-026）

- ✅ **主要な正常系がカバーされている**
  - CLIオプションパース（デフォルト値、全オプション指定）
  - カテゴリフィルタリング（followup, stale, old, all）
  - エージェント出力JSONパース（正常なJSON）
  - 安全フィルタ（除外ラベルなし、古い更新）
  - GitHub API連携（Issue一覧取得、Issue詳細取得、クローズ、コメント投稿、ラベル付与）
  - エージェント統合（Codex/Claude実行）
  - エンドツーエンドフロー（検品 → クローズ判定 → クローズ処理）
  - dry-runモード（有効/無効）

- ✅ **主要な異常系がカバーされている**
  - CLIオプションバリデーションエラー（limit範囲外、confidence範囲外、daysThreshold負の値）
  - エージェント出力異常（必須フィールド欠落、不正なJSON、無効なrecommendation値、confidence範囲外）
  - 安全フィルタ（除外ラベルあり、最近更新、confidence閾値未満、recommendation=keep/needs_discussion）
  - GitHub APIエラー（認証エラー、レート制限、Issue一覧取得失敗）
  - エージェント実行失敗（タイムアウト、JSON parseエラー）
  - 環境変数未設定エラー（GITHUB_TOKEN, GITHUB_REPOSITORY, エージェントAPIキー）

- ✅ **期待結果が明確である**
  - 各テストケースで「期待結果」セクションに具体的な出力値・動作を記載
  - 確認項目（チェックリスト）で検証ポイントを明確化
  - 境界値テストで境界値を明示

## 6. 参考情報

### 関連ドキュメント

- **要件定義書**: `.ai-workflow/issue-176/01_requirements/output/requirements.md`
- **設計書**: `.ai-workflow/issue-176/02_design/output/design.md`
- **Planning Document**: `.ai-workflow/issue-176/00_planning/output/planning.md`

### テストコード実装時の参考

- **既存のユニットテスト**: `tests/unit/commands/auto-issue.test.ts`
- **既存のインテグレーションテスト**: `tests/integration/auto-issue.test.ts`
- **既存のモックパターン**: `tests/unit/core/repository-analyzer.test.ts`

---

**作成日**: 2025-01-30
**バージョン**: 1.0
**ステータス**: レビュー待ち
**テスト戦略**: UNIT_INTEGRATION
**Unitテストシナリオ数**: 29件
**Integrationテストシナリオ数**: 26件
**合計テストシナリオ数**: 55件
