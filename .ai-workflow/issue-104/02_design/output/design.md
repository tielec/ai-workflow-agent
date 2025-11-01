# 詳細設計書 - Issue #104

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

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                     Evaluation Phase (Phase 9)                  │
│                   src/phases/evaluation.ts                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ handlePassWithIssues()
                         │ ・Issue Summary 抽出
                         │ ・Blocker Status 抽出
                         │ ・Deferred Reason 抽出
                         ▼
              ┌──────────────────────────┐
              │   IssueContext 構築      │
              │ {                        │
              │   summary: string        │
              │   blockerStatus: string  │
              │   deferredReason: string │
              │ }                        │
              └──────────┬───────────────┘
                         │
                         │ createIssueFromEvaluation() 呼び出し
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   IssueClient (GitHub API)                      │
│              src/core/github/issue-client.ts                    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  createIssueFromEvaluation()                           │   │
│  │  ・新規パラメータ: issueContext?: IssueContext         │   │
│  │  ・タイトル生成: generateFollowUpTitle()               │   │
│  │  ・本文生成: 背景セクション + 詳細タスク情報           │   │
│  └──────────────┬─────────────────────────────────────────┘   │
│                 │                                               │
│                 ├──► generateFollowUpTitle()                    │
│                 │    ・キーワード抽出: extractKeywords()        │
│                 │    ・80文字制限 + フォールバック              │
│                 │                                               │
│                 └──► formatTaskDetails()                        │
│                      ・対象ファイル表示                         │
│                      ・必要な作業表示                           │
│                      ・Acceptance Criteria 表示                 │
│                      ・優先度の根拠表示                         │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ GitHub API (Octokit)
                         ▼
              ┌──────────────────────────┐
              │  GitHub Issue 作成       │
              │  ・改善されたタイトル    │
              │  ・背景セクション付き    │
              │  ・詳細タスク情報付き    │
              └──────────────────────────┘
```

### 1.2 データフロー

```
[Evaluation Phase]
       │
       ├─► Evaluation レポート解析
       │   ・元 Issue タイトル取得
       │   ・ブロッカーステータス抽出
       │   ・タスク後回し理由抽出
       │
       ├─► IssueContext オブジェクト構築
       │   {
       │     summary: string,
       │     blockerStatus: string,
       │     deferredReason: string
       │   }
       │
       └─► createIssueFromEvaluation() 呼び出し
              │
              ├─► generateFollowUpTitle()
              │   ├─► extractKeywords(tasks, 3)
              │   │   └─► タスクテキストから主要キーワード抽出
              │   └─► フォーマット: [FOLLOW-UP] #{num}: {keywords}
              │
              ├─► 本文生成
              │   ├─► 背景セクション
              │   │   ├─► Issue Summary
              │   │   ├─► Blocker Status
              │   │   └─► Deferred Reason
              │   │
              │   └─► 残タスク詳細セクション
              │       ├─► 対象ファイル (targetFiles?)
              │       ├─► 必要な作業 (steps?)
              │       ├─► Acceptance Criteria (acceptanceCriteria?)
              │       ├─► 優先度 + 根拠 (priority + priorityReason?)
              │       ├─► 依存タスク (dependencies?)
              │       └─► 見積もり工数 (estimatedHours?)
              │
              └─► GitHub Issue 作成
```

### 1.3 コンポーネント間の関係

```
┌─────────────────────────────────────────────────────────────┐
│                        Types Layer                          │
│                      src/types.ts                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  RemainingTask (拡張)                                │  │
│  │  ・既存: task, phase, priority                       │  │
│  │  ・新規: priorityReason?, targetFiles?, steps?,      │  │
│  │         acceptanceCriteria?, dependencies?,          │  │
│  │         estimatedHours?                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  IssueContext (新規)                                 │  │
│  │  {                                                   │  │
│  │    summary: string,                                  │  │
│  │    blockerStatus: string,                            │  │
│  │    deferredReason: string                            │  │
│  │  }                                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 型定義を利用
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Client Layer                       │
│           src/core/github/issue-client.ts                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  IssueClient クラス                                  │  │
│  │                                                       │  │
│  │  ◆ 既存メソッド（拡張）:                             │  │
│  │    createIssueFromEvaluation(                        │  │
│  │      issueNumber,                                    │  │
│  │      remainingTasks,                                 │  │
│  │      evaluationReportPath,                           │  │
│  │      issueContext?: IssueContext  ← 新規             │  │
│  │    )                                                 │  │
│  │                                                       │  │
│  │  ◆ 新規 private メソッド:                            │  │
│  │    generateFollowUpTitle()                           │  │
│  │    extractKeywords()                                 │  │
│  │    formatTaskDetails()                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ 呼び出し
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Evaluation Phase Layer                    │
│                src/phases/evaluation.ts                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  EvaluationPhase クラス                              │  │
│  │                                                       │  │
│  │  ◆ 修正メソッド:                                     │  │
│  │    handlePassWithIssues()                            │  │
│  │    ・Evaluation レポートから情報抽出                 │  │
│  │    ・IssueContext オブジェクト構築                   │  │
│  │    ・createIssueFromEvaluation() に渡す              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- **既存コードの拡張が中心**: `IssueClient.createIssueFromEvaluation()` メソッドを拡張し、新規パラメータを追加する
- **新規ファイル作成は不要**: すべての修正は既存モジュール（`src/core/github/issue-client.ts`, `src/types.ts`, `src/phases/evaluation.ts`）への追加が中心
- **アーキテクチャレベルの変更は不要**: GitHub API 統合パターン、Evaluation Phase のフロー、型定義パターンは既存のままで十分
- **後方互換性を維持**: 新規パラメータはすべてオプショナル（`?:`）として定義し、既存の呼び出し元は無変更で動作する

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

#### ユニットテストが必要な理由
- **新規ヘルパーメソッドの独立性**: `generateFollowUpTitle()`, `extractKeywords()`, `formatTaskDetails()` は独立した関数として設計されており、ユニットテストで境界値テスト（空配列、長文、特殊文字等）が実施可能
- **タイトル生成ロジックの正確性検証**: キーワード抽出アルゴリズムが正しく動作するか、80文字制限とフォールバック処理が適切に機能するかを確認
- **型安全性の検証**: `RemainingTask` 型の新規オプショナルフィールドが正しく扱われるか確認

