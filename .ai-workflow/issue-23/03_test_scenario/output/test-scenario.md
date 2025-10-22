# テストシナリオ - Issue #23: BasePhase アーキテクチャの分割

## 0. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION** (Phase 2で決定)

### テスト対象の範囲
1. **Unitテスト**: 新規作成される4つのモジュールの単体動作検証
   - `LogFormatter` - エージェントログのフォーマット変換
   - `ProgressFormatter` - 進捗表示フォーマット
   - `AgentExecutor` - エージェント実行ロジック
   - `ReviewCycleManager` - レビューサイクル管理

2. **Integrationテスト**: BasePhaseと各モジュールの連携動作検証
   - 全フェーズ実行テスト（エンドツーエンド）
   - レビューサイクル動作確認
   - Git コミット＆プッシュ連携確認
   - エージェントログフォーマット維持確認

### テストの目的
1. **リグレッションゼロ**: 既存のフェーズ実行動作に影響がないことを確認
2. **モジュールの正確性**: 各モジュールが責務を正しく果たすことを確認
3. **行数削減の達成**: base-phase.ts が300行以下に削減されていることを確認
4. **保守性の向上**: 各モジュールが単一の責務を持ち、コードの見通しが良いことを確認

### テストカバレッジ目標
- **ユニットテスト**: 80%以上
- **統合テスト**: 既存テスト（`tests/integration/preset-execution.test.ts` 等）が100%パス

---

## 1. Unitテストシナリオ

### 1.1 LogFormatter モジュール

#### テストファイル
`tests/unit/phases/formatters/log-formatter.test.ts`

---

#### テストケース 1-1: formatAgentLog_Claude_正常系

**目的**: Claude エージェントの生ログが正しく Markdown に変換されることを検証

**前提条件**:
- LogFormatter インスタンスが生成されている

**入力**:
```typescript
messages = [
  '{"type": "turn_start", "turn_number": 1}',
  '{"type": "tool_use", "tool": "Read", "path": "/path/to/file.ts"}',
  '{"type": "turn_complete", "turn_number": 1}'
]
startTime = 1706000000000  // 2024-01-23 12:00:00
endTime = 1706000120000    // 2024-01-23 12:02:00
duration = 120000          // 2分
error = null
agentName = 'Claude Agent'
```

**期待結果**:
- Markdown 形式のログが返される
- 以下の情報が含まれる:
  - エージェント名: "Claude Agent"
  - 実行時間: "2分0秒"
  - 開始時刻: "2024-01-23 12:00:00"
  - 終了時刻: "2024-01-23 12:02:00"
  - ターンごとの内訳（turn_start、tool_use、turn_complete）
- エラー情報は含まれない

**テストデータ**: 上記 messages

---

#### テストケース 1-2: formatCodexAgentLog_正常系

**目的**: Codex エージェントの JSON イベントストリームが正しく Markdown に変換されることを検証

**前提条件**:
- LogFormatter インスタンスが生成されている

**入力**:
```typescript
messages = [
  '{"type": "thread.started", "thread_id": "thread_123"}',
  '{"type": "item.started", "item": {"type": "tool_use", "name": "Glob"}}',
  '{"type": "item.output", "output": "matched 5 files"}',
  '{"type": "item.completed", "item": {"type": "tool_use", "name": "Glob"}}',
  '{"type": "response.completed", "usage": {"input_tokens": 100, "output_tokens": 50, "total_cost_usd": 0.005}}'
]
startTime = 1706000000000
endTime = 1706000060000
duration = 60000  // 1分
error = null
```

**期待結果**:
- Markdown 形式のログが返される
- 以下の情報が含まれる:
  - エージェント名: "Codex Agent"
  - 実行時間: "1分0秒"
  - ターン1の内訳:
    - スレッド開始 (thread_id: thread_123)
    - ツール実行: Glob
    - 出力: "matched 5 files"
    - ツール完了
  - 利用量: input_tokens=100, output_tokens=50, total_cost_usd=0.005

**テストデータ**: 上記 messages

---

#### テストケース 1-3: formatCodexAgentLog_4000文字超過_切り詰め

**目的**: 4000文字を超える出力が正しく切り詰められることを検証

**前提条件**:
- LogFormatter インスタンスが生成されている

**入力**:
```typescript
messages = [
  '{"type": "item.output", "output": "' + 'a'.repeat(5000) + '"}'
]
startTime = 1706000000000
endTime = 1706000060000
duration = 60000
error = null
```

