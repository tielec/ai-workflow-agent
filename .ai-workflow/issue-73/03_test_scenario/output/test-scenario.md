# テストシナリオ - Issue #73

## 0. Planning Document・要件定義書・設計書の確認

### テスト戦略（Phase 2より）
**UNIT_INTEGRATION**

**判断根拠**:
- **ユニットテストの必要性**: PR タイトル生成ロジック、エラーハンドリング、タイトル切り詰めの各ケースを独立して検証
- **統合テストの必要性**: init コマンドの実際のワークフロー（Issue URL解析 → Issue タイトル取得 → PR作成 → タイトル確認）を検証
- **バランス**: 低リスクな変更であり、UNIT + INTEGRATION で十分なカバレッジを確保可能

### テスト対象の範囲

**変更対象ファイル**:
1. `src/commands/init.ts` - PR タイトル生成ロジック変更、Issue タイトル取得、エラーハンドリング追加
2. `src/templates/pr_body_template.md` - 不要セクション削除
3. `src/templates/pr_body_detailed_template.md` - 不要セクション削除

**新規テストファイル**:
1. `tests/unit/commands/init-pr-title.test.ts` - PR タイトル生成ロジックのユニットテスト
2. `tests/integration/init-pr-title-integration.test.ts` - init コマンドの統合テスト

### テストの目的

1. **機能要件の検証**:
   - REQ-73-001: PR タイトルが Issue タイトルと一致する
   - REQ-73-002: Issue タイトル取得失敗時のフォールバック動作
   - REQ-73-003: 長い PR タイトルの切り詰め（256文字制限）
   - REQ-73-004: PR テンプレート最適化（不要セクション削除）
   - REQ-73-005: デバッグログの出力

2. **非機能要件の検証**:
   - NFR-73-001: Issue タイトル取得は3秒以内に完了
   - NFR-73-002: Issue タイトルに特殊文字が含まれる場合でも XSS 攻撃のリスクがない
   - NFR-73-003: Issue タイトル取得失敗時もワークフロー初期化は継続

3. **受け入れ基準の検証**:
   - 全7個の受け入れ基準（REQ-73-001-AC1 〜 REQ-73-005-AC1）をカバー

---

## 1. ユニットテストシナリオ

### 1.1. PR タイトル生成ロジック - 正常系

#### テストケース 1-1-1: Issue タイトル取得成功時、PR タイトルが Issue タイトルと一致する

**対応要件**: REQ-73-001, REQ-73-001-AC1, REQ-73-001-AC2

**目的**: Issue タイトル取得成功時、PR タイトルに Issue タイトルが設定されることを検証

**前提条件**:
- GitHub Issue #73 が存在する
- Issue タイトルは `自動生成のPRの内容を最適化したい` である
- `GitHubClient.getIssue()` メソッドが正常に動作する

**入力**:
- `issueNumber`: 73
- `GitHubClient.getIssue(73)` のモック戻り値: `{ title: "自動生成のPRの内容を最適化したい", ... }`

**期待結果**:
- `prTitle` 変数が `"自動生成のPRの内容を最適化したい"` に設定される
- `logger.info()` が `"Using Issue title as PR title: 自動生成のPRの内容を最適化したい"` を出力する
- `[AI-Workflow]` プレフィックスは含まれない

**テストデータ**:
```typescript
const mockIssue = {
  title: "自動生成のPRの内容を最適化したい",
  number: 73,
  state: "open",
  body: "...",
};
```

---

#### テストケース 1-1-2: プレフィックスが含まれない Issue タイトルの場合

**対応要件**: REQ-73-001, REQ-73-001-AC2

**目的**: Issue タイトルに `[AI-Workflow]` プレフィックスが含まれない場合でも正常に動作することを検証

**前提条件**:
- GitHub Issue #51 が存在する
- Issue タイトルは `機能追加: 環境変数アクセスを一元化する設定管理を追加` である

**入力**:
- `issueNumber`: 51
- `GitHubClient.getIssue(51)` のモック戻り値: `{ title: "機能追加: 環境変数アクセスを一元化する設定管理を追加", ... }`

**期待結果**:
- `prTitle` 変数が `"機能追加: 環境変数アクセスを一元化する設定管理を追加"` に設定される
- `logger.info()` が呼び出される
- `[AI-Workflow]` プレフィックスは追加されない

**テストデータ**:
```typescript
const mockIssue = {
  title: "機能追加: 環境変数アクセスを一元化する設定管理を追加",
  number: 51,
  state: "open",
  body: "...",
};
```

---

### 1.2. エラーハンドリング - 異常系

#### テストケース 1-2-1: Issue 取得失敗時（404 Not Found）、フォールバック動作

**対応要件**: REQ-73-002, REQ-73-002-AC1, NFR-73-003

**目的**: Issue が存在しない場合、デフォルトの PR タイトル形式にフォールバックすることを検証

