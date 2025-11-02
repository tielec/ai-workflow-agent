# テストシナリオ - Issue #113

## 0. Planning Document & Requirements Document & Design Document の確認

以下のドキュメントを確認しました：
- Planning Document: @.ai-workflow/issue-113/00_planning/output/planning.md
- Requirements Document: @.ai-workflow/issue-113/01_requirements/output/requirements.md
- Design Document: @.ai-workflow/issue-113/02_design/output/design.md

**テスト戦略**: UNIT_INTEGRATION（Phase 2で決定）

**開発計画の概要**:
- **複雑度**: 中程度
- **見積もり工数**: 12~16時間
- **実装戦略**: EXTEND（既存の`BasePhase.executePhaseTemplate()`を拡張）
- **主要リスク**: BasePhase変更によるリグレッション、エージェント挙動変化

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**: ユニットテスト + 統合テスト

### 1.2 テスト対象の範囲

**ユニットテスト対象**:
- `BasePhase.handleMissingOutputFile()`: フォールバック処理の中核ロジック
- `BasePhase.extractContentFromLog()`: ログからの成果物抽出ロジック
- `BasePhase.isValidOutputContent()`: 抽出内容のバリデーション
- `BasePhase.getReviseFunction()`: 型安全なrevise()呼び出しヘルパー
- `BasePhase.executePhaseTemplate()`: フォールバックロジック統合後の動作

**統合テスト対象**:
- 6フェーズ（Planning、Requirements、Design、TestScenario、Implementation、Report）のフォールバック動作
- エンドツーエンドフロー（エージェント実行 → ファイル不在 → ログ抽出 → 成功）
- エンドツーエンドフロー（エージェント実行 → ファイル不在 → ログ抽出失敗 → revise → 成功）
- リグレッションテスト（既存フェーズの動作に影響がないこと）

### 1.3 テストの目的

1. **機能の正確性**: フォールバック機構が仕様通りに動作すること
2. **堅牢性**: エラーケースで適切なエラーハンドリングが行われること
3. **リグレッション防止**: 既存フェーズの動作に影響を与えないこと
4. **エンドツーエンド検証**: 実際のフェーズ実行でフォールバックが機能すること

---

## 2. ユニットテストシナリオ

### 2.1 BasePhase.extractContentFromLog()

#### テストケース 2.1.1: Planning Phase - ヘッダーパターンマッチ成功（正常系）

- **目的**: ログから「プロジェクト計画書」ヘッダーを検出し、内容を抽出できることを検証
- **前提条件**: エージェントログに有効なプロジェクト計画書が含まれている
- **入力**:
  ```typescript
  agentLog = `
Some agent output...

# プロジェクト計画書 - Issue #113

## 1. Issue分析
複雑度: 中程度

## 2. 実装戦略判断
実装戦略: EXTEND
...
`;
  phaseName = 'planning';
  ```
- **期待結果**:
  - 抽出結果が`null`でない
  - 抽出結果に「プロジェクト計画書」ヘッダーが含まれる
  - 抽出結果に「## 1. Issue分析」以降のコンテンツが含まれる
- **テストデータ**: 上記`agentLog`

#### テストケース 2.1.2: Requirements Phase - 英語ヘッダーマッチ成功（正常系）

- **目的**: ログから「Requirements Document」ヘッダーを検出し、内容を抽出できることを検証
- **前提条件**: エージェントログに英語の要件定義書が含まれている
- **入力**:
  ```typescript
  agentLog = `
Agent log here...

# Requirements Document - Issue #113

## 1. Overview
This document describes...

## 2. Functional Requirements
FR-1: ...
`;
  phaseName = 'requirements';
  ```
- **期待結果**:
  - 抽出結果が`null`でない
  - 抽出結果に「Requirements Document」ヘッダーが含まれる
  - 抽出結果に「## 1. Overview」以降のコンテンツが含まれる
- **テストデータ**: 上記`agentLog`

#### テストケース 2.1.3: ヘッダーが見つからない場合（異常系）

- **目的**: ログにヘッダーパターンが存在しない場合、代替パターン（Markdownセクション検出）で抽出を試みることを検証
- **前提条件**: エージェントログにヘッダーは含まれないが、複数のMarkdownセクションが存在する
- **入力**:
  ```typescript
  agentLog = `
Agent started...

## Section 1
Content here...

## Section 2
More content...

## Section 3
Final content...
`;
  phaseName = 'planning';
  ```
- **期待結果**:
  - 抽出結果が`null`でない（代替パターンで抽出成功）
  - 抽出結果に「## Section 1」以降のコンテンツが含まれる
  - セクションヘッダーが2個以上含まれる
- **テストデータ**: 上記`agentLog`

#### テストケース 2.1.4: パターンマッチ完全失敗（異常系）

- **目的**: ログにヘッダーもMarkdownセクションも存在しない場合、`null`を返すことを検証
- **前提条件**: エージェントログに有効な成果物内容が含まれていない
- **入力**:
  ```typescript
  agentLog = `
Agent execution started.
No valid content generated.
Agent finished.
`;
  phaseName = 'planning';
  ```
- **期待結果**: `null`が返される
- **テストデータ**: 上記`agentLog`

