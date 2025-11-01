# 要件定義書 - Issue #104

## 0. Planning Document の確認

Planning Phase (Phase 0) で策定された開発計画を確認しました。主要な戦略は以下の通りです：

### 開発計画の全体像
- **複雑度**: 中程度
- **見積もり工数**: 10~14時間
- **実装戦略**: EXTEND（既存の `IssueClient.createIssueFromEvaluation()` メソッドを拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテストとインテグレーションテストの組み合わせ）
- **テストコード戦略**: BOTH_TEST（既存テストの拡張 + 新規テスト作成）

### 主なリスク
- `RemainingTask` 型の拡張による後方互換性の破壊（軽減策: すべてオプショナルフィールドとして定義）
- Evaluation レポートから詳細情報を抽出できない可能性（軽減策: フォールバック処理とデフォルト値の使用）
- タイトル生成のキーワード抽出が不正確（軽減策: シンプルなアルゴリズムとフォールバック）

### スコープ
- **含む**: タイトル生成ロジック、Issue 本文テンプレート改善、`RemainingTask` 型拡張、Evaluation Phase 側の修正
- **含まない**: Phase 9 (Evaluation) のプロンプト改善（情報不足時は別 Issue として提案）

---

## 1. 概要

### 背景
現在、AI Workflow の Evaluation Phase (Phase 9) で自動生成されるフォローアップ Issue には以下の問題があります：

1. **タイトルが内容を反映していない**: すべて「[FOLLOW-UP] Issue #XX - 残タスク」という画一的なフォーマットで、Issue リストから内容が推測できない
2. **タスク内容が理解しにくい**: 具体的な作業手順や対象ファイルが記載されておらず、実行方法が不明確
3. **コンテキスト情報が不足**: なぜこれらのタスクが残ったのか、元 Issue との関係性が不明
4. **実行に必要な情報が欠けている**: 対象ファイル、具体的な手順、Acceptance Criteria が欠落

### 目的
フォローアップ Issue のタイトルと本文を改善し、以下を実現する：

- **検索性の向上**: タイトルから Issue 内容が推測できる
- **実行可能性の向上**: タスクの具体的な作業内容が明確
- **コンテキストの充実**: 元 Issue との関係性と、タスクが残った理由が理解できる
- **生産性の向上**: 開発者がすぐに作業を開始できる

### ビジネス価値・技術的価値
- **ビジネス価値**: Issue 管理の効率化、開発者の生産性向上、プロジェクトの透明性向上
- **技術的価値**: ワークフローの自動化品質向上、Issue トラッキングの精度向上、後方互換性を維持した拡張

---

## 2. 機能要件

### FR-1: タイトル生成の改善（優先度: 高）

**要件**: フォローアップ Issue のタイトルに、タスク内容を反映した情報を含める

**詳細**:
- タイトルフォーマット: `[FOLLOW-UP] #{元Issue番号}: {キーワード1}・{キーワード2}・{キーワード3}`
- 残タスクリストから最大3つの主要なキーワードを抽出
- キーワード抽出アルゴリズム:
  - 各タスクのテキストから括弧前まで、または最初の20文字を抽出
  - 3つのタスクから順次キーワードを取得
  - 中黒（・）で結合
- タイトル長の制限: 80文字以内（超過時は77文字で切り詰め + `...`）
- フォールバック: キーワードが抽出できない場合は従来形式 `[FOLLOW-UP] Issue #{元Issue番号} - 残タスク` を使用

**期待される出力例**:
- `[FOLLOW-UP] #91: テストカバレッジ改善・パフォーマンスベンチマーク・ドキュメント更新`
- `[FOLLOW-UP] #52: Jest設定修正・テスト期待値更新`
- `[FOLLOW-UP] #74: ESLintルール追加・SecretMasker統合の検討`

**実装箇所**:
- `src/core/github/issue-client.ts` に以下のメソッドを追加:
  - `generateFollowUpTitle()`: タイトル生成ロジック
  - `extractKeywords()`: キーワード抽出ロジック

**受け入れ基準**:
- [ ] タイトルにタスク内容が反映されている（主要なキーワードを含む）
- [ ] タイトルが 80 文字以内に収まる
- [ ] キーワード抽出に失敗した場合、従来形式にフォールバックする
- [ ] 複数の残タスクから最大3つのキーワードを抽出する
- [ ] 既存のタイトル形式（`[FOLLOW-UP]` プレフィックス）を維持する

---

### FR-2: Issue 本文の背景セクション追加（優先度: 高）

