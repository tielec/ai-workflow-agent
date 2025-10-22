# 詳細設計書 - Issue #54

## プロジェクト情報

- **Issue番号**: #54
- **タイトル**: バグ: metadata.jsonにGitHub Personal Access Tokenが含まれpush protectionで拒否される
- **重要度**: HIGH（セキュリティリスク）
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/54
- **Planning Phase確認**: 実施済み（planning.mdを参照）
- **Requirements Phase確認**: 実施済み（requirements.mdを参照）

---

## 0. Planning Document確認

Planning Phase（Phase 0）で策定された戦略を本設計に反映します：

### 実装戦略: EXTEND
既存コードの拡張を中心とした実装。新規ユーティリティファイル（`src/utils/git-url-utils.ts`）の作成と、既存ファイル（`src/commands/init.ts`、`src/core/secret-masker.ts`、`src/core/git/commit-manager.ts`）の修正。

### テスト戦略: UNIT_INTEGRATION
ユニットテスト（`sanitizeGitUrl()` 関数の純粋関数テスト）+ 統合テスト（`init` コマンド全体でのトークン除去フロー検証）。

### テストコード戦略: BOTH_TEST
新規テスト作成（`tests/unit/utils/git-url-utils.test.ts`）+ 既存テスト拡張（`tests/unit/commands/init.test.ts`、`tests/unit/secret-masker.test.ts`）。

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                       Issue #54 解決アーキテクチャ                  │
│                   (Defense in Depth - 多層防御)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  init コマンド   │ (src/commands/init.ts)
│  実行開始       │
└────────┬────────┘
         │
         │ (1) git remote get-url origin
         ▼
┌────────────────────────────────────────────────────────┐
│  Git Remote URL 取得                                    │
│  例: https://ghp_xxxxx@github.com/owner/repo.git       │
└────────┬───────────────────────────────────────────────┘
         │
         │ ★ 第1層防御: URLサニタイズ（新規実装）
         ▼
┌────────────────────────────────────────────────────────┐
│  sanitizeGitUrl() 関数                                  │
│  src/utils/git-url-utils.ts (新規ファイル)             │
│                                                         │
│  入力: https://ghp_xxxxx@github.com/owner/repo.git     │
│  出力: https://github.com/owner/repo.git               │
│                                                         │
│  - HTTPS認証情報を正規表現で除去                         │
│  - SSH形式は変更せずにそのまま返す                        │
└────────┬───────────────────────────────────────────────┘
         │
         │ (2) metadata.jsonに保存
         ▼
┌────────────────────────────────────────────────────────┐
│  metadata.json 作成                                     │
│  .ai-workflow/issue-<NUM>/metadata.json                 │
│                                                         │
│  target_repository: {                                   │
│    remote_url: "https://github.com/owner/repo.git"     │
│    (トークンは含まれない)                                │
│  }                                                      │
└────────┬───────────────────────────────────────────────┘
         │
         │ (3) commitWorkflowInit() 呼び出し
         ▼
┌────────────────────────────────────────────────────────┐
│  commitWorkflowInit()                                   │
│  src/core/git/commit-manager.ts (修正)                 │
│                                                         │
│  ★ 第2層防御: SecretMasker実行（追加実装）              │
└────────┬───────────────────────────────────────────────┘
         │
         │ (4) マスキング実行
         ▼
┌────────────────────────────────────────────────────────┐
│  SecretMasker.maskSecretsInWorkflowDir()                │
│  src/core/secret-masker.ts (拡張)                      │
│                                                         │
│  スキャン対象:                                           │
│  - agent_log_raw.txt                                   │
│  - agent_log.md                                        │
│  - prompt.txt                                          │
│  - metadata.json ★ 新規追加                            │
│                                                         │
│  GitHub Personal Access Token パターンを検出:           │
│  - ghp_xxxxxxxxxxxx                                    │
│  - github_pat_xxxxxxxxxxxx                             │
│  → [REDACTED_GITHUB_TOKEN] に置換                      │
└────────┬───────────────────────────────────────────────┘
         │
         │ (5) Git commit & push
         ▼
┌────────────────────────────────────────────────────────┐
│  Git コミット & プッシュ                                 │
│  ★ 第3層防御: GitHub Push Protection                   │
│                                                         │
│  第1層・第2層により、この層に到達しない                   │
└────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

```
src/commands/init.ts
  │
  ├─ import { sanitizeGitUrl } from '../utils/git-url-utils.js'
  │     │
  │     └─ src/utils/git-url-utils.ts (新規作成)
  │          - sanitizeGitUrl(url: string): string
  │
  ├─ new GitManager(repoRoot, metadataManager)
  │     │
  │     └─ src/core/git-manager.ts
  │          - commitWorkflowInit(issueNumber, branchName)
  │               │
  │               └─ src/core/git/commit-manager.ts (修正)
  │                    - commitWorkflowInit() メソッド修正
  │                    - マスキング実行を追加
  │                         │
  │                         └─ SecretMasker.maskSecretsInWorkflowDir()
  │                              │
  │                              └─ src/core/secret-masker.ts (拡張)
  │                                   - targetFilePatterns に 'metadata.json' 追加
  │
  └─ metadataManager.data.target_repository.remote_url = sanitizedUrl
```

### 1.3 データフロー

