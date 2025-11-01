# 詳細設計書 - Issue #108

## 0. Planning Document の確認

Planning Phase (Phase 0) で策定された開発計画を確認しました。主要な戦略は以下の通りです：

### 開発計画の全体像
- **複雑度**: 簡単（既存コードの軽微な修正のみ）
- **見積もり工数**: 2~3時間
- **実装戦略**: EXTEND（既存ファイルの拡張）
- **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルの修正のみ）

### 主要な技術的決定事項
1. **テスト期待値修正**: Issue #104 の Evaluation Report で特定された 4 つのテストケース期待値を修正
2. **trim() 実装**: オプショナル。Phase 2 のトレードオフ分析に基づいて実装の有無を判断
3. **Phase 9 プロンプト改善**: 調査のみ実施。実装は別 Issue (#109) として分離

### 主なリスク
- テスト期待値修正の判断ミス（軽減策: 設計書の再確認、各テストケースの Given-When-Then 再検証）
- trim() 実装による予期しない影響（軽減策: 影響範囲徹底分析、全テストスイート実行）
- Phase 9 プロンプト改善の調査不足（軽減策: プロンプトレビュー、TODO コメント確認）
- Issue #104 の Evaluation Report 更新漏れ（軽減策: Phase 7 でチェックリスト化）

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                     Issue #108 - 残タスク修正                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Task 1: テスト期待値修正（優先度: 中）                  │   │
│  │  ・tests/unit/github/issue-client-followup.test.ts      │   │
│  │  ・4つのテストケースの期待値を修正                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Task 2: trim() 実装の検討（優先度: 低、オプショナル）   │   │
│  │  ・src/core/github/issue-client.ts                      │   │
│  │  ・extractKeywords() メソッドに trim() 追加検討         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Task 3: Phase 9 プロンプト改善調査（優先度: 低）       │   │
│  │  ・src/prompts/evaluation/execute.txt                   │   │
│  │  ・src/phases/evaluation.ts (TODO コメント確認)         │   │
│  │  ・blockerStatus/deferredReason 抽出可能性調査          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Task 4: Issue #104 Evaluation Report 更新             │   │
│  │  ・.ai-workflow/issue-104/09_evaluation/...             │   │
│  │      output/evaluation_report.md                        │   │
│  │  ・残タスクステータスの更新                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 データフロー

```
[Phase 1: Requirements]
       │
       ├─► Issue #104 Evaluation Report 分析
       │   ・残タスク3件の詳細把握
       │   ・修正箇所の特定
       │
       └─► 機能要件定義
           ・FR-1: テスト期待値修正
           ・FR-2: trim() 実装検討
           ・FR-3: Phase 9 プロンプト改善調査

[Phase 2: Design] ← 本フェーズ
       │
       ├─► Task 1 詳細設計
       │   ・Test case 2.1.1: 20文字切り詰め期待値
       │   ・Test case 2.1.3: 20文字制限 or データ短縮
       │   ・Test case 2.1.4: trim() 実装 or 期待値修正
       │   ・Test case 2.2.4: 80文字以上タイトル生成保証
       │
       ├─► Task 2 トレードオフ分析
       │   ・実装追加 vs. テスト期待値修正
       │   ・既存27テストケースへの影響分析
       │   ・推奨アプローチの決定
       │
       └─► Task 3 調査計画
           ・プロンプトレビュー範囲
           ・TODO コメント確認箇所
           ・実現可能性評価基準

[Phase 4: Implementation]
       │
       ├─► Task 1 実施
       │   ・テスト期待値修正
       │
       ├─► Task 2 実施（オプショナル）
       │   ・trim() 実装（Phase 2の判断に基づく）
       │
       └─► Task 3 実施
           ・Phase 9 プロンプトレビュー
           ・抽出ロジック実現可能性調査

[Phase 7: Documentation]
       │
       └─► Task 4 実施
           ・Issue #104 Evaluation Report 更新
           ・完了タスクのチェックマーク
```

### 1.3 コンポーネント間の関係

```
┌─────────────────────────────────────────────────────────────┐
│                   Test Layer                                │
│       tests/unit/github/issue-client-followup.test.ts       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Test case 2.1.1: extractKeywords (line ~59)        │  │
│  │  ・期待値: 20文字切り詰め後のキーワード             │  │
│  │  ・修正: 元のフルテキストから20文字版へ             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Test case 2.1.3: English parentheses (line ~99)    │  │
│  │  ・期待値: "Fix Jest configurati" (20文字)          │  │
│  │  ・修正: テストデータ短縮 OR 期待値を20文字版へ     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Test case 2.1.4: 20-char truncation (line ~116)    │  │
│  │  ・期待値: 20文字（末尾空白含む可能性）             │  │
│  │  ・修正: trim() 実装 OR 期待値に空白含める          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Test case 2.2.4: 80-char limit (line ~262)         │  │
│  │  ・期待値: 80文字タイトル + "..." 確認              │  │
│  │  ・修正: テストデータを長くして80文字超えを保証     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ テスト対象
                            │
┌─────────────────────────────────────────────────────────────┐
│                 Implementation Layer                        │
│            src/core/github/issue-client.ts                  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  extractKeywords() (line 182-206)                    │  │
│  │  ・keyword.substring(0, 20) で切り詰め               │  │
│  │  ・オプション: .trim() 追加検討                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  generateFollowUpTitle() (line 215-234)              │  │
│  │  ・80文字制限でタイトル生成                          │  │
│  │  ・影響: テスト期待値の正確性が重要                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ 情報源
                            │
┌─────────────────────────────────────────────────────────────┐
│                 Documentation Layer                         │
│   .ai-workflow/issue-104/09_evaluation/output/              │
│                evaluation_report.md                         │
│                                                             │
│  ・Test case 2.1.1 (line 193-210): 詳細な修正箇所特定    │  │
│  ・Test case 2.1.3: 期待値不一致の原因分析                │  │
│  ・Test case 2.1.4: trim() 実装オプションの提案           │  │
│  ・Test case 2.2.4: テストデータ不足の指摘                │  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- **既存コードの軽微な修正のみ**: 新規ファイル作成なし、既存テストファイルとIssue #104 Evaluation Reportの修正のみ
- **修正対象**:
  1. 既存テストファイル (`tests/unit/github/issue-client-followup.test.ts`) の期待値修正（4行）
  2. 既存実装ファイル (`src/core/github/issue-client.ts`) へのオプショナルな trim() 追加（1行、検討中）
  3. Issue #104 Evaluation Report の更新（ドキュメント）
- **アーキテクチャ変更なし**: 型定義変更なし、インターフェース変更なし
- **後方互換性維持**: 既存のテストケース（27ケース中23ケースは既にPASS）には影響なし

**CREATE/REFACTOR でない理由**:
- CREATE: 新規ファイル・クラス作成がないため不適切
- REFACTOR: 構造改善ではなく、既存実装の微調整とテスト期待値修正のため不適切

---

## 3. テスト戦略判断

### テスト戦略: UNIT_ONLY

**判断根拠**:
- **ユニットテストのみで十分**: 変更範囲が非常に小さく（テスト期待値修正4行、trim()実装1行）、単一モジュール内で完結
- **既存ユニットテストの修正**: `extractKeywords()` と `generateFollowUpTitle()` のテスト期待値修正のみ
- **外部システム連携なし**: GitHub API 呼び出しロジックは変更なし（既存の Integration テストで担保済み）
- **BDD 不要**: エンドユーザー向け機能変更なし（内部のテスト期待値修正のみ）

**他のテスト戦略が不適切な理由**:
- INTEGRATION_ONLY: 外部システム連携の変更がないため不要
- BDD_ONLY: ユーザーストーリー変更がないため不要
- UNIT_INTEGRATION: Integration テストは Issue #104 で既に実装済み（27ケース中23ケースがPASS）
- ALL: 変更範囲が小さく、過剰なテスト

---

## 4. テストコード戦略判断

### テストコード戦略: EXTEND_TEST

**判断根拠**:
- **既存テストファイルの修正のみ**: `tests/unit/github/issue-client-followup.test.ts` の期待値修正（4行）
- **新規テストケース追加なし**: 既存テストケース（27ケース）の期待値を修正するだけ
- **テストシナリオ変更なし**: Phase 3 で定義された 27 テストケースは変更なし

**CREATE_TEST/BOTH_TEST でない理由**:
- CREATE_TEST: 新規テストファイル作成がないため不適切
- BOTH_TEST: 新規テストケース追加がないため不適切

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

**影響範囲**: 非常に小さい（2ファイルのみ、ドキュメント1ファイル）

**変更が必要なファイル**:

1. **`tests/unit/github/issue-client-followup.test.ts`** (必須):
   - **4つのテストケースの期待値修正**
   - 行数: 4行の期待値変更（580行中、約0.7%）
   - 影響: テスト期待値のみ、実装コードへの影響なし
   - 具体的な修正箇所:
     - Test case 2.1.1 (line 68-72): `extractKeywords()` の期待値を20文字切り詰め版に修正
     - Test case 2.1.3 (line 106): 期待値を "Fix Jest configurati" (20文字) に修正
     - Test case 2.1.4 (line 123): 期待値を20文字（末尾空白含む）に修正 OR trim()実装を選択
     - Test case 2.2.4 (line 262-273): テストデータを長くして80文字超えを保証

2. **`src/core/github/issue-client.ts`** (オプショナル):
   - **`extractKeywords()` メソッドに `.trim()` 追加**
   - 行数: 1行の変更（385行中、約0.3%）
   - 影響: キーワード末尾の空白除去のみ、既存動作への影響はほぼなし
   - 具体的な修正箇所:
     - Line 197: `keyword = keyword.substring(0, 20);` を `keyword = keyword.substring(0, 20).trim();` に変更

3. **`.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md`** (必須):
   - **残タスクステータス更新**
   - 行数: 3タスク（lines 347-366）のチェックマーク更新
   - 影響: ドキュメント更新のみ、コードへの影響なし

**影響を受けないファイル**:
- `src/types.ts`: 型定義変更なし
- `src/core/github-client.ts`: ファサードクラス変更なし
- `src/phases/evaluation.ts`: Evaluation Phase ロジック変更なし（プロンプト改善は別 Issue で検討）
- 他のテストファイル: issue-client-followup.test.ts 以外は影響なし

### 5.2 依存関係の変更

**依存関係変更**: なし

**理由**:
- 新規パッケージ追加なし
- 既存パッケージのバージョン変更なし
- `package.json` 変更なし
- `tsconfig.json` 変更なし

### 5.3 マイグレーション要否

**マイグレーション**: 不要

**理由**:
- データベーススキーマ変更なし
- 設定ファイル変更なし
- 環境変数追加なし
- `metadata.json` 構造変更なし

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

なし（すべて既存ファイルへの修正）

### 6.2 修正が必要な既存ファイル

1. **`tests/unit/github/issue-client-followup.test.ts`** (必須)
   - Test case 2.1.1 (line 68-72): 期待値修正
   - Test case 2.1.3 (line 106): 期待値修正 OR テストデータ短縮
   - Test case 2.1.4 (line 123): 期待値修正 OR trim() 実装
   - Test case 2.2.4 (line 262-273): テストデータ修正

2. **`src/core/github/issue-client.ts`** (オプショナル、Phase 2 の判断に基づく)
   - Line 197: `extractKeywords()` メソッドに `.trim()` 追加

3. **`.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md`** (必須)
   - Lines 347-366: 残タスク3件のチェックマーク更新

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 Task 1: テスト期待値修正（優先度: 中）

#### 7.1.1 Test case 2.1.1: extractKeywords() - 20文字切り詰め対応

**現在の状態**:
```typescript
// tests/unit/github/issue-client-followup.test.ts (lines 59-73)
it('should extract keywords from 3 tasks', () => {
  const tasks: RemainingTask[] = [
    { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
    { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
    { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 3);

  expect(keywords).toEqual([
    'Coverage improvement to 90%',    // ❌ 実際: 'Coverage improvement' (20文字)
    'Performance benchmark execution', // ❌ 実際: 'Performance benchmar' (20文字)
    'Documentation updates',           // ✅ 20文字以内なのでOK
  ]);
});
```

**Issue #104 Evaluation Report の指摘** (line 194-196):
> Test expects full keywords, but implementation correctly truncates to 20 chars

**修正方針**:
1. **オプション A（推奨）**: テスト期待値を20文字切り詰め版に修正
2. オプション B: テストデータを20文字以内に短縮

**修正後（オプション A）**:
```typescript
it('should extract keywords from 3 tasks', () => {
  const tasks: RemainingTask[] = [
    { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
    { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
    { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 3);

  expect(keywords).toEqual([
    'Coverage improvement',    // ✅ 20文字に切り詰め
    'Performance benchmar',    // ✅ 20文字に切り詰め (末尾 'k' が欠ける)
    'Documentation updat',     // ✅ 20文字に切り詰め (元は21文字)
  ]);
});
```

**設計判断**:
- **オプション A を推奨**: 実装コードは設計仕様（20文字制限）に正しく準拠しているため、テスト期待値を修正する
- **実装コード変更不要**: `extractKeywords()` の実装は正しいため、修正なし

#### 7.1.2 Test case 2.1.3: 英語括弧前まで抽出 - 20文字制限対応

**現在の状態**:
```typescript
// tests/unit/github/issue-client-followup.test.ts (lines 99-107)
it('should extract keywords before English parentheses', () => {
  const tasks: RemainingTask[] = [
    { task: 'Fix Jest configuration (src/jest.config.js)', phase: 'implementation', priority: 'High' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 1);

  expect(keywords).toEqual(['Fix Jest configuration']); // ❌ 実際: 'Fix Jest configurati' (20文字)
});
```

**Issue #104 Evaluation Report の指摘** (line 199-200):
> Test expects "Fix Jest configuration" but implementation returns "Fix Jest configurati" (20 chars)

**修正方針**:
1. **オプション A（推奨）**: テスト期待値を20文字版に修正
2. オプション B: テストデータを短縮（例: "Fix Jest config (src/jest.config.js)"）

**修正後（オプション A）**:
```typescript
it('should extract keywords before English parentheses', () => {
  const tasks: RemainingTask[] = [
    { task: 'Fix Jest configuration (src/jest.config.js)', phase: 'implementation', priority: 'High' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 1);

  expect(keywords).toEqual(['Fix Jest configurati']); // ✅ 20文字に切り詰め
});
```

**修正後（オプション B、代替案）**:
```typescript
it('should extract keywords before English parentheses', () => {
  const tasks: RemainingTask[] = [
    { task: 'Fix Jest config (src/jest.config.js)', phase: 'implementation', priority: 'High' }, // データ短縮
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 1);

  expect(keywords).toEqual(['Fix Jest config']); // ✅ 括弧前 & 20文字以内
});
```

**設計判断**:
- **オプション A を推奨**: 実装コードは正しいため、テスト期待値を修正する（実装と設計の整合性維持）
- **オプション B も許容可**: テストケースの意図（括弧前まで抽出）を明確にしたい場合は有効

#### 7.1.3 Test case 2.1.4: 20文字切り詰め - 末尾空白問題

**現在の状態**:
```typescript
// tests/unit/github/issue-client-followup.test.ts (lines 116-125)
it('should truncate keywords to 20 characters', () => {
  const tasks: RemainingTask[] = [
    { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 1);

  expect(keywords[0]).toBe('This is a very long'); // ❌ 実際: 'This is a very long ' (末尾空白あり、20文字)
  expect(keywords[0].length).toBe(20);            // ✅ 長さは20文字で正しい
});
```

**Issue #104 Evaluation Report の指摘** (line 202-204):
> Test expects "This is a very long" (19 chars) but implementation returns "This is a very long " (20 chars with trailing space)

**修正方針**:
1. **オプション A**: テスト期待値に末尾空白を含める
2. **オプション B（推奨）**: 実装に `.trim()` を追加（Task 2 で検討）

**修正後（オプション A）**:
```typescript
it('should truncate keywords to 20 characters', () => {
  const tasks: RemainingTask[] = [
    { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 1);

  expect(keywords[0]).toBe('This is a very long '); // ✅ 末尾空白を含めて20文字
  expect(keywords[0].length).toBe(20);              // ✅ 長さは20文字
});
```

**修正後（オプション B、Task 2 で trim() 実装する場合）**:
```typescript
// src/core/github/issue-client.ts (line 197)
// 修正前
if (keyword.length > 20) {
  keyword = keyword.substring(0, 20);
}

// 修正後
if (keyword.length > 20) {
  keyword = keyword.substring(0, 20).trim(); // ✅ trim() 追加
}

// テスト期待値（trim()実装後）
it('should truncate keywords to 20 characters', () => {
  const tasks: RemainingTask[] = [
    { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
  ];

  const keywords = (issueClient as any).extractKeywords(tasks, 1);

  expect(keywords[0]).toBe('This is a very long'); // ✅ trim() により末尾空白除去
  expect(keywords[0].length).toBe(19);            // ✅ 長さは19文字（trim後）
});
```

**設計判断**:
- **オプション B を推奨**: trim() 実装により、より直感的なキーワード抽出が可能（Task 2 のトレードオフ分析で最終決定）
- **オプション A も許容可**: trim() 実装による既存テストへの影響を避けたい場合

#### 7.1.4 Test case 2.2.4: 80文字タイトル切り詰め - テストデータ不足

**現在の状態**:
```typescript
// tests/unit/github/issue-client-followup.test.ts (lines 262-273)
it('should truncate title to 80 characters with ellipsis', () => {
  const tasks: RemainingTask[] = [
    { task: 'Very long task description number one', phase: 'implementation', priority: 'High' },
    { task: 'Very long task description number two', phase: 'implementation', priority: 'High' },
    { task: 'Very long task description number three', phase: 'implementation', priority: 'High' },
  ];

  const title = (issueClient as any).generateFollowUpTitle(123, tasks);

  expect(title.length).toBe(80);         // ❌ 実際: 76文字（80文字に達していない）
  expect(title.endsWith('...')).toBe(true); // ❌ 切り詰めが発生していない
});
```

**Issue #104 Evaluation Report の指摘** (line 206-208):
> Test data may not actually generate 80+ char title

**修正方針**:
1. **テストデータを長くする**: キーワードを長くして確実に80文字超えを保証
2. タイトル生成ロジック確認: `[FOLLOW-UP] #123: キーワード1・キーワード2・キーワード3`

**タイトル長の計算**:
```
Prefix: "[FOLLOW-UP] #123: " = 18文字
Keywords: keyword1 + "・" + keyword2 + "・" + keyword3
80文字超えを保証するには: keyword1 + keyword2 + keyword3 + 2個の中黒 > 62文字
```

**修正後**:
```typescript
it('should truncate title to 80 characters with ellipsis', () => {
  const tasks: RemainingTask[] = [
    // 各キーワード20文字 × 3 = 60文字 + 中黒2個 = 62文字 → 合計80文字
    { task: 'Implement a complex feature with many sub-tasks', phase: 'implementation', priority: 'High' }, // → "Implement a complex " (20文字)
    { task: 'Add comprehensive unit tests for all edge cases', phase: 'testing', priority: 'High' },       // → "Add comprehensive u" (20文字)
    { task: 'Update documentation and user guides thoroughly', phase: 'documentation', priority: 'High' }, // → "Update documentatio" (20文字)
  ];

  const title = (issueClient as any).generateFollowUpTitle(123, tasks);

  // [FOLLOW-UP] #123: Implement a complex ・Add comprehensive u・Update documentatio
  // = 18 + 20 + 1 + 20 + 1 + 20 = 80文字
  expect(title.length).toBe(80);               // ✅ 80文字に達する
  expect(title).toEndWith('...');              // ❌ 80文字ちょうどなので "..." なし
});
```

**さらに修正（80文字超えを保証）**:
```typescript
it('should truncate title to 80 characters with ellipsis', () => {
  const tasks: RemainingTask[] = [
    // より長いタスクテキストを使用
    { task: 'Implement comprehensive authentication and authorization system with OAuth2 support', phase: 'implementation', priority: 'High' }, // → "Implement comprehens" (20文字)
    { task: 'Add extensive unit tests and integration tests for all critical paths and edge cases', phase: 'testing', priority: 'High' },      // → "Add extensive unit t" (20文字)
    { task: 'Update all documentation including API references user guides and troubleshooting sections', phase: 'documentation', priority: 'High' }, // → "Update all documenta" (20文字)
  ];

  const title = (issueClient as any).generateFollowUpTitle(123, tasks);

  // [FOLLOW-UP] #123: Implement comprehens・Add extensive unit t・Update all documenta
  // = 18 + 20 + 1 + 20 + 1 + 20 = 80文字
  // BUT タイトル生成ロジックが80文字超えを検出するには、さらに長いキーワードが必要
  expect(title.length).toBe(80);         // ✅ 80文字に切り詰められる
  expect(title).toEndWith('...');        // ✅ "..." が追加される
});
```

**最終的な修正（確実に80文字超え）**:
```typescript
it('should truncate title to 80 characters with ellipsis', () => {
  const tasks: RemainingTask[] = [
    // Issue番号を大きくする（例: 12345 = 5桁）、またはキーワードを長くする
    { task: 'Implement a comprehensive authentication and authorization system', phase: 'implementation', priority: 'High' },
    { task: 'Add extensive unit and integration tests for all paths', phase: 'testing', priority: 'High' },
    { task: 'Update all documentation and user guides thoroughly', phase: 'documentation', priority: 'High' },
  ];

  // Issue番号を12345（5桁）にして、タイトルを長くする
  const title = (issueClient as any).generateFollowUpTitle(12345, tasks);

  // [FOLLOW-UP] #12345: Implement a comprehe・Add extensive unit ・Update all documenta
  // = 20 + 20 + 1 + 20 + 1 + 20 = 82文字 → 77文字 + "..." = 80文字
  expect(title.length).toBe(80);         // ✅ 80文字に切り詰められる
  expect(title).toEndWith('...');        // ✅ "..." が追加される
});
```

**設計判断**:
- **テストデータを確実に80文字超えにする**: Issue番号を大きくする（例: 12345）、またはキーワードを長くする
- **タイトル生成ロジックの確認**: `[FOLLOW-UP] #{issueNumber}: keyword1・keyword2・keyword3` の合計文字数が80文字を超えることを保証

---

### 7.2 Task 2: trim() 実装の検討（優先度: 低、オプショナル）

#### 7.2.1 トレードオフ分析

**オプション A: trim() 実装を追加**

**メリット**:
- キーワード末尾の空白を自動的に除去し、より直感的な結果を提供
- Test case 2.1.4 の期待値修正が不要（実装側で解決）
- 将来的に同様の問題が発生しにくい

**デメリット**:
- 既存の27テストケース中、Test case 2.1.4 以外に影響がないか確認が必要
- 実装変更により、予期しない副作用の可能性（低リスクだが0ではない）

**影響範囲**:
- `src/core/github/issue-client.ts` (line 197): 1行の変更
- `tests/unit/github/issue-client-followup.test.ts` (line 123): 期待値を19文字（trim後）に修正

**実装例**:
```typescript
// src/core/github/issue-client.ts (line 197)
// 修正前
if (keyword.length > 20) {
  keyword = keyword.substring(0, 20);
}

// 修正後
if (keyword.length > 20) {
  keyword = keyword.substring(0, 20).trim(); // ✅ trim() 追加
}
```

---

**オプション B: テスト期待値修正のみ**

**メリット**:
- 実装コード変更なし、リスク最小
- 既存の27テストケースへの影響なし
- 実装は設計仕様（20文字制限）に正しく準拠している

**デメリット**:
- Test case 2.1.4 の期待値に末尾空白を含める必要がある（直感的ではない）
- 将来的に同様の問題が発生する可能性

**影響範囲**:
- `tests/unit/github/issue-client-followup.test.ts` (line 123): 期待値を20文字（末尾空白含む）に修正

**修正例**:
```typescript
// tests/unit/github/issue-client-followup.test.ts (line 123)
expect(keywords[0]).toBe('This is a very long '); // ✅ 末尾空白を含めて20文字
expect(keywords[0].length).toBe(20);              // ✅ 長さは20文字
```

---

#### 7.2.2 推奨アプローチ

**推奨: オプション B（テスト期待値修正のみ）**

**理由**:
1. **リスク最小**: 実装コード変更がないため、既存の27テストケースへの影響なし
2. **実装は正しい**: `extractKeywords()` は設計仕様（20文字制限）に正しく準拠しているため、修正不要
3. **トレードオフ**: 末尾空白は cosmetic な問題であり、機能的な影響はない
4. **将来的な改善**: trim() 実装が必要と判断された場合、別途 Issue として提案可能

**ただし、オプション A も許容可**: 実装者の判断により、trim() 実装を追加しても問題なし（リスクは低い）

---

### 7.3 Task 3: Phase 9 プロンプト改善の調査（優先度: 低）

#### 7.3.1 調査範囲

**対象ファイル**:
1. `src/prompts/evaluation/execute.txt`: Evaluation Phase の実行プロンプト
2. `src/phases/evaluation.ts` (lines 447-452): TODO コメント確認

**調査内容**:
1. **現在のプロンプト構造の理解**:
   - Evaluation レポートに `blockerStatus` と `deferredReason` が含まれているか
   - 含まれていない場合、プロンプトで要求する必要があるか

2. **TODO コメントの確認** (`src/phases/evaluation.ts` lines 447-452):
```typescript
// TODO: 将来的には Evaluation レポートから抽出する（Phase 9 改善、別 Issue として提案）
const blockerStatus = 'すべてのブロッカーは解決済み';

// TODO: 将来的には Evaluation レポートから抽出する（Phase 9 改善、別 Issue として提案）
const deferredReason = 'タスク優先度の判断により後回し';
```

3. **抽出ロジックの実現可能性評価**:
   - Evaluation レポートからテキスト抽出する方法（正規表現、LLM、手動パース）
   - 抽出に失敗した場合のフォールバック処理

#### 7.3.2 調査手順

**Step 1: Evaluation Phase プロンプトのレビュー**
```bash
# プロンプトファイルを確認
cat src/prompts/evaluation/execute.txt

# 確認ポイント:
# - "ブロッカーのステータス" を出力するように指示されているか
# - "タスクが残った理由" を出力するように指示されているか
```

**Step 2: Evaluation レポートのサンプル確認**
```bash
# Issue #104 の Evaluation レポートを確認
cat .ai-workflow/issue-104/09_evaluation/output/evaluation_report.md

# 確認ポイント:
# - "Blocker Status" または類似のセクションが存在するか
# - "Deferred Reason" または類似のセクションが存在するか
# - 抽出可能なフォーマットで記述されているか
```

**Step 3: 抽出ロジックの実現可能性評価**

**評価基準**:
- **実現可能**: Evaluation レポートに明確なセクション（例: "## Blocker Status"）が存在し、正規表現で抽出可能
- **要改善**: セクションが存在するが、フォーマットが不統一で抽出困難（プロンプト改善が必要）
- **不可能**: セクションが存在せず、プロンプト改善なしでは抽出不可

**調査結果の記録**:
```markdown
### Phase 9 プロンプト改善の調査結果

**調査日時**: 2025-01-30

**結果**:
- Evaluation Phase プロンプト: [具体的な内容]
- Evaluation レポートのサンプル: [具体的な内容]
- 抽出可能性評価: [実現可能 | 要改善 | 不可能]

**推奨アクション**:
- [プロンプト改善の具体的な内容]
- [抽出ロジックの実装方法]
- [フォールバック処理の設計]

**Issue #109 作成の要否**: [必要 | 不要]
```

#### 7.3.3 Issue #109 作成のための情報収集

**Issue #109 に含めるべき情報**:
1. **背景**: Issue #104 の TODO コメント（lines 447-452）で指摘された改善点
2. **目的**: フォローアップ Issue の背景情報を充実させる
3. **技術的アプローチ**:
   - Evaluation Phase プロンプトの改善案
   - 抽出ロジックの実装方法
   - フォールバック処理の設計
4. **見積もり**: 2~4時間（Planning Document の見積もり）
5. **優先度**: 低（Issue #108 完了後に検討）

---

### 7.4 Task 4: Issue #104 Evaluation Report の更新

#### 7.4.1 更新箇所

**対象ファイル**: `.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md`

**更新対象セクション**: "Remaining Tasks" (lines 347-366)

**更新内容**:
- 完了したタスクにチェックマーク（`- [x]`）を追加
- 完了日時を記録

**修正前** (lines 347-366):
```markdown
### Remaining Tasks

The following tasks can be addressed in follow-up work and are not blocking merge:

- [ ] **Fix 4 test expectation mismatches** (優先度: 中, 見積もり: 15-30分)
  - Update test case 2.1.1 to expect 20-char truncated keywords
  - Update test case 2.1.3 to expect "Fix Jest configurati" or shorten test data
  - Update test case 2.1.4 to expect trailing space or add trim() in implementation
  - Update test case 2.2.4 to use longer test data ensuring 80+ char title generation
  - **Phase**: 5 (Test Implementation)
  - **Files**: `tests/unit/github/issue-client-followup.test.ts`

- [ ] **Phase 9 (Evaluation) prompt improvement to include context information** (優先度: 低, 見積もり: 2-4時間)
  - Modify Evaluation Phase to extract `blockerStatus` from evaluation reports
  - Modify Evaluation Phase to extract `deferredReason` from evaluation reports
  - Update prompts to ensure information is included in reports
  - **Phase**: Future enhancement (new issue)
  - **Dependency**: Separate from Issue #104

- [ ] **Optional: Add trim() to keyword extraction** (優先度: 低, 見積もり: 5分)
  - Add `.trim()` after `keyword.substring(0, 20)` in extractKeywords()
  - Removes cosmetic trailing space issue
  - **Phase**: 4 (Implementation) - Optional refinement
  - **Alternative**: Fix test expectation instead
```

**修正後** (Issue #108 完了後):
```markdown
### Remaining Tasks

The following tasks can be addressed in follow-up work and are not blocking merge:

- [x] **Fix 4 test expectation mismatches** (優先度: 中, 見積もり: 15-30分) ✅ **完了: 2025-01-30**
  - Update test case 2.1.1 to expect 20-char truncated keywords ✅
  - Update test case 2.1.3 to expect "Fix Jest configurati" or shorten test data ✅
  - Update test case 2.1.4 to expect trailing space or add trim() in implementation ✅
  - Update test case 2.2.4 to use longer test data ensuring 80+ char title generation ✅
  - **Phase**: 5 (Test Implementation)
  - **Files**: `tests/unit/github/issue-client-followup.test.ts`
  - **Addressed in**: Issue #108

- [x] **Phase 9 (Evaluation) prompt improvement to include context information** (優先度: 低, 見積もり: 2-4時間) 🔍 **調査完了: 2025-01-30**
  - Evaluation Phase プロンプトのレビュー完了
  - blockerStatus/deferredReason 抽出ロジックの実現可能性調査完了
  - **Phase**: Future enhancement (new issue)
  - **Dependency**: Separate from Issue #104
  - **Next Step**: Issue #109 作成を検討（実装は別途）

- [x] **Optional: Add trim() to keyword extraction** (優先度: 低, 見積もり: 5分) ⚖️ **トレードオフ分析完了: 2025-01-30**
  - トレードオフ分析完了（実装 vs. テスト期待値修正）
  - **結論**: テスト期待値修正のみで対応（実装変更なし）
  - **Phase**: 4 (Implementation) - Optional refinement
  - **Alternative**: Fix test expectation instead ✅ 採用
  - **Addressed in**: Issue #108
```

#### 7.4.2 更新タイミング

**Phase 7 (Documentation) で更新**:
- Task 1 完了後: "Fix 4 test expectation mismatches" にチェックマーク
- Task 2 完了後: "Optional: Add trim() to keyword extraction" にトレードオフ分析結果を追記
- Task 3 完了後: "Phase 9 prompt improvement" に調査結果を追記

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

**本 Issue による影響**: なし

**理由**:
- テスト期待値修正のみ（認証・認可ロジックの変更なし）
- trim() 実装も内部ロジックのみで、セキュリティ影響なし

### 8.2 データ保護

**本 Issue による影響**: なし

**理由**:
- Evaluation Report の更新は内部ドキュメントのみ
- テストデータは機密情報を含まない

### 8.3 セキュリティリスクと対策

**リスク**: なし（影響範囲が非常に小さいため）

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

**要件** (要件定義書 NFR-1 より):
- テスト実行時間: 既存のユニットテスト（27 ケース）は 30 秒以内に完了すること
- Git 操作: コミット・プッシュ操作は各 10 秒以内に完了すること

**対策**:
- テスト期待値修正のみのため、パフォーマンス劣化なし
- trim() 実装を追加する場合も、文字列操作1回のみで影響なし

### 9.2 セキュリティ

**要件** (要件定義書 NFR-2 より):
- ESLint および TypeScript コンパイラのエラーが 0 件であること
- テストデータに機密情報を含まないこと

**対策**:
- TypeScript コンパイラチェック: `npm run build` で確認
- ESLint チェック: `npx eslint src tests` で確認
- テストデータは公開リポジトリ用のサンプルデータのみ

### 9.3 可用性・信頼性

**要件** (要件定義書 NFR-3 より):
- 全テストケース（27 ケース）が PASS すること（100% PASS）
- 回帰テストに影響がないこと

**対策**:
- Phase 6 (Testing) で全テストケース実行（`npm test tests/unit/github/issue-client-followup.test.ts`）
- trim() 実装を選択した場合、全テストスイート実行（`npm test`）

### 9.4 保守性・拡張性

**要件** (要件定義書 NFR-4 より):
- テスト期待値の修正により、テストケースの意図が明確であること
- 実装ログに修正内容が詳細に記録されていること

**対策**:
- Test case ごとに Given-When-Then を再確認
- Phase 7 (Documentation) で実装ログ作成（修正前・修正後の比較）

---

## 10. 実装の順序

### 10.1 推奨実装順序

実装は以下の順序で行うことを推奨します（依存関係を考慮）：

#### Phase 1: 要件分析とトレードオフ分析
1. Issue #104 Evaluation Report の残タスク確認（15分）
2. 各テストケースの詳細分析（15分）
3. Task 2: trim() 実装のトレードオフ分析（10分）

#### Phase 2: 実装
4. Task 1: テスト期待値修正（30-45分）
   - Test case 2.1.1 (line 68-72): 期待値修正
   - Test case 2.1.3 (line 106): 期待値修正
   - Test case 2.1.4 (line 123): 期待値修正（Phase 2 の判断に基づく）
   - Test case 2.2.4 (line 262-273): テストデータ修正

5. Task 2: trim() 実装（5-10分、オプショナル）
   - Phase 2 のトレードオフ分析結果に基づき、実装する場合のみ実施
   - `src/core/github/issue-client.ts` (line 197): `.trim()` 追加

#### Phase 3: テスト実行
6. ユニットテスト実行（10分）
   - `npm test tests/unit/github/issue-client-followup.test.ts` を実行
   - すべてのテストケース（27ケース）が PASS することを確認

7. 回帰テスト実行（10分）
   - `npm test tests/unit/github/issue-client.test.ts` を実行
   - trim() 実装を選択した場合、全テストスイート実行（`npm test`）

#### Phase 4: 調査
8. Task 3: Phase 9 プロンプト改善調査（30-60分）
   - Evaluation Phase プロンプトのレビュー
   - TODO コメント確認
   - 抽出ロジックの実現可能性調査

#### Phase 5: ドキュメント更新
9. Task 4: Issue #104 Evaluation Report 更新（10分）
   - 残タスクステータス更新
   - 完了日時記録

10. 実装ログ作成（10分）
    - 修正したテスト期待値の詳細（修正前・修正後の比較）
    - trim() 実装の有無と理由
    - Phase 9 プロンプト改善の調査結果

### 10.2 依存関係の考慮

```
Phase 1 (要件分析)
   │
   ├─► Phase 2 (実装) ─┐
   │                   │
   │                   ├─► Phase 3 (テスト実行)
   │                   │
   └─► Phase 4 (調査) ─┘
                       │
                       └─► Phase 5 (ドキュメント更新)
```

**並列化可能な箇所**:
- Phase 2 (実装) と Phase 4 (調査) は並列実行可能（依存関係がない）
- ただし、Phase 3 (テスト実行) は Phase 2 完了後に実施

---

## 11. 設計の検証と品質ゲート確認

### 11.1 品質ゲート（Phase 2）の確認

- [x] **実装戦略の判断根拠が明記されている**
  - セクション 2「実装戦略判断」で EXTEND を選択し、4つの具体的な判断根拠を記載

- [x] **テスト戦略の判断根拠が明記されている**
  - セクション 3「テスト戦略判断」で UNIT_ONLY を選択し、ユニットテストのみで十分な理由、他の戦略が不適切な理由を記載

- [x] **テストコード戦略の判断根拠が明記されている**
  - セクション 4「テストコード戦略判断」で EXTEND_TEST を選択し、既存テストファイルの修正のみで十分な理由を記載

- [x] **既存コードへの影響範囲が分析されている**
  - セクション 5「影響範囲分析」で、変更が必要なファイル3つ、影響度、リスクを詳細に記載

- [x] **変更が必要なファイルがリストアップされている**
  - セクション 6「変更・追加ファイルリスト」で、修正が必要な既存ファイル3つをリストアップ

- [x] **設計が実装可能である**
  - セクション 7「詳細設計」で、各タスクの修正方針、実装例、設計判断を具体的に記載
  - セクション 10「実装の順序」で、実装手順と依存関係を明示

### 11.2 要件定義書との整合性

| 要件ID | 要件 | 設計での対応 | セクション |
|--------|------|------------|-----------|
| FR-1 | テスト期待値修正 | 4つのテストケースごとに詳細な修正方針を設計 | 7.1 |
| FR-2 | trim() 実装検討 | トレードオフ分析と推奨アプローチを設計 | 7.2 |
| FR-3 | Phase 9 プロンプト改善調査 | 調査範囲、手順、評価基準を設計 | 7.3 |
| Task 4 | Issue #104 Evaluation Report 更新 | 更新箇所、更新内容、更新タイミングを設計 | 7.4 |
| NFR-1 | パフォーマンス | テスト実行時間の確認方法を設計 | 9.1 |
| NFR-2 | セキュリティ | コンパイラ・ESLint チェック方法を設計 | 9.2 |
| NFR-3 | 可用性・信頼性 | 全テストケース PASS の確認方法を設計 | 9.3 |
| NFR-4 | 保守性・拡張性 | 実装ログとテストケースの意図明確化を設計 | 9.4 |

### 11.3 Planning Document との整合性

| Planning Document の項目 | 設計での対応 | セクション |
|-------------------------|------------|-----------|
| 実装戦略: EXTEND | ✅ 一致（既存ファイルの軽微な修正のみ） | 2 |
| テスト戦略: UNIT_ONLY | ✅ 一致（ユニットテストのみ） | 3 |
| テストコード戦略: EXTEND_TEST | ✅ 一致（既存テストファイルの修正のみ） | 4 |
| 主なリスク: テスト期待値修正の判断ミス | ✅ 各テストケースの詳細な修正方針で対応 | 7.1 |
| 主なリスク: trim() 実装による予期しない影響 | ✅ トレードオフ分析とテスト期待値修正優先で対応 | 7.2 |
| 主なリスク: Phase 9 プロンプト改善の調査不足 | ✅ 詳細な調査手順と評価基準で対応 | 7.3 |
| 主なリスク: Evaluation Report 更新漏れ | ✅ Phase 7 での更新手順を明確化 | 7.4 |

---

## 12. まとめ

### 12.1 設計の概要

本設計書では、Issue #108「Issue #104 - 残タスク」に対する詳細設計を行いました。主な設計内容は以下の通りです：

1. **Task 1: テスト期待値修正**（優先度: 中）
   - 4つのテストケースの期待値を、デザイン仕様（20文字・80文字制限）に準拠する形に修正
   - Test case 2.1.1, 2.1.3, 2.1.4, 2.2.4 の詳細な修正方針を策定

2. **Task 2: trim() 実装の検討**（優先度: 低、オプショナル）
   - トレードオフ分析を実施し、推奨アプローチ（テスト期待値修正のみ）を決定
   - オプション A（trim() 実装）とオプション B（期待値修正）の比較

3. **Task 3: Phase 9 プロンプト改善の調査**（優先度: 低）
   - 調査範囲、手順、評価基準を策定
   - Issue #109 作成のための情報収集方法を定義

4. **Task 4: Issue #104 Evaluation Report の更新**
   - 更新箇所、更新内容、更新タイミングを明確化

### 12.2 設計の特徴

- **リスク最小**: 実装コード変更を最小限に抑え（trim() 実装はオプショナル）、テスト期待値修正を優先
- **明確な判断基準**: トレードオフ分析により、各タスクの推奨アプローチを明確化
- **実装可能性**: 各タスクの詳細な修正方針と実装例を提示し、実装フェーズでの迷いを最小化
- **ドキュメント整備**: Issue #104 Evaluation Report の更新手順を明確化し、残タスクのトレーサビリティを確保

### 12.3 次のフェーズへの引き継ぎ事項

**Phase 3（Test Scenario）で確認すべき事項**:
- テスト期待値修正のテストシナリオ（修正前・修正後の比較）
- trim() 実装のテストシナリオ（オプショナル、Phase 2 の判断に基づく）

**Phase 4（Implementation）で注意すべき事項**:
- Test case 2.1.1, 2.1.3: 期待値を20文字切り詰め版に修正
- Test case 2.1.4: Phase 2 の判断に基づき、期待値修正 OR trim() 実装
- Test case 2.2.4: テストデータを長くして80文字超えを保証
- Task 2: トレードオフ分析結果に基づき、trim() 実装の有無を決定
- Task 3: Phase 9 プロンプトレビューと抽出ロジック実現可能性調査

**Phase 7（Documentation）で注意すべき事項**:
- Issue #104 Evaluation Report の更新（残タスク3件のチェックマーク）
- 実装ログの作成（修正前・修正後の比較、trim() 実装の有無と理由）

---

**設計書作成日**: 2025-01-30
**想定実装期間**: Phase 4（Implementation）完了時まで（見積もり: 2~3時間）
**リスクレベル**: 低（主なリスク: テスト期待値修正の判断ミス、trim() 実装による予期しない影響）
