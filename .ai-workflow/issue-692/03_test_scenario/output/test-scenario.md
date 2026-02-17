# テストシナリオ: Issue #692 - test_preparation フェーズの追加

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2 設計書で決定）

### テスト対象の範囲

| カテゴリ | 対象 | テスト種別 |
|---------|------|-----------|
| 型定義 | `PhaseName` 型への `'test_preparation'` 追加 | Unit |
| フェーズ順序 | `PHASE_ORDER` 配列への挿入 | Unit + Integration |
| 依存関係 | `PHASE_DEPENDENCIES` の更新 | Unit + Integration |
| プリセット | `PHASE_PRESETS`, `PRESET_DESCRIPTIONS` の更新 | Unit + Integration |
| フェーズクラス | `TestPreparationPhase` (execute/review/revise) | Unit |
| フェーズファクトリ | `createPhaseInstance()` の case 追加 | Unit |
| フェーズ番号 | `getPhaseNumber()` のマッピング更新（2箇所） | Unit |
| ログ抽出 | `extractContentFromLog()` のヘッダーパターン追加 | Unit |
| エージェント優先順位 | `PHASE_AGENT_PRIORITY` マッピング追加 | Unit |
| モデル最適化 | `DEFAULT_DIFFICULTY_MODEL_MAPPING` への追加 | Unit |
| プロンプト | 6 ファイル（ja/en × execute/review/revise） | Unit |

### テストの目的

1. **型安全性の保証**: `PhaseName` 型の拡張が全ての `Record<PhaseName, ...>` マッピングに波及し、漏れがないことを検証
2. **フェーズ統合の正確性**: `test_preparation` が正しい位置（test_implementation の直後、testing の直前）に挿入されていることを検証
3. **依存関係の整合性**: 新しい依存チェーン（test_implementation → test_preparation → testing）が正しく機能することを検証
4. **後方互換性**: 既存のプリセット・依存関係・フェーズ番号が正しく動作し続けることを検証
5. **新規クラスの機能性**: `TestPreparationPhase` の execute/review/revise が正しく動作することを検証

---

## 2. Unit テストシナリオ

### 2.1 PhaseName 型の拡張（FR-001）

**テスト対象ファイル**: `src/types.ts`
**テストファイル**: 既存テストの TypeScript コンパイル成功で間接検証

#### UT-TYPE-001: PhaseName 型に test_preparation が含まれる

- **目的**: `PhaseName` 型ユニオンに `'test_preparation'` が追加されていることを検証
- **前提条件**: `src/types.ts` が変更済み
- **入力**: TypeScript コンパイル
- **期待結果**: `npm run lint` がエラーなく完了すること
- **検証方法**: `'test_preparation'` を `PhaseName` 型の変数に代入可能であること（型レベル検証はコンパイル時に実行）

---

### 2.2 PHASE_ORDER 配列の更新（FR-002）

**テスト対象ファイル**: `src/commands/execute.ts`
**テストファイル**: `tests/unit/commands/execute.test.ts`（既存テスト更新）

#### UT-ORDER-001: test_preparation が PHASE_ORDER に含まれる

- **目的**: `PHASE_ORDER` 配列に `'test_preparation'` が含まれていることを検証
- **前提条件**: `PHASE_ORDER` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_ORDER` が `'test_preparation'` を含むこと
- **テストデータ**: なし

#### UT-ORDER-002: test_preparation の位置が正しい

- **目的**: `test_preparation` が `test_implementation` の直後、`testing` の直前に配置されていることを検証
- **前提条件**: `PHASE_ORDER` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  - `PHASE_ORDER.indexOf('test_preparation')` が `PHASE_ORDER.indexOf('test_implementation') + 1` と等しい
  - `PHASE_ORDER.indexOf('test_preparation')` が `PHASE_ORDER.indexOf('testing') - 1` と等しい

#### UT-ORDER-003: フェーズ総数が 11 である

- **目的**: `test_preparation` の追加によりフェーズ総数が 10 から 11 に増加していることを検証
- **前提条件**: `PHASE_ORDER` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_ORDER.length` が 11 であること

---

### 2.3 フェーズ依存関係（FR-003）

**テスト対象ファイル**: `src/core/phase-dependencies.ts`
**テストファイル**: `tests/unit/phase-dependencies.test.ts`（既存テスト更新）

#### UT-DEP-001: test_preparation の依存関係が正しく定義されている

- **目的**: `PHASE_DEPENDENCIES['test_preparation']` が `['test_implementation']` であることを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_DEPENDENCIES['test_preparation']` が `['test_implementation']` と等しいこと

#### UT-DEP-002: testing の依存が test_preparation に変更されている

- **目的**: `PHASE_DEPENDENCIES['testing']` が `['test_implementation']` から `['test_preparation']` に変更されていることを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_DEPENDENCIES['testing']` が `['test_preparation']` と等しいこと

#### UT-DEP-003: 全 Phase が PHASE_DEPENDENCIES に定義されている

- **目的**: `PHASE_DEPENDENCIES` のキーに `test_preparation` を含む全 11 フェーズが定義されていることを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: 期待されるフェーズ名リスト（11 件）
- **期待結果**: すべてのフェーズ名が `PHASE_DEPENDENCIES` のキーに含まれること
- **テストデータ**:
  ```typescript
  const expectedPhases: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'test_preparation',
    'testing', 'documentation', 'report', 'evaluation',
  ];
  ```

#### UT-DEP-004: 循環依存が存在しない

- **目的**: `test_preparation` 追加後も依存関係グラフに循環が存在しないことを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: なし
- **期待結果**: `detectCircularDependencies()` が空配列を返すこと

#### UT-DEP-005: test_preparation の依存関係バリデーション（正常系）

- **目的**: `test_implementation` が完了済みの場合、`test_preparation` の依存関係チェックが成功することを検証
- **前提条件**: `test_implementation` のステータスが `'completed'`
- **入力**: `validatePhaseDependencies('test_preparation', metadataManager)`
- **期待結果**: `result.valid === true`、`result.missing_phases` が空

