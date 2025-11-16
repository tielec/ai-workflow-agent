# テストシナリオ - Issue #121

**Issue番号**: #121
**タイトル**: AIエージェントによる自動Issue作成機能の実装
**作成日**: 2025-01-30
**バージョン**: 1.0
**テスト戦略**: UNIT_INTEGRATION

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認し、以下の戦略に基づいてテストシナリオを作成します：

### テスト戦略
- **テスト戦略**: UNIT_INTEGRATION（ユニット重点 + 統合テスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）

### カバレッジ目標
- **ユニットテスト**: 85%以上（重複検出ロジック、探索エンジンの主要ロジック）
- **統合テスト**: 主要シナリオ（3カテゴリ × 2ケース = 6シナリオ）

### 段階的実装
- **Phase 1（MVP）**: バグ検出機能のみ実装（本テストシナリオの対象）
- **Phase 2（拡張）**: リファクタリング検出を追加（将来拡張）
- **Phase 3（完全版）**: 機能拡張提案を追加（将来拡張）

**本テストシナリオは Phase 1（MVP）のバグ検出機能を対象とします。**

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略
**UNIT_INTEGRATION**（Phase 2設計書より）

### 1.2 テスト対象の範囲

#### Unitテスト対象
1. **RepositoryAnalyzer（リポジトリ探索エンジン）**
   - `analyzeForBugs()`: 潜在的なバグ検出
   - `detectMissingErrorHandling()`: エラーハンドリング欠如検出
   - `detectTypeSafetyIssues()`: 型安全性問題検出
   - `detectResourceLeaks()`: リソースリーク検出
   - `extractCodeSnippet()`: コードスニペット抽出

2. **IssueDeduplicator（重複検出エンジン）**
   - `findSimilarIssues()`: 類似Issue検出
   - `filterByCosineSimilarity()`: コサイン類似度フィルタリング
   - `calculateSemanticSimilarity()`: LLM意味的判定
   - `textToVector()`: テキストベクトル化
   - `getCacheKey()`: キャッシュキー生成

3. **IssueGenerator（Issue生成エンジン）**
   - `generateIssues()`: Issue一括生成
   - `createIssue()`: 個別Issue作成
   - `generateIssueContent()`: LLM Issue本文生成
   - `generateTemplateBody()`: テンプレートベース生成（フォールバック）
   - `getLabels()`: ラベル生成

4. **AutoIssueCommandHandler（CLIコマンドハンドラ）**
   - `handleAutoIssueCommand()`: メインハンドラ
   - `validateAutoIssueOptions()`: オプションバリデーション
   - `analyzeByCategoryPhase1()`: カテゴリ別解析
   - `filterDuplicates()`: 重複フィルタリング
   - `displayDryRunResults()`: ドライラン表示
   - `displaySummary()`: サマリー表示

#### Integrationテスト対象
1. **エンドツーエンドフロー**
   - `auto-issue --category bug --limit 5 --dry-run` の完全実行
   - リポジトリ探索 → 重複検出 → Issue生成の統合フロー

2. **GitHub API連携**
   - 既存Issue一覧取得
   - Issue作成
   - ページネーション処理

3. **LLM API連携**
   - OpenAI API（重複検出、Issue本文生成）
   - エラーハンドリング（APIキー未設定、レート制限）

4. **既存モジュール統合**
   - GitHubClient統合
   - Config統合（環境変数管理）
   - Logger統合（ロギング）
   - SecretMasker統合（シークレット保護）

### 1.3 テストの目的
- **品質保証**: 潜在的なバグの早期発見
- **後方互換性**: 既存ワークフローへの影響がないことを保証
- **パフォーマンス**: 1000ファイル以下のリポジトリで10分以内に完了
- **セキュリティ**: SecretMaskerによるAPIキー保護を検証
- **ユーザビリティ**: ドライランモード、オプションバリデーションの動作確認

---

## 2. Unitテストシナリオ

### 2.1 RepositoryAnalyzer（リポジトリ探索エンジン）

#### テストケース 2.1.1: analyzeForBugs_正常系_エラーハンドリング欠如検出

- **目的**: 非同期関数でtry-catchが使用されていない箇所を正しく検出できることを検証
- **前提条件**:
  - モックリポジトリに非同期関数が存在
  - 一部の非同期関数にtry-catchが欠如
- **入力**:
  ```typescript
  // テストフィクスチャ: tests/fixtures/sample-repository/missing-error-handling.ts
  async function fetchDataWithoutTryCatch() {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  }
  ```
- **期待結果**:
  - `IssueCandidateResult[]` が返却される
  - 配列に1件のIssue候補が含まれる
  - `category: 'bug'`
  - `title: 'エラーハンドリングの欠如: fetchDataWithoutTryCatch() in missing-error-handling.ts'`
  - `confidence: 0.95`
  - `priority: 'High'`
- **テストデータ**: 上記TypeScriptコードスニペット

---

#### テストケース 2.1.2: analyzeForBugs_正常系_try-catchあり

- **目的**: 適切にtry-catchが実装されている非同期関数が誤検知されないことを検証
- **前提条件**:
  - モックリポジトリに非同期関数が存在
  - すべての非同期関数にtry-catchが実装済み
- **入力**:
  ```typescript
  async function fetchDataWithTryCatch() {
    try {
      const response = await fetch('https://api.example.com/data');
      return response.json();
    } catch (error) {
      logger.error('Failed to fetch data', error);
      throw error;
    }
  }
  ```
- **期待結果**:
  - `IssueCandidateResult[]` が返却される
  - 配列が空（Issue候補が検出されない）
