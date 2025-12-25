# 要件定義書

## Issue #489: CLI全コマンドに--language/AI_WORKFLOW_LANGUAGEを追加しワークフロー言語を一元設定可能にする

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Phaseにて、以下の戦略が策定されている：

- **複雑度**: 中程度（12〜16時間の見積もり）
- **実装戦略**: EXTEND（既存ファイルの拡張のみ、新規ファイル作成不要）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト＋インテグレーションテスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張＋新規テスト作成）
- **リスク評価**: 低〜中（後方互換性維持、デフォルト値`ja`で既存挙動保持）

### 主要な設計判断

1. **優先順位ロジック**: CLI > 環境変数 > メタデータ > デフォルト値(`ja`)
2. **許容値**: `ja` または `en` のみ
3. **後方互換性**: メタデータに`language`フィールドがない場合は`ja`にフォールバック

---

## 1. 概要

### 1.1 背景

現在、ai-workflowのエージェントプロンプトは日本語固定となっており、以下の課題がある：

- 英語圏チームや多言語プロジェクトでは、毎回手動で翻訳や再設定が必要
- `init`/`execute`後の自動PRコメントやフォローアップで言語が揃わない
- ユーザー体験が分断される

### 1.2 目的

ai-workflowの全コマンドに共通の言語指定手段（CLIオプションと環境変数）を追加し、メタデータを介してワークフロー全体で一貫した言語設定を維持する。

### 1.3 ビジネス価値

- **国際化対応**: 海外チームや多言語Issueでの利用性向上
- **一貫性**: コマンド間でシームレスに言語設定を引き継ぎ
- **後方互換性維持**: 既存の`ja`デフォルト挙動を保持し、移行リスクを最小化

### 1.4 技術的価値

- **設定の一元管理**: `config.ts`に`getWorkflowLanguage()`を追加し、環境変数取得を集約
- **拡張性**: 将来の多言語対応（フランス語、中国語等）への拡張基盤を構築
- **既存パターン踏襲**: `--claude-model`/`--codex-model`オプションと同様の実装パターンを採用

---

## 2. 機能要件

### 2.1 CLIオプション追加（優先度: 高）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-001 | `init`コマンドに`--language <ja\|en>`オプションを追加 | 言語設定をメタデータに保存 |
| FR-002 | `execute`コマンドに`--language <ja\|en>`オプションを追加 | 実行時の言語設定を指定 |
| FR-003 | `auto-issue`コマンドに`--language <ja\|en>`オプションを追加 | Issue生成時の言語を指定 |
| FR-004 | `pr-comment`サブコマンド群に`--language <ja\|en>`オプションを追加 | PRコメント処理の言語を指定 |
| FR-005 | `rollback`コマンドに`--language <ja\|en>`オプションを追加 | ロールバック処理の言語を指定 |
| FR-006 | `rollback-auto`コマンドに`--language <ja\|en>`オプションを追加 | 自動ロールバック処理の言語を指定 |
| FR-007 | `finalize`コマンドに`--language <ja\|en>`オプションを追加 | ファイナライズ処理の言語を指定 |

### 2.2 環境変数サポート（優先度: 高）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-010 | `AI_WORKFLOW_LANGUAGE`環境変数を追加 | `ja`または`en`を設定可能 |
| FR-011 | 環境変数の値を正規化 | 大文字小文字を区別しない（`JA`、`Ja`、`ja`すべて有効） |
| FR-012 | 不正値入力時の処理 | 許可値以外の場合は無視し、デフォルト値`ja`を使用 |

### 2.3 設定値取得ロジック（優先度: 高）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-020 | `config.ts`に`getWorkflowLanguage()`メソッドを追加 | 環境変数`AI_WORKFLOW_LANGUAGE`の取得とバリデーション |
| FR-021 | 優先順位ロジックの実装 | CLI > 環境変数 > メタデータ > デフォルト(`ja`) |
| FR-022 | `IConfig`インターフェースの更新 | `getWorkflowLanguage(): 'ja' \| 'en' \| null`を追加 |

### 2.4 型定義の拡張（優先度: 高）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-030 | `WorkflowMetadata`に`language`フィールドを追加 | `language?: 'ja' \| 'en' \| null` |
| FR-031 | `ExecuteCommandOptions`に`language`フィールドを追加 | `language?: string` |
| FR-032 | `PhaseContext`に`language`フィールドを追加 | `language?: 'ja' \| 'en'` |
| FR-033 | 各コマンドオプションインターフェースに`language`を追加 | `InitCommandOptions`、`PRCommentInitOptions`等 |

### 2.5 メタデータ管理（優先度: 高）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-040 | `metadata-manager.ts`に`setLanguage()`メソッドを追加 | 言語設定をメタデータに保存 |
| FR-041 | `metadata-manager.ts`に`getLanguage()`メソッドを追加 | メタデータから言語設定を取得 |
| FR-042 | 後方互換性のフォールバック | `language`フィールドがない既存メタデータでは`ja`を返す |

