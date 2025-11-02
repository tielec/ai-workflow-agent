# 実装ログ - Issue #113: 全フェーズに Evaluation Phase のフォールバック機構を導入する

## 概要

本実装では、Evaluation Phase で実装されたフォールバック機構を6つのフェーズ（Planning, Requirements, Design, TestScenario, Implementation, Report）に導入しました。

**実装戦略**: EXTEND（既存の BasePhase.executePhaseTemplate() を拡張）

## 実装内容

### 1. BasePhase.executePhaseTemplate() の拡張

**ファイル**: `src/phases/base-phase.ts`

**変更内容**:
- `executePhaseTemplate()` メソッドに `enableFallback` オプションを追加
- ファイルが見つからない場合に `handleMissingOutputFile()` を呼び出すロジックを追加

```typescript
protected async executePhaseTemplate<T extends Record<string, string>>(
  phaseOutputFile: string,
  templateVariables: T,
  options?: { maxTurns?: number; verbose?: boolean; logDir?: string; enableFallback?: boolean }
): Promise<PhaseExecutionResult>
```

**実装箇所**: lines 247-301

### 2. BasePhase への3つのフォールバックメソッド追加

**ファイル**: `src/phases/base-phase.ts`

#### 2.1. handleMissingOutputFile()

**目的**: ファイルが見つからない場合のフォールバック処理を統括

**処理フロー**:
1. エージェントログからコンテンツを抽出（extractContentFromLog）
2. 抽出したコンテンツを検証（isValidOutputContent）
3. 有効な場合はファイルに保存
4. 無効な場合は revise() を呼び出し

**実装箇所**: lines 303-356

#### 2.2. extractContentFromLog()

**目的**: エージェントログからフェーズ固有のマークダウンコンテンツを抽出

**抽出パターン**:
```typescript
const patterns: Record<PhaseName, RegExp> = {
  planning: /^#\s+プロジェクト計画書|^#\s+Planning\s+Document/m,
  requirements: /^#\s+要件定義書|^#\s+Requirements\s+Document/m,
  design: /^#\s+設計書|^#\s+Design\s+Document/m,
  test_scenario: /^#\s+テストシナリオ|^#\s+Test\s+Scenario/m,
  implementation: /^#\s+実装ログ|^#\s+Implementation\s+Log/m,
  report: /^#\s+最終レポート|^#\s+Final\s+Report/m,
};
```

**実装箇所**: lines 358-412

#### 2.3. isValidOutputContent()

**目的**: 抽出したコンテンツが有効かどうかを検証

**検証基準**:
- 最小文字数: 100文字以上
- セクション数: 2つ以上の見出し（## または ###）
- オプショナルキーワード検証

**実装箇所**: lines 414-442

### 3. 6つのフェーズの execute() メソッド更新

各フェーズの `executePhaseTemplate()` 呼び出しに `enableFallback: true` オプションを追加しました。

#### 3.1. Planning Phase
**ファイル**: `src/phases/planning.ts`
**変更箇所**: lines 17-23

#### 3.2. Requirements Phase
**ファイル**: `src/phases/requirements.ts`
**変更箇所**: lines 26-32

#### 3.3. Design Phase
**ファイル**: `src/phases/design.ts`
**変更箇所**: lines 34-42

#### 3.4. TestScenario Phase
**ファイル**: `src/phases/test-scenario.ts`
**変更箇所**: lines 45-55

#### 3.5. Implementation Phase
**ファイル**: `src/phases/implementation.ts`
**変更箇所**: lines 43-53

#### 3.6. Report Phase
**ファイル**: `src/phases/report.ts`
**変更箇所**: lines 107-120

### 4. 6つのフェーズの revise() メソッド更新

各フェーズの `revise()` メソッドに `previous_log_snippet` 変数の注入ロジックを追加しました。

