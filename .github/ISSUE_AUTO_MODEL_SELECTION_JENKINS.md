# Add --auto-model-selection option to Jenkins init command

## 概要

Jenkins の init コマンド実行時に `--auto-model-selection` オプションを有効化し、Issue の難易度に応じて自動的にエージェントモデルを選択できるようにする。

## 背景

Issue #363 で実装された自動モデル選択機能（`--auto-model-selection`）は、Issue の難易度を分析して最適なエージェントモデル（Claude: opus/sonnet、Codex: max/mini）を自動選択する機能です。現在、CLI では利用可能ですが、Jenkins パイプラインではまだ有効化されていません。

Jenkins 環境でもこの機能を利用することで、以下のメリットが得られます：
- **コスト最適化**: 単純な Issue には軽量モデル（Claude Sonnet、Codex Mini）を使用
- **品質向上**: 複雑な Issue には高性能モデル（Claude Opus、Codex Max）を使用
- **自動判定**: Issue 本文の難易度分析により、手動でのモデル選択が不要

## 目標

すべての Jenkins パイプラインで `--auto-model-selection` オプションを有効化し、デフォルトで使用する。

## 対象ファイル

以下の5つの Jenkinsfile を修正する必要があります：

1. `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
2. `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
3. `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
4. `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
5. `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`

## 実装詳細

### 1. Job DSL パラメータの追加

各 Jenkinsfile の `parameters` セクションに以下を追加：

```groovy
booleanParam(
    name: 'AUTO_MODEL_SELECTION',
    defaultValue: true,
    description: 'Enable automatic model selection based on issue difficulty (default: true)'
)
```

### 2. 環境変数の設定

`environment` セクションに以下を追加：

```groovy
AUTO_MODEL_SELECTION = "${params.AUTO_MODEL_SELECTION ?: 'true'}"
```

### 3. init コマンドの修正

`Initialize Workflow` ステージで `--auto-model-selection` オプションを追加：

**修正前**:
```groovy
sh """
    node dist/index.js init \
        --issue-url ${params.ISSUE_URL} \
        ${branchOption}
"""
```

**修正後**:
```groovy
def autoModelSelectionFlag = env.AUTO_MODEL_SELECTION == 'true' ? '--auto-model-selection' : ''

sh """
    node dist/index.js init \
        --issue-url ${params.ISSUE_URL} \
        ${branchOption} \
        ${autoModelSelectionFlag}
"""
```

## 実装手順

### Step 1: パラメータ追加（全5ファイル）

各 Jenkinsfile の `parameters` セクションに `AUTO_MODEL_SELECTION` パラメータを追加。

### Step 2: 環境変数追加（全5ファイル）

各 Jenkinsfile の `environment` セクションに `AUTO_MODEL_SELECTION` 環境変数を追加。

### Step 3: init コマンド修正（rollback/finalize 以外の3ファイル）

`all-phases`, `preset`, `single-phase` の各 Jenkinsfile で `Initialize Workflow` ステージを修正。

**注意**: `rollback` と `finalize` は init を呼び出さないため、このステップは不要。

### Step 4: テスト

1. **ローカルテスト**:
   ```bash
   npm run build
   node dist/index.js init --issue-url <TEST_ISSUE_URL> --auto-model-selection
   ```

2. **Jenkins テスト**:
   - テスト用 Issue を作成
   - Jenkins パイプラインを実行（`AUTO_MODEL_SELECTION=true`）
   - メタデータに `auto_model_selection: true` が記録されていることを確認

## 期待される動作

### デフォルト動作（AUTO_MODEL_SELECTION=true）

1. init コマンド実行時に Issue 本文を分析
2. 難易度レベルを判定（simple/moderate/complex）
3. 各フェーズ・ステップに最適なモデルを選択
4. メタデータに記録（`auto_model_selection: true`）

### 無効化（AUTO_MODEL_SELECTION=false）

従来通り、エージェントモードパラメータ（`AGENT_MODE`）に従ってモデルを選択。

## 後方互換性

- 既存の Jenkinsfile は `AUTO_MODEL_SELECTION` パラメータのデフォルト値が `true` のため、自動的に新機能を利用
- `AUTO_MODEL_SELECTION=false` を指定すれば、従来の動作に戻すことが可能
- 既存の `AGENT_MODE` パラメータとの併用も可能（`--auto-model-selection` が優先）

## セキュリティ・パフォーマンス考慮事項

### セキュリティ
- `--auto-model-selection` は Issue 本文の分析のみを行い、コード実行やファイルアクセスは行わない
- API キーは既存の環境変数（`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`）を使用

### パフォーマンス
- 難易度分析には約2-5秒かかる（OpenAI API 呼び出し）
- init フェーズのみで実行されるため、全体のパフォーマンスへの影響は軽微

## 成果物

### コミットメッセージ例

```
feat(jenkins): Add --auto-model-selection option to init command

Enable automatic model selection in Jenkins pipelines by default.
This allows the system to choose optimal agent models based on
issue difficulty analysis.

Changes:
- Added AUTO_MODEL_SELECTION parameter to all Jenkinsfiles (default: true)
- Modified init command to include --auto-model-selection flag
- Updated environment variables for consistency

Benefits:
- Cost optimization for simple issues (use lightweight models)
- Quality improvement for complex issues (use powerful models)
- No manual model selection required

Related: Issue #363
```

## 参考資料

- Issue #363: 自動モデル選択機能の実装
- `src/commands/init.ts`: init コマンドの実装
- `src/core/model-selector.ts`: モデル選択ロジック

## チェックリスト

- [ ] `all-phases/Jenkinsfile` にパラメータ追加
- [ ] `preset/Jenkinsfile` にパラメータ追加
- [ ] `single-phase/Jenkinsfile` にパラメータ追加
- [ ] `rollback/Jenkinsfile` にパラメータ追加（init なし、参考用）
- [ ] `finalize/Jenkinsfile` にパラメータ追加（init なし、参考用）
- [ ] 各ファイルに環境変数追加
- [ ] `all-phases/Jenkinsfile` の init コマンド修正
- [ ] `preset/Jenkinsfile` の init コマンド修正
- [ ] `single-phase/Jenkinsfile` の init コマンド修正
- [ ] ビルド確認（`npm run build`）
- [ ] ローカルテスト実行
- [ ] Jenkins テスト実行
- [ ] ドキュメント更新（CLAUDE.md）
