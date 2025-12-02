# テストシナリオ - Issue #128

**Issue**: auto-issue: Phase 3 - 機能拡張提案（創造的提案）機能の実装
**日付**: 2025-01-30
**担当フェーズ**: Phase 3 (Test Scenario)

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**

Phase 2 の設計書で決定された通り、本Issue では **ユニットテスト** と **インテグレーションテスト** の両方を実施します。

### テスト対象の範囲

#### ユニットテスト対象
1. **EnhancementProposal型のバリデーション**
   - `validateEnhancementProposal()` メソッド
   - 各フィールドの文字数制限、必須フィールドチェック

2. **プロンプト変数置換**
   - プロンプトテンプレートの変数置換ロジック
   - `{repository_path}`, `{creative_mode}`, `{output_file_path}` の置換

3. **タイトル・ラベル生成ロジック**
   - `generateEnhancementTitle()` - 提案タイプごとのプレフィックス
   - `generateEnhancementLabels()` - ラベル生成（優先度、タイプ別）

4. **JSON パース処理**
   - `parseEnhancementProposals()` - 通常パースと寛容なパーサー
   - エラーハンドリング

5. **フォールバックテンプレート**
   - `createEnhancementFallbackBody()` の出力フォーマット

#### インテグレーションテスト対象
1. **エージェント統合**
   - Codex/Claude エージェントとの連携
   - エージェントフォールバック機構（Codex → Claude）

2. **エンドツーエンドフロー**
   - `handleAutoIssueCommand(category: 'enhancement')` → リポジトリ分析 → 重複検出 → Issue作成

3. **GitHub API連携**
   - Issue生成（タイトル、ラベル、本文）
   - dry-runモードでの動作確認

4. **重複検出の精度**
   - `IssueDeduplicator` がenhancementカテゴリで正しく動作するか
   - 類似度閾値 0.85 の動作確認

### テストの目的

- **機能正確性**: 各機能が要件定義書・設計書通りに動作することを保証
- **エラーハンドリング**: エージェント失敗、JSON パースエラー、バリデーションエラーが適切に処理されることを確認
- **統合動作**: 複数のコンポーネントが連携して正しく動作することを検証
- **品質保証**: テストカバレッジ 80% 以上を達成し、Phase 1/2 と同等の品質を維持

---

## 2. ユニットテストシナリオ

### 2.1 EnhancementProposal型のバリデーション

#### テストケース 2.1.1: validateEnhancementProposal_正常系