#### テストケース 2.1.5: 各フェーズのヘッダーパターン検証（正常系）

- **目的**: 6フェーズすべてのヘッダーパターンが正しく動作することを検証
- **前提条件**: 各フェーズに対応するヘッダーパターンが定義されている
- **入力**: 各フェーズのヘッダーを含むログ
  - `planning`: 「# プロジェクト計画書」
  - `requirements`: 「# 要件定義書」
  - `design`: 「# 詳細設計書」
  - `test_scenario`: 「# テストシナリオ」
  - `implementation`: 「# 実装ログ」
  - `report`: 「# プロジェクトレポート」
- **期待結果**: すべてのフェーズで抽出成功（`null`でない）
- **テストデータ**: 各フェーズのサンプルログ

---

### 2.2 BasePhase.isValidOutputContent()

#### テストケース 2.2.1: 有効なコンテンツ（正常系）

- **目的**: 十分な長さとセクション数を持つコンテンツが有効と判定されることを検証
- **前提条件**: コンテンツが100文字以上、セクションヘッダーが2個以上
- **入力**:
  ```typescript
  content = `
# Planning Document

## 1. Issue Analysis
This is a comprehensive analysis of the issue with detailed explanations.

## 2. Implementation Strategy
EXTEND strategy will be used for this implementation.

## 3. Task Breakdown
Tasks are divided into 8 phases with clear deliverables.
`;
  phaseName = 'planning';
  ```
- **期待結果**: `true`が返される
- **テストデータ**: 上記`content`（200文字以上、セクション3個）

#### テストケース 2.2.2: 文字数不足（境界値テスト）

- **目的**: 100文字未満のコンテンツが無効と判定されることを検証
- **前提条件**: コンテンツが100文字未満
- **入力**:
  ```typescript
  content = `
# Planning
Short content.
`;
  phaseName = 'planning';
  ```
- **期待結果**: `false`が返される
- **テストデータ**: 上記`content`（50文字未満）

#### テストケース 2.2.3: セクション数不足（境界値テスト）

- **目的**: セクションヘッダーが2個未満の場合、無効と判定されることを検証
- **前提条件**: コンテンツが100文字以上だが、セクションヘッダーが1個以下
- **入力**:
  ```typescript
  content = `
# Planning Document
This is a single paragraph with no sections but with sufficient length to meet the 100 character requirement for validation purposes.
`;
  phaseName = 'planning';
  ```
- **期待結果**: `false`が返される（セクション数が1個のみ）
- **テストデータ**: 上記`content`（セクション1個）

#### テストケース 2.2.4: キーワード検証（Planning Phase）（正常系）

- **目的**: Planning Phaseのキーワード（「実装戦略」「テスト戦略」「タスク分割」）が少なくとも1つ含まれることを検証
- **前提条件**: コンテンツが100文字以上、セクション2個以上、キーワード1個以上
- **入力**:
  ```typescript
  content = `
# Planning Document

## 1. Implementation Strategy
EXTEND strategy will be used.

## 2. Test Strategy
UNIT_INTEGRATION testing approach.
`;
  phaseName = 'planning';
  ```
- **期待結果**: `true`が返される（「実装戦略」「テスト戦略」を含む）
- **テストデータ**: 上記`content`

#### テストケース 2.2.5: すべてのキーワード欠落（異常系）

- **目的**: Planning Phaseのキーワードがすべて欠落している場合、無効と判定されることを検証
- **前提条件**: コンテンツが100文字以上、セクション2個以上だが、キーワードなし
- **入力**:
  ```typescript
  content = `
# Some Document

## Section 1
This is some content that does not contain any of the required keywords for planning phase.

## Section 2
More generic content without the specific keywords needed for validation.
`;
  phaseName = 'planning';
  ```
- **期待結果**: `false`が返される（キーワードがすべて欠落）
- **テストデータ**: 上記`content`

#### テストケース 2.2.6: 各フェーズのキーワード検証（正常系）

- **目的**: 各フェーズ固有のキーワード検証が正しく動作することを検証
- **前提条件**: 各フェーズに対応するキーワードが定義されている
- **入力**: 各フェーズのキーワードを含むコンテンツ
  - `planning`: 「実装戦略」
  - `requirements`: 「機能要件」
  - `design`: 「アーキテクチャ」
  - `test_scenario`: 「テストケース」
  - `implementation`: 「実装」
  - `report`: 「プロジェクトレポート」
- **期待結果**: すべてのフェーズで`true`が返される
- **テストデータ**: 各フェーズのサンプルコンテンツ

---

### 2.3 BasePhase.handleMissingOutputFile()

#### テストケース 2.3.1: ログ抽出成功 → ファイル保存（正常系）