**共通パターン**:
```typescript
// Issue #113: 前回のログスニペットを取得
const agentLogPath = path.join(this.executeDir, 'agent_log.md');
let previousLogSnippet = '';
if (fs.existsSync(agentLogPath)) {
  const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
  previousLogSnippet = agentLog.substring(0, 2000);  // 最初の2000文字
}

const revisePrompt = this.loadPrompt('revise')
  // ... 他の変数置換
  .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）');  // Issue #113

logger.info(`Phase ${this.phaseName}: Starting revise with previous log snippet`);
```

#### 4.1. Planning Phase
**ファイル**: `src/phases/planning.ts`
**変更箇所**: lines 84-120
**Note**: Planning Phase には元々 revise() メソッドがなかったため、完全な実装を追加

#### 4.2. Requirements Phase
**ファイル**: `src/phases/requirements.ts`
**変更箇所**: lines 106-120

#### 4.3. Design Phase
**ファイル**: `src/phases/design.ts`
**変更箇所**: lines 156-173

#### 4.4. TestScenario Phase
**ファイル**: `src/phases/test-scenario.ts`
**変更箇所**: lines 171-189

#### 4.5. Implementation Phase
**ファイル**: `src/phases/implementation.ts`
**変更箇所**: lines 175-193

#### 4.6. Report Phase
**ファイル**: `src/phases/report.ts`
**変更箇所**: lines 178-191

### 5. 6つのフェーズの revise.txt プロンプト更新

各フェーズの revise.txt プロンプトファイルに以下を追加しました：

1. **⚠️ 最重要：必須アクション** セクション
   - ファイル保存パスの明記
   - フェーズ失敗の警告

2. **前回の実行ログ（参考）** セクション
   - `{previous_log_snippet}` 変数の説明

3. **修正指示** セクションの再構成
   - **ケース A: ファイル未作成の場合** - フォールバックシナリオ
   - **ケース B: レビューフィードバックに基づく修正の場合** - 通常シナリオ

#### 5.1. Planning Phase
**ファイル**: `src/prompts/planning/revise.txt`
**変更内容**:
- ⚠️ 最重要セクション（lines 3-12）
- 前回ログセクション（lines 31-37）
- ケース A/B 分岐（lines 43-75）

#### 5.2. Requirements Phase
**ファイル**: `src/prompts/requirements/revise.txt`
**変更内容**:
- ⚠️ 最重要セクション（lines 3-12）
- 前回ログセクション（lines 31-37）
- ケース A/B 分岐（lines 41-62）

#### 5.3. Design Phase
**ファイル**: `src/prompts/design/revise.txt`
**変更内容**:
- ⚠️ 最重要セクション（lines 3-12）
- 前回ログセクション（lines 24-30）
- ケース A/B 分岐（lines 42-75）

#### 5.4. TestScenario Phase
**ファイル**: `src/prompts/test_scenario/revise.txt`
**変更内容**:
- ⚠️ 最重要セクション（lines 3-12）
- 前回ログセクション（lines 24-30）
- ケース A/B 分岐（lines 45-77）

#### 5.5. Implementation Phase
**ファイル**: `src/prompts/implementation/revise.txt`
**変更内容**:
- ⚠️ 最重要セクション（lines 3-12）
- 前回ログセクション（lines 21-27）
- ケース A/B 分岐（lines 45-77）

#### 5.6. Report Phase
**ファイル**: `src/prompts/report/revise.txt`
**変更内容**:
- ⚠️ 最重要セクション（lines 3-12）
- 前回ログセクション（lines 22-28）
- ケース A/B 分岐（lines 45-80）

## 技術的な設計判断

### 判断1: executePhaseTemplate() の拡張アプローチ

**決定**: 新しいメソッドを作成せず、既存の `executePhaseTemplate()` を拡張

**理由**:
- DRY原則に従い、コードの重複を避ける
- 既存の Phase 実装への変更を最小限に抑える
- オプショナルパラメータにより後方互換性を維持

### 判断2: フォールバック処理の2段階アプローチ

**決定**:
1. ログから抽出を試みる
2. 失敗した場合のみ revise() を呼び出す

**理由**:
- ログ抽出は高速で追加のAPI呼び出しが不要
- revise() 呼び出しはコストが高いため、最終手段として使用
- Evaluation Phase の実装パターンを踏襲

