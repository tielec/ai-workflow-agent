# 要件定義書: Issue #749

## resolve-conflict コマンドの全フェーズで git user 設定が未実施のため CI 環境でコミットが失敗する

---

## 0. Planning Document の確認

### 開発計画の全体像

Planning Phase（`planning.md`）にて以下の戦略が策定済み：

- **実装戦略**: EXTEND（既存の `CommitManager.ensureGitConfig()` からロジックを抽出し、共通ヘルパー関数として `resolve-conflict` コマンドに適用）
- **テスト戦略**: UNIT_INTEGRATION（共通ヘルパー関数のユニットテスト + `resolve-conflict` 統合テストの拡張）
- **テストコード戦略**: BOTH_TEST（新規ユニットテスト作成 + 既存統合テスト拡張）
- **複雑度**: 簡単〜中程度（見積もり工数 6〜10 時間）
- **リスク評価**: 低（既存パターンの再利用、限定的な影響範囲）

### Planning Document で策定された主要方針

1. `src/core/git/git-config-helper.ts` を新規作成し、`ensureGitUserConfig()` をスタンドアロン関数として実装
2. `resolve-conflict` の 3 ファイル（init.ts / analyze.ts / execute.ts）に適用
3. `CommitManager.ensureGitConfig()` を新しい共通ヘルパー関数に委譲するようリファクタリング
4. `pr-comment` のインライン Git 設定を共通ヘルパー関数に置き換え
5. フォールバック値（ユーザー名・メールアドレス）をプロジェクト全体で統一

本要件定義書は上記方針を踏まえて策定する。

---

## 1. 概要

### 背景

`resolve-conflict` コマンドは PR のマージコンフリクトを AI で分析・解消するためのコマンドであり、init / analyze / execute / finalize の 4 フェーズで構成される。このうち init / analyze / execute の 3 フェーズでは `simpleGit()` を直接使用して `git.commit()` や `git.merge()` を実行するが、Git ユーザー情報（`user.name` / `user.email`）の事前設定が行われていない。

Jenkins 等の CI 環境ではグローバルな Git ユーザー設定が存在しないため、`resolve-conflict` コマンド実行時に以下のエラーが発生し、コミットおよびマージ操作が失敗する：

```
fatal: unable to auto-detect email address (got 'node@f40376951cc1.(none)')
```

### 目的

1. `resolve-conflict` コマンドの全フェーズ（init / analyze / execute）で Git ユーザー設定を適用し、CI 環境でのコミット・マージ操作を成功させる
2. Git ユーザー設定ロジックを共通ヘルパー関数として抽出し、プロジェクト全体で再利用可能にする
3. フォールバック値（デフォルトユーザー名・メールアドレス）をプロジェクト全体で統一する

### ビジネス価値

- **CI/CD パイプラインの安定化**: Jenkins 環境で `resolve-conflict` ジョブが正常に完了するようになり、PR のマージコンフリクト自動解消ワークフローが実用化される
- **運用コストの削減**: 手動でのコンフリクト解消や Jenkins ジョブの再設定が不要になる

### 技術的価値

- **コードの DRY 原則**: Git ユーザー設定ロジックが 1 箇所に集約され、保守性が向上する
- **統一されたデフォルト値**: プロジェクト全体で Git コミッター情報が一貫し、コミット履歴の追跡が容易になる
- **将来の拡張性**: 新しいコマンドを追加する際に、共通ヘルパー関数を呼び出すだけで Git ユーザー設定が完了する

---

## 2. 機能要件

### FR-1: Git ユーザー設定の共通ヘルパー関数の作成（優先度: 高）

