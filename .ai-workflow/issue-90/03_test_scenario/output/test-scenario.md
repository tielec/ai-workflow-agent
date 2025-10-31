# テストシナリオ - Issue #90: フェーズ差し戻し機能の実装

**作成日**: 2025-01-30
**Issue番号**: #90
**プロジェクト**: AI Workflow Agent
**バージョン**: v0.4.0

---

## 0. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION** (Phase 2で決定)

**判断根拠**:
- **ユニットテスト**: 各クラスの新規メソッド（MetadataManager、BasePhase、ContentParser）の動作を個別に検証
- **インテグレーションテスト**: エンドツーエンドの差し戻しシナリオ（Phase 6 → Phase 4）、プロンプト注入の検証、メタデータ更新の検証
- **BDDテストは不要**: ユーザーストーリーよりも、システム内部の状態遷移とデータフローの検証が重要

### テスト対象の範囲

**新規作成モジュール**:
- `src/commands/rollback.ts` - Rollbackコマンドハンドラ

**拡張モジュール**:
- `src/core/metadata-manager.ts` - 差し戻しコンテキスト管理メソッド（6個）
- `src/phases/base-phase.ts` - プロンプト注入ロジック拡張
- `src/phases/lifecycle/phase-runner.ts` - revise完了後のクリア処理
- `src/core/content-parser.ts` - ブロッカー情報抽出メソッド（2個）

**新規型定義**:
- `src/types/commands.ts` - RollbackCommandOptions、RollbackContext、RollbackHistoryEntry
- `src/types.ts` - WorkflowMetadata型の拡張（rollback_context、rollback_history）

### テストの目的

1. **差し戻し理由の伝達**: 差し戻し理由がメタデータに正しく記録され、プロンプトに注入されることを検証
2. **メタデータの整合性**: 差し戻し時のメタデータ更新が正しく行われることを検証
3. **後方互換性**: 既存のワークフローに影響を与えないことを検証
4. **エラーハンドリング**: 不正な入力や状態に対して適切にエラー処理が行われることを検証
5. **統合動作**: 複数コンポーネント（MetadataManager、BasePhase、ContentParser、Rollbackコマンド）が連携して正しく動作することを検証

---

## 1. ユニットテストシナリオ

### 1.1. MetadataManager - 差し戻しコンテキスト管理

#### UC-MM-01: setRollbackContext() - 正常系

**目的**: 差し戻しコンテキストが正しく設定されることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズ（implementation）が存在する

**入力**:
```typescript
phaseName = 'implementation';
context = {
  triggered_at: '2025-01-30T12:34:56.789Z',
  from_phase: 'testing',
  from_step: 'review',
  reason: 'Type definition missing: PhaseExecutionResult needs approved and feedback fields',
  review_result: '@.ai-workflow/issue-49/06_testing/review/result.md',
  details: {
    blocker_count: 2,
    suggestion_count: 4,
    affected_tests: ['StepExecutor', 'PhaseRunner']
  }
};
```

**期待結果**:
- `metadata.phases.implementation.rollback_context`にcontextが設定される
- `metadata.save()`が呼び出される
- ログに`"Rollback context set for phase implementation"`が出力される

**テストコード例**:
```typescript
test('UC-MM-01: setRollbackContext() - 正常系', () => {
  const metadata = new MetadataManager(metadataPath);
  const context = { /* ... */ };

  metadata.setRollbackContext('implementation', context);

  expect(metadata.data.phases.implementation.rollback_context).toEqual(context);
  expect(metadata.save).toHaveBeenCalled();
});
```

---

#### UC-MM-02: getRollbackContext() - コンテキスト存在時

**目的**: 差し戻しコンテキストが正しく取得されることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズにrollback_contextが設定されている

**入力**:
```typescript
phaseName = 'implementation';
```

**期待結果**:
- 設定されているrollback_contextが返される
- nullではない

**テストコード例**:
```typescript
test('UC-MM-02: getRollbackContext() - コンテキスト存在時', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.rollback_context = { /* ... */ };

  const result = metadata.getRollbackContext('implementation');

  expect(result).not.toBeNull();
  expect(result.reason).toBe('Type definition missing...');
});
```

---

#### UC-MM-03: getRollbackContext() - コンテキスト未設定時

**目的**: rollback_contextが未設定の場合にnullが返されることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズにrollback_contextが設定されていない

**入力**:
```typescript
phaseName = 'implementation';
```

**期待結果**:
- nullが返される

**テストコード例**:
```typescript
test('UC-MM-03: getRollbackContext() - コンテキスト未設定時', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.rollback_context = undefined;

  const result = metadata.getRollbackContext('implementation');

  expect(result).toBeNull();
});
```

---

#### UC-MM-04: clearRollbackContext() - 正常系

**目的**: 差し戻しコンテキストが正しくクリアされることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズにrollback_contextが設定されている

**入力**:
```typescript
phaseName = 'implementation';
```

**期待結果**:
- `metadata.phases.implementation.rollback_context`がnullに設定される
- `metadata.save()`が呼び出される
- ログに`"Rollback context cleared for phase implementation"`が出力される

**テストコード例**:
```typescript
test('UC-MM-04: clearRollbackContext() - 正常系', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.rollback_context = { /* ... */ };

  metadata.clearRollbackContext('implementation');

  expect(metadata.data.phases.implementation.rollback_context).toBeNull();
  expect(metadata.save).toHaveBeenCalled();
});
```

---

#### UC-MM-05: addRollbackHistory() - 正常系

**目的**: 差し戻し履歴が正しく追加されることを検証

**前提条件**:
- MetadataManagerが初期化されている
- rollback_history配列が存在する（または未初期化）

**入力**:
```typescript
entry = {
  timestamp: '2025-01-30T12:34:56.789Z',
  from_phase: 'testing',
  from_step: 'review',
  to_phase: 'implementation',
  to_step: 'revise',
  reason: 'Type definition missing...',
  triggered_by: 'manual',
  review_result_path: '.ai-workflow/issue-49/06_testing/review/result.md'
};
```

**期待結果**:
- `metadata.rollback_history`にentryが追加される
- 配列が未初期化の場合は自動的に初期化される
- `metadata.save()`が呼び出される
- ログに履歴追加が記録される

**テストコード例**:
```typescript
test('UC-MM-05: addRollbackHistory() - 正常系', () => {
  const metadata = new MetadataManager(metadataPath);
  const entry = { /* ... */ };

  metadata.addRollbackHistory(entry);

  expect(metadata.data.rollback_history).toContainEqual(entry);
  expect(metadata.save).toHaveBeenCalled();
});
```

---

#### UC-MM-06: updatePhaseForRollback() - reviseステップへの差し戻し

**目的**: フェーズが差し戻し用に正しく更新されることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズがcompleted状態である

**入力**:
```typescript
phaseName = 'implementation';
toStep = 'revise';
```

**期待結果**:
- `status`が`'in_progress'`に変更される
- `current_step`が`'revise'`に設定される
- `completed_at`が`null`に設定される
- `completed_steps`は維持される（execute, reviewは完了済み）
- `metadata.save()`が呼び出される

**テストコード例**:
```typescript
test('UC-MM-06: updatePhaseForRollback() - reviseステップへの差し戻し', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.status = 'completed';
  metadata.data.phases.implementation.completed_steps = ['execute', 'review', 'revise'];

  metadata.updatePhaseForRollback('implementation', 'revise');

  expect(metadata.data.phases.implementation.status).toBe('in_progress');
  expect(metadata.data.phases.implementation.current_step).toBe('revise');
  expect(metadata.data.phases.implementation.completed_at).toBeNull();
  expect(metadata.data.phases.implementation.completed_steps).toEqual(['execute', 'review', 'revise']);
});
```

---

#### UC-MM-07: updatePhaseForRollback() - executeステップへの差し戻し

**目的**: executeステップへの差し戻し時にcompleted_stepsがクリアされることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズがcompleted状態である

**入力**:
```typescript
phaseName = 'implementation';
toStep = 'execute';
```

**期待結果**:
- `status`が`'in_progress'`に変更される
- `current_step`が`'execute'`に設定される
- `completed_at`が`null`に設定される
- `completed_steps`が空配列にクリアされる

