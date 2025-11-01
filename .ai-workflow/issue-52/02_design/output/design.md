# 詳細設計書 - Issue #52

## 0. Planning Document の確認

Planning Document（@.ai-workflow/issue-52/00_planning/output/planning.md）で策定された開発計画を確認しました：

### 開発計画の概要
- **実装戦略**: REFACTOR（既存コードのリファクタリング）
- **テスト戦略**: UNIT_INTEGRATION（単体テスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（新規テスト作成 + 既存テスト拡張）
- **見積もり工数**: 14~20時間（2~3日）
- **リスク評価**: 低（後方互換性100%維持、既存テストスイート充実）

### 採用する技術パターン
- **ファサードパターン**: CommitManagerは既存の公開APIを維持し、内部的にFileSelector/CommitMessageBuilderに処理を委譲
- **依存性注入**: 各モジュールはコンストラクタでSimpleGit/MetadataManagerを受け取る
- **既存実績**: GitManager（Issue #25）、GitHubClient（Issue #24）で同様のパターンを成功裏に実装済み

---

## 1. アーキテクチャ設計

### 1.1. システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitManager                               │
│                      (ファサードクラス)                          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        │ 委譲
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CommitManager                               │
│                  (リファクタリング後: 約200行)                   │
│                                                                  │
│  責務: コミット実行のオーケストレーション                        │
│  - commitPhaseOutput()      … フェーズ出力コミット               │
│  - commitStepOutput()       … ステップ出力コミット               │
│  - commitWorkflowInit()     … ワークフロー初期化コミット         │
│  - commitCleanupLogs()      … ログクリーンアップコミット         │
│  - createCommitMessage()    … 公開API（後方互換性）              │
│  - ensureGitConfig()        … Git設定管理                        │
└────┬──────────────────┬─────────────────────────────────────────┘
     │                  │
     │ 委譲             │ 委譲
     ▼                  ▼
┌─────────────────┐  ┌──────────────────────────────────────────┐
│  FileSelector   │  │   CommitMessageBuilder                   │
│  (約150行)      │  │   (約100行)                              │
│                 │  │                                          │
│  責務:          │  │   責務:                                  │
│  ファイル選択   │  │   コミットメッセージ構築                 │
│  ・フィルタリング│  │                                          │
│                 │  │   - createCommitMessage()                │
│  メソッド:      │  │   - buildStepCommitMessage()             │
│  - getChangedFiles() │  - createInitCommitMessage()         │
│  - filterPhaseFiles()│  - createCleanupCommitMessage()       │
│  - getPhaseSpecificFiles()                                    │
│  - scanDirectories()│                                         │
│  - scanByPatterns() │                                         │
└─────────────────┘  └──────────────────────────────────────────┘
```

### 1.2. コンポーネント間の関係

```
                    ┌──────────────────┐
                    │   SimpleGit      │
                    │   (simple-git)   │
                    └────────┬─────────┘
                             │
                     依存性注入
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────┐
│ FileSelector  │  │ CommitMessage  │  │ CommitManager  │
│               │  │ Builder        │  │                │
└───────────────┘  └────────────────┘  └────────────────┘
                             │                    │
                             └────────┬───────────┘
                                      │
                              依存性注入
                                      │
                                      ▼
                          ┌──────────────────┐
                          │ MetadataManager  │
                          └──────────────────┘

                                      │
                              依存性注入
                                      │
                                      ▼
                          ┌──────────────────┐
                          │  SecretMasker    │
                          └──────────────────┘
```

### 1.3. データフロー

#### フェーズ出力コミットのフロー

```
1. GitManager.commitPhaseOutput()
   ↓
2. CommitManager.commitPhaseOutput()
   ↓
3. FileSelector.getChangedFiles()           … Git statusから変更ファイル取得
   ↓
4. FileSelector.filterPhaseFiles()          … Issue番号でフィルタリング
   ↓
5. FileSelector.getPhaseSpecificFiles()     … フェーズ固有ファイル取得
   ↓
6. SecretMasker.maskSecretsInWorkflowDir()  … シークレットマスキング
   ↓
7. SimpleGit.add()                          … ステージング
   ↓
8. CommitManager.ensureGitConfig()          … Git設定確認
   ↓
9. CommitMessageBuilder.createCommitMessage() … メッセージ生成
   ↓
10. SimpleGit.commit()                       … コミット実行
    ↓
