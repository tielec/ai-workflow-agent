# 要件定義書 - Issue #47

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

- **実装戦略**: REFACTOR（既存コードの構造改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテストと統合テストの両方）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルの拡張）
- **見積もり工数**: 8~12時間
- **リスク評価**: 低
- **削減予測**: 約830行（69%削減）

Planning Documentで策定された以下の方針を踏まえて要件定義を実施します：
- 新規ファイル作成なし、すべて既存ファイルの修正
- コード削減が主目的（重複コード~500行を基底クラスに集約）
- 既存動作の維持（フェーズの実行フロー execute/review/revise は変更なし）
- 保守性向上（共通ロジックを単一箇所に集約し、DRY原則に準拠）

---

## 1. 概要

### 背景

AI Workflow Agent の全10フェーズ実装において、以下のパターンが各フェーズで繰り返されています：

```typescript
// execute() メソッドの共通パターン
const issueInfo = await this.getIssueInfo();
const planningReference = this.getPlanningDocumentReference(issueInfo.number);

const executePrompt = this.loadPrompt('execute')
  .replace('{planning_document_path}', planningReference)
  .replace('{issue_info}', this.formatIssueInfo(issueInfo))
  .replace('{issue_number}', String(issueInfo.number));

await this.executeWithAgent(executePrompt, { maxTurns: 30 });

const outputFile = path.join(this.outputDir, 'requirements.md');
if (!fs.existsSync(outputFile)) {
  return { success: false, error: `requirements.md not found: ${outputFile}` };
}
return { success: true, output: outputFile };
```

この同一パターンが以下の10ファイルで重複しています：
- `src/phases/planning.ts`
- `src/phases/requirements.ts`
- `src/phases/design.ts`
- `src/phases/test-scenario.ts`
- `src/phases/implementation.ts`
- `src/phases/test-implementation.ts`
- `src/phases/testing.ts`
- `src/phases/documentation.ts`
- `src/phases/report.ts`
- `src/phases/evaluation.ts`

**重複コード量**: 約500行（全10フェーズ合計）

### 目的

テンプレートメソッドパターンを `BasePhase` クラスに導入することで、以下を実現します：

1. **コードベースの削減**: 重複コード約500行を削除
2. **保守性の向上**: 実行フロー変更時の修正箇所を単一化
3. **一貫性の確保**: 全フェーズで一貫したエラーハンドリング
4. **拡張性の向上**: 新規フェーズ追加の容易化

### ビジネス価値・技術的価値

- **ビジネス価値**:
  - 新規フェーズ追加時の開発時間を50%削減
  - バグ修正時の影響範囲を限定し、品質向上

- **技術的価値**:
  - DRY原則への準拠（Don't Repeat Yourself）
  - テンプレートメソッドパターンの適用による設計品質向上
  - コードレビューの負荷軽減（約500行の削減）

---

## 2. 機能要件

### FR-1: テンプレートメソッドの実装【優先度: 高】

**説明**: `BasePhase` クラスに、フェーズ実行の共通パターンを抽象化したテンプレートメソッド `executePhaseTemplate()` を追加する。

**詳細**:
- メソッド名: `executePhaseTemplate<T extends Record<string, string>>`
- パラメータ:
  - `phaseOutputFile: string` - 出力ファイル名（例: `'requirements.md'`）
  - `templateVariables: T` - プロンプトテンプレートの変数マップ（キー: `{variable_name}`, 値: 置換後の文字列）
  - `options?: { maxTurns?: number }` - エージェント実行オプション（デフォルト: `{ maxTurns: 30 }`）
- 戻り値: `Promise<PhaseExecutionResult>`
- 処理内容:
  1. `this.loadPrompt('execute')` でプロンプトテンプレートを読み込む
  2. `templateVariables` の各エントリに対して、プロンプト内の `{key}` を `value` に置換
  3. `this.executeWithAgent(prompt, options)` でエージェント実行
  4. `path.join(this.outputDir, phaseOutputFile)` で出力ファイルの存在を確認
  5. ファイル不在時: `{ success: false, error: '...' }` を返す
  6. ファイル存在時: `{ success: true, output: filePath }` を返す