**目的**: 有効な EnhancementProposal がバリデーションを通過することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const validProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: ['Slack Incoming Webhook を使用', 'EvaluationPhase.run() 完了後に通知処理を追加'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts', 'src/core/notification-manager.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(validProposal)` が `true` を返す
- ログに警告が出力されない

**テストデータ**: 上記 `validProposal`

---

#### テストケース 2.1.2: validateEnhancementProposal_異常系_title不足

**目的**: title が 50文字未満の場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知',  // 50文字未満
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「Invalid title length: 8」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

#### テストケース 2.1.3: validateEnhancementProposal_異常系_title超過

**目的**: title が 100文字を超える場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能で、この機能はチームメンバー全員に対してリアルタイムで通知を送信する高度な機能です',  // 100文字超過
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「Invalid title length: 107」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

#### テストケース 2.1.4: validateEnhancementProposal_異常系_description不足

**目的**: description が 100文字未満の場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'Slack 通知機能を追加する。',  // 100文字未満
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「Invalid description length: 18」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

#### テストケース 2.1.5: validateEnhancementProposal_異常系_rationale不足

**目的**: rationale が 50文字未満の場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チーム連携を改善する。',  // 50文字未満
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「Invalid rationale length: 13」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

#### テストケース 2.1.6: validateEnhancementProposal_異常系_implementation_hints空

**目的**: implementation_hints が空配列の場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: [],  // 空配列
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「No implementation hints provided」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

#### テストケース 2.1.7: validateEnhancementProposal_異常系_related_files空

**目的**: related_files が空配列の場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: []  // 空配列
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「No related files provided」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

#### テストケース 2.1.8: validateEnhancementProposal_異常系_type無効

**目的**: type が無効な値の場合、バリデーションが失敗することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const invalidProposal: any = {
  type: 'invalid_type',  // 無効なtype
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

**期待結果**:
- `validateEnhancementProposal(invalidProposal)` が `false` を返す
- ログに「Invalid type: invalid_type」という警告が出力される

**テストデータ**: 上記 `invalidProposal`

---

### 2.2 JSONパース処理

#### テストケース 2.2.1: parseEnhancementProposals_正常系_配列

**目的**: 有効なJSON配列が正しくパースされることを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const jsonString = `[
  {
    "type": "integration",
    "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
    "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
    "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止する。",
    "implementation_hints": ["Slack Incoming Webhook を使用"],
    "expected_impact": "medium",
    "effort_estimate": "small",
    "related_files": ["src/phases/evaluation.ts"]
  }
]`;
```

**期待結果**:
- `parseEnhancementProposals(jsonString)` が配列を返す
- 配列の長さが 1
- 配列の最初の要素の `type` が "integration"

**テストデータ**: 上記 `jsonString`

---

#### テストケース 2.2.2: parseEnhancementProposals_正常系_単一オブジェクト

**目的**: 単一のJSONオブジェクトが配列に変換されることを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const jsonString = `{
  "type": "integration",
  "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
  "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
  "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止する。",
  "implementation_hints": ["Slack Incoming Webhook を使用"],
  "expected_impact": "medium",
  "effort_estimate": "small",
  "related_files": ["src/phases/evaluation.ts"]
}`;
```

**期待結果**:
- `parseEnhancementProposals(jsonString)` が配列を返す
- 配列の長さが 1
- 配列の最初の要素の `type` が "integration"

**テストデータ**: 上記 `jsonString`

---

#### テストケース 2.2.3: parseEnhancementProposals_異常系_不正JSON_寛容パーサー成功

**目的**: 不正なJSONの場合、寛容なパーサーが最初の有効なJSON配列を抽出することを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const jsonString = `エージェントからの前置きテキスト...

ここから提案を開始します：

[
  {
    "type": "integration",
    "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
    "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
    "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止する。",
    "implementation_hints": ["Slack Incoming Webhook を使用"],
    "expected_impact": "medium",
    "effort_estimate": "small",
    "related_files": ["src/phases/evaluation.ts"]
  }
]

以上の提案を参考にしてください。`;
```

**期待結果**:
- `parseEnhancementProposals(jsonString)` が配列を返す
- 配列の長さが 1
- 配列の最初の要素の `type` が "integration"
- ログに「Standard JSON parse failed, trying lenient parser」という警告が出力される

**テストデータ**: 上記 `jsonString`

---

#### テストケース 2.2.4: parseEnhancementProposals_異常系_完全に不正JSON

**目的**: 完全に不正なJSONの場合、空配列が返されることを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const jsonString = `これは完全に不正なテキストで、JSON配列も含まれていません。`;
```

**期待結果**:
- `parseEnhancementProposals(jsonString)` が空配列を返す
- ログに「Standard JSON parse failed, trying lenient parser」という警告が出力される
- ログに「Lenient parser also failed」というエラーが出力される

**テストデータ**: 上記 `jsonString`

---

### 2.3 タイトル生成ロジック

#### テストケース 2.3.1: generateEnhancementTitle_improvement

**目的**: type が 'improvement' の場合、[Enhancement] プレフィックスが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'improvement',
  title: 'CLI UI の改善 - プログレスバーとカラフルな出力を追加する',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementTitle(proposal)` が "[Enhancement] CLI UI の改善 - プログレスバーとカラフルな出力を追加する" を返す

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.3.2: generateEnhancementTitle_integration

**目的**: type が 'integration' の場合、[Integration] プレフィックスが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementTitle(proposal)` が "[Integration] Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能" を返す

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.3.3: generateEnhancementTitle_automation

**目的**: type が 'automation' の場合、[Automation] プレフィックスが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'automation',
  title: '定期実行機能の追加 - cron スケジュールによる自動ワークフロー実行',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'medium',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementTitle(proposal)` が "[Automation] 定期実行機能の追加 - cron スケジュールによる自動ワークフロー実行" を返す

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.3.4: generateEnhancementTitle_dx

**目的**: type が 'dx' の場合、[DX] プレフィックスが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'dx',
  title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'medium',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementTitle(proposal)` が "[DX] 対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化" を返す

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.3.5: generateEnhancementTitle_quality

**目的**: type が 'quality' の場合、[Quality] プレフィックスが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'quality',
  title: 'セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'small',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementTitle(proposal)` が "[Quality] セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する" を返す

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.3.6: generateEnhancementTitle_ecosystem

**目的**: type が 'ecosystem' の場合、[Ecosystem] プレフィックスが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'ecosystem',
  title: 'プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'large',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementTitle(proposal)` が "[Ecosystem] プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構" を返す

**テストデータ**: 上記 `proposal`

---

### 2.4 ラベル生成ロジック

#### テストケース 2.4.1: generateEnhancementLabels_high_impact

**目的**: expected_impact が 'high' の場合、'priority:high' ラベルが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'small',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementLabels(proposal)` が以下のラベルを含む配列を返す:
  - 'auto-generated'
  - 'enhancement'
  - 'priority:high'
  - 'integration'

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.4.2: generateEnhancementLabels_medium_impact

**目的**: expected_impact が 'medium' の場合、'priority:medium' ラベルが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'automation',
  title: '定期実行機能の追加 - cron スケジュールによる自動ワークフロー実行',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'medium',
  effort_estimate: 'medium',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementLabels(proposal)` が以下のラベルを含む配列を返す:
  - 'auto-generated'
  - 'enhancement'
  - 'priority:medium'
  - 'automation'

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.4.3: generateEnhancementLabels_low_impact

**目的**: expected_impact が 'low' の場合、'priority:low' ラベルが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'improvement',
  title: 'CLI UI の改善 - プログレスバーとカラフルな出力を追加する',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'low',
  effort_estimate: 'small',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementLabels(proposal)` が以下のラベルを含む配列を返す:
  - 'auto-generated'
  - 'enhancement'
  - 'priority:low'
  - 'improvement'

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.4.4: generateEnhancementLabels_dx_type

**目的**: type が 'dx' の場合、'developer-experience' ラベルが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'dx',
  title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'medium',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementLabels(proposal)` が以下のラベルを含む配列を返す:
  - 'auto-generated'
  - 'enhancement'
  - 'priority:high'
  - 'developer-experience'

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.4.5: generateEnhancementLabels_quality_type

**目的**: type が 'quality' の場合、'quality-assurance' ラベルが付与されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'quality',
  title: 'セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'small',
  related_files: ['...']
};
```

**期待結果**:
- `generateEnhancementLabels(proposal)` が以下のラベルを含む配列を返す:
  - 'auto-generated'
  - 'enhancement'
  - 'priority:high'
  - 'quality-assurance'

**テストデータ**: 上記 `proposal`

---

### 2.5 フォールバックテンプレート

#### テストケース 2.5.1: createEnhancementFallbackBody_正常系

**目的**: フォールバックテンプレートが正しいフォーマットで生成されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
  implementation_hints: ['Slack Incoming Webhook を使用', 'EvaluationPhase.run() 完了後に通知処理を追加'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts', 'src/core/notification-manager.ts']
};
```