- **テストデータ**: 上記TypeScriptコードスニペット

---

#### テストケース 2.1.3: detectTypeSafetyIssues_正常系_any型検出

- **目的**: any型が使用されている変数を正しく検出できることを検証
- **前提条件**: モックリポジトリにany型の変数宣言が存在
- **入力**:
  ```typescript
  const userData: any = await fetchUser();
  const config: any = loadConfig();
  ```
- **期待結果**:
  - `IssueCandidateResult[]` が返却される
  - 配列に2件のIssue候補が含まれる
  - 各候補の `category: 'bug'`
  - `title: '型安全性の問題: any型の使用 (userData) in ...'`
  - `confidence: 0.85`
  - `priority: 'Medium'`
- **テストデータ**: 上記TypeScriptコードスニペット

---

#### テストケース 2.1.4: detectResourceLeaks_正常系_未クローズストリーム検出

- **目的**: createReadStreamで作成されたストリームが適切にクローズされていない箇所を検出できることを検証
- **前提条件**: モックリポジトリにcreateReadStreamの使用箇所が存在
- **入力**:
  ```typescript
  const stream = fs.createReadStream('data.txt');
  // close()もpipe()も呼ばれていない
  ```
- **期待結果**:
  - `IssueCandidateResult[]` が返却される
  - 配列に1件のIssue候補が含まれる
  - `category: 'bug'`
  - `title: 'リソースリーク: createReadStream未クローズ in ...'`
  - `confidence: 0.80`
  - `priority: 'High'`
- **テストデータ**: 上記TypeScriptコードスニペット

---

#### テストケース 2.1.5: extractCodeSnippet_境界値_ファイル先頭

- **目的**: ファイル先頭付近（10行未満）のコードスニペット抽出が正しく動作することを検証
- **前提条件**: 20行のTypeScriptファイルが存在
- **入力**: `lineNumber: 3`
- **期待結果**:
  - 1行目から13行目までのコードスニペットが返却される（前後10行）
  - ファイル先頭を超えてマイナス行にならない
- **テストデータ**: 20行のTypeScriptサンプルファイル

---

#### テストケース 2.1.6: extractCodeSnippet_境界値_ファイル末尾

- **目的**: ファイル末尾付近のコードスニペット抽出が正しく動作することを検証
- **前提条件**: 20行のTypeScriptファイルが存在
- **入力**: `lineNumber: 18`
- **期待結果**:
  - 8行目から20行目までのコードスニペットが返却される
  - ファイル末尾を超えない
- **テストデータ**: 20行のTypeScriptサンプルファイル

---

#### テストケース 2.1.7: analyzeForBugs_異常系_空プロジェクト

- **目的**: ソースファイルが存在しない空プロジェクトでもエラーが発生しないことを検証
- **前提条件**: `src/` ディレクトリが存在しない、またはTypeScriptファイルが0件
- **入力**: 空のリポジトリルート
- **期待結果**:
  - `IssueCandidateResult[]` が返却される
  - 配列が空（Issue候補が0件）
  - エラーがスローされない
- **テストデータ**: 空のディレクトリ構造

---

### 2.2 IssueDeduplicator（重複検出エンジン）

#### テストケース 2.2.1: findSimilarIssues_正常系_重複検出

- **目的**: 既存Issueと高い類似度を持つIssue候補が重複として検出されることを検証
- **前提条件**:
  - GitHub APIで既存Issue「エラーハンドリングの欠如」が存在
  - LLM APIが類似度0.92を返却（モック）
- **入力**:
  ```typescript
  candidate = {
    title: '例外処理が不足している',
    description: '非同期関数でtry-catchが使用されていません',
    ...
  }
  threshold = 0.8
  ```
- **期待結果**:
  - `IssueSimilarityResult[]` が返却される
  - 配列に1件の類似Issue結果が含まれる
  - `issueNumber: 123`
  - `issueTitle: 'エラーハンドリングの欠如'`
  - `similarityScore: 0.92`
  - `isDuplicate: true`
- **テストデータ**: 上記Issue候補、既存Issueモックデータ

---

#### テストケース 2.2.2: findSimilarIssues_正常系_重複なし

- **目的**: 既存Issueと類似度が低いIssue候補が重複として検出されないことを検証
- **前提条件**:
  - GitHub APIで既存Issue「UI改善提案」が存在
  - LLM APIが類似度0.25を返却（モック）
- **入力**:
  ```typescript
  candidate = {
    title: 'エラーハンドリングの欠如',
    description: '非同期関数でtry-catchが使用されていません',
    ...
  }
  threshold = 0.8
  ```
- **期待結果**:
  - `IssueSimilarityResult[]` が返却される
  - 配列が空（類似Issueなし）
- **テストデータ**: 上記Issue候補、既存Issueモックデータ

---

#### テストケース 2.2.3: filterByCosineSimilarity_正常系_フィルタリング

- **目的**: コサイン類似度によるフィルタリングが正しく動作することを検証
- **前提条件**: 既存Issue3件（類似度0.7, 0.4, 0.9）が存在
- **入力**:
  - Issue候補
  - 既存Issue一覧
  - threshold = 0.6
- **期待結果**:
  - フィルタリング後のIssue一覧が返却される
  - 2件のIssue（類似度0.7, 0.9）が返却される
  - 類似度降順でソートされている（0.9, 0.7の順）
- **テストデータ**: Issue候補、既存Issue3件のモックデータ

---

#### テストケース 2.2.4: calculateSemanticSimilarity_正常系_LLM判定

