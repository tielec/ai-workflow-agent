# 要件定義書 - Issue #54

## プロジェクト情報

- **Issue番号**: #54
- **タイトル**: バグ: metadata.jsonにGitHub Personal Access Tokenが含まれpush protectionで拒否される
- **重要度**: HIGH（セキュリティリスク）
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/54
- **見積もり工数**: 10~14時間（Planning Documentより）

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された以下の戦略を本要件定義に反映します：

### 実装戦略
- **EXTEND**: 既存コードの拡張を中心とした実装
  - `src/commands/init.ts`: remote URL取得後にサニタイズ処理を追加
  - `src/core/secret-masker.ts`: `metadata.json` をスキャン対象に追加
  - `src/core/git/commit-manager.ts`: コミット前のマスキング実行を確実化
  - **新規**: `src/utils/git-url-utils.ts` URLサニタイゼーション関数

### テスト戦略
- **UNIT_INTEGRATION**: ユニットテスト + 統合テスト
  - **ユニットテスト**: `sanitizeGitUrl()` 関数の純粋関数テスト
  - **統合テスト**: `init` コマンド全体でのトークン除去フロー検証

### テストコード戦略
- **BOTH_TEST**: 新規テスト作成 + 既存テスト拡張
  - **新規**: `tests/unit/utils/git-url-utils.test.ts`
  - **拡張**: `tests/integration/init-command.test.ts`、`tests/unit/core/secret-masker.test.ts`

### 主要リスク
1. **Git URL形式の多様性**（中）: GitHub以外のホスト、ポート番号付き等への対応
2. **正規表現の誤検出・見逃し**（高）: セキュリティリスク
3. **既存ワークフローへの影響**（低）: 過去のmetadata.jsonは変更されない

---

## 1. 概要

### 背景
現在、`ai-workflow init` コマンド実行時に、Git remote URL（`git remote get-url origin`）をそのまま `metadata.json` の `target_repository.remote_url` フィールドに保存しています。HTTPS形式でリポジトリをクローンした際にURLにGitHub Personal Access Token（PAT）が埋め込まれている場合（例: `https://ghp_xxxxxxxxxxxx@github.com/owner/repo.git`）、このトークンが平文でmetadata.jsonに記録され、Git履歴に残ります。

GitHub の **push protection** 機能により、シークレット（Personal Access Token等）を含むコミットはリモートへのpushが拒否されます。これにより、ワークフローの初期化が完了できない状態が発生しています。

### 目的
以下を達成し、セキュアなワークフロー初期化を実現します：

1. **トークン漏洩の防止**: metadata.jsonにトークンが保存されないようにする
2. **push protection違反の解消**: GitHub push protectionによるpush拒否を回避
3. **多層防御の実装**: URLサニタイズ + SecretMaskerによるDefense in Depth

### ビジネス価値
- **セキュリティコンプライアンス**: トークン漏洩リスクの排除により、セキュリティ基準を満たす
- **開発効率の向上**: init コマンドが確実に成功し、ワークフロー開始がスムーズになる
- **インシデント防止**: トークン無効化・再発行の手間を削減

### 技術的価値
- **保守性向上**: URLサニタイゼーション関数の共通化により、今後の拡張が容易
- **テスト容易性**: 純粋関数（`sanitizeGitUrl()`）により、ユニットテストが簡素化
- **セキュリティベストプラクティス**: Defense in Depthパターンの適用

---

## 2. 機能要件

### FR-1: Git URL サニタイゼーション機能（優先度: 高）

**説明**: Git remote URLからHTTPS認証情報（トークン、ユーザー名・パスワード）を除去する関数を実装する。

**詳細要件**:
- **FR-1.1**: HTTPS形式のURL（`https://token@github.com/owner/repo.git`）からトークンを除去
  - 入力: `https://ghp_xxxxxxxxxxxx@github.com/owner/repo.git`
  - 出力: `https://github.com/owner/repo.git`

- **FR-1.2**: ユーザー名・パスワード形式（`https://user:pass@github.com/owner/repo.git`）から認証情報を除去
  - 入力: `https://user:password@github.com/owner/repo.git`
  - 出力: `https://github.com/owner/repo.git`