**テストコード例**:
```typescript
test('UC-MM-07: updatePhaseForRollback() - executeステップへの差し戻し', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.status = 'completed';
  metadata.data.phases.implementation.completed_steps = ['execute', 'review', 'revise'];

  metadata.updatePhaseForRollback('implementation', 'execute');

  expect(metadata.data.phases.implementation.status).toBe('in_progress');
  expect(metadata.data.phases.implementation.current_step).toBe('execute');
  expect(metadata.data.phases.implementation.completed_steps).toEqual([]);
});
```

---

#### UC-MM-08: resetSubsequentPhases() - 後続フェーズのリセット

**目的**: 指定フェーズより後のすべてのフェーズが正しくリセットされることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 後続フェーズが存在する（test_implementation, testing, documentation等）

**入力**:
```typescript
fromPhase = 'implementation';
```

**期待結果**:
- 後続フェーズ（test_implementation, testing, documentation, report, evaluation）がすべてpendingに変更される
- 各フェーズの`started_at`、`completed_at`、`current_step`がnullに設定される
- `completed_steps`が空配列に設定される
- `retry_count`が0に設定される
- `rollback_context`がnullに設定される（既存の差し戻しコンテキストもクリア）
- リセットされたフェーズ名の配列が返される

**テストコード例**:
```typescript
test('UC-MM-08: resetSubsequentPhases() - 後続フェーズのリセット', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.test_implementation.status = 'completed';
  metadata.data.phases.testing.status = 'completed';

  const resetPhases = metadata.resetSubsequentPhases('implementation');

  expect(resetPhases).toEqual(['test_implementation', 'testing', 'documentation', 'report', 'evaluation']);
  expect(metadata.data.phases.test_implementation.status).toBe('pending');
  expect(metadata.data.phases.testing.status).toBe('pending');
  expect(metadata.data.phases.test_implementation.completed_steps).toEqual([]);
});
```

---

#### UC-MM-09: resetSubsequentPhases() - 最後のフェーズの場合

**目的**: 最後のフェーズ（evaluation）を指定した場合、リセット対象がないことを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズがevaluationである

**入力**:
```typescript
fromPhase = 'evaluation';
```

**期待結果**:
- 空配列が返される
- どのフェーズの状態も変更されない

**テストコード例**:
```typescript
test('UC-MM-09: resetSubsequentPhases() - 最後のフェーズの場合', () => {
  const metadata = new MetadataManager(metadataPath);

  const resetPhases = metadata.resetSubsequentPhases('evaluation');

  expect(resetPhases).toEqual([]);
});
```

---

### 1.2. BasePhase - プロンプト注入ロジック

#### UC-BP-01: loadPrompt() - rollback_contextが存在しない場合

**目的**: 差し戻しコンテキストがない場合、既存のロジックが維持されることを検証（後方互換性）

**前提条件**:
- BasePhaseインスタンスが作成されている
- rollback_contextが未設定である
- プロンプトファイルが存在する

**入力**:
```typescript
promptType = 'revise';
```

**期待結果**:
- プロンプトファイルが読み込まれる
- 差し戻し情報は注入されない
- 元のプロンプト内容がそのまま返される

**テストコード例**:
```typescript
test('UC-BP-01: loadPrompt() - rollback_contextが存在しない場合', () => {
  const basePhase = new TestPhase(/* ... */);
  jest.spyOn(metadata, 'getRollbackContext').mockReturnValue(null);

  const prompt = basePhase.loadPrompt('revise');

  expect(prompt).not.toContain('⚠️ 差し戻し情報');
  expect(prompt).toContain('# Phase implementation - 修正プロンプト');
});
```

---

#### UC-BP-02: loadPrompt() - rollback_contextが存在する場合（reviseステップ）

**目的**: reviseステップ時に差し戻し情報がプロンプトに注入されることを検証

**前提条件**:
- BasePhaseインスタンスが作成されている
- rollback_contextが設定されている
- プロンプトファイルが存在する

**入力**:
```typescript
promptType = 'revise';
rollbackContext = {
  triggered_at: '2025-01-30T12:34:56.789Z',
  from_phase: 'testing',
  reason: 'Type definition missing...',
  details: { blocker_count: 2 }
};
```

**期待結果**:
- プロンプトファイルが読み込まれる
- `buildRollbackPromptSection()`が呼び出される
- 差し戻し情報がプロンプトの先頭に注入される
- 元のプロンプト内容も含まれる
- ログに`"Rollback context injected into revise prompt"`が出力される

**テストコード例**:
```typescript
test('UC-BP-02: loadPrompt() - rollback_contextが存在する場合（reviseステップ）', () => {
  const basePhase = new TestPhase(/* ... */);
  const context = { /* ... */ };
  jest.spyOn(metadata, 'getRollbackContext').mockReturnValue(context);

  const prompt = basePhase.loadPrompt('revise');

  expect(prompt).toContain('⚠️ 差し戻し情報');
  expect(prompt).toContain('Type definition missing...');
  expect(prompt).toContain('# Phase implementation - 修正プロンプト');
});
```

---

#### UC-BP-03: loadPrompt() - rollback_contextが存在するがexecuteステップ

**目的**: executeステップ時は差し戻し情報が注入されないことを検証

**前提条件**:
- BasePhaseインスタンスが作成されている
- rollback_contextが設定されている
- プロンプトファイルが存在する

**入力**:
```typescript
promptType = 'execute';
rollbackContext = { /* ... */ };
```

**期待結果**:
- プロンプトファイルが読み込まれる
- 差し戻し情報は注入されない（executeステップのみに差し戻し情報を注入）
- 元のプロンプト内容がそのまま返される

**テストコード例**:
```typescript
test('UC-BP-03: loadPrompt() - rollback_contextが存在するがexecuteステップ', () => {
  const basePhase = new TestPhase(/* ... */);
  jest.spyOn(metadata, 'getRollbackContext').mockReturnValue({ /* ... */ });

  const prompt = basePhase.loadPrompt('execute');

  expect(prompt).not.toContain('⚠️ 差し戻し情報');
});
```

---

#### UC-BP-04: buildRollbackPromptSection() - 完全な差し戻しコンテキスト

**目的**: 差し戻し情報がMarkdown形式で正しく生成されることを検証

**前提条件**:
- BasePhaseインスタンスが作成されている

**入力**:
```typescript
context = {
  triggered_at: '2025-01-30T12:34:56.789Z',
  from_phase: 'testing',
  from_step: 'review',
  reason: 'Type definition missing: PhaseExecutionResult needs approved and feedback fields',
  review_result: '@.ai-workflow/issue-49/06_testing/review/result.md',
  details: {
    blocker_count: 2,
    suggestion_count: 4,
    affected_tests: ['StepExecutor', 'PhaseRunner']
  }
};
```

**期待結果**:
- Markdown形式の差し戻し情報が返される
- ヘッダー（`# ⚠️ 差し戻し情報`）が含まれる
- 差し戻し元フェーズ（`Phase testing`）が含まれる
- 差し戻し理由が含まれる
- 詳細情報（blocker_count, suggestion_count, affected_tests）が含まれる
- 参照ドキュメント（review_result）が含まれる
- 区切り線（`---`）が含まれる

**テストコード例**:
```typescript
test('UC-BP-04: buildRollbackPromptSection() - 完全な差し戻しコンテキスト', () => {
  const basePhase = new TestPhase(/* ... */);
  const context = { /* ... */ };

  const section = basePhase.buildRollbackPromptSection(context);

  expect(section).toContain('# ⚠️ 差し戻し情報');
  expect(section).toContain('Phase testing');
  expect(section).toContain('Type definition missing...');
  expect(section).toContain('ブロッカー数: 2');
  expect(section).toContain('@.ai-workflow/issue-49/06_testing/review/result.md');
  expect(section).toContain('---');
});
```

---

#### UC-BP-05: buildRollbackPromptSection() - 最小限の差し戻しコンテキスト

**目的**: 詳細情報がない場合も正しく動作することを検証

**前提条件**:
- BasePhaseインスタンスが作成されている

**入力**:
```typescript
context = {
  triggered_at: '2025-01-30T12:34:56.789Z',
  from_phase: null,
  reason: 'Manual rollback for testing',
  review_result: null,
  details: null
};
```

