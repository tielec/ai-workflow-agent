# 要件定義書: Issue #7 - カスタムブランチ名での作業をサポート

## 0. Planning Documentの確認

Planning Phase（Phase 0）の計画書を確認しました。本要件定義は以下の開発計画を踏まえて作成されています：

### 実装戦略: EXTEND
既存の初期化フロー（`init`コマンド）とブランチ管理機能（`GitManager`）を拡張する戦略を採用します。新規モジュールの追加は不要であり、既存のメソッドとメタデータスキーマを活用します。

### テスト戦略: UNIT_INTEGRATION
- **ユニットテスト**: ブランチ名バリデーションロジック、CLIオプション解析の単体テスト
- **インテグレーションテスト**: Git操作統合、CLIコマンド全体フロー、メタデータとGit状態の整合性確認

### テストコード戦略: BOTH_TEST
- **CREATE_TEST**: 新規テストファイル（ブランチバリデーション専用、カスタムブランチワークフロー統合テスト）
- **EXTEND_TEST**: 既存テストファイルへのケース追加（initワークフローテスト、メタデータマネージャーテスト）

### 見積もり工数
**8〜12時間**（Planning: 1〜1.5h、設計: 1.5〜2h、実装: 3〜5h、テスト: 2〜3h、ドキュメント: 1〜2h）

### リスク評価: 低
既存機能への影響は最小限であり、後方互換性の維持が容易です。

---

## 1. 概要

### 背景
現在、AI Workflow Orchestratorは、GitHub Issue URLに基づいて自動的にブランチ名（`ai-workflow/issue-{issue_number}`）を生成します。これにより、Issueとブランチの紐付けが明確になり、ワークフローの追跡が容易になります。

しかし、以下のようなユースケースでカスタムブランチ名が必要になります：

1. **既存ブランチでの作業**: すでに作成済みのブランチ（例: `feature/new-api`）でAI Workflowを実行したい場合
2. **チームの命名規則への対応**: プロジェクトで採用されているブランチ命名規則（`feature/`, `bugfix/`, `hotfix/`など）に合わせたい場合
3. **複数Issueの統合作業**: 複数のIssueを1つのブランチでまとめて対応したい場合（例: `feature/user-auth`でIssue #10, #11, #12を統合）
4. **説明的なブランチ名**: 自動生成される名前よりも、より説明的で可読性の高いブランチ名を使用したい場合（例: `feature/add-aws-credentials-support`）

### 目的
CLIオプション`--branch`を追加し、ユーザーが任意のブランチ名を指定してAI Workflowを実行できるようにします。デフォルト動作（自動ブランチ名生成）は維持し、後方互換性を保ちます。

### ビジネス価値
- **柔軟性の向上**: 既存のプロジェクトワークフローに自然に統合可能
- **チーム協業の促進**: 複数開発者のブランチ戦略に適応
- **ユーザー体験の向上**: 既存ブランチでの作業継続が可能

### 技術的価値
- **後方互換性の維持**: 既存ユーザーの動作に影響を与えない
- **既存アーキテクチャの活用**: 新規モジュール不要、`GitManager`の既存メソッドを再利用
- **拡張性**: 将来的なブランチ戦略の高度化に対応可能

---

## 2. 機能要件

### FR-1: CLIオプションの追加（優先度: 高）
**要件**: `init`コマンドに`--branch <branch-name>`オプションを追加し、カスタムブランチ名を指定可能にする。

**詳細**:
- オプション名: `--branch`
- 引数: ブランチ名（文字列）
- 必須/任意: 任意（未指定時はデフォルト動作）
- 実装場所: `src/main.ts` の `init` コマンド定義
- Commander.jsのオプション定義方法: `.option('--branch <name>', 'Custom branch name')`

**受け入れ基準**:
- `--branch`オプションがCLIヘルプに表示される
- `--branch feature/custom`を指定すると、`feature/custom`ブランチで作業が開始される

---