#### インテグレーションテストが必要な理由
- **Evaluation Phase との統合検証**: `handlePassWithIssues()` → `createIssueFromEvaluation()` のフロー全体が正しく動作するか確認
- **GitHub API モック（Octokit）との統合**: Issue 作成時に正しいタイトルと本文が送信されるか確認
- **既存フローの破壊がないことを確認**: 新規パラメータ未指定時、従来と同じ動作をすることを確認（後方互換性テスト）

#### BDD が不要な理由
- **エンドユーザー向けUI変更ではない**: フォローアップ Issue の改善は内部処理の改善であり、ユーザーストーリー形式のテストは不要
- **技術的な正確性が重要**: Given-When-Then よりも、関数単位の境界値テストや統合テストが適している

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:

#### 既存テストの拡張が必要な理由
- **既存テストファイルが存在**: `tests/unit/github/issue-client.test.ts` に `createIssueFromEvaluation()` のテストが既に存在する（行301-397）
- **後方互換性の検証**: 新規パラメータ未指定時、既存の動作が保たれることを確認するため、既存テストケースを拡張する
- **統一性の維持**: 既存のテストケース構造（モック、アサーション）に合わせてテストを追加することで、テストコード全体の一貫性を維持

#### 新規テストの作成が必要な理由
- **新規機能の専用テストスイート**: タイトル生成とキーワード抽出は完全に新しい機能であり、専用のテストスイートを作成することで可読性とメンテナンス性が向上
- **境界値テストの網羅**: 空配列、長大なタイトル、特殊文字、日本語・英語混在等のエッジケースを体系的にテスト
- **拡張された `RemainingTask` 型のフィールド処理テスト**: オプショナルフィールドが存在する場合・存在しない場合の両方をテスト

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### 変更が必要なファイル

1. **`src/types.ts`** (型定義の拡張)
   - **影響箇所**: `RemainingTask` interface（32-36行付近）
   - **変更内容**: 6つの新規フィールド追加（すべてオプショナル）
   - **影響度**: 低（後方互換性を維持）
   - **リスク**: 既存コードは新規フィールドを無視するだけで動作するため、破壊的変更なし

2. **`src/core/github/issue-client.ts`** (コア実装)
   - **影響箇所**: `createIssueFromEvaluation()` メソッド（178-232行）
   - **変更内容**:
     - メソッドシグネチャ拡張（新規パラメータ `issueContext?` 追加）
     - 新規 private メソッド追加（`generateFollowUpTitle`, `extractKeywords`, `formatTaskDetails`）
   - **影響度**: 中（既存の呼び出し元には影響なし、内部ロジックは大きく変更）
   - **リスク**: 新規パラメータがオプショナルなため、既存の呼び出し元は無変更で動作

3. **`src/phases/evaluation.ts`** (呼び出し側)
   - **影響箇所**: `handlePassWithIssues()` メソッド（420-449行付近）
   - **変更内容**:
     - Evaluation レポートから情報抽出ロジックの追加
     - `IssueContext` オブジェクトの構築
     - `createIssueFromEvaluation()` 呼び出し時に `issueContext` を渡す
   - **影響度**: 中（Evaluation Phase の内部処理のみ影響、外部インターフェースには影響なし）
   - **リスク**: Evaluation レポートに必要な情報が含まれていない可能性（→ フォールバック処理で対応）

4. **`tests/unit/github/issue-client.test.ts`** (既存テスト)
   - **影響箇所**: `createIssueFromEvaluation()` のテストケース（301-397行）
   - **変更内容**:
     - 既存テストケースの拡張（新規パラメータ指定時のテスト追加）
     - 後方互換性テストの追加（新規パラメータ未指定時のテスト）
   - **影響度**: 低（テストコードの追加のみ）

#### 新規作成が必要なファイル

以下のファイルは **推奨** であり、必須ではありません。既存のテストファイルに統合する形でも問題ありません。

- **`tests/unit/github/issue-title-generator.test.ts`** (新規テストファイル、オプション)
  - タイトル生成ロジックとキーワード抽出ロジックの専用テストスイート
  - 境界値テスト、エッジケーステストを体系的に実施

### 5.2 依存関係の変更

**新規依存の追加**: なし

**既存依存の変更**: なし

**型定義の拡張**:
- `RemainingTask` 型の拡張（`src/types.ts`）
  - すべてのフィールドをオプショナル（`?:`）として定義することで、後方互換性を維持
  - Evaluation Phase 以外で `RemainingTask` を使用している箇所がないことを確認（Grep で検索）

### 5.3 マイグレーション要否

**不要**

**理由**:
- すべての新規フィールドはオプショナル（`?:`）として定義
- 新規パラメータ（`issueContext`）もオプショナルとして定義
- 既存のコードは新規フィールドを無視するだけで動作する
- Evaluation Phase 以外で `RemainingTask` を使用している箇所がない（影響範囲が限定的）

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

なし（すべて既存ファイルへの追加）

### 6.2 修正が必要な既存ファイル

1. `src/types.ts`
   - `RemainingTask` interface の拡張
   - `IssueContext` interface の追加

2. `src/core/github/issue-client.ts`
   - `createIssueFromEvaluation()` メソッドの拡張
   - `generateFollowUpTitle()` メソッドの追加
   - `extractKeywords()` メソッドの追加
   - `formatTaskDetails()` メソッドの追加

3. `src/phases/evaluation.ts`
   - `handlePassWithIssues()` メソッドの修正

4. `tests/unit/github/issue-client.test.ts`
   - 既存テストケースの拡張
   - 新規テストケースの追加

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 型定義の拡張（`src/types.ts`）

#### 7.1.1 `RemainingTask` interface の拡張