**概要**: `src/core/git/git-config-helper.ts` に `ensureGitUserConfig()` 関数を新規作成する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-1.1 | `ensureGitUserConfig(git: SimpleGit): Promise<void>` のシグネチャで関数を提供する | ユニットテストで関数呼び出しが成功することを確認 |
| FR-1.2 | 設定値の優先順位を以下の順序で解決する: (1) リポジトリローカルの既存 git config → (2) 環境変数 `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL` → (3) フォールバック環境変数 `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` → (4) デフォルト値 | ユニットテストで各優先順位の動作を検証 |
| FR-1.3 | デフォルト値として `DEFAULT_GIT_USER_NAME = 'AI Workflow'` と `DEFAULT_GIT_USER_EMAIL = 'ai-workflow@tielec.local'` を定数としてエクスポートする | ユニットテストでデフォルト値の適用を検証 |
| FR-1.4 | ユーザー名の長さが 1〜100 文字の範囲外の場合、警告ログを出力しデフォルト値にフォールバックする | ユニットテストでバリデーション動作を検証 |
| FR-1.5 | メールアドレスに `@` が含まれない場合、警告ログを出力しデフォルト値にフォールバックする | ユニットテストでバリデーション動作を検証 |
| FR-1.6 | `git.addConfig('user.name', ..., false, 'local')` および `git.addConfig('user.email', ..., false, 'local')` を使用してリポジトリローカルに設定する | ユニットテストで `addConfig` の呼び出し引数を検証 |
| FR-1.7 | 設定完了後に `logger.info()` で設定されたユーザー名・メールアドレスをログ出力する | ユニットテストでログ出力を検証 |
| FR-1.8 | 環境変数の取得には `config.getGitCommitUserName()` / `config.getGitCommitUserEmail()` を使用する（`process.env` 直接アクセス禁止） | コードレビューで確認 |

### FR-2: resolve-conflict init フェーズへの Git ユーザー設定追加（優先度: 高）

**概要**: `src/commands/resolve-conflict/init.ts` の `git.commit()` 呼び出し前に `ensureGitUserConfig()` を追加する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-2.1 | L48 の `git.commit()` 実行前に `ensureGitUserConfig(git)` を呼び出す | 統合テストで `addConfig` が `commit` 前に呼び出されることを検証 |
| FR-2.2 | `ensureGitUserConfig()` の呼び出しはフェーズの早期段階（`git.commit()` の直前ではなくエントリポイント付近）で実行する | コードレビューで呼び出し位置を確認 |
| FR-2.3 | `ensureGitUserConfig()` がエラーを発生させた場合でも、ワークフロー全体は中断しない（フォールト・トレランス） | 統合テストでエラー時の継続動作を検証 |

### FR-3: resolve-conflict analyze フェーズへの Git ユーザー設定追加（優先度: 高）

**概要**: `src/commands/resolve-conflict/analyze.ts` の `git.merge()` および `git.commit()` 呼び出し前に `ensureGitUserConfig()` を追加する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-3.1 | L88 の `git.raw(['merge', '--no-commit', '--no-ff', ...])` 実行前に `ensureGitUserConfig(git)` を呼び出す | 統合テストで `addConfig` がマージ前に呼び出されることを検証 |
| FR-3.2 | L169 の `git.commit()` 実行前に `ensureGitUserConfig(git)` が既に適用済みであること（フェーズ内で 1 回の呼び出しで `merge` と `commit` の両方をカバー） | 統合テストで検証 |
| FR-3.3 | `ensureGitUserConfig()` の呼び出しはフェーズのエントリポイント付近で 1 回のみ実行する（`merge` と `commit` の両方に適用） | コードレビューで確認 |

### FR-4: resolve-conflict execute フェーズへの Git ユーザー設定追加（優先度: 高）

**概要**: `src/commands/resolve-conflict/execute.ts` の `git.commit()` 呼び出し前に `ensureGitUserConfig()` を追加する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-4.1 | L128 および L139 の `git.commit()` 実行前に `ensureGitUserConfig(git)` を呼び出す | 統合テストで `addConfig` が `commit` 前に呼び出されることを検証 |
| FR-4.2 | `ensureGitUserConfig()` の呼び出しはフェーズのエントリポイント付近で 1 回のみ実行する（複数の `commit` 呼び出しに対して共通） | コードレビューで確認 |