11. CommitResult返却                         … 結果を返す
```

---

## 2. 実装戦略判断

### 実装戦略: REFACTOR

**判断根拠**:

このタスクは既存コードのリファクタリングが中心であり、以下の理由から **REFACTOR** と判断します：

1. **既存ファイルの構造改善**: `commit-manager.ts`（586行）を3つのモジュールに分解
   - 既存の `CommitManager` クラスを約200行に削減（66%削減）
   - 責務を明確に分離し、単一責任の原則（SRP）に準拠

2. **機能追加なし**: 公開インターフェースを維持し、内部実装のみを改善
   - `commitPhaseOutput()`, `commitStepOutput()`, `createCommitMessage()` 等の公開メソッドは変更なし
   - GitManager からの呼び出し元は無変更で動作

3. **委譲パターン**: CommitManagerはファサードとして動作し、各専門モジュールに処理を委譲
   - FileSelector: ファイル選択・フィルタリングロジック
   - CommitMessageBuilder: コミットメッセージ構築ロジック
   - CommitManager: コミット実行のオーケストレーション

4. **後方互換性100%維持**: 既存の呼び出し元コードは無変更で動作
   - GitManager（Issue #25）、GitHubClient（Issue #24）と同様のファサードパターンを採用
   - 既存テストスイート（363行）により後方互換性を保証

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

以下の理由から **UNIT_INTEGRATION**（Unit + Integration）と判断します：

1. **UNIT テスト**:
   - **FileSelector**: ファイルフィルタリングロジックの単体テスト
     - `getChangedFiles()`: git status 解析、@tmp 除外の検証
     - `filterPhaseFiles()`: Issue番号フィルタリングの検証
     - `getPhaseSpecificFiles()`: implementation, test_implementation, documentation のパターンマッチング検証
     - `scanDirectories()`: 複数ディレクトリスキャンの検証
     - `scanByPatterns()`: minimatch パターンマッチングの検証

   - **CommitMessageBuilder**: メッセージ生成ロジックの単体テスト
     - `createCommitMessage()`: フォーマット検証（Phase番号、ステータス、レビュー結果）
     - `buildStepCommitMessage()`: ステップメッセージのフォーマット検証
     - `createInitCommitMessage()`: 初期化メッセージのフォーマット検証
     - `createCleanupCommitMessage()`: クリーンアップメッセージのフォーマット検証

   - **CommitManager**: 委譲動作の単体テスト
     - モックを使用して FileSelector と CommitMessageBuilder への委譲を検証
     - 各公開メソッドの委譲マッピングを検証

2. **INTEGRATION テスト**:
   - **GitManager統合**: 既存の `step-commit-push.test.ts` で統合動作を検証
     - GitManager → CommitManager → FileSelector/CommitMessageBuilder の連携動作
     - 実際のGit操作とファイルシステム連携を検証
   - **エンドツーエンド**: リファクタリング後も既存テストが成功することで後方互換性を保証

3. **BDDテスト不要**:
   - エンドユーザー向け機能ではなく、内部リファクタリングのため
   - ユーザーストーリーが存在しない
   - Unit + Integration で十分な品質を保証可能

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:

以下の理由から **BOTH_TEST**（新規テスト作成 + 既存テスト拡張）と判断します：

1. **CREATE_TEST（新規テスト作成）**:
   - **新規テスト**: `tests/unit/git/file-selector.test.ts`（約100行）
     - FileSelector の全メソッドに対するユニットテスト
     - 正常系・境界値・異常系の網羅的なテスト
   - **新規テスト**: `tests/unit/git/commit-message-builder.test.ts`（約50行）
     - CommitMessageBuilder の全メソッドに対するユニットテスト
     - メッセージフォーマットの厳密な検証

2. **EXTEND_TEST（既存テストの拡張）**:
   - **既存テスト拡張**: `tests/unit/git/commit-manager.test.ts`（363行 → 約200行にリファクタリング、新規委譲テスト追加）
     - メッセージ生成テスト（62~148行）→ CommitMessageBuilder のテストに移行
     - ファイルヘルパーテスト（461~577行）→ FileSelector のテストに移行
     - コミット操作テスト（150~362行）→ CommitManager の委譲テストにリファクタリング
   - **既存統合テスト維持**: `tests/integration/step-commit-push.test.ts`（後方互換性検証）
     - リファクタリング後も既存の統合テストが成功することで、後方互換性を100%保証

3. **既存テストの活用**:
   - 既存の `commit-manager.test.ts`（363行）の大部分が再利用可能
   - テストコード実装の工数は比較的少なく見積もられる（2~3時間）

---

## 5. 影響範囲分析

### 5.1. 既存コードへの影響

**直接影響**:
- `src/core/git/commit-manager.ts`: 586行 → 約200行に削減（リファクタリング）
  - ファイル選択ロジック（448-566行）を FileSelector に抽出
  - メッセージ構築ロジック（350-443行）を CommitMessageBuilder に抽出
  - コミット実行ロジック（46-345行）は CommitManager に残存
  - 既存の公開API（`commitPhaseOutput`, `commitStepOutput`, `createCommitMessage` 等）を維持

**間接影響（影響なし）**:
- `src/core/git-manager.ts`: 変更なし（CommitManagerのインターフェース維持により）
- `src/phases/base-phase.ts`: 変更なし
- `src/commands/init.ts`: 変更なし

**新規ファイル**:
- `src/core/git/file-selector.ts`: 約150行（新規作成）
- `src/core/git/commit-message-builder.ts`: 約100行（新規作成）

**テストファイル**:
- `tests/unit/git/commit-manager.test.ts`: 363行 → 約200行にリファクタリング
- `tests/unit/git/file-selector.test.ts`: 約100行（新規作成）
- `tests/unit/git/commit-message-builder.test.ts`: 約50行（新規作成）
- `tests/integration/step-commit-push.test.ts`: 変更なし（後方互換性検証）

### 5.2. 依存関係の変更

**新規依存の追加**: なし（既存の `minimatch` を引き続き使用）

**既存依存の変更**: なし

**インポート構造**:
```typescript
// commit-manager.ts (リファクタリング後)
import { FileSelector } from './file-selector.js';
import { CommitMessageBuilder } from './commit-message-builder.js';

// git-manager.ts (変更なし)
import { CommitManager } from './git/commit-manager.js';
```

**依存関係グラフ**:
```
simple-git (SimpleGit)
    ↓