- **目的**: LLM APIによる意味的類似度判定が正しく動作することを検証
- **前提条件**: OpenAI APIキーが設定されている（モック）
- **入力**:
  - Issue候補: 「エラーハンドリングの欠如」
  - 既存Issue: 「例外処理が不足している」
- **期待結果**:
  - 0.0〜1.0の類似度スコアが返却される
  - LLM APIが正しいプロンプトで呼び出される（モック検証）
  - プロンプトに「判定基準: 0.9〜1.0: ほぼ同じ問題...」が含まれる
- **テストデータ**: Issue候補、既存Issueのモックデータ

---

#### テストケース 2.2.5: calculateSemanticSimilarity_異常系_OpenAI未設定

- **目的**: OpenAI APIキー未設定時にエラーが発生せず、デフォルト値が返却されることを検証
- **前提条件**: OpenAI APIキーが未設定（`config.getOpenAiApiKey()` が null）
- **入力**: 任意のIssue候補と既存Issue
- **期待結果**:
  - 類似度スコア `0.0` が返却される
  - 警告ログ「OpenAI API key not configured...」が出力される
  - エラーがスローされない
- **テストデータ**: 任意のIssue候補、既存Issue

---

#### テストケース 2.2.6: textToVector_正常系_ベクトル化

- **目的**: テキストが正しく単語頻度ベースのベクトルに変換されることを検証
- **前提条件**: なし
- **入力**: `"error handling missing error handling"`
- **期待結果**:
  - `number[]` が返却される
  - 頻度の高い単語（"error": 2回, "handling": 2回, "missing": 1回）が上位に配置される
  - 配列長が最大100である
- **テストデータ**: 上記テキスト

---

#### テストケース 2.2.7: getCacheKey_正常系_キー生成

- **目的**: Issue候補から一意なキャッシュキーが生成されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  candidate = {
    category: 'bug',
    title: 'エラーハンドリングの欠如',
    file: 'src/main.ts',
    lineNumber: 123,
    ...
  }
  ```
- **期待結果**:
  - 文字列 `"bug:エラーハンドリングの欠如:src/main.ts:123"` が返却される
- **テストデータ**: 上記Issue候補

---

### 2.3 IssueGenerator（Issue生成エンジン）

#### テストケース 2.3.1: generateIssues_正常系_一括生成

- **目的**: 複数のIssue候補を一括でGitHubに作成できることを検証
- **前提条件**:
  - GitHub APIキーが設定されている（モック）
  - OpenAI APIキーが設定されている（モック）
- **入力**:
  ```typescript
  candidates = [
    { title: 'Issue 1', ... },
    { title: 'Issue 2', ... },
    { title: 'Issue 3', ... },
  ]
  ```
- **期待結果**:
  - 3件のIssueがGitHub APIで作成される（モック検証）
  - 各Issueに対して `createIssue()` が呼び出される
  - ログに「Issue created: Issue 1」等が出力される
- **テストデータ**: 上記Issue候補配列

---

#### テストケース 2.3.2: generateIssues_異常系_一部失敗

- **目的**: 一部のIssue作成が失敗しても、他のIssue作成が継続されることを検証
- **前提条件**:
  - 2件目のIssue作成でGitHub APIがエラーを返す（モック）
- **入力**:
  ```typescript
  candidates = [
    { title: 'Issue 1', ... },
    { title: 'Issue 2', ... },  // 失敗
    { title: 'Issue 3', ... },
  ]
  ```
- **期待結果**:
  - Issue 1とIssue 3が正常に作成される
  - Issue 2の作成失敗がログに記録される
  - エラーがスローされず、処理が継続される
- **テストデータ**: 上記Issue候補配列

---

#### テストケース 2.3.3: generateIssueContent_正常系_LLM生成

- **目的**: LLM APIでIssue本文が正しく生成されることを検証
- **前提条件**: OpenAI APIキーが設定されている（モック）
- **入力**:
  ```typescript
  candidate = {
    category: 'bug',
    title: 'エラーハンドリングの欠如',
    description: '非同期関数でtry-catchが使用されていません',
    file: 'src/main.ts',
    lineNumber: 123,
    codeSnippet: '...',
    suggestedFixes: ['try-catchブロックで囲む'],
    expectedBenefits: ['安定性向上'],
    priority: 'High',
  }
  ```
- **期待結果**:
  - Markdown形式のIssue本文が返却される
  - 本文に「## 概要」「## 詳細」「## 該当箇所」等のセクションが含まれる
  - 本文末尾に「🤖 この Issue は AI Workflow Agent により自動生成されました。」が含まれる
  - OpenAI APIが適切なプロンプトで呼び出される（モック検証）
- **テストデータ**: 上記Issue候補

---

#### テストケース 2.3.4: generateIssueContent_異常系_LLMフォールバック

- **目的**: LLM API障害時にテンプレートベース生成にフォールバックすることを検証
- **前提条件**:
  - OpenAI APIキーが設定されている
  - OpenAI APIがエラーを返す（モック）
- **入力**: 任意のIssue候補
- **期待結果**:
  - `generateTemplateBody()` が呼び出される
  - テンプレートベースのIssue本文が返却される
  - 警告ログ「LLM Issue generation failed...」が出力される
  - エラーがスローされない
- **テストデータ**: 任意のIssue候補

---

#### テストケース 2.3.5: generateTemplateBody_正常系_テンプレート生成

- **目的**: テンプレートベースのIssue本文生成が正しく動作することを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  candidate = {
    description: 'Test description',
    file: 'src/test.ts',
    lineNumber: 100,
    codeSnippet: 'const x = 1;',
    suggestedFixes: ['Fix 1', 'Fix 2'],
    expectedBenefits: ['Benefit 1', 'Benefit 2'],
    priority: 'Medium',
    category: 'bug',
  }
  ```