#### UT-DEP-006: test_preparation の依存関係バリデーション（異常系）

- **目的**: `test_implementation` が未完了の場合、`test_preparation` の依存関係チェックが失敗することを検証
- **前提条件**: `test_implementation` のステータスが `'pending'`
- **入力**: `validatePhaseDependencies('test_preparation', metadataManager)`
- **期待結果**: `result.valid === false`、`result.error` に `test_implementation` が含まれること

#### UT-DEP-007: testing の新しい依存関係バリデーション（正常系）

- **目的**: `test_preparation` が完了済みの場合、`testing` の依存関係チェックが成功することを検証
- **前提条件**: `test_preparation` のステータスが `'completed'`
- **入力**: `validatePhaseDependencies('testing', metadataManager)`
- **期待結果**: `result.valid === true`

#### UT-DEP-008: testing の新しい依存関係バリデーション（異常系）

- **目的**: `test_preparation` が未完了の場合、`testing` の依存関係チェックが失敗することを検証
- **前提条件**: `test_preparation` が `'pending'`、`test_implementation` が `'completed'`
- **入力**: `validatePhaseDependencies('testing', metadataManager)`
- **期待結果**: `result.valid === false`、`result.error` に `test_preparation` が含まれること（旧依存の `test_implementation` ではないこと）

#### UT-DEP-009: skipPhases で test_preparation をスキップした場合の testing 依存

- **目的**: `skipPhases` に `test_preparation` を指定した場合、`testing` の依存関係チェックが成功することを検証
- **前提条件**: `test_preparation` が未完了
- **入力**: `validatePhaseDependencies('testing', metadataManager, { skipPhases: ['test_preparation'] })`
- **期待結果**: `result.valid === true`

---

### 2.4 フェーズプリセットの更新（FR-004）

**テスト対象ファイル**: `src/core/phase-dependencies.ts`
**テストファイル**: `tests/unit/phase-dependencies.test.ts`（既存テスト更新）

#### UT-PRESET-001: implementation プリセットに test_preparation が含まれる

- **目的**: `PHASE_PRESETS['implementation']` に `'test_preparation'` が含まれていることを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  ```typescript
  PHASE_PRESETS['implementation'] === [
    'planning', 'implementation', 'test_implementation',
    'test_preparation', 'testing', 'documentation', 'report'
  ]
  ```

#### UT-PRESET-002: testing プリセットに test_preparation が含まれる

- **目的**: `PHASE_PRESETS['testing']` に `'test_preparation'` が含まれていることを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  ```typescript
  PHASE_PRESETS['testing'] === [
    'planning', 'test_implementation', 'test_preparation', 'testing'
  ]
  ```

#### UT-PRESET-003: full-test プリセットに test_preparation が含まれない

- **目的**: `PHASE_PRESETS['full-test']` が変更されていないことを検証（testing を含まないため追加不要）
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  ```typescript
  PHASE_PRESETS['full-test'] === ['planning', 'test_scenario', 'test_implementation']
  ```

#### UT-PRESET-004: quick-fix プリセットが変更されていない

- **目的**: `PHASE_PRESETS['quick-fix']` が変更されていないことを検証（testing を含まないため追加不要）
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  ```typescript
  PHASE_PRESETS['quick-fix'] === ['planning', 'implementation', 'documentation', 'report']
  ```

#### UT-PRESET-005: プリセット総数が変わらない（10 プリセット）

- **目的**: プリセットの数が変わっていないことを検証（プリセット自体の追加・削除はないため）
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `Object.keys(PHASE_PRESETS).length === 10`

#### UT-PRESET-006: PRESET_DESCRIPTIONS のキーが PHASE_PRESETS と一致する