**期待結果**:
- `createEnhancementFallbackBody(proposal)` が以下のセクションを含む文字列を返す:
  - "## 概要" セクション（description が含まれる）
  - "## 根拠" セクション（rationale が含まれる）
  - "## 実装のヒント" セクション（implementation_hints が番号付きリストで含まれる）
  - "## 期待される効果" セクション（expected_impact と説明文が含まれる）
  - "## 実装の難易度" セクション（effort_estimate と説明文が含まれる）
  - "## 関連ファイル" セクション（related_files がリストで含まれる）
  - フッター（"🤖 この Issue は AI Workflow Agent の \`auto-issue\` コマンドにより自動生成されました。"）

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.5.2: createEnhancementFallbackBody_impact_high

**目的**: expected_impact が 'high' の場合、適切な説明文が生成されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'dx',
  title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'medium',
  related_files: ['...']
};
```

**期待結果**:
- `createEnhancementFallbackBody(proposal)` が「この機能は、プロダクトの価値を大幅に向上させる可能性があります。」という説明を含む

**テストデータ**: 上記 `proposal`

---

#### テストケース 2.5.3: createEnhancementFallbackBody_effort_large

**目的**: effort_estimate が 'large' の場合、適切な説明文が生成されることを検証

**前提条件**:
- `IssueGenerator` インスタンスが作成されている

**入力**:
```typescript
const proposal: EnhancementProposal = {
  type: 'ecosystem',
  title: 'プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構',
  description: '...',
  rationale: '...',
  implementation_hints: ['...'],
  expected_impact: 'high',
  effort_estimate: 'large',
  related_files: ['...']
};
```

**期待結果**:
- `createEnhancementFallbackBody(proposal)` が「実装には複数の開発者・複数のスプリントが必要な可能性があります。」という説明を含む

**テストデータ**: 上記 `proposal`

---

### 2.6 プロンプト変数置換

#### テストケース 2.6.1: fillTemplate_正常系

**目的**: プロンプトテンプレートの変数が正しく置換されることを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const template = `
リポジトリパス: {repository_path}
出力ファイルパス: {output_file_path}
創造的モード: {creative_mode}
`;

const variables = {
  repository_path: '/path/to/repo',
  output_file_path: '/path/to/repo/.ai-workflow-tmp/enhancements.json',
  creative_mode: 'enabled'
};
```

**期待結果**:
- `fillTemplate(template, variables)` が以下の文字列を返す:
```
リポジトリパス: /path/to/repo
出力ファイルパス: /path/to/repo/.ai-workflow-tmp/enhancements.json
創造的モード: enabled
```

**テストデータ**: 上記 `template` と `variables`

---

#### テストケース 2.6.2: fillTemplate_creative_mode_disabled

**目的**: creativeMode が false の場合、'disabled' に置換されることを検証

**前提条件**:
- `RepositoryAnalyzer` インスタンスが作成されている

**入力**:
```typescript
const template = '創造的モード: {creative_mode}';
const variables = {
  creative_mode: 'disabled'
};
```

**期待結果**:
- `fillTemplate(template, variables)` が "創造的モード: disabled" を返す

**テストデータ**: 上記 `template` と `variables`

---

### 2.7 CLIオプションパース

#### テストケース 2.7.1: parseOptions_creative_mode_true

**目的**: --creative-mode オプションが正しくパースされることを検証

**前提条件**:
- `auto-issue.ts` の `parseOptions` 関数が定義されている

