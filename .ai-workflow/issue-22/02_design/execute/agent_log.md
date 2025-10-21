# Claude Agent 実行ログ

生成日時: 2025/10/21 1:47:08

---

## Turn 1: システム初期化

**セッションID**: `7afadee8-ca2a-4778-85f9-6024072867a1`
**モデル**: claude-sonnet-4-5-20250929
**権限モード**: bypassPermissions
**利用可能ツール**: Task, Bash, Glob, Grep, ExitPlanMode, Read, Edit, Write, NotebookEdit, WebFetch, TodoWrite, WebSearch, BashOutput, KillShell, Skill, SlashCommand

## Turn 2: AI応答

# 詳細設計書 - Issue #22

**Issue番号**: #22  
**タイトル**: [REFACTOR] CLI コマンド処理の分離 (main.ts リファクタリング)  
**作成日**: 2025-01-20  
**ステータス**: Design Phase

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Entry Point                         │
│                    (src/main.ts)                            │
│                    ~200 lines                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ - Commander definitions                              │  │
│  │ - Command routing                                    │  │
│  │ - Error handling (reportFatalError)                 │  │
│  │ - Execution summary (reportExecutionSummary)        │  │
│  │ - Phase validation (isValidPhaseName, PHASE_ORDER)  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Init Command    │ │Execute Command  │ │List Presets     │
│ Module          │ │ Module          │ │ Module          │
│ (commands/      │ │ (commands/      │ │ (commands/      │
│  init.ts)       │ │  execute.ts)    │ │  list-presets.  │
│                 │ │                 │ │  ts)            │
│ ~300 lines      │ │ ~500 lines      │ │ ~80 lines       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │   Shared Utilities & Types            │
        │                                       │
        │  ┌─────────────────────────────────┐ │
        │  │ Repository Utils                │ │
        │  │ (core/repository-utils.ts)      │ │
        │  │ - parseIssueUrl                 │ │
        │  │ - resolveLocalRepoPath          │ │
        │  │ - findWorkflowMetadata          │ │
        │  │ - getRepoRoot                   │ │
        │  └─────────────────────────────────┘ │
        │                                       │
        │  ┌─────────────────────────────────┐ │
        │  │ Command Types                   │ │
        │  │ (types/commands.ts)             │ │
        │  │ - PhaseContext                  │ │
        │  │ - ExecutionSummary              │ │
        │  │ - PhaseResultMap                │ │
        │  │ - IssueInfo                     │ │
        │  │ - BranchValidationResult        │ │
        │  └─────────────────────────────────┘ │
        └───────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌─────────────────┐                 ┌─────────────────┐