**要件**: フォローアップ Issue に「背景」セクションを追加し、コンテキスト情報を提供する

**詳細**:
- 新規セクション「## 背景」を Issue 本文の先頭に追加
- 以下の情報を含める:
  - **元 Issue の概要**: 元 Issue のタイトルまたは要約（`IssueContext.summary`）
  - **元 Issue のステータス**: ブロッカーの状態（`IssueContext.blockerStatus`、例: "すべてのブロッカーは解決済み"）
  - **タスクが残った理由**: なぜこれらのタスクが後回しになったか（`IssueContext.deferredReason`、例: "タスク優先度の判断により後回し"）
- 情報が取得できない場合は、デフォルト値またはフォールバックメッセージを使用

**実装方針**:
- `createIssueFromEvaluation()` メソッドに新規パラメータ `issueContext?: IssueContext` を追加（オプショナル）
- `IssueContext` インターフェース（新規定義）:
  ```typescript
  interface IssueContext {
    summary: string;          // 元 Issue の概要
    blockerStatus: string;    // ブロッカーのステータス
    deferredReason: string;   // タスクが残った理由
  }
  ```
- Evaluation Phase 側（`src/phases/evaluation.ts` の `handlePassWithIssues()` メソッド）で情報を抽出し、`IssueContext` オブジェクトを構築

**受け入れ基準**:
- [ ] Issue 本文に「## 背景」セクションが追加される
- [ ] 背景セクションに元 Issue の概要が含まれる
- [ ] 背景セクションに元 Issue のブロッカーステータスが含まれる（情報が取得できた場合）
- [ ] 背景セクションにタスクが残った理由が含まれる（情報が取得できた場合）
- [ ] 情報が取得できない場合、デフォルトメッセージが表示される
- [ ] 新規パラメータは後方互換性を維持するためオプショナルである

---

### FR-3: タスク詳細情報の拡充（優先度: 高）

**要件**: 各残タスクに実行に必要な詳細情報を含める

**詳細**:
- 各タスクに以下の情報を追加（該当する場合のみ表示）:
  - **対象ファイル/モジュール** (`targetFiles: string[]`): 修正対象のファイルリスト
  - **必要な作業** (`steps: string[]`): 具体的な実行手順（番号付きリスト）
  - **Acceptance Criteria** (`acceptanceCriteria: string[]`): 完了条件のチェックリスト
  - **優先度の根拠** (`priorityReason: string`): なぜこの優先度なのか
  - **依存タスク** (`dependencies: string[]`): 他のタスクへの依存関係
  - **見積もり工数** (`estimatedHours: string`): 作業時間の見積もり（例: "2-4h"）

**実装方針**:
- `RemainingTask` 型（`src/types.ts`）を拡張し、以下のオプショナルフィールドを追加:
  ```typescript
  export interface RemainingTask {
    task: string;                        // 既存（必須）
    phase: string;                       // 既存（必須）
    priority: string;                    // 既存（必須）
    // 新規フィールド（すべてオプショナル）
    priorityReason?: string;             // 優先度の理由
    targetFiles?: string[];              // 対象ファイルリスト
    steps?: string[];                    // 実行手順
    acceptanceCriteria?: string[];       // 受け入れ基準
    dependencies?: string[];             // 依存タスク
    estimatedHours?: string;             // 見積もり工数
  }
  ```
- `createIssueFromEvaluation()` メソッドで各フィールドの存在チェックを行い、条件分岐で表示
- Issue 本文テンプレートを以下の形式に変更:
  ```markdown
  ### Task 1: {task.task}

  **対象ファイル**: （task.targetFiles が存在する場合のみ）
  - `{file1}`
  - `{file2}`

  **必要な作業**: （task.steps が存在する場合のみ）
  1. {step1}
  2. {step2}

  **Acceptance Criteria**: （task.acceptanceCriteria が存在する場合のみ）
  - [ ] {criteria1}
  - [ ] {criteria2}

  **Phase**: {task.phase}

  **優先度**: {task.priority}{task.priorityReason ? ` - ${task.priorityReason}` : ''}

  **見積もり**: {task.estimatedHours ?? '未定'}
  ```