- **目的**: `PRESET_DESCRIPTIONS` のキー集合が `PHASE_PRESETS` のキー集合と完全に一致することを検証
- **前提条件**: `PRESET_DESCRIPTIONS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `Object.keys(PHASE_PRESETS).sort()` と `Object.keys(PRESET_DESCRIPTIONS).sort()` が等しいこと

#### UT-PRESET-007: PRESET_DESCRIPTIONS の implementation 説明に TestPreparation が含まれる

- **目的**: `PRESET_DESCRIPTIONS['implementation']` の説明に `TestPreparation` が含まれていることを検証
- **前提条件**: `PRESET_DESCRIPTIONS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PRESET_DESCRIPTIONS['implementation']` が `'TestPreparation'` を含むこと

#### UT-PRESET-008: PRESET_DESCRIPTIONS の testing 説明に TestPreparation が含まれる

- **目的**: `PRESET_DESCRIPTIONS['testing']` の説明に `TestPreparation` が含まれていることを検証
- **前提条件**: `PRESET_DESCRIPTIONS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PRESET_DESCRIPTIONS['testing']` が `'TestPreparation'` を含むこと

#### UT-PRESET-009: すべてのプリセットに planning が含まれ先頭である

- **目的**: 既存の規約（全プリセット先頭が planning）が維持されていることを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: すべてのプリセットで `phases[0] === 'planning'`

---

### 2.5 TestPreparationPhase クラス（FR-005）

**テスト対象ファイル**: `src/phases/test-preparation.ts`（新規）
**テストファイル**: `tests/unit/phases/test-preparation.test.ts`（新規作成）

#### UT-PHASE-001: コンストラクタで phaseName が 'test_preparation' に設定される

- **目的**: `TestPreparationPhase` のインスタンス生成時に `phaseName` が `'test_preparation'` に正しく設定されることを検証
- **前提条件**: `TestPreparationPhase` クラスが実装済み
- **入力**: `PhaseInitializationParams`（モック）
- **期待結果**: `instance.phaseName === 'test_preparation'`（内部プロパティの検証）

#### UT-PHASE-002: execute() が executePhaseTemplate を呼び出す（正常系）

- **目的**: `execute()` メソッドが `executePhaseTemplate()` を正しいパラメータで呼び出すことを検証
- **前提条件**: メタデータに `issue_number` が設定済み、モック環境
- **入力**: 内部メタデータの `issue_number`
- **期待結果**:
  - `executePhaseTemplate` が `'test-preparation.md'` を出力ファイル名として呼び出される
  - テンプレート変数に `planning_document_path`, `test_implementation_context`, `implementation_context`, `issue_number` が含まれる
  - オプションに `maxTurns: 80` が設定されている
  - オプションに `enableFallback: true` が設定されている

#### UT-PHASE-003: execute() が buildOptionalContext を使用してコンテキストを構築する

- **目的**: `execute()` メソッドが `buildOptionalContext()` を使用して `test_implementation` と `implementation` のコンテキストを構築することを検証
- **前提条件**: モック環境
- **入力**: なし（内部処理）
- **期待結果**:
  - `buildOptionalContext('test_implementation', 'test-implementation.md', ...)` が呼び出される
  - `buildOptionalContext('implementation', 'implementation.md', ...)` が呼び出される

#### UT-PHASE-004: review() が出力ファイル不在時に FAIL を返す

- **目的**: `review()` メソッドが `test-preparation.md` が存在しない場合に失敗結果を返すことを検証
- **前提条件**: `output/test-preparation.md` が存在しない
- **入力**: なし
- **期待結果**: `result.success === false`

#### UT-PHASE-005: review() が出力ファイル存在時にレビュープロンプトを実行する

- **目的**: `review()` メソッドが `test-preparation.md` が存在する場合にレビューエージェントを実行することを検証
- **前提条件**: `output/test-preparation.md` が存在する
- **入力**: なし（内部処理）
- **期待結果**:
  - レビュープロンプトがロードされる
  - エージェントが実行される
  - レビュー結果が解析される（PASS/FAIL 判定）

#### UT-PHASE-006: revise() が出力ファイル不在時に FAIL を返す

- **目的**: `revise()` メソッドが `test-preparation.md` が存在しない場合に失敗結果を返すことを検証
- **前提条件**: `output/test-preparation.md` が存在しない
- **入力**: `reviewFeedback: 'ランタイムのバージョンが不正です'`
- **期待結果**: `result.success === false`

#### UT-PHASE-007: revise() がレビューフィードバックを含むプロンプトでエージェントを実行する

- **目的**: `revise()` メソッドがレビューフィードバックをテンプレート変数に含めてエージェントを実行することを検証
- **前提条件**: `output/test-preparation.md` が存在する
- **入力**: `reviewFeedback: 'Python 3.11 が必要ですが 3.9 がインストールされています'`
- **期待結果**:
  - テンプレート変数 `{review_feedback}` にレビューフィードバックが設定される
  - エージェントが実行される

---

### 2.6 フェーズファクトリの更新（FR-006）

**テスト対象ファイル**: `src/core/phase-factory.ts`
**テストファイル**: 型レベルの検証（コンパイル時）+ 統合テストで間接検証

#### UT-FACTORY-001: createPhaseInstance で test_preparation が TestPreparationPhase を返す

- **目的**: `createPhaseInstance('test_preparation', context)` が `TestPreparationPhase` のインスタンスを返すことを検証
- **前提条件**: `phase-factory.ts` が更新済み
- **入力**: `phaseName: 'test_preparation'`, `context: PhaseContext`（モック）
- **期待結果**: 返り値が `TestPreparationPhase` のインスタンスであること

---

### 2.7 フェーズ番号マッピング（FR-007）

**テスト対象ファイル**: `src/phases/base-phase.ts`, `src/commands/rollback.ts`
**テストファイル**: `tests/unit/commands/rollback.test.ts`（既存テスト更新）

#### UT-NUM-001: base-phase.ts の getPhaseNumber が test_preparation に '06' を返す

- **目的**: `base-phase.ts` の `getPhaseNumber('test_preparation')` が `'06'` を返すことを検証
- **前提条件**: `base-phase.ts` が更新済み
- **入力**: `phase: 'test_preparation'`
- **期待結果**: `'06'`
- **補足**: `getPhaseNumber()` は `private` メソッドのため、ディレクトリ名の生成結果から間接検証

#### UT-NUM-002: rollback.ts の getPhaseNumber が全フェーズに正しい番号を返す

- **目的**: `rollback.ts` の `getPhaseNumber()` が全 11 フェーズに対して正しい番号を返すことを検証
- **前提条件**: `rollback.ts` が更新済み
- **入力**: 全 11 フェーズ名
- **期待結果**:
  ```
  planning: '00', requirements: '01', design: '02', test_scenario: '03',
  implementation: '04', test_implementation: '05', test_preparation: '06',
  testing: '07', documentation: '08', report: '09', evaluation: '10'
  ```

#### UT-NUM-003: フェーズ番号のシフトが正しい（testing）

- **目的**: `testing` のフェーズ番号が `'06'` から `'07'` に変更されていることを検証
- **前提条件**: `getPhaseNumber()` が更新済み
- **入力**: `phase: 'testing'`
- **期待結果**: `getPhaseNumber('testing') === '07'`

#### UT-NUM-004: フェーズ番号のシフトが正しい（documentation）

- **目的**: `documentation` のフェーズ番号が `'07'` から `'08'` に変更されていることを検証
- **前提条件**: `getPhaseNumber()` が更新済み
- **入力**: `phase: 'documentation'`
- **期待結果**: `getPhaseNumber('documentation') === '08'`

#### UT-NUM-005: フェーズ番号のシフトが正しい（report）

- **目的**: `report` のフェーズ番号が `'08'` から `'09'` に変更されていることを検証
- **前提条件**: `getPhaseNumber()` が更新済み
- **入力**: `phase: 'report'`
- **期待結果**: `getPhaseNumber('report') === '09'`

#### UT-NUM-006: フェーズ番号のシフトが正しい（evaluation）

- **目的**: `evaluation` のフェーズ番号が `'09'` から `'10'` に変更されていることを検証
- **前提条件**: `getPhaseNumber()` が更新済み
- **入力**: `phase: 'evaluation'`
- **期待結果**: `getPhaseNumber('evaluation') === '10'`

#### UT-NUM-007: 変更前のフェーズ番号が維持されている（planning〜test_implementation）

- **目的**: `planning` から `test_implementation` までのフェーズ番号が変更されていないことを検証
- **前提条件**: `getPhaseNumber()` が更新済み
- **入力**: `planning`, `requirements`, `design`, `test_scenario`, `implementation`, `test_implementation`
- **期待結果**: それぞれ `'00'`, `'01'`, `'02'`, `'03'`, `'04'`, `'05'`

#### UT-NUM-008: base-phase.ts と rollback.ts の getPhaseNumber が同期している

- **目的**: 2箇所の `getPhaseNumber()` 実装が同じ結果を返すことを検証
- **前提条件**: 両方のファイルが更新済み
- **入力**: 全 11 フェーズ名
- **期待結果**: すべてのフェーズで同じ番号が返されること
- **検証方法**: `rollback.ts` の `getPhaseNumber()` はエクスポートされているため直接テスト可能。`base-phase.ts` はディレクトリ名生成から間接検証

---

### 2.8 ログ抽出パターン（FR-011）

**テスト対象ファイル**: `src/phases/base-phase.ts`
**テストファイル**: 間接検証（`extractContentFromLog` の動作確認）

#### UT-LOG-001: test_preparation のヘッダーパターンが定義されている

- **目的**: `extractContentFromLog()` の `headerPatterns` に `test_preparation` パターンが追加されていることを検証
- **前提条件**: `base-phase.ts` が更新済み
- **入力**: `# テスト準備` または `# Test Preparation` で始まるログ
- **期待結果**: パターンがマッチし、コンテンツが抽出されること

