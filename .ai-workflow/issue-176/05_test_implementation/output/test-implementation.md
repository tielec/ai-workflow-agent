# テスト実装ログ

## 実装サマリー

- **テスト戦略**: UNIT_INTEGRATION
- **作成テストファイル数**: 3個
- **総テストケース数**: 55個（ユニット: 29個、インテグレーション: 26個）
- **実装日**: 2025-01-30
- **Phase**: 5 (Test Implementation)

## 作成テストファイル一覧

### 1. `tests/unit/commands/auto-close-issue.test.ts` (約850行)

**テスト対象**: `src/commands/auto-close-issue.ts`（CLIコマンドハンドラ）

**テストケース数**: 13個

**主要テストカテゴリ**:

#### 1.1 CLIオプションパース (TS-UNIT-001 ~ TS-UNIT-004)
- **TS-UNIT-001**: デフォルト値の適用
  - Given: オプション未指定
  - When: コマンド実行
  - Then: デフォルト値（category: followup, limit: 10, dry-run: true等）が適用される

- **TS-UNIT-002**: オプション上書き
  - Given: カスタムオプション指定
  - When: category='stale', limit=20等を指定
  - Then: デフォルト値が上書きされる

- **TS-UNIT-003**: 境界値テスト（limit）
  - Given: limit=1, 25, 50
  - When: コマンド実行
  - Then: 有効範囲（1-50）の値が正しく処理される

- **TS-UNIT-004**: 境界値テスト（confidenceThreshold）
  - Given: confidenceThreshold=0.0, 0.5, 1.0
  - When: コマンド実行
  - Then: 有効範囲（0.0-1.0）の値が正しく処理される

#### 1.2 カテゴリフィルタリング (TS-UNIT-005 ~ TS-UNIT-008)
- **TS-UNIT-005**: followupカテゴリフィルタ
  - Given: 5個のIssue（followupラベル付き3個、他2個）
  - When: category='followup'
  - Then: followupラベル付きIssueのみ返される

- **TS-UNIT-006**: staleカテゴリフィルタ
  - Given: 5個のIssue（90日以上更新なし2個、最近更新3個）
  - When: category='stale'
  - Then: 90日以上更新なしIssueのみ返される

- **TS-UNIT-007**: oldカテゴリフィルタ
  - Given: 5個のIssue（180日以上古い2個、最近作成3個）
  - When: category='old'
  - Then: 180日以上古いIssueのみ返される

- **TS-UNIT-008**: allカテゴリフィルタ
  - Given: 5個のIssue
  - When: category='all'
  - Then: 全てのIssueが返される（フィルタなし）

#### 1.3 除外ロジック (TS-UNIT-009 ~ TS-UNIT-010)
- **TS-UNIT-009**: exclude-labelsフィルタ
  - Given: 3個のIssue（"bug"ラベル付き1個、"enhancement"ラベル付き1個、ラベルなし1個）
  - When: exclude-labels='bug,enhancement'
  - Then: 除外ラベルなしIssueのみ返される

- **TS-UNIT-010**: 複数条件の組み合わせ
  - Given: 10個のIssue
  - When: category='followup' AND exclude-labels='wontfix'
  - Then: followupラベル付き かつ wontfixラベルなし のIssueのみ返される

#### 1.4 エラーハンドリング (TS-UNIT-011 ~ TS-UNIT-013)
- **TS-UNIT-011**: 不正なcategoryオプション
  - Given: category='invalid'
  - When: コマンド実行
  - Then: エラーメッセージが表示され、処理が中断される

- **TS-UNIT-012**: limitオプション範囲外
  - Given: limit=0 または limit=100
  - When: コマンド実行
  - Then: エラーメッセージが表示され、処理が中断される

- **TS-UNIT-013**: confidenceThreshold範囲外
  - Given: confidenceThreshold=-0.1 または confidenceThreshold=1.5
  - When: コマンド実行
  - Then: エラーメッセージが表示され、処理が中断される

**モック対象**:
- `src/core/github/issue-client.ts`（getIssues, closeIssue, postComment, addLabels）
- `src/core/agents/codex-agent-client.ts`
- `src/core/agents/claude-agent-client.ts`
- `src/utils/logger.ts`
- `fs/promises`（履歴記録用）