**受け入れ基準**:
- [ ] `RemainingTask` 型に6つの新規フィールドが追加される
- [ ] すべての新規フィールドがオプショナル（`?:`）として定義される
- [ ] 各タスクに「対象ファイル」セクションが表示される（フィールドが存在する場合）
- [ ] 各タスクに「必要な作業」セクションが表示される（フィールドが存在する場合）
- [ ] 各タスクに「Acceptance Criteria」セクションが表示される（フィールドが存在する場合）
- [ ] 各タスクに「優先度の根拠」が表示される（フィールドが存在する場合）
- [ ] 各タスクに「見積もり工数」が表示される（未定の場合は "未定" と表示）
- [ ] フィールドが存在しない場合、該当セクションは表示されない（条件分岐）

---

### FR-4: Evaluation Phase 側の情報抽出強化（優先度: 中）

**要件**: Evaluation レポートから Issue コンテキスト情報を抽出し、フォローアップ Issue に渡す

**詳細**:
- `src/phases/evaluation.ts` の `handlePassWithIssues()` メソッドを修正
- Evaluation レポートから以下の情報を抽出:
  1. **Issue Summary**: 元 Issue の概要（`issueTitle` から取得、またはメタデータから）
  2. **Blocker Status**: "すべてのブロッカーは解決済み" 等（Evaluation レポートから抽出）
  3. **Deferred Reason**: "タスク優先度の判断により後回し" 等（Evaluation レポートから抽出）
- 抽出した情報を `IssueContext` オブジェクトとして構築
- `IssueClient.createIssueFromEvaluation()` に渡す

**実装方針**:
- Phase 1（要件定義）で既存の Evaluation レポートを3~5件調査し、情報の有無を確認
- 情報が不足している場合は以下の暫定対応:
  - デフォルト値を使用（例: `summary = issueTitle`, `blockerStatus = "すべてのブロッカーは解決済み"`）
  - Phase 9 (Evaluation) のプロンプト改善を別 Issue として提案
- フォールバックロジックを実装（情報がない場合は従来形式で生成）

**受け入れ基準**:
- [ ] `handlePassWithIssues()` メソッドで `IssueContext` オブジェクトが構築される
- [ ] Evaluation レポートから情報が抽出される（可能な場合）
- [ ] 情報が不足している場合、デフォルト値が使用される
- [ ] `createIssueFromEvaluation()` に `IssueContext` が渡される
- [ ] Evaluation レポートに情報が含まれていない場合、Phase 1 で不足情報を洗い出す

---

### FR-5: Issue 本文テンプレートの改善（優先度: 中）

**要件**: フォローアップ Issue 本文全体を再構成し、読みやすさと実行可能性を向上させる

**詳細**:
- 新規構成:
  ```markdown
  ## 背景

  {issueContext.summary}

  ### 元 Issue のステータス

  {issueContext.blockerStatus}

  ### なぜこれらのタスクが残ったか

  {issueContext.deferredReason}

  ## 残タスク詳細

  ### Task 1: {task.task}

  **対象ファイル**: （task.targetFiles が存在する場合のみ）
  - `{file1}`
  - `{file2}`

  **必要な作業**: （task.steps が存在する場合のみ）
  1. {step1}
  2. {step2}

  **Acceptance Criteria**: （task.acceptanceCriteria が存在する場合のみ）
  - [ ] {criteria1}
  - [ ] {criteria2}

  **Phase**: {task.phase}

  **優先度**: {task.priority}{task.priorityReason ? ` - ${task.priorityReason}` : ''}

  **見積もり**: {task.estimatedHours ?? '未定'}

  ---

  ## 参考

  - 元Issue: #{issueNumber}
  - Evaluation Report: `{evaluationReportPath}`

  ---
  *自動生成: AI Workflow Phase 9 (Evaluation)*
  ```

**実装方針**:
- `createIssueFromEvaluation()` メソッド内で Issue 本文を構築するロジックを修正
- セクションごとに条件分岐を実装（情報が存在しない場合はスキップ）
- Markdown フォーマットの整合性を確認（ヘッダーレベル、リストフォーマット等）

**受け入れ基準**:
- [ ] Issue 本文が新規構成に従って生成される
- [ ] 各セクションが条件分岐により適切に表示・非表示される
- [ ] Markdown フォーマットが正しく整形される
- [ ] 従来の「参考」セクションが保持される
- [ ] フッター（自動生成メッセージ）が保持される

---

## 3. 非機能要件

### NFR-1: 後方互換性（優先度: 高）

**要件**: 既存のフォローアップ Issue 作成機能を壊さない

