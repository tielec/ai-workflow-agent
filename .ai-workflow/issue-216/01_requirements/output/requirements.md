# 要件定義書

## Issue情報

- **Issue番号**: #216
- **タイトル**: bug: --squash-on-complete が正常に動作しない（複数の問題）
- **状態**: open
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/216
- **作成日**: 2025-12-04

---

## 0. Planning Documentの確認

Planning Document（@.ai-workflow/issue-216/00_planning/output/planning.md）を確認し、以下の開発計画を把握しました：

### 開発計画の要点

- **複雑度**: 中程度
- **見積もり工数**: 12~16時間
- **実装戦略**: EXTEND（既存コードの拡張）
  - `squash-manager.ts` の `__dirname` を ESM 互換の方法に変更
  - `remote-manager.ts` に force push 専用メソッドを追加
  - `squash-manager.ts` の `executeSquash()` メソッドを修正
- **テスト戦略**: UNIT_INTEGRATION
  - ユニットテスト: パス解決、force push メソッド、エラーハンドリング
  - 統合テスト: 実際のGitリポジトリを使用したスカッシュ＆プッシュの動作確認
- **テストコード戦略**: EXTEND_TEST（既存テストファイルに追加）

### 主要なリスク

1. Force push によるデータ損失（影響度: 高、確率: 低）
2. RemoteManager の変更が他機能に影響（影響度: 中、確率: 中）
3. ESM環境でのパス解決エラー（影響度: 中、確率: 低）

Planning Documentの戦略を踏まえて、以下の要件定義を実施します。

---

## 1. 概要

### 背景

Issue #194で実装されたコミットスカッシュ機能（`--squash-on-complete` オプション）において、以下3つの問題が発生しています：

1. **ESM環境での `__dirname` エラー**: プロンプトテンプレート読み込み時に `__dirname` が未定義
2. **Force push の失敗**: `--force-with-lease` が効いておらず、リモートへのpushが rejected
3. **Pull後のpushで履歴が復元**: Non-fast-forward エラー時に pull を実行し、スカッシュが無効化

これらの問題により、スカッシュコミット機能が実質的に動作せず、ユーザーがワークフロー完了後にコミット履歴を整理できない状態となっています。

### 目的

以下3つの問題を修正し、`--squash-on-complete` オプションを正常に動作させる：

1. **ESM互換のパス解決**: `__dirname` を `import.meta.url` + `fileURLToPath` に変更
2. **Force push の確実な実行**: `--force-with-lease` が正しく機能するように修正
3. **スカッシュ無効化の防止**: Pull によってスカッシュが無効化されないようにエラーハンドリングを改善

### ビジネス価値

- **ワークフロー品質向上**: PR レビュー時にコミット履歴が整理され、レビュー効率が向上
- **開発者体験改善**: ユーザーが手動でスカッシュする手間を削減
- **既存機能の信頼性確保**: Issue #194で導入された機能が正常に動作し、ユーザーの期待に応える

### 技術的価値

- **ESM互換性の確保**: プロジェクト全体のESM移行戦略に沿った実装
- **Git操作の安全性向上**: `--force-with-lease` による安全な強制プッシュを実現
- **エラーハンドリングの改善**: スカッシュ後のpush失敗時に適切なエラー処理を実装

---

## 2. 機能要件

### 2.1. ESM互換のパス解決（優先度: 高）

**要件ID**: REQ-216-001

**説明**: `squash-manager.ts` の `loadPromptTemplate()` メソッドで、ESM環境でも動作するパス解決を実装する。

**詳細**:
- `__dirname` を `import.meta.url` + `fileURLToPath` に置き換える
- 既存の ESM 互換パターン（`issue-agent-generator.ts`、`repository-analyzer.ts`）を参考にする
- プロジェクト全体で統一された方法を使用する

**受け入れ基準**:
- Given: `--squash-on-complete` オプションを指定してワークフローを実行
- When: Evaluation Phase 完了時にスカッシュ処理が開始
- Then: `__dirname is not defined` エラーが発生せず、プロンプトテンプレートが正常に読み込まれる