│ Existing Core   │                 │ Existing Phases │
│ Modules         │                 │ Modules         │
│ - MetadataManager│                │ - BasePhase     │
│ - GitManager    │                 │ - PlanningPhase │
│ - GitHubClient  │                 │ - ...           │
│ - CodexAgent    │                 │                 │
│ - ClaudeAgent   │                 │                 │
└─────────────────┘                 └─────────────────┘
```

### 1.2 コンポーネント間の関係

#### 依存関係フロー

```
main.ts
  ├── commands/init.ts
  │     ├── core/repository-utils.ts
  │     ├── types/commands.ts
  │     ├── core/metadata-manager.ts
  │     ├── core/git-manager.ts
  │     └── core/github-client.ts
  │
  ├── commands/execute.ts
  │     ├── core/repository-utils.ts
  │     ├── types/commands.ts
  │     ├── core/metadata-manager.ts
  │     ├── core/git-manager.ts
  │     ├── core/codex-agent-client.ts
  │     ├── core/claude-agent-client.ts
  │     ├── core/phase-dependencies.ts
  │     └── phases/*.ts
  │
  ├── commands/list-presets.ts
  │     └── core/phase-dependencies.ts
  │
  └── commands/review.ts (existing location)
        ├── core/repository-utils.ts
        ├── types/commands.ts
        └── core/metadata-manager.ts
```

**循環依存の回避戦略**:
- コマンドモジュール間は直接依存しない
- 共有ロジックは `core/repository-utils.ts` と `types/commands.ts` に集約
- すべてのコマンドモジュールは main.ts から一方向にimportされる

### 1.3 データフロー

#### init コマンド

```
User Input (--issue-url, --branch)
  ↓
main.ts (commander parsing)
  ↓
commands/init.ts::handleInitCommand()
  ↓
repository-utils.ts::parseIssueUrl()
  → IssueInfo { owner, repo, issueNumber }
  ↓
repository-utils.ts::resolveLocalRepoPath()
  → Local repository path
  ↓
commands/init.ts::validateBranchName()
  → BranchValidationResult
  ↓
commands/init.ts::resolveBranchName()
  → Resolved branch name
  ↓
GitManager::createBranch()
  ↓
MetadataManager::createMetadata()
  → .ai-workflow/issue-{num}/metadata.json
  ↓
GitHubClient::createDraftPR()
  ↓
Console output (success message)
```

#### execute コマンド

```
User Input (--issue, --phase, --preset, --agent)
  ↓
main.ts (commander parsing + preset resolution)
  ↓
commands/execute.ts::handleExecuteCommand()
  ↓
repository-utils.ts::findWorkflowMetadata()
  → { repoRoot, metadataPath }
  ↓
MetadataManager::loadMetadata()
  → WorkflowState
  ↓
commands/execute.ts::resolvePresetName()
  → Canonical phase names
  ↓
commands/execute.ts::canResumeWorkflow()
  → Resume decision
  ↓
commands/execute.ts::executePhasesSequential()
  ↓
  ┌─ Loop for each phase ─┐
  │                        │
  │ createPhaseInstance()  │
  │   ↓                    │
  │ BasePhase.run()        │
  │   ├─ execute()         │
  │   ├─ review()          │
  │   └─ revise()          │
  │   ↓                    │
  │ MetadataManager.update()│
  └────────────────────────┘
  ↓
ExecutionSummary
  ↓
main.ts::reportExecutionSummary()
  ↓
Console output
```

---

## 2. 実装戦略判断

### 実装戦略: REFACTOR

#### 判断根拠

1. **既存コード改善が中心**
   - `main.ts` (1309行) から責務を分離し、200行以下に削減することが主目的
   - 新規機能の追加はなく、既存の4つのコマンド（init/execute/review/list-presets）を分離

2. **機能追加なし**
   - CLI インターフェース（コマンド、オプション）は変更しない
   - 既存の動作を完全に維持（後方互換性100%）
   - Issue要件でも「破壊的変更なし」が明示されている

3. **構造改善**
   - SOLID原則（単一責任原則）の適用が主目的
   - コマンドごとの責務を明確化し、テスト容易性を向上
   - 既存のテスト（ユニットテスト18件 + 統合テスト18件）を維持

4. **拡張性向上**
   - 将来的な新規コマンド追加を容易にする
   - モジュール間の疎結合を実現

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

#### 判断根拠

1. **ユニットテスト**
   - モジュール分割後の各コマンドハンドラは独立してテスト可能
   - 新規作成する各コマンドモジュールのロジックをユニットテストで検証
   - 例:
     - `commands/init.ts::validateBranchName()` のバリデーションロジック
     - `commands/execute.ts::resolvePresetName()` のプリセット解決ロジック
     - `commands/execute.ts::canResumeWorkflow()` のレジューム判定ロジック

2. **統合テスト**
   - 既存の統合テスト（18件）を再利用し、CLI全体の動作を検証
   - エンドツーエンドの動作確認（CLI → コマンドモジュール → Core → Git/GitHub）
   - 例:
     - `tests/integration/workflow-init-cleanup.test.ts` - ワークフロー初期化とクリーンアップ
     - `tests/integration/preset-execution.test.ts` - プリセット実行の統合テスト
     - `tests/integration/multi-repo-workflow.test.ts` - マルチリポジトリワークフロー

3. **BDD不要の理由**
   - エンドユーザー向けの新機能追加ではなく、内部リファクタリングのため
   - ユーザーストーリーベースのテストは既存の統合テストでカバー済み
   - 既存のCLIインターフェースを変更しないため、新規のBDDシナリオは不要

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

#### 判断根拠

1. **EXTEND_TEST（既存テストの拡張）**
   - 既存のユニットテスト（`tests/unit/main-preset-resolution.test.ts` 等）のimport文を修正
   - 既存テスト: 220行（main.tsのプライベート関数をテスト用に再現）
   - 対応方針: モジュール分離後は正式なexportされた関数をテストするよう変更
   - 例:
     ```typescript
     // Before (main-preset-resolution.test.ts)
     // main.tsのプライベート関数を再現してテスト
     
     // After
     import { resolvePresetName } from '../../src/commands/execute.js';
     // 正式なexport関数をテスト
     ```

2. **CREATE_TEST（新規テスト作成）**
   - 新規コマンドモジュールのユニットテストを作成
   - 作成するテストファイル:
     - `tests/unit/commands/init.test.ts` - 初期化コマンドのロジックテスト
     - `tests/unit/commands/execute.test.ts` - 実行コマンドのロジックテスト（エージェント選択、プリセット解決等）
     - `tests/unit/commands/list-presets.test.ts` - プリセット一覧表示のロジックテスト

3. **BOTH適用の理由**
   - 既存テストは互換性維持のために拡張が必要（import修正、テストロジック更新）
   - 新規モジュールは独立したテストカバレッジが必要（モジュール単位のテスト）
   - 両方を実施することで、リグレッション防止と新規コード品質保証の両立を実現

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### 変更が必要な既存ファイル

1. **src/main.ts** (1309行 → 200行以下に削減)
   - コマンドルーターとしての役割のみ残す
   - 削除する関数:
     - `handleInitCommand` (229行: L229-L450)
     - `handleExecuteCommand` (346行: L452-L798)
     - `handleReviewCommand` (18行: L800-L817)
     - `listPresets` (26行: L1201-L1225)
   - 移動する関数:
     - `parseIssueUrl` → `core/repository-utils.ts`
     - `resolveLocalRepoPath` → `core/repository-utils.ts`
     - `findWorkflowMetadata` → `core/repository-utils.ts`
     - `validateBranchName` → `commands/init.ts`
     - `resolveBranchName` → `commands/init.ts`
     - `resolvePresetName` → `commands/execute.ts`
     - `getPresetPhases` → `commands/execute.ts`
     - `canResumeWorkflow` → `commands/execute.ts`
     - `executePhasesSequential` → `commands/execute.ts`
     - `createPhaseInstance` → `commands/execute.ts`
   - 残す関数:
     - `runCli()` - CLIエントリーポイント
     - `reportFatalError()` - エラーハンドリング
     - `reportExecutionSummary()` - 実行サマリー表示
     - `isValidPhaseName()` - フェーズ名バリデーション
     - `PHASE_ORDER` 定数

2. **tests/unit/main-preset-resolution.test.ts** (220行)
   - import文の修正: `resolvePresetName` を `src/commands/execute.ts` からimport
   - テストロジックの修正: 再現コードを削除し、正式なexportされた関数を使用

3. **tests/integration/workflow-init-cleanup.test.ts**
   - import文の修正: 必要に応じて `src/commands/init.ts` からimport
   - テストケース自体は変更不要（動作の互換性維持）

4. **tests/unit/repository-resolution.test.ts**
   - import文の修正: `parseIssueUrl`, `resolveLocalRepoPath`, `findWorkflowMetadata` を `core/repository-utils.ts` からimport

5. **tests/unit/branch-validation.test.ts**
   - import文の修正: `validateBranchName`, `resolveBranchName` を `commands/init.ts` からimport

### 5.2 依存関係の変更

#### 新規依存の追加

- **なし** - 既存の依存関係（commander, fs-extra, simple-git等）のみ使用

#### 既存依存の変更

- **なし** - 依存ライブラリのバージョン変更は不要

### 5.3 マイグレーション要否

#### データベーススキーマ変更

- **なし**

#### 設定ファイル変更

- **なし** - package.json, tsconfig.jsonの変更不要
- **ビルドスクリプト**: 既存のビルドスクリプト（`npm run build`）で自動的に新規ファイルをコンパイル

#### 環境変数変更

- **なし** - 既存の環境変数（GITHUB_TOKEN, CODEX_API_KEY等）をそのまま使用

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

#### コマンドモジュール

1. **src/commands/init.ts** (約250~300行)
   - `handleInitCommand()` 関数
   - `validateBranchName()` 関数
   - `resolveBranchName()` 関数

2. **src/commands/execute.ts** (約450~500行)
   - `handleExecuteCommand()` 関数
   - `executePhasesSequential()` 関数
   - `executePhasesFrom()` 関数
   - `createPhaseInstance()` 関数
   - `resolvePresetName()` 関数
   - `getPresetPhases()` 関数
   - `canResumeWorkflow()` 関数
   - `loadExternalDocuments()` 関数
   - `resetMetadata()` 関数

3. **src/commands/list-presets.ts** (約50~80行)
   - `listPresets()` 関数

4. **src/commands/review.ts** (約50行)
   - `handleReviewCommand()` 関数（現在はmain.tsに存在）

#### 共有モジュール

5. **src/core/repository-utils.ts** (約200行)
   - `parseIssueUrl()` 関数（main.tsから移動）
   - `resolveLocalRepoPath()` 関数（main.tsから移動）
   - `findWorkflowMetadata()` 関数（main.tsから移動）
   - `getRepoRoot()` 関数（新規export）

6. **src/types/commands.ts** (約100行)
   - `PhaseContext` 型定義
   - `ExecutionSummary` 型定義
   - `PhaseResultMap` 型定義
   - `IssueInfo` 型定義（main.tsから移動）
   - `BranchValidationResult` 型定義

#### テストファイル

7. **tests/unit/commands/init.test.ts** (約150~200行)
   - 初期化コマンドのユニットテスト
   - ブランチ名バリデーション、Issue URL解析、リポジトリ解決のテスト

8. **tests/unit/commands/execute.test.ts** (約200~250行)
   - 実行コマンドのユニットテスト
   - エージェントモード選択、プリセット解決、フェーズ実行順序のテスト

9. **tests/unit/commands/list-presets.test.ts** (約50~80行)
   - プリセット一覧表示のユニットテスト

### 6.2 修正が必要な既存ファイル

1. **src/main.ts** (1309行 → 200行以下)
   - コマンドハンドラを削除し、新規モジュールからimport
   - コマンドルーターとしての役割のみ残す

2. **tests/unit/main-preset-resolution.test.ts** (220行)
   - import文の修正

3. **tests/unit/branch-validation.test.ts**
   - import文の修正

4. **tests/unit/repository-resolution.test.ts**
   - import文の修正

5. **tests/integration/workflow-init-cleanup.test.ts**
   - import文の修正（必要に応じて）

### 6.3 削除が必要なファイル

- **なし** - ファイルの削除は不要

---

## 7. 詳細設計

### 7.1 src/commands/init.ts

#### 関数設計

```typescript
/**
 * Issue初期化コマンドハンドラ
 * @param issueUrl - GitHub Issue URL
 * @param customBranch - カスタムブランチ名（任意）
 */
export async function handleInitCommand(
  issueUrl: string,
  customBranch?: string
): Promise<void> {
  // 1. Issue URL解析
  const issueInfo = parseIssueUrl(issueUrl);
  
  // 2. ローカルリポジトリパス解決
  const repoPath = resolveLocalRepoPath(issueInfo.repo);
  
  // 3. ブランチ名解決
  const branchName = resolveBranchName(issueInfo.issueNumber, customBranch);
  
  // 4. ブランチ名バリデーション
  const validation = validateBranchName(branchName);
  if (!validation.valid) {
    throw new Error(`Invalid branch name: ${validation.reason}`);
  }
  
  // 5. Git操作（ブランチ作成・チェックアウト）
  // 6. メタデータ作成
  // 7. Draft PR作成
}

/**
 * ブランチ名をバリデーション
 * @param branchName - バリデーション対象のブランチ名
 * @returns バリデーション結果
 */
export function validateBranchName(branchName: string): BranchValidationResult {
  // Git命名規則チェック
  // - 空白を含まない
  // - 連続ドット(..)を含まない
  // - 不正文字を含まない
  // - /で始まらない・終わらない
  // - .で終わらない
}

/**
 * ブランチ名を解決（カスタムまたはデフォルト）
 * @param issueNumber - Issue番号
 * @param customBranch - カスタムブランチ名（任意）
 * @returns 解決されたブランチ名
 */