### 2.6 オプションパーサー拡張（優先度: 中）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-050 | `parseExecuteOptions()`に言語パース処理を追加 | `language`オプションの正規化 |
| FR-051 | `ParsedExecuteOptions`に`language`フィールドを追加 | `language?: 'ja' \| 'en'` |
| FR-052 | `validateExecuteOptions()`に言語バリデーションを追加 | `ja`/`en`以外の値はエラー |

### 2.7 コマンドハンドラ更新（優先度: 中）

| ID | 要件 | 詳細 |
|----|------|------|
| FR-060 | `init.ts`で言語をメタデータに保存 | オプション指定時のみ保存 |
| FR-061 | `execute.ts`で言語を取得してコンテキストに渡す | 優先順位ロジックに従い言語を決定 |
| FR-062 | 各エージェント呼び出し時に言語設定を伝播 | プロンプト生成時に言語設定を参照 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-001 | 言語設定の取得は100ms以内 | メタデータ読み込みを含む |
| NFR-002 | 追加の外部API呼び出しなし | 設定はローカルで完結 |

### 3.2 セキュリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-010 | 言語設定に機密情報を含めない | `ja`/`en`のみ許可 |
| NFR-011 | 入力値のサニタイズ | インジェクション攻撃防止 |

### 3.3 可用性・信頼性要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-020 | 言語設定不正時もワークフロー継続 | デフォルト`ja`にフォールバック |
| NFR-021 | メタデータ破損時も言語設定可能 | CLI/環境変数で上書き可能 |

### 3.4 保守性・拡張性要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-030 | 将来の言語追加が容易 | 許可値リストを一箇所で管理 |
| NFR-031 | テストカバレッジ維持 | 追加機能のカバレッジ80%以上 |
| NFR-032 | 既存コードパターンに従う | `--claude-model`等の実装を参考 |

---

## 4. 制約事項

### 4.1 技術的制約

| ID | 制約 | 詳細 |
|----|------|------|
| TC-001 | TypeScript 5.x以上 | 既存プロジェクト設定に従う |
| TC-002 | Node.js 18以上 | 既存プロジェクト設定に従う |
| TC-003 | commander.js使用 | CLIオプション定義は既存フレームワークを使用 |
| TC-004 | 許可言語は`ja`/`en`のみ | Phase 1では2言語に限定 |

### 4.2 リソース制約

| ID | 制約 | 詳細 |
|----|------|------|
| RC-001 | 見積もり工数12〜16時間 | Planning Phaseで策定 |
| RC-002 | 新規ファイル作成不要 | 既存ファイルの拡張のみ |

### 4.3 ポリシー制約

| ID | 制約 | 詳細 |
|----|------|------|
| PC-001 | 後方互換性維持必須 | 既存ワークフローが動作し続けること |
| PC-002 | マイグレーションレス | 既存メタデータの変更なしで動作 |
| PC-003 | ESLint/Prettierルール遵守 | 既存コーディング規約に従う |

---

## 5. 前提条件

### 5.1 システム環境

| ID | 前提条件 | 詳細 |
|----|----------|------|
| PRE-001 | Node.js 18以上がインストール済み | ランタイム要件 |
| PRE-002 | npm/pnpmが利用可能 | パッケージマネージャ |
| PRE-003 | Gitがインストール済み | バージョン管理 |

### 5.2 依存コンポーネント

| ID | 前提条件 | 詳細 |
|----|----------|------|
| PRE-010 | `commander`パッケージ（既存） | CLIオプション定義 |
| PRE-011 | `fs-extra`パッケージ（既存） | ファイル操作 |
| PRE-012 | 既存の`config.ts`モジュール | 環境変数管理 |
| PRE-013 | 既存の`metadata-manager.ts`モジュール | メタデータ管理 |

### 5.3 外部システム連携

| ID | 前提条件 | 詳細 |
|----|----------|------|
| PRE-020 | GitHub API（既存連携） | Issue/PR操作 |
| PRE-021 | Claude/Codexエージェント（既存連携） | エージェント実行 |

---

## 6. 受け入れ基準

### 6.1 CLIオプション（FR-001〜FR-007）

```gherkin
Scenario: init コマンドで --language ja を指定
  Given ワークフローが初期化されていない
  When `ai-workflow-v2 init --issue-url <url> --language ja` を実行する
  Then メタデータに `language: "ja"` が保存される
  And 初期化が正常に完了する

Scenario: init コマンドで --language en を指定
  Given ワークフローが初期化されていない
  When `ai-workflow-v2 init --issue-url <url> --language en` を実行する
  Then メタデータに `language: "en"` が保存される
  And 初期化が正常に完了する

Scenario: execute コマンドで --language を指定
  Given Issue #123 のワークフローが初期化済み
  When `ai-workflow-v2 execute --issue 123 --language en` を実行する
  Then 実行中の言語設定が `en` になる
  And エージェントプロンプトが英語で生成される

Scenario: 不正な言語値を指定
  Given ワークフローが初期化されていない
  When `ai-workflow-v2 init --issue-url <url> --language fr` を実行する
  Then バリデーションエラーが発生する
  And エラーメッセージに許可値 `ja|en` が含まれる
```