**期待結果**:
- Markdown形式の差し戻し情報が返される
- ヘッダーと理由のみが含まれる
- 詳細情報と参照ドキュメントは含まれない（または「なし」と表示）
- from_phaseがnullの場合は「不明なフェーズ」と表示される

**テストコード例**:
```typescript
test('UC-BP-05: buildRollbackPromptSection() - 最小限の差し戻しコンテキスト', () => {
  const basePhase = new TestPhase(/* ... */);
  const context = { triggered_at: '...', from_phase: null, reason: 'Manual rollback...', review_result: null, details: null };

  const section = basePhase.buildRollbackPromptSection(context);

  expect(section).toContain('# ⚠️ 差し戻し情報');
  expect(section).toContain('不明なフェーズ');
  expect(section).toContain('Manual rollback...');
  expect(section).not.toContain('詳細情報:');
  expect(section).not.toContain('参照すべきドキュメント:');
});
```

---

### 1.3. PhaseRunner - revise完了後のクリア処理

#### UC-PR-01: finalizePhase() - revise完了後にrollback_contextがクリアされる

**目的**: reviseステップ完了後に差し戻しコンテキストが自動的にクリアされることを検証

**前提条件**:
- PhaseRunnerインスタンスが作成されている
- reviseステップが完了している
- rollback_contextが設定されている

**入力**:
```typescript
completedSteps = ['execute', 'review', 'revise'];
rollbackContext = { /* ... */ };
```

**期待結果**:
- `metadata.clearRollbackContext()`が呼び出される
- ログに`"Rollback context cleared after revise completion"`が出力される

**テストコード例**:
```typescript
test('UC-PR-01: finalizePhase() - revise完了後にrollback_contextがクリアされる', async () => {
  const phaseRunner = new PhaseRunner(/* ... */);
  jest.spyOn(metadata, 'getCompletedSteps').mockReturnValue(['execute', 'review', 'revise']);
  jest.spyOn(metadata, 'getRollbackContext').mockReturnValue({ /* ... */ });
  jest.spyOn(metadata, 'clearRollbackContext');

  await phaseRunner.finalizePhase(null, {});

  expect(metadata.clearRollbackContext).toHaveBeenCalledWith('implementation');
});
```

---

#### UC-PR-02: finalizePhase() - revise未完了時はrollback_contextをクリアしない

**目的**: reviseステップが未完了の場合は差し戻しコンテキストがクリアされないことを検証

**前提条件**:
- PhaseRunnerインスタンスが作成されている
- reviseステップが未完了である
- rollback_contextが設定されている

**入力**:
```typescript
completedSteps = ['execute', 'review'];
rollbackContext = { /* ... */ };
```

**期待結果**:
- `metadata.clearRollbackContext()`が呼び出されない
- rollback_contextが維持される

**テストコード例**:
```typescript
test('UC-PR-02: finalizePhase() - revise未完了時はrollback_contextをクリアしない', async () => {
  const phaseRunner = new PhaseRunner(/* ... */);
  jest.spyOn(metadata, 'getCompletedSteps').mockReturnValue(['execute', 'review']);
  jest.spyOn(metadata, 'clearRollbackContext');

  await phaseRunner.finalizePhase(null, {});

  expect(metadata.clearRollbackContext).not.toHaveBeenCalled();
});
```

---

### 1.4. ContentParser - ブロッカー情報抽出

#### UC-CP-01: extractBlockers() - ブロッカー情報が存在する場合

**目的**: レビュー結果からブロッカー情報が正しく抽出されることを検証

**前提条件**:
- ContentParserインスタンスが作成されている
- OpenAI APIがモックされている

**入力**:
```typescript
reviewResult = `
# Phase 6 (testing) のレビュー結果

## ブロッカー（BLOCKER）

1. **型定義の不整合**
   - 問題: PhaseExecutionResult型にapprovedとfeedbackフィールドが定義されていない
   - 影響: StepExecutor、PhaseRunnerのテストがコンパイルエラーで全失敗
   - 対策: src/types.tsのPhaseExecutionResult型にフィールドを追加

2. **テスト成功率47%**
   - 問題: 新規テスト32ケース中17ケースが失敗
   - 影響: リファクタリングの品質が保証できない
   - 対策: Phase 4で型定義を修正後、Phase 6でテスト再実行
`;
```

**期待結果**:
- OpenAI APIが呼び出される
- 2個のブロッカーが抽出される
- 各ブロッカーに`title`、`problem`、`impact`、`solution`が含まれる
- ログに`"Extracted 2 blockers from review result"`が出力される

**テストコード例**:
```typescript
test('UC-CP-01: extractBlockers() - ブロッカー情報が存在する場合', async () => {
  const contentParser = new ContentParser();
  const reviewResult = `...`;

  const mockedResponse = {
    choices: [{
      message: {
        content: JSON.stringify([
          { title: '型定義の不整合', problem: '...', impact: '...', solution: '...' },
          { title: 'テスト成功率47%', problem: '...', impact: '...', solution: '...' }
        ])
      }
    }]
  };
  jest.spyOn(contentParser.client.chat.completions, 'create').mockResolvedValue(mockedResponse);

  const blockers = await contentParser.extractBlockers(reviewResult);

  expect(blockers).toHaveLength(2);
  expect(blockers[0].title).toBe('型定義の不整合');
});
```

---

#### UC-CP-02: extractBlockers() - ブロッカー情報が存在しない場合

**目的**: ブロッカー情報がない場合に空配列が返されることを検証

**前提条件**:
- ContentParserインスタンスが作成されている
- OpenAI APIがモックされている

**入力**:
```typescript
reviewResult = `
# Phase 6 (testing) のレビュー結果

## 全テスト成功

すべてのテストが成功しました。
`;
```

**期待結果**:
- OpenAI APIが呼び出される
- 空配列が返される
- ログに`"Extracted 0 blockers from review result"`が出力される

**テストコード例**:
```typescript
test('UC-CP-02: extractBlockers() - ブロッカー情報が存在しない場合', async () => {
  const contentParser = new ContentParser();
  const reviewResult = `...`;

  const mockedResponse = {
    choices: [{ message: { content: '[]' } }]
  };
  jest.spyOn(contentParser.client.chat.completions, 'create').mockResolvedValue(mockedResponse);

  const blockers = await contentParser.extractBlockers(reviewResult);

  expect(blockers).toEqual([]);
});
```

---

#### UC-CP-03: extractBlockers() - OpenAI APIエラー時

**目的**: OpenAI API呼び出しに失敗した場合、空配列が返されることを検証

**前提条件**:
- ContentParserインスタンスが作成されている
- OpenAI APIがエラーをスローする

**入力**:
```typescript
reviewResult = `...`;
```

**期待結果**:
- OpenAI APIエラーがキャッチされる
- 空配列が返される
- 警告ログに`"Failed to extract blockers"`が出力される
- プログラムが終了しない（エラーハンドリング）

**テストコード例**:
```typescript
test('UC-CP-03: extractBlockers() - OpenAI APIエラー時', async () => {
  const contentParser = new ContentParser();
  jest.spyOn(contentParser.client.chat.completions, 'create').mockRejectedValue(new Error('API Error'));

  const blockers = await contentParser.extractBlockers('...');

  expect(blockers).toEqual([]);
});
```

---

#### UC-CP-04: extractSuggestions() - 改善提案が存在する場合

**目的**: レビュー結果から改善提案が正しく抽出されることを検証

**前提条件**:
- ContentParserインスタンスが作成されている
- OpenAI APIがモックされている

**入力**:
```typescript
reviewResult = `
# Phase 6 (testing) のレビュー結果

## 改善提案（SUGGESTION）

- テストカバレッジを80%以上に向上させる
- エッジケースのテストを追加する
- モック化をより詳細に行う
`;
```

**期待結果**:
- OpenAI APIが呼び出される
- 3個の改善提案が抽出される
- ログに`"Extracted 3 suggestions from review result"`が出力される

**テストコード例**:
```typescript
test('UC-CP-04: extractSuggestions() - 改善提案が存在する場合', async () => {
  const contentParser = new ContentParser();
  const reviewResult = `...`;

  const mockedResponse = {
    choices: [{
      message: {
        content: JSON.stringify([
          'テストカバレッジを80%以上に向上させる',
          'エッジケースのテストを追加する',
          'モック化をより詳細に行う'
        ])
      }
    }]
  };
  jest.spyOn(contentParser.client.chat.completions, 'create').mockResolvedValue(mockedResponse);

  const suggestions = await contentParser.extractSuggestions(reviewResult);

  expect(suggestions).toHaveLength(3);
  expect(suggestions[0]).toBe('テストカバレッジを80%以上に向上させる');
});
```

