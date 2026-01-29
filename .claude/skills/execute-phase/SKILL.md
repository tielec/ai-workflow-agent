---
name: execute-phase
description: AI ワークフローのフェーズを実行（プリセットまたは個別フェーズ指定）
version: 1.0.0
context: fork
tools:
  - Bash
  - Read
  - Write
hooks:
  pre-tool-use: |
    # メタデータ存在確認
    if tool == "Bash" and "execute" in args:
      verify_metadata_exists()
---

# フェーズ実行スキル

このスキルは AI ワークフローのフェーズを実行します。プリセットワークフローまたは個別フェーズを指定できます。

## できること

1. プリセットワークフローの実行（複数フェーズを一括実行）
2. 個別フェーズの実行
3. 全フェーズの実行（Phase 0-9）
4. 自動レジューム（失敗したフェーズから再開）
5. エージェントの自動選択またはフォールバック

## 使い方

### Issue 番号を指定して実行

```
/execute-phase 658
```

対話的に以下を選択します：
- 実行モード（プリセット / 個別フェーズ / 全フェーズ）
- エージェント（auto / codex / claude）
- その他のオプション

### プリセット指定

```
/execute-phase 658 --preset implementation
```

### 個別フェーズ指定

```
/execute-phase 658 --phase planning
```

### 全フェーズ実行

```
/execute-phase 658 --phase all
```

## プリセット一覧

以下のプリセットが利用可能です：

| プリセット名 | 含まれるフェーズ | 用途 |
|------------|----------------|------|
| `review-requirements` | Planning + Requirements | 要件レビュー |
| `review-design` | Planning + Requirements + Design | 設計レビュー |
| `review-test-scenario` | Planning + Requirements + Design + TestScenario | テストシナリオレビュー |
| `analysis-design` | Planning + Requirements + Design | 分析・設計のみ |
| `quick-fix` | Planning + Implementation + Documentation + Report | 簡易修正（依存関係無視） |
| `implementation` | Planning + Implementation + TestImplementation + Testing + Documentation + Report | 実装フル |
| `testing` | Planning + TestImplementation + Testing | テストのみ |
| `finalize` | Planning + Documentation + Report + Evaluation | 最終処理 |

## フェーズ一覧

個別フェーズを指定する場合：

- `planning` (Phase 0): 計画立案
- `requirements` (Phase 1): 要件定義
- `design` (Phase 2): 設計
- `test-scenario` (Phase 3): テストシナリオ
- `implementation` (Phase 4): 実装
- `test-implementation` (Phase 5): テスト実装
- `testing` (Phase 6): テスト実行
- `documentation` (Phase 7): ドキュメント作成
- `report` (Phase 8): レポート作成
- `evaluation` (Phase 9): 評価

## オプション

- **`--preset <name>`**: プリセット名を指定
- **`--phase <name|all>`**: フェーズ名または `all` を指定
- **`--agent <auto|codex|claude>`**: エージェントを指定（デフォルト: `auto`）
- **`--codex-model <alias|model>`**: Codex モデルを指定（デフォルト: `max`）
- **`--claude-model <alias|model>`**: Claude モデルを指定（デフォルト: `opus`）
- **`--language <ja|en>`**: 言語を指定（デフォルト: メタデータから）
- **`--squash-on-complete`**: 完了時にコミットをスカッシュ
- **`--cleanup-on-complete`**: 完了時にワークフローディレクトリを削除
- **`--ignore-dependencies`**: 依存関係チェックをスキップ

## モデルエイリアス

### Codex モデル

| エイリアス | 実際のモデル | 用途 |
|-----------|------------|------|
| `max` | `gpt-5.1-codex-max` | デフォルト、長時間タスク |
| `mini` | `gpt-5.1-codex-mini` | 軽量、コスト重視 |
| `5.1` | `gpt-5.1` | 汎用 |
| `legacy` | `gpt-5-codex` | 後方互換性 |

### Claude モデル