**関連ファイル**:
- `src/core/git/squash-manager.ts` (loadPromptTemplate メソッド、264行目付近)

**参考実装**:
- `src/core/github/issue-agent-generator.ts` (ESM 互換パターン)
- `src/core/repository-analyzer.ts` (ESM 互換パターン)

---

### 2.2. Force Push の確実な実行（優先度: 高）

**要件ID**: REQ-216-002

**説明**: `RemoteManager` に force push 専用メソッドを追加し、スカッシュ後の push で `--force-with-lease` が確実に使用されるようにする。

**詳細**:
- `RemoteManager.forcePushToRemote()` メソッドを新規追加
- `git.raw(['push', '--force-with-lease', 'origin', branchName])` を使用
- `squash-manager.ts` の `executeSquash()` メソッドで `forcePushToRemote()` を呼び出す
- エラーハンドリング（認証エラー、ネットワークエラー等）を実装

**受け入れ基準**:
- Given: スカッシュコミットが作成された状態
- When: `forcePushToRemote()` メソッドが呼び出される
- Then: `git push --force-with-lease` が実行され、リモートブランチが更新される

**関連ファイル**:
- `src/core/git/remote-manager.ts` (新規メソッド `forcePushToRemote()` を追加)
- `src/core/git/squash-manager.ts` (executeSquash メソッドを修正)

**実装方針**:
- `pushToRemote()` メソッドとは分離し、新しい `forcePushToRemote()` メソッドを追加（単一責任原則）
- 破壊的操作であることを明示するため、メソッド名に "force" を含める
- ブランチ保護チェック（main/master への force push を禁止）を維持

---

### 2.3. スカッシュ無効化の防止（優先度: 高）

**要件ID**: REQ-216-003

**説明**: スカッシュ後の push 失敗時に pull を実行せず、エラー終了するようにエラーハンドリングを改善する。

**詳細**:
- `RemoteManager.pushToRemote()` の non-fast-forward エラーハンドリングを見直す
- スカッシュ後の push では pull を実行しない（pull するとスカッシュ前の履歴が復元される）
- ユーザーに明確なエラーメッセージを表示し、手動での対処を促す

**受け入れ基準**:
- Given: スカッシュコミット作成後、リモートブランチが先に進んでいる状態
- When: `forcePushToRemote()` が non-fast-forward エラーで失敗
- Then: pull を実行せず、明確なエラーメッセージを表示してワークフローを終了する

**エラーメッセージ例**:
```
Error: Failed to push squashed commit. Remote branch has diverged.
Please manually resolve the conflict:
  1. git fetch origin
  2. git rebase origin/ai-workflow/issue-216
  3. git push --force-with-lease
```

**関連ファイル**:
- `src/core/git/remote-manager.ts` (pushToRemote メソッドのエラーハンドリング)
- `src/core/git/squash-manager.ts` (executeSquash メソッドのエラーハンドリング)

**実装方針**:
- スカッシュ後の push 失敗は、通常の push 失敗とは異なる扱いをする
- Force push が必要な状況では、pull は適切な対処法ではない
- ユーザーに手動での対処を促すことで、データ損失リスクを回避

---

## 3. 非機能要件

### 3.1. パフォーマンス要件

**要件ID**: NFR-216-001

**説明**: パス解決の変更により、プロンプトテンプレート読み込み時間が増加しないこと。

**測定基準**:
- プロンプトテンプレート読み込み時間: 100ms 以内（現在と同等）

---

### 3.2. 信頼性要件

**要件ID**: NFR-216-002

**説明**: Force push による意図しないデータ損失が発生しないこと。

**測定基準**:
- `--force-with-lease` により、他の変更を上書きしないことを統合テストで検証
- ブランチ保護チェック（main/master への force push 禁止）が機能することを確認

---

### 3.3. 保守性要件

**要件ID**: NFR-216-003

**説明**: ESM互換のパス解決が、プロジェクト全体で統一されたパターンに従うこと。