### FR-5: CommitManager.ensureGitConfig() の共通ヘルパー関数への委譲（優先度: 中）

**概要**: `src/core/git/commit-manager.ts` の `ensureGitConfig()` メソッドが新しい共通ヘルパー関数に内部処理を委譲するようリファクタリングする。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-5.1 | `CommitManager.ensureGitConfig()` の外部インターフェース（メソッドシグネチャ、戻り値、副作用）は変更しない | 既存統合テストのリグレッションテストで検証 |
| FR-5.2 | 内部実装を `ensureGitUserConfig()` 共通ヘルパー関数に委譲する | コードレビューで確認 |
| FR-5.3 | 既存の `CommitManager` を利用しているコードに影響がないこと | `npm run validate` で全テスト pass を確認 |

### FR-6: pr-comment コマンドのインライン Git 設定を共通ヘルパー関数に置き換え（優先度: 中）

**概要**: `src/commands/pr-comment/init.ts` および `src/commands/pr-comment/finalize.ts` のインライン Git 設定コードを共通ヘルパー関数に置き換える。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-6.1 | `pr-comment/init.ts` L75-81 のインライン Git 設定を `ensureGitUserConfig(git)` の呼び出しに置き換える | コードレビューで確認 |
| FR-6.2 | `pr-comment/finalize.ts` L104-110 のインライン Git 設定を `ensureGitUserConfig(git)` の呼び出しに置き換える | コードレビューで確認 |
| FR-6.3 | `pr-comment/finalize.ts` L203-208 のインライン Git 設定を `ensureGitUserConfig(git)` の呼び出しに置き換える | コードレビューで確認 |
| FR-6.4 | 置き換え後、`pr-comment` コマンドの既存テストが全て pass すること | テスト実行で検証 |

### FR-7: フォールバック値のプロジェクト全体統一（優先度: 中）

**概要**: Git ユーザー設定のフォールバック値（デフォルトユーザー名・メールアドレス）をプロジェクト全体で統一する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-7.1 | デフォルトユーザー名を `'AI Workflow'` に統一する（`pr-comment` で使用されていた `'AI Workflow Bot'` から変更） | ユニットテストでデフォルト値を検証 |
| FR-7.2 | デフォルトメールアドレスを `'ai-workflow@tielec.local'` に統一する（`pr-comment` で使用されていた `'ai-workflow@example.com'` から変更） | ユニットテストでデフォルト値を検証 |
| FR-7.3 | デフォルト値は共通ヘルパー関数内に定数として定義し、エクスポートして一元管理する | コードレビューで定数のエクスポートを確認 |

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

| ID | 要件 | 基準値 |
|----|------|--------|
| NFR-1.1 | `ensureGitUserConfig()` の実行が既存ワークフローの実行時間に影響を与えない | 関数実行時間 100ms 以下（`git.listConfig()` + `git.addConfig()` × 2 の合計） |
| NFR-1.2 | 各フェーズ内で `ensureGitUserConfig()` の呼び出しは 1 回のみとする | フェーズエントリポイントで 1 回呼び出し |
| NFR-1.3 | `git.listConfig()` はリポジトリローカル設定の読み取りのみであり、ネットワーク通信を伴わない | ローカル操作のみ |

### NFR-2: 保守性・拡張性要件

| ID | 要件 | 基準値 |
|----|------|--------|
| NFR-2.1 | Git ユーザー設定のロジックが 1 箇所（`git-config-helper.ts`）に集約されている | 重複コード 0 箇所（共通ヘルパー関数を使用する箇所は呼び出しのみ） |
| NFR-2.2 | デフォルト値定数が 1 箇所で定義・エクスポートされている | `DEFAULT_GIT_USER_NAME` / `DEFAULT_GIT_USER_EMAIL` が `git-config-helper.ts` で唯一定義 |
| NFR-2.3 | 新しいコマンドを追加する際、`ensureGitUserConfig(git)` を呼び出すだけで Git ユーザー設定が完了する | 関数シグネチャが `(git: SimpleGit) => Promise<void>` で統一 |
| NFR-2.4 | 共通ヘルパー関数のユニットテストカバレッジが 90% 以上 | テストカバレッジレポートで確認 |

