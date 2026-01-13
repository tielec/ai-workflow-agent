# トラブルシューティング ― AI Workflow v2 (TypeScript)

TypeScript CLI をローカルまたは Jenkins で利用する際によく発生する事象と対処方法をまとめました。

## 0. システム要件

### Node.js バージョン要件

**最低バージョン**: Node.js 15.0.0以降

**理由**:
- `String.prototype.replaceAll()` メソッドが Node.js 15.0.0 以降で利用可能です
- Issue #140、Issue #161 のセキュリティ修正により、Claude Agent Client および Codex Agent Client の `fillTemplate` メソッドで `replaceAll()` を使用しています
- これにより ReDoS（Regular Expression Denial of Service）脆弱性を完全に排除しています

**推奨バージョン**: Node.js 18.x 以降（LTS版）

**確認方法**:
```bash
node --version
# v18.0.0 以降であれば問題なし
```

**Node.js のアップグレード**:
```bash
# nvm を使用している場合
nvm install 18
nvm use 18

# または最新のLTS版をインストール
nvm install --lts
nvm use --lts
```

**互換性マトリックス**:
| Node.js バージョン | AI Workflow サポート | `replaceAll()` サポート |
|-------------------|---------------------|------------------------|
| 14.x 以前         | ❌ 非対応            | ❌ 利用不可            |
| 15.x - 16.x       | ✅ 動作可能          | ✅ 利用可能            |
| 18.x (LTS)        | ✅ 推奨              | ✅ 利用可能            |
| 20.x (LTS)        | ✅ 推奨              | ✅ 利用可能            |

**関連Issue**: Issue #140 (Claude Agent Client ReDoS脆弱性の修正), Issue #161 (Codex Agent Client ReDoS脆弱性の修正)

## 1. Codex CLI 関連

### `exceeded retry limit, last status: 401 Unauthorized`

- `CODEX_API_KEY`（または `OPENAI_API_KEY`）がデフォルトの `gpt-5.1-codex-max`（エイリアス: `max`）に対応した高推論キーか確認します。旧モデルしか利用できない場合は CLI 実行時に `--codex-model legacy` を付与するか、環境変数 `CODEX_MODEL=legacy` を設定してください。
- 旧来の `auth.json` は使用せず、API キーのみを渡してください。
- CLI の疎通チェック:
  ```bash
  codex exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox - <<'EOF'
  You are Codex. Reply "pong".
  EOF
  ```

### `codex: command not found`

- グローバルにインストールします: `npm install -g @openai/codex`
- PATH を通すか、`CODEX_CLI_PATH` に実行ファイルのパスを指定します（Jenkins / Docker でも同様）。

### `Failed to open stdin pipe for child process`

**症状**:
```
[ERROR] Failed to open stdin pipe for child process
```

**原因**:
- Codex CLI の子プロセス起動時に stdin パイプのオープンに失敗した
- リソース制約環境（CI/CD、コンテナ環境）でファイルディスクリプタが不足している可能性

**対処法**:
1. **リトライ**: エラーが適切に伝播するため、コマンドを再実行すると成功する可能性があります
2. **システムリソース確認**: ファイルディスクリプタの上限を確認
   ```bash
   ulimit -n  # 現在の上限を表示
   ulimit -n 4096  # 上限を増やす（必要に応じて）
   ```
3. **プロセス競合の確認**: 同時に実行中の Codex プロセス数を減らす
4. **コンテナリソース**: Docker コンテナの場合、リソース制限を緩和する

**デバッグ方法**:
- エージェントログ（`agent_log.md`）でエラーの詳細を確認
- システムログで stdin パイプ関連のエラーを確認
- タイムアウトではなく即座にエラーが返される場合、この問題の可能性が高い

**影響範囲**:
- すべての Codex エージェント通信（`executeTask()`, `executeTaskFromFile()` 経由）
- 正常系フロー（stdin が正常に開かれる場合）には影響なし

**注意**: v0.5.0 以降（Issue #150）では、stdin パイプ失敗時に即座に明確なエラーメッセージが返されるようになりました。以前のバージョンでは、タイムアウトまでハングしていました。

## 2. Claude Code 関連

### `Claude Code credentials are not configured`

- Jenkins では Base64 化した `credentials.json` を渡し、パイプラインでデコードして配置します。
- ローカルでは `export CLAUDE_CODE_CREDENTIALS_PATH="$HOME/.claude-code/credentials.json"` を設定。
- `Invalid bearer token` が出た場合は `claude login` を再実行します。

## 3. GitHub 連携

### `GITHUB_TOKEN and GITHUB_REPOSITORY are required`

- 両方の環境変数が設定されているか確認します。
- PAT のスコープは `repo` が必要です。
- Jenkins では `github-token` のシークレットが存在するか、ジョブ DSL を再適用してください。

### API レート制限 / Abuse Detection

- 同時実行ジョブを減らす、または時間を置いて再実行します。
- CLI 内でのリトライを待っても回復しない場合はリセットを待つしかありません（通常 1 時間あたり 5,000 リクエスト）。

### GitHub Push Protection エラー（`GH013`）

`init` コマンド実行時にGitHub Personal Access Tokenを含むURLでリポジトリをクローンした場合、push protectionによりコミットが拒否される可能性があります。

**症状**:
```
remote: error GH013: Repository rule violations found for refs/heads/ai-workflow/issue-123.
remote: — Push cannot contain secrets
```

**原因**:
- HTTPS形式でクローンした際、URLにトークンが埋め込まれている（例: `https://ghp_xxxxx@github.com/owner/repo.git`）
- v0.3.1以降では、`init`コマンド実行時にトークンが自動的に除去されますが、既存のワークフローでは手動対応が必要です

**対処法（v0.3.1以降）**:
- 新規ワークフローでは自動的にトークンが除去されるため、対処不要です
- `init`コマンド実行時に警告ログが表示されます:
  ```
  [WARNING] GitHub Personal Access Token detected in remote URL. Token has been removed from metadata.
  ```

**対処法（既存ワークフロー）**:

**方法1: マイグレーションコマンド使用（推奨、v0.3.1で追加）**:
```bash
# すべての既存メタデータからトークンを除去
ai-workflow migrate --sanitize-tokens

# ドライランで確認してから実行
ai-workflow migrate --sanitize-tokens --dry-run
ai-workflow migrate --sanitize-tokens

# 特定のIssueのみ対象
ai-workflow migrate --sanitize-tokens --issue 123
```

**方法2: 手動修正**:
1. `.ai-workflow/issue-*/metadata.json` を開く
2. `target_repository.remote_url` フィールドからトークンを手動で削除:
   ```json
   {
     "target_repository": {
       "remote_url": "https://github.com/owner/repo.git"
     }
   }
   ```
3. 変更をコミット＆プッシュ

**自動シークレットマスキング機能（Issue #488で拡張）**:

v0.5.1以降では、SecretMaskerクラスが拡張され、ワークフローファイル内のシークレット情報を自動的に検出・マスキングし、GitHub Push Protectionによるプッシュブロックを防ぎます：

- **自動マスキング対象**:
  - GitHub Personal Access Token (`ghp_*`)
  - GitHub Fine-grained Token (`github_pat_*`)
  - Email アドレス
  - 汎用トークン（20文字以上）
  - Bearer トークン
  - token= 形式

- **処理タイミング**: コミット作成時に `.ai-workflow/issue-*/` 内のファイル（agent_log_raw.txt, agent_log.md, prompt.txt, metadata.json）を自動スキャン
- **マスキング方式**: 環境変数マッチング + 汎用パターンマッチングの2段階処理

**Issue #592・Issue #595・Issue #622 対応**:
- `/tmp/.../sd-platform-development` のような長いディレクトリ名は SecretMasker の汎用トークンマスキングから除外され、ログ内のリポジトリパスが保持されることで Claude/Codex が正しい作業ディレクトリを参照できるようになりました。
- **Issue #595 で更なる改善**: 環境変数値がパス成分のsubstringを含む場合（例: GITHUB_TOKEN = `"ghp_xxxxxxxxxxdevelopmentxxxxxxxxx"`）でも、パス保護が環境変数置換より先に実行されるため、リポジトリパス（例: `/sd-platform-development/`）が誤ってマスクされることがなくなりました。
- **Issue #622 で metadata.json 特別扱い**: metadata.json の `target_repository.repo` 等のリポジトリ情報が誤ってマスキングされ、finalize コマンドで 404 エラーが発生する問題を修正。metadata.json は構造化データとして処理され、`ignoredPaths` でリポジトリ情報を保護しつつ実際のシークレットはマスキングされます。
- `working-directory-resolver.ts` は REPOS_ROOT との整合性チェックとパス解決の前後ログを追加しており、REPOS_ROOT 外で解決すると `[Issue #592 Warning] Resolved path (...) is outside REPOS_ROOT (...)` を出力するので、警告が出たら REPOS_ROOT 設定やパスマスキングの影響を確認してください。

### Execute step writes files to the wrong directory (Issue #603)

**Symptoms**:
- `[Issue #603]` debug logs show the validated working directory differs from `process.cwd()` or from `metadata.target_repository.path`
- Post-execute validation fails with a message that expected outputs are missing or would be written outside the target repository