```
[1. Remote URL取得]
  git remote get-url origin
  ↓
  "https://ghp_xxxxxxxxxxxx@github.com/owner/repo.git"

[2. URLサニタイズ（第1層防御）]
  sanitizeGitUrl(remoteUrl)
  ↓
  "https://github.com/owner/repo.git"

[3. metadata.json保存]
  metadataManager.data.target_repository = {
    remote_url: "https://github.com/owner/repo.git"  // ← トークンなし
  }

[4. マスキング実行（第2層防御）]
  SecretMasker.maskSecretsInWorkflowDir(workflowDir)
  ↓
  metadata.json, agent_log_raw.txt 等をスキャン
  ↓
  トークンパターン検出 → [REDACTED_*] に置換

[5. Git commit & push]
  git commit → git push
  ↓
  GitHub Push Protection（第3層防御）
  → 第1層・第2層により、トークンは含まれない
  → push成功
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
1. **既存コードの拡張が中心**:
   - `src/commands/init.ts`: remote URL取得後にサニタイズ処理を追加（2箇所: 行192, 236付近）
   - `src/core/secret-masker.ts`: `targetFilePatterns` に `metadata.json` を追加（1行追加）
   - `src/core/git/commit-manager.ts`: `commitWorkflowInit()` メソッドにマスキング実行を追加（10行程度）

2. **新規作成は最小限**:
   - `src/utils/git-url-utils.ts`: URLサニタイゼーション関数（新規ユーティリティファイル、約50行）
   - 既存の `src/utils/` ディレクトリに配置し、既存パターンに従う

3. **既存アーキテクチャに従う**:
   - ユーティリティ関数は `src/utils/` に配置（既存: `resume.ts` と同様）
   - SecretMaskerの使用方法は既存コード（`commit-manager.ts` の他箇所）と同様
   - コミットフローは既存の `CommitManager` パターンに従う

4. **既存機能との統合度が高い**:
   - init コマンドの既存フローに自然に統合（新規コマンド作成ではない）
   - SecretMasker の既存機能を活用（新規マスキングロジック不要）
   - CommitManager の既存メソッドを拡張（新規メソッド追加ではない）

**CREATE（新規作成）ではない理由**:
- 既存ファイルへの影響範囲が大きい（3ファイル修正）
- 既存機能（SecretMasker、CommitManager）との統合が必須

**REFACTOR（リファクタリング）ではない理由**:
- 既存コードの構造改善が目的ではなく、新機能（URLサニタイズ）の追加が主目的
- 既存コードの動作を変更せず、セキュリティ機能を追加

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

### UNIT（ユニットテスト）の必要性:
1. **純粋関数のテスト**:
   - `sanitizeGitUrl()` 関数は外部依存がない純粋関数
   - 入力URLと出力URLの対応関係を明確にテスト可能
   - 正規表現の正確性を検証する必要がある

2. **テストケースの網羅性**:
   - HTTPS + トークン形式（`ghp_xxx`、`github_pat_xxx`）
   - HTTPS + ユーザー:パスワード形式
   - SSH形式（変更なし）
   - 通常HTTPS形式（変更なし）
   - エッジケース（空文字列、複数@記号、ポート番号付き等）

3. **高速フィードバック**:
   - 外部システム（Git、GitHub）に依存しないため、テスト実行が高速
   - 開発サイクルの短縮

### INTEGRATION（統合テスト）の必要性:
1. **エンドツーエンドフロー検証**:
   - init コマンド全体でトークン埋め込みURLを使用した場合の動作確認
   - metadata.json作成 → マスキング → コミット → push の一連のフローを検証

2. **実際のGit操作との統合**:
   - 実際のGitリポジトリ環境でのテスト
   - GitHub push protectionによる拒否が発生しないことを確認（ダミートークン使用）

3. **既存テストとの整合性**:
   - 既存の `tests/integration/custom-branch-workflow.test.ts` との互換性確認
   - 既存の `tests/unit/commands/init.test.ts` への影響確認

### BDD不要の理由:
- エンドユーザー向けの新機能ではなく、バグ修正（セキュリティ問題の解決）
- ユーザーストーリーベースのテストよりも、技術的な正確性を重視
- Given-When-Then形式は要件定義書の受け入れ基準（AC）で既に記述済み

### ALL（すべてのテスト）不要の理由:
- BDDテストが不要なため、UNIT + INTEGRATIONで十分

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:

### CREATE_TEST（新規テスト作成）の必要性:
1. **新規ユーティリティ関数のテスト**:
   - `tests/unit/utils/git-url-utils.test.ts`: `sanitizeGitUrl()` のユニットテスト（新規ファイル）
   - 独立したテストファイルが適切（既存テストファイルと関連性が低い）

2. **テストファイル構成の一貫性**:
   - 既存の `tests/unit/helpers/` ディレクトリ構成と同様
   - 各ユーティリティファイルごとに対応するテストファイルを作成

### EXTEND_TEST（既存テスト拡張）の必要性:
1. **init コマンドテストの拡張**:
   - `tests/unit/commands/init.test.ts`: 既存のinit コマンドテストにトークン埋め込みURLのテストケースを追加
   - 既存テストとの統合により、回帰テストを強化

2. **SecretMasker テストの拡張**:
   - `tests/unit/secret-masker.test.ts`: `metadata.json` スキャンのテストケースを追加
   - 既存のSecretMaskerテストと同じパターンでテスト追加

3. **統合テストの拡張**:
   - `tests/integration/custom-branch-workflow.test.ts`: トークン埋め込みURLでのワークフローテストを追加（または新規統合テストファイル作成）

### EXTEND_TEST_ONLY ではない理由:
- 新規ユーティリティ関数（`sanitizeGitUrl()`）は独立したテストファイルが適切
- 既存テストファイルに追加すると、テストファイルが肥大化し、保守性が低下

### CREATE_TEST_ONLY ではない理由:
- 既存機能（init コマンド、SecretMasker）の拡張部分は既存テストに追加することで、回帰テストを強化
- 既存テストとの整合性を保つ

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### 変更が必要なファイル（3ファイル）

##### 1. `src/commands/init.ts` (2箇所修正)

**修正箇所1: 行192付近（`resolveLocalRepoPath()` 内）**
```typescript
// 修正前
const remoteUrl = await git.remote(['get-url', 'origin']);
const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
metadataManager.data.target_repository = {
  path: repoRoot,
  github_name: repositoryName,
  remote_url: remoteUrlStr,
  owner: owner,
  repo: repo,
};

// 修正後
import { sanitizeGitUrl } from '../utils/git-url-utils.js';  // ← import追加

const remoteUrl = await git.remote(['get-url', 'origin']);
const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
const sanitizedUrl = sanitizeGitUrl(remoteUrlStr);  // ← サニタイズ追加

// トークン検出時の警告ログ
if (sanitizedUrl !== remoteUrlStr) {
  console.warn('[WARNING] GitHub Personal Access Token detected in remote URL. Token has been removed from metadata.');
  console.info(`[INFO] Original URL: ${remoteUrlStr.replace(/ghp_[a-zA-Z0-9]+|github_pat_[a-zA-Z0-9_]+/, '***')}`);
  console.info(`[INFO] Sanitized URL: ${sanitizedUrl}`);
}

metadataManager.data.target_repository = {
  path: repoRoot,
  github_name: repositoryName,
  remote_url: sanitizedUrl,  // ← サニタイズ済みURL
  owner: owner,
  repo: repo,
};
```

**修正箇所2: 行236付近（メタデータ保存前）**
```typescript
// 修正前
const remoteUrl = await git.remote(['get-url', 'origin']);
const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
metadataManager.data.target_repository = {
  path: repoRoot,
  github_name: repositoryName,
  remote_url: remoteUrlStr,
  owner: owner,
  repo: repo,
};

// 修正後（修正箇所1と同様のロジック）
const remoteUrl = await git.remote(['get-url', 'origin']);
const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
const sanitizedUrl = sanitizeGitUrl(remoteUrlStr);  // ← サニタイズ追加

if (sanitizedUrl !== remoteUrlStr) {
  console.warn('[WARNING] GitHub Personal Access Token detected in remote URL. Token has been removed from metadata.');
  console.info(`[INFO] Original URL: ${remoteUrlStr.replace(/ghp_[a-zA-Z0-9]+|github_pat_[a-zA-Z0-9_]+/, '***')}`);
  console.info(`[INFO] Sanitized URL: ${sanitizedUrl}`);
}