- **目的**: エージェントログから有効なコンテンツを抽出し、ファイルとして保存できることを検証
- **前提条件**:
  - エージェントログ（`agent_log.md`）が存在する
  - ログに有効な成果物内容が含まれている
  - 成果物ファイルは存在しない
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  logDir = '/path/to/execute';
  // モック: agent_log.md に有効なプロジェクト計画書が含まれている
  ```
- **期待結果**:
  - `{ success: true, output: '/path/to/output/planning.md' }`が返される
  - `planning.md`ファイルが作成される
  - ファイル内容がログから抽出した内容と一致する
  - ログに「Extracted valid content from agent log」メッセージが出力される
- **テストデータ**: モックファイルシステム（有効なログファイル）

#### テストケース 2.3.2: ログ抽出失敗 → revise呼び出し（正常系）

- **目的**: ログ抽出が失敗した場合、`revise()`メソッドが呼び出されることを検証
- **前提条件**:
  - エージェントログ（`agent_log.md`）が存在する
  - ログに無効な内容（または抽出不可）が含まれている
  - `revise()`メソッドが実装されている
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  logDir = '/path/to/execute';
  // モック: agent_log.md に無効な内容が含まれている
  ```
- **期待結果**:
  - `revise()`メソッドが呼び出される
  - `revise()`の引数に「planning.md が見つかりません」フィードバックが含まれる
  - `revise()`の戻り値が返される
  - ログに「Extracted content is insufficient or invalid」メッセージが出力される
  - ログに「Attempting revise step」メッセージが出力される
- **テストデータ**: モックファイルシステム（無効なログファイル）、モックrevise関数

#### テストケース 2.3.3: エージェントログ不在（異常系）

- **目的**: エージェントログが存在しない場合、エラーを返すことを検証
- **前提条件**: エージェントログ（`agent_log.md`）が存在しない
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  logDir = '/path/to/execute';
  // モック: agent_log.md が存在しない
  ```
- **期待結果**:
  - `{ success: false, error: '...' }`が返される
  - エラーメッセージに「planning.md が見つかりません」が含まれる
  - エラーメッセージに「エージェントログも見つかりません」が含まれる
  - エラーメッセージに「エージェントが正常に実行されなかった可能性があります」が含まれる
  - ログに「Agent log not found」エラーメッセージが出力される
- **テストデータ**: モックファイルシステム（ログファイルなし）

#### テストケース 2.3.4: revise()メソッド未実装（異常系）

- **目的**: `revise()`メソッドが実装されていない場合、エラーを返すことを検証
- **前提条件**:
  - エージェントログが存在するが、内容が無効
  - `revise()`メソッドが実装されていない（`getReviseFunction()`が`null`を返す）
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  logDir = '/path/to/execute';
  // モック: revise() が存在しない
  ```
- **期待結果**:
  - `{ success: false, error: 'revise() メソッドが実装されていません' }`が返される
- **テストデータ**: モックファイルシステム、モックPhaseオブジェクト（reviseなし）

#### テストケース 2.3.5: ログ読み込み中の例外処理（異常系）

- **目的**: ログファイル読み込み中に例外が発生した場合、適切にエラーハンドリングされることを検証
- **前提条件**: ログファイル読み込み時に`fs.readFileSync()`が例外をスローする
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  logDir = '/path/to/execute';
  // モック: fs.readFileSync() が EACCES エラーをスロー
  ```
- **期待結果**:
  - `{ success: false, error: 'フォールバック処理中にエラーが発生しました: ...' }`が返される
  - エラーメッセージに例外の詳細が含まれる
  - ログに「Error during fallback processing」エラーメッセージが出力される
- **テストデータ**: モックファイルシステム（例外スロー）

---

### 2.4 BasePhase.getReviseFunction()

#### テストケース 2.4.1: revise()メソッド存在（正常系）

- **目的**: `revise()`メソッドが実装されている場合、関数を返すことを検証
- **前提条件**: Phaseオブジェクトに`revise()`メソッドが実装されている
- **入力**: モックPhaseオブジェクト（`revise()`メソッドあり）
- **期待結果**:
  - 関数が返される（`null`でない）
  - 返された関数を呼び出すと、Phaseの`revise()`メソッドが実行される
- **テストデータ**: モックPhaseオブジェクト

#### テストケース 2.4.2: revise()メソッド不在（異常系）

- **目的**: `revise()`メソッドが実装されていない場合、`null`を返すことを検証
- **前提条件**: Phaseオブジェクトに`revise()`メソッドが実装されていない
- **入力**: モックPhaseオブジェクト（`revise()`メソッドなし）
- **期待結果**: `null`が返される
- **テストデータ**: モックPhaseオブジェクト

---

### 2.5 BasePhase.executePhaseTemplate()（フォールバック統合後）

#### テストケース 2.5.1: ファイル存在時（正常系、既存動作）

- **目的**: 成果物ファイルが存在する場合、既存の動作（成功を返す）を維持することを検証
- **前提条件**: エージェント実行後、成果物ファイルが正常に生成されている
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  templateVariables = { issue_info: '...' };
  options = { enableFallback: true };
  // モック: planning.md が存在する
  ```
- **期待結果**:
  - `{ success: true, output: '/path/to/output/planning.md' }`が返される
  - フォールバック処理は実行されない
- **テストデータ**: モックファイルシステム（ファイル存在）

#### テストケース 2.5.2: ファイル不在 & enableFallback=true → フォールバック実行（正常系）