**入力**:
```typescript
const argv = ['node', 'ai-workflow', 'auto-issue', '--category', 'enhancement', '--creative-mode'];
```

**期待結果**:
- `parseOptions(argv)` が以下のオブジェクトを返す:
```typescript
{
  category: 'enhancement',
  creativeMode: true,
  // ... 他のデフォルト値
}
```

**テストデータ**: 上記 `argv`

---

#### テストケース 2.7.2: parseOptions_creative_mode_false

**目的**: --creative-mode オプションが指定されない場合、creativeMode が false になることを検証

**前提条件**:
- `auto-issue.ts` の `parseOptions` 関数が定義されている

**入力**:
```typescript
const argv = ['node', 'ai-workflow', 'auto-issue', '--category', 'enhancement'];
```

**期待結果**:
- `parseOptions(argv)` が以下のオブジェクトを返す:
```typescript
{
  category: 'enhancement',
  creativeMode: false,
  // ... 他のデフォルト値
}
```

**テストデータ**: 上記 `argv`

---

## 3. インテグレーションテストシナリオ

### 3.1 エージェント統合テスト

#### シナリオ 3.1.1: Codexエージェントによる提案生成

**目的**: Codexエージェントがリポジトリを分析し、有効な機能拡張提案を生成できることを検証

**前提条件**:
- `CODEX_API_KEY` が設定されている
- 対象リポジトリ（テスト用）が存在する
- `src/prompts/auto-issue/detect-enhancements.txt` が存在する

**テスト手順**:
1. テスト用リポジトリのパスを取得
2. `RepositoryAnalyzer` インスタンスを作成
3. `analyzeForEnhancements(repoPath, 'codex', { creativeMode: false })` を実行
4. 結果を検証

**期待結果**:
- エージェントが正常に実行される
- `EnhancementProposal[]` が返される
- 配列の長さが 3 以上
- 各提案が `validateEnhancementProposal()` を通過する
- ログに「Generated X valid enhancement proposals」が出力される

**確認項目**:
- [ ] エージェントが正常に実行されたか
- [ ] 提案が3件以上生成されたか
- [ ] 各提案のフィールドが有効な値を持つか
- [ ] 提案がリポジトリの特性を踏まえているか（手動確認）

---

#### シナリオ 3.1.2: Claudeエージェントによる提案生成

**目的**: Claudeエージェントがリポジトリを分析し、有効な機能拡張提案を生成できることを検証

**前提条件**:
- `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- 対象リポジトリ（テスト用）が存在する
- `src/prompts/auto-issue/detect-enhancements.txt` が存在する

**テスト手順**:
1. テスト用リポジトリのパスを取得
2. `RepositoryAnalyzer` インスタンスを作成
3. `analyzeForEnhancements(repoPath, 'claude', { creativeMode: false })` を実行
4. 結果を検証

**期待結果**:
- エージェントが正常に実行される
- `EnhancementProposal[]` が返される
- 配列の長さが 3 以上
- 各提案が `validateEnhancementProposal()` を通過する
- ログに「Generated X valid enhancement proposals」が出力される

**確認項目**:
- [ ] エージェントが正常に実行されたか
- [ ] 提案が3件以上生成されたか
- [ ] 各提案のフィールドが有効な値を持つか
- [ ] 提案がリポジトリの特性を踏まえているか（手動確認）

---

#### シナリオ 3.1.3: エージェントフォールバック（Codex失敗 → Claude成功）

**目的**: Codexが失敗した場合、Claudeにフォールバックすることを検証

**前提条件**:
- `CODEX_API_KEY` が設定されていない（または無効）
- `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- 対象リポジトリ（テスト用）が存在する

**テスト手順**:
1. `CODEX_API_KEY` を一時的に削除または無効化
2. `RepositoryAnalyzer` インスタンスを作成
3. `analyzeForEnhancements(repoPath, 'auto', { creativeMode: false })` を実行（agentモード: 'auto'）
4. 結果を検証

**期待結果**:
- Codexのスキップログが出力される（「Codex API key not found, skipping」等）
- Claudeが実行される
- `EnhancementProposal[]` が返される
- 配列の長さが 3 以上
- ログに「Falling back to Claude agent」が出力される

**確認項目**:
- [ ] Codexがスキップされたか
- [ ] Claudeにフォールバックしたか
- [ ] 提案が正常に生成されたか

---

#### シナリオ 3.1.4: 創造的モードでの提案生成

**目的**: `--creative-mode` オプション使用時、より創造的な提案が生成されることを検証

**前提条件**:
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- 対象リポジトリ（テスト用）が存在する

**テスト手順**:
1. `RepositoryAnalyzer` インスタンスを作成
2. `analyzeForEnhancements(repoPath, 'auto', { creativeMode: true })` を実行
3. 結果を検証
4. 通常モードと比較

**期待結果**:
- プロンプトに「創造的モード: enabled」が含まれる
- `EnhancementProposal[]` が返される
- 提案の内容が通常モードより実験的・創造的である（手動確認）
- `expected_impact` が 'high' の割合が通常モードより多い（可能性）