**受け入れ基準**:
- Given: `BasePhase` のサブクラスが `executePhaseTemplate()` を呼び出す
- When: 正しいパラメータが渡される
- Then: プロンプトが正しく変数置換され、エージェント実行が成功する

---

### FR-2: RequirementsPhase の簡素化【優先度: 高】

**説明**: `RequirementsPhase.execute()` メソッドを、`executePhaseTemplate()` を使用した実装に置き換える。

**変更前** (約30行):
```typescript
protected async execute(): Promise<PhaseExecutionResult> {
  const issueInfo = (await this.getIssueInfo()) as IssueInfo;
  const planningReference = this.getPlanningDocumentReference(issueInfo.number);

  const executePrompt = this.loadPrompt('execute')
    .replace('{planning_document_path}', planningReference)
    .replace('{issue_info}', this.formatIssueInfo(issueInfo))
    .replace('{issue_number}', String(issueInfo.number));

  await this.executeWithAgent(executePrompt, { maxTurns: 30 });

  const outputFile = path.join(this.outputDir, 'requirements.md');
  if (!fs.existsSync(outputFile)) {
    return { success: false, error: `requirements.md が見つかりません: ${outputFile}` };
  }
  return { success: true, output: outputFile };
}
```

**変更後** (約8行):
```typescript
protected async execute(): Promise<PhaseExecutionResult> {
  const issueInfo = await this.getIssueInfo();
  return this.executePhaseTemplate('requirements.md', {
    planning_document_path: this.getPlanningDocumentReference(issueInfo.number),
    issue_info: this.formatIssueInfo(issueInfo),
    issue_number: String(issueInfo.number)
  });
}
```

**受け入れ基準**:
- Given: `RequirementsPhase.execute()` が実行される
- When: Issue情報が正常に取得できる
- Then: 既存実装と同一の動作をし、`requirements.md` が生成される

**削減量**: 約22行

---

### FR-3: DesignPhase の簡素化【優先度: 高】

**説明**: `DesignPhase.execute()` メソッドを簡素化するが、設計決定抽出ロジック（`extractDesignDecisions`）は保持する。

**変更後の実装イメージ**:
```typescript
protected async execute(): Promise<PhaseExecutionResult> {
  const issueInfo = await this.getIssueInfo();
  const requirementsContext = this.buildOptionalContext(
    'requirements',
    'requirements.md',
    '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。',
    issueInfo.number,
  );

  const result = await this.executePhaseTemplate('design.md', {
    planning_document_path: this.getPlanningDocumentReference(issueInfo.number),
    requirements_document_path: requirementsContext,
    issue_info: this.formatIssueInfo(issueInfo),
    issue_number: String(issueInfo.number)
  }, { maxTurns: 40 });

  // 設計決定抽出ロジックは保持（特殊ロジック）
  if (result.success) {
    const designContent = fs.readFileSync(result.output, 'utf-8');
    const decisions = this.metadata.data.design_decisions;
    if (decisions.implementation_strategy === null) {
      const extracted = await this.contentParser.extractDesignDecisions(designContent);
      if (Object.keys(extracted).length) {
        Object.assign(this.metadata.data.design_decisions, extracted);
        this.metadata.save();
      }
    }
  }

  return result;
}
```

**受け入れ基準**:
- Given: `DesignPhase.execute()` が実行される
- When: 設計書が生成される
- Then: 設計決定が `metadata.json` に抽出される（既存動作と同一）

**削減量**: 約15行

---

### FR-4: ImplementationPhase の簡素化【優先度: 高】

**説明**: `ImplementationPhase.execute()` メソッドを簡素化するが、オプショナルコンテキスト構築ロジック（`buildOptionalContext`）は保持する。

**変更後の実装イメージ**:
```typescript
protected async execute(): Promise<PhaseExecutionResult> {
  const issueNumber = parseInt(this.metadata.data.issue_number, 10);

  return this.executePhaseTemplate('implementation.md', {
    planning_document_path: this.getPlanningDocumentReference(issueNumber),
    requirements_context: this.buildOptionalContext('requirements', 'requirements.md', '...'),
    design_context: this.buildOptionalContext('design', 'design.md', '...'),
    test_scenario_context: this.buildOptionalContext('test_scenario', 'test-scenario.md', '...'),
    implementation_strategy: this.metadata.data.design_decisions.implementation_strategy ?? '...',
    issue_number: String(issueNumber)
  }, { maxTurns: 100 });
}
```