**Causes**:
- `metadata.target_repository.path` points to a missing or moved repository
- `REPOS_ROOT` is unset or points to a different workspace than the metadata path
- Path masking altered the path before validation (check upstream SecretMasker logs)

**Resolutions**:
1. Verify the target path exists and matches metadata:
   ```bash
   jq -r '.target_repository.path' .ai-workflow/issue-*/metadata.json
   ls -la <path_from_metadata>
   ```
2. Ensure `REPOS_ROOT` matches the parent of the target repository before running `execute`:
   ```bash
   export REPOS_ROOT="/tmp/ai-workflow-repos-14-807707ed"
   ```
3. Re-run the step; if `[Issue #603]` logs still show divergence, fix the metadata path (re-run `init` if needed) rather than relying on `process.cwd()`—the fallback is intentionally disabled.
4. If artifact validation fails, check the logged expected output path and recreate the missing directory inside the target repo, then rerun the phase.

**予防策**:
- SSH形式でリポジトリをクローンする（推奨）:
  ```bash
  git clone git@github.com:owner/repo.git
  ```
- HTTPS形式でクローンする場合、トークンを含めない:
  ```bash
  git clone https://github.com/owner/repo.git
  ```

## 4. メタデータ / 再開

### `Workflow not found. Run init first.`

- 実行前に `ai-workflow-v2 init --issue-url ...` を行っているか確認。
- `.ai-workflow/issue-*/metadata.json` が存在するか、権限があるかを確認します。

### フェーズ状態が想定外

- `--force-reset` でワークフロー状態を初期化できます:
  ```bash
  node dist/index.js execute --phase all --issue 385 --force-reset
  ```
- Issue メタデータは保持され、フェーズ状態のみ `pending` に戻ります。

### フェーズステータスが `in_progress` のまま完了しない（Issue #248で改善）

preset実行時にフェーズステータスが `in_progress` のまま `completed` にならない場合：

**症状**:
```
# metadata.json を確認
cat .ai-workflow/issue-*/metadata.json | jq '.phases.design.status'
# 出力: "in_progress"  ← 本来は "completed" であるべき
```

**原因**:
- フェーズ完了時のステータス更新漏れ
- revise ステップ失敗時の例外処理でステータスが更新されていない
- レビュー最大リトライ超過時にステータスが更新されていない

**対処法（v0.5.0 以降、Issue #248で改善）**:

v0.5.0 以降では、以下の改善により自動的にステータスが更新されます：

1. **finalizePhase() による確実な更新**: フェーズ完了時にステータスを `completed` に更新
2. **ensurePhaseStatusUpdated() による自動修正**: `finally` ブロックでステータス更新漏れを検出し自動修正
3. **handlePhaseError() によるエラー時更新**: エラー発生時にステータスを `failed` に更新
4. **revise失敗時の更新**: 例外スロー前にステータスを `failed` に更新

**手動確認方法**:
```bash
# フェーズステータスを確認
cat .ai-workflow/issue-*/metadata.json | jq '.phases | to_entries | map({phase: .key, status: .value.status})'

# 不正なステータス遷移の警告ログを確認（completed → in_progress 等）
grep -i "invalid status transition" .ai-workflow/issue-*/0*_*/execute/agent_log.md
```

**手動修正（緊急時のみ）**:
```bash
# ステータスを completed に変更
jq '.phases.design.status = "completed"' \
  .ai-workflow/issue-*/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-*/metadata.json

# 変更をコミット
git add .ai-workflow/issue-*/metadata.json
git commit -m "[ai-workflow] Fix phase status manually"
git push
```

**予防策**:
- v0.5.0 以降を使用する（自動修正機能が含まれる）
- finally ブロックによるステータス更新保証が動作する
- 冪等性チェックにより重複更新を最適化

**関連改善**:
- **冪等性チェック**: 同じステータスへの重複更新をスキップ（不要なファイル書き込みを削減）
- **ステータス遷移バリデーション**: 不正な遷移（completed → in_progress 等）を検出して警告ログを出力

## 5. Docker / Jenkins

### Codex ログが空になる

- Jenkins 側で `stdout` が途中で切れていないか確認します。
- TypeScript 版では `agent_log_raw.txt`（JSON）と Markdown 形式の `agent_log.md` の両方に書き込みます（Issue #441によりMarkdown形式が統一）。Markdown が空の場合は、`.ai-workflow/.../execute/` の書き込み権限やディスク残量を確認してください。

### `spawn codex ENOENT`

- `CODEX_CLI_PATH=/usr/local/bin/codex` など、実際のパスを設定します。
- Docker イメージ内で Codex CLI がインストールされているか（`Dockerfile` の `npm install -g @openai/codex`）を確認。

### Jenkins パラメータが表示されない

- `jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy` で `AGENT_MODE` を定義しています。シードジョブを再実行して DSL を再適用してください。

## 6. マルチリポジトリ対応関連

### `Repository '<repo-name>' not found`

- ローカルに対象リポジトリがクローンされているか確認します。
- 環境変数 `REPOS_ROOT` が正しく設定されているか確認します:
  ```bash
  export REPOS_ROOT="$HOME/projects"  # リポジトリの親ディレクトリ
  ```
- `REPOS_ROOT` が未設定の場合、以下の候補パスが自動探索されます:
  - `~/TIELEC/development/<repo-name>`
  - `~/projects/<repo-name>`
  - `<current-repo>/../<repo-name>`
- 対象リポジトリに `.git` ディレクトリが存在するか確認します（Git リポジトリとして認識される条件）。

### auto-issue コマンドが対象リポジトリではなくワークスペースを解析してしまう（Issue #153）

Jenkins環境で `auto-issue` コマンドを実行すると、対象リポジトリではなくJenkinsワークスペースを解析してしまう場合があります。

**症状**:
```
[ERROR] Repository 'target-repo' not found locally
```
または、誤ったリポジトリ（Jenkinsワークスペース）を解析してしまう

**原因**:
- `REPOS_ROOT` 環境変数が設定されていない（Jenkins環境では必須）
- `GITHUB_REPOSITORY` 環境変数から対象リポジトリ名を取得しているが、リポジトリパスの解決に失敗している

**対処法（Jenkins環境）**:
1. Jenkinsfile の Setup Environment stage で `REPOS_ROOT` を設定:
   ```groovy
   stage('Setup Environment') {
       steps {
           script {
               env.REPOS_ROOT = env.WORKSPACE
           }
       }
   }
   ```
2. `GITHUB_REPOSITORY` 環境変数が正しく設定されているか確認:
   ```bash
   echo $GITHUB_REPOSITORY
   # 出力例: owner/repo-name
   ```
3. リポジトリが `$REPOS_ROOT/<repo-name>` に存在するか確認:
   ```bash
   ls -la $REPOS_ROOT/
   ```

**対処法（ローカル環境）**:
- ローカル環境では `REPOS_ROOT` は任意です。未設定の場合、以下のフォールバック候補パスが自動探索されます:
  - `~/TIELEC/development/<repo-name>`
  - `~/projects/<repo-name>`
  - `<current-repo>/../<repo-name>`

**確認方法**:
```bash
# auto-issue コマンドのログで以下を確認
# - GitHub repository: owner/repo-name
# - Resolved repository path: /path/to/repo
# - REPOS_ROOT: /path/to/repos (または "(not set)")
```

**関連ドキュメント**: README.md の環境変数セクション、CLAUDE.md の auto-issue セクションを参照してください。

### JSONパース失敗によるauto-issue実行失敗（Issue #589で改善）

`auto-issue` コマンド実行時に、Codex/Claude エージェントが生成したJSONファイルのパースに失敗する場合があります。

**症状**:
```
[WARNING] Failed to parse agent output JSON
[INFO] Saved invalid JSON backup for debugging
```
または、日本語文字を含むカスタムインストラクション（`--custom-instruction`）を使用した際にIssueが作成されない

**原因**:
- エージェントが生成したJSONに日本語文字のエスケープ不備（引用符、改行文字等）が含まれている
- `cat <<'EOF'` 形式でJSONを出力した際のエスケープ処理の問題

**改善内容（v0.5.0以降、Issue #589）**:
1. **エラーハンドリング強化**: JSONパース失敗時にファイル内容全体をエラーログに出力
2. **バックアップファイル生成**: 無効なJSONファイルを `.invalid.json` サフィックス付きで保存
3. **プロンプト改善**: JSON生成ガイドライン（特殊文字エスケープ、Writeツール使用推奨）をプロンプトに追記

**対処法**:

**1. バックアップファイルの確認**:
```bash
# 無効JSONのバックアップファイルを探す
find /tmp -name "*.invalid.json" 2>/dev/null

# バックアップファイルの内容確認
cat /tmp/auto-issue-refactor-*.invalid.json
```

**2. エラーログの確認**:
```bash
# auto-issueコマンドのログでJSONパース失敗を確認
grep -i "failed to parse" ~/.ai-workflow.log

# ファイル内容のデバッグ情報を確認
grep -A 20 "File content for debugging" ~/.ai-workflow.log
```