**確認項目**:
- [ ] 創造的モードのプロンプトが使用されたか
- [ ] 提案が生成されたか
- [ ] 提案の内容が通常モードと異なるか（手動確認）

---

### 3.2 エンドツーエンドフローテスト

#### シナリオ 3.2.1: enhancement カテゴリのエンドツーエンドフロー（dry-runモード）

**目的**: `--category enhancement --dry-run` コマンドが正常に動作することを検証

**前提条件**:
- 環境変数が設定されている（`GITHUB_TOKEN`, `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH`）
- 対象リポジトリが存在する

**テスト手順**:
1. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --dry-run --limit 3
   ```
2. コンソール出力を確認

**期待結果**:
- リポジトリ分析が実行される
- 最大3件の提案が生成される
- 重複チェックが実行される
- コンソールに以下の情報が表示される:
  - "=== PREVIEW MODE (--dry-run) ==="
  - タイトル（プレフィックス付き）
  - ラベル（`auto-generated`, `enhancement`, `priority:*`, タイプ別）
  - 本文（フォーマット済み）
- GitHub Issueは生成されない
- プロセスが正常終了する（exit code 0）

**確認項目**:
- [ ] リポジトリ分析が実行されたか
- [ ] 提案が3件以内で生成されたか
- [ ] dry-runモードの出力が表示されたか
- [ ] GitHub Issueが生成されていないか
- [ ] プロセスが正常終了したか

---

#### シナリオ 3.2.2: enhancement カテゴリのエンドツーエンドフロー（本番実行）

**目的**: `--category enhancement` コマンドで実際にGitHub Issueが生成されることを検証

**前提条件**:
- 環境変数が設定されている（`GITHUB_TOKEN`, `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH`）
- 対象リポジトリが存在する
- GitHub リポジトリへの書き込み権限がある

**テスト手順**:
1. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --limit 2
   ```
2. コンソール出力を確認
3. GitHub リポジトリのIssueページを確認

**期待結果**:
- リポジトリ分析が実行される
- 最大2件の提案が生成される
- 重複チェックが実行される
- 各提案がGitHub Issueとして作成される
- コンソールに以下の情報が表示される:
  - "✅ Issue 生成完了: https://github.com/..."
- GitHub リポジトリに以下のIssueが作成される:
  - タイトル: "[Enhancement] ..." または "[Integration] ..." 等
  - ラベル: `auto-generated`, `enhancement`, `priority:*`, タイプ別
  - 本文: 概要、根拠、実装のヒント、期待される効果、実装の難易度、関連ファイルのセクション
- プロセスが正常終了する（exit code 0）

**確認項目**:
- [ ] リポジトリ分析が実行されたか
- [ ] 提案が2件以内で生成されたか
- [ ] GitHub Issueが実際に作成されたか
- [ ] Issueのタイトル、ラベル、本文が正しいか
- [ ] プロセスが正常終了したか

---

#### シナリオ 3.2.3: 重複検出が動作すること（既存Issueとの重複）

**目的**: 既存のEnhancement Issueと重複する提案が除外されることを検証

**前提条件**:
- GitHub リポジトリに既存のEnhancement Issueが存在する（例: "Slack 通知機能の追加"）
- 環境変数が設定されている

**テスト手順**:
1. 既存Issueのタイトル・内容を確認
2. 以下のコマンドを実行（類似度閾値を高めに設定）:
   ```bash
   ai-workflow auto-issue --category enhancement --dry-run --limit 5 --similarity-threshold 0.85
   ```
3. コンソール出力を確認

**期待結果**:
- リポジトリ分析が実行される
- 提案が生成される
- 重複チェックが実行される
- 既存Issueと類似度が 0.85 以上の提案が除外される
- ログに以下が出力される:
  - "Checking for duplicates against X existing issues"
  - "Stage 1: TF-IDF similarity = 0.XX"（閾値以上の場合）
  - "Stage 2: LLM判定 = duplicate"（重複と判定された場合）
  - "Filtered out X duplicate proposals"
- 重複していない提案のみが表示される

**確認項目**:
- [ ] 重複チェックが実行されたか
- [ ] 既存Issueと類似する提案が除外されたか
- [ ] ログに重複除外の理由が出力されたか

---

#### シナリオ 3.2.4: 創造的モードのエンドツーエンドフロー

**目的**: `--creative-mode` オプション使用時のエンドツーエンドフローが動作することを検証

**前提条件**:
- 環境変数が設定されている