```typescript
/**
 * Evaluation Phase で検出された残タスク
 */
export interface RemainingTask {
  // ===== 既存フィールド（必須） =====
  /** タスクの説明 */
  task: string;

  /** 対象フェーズ（例: "implementation", "testing"） */
  phase: string;

  /** 優先度（例: "High", "Medium", "Low"） */
  priority: string;

  // ===== 新規フィールド（すべてオプショナル） =====

  /**
   * 優先度の理由
   * 例: "元 Issue #91 の推奨事項、ブロッカーではない"
   */
  priorityReason?: string;

  /**
   * 対象ファイル/モジュールのリスト
   * 例: ["src/core/phase-factory.ts", "src/commands/execute/agent-setup.ts"]
   */
  targetFiles?: string[];

  /**
   * 実行手順（番号付きリスト）
   * 例: ["不足しているテストケースを特定", "エッジケースのテストを追加"]
   */
  steps?: string[];

  /**
   * 受け入れ基準（Acceptance Criteria）
   * 例: ["すべての対象モジュールで 90% 以上のカバレッジを達成", "npm run test:coverage がすべてパス"]
   */
  acceptanceCriteria?: string[];

  /**
   * 依存タスク
   * 例: ["Task 1 完了後に実行", "Phase 4 の修正が必要"]
   */
  dependencies?: string[];

  /**
   * 見積もり工数
   * 例: "2-4h", "1日", "0.5h"
   */
  estimatedHours?: string;
}
```

#### 7.1.2 `IssueContext` interface の追加

```typescript
/**
 * フォローアップ Issue の背景コンテキスト
 * Evaluation Phase から IssueClient に渡される
 */
export interface IssueContext {
  /**
   * 元 Issue の概要
   * 例: "Issue #91 では、BasePhase モジュール分解（Issue #49）で発生した 15 件のテスト失敗を修正しました。"
   */
  summary: string;

  /**
   * ブロッカーのステータス
   * 例: "すべてのブロッカーは解決済み"
   */
  blockerStatus: string;

  /**
   * タスクが残った理由
   * 例: "テスト失敗修正を優先したため、カバレッジ改善は後回しにした"
   */
  deferredReason: string;
}
```

### 7.2 IssueClient の実装（`src/core/github/issue-client.ts`）

#### 7.2.1 `createIssueFromEvaluation()` メソッドの拡張

**既存シグネチャ**:
```typescript
public async createIssueFromEvaluation(
  issueNumber: number,
  remainingTasks: RemainingTask[],
  evaluationReportPath: string,
): Promise<IssueCreationResult>
```

**新規シグネチャ**:
```typescript
public async createIssueFromEvaluation(
  issueNumber: number,
  remainingTasks: RemainingTask[],
  evaluationReportPath: string,
  issueContext?: IssueContext,  // 新規パラメータ（オプショナル）
): Promise<IssueCreationResult>
```

**実装方針**:
1. タイトル生成: `generateFollowUpTitle()` を呼び出し
2. 本文生成:
   - 背景セクション: `issueContext` が存在する場合のみ表示
   - 残タスク詳細セクション: `formatTaskDetails()` を呼び出し、各タスクの詳細情報を表示
3. GitHub Issue 作成: Octokit API 呼び出し

**実装例**:
```typescript
/**
 * Evaluation Phase の結果から、フォローアップ Issue を作成する
 *
 * @param issueNumber - 元 Issue 番号
 * @param remainingTasks - 残タスクのリスト
 * @param evaluationReportPath - Evaluation レポートのパス
 * @param issueContext - Issue コンテキスト（背景情報、オプショナル）
 * @returns Issue 作成結果
 */
public async createIssueFromEvaluation(
  issueNumber: number,
  remainingTasks: RemainingTask[],
  evaluationReportPath: string,
  issueContext?: IssueContext,
): Promise<IssueCreationResult> {
  logger.info(`Creating follow-up issue for #${issueNumber} with ${remainingTasks.length} remaining tasks`);

  // タイトル生成
  const title = this.generateFollowUpTitle(issueNumber, remainingTasks);

  // 本文生成
  const lines: string[] = [];

  // 背景セクション（issueContext が存在する場合のみ）
  if (issueContext) {
    lines.push('## 背景', '');
    lines.push(issueContext.summary, '');

    if (issueContext.blockerStatus) {
      lines.push('### 元 Issue のステータス', '');
      lines.push(issueContext.blockerStatus, '');
    }

    if (issueContext.deferredReason) {
      lines.push('### なぜこれらのタスクが残ったか', '');
      lines.push(issueContext.deferredReason, '');
    }
  } else {
    // フォールバック: issueContext がない場合は従来形式
    lines.push('## 背景', '');
    lines.push(`AI Workflow Issue #${issueNumber} の評価フェーズで残タスクが見つかりました。`, '');
  }

  // 残タスク詳細セクション
  lines.push('## 残タスク詳細', '');

  for (let i = 0; i < remainingTasks.length; i++) {
    const task = remainingTasks[i];
    const taskNumber = i + 1;

    lines.push(...this.formatTaskDetails(task, taskNumber));
    lines.push(''); // タスク間の空行
  }

  // 参考セクション
  lines.push('## 参考', '');
  lines.push(`- 元Issue: #${issueNumber}`);
  lines.push(`- Evaluation Report: \`${evaluationReportPath}\``);
  lines.push('', '---', '*自動生成: AI Workflow Phase 9 (Evaluation)*');

  // GitHub Issue 作成
  try {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body: lines.join('\n'),
      labels: ['enhancement', 'ai-workflow-follow-up'],
    });

    logger.info(`Follow-up issue created: #${data.number} - ${title}`);

    return {
      success: true,
      issueNumber: data.number,
      issueUrl: data.html_url,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error(`Failed to create follow-up issue: ${errorMessage}`);
    throw error;
  }
}
```

#### 7.2.2 `generateFollowUpTitle()` メソッド（新規 private メソッド）

**目的**: フォローアップ Issue のタイトルを生成する

**アルゴリズム**:
1. `remainingTasks` から最大3つのタスクを取得
2. 各タスクから主要なキーワードを抽出（`extractKeywords()` を呼び出し）
3. キーワードを中黒（`・`）で結合
4. フォーマット: `[FOLLOW-UP] #{元Issue番号}: {キーワード1}・{キーワード2}・{キーワード3}`
5. 80文字を超える場合は77文字で切り詰め + `...`
6. キーワードが抽出できない場合はフォールバック: `[FOLLOW-UP] Issue #{元Issue番号} - 残タスク`