**受け入れ基準**:
- Given: `ImplementationPhase.execute()` が実行される
- When: オプショナルコンテキストが構築される
- Then: 既存実装と同一の動作をし、`implementation.md` が生成される

**削減量**: 約20行

---

### FR-5: TestingPhase の簡素化【優先度: 中】

**説明**: `TestingPhase.execute()` メソッドを簡素化するが、ファイル更新チェックロジック（mtime & size）は保持する。

**変更後の実装イメージ**:
```typescript
protected async execute(): Promise<PhaseExecutionResult> {
  const issueNumber = parseInt(this.metadata.data.issue_number, 10);
  const testResultFile = path.join(this.outputDir, 'test-result.md');

  // ファイル更新チェック（特殊ロジック）
  const oldMtime = fs.existsSync(testResultFile) ? fs.statSync(testResultFile).mtimeMs : null;
  const oldSize = fs.existsSync(testResultFile) ? fs.statSync(testResultFile).size : null;

  const result = await this.executePhaseTemplate('test-result.md', {
    planning_document_path: this.getPlanningDocumentReference(issueNumber),
    test_implementation_context: this.buildOptionalContext('test_implementation', '...'),
    implementation_context: this.buildOptionalContext('implementation', '...'),
    test_scenario_context: this.buildOptionalContext('test_scenario', '...'),
    issue_number: String(issueNumber)
  }, { maxTurns: 80 });

  // ファイル更新チェック（特殊ロジック）
  if (result.success && oldMtime !== null && oldSize !== null) {
    const newMtime = fs.statSync(testResultFile).mtimeMs;
    const newSize = fs.statSync(testResultFile).size;
    if (newMtime === oldMtime && newSize === oldSize) {
      return { success: false, error: 'test-result.md が更新されていません。' };
    }
  }

  return result;
}
```

**受け入れ基準**:
- Given: `TestingPhase.execute()` が実行される
- When: テスト実行が完了する
- Then: ファイル更新チェックが正常に動作し、既存動作と同一になる

**削減量**: 約15行

---

### FR-6: 残り6フェーズの簡素化【優先度: 中】

**説明**: 以下の標準的なフェーズを `executePhaseTemplate()` を使用した実装に置き換える：
- `PlanningPhase.execute()`
- `TestScenarioPhase.execute()`
- `TestImplementationPhase.execute()`
- `DocumentationPhase.execute()`
- `ReportPhase.execute()`
- `EvaluationPhase.execute()`

**受け入れ基準**:
- Given: 各フェーズの `execute()` が実行される
- When: テンプレートメソッドが呼び出される
- Then: 既存実装と同一の動作をし、各フェーズの成果物が生成される

**削減量**: 約50行（各フェーズ約8行削減）

---

### FR-7: review() メソッドの簡素化【優先度: 中】

**説明**: `review()` メソッドにも同様のテンプレートメソッド `reviewPhaseTemplate()` を提供する（オプション要件）。

**実装方針**:
- `review()` メソッドは `execute()` と異なり、`ContentParser.parseReviewResult()` を使用するため、別のテンプレートメソッドが必要
- 優先度は中程度（削減効果が小さいため）

**受け入れ基準**:
- Given: `reviewPhaseTemplate()` が実装される
- When: 各フェーズの `review()` メソッドで使用される
- Then: レビュー結果が正しく解析され、GitHub にコメント投稿される

**削減量**: 約150行（全10フェーズ合計）

---

### FR-8: revise() メソッドの簡素化【優先度: 低】

**説明**: `revise()` メソッドにも同様のテンプレートメソッド `revisePhaseTemplate()` を提供する（オプション要件）。

**実装方針**:
- `revise()` メソッドは各フェーズで特殊なロジックを持つことが多いため、テンプレート化の効果が小さい
- 優先度は低（Phase 1では対象外とする可能性あり）

**削減量**: 約100行（全10フェーズ合計）

---

## 3. 非機能要件

### NFR-1: 後方互換性【優先度: 高】