export function resolveBranchName(
  issueNumber: string,
  customBranch?: string
): string {
  return customBranch || `ai-workflow/issue-${issueNumber}`;
}
```

#### データ構造

```typescript
// src/types/commands.ts

export interface BranchValidationResult {
  valid: boolean;
  reason?: string;
}
```

### 7.2 src/commands/execute.ts

#### 関数設計

```typescript
/**
 * フェーズ実行コマンドハンドラ
 * @param options - CLIオプション
 */
export async function handleExecuteCommand(options: any): Promise<void> {
  // 1. メタデータ探索
  const { repoRoot, metadataPath } = await findWorkflowMetadata(options.issue);
  
  // 2. メタデータ読み込み
  const metadata = await loadMetadata(metadataPath);
  
  // 3. エージェントモード判定
  const agentMode = options.agent || 'auto';
  
  // 4. プリセット解決
  const phases = options.preset 
    ? getPresetPhases(options.preset)
    : [options.phase];
  
  // 5. レジューム判定
  if (canResumeWorkflow(metadata)) {
    // Resume logic
  }
  
  // 6. フェーズ順次実行
  const summary = await executePhasesSequential(phases, metadata, options);
  
  // 7. 実行サマリー出力
  return summary;
}

/**
 * プリセット名を正規化（後方互換性対応）
 * @param presetName - プリセット名
 * @returns 正規化されたプリセット名
 */
export function resolvePresetName(presetName: string): string {
  const deprecatedPresets: Record<string, string> = {
    'requirements-only': 'review-requirements',
    'design-phase': 'review-design',
    'implementation-phase': 'implementation',
    'full-workflow': 'all'
  };
  
  return deprecatedPresets[presetName] || presetName;
}

/**
 * プリセットのフェーズリストを取得
 * @param presetName - プリセット名
 * @returns フェーズ名の配列
 */
export function getPresetPhases(presetName: string): string[] {
  // phase-dependencies.tsから取得
}

/**
 * ワークフロー再開可否を判定
 * @param metadata - メタデータ
 * @returns 再開可能な場合true
 */
export function canResumeWorkflow(metadata: WorkflowState): boolean {
  // 未完了フェーズの存在を確認
}

/**
 * フェーズを順次実行
 * @param phases - フェーズ名の配列
 * @param metadata - メタデータ
 * @param options - CLIオプション
 * @returns 実行サマリー
 */
export async function executePhasesSequential(
  phases: string[],
  metadata: WorkflowState,
  options: any
): Promise<ExecutionSummary> {
  const results: PhaseResultMap = {};
  
  for (const phaseName of phases) {
    const phaseInstance = createPhaseInstance(phaseName, metadata, options);
    const result = await phaseInstance.run(options);
    results[phaseName] = result;
  }
  
  return {
    totalPhases: phases.length,
    completedPhases: Object.values(results).filter(r => r.status === 'completed').length,
    failedPhases: Object.values(results).filter(r => r.status === 'failed').length,
    results
  };
}

/**
 * フェーズインスタンスを作成
 * @param phaseName - フェーズ名
 * @param metadata - メタデータ
 * @param options - CLIオプション
 * @returns フェーズインスタンス
 */
export function createPhaseInstance(
  phaseName: string,
  metadata: WorkflowState,
  options: any
): BasePhase {
  // 各フェーズクラスのインスタンスを生成
}
```

#### データ構造

```typescript
// src/types/commands.ts

export interface PhaseContext {
  repoRoot: string;
  metadataPath: string;
  issueNumber: string;
  agentMode: 'auto' | 'codex' | 'claude';
}

export interface ExecutionSummary {
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  results: PhaseResultMap;
}

export interface PhaseResultMap {
  [phaseName: string]: {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    duration?: number;
    error?: string;
  };
}
```

### 7.3 src/commands/list-presets.ts

#### 関数設計

```typescript
/**
 * プリセット一覧表示コマンドハンドラ
 */
export function listPresets(): void {
  console.log('\n=== Available Presets ===\n');
  
  const presets = getAllPresets();
  for (const [name, phases] of Object.entries(presets)) {
    console.log(`${name}:`);
    console.log(`  Phases: ${phases.join(' → ')}`);
  }
  
  console.log('\n=== Deprecated Presets (use new names) ===\n');
  const deprecated = getDeprecatedPresets();
  for (const [oldName, newName] of Object.entries(deprecated)) {
    console.log(`${oldName} → ${newName} (use new name instead)`);
  }
}
```

### 7.4 src/commands/review.ts

#### 関数設計

```typescript
/**
 * フェーズレビューコマンドハンドラ
 * @param options - CLIオプション
 */
export async function handleReviewCommand(options: any): Promise<void> {
  // 1. メタデータ探索
  const { metadataPath } = await findWorkflowMetadata(options.issue);
  
  // 2. メタデータ読み込み
  const metadata = await loadMetadata(metadataPath);
  
  // 3. フェーズステータス取得
  const phaseStatus = metadata.phases[options.phase];
  
  // 4. ステータス出力
  console.log(`[OK] Phase ${options.phase} status: ${phaseStatus.status}`);
}
```

### 7.5 src/core/repository-utils.ts

#### 関数設計

```typescript
/**
 * GitHub Issue URLを解析
 * @param issueUrl - GitHub Issue URL
 * @returns Issue情報
 */