- **期待結果**:
  - Markdown形式のIssue本文が返却される
  - 本文に「## 概要」「## 詳細」「## 該当箇所」等のセクションが含まれる
  - `suggestedFixes` が「1. Fix 1\n2. Fix 2」形式で含まれる
  - 本文末尾に「🤖 この Issue は AI Workflow Agent により自動生成されました。」が含まれる
- **テストデータ**: 上記Issue候補

---

#### テストケース 2.3.6: getLabels_正常系_ラベル生成

- **目的**: Issue候補からGitHubラベルが正しく生成されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  candidate = {
    category: 'bug',
    priority: 'High',
    ...
  }
  ```
- **期待結果**:
  - 配列 `['auto-issue:bug', 'priority:high']` が返却される
- **テストデータ**: 上記Issue候補

---

#### テストケース 2.3.7: createIssue_正常系_SecretMasker統合

- **目的**: Issue作成前にSecretMaskerでシークレットが自動マスキングされることを検証
- **前提条件**:
  - Issue本文にAPIキー `sk-12345abcde` が含まれる
  - SecretMaskerが正しく動作する
- **入力**:
  ```typescript
  candidate = {
    title: 'Test Issue',
    description: 'APIキーはsk-12345abcdeです',
    ...
  }
  ```
- **期待結果**:
  - GitHub APIに送信されるIssue本文がマスキングされている（`sk-*****`）
  - SecretMaskerの `maskSecrets()` が呼び出される（モック検証）
- **テストデータ**: 上記Issue候補

---

### 2.4 AutoIssueCommandHandler（CLIコマンドハンドラ）

#### テストケース 2.4.1: handleAutoIssueCommand_正常系_完全実行

- **目的**: auto-issueコマンドが正常に完全実行されることを検証
- **前提条件**:
  - すべてのエンジンが正常に動作する（モック）
  - リポジトリに5件のバグ候補が存在
  - 重複なし
- **入力**:
  ```typescript
  options = {
    category: 'bug',
    limit: 5,
    dryRun: false,
    similarityThreshold: 0.8,
    creativeMode: false,
  }
  ```
- **期待結果**:
  - RepositoryAnalyzer、IssueDeduplicator、IssueGeneratorが順番に呼び出される
  - 5件のIssueが作成される
  - サマリーが表示される（「Total candidates: 5」「Issues created: 5」）
  - エラーがスローされない
- **テストデータ**: 上記オプション

---

#### テストケース 2.4.2: handleAutoIssueCommand_正常系_ドライラン

- **目的**: ドライランモードでIssue候補のみ表示されることを検証
- **前提条件**:
  - リポジトリに3件のバグ候補が存在
- **入力**:
  ```typescript
  options = {
    category: 'bug',
    limit: 5,
    dryRun: true,
    similarityThreshold: 0.8,
    creativeMode: false,
  }
  ```
- **期待結果**:
  - `displayDryRunResults()` が呼び出される
  - GitHub APIが呼び出されない（Issue作成されない）
  - ログに「[Dry Run] The following issues would be created:」が出力される
  - サマリーが表示される
- **テストデータ**: 上記オプション

---

#### テストケース 2.4.3: validateAutoIssueOptions_異常系_limit範囲外

- **目的**: limitオプションが範囲外の場合にバリデーションエラーが発生することを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  options = {
    category: 'bug',
    limit: 100,  // 最大50を超える
    dryRun: false,
    similarityThreshold: 0.8,
    creativeMode: false,
  }
  ```
- **期待結果**:
  - エラー「Limit must be between 1 and 50.」がスローされる
  - コマンド実行が中止される
- **テストデータ**: 上記オプション

---

#### テストケース 2.4.4: validateAutoIssueOptions_異常系_threshold範囲外

- **目的**: similarityThresholdオプションが範囲外の場合にバリデーションエラーが発生することを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  options = {
    category: 'bug',
    limit: 5,
    dryRun: false,
    similarityThreshold: 1.5,  // 1.0を超える
    creativeMode: false,
  }
  ```
- **期待結果**:
  - エラー「Similarity threshold must be between 0.0 and 1.0.」がスローされる
  - コマンド実行が中止される
- **テストデータ**: 上記オプション

---

#### テストケース 2.4.5: filterDuplicates_正常系_重複スキップ

- **目的**: 重複Issueがスキップされることを検証
- **前提条件**:
  - Issue候補3件
  - 既存Issueと重複が1件
- **入力**:
  ```typescript
  candidates = [
    { title: 'Issue 1', ... },
    { title: 'Issue 2', ... },  // 重複
    { title: 'Issue 3', ... },
  ]
  threshold = 0.8
  ```
- **期待結果**:
  - 配列に2件のIssue候補が返却される（Issue 1, Issue 3）
  - ログに「Skipping duplicate candidate: "Issue 2"...」が出力される
- **テストデータ**: 上記Issue候補配列

---

#### テストケース 2.4.6: displayDryRunResults_正常系_表示形式

- **目的**: ドライラン結果が正しい形式で表示されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  candidates = [
    {
      title: 'Test Issue',
      category: 'bug',
      priority: 'High',
      file: 'src/test.ts',
      lineNumber: 100,
      confidence: 0.95,
      description: 'Test description...',
    },
  ]
  ```
- **期待結果**:
  - ログに「[Dry Run] The following issues would be created:」が出力される
  - ログに「Issue #1: Test Issue (bug)」が出力される
  - ログに「Priority: High」が出力される
  - ログに「File: src/test.ts:100」が出力される
  - ログに「Confidence: 95%」が出力される