**テスト手順**:
1. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --creative-mode --dry-run --limit 3
   ```
2. コンソール出力を確認

**期待結果**:
- リポジトリ分析が実行される（創造的モードのプロンプト使用）
- 提案が生成される（より創造的な内容）
- 重複チェックが実行される
- dry-runモードで提案内容が表示される
- プロセスが正常終了する

**確認項目**:
- [ ] 創造的モードのプロンプトが使用されたか
- [ ] 提案が生成されたか
- [ ] 提案の内容が実験的・創造的か（手動確認）

---

### 3.3 エラーハンドリングテスト

#### シナリオ 3.3.1: エージェント失敗時の動作（両方失敗）

**目的**: Codex と Claude の両方が失敗した場合、空配列が返されプロセスがクラッシュしないことを検証

**前提条件**:
- `CODEX_API_KEY` と `CLAUDE_CODE_CREDENTIALS_PATH` が両方設定されていない（または無効）

**テスト手順**:
1. 環境変数を一時的に削除
2. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --dry-run
   ```
3. コンソール出力とexit codeを確認

**期待結果**:
- Codexのスキップログが出力される
- Claudeのスキップログが出力される
- ログに「提案生成に失敗しました」というメッセージが表示される
- 空配列が返される
- プロセスがクラッシュしない（exit code 0 または 1）
- ユーザーに適切なエラーメッセージが表示される

**確認項目**:
- [ ] プロセスがクラッシュしなかったか
- [ ] 適切なエラーメッセージが表示されたか
- [ ] exit codeが適切か

---

#### シナリオ 3.3.2: GitHub API エラー時の動作（レート制限）

**目的**: GitHub API がレート制限エラー（429）を返した場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- GitHub API のレート制限に達している状態（テスト環境で再現が困難な場合はモックを使用）

**テスト手順**:
1. GitHub API のレート制限に達した状態を作成（またはモック）
2. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --limit 1
   ```
3. コンソール出力を確認

**期待結果**:
- GitHub Issue 作成時にエラーが発生
- ログに「GitHub API rate limit exceeded」というエラーメッセージが表示される
- ユーザーに「レート制限に達しました。しばらく待ってから再実行してください」というメッセージが表示される
- プロセスが適切に終了する（exit code 1）

**確認項目**:
- [ ] エラーが適切にハンドリングされたか
- [ ] ユーザーに分かりやすいエラーメッセージが表示されたか

---

#### シナリオ 3.3.3: バリデーションエラー時の動作

**目的**: エージェントが無効な提案を生成した場合、バリデーションで除外されることを検証

**前提条件**:
- テスト用に無効な提案を含むJSON出力をエージェントから取得（モックを使用）

**テスト手順**:
1. エージェントの出力を以下のようにモック:
   ```json
   [
     {
       "type": "integration",
       "title": "短すぎる",  // 50文字未満
       "description": "説明が短い",  // 100文字未満
       "rationale": "理由",  // 50文字未満
       "implementation_hints": [],  // 空配列
       "expected_impact": "medium",
       "effort_estimate": "small",
       "related_files": []  // 空配列
     },
     {
       "type": "integration",
       "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
       "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
       "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握できる。",
       "implementation_hints": ["Slack Incoming Webhook を使用"],
       "expected_impact": "medium",
       "effort_estimate": "small",
       "related_files": ["src/phases/evaluation.ts"]
     }
   ]
   ```
2. `analyzeForEnhancements()` を実行
3. 結果を検証

**期待結果**:
- エージェント出力がパースされる
- 1件目の提案がバリデーションで除外される
- 2件目の提案がバリデーションを通過する
- ログに「1件の提案がバリデーションを通過できませんでした」という警告が出力される
- `EnhancementProposal[]` の長さが 1

**確認項目**:
- [ ] 無効な提案が除外されたか
- [ ] 有効な提案のみが返されたか
- [ ] 適切な警告ログが出力されたか

---

### 3.4 多言語リポジトリ対応テスト

#### シナリオ 3.4.1: TypeScriptリポジトリでの動作確認

**目的**: TypeScriptリポジトリで正常に動作することを検証

**前提条件**:
- テスト対象がTypeScriptリポジトリ（例: ai-workflow-agent自身）

**テスト手順**:
1. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --dry-run --limit 3
   ```
2. 提案内容を確認

**期待結果**:
- リポジトリ分析が正常に実行される
- TypeScript固有の提案が生成される（例: 型定義の改善、tsconfig.json の最適化等）
- 提案が具体的で実現可能性がある

**確認項目**:
- [ ] TypeScriptリポジトリを正しく認識したか
- [ ] TypeScript固有の提案が含まれているか

---

#### シナリオ 3.4.2: Goリポジトリでの動作確認

**目的**: Goリポジトリで正常に動作することを検証

**前提条件**:
- テスト対象がGoリポジトリ（例: 他のプロジェクト）