metadataManager.data.target_repository = {
  path: repoRoot,
  github_name: repositoryName,
  remote_url: sanitizedUrl,  // ← サニタイズ済みURL
  owner: owner,
  repo: repo,
};
```

**影響**: init コマンドの動作のみ（既存ワークフローには影響なし）

##### 2. `src/core/secret-masker.ts`

**修正箇所: targetFilePatterns 配列**
```typescript
// 修正前
private readonly targetFilePatterns = [
  'agent_log_raw.txt',
  'agent_log.md',
  'prompt.txt',
];

// 修正後
private readonly targetFilePatterns = [
  'agent_log_raw.txt',
  'agent_log.md',
  'prompt.txt',
  'metadata.json',  // ← 追加
];
```

**影響**: 既存のマスキング対象（agent_log等）には影響なし。metadata.jsonが追加スキャン対象になるのみ。

##### 3. `src/core/git/commit-manager.ts`

**修正箇所: `commitWorkflowInit()` メソッド**
```typescript
// 修正前
public async commitWorkflowInit(
  issueNumber: number,
  branchName: string,
): Promise<CommitResult> {
  // 1. Get changed files
  const changedFiles = await this.getChangedFiles();
  const targetFiles = this.filterPhaseFiles(changedFiles, issueNumber.toString());

  // 2. No files to commit
  if (targetFiles.length === 0) {
    console.warn('[WARNING] No files to commit for initialization');
    return {
      success: true,
      commit_hash: null,
      files_committed: [],
    };
  }

  // 3. Stage files
  await this.git.add(targetFiles);

  // 4. Ensure git config
  await this.ensureGitConfig();

  // 5. Generate commit message
  const message = this.createInitCommitMessage(issueNumber, branchName);

  // 6. Create commit
  try {
    const commitResponse = await this.git.commit(message, targetFiles, {
      '--no-verify': null,
    });

    console.info(`[INFO] Initialization commit created: ${commitResponse.commit ?? 'unknown'}`);

    return {
      success: true,
      commit_hash: commitResponse.commit ?? null,
      files_committed: targetFiles,
    };
  } catch (error) {
    console.error(`[ERROR] Initialization commit failed: ${(error as Error).message}`);
    return {
      success: false,
      commit_hash: null,
      files_committed: targetFiles,
      error: `Initialization commit failed: ${(error as Error).message}`,
    };
  }
}

// 修正後
public async commitWorkflowInit(
  issueNumber: number,
  branchName: string,
): Promise<CommitResult> {
  // 1. Get changed files
  const changedFiles = await this.getChangedFiles();
  const targetFiles = this.filterPhaseFiles(changedFiles, issueNumber.toString());

  // 2. No files to commit
  if (targetFiles.length === 0) {
    console.warn('[WARNING] No files to commit for initialization');
    return {
      success: true,
      commit_hash: null,
      files_committed: [],
    };
  }

  // ★ Issue #54: Mask secrets in metadata.json before commit
  const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
  try {
    const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
    if (maskingResult.filesProcessed > 0) {
      console.info(
        `[INFO] Masked ${maskingResult.secretsMasked} secret(s) in ${maskingResult.filesProcessed} file(s)`,
      );
    }
    if (maskingResult.errors.length > 0) {
      console.error(
        `[ERROR] Secret masking encountered ${maskingResult.errors.length} error(s)`,
      );
      throw new Error('Cannot commit metadata.json with unmasked secrets');
    }
  } catch (error) {
    console.error(`[ERROR] Secret masking failed: ${(error as Error).message}`);
    throw new Error('Cannot commit metadata.json with unmasked secrets');
  }

  // 3. Stage files
  await this.git.add(targetFiles);

  // 4. Ensure git config
  await this.ensureGitConfig();

  // 5. Generate commit message
  const message = this.createInitCommitMessage(issueNumber, branchName);

  // 6. Create commit
  try {
    const commitResponse = await this.git.commit(message, targetFiles, {
      '--no-verify': null,
    });

    console.info(`[INFO] Initialization commit created: ${commitResponse.commit ?? 'unknown'}`);

    return {
      success: true,
      commit_hash: commitResponse.commit ?? null,
      files_committed: targetFiles,
    };
  } catch (error) {
    console.error(`[ERROR] Initialization commit failed: ${(error as Error).message}`);
    return {
      success: false,
      commit_hash: null,
      files_committed: targetFiles,
      error: `Initialization commit failed: ${(error as Error).message}`,
    };
  }
}
```

**影響**: init時のコミットフローのみ（他のコミット処理には影響なし）

**注意**: 既存の `commitPhaseOutput()` や `commitStepOutput()` メソッドは、既にSecretMaskerを実行しているため、変更不要。

### 5.2 新規作成ファイル（1ファイル）

#### 1. `src/utils/git-url-utils.ts`

**役割**: Git remote URLからHTTPS認証情報（トークン、ユーザー名・パスワード）を除去する純粋関数を提供。

**既存コードへの影響**: なし（新規ユーティリティ）

**import関係**:
- `src/commands/init.ts` → `src/utils/git-url-utils.ts` (新規import)

---

### 5.3 依存関係の変更

#### 新規依存の追加: なし
- 標準ライブラリのみ使用（正規表現）
- package.jsonへの追加不要

#### 既存依存の変更: なし

#### 内部依存の追加:
- `src/commands/init.ts` → `src/utils/git-url-utils.ts` (新規import)

---

### 5.4 マイグレーション要否

**不要**

**理由**:
- 既存の `metadata.json` には影響しない（過去に作成されたワークフローは変更なし）
- 新規 `init` コマンド実行時のみ適用される
- データベーススキーマ変更なし
- 設定ファイル変更なし

**注意点**:
- 既存ワークフローで過去にトークンが保存されている場合、手動でトークンを削除する必要がある
- この対応は本Issue範囲外（TROUBLESHOOTING.mdに記載）

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

```
src/utils/git-url-utils.ts                    # URLサニタイゼーション関数
tests/unit/utils/git-url-utils.test.ts        # ユニットテスト
```

### 6.2 修正が必要な既存ファイル

```
src/commands/init.ts                          # remote URLサニタイズ適用（2箇所）
src/core/secret-masker.ts                     # metadata.jsonをスキャン対象に追加
src/core/git/commit-manager.ts                # commitWorkflowInitでマスキング実行
tests/unit/commands/init.test.ts              # トークン埋め込みURLのテスト追加
tests/unit/secret-masker.test.ts              # metadata.jsonスキャンのテスト追加
```

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 関数設計

#### 7.1.1 `sanitizeGitUrl()` 関数（新規作成）

**ファイル**: `src/utils/git-url-utils.ts`

**シグネチャ**:
```typescript
export function sanitizeGitUrl(url: string): string
```

**目的**: Git remote URLからHTTPS認証情報（トークン、ユーザー名・パスワード）を除去する。

**入出力仕様**:

| 入力形式 | 例 | 出力 | 理由 |
|---------|---|------|------|
| HTTPS + トークン | `https://ghp_xxxxx@github.com/owner/repo.git` | `https://github.com/owner/repo.git` | トークン除去 |
| HTTPS + ユーザー:パスワード | `https://user:pass@github.com/owner/repo.git` | `https://github.com/owner/repo.git` | 認証情報除去 |
| SSH形式 | `git@github.com:owner/repo.git` | `git@github.com:owner/repo.git` | 変更なし |
| 通常HTTPS | `https://github.com/owner/repo.git` | `https://github.com/owner/repo.git` | 変更なし |
| ポート番号付きHTTPS | `https://token@github.com:443/owner/repo.git` | `https://github.com:443/owner/repo.git` | トークン除去 |
| 空文字列 | `""` | `""` | フェイルセーフ |
| null/undefined | `null` | `null` | フェイルセーフ |

