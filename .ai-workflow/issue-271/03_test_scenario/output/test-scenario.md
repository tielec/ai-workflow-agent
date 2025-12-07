# テストシナリオ

**Issue番号**: #271
**タイトル**: feat(rollback): Add auto mode with agent-based rollback target detection
**作成日**: 2025-12-07
**バージョン**: 1.0

---

## 0. Planning Document確認

Planning Phase（Phase 0）とDesign Phase（Phase 2）で決定されたテスト戦略を確認しました：

### テスト戦略（Planning & Design Phase）
- **UNIT_INTEGRATION戦略**: ユニットテストと統合テストの両方で網羅的にカバー
- JSON パース処理、バリデーション、confidence 制御ロジックを個別にテスト（Unit）
- エージェント呼び出しからロールバック実行までのエンドツーエンドの動作を確認（Integration）

### テストコード戦略（Planning & Design Phase）
- **BOTH_TEST戦略**: 既存テストの拡張 + 新規テストファイルの作成
- `tests/commands/rollback.test.ts` を拡張（リグレッションテスト）
- `tests/commands/rollback-auto.test.ts` を新規作成（auto モード専用）

本テストシナリオでは、上記戦略に基づいて以下を作成します：
1. **ユニットテストシナリオ**: JSON パース、バリデーション、confidence 制御
2. **統合テストシナリオ**: エージェント呼び出しから rollback 実行までの E2E フロー

---

## 1. テスト戦略サマリー

### 1.1 テスト対象の範囲

| コンポーネント | テスト種別 | 優先度 |
|--------------|-----------|--------|
| JSON パース処理（`parseRollbackDecision()`） | Unit | 高 |
| バリデーション処理（`validateRollbackDecision()`） | Unit | 高 |
| confidence 制御（`confirmRollback()`） | Unit | 高 |
| コンテキスト収集（`collectAnalysisContext()`） | Unit | 中 |
| プロンプト生成（`buildAgentPrompt()`） | Unit | 中 |
| エージェント呼び出し〜rollback 実行 | Integration | 高 |
| dry-run モード | Integration | 中 |
| 既存 rollback コマンドとの統合 | Integration | 高 |

### 1.2 テストの目的

1. **正確性の保証**: エージェント出力が正しくパースされ、適切にバリデーションされる
2. **堅牢性の保証**: 異常な入力（不正なJSON、欠損フィールド）に対して適切にエラーハンドリングされる
3. **安全性の保証**: confidence 制御により、低信頼度の判断で不適切な差し戻しが実行されない
4. **後方互換性の保証**: 既存の rollback コマンドに影響を与えない

### 1.3 テストカバレッジ目標

- **ユニットテスト**: 80%以上（パース処理、バリデーション処理）
- **統合テスト**: 主要シナリオ（成功、失敗、エラー）をカバー
- **リグレッションテスト**: 既存 rollback コマンドのすべてのテストが引き続きパスする

---

## 2. ユニットテストシナリオ

### 2.1 JSON パース処理（`parseRollbackDecision()`）

#### UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース

**目的**: Markdownコードブロック（`` ```json ... ``` ``）内のJSONを正しく抽出・パースできることを検証

**前提条件**: なし

**入力**:
```typescript
const agentOutput = `
エージェントの分析結果は以下の通りです。

\`\`\`json
{
  "needs_rollback": true,
  "to_phase": "implementation",
  "to_step": "revise",
  "reason": "テスト失敗の原因が実装にあります。",
  "confidence": "high",
  "analysis": "Testing Phaseで3件のテストが失敗しています。"
}
\`\`\`
`;
```

**期待結果**:
```typescript
{
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "テスト失敗の原因が実装にあります。",
  confidence: "high",
  analysis: "Testing Phaseで3件のテストが失敗しています。"
}
```

**テストデータ**: 上記 `agentOutput`

---

#### UT-PARSE-002: プレーンテキスト内のJSONを正常にパース

**目的**: Markdownコードブロックがない場合でも、プレーンテキスト内のJSONを抽出できることを検証

**前提条件**: なし

**入力**:
```typescript
const agentOutput = `
判断結果: {"needs_rollback": false, "reason": "差し戻し不要", "confidence": "high", "analysis": "全テスト成功"}
`;
```

**期待結果**:
```typescript
{
  needs_rollback: false,
  reason: "差し戻し不要",
  confidence: "high",
  analysis: "全テスト成功"
}
```

**テストデータ**: 上記 `agentOutput`

---

#### UT-PARSE-003: JSON開始・終了探索パターンでパース

**目的**: Markdownコードブロックもプレーンテキストパターンも失敗した場合、`{` と `}` を探索してJSONを抽出できることを検証

**前提条件**: なし

**入力**:
```typescript
const agentOutput = `
以下が判断結果です:
{
  "needs_rollback": true,
  "to_phase": "design",
  "to_step": "revise",
  "reason": "設計の不備があります。",
  "confidence": "medium",
  "analysis": "レビュー結果にBLOCKERが存在します。"
}
その他の情報...
`;
```

**期待結果**:
```typescript
{
  needs_rollback: true,
  to_phase: "design",
  to_step: "revise",
  reason: "設計の不備があります。",
  confidence: "medium",
  analysis: "レビュー結果にBLOCKERが存在します。"
}
```

**テストデータ**: 上記 `agentOutput`

---

#### UT-PARSE-004: JSON抽出失敗時のエラー

**目的**: JSONが全く含まれていない出力に対して、適切なエラーメッセージを返すことを検証

**前提条件**: なし

**入力**:
```typescript
const agentOutput = "エージェントの応答にJSONが含まれていません。";
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Failed to extract JSON from agent output. Please use manual rollback mode: rollback --to-phase <phase> --reason <reason>"`

