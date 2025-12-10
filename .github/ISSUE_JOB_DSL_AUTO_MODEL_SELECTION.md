# Job DSL に AUTO_MODEL_SELECTION パラメータを追加

## 概要

Issue #379 の対応で Jenkinsfile に `AUTO_MODEL_SELECTION` パラメータが追加されましたが、Job DSL（`.groovy` ファイル）側の更新が漏れています。Job DSL を更新して、Jenkins UI 上でパラメータが表示されるようにする必要があります。

## 背景

### Issue #379 で実装された内容

Issue #379「Jenkins の init コマンド実行時に --auto-model-selection を有効化」では、以下のファイルが更新されました：

#### ✅ 更新済み（Jenkinsfile）

以下の5つの Jenkinsfile に `AUTO_MODEL_SELECTION` パラメータと環境変数、init コマンドへのオプション追加が実装されました：

1. `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
2. `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
3. `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
4. `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
5. `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`

**追加された内容**:
```groovy
// environment セクション
AUTO_MODEL_SELECTION = "${params.AUTO_MODEL_SELECTION ?: 'true'}"

// Initialize Workflow ステージ
def autoModelSelectionFlag = env.AUTO_MODEL_SELECTION == 'true' ? '--auto-model-selection' : ''

sh """
    node dist/index.js init \\
        --issue-url ${params.ISSUE_URL} \\
        ${branchOption} \\
        ${autoModelSelectionFlag}
"""
```

#### ❌ 未更新（Job DSL）

以下の Job DSL ファイルには `AUTO_MODEL_SELECTION` パラメータが追加されていません：

1. `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy`
2. `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy`
3. `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy`
4. `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy` （rollback は init を呼び出さないが、一貫性のため追加推奨）
5. `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` （finalize は init を呼び出さないが、一貫性のため追加推奨）

### 問題

Job DSL が更新されていないため、以下の問題が発生します：

1. **Jenkins UI にパラメータが表示されない**: ユーザーが `AUTO_MODEL_SELECTION` を ON/OFF できない
2. **デフォルト値が適用されない**: Jenkinsfile 側で `${params.AUTO_MODEL_SELECTION ?: 'true'}` としているが、パラメータが定義されていないため `null` となり、常に `false` として扱われる可能性がある
3. **ドキュメントとの不整合**: CLAUDE.md や README.md には `AUTO_MODEL_SELECTION` パラメータの説明があるが、実際には使用できない

## 目標

Job DSL ファイルに `AUTO_MODEL_SELECTION` パラメータを追加し、Jenkins UI 上でユーザーが設定できるようにする。

## 実装詳細

### 対象ファイル

以下の5つの Job DSL ファイルを更新：

1. `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy`
2. `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy`
3. `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy`
4. `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy`
5. `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`

### 追加するパラメータ定義

各 Job DSL ファイルの `parameters` セクションに以下を追加：

```groovy
booleanParam('AUTO_MODEL_SELECTION', true, '''
Issue の難易度に応じて自動的にエージェントモデルを選択
- true: Issue 本文を分析して最適なモデル（Claude: opus/sonnet、Codex: max/mini）を自動選択
- false: AGENT_MODE パラメータに従って固定モデルを使用

デフォルト: true（コスト最適化と品質向上を両立）
詳細: Issue #363、v0.5.0で追加
'''.stripIndent().trim())
```

### 挿入位置

既存のパラメータ構成に従い、以下の位置に挿入：

#### パラメータセクション構成

```groovy
parameters {
    // ========================================
    // 実行モード（固定値 - EXECUTION_MODE）
    // ========================================

    // ========================================
    // 基本設定
    // ========================================
    stringParam('ISSUE_URL', ...)
    stringParam('BRANCH_NAME', ...)
    choiceParam('AGENT_MODE', ...)

    // ========================================
    // 実行オプション
    // ========================================
    booleanParam('DRY_RUN', ...)
    booleanParam('SKIP_REVIEW', ...)
    booleanParam('FORCE_RESET', ...)
    choiceParam('MAX_RETRIES', ...)
    booleanParam('CLEANUP_ON_COMPLETE_FORCE', ...)
    booleanParam('SQUASH_ON_COMPLETE', ...)

    // ========================================
    // モデル選択オプション（NEW）
    // ========================================
    booleanParam('AUTO_MODEL_SELECTION', true, ...)  // ← ここに追加

    // ========================================
    // Git 設定
    // ========================================
    ...
}
```

**挿入位置**: `SQUASH_ON_COMPLETE` パラメータの直後、`Git 設定` セクションの直前

### 各ファイルでの追加箇所

#### 1. `ai_workflow_all_phases_job.groovy`

**挿入位置**: Line 100-105 付近（`SQUASH_ON_COMPLETE` の直後）