**アルゴリズム**:

```
1. 入力URLが空文字列、null、undefinedの場合:
   - そのまま返す（フェイルセーフ）

2. HTTPS形式の認証情報検出（正規表現）:
   - パターン: ^(https?:\/\/)([^@]+@)?(.+)$
   - 例: https://token@github.com/owner/repo.git
     → グループ1: "https://"
     → グループ2: "token@" (認証情報)
     → グループ3: "github.com/owner/repo.git"

3. マッチした場合:
   - グループ1（プロトコル）+ グループ3（ホスト＋パス）を結合
   - 例: "https://" + "github.com/owner/repo.git"
   → "https://github.com/owner/repo.git"

4. マッチしない場合（SSH形式、通常HTTPS等）:
   - 元のURLをそのまま返す
```

**実装例**:
```typescript
/**
 * Git remote URLからHTTPS認証情報（トークン、ユーザー名・パスワード）を除去
 *
 * @param url - Git remote URL
 * @returns サニタイズ済みURL
 *
 * @example
 * sanitizeGitUrl('https://ghp_xxxxx@github.com/owner/repo.git')
 * // => 'https://github.com/owner/repo.git'
 *
 * @example
 * sanitizeGitUrl('https://user:pass@github.com/owner/repo.git')
 * // => 'https://github.com/owner/repo.git'
 *
 * @example
 * sanitizeGitUrl('git@github.com:owner/repo.git')
 * // => 'git@github.com:owner/repo.git' (変更なし)
 */
export function sanitizeGitUrl(url: string): string {
  // 1. 空文字列、null、undefinedチェック（フェイルセーフ）
  if (!url || url.trim() === '') {
    return url;
  }

  // 2. HTTPS形式の認証情報を除去
  // パターン: https://[user[:pass]@]host/path
  const httpsPattern = /^(https?:\/\/)([^@]+@)?(.+)$/;
  const match = url.match(httpsPattern);

  if (match) {
    // グループ2（認証情報@）が存在する場合のみ除去
    if (match[2]) {
      const [, protocol, , rest] = match;
      return `${protocol}${rest}`;
    }
  }

  // 3. SSH形式やその他はそのまま返す
  return url;
}
```

**エラーハンドリング**:
- 例外をスローしない（フェイルセーフ動作）
- 不明な形式の場合は元のURLをそのまま返す

**テストケース**（詳細は7.3参照）:
- HTTPS + トークン（`ghp_xxx`、`github_pat_xxx`）
- HTTPS + ユーザー:パスワード
- SSH形式
- 通常HTTPS
- ポート番号付き
- エッジケース（空文字列、複数@、不正URL等）

---

#### 7.1.2 `commitWorkflowInit()` メソッド修正（既存コード拡張）

**ファイル**: `src/core/git/commit-manager.ts`

**既存機能**: ワークフロー初期化時のコミット作成

**追加機能**: コミット前に `SecretMasker.maskSecretsInWorkflowDir()` を実行し、metadata.json内のトークンをマスキング

**修正内容**:

```typescript
// ステップ2.5を追加（既存ステップ2と3の間）
// 2.5. Issue #54: Mask secrets in metadata.json before commit
const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
try {
  const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
  if (maskingResult.filesProcessed > 0) {
    console.info(
      `[INFO] Masked ${maskingResult.secretsMasked} secret(s) in ${maskingResult.filesProcessed} file(s)`,
    );
  }
  if (maskingResult.errors.length > 0) {
    console.error(
      `[ERROR] Secret masking encountered ${maskingResult.errors.length} error(s)`,
    );
    throw new Error('Cannot commit metadata.json with unmasked secrets');
  }
} catch (error) {
  console.error(`[ERROR] Secret masking failed: ${(error as Error).message}`);
  throw new Error('Cannot commit metadata.json with unmasked secrets');
}
```

**エラーハンドリング**:
- マスキング失敗時は致命的エラーとして扱う（エラーをスロー）
- コミットを中断し、トークン漏洩を防ぐ

**ログ出力**:
- マスク件数を表示（`secretsMasked > 0` の場合）
- 例: `[INFO] Masked 1 secret(s) in 1 file(s)`

---

### 7.2 データ構造設計

#### 7.2.1 `metadata.json` 構造（変更なし）

```typescript
interface TargetRepository {
  path: string;           // ローカルリポジトリパス
  github_name: string;    // owner/repo形式
  remote_url: string;     // ★ サニタイズ済みURL（トークンなし）
  owner: string;          // リポジトリオーナー
  repo: string;           // リポジトリ名
}

interface WorkflowState {
  target_repository: TargetRepository;
  // ... その他のフィールド
}
```

**変更点**: `remote_url` フィールドに保存される値がサニタイズ済みになる（構造変更なし）

---

### 7.3 テスト設計

#### 7.3.1 ユニットテスト: `tests/unit/utils/git-url-utils.test.ts`（新規作成）

**テストスイート構成**:

```typescript
describe('sanitizeGitUrl', () => {
  describe('正常系: HTTPS形式のURL', () => {
    test('HTTPS + ghp_トークン形式からトークンを除去');
    test('HTTPS + github_pat_トークン形式からトークンを除去');
    test('HTTPS + ユーザー:パスワード形式から認証情報を除去');
    test('ポート番号付きHTTPS + トークン形式からトークンを除去');
  });

  describe('正常系: その他の形式（変更なし）', () => {
    test('SSH形式はそのまま返す');
    test('通常のHTTPS形式（認証情報なし）はそのまま返す');
    test('HTTPSポート番号付き（認証情報なし）はそのまま返す');
  });

  describe('エッジケース', () => {
    test('空文字列はそのまま返す');
    test('null/undefinedはそのまま返す');
    test('複数の@記号を含むURL（例: user@domain@host）');
    test('不正なURL形式でもエラーをスローしない');
  });

  describe('GitHub以外のGitホスト', () => {
    test('GitLab HTTPS + トークン形式からトークンを除去');
    test('Bitbucket HTTPS + トークン形式からトークンを除去');
  });
});
```

**主要テストケース**:

```typescript
// TC-1: HTTPS + ghp_トークン形式
test('HTTPS + ghp_トークン形式からトークンを除去', () => {
  const input = 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git';
  const expected = 'https://github.com/tielec/ai-workflow-agent.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(expected);
});

// TC-2: HTTPS + github_pat_トークン形式
test('HTTPS + github_pat_トークン形式からトークンを除去', () => {
  const input = 'https://github_pat_1234567890abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git';
  const expected = 'https://github.com/owner/repo.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(expected);
});

// TC-3: HTTPS + ユーザー:パスワード形式
test('HTTPS + ユーザー:パスワード形式から認証情報を除去', () => {
  const input = 'https://username:password123@github.com/owner/repo.git';
  const expected = 'https://github.com/owner/repo.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(expected);
});

// TC-4: SSH形式（変更なし）
test('SSH形式はそのまま返す', () => {
  const input = 'git@github.com:tielec/ai-workflow-agent.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(input);
});

// TC-5: 通常HTTPS（変更なし）
test('通常のHTTPS形式（認証情報なし）はそのまま返す', () => {
  const input = 'https://github.com/tielec/ai-workflow-agent.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(input);
});

// TC-6: ポート番号付きHTTPS + トークン
test('ポート番号付きHTTPS + トークン形式からトークンを除去', () => {
  const input = 'https://ghp_token123@github.com:443/owner/repo.git';
  const expected = 'https://github.com:443/owner/repo.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(expected);
});

// TC-7: 空文字列（フェイルセーフ）
test('空文字列はそのまま返す', () => {
  const input = '';

  const result = sanitizeGitUrl(input);

  expect(result).toBe('');
});
```

**カバレッジ目標**: 100%（純粋関数のため達成可能）

---

#### 7.3.2 既存テスト拡張: `tests/unit/commands/init.test.ts`

**追加テストケース**:

```typescript
describe('handleInitCommand - トークン埋め込みURL対応', () => {
  test('HTTPS + トークン形式のremote URLをサニタイズしてmetadata.jsonに保存', async () => {
    // Given: HTTPS + トークン形式のリポジトリ
    // (テスト用のGitリポジトリをモック)

    // When: init コマンド実行

    // Then: metadata.jsonにサニタイズ済みURLが保存される
    // expect(metadata.target_repository.remote_url).toBe('https://github.com/owner/repo.git');
  });

  test('トークン検出時に警告ログが出力される', async () => {
    // Given: HTTPS + トークン形式のリポジトリ

    // When: init コマンド実行

    // Then: 警告ログが出力される
    // expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('GitHub Personal Access Token detected'));
  });
});
```

**注意**: 既存テストの回帰テスト確認も実施

---

#### 7.3.3 既存テスト拡張: `tests/unit/secret-masker.test.ts`

**追加テストケース**:

```typescript
describe('SecretMaskerファイル処理テスト - metadata.json対応', () => {
  test('metadata.json内のGitHub Personal Access Tokenをマスキング', async () => {
    // Given: トークンを含むmetadata.json
    process.env.GITHUB_TOKEN = 'ghp_secret123456789';
    const metadataFile = path.join(workflowDir, 'metadata.json');
    await fs.ensureDir(path.dirname(metadataFile));
    await fs.writeFile(
      metadataFile,
      JSON.stringify({
        target_repository: {
          remote_url: 'https://ghp_secret123456789@github.com/owner/repo.git'
        }
      }),
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: metadata.json内のトークンがマスキングされる
    expect(result.filesProcessed).toBe(1);
    expect(result.secretsMasked).toBeGreaterThan(0);

    const content = await fs.readFile(metadataFile, 'utf-8');
    expect(content.includes('[REDACTED_GITHUB_TOKEN]')).toBeTruthy();
    expect(!content.includes('ghp_secret123456789')).toBeTruthy();
  });
});
```

---

#### 7.3.4 統合テスト（新規または既存拡張）

**新規ファイル候補**: `tests/integration/init-token-sanitization.test.ts`

**または既存拡張**: `tests/integration/custom-branch-workflow.test.ts`

**テストシナリオ**:

```typescript
describe('init コマンド - トークン埋め込みURL対応（統合テスト）', () => {
  test('E2E: トークン埋め込みURLでinit実行 → metadata.jsonにトークンが含まれない', async () => {
    // Given: HTTPS + トークン形式でクローンされたリポジトリ（テスト用モック）
    // 1. テスト用の一時Gitリポジトリを作成
    // 2. remote URLにダミートークンを設定
    //    git remote set-url origin https://ghp_dummy123456789@github.com/owner/repo.git

    // When: init コマンド実行
    // await handleInitCommand('https://github.com/owner/repo/issues/1');

    // Then:
    // 1. metadata.jsonが作成される
    // 2. target_repository.remote_urlにトークンが含まれない
    // 3. SecretMaskerがmetadata.jsonをスキャンする
    // 4. commitWorkflowInitが成功する
  });

  test('E2E: GitHub push protectionが発動しない', async () => {
    // Given: トークン埋め込みURLでinit実行

    // When: git push実行

    // Then: push成功（GH013エラーが発生しない）
    // ※ 実環境テストは困難なため、ダミートークンでのテストのみ
  });
});
```

**注意**:
- 実際のGitHub push protectionテストは、実環境でのみ可能
- CI環境ではダミートークン（`ghp_dummy123456789`）を使用

---

### 7.4 インターフェース設計

#### 7.4.1 エクスポートインターフェース

**`src/utils/git-url-utils.ts`**:
```typescript
export function sanitizeGitUrl(url: string): string;
```

**`src/core/secret-masker.ts`**（変更なし）:
```typescript
export class SecretMasker {
  public async maskSecretsInWorkflowDir(workflowDir: string): Promise<MaskingResult>;
}
```

**`src/core/git/commit-manager.ts`**（シグネチャ変更なし）:
```typescript
export class CommitManager {
  public async commitWorkflowInit(issueNumber: number, branchName: string): Promise<CommitResult>;
}
```

---

## 8. セキュリティ考慮事項

### 8.1 Defense in Depth（多層防御）パターン

#### 第1層: URLサニタイズ（`sanitizeGitUrl()`）
- **目的**: 根本原因を解決（トークンがmetadataに含まれない）
- **実装**: 正規表現によるHTTPS認証情報除去
- **失敗時**: 第2層（SecretMasker）でカバー

#### 第2層: SecretMasker（`metadata.json` スキャン）
- **目的**: 万が一URLサニタイズが失敗しても、コミット前にマスク
- **実装**: `metadata.json` をスキャン対象に追加
- **失敗時**: 第3層（GitHub Push Protection）でカバー

#### 第3層: GitHub Push Protection
- **目的**: 最終防衛ライン
- **実装**: GitHub側の機能（本Issueでは第1・第2層を追加することで、この層まで到達しない）

### 8.2 正規表現の安全性

#### ReDoS（Regular Expression Denial of Service）対策