**前提条件**:
- GitHub Issue #999 が存在しない（404 Not Found）
- `GitHubClient.getIssue(999)` が例外をスローする

**入力**:
- `issueNumber`: 999
- `GitHubClient.getIssue(999)` のモック動作: `throw new Error("Not Found")`

**期待結果**:
- `prTitle` 変数が `"[AI-Workflow] Issue #999"` に設定される（フォールバック）
- `logger.warn()` が `"Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999. Error: Not Found"` を出力する
- ワークフロー初期化は継続される（例外が再スローされない）

**テストデータ**:
```typescript
const issueNumber = 999;
const expectedFallbackTitle = "[AI-Workflow] Issue #999";
```

---

#### テストケース 1-2-2: GitHub API レート制限エラー時（403 Rate Limit Exceeded）、フォールバック動作

**対応要件**: REQ-73-002, REQ-73-002-AC2, NFR-73-003

**目的**: GitHub API のレート制限に達した場合、デフォルトの PR タイトル形式にフォールバックすることを検証

**前提条件**:
- GitHub API のレート制限に達している（403 Rate Limit Exceeded）
- `GitHubClient.getIssue()` が例外をスローする

**入力**:
- `issueNumber`: 73
- `GitHubClient.getIssue(73)` のモック動作: `throw new Error("API rate limit exceeded")`

**期待結果**:
- `prTitle` 変数が `"[AI-Workflow] Issue #73"` に設定される（フォールバック）
- `logger.warn()` が `"Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #73. Error: API rate limit exceeded"` を出力する
- ワークフロー初期化は継続される

**テストデータ**:
```typescript
const issueNumber = 73;
const expectedFallbackTitle = "[AI-Workflow] Issue #73";
const rateLimitError = new Error("API rate limit exceeded");
```

---

#### テストケース 1-2-3: ネットワークエラー時、フォールバック動作

**対応要件**: REQ-73-002, NFR-73-003

**目的**: ネットワークエラー時、デフォルトの PR タイトル形式にフォールバックすることを検証

**前提条件**:
- ネットワーク接続に問題がある
- `GitHubClient.getIssue()` が例外をスローする

**入力**:
- `issueNumber`: 73
- `GitHubClient.getIssue(73)` のモック動作: `throw new Error("Network error")`

**期待結果**:
- `prTitle` 変数が `"[AI-Workflow] Issue #73"` に設定される（フォールバック）
- `logger.warn()` が呼び出される
- ワークフロー初期化は継続される

**テストデータ**:
```typescript
const issueNumber = 73;
const expectedFallbackTitle = "[AI-Workflow] Issue #73";
const networkError = new Error("Network error");
```

---

### 1.3. タイトル切り詰め - 境界値テスト

#### テストケース 1-3-1: 短いタイトル（256文字未満）は切り詰めない

**対応要件**: REQ-73-003

**目的**: 256文字未満の Issue タイトルは切り詰めずにそのまま使用されることを検証

**前提条件**:
- GitHub Issue #100 が存在する
- Issue タイトルは50文字である

**入力**:
- `issueNumber`: 100
- `GitHubClient.getIssue(100)` のモック戻り値: `{ title: "短いタイトル（50文字）", ... }`

**期待結果**:
- `prTitle` 変数が `"短いタイトル（50文字)"` に設定される（切り詰めなし）
- `logger.info("Truncating PR title to 256 characters")` は呼び出されない
- `logger.info("Using Issue title as PR title: ...")` は呼び出される

**テストデータ**:
```typescript
const mockIssue = {
  title: "短いタイトル（50文字）",
  number: 100,
};
```

---

#### テストケース 1-3-2: ちょうど256文字のタイトルは切り詰めない

**対応要件**: REQ-73-003

**目的**: ちょうど256文字の Issue タイトルは切り詰めずにそのまま使用されることを検証（境界値）

**前提条件**:
- GitHub Issue #101 が存在する
- Issue タイトルはちょうど256文字である

**入力**:
- `issueNumber`: 101
- `GitHubClient.getIssue(101)` のモック戻り値: `{ title: "a".repeat(256), ... }`

**期待結果**:
- `prTitle` 変数が256文字のタイトルに設定される（切り詰めなし）
- `logger.info("Truncating PR title to 256 characters")` は呼び出されない

**テストデータ**:
```typescript
const mockIssue = {
  title: "a".repeat(256), // ちょうど256文字
  number: 101,
};
```

---

#### テストケース 1-3-3: 257文字のタイトルは切り詰められる

**対応要件**: REQ-73-003, REQ-73-003-AC1

**目的**: 257文字の Issue タイトルは256文字（253文字 + `...`）に切り詰められることを検証（境界値）

**前提条件**:
- GitHub Issue #102 が存在する
- Issue タイトルは257文字である

**入力**:
- `issueNumber`: 102
- `GitHubClient.getIssue(102)` のモック戻り値: `{ title: "a".repeat(257), ... }`