FileSelector ← CommitManager → CommitMessageBuilder
                ↓
         MetadataManager
                ↓
         SecretMasker
```

### 5.3. マイグレーション要否

**データベーススキーマ変更**: なし

**設定ファイル変更**: なし

**破壊的変更**: なし（後方互換性100%維持）

**マイグレーション手順**: 不要
- 既存の公開APIを維持するため、呼び出し元の変更は不要
- 既存のテストスイートが全て成功することで、後方互換性を保証

---

## 6. 変更・追加ファイルリスト

### 6.1. 新規作成ファイル

| ファイルパス | 行数 | 説明 |
|------------|------|------|
| `src/core/git/file-selector.ts` | 約150行 | ファイル選択・フィルタリングロジックを担当 |
| `src/core/git/commit-message-builder.ts` | 約100行 | コミットメッセージ構築ロジックを担当 |
| `tests/unit/git/file-selector.test.ts` | 約100行 | FileSelector のユニットテスト |
| `tests/unit/git/commit-message-builder.test.ts` | 約50行 | CommitMessageBuilder のユニットテスト |

### 6.2. 修正が必要な既存ファイル

| ファイルパス | 変更内容 | 変更行数 |
|------------|---------|----------|
| `src/core/git/commit-manager.ts` | リファクタリング（586行 → 約200行）<br>- ファイル選択ロジックを削除（448-566行）<br>- メッセージ構築ロジックを削除（350-443行の一部）<br>- FileSelector/CommitMessageBuilder のインスタンス化<br>- 委譲実装 | -386行<br>（削減） |
| `tests/unit/git/commit-manager.test.ts` | リファクタリング（363行 → 約200行）<br>- メッセージ生成テストを移行<br>- ファイルヘルパーテストを移行<br>- 委譲テストを追加 | -163行<br>（削減） |

### 6.3. 削除が必要なファイル

なし（既存ファイルを削除する必要はありません）

### 6.4. 影響を受けないファイル（後方互換性により）

| ファイルパス | 理由 |
|------------|------|
| `src/core/git-manager.ts` | CommitManager の公開APIが維持されるため |
| `src/phases/base-phase.ts` | CommitManager の呼び出しインターフェースが変更されないため |
| `src/commands/init.ts` | CommitManager の呼び出しインターフェースが変更されないため |
| `tests/integration/step-commit-push.test.ts` | 後方互換性が100%維持されるため |

---

## 7. 詳細設計

### 7.1. FileSelector クラス設計

#### 7.1.1. クラス概要

```typescript
/**
 * FileSelector - Specialized module for file selection and filtering
 *
 * Responsibilities:
 * - Detect changed files from git status
 * - Filter files by issue number
 * - Get phase-specific files (implementation, test_implementation, documentation)
 * - Scan directories by patterns
 * - Scan files by minimatch patterns
 */
export class FileSelector {
  private readonly git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  // Public methods
  public async getChangedFiles(): Promise<string[]>;
  public filterPhaseFiles(files: string[], issueNumber: string): string[];
  public async getPhaseSpecificFiles(phaseName: PhaseName): Promise<string[]>;

  // Private methods
  private async scanDirectories(directories: string[]): Promise<string[]>;
  private async scanByPatterns(patterns: string[]): Promise<string[]>;
}
```

#### 7.1.2. メソッド設計

##### getChangedFiles()

**シグネチャ**:
```typescript
public async getChangedFiles(): Promise<string[]>
```

**責務**: Git statusから変更ファイルを取得し、`@tmp`を除外する

**ロジック**:
```typescript
1. git.status() を実行
2. 以下のステータスを統合:
   - not_added
   - created
   - deleted
   - modified
   - renamed (rename.to)
   - staged
   - files (全ファイル)