- **目的**: ファイルが不在で`enableFallback: true`の場合、フォールバック処理が実行されることを検証
- **前提条件**:
  - エージェント実行後、成果物ファイルが生成されていない
  - `enableFallback: true`オプションが指定されている
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  templateVariables = { issue_info: '...' };
  options = { enableFallback: true };
  // モック: planning.md が存在しない、agent_log.md に有効な内容あり
  ```
- **期待結果**:
  - `handleMissingOutputFile()`が呼び出される
  - フォールバック処理の結果が返される（`{ success: true, output: '...' }`）
  - ログに「Output file not found」警告メッセージが出力される
  - ログに「Attempting fallback mechanism」情報メッセージが出力される
- **テストデータ**: モックファイルシステム（ファイル不在、有効なログ）

#### テストケース 2.5.3: ファイル不在 & enableFallback=false → エラー返却（正常系、既存動作）

- **目的**: ファイルが不在で`enableFallback: false`の場合、既存の動作（エラーを返す）を維持することを検証
- **前提条件**:
  - エージェント実行後、成果物ファイルが生成されていない
  - `enableFallback`オプションが指定されていない（デフォルト`false`）
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  templateVariables = { issue_info: '...' };
  options = {};  // enableFallback 未指定
  // モック: planning.md が存在しない
  ```
- **期待結果**:
  - `{ success: false, error: 'planning.md が見つかりません: ...' }`が返される
  - フォールバック処理は実行されない
- **テストデータ**: モックファイルシステム（ファイル不在）

#### テストケース 2.5.4: プロンプト変数置換（正常系、既存動作）

- **目的**: テンプレート変数がプロンプトに正しく置換されることを検証（既存機能のリグレッション確認）
- **前提条件**: プロンプトテンプレートに`{issue_info}`変数が含まれている
- **入力**:
  ```typescript
  phaseOutputFile = 'planning.md';
  templateVariables = { issue_info: 'Issue #113' };
  options = {};
  ```
- **期待結果**:
  - エージェントに渡されるプロンプトに「Issue #113」が含まれる
  - `{issue_info}`プレースホルダーが置換されている
- **テストデータ**: モックプロンプトテンプレート、モックエージェント

---

## 3. 統合テストシナリオ

### 3.1 Planning Phase - フォールバック統合テスト

#### シナリオ 3.1.1: Planning Phase - ログ抽出成功フロー

- **目的**: Planning Phaseでファイル生成失敗 → ログ抽出成功 → ファイル保存のフローが動作することを検証
- **前提条件**:
  - Planning Phaseが`enableFallback: true`で実装されている
  - モックエージェントがファイルを生成しないが、ログに有効なプロジェクト計画書を出力する
- **テスト手順**:
  1. Planning Phaseの`execute()`メソッドを呼び出す
  2. モックエージェントが実行され、ログのみ出力される
  3. `executePhaseTemplate()`がファイル不在を検出
  4. フォールバック処理が実行される
  5. ログからプロジェクト計画書が抽出される
  6. `planning.md`ファイルが保存される
- **期待結果**:
  - `execute()`が`{ success: true, output: '...' }`を返す
  - `.ai-workflow/issue-113/00_planning/output/planning.md`ファイルが存在する
  - ファイル内容にログから抽出された内容が含まれる
  - ファイル内容に「# プロジェクト計画書」ヘッダーが含まれる
  - ファイル内容に「## 1. Issue分析」セクションが含まれる
- **確認項目**:
  - [ ] `execute()`が成功を返す
  - [ ] `planning.md`ファイルが作成される
  - [ ] ファイル内容が有効である（100文字以上、セクション2個以上）
  - [ ] ログに「Extracted valid content from agent log」メッセージがある
  - [ ] ログに「Saved extracted content to」メッセージがある

#### シナリオ 3.1.2: Planning Phase - ログ抽出失敗 → revise成功フロー

- **目的**: Planning Phaseでログ抽出失敗 → revise呼び出し → ファイル生成成功のフローが動作することを検証
- **前提条件**:
  - Planning Phaseが`enableFallback: true`で実装されている
  - モックエージェント（execute）がファイルを生成せず、ログも無効
  - モックエージェント（revise）が有効な`planning.md`を生成する
- **テスト手順**:
  1. Planning Phaseの`execute()`メソッドを呼び出す
  2. モックエージェント（execute）が実行され、無効なログが出力される
  3. `executePhaseTemplate()`がファイル不在を検出
  4. フォールバック処理が実行される
  5. ログ抽出が失敗する（無効な内容）
  6. `revise()`メソッドが呼び出される
  7. モックエージェント（revise）が`planning.md`を生成する
- **期待結果**:
  - `execute()`が`{ success: true, output: '...' }`を返す
  - `.ai-workflow/issue-113/00_planning/output/planning.md`ファイルが存在する
  - `revise()`メソッドが1回呼び出される
  - `revise()`の引数に「planning.md が見つかりません」フィードバックが含まれる
- **確認項目**:
  - [ ] `execute()`が成功を返す
  - [ ] `revise()`が呼び出される
  - [ ] `planning.md`ファイルが作成される
  - [ ] ログに「Extracted content is insufficient or invalid」メッセージがある
  - [ ] ログに「Attempting revise step」メッセージがある

#### シナリオ 3.1.3: Planning Phase - revise プロンプトに previous_log_snippet が注入される