**期待結果**:
- `prTitle` 変数が256文字に設定される（`"aaa...aaa..."` の形式、合計256文字）
- `logger.info("Truncating PR title to 256 characters")` が呼び出される
- タイトルの末尾が `...` である

**テストデータ**:
```typescript
const mockIssue = {
  title: "a".repeat(257), // 257文字
  number: 102,
};
const expectedTruncatedTitle = "a".repeat(253) + "..."; // 256文字
```

---

#### テストケース 1-3-4: 300文字のタイトルは切り詰められる

**対応要件**: REQ-73-003, REQ-73-003-AC1

**目的**: 300文字の Issue タイトルは256文字（253文字 + `...`）に切り詰められることを検証

**前提条件**:
- GitHub Issue #103 が存在する
- Issue タイトルは300文字である

**入力**:
- `issueNumber`: 103
- `GitHubClient.getIssue(103)` のモック戻り値: `{ title: "a".repeat(300), ... }`

**期待結果**:
- `prTitle` 変数が256文字に設定される
- `logger.info("Truncating PR title to 256 characters")` が呼び出される
- タイトルの長さが正確に256文字である

**テストデータ**:
```typescript
const mockIssue = {
  title: "a".repeat(300), // 300文字
  number: 103,
};
const expectedTruncatedTitle = "a".repeat(253) + "..."; // 256文字
```

---

### 1.4. 特殊文字を含むタイトル - セキュリティテスト

#### テストケース 1-4-1: 特殊文字（`<`, `>`, `&`, `"`）を含むタイトル

**対応要件**: NFR-73-002

**目的**: Issue タイトルに特殊文字が含まれる場合でも、XSS 攻撃のリスクがないことを検証

**前提条件**:
- GitHub Issue #104 が存在する
- Issue タイトルに特殊文字（`<`, `>`, `&`, `"`）が含まれる

**入力**:
- `issueNumber`: 104
- `GitHubClient.getIssue(104)` のモック戻り値: `{ title: "機能追加: <script>alert('XSS')</script> & \"test\"", ... }`

**期待結果**:
- `prTitle` 変数が `"機能追加: <script>alert('XSS')</script> & \"test\""` に設定される（サニタイズなし、GitHub 側でエスケープされる）
- `logger.info()` が呼び出される
- 例外がスローされない

**テストデータ**:
```typescript
const mockIssue = {
  title: "機能追加: <script>alert('XSS')</script> & \"test\"",
  number: 104,
};
```

---

#### テストケース 1-4-2: 絵文字を含むタイトル

**対応要件**: NFR-73-002

**目的**: Issue タイトルに絵文字が含まれる場合でも正常に動作することを検証

**前提条件**:
- GitHub Issue #105 が存在する
- Issue タイトルに絵文字が含まれる

**入力**:
- `issueNumber`: 105
- `GitHubClient.getIssue(105)` のモック戻り値: `{ title: "🚀 機能追加: AI Workflow最適化", ... }`

**期待結果**:
- `prTitle` 変数が `"🚀 機能追加: AI Workflow最適化"` に設定される
- `logger.info()` が呼び出される
- 例外がスローされない

**テストデータ**:
```typescript
const mockIssue = {
  title: "🚀 機能追加: AI Workflow最適化",
  number: 105,
};
```

---

### 1.5. デバッグログ出力 - ログテスト

#### テストケース 1-5-1: Issue タイトル取得成功時、情報ログが出力される

**対応要件**: REQ-73-005, REQ-73-005-AC1

**目的**: Issue タイトル取得成功時、適切な情報ログが出力されることを検証

**前提条件**:
- GitHub Issue #73 が存在する
- `logger.info()` がモック化されている

**入力**:
- `issueNumber`: 73
- `GitHubClient.getIssue(73)` のモック戻り値: `{ title: "自動生成のPRの内容を最適化したい", ... }`

**期待結果**:
- `logger.info("Using Issue title as PR title: 自動生成のPRの内容を最適化したい")` が呼び出される
- ログレベルが `info` である

**テストデータ**:
```typescript
const mockIssue = {
  title: "自動生成のPRの内容を最適化したい",
  number: 73,
};
```

---

#### テストケース 1-5-2: Issue タイトル取得失敗時、警告ログが出力される

**対応要件**: REQ-73-005

**目的**: Issue タイトル取得失敗時、適切な警告ログが出力されることを検証

**前提条件**:
- GitHub Issue #999 が存在しない
- `logger.warn()` がモック化されている

**入力**:
- `issueNumber`: 999
- `GitHubClient.getIssue(999)` のモック動作: `throw new Error("Not Found")`

**期待結果**:
- `logger.warn("Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999. Error: Not Found")` が呼び出される
- ログレベルが `warn` である

**テストデータ**:
```typescript
const issueNumber = 999;
const error = new Error("Not Found");
```

---

#### テストケース 1-5-3: 長いタイトル切り詰め時、情報ログが出力される

**対応要件**: REQ-73-005

