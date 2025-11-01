# テストシナリオ - Issue #108

## 0. Planning Document の確認

Planning Phase (Phase 0) で策定された開発計画を確認しました。主要な戦略は以下の通りです：

### テスト戦略の確認
- **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルの修正のみ）
- **テスト範囲**: `tests/unit/github/issue-client-followup.test.ts` の期待値修正
- **新規テストケース追加**: 不要（既存27テストケースで十分カバー）

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY**（ユニットテストのみ）

**判断根拠** (Phase 2 Design Document より)：
- 変更範囲が非常に小さく（テスト期待値修正4行、trim()実装1行）、単一モジュール内で完結
- 既存ユニットテストの修正のみで十分カバー可能
- 外部システム連携の変更なし（GitHub API 呼び出しロジックは変更なし）
- BDD 不要（エンドユーザー向け機能変更なし）

### 1.2 テスト対象の範囲

**テスト対象ファイル**:
1. `tests/unit/github/issue-client-followup.test.ts`（修正）
   - Test case 2.1.1: `extractKeywords()` - 20文字切り詰め対応
   - Test case 2.1.3: `extractKeywords()` - 英語括弧前まで抽出（20文字制限）
   - Test case 2.1.4: `extractKeywords()` - 20文字切り詰め（末尾空白問題）
   - Test case 2.2.4: `generateFollowUpTitle()` - 80文字タイトル切り詰め

**テスト対象外**:
- Integration テスト: 既存の Integration テストで十分カバー済み
- BDD テスト: ユーザーストーリー変更がないため不要
- 新規テストケース追加: 既存27テストケースで十分カバー

### 1.3 テストの目的

1. **テスト期待値の正確性検証**: 修正後の期待値がデザイン仕様（20文字・80文字制限）に準拠していることを確認
2. **既存機能の保護**: 修正により既存の23テストケース（既にPASS）が影響を受けないことを確認
3. **trim() 実装の影響確認**（該当する場合）: trim() 実装により予期しないテスト失敗が発生しないことを確認
4. **回帰テスト**: `tests/unit/github/issue-client.test.ts` の既存テストに影響がないことを確認

---

## 2. Unitテストシナリオ

### 2.1 テスト対象メソッド: `extractKeywords()`

`extractKeywords()` メソッドは、残タスクリストからキーワードを抽出し、20文字以内に切り詰める機能を提供します。

**実装箇所**: `src/core/github/issue-client.ts` (lines 182-206)

---

#### Test case 2.1.1: extractKeywords() - 20文字切り詰め対応（3タスクからキーワード抽出）

**テストケース名**: `should extract keywords from 3 tasks`

**テストファイル**: `tests/unit/github/issue-client-followup.test.ts` (lines 59-73)

**目的**:
- 複数のタスクから正しくキーワードを抽出できることを検証
- 20文字を超えるキーワードが正しく切り詰められることを検証