---

### 1.5. Rollbackコマンド - バリデーション

#### UC-RC-01: validateRollbackOptions() - 有効なオプション

**目的**: 有効なオプションでバリデーションが成功することを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズがcompleted状態である

**入力**:
```typescript
options = {
  issue: '49',
  toPhase: 'implementation',
  reason: 'Type definition missing...',
  toStep: 'revise'
};
```

**期待結果**:
- バリデーションが成功する
- 例外がスローされない

**テストコード例**:
```typescript
test('UC-RC-01: validateRollbackOptions() - 有効なオプション', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.status = 'completed';

  const options = { /* ... */ };

  expect(() => validateRollbackOptions(options, metadata)).not.toThrow();
});
```

---

#### UC-RC-02: validateRollbackOptions() - 無効なフェーズ名

**目的**: 無効なフェーズ名が指定された場合にエラーがスローされることを検証

**前提条件**:
- MetadataManagerが初期化されている

**入力**:
```typescript
options = {
  issue: '49',
  toPhase: 'invalid-phase',
  reason: 'Test'
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Invalid phase name: invalid-phase. Use 'list-presets' command to see valid phase names."`

**テストコード例**:
```typescript
test('UC-RC-02: validateRollbackOptions() - 無効なフェーズ名', () => {
  const metadata = new MetadataManager(metadataPath);
  const options = { issue: '49', toPhase: 'invalid-phase', reason: 'Test' };

  expect(() => validateRollbackOptions(options, metadata))
    .toThrow('Invalid phase name: invalid-phase');
});
```

---

#### UC-RC-03: validateRollbackOptions() - 無効なステップ名

**目的**: 無効なステップ名が指定された場合にエラーがスローされることを検証

**前提条件**:
- MetadataManagerが初期化されている

**入力**:
```typescript
options = {
  issue: '49',
  toPhase: 'implementation',
  toStep: 'invalid-step',
  reason: 'Test'
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Invalid step: invalid-step. Valid steps are: execute, review, revise."`

**テストコード例**:
```typescript
test('UC-RC-03: validateRollbackOptions() - 無効なステップ名', () => {
  const metadata = new MetadataManager(metadataPath);
  const options = { issue: '49', toPhase: 'implementation', toStep: 'invalid-step', reason: 'Test' };

  expect(() => validateRollbackOptions(options, metadata))
    .toThrow('Invalid step: invalid-step');
});
```

---

#### UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し

**目的**: 未開始（pending）フェーズへの差し戻しがエラーになることを検証

**前提条件**:
- MetadataManagerが初期化されている
- 対象フェーズがpending状態である

**入力**:
```typescript
options = {
  issue: '49',
  toPhase: 'documentation',
  reason: 'Test'
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Cannot rollback to phase 'documentation' because it has not been started yet."`

**テストコード例**:
```typescript
test('UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.documentation.status = 'pending';

  const options = { issue: '49', toPhase: 'documentation', reason: 'Test' };

  expect(() => validateRollbackOptions(options, metadata))
    .toThrow('Cannot rollback to phase \'documentation\' because it has not been started yet');
});
```

---

#### UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定

**目的**: 差し戻し理由が指定されていない場合にエラーがスローされることを検証

**前提条件**:
- MetadataManagerが初期化されている

**入力**:
```typescript
options = {
  issue: '49',
  toPhase: 'implementation'
  // reason, reasonFile, interactive が未指定
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Rollback reason is required. Use --reason, --reason-file, or --interactive option."`

**テストコード例**:
```typescript
test('UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定', () => {
  const metadata = new MetadataManager(metadataPath);
  metadata.data.phases.implementation.status = 'completed';

  const options = { issue: '49', toPhase: 'implementation' };

  expect(() => validateRollbackOptions(options, metadata))
    .toThrow('Rollback reason is required');
});
```

---

#### UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）

**目的**: --reasonオプションで差し戻し理由が正しく読み込まれることを検証

**前提条件**:
- Rollbackコマンドが実行されている

**入力**:
```typescript
options = {
  reason: 'Type definition missing: PhaseExecutionResult needs approved and feedback fields'
};
```

**期待結果**:
- 指定された理由が返される
- トリムされた文字列が返される
- ログに`"Using rollback reason from --reason option"`が出力される

**テストコード例**:
```typescript
test('UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）', async () => {
  const options = { reason: '  Type definition missing...  ' };

  const reason = await loadRollbackReason(options, '/workflow-dir');

  expect(reason).toBe('Type definition missing...');
});
```

---

#### UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）

**目的**: 空文字列が指定された場合にエラーがスローされることを検証

**前提条件**:
- Rollbackコマンドが実行されている

**入力**:
```typescript
options = {
  reason: '   '
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Rollback reason cannot be empty."`

**テストコード例**:
```typescript
test('UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）', async () => {
  const options = { reason: '   ' };

  await expect(loadRollbackReason(options, '/workflow-dir'))
    .rejects.toThrow('Rollback reason cannot be empty');
});
```

---

#### UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）

**目的**: 1000文字を超える理由が指定された場合にエラーがスローされることを検証

**前提条件**:
- Rollbackコマンドが実行されている

**入力**:
```typescript
options = {
  reason: 'a'.repeat(1001)
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Rollback reason must be 1000 characters or less."`

**テストコード例**:
```typescript
test('UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）', async () => {
  const options = { reason: 'a'.repeat(1001) };

  await expect(loadRollbackReason(options, '/workflow-dir'))
    .rejects.toThrow('Rollback reason must be 1000 characters or less');
});
```

---

#### UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）

**目的**: --reason-fileオプションでファイルから差し戻し理由が読み込まれることを検証

**前提条件**:
- Rollbackコマンドが実行されている
- レビュー結果ファイルが存在する

**入力**:
```typescript
options = {
  reasonFile: '.ai-workflow/issue-49/06_testing/review/result.md'
};
```

**期待結果**:
- ファイルが読み込まれる
- ファイルの内容が返される
- ログに`"Loaded rollback reason from file: ..."`が出力される

**テストコード例**:
```typescript
test('UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）', async () => {
  const options = { reasonFile: '/path/to/review/result.md' };
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any);
  jest.spyOn(fs, 'readFileSync').mockReturnValue('Review result content');

  const reason = await loadRollbackReason(options, '/workflow-dir');

  expect(reason).toBe('Review result content');
});
```

---

#### UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）

**目的**: 指定されたファイルが存在しない場合にエラーがスローされることを検証

**前提条件**:
- Rollbackコマンドが実行されている
- レビュー結果ファイルが存在しない

**入力**:
```typescript
options = {
  reasonFile: '/non-existent-file.md'
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Reason file not found: /non-existent-file.md"`

**テストコード例**:
```typescript
test('UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）', async () => {
  const options = { reasonFile: '/non-existent-file.md' };
  jest.spyOn(fs, 'existsSync').mockReturnValue(false);

  await expect(loadRollbackReason(options, '/workflow-dir'))
    .rejects.toThrow('Reason file not found');
});
```

---

#### UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）

**目的**: ファイルサイズが100KBを超える場合にエラーがスローされることを検証

**前提条件**:
- Rollbackコマンドが実行されている
- レビュー結果ファイルが存在するが100KB超

**入力**:
```typescript
options = {
  reasonFile: '/large-file.md'
};
```

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Reason file must be 100KB or less."`

**テストコード例**:
```typescript
test('UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）', async () => {
  const options = { reasonFile: '/large-file.md' };
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  jest.spyOn(fs, 'statSync').mockReturnValue({ size: 200 * 1024 } as any);

  await expect(loadRollbackReason(options, '/workflow-dir'))
    .rejects.toThrow('Reason file must be 100KB or less');
});
```

---

#### UC-RC-12: confirmRollback() - ユーザーがyを入力

**目的**: ユーザーが確認プロンプトで`y`を入力した場合にtrueが返されることを検証

**前提条件**:
- Rollbackコマンドが実行されている
- CI環境ではない

**入力**:
```typescript
toPhase = 'implementation';
reason = 'Type definition missing...';
userInput = 'y';
```