**テストデータ**: 上記 `agentOutput`

---

#### UT-PARSE-005: 不正なJSON構文でパース失敗

**目的**: JSON構文エラー（カンマ抜け、ダブルクォート不足）に対して、適切なエラーメッセージを返すことを検証

**前提条件**: なし

**入力**:
```typescript
const agentOutput = `
\`\`\`json
{
  "needs_rollback": true
  "to_phase": "implementation"
}
\`\`\`
`;
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Failed to parse JSON from agent output: ..."`
- メッセージに「手動モード」の案内が含まれる

**テストデータ**: 上記 `agentOutput`

---

#### UT-PARSE-006: 改行を含むJSONフィールドを正常にパース

**目的**: reason や analysis フィールドに改行（`\n`）が含まれる場合でも、正しくパースできることを検証

**前提条件**: なし

**入力**:
```typescript
const agentOutput = `
\`\`\`json
{
  "needs_rollback": true,
  "to_phase": "implementation",
  "to_step": "revise",
  "reason": "テスト失敗の原因が実装にあります。\\n\\n失敗したテスト:\\n- test_commitRollback_converts_paths\\n- test_filterExistingFiles_handles_absolute_paths",
  "confidence": "high",
  "analysis": "Testing Phaseで3件のテストが失敗しています。"
}
\`\`\`
`;
```

**期待結果**:
```typescript
{
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "テスト失敗の原因が実装にあります。\n\n失敗したテスト:\n- test_commitRollback_converts_paths\n- test_filterExistingFiles_handles_absolute_paths",
  confidence: "high",
  analysis: "Testing Phaseで3件のテストが失敗しています。"
}
```

**テストデータ**: 上記 `agentOutput`

---

### 2.2 バリデーション処理（`validateRollbackDecision()`）

#### UT-VALID-001: 正常なRollbackDecisionをバリデーション成功

**目的**: すべての必須フィールドが正しい形式の場合、バリデーションが成功することを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "テスト失敗の原因が実装にあります。",
  confidence: "high",
  analysis: "Testing Phaseで3件のテストが失敗しています。"
};
```

**期待結果**:
- エラーがスローされない（バリデーション成功）

**テストデータ**: 上記 `decision`

---

#### UT-VALID-002: needs_rollback フィールド欠損時のエラー

**目的**: `needs_rollback` フィールドが欠損している場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision = {
  to_phase: "implementation",
  reason: "理由",
  confidence: "high",
  analysis: "分析"
} as any;
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid agent output: \"needs_rollback\" field must be a boolean."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-003: needs_rollback=true時にto_phaseが欠損

**目的**: `needs_rollback=true` の場合、`to_phase` が必須であることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  reason: "理由",
  confidence: "high",
  analysis: "分析"
} as any;
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid agent output: \"to_phase\" field is required when needs_rollback=true."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-004: 不正なto_phase値

**目的**: `to_phase` が有効なPhaseName以外の値の場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "invalid_phase" as any,
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid phase name: invalid_phase. Valid phases: planning, requirements, ..."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-005: 不正なto_step値

**目的**: `to_step` が `'execute' | 'review' | 'revise'` 以外の値の場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "invalid_step" as any,
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid step name: invalid_step. Valid steps: execute, review, revise."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-006: 不正なconfidence値

**目的**: `confidence` が `'high' | 'medium' | 'low'` 以外の値の場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  reason: "理由",
  confidence: "unknown" as any,
  analysis: "分析"
};
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid confidence level: unknown. Valid levels: high, medium, low."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-007: reasonフィールドが空文字列

**目的**: `reason` フィールドが空文字列の場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  reason: "",
  confidence: "high",
  analysis: "分析"
};
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid agent output: \"reason\" field must be a non-empty string."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-008: analysisフィールドが欠損

**目的**: `analysis` フィールドが欠損または空文字列の場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision = {
  needs_rollback: true,
  to_phase: "implementation",
  reason: "理由",
  confidence: "high"
} as any;
```

**期待結果**:
- Error がスローされる
- エラーメッセージ: `"Invalid agent output: \"analysis\" field must be a non-empty string."`

**テストデータ**: 上記 `decision`

---

#### UT-VALID-009: needs_rollback=falseの場合のバリデーション

**目的**: `needs_rollback=false` の場合、`to_phase` が不要であることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: false,
  reason: "差し戻し不要",
  confidence: "high",
  analysis: "全テスト成功"
};
```

**期待結果**:
- エラーがスローされない（バリデーション成功）

**テストデータ**: 上記 `decision`

---

#### UT-VALID-010: すべての有効なPhaseName値でバリデーション成功

**目的**: すべての有効な `PhaseName` 値（planning, requirements, design, test_scenario, implementation, test_implementation, testing, documentation, report, evaluation）でバリデーションが成功することを検証

**前提条件**: なし

**入力**:
```typescript
const validPhases = [
  'planning', 'requirements', 'design', 'test_scenario',
  'implementation', 'test_implementation', 'testing',
  'documentation', 'report', 'evaluation'
];

// 各フェーズでdecisionを作成
validPhases.forEach(phase => {
  const decision: RollbackDecision = {
    needs_rollback: true,
    to_phase: phase as PhaseName,
    reason: "理由",
    confidence: "high",
    analysis: "分析"
  };
  // バリデーション実行
});
```

**期待結果**:
- すべてのフェーズでエラーがスローされない

**テストデータ**: 上記 `validPhases`

---

### 2.3 confidence 制御（`confirmRollback()`）

#### UT-CONF-001: confidence=high かつ force=true の場合、確認スキップ