### NFR-3: 信頼性要件

| ID | 要件 | 基準値 |
|----|------|--------|
| NFR-3.1 | `ensureGitUserConfig()` のエラーが `resolve-conflict` のワークフロー全体を中断しない | エラー発生時もワークフローが継続する（エラーログは出力） |
| NFR-3.2 | 環境変数が未設定の場合でもデフォルト値でコミットが成功する | デフォルト値 `'AI Workflow'` / `'ai-workflow@tielec.local'` が適用される |
| NFR-3.3 | 既存の `CommitManager` を利用しているワークフロー（メインワークフロー）にリグレッションが発生しない | 既存テスト 17 件 + 新規テストが全て pass |

### NFR-4: セキュリティ要件

| ID | 要件 | 基準値 |
|----|------|--------|
| NFR-4.1 | 環境変数アクセスは `config.getGitCommitUserName()` / `config.getGitCommitUserEmail()` を経由する（`process.env` 直接アクセス禁止） | コーディング規約準拠 |
| NFR-4.2 | Git ユーザー設定値のログ出力において、機密情報の漏洩リスクがない | ユーザー名・メールアドレスのみをログ出力（トークン等は含まない） |

---

## 4. 制約事項

### 技術的制約

| ID | 制約 | 詳細 |
|----|------|------|
| TC-1 | TypeScript 使用 | プロジェクト全体が TypeScript で実装されており、新規コードも TypeScript で作成する |
| TC-2 | `simple-git` ライブラリ使用 | Git 操作には既存の `simple-git` ライブラリを使用する（新規依存の追加は不要） |
| TC-3 | `@/` パスエイリアス使用 | インポートパスには `@/` エイリアスを使用する（例: `import { ensureGitUserConfig } from '@/core/git/git-config-helper'`） |
| TC-4 | `CommitManager` の外部インターフェース不変 | `CommitManager.ensureGitConfig()` のメソッドシグネチャ・戻り値を変更しない |
| TC-5 | ロギング規約準拠 | `console.log` 等の直接使用は禁止。`logger` モジュールを使用する |
| TC-6 | エラーハンドリング規約準拠 | `as Error` 型アサーションは禁止。`getErrorMessage()` 等のユーティリティを使用する |
| TC-7 | 環境変数アクセス規約準拠 | `process.env` 直接アクセス禁止。`config` クラスを使用する |

### リソース制約

| ID | 制約 | 詳細 |
|----|------|------|
| RC-1 | 見積もり工数 | 6〜10 時間以内で完了すること（Planning Document 参照） |
| RC-2 | 新規ファイル作成 | 最大 2 ファイル（`git-config-helper.ts` + テストファイル） |

### ポリシー制約

| ID | 制約 | 詳細 |
|----|------|------|
| PC-1 | テストスイート通過 | `npm run validate` が pass すること（TypeScript 型チェック + テスト + ビルド） |
| PC-2 | 既存テストリグレッションなし | 既存の統合テスト 17 件が全て pass すること |
| PC-3 | CLAUDE.md コーディング規約準拠 | ロギング規約、環境変数アクセス規約、エラーハンドリング規約を遵守する |

---

## 5. 前提条件

### システム環境

| ID | 前提条件 | 詳細 |
|----|----------|------|
| PA-1 | Node.js 20 以上 | プロジェクトの動作環境 |
| PA-2 | npm 10 以上 | 依存関係管理 |
| PA-3 | Git がインストールされている | `simple-git` ライブラリの動作に必要 |
| PA-4 | CI 環境（Jenkins）でグローバル Git 設定が存在しない場合がある | 本 Issue の根本原因。デフォルト値によるフォールバックが必須 |

### 依存コンポーネント