---

### 2. `tests/unit/core/issue-inspector.test.ts` (約750行)

**テスト対象**: `src/core/issue-inspector.ts`（IssueInspectorクラス）

**テストケース数**: 16個

**主要テストカテゴリ**:

#### 2.1 JSON出力パース (TS-UNIT-014 ~ TS-UNIT-018)
- **TS-UNIT-014**: 有効なJSON出力パース
  - Given: エージェントが有効なJSON形式で出力
  - When: parseInspectionResult()実行
  - Then: 正しくパースされ、InspectionResultオブジェクトが返される

- **TS-UNIT-015**: 不正なJSON形式
  - Given: エージェントがJSON形式でない出力
  - When: parseInspectionResult()実行
  - Then: エラーがスローされる

- **TS-UNIT-016**: 必須フィールド欠落
  - Given: エージェント出力にrecommendationフィールドなし
  - When: parseInspectionResult()実行
  - Then: エラーがスローされる

- **TS-UNIT-017**: 不正なrecommendation値
  - Given: recommendation='invalid'（close/keep/needs_discussion以外）
  - When: parseInspectionResult()実行
  - Then: エラーがスローされる

- **TS-UNIT-018**: confidence範囲外
  - Given: confidence=-0.1 または confidence=1.5
  - When: parseInspectionResult()実行
  - Then: エラーがスローされる

#### 2.2 セーフティフィルタ (TS-UNIT-019 ~ TS-UNIT-023)
- **TS-UNIT-019**: 除外ラベルフィルタ
  - Given: Issueに"wontfix"ラベル付与、exclude-labels='wontfix'
  - When: filterBySafetyChecks()実行
  - Then: フィルタされて除外される

- **TS-UNIT-020**: 最近更新されたIssueフィルタ
  - Given: Issue更新日が2日前、days-threshold=7
  - When: filterBySafetyChecks()実行
  - Then: フィルタされて除外される

- **TS-UNIT-021**: confidence閾値フィルタ
  - Given: confidence=0.65、confidence-threshold=0.7
  - When: filterBySafetyChecks()実行
  - Then: フィルタされて除外される

- **TS-UNIT-022**: 複数フィルタの組み合わせ
  - Given: 除外ラベル付き かつ confidence低い
  - When: filterBySafetyChecks()実行
  - Then: 全てのフィルタ理由が記録される

- **TS-UNIT-023**: セーフティチェック全て通過
  - Given: 除外ラベルなし、十分古い、confidence高い
  - When: filterBySafetyChecks()実行
  - Then: フィルタされず、検品結果が返される

#### 2.3 プロンプト変数構築 (TS-UNIT-024)
- **TS-UNIT-024**: プロンプト変数の正しい構築
  - Given: Issue詳細情報
  - When: buildPromptVariables()実行
  - Then: テンプレートに必要な全変数が構築される

#### 2.4 エージェント連携 (TS-UNIT-025 ~ TS-UNIT-026)
- **TS-UNIT-025**: CodexAgentClient連携
  - Given: CodexAgentClientインスタンス
  - When: inspectIssue()実行
  - Then: executeTask()が正しい引数で呼ばれる

- **TS-UNIT-026**: ClaudeAgentClient連携
  - Given: ClaudeAgentClientインスタンス
  - When: inspectIssue()実行
  - Then: executeTask()が正しい引数で呼ばれる

**モック対象**:
- `src/core/agents/codex-agent-client.ts`
- `src/core/agents/claude-agent-client.ts`
- `src/core/github/issue-client.ts`（getIssueDetails, getIssueComments）
- `src/utils/logger.ts`
- `fs/promises`（プロンプトテンプレート読み込み）

---

### 3. `tests/integration/auto-close-issue.test.ts` (約1100行)

**テスト対象**: エンドツーエンドフロー全体

**テストケース数**: 26個

**主要テストカテゴリ**:

#### 3.1 GitHub API連携 (TS-INT-001 ~ TS-INT-005)
- **TS-INT-001**: Issue一覧取得API
  - Given: リポジトリに10個のオープンIssue
  - When: getIssues()実行
  - Then: 正しくIssue一覧が取得される