- **テストデータ**: 上記Issue候補配列

---

#### テストケース 2.4.7: displaySummary_正常系_サマリー表示

- **目的**: サマリーが正しい形式で表示されることを検証
- **前提条件**: なし
- **入力**:
  - totalCandidates = 10
  - uniqueCandidates = 7
  - createdIssues = 5
- **期待結果**:
  - ログに「Summary」が出力される
  - ログに「Total candidates: 10」が出力される
  - ログに「Duplicate skipped: 3」が出力される
  - ログに「Issues created: 5」が出力される
- **テストデータ**: 上記数値

---

## 3. Integrationテストシナリオ

### 3.1 エンドツーエンドフロー

#### シナリオ 3.1.1: auto-issue_bug_dryrun_完全実行

- **目的**: `auto-issue --category bug --limit 5 --dry-run` コマンドが完全に動作することを検証
- **前提条件**:
  - モックリポジトリが準備されている（`tests/fixtures/sample-repository/`）
  - モックリポジトリにバグ候補が10件存在
  - GitHub APIモックサーバーが起動している
  - OpenAI APIモックサーバーが起動している
- **テスト手順**:
  1. CLIコマンド `auto-issue --category bug --limit 5 --dry-run` を実行
  2. RepositoryAnalyzerがモックリポジトリを解析
  3. IssueDuplicatorが既存Issueとの重複をチェック
  4. 上限5件に制限
  5. ドライラン結果を表示（GitHub APIは呼び出さない）
  6. サマリーを表示
- **期待結果**:
  - コマンドが正常終了（exit code 0）
  - ログに「[Dry Run] The following issues would be created:」が表示される
  - 最大5件のIssue候補が表示される
  - GitHub APIのIssue作成が呼び出されない
  - サマリーに「Total candidates」「Duplicate skipped」「Issues created: 0」が表示される
- **確認項目**:
  - [ ] コマンドが正常終了する
  - [ ] バグ候補が5件以下で表示される
  - [ ] ドライラン形式で表示される
  - [ ] GitHub APIが呼び出されない
  - [ ] サマリーが正しい

---

#### シナリオ 3.1.2: auto-issue_bug_実際のIssue作成

- **目的**: `auto-issue --category bug --limit 3` コマンドで実際にIssueが作成されることを検証
- **前提条件**:
  - モックリポジトリが準備されている
  - モックリポジトリにバグ候補が5件存在
  - GitHub APIモックサーバーが起動している
  - OpenAI APIモックサーバーが起動している
- **テスト手順**:
  1. CLIコマンド `auto-issue --category bug --limit 3` を実行
  2. RepositoryAnalyzerがモックリポジトリを解析
  3. IssueDuplicatorが既存Issueとの重複をチェック
  4. 上限3件に制限
  5. IssueGeneratorがGitHub APIでIssueを作成
  6. サマリーを表示
- **期待結果**:
  - コマンドが正常終了（exit code 0）
  - GitHub APIでIssueが3件作成される（モックサーバーで検証）
  - 各IssueにラベルYAML `auto-issue:bug`, `priority:*` が付与される
  - ログに「Successfully created 3 issues.」が表示される
  - サマリーに「Issues created: 3」が表示される
- **確認項目**:
  - [ ] コマンドが正常終了する
  - [ ] GitHub APIで3件のIssueが作成される
  - [ ] 各Issueに適切なラベルが付与される
  - [ ] Issue本文がテンプレート形式に従っている
  - [ ] サマリーが正しい

---

#### シナリオ 3.1.3: auto-issue_all_重複スキップ

- **目的**: 重複Issueが正しくスキップされることを検証
- **前提条件**:
  - モックリポジトリにバグ候補が5件存在
  - 既存Issueに類似Issue「エラーハンドリングの欠如」が存在
  - GitHub APIモックサーバーで既存Issue一覧を返却
  - OpenAI APIモックサーバーで類似度0.92を返却
- **テスト手順**:
  1. CLIコマンド `auto-issue --category bug --limit 5` を実行
  2. RepositoryAnalyzerがバグ候補5件を検出
  3. IssueDuplicatorが既存Issueとの重複をチェック
  4. 1件が重複としてスキップされる
  5. IssueGeneratorが4件のIssueを作成
  6. サマリーを表示