**期待結果**:
- 確認プロンプトが表示される
- trueが返される

**テストコード例**:
```typescript
test('UC-RC-12: confirmRollback() - ユーザーがyを入力', async () => {
  jest.spyOn(config, 'isCI').mockReturnValue(false);
  // readline のモック

  const confirmed = await confirmRollback('implementation', 'Reason...', metadata);

  expect(confirmed).toBe(true);
});
```

---

#### UC-RC-13: confirmRollback() - ユーザーがnを入力

**目的**: ユーザーが確認プロンプトで`n`を入力した場合にfalseが返されることを検証

**前提条件**:
- Rollbackコマンドが実行されている
- CI環境ではない

**入力**:
```typescript
userInput = 'n';
```

**期待結果**:
- 確認プロンプトが表示される
- falseが返される

**テストコード例**:
```typescript
test('UC-RC-13: confirmRollback() - ユーザーがnを入力', async () => {
  jest.spyOn(config, 'isCI').mockReturnValue(false);
  // readline のモック（'n'を返す）

  const confirmed = await confirmRollback('implementation', 'Reason...', metadata);

  expect(confirmed).toBe(false);
});
```

---

#### UC-RC-14: confirmRollback() - CI環境では自動承認

**目的**: CI環境では確認プロンプトが自動的にスキップされることを検証

**前提条件**:
- Rollbackコマンドが実行されている
- CI環境である（process.env.CI が設定されている）

**入力**:
```typescript
// CI環境
```

**期待結果**:
- 確認プロンプトが表示されない
- trueが返される
- ログに`"CI environment detected. Skipping confirmation prompt."`が出力される

**テストコード例**:
```typescript
test('UC-RC-14: confirmRollback() - CI環境では自動承認', async () => {
  jest.spyOn(config, 'isCI').mockReturnValue(true);

  const confirmed = await confirmRollback('implementation', 'Reason...', metadata);

  expect(confirmed).toBe(true);
});
```

---

### 1.6. Rollbackコマンド - ROLLBACK_REASON.md生成

#### UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報

**目的**: 差し戻し理由ドキュメントが正しく生成されることを検証

**前提条件**:
- Rollbackコマンドが実行されている

**入力**:
```typescript
options = {
  toPhase: 'implementation',
  fromPhase: 'testing',
  reasonFile: '.ai-workflow/issue-49/06_testing/review/result.md'
};
reason = 'Type definition missing...';
details = {
  blocker_count: 2,
  suggestion_count: 4,
  affected_tests: ['StepExecutor', 'PhaseRunner']
};
```

**期待結果**:
- Markdown形式のドキュメントが返される
- フェーズ番号とフェーズ名が含まれる（`# Phase 04 (implementation) への差し戻し理由`）
- 差し戻し元フェーズが含まれる
- 差し戻し日時が含まれる
- 差し戻し理由が含まれる
- 詳細情報が含まれる
- 参照ドキュメントが含まれる
- 修正後の確認事項が含まれる

**テストコード例**:
```typescript
test('UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報', () => {
  const options = { /* ... */ };
  const reason = 'Type definition missing...';
  const details = { /* ... */ };

  const markdown = generateRollbackReasonMarkdown(options, reason, details);

  expect(markdown).toContain('# Phase 04 (implementation) への差し戻し理由');
  expect(markdown).toContain('**差し戻し元**: Phase testing');
  expect(markdown).toContain('Type definition missing...');
  expect(markdown).toContain('ブロッカー数: 2');
  expect(markdown).toContain('@.ai-workflow/issue-49/06_testing/review/result.md');
});
```

---

#### UC-RC-16: generateRollbackReasonMarkdown() - 最小限の情報

**目的**: 最小限の情報でもドキュメントが生成されることを検証

**前提条件**:
- Rollbackコマンドが実行されている

**入力**:
```typescript
options = {
  toPhase: 'implementation'
  // fromPhase, reasonFile は未指定
};
reason = 'Manual rollback for testing';
details = null;
```

**期待結果**:
- Markdown形式のドキュメントが返される
- フェーズ番号とフェーズ名が含まれる
- 差し戻し元フェーズは含まれない
- 差し戻し理由が含まれる
- 詳細情報と参照ドキュメントは含まれない

**テストコード例**:
```typescript
test('UC-RC-16: generateRollbackReasonMarkdown() - 最小限の情報', () => {
  const options = { toPhase: 'implementation' };
  const reason = 'Manual rollback for testing';
  const details = null;

  const markdown = generateRollbackReasonMarkdown(options, reason, details);

  expect(markdown).toContain('# Phase 04 (implementation) への差し戻し理由');
  expect(markdown).toContain('Manual rollback for testing');
  expect(markdown).not.toContain('詳細情報');
  expect(markdown).not.toContain('参照ドキュメント');
});
```

---

## 2. インテグレーションテストシナリオ

### 2.1. エンドツーエンドの差し戻しシナリオ

#### IC-E2E-01: Phase 6 → Phase 4への完全な差し戻しフロー

**目的**: エンドツーエンドの差し戻しフローが正しく動作することを検証

**前提条件**:
- Issue #49のワークフローが存在する
- Phase 6 (testing) が完了している
- Phase 4 (implementation) が完了している
- レビュー結果ファイルが存在する

**テスト手順**:

1. **差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason-file .ai-workflow/issue-49/06_testing/review/result.md \
     --force
   ```

2. **メタデータの確認**:
   - `metadata.json`を読み込む
   - Phase 4の状態を確認

3. **ROLLBACK_REASON.mdの確認**:
   - `.ai-workflow/issue-49/04_implementation/ROLLBACK_REASON.md`が生成されていることを確認
   - 内容を確認

4. **Phase 4の再実行（reviseステップ）**:
   ```bash
   node dist/index.js execute --issue 49 --phase implementation
   ```

5. **プロンプトの確認**:
   - reviseステップのプロンプトに差し戻し情報が注入されていることを確認

6. **revise完了後の確認**:
   - `rollback_context`がクリアされていることを確認

**期待結果**:

1. **メタデータの更新**:
   - `phases.implementation.status = 'in_progress'`
   - `phases.implementation.current_step = 'revise'`
   - `phases.implementation.completed_at = null`
   - `phases.implementation.rollback_context`が設定されている
   - 後続フェーズ（test_implementation, testing, documentation, report, evaluation）がすべて`pending`にリセットされている

2. **ROLLBACK_REASON.mdの生成**:
   - ファイルが存在する
   - 差し戻し理由、詳細情報、参照ドキュメントが含まれている

3. **差し戻し履歴の記録**:
   - `metadata.rollback_history`に新しいエントリが追加されている

4. **プロンプト注入**:
   - reviseステップのプロンプトに`⚠️ 差し戻し情報`が含まれている
   - 差し戻し理由が含まれている

5. **revise完了後**:
   - `rollback_context`が`null`にクリアされている

**確認項目**:
- [ ] メタデータが正しく更新されている
- [ ] ROLLBACK_REASON.mdが生成されている
- [ ] 差し戻し履歴が記録されている
- [ ] プロンプトに差し戻し情報が注入されている
- [ ] revise完了後にrollback_contextがクリアされている
- [ ] 後続フェーズがすべてリセットされている

---

#### IC-E2E-02: 差し戻し理由の直接指定（--reason）

**目的**: --reasonオプションでの差し戻しフローが正しく動作することを検証

**前提条件**:
- Issue #49のワークフローが存在する
- Phase 6 (testing) が完了している

**テスト手順**:

1. **差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "型定義にapprovedとfeedbackフィールドが不足しています。src/types.tsを修正してください。" \
     --force
   ```

2. **メタデータの確認**:
   - `rollback_context.reason`が指定された理由と一致することを確認

3. **ROLLBACK_REASON.mdの確認**:
   - 内容に指定された理由が含まれていることを確認

**期待結果**:
- `rollback_context.reason`が指定された理由と一致する
- `rollback_context.review_result`がnullである（ファイル指定ではないため）
- `rollback_context.details`がnullである（ブロッカー情報抽出はスキップ）

**確認項目**:
- [ ] 差し戻し理由が正しく記録されている
- [ ] review_resultがnullである
- [ ] detailsがnullである

---

#### IC-E2E-03: ドライランモード（--dry-run）