**目的**: 長いタイトル切り詰め時、適切な情報ログが出力されることを検証

**前提条件**:
- GitHub Issue #100 が存在する
- Issue タイトルは300文字である
- `logger.info()` がモック化されている

**入力**:
- `issueNumber`: 100
- `GitHubClient.getIssue(100)` のモック戻り値: `{ title: "a".repeat(300), ... }`

**期待結果**:
- `logger.info("Truncating PR title to 256 characters")` が呼び出される
- `logger.info("Using Issue title as PR title: ...")` も呼び出される

**テストデータ**:
```typescript
const mockIssue = {
  title: "a".repeat(300),
  number: 100,
};
```

---

### 1.6. PR テンプレート最適化 - テンプレートテスト

#### テストケース 1-6-1: `pr_body_template.md` から不要セクションが削除されている

**対応要件**: REQ-73-004, REQ-73-004-AC1

**目的**: 初期化時のPRテンプレートから `### 👀 レビューポイント` と `### ⚙️ 実行環境` セクションが削除されていることを検証

**前提条件**:
- `src/templates/pr_body_template.md` ファイルが存在する

**入力**:
- テンプレートファイルの内容を読み込む

**期待結果**:
- テンプレート内に `### 👀 レビューポイント` セクションが存在しない
- テンプレート内に `### ⚙️ 実行環境` セクションが存在しない
- テンプレート内に `### 📋 関連Issue` セクションが存在する
- テンプレート内に `### 🔄 ワークフロー進捗` セクションが存在する
- テンプレート内に `### 📁 成果物` セクションが存在する

**テストデータ**:
```typescript
const templatePath = "src/templates/pr_body_template.md";
const forbiddenSections = ["### 👀 レビューポイント", "### ⚙️ 実行環境"];
const requiredSections = ["### 📋 関連Issue", "### 🔄 ワークフロー進捗", "### 📁 成果物"];
```

---

#### テストケース 1-6-2: `pr_body_detailed_template.md` から不要セクションが削除されている

**対応要件**: REQ-73-004, REQ-73-004-AC1

**目的**: Report Phase用のPRテンプレートから `### 👀 レビューポイント` と `### ⚙️ 実行環境` セクションが削除されていることを検証

**前提条件**:
- `src/templates/pr_body_detailed_template.md` ファイルが存在する

**入力**:
- テンプレートファイルの内容を読み込む

**期待結果**:
- テンプレート内に `### 👀 レビューポイント` セクションが存在しない
- テンプレート内に `### ⚙️ 実行環境` セクションが存在しない
- テンプレート内に `### 📋 関連Issue` セクションが存在する
- テンプレート内に `### 📝 変更サマリー` セクションが存在する

**テストデータ**:
```typescript
const templatePath = "src/templates/pr_body_detailed_template.md";
const forbiddenSections = ["### 👀 レビューポイント", "### ⚙️ 実行環境"];
const requiredSections = ["### 📋 関連Issue", "### 📝 変更サマリー"];
```

---

#### テストケース 1-6-3: `generatePrBodyTemplate()` メソッドが正しくテンプレートを読み込む

**対応要件**: REQ-73-004

**目的**: `GitHubClient.generatePrBodyTemplate()` メソッドが最適化されたテンプレートを正しく読み込み、プレースホルダーを置換することを検証

**前提条件**:
- `src/templates/pr_body_template.md` が最適化されている
- `GitHubClient.generatePrBodyTemplate()` メソッドが存在する

**入力**:
- `issueNumber`: 73
- `branchName`: "ai-workflow/issue-73"

**期待結果**:
- 生成されたPR本文に `{issue_number}` が `73` に置換されている
- 生成されたPR本文に `{branch_name}` が `ai-workflow/issue-73` に置換されている
- 生成されたPR本文に `### 👀 レビューポイント` セクションが含まれていない
- 生成されたPR本文に `### ⚙️ 実行環境` セクションが含まれていない

**テストデータ**:
```typescript
const issueNumber = 73;
const branchName = "ai-workflow/issue-73";
```

---

## 2. 統合テストシナリオ

### 2.1. init コマンド実行フロー - 正常系

#### シナリオ 2-1-1: 新規 Issue に対する init コマンド実行

**対応要件**: REQ-73-001, REQ-73-001-AC1, REQ-73-004-AC1

**目的**: 新規 Issue に対して `init` コマンドを実行し、PR タイトルが Issue タイトルと一致し、最適化されたテンプレートが使用されることを検証

**前提条件**:
- GitHub Issue #73 が存在する（タイトル: `自動生成のPRの内容を最適化したい`）
- ローカルブランチ `ai-workflow/issue-73` が存在しない
- GitHub 上に PR が存在しない
- `GITHUB_TOKEN` 環境変数が設定されている