**詳細**:
- `createIssueFromEvaluation()` メソッドの既存シグネチャを維持
- 新規パラメータ（`issueContext`）はオプショナルとして追加
- `RemainingTask` 型の既存フィールドは変更しない（新規フィールドはすべてオプショナル）
- Evaluation Phase 以外で `RemainingTask` を使用している箇所がないことを確認（Grep で検索）

**受け入れ基準**:
- [ ] 新規パラメータがオプショナルである
- [ ] 新規パラメータ未指定時、従来と同じ動作をする
- [ ] `RemainingTask` 型の拡張により既存コードが壊れない
- [ ] 既存のテストがすべてパスする（リグレッションなし）

---

### NFR-2: パフォーマンス（優先度: 中）

**要件**: タイトル生成とキーワード抽出の処理時間が許容範囲内である

**詳細**:
- タイトル生成処理時間: 100ms 以内
- キーワード抽出処理時間: 50ms 以内（タスク1件あたり）
- Issue 作成全体の処理時間: 既存実装と比較して 10% 以内の増加

**受け入れ基準**:
- [ ] タイトル生成処理が 100ms 以内に完了する
- [ ] キーワード抽出処理が 50ms 以内に完了する（タスク1件あたり）
- [ ] Issue 作成全体の処理時間が許容範囲内である

---

### NFR-3: 保守性・拡張性（優先度: 中）

**要件**: コードが理解しやすく、将来の拡張が容易である

**詳細**:
- タイトル生成ロジックを独立したメソッド（`generateFollowUpTitle()`）に分離
- キーワード抽出ロジックを独立したメソッド（`extractKeywords()`）に分離
- Issue 本文生成ロジックを独立したメソッド（`formatTaskDetails()`、推奨）に分離
- 各メソッドに JSDoc コメントを追加
- `RemainingTask` 型の新規フィールドに JSDoc コメントを追加

**受け入れ基準**:
- [ ] タイトル生成ロジックが独立したメソッドに分離される
- [ ] キーワード抽出ロジックが独立したメソッドに分離される
- [ ] 各メソッドに JSDoc コメントが追加される
- [ ] `RemainingTask` 型の新規フィールドに JSDoc コメントが追加される
- [ ] コードレビューで保守性・拡張性が確認される

---

### NFR-4: テスト容易性（優先度: 高）

**要件**: ユニットテストとインテグレーションテストが容易に実装できる

**詳細**:
- タイトル生成メソッド（`generateFollowUpTitle()`）が独立してテスト可能
- キーワード抽出メソッド（`extractKeywords()`）が独立してテスト可能
- Issue 本文生成ロジックがモックを使用してテスト可能
- 境界値テスト（空配列、長文、特殊文字）が実装可能

**受け入れ基準**:
- [ ] タイトル生成メソッドのユニットテストが実装される
- [ ] キーワード抽出メソッドのユニットテストが実装される
- [ ] Issue 本文生成のインテグレーションテストが実装される
- [ ] 境界値テストが実装される（空配列、長文、特殊文字）
- [ ] カバレッジが 90% 以上である

---

## 4. 制約事項

### 技術的制約

1. **使用技術**: TypeScript、Octokit (GitHub API)
2. **既存システムとの整合性**: `src/core/github/issue-client.ts` の既存実装パターンに従う
3. **コーディング規約**: プロジェクトの ESLint ルールに準拠
4. **型安全性**: TypeScript の型システムを最大限活用

### リソース制約

1. **時間**: 10~14時間（Planning Document の見積もり）
2. **人員**: 1名（AI エージェントによる実装）
3. **優先度**: 中（他の Issue との兼ね合いで調整可能）

### ポリシー制約

1. **後方互換性の維持**: 既存の呼び出し元が無変更で動作する
2. **セキュリティ**: GitHub API トークンの適切な管理
3. **ログ記録**: logger モジュール（`src/utils/logger.ts`）を使用
4. **エラーハンドリング**: error-utils モジュール（`src/utils/error-utils.ts`）を使用

---

## 5. 前提条件

### システム環境

- Node.js 20 以上
- npm 10 以上
- TypeScript 5.x
- Octokit 3.x

### 依存コンポーネント

- `src/core/github/issue-client.ts`: 修正対象
- `src/types.ts`: `RemainingTask` 型定義の拡張対象
- `src/phases/evaluation.ts`: 呼び出し側の修正対象
- `tests/unit/github/issue-client.test.ts`: 既存テストの拡張対象

### 外部システム連携

- GitHub API (Octokit): フォローアップ Issue 作成
- Evaluation Phase: 残タスク情報の提供

---

## 6. 受け入れ基準

### ビジネス受け入れ基準