**テスト手順**:
1. Goリポジトリをクローン
2. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --dry-run --limit 3
   ```
3. 提案内容を確認

**期待結果**:
- リポジトリ分析が正常に実行される
- Go固有の提案が生成される（例: Goroutine の最適化、go.mod の改善等）
- 提案が具体的で実現可能性がある

**確認項目**:
- [ ] Goリポジトリを正しく認識したか
- [ ] Go固有の提案が含まれているか

---

#### シナリオ 3.4.3: Pythonリポジトリでの動作確認

**目的**: Pythonリポジトリで正常に動作することを検証

**前提条件**:
- テスト対象がPythonリポジトリ

**テスト手順**:
1. Pythonリポジトリをクローン
2. 以下のコマンドを実行:
   ```bash
   ai-workflow auto-issue --category enhancement --dry-run --limit 3
   ```
3. 提案内容を確認

**期待結果**:
- リポジトリ分析が正常に実行される
- Python固有の提案が生成される（例: 型ヒントの追加、requirements.txt の改善等）
- 提案が具体的で実現可能性がある

**確認項目**:
- [ ] Pythonリポジトリを正しく認識したか
- [ ] Python固有の提案が含まれているか

---

## 4. テストデータ

### 4.1 有効なEnhancementProposal

```typescript
const validProposal1: EnhancementProposal = {
  type: 'integration',
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。チームメンバー全員が進捗を把握できる。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
  implementation_hints: [
    'Slack Incoming Webhook を使用',
    'EvaluationPhase.run() 完了後に通知処理を追加',
    '環境変数 SLACK_WEBHOOK_URL で設定'
  ],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts', 'src/core/notification-manager.ts']
};

const validProposal2: EnhancementProposal = {
  type: 'dx',
  title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化する機能',
  description: '初回実行時に対話的セットアップウィザードを表示し、環境変数の設定、GitHub 認証、エージェント選択を GUI で完了できる機能。設定内容は .env ファイルに自動保存され、ユーザーは即座に利用開始できる。',
  rationale: '新規ユーザーがドキュメントを読まずに即座に利用開始できる。環境変数の設定ミスを防ぎ、オンボーディング時間を大幅に短縮する。',
  implementation_hints: [
    'inquirer.js ライブラリを使用',
    'ai-workflow init コマンド拡張',
    '.env.example をテンプレートとして使用'
  ],
  expected_impact: 'high',
  effort_estimate: 'medium',
  related_files: ['src/commands/init.ts', 'src/utils/interactive-setup.ts']
};

const validProposal3: EnhancementProposal = {
  type: 'quality',
  title: 'セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する機能',
  description: 'npm audit や Snyk を統合し、依存関係の脆弱性を自動検出する機能。CI/CD パイプラインに組み込み、脆弱性が検出された場合は Issue を自動生成する。',
  rationale: 'セキュリティリスクを早期発見し、脆弱性のある依存関係の使用を防止。コンプライアンス要件を満たし、プロダクトの信頼性を向上させる。',
  implementation_hints: [
    'npm audit コマンドを実行',
    'Snyk API を統合',
    'Phase 8 (Report) で脆弱性レポートを生成'
  ],
  expected_impact: 'high',
  effort_estimate: 'small',
  related_files: ['src/commands/auto-issue.ts', 'src/core/security-scanner.ts']
};
```

### 4.2 無効なEnhancementProposal

```typescript
const invalidProposal1: any = {
  type: 'integration',
  title: '短い',  // 50文字未満
  description: '説明',  // 100文字未満
  rationale: '理由',  // 50文字未満
  implementation_hints: [],  // 空配列
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: []  // 空配列
};

const invalidProposal2: any = {
  type: 'invalid_type',  // 無効なtype
  title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
  description: 'AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
  rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
  implementation_hints: ['Slack Incoming Webhook を使用'],
  expected_impact: 'medium',
  effort_estimate: 'small',
  related_files: ['src/phases/evaluation.ts']
};
```

### 4.3 エージェント出力のサンプル（JSON）

```json
[
  {
    "type": "integration",
    "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
    "description": "AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。チームメンバー全員が進捗を把握できる。",
    "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。",
    "implementation_hints": [
      "Slack Incoming Webhook を使用",
      "EvaluationPhase.run() 完了後に通知処理を追加",
      "環境変数 SLACK_WEBHOOK_URL で設定"
    ],
    "expected_impact": "medium",
    "effort_estimate": "small",
    "related_files": [
      "src/phases/evaluation.ts",
      "src/core/notification-manager.ts"
    ]
  },
  {
    "type": "dx",
    "title": "対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化する機能",
    "description": "初回実行時に対話的セットアップウィザードを表示し、環境変数の設定、GitHub 認証、エージェント選択を GUI で完了できる機能。設定内容は .env ファイルに自動保存され、ユーザーは即座に利用開始できる。",
    "rationale": "新規ユーザーがドキュメントを読まずに即座に利用開始できる。環境変数の設定ミスを防ぎ、オンボーディング時間を大幅に短縮する。",
    "implementation_hints": [
      "inquirer.js ライブラリを使用",
      "ai-workflow init コマンド拡張",
      ".env.example をテンプレートとして使用"
    ],
    "expected_impact": "high",
    "effort_estimate": "medium",
    "related_files": [
      "src/commands/init.ts",
      "src/utils/interactive-setup.ts"
    ]
  },
  {
    "type": "quality",
    "title": "セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する機能",
    "description": "npm audit や Snyk を統合し、依存関係の脆弱性を自動検出する機能。CI/CD パイプラインに組み込み、脆弱性が検出された場合は Issue を自動生成する。",
    "rationale": "セキュリティリスクを早期発見し、脆弱性のある依存関係の使用を防止。コンプライアンス要件を満たし、プロダクトの信頼性を向上させる。",
    "implementation_hints": [
      "npm audit コマンドを実行",
      "Snyk API を統合",
      "Phase 8 (Report) で脆弱性レポートを生成"
    ],
    "expected_impact": "high",
    "effort_estimate": "small",
    "related_files": [
      "src/commands/auto-issue.ts",
      "src/core/security-scanner.ts"
    ]
  }
]
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