| ID | コンポーネント | バージョン | 役割 |
|----|--------------|------------|------|
| DC-1 | `simple-git` | 既存バージョン | Git 操作（commit, merge, addConfig, listConfig） |
| DC-2 | `src/core/config.ts` | 既存 | 環境変数アクセス（`getGitCommitUserName()` / `getGitCommitUserEmail()`） |
| DC-3 | `src/utils/logger.ts` | 既存 | 統一ロギング |
| DC-4 | `src/utils/error-utils.ts` | 既存 | エラーハンドリングユーティリティ |

### 外部システム連携

| ID | システム | 連携内容 |
|----|---------|----------|
| ES-1 | Jenkins CI | `resolve-conflict` ジョブの実行環境。環境変数 `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL` を任意で設定可能 |
| ES-2 | GitHub | PR のマージコンフリクト解消結果のコミット・プッシュ先 |

---

## 6. 受け入れ基準

### AC-1: 共通ヘルパー関数の動作（FR-1 対応）

**AC-1.1: 環境変数が設定されている場合の優先順位**

```
Given: 環境変数 GIT_COMMIT_USER_NAME='Custom User' が設定されている
  And: 環境変数 GIT_COMMIT_USER_EMAIL='custom@example.com' が設定されている
When: ensureGitUserConfig(git) を呼び出す
Then: git.addConfig('user.name', 'Custom User', false, 'local') が呼び出される
  And: git.addConfig('user.email', 'custom@example.com', false, 'local') が呼び出される
```

**AC-1.2: 環境変数が未設定の場合のデフォルト値適用**

```
Given: 環境変数 GIT_COMMIT_USER_NAME / GIT_COMMIT_USER_EMAIL が未設定
  And: GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL も未設定
  And: リポジトリローカルの git config に user.name / user.email が未設定
When: ensureGitUserConfig(git) を呼び出す
Then: git.addConfig('user.name', 'AI Workflow', false, 'local') が呼び出される
  And: git.addConfig('user.email', 'ai-workflow@tielec.local', false, 'local') が呼び出される
```

**AC-1.3: リポジトリローカル設定が存在する場合**

```
Given: リポジトリローカルの git config に user.name='Existing User' が設定されている
  And: リポジトリローカルの git config に user.email='existing@example.com' が設定されている
When: ensureGitUserConfig(git) を呼び出す
Then: git.addConfig('user.name', 'Existing User', false, 'local') が呼び出される
  And: git.addConfig('user.email', 'existing@example.com', false, 'local') が呼び出される
```

**AC-1.4: ユーザー名が不正な長さの場合のフォールバック**

```
Given: 環境変数 GIT_COMMIT_USER_NAME に 101 文字以上の文字列が設定されている
When: ensureGitUserConfig(git) を呼び出す
Then: 警告ログが出力される
  And: git.addConfig('user.name', 'AI Workflow', false, 'local') がデフォルト値で呼び出される
```

**AC-1.5: メールアドレスが不正な形式の場合のフォールバック**

```
Given: 環境変数 GIT_COMMIT_USER_EMAIL に '@' を含まない文字列が設定されている
When: ensureGitUserConfig(git) を呼び出す
Then: 警告ログが出力される
  And: git.addConfig('user.email', 'ai-workflow@tielec.local', false, 'local') がデフォルト値で呼び出される
```

### AC-2: resolve-conflict init フェーズでの動作（FR-2 対応）

**AC-2.1: CI 環境での init フェーズ成功**

```
Given: Jenkins CI 環境でグローバル Git ユーザー設定が存在しない
  And: resolve-conflict init フェーズが実行される
When: メタデータの git.commit() が呼び出される
Then: git.addConfig('user.name', ...) および git.addConfig('user.email', ...) が commit 前に呼び出されている
  And: git.commit() が 'Author identity unknown' エラーなしで成功する
```

### AC-3: resolve-conflict analyze フェーズでの動作（FR-3 対応）

**AC-3.1: CI 環境での analyze フェーズ成功（マージ操作）**