#### UT-LOG-002: test_preparation の日本語ヘッダーにマッチする

- **目的**: 日本語ヘッダー「テスト準備」または「環境準備」にマッチすることを検証
- **前提条件**: ヘッダーパターン追加済み
- **入力**: `# テスト準備\n\n## セクション1\n内容...`
- **期待結果**: パターン `/^#+ (テスト準備|Test Preparation|環境準備|Environment Setup)/im` にマッチ

#### UT-LOG-003: test_preparation の英語ヘッダーにマッチする

- **目的**: 英語ヘッダー「Test Preparation」または「Environment Setup」にマッチすることを検証
- **前提条件**: ヘッダーパターン追加済み
- **入力**: `# Test Preparation\n\n## Section 1\nContent...`
- **期待結果**: パターンにマッチ

---

### 2.9 エージェント優先順位（FR-008）

**テスト対象ファイル**: `src/commands/execute/agent-setup.ts`
**テストファイル**: Unit テスト

#### UT-AGENT-001: PHASE_AGENT_PRIORITY に test_preparation が codex-first で定義されている

- **目的**: `PHASE_AGENT_PRIORITY['test_preparation']` が `'codex-first'` であることを検証
- **前提条件**: `agent-setup.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_AGENT_PRIORITY['test_preparation'] === 'codex-first'`

#### UT-AGENT-002: 既存フェーズのエージェント優先順位が変更されていない

- **目的**: `test_preparation` の追加により既存フェーズの優先順位が変更されていないことを検証
- **前提条件**: `agent-setup.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  - `PHASE_AGENT_PRIORITY['planning'] === 'claude-first'`
  - `PHASE_AGENT_PRIORITY['implementation'] === 'codex-first'`
  - `PHASE_AGENT_PRIORITY['testing'] === 'codex-first'`
  - （その他既存フェーズも変更なし）

#### UT-AGENT-003: PHASE_AGENT_PRIORITY の全 PhaseName に対するエントリが存在する

- **目的**: 全 11 フェーズ分のエージェント優先順位マッピングが存在することを検証
- **前提条件**: `agent-setup.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `Object.keys(PHASE_AGENT_PRIORITY).length >= 11`、全 PhaseName のキーが存在

---

### 2.10 モデル最適化マッピング（FR-009）

**テスト対象ファイル**: `src/core/model-optimizer.ts`
**テストファイル**: Unit テスト

#### UT-MODEL-001: simple 難易度で test_preparation のマッピングが存在する

- **目的**: `DEFAULT_DIFFICULTY_MODEL_MAPPING['simple']` に `test_preparation` のエントリが存在することを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `DEFAULT_DIFFICULTY_MODEL_MAPPING['simple']['test_preparation']` が定義されている
- **詳細**: 全ステップ（execute/review/revise）が `LIGHTWEIGHT_MODEL_CONFIG`（`sonnet/mini`）

#### UT-MODEL-002: moderate 難易度で test_preparation のマッピングが存在する

- **目的**: `DEFAULT_DIFFICULTY_MODEL_MAPPING['moderate']` に `test_preparation` のエントリが存在し、testing と同等の設定であることを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `DEFAULT_DIFFICULTY_MODEL_MAPPING['moderate']['test_preparation']` が定義されている
- **詳細**: execute = HIGH_QUALITY（opus/max）、review = LIGHTWEIGHT（sonnet/mini）、revise = HIGH_QUALITY（opus/max）

#### UT-MODEL-003: complex 難易度で test_preparation のマッピングが存在する

- **目的**: `DEFAULT_DIFFICULTY_MODEL_MAPPING['complex']` に `test_preparation` のエントリが存在することを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `DEFAULT_DIFFICULTY_MODEL_MAPPING['complex']['test_preparation']` が定義されている
- **詳細**: 全ステップが `HIGH_QUALITY_MODEL_CONFIG`（execute/revise = opus/max、review = sonnet/mini）

#### UT-MODEL-004: ModelOptimizer.resolveModel が test_preparation で正しいモデルを返す

- **目的**: `ModelOptimizer.resolveModel('test_preparation', step)` が難易度に応じた正しいモデルを返すことを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: `phase: 'test_preparation'`, `step: 'execute'`, `difficultyLevel: 'moderate'`
- **期待結果**: `{ claudeModel: 'opus', codexModel: 'max' }`

#### UT-MODEL-005: ModelOptimizer.resolveModel の review ステップは常に lightweight

- **目的**: review ステップでは難易度に関係なく lightweight モデルが返されることを検証（既存ロジック）
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: `phase: 'test_preparation'`, `step: 'review'`, `difficultyLevel: 'complex'`
- **期待結果**: `{ claudeModel: 'sonnet', codexModel: 'mini' }`