- **FR-1.3**: SSH形式（`git@github.com:owner/repo.git`）は変更せずにそのまま返す
  - 入力: `git@github.com:owner/repo.git`
  - 出力: `git@github.com:owner/repo.git`

- **FR-1.4**: 通常のHTTPS形式（認証情報なし）は変更せずにそのまま返す
  - 入力: `https://github.com/owner/repo.git`
  - 出力: `https://github.com/owner/repo.git`

- **FR-1.5**: 空文字列、null、undefined等の異常入力に対してエラーをスローせず、元の値を返す（フェイルセーフ）

- **FR-1.6**: ポート番号付きURL（`https://token@github.com:443/owner/repo.git`）にも対応

**実装場所**: `src/utils/git-url-utils.ts`

**関数シグネチャ**:
```typescript
export function sanitizeGitUrl(url: string): string
```

---

### FR-2: init コマンドでのサニタイズ適用（優先度: 高）

**説明**: `init` コマンドの2箇所でremote URLサニタイズを適用する。

**詳細要件**:
- **FR-2.1**: `src/commands/init.ts` 行192付近（`resolveLocalRepoPath()` 内）でremote URL取得後にサニタイズ
  - remote URL取得直後に `sanitizeGitUrl()` を呼び出し
  - サニタイズ前後のURLを比較し、トークンが検出された場合は警告ログを出力

- **FR-2.2**: `src/commands/init.ts` 行236付近（メタデータ保存前）でremote URLをサニタイズ
  - `metadataManager.data.target_repository.remote_url` への代入前にサニタイズ
  - サニタイズ済みURLのみをmetadata.jsonに保存

- **FR-2.3**: デバッグログ出力
  - サニタイズ前URL（トークンはマスク: `ghp_***`）
  - サニタイズ後URL
  - トークン検出時の警告メッセージ

**実装場所**: `src/commands/init.ts`

---

### FR-3: SecretMasker の拡張（優先度: 中）

**説明**: `metadata.json` をSecretMaskerのスキャン対象に追加し、Defense in Depthを実現する。

**詳細要件**:
- **FR-3.1**: `src/core/secret-masker.ts` の `targetFilePatterns` に `metadata.json` を追加
  ```typescript
  private readonly targetFilePatterns = [
    'agent_log_raw.txt',
    'agent_log.md',
    'prompt.txt',
    'metadata.json',  // ← 追加
  ];
  ```

- **FR-3.2**: GitHub Personal Access Tokenパターン（`ghp_`、`github_pat_` 等）の検出
  - 既存のマスキングパターンで対応可能であることを確認

- **FR-3.3**: metadata.json不在時のエラーハンドリング
  - ファイルが存在しない場合はスキップ（エラーをスローしない）

**実装場所**: `src/core/secret-masker.ts`

---

### FR-4: commitWorkflowInit でのマスキング実行（優先度: 高）

**説明**: `init` コマンドのコミット前に、metadata.jsonのマスキングを確実に実行する。

**詳細要件**:
- **FR-4.1**: `src/core/git/commit-manager.ts` の `commitWorkflowInit()` メソッド修正
  - metadata.json作成直後、コミット前にマスキング処理を実行

- **FR-4.2**: マスキング結果のログ出力
  - マスクされたシークレット数を表示（`secretsMasked > 0` の場合）
  - 例: `[INFO] Masked 1 secret in metadata.json`

- **FR-4.3**: マスキング失敗時のエラーハンドリング
  - マスキング処理が失敗した場合、致命的エラーとして扱う
  - エラーメッセージ: `Cannot commit metadata.json with unmasked secrets`
  - コミットを中断し、エラーをスローする

**実装場所**: `src/core/git/commit-manager.ts`

---

## 3. 非機能要件

### NFR-1: セキュリティ要件（優先度: 高）

- **NFR-1.1**: トークン漏洩防止
  - metadata.jsonにGitHub Personal Access Tokenが平文で保存されないこと
  - Git履歴にトークンが残らないこと

- **NFR-1.2**: 多層防御（Defense in Depth）
  - URLサニタイズ（第1層）+ SecretMasker（第2層）による二重チェック
  - 片方が失敗しても、もう片方でカバーできること

- **NFR-1.3**: 正規表現の安全性
  - 正規表現は保守的に設計し、誤検出（正常な文字列を除去）を防ぐ
  - ReDoS（Regular Expression Denial of Service）脆弱性を持たない