```groovy
booleanParam('SQUASH_ON_COMPLETE', false, '''
コミットスカッシュ機能を有効化
...
'''.stripIndent().trim())

// ========================================
// モデル選択オプション
// ========================================
booleanParam('AUTO_MODEL_SELECTION', true, '''
Issue の難易度に応じて自動的にエージェントモデルを選択
- true: Issue 本文を分析して最適なモデル（Claude: opus/sonnet、Codex: max/mini）を自動選択
- false: AGENT_MODE パラメータに従って固定モデルを使用

デフォルト: true（コスト最適化と品質向上を両立）
詳細: Issue #363、v0.5.0で追加
'''.stripIndent().trim())

// ========================================
// Git 設定
// ========================================
stringParam('GIT_USER_NAME', '', '''
...
'''.stripIndent().trim())
```

#### 2. `ai_workflow_preset_job.groovy`

**挿入位置**: `SQUASH_ON_COMPLETE` パラメータの直後

```groovy
booleanParam('SQUASH_ON_COMPLETE', false, '''
コミットスカッシュ機能を有効化
...
'''.stripIndent().trim())

// ========================================
// モデル選択オプション
// ========================================
booleanParam('AUTO_MODEL_SELECTION', true, '''
Issue の難易度に応じて自動的にエージェントモデルを選択
- true: Issue 本文を分析して最適なモデル（Claude: opus/sonnet、Codex: max/mini）を自動選択
- false: AGENT_MODE パラメータに従って固定モデルを使用

デフォルト: true（コスト最適化と品質向上を両立）
詳細: Issue #363、v0.5.0で追加
'''.stripIndent().trim())

// ========================================
// Git 設定
// ========================================
```

#### 3. `ai_workflow_single_phase_job.groovy`

**挿入位置**: `SQUASH_ON_COMPLETE` パラメータの直後

（同上）

#### 4. `ai_workflow_rollback_job.groovy`

**注意**: rollback は init コマンドを実行しないため、`AUTO_MODEL_SELECTION` は実際には使用されません。しかし、パラメータの一貫性のために追加することを推奨します。

**挿入位置**: 実行オプションセクションの末尾

```groovy
stringParam('REASON', '', '''
差し戻し理由（必須）
...
'''.stripIndent().trim())

// ========================================
// モデル選択オプション
// ========================================
booleanParam('AUTO_MODEL_SELECTION', true, '''
Issue の難易度に応じて自動的にエージェントモデルを選択
注: rollback コマンドは init を実行しないため、このパラメータは使用されません
一貫性のために定義されています

デフォルト: true
詳細: Issue #363、v0.5.0で追加
'''.stripIndent().trim())

// ========================================
// Git 設定
// ========================================
```

#### 5. `ai_workflow_finalize_job.groovy`

**注意**: finalize は init コマンドを実行しないため、`AUTO_MODEL_SELECTION` は実際には使用されません。しかし、パラメータの一貫性のために追加することを推奨します。

**挿入位置**: 実行オプションセクションの末尾

```groovy
stringParam('BASE_BRANCH', 'main', '''
PRのマージ先ブランチ
...
'''.stripIndent().trim())

// ========================================
// モデル選択オプション
// ========================================
booleanParam('AUTO_MODEL_SELECTION', true, '''
Issue の難易度に応じて自動的にエージェントモデルを選択
注: finalize コマンドは init を実行しないため、このパラメータは使用されません
一貫性のために定義されています

デフォルト: true
詳細: Issue #363、v0.5.0で追加
'''.stripIndent().trim())

// ========================================
// Git 設定
// ========================================
```

## パラメータカウントの更新

各 Job DSL ファイルの冒頭にあるパラメータ数のコメントを更新：

### Before

```groovy
/**
 * AI Workflow All Phases Job DSL
 *
 * 全フェーズ一括実行用ジョブ（planning → evaluation）
 * EXECUTION_MODE: all_phases（固定値、パラメータとして表示しない）
 * パラメータ数: 20個（14個 + APIキー6個）
 */
```

### After

```groovy
/**
 * AI Workflow All Phases Job DSL
 *
 * 全フェーズ一括実行用ジョブ（planning → evaluation）
 * EXECUTION_MODE: all_phases（固定値、パラメータとして表示しない）
 * パラメータ数: 21個（15個 + APIキー6個）
 */
```

**更新内容**: `14個 → 15個`（AUTO_MODEL_SELECTION を追加）、合計 `20個 → 21個`

## 期待される動作

### Job DSL 更新前（現状）

```groovy
// Jenkins UI
Parameters:
  - ISSUE_URL: (text field)
  - BRANCH_NAME: (text field)
  - AGENT_MODE: (dropdown: auto, codex, claude)
  - DRY_RUN: (checkbox)
  - ...
  // AUTO_MODEL_SELECTION が表示されない

// Jenkinsfile 実行時
env.AUTO_MODEL_SELECTION = "${params.AUTO_MODEL_SELECTION ?: 'true'}"
// params.AUTO_MODEL_SELECTION が null のため、フォールバック値 'true' が使用される
// しかし、明示的に設定できないため、ユーザーが制御できない
```