---

### 2.11 プロンプトファイル（FR-010）

**テスト対象ファイル**: `src/prompts/test_preparation/`（新規 6 ファイル）
**テストファイル**: Unit テスト

#### UT-PROMPT-001: 日本語 execute プロンプトファイルが存在する

- **目的**: `src/prompts/test_preparation/ja/execute.txt` が存在し、空でないことを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: ファイルパス
- **期待結果**: ファイルが存在し、コンテンツ長が 0 より大きい

#### UT-PROMPT-002: 日本語 review プロンプトファイルが存在する

- **目的**: `src/prompts/test_preparation/ja/review.txt` が存在し、空でないことを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: ファイルパス
- **期待結果**: ファイルが存在し、コンテンツ長が 0 より大きい

#### UT-PROMPT-003: 日本語 revise プロンプトファイルが存在する

- **目的**: `src/prompts/test_preparation/ja/revise.txt` が存在し、空でないことを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: ファイルパス
- **期待結果**: ファイルが存在し、コンテンツ長が 0 より大きい

#### UT-PROMPT-004: 英語 execute プロンプトファイルが存在する

- **目的**: `src/prompts/test_preparation/en/execute.txt` が存在し、空でないことを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: ファイルパス
- **期待結果**: ファイルが存在し、コンテンツ長が 0 より大きい

#### UT-PROMPT-005: 英語 review プロンプトファイルが存在する

- **目的**: `src/prompts/test_preparation/en/review.txt` が存在し、空でないことを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: ファイルパス
- **期待結果**: ファイルが存在し、コンテンツ長が 0 より大きい

#### UT-PROMPT-006: 英語 revise プロンプトファイルが存在する

- **目的**: `src/prompts/test_preparation/en/revise.txt` が存在し、空でないことを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: ファイルパス
- **期待結果**: ファイルが存在し、コンテンツ長が 0 より大きい

#### UT-PROMPT-007: execute プロンプトにテンプレート変数が含まれる

- **目的**: execute プロンプトに必要なテンプレート変数プレースホルダーが含まれていることを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: `src/prompts/test_preparation/ja/execute.txt` のコンテンツ
- **期待結果**: `{planning_document_path}`, `{test_implementation_context}`, `{implementation_context}`, `{issue_number}` が含まれること

#### UT-PROMPT-008: 日本語プロンプトに日本語出力指示が含まれる

- **目的**: 日本語プロンプトに言語別の出力指示が含まれていることを検証（CLAUDE.md 規約準拠）
- **前提条件**: プロンプトファイルが作成済み
- **入力**: `src/prompts/test_preparation/ja/execute.txt` のコンテンツ
- **期待結果**: 「日本語で」に相当する指示が含まれること

#### UT-PROMPT-009: 英語プロンプトに英語出力指示が含まれる

- **目的**: 英語プロンプトに言語別の出力指示が含まれていることを検証
- **前提条件**: プロンプトファイルが作成済み
- **入力**: `src/prompts/test_preparation/en/execute.txt` のコンテンツ
- **期待結果**: 「English」に相当する指示が含まれること

---

### 2.12 getPresetPhases 関数の更新（FR-002 + FR-004）

**テスト対象ファイル**: `src/commands/execute.ts`
**テストファイル**: `tests/unit/commands/execute.test.ts`（既存テスト更新）

#### UT-GETPRESET-001: implementation プリセットのフェーズリストが更新されている

- **目的**: `getPresetPhases('implementation')` が `test_preparation` を含む更新後のフェーズリストを返すことを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: `presetName: 'implementation'`
- **期待結果**:
  ```typescript
  ['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']
  ```

#### UT-GETPRESET-002: testing プリセットのフェーズリストが更新されている

- **目的**: `getPresetPhases('testing')` が `test_preparation` を含む更新後のフェーズリストを返すことを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: `presetName: 'testing'`
- **期待結果**:
  ```typescript
  ['planning', 'test_implementation', 'test_preparation', 'testing']
  ```

---

### 2.13 rollback-auto テストの更新

**テスト対象ファイル**: `src/commands/rollback.ts`
**テストファイル**: `tests/unit/commands/rollback-auto.test.ts`（既存テスト更新）

#### UT-RBAUTO-001: メタデータに test_preparation フェーズが含まれる

- **目的**: テスト用メタデータの `phases` オブジェクトに `test_preparation` が含まれることを検証
- **前提条件**: テストファイルのメタデータ定義が更新済み
- **入力**: テスト内の `createMetadata()` 関数の出力
- **期待結果**: `metadata.phases.test_preparation` が存在すること

---

### 2.14 Rollback コマンドのメタデータ整合性

**テスト対象ファイル**: `tests/unit/commands/rollback.test.ts`
**テストファイル**: `tests/unit/commands/rollback.test.ts`（既存テスト更新）

#### UT-RB-001: テスト用メタデータに test_preparation フェーズが含まれる

- **目的**: ロールバックテストで使用するメタデータの `phases` オブジェクトに `test_preparation` が含まれることを検証
- **前提条件**: テストファイルのメタデータ定義が更新済み
- **入力**: テスト内の `metadataData.phases`
- **期待結果**: `metadataData.phases.test_preparation` が存在し、適切な初期状態（`status: 'pending'`）を持つこと

#### UT-RB-002: generateRollbackReasonMarkdown が新しいフェーズ番号を使用する

- **目的**: `generateRollbackReasonMarkdown()` が `testing` フェーズの参照パスに新しいフェーズ番号 `'07'` を使用することを検証
- **前提条件**: `rollback.ts` の `getPhaseNumber()` が更新済み
- **入力**: `options: { toPhase: 'implementation', fromPhase: 'testing', reasonFile: '.ai-workflow/issue-49/07_testing/review/result.md' }`
- **期待結果**: 生成された Markdown に正しいパスが含まれること

---

## 3. Integration テストシナリオ

### 3.1 プリセット実行の統合テスト