3. @tmp を含むファイルを除外
4. 重複を除去（Set を使用）
5. 配列として返却
```

**入力**: なし

**出力**: `string[]` - 変更ファイルのリスト

**抽出元**: commit-manager.ts の 448-470行

---

##### filterPhaseFiles()

**シグネチャ**:
```typescript
public filterPhaseFiles(files: string[], issueNumber: string): string[]
```

**責務**: Issue番号でファイルをフィルタリングする

**ロジック**:
```typescript
1. targetPrefix = `.ai-workflow/issue-${issueNumber}/` を定義
2. 各ファイルについて:
   - @tmp を含むファイルはスキップ
   - targetPrefix で始まるファイルは含める
   - .ai-workflow/ で始まる（他のIssue）ファイルはスキップ
   - その他のファイルは含める（src/**, tests/** 等）
3. フィルタ結果を返却
```

**入力**:
- `files: string[]` - 変更ファイルリスト
- `issueNumber: string` - Issue番号

**出力**: `string[]` - フィルタされたファイルリスト

**抽出元**: commit-manager.ts の 475-494行

---

##### getPhaseSpecificFiles()

**シグネチャ**:
```typescript
public async getPhaseSpecificFiles(phaseName: PhaseName): Promise<string[]>
```

**責務**: フェーズ名に応じた固有ファイルを取得する

**ロジック**:
```typescript
switch (phaseName) {
  case 'implementation':
    return this.scanDirectories(['scripts', 'pulumi', 'ansible', 'jenkins']);
  case 'test_implementation':
    return this.scanByPatterns([
      'test_*.py', '*_test.py', '*.test.js', '*.spec.js',
      '*.test.ts', '*.spec.ts', '*_test.go', 'Test*.java',
      '*Test.java', 'test_*.sh'
    ]);
  case 'documentation':
    return this.scanByPatterns(['*.md', '*.MD']);
  default:
    return [];
}
```

**入力**: `phaseName: PhaseName` - フェーズ名

**出力**: `string[]` - フェーズ固有ファイルリスト

**抽出元**: commit-manager.ts の 499-521行

---

##### scanDirectories()

**シグネチャ**:
```typescript
private async scanDirectories(directories: string[]): Promise<string[]>
```

**責務**: 指定されたディレクトリ配下の変更ファイルをスキャンする

**ロジック**:
```typescript
1. getChangedFiles() を呼び出して変更ファイルを取得
2. 各ディレクトリについて:
   - prefix = `${dir}/` を定義
   - 変更ファイルのうち prefix で始まるものを抽出
   - @tmp を含むファイルはスキップ
3. 結果を返却
```

**入力**: `directories: string[]` - ディレクトリリスト

**出力**: `string[]` - スキャンされたファイルリスト

**抽出元**: commit-manager.ts の 526-540行

---

##### scanByPatterns()

**シグネチャ**:
```typescript
private async scanByPatterns(patterns: string[]): Promise<string[]>
```

**責務**: minimatch を使用したパターンマッチングでファイルをスキャンする

**ロジック**:
```typescript
1. getChangedFiles() を呼び出して変更ファイルを取得
2. 各ファイルについて:
   - @tmp を含むファイルはスキップ
   - 各パターンについて:
     - minimatch(file, pattern, { dot: true }) でマッチ
     - minimatch(file, `**/${pattern}`, { dot: true }) でマッチ
     - いずれかにマッチすれば結果に追加
3. 重複を除去（Set を使用）
4. 配列として返却
```

**入力**: `patterns: string[]` - minimatch パターンリスト

**出力**: `string[]` - スキャンされたファイルリスト

**抽出元**: commit-manager.ts の 545-566行

---

### 7.2. CommitMessageBuilder クラス設計

#### 7.2.1. クラス概要

```typescript
/**
 * CommitMessageBuilder - Specialized module for commit message construction
 *
 * Responsibilities:
 * - Generate phase completion commit messages
 * - Generate step completion commit messages
 * - Generate initialization commit messages
 * - Generate cleanup commit messages
 */
export class CommitMessageBuilder {
  private readonly metadata: MetadataManager;
  private readonly phaseOrder: PhaseName[] = [
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
    'evaluation',
  ];

  constructor(metadataManager: MetadataManager) {
    this.metadata = metadataManager;
  }

  // Public methods
  public createCommitMessage(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): string;

  public buildStepCommitMessage(
    phaseName: string,
    phaseNumber: number,
    step: string,
    issueNumber: number,
  ): string;

  public createInitCommitMessage(
    issueNumber: number,
    branchName: string,
  ): string;

  public createCleanupCommitMessage(
    issueNumber: number,
    phase: 'report' | 'evaluation',
  ): string;
}
```

#### 7.2.2. メソッド設計

##### createCommitMessage()

**シグネチャ**:
```typescript
public createCommitMessage(
  phaseName: PhaseName,
  status: 'completed' | 'failed',
  reviewResult?: string,
): string
```

**責務**: フェーズ完了時のコミットメッセージを生成する

**ロジック**:
```typescript
1. phaseOrder から Phase番号を計算（indexOf + 1）
2. metadata.data.issue_number から Issue番号を取得
3. reviewResult がない場合は 'N/A' を使用
4. 以下のフォーマットでメッセージを生成:
   [ai-workflow] Phase {number} ({name}) - {status}

   Issue: #{issue_number}
   Phase: {number} ({name})
   Status: {status}
   Review: {review_result}

   Auto-generated by AI Workflow
```

**入力**:
- `phaseName: PhaseName` - フェーズ名
- `status: 'completed' | 'failed'` - ステータス
- `reviewResult?: string` - レビュー結果（オプション）

**出力**: `string` - コミットメッセージ

**抽出元**: commit-manager.ts の 350-382行

---

##### buildStepCommitMessage()

**シグネチャ**:
```typescript
public buildStepCommitMessage(
  phaseName: string,
  phaseNumber: number,
  step: string,
  issueNumber: number,
): string
```

**責務**: ステップ完了時のコミットメッセージを生成する

**ロジック**:
```typescript
1. 以下のフォーマットでメッセージを生成:
   [ai-workflow] Phase {number} ({name}) - {step} completed

   Issue: #{issue_number}
   Phase: {number} ({name})
   Step: {step}
   Status: completed

   Auto-generated by AI Workflow
```

**入力**:
- `phaseName: string` - フェーズ名
- `phaseNumber: number` - Phase番号
- `step: string` - ステップ名
- `issueNumber: number` - Issue番号

**出力**: `string` - コミットメッセージ

**抽出元**: commit-manager.ts の 387-403行

---

##### createInitCommitMessage()

**シグネチャ**:
```typescript
public createInitCommitMessage(
  issueNumber: number,
  branchName: string,
): string
```

**責務**: ワークフロー初期化時のコミットメッセージを生成する

**ロジック**:
```typescript
1. 以下のフォーマットでメッセージを生成:
   [ai-workflow] Initialize workflow for issue #{issue_number}

   Issue: #{issue_number}
   Action: Create workflow metadata and directory structure
   Branch: {branch_name}

   Auto-generated by AI Workflow
```