**期待結果**:
- Markdown 形式のログが返される
- 出力が4000文字に切り詰められている
- "...(truncated)" のような表示が含まれる

**テストデータ**: 上記 messages

---

#### テストケース 1-4: formatAgentLog_エラー発生時

**目的**: エージェント実行中のエラーが正しくログに含まれることを検証

**前提条件**:
- LogFormatter インスタンスが生成されている

**入力**:
```typescript
messages = []
startTime = 1706000000000
endTime = 1706000060000
duration = 60000
error = new Error('Authentication failed: invalid bearer token')
agentName = 'Codex Agent'
```

**期待結果**:
- Markdown 形式のログが返される
- エラー情報が含まれる:
  - エラーメッセージ: "Authentication failed: invalid bearer token"
  - エラーセクションが明示的に表示される

**テストデータ**: 上記 error

---

#### テストケース 1-5: formatCodexAgentLog_JSON解析失敗

**目的**: 不正な JSON が渡された場合に null が返されることを検証

**前提条件**:
- LogFormatter インスタンスが生成されている

**入力**:
```typescript
messages = [
  'invalid json {{{',
  '{"type": "thread.started"}'
]
startTime = 1706000000000
endTime = 1706000060000
duration = 60000
error = null
```

**期待結果**:
- `null` が返される（JSON 解析失敗）

**テストデータ**: 上記 messages

---

### 1.2 ProgressFormatter モジュール

#### テストファイル
`tests/unit/phases/formatters/progress-formatter.test.ts`

---

#### テストケース 2-1: formatProgressComment_in_progress_正常系

**目的**: 進行中フェーズの進捗コメントが正しくフォーマットされることを検証

**前提条件**:
- ProgressFormatter インスタンスが生成されている
- モックされた MetadataManager が存在する
  - planning: completed
  - requirements: in_progress (retry_count=1)
  - design: pending

**入力**:
```typescript
currentPhase = 'requirements'
status = 'in_progress'
metadata = mockMetadataManager
details = 'Analyzing existing code...'
```

**期待結果**:
- Markdown 形式の進捗コメントが返される
- 以下の情報が含まれる:
  - フェーズステータス一覧:
    - ✅ Phase 0: Planning (完了時刻)
    - 🔄 Phase 1: Requirements (開始時刻)
    - ⏸️ Phase 2: Design
  - 現在のフェーズ詳細:
    - フェーズ名: Requirements
    - ステータス: in_progress
    - 試行回数: 1回目
    - 詳細: "Analyzing existing code..."
  - 最終更新時刻

**テストデータ**: モックされた MetadataManager

---

#### テストケース 2-2: formatProgressComment_completed_正常系

**目的**: 完了フェーズの進捗コメントが正しくフォーマットされることを検証

**前提条件**:
- ProgressFormatter インスタンスが生成されている
- モックされた MetadataManager が存在する
  - planning: completed
  - requirements: completed
  - design: in_progress

**入力**:
```typescript
currentPhase = 'design'
status = 'in_progress'
metadata = mockMetadataManager
details = undefined
```

**期待結果**:
- Markdown 形式の進捗コメントが返される
- 完了したフェーズ（planning、requirements）の詳細が折りたたみ表示（`<details>`）で含まれる
- レビュー結果、完了時刻が表示される

**テストデータ**: モックされた MetadataManager

---

#### テストケース 2-3: formatProgressComment_failed_異常系

**目的**: 失敗フェーズの進捗コメントが正しくフォーマットされることを検証

**前提条件**:
- ProgressFormatter インスタンスが生成されている
- モックされた MetadataManager が存在する
  - planning: completed
  - requirements: failed (retry_count=3)

**入力**:
```typescript
currentPhase = 'requirements'
status = 'failed'
metadata = mockMetadataManager
details = 'Max retries reached'
```

**期待結果**:
- Markdown 形式の進捗コメントが返される
- フェーズステータス一覧に ❌ が表示される
- 詳細に "Max retries reached" が含まれる
- 試行回数が "3回目" と表示される

**テストデータ**: モックされた MetadataManager

---

#### テストケース 2-4: formatProgressComment_絵文字マッピング

**目的**: 各ステータスに対応する絵文字が正しく表示されることを検証

**前提条件**:
- ProgressFormatter インスタンスが生成されている

**入力**:
```typescript
各ステータス（pending, in_progress, completed, failed）に対して実行
```

**期待結果**:
- pending → ⏸️
- in_progress → 🔄
- completed → ✅
- failed → ❌

**テストデータ**: 各ステータスのモック MetadataManager