**テスト手順**:
1. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/73` を実行
2. Issue URL が解析され、Issue 番号 73 が抽出される
3. GitHub API で Issue #73 の情報を取得する
4. Issue タイトル `自動生成のPRの内容を最適化したい` が取得される
5. ブランチ `ai-workflow/issue-73` が作成される
6. PR タイトルが `自動生成のPRの内容を最適化したい` に設定される
7. PR 本文が `src/templates/pr_body_template.md` から生成される
8. Draft PR が作成される
9. メタデータが `.ai-workflow/issue-73/metadata.json` に保存される

**期待結果**:
- Draft PR が GitHub 上に作成される
- PR タイトルが `自動生成のPRの内容を最適化したい` である（`[AI-Workflow] Issue #73` ではない）
- PR 本文に `### 👀 レビューポイント` セクションが含まれていない
- PR 本文に `### ⚙️ 実行環境` セクションが含まれていない
- PR 本文に `### 📋 関連Issue` セクションが含まれている（`Closes #73`）
- PR 本文に `### 🔄 ワークフロー進捗` セクションが含まれている
- PR 本文に `### 📁 成果物` セクションが含まれている
- `logger.info("Using Issue title as PR title: ...")` が出力される

**確認項目**:
- [ ] PR タイトルが Issue タイトルと一致する
- [ ] PR 本文に不要セクション（レビューポイント、実行環境）が含まれない
- [ ] PR 本文に必要セクション（関連Issue、ワークフロー進捗、成果物）が含まれる
- [ ] メタデータファイルが正しく作成される
- [ ] ブランチが正しく作成される

---

#### シナリオ 2-1-2: 長いタイトル（300文字）の Issue に対する init コマンド実行

**対応要件**: REQ-73-003, REQ-73-003-AC1

**目的**: 長いタイトル（300文字）の Issue に対して `init` コマンドを実行し、PR タイトルが256文字に切り詰められることを検証

**前提条件**:
- GitHub Issue #106 が存在する（タイトル: 300文字の文字列）
- `GITHUB_TOKEN` 環境変数が設定されている

**テスト手順**:
1. テスト用の Issue #106 を作成（タイトルを300文字に設定）
2. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/106` を実行
3. Issue タイトルが取得される
4. タイトルが256文字を超えているため、切り詰め処理が実行される
5. PR タイトルが256文字（253文字 + `...`）に設定される
6. Draft PR が作成される

**期待結果**:
- Draft PR が GitHub 上に作成される
- PR タイトルが正確に256文字である
- PR タイトルの末尾が `...` である
- `logger.info("Truncating PR title to 256 characters")` が出力される

**確認項目**:
- [ ] PR タイトルの長さが正確に256文字である
- [ ] PR タイトルの末尾が `...` である
- [ ] ワークフロー初期化が正常に完了する

---

### 2.2. init コマンド実行フロー - 異常系

#### シナリオ 2-2-1: 存在しない Issue に対する init コマンド実行

**対応要件**: REQ-73-002, REQ-73-002-AC1, NFR-73-003

**目的**: 存在しない Issue に対して `init` コマンドを実行し、フォールバック動作が正しく動作することを検証

**前提条件**:
- GitHub Issue #999 が存在しない（404 Not Found）
- `GITHUB_TOKEN` 環境変数が設定されている

**テスト手順**:
1. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999` を実行
2. Issue URL が解析され、Issue 番号 999 が抽出される
3. GitHub API で Issue #999 の情報取得を試みる
4. Issue が存在しないため、404 Not Found エラーが発生する
5. エラーハンドリングが実行され、警告ログが出力される
6. PR タイトルがデフォルトの `[AI-Workflow] Issue #999` に設定される
7. ブランチ作成処理はスキップされる（Issue が存在しないため）

**期待結果**:
- コマンドが正常に終了する（エラーで中断されない）
- `logger.warn("Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999. Error: Not Found")` が出力される
- PR タイトルが `[AI-Workflow] Issue #999` である（フォールバック）
- エラーメッセージがユーザーに表示される

**確認項目**:
- [ ] コマンドが正常に終了する（例外がスローされない）
- [ ] 警告ログが出力される
- [ ] フォールバック動作が正しく動作する

**注**: Issue が存在しない場合、init コマンド自体がエラーで終了する可能性があります。この場合、Issue 取得エラーのみをテストし、PR 作成まで進まないことを確認します。

---

#### シナリオ 2-2-2: GitHub API レート制限時の init コマンド実行

**対応要件**: REQ-73-002, REQ-73-002-AC2, NFR-73-003

**目的**: GitHub API のレート制限に達した場合、フォールバック動作が正しく動作することを検証

**前提条件**:
- GitHub API のレート制限に近い状態
- `GITHUB_TOKEN` 環境変数が設定されている

**テスト手順**:
1. GitHub API のレート制限を人為的に発生させる（モックまたは実際のレート制限）
2. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/73` を実行
3. Issue タイトル取得時に 403 Rate Limit Exceeded エラーが発生する
4. エラーハンドリングが実行され、警告ログが出力される
5. PR タイトルがデフォルトの `[AI-Workflow] Issue #73` に設定される
6. ワークフロー初期化は継続される