**入力**:
- `issueNumber: number` - Issue番号
- `branchName: string` - ブランチ名

**出力**: `string` - コミットメッセージ

**抽出元**: commit-manager.ts の 408-421行

---

##### createCleanupCommitMessage()

**シグネチャ**:
```typescript
public createCleanupCommitMessage(
  issueNumber: number,
  phase: 'report' | 'evaluation',
): string
```

**責務**: ログクリーンアップ時のコミットメッセージを生成する

**ロジック**:
```typescript
1. Phase番号を計算（report = 8, evaluation = 9）
2. 以下のフォーマットでメッセージを生成:
   [ai-workflow] Clean up workflow execution logs

   Issue: #{issue_number}
   Phase: {number} ({phase})
   Action: Remove agent execution logs (execute/review/revise directories)
   Preserved: metadata.json, output/*.md

   Auto-generated by AI Workflow
```

**入力**:
- `issueNumber: number` - Issue番号
- `phase: 'report' | 'evaluation'` - フェーズ名

**出力**: `string` - コミットメッセージ

**抽出元**: commit-manager.ts の 426-443行

---

### 7.3. CommitManager クラス設計（リファクタリング後）

#### 7.3.1. クラス概要

```typescript
/**
 * CommitManager - Specialized manager for Git commit operations (Refactored)
 *
 * Responsibilities:
 * - Commit orchestration (delegating to FileSelector and CommitMessageBuilder)
 * - SecretMasker integration
 * - Git configuration management
 */
export class CommitManager {
  private readonly git: SimpleGit;
  private readonly metadata: MetadataManager;
  private readonly secretMasker: SecretMasker;
  private readonly repoPath: string;

  // 新規追加: 専門モジュール
  private readonly fileSelector: FileSelector;
  private readonly messageBuilder: CommitMessageBuilder;

  constructor(
    git: SimpleGit,
    metadataManager: MetadataManager,
    secretMasker: SecretMasker,
    repoPath: string,
  ) {
    this.git = git;
    this.metadata = metadataManager;
    this.secretMasker = secretMasker;
    this.repoPath = repoPath;

    // FileSelector と CommitMessageBuilder のインスタンス化
    this.fileSelector = new FileSelector(git);
    this.messageBuilder = new CommitMessageBuilder(metadataManager);
  }

  // 既存の公開メソッド（後方互換性維持）
  public async commitPhaseOutput(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): Promise<CommitResult>;

  public async commitStepOutput(
    phaseName: PhaseName,
    phaseNumber: number,
    step: StepName,
    issueNumber: number,
    workingDir: string,
  ): Promise<CommitResult>;

  public async commitWorkflowInit(
    issueNumber: number,
    branchName: string,
  ): Promise<CommitResult>;

  public async commitCleanupLogs(
    issueNumber: number,
    phase: 'report' | 'evaluation',
  ): Promise<CommitResult>;

  public createCommitMessage(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): string;

  // Private methods
  private async ensureGitConfig(): Promise<void>;
}
```

#### 7.3.2. 委譲マッピング

| CommitManager メソッド | 委譲先 | 委譲先メソッド |
|----------------------|-------|---------------|
| `commitPhaseOutput()` | FileSelector | `getChangedFiles()`, `filterPhaseFiles()`, `getPhaseSpecificFiles()` |
|                      | CommitMessageBuilder | `createCommitMessage()` |
|                      | SecretMasker | `maskSecretsInWorkflowDir()` |
| `commitStepOutput()` | FileSelector | `getChangedFiles()`, `filterPhaseFiles()` |
|                     | CommitMessageBuilder | `buildStepCommitMessage()` |
|                     | SecretMasker | `maskSecretsInWorkflowDir()` |
| `commitWorkflowInit()` | FileSelector | `getChangedFiles()`, `filterPhaseFiles()` |
|                       | CommitMessageBuilder | `createInitCommitMessage()` |
|                       | SecretMasker | `maskSecretsInWorkflowDir()` |
| `commitCleanupLogs()` | FileSelector | `getChangedFiles()`, `filterPhaseFiles()` |
|                      | CommitMessageBuilder | `createCleanupCommitMessage()` |
| `createCommitMessage()` | CommitMessageBuilder | `createCommitMessage()` |

#### 7.3.3. リファクタリング後の commitPhaseOutput() 実装例