### NFR-2: パフォーマンス要件（優先度: 中）

- **NFR-2.1**: init コマンド実行時間への影響
  - URLサニタイズ処理は10ms以内で完了すること
  - SecretMaskerのmetadata.jsonスキャンは50ms以内で完了すること

- **NFR-2.2**: metadata.jsonのファイルサイズ影響
  - metadata.jsonは数KB程度の小さいファイルであり、スキャン負荷は軽微

### NFR-3: 保守性・拡張性要件（優先度: 中）

- **NFR-3.1**: コードの可読性
  - `sanitizeGitUrl()` 関数はJSDoc形式のドキュメントを含む
  - 正規表現にはコメントで意図を説明

- **NFR-3.2**: テスト容易性
  - `sanitizeGitUrl()` は純粋関数（外部依存なし）でありユニットテストが容易
  - エッジケースを網羅したテストスイートを提供

- **NFR-3.3**: 拡張性
  - 新しいGitホスト（GitLab、Bitbucket等）への対応が容易
  - 正規表現パターンの追加・修正が容易

### NFR-4: 可用性・信頼性要件（優先度: 中）

- **NFR-4.1**: エラーハンドリング
  - 異常入力（null、undefined、空文字列）に対してもエラーをスローせず、フェイルセーフ動作
  - マスキング失敗時は致命的エラーとして扱い、トークン漏洩を防ぐ

- **NFR-4.2**: 後方互換性
  - 既存のワークフロー（過去に作成された `.ai-workflow/issue-*/metadata.json`）には影響しない
  - 新規 `init` コマンド実行時のみ適用

---

## 4. 制約事項

### 技術的制約

- **TC-1**: Git URL形式の多様性
  - GitHub、GitLab、Bitbucket等、様々なGitホストのURL形式に対応する必要がある
  - ポート番号付き、サブドメイン付き等のエッジケースも考慮

- **TC-2**: 既存アーキテクチャへの適合
  - 既存の `src/utils/` ディレクトリ構成に従う
  - `SecretMasker` の既存パターンを踏襲

- **TC-3**: TypeScript 型安全性
  - TypeScriptの型チェックをすべて通過すること
  - eslintルールに違反しないこと

### リソース制約

- **RC-1**: 開発工数
  - 見積もり: 10~14時間（Planning Documentより）
  - Phase 1（要件定義）: 1~2h
  - Phase 2（設計）: 2~3h
  - Phase 3（テストシナリオ）: 1~2h
  - Phase 4（実装）: 3~4h
  - Phase 5（テストコード実装）: 1.5~2h
  - Phase 6（テスト実行）: 0.5~1h
  - Phase 7（ドキュメント）: 0.5~1h
  - Phase 8（レポート）: 0.5h

### ポリシー制約

- **PC-1**: セキュリティポリシー
  - GitHub push protection を遵守
  - シークレット（Personal Access Token）をGit履歴に含まない

- **PC-2**: コーディング規約
  - 既存のTypeScriptコーディングスタイルに従う
  - JSDoc形式のドキュメントを提供

---

## 5. 前提条件

### システム環境

- **ENV-1**: Node.js 20以上
- **ENV-2**: TypeScript 5.x
- **ENV-3**: Git 2.x以上
- **ENV-4**: `simple-git` ライブラリ（既存依存）

### 依存コンポーネント

- **DEP-1**: `src/core/secret-masker.ts`（既存）
  - マスキングパターンの定義
  - ファイルスキャン機能

- **DEP-2**: `src/core/git/commit-manager.ts`（既存）
  - コミット前処理
  - SecretMaskerの統合

- **DEP-3**: `src/commands/init.ts`（既存）
  - remote URL取得
  - metadata.json作成

### 外部システム連携

- **EXT-1**: GitHub API
  - push protection機能との連携
  - トークン検出パターンはGitHubの仕様に依存

- **EXT-2**: Git remote
  - `git remote get-url origin` コマンドの出力形式に依存

---

## 6. 受け入れ基準

### AC-1: URLサニタイゼーション機能

**Given**: HTTPS形式のGit URLにトークンが含まれている
**When**: `sanitizeGitUrl()` 関数を呼び出す
**Then**: トークンが除去されたURLが返される

