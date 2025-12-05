# 要件定義書

## Issue #225: --squash-on-complete オプション実行時の不具合修正

---

## 0. Planning Documentの確認

Planning Documentより、以下の開発方針を確認しました：

- **実装戦略**: EXTEND（既存コードの拡張・修正）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **見積もり工数**: 6~10時間
- **リスク評価**: 中（Git操作に関わるため慎重な対応が必要）

本要件定義書は、Planning Documentで策定された戦略を踏まえて作成されています。

---

## 1. 概要

### 背景

Issue #194でコミットスカッシュ機能（`--squash-on-complete`オプション）が実装されたが、以下の2つの不具合が発見された：

1. **initコミット除外問題**: ワークフロー初期化コミット（`[ai-workflow] Initialize workflow for issue #XXX`）がスカッシュ対象から除外され、単独で残る
2. **プロンプトパス解決エラー**: エージェント生成コミットメッセージのプロンプトテンプレートが読み込めず、フォールバックメッセージが使用される

### 目的

`--squash-on-complete`オプション使用時に、すべてのワークフローコミット（initコミットを含む）が正しくスカッシュされ、エージェント生成の高品質なコミットメッセージが生成されるようにする。

### ビジネス価値・技術的価値

- **コミット履歴のクリーンアップ**: PRマージ後のmainブランチのコミット履歴が1つのコミットに集約され、可読性が向上
- **エージェント生成メッセージの活用**: Conventional Commits形式の高品質なコミットメッセージが確実に生成される
- **ユーザー体験の向上**: 意図した通りのスカッシュ動作が保証され、手動修正が不要になる

---

## 2. 機能要件

### FR-1: base_commit記録タイミングの修正【優先度: 高】

**要件内容**:
- `src/commands/init.ts`の`handleInitCommand()`で、`base_commit`の記録を初期化コミット作成**前**に移動する
- 記録される`base_commit`はワークフロー開始時点（`git checkout -b`直後）のHEADハッシュとする

**現状の実装フロー**:
1. メタデータ保存
2. initコミット作成（`gitManager.commitWorkflowInit()`）
3. プッシュ
4. `base_commit` = 現在のHEAD を記録（← initコミット後）

**期待される実装フロー**:
1. `base_commit` = 現在のHEAD を記録（← initコミット前）
2. メタデータ保存
3. initコミット作成（`gitManager.commitWorkflowInit()`）
4. プッシュ

**受け入れ基準**:
- Given: ワークフローを初期化する（`init`コマンド実行）
- When: `metadata.json`の`base_commit`フィールドを確認する
- Then: `base_commit`が初期化コミット作成前のHEADハッシュを記録している

### FR-2: プロンプトテンプレートパス解決の修正【優先度: 高】

**要件内容**:
- `src/core/git/squash-manager.ts`の`loadPromptTemplate()`メソッドで、プロンプトファイルのパス解決を修正する
- パスを`join(__dirname, '../../prompts/squash/generate-message.txt')`に変更する
- プロンプトファイルが存在しない場合のエラーハンドリングを強化する

**現状のパス解決**:
```typescript
const templatePath = join(__dirname, '../../../prompts/squash/generate-message.txt');
// __dirname = dist/core/git/
// → ../../../prompts/ は prompts/ を指す（誤り）
```

**期待されるパス解決**:
```typescript
const templatePath = join(__dirname, '../../prompts/squash/generate-message.txt');
// __dirname = dist/core/git/
// → ../../prompts/ は dist/prompts/ を指す（正しい）
```

**受け入れ基準**:
- Given: `--squash-on-complete`オプションを指定してワークフローを実行する
- When: スカッシュ実行時にエージェント生成コミットメッセージを生成する
- Then: プロンプトテンプレートが正しく読み込まれ、エラーログが出力されない

### FR-3: エラーハンドリングの強化【優先度: 中】

**要件内容**:
- プロンプトファイルが存在しない場合、明確なエラーメッセージを出力する
- フォールバックメッセージ生成機能は維持する（処理の継続性）
- エラーログには期待されるファイルパスと実際に探索したパスを含める

**受け入れ基準**:
- Given: プロンプトファイルが存在しない状態でスカッシュを実行する
- When: エージェント生成コミットメッセージの生成を試みる
- Then: 明確なエラーメッセージ（期待パス、実際のパスを含む）が出力され、フォールバックメッセージが使用される

### FR-4: 既存テストの修正【優先度: 高】

**要件内容**:
- `tests/unit/commands/init.test.ts`で`base_commit`記録タイミングの変更に対応したテストケースを追加する
- `tests/unit/core/git/squash-manager.test.ts`でプロンプトパス解決の修正に対応したテストケースを追加する