**実装例**:
```typescript
/**
 * フォローアップ Issue のタイトルを生成する
 *
 * @param issueNumber - 元 Issue 番号
 * @param remainingTasks - 残タスクのリスト
 * @returns Issue タイトル（80文字以内）
 */
private generateFollowUpTitle(issueNumber: number, remainingTasks: RemainingTask[]): string {
  // キーワード抽出（最大3個）
  const keywords = this.extractKeywords(remainingTasks, 3);

  // キーワードが抽出できた場合
  if (keywords.length > 0) {
    const keywordsStr = keywords.join('・');
    const title = `[FOLLOW-UP] #${issueNumber}: ${keywordsStr}`;

    // 80文字制限
    if (title.length > 80) {
      return title.substring(0, 77) + '...';
    }

    return title;
  }

  // フォールバック: キーワードが抽出できない場合は従来形式
  return `[FOLLOW-UP] Issue #${issueNumber} - 残タスク`;
}
```

#### 7.2.3 `extractKeywords()` メソッド（新規 private メソッド）

**目的**: タスクテキストから主要なキーワードを抽出する

**アルゴリズム**:
1. `remainingTasks` から `maxCount` 個のタスクを取得
2. 各タスクのテキスト（`task.task`）から以下のルールでキーワードを抽出:
   - 括弧（`（`, `(`）の前まで
   - または、最初の20文字
   - 前後の空白を削除
3. 空文字列は除外
4. 抽出されたキーワードの配列を返す

**実装例**:
```typescript
/**
 * 残タスクから主要なキーワードを抽出する
 *
 * @param tasks - 残タスクのリスト
 * @param maxCount - 抽出する最大キーワード数
 * @returns キーワードの配列
 */
private extractKeywords(tasks: RemainingTask[], maxCount: number): string[] {
  const keywords: string[] = [];

  for (const task of tasks.slice(0, maxCount)) {
    const taskText = String(task.task ?? '');

    if (!taskText.trim()) {
      continue; // 空のタスクはスキップ
    }

    // 括弧前まで、または最初の20文字を抽出
    let keyword = taskText.split('（')[0].split('(')[0].trim();

    // 20文字制限
    if (keyword.length > 20) {
      keyword = keyword.substring(0, 20);
    }

    if (keyword) {
      keywords.push(keyword);
    }
  }

  return keywords;
}
```

**設計判断**:
- **シンプルなアルゴリズム**: 複雑な自然言語処理は避け、正規表現ベースのシンプルなロジックを採用
- **複数言語対応**: 日本語・英語の括弧（`（`, `(`）に対応
- **フォールバック**: キーワードが抽出できない場合は空配列を返し、`generateFollowUpTitle()` 側でフォールバック処理

#### 7.2.4 `formatTaskDetails()` メソッド（新規 private メソッド）

**目的**: 残タスクの詳細情報をフォーマットする

**アルゴリズム**:
1. タスク見出し: `### Task {番号}: {task.task}`
2. 対象ファイル: `task.targetFiles` が存在する場合のみ表示
3. 必要な作業: `task.steps` が存在する場合のみ表示（番号付きリスト）
4. Acceptance Criteria: `task.acceptanceCriteria` が存在する場合のみ表示（チェックリスト形式）
5. Phase: `task.phase`（デフォルト: `'unknown'`）
6. 優先度: `task.priority`（デフォルト: `'中'`） + `task.priorityReason`（存在する場合）
7. 見積もり工数: `task.estimatedHours`（デフォルト: `'未定'`）
8. 依存タスク: `task.dependencies` が存在する場合のみ表示

**実装例**:
```typescript
/**
 * 残タスクの詳細情報をフォーマットする
 *
 * @param task - 残タスク
 * @param taskNumber - タスク番号（1始まり）
 * @returns フォーマットされた行の配列
 */
private formatTaskDetails(task: RemainingTask, taskNumber: number): string[] {
  const lines: string[] = [];

  // タスク見出し
  lines.push(`### Task ${taskNumber}: ${task.task}`, '');

  // 対象ファイル（存在する場合のみ）
  if (task.targetFiles && task.targetFiles.length > 0) {
    lines.push('**対象ファイル**:', '');
    task.targetFiles.forEach(file => lines.push(`- \`${file}\``));
    lines.push('');
  }

  // 必要な作業（存在する場合のみ）
  if (task.steps && task.steps.length > 0) {
    lines.push('**必要な作業**:', '');
    task.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push('');
  }

  // Acceptance Criteria（存在する場合のみ）
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    lines.push('**Acceptance Criteria**:', '');
    task.acceptanceCriteria.forEach(ac => lines.push(`- [ ] ${ac}`));
    lines.push('');
  }

  // Phase
  lines.push(`**Phase**: ${task.phase ?? 'unknown'}`, '');

  // 優先度 + 根拠
  const priority = task.priority ?? '中';
  const priorityLine = task.priorityReason
    ? `**優先度**: ${priority} - ${task.priorityReason}`
    : `**優先度**: ${priority}`;
  lines.push(priorityLine, '');

  // 見積もり工数
  lines.push(`**見積もり**: ${task.estimatedHours ?? '未定'}`, '');

  // 依存タスク（存在する場合のみ）
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push('**依存タスク**:', '');
    task.dependencies.forEach(dep => lines.push(`- ${dep}`));
    lines.push('');
  }

  lines.push('---'); // タスク間の区切り線

  return lines;
}
```

### 7.3 Evaluation Phase の実装（`src/phases/evaluation.ts`）

#### 7.3.1 `handlePassWithIssues()` メソッドの修正

**既存処理**:
1. `remainingTasks` を取得
2. `createIssueFromEvaluation()` を呼び出し

**新規処理**:
1. `remainingTasks` を取得
2. **Evaluation レポートから情報抽出**（新規）:
   - Issue Summary: `issueTitle` から取得、またはメタデータから
   - Blocker Status: デフォルト値 `"すべてのブロッカーは解決済み"`（Evaluation レポートからの抽出は Phase 1 で調査し、不足している場合は別 Issue として提案）
   - Deferred Reason: デフォルト値 `"タスク優先度の判断により後回し"`（同上）
3. **`IssueContext` オブジェクト構築**（新規）
4. `createIssueFromEvaluation()` に `issueContext` を渡す

**実装例**:
```typescript
/**
 * Evaluation 結果が「Pass with Issues」の場合の処理
 * フォローアップ Issue を作成する
 */