**前提条件**:
- `IssueClient` のインスタンスが作成されている
- 3つの残タスク（`RemainingTask[]`）が存在する

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
  { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
  { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
];
const limit = 3;
```

**期待結果**（修正前）:
```typescript
// ❌ 不正確（20文字切り詰めを考慮していない）
[
  'Coverage improvement to 90%',    // 実際は20文字に切り詰められる
  'Performance benchmark execution', // 実際は20文字に切り詰められる
  'Documentation updates',           // 20文字以内なのでOK
]
```

**期待結果**（修正後）:
```typescript
// ✅ 正確（20文字切り詰めを考慮）
[
  'Coverage improvement',    // 20文字に切り詰め（元: 'Coverage improvement to 90%'）
  'Performance benchmar',    // 20文字に切り詰め（元: 'Performance benchmark execution'、末尾 'k' が欠ける）
  'Documentation updat',     // 20文字に切り詰め（元: 'Documentation updates'、元は21文字）
]
```

**テストデータ**:
- Task 1: 'Coverage improvement to 90%' (28文字) → 'Coverage improvement' (20文字)
- Task 2: 'Performance benchmark execution' (31文字) → 'Performance benchmar' (20文字)
- Task 3: 'Documentation updates' (21文字) → 'Documentation updat' (20文字)

**検証項目**:
- [ ] 3つのキーワードが抽出されること
- [ ] 各キーワードが20文字以内であること
- [ ] 20文字を超えるキーワードが正しく切り詰められること
- [ ] 期待値が `['Coverage improvement', 'Performance benchmar', 'Documentation updat']` と一致すること

---

#### Test case 2.1.3: extractKeywords() - 英語括弧前まで抽出（20文字制限）

**テストケース名**: `should extract keywords before English parentheses`

**テストファイル**: `tests/unit/github/issue-client-followup.test.ts` (lines 99-107)

**目的**:
- 英語括弧 `()` の前までキーワードを抽出できることを検証
- 括弧前のテキストが20文字を超える場合、20文字に切り詰められることを検証

**前提条件**:
- `IssueClient` のインスタンスが作成されている
- 英語括弧を含む残タスクが存在する

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Fix Jest configuration (src/jest.config.js)', phase: 'implementation', priority: 'High' },
];
const limit = 1;
```

**期待結果**（修正前）:
```typescript
// ❌ 不正確（20文字切り詰めを考慮していない）
['Fix Jest configuration'] // 実際は 'Fix Jest configurati' (20文字) に切り詰められる
```

**期待結果**（修正後、オプション A）:
```typescript
// ✅ 正確（20文字切り詰めを考慮）
['Fix Jest configurati'] // 20文字に切り詰め（元: 'Fix Jest configuration'、23文字）
```

**期待結果**（修正後、オプション B: テストデータ短縮）:
```typescript
// テストデータ: 'Fix Jest config (src/jest.config.js)'
['Fix Jest config'] // 括弧前 & 20文字以内（15文字）
```

**テストデータ**:
- **オプション A**: 'Fix Jest configuration (src/jest.config.js)' → 括弧前 'Fix Jest configuration' (23文字) → 20文字切り詰め 'Fix Jest configurati'
- **オプション B**: 'Fix Jest config (src/jest.config.js)' → 括弧前 'Fix Jest config' (15文字) → 切り詰めなし

**検証項目**:
- [ ] 英語括弧 `()` の前までキーワードが抽出されること
- [ ] キーワードが20文字以内であること
- [ ] 期待値が 'Fix Jest configurati'（オプション A）または 'Fix Jest config'（オプション B）と一致すること

**設計判断** (Phase 2 より):
- **オプション A を推奨**: 実装コードは正しいため、テスト期待値を修正する
- **オプション B も許容可**: テストケースの意図（括弧前まで抽出）を明確にしたい場合は有効

---

#### Test case 2.1.4: extractKeywords() - 20文字切り詰め（末尾空白問題）

**テストケース名**: `should truncate keywords to 20 characters`

**テストファイル**: `tests/unit/github/issue-client-followup.test.ts` (lines 116-125)

**目的**:
- 20文字を超えるキーワードが正しく切り詰められることを検証
- **末尾空白の扱い**を検証（Phase 2 のトレードオフ分析に基づく）

**前提条件**:
- `IssueClient` のインスタンスが作成されている
- 20文字を超える長いタスクテキストが存在する

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
];
const limit = 1;
```

**期待結果**（修正前）:
```typescript
// ❌ 不正確（末尾空白を考慮していない）
expect(keywords[0]).toBe('This is a very long'); // 実際は 'This is a very long ' (末尾空白あり、20文字)
expect(keywords[0].length).toBe(20);            // ✅ 長さは20文字で正しい
```

**期待結果**（修正後、オプション A: 期待値修正）:
```typescript
// ✅ 正確（末尾空白を含めて20文字）
expect(keywords[0]).toBe('This is a very long '); // 末尾空白を含めて20文字
expect(keywords[0].length).toBe(20);              // 長さは20文字
```

**期待結果**（修正後、オプション B: trim() 実装）:
```typescript
// src/core/github/issue-client.ts (line 197) に .trim() 追加
// keyword = keyword.substring(0, 20).trim();