**受け入れ基準**:
- Given: ユニットテストを実行する（`npm run test:unit`）
- When: `init.test.ts`と`squash-manager.test.ts`を実行する
- Then: すべてのテストケースが成功する（既存テストのリグレッションがない）

### FR-5: 統合テストの追加【優先度: 高】

**要件内容**:
- `tests/integration/squash-workflow.test.ts`を新規作成する
- スカッシュ機能の統合テスト（`init` → `execute --phase all --squash-on-complete`）を実装する
- コミット履歴検証（initコミットが含まれるか）を実装する

**受け入れ基準**:
- Given: 統合テストを実行する（`npm run test:integration`）
- When: スカッシュワークフローの統合テストを実行する
- Then: initコミットを含むすべてのコミットがスカッシュされ、1つのコミットになる

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **要件**: `base_commit`記録処理は100ms以内に完了すること
- **測定方法**: `console.time()` / `console.timeEnd()` でタイマー計測
- **根拠**: ユーザー体感に影響しないレベル

### NFR-2: セキュリティ要件

- **要件**: `metadata.json`に記録される`base_commit`ハッシュは改ざんされないこと
- **対策**: 既存のGit操作（`git rev-parse HEAD`）を使用し、信頼性を確保
- **根拠**: スカッシュ機能の安全性確保

### NFR-3: 可用性・信頼性要件

- **要件**: プロンプトファイル読み込み失敗時もフォールバックメッセージで処理を継続すること
- **可用性目標**: 99%（エージェント生成失敗時もスカッシュ処理は完了）
- **根拠**: Issue #194の設計方針（フォールバック機能の維持）

### NFR-4: 保守性・拡張性要件

- **要件**: パス解決ロジックはESM環境（`import.meta.url`）にも対応可能な設計とすること
- **対策**: Issue #216で実施されたESM互換性修正を参考にする
- **根拠**: 将来的なESMマイグレーションへの対応

### NFR-5: テストカバレッジ要件

- **要件**: 修正箇所のテストカバレッジは80%以上とすること
- **測定方法**: `npm run test:coverage`
- **根拠**: 既存のプロジェクト品質基準（CLAUDE.md参照）

---

## 4. 制約事項

### 技術的制約

- **TypeScript 5.x**: 既存のTypeScriptバージョンを維持
- **Node.js 20.x**: 既存のNode.jsバージョンを維持
- **simple-git**: 既存のGit操作ライブラリを使用
- **Jest**: 既存のテストフレームワークを使用（ESM対応）
- **ESM互換性**: `__dirname`はESMでグローバル変数として利用できないため、代替実装を検討（Issue #216参照）

### リソース制約

- **見積もり工数**: 6~10時間（Planning Documentより）
- **開発期間**: 1~2日（通常の開発速度を想定）
- **レビュー時間**: 0.5~1時間（レビュー・修正バッファ）

### ポリシー制約

- **コーディング規約**: CLAUDE.mdに記載されたコーディング規約に従う
  - エラーハンドリング規約（Issue #48）: `as Error`型アサーションの使用禁止、`error-utils.ts`を使用
  - ロギング規約（Issue #61）: `console.log`の直接使用禁止、`logger`モジュールを使用
  - 環境変数アクセス規約（Issue #51）: `process.env`の直接アクセス禁止、`config.ts`を使用

---

## 5. 前提条件

### システム環境

- **OS**: Linux / macOS / Windows（Node.js 20.x対応環境）
- **Git**: バージョン2.x以上
- **npm**: バージョン10.x以上

### 依存コンポーネント

- **GitManager**: 既存のGit操作マネージャー（`src/core/git-manager.ts`）
- **MetadataManager**: 既存のメタデータ管理マネージャー（`src/core/metadata-manager.ts`）
- **SquashManager**: 既存のスカッシュ管理マネージャー（`src/core/git/squash-manager.ts`）

### 外部システム連携

- **GitHub API**: PR作成・コメント投稿（既存機能、本Issue修正範囲外）
- **Codex / Claude**: エージェント実行（既存機能、本Issue修正範囲外）

---

## 6. 受け入れ基準

### AC-1: base_commit記録タイミングの修正

- **Given**: ワークフローを初期化する（`node dist/index.js init --issue-url <URL>`）
- **When**: `metadata.json`の`base_commit`フィールドを確認する
- **Then**: `base_commit`が初期化コミット作成前のHEADハッシュを記録している

### AC-2: プロンプトテンプレートパス解決の修正

- **Given**: `--squash-on-complete`オプションを指定してワークフローを実行する
- **When**: スカッシュ実行時にエージェント生成コミットメッセージを生成する
- **Then**: 以下の条件をすべて満たす
  - プロンプトテンプレートが正しく読み込まれる
  - エラーログ「`ENOENT: no such file or directory`」が出力されない
  - エージェント生成のコミットメッセージが使用される（フォールバックメッセージではない）