```
Given: Jenkins CI 環境でグローバル Git ユーザー設定が存在しない
  And: resolve-conflict analyze フェーズが実行される
When: git.raw(['merge', '--no-commit', '--no-ff', ...]) が呼び出される
Then: git.addConfig('user.name', ...) および git.addConfig('user.email', ...) がマージ前に呼び出されている
  And: merge 操作が 'Committer identity unknown' エラーなしで成功する
```

**AC-3.2: CI 環境での analyze フェーズ成功（コミット操作）**

```
Given: Jenkins CI 環境でグローバル Git ユーザー設定が存在しない
  And: resolve-conflict analyze フェーズの分析完了後
When: 成果物の git.commit() が呼び出される
Then: Git ユーザー設定が適用済みの状態でコミットが成功する
```

### AC-4: resolve-conflict execute フェーズでの動作（FR-4 対応）

**AC-4.1: CI 環境での execute フェーズ成功**

```
Given: Jenkins CI 環境でグローバル Git ユーザー設定が存在しない
  And: resolve-conflict execute フェーズが実行される
When: L128 または L139 の git.commit() が呼び出される
Then: git.addConfig('user.name', ...) および git.addConfig('user.email', ...) が commit 前に呼び出されている
  And: git.commit() が 'Author identity unknown' エラーなしで成功する
```

### AC-5: 既存機能のリグレッション確認（FR-5, FR-6 対応）

**AC-5.1: CommitManager のリグレッションなし**

```
Given: CommitManager.ensureGitConfig() が共通ヘルパー関数に委譲するよう修正されている
When: メインワークフロー（execute コマンド）が実行される
Then: 既存の全統合テスト（17 件）が pass する
  And: CommitManager.ensureGitConfig() の動作が修正前と同一である
```

**AC-5.2: pr-comment コマンドのリグレッションなし**

```
Given: pr-comment のインライン Git 設定が共通ヘルパー関数に置き換えられている
When: pr-comment コマンドの既存テストが実行される
Then: 全テストが pass する
```

### AC-6: フォールバック値の統一（FR-7 対応）

**AC-6.1: 統一されたデフォルト値の使用**

```
Given: 全コマンド（メインワークフロー、pr-comment、resolve-conflict）が共通ヘルパー関数を使用している
When: 環境変数が未設定の状態で Git コミットが実行される
Then: すべてのコマンドで同一のデフォルト値 'AI Workflow' / 'ai-workflow@tielec.local' が使用される
```

### AC-7: 品質ゲート（全体）

**AC-7.1: npm run validate の通過**

```
Given: すべてのコード変更が完了している
When: npm run validate を実行する
Then: TypeScript 型チェック、全テスト、ビルドが成功する
  And: 既存テスト 17 件 + 新規テストが全て pass する
  And: dist/ ディレクトリにビルド成果物が正常に生成される
```

---

## 7. スコープ外

### 明確にスコープ外とする事項

| ID | 事項 | 理由 |
|----|------|------|
| OOS-1 | Jenkins パイプラインの `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL` 環境変数追加 | コード側でフォールバック値が設定されるため、Jenkinsfile の変更は任意（本 Issue のスコープ外） |
| OOS-2 | `resolve-conflict/finalize.ts` への Git ユーザー設定追加 | `finalize.ts` は `commit-manager.ts` を経由しており、`CommitManager.ensureGitConfig()` が既に適用されているため不要 |
| OOS-3 | `git.addConfig` のスコープを `'global'` にする対応 | リポジトリローカル（`'local'`）スコープのみを使用する方針。グローバル設定の変更は他のリポジトリに影響するリスクがある |
| OOS-4 | Git ユーザー設定の GUI/CLI オプションからの指定機能 | 環境変数経由での設定は既にサポートされており、追加の設定インターフェースは将来の拡張候補 |
| OOS-5 | `resolve-conflict` コマンド自体の機能追加・変更 | 本 Issue は Git ユーザー設定の欠落修正のみが目的 |
| OOS-6 | CLAUDE.md のコーディング規約セクションへの Git ユーザー設定規約の追記 | 実装完了後の判断事項。必要に応じて Documentation フェーズで対応 |