---

### 1.3 AgentExecutor モジュール

#### テストファイル
`tests/unit/phases/core/agent-executor.test.ts`

---

#### テストケース 3-1: executeWithAgent_Codex_正常系

**目的**: Codex エージェントが正常に実行されることを検証

**前提条件**:
- AgentExecutor インスタンスが生成されている（Codex あり、Claude なし）
- モックされた CodexAgentClient が存在する
  - `executeTask()` は成功を返す（messages=['{"type": "response.completed"}']）

**入力**:
```typescript
prompt = 'Analyze the codebase'
options = { maxTurns: 10, verbose: true }
```

**期待結果**:
- `executeTask()` が1回呼び出される
- 返り値が messages 配列である
- プロンプトファイル（`prompt.txt`）が保存される
- 生ログ（`agent_log_raw.txt`）が保存される
- フォーマット済みログ（`agent_log.md`）が保存される
- 利用量メトリクスが記録される（`metadata.addCost()` が呼び出される）

**テストデータ**: モックされた CodexAgentClient

---

#### テストケース 3-2: executeWithAgent_認証エラー_フォールバック

**目的**: Codex の認証エラー時に Claude へフォールバックすることを検証

**前提条件**:
- AgentExecutor インスタンスが生成されている（Codex あり、Claude あり）
- モックされた CodexAgentClient が存在する
  - `executeTask()` は認証エラーをスロー（"invalid bearer token"）
- モックされた ClaudeAgentClient が存在する
  - `executeTask()` は成功を返す

**入力**:
```typescript
prompt = 'Analyze the codebase'
options = { maxTurns: 10 }
```

**期待結果**:
- Codex の `executeTask()` が1回呼び出される（失敗）
- Claude の `executeTask()` が1回呼び出される（成功）
- フォールバックメッセージがログに記録される
- 返り値が Claude からの messages 配列である

**テストデータ**: モックされた CodexAgentClient（エラー）、ClaudeAgentClient（成功）

---

#### テストケース 3-3: executeWithAgent_空出力_フォールバック

**目的**: プライマリエージェントが空出力を返した場合に代替エージェントへフォールバックすることを検証

**前提条件**:
- AgentExecutor インスタンスが生成されている（Claude あり、Codex あり）
- モックされた ClaudeAgentClient が存在する
  - `executeTask()` は空配列を返す（messages=[]）
- モックされた CodexAgentClient が存在する
  - `executeTask()` は成功を返す

**入力**:
```typescript
prompt = 'Analyze the codebase'
options = { maxTurns: 10 }
```

**期待結果**:
- Claude の `executeTask()` が1回呼び出される（空出力）
- Codex の `executeTask()` が1回呼び出される（成功）
- フォールバックメッセージがログに記録される
- 返り値が Codex からの messages 配列である

**テストデータ**: モックされた ClaudeAgentClient（空出力）、CodexAgentClient（成功）

---

#### テストケース 3-4: extractUsageMetrics_JSON解析_正常系

**目的**: JSON メッセージから利用量メトリクスが正しく抽出されることを検証

**前提条件**:
- AgentExecutor インスタンスが生成されている

**入力**:
```typescript
messages = [
  '{"type": "other"}',
  '{"type": "response.completed", "usage": {"input_tokens": 1000, "output_tokens": 500, "total_cost_usd": 0.05}}'
]
```

**期待結果**:
- 利用量メトリクスが正しく抽出される:
  - inputTokens: 1000
  - outputTokens: 500
  - totalCostUsd: 0.05
- `getLastExecutionMetrics()` で取得可能

**テストデータ**: 上記 messages

---

#### テストケース 3-5: extractUsageMetrics_正規表現フォールバック

**目的**: JSON 解析失敗時に正規表現で利用量メトリクスが抽出されることを検証

**前提条件**:
- AgentExecutor インスタンスが生成されている

**入力**:
```typescript
messages = [
  'Input tokens: 1200\nOutput tokens: 600\nTotal cost: $0.06'
]
```

**期待結果**:
- 正規表現で利用量メトリクスが抽出される:
  - inputTokens: 1200
  - outputTokens: 600
  - totalCostUsd: 0.06

**テストデータ**: 上記 messages

---

#### テストケース 3-6: recordUsageMetrics_メタデータ記録

**目的**: 利用量メトリクスがメタデータに正しく記録されることを検証

**前提条件**:
- AgentExecutor インスタンスが生成されている
- モックされた MetadataManager が存在する