```typescript
public async commitPhaseOutput(
  phaseName: PhaseName,
  status: 'completed' | 'failed',
  reviewResult?: string,
): Promise<CommitResult> {
  const issueNumber = this.metadata.data.issue_number;
  if (!issueNumber) {
    return {
      success: false,
      commit_hash: null,
      files_committed: [],
      error: 'Issue number not found in metadata',
    };
  }

  // 1. ファイル選択（FileSelector に委譲）
  const changedFiles = await this.fileSelector.getChangedFiles();
  logger.debug(`Git status detected ${changedFiles.length} changed files`);

  const targetFiles = new Set(
    this.fileSelector.filterPhaseFiles(changedFiles, issueNumber),
  );

  const phaseSpecific = await this.fileSelector.getPhaseSpecificFiles(phaseName);
  phaseSpecific.forEach((file) => targetFiles.add(file));

  logger.debug(`Target files for commit: ${targetFiles.size} files`);

  if (targetFiles.size === 0) {
    logger.warn('No files to commit. This may indicate that files were not staged correctly.');
    return {
      success: true,
      commit_hash: null,
      files_committed: [],
    };
  }

  const filesToCommit = Array.from(targetFiles);

  // 2. シークレットマスキング
  const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
  try {
    const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
    if (maskingResult.filesProcessed > 0) {
      logger.info(
        `Masked ${maskingResult.secretsMasked} secret(s) in ${maskingResult.filesProcessed} file(s)`,
      );
    }
    if (maskingResult.errors.length > 0) {
      logger.warn(
        `Secret masking encountered ${maskingResult.errors.length} error(s)`,
      );
    }
  } catch (error) {
    logger.error(`Secret masking failed: ${getErrorMessage(error)}`);
    // Continue with commit (don't block)
  }

  // 3. Git ステージング
  await this.git.add(filesToCommit);
  await this.ensureGitConfig();

  // 4. コミットメッセージ生成（CommitMessageBuilder に委譲）
  const commitMessage = this.messageBuilder.createCommitMessage(
    phaseName,
    status,
    reviewResult,
  );

  // 5. コミット実行
  try {
    const commitResponse = await this.git.commit(commitMessage, filesToCommit, {
      '--no-verify': null,
    });

    logger.debug(`Commit created: ${commitResponse.commit ?? 'unknown'}`);
    logger.debug(`Commit summary: ${commitResponse.summary?.changes ?? 0} changes, ${commitResponse.summary?.insertions ?? 0} insertions, ${commitResponse.summary?.deletions ?? 0} deletions`);

    return {
      success: true,
      commit_hash: commitResponse.commit ?? null,
      files_committed: filesToCommit,
    };
  } catch (error) {
    logger.error(`Git commit failed: ${getErrorMessage(error)}`);
    return {
      success: false,
      commit_hash: null,
      files_committed: filesToCommit,
      error: `Git commit failed: ${getErrorMessage(error)}`,
    };
  }
}
```

**変更点**:
- ファイル選択ロジックを `this.fileSelector.*` に委譲
- メッセージ生成ロジックを `this.messageBuilder.createCommitMessage()` に委譲
- コミット実行ロジックとシークレットマスキング統合は CommitManager に残す

---

## 8. セキュリティ考慮事項

### 8.1. SecretMasker 統合の維持

**要件**:
- リファクタリング後も、全てのコミット操作で SecretMasker を統合する
- `maskSecretsInWorkflowDir()` はコミット前に必ず実行する

**実装**:
- CommitManager の各コミットメソッド（`commitPhaseOutput`, `commitStepOutput`, `commitWorkflowInit`, `commitCleanupLogs`）で SecretMasker を呼び出す
- マスキング失敗時もコミットを継続する（Don't block）
- エラーログを出力し、問題を記録する

**セキュリティリスク**:
- リファクタリング時に SecretMasker 呼び出しを誤って削除しないこと
- 既存の統合テストで SecretMasker 統合を検証する

### 8.2. Git 設定管理の維持

**要件**:
- リファクタリング後も、`ensureGitConfig()` メソッドを CommitManager に保持する
- 全てのコミット操作前に Git 設定を検証する

**実装**:
- `ensureGitConfig()` は CommitManager の private メソッドとして残す
- 環境変数 `GIT_COMMIT_USER_NAME` と `GIT_COMMIT_USER_EMAIL` を優先的に使用
- デフォルト値のフォールバック処理を維持

### 8.3. パストラバーサル攻撃の防止

**要件**:
- ファイルパスのバリデーションを維持する
- `@tmp` を含むファイルを確実に除外する

**実装**:
- FileSelector の `getChangedFiles()` と `scanByPatterns()` で `@tmp` を除外
- `filterPhaseFiles()` で `.ai-workflow/issue-<NUM>/` プレフィックスを検証

---

## 9. 非機能要件への対応

### 9.1. パフォーマンス

**委譲オーバーヘッドの最小化**:
- 委譲パターンによるオーバーヘッドは、メソッド呼び出し1回のみに限定
- Git操作（I/O）がボトルネックであり、委譲パターンの影響は0.1%未満と見込む

**測定方法**:
- 統合テスト（`step-commit-push.test.ts`）で実行時間を計測
- リファクタリング前後でパフォーマンス劣化がないことを確認（±5%以内）

### 9.2. 保守性

**単一責任の原則（SRP）に準拠**:
- FileSelector: ファイル選択・フィルタリングロジックのみ
- CommitMessageBuilder: コミットメッセージ構築ロジックのみ
- CommitManager: コミット実行とオーケストレーションのみ

**コード重複の削除**:
- `commitPhaseOutput` と `commitStepOutput` 間の重複コード（約40行）を削減
- FileSelector/CommitMessageBuilder の共通ロジックを抽出

**メトリクス**:
- CommitManager: 586行 → 約200行（66%削減）
- 総行数: 586行 → 約450行（FileSelector 150行 + CommitMessageBuilder 100行 + CommitManager 200行）
- 実質削減: 約23%

### 9.3. テスト容易性

**独立したユニットテストが可能**:
- FileSelector の各メソッドを独立してテストできる
- CommitMessageBuilder の各メソッドを独立してテストできる
- CommitManager の委譲動作をモックでテストできる

**モックの使用**:
- FileSelector と CommitMessageBuilder をモック化して CommitManager をテスト
- SimpleGit をモック化して FileSelector をテスト
- MetadataManager をモック化して CommitMessageBuilder をテスト

