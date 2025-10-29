# トラブルシューティング ― AI Workflow v2 (TypeScript)

TypeScript CLI をローカルまたは Jenkins で利用する際によく発生する事象と対処方法をまとめました。

## 1. Codex CLI 関連

### `exceeded retry limit, last status: 401 Unauthorized`

- `CODEX_API_KEY`（または `OPENAI_API_KEY`）が `gpt-5-codex` の高推論キーか確認します。
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

## 2. Claude Code 関連

### `Claude Code credentials are not configured`

- Jenkins では Base64 化した `credentials.json` を渡し、パイプラインでデコードして配置します。
- ローカルでは `export CLAUDE_CODE_CREDENTIALS_PATH="$HOME/.claude-code/credentials.json"` を設定。
- `Invalid bearer token` が出た場合は `claude login` を再実行します。

## 3. GitHub 連携

### `GITHUB_TOKEN and GITHUB_REPOSITORY are required`

- 両方の環境変数が設定されているか確認します。
- PAT のスコープは `repo`, `workflow`, `read:org` が必要です。
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

## 5. Docker / Jenkins

### Codex ログが空になる

- Jenkins 側で `stdout` が途中で切れていないか確認します。
- TypeScript 版では `agent_log_raw.txt`（JSON）と Markdown の両方に書き込みます。Markdown が空の場合は、`.ai-workflow/.../execute/` の書き込み権限やディスク残量を確認してください。

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

## 11. プロンプト設計のベストプラクティス（v0.3.0）

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

## 12. ロギング・テスト関連

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

## 13. デバッグのヒント

- Codex の問題切り分けには `--agent claude`、Claude の問題切り分けには `--agent codex` を利用。
- `.ai-workflow/issue-*/<phase>/execute/agent_log_raw.txt` の生ログを確認すると詳細が分かります（Report Phase 前のみ利用可能）。
- `DEBUG=ai-workflow:*` を設定すると詳細ログ（カスタムフック）が出力されます。
- Git の問題は `GIT_TRACE=1` を付与して調査できます。
- マルチリポジトリ関連の問題は、Issue URL が正しいか、対象リポジトリが正しくクローンされているか確認してください。
- **ステップレジューム関連**: `metadata.json` の `current_step` と `completed_steps` フィールドを確認してください。
- **ファイル保存問題**: エージェントログで Write ツール呼び出しを確認し、プロンプトの「最終ステップ」セクションの存在を確認してください。
- **カラーリングテスト関連**: `chalk.level` の強制設定と `LOG_NO_COLOR` 環境変数を確認してください。
- **ロギング規約違反**: ESLintエラー発生時は統一loggerモジュール（`src/utils/logger.ts`）を使用してください。

対処できない場合は、実行したコマンド、環境変数（機微情報をマスク）、`agent_log_raw.txt` の該当箇所を添えて Issue もしくはチームチャンネルで共有してください。