- **目的**: Planning Phaseの`revise()`メソッドで`previous_log_snippet`変数がプロンプトに注入されることを検証
- **前提条件**:
  - Planning Phaseの`revise()`メソッドが拡張されている
  - `execute/agent_log.md`が存在する
  - revise.txtに`{previous_log_snippet}`変数が含まれている
- **テスト手順**:
  1. Planning Phaseの`revise()`メソッドを呼び出す
  2. `execute/agent_log.md`から最初の2000文字を読み込む
  3. reviseプロンプトテンプレートに`previous_log_snippet`を注入する
  4. モックエージェント（revise）を実行する
- **期待結果**:
  - reviseプロンプトに`execute/agent_log.md`の最初の2000文字が含まれる
  - `{previous_log_snippet}`プレースホルダーが置換されている
  - ログに「Starting revise with previous log snippet」メッセージが出力される
- **確認項目**:
  - [ ] reviseプロンプトに`previous_log_snippet`が注入される
  - [ ] ログスニペットが最大2000文字である
  - [ ] ログファイルが存在しない場合は「（ログなし）」が設定される

---

### 3.2 Requirements Phase - フォールバック統合テスト

#### シナリオ 3.2.1: Requirements Phase - ログ抽出成功フロー

- **目的**: Requirements Phaseでフォールバック機構が動作することを検証
- **前提条件**:
  - Requirements Phaseが`enableFallback: true`で実装されている
  - モックエージェントがファイルを生成しないが、ログに有効な要件定義書を出力する
- **テスト手順**: シナリオ3.1.1と同様（対象ファイル：`requirements.md`）
- **期待結果**:
  - `execute()`が`{ success: true, output: '...' }`を返す
  - `.ai-workflow/issue-113/01_requirements/output/requirements.md`ファイルが存在する
  - ファイル内容に「# 要件定義書」ヘッダーが含まれる
  - ファイル内容に「## 1. 概要」セクションが含まれる
- **確認項目**: シナリオ3.1.1と同様

#### シナリオ 3.2.2: Requirements Phase - ログ抽出失敗 → revise成功フロー

- **目的**: Requirements Phaseでreviseフローが動作することを検証
- **前提条件**: シナリオ3.1.2と同様（対象ファイル：`requirements.md`）
- **テスト手順**: シナリオ3.1.2と同様
- **期待結果**:
  - `execute()`が成功を返す
  - `requirements.md`ファイルが作成される
  - `revise()`が呼び出される
- **確認項目**: シナリオ3.1.2と同様

---

### 3.3 Design Phase - フォールバック統合テスト

#### シナリオ 3.3.1: Design Phase - ログ抽出成功フロー

- **目的**: Design Phaseでフォールバック機構が動作することを検証
- **前提条件**:
  - Design Phaseが`enableFallback: true`で実装されている
  - モックエージェントがファイルを生成しないが、ログに有効な設計書を出力する
- **テスト手順**: シナリオ3.1.1と同様（対象ファイル：`design.md`）
- **期待結果**:
  - `execute()`が成功を返す
  - `.ai-workflow/issue-113/02_design/output/design.md`ファイルが存在する
  - ファイル内容に「# 詳細設計書」ヘッダーが含まれる
- **確認項目**: シナリオ3.1.1と同様

#### シナリオ 3.3.2: Design Phase - ログ抽出失敗 → revise成功フロー

- **目的**: Design Phaseでreviseフローが動作することを検証
- **前提条件**: シナリオ3.1.2と同様（対象ファイル：`design.md`）
- **テスト手順**: シナリオ3.1.2と同様
- **期待結果**:
  - `execute()`が成功を返す
  - `design.md`ファイルが作成される
- **確認項目**: シナリオ3.1.2と同様

---

### 3.4 TestScenario Phase - フォールバック統合テスト

#### シナリオ 3.4.1: TestScenario Phase - ログ抽出成功フロー

- **目的**: TestScenario Phaseでフォールバック機構が動作することを検証
- **前提条件**:
  - TestScenario Phaseが`enableFallback: true`で実装されている
  - モックエージェントがファイルを生成しないが、ログに有効なテストシナリオを出力する
- **テスト手順**: シナリオ3.1.1と同様（対象ファイル：`test-scenario.md`）
- **期待結果**:
  - `execute()`が成功を返す
  - `.ai-workflow/issue-113/03_test_scenario/output/test-scenario.md`ファイルが存在する
  - ファイル内容に「# テストシナリオ」ヘッダーが含まれる
- **確認項目**: シナリオ3.1.1と同様

#### シナリオ 3.4.2: TestScenario Phase - ログ抽出失敗 → revise成功フロー

- **目的**: TestScenario Phaseでreviseフローが動作することを検証
- **前提条件**: シナリオ3.1.2と同様（対象ファイル：`test-scenario.md`）
- **テスト手順**: シナリオ3.1.2と同様
- **期待結果**:
  - `execute()`が成功を返す
  - `test-scenario.md`ファイルが作成される
- **確認項目**: シナリオ3.1.2と同様

---

### 3.5 Implementation Phase - フォールバック統合テスト