**使用する正規表現**: `/^(https?:\/\/)([^@]+@)?(.+)$/`

**ReDoS脆弱性の評価**:
- ✅ バックトラッキングが少ない（`[^@]+` は否定文字クラス）
- ✅ ネストした繰り返しなし
- ✅ 入力長に対して線形時間（O(n)）で処理

**テスト**:
- 10,000文字のURL入力でもタイムアウトしないことを確認

#### 誤検出（False Positive）対策

**誤って除去しないケース**:
- SSH形式（`git@github.com:owner/repo.git`）
  - 正規表現がマッチしないため、そのまま返される
- 通常HTTPS形式（`https://github.com/owner/repo.git`）
  - グループ2（認証情報@）が存在しないため、そのまま返される

**保守的な設計**:
- 不明な形式の場合は元のURLをそのまま返す（フェイルセーフ）

### 8.3 マスキング失敗時のエラーハンドリング

**`commitWorkflowInit()` のエラーハンドリング**:

```typescript
try {
  const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
  if (maskingResult.errors.length > 0) {
    console.error(`[ERROR] Secret masking encountered ${maskingResult.errors.length} error(s)`);
    throw new Error('Cannot commit metadata.json with unmasked secrets');
  }
} catch (error) {
  console.error(`[ERROR] Secret masking failed: ${(error as Error).message}`);
  throw new Error('Cannot commit metadata.json with unmasked secrets');
}
```

**方針**:
- マスキング失敗は致命的エラーとして扱う
- コミットを中断し、トークン漏洩を防ぐ
- ユーザーに明確なエラーメッセージを提示

### 8.4 トークン検出時の警告ログ

**`init.ts` のログ出力**:

```typescript
if (sanitizedUrl !== remoteUrlStr) {
  console.warn('[WARNING] GitHub Personal Access Token detected in remote URL. Token has been removed from metadata.');
  console.info(`[INFO] Original URL: ${remoteUrlStr.replace(/ghp_[a-zA-Z0-9]+|github_pat_[a-zA-Z0-9_]+/, '***')}`);
  console.info(`[INFO] Sanitized URL: ${sanitizedUrl}`);
}
```

**注意点**:
- ログにトークン全体を出力しない（`***` でマスク）
- ユーザーにトークン検出を通知し、セキュリティ意識を高める

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

#### URLサニタイズ処理

**要件**: 10ms以内で完了すること（NFR-2.1）

**実装**:
- 純粋関数（外部I/O不要）
- 正規表現マッチングのみ
- 想定処理時間: 1ms未満

**測定方法**:
```typescript
const start = performance.now();
const result = sanitizeGitUrl(url);
const end = performance.now();
console.info(`[PERF] sanitizeGitUrl: ${end - start}ms`);
```

#### SecretMaskerのmetadata.jsonスキャン

**要件**: 50ms以内で完了すること（NFR-2.1）

**実装**:
- metadata.jsonは数KB程度の小さいファイル
- 既存のSecretMasker実装（最適化済み）を活用

**想定処理時間**: 10ms未満（ファイルI/O含む）

### 9.2 保守性・拡張性

#### コードの可読性（NFR-3.1）

**実装**:
- JSDoc形式のドキュメント（`sanitizeGitUrl()` 関数）
- 正規表現にコメントで意図を説明
- 明確な変数名（`sanitizedUrl`、`remoteUrlStr` 等）

**例**:
```typescript
/**
 * Git remote URLからHTTPS認証情報（トークン、ユーザー名・パスワード）を除去
 *
 * @param url - Git remote URL
 * @returns サニタイズ済みURL
 *
 * @example
 * sanitizeGitUrl('https://ghp_xxxxx@github.com/owner/repo.git')
 * // => 'https://github.com/owner/repo.git'
 */
export function sanitizeGitUrl(url: string): string {
  // HTTPS形式の認証情報を除去: https://[user[:pass]@]host/path
  const httpsPattern = /^(https?:\/\/)([^@]+@)?(.+)$/;
  // ...
}
```

#### テスト容易性（NFR-3.2）

**実装**:
- `sanitizeGitUrl()` は純粋関数（外部依存なし）
- ユニットテストが容易
- エッジケースを網羅したテストスイート

#### 拡張性（NFR-3.3）

**実装**:
- 新しいGitホスト（GitLab、Bitbucket等）への対応が容易
  - 正規表現パターンは汎用的（ホスト名に依存しない）
- 正規表現パターンの追加・修正が容易
  - 単一ファイル（`git-url-utils.ts`）に集約

### 9.3 可用性・信頼性

#### エラーハンドリング（NFR-4.1）

**実装**:
- 異常入力（null、undefined、空文字列）に対してもエラーをスローせず、フェイルセーフ動作
- マスキング失敗時は致命的エラーとして扱い、トークン漏洩を防ぐ

**例**:
```typescript
// フェイルセーフ
if (!url || url.trim() === '') {
  return url;  // エラーをスローせず、元の値を返す
}

// 致命的エラー（マスキング失敗）
if (maskingResult.errors.length > 0) {
  throw new Error('Cannot commit metadata.json with unmasked secrets');
}
```

#### 後方互換性（NFR-4.2）

**実装**:
- 既存のワークフロー（過去に作成された `.ai-workflow/issue-*/metadata.json`）には影響しない
- 新規 `init` コマンド実行時のみ適用

**注意**:
- 既存metadata.jsonにトークンが含まれる場合は、手動で修正が必要
- TROUBLESHOOTING.mdに対応方法を記載

---

## 10. 実装の順序

### 推奨実装順序（依存関係考慮）

#### Phase 1: 基盤準備（見積もり: 1~1.5h）

**タスク 1-1**: `src/utils/git-url-utils.ts` の実装
- `sanitizeGitUrl()` 関数実装
- HTTPS認証情報除去ロジック（正規表現）
- JSDocコメント追加
- フェイルセーフ処理

**成果物**:
- `src/utils/git-url-utils.ts`（約50行）

**完了条件**:
- TypeScriptコンパイルが通る
- eslintチェックが通る

---

#### Phase 2: ユニットテスト実装（見積もり: 1~1.5h）

**タスク 2-1**: `tests/unit/utils/git-url-utils.test.ts` の実装
- HTTPS + トークン形式のテスト実装（`ghp_xxx`, `github_pat_xxx`）
- HTTPS + ユーザー:パスワード形式のテスト実装
- SSH形式のテスト実装（変更なし確認）
- 通常HTTPS形式のテスト実装（変更なし確認）
- エッジケーステスト実装（空文字列、複数@、ポート番号等）

**成果物**:
- `tests/unit/utils/git-url-utils.test.ts`（約150行）

**完了条件**:
- すべてのユニットテストが合格（`npm run test:unit`）
- カバレッジが100%

---

#### Phase 3: init.ts修正（見積もり: 1~1.5h）