### 将来的な拡張候補

| ID | 候補 | 優先度 |
|----|------|--------|
| FE-1 | 他のコマンド（`auto-issue`, `split-issue` 等）でも共通ヘルパー関数を使用 | 低（現時点で Git ユーザー設定が必要なコマンドは限定的） |
| FE-2 | Git ユーザー設定の検証を `validate-credentials` コマンドに統合 | 低 |
| FE-3 | Jenkins パイプラインへの `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL` 環境変数の追加 | 低（コード側フォールバックで対応済み） |

---

## 付録

### A. 影響ファイル一覧

#### 新規作成ファイル

| ファイル | 役割 |
|---------|------|
| `src/core/git/git-config-helper.ts` | Git ユーザー設定の共通ヘルパー関数（`ensureGitUserConfig()` + デフォルト値定数） |
| `tests/unit/core/git/git-config-helper.test.ts` | 共通ヘルパー関数のユニットテスト |

#### 修正対象ファイル

| ファイル | 変更内容 |
|---------|----------|
| `src/commands/resolve-conflict/init.ts` | `ensureGitUserConfig()` 呼び出し追加 |
| `src/commands/resolve-conflict/analyze.ts` | `ensureGitUserConfig()` 呼び出し追加 |
| `src/commands/resolve-conflict/execute.ts` | `ensureGitUserConfig()` 呼び出し追加 |
| `src/core/git/commit-manager.ts` | `ensureGitConfig()` を共通ヘルパー関数に委譲 |
| `src/commands/pr-comment/init.ts` | インライン Git 設定を共通ヘルパー関数に置き換え |
| `src/commands/pr-comment/finalize.ts` | インライン Git 設定（2 箇所）を共通ヘルパー関数に置き換え |
| `tests/integration/commands/resolve-conflict.test.ts` | Git ユーザー設定検証テストケース追加 |

### B. 設定値の優先順位（統一仕様）

```
1. リポジトリローカルの既存 git config (git.listConfig() で取得)
   └─ user.name / user.email が既に設定されている場合はその値を使用

2. 環境変数（プライマリ）
   └─ GIT_COMMIT_USER_NAME / GIT_COMMIT_USER_EMAIL

3. 環境変数（フォールバック）
   └─ GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL

4. デフォルト値（ハードコード定数）
   └─ 'AI Workflow' / 'ai-workflow@tielec.local'
```

### C. Git ユーザー設定の現状と目標状態

| コマンド | 現状の設定方法 | 現状のデフォルト名 | 現状のデフォルトメール | 目標状態 |
|---------|--------------|-------------------|---------------------|----------|
| メインワークフロー | `CommitManager.ensureGitConfig()` | `'AI Workflow'` | `'ai-workflow@tielec.local'` | 共通ヘルパーに委譲 |
| `pr-comment` (init) | インライン `git.addConfig()` | `'AI Workflow Bot'` | `'ai-workflow@example.com'` | 共通ヘルパーに置き換え（デフォルト値統一） |
| `pr-comment` (finalize) × 2 | インライン `git.addConfig()` | `'AI Workflow Bot'` | `'ai-workflow@example.com'` | 共通ヘルパーに置き換え（デフォルト値統一） |
| `resolve-conflict` (全フェーズ) | **設定処理なし** ❌ | — | — | 共通ヘルパーを追加 ✅ |

### D. 品質ゲートチェックリスト

- [x] **機能要件が明確に記載されている**: FR-1〜FR-7 で 7 つの機能要件を定義。各要件に ID、詳細、検証方法を記載
- [x] **受け入れ基準が定義されている**: AC-1〜AC-7 で Given-When-Then 形式の受け入れ基準を定義
- [x] **スコープが明確である**: スコープ内（FR-1〜FR-7）とスコープ外（OOS-1〜OOS-6）を明確に区別
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準が 1:1 で対応し、非機能要件・制約事項と矛盾なし