### FR-2: デフォルト動作の維持（優先度: 高）
**要件**: `--branch`オプションが指定されない場合、現在の動作（`ai-workflow/issue-{issue_number}`）を維持する。

**詳細**:
- デフォルトブランチ名生成ロジック: `ai-workflow/issue-${issueNumber}`
- 既存コード（`src/main.ts`の`handleInitCommand`関数）の動作を保持
- 後方互換性を完全に維持

**受け入れ基準**:
- `--branch`オプション未指定時、従来通り`ai-workflow/issue-{issue_number}`が作成される
- 既存のワークフローメタデータが正常に動作する

---

### FR-3: ブランチ名解決ロジック（優先度: 高）
**要件**: 指定されたブランチ名の存在状況に応じて、適切な処理を実行する。

**詳細**:
- **ローカルブランチが存在する場合**: `git checkout <branch>`でブランチに切り替え
- **リモートブランチが存在する場合**: `git fetch`後、`git checkout -b <branch> origin/<branch>`でローカルブランチを作成してトラッキング
- **ブランチが存在しない場合**: `git checkout -b <branch>`で新規ブランチを作成
- 実装場所: `src/main.ts` の `handleInitCommand` 関数内

**受け入れ基準**:
- 既存ローカルブランチに正常に切り替えられる
- 既存リモートブランチをfetch & checkoutできる
- 新規ブランチが作成される
- 各ケースで適切なログメッセージが表示される

---

### FR-4: ブランチ名バリデーション（優先度: 高）
**要件**: Git命名規則に従わないブランチ名を検証し、エラーメッセージを表示する。