**目的**: `confidence="high"` かつ `force=true` の場合、確認プロンプトがスキップされることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
const force = true;
```

**期待結果**:
- `confirmRollback(decision, force)` が即座に `true` を返す
- ユーザー入力待ちが発生しない

**テストデータ**: 上記 `decision`, `force`

---

#### UT-CONF-002: confidence=medium かつ force=true の場合でも確認表示

**目的**: `confidence="medium"` の場合、`force=true` でも確認プロンプトが表示されることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "medium",
  analysis: "分析"
};
const force = true;
```

**期待結果**:
- 確認プロンプトが表示される
- 警告メッセージ: `"Agent confidence is medium. Please review the analysis carefully."`
- ユーザー入力待ちが発生する

**テストデータ**: 上記 `decision`, `force`

---

#### UT-CONF-003: confidence=low かつ force=true の場合でも確認表示

**目的**: `confidence="low"` の場合、`force=true` でも確認プロンプトが表示されることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "low",
  analysis: "分析"
};
const force = true;
```

**期待結果**:
- 確認プロンプトが表示される
- 警告メッセージ: `"Agent confidence is low. Please review the analysis carefully."`
- ユーザー入力待ちが発生する

**テストデータ**: 上記 `decision`, `force`

---

#### UT-CONF-004: ユーザーが "y" を入力した場合、trueを返す

**目的**: ユーザーが確認プロンプトで "y" を入力した場合、`confirmRollback()` が `true` を返すことを検証

**前提条件**: 確認プロンプトが表示される

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
const force = false;
// モック: ユーザー入力 "y"
```

**期待結果**:
- `confirmRollback(decision, force)` が `true` を返す

**テストデータ**: 上記 `decision`, ユーザー入力 "y"

---

#### UT-CONF-005: ユーザーが "yes" を入力した場合、trueを返す

**目的**: ユーザーが確認プロンプトで "yes" を入力した場合、`confirmRollback()` が `true` を返すことを検証

**前提条件**: 確認プロンプトが表示される

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
const force = false;
// モック: ユーザー入力 "yes"
```

**期待結果**:
- `confirmRollback(decision, force)` が `true` を返す

**テストデータ**: 上記 `decision`, ユーザー入力 "yes"

---

#### UT-CONF-006: ユーザーが "n" を入力した場合、falseを返す

**目的**: ユーザーが確認プロンプトで "n" を入力した場合、`confirmRollback()` が `false` を返すことを検証

**前提条件**: 確認プロンプトが表示される

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
const force = false;
// モック: ユーザー入力 "n"
```

**期待結果**:
- `confirmRollback(decision, force)` が `false` を返す

**テストデータ**: 上記 `decision`, ユーザー入力 "n"

---

#### UT-CONF-007: ユーザーが空入力の場合、falseを返す

**目的**: ユーザーが確認プロンプトで何も入力せずEnterを押した場合、`confirmRollback()` が `false` を返すことを検証