**入力**:
```typescript
metrics = {
  inputTokens: 1000,
  outputTokens: 500,
  totalCostUsd: 0.05
}
```

**期待結果**:
- `metadata.addCost()` が1回呼び出される
- 呼び出し引数が以下と一致:
  - inputTokens: 1000
  - outputTokens: 500
  - totalCostUsd: 0.05

**テストデータ**: 上記 metrics

---

### 1.4 ReviewCycleManager モジュール

#### テストファイル
`tests/unit/phases/core/review-cycle-manager.test.ts`

---

#### テストケース 4-1: performReviseStepWithRetry_1回目成功

**目的**: revise ステップが1回目で成功することを検証

**前提条件**:
- ReviewCycleManager インスタンスが生成されている
- モックされた関数が存在する:
  - `reviewFn`: 1回目は成功を返す（`{ success: true }`）
  - `reviseFn`: 成功を返す（`{ success: true }`）
  - `postProgressFn`: 成功を返す
  - `commitAndPushStepFn`: 成功を返す

**入力**:
```typescript
gitManager = mockGitManager
initialReviewResult = { success: false, feedback: 'Missing documentation' }
reviewFn = mockReviewFn
reviseFn = mockReviseFn
postProgressFn = mockPostProgressFn
commitAndPushStepFn = mockCommitAndPushStepFn
```

**期待結果**:
- `reviseFn()` が1回呼び出される（feedback='Missing documentation'）
- `commitAndPushStepFn('revise')` が1回呼び出される
- `reviewFn()` が1回呼び出される（revise 後のレビュー）
- `commitAndPushStepFn('review')` が1回呼び出される
- レビューサイクルが成功で終了
- リトライカウントが1のまま

**テストデータ**: モックされた関数

---

#### テストケース 4-2: performReviseStepWithRetry_3回目成功

**目的**: revise ステップが3回目で成功することを検証

**前提条件**:
- ReviewCycleManager インスタンスが生成されている
- モックされた関数が存在する:
  - `reviewFn`: 1回目・2回目は失敗、3回目は成功を返す
  - `reviseFn`: 成功を返す
  - `postProgressFn`: 成功を返す
  - `commitAndPushStepFn`: 成功を返す

**入力**:
```typescript
gitManager = mockGitManager
initialReviewResult = { success: false, feedback: 'Issues found' }
reviewFn = mockReviewFn (1・2回目失敗、3回目成功)
reviseFn = mockReviseFn
postProgressFn = mockPostProgressFn
commitAndPushStepFn = mockCommitAndPushStepFn
```

**期待結果**:
- `reviseFn()` が3回呼び出される
- `commitAndPushStepFn('revise')` が3回呼び出される
- `reviewFn()` が3回呼び出される
- `commitAndPushStepFn('review')` が1回呼び出される（3回目成功時のみ）
- レビューサイクルが成功で終了
- リトライカウントが3に更新される

**テストデータ**: モックされた関数

---

#### テストケース 4-3: performReviseStepWithRetry_最大リトライ到達_失敗

**目的**: 最大リトライ回数（3回）に達した場合に例外がスローされることを検証

**前提条件**:
- ReviewCycleManager インスタンスが生成されている
- モックされた関数が存在する:
  - `reviewFn`: 常に失敗を返す
  - `reviseFn`: 成功を返す
  - `postProgressFn`: 成功を返す
  - `commitAndPushStepFn`: 成功を返す

**入力**:
```typescript
gitManager = mockGitManager
initialReviewResult = { success: false, feedback: 'Issues found' }
reviewFn = mockReviewFn (常に失敗)
reviseFn = mockReviseFn
postProgressFn = mockPostProgressFn
commitAndPushStepFn = mockCommitAndPushStepFn
```

**期待結果**:
- `reviseFn()` が3回呼び出される
- `reviewFn()` が3回呼び出される
- 例外がスローされる（"Max retries reached" のようなメッセージ）
- リトライカウントが3に更新される

**テストデータ**: モックされた関数

---

#### テストケース 4-4: performReviseStepWithRetry_revise完了済みスキップ

**目的**: revise ステップが既に完了している場合にスキップされることを検証

**前提条件**:
- ReviewCycleManager インスタンスが生成されている
- モックされた MetadataManager が存在する
  - completed_steps に 'revise' が含まれている

**入力**:
```typescript
gitManager = mockGitManager
initialReviewResult = { success: false, feedback: 'Issues found' }
reviewFn = mockReviewFn
reviseFn = mockReviseFn
postProgressFn = mockPostProgressFn
commitAndPushStepFn = mockCommitAndPushStepFn
```