// ✅ 正確（trim() により末尾空白除去）
expect(keywords[0]).toBe('This is a very long'); // trim() により末尾空白除去
expect(keywords[0].length).toBe(19);            // 長さは19文字（trim後）
```

**テストデータ**:
- Task: 'This is a very long task description that exceeds 20 characters'
- 20文字切り詰め後: 'This is a very long ' (末尾に空白1文字)

**検証項目**:
- [ ] キーワードが20文字以内であること
- [ ] **オプション A の場合**: 期待値が 'This is a very long ' (末尾空白含む、20文字) と一致すること
- [ ] **オプション B の場合**: 期待値が 'This is a very long' (trim後、19文字) と一致すること
- [ ] 長さが正しい（オプション A: 20文字、オプション B: 19文字）こと

**設計判断** (Phase 2 より):
- **オプション B（trim() 実装）を推奨**: より直感的なキーワード抽出が可能
- **オプション A（期待値修正のみ）も許容可**: 実装変更を避けたい場合

**Phase 2 の最終推奨** (Phase 2 section 7.2.2):
- **オプション A（テスト期待値修正のみ）を推奨**: リスク最小、実装コード変更なし
- ただし、実装者の判断により trim() 実装を追加しても問題なし

---

### 2.2 テスト対象メソッド: `generateFollowUpTitle()`

`generateFollowUpTitle()` メソッドは、Issue番号と残タスクリストから Follow-up Issue のタイトルを生成し、80文字以内に切り詰める機能を提供します。

**実装箇所**: `src/core/github/issue-client.ts` (lines 215-234)

---

#### Test case 2.2.4: generateFollowUpTitle() - 80文字タイトル切り詰め

**テストケース名**: `should truncate title to 80 characters with ellipsis`

**テストファイル**: `tests/unit/github/issue-client-followup.test.ts` (lines 262-273)

**目的**:
- 80文字を超えるタイトルが正しく切り詰められることを検証
- タイトル末尾に `...` が追加されることを検証

**前提条件**:
- `IssueClient` のインスタンスが作成されている
- 3つの長い残タスクが存在し、タイトルが80文字を超える

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Very long task description number one', phase: 'implementation', priority: 'High' },
  { task: 'Very long task description number two', phase: 'implementation', priority: 'High' },
  { task: 'Very long task description number three', phase: 'implementation', priority: 'High' },
];
const issueNumber = 123;
```

**タイトル生成ロジック**:
```
[FOLLOW-UP] #{issueNumber}: keyword1・keyword2・keyword3
```

**タイトル長の計算**（修正前のテストデータ）:
```
Prefix: "[FOLLOW-UP] #123: " = 18文字
Keyword1: "Very long task desc" (20文字)
中黒: "・" (1文字)
Keyword2: "Very long task desc" (20文字)
中黒: "・" (1文字)
Keyword3: "Very long task desc" (20文字)
合計: 18 + 20 + 1 + 20 + 1 + 20 = 80文字

❌ 問題: ちょうど80文字なので、"..." が追加されない
```

**期待結果**（修正前）:
```typescript
// ❌ 不正確（テストデータが80文字超えを保証していない）
expect(title.length).toBe(80);         // 実際は76文字（80文字に達していない）
expect(title.endsWith('...')).toBe(true); // 実際は false（切り詰めが発生していない）
```