**3. エージェント切り替えによる再試行**:
```bash
# Codexエージェントで失敗した場合、Claudeに切り替え
ai-workflow auto-issue --category refactor --agent claude

# Claudeエージェントで失敗した場合、Codexに切り替え
ai-workflow auto-issue --category refactor --agent codex
```

**4. カスタムインストラクションの見直し**:
```bash
# 日本語文字を含む場合、シンプルな英語表現に変更
ai-workflow auto-issue --category bugs --custom-instruction "Focus on memory leaks"
```

**予防策**:
- v0.5.0以降では、プロンプト改善によりJSON生成品質が向上し、パース失敗の頻度が大幅に減少しています
- エージェントに対してWriteツール（`cat <<'EOF'` ではなく）の使用を推奨するガイドラインが追加されました
- エスケープ不備の問題は根本的に軽減されています

**注意**: バックアップファイル（`.invalid.json`）は自動的には削除されません。デバッグ完了後は手動で削除してください。

### `Workflow metadata for issue <number> not found`

- `execute` コマンドで Issue 番号を指定した際、対応するメタデータが見つからない場合に発生します。
- `init` コマンドを先に実行したか確認します。
- `.ai-workflow/issue-<number>/metadata.json` が対象リポジトリ配下に存在するか確認します。
- 複数のリポジトリに同じ Issue 番号のメタデータがある場合、最初に見つかったものが使用されます。

### 後方互換性の警告: `target_repository not found in metadata`

- 既存のワークフロー（v0.2.0 より前に作成）の場合に表示される警告メッセージです。
- 警告が表示されても、実行環境のリポジトリを使用して正常に動作します。
- 新しいスキーマに移行するには、`init` コマンドを再実行してください。

## 7. プリセット関連

### `Unknown preset: <name>`

- プリセット名が存在しません。`--list-presets` で利用可能なプリセット一覧を確認してください:
  ```bash
  node dist/index.js execute --list-presets
  ```
- 旧プリセット名（`requirements-only`, `design-phase`, `implementation-phase`, `full-workflow`）は非推奨ですが、6ヶ月間は動作します（警告が表示されます）。

### プリセット実行時の依存関係エラー

- プリセットに含まれるフェーズの依存関係が満たされていない場合、エラーメッセージが表示されます:
  ```
  [ERROR] Phase "implementation" requires the following phases to be completed:
    ✗ planning - NOT COMPLETED
    ✗ requirements - NOT COMPLETED
  ```
- **対処法**:
  1. 必要なフェーズを先に実行する
  2. `--phase all` で全フェーズを実行
  3. `--ignore-dependencies` で警告のみ表示して実行継続（非推奨）

### `full-workflow` プリセットが使えない

- `full-workflow` プリセットは削除されました。代わりに `--phase all` を使用してください:
  ```bash
  node dist/index.js execute --phase all --issue 385
  ```

## 8. ワークフローログクリーンアップ関連

### デバッグログが見つからない

Report Phase (Phase 8) 完了後、`execute/`, `review/`, `revise/` ディレクトリは自動的に削除されます。

- **対処法**: デバッグログが必要な場合は、Report Phase 実行前に該当ディレクトリをバックアップしてください。
- **確認方法**: `metadata.json` と `output/*.md` は保持されるため、フェーズの成果物は常に参照可能です。
- **Planning Phase**: `00_planning/` ディレクトリは削除対象外のため、常に利用可能です。

### クリーンアップ失敗時の対処

クリーンアップが失敗した場合でも、WARNING ログが出力されるだけでワークフロー全体は継続します：

```
[WARNING] Failed to cleanup workflow logs: <error message>
```

- **手動クリーンアップ**: 必要に応じて手動で削除できます:
  ```bash
  # 特定のフェーズのexecuteディレクトリを削除
  rm -rf .ai-workflow/issue-*/01_requirements/execute

  # すべてのフェーズのデバッグログを削除
  find .ai-workflow/issue-*/ -type d \( -name "execute" -o -name "review" -o -name "revise" \) -exec rm -rf {} +
  ```

### クリーンアップをスキップしたい場合

現在の実装では、Report Phase 実行時に常にクリーンアップが実行されます。スキップする方法はありません。デバッグログを保持したい場合は、Report Phase 実行前に手動でバックアップを取得してください。

## 9. Evaluation Phase クリーンアップ関連（v0.3.0）

### ワークフローディレクトリ全体が削除された

Evaluation Phase で `--cleanup-on-complete` オプションを使用すると、`.ai-workflow/issue-*` ディレクトリ全体が削除されます。

- **対処法**: 削除は Git にコミットされるため、必要に応じて Git の履歴から復元できます:
  ```bash
  # 削除される前のコミットを確認
  git log --all --full-history -- .ai-workflow/issue-123/

  # 特定のコミットからファイルを復元
  git checkout <commit-hash> -- .ai-workflow/issue-123/
  ```
- **注意**: デフォルトでは削除されません。`--cleanup-on-complete` オプションを明示的に指定した場合のみ実行されます。

### 確認プロンプトが表示されて CI ビルドがハングする

CI環境で確認プロンプトが表示されると、ビルドが無期限に待機します。

- **対処法**: CI環境では以下のいずれかを使用してください:
  1. `--cleanup-on-complete-force` オプションで確認をスキップ:
     ```bash
     node dist/index.js execute --issue 123 --phase evaluation \
       --cleanup-on-complete --cleanup-on-complete-force
     ```
  2. 環境変数 `CI=true` を設定（自動的に確認をスキップ）:
     ```bash
     export CI=true
     node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete
     ```

### クリーンアップで不正なパスエラー

`Invalid workflow directory path` エラーが発生する場合、メタデータの `workflowDir` が不正な形式です。

- **原因**: `.ai-workflow/issue-<NUM>` 形式以外のパスが設定されている
- **対処法**: `metadata.json` の `workflowDir` フィールドを確認し、正しい形式に修正してください:
  ```json
  {
    "workflowDir": ".ai-workflow/issue-123"
  }
  ```

### シンボリックリンクエラー

`Workflow directory is a symbolic link` エラーが発生する場合、セキュリティ保護が動作しています。

- **原因**: `.ai-workflow/issue-*` がシンボリックリンクになっている
- **対処法**: セキュリティ上の理由により、シンボリックリンクのクリーンアップは禁止されています。実際のディレクトリを使用してください。

## 10. ステップレジューム関連（v0.3.0）

### 完了済みステップが再実行される

各ステップ（execute/review/revise）完了後に自動的にGitコミット＆プッシュが実行されますが、プッシュに失敗すると完了済みとして記録されません。

- **原因**: プッシュ失敗時、ローカルコミットは作成されますが `completed_steps` には追加されません
- **対処法**:
  1. ネットワーク問題を解決してから再実行
  2. `metadata.json` の `current_step` を確認（失敗したステップ名が設定されている）
  3. 次回実行時、同じステップが最初から再実行されます
- **確認方法**:
  ```bash
  cat .ai-workflow/issue-*/metadata.json | jq '.phases.requirements'
  # current_step が null でない場合、プッシュ失敗の可能性
  ```

### メタデータ不整合エラー

`current_step` と `completed_steps` に矛盾がある場合、警告が表示されます：

```
[WARNING] Metadata inconsistency detected: current_step is 'execute' but already in completed_steps
```

- **原因**: メタデータの手動編集またはバグ
- **対処法**: `current_step` が優先され、安全側（最初から再実行）にフォールバックします
- **推奨**: メタデータを手動編集しないでください

### CI環境でのステップスキップが動作しない

CI環境（Jenkins等）でワークスペースリセット後、完了済みステップがスキップされない場合：

- **原因**: リモートブランチからメタデータが同期されていない
- **対処法**:
  1. ビルド開始時に `git pull origin <branch>` が実行されているか確認
  2. `.ai-workflow/issue-*/metadata.json` がリモートブランチに存在するか確認
  3. ビルドログで「Skipping <step> step (already completed)」メッセージを確認
- **デバッグ**:
  ```bash
  # リモートブランチのメタデータを確認
  git show origin/ai-workflow/issue-123:.ai-workflow/issue-123/metadata.json | jq '.phases'
  ```

## 11. メタデータ整合性関連（v0.5.0、Issue #208）

### ロールバック失敗: `phase has not been started yet`

**症状**:
```
[ERROR] Cannot rollback to phase 'test_implementation' because it has not been started yet.
```

しかし、実際には該当フェーズは開始済み（`completed_steps` にステップが記録されている）。

**原因**:
- メタデータの不整合: `status: "pending"` だが `completed_steps` が空でない状態
- Evaluation Phase での FAIL 判定後のフェーズリセット時に `status` のみが `"pending"` にリセットされ、`completed_steps` がリセットされなかった（v0.5.0 より前のバージョン）

**対処法（v0.5.0 以降）**:

v0.5.0 以降では、Issue #208 の修正により、この問題は自動的に解決されます：

```bash
# 不整合状態でもロールバックが成功します（警告が表示されますが動作します）
node dist/index.js rollback --to-phase test_implementation --to-step revise --reason "Fix issue"
```

警告メッセージの例:
```
[WARNING] Phase test_implementation: status is 'pending' but completed_steps is not empty.
Treating as started phase (completed_steps: ["execute","review"])
```

**対処法（v0.4.x 以前）**:

手動でメタデータを修正してください:

```bash
# メタデータの不整合を確認
cat .ai-workflow/issue-*/metadata.json | jq '.phases.test_implementation'

# 方法1: completed_steps を空配列にリセット（推奨）
jq '.phases.test_implementation.completed_steps = []' \
  .ai-workflow/issue-*/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-*/metadata.json

# 方法2: status を 'in_progress' に変更
jq '.phases.test_implementation.status = "in_progress"' \
  .ai-workflow/issue-*/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-*/metadata.json

# 修正後、ロールバックを再実行
node dist/index.js rollback --to-phase test_implementation --to-step revise --reason "Fix issue"
```

### メタデータ整合性の警告メッセージ

v0.5.0 以降では、メタデータの不整合を検出すると警告が表示されます:

**パターン1: pending だが completed_steps が存在**
```
[WARNING] Phase <phase_name>: status is 'pending' but completed_steps is not empty
(["execute", "review"])
```

**パターン2: completed だが completed_steps が空**
```
[WARNING] Phase <phase_name>: status is 'completed' but completed_steps is empty
```

**パターン3: in_progress だが started_at が null**
```
[WARNING] Phase <phase_name>: status is 'in_progress' but started_at is null
```

**対処法**:

これらの警告は防御的プログラミングのために表示されますが、ワークフローは継続します。

**警告を解消する場合**:

```bash
# パターン1の解消: completed_steps をリセット
jq '.phases.<phase_name>.completed_steps = []' \
  .ai-workflow/issue-*/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-*/metadata.json

# パターン2の解消: status を 'pending' に戻す
jq '.phases.<phase_name>.status = "pending"' \
  .ai-workflow/issue-*/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-*/metadata.json

# パターン3の解消: started_at を現在時刻で設定
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq --arg time "$NOW" '.phases.<phase_name>.started_at = $time' \
  .ai-workflow/issue-*/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-*/metadata.json
```

**注意**: 手動でメタデータを編集する場合、JSON フォーマットが壊れないよう注意してください。編集後は必ず `jq .` で検証してください:

```bash
# JSON検証
cat .ai-workflow/issue-*/metadata.json | jq . > /dev/null
# エラーが表示されなければOK
```

### 整合性チェックの実行

メタデータの整合性を手動でチェックすることはできませんが、ロールバックコマンド実行時に自動的にチェックされます。

**確認方法**:
```bash
# ロールバック実行時に警告が表示されるか確認
node dist/index.js rollback --to-phase requirements --to-step revise --reason "Test" 2>&1 | grep WARNING

# 警告が表示されない場合、メタデータは整合している
```

**予防策**:
- メタデータファイルを手動で編集しないでください
- ロールバックは必ず `rollback` コマンドを使用してください（直接 `metadata.json` を編集しない）
- Evaluation Phase での FAIL 判定後は、v0.5.0 以降を使用することで自動的に整合性が保たれます

**関連Issue**: Issue #208 - メタデータ不整合によるロールバック失敗の修正

## 12. プロンプト設計のベストプラクティス（v0.3.0）

### エージェントがファイル保存を実行しない場合

Evaluation Phase（Issue #5）で修正された問題と同様、エージェントがファイル保存を実行しない場合は、プロンプトの明示性不足が原因の可能性があります。

**症状**:
- エージェントが成果物の内容を生成するが、Write ツールを呼び出さない
- `<file>.md が見つかりません` エラーが発生
- エージェントログに Write ツール呼び出しが記録されていない

**根本原因**:
- ファイル保存指示がプロンプトの途中に埋もれている
- Write ツールの使用が明示されていない
- ステップバイステップ形式になっていない

**対処法（プロンプト設計）**:
プロンプトの最後に「最終ステップ」セクションを追加し、以下の構造を採用してください：

```markdown
## 最終ステップ - <成果物名>の保存（必須）

<成果物名>が完了したら、以下のステップを**必ず実行**してください：

### ステップ1: 内容確認
上記で生成した<成果物名>全文が完成していることを確認してください。

### ステップ2: Write ツールを使用してファイル保存
**必ず Write ツールを使用**して、<成果物名>全文を以下のパスに保存してください：

```
.ai-workflow/issue-{issue_number}/<phase>/output/<filename>.md
```

### ステップ3: 保存完了の確認
ファイルが正しく作成されたことを確認してください。

**重要**: このファイルが存在しない場合、<Phase名> は失敗します。内容の生成だけでなく、**ファイル保存が必須**です。表示（出力）ではなく、**Write ツールによる保存**を忘れないでください。
```

**参考実装**: `src/prompts/evaluation/execute.txt` の 163-180 行目を参照してください。

**検証方法**:
1. エージェントログで「最終ステップ」または「ステップ1/2/3」への言及を確認
2. エージェントログで Write ツール呼び出しを確認
3. ファイルが作成されることを確認
4. 複数回実行して再現性を検証（推奨: 3回連続実行で100%成功率）

### Testing Phase revise で test-result.md が更新されない（Issue #482で修正）

**症状**:
```
[ERROR] test-result.md が更新されていません
```

Testing Phase の revise ステップで、エージェントが正常に動作しているのにファイル更新チェックが失敗する場合。

**原因**:
- revise プロンプト内の指示の矛盾（「追記 vs 上書き保存」）
- エージェントが混乱してファイル更新をスキップ
- Testing Phase特有のファイル更新チェックロジック（mtime/size比較）で失敗

**対処法（Issue #482で修正済み、v0.5.0以降）**:

v0.5.0以降では、以下の改善により自動的に解決されます：

1. **プロンプト矛盾の解消**: 「追記」指示を削除し、「上書き保存」に統一
2. **必須タスクの明示**: 「⚠️ 必須タスク」セクションでファイル更新を最優先に配置
3. **チェックリスト化**: ステップ形式でファイル更新手順を明確化
4. **統一フォーマット**: 全reviseプロンプトで一貫した指示形式を採用

**手動確認方法**:
```bash
# 修正後のプロンプト構造を確認
grep -A 10 "⚠️ 必須タスク" src/prompts/testing/revise.txt

# エージェントログでファイル更新確認
grep -i "write" .ai-workflow/issue-*/06_testing/revise/agent_log.md

# ファイル更新チェックの成功確認
grep -i "file updated successfully" .ai-workflow/issue-*/06_testing/revise/agent_log.md
```

**予防策**:
- v0.5.0以降を使用する（根本的解決が含まれる）
- プロンプト設計時は矛盾した指示を避ける
- ファイル更新指示は明確で一貫性を保つ

**関連修正**:
- **対象ファイル**: testing, test_implementation, implementation, documentation, planning, report の全reviseプロンプト
- **テスト検証**: 16件の統合テスト（100%成功）により修正効果を確認

## 13. フォールバック機構関連（Issue #113、v0.4.0）

### エージェントが成果物ファイルを生成しないがフォールバックも失敗する

フォールバック機構（`enableFallback: true`）が有効なフェーズ（Planning, Requirements, Design, TestScenario, Implementation, Report）で、エージェントが成果物を生成せず、ログからの抽出も失敗する場合：

**症状**:
```
[INFO] Output file not found, attempting fallback recovery...
[INFO] Trying to extract content from agent log...
[WARNING] Failed to extract valid content from agent log
[INFO] Calling revise() to regenerate the output...
[ERROR] Phase failed: Fallback mechanism exhausted
```

**原因**:
1. **ログファイル不在**: `agent_log.md` が存在しない
2. **コンテンツ長不足**: 抽出内容が100文字未満
3. **セクション不足**: セクションヘッダー（`##`）が2個未満
4. **キーワード欠落**: フェーズ固有キーワードがすべて欠落
5. **revise未実装**: ログ抽出失敗後に呼び出すreviseメソッドが実装されていない

**対処法**:

**1. ログファイルの確認**:
```bash
# agent_log.md が存在するか確認
ls -la .ai-workflow/issue-*/0X_<phase>/execute/agent_log.md

# ログファイルの内容を確認
cat .ai-workflow/issue-*/0X_<phase>/execute/agent_log.md | head -n 50
```

**2. ヘッダーパターンの確認**:
ログに以下のヘッダーパターンが含まれているか確認してください：

| フェーズ | 日本語パターン | 英語パターン |
|---------|---------------|-------------|
| Planning | `# プロジェクト計画書` | `# Project Planning` |
| Requirements | `# 要件定義書` | `# Requirements Specification` |
| Design | `# 設計書` | `# Design Document` |
| TestScenario | `# テストシナリオ` | `# Test Scenario` |
| Implementation | `# 実装完了レポート` | `# Implementation Report` |
| Report | `# Issue 完了レポート` | `# Issue Completion Report` |

**3. コンテンツ検証の確認**:
```bash
# ログの文字数を確認（100文字以上必要）
cat .ai-workflow/issue-*/0X_<phase>/execute/agent_log.md | wc -c

# セクションヘッダー（##）の数を確認（2個以上必要）
cat .ai-workflow/issue-*/0X_<phase>/execute/agent_log.md | grep -c '^## '
```

**4. フェーズ固有キーワードの確認**:

各フェーズには固有のキーワード検証があります（少なくとも1つ必要）：