**Given**: Evaluation Phase で残タスクが検出された
**When**: フォローアップ Issue が自動生成される
**Then**: Issue タイトルにタスク内容が反映され、検索可能である

**Given**: フォローアップ Issue が作成された
**When**: 開発者が Issue を閲覧する
**Then**: タスクの具体的な作業内容、対象ファイル、Acceptance Criteria が明記されている

**Given**: フォローアップ Issue が作成された
**When**: 開発者が Issue を閲覧する
**Then**: 元 Issue との関係性と、タスクが残った理由が理解できる

### 技術受け入れ基準

#### タイトル生成
- [ ] タイトルにタスク内容が反映されている（主要なキーワードを含む）
- [ ] タイトルが 80 文字以内に収まる
- [ ] タイトルから Issue の内容が推測できる
- [ ] キーワード抽出に失敗した場合、従来形式にフォールバックする

#### Issue 本文
- [ ] Issue 本文に「背景」セクションが追加される（元 Issue の要約、なぜタスクが残ったか）
- [ ] 各タスクに以下の情報が含まれる（該当する場合）:
  - [ ] 対象ファイル/モジュール
  - [ ] 必要な作業の具体的な手順
  - [ ] Acceptance Criteria
  - [ ] 優先度の根拠
- [ ] タスク間の依存関係が明示される（該当する場合）
- [ ] Evaluation Report へのアクセス方法が維持される

#### 後方互換性
- [ ] 既存のフォローアップ Issue 作成機能が壊れない
- [ ] 新規パラメータがオプショナルであり、未指定時は従来と同じ動作をする
- [ ] `RemainingTask` 型の拡張により既存コードが壊れない
- [ ] 既存のテストがすべてパスする（リグレッションなし）

#### テスト
- [ ] タイトル生成のユニットテストが実装される
- [ ] キーワード抽出のユニットテストが実装される
- [ ] Issue 本文生成のインテグレーションテストが実装される
- [ ] 境界値テスト（空配列、長文、特殊文字）が実装される
- [ ] カバレッジが 90% 以上である

---

## 7. スコープ外

### 明確にスコープ外とする事項

1. **Phase 9 (Evaluation) のプロンプト改善**: Evaluation レポートに情報が不足している場合、Phase 9 のプロンプト改善は別 Issue として提案する（Phase 1 で調査結果に基づいて判断）
2. **自然言語処理による高度なキーワード抽出**: シンプルなアルゴリズム（括弧前まで、20文字制限）を採用し、複雑な NLP は避ける
3. **既存のフォローアップ Issue の一括更新**: 既存 Issue（#94、#96、#98、#102 等）は手動で更新しない（新規 Issue のみ改善）
4. **残タスクの自動優先度付け**: 優先度は Evaluation Phase の出力をそのまま使用（AI による自動判定は行わない）

### 将来的な拡張候補

1. **残タスクの自動グルーピング**: 類似タスクを自動的にグループ化（Phase 別、モジュール別等）
2. **残タスクの依存関係グラフ**: タスク間の依存関係を視覚化
3. **残タスクの自動ラベル付与**: タスク内容に基づいて GitHub ラベルを自動付与（例: `bug`, `enhancement`, `test`）
4. **残タスクの自動マイルストーン設定**: 優先度と見積もり工数に基づいてマイルストーンを自動設定
5. **Evaluation レポートのリンク埋め込み**: GitHub Issue コメントとして Evaluation レポートの内容を投稿

---

## 8. 受け入れ基準の検証方法

### 手動検証

1. **タイトル検証**:
   - Evaluation Phase を実行し、フォローアップ Issue が作成される
   - Issue タイトルにタスク内容が反映されていることを確認
   - Issue リストから内容が推測できることを確認

2. **本文検証**:
   - Issue 本文に「背景」セクションが存在することを確認
   - 各タスクに「対象ファイル」「必要な作業」「Acceptance Criteria」が含まれることを確認
   - Markdown フォーマットが正しく整形されていることを確認

3. **後方互換性検証**:
   - 新規パラメータ未指定で `createIssueFromEvaluation()` を呼び出す
   - 従来と同じ Issue が作成されることを確認

### 自動検証（テスト）

1. **ユニットテスト**:
   - `generateFollowUpTitle()` メソッドのテスト
     - 正常系: 3つのタスクから3つのキーワードを抽出
     - 境界値: 空配列、1つのタスク、長文タスク
     - 異常系: キーワード抽出失敗時のフォールバック
   - `extractKeywords()` メソッドのテスト
     - 正常系: 括弧前まで抽出、20文字制限
     - 境界値: 特殊文字、日本語、数字
     - 異常系: 空文字列、null、undefined