**期待結果**:
- `reviseFn()` が呼び出されない（スキップ）
- レビューサイクルがすぐに終了

**テストデータ**: モックされた MetadataManager

---

#### テストケース 4-5: performReviseStepWithRetry_Git無効時

**目的**: Git マネージャーが null の場合でも正常動作することを検証

**前提条件**:
- ReviewCycleManager インスタンスが生成されている
- gitManager = null

**入力**:
```typescript
gitManager = null
initialReviewResult = { success: false, feedback: 'Issues found' }
reviewFn = mockReviewFn (1回目成功)
reviseFn = mockReviseFn
postProgressFn = mockPostProgressFn
commitAndPushStepFn = mockCommitAndPushStepFn (何もしない)
```

**期待結果**:
- `commitAndPushStepFn()` が呼び出されるが、実際には何もしない
- レビューサイクルが正常終了

**テストデータ**: gitManager = null

---

## 2. Integrationテストシナリオ

### 2.1 全フェーズ実行テスト（エンドツーエンド）

#### シナリオ名
BasePhase + 各モジュールの連携による全フェーズ実行

#### 目的
リファクタリング後も、既存の全フェーズ実行テストがパスすることを検証

#### 前提条件
- 既存の統合テスト `tests/integration/preset-execution.test.ts` が存在する
- リファクタリング後の BasePhase と各モジュールがデプロイされている
- テスト用のリポジトリが存在する

#### テスト手順
1. テスト用 Issue を作成
2. Planning Phase を実行
   - BasePhase.run() → AgentExecutor.executeWithAgent() 呼び出し確認
   - ProgressFormatter.formatProgressComment() 呼び出し確認
   - LogFormatter.formatAgentLog() 呼び出し確認
3. Requirements Phase を実行
   - ReviewCycleManager.performReviseStepWithRetry() 呼び出し確認
4. 全10フェーズを順次実行

#### 期待結果
- 全フェーズが正常に完了する（`success: true`）
- 各フェーズのメタデータが正しく記録される
- GitHub Issue コメントが正しくフォーマットされる
- エージェントログが正しくフォーマットされる（Codex/Claude）
- Git コミット＆プッシュが正常動作する

#### 確認項目
- [ ] すべてのフェーズステータスが `completed` になっている
- [ ] メタデータファイル（`metadata.json`）が正しく更新されている
- [ ] 成果物ファイル（`planning.md`、`requirements.md` 等）が生成されている
- [ ] GitHub Issue コメントが投稿されている
- [ ] エージェントログファイル（`agent_log.md`、`agent_log_raw.txt`）が生成されている
- [ ] Git コミットが各ステップで作成されている
- [ ] 利用量メトリクスが記録されている

---

### 2.2 レビューサイクル動作確認

#### シナリオ名
ReviewCycleManager によるレビューサイクルの統合テスト

#### 目的
レビューサイクル（review → revise → review）が正常動作することを検証

#### 前提条件
- BasePhase と ReviewCycleManager がデプロイされている
- テスト用のフェーズ（例: Requirements Phase）が存在する
- モックされた review 関数が存在する（1回目失敗、2回目成功）

#### テスト手順
1. Requirements Phase を実行
2. execute ステップが完了
3. review ステップが実行され、失敗を返す
4. ReviewCycleManager.performReviseStepWithRetry() が呼び出される
5. revise ステップが実行される
6. Git コミット＆プッシュ（revise ステップ）
7. 再度 review ステップが実行され、成功を返す
8. Git コミット＆プッシュ（review ステップ）

#### 期待結果
- レビューサイクルが2回実行される
- revise ステップが1回実行される
- Git コミットが2回作成される（revise、review）
- メタデータの retry_count が1に更新される
- completed_steps に 'revise' と 'review' が追加される

#### 確認項目
- [ ] レビューが2回実行されている（1回目失敗、2回目成功）
- [ ] revise が1回実行されている
- [ ] Git コミットが正しいステップで作成されている
- [ ] retry_count が正しく更新されている
- [ ] completed_steps が正しく更新されている

---

### 2.3 エージェントフォールバック動作確認

#### シナリオ名
AgentExecutor による認証エラー時のフォールバック

#### 目的
Codex の認証エラー時に Claude へフォールバックすることを検証

#### 前提条件
- BasePhase と AgentExecutor がデプロイされている
- Codex API キーが無効（認証エラー発生）
- Claude Code 認証情報が有効