**目的**: ドライランモードで変更がプレビューされ、実際のメタデータは変更されないことを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **メタデータのバックアップ**:
   - `metadata.json`の内容を保存

2. **ドライランコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "Test reason" \
     --dry-run
   ```

3. **出力の確認**:
   - `[DRY RUN]`プレフィックスが付いていることを確認
   - 変更内容のプレビューが表示されることを確認

4. **メタデータの確認**:
   - `metadata.json`が変更されていないことを確認

5. **ROLLBACK_REASON.mdの確認**:
   - ファイルが生成されていないことを確認

**期待結果**:
- 変更内容がコンソールに表示される
- `metadata.json`は変更されない
- `ROLLBACK_REASON.md`は生成されない
- `rollback_history`に記録されない

**確認項目**:
- [ ] 変更内容がプレビューされる
- [ ] メタデータが変更されない
- [ ] ROLLBACK_REASON.mdが生成されない
- [ ] 差し戻し履歴が記録されない

---

#### IC-E2E-04: executeステップへの差し戻し（--to-step execute）

**目的**: executeステップへの差し戻しでcompleted_stepsがクリアされることを検証

**前提条件**:
- Issue #49のワークフローが存在する
- Phase 4 (implementation) が完了している

**テスト手順**:

1. **差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --to-step execute \
     --reason "Phase 4を最初から再実装が必要。" \
     --force
   ```

2. **メタデータの確認**:
   - Phase 4の`current_step`が`'execute'`であることを確認
   - `completed_steps`が空配列であることを確認

3. **Phase 4の再実行（executeステップ）**:
   ```bash
   node dist/index.js execute --issue 49 --phase implementation
   ```

**期待結果**:
- `phases.implementation.status = 'in_progress'`
- `phases.implementation.current_step = 'execute'`
- `phases.implementation.completed_steps = []`（クリアされている）
- executeステップから再実行される

**確認項目**:
- [ ] current_stepが'execute'である
- [ ] completed_stepsが空配列である
- [ ] executeステップから再実行される

---

### 2.2. レビュー結果からのブロッカー情報抽出

#### IC-BP-01: レビュー結果ファイルからブロッカー情報を抽出し、メタデータに記録

**目的**: --reason-fileオプション使用時にブロッカー情報が自動抽出され、メタデータに記録されることを検証

**前提条件**:
- Issue #49のワークフローが存在する
- レビュー結果ファイルが存在する（ブロッカー情報を含む）

**テスト手順**:

1. **レビュー結果ファイルを用意**:
   - `.ai-workflow/issue-49/06_testing/review/result.md`にブロッカー情報を含むレビュー結果を保存

2. **差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason-file .ai-workflow/issue-49/06_testing/review/result.md \
     --force
   ```

3. **メタデータの確認**:
   - `rollback_context.details.blocker_count`が設定されていることを確認
   - `rollback_context.details.suggestion_count`が設定されていることを確認

4. **ROLLBACK_REASON.mdの確認**:
   - ブロッカー情報が含まれていることを確認

**期待結果**:
- `rollback_context.review_result`が設定されている（`@filepath`形式）
- `rollback_context.details`が設定されている
- `rollback_context.details.blocker_count`が正しい値である（例: 2）
- `rollback_context.details.suggestion_count`が正しい値である（例: 4）
- ROLLBACK_REASON.mdにブロッカー情報が含まれている

**確認項目**:
- [ ] review_resultが設定されている
- [ ] detailsが設定されている
- [ ] blocker_countが正しい
- [ ] suggestion_countが正しい
- [ ] ROLLBACK_REASON.mdにブロッカー情報が含まれている

---

### 2.3. 後方互換性の検証

#### IC-COMPAT-01: 既存ワークフローへの影響がないことを確認

**目的**: rollback_contextが設定されていない既存のワークフローが正常に動作することを検証

**前提条件**:
- Issue #49のワークフローが存在する
- Phase 4にrollback_contextが設定されていない

**テスト手順**:

1. **Phase 4の実行（executeステップ）**:
   ```bash
   node dist/index.js execute --issue 49 --phase implementation
   ```

2. **プロンプトの確認**:
   - reviseステップのプロンプトに差し戻し情報が注入されていないことを確認

3. **Phase 4の完了**:
   - Phase 4が正常に完了することを確認

**期待結果**:
- 既存のロジックが正常に動作する
- プロンプトに差し戻し情報が注入されない
- エラーが発生しない

**確認項目**:
- [ ] 既存のロジックが正常に動作する
- [ ] プロンプトに差し戻し情報が注入されない
- [ ] エラーが発生しない

---

#### IC-COMPAT-02: 既存のメタデータ構造が変更されないことを確認

**目的**: 差し戻し機能を使用しない場合、メタデータ構造に変更がないことを検証

**前提条件**:
- Issue #49のワークフローが存在する
- 差し戻しコマンドを実行していない

**テスト手順**:

1. **メタデータの読み込み**:
   - `metadata.json`を読み込む

2. **フィールドの確認**:
   - `rollback_context`フィールドが存在しないか、nullであることを確認
   - `rollback_history`フィールドが存在しないか、空配列であることを確認

3. **既存フェーズの実行**:
   - 通常のフェーズ実行が正常に動作することを確認

**期待結果**:
- `rollback_context`フィールドが存在しないか、nullである
- `rollback_history`フィールドが存在しないか、空配列である
- 既存のフェーズ実行が正常に動作する

**確認項目**:
- [ ] rollback_contextが存在しないか、nullである
- [ ] rollback_historyが存在しないか、空配列である
- [ ] 既存のフェーズ実行が正常に動作する

---

### 2.4. エラーハンドリングの検証

#### IC-ERR-01: 無効なフェーズ名でエラーメッセージが表示される

**目的**: 無効なフェーズ名が指定された場合に適切なエラーメッセージが表示されることを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **無効なフェーズ名で差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase invalid-phase \
     --reason "Test"
   ```

2. **エラーメッセージの確認**:
   - 標準エラー出力にエラーメッセージが表示されることを確認

**期待結果**:
- エラーメッセージが表示される: `Error: Invalid phase name 'invalid-phase'. Use 'list-presets' command to see valid phase names.`
- 終了コードが1である
- メタデータは変更されない

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 終了コードが1である
- [ ] メタデータが変更されない

---

#### IC-ERR-02: 未開始フェーズへの差し戻しでエラーメッセージが表示される

**目的**: 未開始フェーズへの差し戻しが適切にエラーになることを検証

**前提条件**:
- Issue #49のワークフローが存在する
- Phase 7 (documentation) がpending状態である

**テスト手順**:

1. **未開始フェーズに差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase documentation \
     --reason "Test"
   ```

2. **エラーメッセージの確認**:
   - 標準エラー出力にエラーメッセージが表示されることを確認

**期待結果**:
- エラーメッセージが表示される: `Error: Cannot rollback to phase 'documentation' because it has not been started yet.`
- 終了コードが1である
- メタデータは変更されない

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 終了コードが1である
- [ ] メタデータが変更されない

---

#### IC-ERR-03: レビュー結果ファイルが存在しない場合のエラーハンドリング

**目的**: --reason-fileで指定したファイルが存在しない場合に適切なエラーメッセージが表示されることを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **存在しないファイルを指定して差し戻しコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason-file /non-existent-file.md
   ```

2. **エラーメッセージの確認**:
   - 標準エラー出力にエラーメッセージが表示されることを確認

**期待結果**:
- エラーメッセージが表示される: `Error: Reason file not found: /non-existent-file.md`
- 終了コードが1である
- メタデータは変更されない

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 終了コードが1である
- [ ] メタデータが変更されない

---

#### IC-ERR-04: 差し戻し理由が未指定の場合のエラーハンドリング

**目的**: 差し戻し理由が指定されていない場合に適切なエラーメッセージが表示されることを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **差し戻し理由を指定せずにコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation
   ```

2. **エラーメッセージの確認**:
   - 標準エラー出力にエラーメッセージが表示されることを確認

**期待結果**:
- エラーメッセージが表示される: `Error: Rollback reason is required. Use --reason, --reason-file, or --interactive option.`
- 終了コードが1である
- メタデータは変更されない

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 終了コードが1である
- [ ] メタデータが変更されない

---

### 2.5. 確認プロンプトの検証

#### IC-PROMPT-01: 確認プロンプトで`n`を入力した場合、処理がキャンセルされる

**目的**: 確認プロンプトで`n`を入力した場合に処理がキャンセルされることを検証

**前提条件**:
- Issue #49のワークフローが存在する
- CI環境ではない

**テスト手順**:

1. **差し戻しコマンド実行（--forceなし）**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "Test"
   ```

