---
name: rollback-phase
description: ワークフローを前のフェーズに差し戻し（手動指定または AI 自動判定）
version: 1.0.0
context: fork
tools:
  - Bash
  - Read
  - Write
hooks:
  pre-tool-use: |
    # メタデータ存在確認
    if tool == "Bash" and "rollback" in args:
      verify_metadata_exists()
---

# フェーズ差し戻しスキル

このスキルはワークフローを前のフェーズに差し戻します。手動で差し戻し先を指定するか、AI エージェントに自動判定させることができます。

## できること

1. **手動差し戻し**: 差し戻し先フェーズとステップを指定
2. **自動差し戻し**: AI がメタデータとレビュー結果を分析して判定
3. 差し戻し理由の記録（3つの入力方法）
4. メタデータの自動更新
5. 差し戻し履歴の保存

## 使い方

### 自動差し戻し（AI 判定、推奨）

```
/rollback-phase 658
```

AI エージェントが以下を分析して差し戻しが必要か判定：
- メタデータの状態
- レビュー結果
- テスト結果

### 手動差し戻し（フェーズ指定）

```
/rollback-phase 658 --to-phase implementation
```

差し戻し理由は以下の3つの方法で指定可能：

#### 1. 直接指定
```
/rollback-phase 658 --to-phase implementation --reason "テストが失敗したため修正が必要"
```

#### 2. ファイルから読み込み
```
/rollback-phase 658 --to-phase implementation --reason-file /path/to/reason.md
```

#### 3. インタラクティブ入力
```
/rollback-phase 658 --to-phase implementation --interactive
```

## オプション

### 共通オプション

- **`--issue <NUM>`**: Issue 番号（必須）
- **`--agent <auto|codex|claude>`**: 使用するエージェント（自動差し戻し時、デフォルト: `auto`）
- **`--dry-run`**: プレビューモード（実際には差し戻さない）
- **`--force`**: 確認プロンプトをスキップ

### 手動差し戻し用オプション

- **`--to-phase <phase>`**: 差し戻し先フェーズ名（必須）
- **`--to-step <step>`**: 差し戻し先ステップ（`execute` | `review` | `revise`、デフォルト: `revise`）
- **`--from-phase <phase>`**: 差し戻し元フェーズ（省略時は現在の最新完了フェーズ）
- **`--reason <text>`**: 差し戻し理由を直接指定
- **`--reason-file <path>`**: 差し戻し理由をファイルから読み込み
- **`--interactive`**: 差し戻し理由を標準入力から入力

## フェーズとステップ

### フェーズ名

- `planning` (Phase 0)
- `requirements` (Phase 1)
- `design` (Phase 2)
- `test-scenario` (Phase 3)
- `implementation` (Phase 4)
- `test-implementation` (Phase 5)
- `testing` (Phase 6)
- `documentation` (Phase 7)
- `report` (Phase 8)
- `evaluation` (Phase 9)

### ステップ名

- `execute`: フェーズの最初から実行
- `review`: レビューステップから実行
- `revise`: 修正ステップから実行（デフォルト）

## 使用例

### 自動差し戻し

```
# AI エージェントに判定させる（推奨）
/rollback-phase 658

# プレビューモード（実際には差し戻さない）
/rollback-phase 658 --dry-run

# 高信頼度判定時は確認スキップ
/rollback-phase 658 --force

# 特定のエージェントを使用
/rollback-phase 658 --agent claude
```

### 手動差し戻し（直接理由指定）

```
/rollback-phase 658 \
  --to-phase implementation \
  --reason "テストが失敗したため、エラーハンドリングを追加する必要があります"
```

### 手動差し戻し（ファイルから理由指定）

```
/rollback-phase 658 \
  --to-phase implementation \
  --reason-file ./rollback-reason.md
```

### 手動差し戻し（インタラクティブ入力）

```
/rollback-phase 658 \
  --to-phase implementation \
  --interactive
```

### 特定ステップへの差し戻し