**テストケース**:
```typescript
// HTTPS + トークン（ghp_形式）
sanitizeGitUrl('https://ghp_xxxxxxxxxxxx@github.com/owner/repo.git')
// => 'https://github.com/owner/repo.git'

// HTTPS + トークン（github_pat_形式）
sanitizeGitUrl('https://github_pat_xxxxxxxxxxxx@github.com/owner/repo.git')
// => 'https://github.com/owner/repo.git'

// HTTPS + ユーザー:パスワード
sanitizeGitUrl('https://user:password@github.com/owner/repo.git')
// => 'https://github.com/owner/repo.git'

// SSH形式（変更なし）
sanitizeGitUrl('git@github.com:owner/repo.git')
// => 'git@github.com:owner/repo.git'

// 通常HTTPS（変更なし）
sanitizeGitUrl('https://github.com/owner/repo.git')
// => 'https://github.com/owner/repo.git'

// ポート番号付き
sanitizeGitUrl('https://token@github.com:443/owner/repo.git')
// => 'https://github.com:443/owner/repo.git'
```

---

### AC-2: init コマンドでのサニタイズ適用

**Given**: トークン埋め込みURLでリポジトリをクローンしている
**When**: `ai-workflow init --issue-url <URL>` を実行
**Then**: metadata.jsonにトークンが含まれず、サニタイズ済みURLが保存される

**検証手順**:
1. HTTPS + トークン形式でリポジトリをクローン
   ```bash
   git clone https://ghp_dummy123456789@github.com/owner/repo.git
   ```
2. init コマンド実行
   ```bash
   node dist/index.js init --issue-url https://github.com/owner/repo/issues/1
   ```
3. metadata.json確認
   ```bash
   cat .ai-workflow/issue-1/metadata.json | jq .target_repository.remote_url
   ```
4. **期待結果**: `"https://github.com/owner/repo.git"`（トークンなし）

---

### AC-3: SecretMasker によるmetadata.jsonスキャン

**Given**: metadata.jsonにトークンが含まれている（URLサニタイズが失敗したケース）
**When**: `commitWorkflowInit()` が実行される
**Then**: SecretMaskerがトークンをマスクし、コミット前に修正される

**検証手順**:
1. テスト用metadata.jsonを作成（意図的にトークンを含む）
2. `commitWorkflowInit()` を実行
3. マスキング結果を確認
   - ログに `[INFO] Masked 1 secret in metadata.json` が出力される
   - metadata.json内のトークンが `***` にマスクされている

---

### AC-4: GitHub push protection 違反の解消

**Given**: トークン埋め込みURLでワークフローを初期化
**When**: init コミットをリモートにpushする
**Then**: GitHub push protectionによる拒否が発生せず、pushが成功する

**検証手順**:
1. HTTPS + トークン形式でリポジトリをクローン
2. init コマンド実行
3. git pushの結果を確認
4. **期待結果**: push成功（`GH013` エラーが発生しない）

---

### AC-5: 既存ワークフローへの影響なし

**Given**: 過去に作成された `.ai-workflow/issue-*/metadata.json` が存在する
**When**: 新規issue（別番号）でinit コマンドを実行
**Then**: 既存のmetadata.jsonは変更されない

**検証手順**:
1. 既存ワークフローのmetadata.jsonのタイムスタンプを記録
2. 新規issueでinit実行
3. 既存metadata.jsonのタイムスタンプが変更されていないことを確認

---

### AC-6: エラーハンドリング

**Given**: マスキング処理が失敗する（ファイルアクセスエラー等）
**When**: `commitWorkflowInit()` が実行される
**Then**: エラーがスローされ、コミットが中断される

**検証手順**:
1. metadata.jsonを読み取り専用に設定
2. `commitWorkflowInit()` を実行
3. **期待結果**: `Cannot commit metadata.json with unmasked secrets` エラーがスロー

---

## 7. スコープ外

以下の項目は本Issue（#54）のスコープ外とし、将来的な拡張候補とします：

### OUT-1: 既存ワークフローの自動修正
- **説明**: 過去に作成された `.ai-workflow/issue-*/metadata.json` に含まれるトークンの自動削除
- **理由**: 既存Gitコミット履歴の書き換えはリスクが高い
- **対応方法**: TROUBLESHOOTING.mdに手動修正手順を記載