- **期待結果**:
  - コマンドが正常終了（exit code 0）
  - ログに「Skipping duplicate candidate: "..." (similar to Issue #123)」が表示される
  - GitHub APIでIssueが4件作成される
  - サマリーに「Total candidates: 5」「Duplicate skipped: 1」「Issues created: 4」が表示される
- **確認項目**:
  - [ ] 重複Issueがスキップされる
  - [ ] 重複スキップログが出力される
  - [ ] 4件のIssueが作成される
  - [ ] サマリーが正しい

---

### 3.2 GitHub API連携

#### シナリオ 3.2.1: listAllIssues_ページネーション

- **目的**: GitHub APIでIssue一覧取得時にページネーション処理が正しく動作することを検証
- **前提条件**:
  - GitHub APIモックサーバーが起動している
  - リポジトリに250件のIssueが存在（モック）
- **テスト手順**:
  1. `IssueClient.listAllIssues()` を呼び出す
  2. GitHub APIが3回呼び出される（1回目: 100件、2回目: 100件、3回目: 50件）
  3. ページネーション処理が正しく動作
- **期待結果**:
  - 250件のIssueが返却される
  - GitHub APIが3回呼び出される（`page=1`, `page=2`, `page=3`）
  - ログに「Fetched 250 issues.」が表示される
- **確認項目**:
  - [ ] 250件すべてのIssueが返却される
  - [ ] ページネーション処理が正しい
  - [ ] APIリクエストが3回のみ

---

#### シナリオ 3.2.2: createIssue_ラベル付与

- **目的**: GitHub APIでIssue作成時にラベルが正しく付与されることを検証
- **前提条件**:
  - GitHub APIモックサーバーが起動している
- **テスト手順**:
  1. `IssueClient.createIssue()` を呼び出す
  2. ラベル配列 `['auto-issue:bug', 'priority:high']` を指定
  3. GitHub APIでIssueを作成
- **期待結果**:
  - Issueが作成される
  - 作成されたIssueにラベル `auto-issue:bug`, `priority:high` が付与される
  - Issue番号とURLが返却される
- **確認項目**:
  - [ ] Issueが作成される
  - [ ] ラベルが正しく付与される
  - [ ] Issue番号とURLが返却される

---

#### シナリオ 3.2.3: GitHub_API_エラーハンドリング

- **目的**: GitHub API障害時にエラーハンドリングが正しく動作することを検証
- **前提条件**:
  - GitHub APIモックサーバーが503エラーを返却
- **テスト手順**:
  1. `IssueClient.createIssue()` を呼び出す
  2. GitHub APIが503エラーを返却
  3. エラーハンドリングが実行される
- **期待結果**:
  - エラーがスローされる
  - ログに「Failed to create issue: ...」が出力される
  - エラーメッセージにHTTPステータスコードが含まれる
- **確認項目**:
  - [ ] エラーがスローされる
  - [ ] エラーログが出力される
  - [ ] エラーメッセージが明確

---

### 3.3 LLM API連携

#### シナリオ 3.3.1: OpenAI_API_重複検出

- **目的**: OpenAI APIによる重複検出が正しく動作することを検証
- **前提条件**:
  - OpenAI APIモックサーバーが起動している
  - モックサーバーが類似度0.88を返却
- **テスト手順**:
  1. `IssueDeduplicator.calculateSemanticSimilarity()` を呼び出す
  2. OpenAI APIに重複判定プロンプトを送信
  3. レスポンスをパースして類似度スコアを取得
- **期待結果**:
  - 類似度スコア `0.88` が返却される
  - OpenAI APIが正しいプロンプトで呼び出される
  - プロンプトに「判定基準: 0.9〜1.0: ほぼ同じ問題...」が含まれる
- **確認項目**:
  - [ ] 類似度スコアが返却される
  - [ ] OpenAI APIが呼び出される
  - [ ] プロンプトが正しい

---

#### シナリオ 3.3.2: OpenAI_API_Issue本文生成

- **目的**: OpenAI APIによるIssue本文生成が正しく動作することを検証
- **前提条件**:
  - OpenAI APIモックサーバーが起動している
  - モックサーバーがMarkdown形式のIssue本文を返却
- **テスト手順**:
  1. `IssueGenerator.generateIssueContent()` を呼び出す
  2. OpenAI APIにIssue本文生成プロンプトを送信
  3. レスポンスをパースしてIssue本文を取得
- **期待結果**:
  - Markdown形式のIssue本文が返却される
  - 本文に「## 概要」「## 詳細」等のセクションが含まれる
  - 本文末尾に「🤖 この Issue は AI Workflow Agent により自動生成されました。」が含まれる
- **確認項目**:
  - [ ] Issue本文が返却される
  - [ ] Markdown形式が正しい
  - [ ] 必須セクションが含まれる
  - [ ] 自動生成フッターが含まれる

---

#### シナリオ 3.3.3: LLM_API_レート制限エラー

- **目的**: LLM APIのレート制限エラー時にフォールバック処理が動作することを検証
- **前提条件**:
  - OpenAI APIモックサーバーが429エラー（Too Many Requests）を返却
- **テスト手順**:
  1. `IssueGenerator.generateIssueContent()` を呼び出す
  2. OpenAI APIが429エラーを返却
  3. フォールバック処理が実行される
- **期待結果**:
  - `generateTemplateBody()` が呼び出される
  - テンプレートベースのIssue本文が返却される
  - 警告ログ「LLM Issue generation failed...」が出力される
  - エラーがスローされない
- **確認項目**:
  - [ ] フォールバック処理が実行される
  - [ ] テンプレートベースの本文が返却される
  - [ ] 警告ログが出力される
  - [ ] エラーがスローされない

---

### 3.4 既存モジュール統合

#### シナリオ 3.4.1: Config統合_環境変数管理

- **目的**: 既存Configクラスによる環境変数管理が正しく動作することを検証
- **前提条件**:
  - 環境変数 `GITHUB_TOKEN`, `OPENAI_API_KEY` が設定されている
- **テスト手順**:
  1. `Config.getGitHubToken()` を呼び出す
  2. `Config.getOpenAiApiKey()` を呼び出す
  3. 環境変数が正しく取得される
- **期待結果**:
  - 環境変数の値が返却される
  - ハードコードされたAPIキーが存在しない
- **確認項目**:
  - [ ] 環境変数が正しく取得される
  - [ ] ハードコードされたAPIキーがない

---

#### シナリオ 3.4.2: Logger統合_ログ出力

- **目的**: 既存Loggerモジュールによるログ出力が正しく動作することを検証
- **前提条件**:
  - Loggerモジュールが設定されている
- **テスト手順**:
  1. `auto-issue` コマンドを実行
  2. 各エンジンがlogger.info(), logger.debug(), logger.error()を呼び出す
  3. ログが統一形式で出力される
- **期待結果**:
  - ログが統一形式で出力される
  - `console.log()` が使用されていない
  - ログレベル（debug, info, error）が正しい
- **確認項目**:
  - [ ] ログが統一形式で出力される
  - [ ] console.log()が使用されていない
  - [ ] ログレベルが正しい

---

#### シナリオ 3.4.3: SecretMasker統合_シークレット保護

- **目的**: 既存SecretMaskerクラスによるシークレット保護が正しく動作することを検証
- **前提条件**:
  - Issue本文にAPIキー `sk-12345abcde` が含まれる
- **テスト手順**:
  1. `IssueGenerator.createIssue()` を呼び出す
  2. SecretMaskerが自動的に呼び出される
  3. Issue本文のAPIキーがマスキングされる
  4. GitHub APIに送信される
- **期待結果**:
  - GitHub APIに送信されるIssue本文がマスキングされている（`sk-*****`）
  - SecretMaskerの `maskSecrets()` が呼び出される
  - マスキング前の元データがログに出力されない
- **確認項目**:
  - [ ] APIキーがマスキングされる
  - [ ] GitHub APIに送信される本文がマスキング済み
  - [ ] マスキング前のデータがログに出力されない

---

#### シナリオ 3.4.4: GitHubClient統合_既存ワークフローへの影響なし

- **目的**: 新しい `auto-issue` 機能が既存ワークフロー（init, execute, review, rollback）に影響を与えないことを検証
- **前提条件**:
  - 既存ワークフローコマンドが正常に動作している
- **テスト手順**:
  1. `auto-issue` コマンドを実行
  2. 既存ワークフローコマンド（`init`, `execute`, `review`, `rollback`）を実行
  3. 既存コマンドが正常に動作することを確認
- **期待結果**:
  - `auto-issue` コマンドが正常に動作する
  - 既存コマンドが正常に動作する
  - 既存コマンドの動作に変化がない
- **確認項目**:
  - [ ] auto-issueコマンドが正常に動作する
  - [ ] 既存コマンドが正常に動作する
  - [ ] 既存コマンドの動作に変化がない

---

## 4. テストデータ

### 4.1 モックリポジトリ構成

テストフィクスチャ: `tests/fixtures/sample-repository/`

```
sample-repository/
├── src/
│   ├── missing-error-handling.ts  # エラーハンドリング欠如のサンプル
│   ├── type-safety-issues.ts      # any型使用のサンプル
│   ├── resource-leaks.ts          # リソースリーク（未クローズストリーム）のサンプル
│   ├── good-code.ts               # 問題のないコード
│   └── empty-file.ts              # 空ファイル
├── tests/
│   └── sample.test.ts
├── package.json
└── tsconfig.json
```

### 4.2 テストフィクスチャ詳細

#### missing-error-handling.ts
```typescript
// エラーハンドリング欠如（Issue候補として検出される）
export async function fetchDataWithoutTryCatch() {
  const response = await fetch('https://api.example.com/data');
  return response.json();
}

// 正しいエラーハンドリング（検出されない）
export async function fetchDataWithTryCatch() {
  try {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  } catch (error) {
    logger.error('Failed to fetch data', error);
    throw error;
  }
}
```

#### type-safety-issues.ts
```typescript
// any型使用（Issue候補として検出される）
export function processData(data: any) {
  return data.value;
}

// 型安全なコード（検出されない）
export function processTypedData(data: { value: string }) {
  return data.value;
}
```

#### resource-leaks.ts
```typescript
import fs from 'node:fs';

// リソースリーク（Issue候補として検出される）
export function readFileWithoutClose() {
  const stream = fs.createReadStream('data.txt');
  // close()もpipe()も呼ばれていない
}

// 正しいリソース管理（検出されない）
export function readFileWithClose() {
  const stream = fs.createReadStream('data.txt');
  stream.on('end', () => stream.close());
}
```

### 4.3 既存Issueモックデータ

```json
[
  {
    "number": 123,
    "title": "エラーハンドリングの欠如",
    "body": "非同期関数でtry-catchが使用されていません。",
    "state": "open"
  },
  {
    "number": 124,
    "title": "UI改善提案",
    "body": "ユーザーインターフェースを改善する提案です。",
    "state": "open"
  },
  {
    "number": 125,
    "title": "パフォーマンス最適化",
    "body": "データベースクエリを最適化する必要があります。",
    "state": "open"
  }
]
```

### 4.4 LLMレスポンスモックデータ

#### 重複検出レスポンス（高類似度）
```json
{
  "choices": [
    {
      "message": {
        "content": "0.92"
      }
    }
  ]
}
```

#### 重複検出レスポンス（低類似度）
```json
{
  "choices": [
    {
      "message": {
        "content": "0.25"
      }
    }
  ]
}
```

#### Issue本文生成レスポンス
```markdown
## 概要
非同期関数 fetchDataWithoutTryCatch() でtry-catchが使用されていません。

## 詳細
この非同期関数では、fetch APIを使用してデータを取得していますが、try-catchブロックでエラーハンドリングが実装されていません。ネットワークエラーやAPIエラーが発生した場合、アプリケーションがクラッシュする可能性があります。

## 該当箇所
- ファイル: src/missing-error-handling.ts:2-5
- 関連コード:
\`\`\`typescript
export async function fetchDataWithoutTryCatch() {
  const response = await fetch('https://api.example.com/data');
  return response.json();
}
\`\`\`

## 提案される解決策
1. try-catchブロックで非同期関数を囲む
2. エラーをキャッチして適切なログを出力する
3. エラーを上位の呼び出し元に伝播させる

## 期待される効果
1. アプリケーションの安定性向上
2. エラー発生時のデバッグが容易に
3. 予期しないクラッシュの防止

## 優先度
High

## カテゴリ
bug
```

---

## 5. テスト環境要件

### 5.1 ローカル環境

#### 必須ソフトウェア
- Node.js 20以上
- npm 10以上
- TypeScript 5.x
- Git 2.x

#### 必須環境変数
```bash
GITHUB_TOKEN="ghp_test_token_12345"
OPENAI_API_KEY="sk-test_key_12345"
ANTHROPIC_API_KEY="sk-ant-test_key_12345"  # オプション
```

### 5.2 CI/CD環境

#### GitHub Actions
- Ubuntu 22.04（`ubuntu-latest`）
- Node.js 20
- Jest実行環境
- モックサーバー起動環境

#### 必須シークレット
- `GITHUB_TOKEN`（GitHub Actionsで自動設定）
- `OPENAI_API_KEY`（手動設定）
- `ANTHROPIC_API_KEY`（手動設定、オプション）

### 5.3 モック/スタブ

#### GitHub APIモック
- **ツール**: `nock` または `msw`（Mock Service Worker）
- **対象エンドポイント**:
  - `GET /repos/:owner/:repo/issues`（Issue一覧取得）
  - `POST /repos/:owner/:repo/issues`（Issue作成）
- **モックレスポンス**: 上記「4.3 既存Issueモックデータ」参照

#### OpenAI APIモック
- **ツール**: `nock` または `msw`
- **対象エンドポイント**:
  - `POST /v1/chat/completions`（チャット補完）
- **モックレスポンス**: 上記「4.4 LLMレスポンスモックデータ」参照

#### ファイルシステムモック
- **ツール**: `mock-fs` または `memfs`
- **対象**: テストフィクスチャ（`tests/fixtures/sample-repository/`）をメモリ上に構築

---

## 6. 品質ゲート（Phase 3: Test Scenario）

テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - UNIT_INTEGRATION戦略に準拠
  - Unitテストシナリオ: 27ケース（2.1〜2.4）
  - Integrationテストシナリオ: 13シナリオ（3.1〜3.4）

- [x] **主要な正常系がカバーされている**
  - リポジトリ探索エンジン: バグ検出の正常系（2.1.1, 2.1.2）
  - 重複検出エンジン: 重複検出・非重複の正常系（2.2.1, 2.2.2）
  - Issue生成エンジン: Issue作成の正常系（2.3.1, 2.3.3）
  - CLIコマンドハンドラ: 完全実行・ドライランの正常系（2.4.1, 2.4.2）
  - エンドツーエンドフロー: 完全実行（3.1.1, 3.1.2, 3.1.3）

- [x] **主要な異常系がカバーされている**
  - 空プロジェクト（2.1.7）
  - OpenAI未設定（2.2.5）
  - Issue作成一部失敗（2.3.2）
  - LLMフォールバック（2.3.4）
  - オプションバリデーションエラー（2.4.3, 2.4.4）
  - GitHub APIエラー（3.2.3）
  - LLMレート制限エラー（3.3.3）

- [x] **期待結果が明確である**
  - すべてのテストケースで「期待結果」セクションを明記
  - 具体的な出力値、エラーメッセージ、ログ内容を記載
  - 検証可能な判定基準（配列長、スコア値、ログ文言等）を明示

---

## 7. テスト実行計画

### 7.1 Phase 1（MVP）テスト実行順序

#### ステップ1: Unitテスト実行（優先度: 高）
```bash
npm run test:unit -- tests/unit/core/repository-analyzer.test.ts
npm run test:unit -- tests/unit/core/issue-deduplicator.test.ts
npm run test:unit -- tests/unit/core/issue-generator.test.ts
npm run test:unit -- tests/unit/commands/auto-issue.test.ts
```

**目標**: カバレッジ85%以上

#### ステップ2: Integrationテスト実行（優先度: 中）
```bash
npm run test:integration -- tests/integration/auto-issue-flow.test.ts
```

**目標**: 主要シナリオ（3カテゴリ × 2ケース = 6シナリオ）すべて合格

#### ステップ3: 手動テスト実行（優先度: 低）
```bash
node dist/index.js auto-issue --category bug --limit 5 --dry-run
```

**目標**: 実際のリポジトリで動作確認

### 7.2 継続的テスト戦略

#### GitHub Actions CI/CD
```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:coverage
```

#### カバレッジレポート
- **ツール**: Jest Coverage
- **目標**: 85%以上
- **レポート形式**: HTML、LCOV

---

## 8. 補足情報

### 8.1 Phase 2・Phase 3への拡張

Phase 1（MVP）完了後、以下のテストシナリオを追加予定：

- **Phase 2（リファクタリング検出）**:
  - `analyzeForRefactoring()` のUnitテスト
  - 大きすぎるファイル・関数検出
  - 重複コード検出
  - Cyclomatic Complexity計測

- **Phase 3（機能拡張提案）**:
  - `analyzeForEnhancements()` のUnitテスト
  - 創造的提案プロンプト検証
  - `--creative-mode` オプション検証

### 8.2 テストシナリオのメンテナンス

- **定期レビュー**: Phase 1完了後、テストシナリオの有効性をレビュー
- **フィードバック反映**: ユーザーフィードバックに基づき、テストケース追加
- **リグレッション防止**: バグ修正時に対応するテストケースを追加

---

**テストシナリオ承認**: このドキュメントは品質ゲート（4つの必須要件）を満たしており、実装フェーズに進むための基準を達成しています。