#### テスト手順
1. Planning Phase を実行（execute ステップ）
2. AgentExecutor.executeWithAgent() が Codex を実行
3. Codex が認証エラーをスロー（"invalid bearer token"）
4. AgentExecutor が Claude へフォールバック
5. Claude が正常に実行される
6. エージェントログが保存される（Claude Agent）

#### 期待結果
- Codex の実行が試みられる
- 認証エラーが検出される
- Claude へフォールバックされる
- Claude が正常に実行される
- エージェントログに "Claude Agent" が記録される
- フォールバックメッセージがログに記録される

#### 確認項目
- [ ] Codex の実行が試みられている（ログ確認）
- [ ] 認証エラーが検出されている
- [ ] Claude へフォールバックされている
- [ ] エージェントログファイルに "Claude Agent" が記録されている
- [ ] フォールバックメッセージが記録されている

---

### 2.4 ログフォーマット維持確認

#### シナリオ名
LogFormatter によるログフォーマットの統合テスト

#### 目的
リファクタリング後も、既存のエージェントログフォーマットが維持されることを検証

#### 前提条件
- BasePhase と LogFormatter がデプロイされている
- Planning Phase を実行済み（エージェントログが生成されている）

#### テスト手順
1. Planning Phase の `agent_log.md` を読み込む
2. 以下の情報が含まれているか確認:
   - エージェント名（Codex Agent または Claude Agent）
   - 実行時間（X分Y秒）
   - 開始時刻（YYYY-MM-DD HH:MM:SS）
   - 終了時刻（YYYY-MM-DD HH:MM:SS）
   - ターンごとの内訳（スレッド開始、ツール実行、実行完了）
3. Codex の場合、JSON イベントストリームが正しく解析されているか確認
4. Claude の場合、JSON メッセージが正しく解析されているか確認

#### 期待結果
- エージェントログが Markdown 形式で生成されている
- 既存フォーマットと一致している
- 利用量メトリクスが含まれている（Codex の場合）
- 4000文字を超える出力は切り詰められている

#### 確認項目
- [ ] エージェント名が記録されている
- [ ] 実行時間が記録されている
- [ ] 開始・終了時刻が記録されている
- [ ] ターンごとの内訳が含まれている
- [ ] 利用量メトリクスが含まれている（該当する場合）
- [ ] 4000文字超過時に切り詰められている

---

### 2.5 進捗表示フォーマット確認

#### シナリオ名
ProgressFormatter による進捗表示の統合テスト

#### 目的
リファクタリング後も、GitHub Issue コメントが正しくフォーマットされることを検証

#### 前提条件
- BasePhase と ProgressFormatter がデプロイされている
- テスト用 Issue が存在する
- Planning Phase を実行済み

#### テスト手順
1. Planning Phase 実行中の GitHub Issue コメントを確認
2. Requirements Phase 実行中の GitHub Issue コメントを確認
3. すべてのフェーズ完了後の GitHub Issue コメントを確認

#### 期待結果
- フェーズステータス一覧が正しく表示されている
  - ✅ Phase 0: Planning (完了時刻)
  - 🔄 Phase 1: Requirements (開始時刻)
  - ⏸️ Phase 2: Design
  - ...
- 現在のフェーズ詳細が正しく表示されている
  - フェーズ名、ステータス、試行回数
- 完了したフェーズの詳細が折りたたみ表示されている
- 最終更新時刻が表示されている

#### 確認項目
- [ ] フェーズステータス一覧が正しい
- [ ] 絵文字が正しくマッピングされている
- [ ] 現在のフェーズ詳細が正しい
- [ ] 完了フェーズが折りたたみ表示されている
- [ ] 最終更新時刻が表示されている

---

### 2.6 Git コミット＆プッシュ連携確認

#### シナリオ名
BasePhase と Git 操作の統合テスト

#### 目的
ステップごとの Git コミット＆プッシュが正常動作することを検証

#### 前提条件
- BasePhase がデプロイされている
- Git リポジトリが存在する
- テスト用ブランチが作成されている

#### テスト手順
1. Planning Phase を実行
2. execute ステップ完了後、Git コミットが作成されることを確認
3. review ステップ完了後、Git コミットが作成されることを確認
4. revise ステップ完了後（該当する場合）、Git コミットが作成されることを確認
5. リモートリポジトリにプッシュされることを確認

#### 期待結果
- execute ステップ完了後に Git コミットが作成される
  - コミットメッセージ: "[Planning] Execute step completed"