**説明**: 既存のフェーズ実行フロー（execute → review → revise）は変更せず、内部実装のみをリファクタリングする。

**検証方法**:
- 既存の統合テストがすべてパスすること
- メタデータ構造（`metadata.json`）に変更がないこと

---

### NFR-2: パフォーマンス【優先度: 中】

**説明**: リファクタリング後もフェーズ実行時間は変化しない（または誤差範囲内）。

**検証方法**:
- Planning Phase（Phase 0）の実行時間: 3分 ± 10秒（リファクタリング前後で同等）
- Implementation Phase（Phase 4）の実行時間: 10分 ± 30秒（リファクタリング前後で同等）

---

### NFR-3: 型安全性【優先度: 高】

**説明**: テンプレートメソッドはジェネリック型パラメータ `T extends Record<string, string>` により、型安全な変数置換を提供する。

**検証方法**:
- TypeScript コンパイラがエラーなくビルドできること（`npm run build`）
- ESLint がエラーを報告しないこと

---

### NFR-4: エラーハンドリングの一貫性【優先度: 高】

**説明**: 全フェーズで一貫したエラーメッセージとエラーハンドリングを提供する。

**エラーメッセージ形式**:
```typescript
return {
  success: false,
  error: `${phaseOutputFile} が見つかりません: ${outputFilePath}`
};
```

**検証方法**:
- 出力ファイル不在時のエラーメッセージが全フェーズで統一されていること

---

### NFR-5: 拡張性【優先度: 中】

**説明**: 将来的に `verbose` オプション、`logDir` オプションを追加できる拡張性を確保する。

**実装方針**:
- `options` パラメータをオブジェクト型とし、将来的な拡張に対応
- 現時点では `{ maxTurns?: number }` のみサポート

---

## 4. 制約事項

### TC-1: 技術的制約

- **使用言語**: TypeScript 5.x
- **Node.js バージョン**: 20.x 以上
- **既存アーキテクチャ**: `BasePhase` クラスの抽象化メカニズムを活用
- **テンプレートメソッドパターン**: Gang of Four のデザインパターンに準拠

---

### TC-2: 既存コードとの整合性

- **特殊ロジックの保持**:
  - `DesignPhase`: 設計決定抽出（`extractDesignDecisions`）
  - `TestingPhase`: ファイル更新チェック（mtime & size）
  - `ImplementationPhase`: オプショナルコンテキスト構築（`buildOptionalContext`）
  - `PlanningPhase`: `revise()` メソッドなし

---

### TC-3: コーディング規約

- **ESLint ルール**: プロジェクト規約に準拠（`npx eslint --ext .ts src`）
- **命名規則**:
  - テンプレートメソッド名: `executePhaseTemplate`, `reviewPhaseTemplate`, `revisePhaseTemplate`
  - パラメータ名: `phaseOutputFile`, `templateVariables`, `options`
- **JSDoc コメント**: `executePhaseTemplate()` メソッドに詳細な説明を追加

---

## 5. 前提条件

### PC-1: 開発環境

- Node.js 20.x 以上がインストールされている
- npm 10.x 以上がインストールされている
- TypeScript 開発環境が構築されている

---

### PC-2: 依存コンポーネント

- `BasePhase` クラス（`src/phases/base-phase.ts`）が存在する
- 全10フェーズクラスが `BasePhase` を継承している
- `MetadataManager`, `GitHubClient`, `CodexAgentClient`, `ClaudeAgentClient` が正常に動作する

---

### PC-3: テスト環境

- Jest テストフレームワークが設定されている
- `tests/unit/phases/base-phase.test.ts` が存在する（または作成可能）
- `tests/integration/` ディレクトリに既存のフェーズ実行テストが存在する

---

## 6. 受け入れ基準

### AC-1: コード削減量【必須】

**基準**: リファクタリングにより、コードベースが約500行以上削減されること。

**検証方法**:
```bash
# リファクタリング前の総行数
wc -l src/phases/*.ts

# リファクタリング後の総行数
wc -l src/phases/*.ts

# 削減率が60%以上であること
```

**期待値**:
- リファクタリング前: 約1200行（10フェーズ × 平均120行）
- リファクタリング後: 約600行（BasePhase 20行 + 10フェーズ × 平均58行）
- 削減率: 約50% 以上