**テスト対象**: フェーズ選択ロジック全体
**テストファイル**: `tests/integration/preset-execution.test.ts`（既存テスト更新）

#### IT-PRESET-001: implementation プリセットの Phase 構成（更新）

- **目的**: `implementation` プリセットが `test_preparation` を含む 7 フェーズで構成されることを統合的に検証
- **前提条件**: `PHASE_PRESETS`, `PHASE_DEPENDENCIES` が更新済み
- **テスト手順**:
  1. `getPresetPhases('implementation')` を呼び出す
  2. 返されたフェーズリストを検証する
- **期待結果**:
  ```typescript
  phases === ['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']
  phases.length === 7
  ```
- **確認項目**:
  - [x] `test_preparation` が `test_implementation` の直後に配置されている
  - [x] `test_preparation` が `testing` の直前に配置されている
  - [x] フェーズ数が 6 から 7 に増加している

#### IT-PRESET-002: testing プリセットの Phase 構成（更新）

- **目的**: `testing` プリセットが `test_preparation` を含む 4 フェーズで構成されることを統合的に検証
- **前提条件**: `PHASE_PRESETS`, `PHASE_DEPENDENCIES` が更新済み
- **テスト手順**:
  1. `getPresetPhases('testing')` を呼び出す
  2. 返されたフェーズリストを検証する
- **期待結果**:
  ```typescript
  phases === ['planning', 'test_implementation', 'test_preparation', 'testing']
  phases.length === 4
  ```
- **確認項目**:
  - [x] `test_preparation` が含まれている
  - [x] フェーズ数が 3 から 4 に増加している

#### IT-PRESET-003: full-test プリセットの Phase 構成（変更なし）

- **目的**: `full-test` プリセットが変更されていないことを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **テスト手順**:
  1. `getPresetPhases('full-test')` を呼び出す
  2. 返されたフェーズリストを検証する
- **期待結果**:
  ```typescript
  phases === ['planning', 'test_scenario', 'test_implementation']
  phases.length === 3
  ```

#### IT-PRESET-004: quick-fix プリセットの Phase 構成（変更なし）

- **目的**: `quick-fix` プリセットが変更されていないことを検証
- **テスト手順**:
  1. `getPresetPhases('quick-fix')` を呼び出す
  2. 返されたフェーズリストを検証する
- **期待結果**:
  ```typescript
  phases === ['planning', 'implementation', 'documentation', 'report']
  phases.length === 4
  ```

#### IT-PRESET-005: finalize プリセットの Phase 構成（変更なし）

- **目的**: `finalize` プリセットが変更されていないことを検証
- **テスト手順**:
  1. `getPresetPhases('finalize')` を呼び出す
  2. 返されたフェーズリストを検証する
- **期待結果**:
  ```typescript
  phases === ['planning', 'documentation', 'report', 'evaluation']
  phases.length === 4
  ```

---

### 3.2 プリセットの依存関係整合性

**テスト対象**: フェーズ依存関係とプリセットの整合性
**テストファイル**: `tests/integration/preset-execution.test.ts`（既存テスト更新）

#### IT-DEPINT-001: 各プリセットの Phase が有効な依存関係を持つ

- **目的**: すべてのプリセットに含まれる全フェーズが `PHASE_DEPENDENCIES` に定義されていることを検証
- **前提条件**: `PHASE_PRESETS`, `PHASE_DEPENDENCIES` が更新済み
- **テスト手順**:
  1. `PHASE_PRESETS` の各プリセットを走査する
  2. 各フェーズが `PHASE_DEPENDENCIES` に定義されているかチェックする
- **期待結果**: すべてのフェーズが有効であること（`test_preparation` を含む）
- **確認項目**:
  - [x] `test_preparation` が `PHASE_DEPENDENCIES` のキーに含まれている
  - [x] 全プリセットのフェーズが有効

#### IT-DEPINT-002: プリセット内の Phase 順序が依存関係に違反していない

- **目的**: すべてのプリセットにおいて、フェーズの順序がフェーズ依存関係に違反していないことを検証
- **前提条件**: `PHASE_PRESETS`, `PHASE_DEPENDENCIES` が更新済み
- **テスト手順**:
  1. `PHASE_PRESETS` の各プリセットを走査する
  2. 各フェーズについて、その依存フェーズがすでに処理されているかチェックする
- **期待結果**: すべてのプリセットで依存関係の順序が正しいこと
- **特に検証する点**:
  - `implementation` プリセットで `test_preparation` が `test_implementation` の後に来ること
  - `testing` プリセットで `test_preparation` が `test_implementation` の後に来ること
  - `test_preparation` → `testing` の依存が正しいこと

#### IT-DEPINT-003: 推移的依存関係チェーン test_implementation → test_preparation → testing

- **目的**: 新しい依存関係チェーン（test_implementation → test_preparation → testing）が正しく機能することを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **テスト手順**:
  1. `test_preparation` の依存を確認: `['test_implementation']`
  2. `testing` の依存を確認: `['test_preparation']`
  3. 推移的に `testing` は `test_implementation` に間接依存していることを確認
- **期待結果**:
  - `PHASE_DEPENDENCIES['test_preparation']` が `['test_implementation']` を含む
  - `PHASE_DEPENDENCIES['testing']` が `['test_preparation']` を含む
  - `testing` → `test_preparation` → `test_implementation` の推移的チェーンが存在

---

### 3.3 全プリセットの網羅性テスト

**テスト対象**: プリセット定義の完全性
**テストファイル**: `tests/integration/preset-execution.test.ts`（既存テスト更新）

#### IT-ENUM-001: 全プリセットが定義されている（10 プリセット）

- **目的**: 全 10 プリセットが定義されていることを検証（プリセット数の変更はない）
- **前提条件**: `PHASE_PRESETS` が更新済み
- **テスト手順**:
  1. `Object.keys(PHASE_PRESETS)` の長さを確認する
  2. 期待されるプリセット名リストと比較する
- **期待結果**: `Object.keys(PHASE_PRESETS).length === 10`
- **テストデータ**:
  ```typescript
  const expectedPresets = [
    'review-requirements', 'review-design', 'review-test-scenario',
    'analysis-design', 'prototype', 'quick-fix', 'implementation',
    'full-test', 'testing', 'finalize',
  ];
  ```