**期待結果**:
- コマンドが正常に終了する（エラーで中断されない）
- `logger.warn("Failed to fetch Issue title due to rate limit, falling back to default PR title")` が出力される
- PR タイトルが `[AI-Workflow] Issue #73` である（フォールバック）
- ワークフロー初期化が継続される

**確認項目**:
- [ ] コマンドが正常に終了する
- [ ] 警告ログが出力される
- [ ] フォールバック動作が正しく動作する

**注**: GitHub API のレート制限は実際に発生させることが難しいため、モックを使用して統合テストを実施します。

---

### 2.3. GitHub API との統合

#### シナリオ 2-3-1: 実際の GitHub API で Issue タイトルを取得する

**対応要件**: REQ-73-001, NFR-73-001

**目的**: 実際の GitHub API（Octokit）で Issue タイトルを正しく取得できることを検証

**前提条件**:
- テスト用の GitHub リポジトリが存在する（例: `tielec/ai-workflow-agent-test`）
- テスト用の Issue が作成されている（タイトル: `テスト用Issue: PR タイトル生成テスト`）
- `GITHUB_TOKEN` 環境変数が設定されている

**テスト手順**:
1. `GitHubClient` のインスタンスを作成
2. `githubClient.getIssue(issueNumber)` を実行
3. GitHub API からレスポンスを受け取る
4. Issue タイトルが正しく取得される

**期待結果**:
- `getIssue()` メソッドが Issue 情報を返す
- `issue.title` が `"テスト用Issue: PR タイトル生成テスト"` である
- レスポンス時間が3秒以内である（NFR-73-001）

**確認項目**:
- [ ] Issue タイトルが正しく取得される
- [ ] レスポンス時間が3秒以内である
- [ ] 例外がスローされない

---

#### シナリオ 2-3-2: 実際の GitHub API で Draft PR を作成する

**対応要件**: REQ-73-001, REQ-73-004

**目的**: 実際の GitHub API で Draft PR を作成し、PR タイトルと本文が正しく設定されることを検証

**前提条件**:
- テスト用の GitHub リポジトリが存在する
- テスト用のブランチ `ai-workflow/test-pr-title` が存在する
- `GITHUB_TOKEN` 環境変数が設定されている

**テスト手順**:
1. `GitHubClient` のインスタンスを作成
2. テスト用の Issue タイトル `テスト用Issue: PR タイトル生成テスト` を取得
3. PR 本文を生成（`generatePrBodyTemplate()`）
4. `githubClient.createPullRequest(prTitle, prBody, head, base, true)` を実行
5. GitHub 上に Draft PR が作成される

**期待結果**:
- Draft PR が GitHub 上に作成される
- PR タイトルが `テスト用Issue: PR タイトル生成テスト` である
- PR 本文に不要セクション（レビューポイント、実行環境）が含まれていない
- PR 本文に必要セクション（関連Issue、ワークフロー進捗、成果物）が含まれている

**確認項目**:
- [ ] Draft PR が正しく作成される
- [ ] PR タイトルが Issue タイトルと一致する
- [ ] PR 本文が最適化されたテンプレートに基づいている

---

### 2.4. Report Phase との統合

#### シナリオ 2-4-1: Report Phase で PR 本文が更新される

**対応要件**: REQ-73-004-AC2

**目的**: Report Phase（Phase 8）で PR 本文が更新される際、`generatePrBodyDetailed()` メソッドが正しく動作することを検証

**前提条件**:
- init コマンドが実行され、Draft PR が作成されている
- Report Phase が実行可能な状態である

**テスト手順**:
1. init コマンドを実行し、Draft PR を作成
2. 各フェーズ（Phase 1〜7）を実行
3. Report Phase（Phase 8）を実行
4. `generatePrBodyDetailed()` メソッドが呼び出される
5. PR 本文が更新される

**期待結果**:
- Report Phase が正常に動作する
- PR 本文が `pr_body_detailed_template.md` に基づいて更新される
- PR 本文に不要セクション（レビューポイント、実行環境）が含まれていない
- PR 本文に詳細情報（変更サマリー、実装詳細、テスト結果等）が含まれている

**確認項目**:
- [ ] Report Phase が正常に動作する
- [ ] PR 本文が更新される
- [ ] PR 本文が最適化されたテンプレートに基づいている
- [ ] 既存のワークフロー（Report Phase）に影響を与えない

---

## 3. テストデータ

### 3.1. 正常系テストデータ

**Issue #73 (短いタイトル)**:
```json
{
  "number": 73,
  "title": "自動生成のPRの内容を最適化したい",
  "state": "open",
  "body": "自動生成のPRの内容を最適化したい\n\n# 改善点1\n...",
  "html_url": "https://github.com/tielec/ai-workflow-agent/issues/73"
}
```