- **ローカル環境**: 開発者のローカルマシン（ユニットテスト実行）
- **CI/CD環境**: GitHub Actions（インテグレーションテスト実行）

### 5.2 必要な外部サービス

- **GitHub API**: Issue生成、既存Issue取得
- **Codex API**: エージェント実行（オプション）
- **Claude Code SDK**: エージェント実行（オプション）
- **OpenAI API**: 重複検出のLLM判定

### 5.3 環境変数

```bash
# 必須
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_REPOSITORY=owner/repo

# エージェント（少なくとも1つ必須）
CODEX_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
CLAUDE_CODE_CREDENTIALS_PATH=/path/to/credentials.json

# OpenAI API（重複検出用）
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# リポジトリルート（オプション）
REPOS_ROOT=/path/to/repos
```

### 5.4 モック/スタブの必要性

#### ユニットテストでのモック
- **エージェントクライアント**: Codex/Claude の API 呼び出しをモック
- **GitHub API**: Issue作成、Issue取得をモック
- **ファイルシステム**: プロンプトテンプレートの読み込みをモック（一部テストケース）

#### インテグレーションテストでのモック
- **GitHub API（一部）**: レート制限エラーのシミュレーション

### 5.5 テストリポジトリ

インテグレーションテストでは、以下のテストリポジトリを使用:
- **ai-workflow-agent自身**: TypeScriptリポジトリのテスト
- **Goリポジトリ**: 多言語対応のテスト（別途用意）
- **Pythonリポジトリ**: 多言語対応のテスト（別途用意）

---

## 6. 品質ゲート（Phase 3）

このテストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - UNIT_INTEGRATION 戦略に基づき、ユニットテストとインテグレーションテストの両方を作成
- [x] **主要な正常系がカバーされている**
  - バリデーション正常系（2.1.1）
  - JSONパース正常系（2.2.1, 2.2.2）
  - タイトル・ラベル生成正常系（2.3.x, 2.4.x）
  - エージェント統合正常系（3.1.1, 3.1.2）
  - エンドツーエンドフロー正常系（3.2.1, 3.2.2）
- [x] **主要な異常系がカバーされている**
  - バリデーション異常系（2.1.2〜2.1.8）
  - JSONパース異常系（2.2.3, 2.2.4）
  - エージェント失敗（3.1.3, 3.3.1）
  - GitHub APIエラー（3.3.2）
  - バリデーションエラー（3.3.3）
- [x] **期待結果が明確である**
  - 各テストケースに具体的な期待結果を記載
  - 確認項目をチェックリスト形式で明示

---

## 7. テストの優先度

### 高優先度（Phase 5で必ず実装）

1. **ユニットテスト**:
   - EnhancementProposal型のバリデーション（2.1.x）
   - タイトル・ラベル生成ロジック（2.3.x, 2.4.x）
   - JSONパース処理（2.2.x）

2. **インテグレーションテスト**:
   - エンドツーエンドフロー（dry-runモード）（3.2.1）
   - エージェント統合（3.1.1 または 3.1.2）

### 中優先度（時間があれば実装）

1. **ユニットテスト**:
   - フォールバックテンプレート（2.5.x）
   - CLIオプションパース（2.7.x）

2. **インテグレーションテスト**:
   - エンドツーエンドフロー（本番実行）（3.2.2）
   - 重複検出（3.2.3）
   - エラーハンドリング（3.3.x）

### 低優先度（Phase 6で手動確認）

1. **インテグレーションテスト**:
   - 多言語リポジトリ対応（3.4.x）
   - 創造的モード（3.1.4, 3.2.4）

---

## 8. 次のフェーズへの引き継ぎ事項

Phase 4（Implementation）および Phase 5（Test Implementation）では、このテストシナリオに基づいて実装とテストコードを作成します。

### Phase 4（Implementation）への引き継ぎ
- 各ユニットテストシナリオに対応する実装を行う
- 特に、バリデーションロジック、タイトル・ラベル生成ロジックは、テストケースを先に確認してから実装すること

### Phase 5（Test Implementation）への引き継ぎ
- このテストシナリオを元に、実際のテストコードを実装する
- 優先度の高いテストから順に実装する
- テストカバレッジ 80% 以上を目標とする

---

**テストシナリオ作成日**: 2025-01-30
**次のフェーズ**: Phase 4 (Implementation) - 実装開始