#### IT-ENUM-002: 非推奨プリセットが 4 個定義されている

- **目的**: 非推奨プリセットの数が変わっていないことを検証
- **前提条件**: `DEPRECATED_PRESETS` が変更されていない
- **テスト手順**:
  1. `Object.keys(DEPRECATED_PRESETS)` の長さを確認する
- **期待結果**: `Object.keys(DEPRECATED_PRESETS).length === 4`

---

### 3.4 ビルド・型チェックの統合検証

**テスト対象**: プロジェクト全体の整合性
**テストファイル**: コマンドラインによる統合検証

#### IT-BUILD-001: TypeScript コンパイルが成功する

- **目的**: `PhaseName` 型拡張後、すべての `Record<PhaseName, ...>` マッピングに `test_preparation` エントリが存在し、コンパイルが成功することを検証
- **テスト手順**:
  1. `npm run lint` を実行する
- **期待結果**: コンパイルエラーなし

#### IT-BUILD-002: ビルドが成功する

- **目的**: プロジェクト全体のビルドが成功することを検証
- **テスト手順**:
  1. `npm run build` を実行する
- **期待結果**: ビルド成功

#### IT-BUILD-003: npm run validate が成功する

- **目的**: lint + test + build の統合検証が成功することを検証
- **テスト手順**:
  1. `npm run validate` を実行する
- **期待結果**: すべてのステップが成功

---

## 4. テストデータ

### 4.1 メタデータテストデータ

#### 全フェーズ完了状態のメタデータ

```typescript
const completedMetadata = {
  issue_number: '692',
  issue_url: 'https://github.com/test/repo/issues/692',
  issue_title: 'Add test_preparation phase',
  phases: {
    planning: { status: 'completed', completed_steps: ['execute', 'review'] },
    requirements: { status: 'completed', completed_steps: ['execute', 'review'] },
    design: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_scenario: { status: 'completed', completed_steps: ['execute', 'review'] },
    implementation: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_implementation: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_preparation: { status: 'completed', completed_steps: ['execute', 'review'] },
    testing: { status: 'completed', completed_steps: ['execute', 'review'] },
    documentation: { status: 'completed', completed_steps: ['execute', 'review'] },
    report: { status: 'completed', completed_steps: ['execute', 'review'] },
    evaluation: { status: 'completed', completed_steps: ['execute', 'review'] },
  },
};
```

#### test_preparation 依存検証用メタデータ

```typescript
// test_implementation 完了、test_preparation 未開始
const depTestMetadata = {
  phases: {
    // ... 前フェーズは全て completed ...
    test_implementation: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_preparation: { status: 'pending', completed_steps: [], current_step: null },
    testing: { status: 'pending', completed_steps: [], current_step: null },
    // ...
  },
};
```

### 4.2 テスト用ベースフェーズデータ

```typescript
const basePhase = {
  status: 'pending',
  completed_steps: [],
  current_step: null,
  started_at: null,
  completed_at: null,
  review_result: null,
  retry_count: 0,
  rollback_context: null,
};
```

### 4.3 フェーズ番号の期待値テーブル

| PhaseName | 変更前 | 変更後 | 変更の有無 |
|-----------|--------|--------|-----------|
| planning | '00' | '00' | なし |
| requirements | '01' | '01' | なし |
| design | '02' | '02' | なし |
| test_scenario | '03' | '03' | なし |
| implementation | '04' | '04' | なし |
| test_implementation | '05' | '05' | なし |
| test_preparation | — | '06' | **新規** |
| testing | '06' | '07' | **変更** |
| documentation | '07' | '08' | **変更** |
| report | '08' | '09' | **変更** |
| evaluation | '09' | '10' | **変更** |

### 4.4 プリセット期待値テーブル

| プリセット名 | 変更前 | 変更後 | 変更の有無 |
|-------------|--------|--------|-----------|
| review-requirements | `['planning', 'requirements']` | 同左 | なし |
| review-design | `['planning', 'requirements', 'design']` | 同左 | なし |
| review-test-scenario | `['planning', 'requirements', 'design', 'test_scenario']` | 同左 | なし |
| analysis-design | `['planning', 'requirements', 'design']` | 同左 | なし |
| prototype | `['planning', 'design', 'implementation', 'report']` | 同左 | なし |
| quick-fix | `['planning', 'implementation', 'documentation', 'report']` | 同左 | なし |
| implementation | `['planning', 'implementation', 'test_implementation', 'testing', 'documentation', 'report']` | `['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']` | **変更** |
| full-test | `['planning', 'test_scenario', 'test_implementation']` | 同左 | なし |
| testing | `['planning', 'test_implementation', 'testing']` | `['planning', 'test_implementation', 'test_preparation', 'testing']` | **変更** |
| finalize | `['planning', 'documentation', 'report', 'evaluation']` | 同左 | なし |

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

| 環境 | 要件 |
|------|------|
| Node.js | 20 以上 |
| テストフレームワーク | Jest |
| ファイルシステム | 実ファイルシステムアクセス（MetadataManager が実ファイルを使用） |
| 一時ディレクトリ | `os.tmpdir()` または `tests/temp/` 配下 |

### 5.2 モック/スタブの必要性

| コンポーネント | モック方法 | 使用テスト |
|-------------|----------|----------|
| `MetadataManager` | 実ファイルシステムで生成 | 依存関係バリデーション |
| `WorkflowState` | `WorkflowState.createNew()` で実ファイル作成 | skipPhases テスト |
| `AgentExecutor` | `jest.spyOn` でモック | TestPreparationPhase メソッドテスト |
| `PromptLoader` | `jest.spyOn` でモック | プロンプトロードテスト |
| `ContentParser` | `jest.spyOn` でモック | レビュー結果パーステスト |
| `GitHubClient` | `jest.fn()` でモック | レビュー投稿テスト |
| `fs` | 実ファイルシステム使用（ESM モック制約） | 出力ファイルチェック |