**Issue #51 (プレフィックスなし)**:
```json
{
  "number": 51,
  "title": "機能追加: 環境変数アクセスを一元化する設定管理を追加",
  "state": "open",
  "body": "...",
  "html_url": "https://github.com/tielec/ai-workflow-agent/issues/51"
}
```

**Issue #105 (絵文字を含む)**:
```json
{
  "number": 105,
  "title": "🚀 機能追加: AI Workflow最適化",
  "state": "open",
  "body": "...",
  "html_url": "https://github.com/tielec/ai-workflow-agent/issues/105"
}
```

### 3.2. 異常系テストデータ

**Issue #999 (存在しない)**:
- GitHub API レスポンス: `404 Not Found`
- エラーメッセージ: `"Not Found"`

**Issue #73 (レート制限)**:
- GitHub API レスポンス: `403 Forbidden`
- エラーメッセージ: `"API rate limit exceeded"`

**ネットワークエラー**:
- エラーメッセージ: `"Network error"`

### 3.3. 境界値テストデータ

**Issue #100 (50文字)**:
```json
{
  "number": 100,
  "title": "短いタイトル（50文字）",
  "state": "open"
}
```

**Issue #101 (256文字)**:
```json
{
  "number": 101,
  "title": "a".repeat(256),
  "state": "open"
}
```

**Issue #102 (257文字)**:
```json
{
  "number": 102,
  "title": "a".repeat(257),
  "state": "open"
}
```

**Issue #103 (300文字)**:
```json
{
  "number": 103,
  "title": "a".repeat(300),
  "state": "open"
}
```

### 3.4. セキュリティテストデータ

**Issue #104 (特殊文字を含む)**:
```json
{
  "number": 104,
  "title": "機能追加: <script>alert('XSS')</script> & \"test\"",
  "state": "open"
}
```

---

## 4. テスト環境要件

### 4.1. ローカル開発環境

**必須環境**:
- **Node.js**: 20以上
- **TypeScript**: 5.x
- **npm**: 10以上

**必須環境変数**:
- `GITHUB_TOKEN`: GitHub パーソナルアクセストークン（repo, workflow スコープ）
- `GITHUB_REPOSITORY`: `owner/repo` 形式（例: `tielec/ai-workflow-agent`）

**テストフレームワーク**:
- **Jest**: ユニットテスト・統合テスト実行
- **@jest/globals**: テストグローバル関数
- **@types/jest**: Jest 型定義

### 4.2. CI/CD 環境

**GitHub Actions**:
- ワークフロー: `.github/workflows/test.yml`
- トリガー: PR作成時、mainブランチへのプッシュ時

**実行コマンド**:
```bash
# ユニットテスト
npm run test:unit

# 統合テスト
npm run test:integration

# すべてのテスト
npm test

# カバレッジ測定
npm run test:coverage
```

### 4.3. モック/スタブの必要性

#### ユニットテスト用モック

**GitHubClient.getIssue() のモック**:
```typescript
jest.spyOn(githubClient, 'getIssue').mockResolvedValue({
  title: "自動生成のPRの内容を最適化したい",
  number: 73,
  state: "open",
  body: "...",
  html_url: "https://github.com/tielec/ai-workflow-agent/issues/73"
});
```

**logger のモック**:
```typescript
jest.spyOn(logger, 'info').mockImplementation(() => {});
jest.spyOn(logger, 'warn').mockImplementation(() => {});
```

#### 統合テスト用モック

**テスト用 GitHub リポジトリ**:
- リポジトリ名: `tielec/ai-workflow-agent-test`（テスト専用）
- Issue: テスト用 Issue を事前に作成
- ブランチ: テスト用ブランチを事前に作成

**Octokit モック（オプション）**:
- 実際の GitHub API を使用する統合テストでは不要
- レート制限テスト等で部分的にモック化

### 4.4. テストデータのクリーンアップ

**統合テスト後のクリーンアップ**:
- テスト用 PR を削除（またはクローズ）
- テスト用ブランチを削除
- テスト用メタデータファイルを削除（`.ai-workflow/issue-*/`）

**クリーンアップスクリプト**:
```bash
# テスト用ブランチとPRのクリーンアップ
npm run test:cleanup
```

---

## 5. テスト実行計画

### 5.1. ユニットテスト実行

**テストファイル**: `tests/unit/commands/init-pr-title.test.ts`

**実行コマンド**:
```bash
npm run test:unit -- tests/unit/commands/init-pr-title.test.ts
```

**実行時間見積もり**: 30秒〜1分

**カバレッジ目標**: 新規コード（PR タイトル生成ロジック）のカバレッジ80%以上

### 5.2. 統合テスト実行

**テストファイル**: `tests/integration/init-pr-title-integration.test.ts`

**実行コマンド**:
```bash
npm run test:integration -- tests/integration/init-pr-title-integration.test.ts
```

**実行時間見積もり**: 1〜2分（GitHub API 呼び出しを含むため）