**詳細**:
Gitブランチ名の命名規則（[git-check-ref-format](https://git-scm.com/docs/git-check-ref-format)に基づく）:
- 空白を含まない
- `..`（連続ドット）を含まない
- ASCII制御文字（`~`, `^`, `:`, `?`, `*`, `[`, `\`）を含まない
- `/`で始まらない、終わらない
- `.`で終わらない
- `@{`を含まない
- 空文字列でない

**実装方法**:
```typescript
function validateBranchName(branchName: string): { valid: boolean; error?: string } {
  if (!branchName || branchName.trim() === '') {
    return { valid: false, error: 'Branch name cannot be empty' };
  }

  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot start or end with "/"' };
  }

  if (branchName.includes('..')) {
    return { valid: false, error: 'Branch name cannot contain ".."' };
  }

  const invalidChars = /[~^:?*[\\\s@{]/;
  if (invalidChars.test(branchName)) {
    return { valid: false, error: 'Branch name contains invalid characters' };
  }

  if (branchName.endsWith('.')) {
    return { valid: false, error: 'Branch name cannot end with "."' };
  }

  return { valid: true };
}
```

**受け入れ基準**:
- 不正なブランチ名（例: `"invalid branch name"`, `feature/..`, `~test`）を指定すると、明確なエラーメッセージが表示される
- 正常なブランチ名（例: `feature/new-api`, `bugfix/issue-123`, `hotfix/security-patch`）が受け入れられる

---

### FR-5: メタデータへのブランチ名保存（優先度: 高）
**要件**: 指定されたブランチ名（デフォルトまたはカスタム）を`metadata.json`の`branch_name`フィールドに保存する。

**詳細**:
- 既存フィールド`branch_name`を使用（スキーマ変更なし）
- `execute`コマンド実行時、保存されたブランチ名を使用
- マイグレーション不要（既存メタデータとの互換性維持）

**受け入れ基準**:
- `init`コマンド実行後、`metadata.json`の`branch_name`フィールドに正しいブランチ名が保存される
- `execute`コマンドが保存されたブランチ名でGit操作を実行する

---

### FR-6: Jenkinsパラメータ統合（優先度: 中）
**要件**: JenkinsfileにオプションのBRANCH_NAMEパラメータを追加し、パラメータが指定された場合は`init`コマンドに`--branch`オプションとして渡す。

**詳細**:
- Jenkinsfileの"Initialize Workflow"ステージを更新
- `BRANCH_NAME`パラメータが空でない場合、`--branch ${params.BRANCH_NAME}`を追加
- デフォルトは空文字列（従来の動作）

**実装例**（Jenkinsfile）:
```groovy
stage('Initialize Workflow') {
  when {
    expression { params.EXECUTION_MODE == 'all_phases' }
  }
  steps {
    script {
      def branchOption = params.BRANCH_NAME ? "--branch ${params.BRANCH_NAME}" : ""
      sh """
        node dist/index.js init \\
          --issue-url ${params.ISSUE_URL} \\
          ${branchOption}
      """
    }
  }
}
```

**受け入れ基準**:
- Jenkins JobでBRANCH_NAMEパラメータを指定すると、指定されたブランチでワークフローが実行される
- BRANCH_NAMEパラメータが空の場合、従来通りデフォルトブランチが使用される

---

## 3. 非機能要件

### NFR-1: パフォーマンス
- **Git操作のタイムアウト**: `simple-git`のデフォルトタイムアウト（60秒）を維持
- **ブランチ存在チェック**: 既存の`GitManager.branchExists()`メソッドを使用（パフォーマンス劣化なし）
- **リモートブランチ取得**: `git fetch`は初回実行時のみ（キャッシュ活用）

### NFR-2: セキュリティ
- **ブランチ名のサニタイゼーション**: バリデーションロジックで不正文字を事前にブロック
- **コマンドインジェクション対策**: `simple-git`ライブラリを使用（直接シェルコマンド実行を回避）
- **認証情報の保護**: 既存のGitHub Token管理方法を踏襲

### NFR-3: 可用性・信頼性
- **エラーハンドリング**: ブランチ切り替え失敗時、明確なエラーメッセージを表示
- **ロールバック**: ブランチ作成失敗時、メタデータを残さない
- **冪等性**: 同じブランチ名で複数回`init`を実行しても、安全に処理を継続

### NFR-4: 保守性・拡張性
- **既存コードへの影響最小化**: `GitManager`の既存メソッド（`createBranch()`, `switchBranch()`）を活用
- **コードの可読性**: バリデーションロジックは独立した関数として実装（ユニットテスト容易）
- **ログ出力**: 各Git操作の実行状況をINFOレベルでログ出力（デバッグ容易性）

### NFR-5: ユーザビリティ
- **エラーメッセージの明確性**: ユーザーが修正方法を理解できる具体的なメッセージ（例: "Branch name cannot contain spaces. Use hyphens instead."）
- **ヘルプの充実**: `--help`オプションで`--branch`の使用方法が明確に表示される
- **ドキュメント更新**: README.md、CLAUDE.md、ARCHITECTURE.mdに使用例を追加

---

## 4. 制約事項

### 技術的制約
1. **Git操作**: `simple-git`ライブラリの制約に従う
2. **既存メタデータスキーマ**: `branch_name`フィールドは既存のため、スキーママイグレーション不要
3. **Node.js環境**: Node.js 20以上（既存の要件を踏襲）
4. **Commander.jsのバージョン**: 既存のCommander.js APIを使用（破壊的変更を避ける）

### リソース制約
1. **工数**: 見積もり8〜12時間（計画書に記載）
2. **テスト環境**: ローカルGitリポジトリでの統合テストが必要
3. **CI/CD環境**: Jenkins環境での動作確認（Job DSLは別Issue/PRで対応）

### ポリシー制約
1. **後方互換性**: 既存ユーザーの動作を破壊しない（必須）
2. **コーディング規約**: プロジェクトの既存コーディングスタイルに準拠（TypeScript、ESLint）
3. **セキュリティポリシー**: GitHub Token、SSH Keyの取り扱いは既存方法を踏襲

---

## 5. 前提条件

### システム環境
- Node.js 20以上
- npm 10以上
- Git 2.x以上
- 作業ディレクトリがGitリポジトリである

### 依存コンポーネント
- `simple-git`: Gitコマンドラッパー（既存依存）
- `commander`: CLIフレームワーク（既存依存）
- `fs-extra`: ファイルシステム操作（既存依存）

### 外部システム連携
- **GitHub API**: Issue情報の取得、PR作成（既存）
- **Git Remote**: リモートブランチの取得、push操作（既存）
- **Jenkins**: パラメータ経由でのブランチ名指定（新規）

---

## 6. 受け入れ基準

### AC-1: CLIでカスタムブランチ名を指定できる
**Given**: 有効なGitHub Issue URLとカスタムブランチ名が与えられている
**When**: `ai-workflow-v2 init --issue-url https://github.com/org/repo/issues/123 --branch feature/custom-branch`を実行する
**Then**:
- `feature/custom-branch`が作成または切り替えられる
- `metadata.json`の`branch_name`フィールドに`feature/custom-branch`が保存される
- 適切なログメッセージが表示される（例: "[INFO] Created and switched to new branch: feature/custom-branch"）

---

### AC-2: デフォルト動作が変わらない（後方互換性）
**Given**: 有効なGitHub Issue URLが与えられている
**When**: `ai-workflow-v2 init --issue-url https://github.com/org/repo/issues/123`（`--branch`オプションなし）を実行する
**Then**:
- `ai-workflow/issue-123`が作成される（従来通り）
- `metadata.json`の`branch_name`フィールドに`ai-workflow/issue-123`が保存される
- 既存のテストスイートが全て成功する

---

### AC-3: 既存ブランチに切り替えられる
**Given**: ローカルブランチ`feature/existing-branch`が存在する
**When**: `ai-workflow-v2 init --issue-url https://github.com/org/repo/issues/123 --branch feature/existing-branch`を実行する
**Then**:
- 既存の`feature/existing-branch`にチェックアウトする
- 新しいブランチは作成されない
- ログに"[INFO] Switched to existing branch: feature/existing-branch"が表示される

---

### AC-4: リモートブランチを取得できる
**Given**: リモートブランチ`origin/feature/remote-branch`が存在し、ローカルには存在しない
**When**: `ai-workflow-v2 init --issue-url https://github.com/org/repo/issues/123 --branch feature/remote-branch`を実行する
**Then**:
- `git fetch`が実行される
- ローカルブランチ`feature/remote-branch`が作成され、`origin/feature/remote-branch`をトラッキングする
- ログに"[INFO] Created local branch 'feature/remote-branch' tracking origin/feature/remote-branch"が表示される

---

### AC-5: メタデータに保存される
**Given**: `ai-workflow-v2 init --issue-url https://github.com/org/repo/issues/123 --branch feature/custom`が成功した
**When**: `.ai-workflow/issue-123/metadata.json`を読み込む
**Then**:
- `branch_name`フィールドが`"feature/custom"`である
- `execute`コマンド実行時、このブランチ名が使用される

---

### AC-6: ブランチ名のバリデーション
**Given**: 不正なブランチ名が与えられている
**When**: `ai-workflow-v2 init --issue-url https://github.com/org/repo/issues/123 --branch "invalid branch name"`を実行する
**Then**:
- エラーメッセージ"[ERROR] Invalid branch name: invalid branch name. Branch name contains invalid characters."が表示される
- ブランチは作成されない
- metadata.jsonは作成されない
- プロセスが終了コード1で終了する

**検証対象の不正ブランチ名**:
- `"invalid branch name"` → 空白を含む
- `feature/..` → `..`を含む
- `~test` → `~`を含む
- `/feature` → `/`で始まる
- `feature/` → `/`で終わる
- `feature.` → `.`で終わる
- `feature@{123}` → `@{`を含む

---

### AC-7: Jenkinsでブランチ名を指定できる
**Given**: Jenkins Jobの`BRANCH_NAME`パラメータに`feature/jenkins-custom`が設定されている
**When**: Jenkins Jobを実行する
**Then**:
- `init`コマンドに`--branch feature/jenkins-custom`オプションが渡される
- `feature/jenkins-custom`ブランチで作業が開始される
- `metadata.json`の`branch_name`フィールドが`feature/jenkins-custom`になる

---

## 7. スコープ外

以下は今回のIssue #7のスコープに含めません。将来的な拡張として別Issueで対応することを推奨します。

### 除外項目

1. **Job DSLファイルの実装**
   - 理由: 別ファイル（`jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy`）で管理されており、ドキュメント参照のみとする
   - 対応方法: Jenkinsfileの更新のみ実施、Job DSLは手動更新またはドキュメント記載

2. **ブランチ保護ルールのチェック**
   - 理由: GitHub API経由でのブランチ保護ルール取得は複雑度が高く、エラーハンドリングが困難
   - 代替案: ユーザーがブランチ保護ルールを事前に確認することを前提とする

3. **PR作成時のベースブランチ自動判定**
   - 理由: 複雑な分岐戦略（Git Flow、GitHub Flowなど）に対応するための調査・設計が必要
   - 現状: デフォルトのベースブランチ（`main`）を使用（既存動作を維持）

4. **複数リポジトリでのブランチ名統一**
   - 理由: マルチリポジトリ環境でのブランチ名整合性管理は、Issue #7の範囲を超える
   - 将来対応: 別Issueで「マルチリポジトリ同期機能」として検討

5. **ブランチ名のエイリアス機能**
   - 例: `--branch short-name`を指定すると、実際は`feature/short-name`が作成される
   - 理由: ユーザー混乱を避けるため、明示的なブランチ名指定のみサポート

6. **ブランチ名のテンプレート機能**
   - 例: `--branch-template "feature/{issue_number}-{description}"`
   - 理由: 複雑度が高く、Issue #7の範囲を超える

---

## 8. 関連ファイル

### 変更が必要なファイル

| ファイル | 影響度 | 変更内容 |
|---------|--------|---------|
| `src/main.ts` | 高 | `init`コマンドに`--branch`オプション追加、ブランチ名解決ロジック実装、バリデーション関数追加 |
| `Jenkinsfile` | 中 | "Initialize Workflow"ステージで`BRANCH_NAME`パラメータの条件分岐追加 |
| `src/core/git-manager.ts` | 低 | 既存メソッド（`createBranch()`, `switchBranch()`）の活用のみ、新規メソッド追加不要 |
| `src/core/metadata-manager.ts` | 低 | 既存フィールド`branch_name`を利用、スキーマ変更なし |
| `README.md` | 中 | `--branch`オプションの使用例、ブランチ名バリデーションルールの追加 |
| `CLAUDE.md` | 低 | CLIオプション一覧に`--branch`を追加 |
| `ARCHITECTURE.md` | 低 | initコマンドフローにブランチ名解決ステップを追記（任意） |

### 影響を受けないファイル

- `src/phases/*.ts`: 各フェーズは`metadata.json`の`branch_name`を読み取るのみ
- `src/core/github-client.ts`: ブランチ情報は`GitManager`経由で取得
- `src/templates/*.md`: テンプレートは変更不要
- `jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy`: ドキュメント参照のみ（実装はスコープ外）

---

## 9. テストシナリオ

### シナリオ1: デフォルトブランチ名（後方互換性）
**目的**: `--branch`オプション未指定時、従来通りの動作を確認

**Given**:
- 有効なGitHub Issue URL（https://github.com/tielec/ai-workflow-agent/issues/123）
- `--branch`オプションなし

**When**:
```bash
ai-workflow-v2 init --issue-url https://github.com/tielec/ai-workflow-agent/issues/123
```

**Then**:
- 現在のブランチが`ai-workflow/issue-123`になる
- `git branch --show-current`の出力が`ai-workflow/issue-123`である
- `metadata.json`の`branch_name`フィールドが`"ai-workflow/issue-123"`である

---

### シナリオ2: カスタムブランチ名（新規作成）
**目的**: 指定したカスタムブランチ名で新規ブランチが作成されることを確認

**Given**:
- 有効なGitHub Issue URL
- カスタムブランチ名`feature/add-logging`（ローカル・リモート共に存在しない）

**When**:
```bash
ai-workflow-v2 init --issue-url https://github.com/tielec/ai-workflow-agent/issues/123 --branch feature/add-logging
```

**Then**:
- 新しいブランチ`feature/add-logging`が作成される
- `git branch --show-current`の出力が`feature/add-logging`である
- ログに"[INFO] Created and switched to new branch: feature/add-logging"が表示される
- `metadata.json`の`branch_name`フィールドが`"feature/add-logging"`である

---

### シナリオ3: 既存ブランチでの作業
**目的**: 既存のローカルブランチに正常に切り替わることを確認

**Given**:
- 既存のローカルブランチ`feature/existing-work`が存在する
```bash
git checkout -b feature/existing-work
git checkout main  # 別のブランチに移動
```

**When**:
```bash
ai-workflow-v2 init --issue-url https://github.com/tielec/ai-workflow-agent/issues/123 --branch feature/existing-work
```

**Then**:
- 既存のブランチ`feature/existing-work`にチェックアウトする
- 新しいブランチは作成されない
- `git branch --show-current`の出力が`feature/existing-work`である
- ログに"[INFO] Switched to existing branch: feature/existing-work"が表示される

---

### シナリオ4: 不正なブランチ名（空白を含む）
**目的**: 不正なブランチ名を指定した場合、適切なエラーメッセージが表示されることを確認

**Given**:
- 不正なブランチ名`"invalid branch name"`（空白を含む）

**When**:
```bash
ai-workflow-v2 init --issue-url https://github.com/tielec/ai-workflow-agent/issues/123 --branch "invalid branch name"
```

**Then**:
- エラーメッセージが表示される: `[ERROR] Invalid branch name: invalid branch name. Branch name contains invalid characters.`
- ブランチは作成されない
- `metadata.json`は作成されない
- プロセスが終了コード1で終了する

---

### シナリオ5: 不正なブランチ名（その他の不正文字）
**目的**: Gitの命名規則に違反するブランチ名を検証

**テストケース**:

| ブランチ名 | 期待されるエラー |
|-----------|-----------------|
| `feature/..` | "Branch name cannot contain .." |
| `~test` | "Branch name contains invalid characters" |
| `/feature` | "Branch name cannot start or end with /" |
| `feature/` | "Branch name cannot start or end with /" |
| `feature.` | "Branch name cannot end with ." |
| `feature@{123}` | "Branch name contains invalid characters" |
| `` (空文字列) | "Branch name cannot be empty" |

---

### シナリオ6: Jenkinsパラメータ統合
**目的**: Jenkins環境でBRANCH_NAMEパラメータが正常に動作することを確認

**Given**:
- Jenkins JobのパラメータとしてBRANCH_NAME = `feature/jenkins-custom`が設定されている
- 環境変数`GITHUB_TOKEN`、`CODEX_API_KEY`が設定されている

**When**:
- Jenkins Jobを実行する

**Then**:
- `init`コマンドに`--branch feature/jenkins-custom`が渡される
- `feature/jenkins-custom`ブランチでワークフローが実行される
- `metadata.json`の`branch_name`フィールドが`"feature/jenkins-custom"`になる
- Jenkins実行ログに"[INFO] Created and switched to new branch: feature/jenkins-custom"が表示される

---

### シナリオ7: リモートブランチの取得
**目的**: リモートブランチが存在し、ローカルには存在しない場合、fetch & checkoutが動作することを確認

**Given**:
- リモートブランチ`origin/feature/remote-only`が存在する
- ローカルには`feature/remote-only`が存在しない

**When**:
```bash
ai-workflow-v2 init --issue-url https://github.com/tielec/ai-workflow-agent/issues/123 --branch feature/remote-only
```

**Then**:
- `git fetch`が実行される
- ローカルブランチ`feature/remote-only`が作成され、`origin/feature/remote-only`をトラッキングする
- `git branch --show-current`の出力が`feature/remote-only`である
- ログに"[INFO] Created local branch 'feature/remote-only' tracking origin/feature/remote-only"が表示される

---

## 10. 成功条件

本要件定義の成功条件は以下の通りです：

### 機能要件の達成
- [ ] FR-1: CLIオプション`--branch`が実装されている
- [ ] FR-2: デフォルト動作が後方互換性を保ちながら維持されている
- [ ] FR-3: ブランチ名解決ロジック（新規作成、既存切り替え、リモート取得）が正常に動作する
- [ ] FR-4: ブランチ名バリデーションが全てのエッジケースをカバーしている
- [ ] FR-5: メタデータへのブランチ名保存が正常に動作する
- [ ] FR-6: Jenkinsパラメータ統合が正常に動作する

### 受け入れ基準の完全達成
- [ ] AC-1〜AC-7の全てのシナリオが成功する
- [ ] テストシナリオ1〜7の全てが成功する

### 品質基準
- [ ] ユニットテストカバレッジ ≥ 90%
- [ ] インテグレーションテスト成功率 = 100%
- [ ] 既存テストスイート成功率 = 100%（regression なし）

### 非機能要件の達成
- [ ] NFR-1: Git操作のパフォーマンス劣化がない
- [ ] NFR-2: セキュリティ要件（コマンドインジェクション対策）が満たされている
- [ ] NFR-3: エラーハンドリングが適切に実装されている
- [ ] NFR-4: コードの可読性・保守性が維持されている
- [ ] NFR-5: ユーザーフレンドリーなエラーメッセージが表示される

### ドキュメント完全性
- [ ] README.mdに`--branch`オプションと使用例が追加されている
- [ ] CLAUDE.mdにCLIオプション一覧が更新されている
- [ ] ブランチ名バリデーションルールがドキュメント化されている

---

## 11. レビュー観点（Phase 1品質ゲート）

本要件定義書は、以下の品質ゲートを満たす必要があります：

### 必須要件（ブロッカー）
- [x] **機能要件が明確に記載されている**: FR-1〜FR-6が具体的かつ検証可能な形で定義されている
- [x] **受け入れ基準が定義されている**: AC-1〜AC-7がGiven-When-Then形式で明確に記載されている
- [x] **スコープが明確である**: スコープ外の項目（6項目）が明示されている
- [x] **論理的な矛盾がない**: 機能要件、受け入れ基準、テストシナリオ間で矛盾がない

### 推奨事項（改善提案）
- Planning Documentの開発計画（実装戦略、テスト戦略、リスク評価）を反映している
- 非機能要件（パフォーマンス、セキュリティ、ユーザビリティ）が網羅的に定義されている
- 制約事項（技術的、リソース、ポリシー）が明確に記載されている
- テストシナリオが正常系・異常系を網羅している

---

## 12. 次ステップ

本要件定義書（Phase 1）が承認された後、以下のフェーズに進みます：

1. **Phase 2: Design（設計）** - CLI層、バリデーションロジック、Git Manager統合の詳細設計
2. **Phase 3: Test Scenario（テストシナリオ）** - ユニット・インテグレーションテストシナリオの詳細化
3. **Phase 4: Implementation（実装）** - コード実装
4. **Phase 5: Test Implementation（テスト実装）** - テストコードの実装
5. **Phase 6: Testing（テスト実行）** - 全テストの実行とカバレッジ確認
6. **Phase 7: Documentation（ドキュメント）** - README、CLAUDE.md、ARCHITECTURE.mdの更新
7. **Phase 8: Report（レポート）** - 実装サマリーとPRボディの生成

---

**要件定義書 v1.0**
**作成日**: 2025-01-XX
**Issue番号**: #7
**対応Issue**: https://github.com/tielec/ai-workflow-agent/issues/7
**見積もり工数**: 8〜12時間（Planning Documentに基づく）
**リスクレベル**: 低
**複雑度**: 中程度
**実装戦略**: EXTEND
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: BOTH_TEST