- **Planning**: 実装戦略、テスト戦略、タスク分割、リスク分析、スケジュール
- **Requirements**: 機能要件、非機能要件、ユースケース、制約条件
- **Design**: アーキテクチャ、モジュール設計、データ構造、API設計
- **TestScenario**: テストケース、正常系、異常系、境界値
- **Implementation**: 実装内容、変更ファイル、コミット
- **Report**: 完了サマリー、実装結果、テスト結果、残課題

ログにこれらのキーワードが含まれているか確認してください。

**5. プロンプトの改善**:

エージェントがファイル保存を実行しない場合は、プロンプトの明示性を向上させてください（セクション11「エージェントがファイル保存を実行しない場合」を参照）。

フォールバック機構はあくまでバックアップであり、エージェントが正常に成果物ファイルを生成することが望ましい動作です。

**6. 手動復旧**:

フォールバック機構が失敗した場合、以下の手順で手動復旧できます：

```bash
# 1. ログから手動で成果物を抽出
cat .ai-workflow/issue-*/0X_<phase>/execute/agent_log.md > extracted_content.md

# 2. 成果物ファイルとして保存
cp extracted_content.md .ai-workflow/issue-*/0X_<phase>/output/<filename>.md

# 3. フェーズを再実行
node dist/index.js execute --issue <NUM> --phase <PHASE_NAME>
```

### フォールバック機構でreviseが呼び出されない

ログ抽出が失敗した際、reviseメソッドが呼び出されない場合：

**症状**:
```
[WARNING] Failed to extract valid content from agent log
[ERROR] Phase failed: revise() is not implemented for this phase
```

**原因**:
- フェーズの具象クラスで `revise()` メソッドが実装されていない
- BasePhaseの `revise()` はデフォルトで未実装エラーを返す

**対処法**:
1. フェーズ固有の `revise()` メソッドを実装する
2. または、手動で成果物を作成する（上記の手動復旧方法を参照）

### previous_log_snippet が注入されない

revise実行時に `previous_log_snippet` 変数が注入されない場合：

**症状**:
- reviseプロンプトで `{previous_log_snippet}` が空文字列に置換される
- エージェントが前回実行のコンテキストを認識できない

**原因**:
1. `agent_log.md` が存在しない
2. ログファイルが空
3. プロンプトテンプレートに `{previous_log_snippet}` 変数が含まれていない

**対処法**:
```bash
# 1. agent_log.md の存在と内容を確認
cat .ai-workflow/issue-*/0X_<phase>/execute/agent_log.md | head -n 100

# 2. revise.txt プロンプトに変数が含まれているか確認
grep -n "previous_log_snippet" src/prompts/<phase>/revise.txt

# 3. プロンプトに変数を追加（例）
echo -e "\n## 前回実行のログ（参考）\n\n{previous_log_snippet}" >> src/prompts/<phase>/revise.txt

# 4. ビルドして再実行
npm run build
node dist/index.js execute --issue <NUM> --phase <PHASE_NAME>
```

**注意**: `previous_log_snippet` は `agent_log.md` の先頭2000文字のみが注入されます。完全なログが必要な場合は、エージェントに Read ツールで直接読み込ませてください。

## 14. ロギング・テスト関連

### カラーリングテストの失敗

`tests/unit/utils/logger.test.ts` のカラーリングテストがCI環境で失敗する場合：

**症状**:
```
Expected color escape codes in logger output, but found none
```

**原因**:
- CI環境では `chalk` のカラーレベルがデフォルトで0（カラーなし）になる
- テストでカラー出力を検証している場合、CI環境で失敗する可能性がある

**対処法**:
1. テストファイルの `beforeEach()` フックで `chalk.level = 3` を強制設定:
   ```typescript
   import chalk from 'chalk';

   beforeEach(() => {
     // Force chalk to use TrueColor (level 3) for consistent test results
     chalk.level = 3;
   });
   ```
2. 環境変数 `LOG_NO_COLOR` が `true` に設定されている場合、カラーリングは無効化されます（CI環境推奨）
3. ローカルでCI環境を再現するには:
   ```bash
   LOG_NO_COLOR=true npm run test:unit
   ```

### 不要な.ts.bakファイルの削除

プロジェクト内に `.ts.bak` ファイルが残存している場合：

**症状**:
- リポジトリに不要なバックアップファイルが存在
- Git履歴に誤ってコミットされている

**対処法**:
1. `.ts.bak` ファイルを検索:
   ```bash
   find . -name "*.ts.bak" -type f
   ```
2. 削除前に確認（dry-run）:
   ```bash
   find . -name "*.ts.bak" -type f -print
   ```
3. 削除実行:
   ```bash
   find . -name "*.ts.bak" -type f -delete
   ```
4. ビルドが正常に完了することを確認:
   ```bash
   npm run build
   ```
5. 削除をコミット:
   ```bash
   git add -A
   git commit -m "Remove unnecessary .ts.bak files"
   git push
   ```

**注意**: `.ts.bak` ファイルは実行に影響しないため、削除による機能的な影響はありません。

### テストコードでのconsole使用エラー

テストファイルで `console.log`, `console.error` 等を直接使用した場合、ESLintエラーが発生します。

**症状**:
```
error: Unexpected console statement (no-console)
```

**対処法**:
1. 統一loggerモジュールを使用:
   ```typescript
   import { logger } from '../../src/utils/logger.js';

   // console.log('[INFO] message') の代わりに:
   logger.info('message');

   // console.error('error') の代わりに:
   logger.error('error');

   // console.warn('[WARNING] warning') の代わりに:
   logger.warn('warning');
   ```
2. プレフィックス（`[INFO]`, `[WARNING]` 等）はloggerが自動的に付与するため削除してください
3. import文のパスは相対パスを使用（テストファイルの位置に応じた）

**参考**: ロギング規約の詳細は `CLAUDE.md` の「重要な制約事項」セクションを参照してください。

## 15. コミットスカッシュ関連（v0.5.0、Issue #194）

### スカッシュが実行されない

ワークフロー完了後にコミットがスカッシュされない場合：

**症状**:
- Evaluation Phase 完了後にスカッシュが実行されない
- メタデータに `squashed_at` フィールドが記録されない

**原因**:
1. `--squash-on-complete` オプションが指定されていない（デフォルトは無効）
2. Evaluation Phase が実行されていない（スカッシュはEvaluation Phase完了時のみ実行）
3. 環境変数 `AI_WORKFLOW_SQUASH_ON_COMPLETE` が設定されていない

**対処法**:
```bash
# 方法1: CLIオプションで有効化
node dist/index.js execute --issue 123 --phase evaluation --squash-on-complete

# 方法2: 環境変数でデフォルト動作を変更
export AI_WORKFLOW_SQUASH_ON_COMPLETE=true
node dist/index.js execute --issue 123 --phase evaluation

# 方法3: 明示的に無効化（デフォルト動作の確認）
node dist/index.js execute --issue 123 --phase evaluation --no-squash-on-complete
```

**確認方法**:
```bash
# メタデータでスカッシュ実行を確認
cat .ai-workflow/issue-123/metadata.json | jq '.squashed_at'
# null でない場合、スカッシュが実行済み

# 環境変数の確認
echo $AI_WORKFLOW_SQUASH_ON_COMPLETE
```

### main/master ブランチでスカッシュできない

main または master ブランチでスカッシュを試行した場合：

**症状**:
```
[WARNING] Skipping squash: current branch is protected (main/master)
```

**原因**:
- ブランチ保護機能により、main/master ブランチでのスカッシュは禁止されています

**対処法**:
- これは意図された動作です。フィーチャーブランチに切り替えてからスカッシュを実行してください:
  ```bash
  git checkout -b feature/issue-123
  node dist/index.js execute --issue 123 --phase evaluation --squash-on-complete
  ```

**注意**: この保護は誤った force push を防ぐための重要なセーフティ機能です。

### force push が失敗する

スカッシュ後の force push が失敗する場合：

**症状**:
```
[ERROR] Failed to push squashed commits: Command failed: git push origin <branch> --force-with-lease
```

**原因**:
1. リモートブランチが他の開発者により更新されている（`--force-with-lease` による保護）
2. リモートブランチが存在しない
3. push 権限がない
4. ネットワーク問題

**対処法**:

**1. リモート更新の確認**:
```bash
# リモートブランチの最新状態を確認
git fetch origin
git log HEAD..origin/ai-workflow/issue-123

# 他の開発者の変更がある場合
git pull --rebase origin ai-workflow/issue-123
# その後、スカッシュを再実行
```

**2. リモートブランチが存在しない場合**:
```bash
# 通常のpushでリモートブランチを作成
git push -u origin ai-workflow/issue-123
```

**3. 権限問題の確認**:
```bash
# GITHUB_TOKEN のスコープを確認
# repo、workflow スコープが必要

# ローカル環境では SSH キーが正しく設定されているか確認
ssh -T git@github.com
```

**4. ロールバック（スカッシュ前に戻す）**:
```bash
# メタデータから pre_squash_commits を確認
cat .ai-workflow/issue-123/metadata.json | jq '.pre_squash_commits'

# ロールバック（reset）
git reset --hard <pre_squash_commit_sha>

# ロールバック（新しいコミット作成）
git revert --no-edit <squashed_commit_sha>
```