### 9.4. 拡張性

**新規フェーズ追加の容易性**:
- 新規フェーズ追加時、FileSelector の `getPhaseSpecificFiles()` メソッドのみ変更すれば済む
- CommitManager 本体への変更は不要

**例**:
```typescript
// FileSelector.ts
public async getPhaseSpecificFiles(phaseName: PhaseName): Promise<string[]> {
  switch (phaseName) {
    case 'implementation':
      return this.scanDirectories(['scripts', 'pulumi', 'ansible', 'jenkins']);
    case 'test_implementation':
      return this.scanByPatterns([...]);
    case 'documentation':
      return this.scanByPatterns(['*.md', '*.MD']);
    case 'new_phase':  // ← 新規フェーズ追加
      return this.scanByPatterns(['*.new']);
    default:
      return [];
  }
}
```

### 9.5. 後方互換性

**100%の後方互換性維持**:
- 既存の公開API（`commitPhaseOutput`, `commitStepOutput`, `createCommitMessage` 等）を維持
- git-manager.ts からの呼び出しは無変更で動作

**検証方法**:
- 既存の統合テスト（`step-commit-push.test.ts`）で後方互換性を検証
- 全てのユニットテストが成功することで、リグレッションがないことを保証

---

## 10. 実装の順序

### 10.1. Phase 1: FileSelector の実装（優先度: 高）

**理由**: CommitManager のリファクタリングには FileSelector が必要

**タスク**:
1. `src/core/git/file-selector.ts` を作成
2. クラス骨格とコンストラクタを実装
3. `getChangedFiles()` メソッドを実装（commit-manager.ts 448-470行から抽出）
4. `filterPhaseFiles()` メソッドを実装（475-494行から抽出）
5. `getPhaseSpecificFiles()` メソッドを実装（499-521行から抽出）
6. `scanDirectories()` メソッドを実装（526-540行から抽出）
7. `scanByPatterns()` メソッドを実装（545-566行から抽出）

**見積もり**: 2~3時間

### 10.2. Phase 2: CommitMessageBuilder の実装（優先度: 高）

**理由**: CommitManager のリファクタリングには CommitMessageBuilder が必要

**タスク**:
1. `src/core/git/commit-message-builder.ts` を作成
2. クラス骨格とコンストラクタを実装
3. `createCommitMessage()` メソッドを実装（commit-manager.ts 350-382行から抽出）
4. `buildStepCommitMessage()` メソッドを実装（387-403行から抽出）
5. `createInitCommitMessage()` メソッドを実装（408-421行から抽出）
6. `createCleanupCommitMessage()` メソッドを実装（426-443行から抽出）

**見積もり**: 1~2時間

### 10.3. Phase 3: CommitManager のリファクタリング（優先度: 高）

**理由**: FileSelector と CommitMessageBuilder が完成後に実施

**タスク**:
1. FileSelector と CommitMessageBuilder のインスタンス化（コンストラクタ）
2. `commitPhaseOutput()` の委譲実装
3. `commitStepOutput()` の委譲実装
4. `commitWorkflowInit()` の委譲実装
5. `commitCleanupLogs()` の委譲実装
6. `createCommitMessage()` の公開メソッド委譲（git-manager.ts 互換性維持）
7. 抽出済みメソッドの削除（`getChangedFiles`, `filterPhaseFiles`, `getPhaseSpecificFiles`, `scanDirectories`, `scanByPatterns`, `buildStepCommitMessage`, `createInitCommitMessage`, `createCleanupCommitMessage`）

**見積もり**: 1時間

**依存関係**:
- Phase 1（FileSelector 実装）が完了している必要がある
- Phase 2（CommitMessageBuilder 実装）が完了している必要がある

### 10.4. Phase 4: FileSelector のユニットテスト実装（優先度: 高）

**タスク**:
1. `tests/unit/git/file-selector.test.ts` を作成
2. `getChangedFiles()` のテスト（正常系・境界値）
3. `filterPhaseFiles()` のテスト（正常系・異常系）
4. `getPhaseSpecificFiles()` のテスト（implementation, test_implementation, documentation）
5. `scanDirectories()` のテスト
6. `scanByPatterns()` のテスト（minimatch パターン検証）

**見積もり**: 1~1.5時間

### 10.5. Phase 5: CommitMessageBuilder のユニットテスト実装（優先度: 高）

**タスク**:
1. `tests/unit/git/commit-message-builder.test.ts` を作成
2. `createCommitMessage()` のテスト（既存テストからマイグレーション）
3. `buildStepCommitMessage()` のテスト（既存テストからマイグレーション）
4. `createInitCommitMessage()` のテスト（既存テストからマイグレーション）
5. `createCleanupCommitMessage()` のテスト（既存テストからマイグレーション）

**見積もり**: 0.5~1時間

### 10.6. Phase 6: CommitManager の委譲テスト実装（優先度: 高）

**タスク**:
1. `tests/unit/git/commit-manager.test.ts` のリファクタリング
2. `commitPhaseOutput()` の委譲検証テスト（モック使用）
3. `commitStepOutput()` の委譲検証テスト
4. 既存テストの整理（重複削除、委譲動作に焦点）

**見積もり**: 0.5~1時間

### 10.7. Phase 7: 統合テストの実行（優先度: 中）