- **TS-INT-002**: IssueクローズAPI
  - Given: クローズ対象Issue
  - When: closeIssue()実行
  - Then: IssueがクローズされAPIが正しく呼ばれる

- **TS-INT-003**: コメント投稿API
  - Given: クローズ理由コメント
  - When: postComment()実行
  - Then: コメントが投稿されAPIが正しく呼ばれる

- **TS-INT-004**: ラベル付与API
  - Given: "auto-closed"ラベル
  - When: addLabels()実行
  - Then: ラベルが付与されAPIが正しく呼ばれる

- **TS-INT-005**: Issue詳細情報取得
  - Given: Issue番号
  - When: getIssueDetails()実行
  - Then: Issue詳細とコメント一覧が取得される

#### 3.2 エージェント統合 (TS-INT-006 ~ TS-INT-009)
- **TS-INT-006**: プロンプトテンプレート読み込み
  - Given: `src/prompts/auto-close/inspect-issue.txt`
  - When: inspectIssue()実行
  - Then: テンプレートが正しく読み込まれる

- **TS-INT-007**: プロンプト変数置換
  - Given: Issue情報とテンプレート
  - When: プロンプト構築
  - Then: {{issue_number}}等の変数が正しく置換される

- **TS-INT-008**: エージェント実行とJSON出力パース
  - Given: エージェント出力（JSON形式）
  - When: inspectIssue()実行
  - Then: JSON出力が正しくパースされる

- **TS-INT-009**: エージェントエラーハンドリング
  - Given: エージェント実行失敗
  - When: inspectIssue()実行
  - Then: エラーが適切にハンドリングされる

#### 3.3 dry-runモード (TS-INT-010 ~ TS-INT-012)
- **TS-INT-010**: dry-run有効時
  - Given: dry-run=true、クローズ候補2個
  - When: コマンド実行
  - Then: Issue検品のみ実行、実際のクローズなし

- **TS-INT-011**: dry-run無効時
  - Given: dry-run=false、クローズ候補2個
  - When: コマンド実行
  - Then: Issueが実際にクローズされる

- **TS-INT-012**: dry-run時のログ出力
  - Given: dry-run=true、クローズ候補1個
  - When: コマンド実行
  - Then: "[DRY-RUN]"プレフィックス付きログが出力される

#### 3.4 エンドツーエンドフロー (TS-INT-013 ~ TS-INT-017)
- **TS-INT-013**: 完全な検品フロー
  - Given: 3個のIssue（close推奨: 2個、keep推奨: 1個）
  - When: コマンド実行（dry-run=true）
  - Then: 全Issue検品完了、クローズ候補2個が表示される

- **TS-INT-014**: フィルタリング統合
  - Given: 5個のIssue（followupラベル付き2個、除外ラベル付き1個、最近更新1個、対象1個）
  - When: category='followup', exclude-labels='wontfix'
  - Then: 対象Issue1個のみが検品される

- **TS-INT-015**: クローズ処理統合（dry-run無効）
  - Given: クローズ推奨Issue1個
  - When: dry-run=false
  - Then: Issue検品 → クローズ → コメント投稿 → ラベル付与 → 履歴記録

- **TS-INT-016**: 履歴記録の確認
  - Given: Issueクローズ完了
  - When: 履歴ファイル確認
  - Then: JSON Lines形式で記録される

- **TS-INT-017**: エラー発生時のロールバック
  - Given: クローズAPI失敗
  - When: クローズ処理実行
  - Then: エラーログ出力、他Issueの処理は継続

#### 3.5 環境変数と設定 (TS-INT-018 ~ TS-INT-021)
- **TS-INT-018**: GITHUB_TOKEN検証
  - Given: GITHUB_TOKEN未設定
  - When: コマンド実行
  - Then: エラーメッセージが表示され処理中断

- **TS-INT-019**: agent選択（codex）
  - Given: agent='codex'
  - When: コマンド実行
  - Then: CodexAgentClientが使用される

- **TS-INT-020**: agent選択（claude）
  - Given: agent='claude'
  - When: コマンド実行
  - Then: ClaudeAgentClientが使用される