**測定基準**:
- `issue-agent-generator.ts`、`repository-analyzer.ts` と同じ `import.meta.url` + `fileURLToPath` パターンを使用
- プロジェクト全体のコードレビューで整合性を確認

---

### 3.4. 拡張性要件

**要件ID**: NFR-216-004

**説明**: `RemoteManager` の変更が、既存の通常 push 機能に影響を与えないこと。

**測定基準**:
- 既存の `pushToRemote()` メソッドのロジックは変更しない（新しい `forcePushToRemote()` メソッドを追加）
- 既存のユニットテスト・統合テストがすべて成功することを確認

---

## 4. 制約事項

### 4.1. 技術的制約

- **ESM環境**: Node.js の ESM（ES Modules）環境で動作すること
- **Git 命名規則**: ブランチ名バリデーション、ブランチ保護チェックを維持すること
- **既存コードとの整合性**: `RemoteManager` と `SquashManager` の責務分担を維持すること
- **プロンプトテンプレート**: `src/prompts/squash/generate-message.txt` のパスが正しく解決されること

### 4.2. リソース制約

- **工数**: 12~16時間（Planning Document の見積もり）
- **スケジュール**: Phase 1~8 を順次実施（Planning Documentのタスク分割に従う）

### 4.3. ポリシー制約

- **コーディング規約**: プロジェクトのコーディング規約（ESLint、Prettier）に従うこと
- **セキュリティポリシー**: Git URL のトークン除去（Issue #54）、シークレットマスキングを維持すること
- **レビュープロセス**: 実装後、ユニットテスト・統合テストを実施し、品質ゲートを満たすこと

---

## 5. 前提条件

### 5.1. システム環境

- **Node.js**: 20.x 以上（ESM サポート）
- **Git**: 2.x 以上（`--force-with-lease` サポート）
- **npm**: 10.x 以上

### 5.2. 依存コンポーネント

- **simple-git**: Git 操作ライブラリ（`RemoteManager` で使用）
- **fs-extra**: ファイルシステム操作（プロンプトテンプレート読み込みで使用）

### 5.3. 外部システム連携

- **GitHub**: リモートリポジトリへの push（`--force-with-lease` を使用）
- **CI/CD**: Jenkins 環境でのテスト実行

---

## 6. 受け入れ基準

### 6.1. REQ-216-001（ESM互換のパス解決）

- **Given**: `--squash-on-complete` オプションを指定してワークフローを実行
- **When**: Evaluation Phase 完了時にスカッシュ処理が開始
- **Then**:
  - `__dirname is not defined` エラーが発生しない
  - プロンプトテンプレート（`generate-message.txt`）が正常に読み込まれる
  - `loadPromptTemplate()` メソッドが正しいテンプレート内容を返す

### 6.2. REQ-216-002（Force Push の確実な実行）

- **Given**: スカッシュコミットが作成された状態
- **When**: `forcePushToRemote()` メソッドが呼び出される
- **Then**:
  - `git push --force-with-lease` が実行される
  - リモートブランチが更新される（スカッシュされた単一コミットが反映される）
  - ログに "Push completed successfully" メッセージが出力される

### 6.3. REQ-216-003（スカッシュ無効化の防止）

- **Given**: スカッシュコミット作成後、リモートブランチが先に進んでいる状態
- **When**: `forcePushToRemote()` が non-fast-forward エラーで失敗
- **Then**:
  - pull を実行しない
  - 明確なエラーメッセージを表示（手動対処方法を含む）
  - ワークフローを失敗ステータスで終了する
  - スカッシュ前のコミット履歴が `pre_squash_commits` メタデータに保存されている（ロールバック可能）

### 6.4. NFR-216-002（信頼性）

- **Given**: スカッシュコミット作成後、リモートブランチに他の変更が存在する
- **When**: `forcePushToRemote()` が実行される
- **Then**:
  - `--force-with-lease` により、他の変更を上書きせず、push が rejected される
  - エラーメッセージが表示される

### 6.5. NFR-216-004（拡張性）