**タスク**:
1. `npm run test:unit` の実行
2. `npm run test:integration` の実行
3. `step-commit-push.test.ts` の検証（後方互換性確認）
4. カバレッジ確認（目標: 90%以上）

**見積もり**: 0.5~1時間

### 10.8. Phase 8: ドキュメント更新（優先度: 中）

**タスク**:
1. `ARCHITECTURE.md` の更新
   - GitManager モジュール構成セクションの更新
   - CommitManager の責務記述を更新（3モジュール体制に変更）
   - FileSelector の責務追加
   - CommitMessageBuilder の責務追加
2. `CLAUDE.md` の更新
   - コアモジュールセクションの更新
   - commit-manager.ts の行数更新（586行 → 約200行）
   - file-selector.ts の追加（約150行）
   - commit-message-builder.ts の追加（約100行）
3. コードコメントの整理
   - FileSelector のJSDocコメント
   - CommitMessageBuilder のJSDocコメント
   - CommitManager の更新されたJSDocコメント

**見積もり**: 1~2時間

---

## 11. リスクと軽減策

### 11.1. リスク1: ファイル選択ロジックの抽出時のバグ混入

**影響度**: 中

**確率**: 低

**軽減策**:
1. 既存テストスイート（363行）を全て実行し、リグレッションを検出
2. FileSelector の単体テストで境界値テスト（`@tmp`除外、Issue番号フィルタリング）を徹底
3. minimatch パターンマッチングの挙動を既存テストで再現

**検証方法**:
- `tests/unit/git/file-selector.test.ts` で全メソッドをテスト
- `tests/integration/step-commit-push.test.ts` で統合動作を検証

### 11.2. リスク2: 委譲パターンのパフォーマンスオーバーヘッド

**影響度**: 低

**確率**: 低

**軽減策**:
1. 委譲オーバーヘッドはメソッド呼び出し1回のみ（無視可能）
2. Git操作（I/O）がボトルネックであり、委譲パターンの影響は0.1%未満と見込む
3. 統合テスト（`step-commit-push.test.ts`）でパフォーマンス劣化がないことを確認

**検証方法**:
- 統合テストで実行時間を計測
- リファクタリング前後で±5%以内の差であることを確認

### 11.3. リスク3: メッセージ生成ロジックのフォーマット変更

**影響度**: 低

**確率**: 極低

**軽減策**:
1. CommitMessageBuilder のテストで既存メッセージフォーマットを厳密に検証
2. `git log` の出力が既存コミットと一致することを目視確認
3. フォーマット文字列をコピー＆ペーストでミスを防止

**検証方法**:
- `tests/unit/git/commit-message-builder.test.ts` でフォーマット検証
- 既存の `commit-manager.test.ts` のメッセージ生成テストを移行

### 11.4. リスク4: 後方互換性の破壊

**影響度**: 高

**確率**: 極低

**軽減策**:
1. ファサードパターンにより公開APIを100%維持
2. git-manager.ts からの呼び出しインターフェースを変更しない
3. 既存の統合テスト（`step-commit-push.test.ts`）で後方互換性を検証

**検証方法**:
- 既存の全テストが成功することで後方互換性を保証
- git-manager.ts のコード変更が不要であることを確認

---

## 12. 品質ゲート（Phase 2）

設計書は以下の品質ゲートを満たしています：

- [x] **実装戦略の判断根拠が明記されている**
  - セクション2で **REFACTOR** と判断し、4つの理由を明記

- [x] **テスト戦略の判断根拠が明記されている**
  - セクション3で **UNIT_INTEGRATION** と判断し、3つの理由を明記

- [x] **テストコード戦略の判断根拠が明記されている**
  - セクション4で **BOTH_TEST** と判断し、3つの理由を明記

- [x] **既存コードへの影響範囲が分析されている**
  - セクション5で直接影響、間接影響、新規ファイル、テストファイル、依存関係の変更を分析

- [x] **変更が必要なファイルがリストアップされている**
  - セクション6で新規作成ファイル（4個）、修正が必要な既存ファイル（2個）、削除が必要なファイル（なし）をリスト化

- [x] **設計が実装可能である**
  - セクション7で FileSelector、CommitMessageBuilder、CommitManager の詳細設計を記載
  - セクション10で実装順序を8つのPhaseに分割し、依存関係を明示

---

## 13. 成功基準

このリファクタリングが成功したと判断する基準：

### 13.1. コード品質
- ✅ CommitManager が586行から約200行に削減される（66%削減）
- ✅ 単一責任の原則に準拠した3つのモジュールに分解される
- ✅ ESLint エラーなし、TypeScript コンパイルエラーなし

### 13.2. テストカバレッジ
- ✅ ユニットテストカバレッジ90%以上
- ✅ 全てのテストが成功（ユニット + 統合）
- ✅ 後方互換性が100%維持される

### 13.3. 保守性
- ✅ FileSelector と CommitMessageBuilder が独立してテスト可能
- ✅ 各モジュールが明確な責務を持つ
- ✅ 委譲パターンにより拡張が容易

### 13.4. ドキュメント
- ✅ ARCHITECTURE.md と CLAUDE.md が最新の構造を反映
- ✅ 全てのコードに適切なJSDocコメント

---

**設計書作成日**: 2025-01-31
**見積もり総工数**: 14~20時間
**想定期間**: 2~3日
**リスク評価**: 低
**後方互換性**: 100%維持