**期待結果**（修正後）:
```typescript
// テストデータを変更して、確実に80文字超えを保証

const tasks: RemainingTask[] = [
  // Issue番号を12345（5桁）にして、タイトルを長くする
  { task: 'Implement a comprehensive authentication and authorization system', phase: 'implementation', priority: 'High' },
  { task: 'Add extensive unit and integration tests for all paths', phase: 'testing', priority: 'High' },
  { task: 'Update all documentation and user guides thoroughly', phase: 'documentation', priority: 'High' },
];
const issueNumber = 12345; // 5桁に変更

// タイトル長の計算（修正後）:
// Prefix: "[FOLLOW-UP] #12345: " = 20文字（Issue番号が5桁）
// Keyword1: "Implement a comprehe" (20文字)
// 中黒: "・" (1文字)
// Keyword2: "Add extensive unit a" (20文字)
// 中黒: "・" (1文字)
// Keyword3: "Update all documenta" (20文字)
// 合計: 20 + 20 + 1 + 20 + 1 + 20 = 82文字 → 77文字 + "..." = 80文字

// ✅ 正確（80文字に切り詰められ、"..." が追加される）
expect(title.length).toBe(80);         // 80文字に切り詰められる
expect(title.endsWith('...')).toBe(true); // "..." が追加される
```

**テストデータ**（修正後）:
- Issue番号: 12345（5桁、Prefix長を20文字にする）
- Task 1: 'Implement a comprehensive authentication and authorization system' → 'Implement a comprehe' (20文字)
- Task 2: 'Add extensive unit and integration tests for all paths' → 'Add extensive unit a' (20文字)
- Task 3: 'Update all documentation and user guides thoroughly' → 'Update all documenta' (20文字)
- 合計: 20 + 20 + 1 + 20 + 1 + 20 = 82文字 → 77文字 + "..." = 80文字

**検証項目**:
- [ ] タイトル長が80文字であること
- [ ] タイトル末尾が "..." で終わること
- [ ] タイトルフォーマットが `[FOLLOW-UP] #{issueNumber}: keyword1・keyword2・keyword3...` であること

**設計判断** (Phase 2 より):
- テストデータを確実に80文字超えにする（Issue番号を大きくする、またはキーワードを長くする）
- タイトル生成ロジックが80文字超えを検出し、"..." を追加することを保証

---

## 3. テスト期待値修正のテストシナリオ

### 3.1 修正前・修正後の比較表

| Test case | ファイル行数 | 修正前の期待値 | 修正後の期待値 | 修正理由 |
|-----------|------------|--------------|--------------|---------|
| 2.1.1 | line 68-72 | `['Coverage improvement to 90%', 'Performance benchmark execution', 'Documentation updates']` | `['Coverage improvement', 'Performance benchmar', 'Documentation updat']` | 20文字切り詰めを考慮 |
| 2.1.3 | line 106 | `['Fix Jest configuration']` | `['Fix Jest configurati']`（オプションA）または `['Fix Jest config']`（オプションB） | 20文字切り詰めを考慮 |
| 2.1.4 | line 123 | `'This is a very long'` | `'This is a very long '`（オプションA）または `'This is a very long'`（オプションB、trim実装） | 末尾空白を考慮 |
| 2.2.4 | line 262-273 | Issue番号123、短いタスクテキスト | Issue番号12345、長いタスクテキスト | 80文字超えを保証 |

### 3.2 Given-When-Then 再確認

#### Test case 2.1.1

**Given**: 3つの残タスクが存在し、一部のタスクテキストが20文字を超える
**When**: `extractKeywords()` を呼び出して3つのキーワードを抽出する
**Then**: 各キーワードが20文字以内に切り詰められ、期待値 `['Coverage improvement', 'Performance benchmar', 'Documentation updat']` と一致する

#### Test case 2.1.3

**Given**: 英語括弧を含む残タスクが存在し、括弧前のテキストが20文字を超える
**When**: `extractKeywords()` を呼び出して1つのキーワードを抽出する
**Then**: 括弧前のテキストが20文字に切り詰められ、期待値 `['Fix Jest configurati']`（オプションA）または `['Fix Jest config']`（オプションB）と一致する

#### Test case 2.1.4