**前提条件**: 確認プロンプトが表示される

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "理由",
  confidence: "high",
  analysis: "分析"
};
const force = false;
// モック: ユーザー入力 ""（空文字列）
```

**期待結果**:
- `confirmRollback(decision, force)` が `false` を返す

**テストデータ**: 上記 `decision`, ユーザー入力 ""

---

### 2.4 コンテキスト収集（`collectAnalysisContext()`）

#### UT-CTX-001: metadata.jsonのパスを正しく取得

**目的**: `collectAnalysisContext()` が metadata.json のパスを正しく返すことを検証

**前提条件**: metadata.json が存在する

**入力**:
```typescript
const metadata: WorkflowState = {
  issue_number: "271",
  current_phase: "testing",
  phases: {
    testing: { status: "in_progress", retry_count: 0 }
    // ... 他のフェーズ
  }
  // ... 他のフィールド
};
```

**期待結果**:
```typescript
{
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: null,
  latestTestResult: null
}
```

**テストデータ**: 上記 `metadata`

---

#### UT-CTX-002: 最新のレビュー結果ファイルを検索

**目的**: `current_phase` が設定されている場合、最新のレビュー結果ファイルパスを返すことを検証

**前提条件**: レビュー結果ファイル（`review_result.md`）が存在する

**入力**:
```typescript
const metadata: WorkflowState = {
  issue_number: "271",
  current_phase: "design",
  phases: {
    design: { status: "completed", retry_count: 0 }
  }
};
// ファイルシステムモック: .ai-workflow/issue-271/02_design/review/review_result.md が存在
```

**期待結果**:
```typescript
{
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: ".ai-workflow/issue-271/02_design/review/review_result.md",
  latestTestResult: null
}
```

**テストデータ**: 上記 `metadata`, モックファイル

---

#### UT-CTX-003: Testing Phaseの場合、テスト結果ファイルを検索

**目的**: `current_phase="testing"` の場合、テスト結果ファイルパスを返すことを検証

**前提条件**: テスト結果ファイル（`test-result.md`）が存在する

**入力**:
```typescript
const metadata: WorkflowState = {
  issue_number: "271",
  current_phase: "testing",
  phases: {
    testing: { status: "completed", retry_count: 0 }
  }
};
// ファイルシステムモック: .ai-workflow/issue-271/06_testing/output/test-result.md が存在
```

**期待結果**:
```typescript
{
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: ".ai-workflow/issue-271/06_testing/review/review_result.md",
  latestTestResult: ".ai-workflow/issue-271/06_testing/output/test-result.md"
}
```

**テストデータ**: 上記 `metadata`, モックファイル

---

#### UT-CTX-004: レビュー結果ファイルが存在しない場合

**目的**: レビュー結果ファイルが存在しない場合、`latestReviewResult` が `null` であることを検証

**前提条件**: レビュー結果ファイルが存在しない

**入力**:
```typescript
const metadata: WorkflowState = {
  issue_number: "271",
  current_phase: "requirements",
  phases: {
    requirements: { status: "in_progress", retry_count: 0 }
  }
};
// ファイルシステムモック: レビュー結果ファイルなし
```

**期待結果**:
```typescript
{
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: null,
  latestTestResult: null
}
```

**テストデータ**: 上記 `metadata`

---

### 2.5 プロンプト生成（`buildAgentPrompt()`）

#### UT-PROMPT-001: issue_number変数が正しく置換される

**目的**: プロンプトテンプレート内の `{issue_number}` が正しく置換されることを検証

**前提条件**: プロンプトテンプレート（`auto-analyze.txt`）が存在する

**入力**:
```typescript
const issueNumber = 271;
const context: AnalysisContext = {
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: null,
  latestTestResult: null
};
```

**期待結果**:
- プロンプト文字列に `@.ai-workflow/issue-271/metadata.json` が含まれる
- `{issue_number}` が `271` に置換されている

**テストデータ**: 上記 `issueNumber`, `context`

---

#### UT-PROMPT-002: レビュー結果参照が正しく置換される

**目的**: `{latest_review_result_reference}` が `@filepath` 形式に正しく置換されることを検証

**前提条件**: プロンプトテンプレートが存在し、レビュー結果ファイルが存在する

**入力**:
```typescript
const issueNumber = 271;
const context: AnalysisContext = {
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: ".ai-workflow/issue-271/02_design/review/review_result.md",
  latestTestResult: null
};
```

**期待結果**:
- プロンプト文字列に `@.ai-workflow/issue-271/02_design/review/review_result.md` が含まれる

**テストデータ**: 上記 `issueNumber`, `context`

---

#### UT-PROMPT-003: レビュー結果が存在しない場合のメッセージ

**目的**: `latestReviewResult` が `null` の場合、代替メッセージが表示されることを検証

**前提条件**: プロンプトテンプレートが存在し、レビュー結果ファイルが存在しない

**入力**:
```typescript
const issueNumber = 271;
const context: AnalysisContext = {
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: null,
  latestTestResult: null
};
```

**期待結果**:
- プロンプト文字列に `（レビュー結果ファイルは見つかりませんでした）` が含まれる

**テストデータ**: 上記 `issueNumber`, `context`

---

#### UT-PROMPT-004: テスト結果参照が正しく置換される

**目的**: `{test_result_reference}` が `@filepath` 形式に正しく置換されることを検証

**前提条件**: プロンプトテンプレートが存在し、テスト結果ファイルが存在する

**入力**:
```typescript
const issueNumber = 271;
const context: AnalysisContext = {
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: null,
  latestTestResult: ".ai-workflow/issue-271/06_testing/output/test-result.md"
};
```

**期待結果**:
- プロンプト文字列に `@.ai-workflow/issue-271/06_testing/output/test-result.md` が含まれる

**テストデータ**: 上記 `issueNumber`, `context`

---

#### UT-PROMPT-005: テスト結果が存在しない場合のメッセージ

**目的**: `latestTestResult` が `null` の場合、代替メッセージが表示されることを検証

**前提条件**: プロンプトテンプレートが存在し、テスト結果ファイルが存在しない

**入力**:
```typescript
const issueNumber = 271;
const context: AnalysisContext = {
  metadataPath: ".ai-workflow/issue-271/metadata.json",
  latestReviewResult: null,
  latestTestResult: null
};
```

**期待結果**:
- プロンプト文字列に `（テスト結果ファイルは見つかりませんでした）` が含まれる

**テストデータ**: 上記 `issueNumber`, `context`

---

### 2.6 dry-run表示（`displayDryRunPreview()`）

#### UT-DRY-001: needs_rollback=trueの場合のdry-run表示

**目的**: `needs_rollback=true` の場合、dry-runプレビューが正しく表示されることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: true,
  to_phase: "implementation",
  to_step: "revise",
  reason: "実装の問題",
  confidence: "high",
  analysis: "テスト失敗"
};
```

**期待結果**:
- `[DRY-RUN] Agent analysis complete:` が出力される
- `- Needs rollback: Yes` が出力される
- `- To Phase: implementation` が出力される
- `- To Step: revise` が出力される
- `[DRY-RUN] Rollback would be executed to: implementation (step: revise)` が出力される
- `[DRY-RUN] No actual rollback performed.` が出力される

**テストデータ**: 上記 `decision`

---

#### UT-DRY-002: needs_rollback=falseの場合のdry-run表示

**目的**: `needs_rollback=false` の場合、dry-runプレビューが正しく表示されることを検証

**前提条件**: なし

**入力**:
```typescript
const decision: RollbackDecision = {
  needs_rollback: false,
  reason: "差し戻し不要",
  confidence: "high",
  analysis: "全テスト成功"
};
```

**期待結果**:
- `[DRY-RUN] Agent analysis complete:` が出力される
- `- Needs rollback: No` が出力される
- `[DRY-RUN] No rollback needed. Exiting.` が出力される

**テストデータ**: 上記 `decision`

---

## 3. 統合テストシナリオ

### 3.1 エージェント呼び出し〜rollback実行（E2E）

#### IT-E2E-001: テスト失敗による自動差し戻し（成功シナリオ）

**目的**: エージェントが「テスト失敗の原因が実装にある」と判断し、差し戻しが正常に実行されることを検証