**タスク 3-1**: `src/commands/init.ts` の修正
- import追加（`sanitizeGitUrl`）
- 行192付近のremote URL取得後にサニタイズ追加
- 行236付近のメタデータ保存前にサニタイズ追加
- デバッグログ追加（サニタイズ前後のURL比較、トークン検出時の警告）

**成果物**:
- 修正済み `src/commands/init.ts`（+約20行）

**完了条件**:
- TypeScriptコンパイルが通る
- eslintチェックが通る
- 既存のユニットテストが通る（`tests/unit/commands/init.test.ts`）

---

#### Phase 4: SecretMaskerの拡張（見積もり: 0.5h）

**タスク 4-1**: `src/core/secret-masker.ts` の修正
- `targetFilePatterns` に `metadata.json` 追加（1行）

**成果物**:
- 修正済み `src/core/secret-masker.ts`（+1行）

**完了条件**:
- TypeScriptコンパイルが通る
- 既存のユニットテストが通る（`tests/unit/secret-masker.test.ts`）

---

#### Phase 5: commitWorkflowInitの修正（見積もり: 0.5~1h）

**タスク 5-1**: `src/core/git/commit-manager.ts` の修正
- `commitWorkflowInit()` メソッドにマスキング実行を追加
- マスキング結果のログ出力
- マスキング失敗時のエラースロー

**成果物**:
- 修正済み `src/core/git/commit-manager.ts`（+約15行）

**完了条件**:
- TypeScriptコンパイルが通る
- eslintチェックが通る
- 既存のユニットテストが通る（`tests/unit/git/commit-manager.test.ts`）

---

#### Phase 6: 既存テスト拡張（見積もり: 0.5h）

**タスク 6-1**: `tests/unit/commands/init.test.ts` の拡張
- トークン埋め込みURLのテストケース追加

**タスク 6-2**: `tests/unit/secret-masker.test.ts` の拡張
- metadata.jsonスキャンのテストケース追加

**成果物**:
- 修正済み `tests/unit/commands/init.test.ts`（+約30行）
- 修正済み `tests/unit/secret-masker.test.ts`（+約30行）

**完了条件**:
- すべてのユニットテストが合格（`npm run test:unit`）

---

#### Phase 7: 統合テスト（見積もり: 0.5~1h）

**タスク 7-1**: 統合テストの追加または既存拡張
- トークン埋め込みURLでのinit実行テスト
- metadata.json検証（トークン除去確認）

**成果物**:
- 新規または修正済み統合テストファイル（約50行）

**完了条件**:
- すべての統合テストが合格（`npm run test:integration`）

---

#### Phase 8: 全体テスト実行（見積もり: 0.25~0.5h）

**タスク 8-1**: 全テスト実行
- `npm run test:unit` 実行
- `npm run test:integration` 実行（統合テストが存在する場合）
- カバレッジ確認

**完了条件**:
- すべてのテストが合格
- 新規コードのカバレッジが100%（ユニットテスト）

---

### 依存関係グラフ

```
Phase 1 (git-url-utils.ts実装)
  ↓
Phase 2 (ユニットテスト実装)
  ↓
Phase 3 (init.ts修正)
  ↓
  ├─ Phase 4 (SecretMasker拡張)
  └─ Phase 5 (commitWorkflowInit修正)
       ↓
Phase 6 (既存テスト拡張)
  ↓
Phase 7 (統合テスト)
  ↓
Phase 8 (全体テスト実行)
```

**注意**:
- Phase 4 と Phase 5 は並行実装可能（依存関係なし）
- Phase 3 完了後、Phase 4 と Phase 5 を同時に開始可能

---

## 11. リスク管理

### リスク1: Git URL形式の多様性

**影響度**: 中
**確率**: 中

**詳細**:
GitHub以外のGitホスト（GitLab、Bitbucket等）、異なるURL形式（ポート番号付き、サブドメイン等）に対応できない可能性

**軽減策**:
1. **Phase 1（要件定義）で幅広いURL形式をリストアップ**
   - GitHub、GitLab、Bitbucket等の主要ホスト
   - ポート番号付き、サブドメイン等のエッジケース

2. **正規表現を保守的に設計**
   - 誤って必要な情報を削除しない
   - 不明な形式の場合は元のURLをそのまま返す（フェイルセーフ）

3. **ユニットテストでエッジケースを網羅**
   - GitHub以外のホスト（GitLab、Bitbucket）のテスト
   - ポート番号付き、複数@記号等のテスト

**残存リスク**: 極めて特殊なURL形式（独自Gitサーバー等）では機能しない可能性あり（ただし、フェイルセーフにより元のURLを保持）

---

### リスク2: 正規表現の誤検出・見逃し

**影響度**: 高（セキュリティリスク）
**確率**: 低

**詳細**:
正規表現が複雑化し、トークンを誤って除去しない、または正常な文字列を誤って除去する

**軽減策**:
1. **シンプルで保守的な正規表現を使用**
   - パターン: `/^(https?:\/\/)([^@]+@)?(.+)$/`
   - 複雑なネストを避ける

2. **包括的なユニットテストでパターンを検証**
   - 正常系（トークン除去）
   - 異常系（SSH、通常HTTPS）
   - エッジケース（空文字列、複数@等）

3. **Phase 2でレビューを実施**
   - 正規表現の妥当性を確認
   - ReDoS脆弱性チェック

4. **SecretMaskerによる二重チェック（Defense in Depth）**
   - 万が一正規表現で見逃しても、SecretMaskerがカバー

**残存リスク**: 極めて特殊なトークン形式（GitHub以外の独自パターン）は検出できない可能性あり（ただし、SecretMaskerでカバー）

---

### リスク3: 既存ワークフローへの影響

**影響度**: 低
**確率**: 低

**詳細**:
既存の `.ai-workflow/issue-*/metadata.json` に過去保存されたトークンは修正されない

**軽減策**:
1. **本修正は新規init時のみ適用されることを明確化**
   - ドキュメント（CLAUDE.md、README.md）に記載

2. **ドキュメント（TROUBLESHOOTING.md）に既存ワークフローの対応方法を記載**
   - 手動でトークンを削除する手順
   - git filter-branchによる履歴書き換え（慎重に実施）

3. **統合テストで既存ワークフローが影響を受けないことを確認**
   - 既存metadata.jsonのタイムスタンプが変更されないことを確認

**残存リスク**: 既存ワークフローでトークンが保存されている場合、手動対応が必要（本Issue範囲外）

---

### リスク4: SecretMaskerのパフォーマンス影響

**影響度**: 低
**確率**: 低

**詳細**:
metadata.jsonを毎回スキャンすることでinit時のパフォーマンスが低下する可能性

**軽減策**:
1. **metadata.jsonは小さいファイル（数KB）のため、実質的な影響は軽微**
   - 想定スキャン時間: 10ms未満

2. **必要に応じてベンチマーク測定**
   - `performance.now()` でスキャン時間を測定
   - 50ms以内の目標値を確認