private async handlePassWithIssues(
  evaluationResult: EvaluationResult,
  issueNumber: number,
  evaluationReportPath: string,
): Promise<void> {
  const remainingTasks = evaluationResult.remainingTasks ?? [];

  if (remainingTasks.length === 0) {
    logger.warn('Evaluation result is "Pass with Issues", but no remaining tasks found');
    return;
  }

  logger.info(`Creating follow-up issue for ${remainingTasks.length} remaining tasks`);

  // ===== 新規: Issue コンテキストの構築 =====

  // Issue Summary: issueTitle から取得（メタデータに存在する場合）
  const metadata = this.metadataManager.getMetadata();
  const issueTitle = metadata.issue_title ?? `Issue #${issueNumber}`;

  // Blocker Status: デフォルト値（Evaluation レポートからの抽出は Phase 1 で調査）
  // TODO: 将来的には Evaluation レポートから抽出する（Phase 9 改善、別 Issue として提案）
  const blockerStatus = 'すべてのブロッカーは解決済み';

  // Deferred Reason: デフォルト値（同上）
  // TODO: 将来的には Evaluation レポートから抽出する（Phase 9 改善、別 Issue として提案）
  const deferredReason = 'タスク優先度の判断により後回し';

  const issueContext: IssueContext = {
    summary: `この Issue は、Issue #${issueNumber}「${issueTitle}」の Evaluation フェーズで特定された残タスクをまとめたものです。`,
    blockerStatus,
    deferredReason,
  };

  // ===== 既存: フォローアップ Issue 作成 =====

  const result = await this.githubClient.createIssueFromEvaluation(
    issueNumber,
    remainingTasks,
    evaluationReportPath,
    issueContext, // 新規パラメータ
  );

  if (result.success) {
    logger.info(`Follow-up issue created: #${result.issueNumber}`);
    logger.info(`Follow-up issue URL: ${result.issueUrl}`);

    // メタデータに記録
    this.metadataManager.updatePhase(this.phaseName, {
      output_files: [evaluationReportPath],
      followUpIssue: {
        number: result.issueNumber,
        url: result.issueUrl,
      },
    });
  } else {
    logger.error('Failed to create follow-up issue');
  }
}
```

**設計判断**:
- **デフォルト値の使用**: Evaluation レポートから情報が抽出できない場合（Phase 1 で調査）は、デフォルト値を使用
- **フォールバックロジック**: `issueContext` パラメータ自体がオプショナルなため、情報が不足している場合でも Issue 作成は可能
- **TODO コメント**: 将来的な改善（Phase 9 のプロンプト改善）を明記し、別 Issue として提案する

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

**現状のセキュリティ対策**:
- GitHub API アクセスには `GITHUB_TOKEN` 環境変数を使用
- Octokit クライアントは `src/core/github-client.ts` で一元管理
- トークンは環境変数経由で注入され、コードにハードコードされない

**本 Issue による影響**:
- 新規の認証・認可要件なし
- 既存の GitHub API 統合パターンをそのまま利用

### 8.2 データ保護

**リスク**:
- **Evaluation レポートの機密情報**: Evaluation レポートには Issue 内容、コード変更、テスト結果等の情報が含まれる可能性がある
- **フォローアップ Issue への情報流出**: フォローアップ Issue の本文に機密情報が含まれる可能性

**対策**:
- **パブリックリポジトリでは慎重に使用**: フォローアップ Issue はリポジトリと同じ可視性（public/private）で作成される
- **機密情報のフィルタリングは実施しない**: 本 Issue の範囲外（将来的な改善として別 Issue で提案）
- **既存の SecretMasker との統合は不要**: フォローアップ Issue 作成時には Git コミット処理は発生しないため

### 8.3 セキュリティリスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| GitHub API トークンの流出 | 高 | 環境変数経由で注入、コードにハードコードしない（既存対策） |
| Evaluation レポート内の機密情報が Issue に含まれる | 中 | パブリックリポジトリでは慎重に使用（運用レベルで対応） |
| タイトル生成時の XSS（クロスサイトスクリプティング） | 低 | GitHub Issue タイトルは自動エスケープされる（GitHub 側で対策済み） |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

**要件**（要件定義書 NFR-2 より）:
- タイトル生成処理時間: 100ms 以内
- キーワード抽出処理時間: 50ms 以内（タスク1件あたり）
- Issue 作成全体の処理時間: 既存実装と比較して 10% 以内の増加

**対策**:
- **シンプルなアルゴリズム**: `extractKeywords()` は正規表現ベースのシンプルなロジックを採用し、複雑な自然言語処理を避ける
- **最大3タスク制限**: タイトル生成時に処理するタスク数を最大3個に制限（`remainingTasks.slice(0, maxCount)`）
- **GitHub API 呼び出しは1回のみ**: Issue 作成は `octokit.issues.create()` を1回呼び出すのみ

**測定方法**:
- ユニットテストで `generateFollowUpTitle()` と `extractKeywords()` の実行時間を計測
- インテグレーションテストで `createIssueFromEvaluation()` 全体の実行時間を計測

### 9.2 スケーラビリティ

**考慮事項**:
- **大量の残タスク**: 残タスクが10個以上の場合、Issue 本文が長大になる可能性
- **GitHub API レート制限**: Issue 作成は GitHub API を使用するため、レート制限に注意

**対策**:
- **タイトル生成は最大3タスク**: `extractKeywords(tasks, 3)` により、タスク数が多くてもタイトルは適切な長さを維持
- **本文長の制限は実施しない**: GitHub Issue 本文には実質的な長さ制限がないため、タスク数による制限は不要
- **レート制限エラーハンドリング**: GitHub API 呼び出し時のエラーハンドリングは既存の `IssueClient` で実装済み（リトライロジック）

### 9.3 保守性

**要件**（要件定義書 NFR-3 より）:
- タイトル生成ロジックを独立したメソッド（`generateFollowUpTitle()`）に分離
- キーワード抽出ロジックを独立したメソッド（`extractKeywords()`）に分離
- Issue 本文生成ロジックを独立したメソッド（`formatTaskDetails()`）に分離
- 各メソッドに JSDoc コメントを追加
- `RemainingTask` 型の新規フィールドに JSDoc コメントを追加

**実装方針**:
- **Single Responsibility Principle（単一責任の原則）**: 各メソッドは1つの責務のみを持つ
- **DRY原則（Don't Repeat Yourself）**: タスク詳細フォーマット処理を `formatTaskDetails()` に集約
- **JSDoc コメントの徹底**: すべての public/private メソッドに JSDoc コメントを追加し、パラメータ・戻り値・例外を明記

**メソッド責務分担**:
```
createIssueFromEvaluation()  … オーケストレーション（全体フロー制御）
├─ generateFollowUpTitle()   … タイトル生成
│  └─ extractKeywords()       … キーワード抽出
└─ formatTaskDetails()        … タスク詳細フォーマット
```

---

## 10. 実装の順序

### 10.1 推奨実装順序

実装は以下の順序で行うことを推奨します（依存関係を考慮）：

#### Phase 1: 型定義の拡張
1. `src/types.ts` の `RemainingTask` interface を拡張
   - 6つの新規フィールド追加（すべてオプショナル）
   - JSDoc コメント追加
2. `src/types.ts` に `IssueContext` interface を追加
   - JSDoc コメント追加

**理由**: 型定義が完成しないと、後続の実装でTypeScriptコンパイルエラーが発生する

#### Phase 2: IssueClient のヘルパーメソッド実装
3. `src/core/github/issue-client.ts` に `extractKeywords()` メソッドを追加
   - キーワード抽出ロジック
   - JSDoc コメント
4. `src/core/github/issue-client.ts` に `generateFollowUpTitle()` メソッドを追加
   - タイトル生成ロジック
   - `extractKeywords()` を呼び出し
   - JSDoc コメント
5. `src/core/github/issue-client.ts` に `formatTaskDetails()` メソッドを追加
   - タスク詳細フォーマットロジック
   - JSDoc コメント

**理由**: ヘルパーメソッドを先に実装することで、ユニットテストを早期に開始できる

#### Phase 3: IssueClient のメインメソッド拡張
6. `src/core/github/issue-client.ts` の `createIssueFromEvaluation()` メソッドを拡張
   - 新規パラメータ `issueContext?` を追加
   - `generateFollowUpTitle()` を呼び出し
   - 本文生成ロジックを修正（背景セクション、詳細タスク情報）
   - `formatTaskDetails()` を呼び出し

**理由**: ヘルパーメソッドが完成した後にメインメソッドを実装することで、スムーズな統合が可能

#### Phase 4: Evaluation Phase の修正
7. `src/phases/evaluation.ts` の `handlePassWithIssues()` メソッドを修正
   - `IssueContext` オブジェクト構築
   - `createIssueFromEvaluation()` 呼び出し時に `issueContext` を渡す
   - デフォルト値の使用（Blocker Status, Deferred Reason）

**理由**: IssueClient の実装が完了した後に Evaluation Phase を修正することで、統合テストが容易

#### Phase 5: テストコード実装
8. `tests/unit/github/issue-client.test.ts` に新規テストケースを追加
   - `extractKeywords()` のユニットテスト
   - `generateFollowUpTitle()` のユニットテスト
   - `formatTaskDetails()` のユニットテスト
   - `createIssueFromEvaluation()` の拡張テスト（新規パラメータ指定時）
   - 後方互換性テスト（新規パラメータ未指定時）
9. （オプション）`tests/unit/github/issue-title-generator.test.ts` を作成
   - 境界値テスト、エッジケーステストを体系的に実施

**理由**: すべての実装が完了した後にテストコードを実装することで、統合的なテストが可能

### 10.2 依存関係の考慮

```
Phase 1 (型定義)
   │
   ├─► Phase 2 (ヘルパーメソッド) ─┐
   │                               │
   └─► Phase 3 (メインメソッド) ◄─┘
          │
          └─► Phase 4 (Evaluation Phase)
                 │
                 └─► Phase 5 (テストコード)