**前提条件**:
- metadata.json が存在する（Testing Phase completed）
- テスト結果ファイルが存在する（テスト失敗を含む）
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントがmetadata.jsonとテスト結果を分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "implementation",
     "to_step": "revise",
     "reason": "テスト失敗の原因が実装にあります。",
     "confidence": "high",
     "analysis": "Testing Phaseで3件のテストが失敗しています。"
   }
   ```
4. 確認プロンプトで "y" を入力（モック）
5. `executeRollback()` が呼び出される

**期待結果**:
- metadata.json の `phases.implementation.status` が `in_progress` に更新される
- `phases.implementation.current_step` が `revise` に設定される
- rollback_history に履歴が追加される（mode: "auto"）
- ROLLBACK_REASON.md が `.ai-workflow/issue-271/04_implementation/ROLLBACK_REASON.md` に生成される
- Git コミット & プッシュが実行される
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] エージェントが正しいプロンプトで呼び出される
- [ ] JSON パースが成功する
- [ ] バリデーションが成功する
- [ ] 確認プロンプトが表示される
- [ ] executeRollback() が正しいパラメータで呼び出される
- [ ] metadata.json が更新される
- [ ] ROLLBACK_REASON.md が生成される
- [ ] Git コミットが作成される

---

#### IT-E2E-002: レビューBLOCKERによる自動差し戻し（成功シナリオ）

**目的**: エージェントが「レビューBLOCKERにより要件定義に問題がある」と判断し、差し戻しが正常に実行されることを検証

**前提条件**:
- metadata.json が存在する（Requirements Phase completed）
- レビュー結果ファイルが存在する（BLOCKER を含む）
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントがmetadata.jsonとレビュー結果を分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "planning",
     "to_step": "revise",
     "reason": "要件定義に根本的な問題があります。",
     "confidence": "medium",
     "analysis": "レビュー結果にBLOCKERが存在します。"
   }
   ```
4. 確認プロンプトで "y" を入力（モック）（medium confidenceのため必ず表示）
5. `executeRollback()` が呼び出される

**期待結果**:
- metadata.json の `phases.planning.status` が `in_progress` に更新される
- rollback_history に履歴が追加される
- ROLLBACK_REASON.md が生成される
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] エージェントが正しいプロンプトで呼び出される
- [ ] JSON パースが成功する
- [ ] confidence=medium のため、`--force` でも確認プロンプトが表示される
- [ ] executeRollback() が正しいパラメータで呼び出される

---

#### IT-E2E-003: 差し戻し不要の判断

**目的**: エージェントが「差し戻し不要」と判断した場合、差し戻しが実行されないことを検証

**前提条件**:
- metadata.json が存在する（すべてのフェーズが正常完了）
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントがmetadata.jsonを分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": false,
     "reason": "すべてのテストが成功しており、差し戻しは不要です。",
     "confidence": "high",
     "analysis": "Testing Phaseの結果を確認しましたが、全テストが成功しています。"
   }
   ```

**期待結果**:
- メッセージ: "No rollback needed." が表示される
- `executeRollback()` が呼び出されない
- metadata.json が更新されない
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] エージェントが正しいプロンプトで呼び出される
- [ ] JSON パースが成功する
- [ ] "No rollback needed." メッセージが表示される
- [ ] executeRollback() が呼び出されない

---

#### IT-E2E-004: dry-runモードでの実行

**目的**: `--dry-run` オプション使用時、差し戻しが実行されず、プレビューのみ表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271 --dry-run` を実行
2. エージェントがmetadata.jsonを分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "implementation",
     "to_step": "revise",
     "reason": "実装の問題",
     "confidence": "high",
     "analysis": "テスト失敗"
   }
   ```

**期待結果**:
- `[DRY-RUN]` プレフィックス付きでプレビューが表示される
- `[DRY-RUN] Rollback would be executed to: implementation (step: revise)` が表示される
- `[DRY-RUN] No actual rollback performed.` が表示される
- `executeRollback()` が呼び出されない
- metadata.json が更新されない
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] dry-runプレビューが表示される
- [ ] executeRollback() が呼び出されない
- [ ] metadata.json が更新されない

---

#### IT-E2E-005: confidence=high かつ --force での自動実行

**目的**: `confidence="high"` かつ `--force` オプション使用時、確認プロンプトがスキップされることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271 --force` を実行
2. エージェントがmetadata.jsonを分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "implementation",
     "to_step": "revise",
     "reason": "実装の問題",
     "confidence": "high",
     "analysis": "テスト失敗"
   }
   ```

**期待結果**:
- 確認プロンプトが表示されない
- `executeRollback()` が自動的に呼び出される
- metadata.json が更新される
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] 確認プロンプトがスキップされる
- [ ] executeRollback() が呼び出される

---

#### IT-E2E-006: confidence=low の場合、--forceでも確認表示

**目的**: `confidence="low"` の場合、`--force` オプション使用時でも確認プロンプトが表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271 --force` を実行
2. エージェントがmetadata.jsonを分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "design",
     "to_step": "revise",
     "reason": "設計の問題（不確実）",
     "confidence": "low",
     "analysis": "問題原因が不明確です。"
   }
   ```
4. 確認プロンプトで "y" を入力（モック）

**期待結果**:
- 確認プロンプトが表示される（`--force` でもスキップされない）
- 警告メッセージ: "Agent confidence is low. Please review the analysis carefully." が表示される
- ユーザーが "y" を入力後、`executeRollback()` が呼び出される

**確認項目**:
- [ ] 確認プロンプトが表示される
- [ ] 警告メッセージが表示される
- [ ] executeRollback() が呼び出される

---

#### IT-E2E-007: ユーザーが確認をキャンセル

**目的**: ユーザーが確認プロンプトで "n" を入力した場合、差し戻しがキャンセルされることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントがmetadata.jsonを分析（モック応答）
3. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "implementation",
     "to_step": "revise",
     "reason": "実装の問題",
     "confidence": "high",
     "analysis": "テスト失敗"
   }
   ```