export function parseIssueUrl(issueUrl: string): IssueInfo {
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid GitHub Issue URL: ${issueUrl}`);
  }
  
  return {
    owner: match[1],
    repo: match[2],
    issueNumber: match[3]
  };
}

/**
 * ローカルリポジトリパスを解決
 * @param repoName - リポジトリ名
 * @returns ローカルリポジトリパス
 */
export function resolveLocalRepoPath(repoName: string): string {
  // 1. $REPOS_ROOT 検索
  // 2. ~/TIELEC/development 検索
  // 3. ~/projects 検索
  // 4. ../ 検索
}

/**
 * ワークフローメタデータを探索
 * @param issueNumber - Issue番号
 * @returns リポジトリルートとメタデータパス
 */
export async function findWorkflowMetadata(
  issueNumber: string
): Promise<{ repoRoot: string; metadataPath: string }> {
  // マルチリポジトリ環境でメタデータを探索
}

/**
 * リポジトリルートを取得
 * @returns リポジトリルート
 */
export async function getRepoRoot(): Promise<string> {
  // Git repository root を取得
}
```

#### データ構造

```typescript
// src/types/commands.ts

export interface IssueInfo {
  owner: string;
  repo: string;
  issueNumber: string;
}
```

### 7.6 src/types/commands.ts

#### 型定義

```typescript
export interface IssueInfo {
  owner: string;
  repo: string;
  issueNumber: string;
}

export interface BranchValidationResult {
  valid: boolean;
  reason?: string;
}

export interface PhaseContext {
  repoRoot: string;
  metadataPath: string;
  issueNumber: string;
  agentMode: 'auto' | 'codex' | 'claude';
}

export interface ExecutionSummary {
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  results: PhaseResultMap;
}

export interface PhaseResultMap {
  [phaseName: string]: {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    duration?: number;
    error?: string;
  };
}
```

### 7.7 src/main.ts（リファクタリング後）

#### 構成

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { handleInitCommand } from './commands/init.js';
import { handleExecuteCommand } from './commands/execute.js';
import { handleReviewCommand } from './commands/review.js';
import { listPresets } from './commands/list-presets.js';

// Constants
export const PHASE_ORDER = [
  'planning',
  'requirements',
  // ...
];

// Main CLI function
export async function runCli(): Promise<void> {
  const program = new Command();
  
  // init command
  program
    .command('init')
    .option('--issue-url <url>', 'GitHub Issue URL')
    .option('--branch <name>', 'Custom branch name')
    .action(async (options) => {
      await handleInitCommand(options.issueUrl, options.branch);
    });
  
  // execute command
  program
    .command('execute')
    .option('--issue <number>', 'Issue number')
    .option('--phase <name>', 'Phase name')
    .option('--preset <name>', 'Preset name')
    .option('--agent <mode>', 'Agent mode (auto/codex/claude)')
    // ...
    .action(async (options) => {
      await handleExecuteCommand(options);
    });
  
  // review command
  program
    .command('review')
    .option('--phase <name>', 'Phase name')
    .option('--issue <number>', 'Issue number')
    .action(async (options) => {
      await handleReviewCommand(options);
    });
  
  // list-presets command
  program
    .command('list-presets')
    .action(() => {
      listPresets();
    });
  
  await program.parseAsync(process.argv);
}

// Utility functions (remain in main.ts)
export function reportFatalError(error: Error): void {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}

export function reportExecutionSummary(summary: ExecutionSummary): void {
  console.log('\n=== Execution Summary ===');
  console.log(`Total Phases: ${summary.totalPhases}`);
  console.log(`Completed: ${summary.completedPhases}`);
  console.log(`Failed: ${summary.failedPhases}`);
}

export function isValidPhaseName(phaseName: string): boolean {
  return PHASE_ORDER.includes(phaseName) || phaseName === 'all';
}
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

- **GitHub認証**: 既存の `GITHUB_TOKEN` 環境変数を使用（変更なし）
- **エージェント認証**: `CODEX_API_KEY`, `CLAUDE_CODE_CREDENTIALS_PATH` を使用（変更なし）
- **トークンの保護**: リファクタリング後もトークンは環境変数経由でのみ取得し、ログに出力しない

### 8.2 データ保護

- **機密情報の漏洩防止**: エージェント実行時のログに認証情報が含まれないことを確認
- **ファイルパーミッション**: メタデータファイル（`.ai-workflow/issue-*/metadata.json`）は既存の権限を維持

### 8.3 セキュリティリスクと対策

#### パストラバーサル攻撃

**リスク**: `resolveLocalRepoPath()` や `findWorkflowMetadata()` で不正なパスが指定される可能性

**対策**:
- パス解決時に正規化（`path.resolve()`）を使用
- シンボリックリンクのチェック（`fs.lstatSync()`）
- 許可されたディレクトリ（`$REPOS_ROOT`, `~/TIELEC/development`, `~/projects`, `../`）のみ許可

#### インジェクション攻撃

**リスク**: ブランチ名やIssue URLに不正な文字が含まれる可能性

**対策**:
- `validateBranchName()` で厳格なバリデーション（Git命名規則チェック）
- `parseIssueUrl()` で正規表現による厳格な検証
- コマンドライン引数のサニタイゼーション（commander.jsの標準機能を使用）

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

#### ビルド時間

- **現状**: TypeScriptコンパイル時間は約10秒
- **リファクタリング後**: ファイル数増加（+6ファイル）により、コンパイル時間が約1~2秒増加する可能性
- **対策**: 影響は軽微であり、許容範囲内

#### CLI起動時間

- **現状**: `node dist/index.js --help` の実行時間は約0.5秒
- **リファクタリング後**: モジュール分割により、import数が増加するが、Node.jsの動的ロードにより影響は軽微
- **測定**: リファクタリング前後で ±10% 以内を維持

### 9.2 スケーラビリティ

#### 新規コマンド追加

- **リファクタリング後**: 新規コマンドは `src/commands/{command-name}.ts` として独立したモジュールで作成可能
- **main.tsへの影響**: commander定義の追加のみ（10~20行程度）

#### プリセット追加

- **リファクタリング後**: `src/core/phase-dependencies.ts` のみ修正（コマンドモジュールへの影響なし）

### 9.3 保守性

#### コードの可読性

- **リファクタリング後**: 各コマンドモジュールが250~500行程度に分割され、責務が明確化
- **main.ts**: 200行以下に削減され、エントリーポイントの見通しが改善

#### テスト容易性

- **リファクタリング後**: 各コマンドモジュールが独立してテスト可能（export された関数を直接テスト）
- **既存テスト**: import修正のみで既存テストが動作（リグレッション防止）

---

## 10. 実装の順序

### 推奨実装順序

#### フェーズ1: 共有モジュール作成（依存関係の基盤）

1. **src/types/commands.ts** 作成
   - 型定義を最優先で作成（他モジュールから参照されるため）
   - 所要時間: 0.5h

2. **src/core/repository-utils.ts** 作成
   - `parseIssueUrl`, `resolveLocalRepoPath`, `findWorkflowMetadata` を移動
   - 所要時間: 1h

#### フェーズ2: コマンドモジュール作成（並行可能）

3. **src/commands/init.ts** 作成
   - `handleInitCommand`, `validateBranchName`, `resolveBranchName` を実装
   - 所要時間: 1h

4. **src/commands/execute.ts** 作成
   - `handleExecuteCommand`, `executePhasesSequential`, `resolvePresetName` 等を実装
   - 所要時間: 2h

5. **src/commands/review.ts** 作成
   - `handleReviewCommand` を実装
   - 所要時間: 0.5h

6. **src/commands/list-presets.ts** 作成
   - `listPresets` を実装
   - 所要時間: 0.5h

#### フェーズ3: main.tsリファクタリング

7. **src/main.ts** リファクタリング
   - コマンドハンドラを削除し、新規モジュールからimport
   - commander定義を更新
   - 所要時間: 1h

#### フェーズ4: テストコード作成・修正

8. **既存テストのimport修正**
   - `tests/unit/main-preset-resolution.test.ts`
   - `tests/unit/branch-validation.test.ts`
   - `tests/unit/repository-resolution.test.ts`
   - 所要時間: 0.5h

9. **新規ユニットテスト作成**
   - `tests/unit/commands/init.test.ts`
   - `tests/unit/commands/execute.test.ts`
   - `tests/unit/commands/list-presets.test.ts`
   - 所要時間: 1.5h

#### フェーズ5: テスト実行・検証

10. **ユニットテスト全件実行**
    - `npm run test:unit` 実行
    - 所要時間: 0.5h

11. **統合テスト全件実行**
    - `npm run test:integration` 実行
    - 所要時間: 0.5h

#### 依存関係

```
Phase 1 (types/commands.ts, repository-utils.ts)
  ↓
Phase 2 (init.ts, execute.ts, review.ts, list-presets.ts) [並行可能]
  ↓
Phase 3 (main.ts リファクタリング)
  ↓
Phase 4 (テストコード作成・修正)
  ↓
Phase 5 (テスト実行・検証)
```

---

## 11. 品質ゲート確認

### 必須要件チェックリスト

- ✅ **実装戦略の判断根拠が明記されている**
  - セクション2で「REFACTOR」戦略を選択し、4つの判断根拠を明記

- ✅ **テスト戦略の判断根拠が明記されている**
  - セクション3で「UNIT_INTEGRATION」戦略を選択し、3つの判断根拠を明記

- ✅ **テストコード戦略の判断根拠が明記されている**
  - セクション4で「BOTH_TEST」戦略を選択し、3つの判断根拠を明記

- ✅ **既存コードへの影響範囲が分析されている**
  - セクション5で既存ファイル5件の修正内容を詳細に分析

- ✅ **変更が必要なファイルがリストアップされている**
  - セクション6で新規作成ファイル9件、修正ファイル5件をリストアップ

- ✅ **設計が実装可能である**
  - セクション7で各モジュールの関数設計、データ構造、インターフェースを詳細に定義
  - セクション10で実装順序と依存関係を明示

---

## 12. 補足情報

### 12.1 既存プロジェクト構造との整合性

本設計は、既存のプロジェクト構造（CLAUDE.md, ARCHITECTURE.md, README.md）と整合性を保ちます：

- **既存のディレクトリ構造**: `src/core/`, `src/phases/`, `src/types/` を活用
- **新規ディレクトリ**: `src/commands/` を追加（CLIコマンドモジュール用）
- **既存のコーディング規約**: TypeScript strict mode、ESLint準拠、ES modules使用

### 12.2 トレーサビリティ

| 要件ID | 要件（requirements.md） | 設計セクション |
|--------|------------------------|---------------|
| FR-1.1 | initコマンドモジュールの作成 | 7.1 |
| FR-1.2 | executeコマンドモジュールの作成 | 7.2 |
| FR-1.3 | reviewコマンドモジュールの作成 | 7.4 |
| FR-1.4 | list-presetsコマンドモジュールの作成 | 7.3 |
| FR-2.1 | リポジトリユーティリティモジュールの作成 | 7.5 |
| FR-2.2 | コマンド型定義モジュールの作成 | 7.6 |
| FR-3.1 | main.ts をコマンドルーターに再構成 | 7.7 |
| FR-4.1 | CLI インターフェースの互換性 | 7.7 |
| FR-4.2 | エージェントモードの互換性 | 7.2 |

---

**設計書バージョン**: 1.0  
**作成日**: 2025-01-20  
**作成者**: AI Workflow Agent  
**レビュー状態**: Pending Review

## Turn 3: 実行完了

**ステータス**: success
**所要時間**: 174925ms
**ターン数**: 6

# 詳細設計書 - Issue #22

**Issue番号**: #22  
**タイトル**: [REFACTOR] CLI コマンド処理の分離 (main.ts リファクタリング)  
**作成日**: 2025-01-20  
**ステータス**: Design Phase

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Entry Point                         │
│                    (src/main.ts)                            │
│                    ~200 lines                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ - Commander definitions                              │  │
│  │ - Command routing                                    │  │
│  │ - Error handling (reportFatalError)                 │  │
│  │ - Execution summary (reportExecutionSummary)        │  │
│  │ - Phase validation (isValidPhaseName, PHASE_ORDER)  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Init Command    │ │Execute Command  │ │List Presets     │
│ Module          │ │ Module          │ │ Module          │
│ (commands/      │ │ (commands/      │ │ (commands/      │
│  init.ts)       │ │  execute.ts)    │ │  list-presets.  │
│                 │ │                 │ │  ts)            │
│ ~300 lines      │ │ ~500 lines      │ │ ~80 lines       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │   Shared Utilities & Types            │
        │                                       │
        │  ┌─────────────────────────────────┐ │
        │  │ Repository Utils                │ │
        │  │ (core/repository-utils.ts)      │ │
        │  │ - parseIssueUrl                 │ │
        │  │ - resolveLocalRepoPath          │ │
        │  │ - findWorkflowMetadata          │ │
        │  │ - getRepoRoot                   │ │
        │  └─────────────────────────────────┘ │
        │                                       │
        │  ┌─────────────────────────────────┐ │
        │  │ Command Types                   │ │
        │  │ (types/commands.ts)             │ │
        │  │ - PhaseContext                  │ │
        │  │ - ExecutionSummary              │ │
        │  │ - PhaseResultMap                │ │
        │  │ - IssueInfo                     │ │
        │  │ - BranchValidationResult        │ │
        │  └─────────────────────────────────┘ │
        └───────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌─────────────────┐                 ┌─────────────────┐
│ Existing Core   │                 │ Existing Phases │
│ Modules         │                 │ Modules         │
│ - MetadataManager│                │ - BasePhase     │
│ - GitManager    │                 │ - PlanningPhase │
│ - GitHubClient  │                 │ - ...           │
│ - CodexAgent    │                 │                 │
│ - ClaudeAgent   │                 │                 │
└─────────────────┘                 └─────────────────┘
```

### 1.2 コンポーネント間の関係

#### 依存関係フロー

```
main.ts
  ├── commands/init.ts
  │     ├── core/repository-utils.ts
  │     ├── types/commands.ts
  │     ├── core/metadata-manager.ts
  │     ├── core/git-manager.ts
  │     └── core/github-client.ts
  │
  ├── commands/execute.ts
  │     ├── core/repository-utils.ts
  │     ├── types/commands.ts
  │     ├── core/metadata-manager.ts
  │     ├── core/git-manager.ts
  │     ├── core/codex-agent-client.ts
  │     ├── core/claude-agent-client.ts
  │     ├── core/phase-dependencies.ts
  │     └── phases/*.ts
  │
  ├── commands/list-presets.ts
  │     └── core/phase-dependencies.ts
  │
  └── commands/review.ts (existing location)
        ├── core/repository-utils.ts
        ├── types/commands.ts
        └── core/metadata-manager.ts
```

**循環依存の回避戦略**:
- コマンドモジュール間は直接依存しない
- 共有ロジックは `core/repository-utils.ts` と `types/commands.ts` に集約
- すべてのコマンドモジュールは main.ts から一方向にimportされる

### 1.3 データフロー

#### init コマンド

```
User Input (--issue-url, --branch)
  ↓
main.ts (commander parsing)
  ↓
commands/init.ts::handleInitCommand()
  ↓
repository-utils.ts::parseIssueUrl()
  → IssueInfo { owner, repo, issueNumber }
  ↓
repository-utils.ts::resolveLocalRepoPath()
  → Local repository path
  ↓
commands/init.ts::validateBranchName()
  → BranchValidationResult
  ↓
commands/init.ts::resolveBranchName()
  → Resolved branch name
  ↓
GitManager::createBranch()
  ↓
MetadataManager::createMetadata()
  → .ai-workflow/issue-{num}/metadata.json
  ↓
GitHubClient::createDraftPR()
  ↓
Console output (success message)
```

#### execute コマンド

```
User Input (--issue, --phase, --preset, --agent)
  ↓
main.ts (commander parsing + preset resolution)
  ↓
commands/execute.ts::handleExecuteCommand()
  ↓
repository-utils.ts::findWorkflowMetadata()
  → { repoRoot, metadataPath }
  ↓
MetadataManager::loadMetadata()
  → WorkflowState
  ↓
commands/execute.ts::resolvePresetName()
  → Canonical phase names
  ↓
commands/execute.ts::canResumeWorkflow()
  → Resume decision
  ↓
commands/execute.ts::executePhasesSequential()
  ↓
  ┌─ Loop for each phase ─┐
  │                        │
  │ createPhaseInstance()  │
  │   ↓                    │
  │ BasePhase.run()        │
  │   ├─ execute()         │
  │   ├─ review()          │
  │   └─ revise()          │
  │   ↓                    │
  │ MetadataManager.update()│
  └────────────────────────┘
  ↓
ExecutionSummary
  ↓
main.ts::reportExecutionSummary()
  ↓
Console output
```

---

## 2. 実装戦略判断

### 実装戦略: REFACTOR

#### 判断根拠

1. **既存コード改善が中心**
   - `main.ts` (1309行) から責務を分離し、200行以下に削減することが主目的
   - 新規機能の追加はなく、既存の4つのコマンド（init/execute/review/list-presets）を分離

2. **機能追加なし**
   - CLI インターフェース（コマンド、オプション）は変更しない
   - 既存の動作を完全に維持（後方互換性100%）
   - Issue要件でも「破壊的変更なし」が明示されている

3. **構造改善**
   - SOLID原則（単一責任原則）の適用が主目的
   - コマンドごとの責務を明確化し、テスト容易性を向上
   - 既存のテスト（ユニットテスト18件 + 統合テスト18件）を維持

4. **拡張性向上**
   - 将来的な新規コマンド追加を容易にする
   - モジュール間の疎結合を実現

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

#### 判断根拠

1. **ユニットテスト**
   - モジュール分割後の各コマンドハンドラは独立してテスト可能
   - 新規作成する各コマンドモジュールのロジックをユニットテストで検証
   - 例:
     - `commands/init.ts::validateBranchName()` のバリデーションロジック
     - `commands/execute.ts::resolvePresetName()` のプリセット解決ロジック
     - `commands/execute.ts::canResumeWorkflow()` のレジューム判定ロジック

2. **統合テスト**
   - 既存の統合テスト（18件）を再利用し、CLI全体の動作を検証
   - エンドツーエンドの動作確認（CLI → コマンドモジュール → Core → Git/GitHub）
   - 例:
     - `tests/integration/workflow-init-cleanup.test.ts` - ワークフロー初期化とクリーンアップ
     - `tests/integration/preset-execution.test.ts` - プリセット実行の統合テスト
     - `tests/integration/multi-repo-workflow.test.ts` - マルチリポジトリワークフロー

3. **BDD不要の理由**
   - エンドユーザー向けの新機能追加ではなく、内部リファクタリングのため
   - ユーザーストーリーベースのテストは既存の統合テストでカバー済み
   - 既存のCLIインターフェースを変更しないため、新規のBDDシナリオは不要

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

#### 判断根拠

1. **EXTEND_TEST（既存テストの拡張）**
   - 既存のユニットテスト（`tests/unit/main-preset-resolution.test.ts` 等）のimport文を修正
   - 既存テスト: 220行（main.tsのプライベート関数をテスト用に再現）
   - 対応方針: モジュール分離後は正式なexportされた関数をテストするよう変更
   - 例:
     ```typescript
     // Before (main-preset-resolution.test.ts)
     // main.tsのプライベート関数を再現してテスト
     
     // After
     import { resolvePresetName } from '../../src/commands/execute.js';
     // 正式なexport関数をテスト
     ```

2. **CREATE_TEST（新規テスト作成）**
   - 新規コマンドモジュールのユニットテストを作成
   - 作成するテストファイル:
     - `tests/unit/commands/init.test.ts` - 初期化コマンドのロジックテスト
     - `tests/unit/commands/execute.test.ts` - 実行コマンドのロジックテスト（エージェント選択、プリセット解決等）
     - `tests/unit/commands/list-presets.test.ts` - プリセット一覧表示のロジックテスト

3. **BOTH適用の理由**
   - 既存テストは互換性維持のために拡張が必要（import修正、テストロジック更新）
   - 新規モジュールは独立したテストカバレッジが必要（モジュール単位のテスト）
   - 両方を実施することで、リグレッション防止と新規コード品質保証の両立を実現

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### 変更が必要な既存ファイル

1. **src/main.ts** (1309行 → 200行以下に削減)
   - コマンドルーターとしての役割のみ残す
   - 削除する関数:
     - `handleInitCommand` (229行: L229-L450)
     - `handleExecuteCommand` (346行: L452-L798)
     - `handleReviewCommand` (18行: L800-L817)
     - `listPresets` (26行: L1201-L1225)
   - 移動する関数:
     - `parseIssueUrl` → `core/repository-utils.ts`
     - `resolveLocalRepoPath` → `core/repository-utils.ts`
     - `findWorkflowMetadata` → `core/repository-utils.ts`
     - `validateBranchName` → `commands/init.ts`
     - `resolveBranchName` → `commands/init.ts`
     - `resolvePresetName` → `commands/execute.ts`
     - `getPresetPhases` → `commands/execute.ts`
     - `canResumeWorkflow` → `commands/execute.ts`
     - `executePhasesSequential` → `commands/execute.ts`
     - `createPhaseInstance` → `commands/execute.ts`
   - 残す関数:
     - `runCli()` - CLIエントリーポイント
     - `reportFatalError()` - エラーハンドリング
     - `reportExecutionSummary()` - 実行サマリー表示
     - `isValidPhaseName()` - フェーズ名バリデーション
     - `PHASE_ORDER` 定数

2. **tests/unit/main-preset-resolution.test.ts** (220行)
   - import文の修正: `resolvePresetName` を `src/commands/execute.ts` からimport
   - テストロジックの修正: 再現コードを削除し、正式なexportされた関数を使用

3. **tests/integration/workflow-init-cleanup.test.ts**
   - import文の修正: 必要に応じて `src/commands/init.ts` からimport
   - テストケース自体は変更不要（動作の互換性維持）

4. **tests/unit/repository-resolution.test.ts**
   - import文の修正: `parseIssueUrl`, `resolveLocalRepoPath`, `findWorkflowMetadata` を `core/repository-utils.ts` からimport

5. **tests/unit/branch-validation.test.ts**
   - import文の修正: `validateBranchName`, `resolveBranchName` を `commands/init.ts` からimport

### 5.2 依存関係の変更

#### 新規依存の追加

- **なし** - 既存の依存関係（commander, fs-extra, simple-git等）のみ使用

#### 既存依存の変更

- **なし** - 依存ライブラリのバージョン変更は不要

### 5.3 マイグレーション要否

#### データベーススキーマ変更

- **なし**

#### 設定ファイル変更

- **なし** - package.json, tsconfig.jsonの変更不要
- **ビルドスクリプト**: 既存のビルドスクリプト（`npm run build`）で自動的に新規ファイルをコンパイル

#### 環境変数変更

- **なし** - 既存の環境変数（GITHUB_TOKEN, CODEX_API_KEY等）をそのまま使用

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

#### コマンドモジュール

1. **src/commands/init.ts** (約250~300行)
   - `handleInitCommand()` 関数
   - `validateBranchName()` 関数
   - `resolveBranchName()` 関数

2. **src/commands/execute.ts** (約450~500行)
   - `handleExecuteCommand()` 関数
   - `executePhasesSequential()` 関数
   - `executePhasesFrom()` 関数
   - `createPhaseInstance()` 関数
   - `resolvePresetName()` 関数
   - `getPresetPhases()` 関数
   - `canResumeWorkflow()` 関数
   - `loadExternalDocuments()` 関数
   - `resetMetadata()` 関数

3. **src/commands/list-presets.ts** (約50~80行)
   - `listPresets()` 関数

4. **src/commands/review.ts** (約50行)
   - `handleReviewCommand()` 関数（現在はmain.tsに存在）

#### 共有モジュール

5. **src/core/repository-utils.ts** (約200行)
   - `parseIssueUrl()` 関数（main.tsから移動）
   - `resolveLocalRepoPath()` 関数（main.tsから移動）
   - `findWorkflowMetadata()` 関数（main.tsから移動）
   - `getRepoRoot()` 関数（新規export）

6. **src/types/commands.ts** (約100行)
   - `PhaseContext` 型定義
   - `ExecutionSummary` 型定義
   - `PhaseResultMap` 型定義
   - `IssueInfo` 型定義（main.tsから移動）
   - `BranchValidationResult` 型定義

#### テストファイル

7. **tests/unit/commands/init.test.ts** (約150~200行)
   - 初期化コマンドのユニットテスト
   - ブランチ名バリデーション、Issue URL解析、リポジトリ解決のテスト

8. **tests/unit/commands/execute.test.ts** (約200~250行)
   - 実行コマンドのユニットテスト
   - エージェントモード選択、プリセット解決、フェーズ実行順序のテスト

9. **tests/unit/commands/list-presets.test.ts** (約50~80行)
   - プリセット一覧表示のユニットテスト

### 6.2 修正が必要な既存ファイル

1. **src/main.ts** (1309行 → 200行以下)
   - コマンドハンドラを削除し、新規モジュールからimport
   - コマンドルーターとしての役割のみ残す

2. **tests/unit/main-preset-resolution.test.ts** (220行)
   - import文の修正

3. **tests/unit/branch-validation.test.ts**
   - import文の修正

4. **tests/unit/repository-resolution.test.ts**
   - import文の修正

5. **tests/integration/workflow-init-cleanup.test.ts**
   - import文の修正（必要に応じて）

### 6.3 削除が必要なファイル

- **なし** - ファイルの削除は不要

---

## 7. 詳細設計

### 7.1 src/commands/init.ts

#### 関数設計

```typescript
/**
 * Issue初期化コマンドハンドラ
 * @param issueUrl - GitHub Issue URL
 * @param customBranch - カスタムブランチ名（任意）
 */
export async function handleInitCommand(
  issueUrl: string,
  customBranch?: string
): Promise<void> {
  // 1. Issue URL解析
  const issueInfo = parseIssueUrl(issueUrl);
  
  // 2. ローカルリポジトリパス解決
  const repoPath = resolveLocalRepoPath(issueInfo.repo);
  
  // 3. ブランチ名解決
  const branchName = resolveBranchName(issueInfo.issueNumber, customBranch);
  
  // 4. ブランチ名バリデーション
  const validation = validateBranchName(branchName);
  if (!validation.valid) {
    throw new Error(`Invalid branch name: ${validation.reason}`);
  }
  
  // 5. Git操作（ブランチ作成・チェックアウト）
  // 6. メタデータ作成
  // 7. Draft PR作成
}

/**
 * ブランチ名をバリデーション
 * @param branchName - バリデーション対象のブランチ名
 * @returns バリデーション結果
 */
export function validateBranchName(branchName: string): BranchValidationResult {
  // Git命名規則チェック
  // - 空白を含まない
  // - 連続ドット(..)を含まない
  // - 不正文字を含まない
  // - /で始まらない・終わらない
  // - .で終わらない
}

/**
 * ブランチ名を解決（カスタムまたはデフォルト）
 * @param issueNumber - Issue番号
 * @param customBranch - カスタムブランチ名（任意）
 * @returns 解決されたブランチ名
 */
export function resolveBranchName(
  issueNumber: string,
  customBranch?: string
): string {
  return customBranch || `ai-workflow/issue-${issueNumber}`;
}
```

#### データ構造

```typescript
// src/types/commands.ts

export interface BranchValidationResult {
  valid: boolean;
  reason?: string;
}
```

### 7.2 src/commands/execute.ts

#### 関数設計

```typescript
/**
 * フェーズ実行コマンドハンドラ
 * @param options - CLIオプション
 */
export async function handleExecuteCommand(options: any): Promise<void> {
  // 1. メタデータ探索
  const { repoRoot, metadataPath } = await findWorkflowMetadata(options.issue);
  
  // 2. メタデータ読み込み
  const metadata = await loadMetadata(metadataPath);
  
  // 3. エージェントモード判定
  const agentMode = options.agent || 'auto';
  
  // 4. プリセット解決
  const phases = options.preset 
    ? getPresetPhases(options.preset)
    : [options.phase];
  
  // 5. レジューム判定
  if (canResumeWorkflow(metadata)) {
    // Resume logic
  }
  
  // 6. フェーズ順次実行
  const summary = await executePhasesSequential(phases, metadata, options);
  
  // 7. 実行サマリー出力
  return summary;
}

/**
 * プリセット名を正規化（後方互換性対応）
 * @param presetName - プリセット名
 * @returns 正規化されたプリセット名
 */
export function resolvePresetName(presetName: string): string {
  const deprecatedPresets: Record<string, string> = {
    'requirements-only': 'review-requirements',
    'design-phase': 'review-design',
    'implementation-phase': 'implementation',
    'full-workflow': 'all'
  };
  
  return deprecatedPresets[presetName] || presetName;
}

/**
 * プリセットのフェーズリストを取得
 * @param presetName - プリセット名
 * @returns フェーズ名の配列
 */
export function getPresetPhases(presetName: string): string[] {
  // phase-dependencies.tsから取得
}

/**
 * ワークフロー再開可否を判定
 * @param metadata - メタデータ
 * @returns 再開可能な場合true
 */
export function canResumeWorkflow(metadata: WorkflowState): boolean {
  // 未完了フェーズの存在を確認
}

/**
 * フェーズを順次実行
 * @param phases - フェーズ名の配列
 * @param metadata - メタデータ
 * @param options - CLIオプション
 * @returns 実行サマリー
 */
export async function executePhasesSequential(
  phases: string[],
  metadata: WorkflowState,
  options: any
): Promise<ExecutionSummary> {
  const results: PhaseResultMap = {};
  
  for (const phaseName of phases) {
    const phaseInstance = createPhaseInstance(phaseName, metadata, options);
    const result = await phaseInstance.run(options);
    results[phaseName] = result;
  }
  
  return {
    totalPhases: phases.length,
    completedPhases: Object.values(results).filter(r => r.status === 'completed').length,
    failedPhases: Object.values(results).filter(r => r.status === 'failed').length,
    results
  };
}

/**
 * フェーズインスタンスを作成
 * @param phaseName - フェーズ名
 * @param metadata - メタデータ
 * @param options - CLIオプション
 * @returns フェーズインスタンス
 */
export function createPhaseInstance(
  phaseName: string,
  metadata: WorkflowState,
  options: any
): BasePhase {
  // 各フェーズクラスのインスタンスを生成
}
```

#### データ構造

```typescript
// src/types/commands.ts

export interface PhaseContext {
  repoRoot: string;
  metadataPath: string;
  issueNumber: string;
  agentMode: 'auto' | 'codex' | 'claude';
}

export interface ExecutionSummary {
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  results: PhaseResultMap;
}

export interface PhaseResultMap {
  [phaseName: string]: {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    duration?: number;
    error?: string;
  };
}
```

### 7.3 src/commands/list-presets.ts

#### 関数設計

```typescript
/**
 * プリセット一覧表示コマンドハンドラ
 */
export function listPresets(): void {
  console.log('\n=== Available Presets ===\n');
  
  const presets = getAllPresets();
  for (const [name, phases] of Object.entries(presets)) {
    console.log(`${name}:`);
    console.log(`  Phases: ${phases.join(' → ')}`);
  }
  
  console.log('\n=== Deprecated Presets (use new names) ===\n');
  const deprecated = getDeprecatedPresets();
  for (const [oldName, newName] of Object.entries(deprecated)) {
    console.log(`${oldName} → ${newName} (use new name instead)`);
  }
}
```

### 7.4 src/commands/review.ts

#### 関数設計

```typescript
/**
 * フェーズレビューコマンドハンドラ
 * @param options - CLIオプション
 */
export async function handleReviewCommand(options: any): Promise<void> {
  // 1. メタデータ探索
  const { metadataPath } = await findWorkflowMetadata(options.issue);
  
  // 2. メタデータ読み込み
  const metadata = await loadMetadata(metadataPath);
  
  // 3. フェーズステータス取得
  const phaseStatus = metadata.phases[options.phase];
  
  // 4. ステータス出力
  console.log(`[OK] Phase ${options.phase} status: ${phaseStatus.status}`);
}
```

### 7.5 src/core/repository-utils.ts

#### 関数設計

```typescript
/**
 * GitHub Issue URLを解析
 * @param issueUrl - GitHub Issue URL
 * @returns Issue情報
 */
export function parseIssueUrl(issueUrl: string): IssueInfo {
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid GitHub Issue URL: ${issueUrl}`);
  }
  
  return {
    owner: match[1],
    repo: match[2],
    issueNumber: match[3]
  };
}

/**
 * ローカルリポジトリパスを解決
 * @param repoName - リポジトリ名
 * @returns ローカルリポジトリパス
 */
export function resolveLocalRepoPath(repoName: string): string {
  // 1. $REPOS_ROOT 検索
  // 2. ~/TIELEC/development 検索
  // 3. ~/projects 検索
  // 4. ../ 検索
}

/**
 * ワークフローメタデータを探索
 * @param issueNumber - Issue番号
 * @returns リポジトリルートとメタデータパス
 */
export async function findWorkflowMetadata(
  issueNumber: string
): Promise<{ repoRoot: string; metadataPath: string }> {
  // マルチリポジトリ環境でメタデータを探索
}

/**
 * リポジトリルートを取得
 * @returns リポジトリルート
 */
export async function getRepoRoot(): Promise<string> {
  // Git repository root を取得
}
```

#### データ構造

```typescript
// src/types/commands.ts

export interface IssueInfo {
  owner: string;
  repo: string;
  issueNumber: string;
}
```

### 7.6 src/types/commands.ts

#### 型定義

```typescript
export interface IssueInfo {
  owner: string;
  repo: string;
  issueNumber: string;
}

export interface BranchValidationResult {
  valid: boolean;
  reason?: string;
}

export interface PhaseContext {
  repoRoot: string;
  metadataPath: string;
  issueNumber: string;
  agentMode: 'auto' | 'codex' | 'claude';
}

export interface ExecutionSummary {
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  results: PhaseResultMap;
}

export interface PhaseResultMap {
  [phaseName: string]: {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    duration?: number;
    error?: string;
  };
}
```

### 7.7 src/main.ts（リファクタリング後）

#### 構成

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { handleInitCommand } from './commands/init.js';
import { handleExecuteCommand } from './commands/execute.js';
import { handleReviewCommand } from './commands/review.js';
import { listPresets } from './commands/list-presets.js';

// Constants
export const PHASE_ORDER = [
  'planning',
  'requirements',
  // ...
];

// Main CLI function
export async function runCli(): Promise<void> {
  const program = new Command();
  
  // init command
  program
    .command('init')
    .option('--issue-url <url>', 'GitHub Issue URL')
    .option('--branch <name>', 'Custom branch name')
    .action(async (options) => {
      await handleInitCommand(options.issueUrl, options.branch);
    });
  
  // execute command
  program
    .command('execute')
    .option('--issue <number>', 'Issue number')
    .option('--phase <name>', 'Phase name')
    .option('--preset <name>', 'Preset name')
    .option('--agent <mode>', 'Agent mode (auto/codex/claude)')
    // ...
    .action(async (options) => {
      await handleExecuteCommand(options);
    });
  
  // review command
  program
    .command('review')
    .option('--phase <name>', 'Phase name')
    .option('--issue <number>', 'Issue number')
    .action(async (options) => {
      await handleReviewCommand(options);
    });
  
  // list-presets command
  program
    .command('list-presets')
    .action(() => {
      listPresets();
    });
  
  await program.parseAsync(process.argv);
}

// Utility functions (remain in main.ts)
export function reportFatalError(error: Error): void {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}

export function reportExecutionSummary(summary: ExecutionSummary): void {
  console.log('\n=== Execution Summary ===');
  console.log(`Total Phases: ${summary.totalPhases}`);
  console.log(`Completed: ${summary.completedPhases}`);
  console.log(`Failed: ${summary.failedPhases}`);
}

export function isValidPhaseName(phaseName: string): boolean {
  return PHASE_ORDER.includes(phaseName) || phaseName === 'all';
}
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

- **GitHub認証**: 既存の `GITHUB_TOKEN` 環境変数を使用（変更なし）
- **エージェント認証**: `CODEX_API_KEY`, `CLAUDE_CODE_CREDENTIALS_PATH` を使用（変更なし）
- **トークンの保護**: リファクタリング後もトークンは環境変数経由でのみ取得し、ログに出力しない

### 8.2 データ保護

- **機密情報の漏洩防止**: エージェント実行時のログに認証情報が含まれないことを確認
- **ファイルパーミッション**: メタデータファイル（`.ai-workflow/issue-*/metadata.json`）は既存の権限を維持

### 8.3 セキュリティリスクと対策

#### パストラバーサル攻撃

**リスク**: `resolveLocalRepoPath()` や `findWorkflowMetadata()` で不正なパスが指定される可能性

**対策**:
- パス解決時に正規化（`path.resolve()`）を使用
- シンボリックリンクのチェック（`fs.lstatSync()`）
- 許可されたディレクトリ（`$REPOS_ROOT`, `~/TIELEC/development`, `~/projects`, `../`）のみ許可

#### インジェクション攻撃

**リスク**: ブランチ名やIssue URLに不正な文字が含まれる可能性

**対策**:
- `validateBranchName()` で厳格なバリデーション（Git命名規則チェック）
- `parseIssueUrl()` で正規表現による厳格な検証
- コマンドライン引数のサニタイゼーション（commander.jsの標準機能を使用）

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

#### ビルド時間

- **現状**: TypeScriptコンパイル時間は約10秒
- **リファクタリング後**: ファイル数増加（+6ファイル）により、コンパイル時間が約1~2秒増加する可能性
- **対策**: 影響は軽微であり、許容範囲内

#### CLI起動時間

- **現状**: `node dist/index.js --help` の実行時間は約0.5秒
- **リファクタリング後**: モジュール分割により、import数が増加するが、Node.jsの動的ロードにより影響は軽微
- **測定**: リファクタリング前後で ±10% 以内を維持

### 9.2 スケーラビリティ

#### 新規コマンド追加

- **リファクタリング後**: 新規コマンドは `src/commands/{command-name}.ts` として独立したモジュールで作成可能
- **main.tsへの影響**: commander定義の追加のみ（10~20行程度）

#### プリセット追加

- **リファクタリング後**: `src/core/phase-dependencies.ts` のみ修正（コマンドモジュールへの影響なし）

### 9.3 保守性

#### コードの可読性

- **リファクタリング後**: 各コマンドモジュールが250~500行程度に分割され、責務が明確化
- **main.ts**: 200行以下に削減され、エントリーポイントの見通しが改善

#### テスト容易性

- **リファクタリング後**: 各コマンドモジュールが独立してテスト可能（export された関数を直接テスト）
- **既存テスト**: import修正のみで既存テストが動作（リグレッション防止）

---

## 10. 実装の順序

### 推奨実装順序

#### フェーズ1: 共有モジュール作成（依存関係の基盤）

1. **src/types/commands.ts** 作成
   - 型定義を最優先で作成（他モジュールから参照されるため）
   - 所要時間: 0.5h

2. **src/core/repository-utils.ts** 作成
   - `parseIssueUrl`, `resolveLocalRepoPath`, `findWorkflowMetadata` を移動
   - 所要時間: 1h

#### フェーズ2: コマンドモジュール作成（並行可能）

3. **src/commands/init.ts** 作成
   - `handleInitCommand`, `validateBranchName`, `resolveBranchName` を実装
   - 所要時間: 1h

4. **src/commands/execute.ts** 作成
   - `handleExecuteCommand`, `executePhasesSequential`, `resolvePresetName` 等を実装
   - 所要時間: 2h

5. **src/commands/review.ts** 作成
   - `handleReviewCommand` を実装
   - 所要時間: 0.5h

6. **src/commands/list-presets.ts** 作成
   - `listPresets` を実装
   - 所要時間: 0.5h

#### フェーズ3: main.tsリファクタリング

7. **src/main.ts** リファクタリング
   - コマンドハンドラを削除し、新規モジュールからimport
   - commander定義を更新
   - 所要時間: 1h

#### フェーズ4: テストコード作成・修正

8. **既存テストのimport修正**
   - `tests/unit/main-preset-resolution.test.ts`
   - `tests/unit/branch-validation.test.ts`
   - `tests/unit/repository-resolution.test.ts`
   - 所要時間: 0.5h

9. **新規ユニットテスト作成**
   - `tests/unit/commands/init.test.ts`
   - `tests/unit/commands/execute.test.ts`
   - `tests/unit/commands/list-presets.test.ts`
   - 所要時間: 1.5h

#### フェーズ5: テスト実行・検証

10. **ユニットテスト全件実行**
    - `npm run test:unit` 実行
    - 所要時間: 0.5h

11. **統合テスト全件実行**
    - `npm run test:integration` 実行
    - 所要時間: 0.5h

#### 依存関係

```
Phase 1 (types/commands.ts, repository-utils.ts)
  ↓
Phase 2 (init.ts, execute.ts, review.ts, list-presets.ts) [並行可能]
  ↓
Phase 3 (main.ts リファクタリング)
  ↓
Phase 4 (テストコード作成・修正)
  ↓
Phase 5 (テスト実行・検証)
```

---

## 11. 品質ゲート確認

### 必須要件チェックリスト

- ✅ **実装戦略の判断根拠が明記されている**
  - セクション2で「REFACTOR」戦略を選択し、4つの判断根拠を明記

- ✅ **テスト戦略の判断根拠が明記されている**
  - セクション3で「UNIT_INTEGRATION」戦略を選択し、3つの判断根拠を明記

- ✅ **テストコード戦略の判断根拠が明記されている**
  - セクション4で「BOTH_TEST」戦略を選択し、3つの判断根拠を明記

- ✅ **既存コードへの影響範囲が分析されている**
  - セクション5で既存ファイル5件の修正内容を詳細に分析

- ✅ **変更が必要なファイルがリストアップされている**
  - セクション6で新規作成ファイル9件、修正ファイル5件をリストアップ

- ✅ **設計が実装可能である**
  - セクション7で各モジュールの関数設計、データ構造、インターフェースを詳細に定義
  - セクション10で実装順序と依存関係を明示

---

## 12. 補足情報

### 12.1 既存プロジェクト構造との整合性

本設計は、既存のプロジェクト構造（CLAUDE.md, ARCHITECTURE.md, README.md）と整合性を保ちます：

- **既存のディレクトリ構造**: `src/core/`, `src/phases/`, `src/types/` を活用
- **新規ディレクトリ**: `src/commands/` を追加（CLIコマンドモジュール用）
- **既存のコーディング規約**: TypeScript strict mode、ESLint準拠、ES modules使用

### 12.2 トレーサビリティ

| 要件ID | 要件（requirements.md） | 設計セクション |
|--------|------------------------|---------------|
| FR-1.1 | initコマンドモジュールの作成 | 7.1 |
| FR-1.2 | executeコマンドモジュールの作成 | 7.2 |
| FR-1.3 | reviewコマンドモジュールの作成 | 7.4 |
| FR-1.4 | list-presetsコマンドモジュールの作成 | 7.3 |
| FR-2.1 | リポジトリユーティリティモジュールの作成 | 7.5 |
| FR-2.2 | コマンド型定義モジュールの作成 | 7.6 |
| FR-3.1 | main.ts をコマンドルーターに再構成 | 7.7 |
| FR-4.1 | CLI インターフェースの互換性 | 7.7 |
| FR-4.2 | エージェントモードの互換性 | 7.2 |

---

**設計書バージョン**: 1.0  
**作成日**: 2025-01-20  
**作成者**: AI Workflow Agent  
**レビュー状態**: Pending Review


---

**経過時間**: 176609ms
**開始**: 2025-10-21T01:47:08.900Z
**終了**: 2025-10-21T01:50:05.509Z