### `__dirname is not defined` エラー（Issue #216で修正）

ESM環境でスカッシュコミット機能を使用する際に発生する場合：

**症状**:
```
[ERROR] Failed to load prompt template: ReferenceError: __dirname is not defined
```

**原因**:
- Node.js の ESM（ES Modules）環境では `__dirname` がグローバル変数として利用できない
- `squash-manager.ts` のプロンプトテンプレート読み込み時に `__dirname` を使用していた（v0.5.0より前）

**対処法**:
- **v0.5.0以降**: この問題は修正済みです。`import.meta.url` + `fileURLToPath` を使用したESM互換のパス解決に変更されています
- **v0.4.x以前**: プロジェクトを最新バージョンにアップグレードしてください

**確認方法**:
```bash
# バージョン確認
node dist/index.js --version

# プロンプトテンプレートが存在するか確認
ls -la src/prompts/squash/generate-message.txt

# ESM互換コードが含まれているか確認（v0.5.0以降）
grep -n "fileURLToPath" src/core/git/squash-manager.ts
```

**関連Issue**: Issue #216 - `--squash-on-complete` が正常に動作しない（複数の問題）

### AI 生成コミットメッセージが不適切

AI エージェントが生成したコミットメッセージが期待と異なる場合：

**症状**:
- コミットメッセージが Conventional Commits 形式になっていない
- メッセージが抽象的すぎる、または詳細すぎる
- 日本語/英語の混在

**原因**:
- エージェントがコミット履歴やdiffから適切な情報を抽出できなかった
- プロンプトテンプレート（`src/prompts/squash/generate-message.txt`）の改善が必要

**対処法**:

**1. フォールバックメッセージが使用された場合**:
```bash
# メタデータでフォールバック使用を確認
git log -1 --format=%B | head -n 1
# "Squash commits for issue #123" のような単純なメッセージの場合、フォールバック使用

# 原因: エージェント実行失敗（タイムアウト、API制限等）
# 対処: 再度スカッシュを実行（git reset後）
```

**2. メッセージの手動修正**:
```bash
# 最新コミットのメッセージを修正
git commit --amend

# または対話的に編集
git rebase -i HEAD~1

# 修正後、force push
git push origin ai-workflow/issue-123 --force-with-lease
```

**3. プロンプトテンプレートのカスタマイズ**:
```bash
# プロンプトを編集
vi src/prompts/squash/generate-message.txt

# 変更例: より詳細なコンテキスト指示を追加
# 変更例: 特定のフォーマット要求を追加

# ビルドして再実行
npm run build
```

**4. エージェント切り替え**:
```bash
# Codex から Claude に切り替え（またはその逆）
node dist/index.js execute --issue 123 --phase evaluation --squash-on-complete --agent claude
```

### スカッシュメタデータが記録されない

スカッシュ実行後、メタデータが正しく記録されない場合：

**症状**:
- `metadata.json` に `base_commit`, `pre_squash_commits`, `squashed_at` フィールドが存在しない
- スカッシュは成功したがメタデータ更新に失敗したログが出力される

**原因**:
1. ファイル書き込み権限の問題
2. ディスク容量不足
3. メタデータファイルの破損

**対処法**:

**1. 権限とディスク容量の確認**:
```bash
# 権限確認
ls -la .ai-workflow/issue-123/metadata.json

# ディスク容量確認
df -h .

# 書き込みテスト
touch .ai-workflow/issue-123/test-write && rm .ai-workflow/issue-123/test-write
```

**2. メタデータの手動修復**:
```bash
# 現在のコミットを確認
CURRENT_COMMIT=$(git rev-parse HEAD)
SQUASHED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# メタデータを手動で更新（jq使用）
jq --arg commit "$CURRENT_COMMIT" --arg time "$SQUASHED_AT" \
  '.squashed_at = $time | .pre_squash_commits = ["記録なし"] | .base_commit = $commit' \
  .ai-workflow/issue-123/metadata.json > metadata_tmp.json && \
  mv metadata_tmp.json .ai-workflow/issue-123/metadata.json
```

**3. メタデータ再生成**:
```bash
# 最終手段: ワークフローを再初期化（既存の成果物は保持される）
node dist/index.js init --issue-url <URL> --force
```

### スカッシュ失敗がワークフローを中断する

スカッシュ失敗時にワークフロー全体が失敗する場合：

**症状**:
```
[WARNING] Failed to squash commits: <error message>
[INFO] Workflow continues despite squash failure
```

**原因**:
- スカッシュ失敗は警告として扱われ、ワークフローは継続されます（これは意図された動作）
- ワークフロー全体が失敗している場合、スカッシュ以外の原因です

**対処法**:
1. スカッシュ失敗は無視してワークフローを継続できます
2. スカッシュ失敗の原因を調査（上記のトラブルシューティングを参照）
3. ワークフロー完了後、手動でスカッシュを実行:
   ```bash
   # 手動スカッシュ（例: 10個のコミットを1つにまとめる）
   git reset --soft HEAD~10
   git commit -m "feat: implement issue #123

   詳細な説明をここに記載

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"

   git push origin ai-workflow/issue-123 --force-with-lease
   ```

**注意**: スカッシュはオプショナル機能であり、失敗してもワークフローの成功には影響しません。

### finalize コマンドでスカッシュが失敗する（Issue #510で修正済み）

**症状**:
```
[INFO] Only 0 commit(s) found. Skipping squash.
```

**原因**:
finalize コマンドの Step 2 で non-fast-forward エラーが発生し、pullLatest() によって HEAD が更新されたため、Step 3 のスカッシュ範囲（base_commit..HEAD）が 0 コミットと判定される問題。

**修正内容（v0.5.0以降、Issue #510）**:
v0.5.0以降では、この問題は根本的に解決されています：

- Step 1 で Step 2 実行直前の HEAD を `headBeforeCleanup` として保存
- Step 3 でスカッシュ範囲の終点に `headBeforeCleanup` を使用
- pull による HEAD 更新の影響を完全に回避

**対処法**:
- **v0.5.0以降**: 自動的に修正済みのため対処不要
- **v0.4.x以前**: プロジェクトを最新バージョンにアップグレードしてください

**確認方法**:
```bash
# バージョン確認
node dist/index.js --version

# finalize実行ログでスカッシュ成功を確認
grep -i "commits squashed" .ai-workflow/issue-*/finalize.log
```

**関連Issue**: Issue #510 - finalize コマンドで Step 2 の push 時に pull が実行されると HEAD が更新されスカッシュが失敗する

## 16. PRコメント自動対応関連（v0.5.0、Issue #428）

### pr-comment analyze フェーズのエラー終了

PR commentワークフローの2段階ワークフロー（analyze → execute）でanallyzeフェーズが失敗する場合：

**症状**:
```
[ERROR] Failed to analyze PR comments: <エラー詳細>
```

**原因と環境別動作（Issue #428で改善）**:

**CI環境**（`process.env.CI` が設定されている場合）:
- エージェント実行失敗時に即座に `process.exit(1)` で終了
- executeフェーズには進まない
- Jenkinsパイプラインで失敗として検知される

**ローカル環境**:
- 確認プロンプトが表示される
- ユーザーが継続（'y'）を選択 → フォールバックプランで続行
- ユーザーが拒否（'N' or Enter）を選択 → `process.exit(1)` で終了

**対処法**:

**1. エラー原因の確認**:
```bash
# メタデータからエラー詳細を確認
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_error, .analyzer_error_type'

# 一般的なエラー種別
# - agent_execution_error: API認証エラー、タイムアウト等
# - agent_empty_output: エージェントが空出力を返した
# - json_parse_error: レスポンスのJSONパースに失敗
# - validation_error: レスポンス構造の検証に失敗
```

**2. エラー種別別の対処法**:

**`agent_execution_error`（エージェント実行エラー）**:
```bash
# API認証の確認
echo $CODEX_API_KEY  # Codexの場合
echo $CLAUDE_CODE_CREDENTIALS_PATH  # Claudeの場合

# エージェントを切り替えて再試行
ai-workflow pr-comment analyze --pr 123 --agent claude  # CodexからClaudeに変更
ai-workflow pr-comment analyze --pr 123 --agent codex   # ClaudeからCodexに変更
```

**`agent_empty_output`（空出力エラー）**:
```bash
# エージェントログの確認
cat .ai-workflow/pr-123/analyze/execute/agent_log.md

# プロンプトが正しく渡されているか確認
cat .ai-workflow/pr-123/analyze/execute/prompt.txt

# APIレート制限の可能性があるため、時間を置いて再試行
sleep 300  # 5分待機
ai-workflow pr-comment analyze --pr 123
```

**`json_parse_error`（JSONパースエラー）**:
```bash
# エージェント出力の確認
cat .ai-workflow/pr-123/analyze/execute/agent_log.md | grep -A 20 -B 5 "json"

# エージェントが出力したJSONが不正な可能性
# エージェントを切り替えて再試行
ai-workflow pr-comment analyze --pr 123 --agent claude
```