- review ステップ完了後に Git コミットが作成される
  - コミットメッセージ: "[Planning] Review step completed"
- revise ステップ完了後（該当する場合）に Git コミットが作成される
  - コミットメッセージ: "[Planning] Revise step completed"
- リモートリポジトリにプッシュされる

#### 確認項目
- [ ] execute ステップ後に Git コミットが作成されている
- [ ] review ステップ後に Git コミットが作成されている
- [ ] revise ステップ後に Git コミットが作成されている（該当する場合）
- [ ] コミットメッセージが正しい
- [ ] リモートリポジトリにプッシュされている

---

### 2.7 BasePhase 行数削減達成確認

#### シナリオ名
BasePhase のリファクタリング検証

#### 目的
BasePhase が300行以下に削減されていることを検証

#### 前提条件
- リファクタリング後の BasePhase が存在する

#### テスト手順
1. `src/phases/base-phase.ts` のファイル行数を確認
2. 各モジュール（LogFormatter、ProgressFormatter、AgentExecutor、ReviewCycleManager）が正しくインポートされているか確認
3. 不要なメソッドが削除されているか確認
   - `formatAgentLog()`、`formatCodexAgentLog()`
   - `formatProgressComment()`
   - `executeWithAgent()`、`runAgentTask()`
   - `extractUsageMetrics()`、`recordUsageMetrics()`
   - `performReviseStepWithRetry()`

#### 期待結果
- BasePhase のファイル行数が300行以下である
- 各モジュールが正しくインポートされている
- 不要なメソッドが削除されている
- TypeScript コンパイルエラーがない（`npm run build` が成功）

#### 確認項目
- [ ] ファイル行数が300行以下である
- [ ] 各モジュールがインポートされている
- [ ] 不要なメソッドが削除されている
- [ ] TypeScript コンパイルエラーがない

---

## 3. テストデータ

### 3.1 LogFormatter テストデータ

#### Claude エージェントログサンプル
```json
[
  "{\"type\": \"turn_start\", \"turn_number\": 1}",
  "{\"type\": \"tool_use\", \"tool\": \"Read\", \"path\": \"/path/to/file.ts\"}",
  "{\"type\": \"tool_result\", \"output\": \"file content here\"}",
  "{\"type\": \"turn_complete\", \"turn_number\": 1}"
]
```

#### Codex エージェントログサンプル
```json
[
  "{\"type\": \"thread.started\", \"thread_id\": \"thread_abc123\"}",
  "{\"type\": \"item.started\", \"item\": {\"type\": \"tool_use\", \"name\": \"Glob\"}}",
  "{\"type\": \"item.output\", \"output\": \"matched 10 files\"}",
  "{\"type\": \"item.completed\", \"item\": {\"type\": \"tool_use\", \"name\": \"Glob\"}}",
  "{\"type\": \"response.completed\", \"usage\": {\"input_tokens\": 500, \"output_tokens\": 300, \"total_cost_usd\": 0.02}}"
]
```

### 3.2 ProgressFormatter テストデータ

#### モック MetadataManager
```typescript
{
  getPhaseStatus: (phase) => {
    // planning: completed, requirements: in_progress, design: pending
    if (phase === 'planning') return { status: 'completed', completed_at: '2024-01-23 12:00:00' };
    if (phase === 'requirements') return { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 1 };
    if (phase === 'design') return { status: 'pending' };
  }
}
```

### 3.3 AgentExecutor テストデータ

#### モック CodexAgentClient
```typescript
{
  executeTask: jest.fn().mockResolvedValue([
    '{"type": "response.completed", "usage": {"input_tokens": 1000, "output_tokens": 500, "total_cost_usd": 0.05}}'
  ])
}
```

#### モック ClaudeAgentClient
```typescript
{
  executeTask: jest.fn().mockResolvedValue([
    '{"type": "turn_complete", "turn_number": 1}'
  ])
}
```

### 3.4 ReviewCycleManager テストデータ

#### モック関数
```typescript
const mockReviewFn = jest.fn()
  .mockResolvedValueOnce({ success: false, feedback: 'Issues found' })  // 1回目失敗
  .mockResolvedValueOnce({ success: true });  // 2回目成功

const mockReviseFn = jest.fn().mockResolvedValue({ success: true });

const mockPostProgressFn = jest.fn().mockResolvedValue(undefined);

const mockCommitAndPushStepFn = jest.fn().mockResolvedValue(undefined);
```

---

## 4. テスト環境要件