### Job DSL 更新後（期待される動作）

```groovy
// Jenkins UI
Parameters:
  - ISSUE_URL: (text field)
  - BRANCH_NAME: (text field)
  - AGENT_MODE: (dropdown: auto, codex, claude)
  - DRY_RUN: (checkbox)
  - ...
  - AUTO_MODEL_SELECTION: (checkbox, default: checked)  // ← 新規追加

// Jenkinsfile 実行時
env.AUTO_MODEL_SELECTION = "${params.AUTO_MODEL_SELECTION ?: 'true'}"
// params.AUTO_MODEL_SELECTION が true/false のいずれかの値を持つ
// ユーザーが明示的に ON/OFF を切り替え可能
```

## テスト計画

### 1. Job DSL パース検証

```bash
# Jenkins Job DSL Plugin で文法エラーがないか確認
cd jenkins/jobs/dsl/ai-workflow
groovy -cp /path/to/jenkins-job-dsl.jar ai_workflow_all_phases_job.groovy
```

### 2. Jenkins UI 確認

1. Job DSL スクリプトを実行して Job を再生成
2. 各 Job の「ビルドパラメータ」画面を開く
3. `AUTO_MODEL_SELECTION` パラメータが表示されることを確認
4. デフォルト値が `true`（checked）であることを確認

### 3. 実行テスト

```bash
# ビルド実行時にパラメータが正しく渡されることを確認
# Jenkins コンソールログで以下を確認:
[INFO] AUTO_MODEL_SELECTION: true
[INFO] Executing: node dist/index.js init --issue-url ... --auto-model-selection
```

### 4. OFF 設定テスト

```bash
# AUTO_MODEL_SELECTION を OFF に設定してビルド実行
# Jenkins コンソールログで以下を確認:
[INFO] AUTO_MODEL_SELECTION: false
[INFO] Executing: node dist/index.js init --issue-url ...
# (--auto-model-selection フラグが付与されないことを確認)
```

## 後方互換性

### 既存のビルド

- 既存のビルドは `AUTO_MODEL_SELECTION` パラメータが未定義のため、Jenkinsfile 側のフォールバック値 `'true'` が使用される
- 動作は変わらない（デフォルトで自動モデル選択が有効）

### 新規ビルド

- Job DSL 更新後の新規ビルドでは、`AUTO_MODEL_SELECTION` パラメータが UI に表示される
- デフォルト値は `true`（checked）のため、既存の動作と一致

### ドキュメント

- CLAUDE.md、README.md には既に `AUTO_MODEL_SELECTION` パラメータの説明が記載されている
- 追加の更新は不要

## 成果物

### 更新ファイル

1. `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy`
2. `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy`
3. `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy`
4. `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy`
5. `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`

### コミットメッセージ例

```
feat(jenkins): Add AUTO_MODEL_SELECTION parameter to Job DSL files

Add AUTO_MODEL_SELECTION boolean parameter to all Job DSL files to enable
users to control automatic model selection via Jenkins UI.

Changes:
- Added booleanParam('AUTO_MODEL_SELECTION', true, ...) to all 5 Job DSL files
- Updated parameter count in file headers (14 → 15 individual params)
- Positioned after SQUASH_ON_COMPLETE, before Git settings section

Note:
- Jenkinsfile support was already added in Issue #379 (PR #381)
- This completes the implementation by exposing the parameter in Jenkins UI

Benefits:
- Users can explicitly enable/disable auto-model-selection
- Default: true (cost optimization + quality improvement)
- Consistent with existing Jenkinsfile implementation

Related: Issue #379, Issue #384
```

## 関連Issue

- Issue #379: Jenkins の init コマンド実行時に --auto-model-selection を有効化（Jenkinsfile 更新済み）
- Issue #363: 自動モデル選択機能の実装（コア機能）

## チェックリスト

- [ ] `ai_workflow_all_phases_job.groovy` に `AUTO_MODEL_SELECTION` パラメータを追加
- [ ] `ai_workflow_preset_job.groovy` に `AUTO_MODEL_SELECTION` パラメータを追加
- [ ] `ai_workflow_single_phase_job.groovy` に `AUTO_MODEL_SELECTION` パラメータを追加
- [ ] `ai_workflow_rollback_job.groovy` に `AUTO_MODEL_SELECTION` パラメータを追加
- [ ] `ai_workflow_finalize_job.groovy` に `AUTO_MODEL_SELECTION` パラメータを追加
- [ ] 各ファイルのパラメータ数コメントを更新（14個 → 15個）
- [ ] Job DSL パース検証
- [ ] Jenkins UI でパラメータ表示を確認
- [ ] 実行テスト（ON/OFF 両方）
- [ ] コンソールログでフラグ付与を確認