4. 確認プロンプトで "n" を入力（モック）

**期待結果**:
- メッセージ: "Rollback cancelled by user." が表示される
- `executeRollback()` が呼び出されない
- metadata.json が更新されない
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] キャンセルメッセージが表示される
- [ ] executeRollback() が呼び出されない

---

### 3.2 エラーハンドリング（統合）

#### IT-ERR-001: metadata.json未発見エラー

**目的**: metadata.jsonが存在しない場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- metadata.json が存在しない

**テスト手順**:
1. `rollback auto --issue 999` を実行（存在しないissue番号）

**期待結果**:
- エラーメッセージ: "ワークフローメタデータが見つかりません。先に `init` コマンドを実行してください。" が表示される
- 終了コード: 1（エラー）

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 終了コードが1である

---

#### IT-ERR-002: エージェント呼び出し失敗

**目的**: エージェント呼び出しが失敗した場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェント呼び出しが失敗する（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェント呼び出しがエラーを返す（モック）

**期待結果**:
- エラーメッセージ: "エージェント呼び出しに失敗しました。手動モードをお試しください。" が表示される
- 手動モードの使用例が表示される
- 終了コード: 1（エラー）

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 手動モードの案内が表示される
- [ ] 終了コードが1である

---

#### IT-ERR-003: エージェントタイムアウト

**目的**: エージェント呼び出しがタイムアウトした場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェント呼び出しが120秒以内に応答しない（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェント呼び出しがタイムアウトする（モック）

**期待結果**:
- エラーメッセージ: "エージェント呼び出しがタイムアウトしました（120秒）。手動モードをお試しください。" が表示される
- 終了コード: 1（エラー）

**確認項目**:
- [ ] タイムアウトエラーメッセージが表示される
- [ ] 終了コードが1である

---

#### IT-ERR-004: JSONパース失敗（すべてのパターンで失敗）

**目的**: すべてのJSONパースパターンで失敗した場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェントがJSONを含まない応答を返す（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントが以下の応答を返す（モック）:
   ```
   エージェントの応答にJSONが含まれていません。
   ```

**期待結果**:
- エラーメッセージ: "Failed to extract JSON from agent output. Please use manual rollback mode: rollback --to-phase <phase> --reason <reason>" が表示される
- 終了コード: 1（エラー）

**確認項目**:
- [ ] JSONパース失敗エラーメッセージが表示される
- [ ] 手動モードの使用例が表示される
- [ ] 終了コードが1である

---

#### IT-ERR-005: バリデーション失敗（不正なto_phase）

**目的**: エージェントが不正な`to_phase`値を返した場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが不正な`to_phase`を返す（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "to_phase": "invalid_phase",
     "reason": "理由",
     "confidence": "high",
     "analysis": "分析"
   }
   ```

**期待結果**:
- エラーメッセージ: "Invalid phase name: invalid_phase. Valid phases: planning, requirements, ..." が表示される
- 終了コード: 1（エラー）

**確認項目**:
- [ ] バリデーションエラーメッセージが表示される
- [ ] 有効なフェーズ名のリストが表示される
- [ ] 終了コードが1である

---

#### IT-ERR-006: バリデーション失敗（needs_rollback=trueだがto_phase欠損）

**目的**: `needs_rollback=true` だが `to_phase` が欠損している場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが不正なJSONを返す（モック）

**テスト手順**:
1. `rollback auto --issue 271` を実行
2. エージェントが以下のJSONを返す（モック）:
   ```json
   {
     "needs_rollback": true,
     "reason": "理由",
     "confidence": "high",
     "analysis": "分析"
   }
   ```

**期待結果**:
- エラーメッセージ: "Invalid agent output: \"to_phase\" field is required when needs_rollback=true." が表示される
- 終了コード: 1（エラー）

**確認項目**:
- [ ] バリデーションエラーメッセージが表示される
- [ ] 終了コードが1である

---

### 3.3 既存機能との統合

#### IT-LEGACY-001: 既存rollbackコマンドのリグレッションテスト

**目的**: `rollback auto` の追加により、既存の手動rollbackコマンドが影響を受けないことを検証

**前提条件**:
- metadata.json が存在する

**テスト手順**:
1. 既存の手動rollbackコマンドを実行:
   ```bash
   rollback --issue 271 --to-phase implementation --reason "手動差し戻し"
   ```

**期待結果**:
- 既存のrollback処理が正常に実行される
- metadata.json が更新される
- ROLLBACK_REASON.md が生成される
- 終了コード: 0（正常終了）

**確認項目**:
- [ ] 既存コマンドが正常に動作する
- [ ] `rollback auto` の追加による影響がない

---

#### IT-LEGACY-002: rollback_historyにmode="auto"が記録される

**目的**: `rollback auto` で差し戻しを実行した場合、rollback_historyに `mode: "auto"` が記録されることを検証

**前提条件**:
- metadata.json が存在する
- エージェントが正常に応答する（モック）

**テスト手順**:
1. `rollback auto --issue 271 --force` を実行
2. エージェントがmetadata.jsonを分析（モック応答）
3. エージェントが差し戻し必要と判断（モック）
4. `executeRollback()` が呼び出される

**期待結果**:
- metadata.json の `rollback_history` に以下のエントリが追加される:
  ```json
  {
    "triggered_at": "2025-12-07T...",
    "from_phase": "testing",
    "to_phase": "implementation",
    "to_step": "revise",
    "reason": "テスト失敗の原因が実装にあります。",
    "mode": "auto"
  }
  ```

**確認項目**:
- [ ] rollback_historyに履歴が追加される
- [ ] `mode: "auto"` が記録される

---

#### IT-LEGACY-003: 手動rollbackではmode="manual"が記録される

**目的**: 既存の手動rollbackコマンドで差し戻しを実行した場合、rollback_historyに `mode: "manual"` が記録されることを検証

**前提条件**:
- metadata.json が存在する

**テスト手順**:
1. `rollback --issue 271 --to-phase implementation --reason "手動差し戻し"` を実行

**期待結果**:
- metadata.json の `rollback_history` に以下のエントリが追加される:
  ```json
  {
    "triggered_at": "2025-12-07T...",
    "from_phase": "testing",
    "to_phase": "implementation",
    "to_step": "execute",
    "reason": "手動差し戻し",
    "mode": "manual"
  }
  ```

**確認項目**:
- [ ] rollback_historyに履歴が追加される
- [ ] `mode: "manual"` が記録される

---

## 4. テストデータ

### 4.1 metadata.json（テスト用）

#### 4.1.1 Testing Phase完了、テスト失敗

```json
{
  "issue_number": "271",
  "issue_url": "https://github.com/tielec/ai-workflow-agent/issues/271",
  "current_phase": "testing",
  "phases": {
    "planning": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "requirements": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "design": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "test_scenario": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "implementation": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "test_implementation": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "testing": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute"]
    }
  },
  "rollback_history": []
}
```

#### 4.1.2 Requirements Phase完了、レビューBLOCKER

```json
{
  "issue_number": "271",
  "current_phase": "requirements",
  "phases": {
    "planning": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    },
    "requirements": {
      "status": "completed",
      "retry_count": 0,
      "completed_steps": ["execute", "review"]
    }
  },
  "rollback_history": []
}
```

#### 4.1.3 すべてのフェーズ正常完了

```json
{
  "issue_number": "271",
  "current_phase": "evaluation",
  "phases": {
    "planning": { "status": "completed", "completed_steps": ["execute", "review"] },
    "requirements": { "status": "completed", "completed_steps": ["execute", "review"] },
    "design": { "status": "completed", "completed_steps": ["execute", "review"] },
    "test_scenario": { "status": "completed", "completed_steps": ["execute", "review"] },
    "implementation": { "status": "completed", "completed_steps": ["execute", "review"] },
    "test_implementation": { "status": "completed", "completed_steps": ["execute", "review"] },
    "testing": { "status": "completed", "completed_steps": ["execute", "review"] },
    "documentation": { "status": "completed", "completed_steps": ["execute", "review"] },
    "report": { "status": "completed", "completed_steps": ["execute"] }
  },
  "rollback_history": []
}
```

### 4.2 レビュー結果ファイル（テスト用）

#### 4.2.1 BLOCKER含むレビュー結果

```markdown
# レビュー結果