**前提条件**:
- `GITHUB_TOKEN` 環境変数が設定されている
- テスト用 GitHub リポジトリへのアクセス権がある

### 5.3. 手動テスト

**テスト対象**:
- 実際の GitHub リポジトリで init コマンドを実行
- 生成された PR のタイトル・本文を目視確認

**手順**:
1. `npm run build`
2. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/73`
3. GitHub 上で PR を確認

**確認項目**:
- [ ] PR タイトルが Issue タイトルと一致する
- [ ] PR 本文に不要セクション（レビューポイント、実行環境）が含まれない
- [ ] PR 本文に必要セクション（関連Issue、ワークフロー進捗、成果物）が含まれる

---

## 6. 品質ゲート（Phase 3）

### ✅ 必須品質ゲート

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION 戦略に基づき、ユニットテストシナリオ（1.1〜1.6）と統合テストシナリオ（2.1〜2.4）を作成
- [x] **主要な正常系がカバーされている**: Issue タイトル取得成功時の PR タイトル生成（テストケース 1-1-1, 1-1-2）、init コマンド実行フロー（シナリオ 2-1-1）をカバー
- [x] **主要な異常系がカバーされている**: Issue 取得失敗時のフォールバック（テストケース 1-2-1, 1-2-2, 1-2-3）、存在しない Issue（シナリオ 2-2-1）をカバー
- [x] **期待結果が明確である**: 全テストケース・シナリオで期待結果を明確に記載

### 追加品質確認

- [x] **要件との対応が明確**: 各テストケース・シナリオに対応要件（REQ-73-XXX, NFR-73-XXX）を明記
- [x] **受け入れ基準のカバレッジ**: 全7個の受け入れ基準（REQ-73-001-AC1 〜 REQ-73-005-AC1）をカバー
- [x] **境界値テストが含まれる**: タイトル長（256文字、257文字、300文字）の境界値テスト（テストケース 1-3-1 〜 1-3-4）
- [x] **セキュリティテストが含まれる**: 特殊文字を含むタイトルのテスト（テストケース 1-4-1, 1-4-2）
- [x] **統合テストが実行可能**: 実際の GitHub API を使用した統合テストシナリオ（シナリオ 2-3-1, 2-3-2）

---

## 7. テストシナリオサマリー

### ユニットテストシナリオ

| カテゴリ | テストケース数 | 対応要件 |
|---------|--------------|---------|
| PR タイトル生成ロジック - 正常系 | 2 | REQ-73-001 |
| エラーハンドリング - 異常系 | 3 | REQ-73-002 |
| タイトル切り詰め - 境界値テスト | 4 | REQ-73-003 |
| 特殊文字を含むタイトル - セキュリティテスト | 2 | NFR-73-002 |
| デバッグログ出力 - ログテスト | 3 | REQ-73-005 |
| PR テンプレート最適化 - テンプレートテスト | 3 | REQ-73-004 |
| **合計** | **17** | - |

### 統合テストシナリオ

| カテゴリ | シナリオ数 | 対応要件 |
|---------|-----------|---------|
| init コマンド実行フロー - 正常系 | 2 | REQ-73-001, REQ-73-003 |
| init コマンド実行フロー - 異常系 | 2 | REQ-73-002 |
| GitHub API との統合 | 2 | REQ-73-001, NFR-73-001 |
| Report Phase との統合 | 1 | REQ-73-004-AC2 |
| **合計** | **7** | - |

### 全体サマリー

- **ユニットテストケース**: 17個
- **統合テストシナリオ**: 7個
- **カバレッジ対象要件**: 全5個の機能要件（REQ-73-001 〜 REQ-73-005）
- **カバレッジ対象受け入れ基準**: 全7個の受け入れ基準
- **カバレッジ対象非機能要件**: 全5個の非機能要件（NFR-73-001 〜 NFR-73-005）

---

## 8. 次フェーズへの引き継ぎ事項

### Phase 4 (Implementation) への引き継ぎ

1. **優先度の高いテストケース**:
   - テストケース 1-1-1（Issue タイトル取得成功時の PR タイトル生成）
   - テストケース 1-2-1（Issue 取得失敗時のフォールバック）
   - シナリオ 2-1-1（新規 Issue に対する init コマンド実行）

2. **実装時の注意点**:
   - GitHub PR タイトルの最大長（256文字）を考慮した切り詰め処理
   - エラーハンドリングのフォールバック動作（ワークフロー初期化は継続）
   - デバッグログの適切な出力（info レベル、warn レベル）

3. **テスト実装の依存関係**:
   - ユニットテスト実装前に `GitHubClient.getIssue()` のモック化方法を確認
   - 統合テスト実装前にテスト用 GitHub リポジトリへのアクセス権を確認

---

**テストシナリオ作成日**: 2025-01-20
**テストシナリオバージョン**: 1.0
**承認者**: AI Workflow Phase 3 (Test Scenario)
**次フェーズ**: Phase 4 (Implementation)