### 4.1 ローカル環境
- **Node.js**: 20以上
- **npm**: 10以上
- **Git**: 最新版
- **環境変数**:
  - `GITHUB_TOKEN`: GitHub API アクセストークン
  - `CODEX_API_KEY` または `OPENAI_API_KEY`: Codex API キー（テスト時は無効でも可）
  - `CLAUDE_CODE_CREDENTIALS_PATH`: Claude Code 認証情報パス（テスト時は無効でも可）

### 4.2 CI/CD環境
- **GitHub Actions**: ユニットテスト・統合テストを自動実行
- **Jenkins**: 既存の CI/CD パイプラインを使用

### 4.3 外部サービス
- **GitHub API**: Issue コメント投稿、PR 管理
- **Codex API**: エージェント実行（統合テスト時）
- **Claude Code SDK**: エージェント実行（統合テスト時）

### 4.4 モック/スタブの必要性
- **ユニットテスト**: すべて モック/スタブ を使用
  - CodexAgentClient、ClaudeAgentClient のモック
  - MetadataManager のモック
  - GitManager のモック
  - GitHub API クライアントのモック
- **統合テスト**: 実際の外部サービスを使用（一部モック可）

### 4.5 テストフレームワーク
- **Jest**: ユニットテスト・統合テスト
  - `NODE_OPTIONS=--experimental-vm-modules jest`
  - TypeScript 対応（`ts-jest`）
- **カバレッジ**: `jest --coverage`
  - 目標カバレッジ: 80%以上

---

## 5. 品質ゲート確認

### Phase 2の戦略に沿ったテストシナリオである
✅ **確認済み**: UNIT_INTEGRATION 戦略に沿って、Unitテストシナリオ（1.1〜1.4）とIntegrationテストシナリオ（2.1〜2.7）を作成

### 主要な正常系がカバーされている
✅ **確認済み**:
- **Unitテスト**: 各モジュールの正常系（Codex/Claude 実行成功、ログフォーマット正常、進捗表示正常、レビューサイクル成功）
- **Integrationテスト**: 全フェーズ実行、レビューサイクル、エージェントフォールバック、ログフォーマット維持、進捗表示、Git 連携

### 主要な異常系がカバーされている
✅ **確認済み**:
- **Unitテスト**:
  - LogFormatter: JSON解析失敗、4000文字超過、エラー発生時
  - ProgressFormatter: 失敗ステータス表示
  - AgentExecutor: 認証エラーフォールバック、空出力フォールバック
  - ReviewCycleManager: 最大リトライ到達失敗
- **Integrationテスト**: 認証エラー時のフォールバック

### 期待結果が明確である
✅ **確認済み**: すべてのテストケースに「期待結果」セクションを記載し、検証可能な具体的な結果を明記

---

## 6. 補足事項

### 6.1 テスト実行コマンド

#### ユニットテスト
```bash
npm run test:unit
npm run test:unit -- tests/unit/phases/formatters/log-formatter.test.ts
```

#### 統合テスト
```bash
npm run test:integration
npm run test:integration -- tests/integration/preset-execution.test.ts
```

#### カバレッジ
```bash
npm run test:coverage
```

### 6.2 テスト優先順位

1. **高優先度**（リグレッション防止）:
   - 全フェーズ実行テスト（2.1）
   - レビューサイクル動作確認（2.2）
   - エージェントフォールバック動作確認（2.3）

2. **中優先度**（モジュール正確性）:
   - AgentExecutor ユニットテスト（1.3）
   - ReviewCycleManager ユニットテスト（1.4）
   - LogFormatter ユニットテスト（1.1）

3. **低優先度**（UI/フォーマット）:
   - ProgressFormatter ユニットテスト（1.2）
   - ログフォーマット維持確認（2.4）
   - 進捗表示フォーマット確認（2.5）

### 6.3 リスク対応

#### リスク1: ユニットテストのモックが複雑になる
- **対策**: モックユーティリティを作成（`tests/utils/mock-helpers.ts`）
- **対策**: 必要最小限のモックに留める（過度な詳細化を避ける）

#### リスク2: 統合テストが不安定になる
- **対策**: リトライロジックを追加（最大3回）
- **対策**: テスト環境の事前確認（GitHub API 接続確認等）

#### リスク3: カバレッジ80%未達
- **対策**: 優先度の高いモジュール（AgentExecutor、ReviewCycleManager）を重点的にテスト
- **対策**: プライベートメソッドは間接的にテスト（public メソッド経由）

---

**作成日**: 2025-01-20
**バージョン**: 1.0
**ステータス**: レビュー待ち