```
# execute ステップから再実行
/rollback-phase 658 \
  --to-phase implementation \
  --to-step execute \
  --reason "設計変更のため全体を再実装"

# review ステップから再実行
/rollback-phase 658 \
  --to-phase testing \
  --to-step review \
  --reason "テスト結果の再レビューが必要"
```

### プレビューモード

```
# 差し戻し内容を確認（実際には差し戻さない）
/rollback-phase 658 \
  --to-phase implementation \
  --reason "確認用" \
  --dry-run
```

## 自動差し戻しの判定基準

AI エージェントは以下を分析します：

1. **メタデータ分析**:
   - 各フェーズのステータス
   - 完了したステップ
   - リトライ回数

2. **レビュー結果分析**:
   - 最新のレビュー結果（PASS/WARN/FAIL）
   - レビューフィードバックの内容
   - 提案された修正内容

3. **テスト結果分析**:
   - テストの成功/失敗状況
   - 失敗したテストの詳細
   - エラーメッセージ

4. **判定結果**:
   - `needs_rollback`: 差し戻しが必要か（true/false）
   - `to_phase`: 差し戻し先フェーズ
   - `to_step`: 差し戻し先ステップ
   - `reason`: 差し戻し理由
   - `confidence`: 判定の信頼度（high/medium/low）

## 差し戻し処理の詳細

差し戻し実行時、以下の処理が行われます：

1. **メタデータ更新**:
   - 差し戻し先フェーズを `in_progress` に設定
   - 後続フェーズを `pending` にリセット
   - `completed_steps` をクリア

2. **差し戻し履歴記録**:
   - `metadata.json` の `rollback_history` に追加
   - タイムスタンプ、差し戻し元/先、理由を記録

3. **ROLLBACK_REASON.md 生成**:
   - 差し戻し理由を記録したファイルを生成
   - `.ai-workflow/issue-{NUM}/{phase}/ROLLBACK_REASON.md`

4. **プロンプト自動注入**:
   - 次回の `revise` ステップで差し戻し理由が自動的に注入される

## エラー対応

このスキルは一般的なエラーを自動的に処理します：

- **メタデータが見つからない**: ワークフローの初期化を促す
- **差し戻し先フェーズが無効**: 有効なフェーズ名を提案
- **差し戻し理由が未指定**: 理由の入力方法を案内
- **差し戻し不要**: AI が差し戻し不要と判定した場合の説明

## 内部実装

### 自動差し戻し

```bash
node dist/index.js rollback-auto \
  --issue <NUM> \
  [--agent <auto|codex|claude>] \
  [--dry-run] \
  [--force]
```

### 手動差し戻し

```bash
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <phase> \
  [--to-step <step>] \
  [--from-phase <phase>] \
  [--reason <text> | --reason-file <path> | --interactive] \
  [--dry-run] \
  [--force]
```

## 出力例

### 自動差し戻し

```
→ AI エージェント (claude) が差し戻し判定を実行中...

判定結果:
  差し戻し必要: はい
  差し戻し先: implementation (Phase 4)
  差し戻しステップ: revise
  信頼度: high

理由:
  Testing Phase でテストが失敗しています。
  エラーハンドリングが不足しているため、
  Implementation Phase に戻って修正が必要です。

✓ 差し戻しを実行しますか？ [Y/n]
```

### 手動差し戻し

```
→ Phase 6 (testing) → Phase 4 (implementation) へ差し戻し中...

✓ メタデータを更新しました
✓ 差し戻し履歴を記録しました
✓ ROLLBACK_REASON.md を生成しました

次回の実行:
  /execute-phase 658 --phase implementation
```

## 次のステップ

差し戻し後、以下のアクションが可能です：

1. フェーズを再実行: `/execute-phase 658 --phase <to-phase>`
2. ワークフロー状態を確認: `/workflow-status`
3. 必要に応じて再度差し戻し: `/rollback-phase 658`

## ヒント

- 初めて使う場合は `--dry-run` でプレビューを確認するのがおすすめ
- 自動差し戻しは AI が判断するため、複雑な状況でも適切な差し戻し先を提案
- 手動差し戻しは明確な理由がある場合に使用
- 差し戻し履歴は `metadata.json` の `rollback_history` で確認可能