## サマリー

- BLOCKER: 1件
- MAJOR: 0件
- MINOR: 0件

## BLOCKER

### BR-001: 要件定義の根本的な問題

**問題箇所**: requirements.md セクション3.2

**問題内容**: エージェント判断ロジックの入力情報が不足しています。

**修正案**: metadata.json だけでなく、レビュー結果とテスト結果も含める必要があります。
```

#### 4.2.2 すべてPASSのレビュー結果

```markdown
# レビュー結果

## サマリー

- BLOCKER: 0件
- MAJOR: 0件
- MINOR: 0件

すべての項目がPASSです。
```

### 4.3 テスト結果ファイル（テスト用）

#### 4.3.1 テスト失敗を含むテスト結果

```markdown
# テスト結果

## サマリー

- 総テスト数: 15件
- 成功: 12件
- 失敗: 3件

## 失敗したテスト

### test_commitRollback_converts_paths

**エラーメッセージ**: Expected path to be relative, but got absolute path: /tmp/...

**スタックトレース**:
```
Error: Expected path to be relative
  at commitRollback (src/core/git/commit-manager.ts:123)
```

### test_filterExistingFiles_handles_absolute_paths

**エラーメッセージ**: Path joining failed for absolute paths

### test_rollback_auto_integration

**エラーメッセージ**: Agent decision validation failed
```

#### 4.3.2 すべて成功のテスト結果

```markdown
# テスト結果

## サマリー

- 総テスト数: 15件
- 成功: 15件
- 失敗: 0件