```

**並列化可能な箇所**:
- Phase 2（ヘルパーメソッド）の3つのメソッドは並列実装可能（依存関係がない）
- Phase 5（テストコード）の各テストスイートは並列実装可能

---

## 11. テスト戦略の詳細

### 11.1 ユニットテスト

#### 11.1.1 `extractKeywords()` のテスト

**テストケース**:
1. **正常系**:
   - 3つのタスクから3つのキーワードを抽出
   - 1つのタスクから1つのキーワードを抽出
   - 括弧前まで抽出（日本語括弧 `（`）
   - 括弧前まで抽出（英語括弧 `(`）
2. **境界値**:
   - 空配列 → 空配列を返す
   - タスクが10個ある場合、最大3個のみ抽出
   - タスクテキストが20文字を超える場合、20文字で切り詰め
3. **異常系**:
   - タスクテキストが空文字列 → スキップ
   - タスクテキストが `null` / `undefined` → スキップ
   - すべてのタスクが空 → 空配列を返す

**実装例**:
```typescript
describe('extractKeywords', () => {
  it('should extract keywords from tasks', () => {
    const tasks: RemainingTask[] = [
      { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
      { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
      { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
    ];

    const keywords = issueClient['extractKeywords'](tasks, 3);

    expect(keywords).toEqual([
      'Coverage improvement to 90%',
      'Performance benchmark execution',
      'Documentation updates',
    ]);
  });

  it('should extract keywords before parentheses', () => {
    const tasks: RemainingTask[] = [
      { task: 'Jest設定を修正（src/jest.config.js）', phase: 'implementation', priority: 'High' },
    ];

    const keywords = issueClient['extractKeywords'](tasks, 1);

    expect(keywords).toEqual(['Jest設定を修正']);
  });

  it('should truncate keywords to 20 characters', () => {
    const tasks: RemainingTask[] = [
      { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
    ];

    const keywords = issueClient['extractKeywords'](tasks, 1);

    expect(keywords[0]).toHaveLength(20);
  });

  it('should return empty array for empty tasks', () => {
    const tasks: RemainingTask[] = [];

    const keywords = issueClient['extractKeywords'](tasks, 3);

    expect(keywords).toEqual([]);
  });
});
```

#### 11.1.2 `generateFollowUpTitle()` のテスト

**テストケース**:
1. **正常系**:
   - 3つのキーワードから正しいタイトルを生成
   - 1つのキーワードから正しいタイトルを生成
2. **境界値**:
   - タイトルが80文字以内の場合、そのまま返す
   - タイトルが80文字を超える場合、77文字で切り詰め + `...`
3. **異常系**:
   - キーワードが抽出できない場合、フォールバック形式を返す

**実装例**:
```typescript
describe('generateFollowUpTitle', () => {
  it('should generate title with keywords', () => {
    const tasks: RemainingTask[] = [
      { task: 'テストカバレッジ改善', phase: 'test_implementation', priority: 'Medium' },
      { task: 'パフォーマンスベンチマーク', phase: 'testing', priority: 'Medium' },
    ];

    const title = issueClient['generateFollowUpTitle'](91, tasks);

    expect(title).toBe('[FOLLOW-UP] #91: テストカバレッジ改善・パフォーマンスベンチマーク');
  });

  it('should truncate title to 80 characters', () => {
    const tasks: RemainingTask[] = [
      { task: 'Very long task description 1', phase: 'implementation', priority: 'High' },
      { task: 'Very long task description 2', phase: 'implementation', priority: 'High' },
      { task: 'Very long task description 3', phase: 'implementation', priority: 'High' },
    ];

    const title = issueClient['generateFollowUpTitle'](123, tasks);

    expect(title).toHaveLength(80);
    expect(title).toEndWith('...');
  });

  it('should use fallback format when no keywords', () => {
    const tasks: RemainingTask[] = [
      { task: '', phase: 'implementation', priority: 'High' },
    ];

    const title = issueClient['generateFollowUpTitle'](52, tasks);

    expect(title).toBe('[FOLLOW-UP] Issue #52 - 残タスク');
  });
});
```

#### 11.1.3 `formatTaskDetails()` のテスト

**テストケース**:
1. **正常系**:
   - すべてのオプショナルフィールドが存在する場合、すべて表示
   - すべてのオプショナルフィールドが存在しない場合、最小限の情報のみ表示
2. **境界値**:
   - `targetFiles` が空配列の場合、セクション非表示
   - `steps` が1個の場合、番号付きリストで表示
   - `acceptanceCriteria` が複数の場合、すべてチェックリスト形式で表示

**実装例**:
```typescript
describe('formatTaskDetails', () => {
  it('should format task with all fields', () => {
    const task: RemainingTask = {
      task: 'カバレッジを 90% に改善',
      phase: 'test_implementation',
      priority: 'Medium',
      priorityReason: '元 Issue #91 の推奨事項',
      targetFiles: ['src/core/phase-factory.ts', 'src/commands/execute/agent-setup.ts'],
      steps: ['不足しているテストケースを特定', 'エッジケースのテストを追加'],
      acceptanceCriteria: ['90% 以上のカバレッジを達成', 'npm run test:coverage がパス'],
      estimatedHours: '2-4h',
    };

    const lines = issueClient['formatTaskDetails'](task, 1);

    expect(lines).toContain('### Task 1: カバレッジを 90% に改善');
    expect(lines).toContain('**対象ファイル**:');
    expect(lines).toContain('**必要な作業**:');
    expect(lines).toContain('**Acceptance Criteria**:');
    expect(lines).toContain('**優先度**: Medium - 元 Issue #91 の推奨事項');
    expect(lines).toContain('**見積もり**: 2-4h');
  });

  it('should format task with minimal fields', () => {
    const task: RemainingTask = {
      task: 'ドキュメント更新',
      phase: 'documentation',
      priority: 'Low',
    };

    const lines = issueClient['formatTaskDetails'](task, 2);

    expect(lines).toContain('### Task 2: ドキュメント更新');
    expect(lines).toContain('**Phase**: documentation');
    expect(lines).toContain('**優先度**: Low');
    expect(lines).toContain('**見積もり**: 未定');
    expect(lines).not.toContain('**対象ファイル**:');
    expect(lines).not.toContain('**必要な作業**:');
  });
});
```

### 11.2 インテグレーションテスト

#### 11.2.1 `createIssueFromEvaluation()` の統合テスト

**テストケース**:
1. **正常系**:
   - `issueContext` 指定時、背景セクションが含まれる
   - `issueContext` 未指定時、フォールバック形式の背景が含まれる
   - タイトルがタスク内容を反映している
2. **後方互換性**:
   - 新規パラメータ未指定時、従来と同じ Issue が作成される
   - 既存の呼び出し元が壊れない

**実装例**:
```typescript
describe('createIssueFromEvaluation - integration', () => {
  it('should create issue with issueContext', async () => {
    const remainingTasks: RemainingTask[] = [
      { task: 'テストカバレッジ改善', phase: 'test_implementation', priority: 'Medium' },
    ];

    const issueContext: IssueContext = {
      summary: 'Issue #91 の評価フェーズで残タスクが見つかりました',
      blockerStatus: 'すべてのブロッカーは解決済み',
      deferredReason: 'テスト失敗修正を優先したため',
    };

    const result = await issueClient.createIssueFromEvaluation(
      91,
      remainingTasks,
      '.ai-workflow/issue-91/09_evaluation/output/evaluation_report.md',
      issueContext,
    );

    expect(result.success).toBe(true);
    expect(mockOctokit.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('[FOLLOW-UP] #91:'),
        body: expect.stringContaining('## 背景'),
      }),
    );
  });

  it('should create issue without issueContext (backward compatibility)', async () => {
    const remainingTasks: RemainingTask[] = [
      { task: 'ドキュメント更新', phase: 'documentation', priority: 'Low' },
    ];

    const result = await issueClient.createIssueFromEvaluation(
      52,
      remainingTasks,
      '.ai-workflow/issue-52/09_evaluation/output/evaluation_report.md',
      // issueContext 未指定
    );

    expect(result.success).toBe(true);
    expect(mockOctokit.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('[FOLLOW-UP]'),
        body: expect.stringContaining('AI Workflow Issue #52 の評価フェーズで残タスクが見つかりました'),
      }),
    );
  });
});
```

### 11.3 カバレッジ目標

**目標**: 90% 以上

**重要なメソッドのカバレッジ目標**: 100%
- `generateFollowUpTitle()`
- `extractKeywords()`
- `formatTaskDetails()`
- `createIssueFromEvaluation()`

---

## 12. 設計の検証と品質ゲート確認

### 12.1 品質ゲート（Phase 2）の確認

- [x] **実装戦略の判断根拠が明記されている**
  - セクション 2「実装戦略判断」で EXTEND を選択し、4つの具体的な判断根拠を記載

- [x] **テスト戦略の判断根拠が明記されている**
  - セクション 3「テスト戦略判断」で UNIT_INTEGRATION を選択し、ユニットテストとインテグレーションテストが必要な理由、BDD が不要な理由を記載

- [x] **テストコード戦略の判断根拠が明記されている**
  - セクション 4「テストコード戦略判断」で BOTH_TEST を選択し、既存テストの拡張と新規テストの作成が必要な理由を記載

- [x] **既存コードへの影響範囲が分析されている**
  - セクション 5「影響範囲分析」で、変更が必要なファイル4つ、影響度、リスクを詳細に記載

- [x] **変更が必要なファイルがリストアップされている**
  - セクション 6「変更・追加ファイルリスト」で、修正が必要な既存ファイル4つをリストアップ

- [x] **設計が実装可能である**
  - セクション 7「詳細設計」で、クラス設計、関数設計、実装例を具体的に記載
  - セクション 10「実装の順序」で、実装手順と依存関係を明示

### 12.2 要件定義書との整合性

| 要件ID | 要件 | 設計での対応 | セクション |
|--------|------|------------|-----------|
| FR-1 | タイトル生成の改善 | `generateFollowUpTitle()`, `extractKeywords()` メソッドを設計 | 7.2.2, 7.2.3 |
| FR-2 | Issue 本文の背景セクション追加 | `IssueContext` 型と `createIssueFromEvaluation()` の拡張を設計 | 7.1.2, 7.2.1 |
| FR-3 | タスク詳細情報の拡充 | `RemainingTask` 型の拡張と `formatTaskDetails()` メソッドを設計 | 7.1.1, 7.2.4 |
| FR-4 | Evaluation Phase 側の情報抽出強化 | `handlePassWithIssues()` メソッドの修正を設計 | 7.3.1 |
| FR-5 | Issue 本文テンプレートの改善 | `createIssueFromEvaluation()` の本文生成ロジックを設計 | 7.2.1 |
| NFR-1 | 後方互換性 | 新規パラメータをすべてオプショナルとして設計 | 7.1.1, 7.2.1 |
| NFR-2 | パフォーマンス | シンプルなアルゴリズムと最大3タスク制限を設計 | 9.1 |
| NFR-3 | 保守性・拡張性 | ヘルパーメソッドへの分離と JSDoc コメントを設計 | 9.3 |
| NFR-4 | テスト容易性 | ユニットテストとインテグレーションテストの詳細を設計 | 11 |

### 12.3 Planning Document との整合性

| Planning Document の項目 | 設計での対応 | セクション |
|-------------------------|------------|-----------|
| 実装戦略: EXTEND | ✅ 一致（既存コードの拡張） | 2 |
| テスト戦略: UNIT_INTEGRATION | ✅ 一致（ユニットテスト + インテグレーションテスト） | 3 |
| テストコード戦略: BOTH_TEST | ✅ 一致（既存テスト拡張 + 新規テスト作成） | 4 |
| 主なリスク: 後方互換性の破壊 | ✅ オプショナルフィールドで対応 | 7.1.1 |
| 主なリスク: Evaluation レポート情報不足 | ✅ デフォルト値とフォールバック処理で対応 | 7.3.1 |
| 主なリスク: タイトル生成の不正確 | ✅ シンプルなアルゴリズムとフォールバックで対応 | 7.2.2, 7.2.3 |

---

## 13. まとめ

### 13.1 設計の概要

本設計書では、Issue #104「Evaluation Phase のフォローアップ Issue を改善」に対する詳細設計を行いました。主な設計内容は以下の通りです：

1. **型定義の拡張**: `RemainingTask` interface に6つの新規フィールド（すべてオプショナル）を追加し、`IssueContext` interface を新規定義
2. **IssueClient の拡張**: `createIssueFromEvaluation()` メソッドを拡張し、3つの新規 private メソッド（`generateFollowUpTitle`, `extractKeywords`, `formatTaskDetails`）を追加
3. **Evaluation Phase の修正**: `handlePassWithIssues()` メソッドを修正し、`IssueContext` オブジェクトを構築して `createIssueFromEvaluation()` に渡す
4. **テスト戦略**: ユニットテスト（ヘルパーメソッド）とインテグレーションテスト（全体フロー）を実施し、カバレッジ 90% 以上を目標

### 13.2 設計の特徴

- **後方互換性の維持**: すべての新規パラメータとフィールドをオプショナルとして定義し、既存の呼び出し元は無変更で動作
- **シンプルなアルゴリズム**: タイトル生成とキーワード抽出は正規表現ベースのシンプルなロジックを採用し、複雑な自然言語処理を避ける
- **フォールバック処理**: 情報が不足している場合でも適切なデフォルト値を使用し、Issue 作成を継続
- **保守性の高い設計**: ヘルパーメソッドへの分離、JSDoc コメントの徹底、単一責任の原則の遵守

### 13.3 次のフェーズへの引き継ぎ事項

**Phase 3（Test Scenario）で確認すべき事項**:
- ユニットテストのテストケース設計（境界値、異常系）
- インテグレーションテストのシナリオ設計（Evaluation Phase との統合）
- 後方互換性テストのシナリオ設計

**Phase 4（Implementation）で注意すべき事項**:
- `extractKeywords()` のキーワード抽出アルゴリズムの実装（括弧前まで、20文字制限）
- `formatTaskDetails()` のオプショナルフィールド存在チェック（条件分岐）
- `handlePassWithIssues()` のデフォルト値設定（Blocker Status, Deferred Reason）

---

**設計書作成日**: 2025-01-30
**想定実装期間**: Phase 4（Implementation）完了時まで（見積もり: 10~14時間）
**リスクレベル**: 中（主なリスク: Evaluation レポート情報不足、型拡張の影響範囲）