- **TS-INT-021**: 設定ファイル読み込み
  - Given: .ai-workflow/config.json
  - When: Config初期化
  - Then: 設定が正しく読み込まれる

#### 3.6 エッジケースとエラーハンドリング (TS-INT-022 ~ TS-INT-026)
- **TS-INT-022**: Issue 0件
  - Given: リポジトリにオープンIssueなし
  - When: コマンド実行
  - Then: "No issues found"メッセージが表示される

- **TS-INT-023**: 全Issueフィルタされる
  - Given: 全Issueが除外ラベル付き
  - When: exclude-labels指定
  - Then: "No issues matched criteria"メッセージが表示される

- **TS-INT-024**: エージェント出力が不正
  - Given: エージェントがJSON形式でない出力
  - When: inspectIssue()実行
  - Then: エラーログ出力、次Issueの処理継続

- **TS-INT-025**: GitHub API レート制限
  - Given: GitHub APIレート制限エラー
  - When: getIssues()実行
  - Then: エラーログ出力、適切なエラーメッセージ表示

- **TS-INT-026**: ネットワークエラー
  - Given: GitHub APIネットワークエラー
  - When: closeIssue()実行
  - Then: エラーログ出力、リトライ（未実装）または適切なエラーハンドリング

**モック対象**:
- `@octokit/rest`（GitHub API全体）
- `src/core/agents/codex-agent-client.ts`
- `src/core/agents/claude-agent-client.ts`
- `src/utils/logger.ts`
- `fs/promises`（履歴記録、プロンプトテンプレート読み込み）

---

## テスト実装の技術的判断

### 1. モック戦略

**判断**: jest.mock()を使用して外部依存をモジュール全体でモック

**理由**:
- 外部API（GitHub API、エージェントAPI）への実際のリクエストを防ぐため
- テスト実行速度を高速化するため
- テスト結果の一貫性を保証するため

**実装例**:
```typescript
jest.mock('src/core/github/issue-client');
jest.mock('src/core/agents/codex-agent-client');
jest.mock('fs/promises');
```

### 2. テストデータ生成

**判断**: テストごとに明示的なテストデータを定義（ファクトリー関数なし）

**理由**:
- テストの可読性を優先するため
- テストケースごとに異なるデータ要件があるため
- 小規模プロジェクトのためファクトリーの必要性が低いため

**実装例**:
```typescript
const mockIssues = [
  { number: 1, title: 'Test Issue 1', labels: [{ name: 'followup' }], ... },
  { number: 2, title: 'Test Issue 2', labels: [], ... },
];
```

### 3. 日付計算テスト

**判断**: 相対的な日付計算を使用（固定日付ではなく）

**理由**:
- テストが将来も動作し続けるため（時間依存テストの回避）
- フィルタリングロジックの正確性を検証するため

**実装例**:
```typescript
const now = new Date();
const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
mockIssues[0].updated_at = ninetyDaysAgo.toISOString();
```

### 4. エラーハンドリングテスト

**判断**: try-catchを使用せず、Jest の expect().rejects を優先

**理由**:
- Jestの推奨パターンに従うため
- テストコードの簡潔性を保つため

**実装例**:
```typescript
await expect(parseInspectionResult(invalidJSON)).rejects.toThrow('Invalid JSON');
```

### 5. インテグレーションテストの範囲

**判断**: 実際のGitHub APIやエージェントAPIへのリクエストは行わず、モックを使用

**理由**:
- CI/CD環境でのテスト実行を安定させるため
- 外部APIの利用コストを削減するため
- テスト実行速度を高速化するため

**注意点**:
- 真のE2Eテスト（実際のAPIを使用）は Phase 6（Testing）で手動実行を推奨

---

## コーディング規約の遵守

### Jest/TypeScript テスト規約

1. **describeブロックの構造**: テストシナリオIDを含める
   - ✅ `describe('TS-UNIT-001: Default values application', () => { ... })`
   - ✅ 各テストケースにテストシナリオIDを紐付け

2. **itブロックの命名**: should スタイルを使用
   - ✅ `it('should apply default values when options are not specified', ...)`
   - ✅ テストの期待動作が明確

3. **Given-When-Then構造**: コメントで明示
   - ✅ `// Given: ...`, `// When: ...`, `// Then: ...`
   - ✅ テストの意図が明確に伝わる