すべてのテストが成功しました。
```

### 4.4 エージェント応答（モック用）

#### 4.4.1 差し戻し必要（high confidence）

```json
{
  "needs_rollback": true,
  "to_phase": "implementation",
  "to_step": "revise",
  "reason": "テスト失敗の原因が実装にあるため、Implementation Phase で修正が必要です。\n\n失敗したテスト:\n- test_commitRollback_converts_paths: 絶対パス変換ロジックが未実装\n- test_filterExistingFiles_handles_absolute_paths: パス結合の問題",
  "confidence": "high",
  "analysis": "Testing Phase で 3 件のテストが失敗しています。失敗内容を分析した結果、commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落していることが原因です。"
}
```

#### 4.4.2 差し戻し必要（medium confidence）

```json
{
  "needs_rollback": true,
  "to_phase": "planning",
  "to_step": "revise",
  "reason": "要件定義に根本的な問題があります。",
  "confidence": "medium",
  "analysis": "レビュー結果にBLOCKERが存在します。エージェント判断ロジックの入力情報が不足している可能性があります。"
}
```

#### 4.4.3 差し戻し必要（low confidence）

```json
{
  "needs_rollback": true,
  "to_phase": "design",
  "to_step": "revise",
  "reason": "設計の問題が疑われますが、確証はありません。",
  "confidence": "low",
  "analysis": "問題原因が不明確です。複数のフェーズに問題がある可能性があります。"
}
```

#### 4.4.4 差し戻し不要

```json
{
  "needs_rollback": false,
  "reason": "すべてのテストが成功しており、差し戻しは不要です。",
  "confidence": "high",
  "analysis": "Testing Phase の結果を確認しましたが、全テストが成功しています。レビュー結果にも BLOCKER や MAJOR はありません。"
}
```

---

## 5. テスト環境要件

### 5.1 必要な環境

| 環境要素 | 要件 |
|---------|------|
| Node.js | v18以上 |
| TypeScript | v5.0以上 |
| テストフレームワーク | Jest または Vitest |
| Git | v2.30以上 |

### 5.2 モック/スタブ

#### 5.2.1 エージェント呼び出しのモック

```typescript
// AgentExecutor のモック
jest.mock('src/core/agent-executor', () => ({
  AgentExecutor: {
    execute: jest.fn((prompt: string, options: any) => {
      // モック応答を返す
      return mockAgentResponse;
    })
  }
}));
```

#### 5.2.2 ファイルシステムのモック

```typescript
// fs.readFile のモック
jest.mock('fs/promises', () => ({
  readFile: jest.fn((path: string) => {
    if (path.includes('metadata.json')) {
      return JSON.stringify(mockMetadata);
    }
    if (path.includes('review_result.md')) {
      return mockReviewResult;
    }
    throw new Error('File not found');
  }),
  writeFile: jest.fn()
}));
```

#### 5.2.3 ユーザー入力のモック

```typescript
// readline のモック
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn((prompt: string, callback: (answer: string) => void) => {
      callback(mockUserInput); // "y" or "n"
    }),
    close: jest.fn()
  }))
}));
```

### 5.3 CI/CD環境での実行

- **環境変数**: `CI=true` を設定し、対話型プロンプトを自動的にスキップ
- **タイムアウト**: 各テストケースのタイムアウトを60秒に設定
- **並列実行**: ユニットテストは並列実行可能、統合テストは直列実行

---

## 6. 品質ゲート確認

### 6.1 Phase 2の戦略に沿ったテストシナリオである

- [x] **UNIT_INTEGRATION戦略**: ユニットテストシナリオ（セクション2）と統合テストシナリオ（セクション3）の両方を作成
- [x] **BOTH_TEST戦略**: 既存テスト拡張（IT-LEGACY-001〜003）と新規テスト（UT-*、IT-E2E-*）の両方を含む

### 6.2 主要な正常系がカバーされている

- [x] テスト失敗による自動差し戻し（IT-E2E-001）
- [x] レビューBLOCKERによる自動差し戻し（IT-E2E-002）
- [x] 差し戻し不要の判断（IT-E2E-003）
- [x] dry-runモード（IT-E2E-004）
- [x] confidence=high かつ --force での自動実行（IT-E2E-005）

### 6.3 主要な異常系がカバーされている

- [x] metadata.json未発見エラー（IT-ERR-001）
- [x] エージェント呼び出し失敗（IT-ERR-002）
- [x] エージェントタイムアウト（IT-ERR-003）
- [x] JSONパース失敗（IT-ERR-004）
- [x] バリデーション失敗（IT-ERR-005、IT-ERR-006）
- [x] JSON構文エラー（UT-PARSE-005）
- [x] 不正なto_phase値（UT-VALID-004）
- [x] 不正なto_step値（UT-VALID-005）
- [x] 不正なconfidence値（UT-VALID-006）

### 6.4 期待結果が明確である

- [x] すべてのテストケースに具体的な「期待結果」を記載
- [x] ユニットテストでは入力と出力を明確に定義
- [x] 統合テストでは確認項目チェックリストを含む
- [x] エラーケースではエラーメッセージと終了コードを明記

---

## 7. テストシナリオサマリー

### 7.1 テストケース数

| テスト種別 | テストケース数 |
|-----------|---------------|
| ユニットテスト（JSON パース） | 6件 |
| ユニットテスト（バリデーション） | 10件 |
| ユニットテスト（confidence 制御） | 7件 |
| ユニットテスト（コンテキスト収集） | 4件 |
| ユニットテスト（プロンプト生成） | 5件 |
| ユニットテスト（dry-run表示） | 2件 |
| 統合テスト（E2E） | 7件 |
| 統合テスト（エラーハンドリング） | 6件 |
| 統合テスト（既存機能との統合） | 3件 |
| **合計** | **50件** |

### 7.2 カバレッジ目標

- **ユニットテスト**: 主要関数（パース、バリデーション、confidence制御）を網羅
- **統合テスト**: 主要シナリオ（成功、失敗、エラー）を網羅
- **リグレッションテスト**: 既存rollbackコマンドの動作を保証

### 7.3 優先度別テストケース

#### 高優先度（Phase 4実装前に必須）

- UT-PARSE-001〜006（JSON パース）
- UT-VALID-001〜010（バリデーション）
- UT-CONF-001〜003（confidence 制御）
- IT-E2E-001〜003（主要E2Eシナリオ）
- IT-ERR-001〜006（エラーハンドリング）
- IT-LEGACY-001（既存機能リグレッション）

#### 中優先度（Phase 5実装完了までに実施）

- UT-CTX-001〜004（コンテキスト収集）
- UT-PROMPT-001〜005（プロンプト生成）
- UT-DRY-001〜002（dry-run表示）
- IT-E2E-004〜007（その他E2Eシナリオ）
- IT-LEGACY-002〜003（rollback_history mode検証）

#### 低優先度（Phase 6以降）

- UT-CONF-004〜007（ユーザー入力パターン）

---

**以上、テストシナリオ 完**