---

### AC-2: 既存動作の保持【必須】

**基準**: すべての既存テスト（ユニットテスト、統合テスト）がパスすること。

**検証方法**:
```bash
npm run test:unit
npm run test:integration
```

**期待値**:
- すべてのテストケースが成功（PASSED）
- テスト失敗数: 0

---

### AC-3: 新規テストのカバレッジ【必須】

**基準**: `executePhaseTemplate()` メソッドのテストカバレッジが85%以上であること。

**検証方法**:
```bash
npm run test:coverage
```

**期待値**:
- Statements: 85% 以上
- Branches: 85% 以上
- Functions: 85% 以上
- Lines: 85% 以上

---

### AC-4: 型安全性【必須】

**基準**: TypeScript コンパイラがエラーなくビルドできること。

**検証方法**:
```bash
npm run build
```

**期待値**:
- TypeScript エラー: 0
- ESLint エラー: 0

---

### AC-5: 一貫したエラーハンドリング【推奨】

**基準**: 全フェーズで出力ファイル不在時のエラーメッセージが統一されていること。

**検証方法**:
- 手動テスト: 各フェーズで出力ファイルを削除し、エラーメッセージを確認
- ユニットテスト: `executePhaseTemplate()` の異常系テストケース

**期待値**:
```
{phaseOutputFile} が見つかりません: {outputFilePath}
```

---

### AC-6: ドキュメント更新【推奨】

**基準**: 以下のドキュメントが更新されていること：
- `CLAUDE.md`: `BasePhase` の行数削減を反映
- `ARCHITECTURE.md`: テンプレートメソッドパターンの説明を追加

**検証方法**:
- 手動レビュー: ドキュメントの内容が最新のコードと一致しているか確認

---

## 7. スコープ外

### OS-1: 新規フェーズの追加

本リファクタリングでは、既存10フェーズの簡素化のみを対象とし、新規フェーズの追加は含みません。

---

### OS-2: プロンプトテンプレートの変更

`src/prompts/{phase}/{execute|review|revise}.txt` の内容は変更しません。プロンプト構造は既存のまま維持します。

---

### OS-3: メタデータ構造の変更

`metadata.json` のスキーマは変更しません。既存のメタデータフィールド（`phases`, `design_decisions`, `cost_tracking` 等）はそのまま使用します。

---

### OS-4: エージェントクライアントの変更

`CodexAgentClient` および `ClaudeAgentClient` の実装は変更しません。エージェント実行ロジックは既存のまま維持します。

---

### OS-5: 将来的な拡張候補

以下の機能は本リファクタリングのスコープ外ですが、将来的に検討する価値があります：

- **`reviewPhaseTemplate()` の実装**: `review()` メソッドのテンプレート化（削減効果: 約150行）
- **`revisePhaseTemplate()` の実装**: `revise()` メソッドのテンプレート化（削減効果: 約100行）
- **`verbose` オプション**: エージェント実行時の詳細ログ出力
- **`logDir` オプション**: カスタムログディレクトリの指定

---

## 付録A: 品質ゲート（Phase 1: 要件定義）

本要件定義書は、Planning Document（Phase 0）で定義された以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**
  - FR-1 〜 FR-8 で `executePhaseTemplate()` のシグネチャ、パラメータ、戻り値を明記
  - 各要件に受け入れ基準を定義（Given-When-Then形式）

- ✅ **受け入れ基準が定義されている**
  - AC-1 〜 AC-6 でコード削減量、動作保証、カバレッジ、型安全性を定義
  - すべての基準が検証可能（測定可能）な形で記述

- ✅ **スコープが明確である**
  - FR-1 〜 FR-6 を必須要件、FR-7 〜 FR-8 をオプション要件として優先度を明記
  - スコープ外（新規フェーズ追加、メタデータ変更等）を明示

- ✅ **論理的な矛盾がない**
  - 機能要件と受け入れ基準が対応
  - 非機能要件と制約事項が矛盾していない
  - 特殊ロジック（DesignPhase の設計決定抽出、TestingPhase のファイル更新チェック）の保持を明記

---

## 付録B: 削減予測の詳細

### リファクタリング前（現状）