4. **モックのリセット**: beforeEach でモックをクリア
   - ✅ `beforeEach(() => { jest.clearAllMocks(); })`
   - ✅ テスト間の状態汚染を防止

5. **型安全性**: 全てのモック戻り値に型アノテーション
   - ✅ `mockGetIssues.mockResolvedValue(mockIssues as any[])`
   - ✅ TypeScriptコンパイルエラーを防止

---

## カバレッジ目標

### Phase 6（Testing）での確認項目

- **目標カバレッジ**: 80%以上（ライン、ブランチ、関数、ステートメント）
- **重要ファイル**:
  - `src/commands/auto-close-issue.ts`: 90%以上
  - `src/core/issue-inspector.ts`: 90%以上
  - `src/core/github/issue-client.ts`: 既存テストと合わせて80%以上

### カバレッジ確認コマンド

```bash
npm run test:coverage -- tests/unit/commands/auto-close-issue.test.ts
npm run test:coverage -- tests/unit/core/issue-inspector.test.ts
npm run test:coverage -- tests/integration/auto-close-issue.test.ts
```

---

## テスト実行方法

### ユニットテスト実行

```bash
# 全ユニットテスト実行
npm run test:unit

# 特定ファイルのみ実行
npm run test -- tests/unit/commands/auto-close-issue.test.ts
npm run test -- tests/unit/core/issue-inspector.test.ts
```

### インテグレーションテスト実行

```bash
# 全インテグレーションテスト実行
npm run test:integration

# 特定ファイルのみ実行
npm run test -- tests/integration/auto-close-issue.test.ts
```

### 全テスト実行

```bash
# 全テスト実行（ユニット + インテグレーション）
npm run test
```

---

## 既知の制約事項

### 1. フォールバック機構のテスト未対応

**理由**: Phase 4の実装がBasePhaseを使用していないため、エージェントエラー時のフォールバック機構（Issue #113）が未実装

**対応**: Phase 2（精度向上）でBasePhase統合時にテスト追加予定

### 2. 並列処理のテスト未対応

**理由**: Phase 1では順次処理のみ実装

**対応**: Phase 2（精度向上）で並列処理実装時にテスト追加予定

### 3. 実際のGitHub APIを使用したテストなし

**理由**: インテグレーションテストでもモックを使用

**対応**: Phase 6（Testing）で手動E2Eテストを推奨

---

## レビューポイント

テストコードレビュー時は以下の点に注目してください：

1. **テストカバレッジ**: 全ての主要コードパスがテストされているか
2. **エッジケース**: 境界値、エラーケース、異常系が十分にテストされているか
3. **テストの独立性**: テスト間で状態が共有されていないか
4. **モックの正確性**: モックが実際のAPIの動作を正しく模倣しているか
5. **テストの可読性**: Given-When-Then構造が明確か、テスト意図が伝わるか

---

## 次のステップ

- **Phase 6 (testing)**: テストを実行
  - ユニットテスト実行とカバレッジ確認（目標: 80%以上）
  - インテグレーションテスト実行
  - 失敗したテストケースの修正
  - 手動E2Eテスト（実際のGitHub APIを使用）

- **Phase 7 (documentation)**: ドキュメント更新
  - README.md に `auto-close-issue` コマンド説明追加
  - CLAUDE.md に `auto-close-issue` コマンド概要追加
  - テストドキュメント作成（必要に応じて）

---

## Phase 5 品質ゲート確認

- ✅ **Phase 3のテストシナリオに沿ったテストである**
- ✅ **実行可能なテストコードである**（構文エラーなし）
- ✅ **テストの意図が明確である**（Given-When-Then、コメント）
- ✅ **適切なモックが使われている**（外部依存を全てモック）
- ✅ **基本的なケースとエラーケースの両方がある**（正常系、異常系、境界値）

Phase 5の全ての品質ゲートをクリアしました。Phase 6（Testing）に進めます。

---

**テスト実装完了日**: 2025-01-30
**実装者**: AI Workflow Agent (Claude)
**Phase**: 5 (Test Implementation)
**ステータス**: ✅ 完了（全テストファイル作成済み）