**Given**: 20文字を超える長いタスクテキストが存在する
**When**: `extractKeywords()` を呼び出して1つのキーワードを抽出する
**Then**:
- **オプション A（期待値修正）**: キーワードが20文字に切り詰められ、末尾空白を含む期待値 `'This is a very long '` と一致する
- **オプション B（trim実装）**: キーワードが20文字に切り詰められ、trim() により末尾空白が除去され、期待値 `'This is a very long'` (19文字) と一致する

#### Test case 2.2.4

**Given**: Issue番号12345と3つの長い残タスクが存在し、タイトルが80文字を超える
**When**: `generateFollowUpTitle()` を呼び出してタイトルを生成する
**Then**: タイトルが80文字に切り詰められ、末尾に "..." が追加され、長さが80文字であることを確認する

---

## 4. trim() 実装のテストシナリオ（オプショナル）

### 4.1 trim() 実装を選択した場合の既存テスト影響確認

**対象**: `tests/unit/github/issue-client-followup.test.ts` の既存27テストケース

**確認項目**:
- [ ] Test case 2.1.4 以外の26テストケースが影響を受けないこと
- [ ] trim() 実装により、予期しない文字数変化が発生しないこと
- [ ] 既存のテスト期待値が trim() 実装後も正しいこと

**テストシナリオ**:

**Given**: `extractKeywords()` メソッドに `.trim()` が追加されている
**When**: 既存の27テストケースをすべて実行する
**Then**:
- Test case 2.1.4 が PASS する（期待値修正済み）
- 他の26テストケースが PASS する（影響なし）

**検証方法**:
```bash
# 全テストケース実行
npm test tests/unit/github/issue-client-followup.test.ts

# 期待結果: 27/27 PASS
```

### 4.2 新規テストケース不要の確認

**判断根拠**:
- 既存の27テストケースで十分カバーされている
- trim() 実装は既存の `extractKeywords()` メソッドの軽微な修正（1行）
- Test case 2.1.4 で末尾空白のエッジケースをカバー済み
- 新規テストケース追加は不要

---

## 5. テストデータ

### 5.1 正常データ

**Test case 2.1.1**:
```typescript
[
  { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
  { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
  { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
]
```

**Test case 2.1.3（オプション A）**:
```typescript
[
  { task: 'Fix Jest configuration (src/jest.config.js)', phase: 'implementation', priority: 'High' },
]
```

**Test case 2.1.3（オプション B）**:
```typescript
[
  { task: 'Fix Jest config (src/jest.config.js)', phase: 'implementation', priority: 'High' },
]
```

**Test case 2.1.4**:
```typescript
[
  { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
]
```

**Test case 2.2.4**:
```typescript
[
  { task: 'Implement a comprehensive authentication and authorization system', phase: 'implementation', priority: 'High' },
  { task: 'Add extensive unit and integration tests for all paths', phase: 'testing', priority: 'High' },
  { task: 'Update all documentation and user guides thoroughly', phase: 'documentation', priority: 'High' },
]
// Issue番号: 12345
```

### 5.2 異常データ

**本 Issue では異常データのテストは不要**（既存テストで十分カバー済み）

### 5.3 境界値データ

**20文字ちょうど**（既存テストでカバー済み）:
```typescript
{ task: '12345678901234567890', phase: 'implementation', priority: 'High' } // 20文字ちょうど
```

**80文字ちょうど**（Test case 2.2.4 で検証）:
- Issue番号12345、キーワード20文字×3、中黒2個 → 合計82文字 → 77文字 + "..." = 80文字

---

## 6. テスト環境要件

### 6.1 必要なテスト環境

- **ローカル環境**: Node.js 20以上、npm 10以上
- **CI/CD環境**: Jenkins（既存のCI/CDパイプライン）

### 6.2 必要な外部サービス・データベース

**なし**（Unitテストのみ、外部システム連携なし）

### 6.3 モック/スタブの必要性