- **Given**: 既存のユニットテスト・統合テストが実行される
- **When**: `RemoteManager` と `SquashManager` の変更後にテストを実行
- **Then**:
  - すべてのテストが成功する（既存機能に影響がない）
  - 通常の push 機能（`pushToRemote()`）が正常に動作する

---

## 7. スコープ外

以下の項目は本Issueのスコープ外とし、将来的な拡張候補とします：

### 7.1. スカッシュメッセージのカスタマイズ

- **説明**: ユーザーがスカッシュコミットメッセージを手動で編集する機能
- **理由**: 現在はエージェント生成のみをサポート。カスタマイズ機能は別Issueで検討
- **将来的な拡張**: `--squash-message` オプション、または `--squash-interactive` オプション

### 7.2. スカッシュ対象コミットの選択

- **説明**: 特定のコミット範囲のみをスカッシュする機能
- **理由**: 現在は `base_commit` から `HEAD` までの全コミットをスカッシュ。部分スカッシュは複雑性が高い
- **将来的な拡張**: `--squash-from <commit>` オプション

### 7.3. スカッシュ後の自動マージ

- **説明**: スカッシュ後、自動的にmainブランチへマージする機能
- **理由**: レビュープロセスをスキップする可能性があり、慎重な検討が必要
- **将来的な拡張**: `--squash-and-merge` オプション（CI/CD統合時に検討）

### 7.4. 他のGit操作（rebase、cherry-pick等）との統合

- **説明**: スカッシュとrebaseを組み合わせる機能
- **理由**: スカッシュ機能の安定化が優先。高度なGit操作は別Issueで検討

---

## 8. 依存関係

### 8.1. 前提となるIssue

- **Issue #194**: スカッシュコミット機能の実装（本Issueはバグ修正）
- **Issue #54**: Git URLのセキュリティ対策（トークン除去）

### 8.2. 関連するIssue

- **Issue #25**: GitManager のモジュール分解（RemoteManager の基盤）
- **Issue #23**: BasePhase のリファクタリング（フェーズ実行基盤）

### 8.3. 影響を受けるコンポーネント

- **src/core/git/squash-manager.ts**: 直接修正対象
- **src/core/git/remote-manager.ts**: 直接修正対象
- **tests/unit/squash-manager.test.ts**: テスト追加
- **tests/integration/squash-workflow.test.ts**: テスト追加

---

## 9. リスク管理

### 9.1. 高リスク（影響度: 高、確率: 低）

**リスク**: Force push によるデータ損失

**影響**:
- ユーザーのコミット履歴が意図せず削除される
- チーム開発で他の開発者の変更が失われる

**軽減策**:
- `--force-with-lease` を使用して、他の変更を上書きしないようにする
- スカッシュ前のコミットハッシュを `metadata.json` の `pre_squash_commits` に記録し、ロールバック可能にする
- ブランチ保護チェック（main/master への force push を禁止）を維持する
- 統合テストで force push の動作を十分に検証する

---

### 9.2. 中リスク（影響度: 中、確率: 中）

**リスク**: RemoteManager の変更が他機能に影響

**影響**:
- 通常の push 機能が正常に動作しなくなる
- 既存のワークフロー（Phase 0~9）で push が失敗する

**軽減策**:
- `pushToRemote()` メソッドの既存ロジックは変更せず、新しい `forcePushToRemote()` メソッドを追加する
- `pushToRemote()` の non-fast-forward エラーハンドリングは慎重に修正する（既存の通常プッシュに影響しないようにする）
- 既存のユニットテスト・統合テストを実行して、リグレッションがないか確認する

---

### 9.3. 中リスク（影響度: 中、確率: 低）

**リスク**: ESM環境でのパス解決エラー

**影響**:
- プロンプトテンプレートが読み込めず、スカッシュ処理が失敗する
- 他のESM互換コードとの不整合が発生する

**軽減策**:
- 既存の ESM 互換パターン（`issue-agent-generator.ts`、`repository-analyzer.ts`）を参考にする
- プロジェクト全体で統一された `import.meta.url` + `fileURLToPath` パターンを使用する
- ユニットテストでパス解決が正しく動作するか確認する