| エイリアス | 実際のモデル | 用途 |
|-----------|------------|------|
| `opus` | `claude-opus-4-5-20251101` | デフォルト、最高性能 |
| `sonnet` | `claude-sonnet-4-20250514` | バランス型 |
| `haiku` | `claude-haiku-3-5-20241022` | 高速、低コスト |

## 使用例

### プリセット実行（推奨）

```
# 実装フルワークフロー
/execute-phase 658 --preset implementation

# 設計レビューのみ
/execute-phase 658 --preset review-design --agent claude

# 簡易修正（依存関係無視）
/execute-phase 658 --preset quick-fix --ignore-dependencies
```

### 個別フェーズ実行

```
# Planning フェーズのみ
/execute-phase 658 --phase planning

# Implementation フェーズを Codex mini で実行
/execute-phase 658 --phase implementation --agent codex --codex-model mini

# Testing フェーズを Claude Sonnet で実行
/execute-phase 658 --phase testing --agent claude --claude-model sonnet
```

### 全フェーズ実行

```
# Phase 0-9 すべて実行（失敗から自動レジューム）
/execute-phase 658 --phase all

# 全フェーズ実行 + 完了時スカッシュ
/execute-phase 658 --phase all --squash-on-complete

# 全フェーズ実行 + 完了時クリーンアップ
/execute-phase 658 --phase all --cleanup-on-complete
```

## エージェント選択戦略

`--agent auto`（デフォルト）の場合、フェーズの特性に応じて自動選択：

| フェーズ | 優先エージェント | 理由 |
|---------|----------------|------|
| Planning, Requirements, Design | Claude 優先 | 戦略立案、分析が得意 |
| Implementation, Test Implementation, Testing | Codex 優先 | コード実装が得意 |
| Documentation, Report, Evaluation | Claude 優先 | ドキュメント作成が得意 |

## 自動レジューム機能

`--phase all` 実行時、以前に失敗したフェーズから自動的に再開します：

```
/execute-phase 658 --phase all
```

出力例：
```
⚠ Phase 3 (test-scenario) が失敗していました
✓ Phase 3 から再開します
→ Phase 3: test-scenario を実行中...
```

## エラー対応

このスキルは一般的なエラーを自動的に処理します：

- **メタデータが見つからない**: `/init-workflow` の実行を促す
- **依存関係エラー**: 前提フェーズの実行または `--ignore-dependencies` を提案
- **エージェント認証失敗**: 環境変数の確認を案内
- **フェーズ実行失敗**: ログを確認して修正方法を提案

## 内部実装

このスキルは以下の CLI コマンドを実行します：

```bash
node dist/index.js execute \
  --issue <NUM> \
  [--preset <name> | --phase <name|all>] \
  [--agent <auto|codex|claude>] \
  [--codex-model <alias|model>] \
  [--claude-model <alias|model>] \
  [--language <ja|en>] \
  [--squash-on-complete] \
  [--cleanup-on-complete] \
  [--ignore-dependencies]
```

## 出力例

フェーズ実行中の表示：

```
→ Phase 0: planning を実行中...
  エージェント: claude (opus)
  プロンプト: src/prompts/planning/ja/execute.txt
  最大ターン数: 50

✓ Phase 0: planning が完了しました
  出力: .ai-workflow/issue-658/00_planning/output/planning.md
  コスト: $0.45

→ Phase 1: requirements を実行中...
  ...
```

## 次のステップ

フェーズ実行後、以下のアクションが可能です：

1. ワークフロー状態を確認: `/workflow-status`
2. 必要に応じて差し戻し: `/rollback-phase`
3. 最終処理を実行: `/finalize-workflow`
4. ログをクリーンアップ: `/cleanup-logs`

## ヒント

- 初めての Issue には `--preset implementation` がおすすめ
- コスト重視の場合は `--codex-model mini --claude-model sonnet` を指定
- 失敗したフェーズは `--phase <name>` で個別に再実行可能
- `--squash-on-complete` は Evaluation Phase 完了時のみ有効
