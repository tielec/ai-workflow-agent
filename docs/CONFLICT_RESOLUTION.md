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

## トラブルシューティング

- `Metadata not found` が出る場合は `resolve-conflict init` を先に実行してください
- `Working tree is not clean` が出る場合は変更をコミットまたはスタッシュしてください
- `Conflict markers remain` が出る場合は、解消計画や出力を確認し、必要なら手動修正してください