2. **確認プロンプトに対して`n`を入力**

3. **メッセージの確認**:
   - `Rollback cancelled.`というメッセージが表示されることを確認

4. **メタデータの確認**:
   - `metadata.json`が変更されていないことを確認

**期待結果**:
- 確認プロンプトが表示される
- `Rollback cancelled.`というメッセージが表示される
- メタデータは変更されない

**確認項目**:
- [ ] 確認プロンプトが表示される
- [ ] キャンセルメッセージが表示される
- [ ] メタデータが変更されない

---

#### IC-PROMPT-02: --forceオプションで確認プロンプトがスキップされる

**目的**: --forceオプション使用時に確認プロンプトがスキップされることを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **差し戻しコマンド実行（--force）**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "Test" \
     --force
   ```

2. **確認プロンプトが表示されないことを確認**

3. **メタデータの確認**:
   - 差し戻しが実行されていることを確認

**期待結果**:
- 確認プロンプトが表示されない
- 差し戻し処理が即座に実行される
- メタデータが更新される

**確認項目**:
- [ ] 確認プロンプトが表示されない
- [ ] 差し戻し処理が実行される
- [ ] メタデータが更新される

---

#### IC-PROMPT-03: CI環境では自動的に確認がスキップされる

**目的**: CI環境では確認プロンプトが自動的にスキップされることを検証

**前提条件**:
- Issue #49のワークフローが存在する
- CI環境である（process.env.CI が設定されている）

**テスト手順**:

1. **CI環境変数を設定**:
   ```bash
   export CI=true
   ```

2. **差し戻しコマンド実行（--forceなし）**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "Test"
   ```

3. **ログの確認**:
   - `CI environment detected. Skipping confirmation prompt.`というログが出力されることを確認

4. **メタデータの確認**:
   - 差し戻しが実行されていることを確認

**期待結果**:
- 確認プロンプトが表示されない
- ログに`CI environment detected.`が出力される
- 差し戻し処理が実行される

**確認項目**:
- [ ] 確認プロンプトが表示されない
- [ ] CI環境検出ログが出力される
- [ ] 差し戻し処理が実行される

---

### 2.6. 差し戻し履歴の検証

#### IC-HISTORY-01: 差し戻し履歴が正しく記録される

**目的**: 差し戻し履歴がメタデータに正しく記録されることを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **初回の差し戻し**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "First rollback" \
     --force
   ```

2. **メタデータの確認**:
   - `rollback_history`配列に1個のエントリが追加されていることを確認

3. **2回目の差し戻し**（Phase 4完了後、再度Phase 4に差し戻し）:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "Second rollback" \
     --force
   ```

4. **メタデータの確認**:
   - `rollback_history`配列に2個のエントリが追加されていることを確認
   - エントリが時系列順（古い→新しい）に並んでいることを確認

**期待結果**:
- `rollback_history`配列に差し戻しエントリが追加される
- 各エントリに`timestamp`、`to_phase`、`reason`、`triggered_by`が含まれる
- エントリが時系列順に並んでいる

**確認項目**:
- [ ] rollback_history配列にエントリが追加される
- [ ] 各エントリに必須フィールドが含まれる
- [ ] エントリが時系列順に並んでいる

---

#### IC-HISTORY-02: ドライラン時は差し戻し履歴に記録されない

**目的**: ドライランモード時に差し戻し履歴が記録されないことを検証

**前提条件**:
- Issue #49のワークフローが存在する

**テスト手順**:

1. **メタデータのバックアップ**:
   - `rollback_history`の初期状態を保存

2. **ドライランコマンド実行**:
   ```bash
   node dist/index.js rollback --issue 49 --to-phase implementation \
     --reason "Test" \
     --dry-run
   ```

3. **メタデータの確認**:
   - `rollback_history`が変更されていないことを確認

**期待結果**:
- `rollback_history`にエントリが追加されない
- メタデータは変更されない

**確認項目**:
- [ ] rollback_historyが変更されない
- [ ] メタデータが変更されない

---

## 3. テストデータ

### 3.1. メタデータテストデータ

#### 正常なメタデータ（Phase 6完了、Phase 4完了）

```json
{
  "issue_number": "49",
  "current_phase": "testing",
  "phases": {
    "planning": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review", "revise"],
      "started_at": "2025-01-01T00:00:00.000Z",
      "completed_at": "2025-01-01T01:00:00.000Z"
    },
    "requirements": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review", "revise"],
      "started_at": "2025-01-01T01:00:00.000Z",
      "completed_at": "2025-01-01T02:00:00.000Z"
    },
    "design": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review", "revise"],
      "started_at": "2025-01-01T02:00:00.000Z",
      "completed_at": "2025-01-01T03:00:00.000Z"
    },
    "test_scenario": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review", "revise"],
      "started_at": "2025-01-01T03:00:00.000Z",
      "completed_at": "2025-01-01T04:00:00.000Z"
    },
    "implementation": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review", "revise"],
      "started_at": "2025-01-01T04:00:00.000Z",
      "completed_at": "2025-01-01T05:00:00.000Z"
    },
    "test_implementation": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review", "revise"],
      "started_at": "2025-01-01T05:00:00.000Z",
      "completed_at": "2025-01-01T06:00:00.000Z"
    },
    "testing": {
      "status": "completed",
      "current_step": null,
      "completed_steps": ["execute", "review"],
      "started_at": "2025-01-01T06:00:00.000Z",
      "completed_at": "2025-01-01T07:00:00.000Z"
    },
    "documentation": {
      "status": "pending",
      "current_step": null,
      "completed_steps": []
    },
    "report": {
      "status": "pending",
      "current_step": null,
      "completed_steps": []
    },
    "evaluation": {
      "status": "pending",
      "current_step": null,
      "completed_steps": []
    }
  },
  "rollback_history": []
}
```

### 3.2. レビュー結果テストデータ

#### ブロッカー情報を含むレビュー結果

```markdown
# Phase 6 (testing) のレビュー結果

**判定**: FAIL

## ブロッカー（BLOCKER）

1. **型定義の不整合（Phase 4の実装不備）**
   - 問題: `PhaseExecutionResult`型に`approved`と`feedback`フィールドが定義されていない
   - 影響: StepExecutor、PhaseRunner、BasePhase統合テストがTypeScriptコンパイルエラーで全失敗
   - 対策: `src/types.ts`の`PhaseExecutionResult`型に`approved?: boolean`と`feedback?: string`を追加

2. **主要テストケースの成功率47%**
   - 問題: 新規テスト32ケース中17ケースが失敗
   - 影響: リファクタリングの品質が保証できない
   - 対策: Phase 4で型定義を修正後、Phase 6でテスト再実行

## 改善提案（SUGGESTION）

- テストカバレッジを90%以上に向上させる
- エッジケースのテストを追加する
- モック化をより詳細に行う
- CI環境判定のテストを追加する
```

#### ブロッカー情報が存在しないレビュー結果

```markdown
# Phase 6 (testing) のレビュー結果

**判定**: PASS

## 全テスト成功

すべてのテストが成功しました。

## 改善提案（SUGGESTION）

- テストカバレッジを90%以上に向上させる
```

### 3.3. 差し戻しコンテキストテストデータ

#### 完全な差し戻しコンテキスト

```json
{
  "triggered_at": "2025-01-30T12:34:56.789Z",
  "from_phase": "testing",
  "from_step": "review",
  "reason": "Type definition missing: PhaseExecutionResult needs approved and feedback fields",
  "review_result": "@.ai-workflow/issue-49/06_testing/review/result.md",
  "details": {
    "blocker_count": 2,
    "suggestion_count": 4,
    "affected_tests": ["StepExecutor", "PhaseRunner", "BasePhase integration"]
  }
}
```

#### 最小限の差し戻しコンテキスト

```json
{
  "triggered_at": "2025-01-30T12:34:56.789Z",
  "from_phase": null,
  "from_step": null,
  "reason": "Manual rollback for testing",
  "review_result": null,
  "details": null
}
```