#### シナリオ 3.5.1: Implementation Phase - ログ抽出成功フロー

- **目的**: Implementation Phaseでフォールバック機構が動作することを検証
- **前提条件**:
  - Implementation Phaseが`enableFallback: true`で実装されている
  - モックエージェントがファイルを生成しないが、ログに有効な実装ログを出力する
- **テスト手順**: シナリオ3.1.1と同様（対象ファイル：`implementation.md`）
- **期待結果**:
  - `execute()`が成功を返す
  - `.ai-workflow/issue-113/04_implementation/output/implementation.md`ファイルが存在する
  - ファイル内容に「# 実装ログ」ヘッダーが含まれる
- **確認項目**: シナリオ3.1.1と同様

#### シナリオ 3.5.2: Implementation Phase - ログ抽出失敗 → revise成功フロー

- **目的**: Implementation Phaseでreviseフローが動作することを検証
- **前提条件**: シナリオ3.1.2と同様（対象ファイル：`implementation.md`）
- **テスト手順**: シナリオ3.1.2と同様
- **期待結果**:
  - `execute()`が成功を返す
  - `implementation.md`ファイルが作成される
- **確認項目**: シナリオ3.1.2と同様

---

### 3.6 Report Phase - フォールバック統合テスト

#### シナリオ 3.6.1: Report Phase - ログ抽出成功フロー

- **目的**: Report Phaseでフォールバック機構が動作することを検証
- **前提条件**:
  - Report Phaseが`enableFallback: true`で実装されている
  - モックエージェントがファイルを生成しないが、ログに有効なレポートを出力する
- **テスト手順**: シナリオ3.1.1と同様（対象ファイル：`report.md`）
- **期待結果**:
  - `execute()`が成功を返す
  - `.ai-workflow/issue-113/07_report/output/report.md`ファイルが存在する
  - ファイル内容に「# プロジェクトレポート」ヘッダーが含まれる
- **確認項目**: シナリオ3.1.1と同様

#### シナリオ 3.6.2: Report Phase - ログ抽出失敗 → revise成功フロー

- **目的**: Report Phaseでreviseフローが動作することを検証
- **前提条件**: シナリオ3.1.2と同様（対象ファイル：`report.md`）
- **テスト手順**: シナリオ3.1.2と同様
- **期待結果**:
  - `execute()`が成功を返す
  - `report.md`ファイルが作成される
- **確認項目**: シナリオ3.1.2と同様

---

### 3.7 リグレッションテスト

#### シナリオ 3.7.1: enableFallback未指定のフェーズで既存動作を維持

- **目的**: `enableFallback`オプションを指定していないフェーズで、既存の動作（ファイル不在時はエラー）を維持することを検証
- **前提条件**:
  - TestImplementation Phaseが`enableFallback`オプションを指定していない（またはデフォルト`false`）
  - モックエージェントがファイルを生成しない
- **テスト手順**:
  1. TestImplementation Phaseの`execute()`メソッドを呼び出す
  2. モックエージェントが実行され、ファイルが生成されない
  3. `executePhaseTemplate()`がファイル不在を検出
  4. フォールバック処理は実行されない（`enableFallback: false`）
  5. エラーが返される
- **期待結果**:
  - `execute()`が`{ success: false, error: '...' }`を返す
  - エラーメッセージに「が見つかりません」が含まれる
  - フォールバック処理は実行されない
  - `handleMissingOutputFile()`が呼び出されない
- **確認項目**:
  - [ ] `execute()`がエラーを返す
  - [ ] フォールバック処理が実行されない
  - [ ] 既存のエラーメッセージが返される

#### シナリオ 3.7.2: Evaluation Phaseの既存フォールバック機構が動作する

- **目的**: Evaluation Phaseの既存のフォールバック機構（`handleMissingEvaluationFile()`）が引き続き動作することを検証
- **前提条件**:
  - Evaluation Phaseが既存の実装を維持している
  - モックエージェントがファイルを生成しない
- **テスト手順**:
  1. Evaluation Phaseの`execute()`メソッドを呼び出す
  2. モックエージェントが実行され、ファイルが生成されない
  3. Evaluation Phase固有のフォールバック処理が実行される
  4. `handleMissingEvaluationFile()`が呼び出される
- **期待結果**:
  - `execute()`が成功を返す（または適切にフォールバック）
  - Evaluation Phase固有のロジック（`DECISION`キーワード検証など）が動作する
  - `evaluation_report.md`ファイルが作成される
- **確認項目**:
  - [ ] Evaluation Phaseの既存フォールバック機構が動作する
  - [ ] `handleMissingEvaluationFile()`が呼び出される
  - [ ] `evaluation_report.md`が作成される

#### シナリオ 3.7.3: 全フェーズの既存テストスイートがパスする

- **目的**: 新しいフォールバック機構の導入により、既存のテストスイートに影響がないことを検証
- **前提条件**: 既存のテストスイート（`npm run test`）が存在する
- **テスト手順**:
  1. `npm run test`を実行する
  2. すべての既存テストがパスすることを確認する
- **期待結果**:
  - すべての既存テストがパスする
  - 新規エラーや警告が発生しない