### 判断3: previous_log_snippet のサイズ制限

**決定**: 最初の2000文字のみを revise() プロンプトに渡す

**理由**:
- プロンプトサイズの制約を考慮
- 通常、重要な情報はログの先頭に記載される
- Evaluation Phase の実装と一貫性を保つ

### 判断4: フェーズ固有の正規表現パターン

**決定**: 各フェーズに固有のヘッダーパターンを定義

**理由**:
- 各フェーズの出力フォーマットが異なる
- 日本語と英語の両方のヘッダーに対応
- より正確なコンテンツ抽出を実現

## 影響範囲

### 変更されたファイル

**コアファイル**:
1. `src/phases/base-phase.ts` - フォールバック機構の中核実装
2. `src/phases/planning.ts` - revise() メソッド追加 + enableFallback追加
3. `src/phases/requirements.ts` - revise() 更新 + enableFallback追加
4. `src/phases/design.ts` - revise() 更新 + enableFallback追加
5. `src/phases/test-scenario.ts` - revise() 更新 + enableFallback追加
6. `src/phases/implementation.ts` - revise() 更新 + enableFallback追加
7. `src/phases/report.ts` - revise() 更新 + enableFallback追加

**プロンプトファイル**:
8. `src/prompts/planning/revise.txt`
9. `src/prompts/requirements/revise.txt`
10. `src/prompts/design/revise.txt`
11. `src/prompts/test_scenario/revise.txt`
12. `src/prompts/implementation/revise.txt`
13. `src/prompts/report/revise.txt`

### 影響を受けないファイル

- テストファイル（Issue #113 の要件により、テストコードは実装しない）
- 他のフェーズ（evaluation, testing, documentation, test_implementation）
- GitManager, GitHub, ContentParser などのユーティリティクラス

## 品質保証

### コーディング規約準拠

✅ **CLAUDE.md 準拠**:
- TypeScript の型安全性を維持
- エラーハンドリングに `getErrorMessage()` ユーティリティを使用
- logger を使用したログ記録
- 既存のコーディングスタイルに従う

✅ **DRY原則**:
- フォールバックロジックを BasePhase に集約
- 各フェーズは executePhaseTemplate() を呼び出すだけ
- 共通のログスニペット抽出パターン

✅ **型安全性**:
- すべての新規メソッドに適切な型定義
- PhaseName 型を使用してフェーズ名を制限

### エラーハンドリング

- ファイルが存在しない場合の適切な処理
- ログ抽出失敗時の revise() へのフォールバック
- 各段階での詳細なログ記録

## テスト戦略

**Note**: Issue #113 の要件により、本実装ではテストコードを実装していません。

**推奨されるテスト（将来的に実装すべき）**:
1. BasePhase.handleMissingOutputFile() のユニットテスト
2. BasePhase.extractContentFromLog() のパターンマッチングテスト
3. BasePhase.isValidOutputContent() のバリデーションテスト
4. 各フェーズの enableFallback オプションの統合テスト
5. previous_log_snippet 注入の統合テスト

## 残課題・制限事項

1. **テストコード未実装**
   - Issue #113 の要件により、テストコードは実装していない
   - 将来的にテストコードの追加を推奨

2. **dist/ フォルダの同期**
   - src/ フォルダのプロンプトファイルを更新したが、dist/ フォルダは未更新
   - ビルドプロセスで自動的に同期される想定

3. **他のフェーズへの展開検討**
   - evaluation, testing, documentation, test_implementation フェーズも同様の機構が必要かもしれない
   - 現在は Issue #113 のスコープ外

## まとめ

本実装により、Planning, Requirements, Design, TestScenario, Implementation, Report の6つのフェーズに Evaluation Phase と同等のフォールバック機構が導入されました。これにより、エージェントがファイル作成に失敗した場合でも、ログからの抽出または revise() 呼び出しによる再試行が可能になり、ワークフローの堅牢性が向上しました。

**実装完了**: 2024年（実装日）
**Issue**: #113
**実装者**: Claude (AI Assistant)