### 6.2 環境変数サポート（FR-010〜FR-012）

```gherkin
Scenario: 環境変数で言語を指定
  Given `AI_WORKFLOW_LANGUAGE=en` が設定されている
  And CLIで `--language` を指定していない
  When `ai-workflow-v2 execute --issue 123` を実行する
  Then 実行中の言語設定が `en` になる

Scenario: CLI優先で言語を決定
  Given `AI_WORKFLOW_LANGUAGE=ja` が設定されている
  When `ai-workflow-v2 execute --issue 123 --language en` を実行する
  Then 実行中の言語設定が `en` になる（CLIが優先）

Scenario: 環境変数の大文字小文字正規化
  Given `AI_WORKFLOW_LANGUAGE=EN` が設定されている
  When `ai-workflow-v2 execute --issue 123` を実行する
  Then 実行中の言語設定が `en` になる

Scenario: 不正な環境変数値
  Given `AI_WORKFLOW_LANGUAGE=french` が設定されている
  When `ai-workflow-v2 execute --issue 123` を実行する
  Then 環境変数は無視される
  And デフォルト言語 `ja` が使用される
```

### 6.3 優先順位ロジック（FR-020〜FR-022）

```gherkin
Scenario: 優先順位の検証 - CLIが最優先
  Given メタデータに `language: "ja"` が保存されている
  And `AI_WORKFLOW_LANGUAGE=ja` が設定されている
  When `ai-workflow-v2 execute --issue 123 --language en` を実行する
  Then 実行中の言語設定が `en` になる

Scenario: 優先順位の検証 - 環境変数がメタデータより優先
  Given メタデータに `language: "ja"` が保存されている
  And `AI_WORKFLOW_LANGUAGE=en` が設定されている
  And CLIで `--language` を指定していない
  When `ai-workflow-v2 execute --issue 123` を実行する
  Then 実行中の言語設定が `en` になる

Scenario: 優先順位の検証 - メタデータがデフォルトより優先
  Given メタデータに `language: "en"` が保存されている
  And `AI_WORKFLOW_LANGUAGE` が設定されていない
  And CLIで `--language` を指定していない
  When `ai-workflow-v2 execute --issue 123` を実行する
  Then 実行中の言語設定が `en` になる

Scenario: 優先順位の検証 - 全て未設定時はデフォルト
  Given メタデータに `language` フィールドが存在しない
  And `AI_WORKFLOW_LANGUAGE` が設定されていない
  And CLIで `--language` を指定していない
  When `ai-workflow-v2 execute --issue 123` を実行する
  Then 実行中の言語設定が `ja` になる
```

### 6.4 後方互換性（FR-042）

```gherkin
Scenario: 既存メタデータ（language未設定）との互換
  Given Issue #100 の既存メタデータに `language` フィールドがない
  When `ai-workflow-v2 execute --issue 100` を実行する
  Then 実行中の言語設定が `ja` になる（デフォルト）
  And ワークフローが正常に動作する

Scenario: 既存メタデータへの書き込み
  Given Issue #100 の既存メタデータに `language` フィールドがない
  When `ai-workflow-v2 execute --issue 100 --language en` を実行する
  Then メタデータに `language: "en"` が追加される
  And 既存のフィールドは変更されない
```

---

## 7. スコープ外

### 7.1 Phase 1でスコープ外とする事項

| ID | 事項 | 理由 |
|----|------|------|
| OUT-001 | 3言語以上のサポート（fr, zh, es等） | Phase 2以降で検討 |
| OUT-002 | プロンプトテンプレートの言語別分離 | Phase 2以降で検討 |
| OUT-003 | UIの多言語化 | CLIツールのためスコープ外 |
| OUT-004 | 言語設定のリアルタイム変更 | ワークフロー実行中の変更は不可 |
| OUT-005 | 言語検出の自動化 | Issue本文からの言語自動検出は将来検討 |

### 7.2 将来の拡張候補

| ID | 事項 | 詳細 |
|----|------|------|
| FUT-001 | 多言語プロンプトテンプレート | 言語別のプロンプトファイル管理 |
| FUT-002 | Issue言語自動検出 | Issue本文の言語を自動判定 |
| FUT-003 | 言語別モデル最適化 | 言語に応じたモデル選択 |
| FUT-004 | 追加言語サポート | fr, zh, de, es等 |

---

## 8. 用語集

| 用語 | 定義 |
|------|------|
| CLI | Command Line Interface（コマンドラインインターフェース） |
| メタデータ | `.ai-workflow/issue-{number}/metadata.json`に保存されるワークフロー情報 |
| フォールバック | 設定値が見つからない場合のデフォルト値への切り替え |
| 正規化 | 入力値を標準形式に変換すること（例: 大文字→小文字） |

---

## 9. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| 1.0 | 2025-01-15 | 初版作成 |

---

## 10. 参照ドキュメント

- Planning Document: `.ai-workflow/issue-489/00_planning/output/planning.md`
- GitHub Issue: https://github.com/tielec/ai-workflow-agent/issues/489