- **確認項目**:
  - [ ] すべての既存テストがパスする
  - [ ] テスト実行時間が著しく増加していない
  - [ ] 新規エラーが発生しない

---

### 3.8 エラーハンドリング統合テスト

#### シナリオ 3.8.1: フォールバック完全失敗時のエラーハンドリング

- **目的**: フォールバック処理（ログ抽出、revise）がすべて失敗した場合、適切なエラーメッセージが返されることを検証
- **前提条件**:
  - Planning Phaseが`enableFallback: true`で実装されている
  - モックエージェント（execute）がファイルを生成せず、ログも無効
  - モックエージェント（revise）もファイルを生成しない
- **テスト手順**:
  1. Planning Phaseの`execute()`メソッドを呼び出す
  2. executeステップでファイル生成失敗
  3. ログ抽出失敗
  4. revise呼び出し
  5. reviseでもファイル生成失敗
- **期待結果**:
  - `execute()`が`{ success: false, error: '...' }`を返す
  - エラーメッセージに「planning.md が見つかりません」が含まれる
  - エラーメッセージに「Revise ステップでもファイルが作成されませんでした」が含まれる
  - ワークフロー全体がクラッシュしない
- **確認項目**:
  - [ ] `execute()`がエラーを返す
  - [ ] 適切なエラーメッセージが返される
  - [ ] ワークフローがクラッシュしない

#### シナリオ 3.8.2: 複数回のreviseリトライ

- **目的**: reviseが最大3回リトライされることを検証（既存の`MAX_RETRIES`と同じ）
- **前提条件**:
  - Planning Phaseの`revise()`メソッドが最大3回リトライする仕様
  - モックエージェント（revise）が最初の2回は失敗し、3回目で成功する
- **テスト手順**:
  1. Planning Phaseの`execute()`メソッドを呼び出す
  2. ログ抽出失敗 → revise呼び出し
  3. revise 1回目: 失敗
  4. revise 2回目: 失敗
  5. revise 3回目: 成功
- **期待結果**:
  - `execute()`が`{ success: true, output: '...' }`を返す
  - reviseが3回呼び出される
  - 3回目で`planning.md`が生成される
- **確認項目**:
  - [ ] reviseが最大3回リトライされる
  - [ ] 3回目で成功する
  - [ ] ログにリトライ情報が出力される

---

## 4. テストデータ

### 4.1 正常データ

#### Planning Phase - 有効なプロジェクト計画書

```markdown
# プロジェクト計画書 - Issue #113

## 1. Issue分析

複雑度: 中程度
見積もり工数: 12~16時間

## 2. 実装戦略判断

実装戦略: EXTEND
テスト戦略: UNIT_INTEGRATION
テストコード戦略: BOTH_TEST

## 3. 影響範囲分析

変更が必要なファイル:
- src/phases/base-phase.ts
- src/phases/planning.ts
...

## 4. タスク分割

Phase 1: 要件定義 (1~2h)
Phase 2: 設計 (2~3h)
...
```

#### Requirements Phase - 有効な要件定義書

```markdown
# 要件定義書 - Issue #113

## 1. 概要

本要件定義書では...

## 2. 機能要件

FR-1: BasePhaseへの汎用フォールバック機構の実装
...

## 3. 非機能要件

NFR-1: パフォーマンス要件
...

## 4. 受け入れ基準

Given: エージェントがファイル生成に失敗した
When: handleMissingOutputFile()が呼び出された
Then: ...
```

### 4.2 異常データ

#### 無効なコンテンツ（文字数不足）

```markdown
# Planning
Short.
```

#### 無効なコンテンツ（セクション不足）

```markdown
# Planning Document
This is a single paragraph without sections but with sufficient length to meet the character requirement for testing purposes.
```

#### 無効なコンテンツ（キーワード欠落）

```markdown
# Some Document

## Section 1
Generic content without required keywords.

## Section 2
More generic content.
```

### 4.3 境界値データ

#### ちょうど100文字のコンテンツ

```markdown
# Document

## Section 1
Content here with exactly one hundred characters in total for boundary testing.
```

#### ちょうど2個のセクション

```markdown
# Document

## Section 1
Content.

## Section 2
More content.
```

---

## 5. テスト環境要件

### 5.1 ローカル開発環境

- **Node.js**: 20以上
- **npm**: 10以上
- **TypeScript**: 既存プロジェクトと同じバージョン
- **テストフレームワーク**: Jest（既存）
- **モックライブラリ**: Jest（既存）

### 5.2 CI/CD環境

- **Jenkins**: 既存のJenkinsパイプライン
- **テスト実行コマンド**: `npm run test:unit`, `npm run test:integration`
- **カバレッジ収集**: Jest coverage

### 5.3 必要な外部サービス・データベース

- **なし**: 内部ロジックの改善のみ、外部サービス連携なし

### 5.4 モック/スタブの必要性

**必須モック**:
- **ファイルシステム（`fs-extra`）**: ファイル読み込み・書き込みのモック
- **エージェント実行（`executeWithAgent()`）**: エージェント実行のモック
- **プロンプト読み込み（`loadPrompt()`）**: プロンプトテンプレート読み込みのモック