2. **インテグレーションテスト**:
   - `createIssueFromEvaluation()` メソッドのテスト
     - 正常系: 新規パラメータ指定時の Issue 作成
     - 正常系: 新規パラメータ未指定時の Issue 作成（後方互換性）
     - 境界値: 残タスク0件、1件、10件
     - 異常系: GitHub API エラー

3. **カバレッジ**:
   - `npm run test:coverage` で 90% 以上のカバレッジを達成
   - 重要なメソッド（`generateFollowUpTitle`, `extractKeywords`, `createIssueFromEvaluation`）のカバレッジは 100%

---

## 9. 補足情報

### 関連 Issue

- Issue #94: `[FOLLOW-UP] Issue #91 - 残タスク`（タイトルが不明瞭な例）
- Issue #96: `[FOLLOW-UP] Issue #90 - 残タスク`（タイトルが不明瞭な例）
- Issue #98: `[FOLLOW-UP] Issue #74 - 残タスク`（タイトルが不明瞭な例）
- Issue #102: `[FOLLOW-UP] Issue #52 - 残タスク`（タイトルが不明瞭な例）

### 参考資料

- **Planning Document**: `.ai-workflow/issue-104/00_planning/output/planning.md`（実装戦略、タスク分割、品質ゲート）
- **ARCHITECTURE.md**: アーキテクチャ設計思想、モジュール構成
- **CLAUDE.md**: プロジェクトの全体方針、コーディングガイドライン、環境変数アクセス規約、エラーハンドリング規約
- **README.md**: プロジェクト概要、CLI 使用方法、フェーズ概要

### 実装の詳細方針（Planning Document より）

#### タイトル生成アルゴリズム
1. `RemainingTask[]` から最大3つのタスクを取得
2. 各タスクのテキストから主要なキーワードを抽出（括弧前まで、最大20文字）
3. キーワードを `・` で結合
4. フォーマット: `[FOLLOW-UP] #{元Issue番号}: {キーワード1}・{キーワード2}・{キーワード3}`
5. 80文字を超える場合は77文字で切り詰め + `...`
6. キーワードが抽出できない場合はフォールバック: `[FOLLOW-UP] Issue #{元Issue番号} - 残タスク`

#### RemainingTask 型の拡張
```typescript
export interface RemainingTask {
  task: string;                      // 既存（必須）
  phase: string;                     // 既存（必須）
  priority: string;                  // 既存（必須）

  // 新規フィールド（すべてオプショナル）
  priorityReason?: string;           // 優先度の理由
  targetFiles?: string[];            // 対象ファイルリスト
  steps?: string[];                  // 実行手順（番号付きリスト）
  acceptanceCriteria?: string[];     // 受け入れ基準（チェックリスト）
  dependencies?: string[];           // 依存タスク
  estimatedHours?: string;           // 見積もり工数（例: "2-4h"）
}
```

#### Evaluation Phase 側の実装方針
`handlePassWithIssues()` メソッドを修正し、以下の情報を Evaluation レポートから抽出:

1. **Issue Summary**: 元 Issue の概要（`issueTitle` から取得）
2. **Blocker Status**: "すべてのブロッカーは解決済み" 等
3. **Deferred Reason**: "タスク優先度の判断により後回し" 等

**注意**: 既存の Evaluation レポートにこれらの情報が含まれていない可能性があるため、Phase 1 で調査が必要。不足している場合は暫定的にデフォルト値を使用し、Phase 9 改善を別 Issue として提案。

---

## 10. 品質ゲート確認

Planning Phase (Phase 0) で定義された品質ゲートを確認します：

### Phase 1: 要件定義

- [x] **機能要件が明確に記載されている**（5つの機能要件を定義）
- [x] **受け入れ基準が定義されている**（各機能要件に受け入れ基準を記載、セクション6に統合版を記載）
- [x] **スコープが明確である**（セクション7に明記）
- [x] **論理的な矛盾がない**（Planning Document の戦略と整合性を確認）

---

## 改訂履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|----------|------|---------|--------|
| 1.0 | 2025-01-30 | 初版作成 | AI Workflow Phase 1 |

---

*本要件定義書は Planning Document (`.ai-workflow/issue-104/00_planning/output/planning.md`) の戦略に基づいて作成されています。*