**3. 完全なリセット（最終手段）**:
```bash
# メタデータを削除して最初からやり直し
rm -rf .ai-workflow/pr-123

# 再初期化
ai-workflow pr-comment init --pr 123
ai-workflow pr-comment analyze --pr 123
```

### JSONパースエラーの詳細対処法（Issue #438で根本解決）

**症状**:
```
Error: Failed to parse agent response: All parsing strategies exhausted
```

**根本的解決策（Issue #438）**: `pr-comment analyze` コマンドはファイル出力方式に変更され、JSONパースエラーは根本的に解消されています。エージェントがJSONを確実にファイル（`.ai-workflow/pr-{prNumber}/analyze/response-plan.json`）に出力し、そこから読み込む方式に変更されました。

**重要な変更内容（Issue #438）**:
- **プロンプト修正**: `{output_file_path}` プレースホルダーを追加し、エージェントにファイル書き込みを必須化
- **実装変更**: ファイル優先読み込み＋フォールバック処理を実装（`buildAnalyzePrompt()` に `outputFilePath` パラメータ追加）
- **出力先**: `.ai-workflow/pr-{prNumber}/analyze/response-plan.json` への確実なJSON出力
- **後方互換性**: ファイル生成失敗時は既存の `parseResponsePlan()` で `rawOutput` をパース
- **エラーハンドリング**: ファイル読み込み成功/失敗時の適切なログ出力

**以前の問題**: エージェントがJSON Lines形式やプレーンJSONで応答した際に、既存のパース戦略では正常に抽出できない問題がありました。Issue #427でパース戦略が改善されましたが、Issue #438でファイル出力方式への根本的な変更により抜本的に解決されています。

**現在の状況**: v0.5.0以降では、JSONパースエラーは発生しなくなりました。エージェントが確実にJSONファイルを出力し、そこから読み込むため、テキストパースに依存しません。

**フォールバック機構（v0.5.0）**:
Issue #438のファイル出力方式が主要な解決策ですが、ファイル生成に失敗した場合のフォールバックとして、改善されたパース戦略も維持されています：
- **3つのパース戦略を順次試行**:
  1. **Strategy 1**: Markdownコードブロック（```json ... ```）からの抽出
  2. **Strategy 2**: JSON Lines形式からの後方探索（改善版）
  3. **Strategy 3**: プレーンJSONパターンのマッチング（改善版）
- **末尾優先探索**: 複数のJSONオブジェクトが存在する場合、最後の有効なオブジェクトを使用
- **構造検証強化**: `comments`フィールドが配列であることを厳密にチェック
- **詳細ログ出力**: 各パース戦略の試行結果を詳細に記録

**注**: これらのパース戦略は現在フォールバック用であり、通常はファイル出力から直接読み込まれるため使用されません。

**対処法**:

**Issue #438以降では、このエラーはほぼ発生しません**。以下は旧バージョンや特殊ケースの参考です：

**1. ファイル出力の確認（Issue #438以降の主要解決策）**:
```bash
# JSONファイルが正常に出力されているか確認
ls -la .ai-workflow/pr-123/analyze/response-plan.json

# ファイルの内容確認
cat .ai-workflow/pr-123/analyze/response-plan.json | jq .

# ファイル出力ログの確認
grep -i "output file" .ai-workflow/pr-123/analyze/execute/agent_log.md
```

**2. ファイル出力失敗時の確認（稀なケース）**:
```bash
# エージェントの生出力を確認（フォールバック時のみ）
cat .ai-workflow/pr-123/analyze/execute/agent_log.md

# パース戦略のログを確認（フォールバック時のみ）
grep -A 5 -B 5 "Strategy [123]" .ai-workflow/pr-123/analyze/execute/agent_log.md
```

**3. エージェント切り替えによる対処（Issue #438以降も有効）**:
```bash
# Codex から Claude に切り替え
ai-workflow pr-comment analyze --pr 123 --agent claude

# Claude から Codex に切り替え
ai-workflow pr-comment analyze --pr 123 --agent codex
```

**4. Issue #438以降の改善確認**:

v0.5.0以降では、プロンプトが以下のように改善され、ファイル出力が確実に実行されます：

- **必須指示**: エージェントにWrite ツールを使用したJSON出力を必須化
- **明確な出力先**: `{output_file_path}` プレースホルダーで出力先を明示
- **ファイル優先読み込み**: プロンプト実行後、まずJSONファイルから読み込み、失敗時のみテキストパース

**5. 成功確認方法**:

Issue #438以降では、JSONパースエラーはほぼ発生しません：
```bash
# ファイル出力成功の確認
ls -la .ai-workflow/pr-123/analyze/response-plan.json
# ファイルが存在すれば、ファイル出力方式で成功

# メタデータの確認
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_agent'
# 出力: "codex" または "claude" → 正常動作
# 出力: "fallback" → エージェント実行失敗（パースエラーではない）
```

**6. 完全リセット（最終手段、Issue #438以降では稀）**:
```bash
# analyze フェーズをリセットして再実行
rm -rf .ai-workflow/pr-123/analyze
ai-workflow pr-comment analyze --pr 123 --agent claude

# または、メタデータを完全削除して最初からやり直し
rm -rf .ai-workflow/pr-123
ai-workflow pr-comment init --pr 123
ai-workflow pr-comment analyze --pr 123
```

**注意**: Issue #438の根本的解決により、JSONパースエラーは事実上解消されました。ファイル出力方式により、エージェントの出力形式に依存しない確実なJSON読み込みが可能になっています。このトラブルシューティングセクションは主に旧バージョンまたは特殊な失敗ケースの参考用です。

#### 5. リビルド時にInitステージが重複実行される（Issue #426で修正）

**症状**:
```
[WARNING] Metadata already exists. Skipping initialization.
[INFO] Use "pr-comment analyze" or "pr-comment execute" to resume.
```

または、Jenkins環境でリビルド時に既存メタデータが上書きされる問題。

**原因**: v0.5.0より前では、リビルド時にメタデータの存在確認が行われず、初期化処理が重複実行されていました。

**改善内容（Issue #426で修正）**:

**CLIレベルの改善**:
- `pr-comment init` コマンドがメタデータ存在時に自動的にスキップ
- 既存メタデータの上書きを防止
- 警告ログと再開方法の案内を表示

**Jenkinsパイプラインレベルの改善**:
- **Check Resume** ステージを追加してメタデータファイルの存在を確認
- **PR Comment Init** ステージに `when` 条件を追加（`SHOULD_INIT='true'` の場合のみ実行）
- 環境変数 `SHOULD_INIT` でInitステージの実行制御

**対処法**:

**1. v0.5.0以降を使用する（推奨）**:
```bash
# v0.5.0以降では自動的に適切にスキップされます
ai-workflow pr-comment init --pr 123  # → 既存メタデータがあればスキップ
ai-workflow pr-comment execute --pr 123  # → 中断点から再開
```

**2. 手動でのリビルド対応**:
```bash
# メタデータが存在するかチェック
ls -la .ai-workflow/pr-123/comment-resolution-metadata.json

# メタデータが存在する場合はinitをスキップしてexecuteから実行
ai-workflow pr-comment execute --pr 123

# または、analyzeから実行
ai-workflow pr-comment analyze --pr 123
ai-workflow pr-comment execute --pr 123
```

**3. 破損したメタデータのリセット**:
```bash
# メタデータが破損している場合のみ削除
rm -rf .ai-workflow/pr-123

# 再初期化
ai-workflow pr-comment init --pr 123
```

**4. Jenkins環境での確認**:
```bash
# Check Resumeステージのログを確認
grep -i "Check Resume" jenkins-build.log
grep -i "SHOULD_INIT" jenkins-build.log

# PR Comment Initステージがスキップされているか確認
grep -i "Stage 'PR Comment Init' skipped" jenkins-build.log
```

**予防策**:
- 常に最新バージョン（v0.5.0以降）を使用する
- Jenkins環境では改善されたパイプラインを使用する
- 手動でメタデータを削除する前に、必要な情報（in_progressコメント等）を確認する

### フォールバックプランが使用されたときの対処

ローカル環境でユーザーが継続（'y'）を選択した場合、フォールバックプランが使用されます。

**症状**:
```
[WARNING] Analyze phase used fallback plan.
All comments will be treated as 'discussion' type.
Manual review may be required after execution.
```

**影響**:
- すべてのコメントが `discussion` タイプとして処理される
- 本来 `code_change` として処理すべきコメントも手動対応待ちとなる
- 低品質な自動対応となる可能性

**対処法**:

**1. executeフェーズ実行前の確認**:
```bash
# フォールバックプランの内容を確認
cat .ai-workflow/pr-123/analyze/output/response-plan.md

# メタデータでフォールバック使用を確認
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_agent'
# 出力: "fallback"
```

**2. 手動でのanalyze再実行（推奨）**:
```bash
# エラー原因を修正してからanalyzeを再実行
# 例: API認証問題を修正後
ai-workflow pr-comment analyze --pr 123 --agent claude

# 成功した場合、フォールバックが上書きされる
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_agent'
# 出力: "claude" または "codex"
```

**3. フォールバックプランでの実行継続**:
```bash
# 品質は低いがワークフローを継続
ai-workflow pr-comment execute --pr 123

# 実行後に手動レビューを実施
# discussion タイプのコメントは自動対応されないため、手動で対応が必要
```