3. **マスキング処理はすでに最適化されている（既存実装を活用）**
   - 既存のSecretMasker実装を再利用

**残存リスク**: 特になし（測定により問題ないことを確認）

---

### リスク5: テスト環境でのトークン埋め込み

**影響度**: 中
**確率**: 低

**詳細**:
統合テストで実際のトークンを使用してしまうリスク

**軽減策**:
1. **テストではダミートークン（`ghp_dummy123456789abcdef`）を使用**
   - 実際のトークンを使用しない

2. **テスト用の一時リポジトリを作成（実リポジトリを使用しない）**
   - fs-extraによる一時ディレクトリ作成

3. **CI環境でのシークレット管理を徹底**
   - GitHub Secretsを使用
   - テスト環境でのトークン露出を防ぐ

**残存リスク**: 特になし（テストコードレビューで確認）

---

## 12. 品質ゲート（Phase 2）

本設計書は、以下の品質ゲートを満たしています：

### ✅ QG-1: 実装戦略の判断根拠が明記されている

**実装戦略**: EXTEND（既存コードの拡張が中心）

**判断根拠**:
1. 既存コードの拡張が中心（`init.ts`、`secret-masker.ts`、`commit-manager.ts`）
2. 新規作成は最小限（`git-url-utils.ts` のみ）
3. 既存アーキテクチャに従う（`src/utils/` ディレクトリ構成）
4. 既存機能との統合度が高い（SecretMasker、CommitManager活用）

---

### ✅ QG-2: テスト戦略の判断根拠が明記されている

**テスト戦略**: UNIT_INTEGRATION（ユニット + 統合）

**判断根拠**:
1. **UNIT**: `sanitizeGitUrl()` は純粋関数で外部依存なし、様々なURL形式のテストが必要
2. **INTEGRATION**: init コマンド全体でトークン除去フローを検証（metadata.json作成→マスキング→コミット）
3. **BDD不要**: エンドユーザー向けの新機能ではなく、バグ修正（セキュリティ問題の解決）

**テストコード戦略**: BOTH_TEST（新規作成 + 既存拡張）

**判断根拠**:
1. **CREATE_TEST**: `git-url-utils.test.ts` は新規ユーティリティ関数のテスト（独立したテストファイルが適切）
2. **EXTEND_TEST**: `init.test.ts`、`secret-masker.test.ts` は既存機能の拡張部分（回帰テストを強化）

---

### ✅ QG-3: 既存コードへの影響範囲が分析されている

**影響範囲分析**（セクション5参照）:

**変更が必要なファイル（3ファイル）**:
1. `src/commands/init.ts` (2箇所修正: 行192, 236付近)
2. `src/core/secret-masker.ts` (1行追加: `metadata.json` をスキャン対象に)
3. `src/core/git/commit-manager.ts` (約15行追加: `commitWorkflowInit()` でマスキング実行)

**新規作成ファイル（1ファイル）**:
1. `src/utils/git-url-utils.ts` (URLサニタイゼーション関数)

**依存関係の変更**:
- 新規依存なし（標準ライブラリのみ）
- 内部依存: `src/commands/init.ts` → `src/utils/git-url-utils.ts` (新規import)

**マイグレーション要否**: 不要（既存metadata.jsonには影響なし）

---

### ✅ QG-4: 変更が必要なファイルがリストアップされている

**ファイルリスト**（セクション6参照）:

**新規作成**:
```
src/utils/git-url-utils.ts
tests/unit/utils/git-url-utils.test.ts
```

**修正が必要**:
```
src/commands/init.ts
src/core/secret-masker.ts
src/core/git/commit-manager.ts
tests/unit/commands/init.test.ts
tests/unit/secret-masker.test.ts
```

**削除が必要**: なし

---

### ✅ QG-5: 設計が実装可能である

**実装可能性の検証**:

1. **技術的実装可能性**:
   - ✅ 正規表現によるURLサニタイズは標準機能（外部ライブラリ不要）
   - ✅ SecretMaskerの拡張は1行追加のみ（既存パターンに従う）
   - ✅ CommitManagerの修正は既存メソッド拡張（破壊的変更なし）

2. **テスト可能性**:
   - ✅ `sanitizeGitUrl()` は純粋関数（ユニットテストが容易）
   - ✅ 既存テストフレームワーク（Jest）でテスト可能
   - ✅ 統合テストは既存パターン（`tests/integration/`）に従う

3. **依存関係の解決**:
   - ✅ 新規外部依存なし
   - ✅ 既存依存（simple-git、fs-extra等）のバージョン変更不要

4. **実装順序の明確性**:
   - ✅ Phase 1〜8の実装順序が明確（セクション10参照）
   - ✅ 依存関係グラフで並行実装可能箇所を明示

5. **リスク管理**:
   - ✅ 主要リスク5つを特定し、軽減策を明記（セクション11参照）
   - ✅ Defense in Depthパターンにより、単一障害点なし

---

## 13. まとめ

### 13.1 設計の要点

本設計は、GitHub Personal Access Tokenがmetadata.jsonに保存される重大なセキュリティ問題を、**Defense in Depth（多層防御）パターン**により解決します。

**主要な実装内容**:
1. **第1層防御**: Git URL サニタイゼーション関数（`src/utils/git-url-utils.ts`）
   - HTTPS認証情報を正規表現で除去
   - 純粋関数で外部依存なし

2. **第2層防御**: SecretMasker の拡張（`src/core/secret-masker.ts`）
   - `metadata.json` をスキャン対象に追加（1行）
   - 既存機能を活用

3. **第3層防御**: commitWorkflowInit での確実なマスキング実行（`src/core/git/commit-manager.ts`）
   - コミット前にマスキング処理を実行
   - マスキング失敗時は致命的エラー

**実装戦略**: EXTEND（既存コードの拡張が中心、新規ユーティリティファイル1つ）
**テスト戦略**: UNIT_INTEGRATION（ユニット + 統合テスト）
**テストコード戦略**: BOTH_TEST（新規テスト作成 + 既存テスト拡張）

### 13.2 重要なリスクと軽減策

1. **Git URL形式の多様性**（中）
   - 軽減策: 保守的な正規表現、包括的なユニットテスト

2. **正規表現の誤検出・見逃し**（高→低）
   - 軽減策: SecretMaskerによる二重チェック（Defense in Depth）

3. **既存ワークフローへの影響**（低）
   - 軽減策: 新規init時のみ適用、TROUBLESHOOTING.mdに対応方法記載

### 13.3 品質保証

- ✅ すべての品質ゲート（QG-1〜QG-5）を満たす
- ✅ 実装可能性が検証済み
- ✅ テスト戦略が明確
- ✅ リスク管理が適切

本設計に従い、セキュアで信頼性の高い実装を進めます。

---

**作成日**: 2025-01-21
**作成者**: AI Workflow Agent (Design Phase)
**レビュー状態**: 未レビュー（Phase 2: Review待ち）