---

### 9.4. 中リスク（影響度: 中、確率: 中）

**リスク**: 統合テストでのエラー再現が困難

**影響**:
- 実際の環境でのみ発生するエラーを検出できない
- CI環境とローカル環境で動作が異なる

**軽減策**:
- ローカル環境で実際の Git リポジトリを使用してスカッシュ＆プッシュを検証する
- `--dry-run` オプション的なテストモード（実際には push しない）を検討する
- Jenkins CI 環境でのテスト実行を確認する

---

## 10. テスト要件

### 10.1. ユニットテスト

**テスト対象**:
- `squash-manager.ts` の `loadPromptTemplate()` メソッド
- `remote-manager.ts` の `forcePushToRemote()` メソッド
- スカッシュ後の push 失敗時のエラーハンドリング

**テストファイル**:
- `tests/unit/squash-manager.test.ts` に新しいテストケースを追加

**テストケース例**:
1. `loadPromptTemplate()` が正しいパスを解決するか
2. `forcePushToRemote()` が `--force-with-lease` を使用するか
3. スカッシュ後の push 失敗時に pull を実行しないか

---

### 10.2. 統合テスト

**テスト対象**:
- 実際のGitリポジトリでスカッシュ＆プッシュが成功するか
- `--force-with-lease` が正しく機能するか
- Pull によってスカッシュが無効化されないか

**テストファイル**:
- `tests/integration/squash-workflow.test.ts` に新しいテストケースを追加

**テストシナリオ例**:
1. スカッシュコミット作成 → force push 成功
2. リモートブランチに他の変更が存在 → `--force-with-lease` により push が rejected
3. スカッシュ後の push 失敗時に pull を実行せず、エラー終了

---

## 11. 成功指標

### 11.1. 機能的成功指標

- [ ] `__dirname is not defined` エラーが発生しない
- [ ] `git push --force-with-lease` が正常に実行される
- [ ] スカッシュされた単一コミットがリモートにプッシュされる
- [ ] Pull によってスカッシュが無効化されない

### 11.2. 非機能的成功指標

- [ ] 既存のユニットテスト・統合テストがすべて成功する（リグレッションなし）
- [ ] プロンプトテンプレート読み込み時間が 100ms 以内（パフォーマンス維持）
- [ ] `--force-with-lease` により、他の変更を上書きしない（安全性確保）

### 11.3. 品質ゲート

Planning Document（Phase 1）で定義された品質ゲートを満たすこと：

- [ ] **3つのエラーの発生条件が明確に記載されている**
- [ ] **既存の ESM 互換パターンが調査されている**
- [ ] **受け入れ基準が定義されている**:
  - `__dirname is not defined` エラーが発生しない
  - Force push が正常に実行される
  - Pull後のpushでスカッシュが無効化されない

---

## 12. 参考情報

### 12.1. 既存の ESM 互換パターン

以下のファイルを参考にして、ESM互換のパス解決を実装：

- `src/core/github/issue-agent-generator.ts`
- `src/core/repository-analyzer.ts`

**実装例**:
```typescript
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templatePath = path.join(__dirname, '../../../prompts/squash/generate-message.txt');
```

### 12.2. 関連ドキュメント

- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: GitManager のモジュール構成（RemoteManager、SquashManager）
- **README.md**: `--squash-on-complete` オプションの説明

---

## 13. 変更履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|-----------|---------|--------|
| 2025-01-30 | 1.0 | 初版作成 | AI Workflow Agent |

---

## 14. 承認

本要件定義書は、以下の品質ゲートを満たしています：

- [x] **機能要件が明確に記載されている** (3つの要件を詳細に定義)
- [x] **受け入れ基準が定義されている** (Given-When-Then 形式で記述)
- [x] **スコープが明確である** (スコープ外の項目を明示)
- [x] **論理的な矛盾がない** (Planning Documentとの整合性を確認)

次のフェーズ（Design Phase）に進む準備が整いました。