**オプションモック**:
- **メタデータマネージャー（`MetadataManager`）**: メタデータ更新のモック（統合テストで使用）
- **GitHubクライアント（`githubClient`）**: Issue情報取得のモック（統合テストで使用）

---

## 6. テストカバレッジ目標

### 6.1 新規コードのカバレッジ

**目標**: 80%以上

**対象コード**:
- `BasePhase.handleMissingOutputFile()`
- `BasePhase.extractContentFromLog()`
- `BasePhase.isValidOutputContent()`
- `BasePhase.getReviseFunction()`
- `BasePhase.executePhaseTemplate()`（フォールバック統合部分）
- 各フェーズの`execute()`拡張部分（`enableFallback: true`）
- 各フェーズの`revise()`拡張部分（`previous_log_snippet`注入）

### 6.2 カバレッジ測定方法

- **ツール**: Jest coverage
- **コマンド**: `npm run test:coverage`
- **レポート形式**: HTML、LCOV

### 6.3 カバレッジ除外対象

- **外部ライブラリ**: `node_modules/`
- **テストファイル**: `tests/**/*.test.ts`
- **設定ファイル**: `jest.config.js`

---

## 7. 品質ゲート（Phase 3）確認

以下の品質ゲートを満たしていることを確認しました：

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテストシナリオ（セクション2）と統合テストシナリオ（セクション3）を作成
- [x] **主要な正常系がカバーされている**: 各フェーズのフォールバック成功フロー（ログ抽出成功、revise成功）をカバー
- [x] **主要な異常系がカバーされている**: ログ不在、抽出失敗、revise失敗、例外処理をカバー
- [x] **期待結果が明確である**: 各テストケース・シナリオで具体的な期待結果（戻り値、ファイル存在、ログメッセージ）を記載

---

## 8. テスト実行順序

### 8.1 推奨実行順序

1. **ユニットテスト**（セクション2）:
   - 2.1 `extractContentFromLog()`
   - 2.2 `isValidOutputContent()`
   - 2.3 `handleMissingOutputFile()`
   - 2.4 `getReviseFunction()`
   - 2.5 `executePhaseTemplate()`

2. **統合テスト**（セクション3）:
   - 3.1 Planning Phase
   - 3.2 Requirements Phase
   - 3.3 Design Phase
   - 3.4 TestScenario Phase
   - 3.5 Implementation Phase
   - 3.6 Report Phase
   - 3.7 リグレッションテスト
   - 3.8 エラーハンドリング統合テスト

### 8.2 並列実行可能なテスト

- ユニットテスト（セクション2）は並列実行可能
- 統合テスト（セクション3.1~3.6）は各フェーズ独立のため並列実行可能

### 8.3 直列実行が必要なテスト

- リグレッションテスト（3.7）は統合テスト（3.1~3.6）の後に実行

---

## 9. テスト実装時の注意事項

### 9.1 モック設計

**ファイルシステムモック**:
- `fs.existsSync()`: ファイル存在チェックのモック
- `fs.readFileSync()`: ファイル読み込みのモック
- `fs.writeFileSync()`: ファイル書き込みのモック
- 各テストケースでモックの戻り値・挙動を適切に設定すること

**エージェントモック**:
- `executeWithAgent()`: エージェント実行のモック
- ログファイル（`agent_log.md`）生成をシミュレート
- 成果物ファイル生成をシミュレート（または生成しない）

### 9.2 テストデータの管理

- テストデータは`tests/fixtures/`ディレクトリに配置
- 各フェーズのサンプルログファイルを用意
- 有効なコンテンツ、無効なコンテンツ、境界値データを準備

### 9.3 テストの独立性

- 各テストケースは独立して実行可能であること
- テスト間で状態を共有しない
- `beforeEach()`でモックをリセット
- `afterEach()`でファイルシステムをクリーンアップ

### 9.4 エラーメッセージの検証

- エラーメッセージは正確に検証すること
- `expect(error).toContain('...')`でキーワードを確認
- エラーメッセージの形式が仕様通りであることを確認

---

## 10. まとめ

このテストシナリオは、Issue #113「全フェーズに Evaluation Phase のフォールバック機構を導入する」のテスト戦略（UNIT_INTEGRATION）に基づいて作成されました。

**テストシナリオの概要**:
- **ユニットテスト**: 5つのメソッド、26個のテストケース
- **統合テスト**: 6フェーズ × 3シナリオ + リグレッション + エラーハンドリング、計21個のシナリオ
- **カバレッジ目標**: 80%以上

**主要なテスト対象**:
1. ログからの成果物抽出ロジック（`extractContentFromLog()`）
2. 抽出内容のバリデーション（`isValidOutputContent()`）
3. フォールバック処理全体（`handleMissingOutputFile()`）
4. 各フェーズでのエンドツーエンドフロー
5. リグレッション（既存動作の維持）

**品質ゲート**:
- [x] Phase 2の戦略に沿ったテストシナリオである
- [x] 主要な正常系がカバーされている
- [x] 主要な異常系がカバーされている
- [x] 期待結果が明確である

このテストシナリオは、Phase 5（テストコード実装）の羅針盤となります。各テストケース・シナリオを実装し、品質を確保してください。
