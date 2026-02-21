# resolve-conflict コマンドガイド

`resolve-conflict` は、Pull Request に発生したマージコンフリクトを AI エージェントで分析・解消するためのコマンドです。`pr-comment` と同様に 4 フェーズ構成（init → analyze → execute → finalize）で進みます。

## 前提条件

- ローカルに対象リポジトリが存在すること
- 作業ツリーがクリーンであること
- `GITHUB_TOKEN` と `GITHUB_REPOSITORY`（`owner/repo` 形式）が設定されていること
- エージェント認証（Codex または Claude）が有効であること

## クイックスタート

```bash
# 1) 初期化
node dist/index.js resolve-conflict init \
  --pr-url https://github.com/owner/repo/pull/123

# 2) 分析と解消計画の作成
node dist/index.js resolve-conflict analyze \
  --pr-url https://github.com/owner/repo/pull/123 \
  --agent auto

# 3) 解消の実行（dry-run でプレビュー）
node dist/index.js resolve-conflict execute \
  --pr-url https://github.com/owner/repo/pull/123 \
  --dry-run

# 4) 解消結果の反映と PR コメント投稿
node dist/index.js resolve-conflict finalize \
  --pr-url https://github.com/owner/repo/pull/123 \
  --push
```

## フェーズ別の挙動

### init

- PR 情報と mergeable 状態を取得
- base/head ブランチを fetch
- メタデータを `.ai-workflow/conflict-<pr>/metadata.json` に作成

### analyze

- `git merge --no-commit` でコンフリクトを再現
- コンフリクトマーカーを解析して文脈を収集
- 解消計画を生成し、`resolution-plan.json` と `resolution-plan.md` に保存

### execute

- 解消計画を読み込み、AI による解消を実行
- 変更を適用し、必要に応じてコミット
- `resolution-result.json` と `resolution-result.md` を保存
- `--dry-run` ではファイル書き込みとコミットは行わない

### finalize

- `--push` 指定時にリモートへ push
- 解消結果を PR にコメント投稿
- メタデータをクリーンアップ

## 生成される成果物

- `.ai-workflow/conflict-<pr>/metadata.json`
- `.ai-workflow/conflict-<pr>/resolution-plan.json`
- `.ai-workflow/conflict-<pr>/resolution-plan.md`
- `.ai-workflow/conflict-<pr>/resolution-result.json`
- `.ai-workflow/conflict-<pr>/resolution-result.md`

## 安全性と制約

- `.env` や `*.pem` など機密ファイルは自動解消対象から除外されます
- 解消後の内容にコンフリクトマーカーが残る場合はエラーになります
- 作業ツリーが汚れている場合は analyze が中断されます

## Jenkins 統合

Jenkins 環境では、`AI_Workflow/{develop,stable-1〜9}/resolve_conflict` ジョブとして実行できます。

### Jenkins パラメータ

| Jenkins パラメータ | CLI オプション | デフォルト値 | 説明 |
|------------------|--------------|-------------|------|
| EXECUTION_MODE | - | resolve_conflict | 実行モード（固定値） |
| PR_URL | --pr-url | - | 対象 Pull Request URL（必須） |
| GITHUB_REPOSITORY | - | - | owner/repo 形式のリポジトリ識別子（必須） |
| AGENT_MODE | --agent | auto | エージェントモード（auto/codex/claude） |
| LANGUAGE | --language | ja | 出力言語（ja/en） |
| DRY_RUN | --dry-run | false | ドライランモード |
| PUSH | --push | true | finalize 時にリモートへ push するか |
| SQUASH | --squash | false | コミットをスカッシュするか |

### Jenkins 実行例

```
# Jenkins でパラメータ設定
PR_URL: https://github.com/owner/repo/pull/123
GITHUB_REPOSITORY: owner/repo
AGENT_MODE: auto
DRY_RUN: false
PUSH: true
SQUASH: false

# 上記は以下の CLI 実行と等価（4フェーズを順次実行）
node dist/index.js resolve-conflict init --pr-url https://github.com/owner/repo/pull/123
node dist/index.js resolve-conflict analyze --pr-url https://github.com/owner/repo/pull/123 --agent auto
node dist/index.js resolve-conflict execute --pr-url https://github.com/owner/repo/pull/123
node dist/index.js resolve-conflict finalize --pr-url https://github.com/owner/repo/pull/123 --push
```

### Jenkins 実行の特徴

- Docker エージェント内でリポジトリが自動クローンされます
- `REPOS_ROOT` 環境変数でリポジトリの親ディレクトリを指定できます
- 4フェーズ（init → analyze → execute → finalize）が単一ジョブ内で順次実行されます
- `DRY_RUN=true` の場合、`finalize --push` は自動的に無効化されます（安全策）
- PR URL と認証情報（`GITHUB_TOKEN`、API キー）は nonStoredPasswordParam として保護されます

詳細は [jenkins/README.md](../jenkins/README.md) を参照してください。

## トラブルシューティング

- `Metadata not found` が出る場合は `resolve-conflict init` を先に実行してください
- `Working tree is not clean` が出る場合は変更をコミットまたはスタッシュしてください
- `Conflict markers remain` が出る場合は、解消計画や出力を確認し、必要なら手動修正してください