**既存のモック/スタブを使用**:
- `IssueClient` のプライベートメソッド（`extractKeywords()`, `generateFollowUpTitle()`）にアクセスするため、`(issueClient as any)` を使用（既存テストと同じ方法）

**新規モック/スタブ不要**:
- テスト期待値修正のみのため、新規モック/スタブは不要

---

## 7. 回帰テストシナリオ

### 7.1 対象テストファイル

1. **`tests/unit/github/issue-client-followup.test.ts`** (修正対象)
   - 全27テストケースが PASS することを確認

2. **`tests/unit/github/issue-client.test.ts`** (既存)
   - 既存の Issue Client ユニットテストに影響がないことを確認

### 7.2 回帰テストシナリオ

**Given**: テスト期待値修正および trim() 実装（該当する場合）が完了している
**When**: 全ユニットテストを実行する
**Then**:
- `tests/unit/github/issue-client-followup.test.ts`: 27/27 PASS
- `tests/unit/github/issue-client.test.ts`: すべてのテストが PASS
- trim() 実装を選択した場合、全テストスイート（`npm test`）が PASS

**実行コマンド**:
```bash
# issue-client-followup.test.ts のみ実行
npm test tests/unit/github/issue-client-followup.test.ts

# issue-client.test.ts のみ実行
npm test tests/unit/github/issue-client.test.ts

# trim() 実装を選択した場合、全テストスイート実行
npm test
```

---

## 8. 品質ゲート（Phase 3）の確認

### 8.1 Phase 2の戦略に沿ったテストシナリオである

- [x] **UNIT_ONLY** の戦略に沿っている
- [x] Integration テスト、BDD テストは作成していない（戦略に含まれないため）
- [x] 既存ユニットテストの修正のみ（EXTEND_TEST）

### 8.2 主要な正常系がカバーされている

- [x] Test case 2.1.1: 複数タスクからキーワード抽出（20文字切り詰め）
- [x] Test case 2.1.3: 英語括弧前まで抽出（20文字制限）
- [x] Test case 2.1.4: 20文字切り詰め（末尾空白問題）
- [x] Test case 2.2.4: 80文字タイトル切り詰め

### 8.3 主要な異常系がカバーされている

- [x] 異常系は既存の27テストケースで十分カバー済み
- [x] 本 Issue では異常系の追加テストは不要

### 8.4 期待結果が明確である

- [x] 各テストケースの期待結果が具体的に記載されている
- [x] 修正前・修正後の期待値比較表が作成されている（セクション 3.1）
- [x] Given-When-Then 形式で期待結果が明確に記述されている（セクション 3.2）

---

## 9. 次のフェーズへの引き継ぎ事項

### Phase 4（Implementation）で注意すべき事項

1. **Test case 2.1.1**: 期待値を `['Coverage improvement', 'Performance benchmar', 'Documentation updat']` に修正
2. **Test case 2.1.3**: 期待値を `['Fix Jest configurati']`（オプションA）または `['Fix Jest config']`（オプションB）に修正
3. **Test case 2.1.4**: Phase 2 の最終推奨（オプション A: テスト期待値修正のみ）に基づき、期待値を `'This is a very long '`（末尾空白含む、20文字）に修正
4. **Test case 2.2.4**: テストデータを修正し、Issue番号を12345に変更、タスクテキストを長くして80文字超えを保証

### Phase 6（Testing）で確認すべき事項

1. **全テストケース PASS 確認**:
   - `npm test tests/unit/github/issue-client-followup.test.ts` → 27/27 PASS
2. **回帰テスト実行**:
   - `npm test tests/unit/github/issue-client.test.ts` → すべてのテストが PASS
3. **trim() 実装を選択した場合**:
   - `npm test` → 全テストスイートが PASS

---

**テストシナリオ作成日**: 2025-01-30
**作成者**: AI Workflow Phase 3 (Test Scenario)
**Issue**: #108 - [FOLLOW-UP] Issue #104 - 残タスク
**対象リポジトリ**: tielec/ai-workflow-agent