### Jenkins環境でのanalyze失敗検知

Jenkins パイプラインでanalyze失敗を適切に検知する場合：

**Jenkinsfile設定例**:
```groovy
stage('PR Comment Analyze') {
    steps {
        script {
            // returnStatus: true で終了コードを取得
            def analyzeResult = sh(
                script: """
                    node dist/index.js pr-comment analyze \\
                        --pr-url ${params.PR_URL} \\
                        --agent ${params.AGENT_MODE ?: 'auto'}
                """,
                returnStatus: true
            )

            // 終了コードが0以外の場合はパイプライン失敗
            if (analyzeResult != 0) {
                error("Analyze phase failed with exit code ${analyzeResult}. Execute stage will be skipped.")
            }

            // メタデータからanalyzerエラーをチェック
            def metadataPath = "${env.REPOS_ROOT}/${env.REPO_NAME}/.ai-workflow/pr-${env.PR_NUMBER}/comment-resolution-metadata.json"
            if (fileExists(metadataPath)) {
                def metadata = readJSON file: metadataPath
                if (metadata.analyzer_error != null) {
                    echo "⚠️ WARNING: Analyze phase encountered an error."
                    echo "Error Type: ${metadata.analyzer_error_type ?: 'unknown'}"
                    echo "Error: ${metadata.analyzer_error}"
                }
            }
        }
    }
}
```

**確認方法**:
```bash
# Jenkinsログでエラー検知を確認
grep -i "analyze phase failed" jenkins-build.log

# メタデータの警告表示を確認
grep -i "WARNING: Analyze phase encountered an error" jenkins-build.log
```

### pr-comment ワークフロー固有のメタデータ破損

PR comment専用のメタデータ（`comment-resolution-metadata.json`）が破損した場合：

**症状**:
```
[ERROR] Failed to load comment resolution metadata
[ERROR] Invalid metadata format
```

**対処法**:

**1. メタデータ構造の確認**:
```bash
# JSONフォーマットが正しいか確認
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq .

# エラーが表示される場合、JSONが破損している
# 再初期化が必要
```

**2. メタデータの再初期化**:
```bash
# 破損したメタデータを削除
rm .ai-workflow/pr-123/comment-resolution-metadata.json

# または、ディレクトリ全体を削除
rm -rf .ai-workflow/pr-123

# 再初期化
ai-workflow pr-comment init --pr 123
```

**3. バックアップからの復元（Git履歴がある場合）**:
```bash
# Git履歴からメタデータを復元
git log --all --full-history -- .ai-workflow/pr-123/comment-resolution-metadata.json

# 特定のコミットから復元
git checkout <commit-hash> -- .ai-workflow/pr-123/comment-resolution-metadata.json
```

## 17. デバッグのヒント

- Codex の問題切り分けには `--agent claude`、Claude の問題切り分けには `--agent codex` を利用。
- `.ai-workflow/issue-*/<phase>/execute/agent_log_raw.txt` の生ログを確認すると詳細が分かります（Report Phase 前のみ利用可能）。
- `DEBUG=ai-workflow:*` を設定すると詳細ログ（カスタムフック）が出力されます。
- Git の問題は `GIT_TRACE=1` を付与して調査できます。
- マルチリポジトリ関連の問題は、Issue URL が正しいか、対象リポジトリが正しくクローンされているか確認してください。
- **ステップレジューム関連**: `metadata.json` の `current_step` と `completed_steps` フィールドを確認してください。
- **ファイル保存問題**: エージェントログで Write ツール呼び出しを確認し、プロンプトの「最終ステップ」セクションの存在を確認してください。
- **フォールバック機構関連**: `agent_log.md` の存在、ヘッダーパターン、セクション数、キーワードを確認してください。ログに `[INFO] Output file not found, attempting fallback recovery...` が表示されている場合、フォールバック機構が動作しています。
- **カラーリングテスト関連**: `chalk.level` の強制設定と `LOG_NO_COLOR` 環境変数を確認してください。
- **ロギング規約違反**: ESLintエラー発生時は統一loggerモジュール（`src/utils/logger.ts`）を使用してください。
- **コミットスカッシュ関連**: `metadata.json` の `base_commit`, `pre_squash_commits`, `squashed_at` フィールドを確認してください。スカッシュログは Evaluation Phase の実行ログに記録されます。
- **PRコメント自動対応関連**: 個別コメントのデバッグには `.ai-workflow/pr-{number}/execute/agent_log_comment_{comment_id}.md` を確認してください（Issue #487で追加、ドライランモード時は生成されません）。

## 17. フォローアップIssue生成関連（v0.5.0、Issue #480）

### `--followup-llm-mode agent` でモデル指定が無効になる（ChatGPT アカウント対応）

`--followup-llm-mode agent` を指定した場合に `--followup-llm-model` オプションで指定したモデルが無視され、デフォルトのgpt-4oが使用される問題の対処法です。

**症状**:
```
[ERROR] http 400 Bad Request: The model is not supported
```

**原因**:
- ChatGPT アカウントではgpt-4oモデルがサポートされていない
- v0.5.0より前では、`IssueAgentGenerator` が `--followup-llm-model` で指定されたモデルを受け取れず、Codex CLI のデフォルト（gpt-4o）が使用されていた

**対処法（v0.5.0 以降）**:

v0.5.0以降では、Issue #480の修正により、モデル指定が正常に伝播されます：

```bash
# ChatGPT アカウント対応モデルを指定
node dist/index.js execute --issue 123 --phase evaluation \
  --followup-llm-mode agent --followup-llm-model gpt-5.1-codex-mini

# エイリアスでの指定も可能
node dist/index.js execute --issue 123 --phase evaluation \
  --followup-llm-mode agent --followup-llm-model mini
```

**対処法（v0.4.x 以前）**:

古いバージョンでは、以下の回避策を使用してください：

```bash
# 方法1: 環境変数でデフォルトモデルを設定
export CODEX_MODEL=gpt-5.1-codex-mini
node dist/index.js execute --issue 123 --phase evaluation --followup-llm-mode agent

# 方法2: agent モード以外を使用
node dist/index.js execute --issue 123 --phase evaluation \
  --followup-llm-mode openai --followup-llm-model gpt-4o-mini

# 方法3: claude モードを使用（Anthropic API キーが必要）
node dist/index.js execute --issue 123 --phase evaluation \
  --followup-llm-mode claude --followup-llm-model claude-3-sonnet-20240229
```

**確認方法**:
```bash
# フォローアップIssue生成時に使用されたモデルを確認
grep -i "Using model" .ai-workflow/issue-123/09_evaluation/execute/agent_log.md

# メタデータでフォールバック状況を確認
cat .ai-workflow/issue-123/metadata.json | jq '.followup_issue_generation'
```

**ChatGPT アカウントで推奨されるモデル**:

| モデル | 用途 | 指定方法 |
|--------|------|----------|
| `gpt-5.1-codex-mini` | 軽量・経済的なフォローアップIssue生成 | `--followup-llm-model mini` |
| `gpt-5.1-codex-max` | 高精度なフォローアップIssue生成（デフォルト） | `--followup-llm-model max` |
| `gpt-5.1` | 汎用モデル | `--followup-llm-model 5.1` |

**注意事項**:
- v0.5.0以降へのアップグレードを推奨します（根本的解決）
- agent モード以外（openai, claude）では元々モデル指定が正常に動作します
- エージェント失敗時は自動的にLLM APIモードへフォールバックされます

**関連Issue**: Issue #480 - followup-llm-mode agent で gpt-4o モデルがChatGPTアカウントで非対応エラー

## 18. `Prompt is too long` エラー（Documentation Phase）

### 症状
- Documentation Phase の execute/review/revise で `Prompt is too long` や `context length exceeded` が発生する
- エージェントログに大容量の Read ツールレスポンスが多数記録されている

### 主な原因
- `CLAUDE.md` や `~/.claude/CLAUDE.md` を Read ツールで再読込し、自動コンテキストと二重化している
- README/ROADMAP/TROUBLESHOOTING など大型ファイルを limit 指定なしで一度に読み込んでいる
- 同じファイルを複数ターンで繰り返し読み、コンテキストが累積している

### 対処法
1. `CLAUDE.md` と `~/.claude/CLAUDE.md` は Read しない（自動コンテキストに含まれる）
2. Read は **3-5ファイル以内** に絞り、大きなファイルは `limit: 1000-2000` を付けて部分読みにする
3. 重要度順に **1-2ファイルずつ** 処理し、必要箇所だけ読んでから Edit で反映する
4. 直近で読んだ内容は再読込せず、エージェントログを参照する
5. 既にコンテキストが膨らんだ場合はフェーズを再実行し、上記ルールを徹底する

### 予防策
- `src/prompts/documentation/execute.txt` の「⚠️ 重要: プロンプト長制限への対応」に従い、レビュー/修正ステップでも同じ制限を守る
- 大型ドキュメントは必要セクションのみ部分読みし、全文読込を避ける

対処できない場合は、実行したコマンド、環境変数（機微情報をマスク）、`agent_log_raw.txt` の該当箇所を添えて Issue もしくはチームチャンネルで共有してください。