| フェーズ | execute() 行数 | review() 行数 | revise() 行数 | 合計 |
|---------|---------------|--------------|--------------|------|
| Planning | 30 | 50 | 0 | 80 |
| Requirements | 30 | 50 | 40 | 120 |
| Design | 35 | 50 | 40 | 125 |
| TestScenario | 30 | 50 | 40 | 120 |
| Implementation | 40 | 50 | 40 | 130 |
| TestImplementation | 35 | 50 | 40 | 125 |
| Testing | 40 | 50 | 40 | 130 |
| Documentation | 30 | 50 | 40 | 120 |
| Report | 30 | 50 | 40 | 120 |
| Evaluation | 30 | 50 | 40 | 120 |
| **合計** | **330** | **500** | **360** | **1190** |

### リファクタリング後（予測）

| フェーズ | execute() 行数 | review() 行数 | revise() 行数 | 合計 | 削減量 |
|---------|---------------|--------------|--------------|------|--------|
| BasePhase（新規） | 20 | - | - | 20 | - |
| Planning | 8 | 50 | 0 | 58 | 22行 |
| Requirements | 8 | 50 | 40 | 98 | 22行 |
| Design | 15 | 50 | 40 | 105 | 20行 |
| TestScenario | 8 | 50 | 40 | 98 | 22行 |
| Implementation | 15 | 50 | 40 | 105 | 25行 |
| TestImplementation | 10 | 50 | 40 | 100 | 25行 |
| Testing | 20 | 50 | 40 | 110 | 20行 |
| Documentation | 10 | 50 | 40 | 100 | 20行 |
| Report | 8 | 50 | 40 | 98 | 22行 |
| Evaluation | 8 | 50 | 40 | 98 | 22行 |
| **合計** | **130** | **500** | **360** | **1010** | **200行削減** |

**削減率**: 約16.8%（execute() メソッドのみの削減）

**備考**:
- FR-7（`reviewPhaseTemplate()`）を実装した場合、さらに約150行削減可能（合計350行削減、削減率29.4%）
- FR-8（`revisePhaseTemplate()`）を実装した場合、さらに約100行削減可能（合計450行削減、削減率37.8%）

---

## 付録C: 変数名の標準化

各フェーズで使用される共通変数名を標準化します：

| 変数名 | 用途 | 例 |
|--------|------|-----|
| `planning_document_path` | Planning Document の参照パス | `@.ai-workflow/issue-47/00_planning/output/planning.md` |
| `issue_info` | GitHub Issue 情報 | フォーマット済み Issue 本文 |
| `issue_number` | Issue 番号 | `"47"` |
| `requirements_document_path` | 要件定義書の参照パス | `@.ai-workflow/issue-47/01_requirements/output/requirements.md` |
| `design_document_path` | 設計書の参照パス | `@.ai-workflow/issue-47/02_design/output/design.md` |
| `test_scenario_document_path` | テストシナリオの参照パス | `@.ai-workflow/issue-47/03_test_scenario/output/test-scenario.md` |
| `implementation_document_path` | 実装ログの参照パス | `@.ai-workflow/issue-47/04_implementation/output/implementation.md` |

**注意**: 各フェーズで独自の変数名を使用する場合は、その変数名を `templateVariables` に含める必要があります。

---

## 結論

本要件定義書は、Issue #47「Refactor: Extract duplicated phase template pattern from all phase implementations」の詳細な機能要件、非機能要件、制約事項、受け入れ基準を明確に定義しています。

**主要な要件**:
1. `BasePhase.executePhaseTemplate()` メソッドの実装（FR-1）
2. 全10フェーズの `execute()` メソッドの簡素化（FR-2 〜 FR-6）
3. 特殊ロジックの保持（DesignPhase、ImplementationPhase、TestingPhase）
4. 既存動作の保持（後方互換性、NFR-1）
5. 型安全性の確保（NFR-3）

**期待される効果**:
- コード削減量: 約200行（execute() メソッドのみ）〜 450行（全メソッド）
- 保守性向上: 実行フロー変更時の修正箇所を単一化
- 拡張性向上: 新規フェーズ追加の容易化

この要件定義書は、次フェーズ（Phase 2: 設計）への入力として使用されます。