---

## 4. テスト環境要件

### 4.1. 必要なテスト環境

**ローカル環境**:
- Node.js 20以上
- npm 10以上
- Git 2.x以上

**CI/CD環境**:
- GitHub Actions（既存のCI設定を使用）
- 環境変数`CI`が設定されていること

### 4.2. 必要な外部サービス

**OpenAI API**:
- `ContentParser.extractBlockers()`および`extractSuggestions()`のテストで使用
- テスト時はモック化を推奨（APIコスト削減のため）

### 4.3. モック/スタブの必要性

**必須モック**:
- OpenAI API（`ContentParser`のテスト）
- ファイルシステム（`fs`モジュール）
- readline（確認プロンプトのテスト）

**オプショナルモック**:
- logger（ログ出力の検証）
- config（CI環境判定のテスト）

---

## 5. 品質ゲート確認

Phase 3のテストシナリオは以下の品質ゲートを満たす必要があります：

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **UNIT_INTEGRATION戦略に準拠**:
  - ユニットテストシナリオ: 16個（MetadataManager、BasePhase、PhaseRunner、ContentParser、Rollbackコマンド）
  - インテグレーションテストシナリオ: 16個（エンドツーエンド、ブロッカー情報抽出、後方互換性、エラーハンドリング、確認プロンプト、差し戻し履歴）
  - BDDシナリオ: 0個（戦略に含まれないため作成不要）

### ✅ 主要な正常系がカバーされている

**ユニットテスト正常系**:
- UC-MM-01: setRollbackContext() - 正常系
- UC-MM-02: getRollbackContext() - コンテキスト存在時
- UC-MM-04: clearRollbackContext() - 正常系
- UC-MM-05: addRollbackHistory() - 正常系
- UC-MM-06: updatePhaseForRollback() - reviseステップへの差し戻し
- UC-MM-08: resetSubsequentPhases() - 後続フェーズのリセット
- UC-BP-02: loadPrompt() - rollback_contextが存在する場合（reviseステップ）
- UC-BP-04: buildRollbackPromptSection() - 完全な差し戻しコンテキスト
- UC-PR-01: finalizePhase() - revise完了後にrollback_contextがクリアされる
- UC-CP-01: extractBlockers() - ブロッカー情報が存在する場合
- UC-CP-04: extractSuggestions() - 改善提案が存在する場合
- UC-RC-01: validateRollbackOptions() - 有効なオプション
- UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）
- UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）
- UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報

**インテグレーションテスト正常系**:
- IC-E2E-01: Phase 6 → Phase 4への完全な差し戻しフロー
- IC-E2E-02: 差し戻し理由の直接指定（--reason）
- IC-E2E-03: ドライランモード（--dry-run）
- IC-BP-01: レビュー結果ファイルからブロッカー情報を抽出し、メタデータに記録
- IC-COMPAT-01: 既存ワークフローへの影響がないことを確認
- IC-PROMPT-02: --forceオプションで確認プロンプトがスキップされる
- IC-HISTORY-01: 差し戻し履歴が正しく記録される

### ✅ 主要な異常系がカバーされている

**ユニットテスト異常系**:
- UC-MM-03: getRollbackContext() - コンテキスト未設定時
- UC-MM-09: resetSubsequentPhases() - 最後のフェーズの場合
- UC-BP-01: loadPrompt() - rollback_contextが存在しない場合（後方互換性）
- UC-BP-05: buildRollbackPromptSection() - 最小限の差し戻しコンテキスト
- UC-PR-02: finalizePhase() - revise未完了時はrollback_contextをクリアしない
- UC-CP-02: extractBlockers() - ブロッカー情報が存在しない場合
- UC-CP-03: extractBlockers() - OpenAI APIエラー時
- UC-RC-02: validateRollbackOptions() - 無効なフェーズ名
- UC-RC-03: validateRollbackOptions() - 無効なステップ名
- UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し
- UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定
- UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）
- UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）
- UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）
- UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）

**インテグレーションテスト異常系**:
- IC-ERR-01: 無効なフェーズ名でエラーメッセージが表示される
- IC-ERR-02: 未開始フェーズへの差し戻しでエラーメッセージが表示される
- IC-ERR-03: レビュー結果ファイルが存在しない場合のエラーハンドリング
- IC-ERR-04: 差し戻し理由が未指定の場合のエラーハンドリング
- IC-PROMPT-01: 確認プロンプトで`n`を入力した場合、処理がキャンセルされる

### ✅ 期待結果が明確である

すべてのテストシナリオに対して：
- **前提条件**が明記されている
- **入力**が具体的に記載されている
- **期待結果**が検証可能な形で記述されている
- **確認項目**がチェックリスト形式で列挙されている

---

## 6. テスト実行計画

### 6.1. テスト実行順序

**Phase 5（テストコード実装）で実装順序**:

1. **ユニットテスト**（並行実装可能）:
   - MetadataManager（9個）
   - BasePhase（5個）
   - PhaseRunner（2個）
   - ContentParser（4個）
   - Rollbackコマンド（16個）

2. **インテグレーションテスト**（ユニットテスト完了後）:
   - エンドツーエンドシナリオ（4個）
   - ブロッカー情報抽出（1個）
   - 後方互換性（2個）
   - エラーハンドリング（4個）
   - 確認プロンプト（3個）
   - 差し戻し履歴（2個）

### 6.2. テスト実行コマンド

**ユニットテスト実行**:
```bash
npm test -- tests/unit/core/metadata-manager.test.ts
npm test -- tests/unit/phases/base-phase.test.ts
npm test -- tests/unit/phases/lifecycle/phase-runner.test.ts
npm test -- tests/unit/core/content-parser.test.ts
npm test -- tests/unit/commands/rollback.test.ts
```

**インテグレーションテスト実行**:
```bash
npm test -- tests/integration/rollback-workflow.test.ts
```

**すべてのテスト実行**:
```bash
npm test
```

### 6.3. 成功基準

**Phase 6（テスト実行）での成功基準**:
- すべてのユニットテストが成功する（36個）
- すべてのインテグレーションテストが成功する（16個）
- テストカバレッジが80%以上である（新規コードのみ）
- 既存テストがすべて成功する（後方互換性の確認）

---

## 7. まとめ

### 7.1. テストシナリオ統計

| テスト種別 | シナリオ数 | カバレッジ |
|-----------|----------|-----------|
| **ユニットテスト** | 36個 | 新規メソッドすべて |
| **インテグレーションテスト** | 16個 | エンドツーエンドフロー、統合ポイント |
| **BDDテスト** | 0個 | 戦略に含まれない |
| **合計** | 52個 | - |

### 7.2. 主要な検証ポイント

1. **差し戻し理由の伝達**（最重要）:
   - メタデータへの記録（`rollback_context`）
   - `ROLLBACK_REASON.md`の生成
   - reviseプロンプトへの注入
   - revise完了後のクリア

2. **メタデータの整合性**:
   - 対象フェーズの状態変更
   - 後続フェーズのリセット
   - 差し戻し履歴の記録

3. **後方互換性**:
   - 既存ワークフローへの影響なし
   - rollback_contextが未設定の場合の動作

4. **エラーハンドリング**:
   - バリデーションエラー
   - ファイル不在エラー
   - OpenAI APIエラー

5. **ユーザーインタラクション**:
   - 確認プロンプト
   - ドライランモード
   - CI環境での自動スキップ

### 7.3. 次のステップ

Phase 3（テストシナリオ）が完了したら、以下の順序で進めます：

1. **Phase 4（Implementation）**: 型定義、MetadataManager、BasePhase、ContentParser、rollbackコマンドを実装
2. **Phase 5（Test Implementation）**: このテストシナリオに基づいてテストコードを実装
3. **Phase 6（Testing）**: テストを実行し、品質ゲートをクリア
4. **Phase 7（Documentation）**: README.md、CLAUDE.md、ARCHITECTURE.mdを更新
5. **Phase 8（Report）**: 実装サマリーとPRボディを作成

---

**作成者**: AI Workflow Agent (Phase 3: Test Scenario)
**レビュー対象**: Phase 3 品質ゲート（戦略準拠、正常系カバレッジ、異常系カバレッジ、期待結果の明確性）