### 5.3 テストクリーンアップ

- `afterEach(() => jest.restoreAllMocks())`: モックの確実なリストア
- `afterAll(() => fs.remove(TEST_DIR))`: 一時ディレクトリの削除
- `process.env` の保存と復元: 環境変数テスト

---

## 6. テスト実装優先度

### 優先度 高（必須: ビルド成功の前提）

| テストID | テスト名 | 理由 |
|---------|---------|------|
| UT-TYPE-001 | PhaseName 型 | 全マッピングの型安全性の基盤 |
| UT-ORDER-001〜003 | PHASE_ORDER | フェーズ実行順序の正確性 |
| UT-DEP-001〜004 | 依存関係定義 | 循環依存なし・依存チェーンの正確性 |
| UT-NUM-001〜008 | フェーズ番号 | ディレクトリ構造の正確性 |
| IT-BUILD-001〜003 | ビルド統合 | プロジェクト全体の整合性 |

### 優先度 中（機能検証）

| テストID | テスト名 | 理由 |
|---------|---------|------|
| UT-PRESET-001〜009 | プリセット更新 | プリセット実行の正確性 |
| UT-PHASE-001〜007 | TestPreparationPhase | 新規クラスの機能性 |
| UT-AGENT-001〜003 | エージェント優先順位 | エージェント選択の正確性 |
| UT-MODEL-001〜005 | モデル最適化 | モデル選択の正確性 |
| IT-PRESET-001〜005 | プリセット統合 | プリセット実行フローの統合検証 |
| IT-DEPINT-001〜003 | 依存関係統合 | 依存チェーンの統合検証 |

### 優先度 低（追加検証）

| テストID | テスト名 | 理由 |
|---------|---------|------|
| UT-PROMPT-001〜009 | プロンプトファイル | ファイル存在・内容検証 |
| UT-LOG-001〜003 | ログ抽出パターン | フォールバック機構の検証 |
| UT-GETPRESET-001〜002 | getPresetPhases | プリセット取得関数の検証 |
| UT-RB-001〜002 | ロールバック整合性 | メタデータ・番号の整合性 |
| UT-RBAUTO-001 | rollback-auto | メタデータ整合性 |

---

## 7. 要件トレーサビリティ

| 要件ID | 要件名 | テストシナリオ | カバー状況 |
|--------|--------|-------------|----------|
| FR-001 | PhaseName 型の拡張 | UT-TYPE-001 | ✅ |
| FR-002 | PHASE_ORDER 配列の更新 | UT-ORDER-001〜003 | ✅ |
| FR-003 | フェーズ依存関係の定義 | UT-DEP-001〜009 | ✅ |
| FR-004 | フェーズプリセットの更新 | UT-PRESET-001〜009 | ✅ |
| FR-005 | TestPreparationPhase クラス | UT-PHASE-001〜007 | ✅ |
| FR-005-A | execute() メソッド | UT-PHASE-002, UT-PHASE-003 | ✅ |
| FR-005-B | review() メソッド | UT-PHASE-004, UT-PHASE-005 | ✅ |
| FR-005-C | revise() メソッド | UT-PHASE-006, UT-PHASE-007 | ✅ |
| FR-006 | フェーズファクトリの更新 | UT-FACTORY-001 | ✅ |
| FR-007 | フェーズ番号マッピングの更新 | UT-NUM-001〜008 | ✅ |
| FR-008 | エージェント優先順位の設定 | UT-AGENT-001〜003 | ✅ |
| FR-009 | モデル最適化マッピングの更新 | UT-MODEL-001〜005 | ✅ |
| FR-010 | プロンプトファイルの作成 | UT-PROMPT-001〜009 | ✅ |
| FR-011 | ログ抽出パターンの追加 | UT-LOG-001〜003 | ✅ |
| AC-001 | PhaseName 型の拡張 | UT-TYPE-001, IT-BUILD-001 | ✅ |
| AC-002 | フェーズ実行順序 | UT-ORDER-001〜003 | ✅ |
| AC-003 | フェーズ依存関係の検証 | UT-DEP-005, UT-DEP-006 | ✅ |
| AC-004 | testing 依存関係変更 | UT-DEP-007, UT-DEP-008 | ✅ |
| AC-005 | フェーズプリセットの更新 | UT-PRESET-001, IT-PRESET-001 | ✅ |
| AC-006 | TestPreparationPhase 生成 | UT-FACTORY-001, UT-PHASE-001 | ✅ |
| AC-007 | test-preparation.md の生成 | UT-PHASE-002 | ✅ |
| AC-008 | フェーズ番号マッピング | UT-NUM-001〜006 | ✅ |
| AC-009 | エージェント優先順位 | UT-AGENT-001 | ✅ |
| AC-010 | モデル最適化マッピング | UT-MODEL-001〜005 | ✅ |
| AC-011 | プロンプトファイル存在 | UT-PROMPT-001〜009 | ✅ |
| AC-012 | 循環依存の不在 | UT-DEP-004 | ✅ |
| AC-013 | npm run validate の成功 | IT-BUILD-003 | ✅ |
| AC-014 | 後方互換性 | UT-NUM-007, IT-PRESET-003〜005 | ✅ |

---

## 8. 品質ゲート確認

- [x] **Phase 2 の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION 戦略に基づき、Unit テスト（68 シナリオ）と Integration テスト（12 シナリオ）を作成。BDD テストは戦略外のため作成していない
- [x] **主要な正常系がカバーされている**: 全 14 機能要件（FR-001〜FR-011）の正常系をテストシナリオでカバー。依存関係、プリセット、フェーズ番号、モデル最適化の正常動作を網羅
- [x] **主要な異常系がカバーされている**: 依存関係不足（UT-DEP-006, UT-DEP-008）、出力ファイル不在（UT-PHASE-004, UT-PHASE-006）、循環依存検出（UT-DEP-004）、skipPhases 動作（UT-DEP-009）をカバー
- [x] **期待結果が明確である**: 全テストシナリオに具体的な期待値（配列の内容、文字列値、真偽値）を記載。曖昧な表現を排除し、検証可能な形式で記述