### OUT-2: GitLab、Bitbucket等の専用対応
- **説明**: GitLab、Bitbucketのトークン形式に特化したサニタイズロジック
- **理由**: 現在の正規表現（`https://[^@]+@`）で基本的な形式はカバー可能
- **対応方法**: エッジケースが発見された場合、別Issueで対応

### OUT-3: リモートリポジトリのトークン削除通知
- **説明**: トークンが検出された場合、GitHubに自動通知（トークン無効化推奨）
- **理由**: GitHub APIの仕様確認と、ユーザー通知フローの設計が必要
- **対応方法**: 警告ログ出力のみ（本Issue）、通知機能は別Issueで検討

### OUT-4: SSH URLへの変換
- **説明**: HTTPS URLを自動的にSSH URL（`git@github.com:owner/repo.git`）に変換
- **理由**: ユーザーのクローン方法（HTTPS vs SSH）は意図的な選択の可能性
- **対応方法**: 現在のURL形式を維持し、トークンのみ除去

---

## 8. 品質ゲート検証

本要件定義書は、以下の品質ゲート（Phase 1必須要件）を満たしています：

### ✅ QG-1: 機能要件が明確に記載されている
- FR-1〜FR-4として4つの機能要件を定義
- 各要件に詳細サブ要件（FR-1.1〜FR-4.3）を記載
- 実装場所、関数シグネチャ、具体例を明示

### ✅ QG-2: 受け入れ基準が定義されている
- AC-1〜AC-6として6つの受け入れ基準を定義
- Given-When-Then形式で記述
- 具体的な検証手順とテストケースを提供

### ✅ QG-3: スコープが明確である
- 機能要件（FR-1〜FR-4）でスコープ内を定義
- スコープ外（OUT-1〜OUT-4）を明示
- 将来拡張候補として整理

### ✅ QG-4: 論理的な矛盾がない
- Planning Documentの戦略（EXTEND、UNIT_INTEGRATION、BOTH_TEST）と整合
- 機能要件と非機能要件が矛盾しない（例: セキュリティ要件 vs パフォーマンス要件のバランス）
- 受け入れ基準が機能要件をすべてカバー

---

## 9. 追加情報

### 設計上の考慮事項

**Defense in Depth（多層防御）パターン**:
- **第1層**: URLサニタイズ（`sanitizeGitUrl()`）
  - 根本原因を解決（トークンがmetadataに含まれない）
- **第2層**: SecretMasker（`metadata.json` スキャン）
  - 万が一URLサニタイズが失敗しても、コミット前にマスク
- **第3層**: GitHub push protection
  - 最終防衛ライン（本Issueで第1・第2層を追加することで、この層まで到達しない）

### リスク管理

Planning Documentで特定されたリスクへの対応：

| リスク | 影響度 | 確率 | 軽減策（本要件定義での対応） |
|--------|--------|------|------------------------------|
| Git URL形式の多様性 | 中 | 中 | FR-1.6（ポート番号対応）、AC-1（網羅的テストケース）、保守的な正規表現設計 |
| 正規表現の誤検出・見逃し | 高 | 低 | NFR-1.3（正規表現の安全性）、FR-3（SecretMaskerによる二重チェック） |
| 既存ワークフローへの影響 | 低 | 低 | NFR-4.2（後方互換性）、AC-5（既存metadata.json不変） |
| SecretMaskerのパフォーマンス影響 | 低 | 低 | NFR-2.2（metadata.jsonは数KB程度、スキャン負荷は軽微） |
| テスト環境でのトークン埋め込み | 中 | 低 | AC-2検証手順（ダミートークン使用）、統合テストでの注意事項 |

### 参考資料

- **GitHub Push Protection**: https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations
- **Git URL形式**: https://git-scm.com/docs/git-clone#_git_urls
- **TypeScript プロジェクト構成**: @ARCHITECTURE.md
- **セキュリティガイドライン**: @CLAUDE.md (セキュリティ対策セクション)

---

**作成日**: 2025-01-21
**作成者**: AI Workflow Agent (Requirements Phase)
**レビュー状態**: 未レビュー（Phase 1: Review待ち）