### AC-3: スカッシュ後のコミット履歴検証

- **Given**: `init` → `execute --phase all --squash-on-complete`を実行する
- **When**: スカッシュ完了後、コミット履歴（`git log`）を確認する
- **Then**: 以下の条件をすべて満たす
  - initコミット（`[ai-workflow] Initialize workflow for issue #XXX`）が単独で残らない
  - すべてのワークフローコミットが1つのコミットにスカッシュされている
  - スカッシュコミットメッセージがConventional Commits形式である

### AC-4: エラーハンドリングの強化

- **Given**: プロンプトファイルが存在しない状態でスカッシュを実行する（テスト環境）
- **When**: エージェント生成コミットメッセージの生成を試みる
- **Then**: 以下の条件をすべて満たす
  - 明確なエラーメッセージ（期待パス、実際のパスを含む）が出力される
  - フォールバックメッセージが使用され、処理が継続される
  - スカッシュ処理自体は失敗しない

### AC-5: ユニットテストの成功

- **Given**: ユニットテストを実行する（`npm run test:unit`）
- **When**: `init.test.ts`と`squash-manager.test.ts`を実行する
- **Then**: すべてのテストケースが成功する（既存テストのリグレッションがない）

### AC-6: 統合テストの成功

- **Given**: 統合テストを実行する（`npm run test:integration`）
- **When**: スカッシュワークフローの統合テスト（`squash-workflow.test.ts`）を実行する
- **Then**: 以下の条件をすべて満たす
  - initコミット + 複数のフェーズコミットがすべてスカッシュされる
  - スカッシュ後のコミット履歴が期待通りである
  - テストカバレッジが80%以上である

### AC-7: 既存ワークフローへの影響確認

- **Given**: 既存の統合テストを全て実行する（`npm test`）
- **When**: CI環境でテストを実行する
- **Then**: リグレッションがない（すべてのテストが成功する）

---

## 7. スコープ外

### 明確にスコープ外とする事項

1. **ESM環境への完全移行**
   - Issue #216で部分的に対応されているが、本Issueでは既存のCommonJS実装を維持
   - `__dirname`の代替実装（`import.meta.url` + `fileURLToPath`）は検討のみ（実装しない）

2. **スカッシュ機能の機能拡張**
   - 既存のスカッシュ機能（Issue #194）の設計を維持
   - スカッシュ対象範囲の変更（例: 特定フェーズのみスカッシュ）は対象外

3. **Git コミットメッセージ形式の変更**
   - Conventional Commits形式は維持
   - コミットメッセージのカスタマイズ機能は対象外

4. **プロンプトテンプレートの内容変更**
   - `prompts/squash/generate-message.txt`の内容は変更しない
   - プロンプトの品質改善は別Issueで対応

### 将来的な拡張候補

1. **ESM完全移行** (Phase 2)
   - `__dirname` → `import.meta.url` + `fileURLToPath`
   - CommonJS → ESM（package.json `"type": "module"`）

2. **スカッシュ機能の拡張** (Phase 3)
   - 部分スカッシュ（特定フェーズのみ）
   - スカッシュプレビュー機能（`--dry-run`）

3. **プロンプトテンプレート管理の改善** (Phase 4)
   - テンプレート検証機能（存在チェック、フォーマット検証）
   - 動的プロンプト生成（Issue情報、コンテキストに応じた最適化）

---

## 8. 参考情報

### 関連Issue

- **Issue #194**: スカッシュ機能の実装（元の機能仕様）
- **Issue #216**: ESM互換性修正（パス解決の参考実装）

### 関連ドキュメント

- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
  - エラーハンドリング規約（Issue #48）
  - ロギング規約（Issue #61）
  - 環境変数アクセス規約（Issue #51）
- **ARCHITECTURE.md**: アーキテクチャ設計思想
  - GitManagerモジュール構成
  - SquashManagerの設計パターン

### 技術参考資料

- **Conventional Commits**: https://www.conventionalcommits.org/
- **Node.js path.join()**: https://nodejs.org/api/path.html#path_path_join_paths
- **simple-git**: https://github.com/steveukx/git-js

---

## 9. 品質ゲートチェックリスト

- [x] **機能要件が明確に記載されている**: FR-1 ～ FR-5 で詳細に記載
- [x] **受け入れ基準が定義されている**: AC-1 ～ AC-7 で Given-When-Then 形式で記載
- [x] **スコープが明確である**: セクション7でスコープ外を明示
- [x] **論理的な矛盾がない**: 各セクション間で整合性を確認済み

---

**要件定義書バージョン**: 1.0
**作成日**: 2025-01-30
**最終更新日**: 2025-01-30
