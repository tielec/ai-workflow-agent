# 要件定義書: Issue #510

## finalize コマンドで Step 2 の push 時に pull が実行されると HEAD が更新されスカッシュが失敗する

**作成日**: 2025-12-25
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/510
**バージョン**: 1.0

---

## 0. Planning Document の確認

### 開発計画の全体像

Planning Phase（`00_planning/output/planning.md`）にて、以下の戦略が策定済みです：

| 項目 | 決定事項 |
|------|---------|
| **実装戦略** | EXTEND（既存コードの拡張） |
| **テスト戦略** | UNIT_INTEGRATION（ユニット + インテグレーション） |
| **テストコード戦略** | BOTH_TEST（既存テスト修正 + 新規テスト追加） |
| **見積もり工数** | 8〜12時間 |
| **複雑度** | 中程度 |
| **リスク評価** | 低〜中 |

### 主な変更対象ファイル

1. `src/commands/finalize.ts` - Step 1、Step 3 の修正
2. `src/core/git/squash-manager.ts` - `FinalizeContext` 型拡張、`getCommitsToSquash()` 修正
3. `tests/integration/finalize-command.test.ts` - 新規テストケース追加

---

## 1. 概要

### 1.1 背景

`finalize` コマンドは AI Workflow Agent の最終処理を担当し、以下の5ステップを実行します：

1. **Step 1**: `base_commit` を metadata.json から取得
2. **Step 2**: `.ai-workflow/issue-<NUM>/` ディレクトリを削除し、クリーンアップコミットを作成・push
3. **Step 3**: `base_commit..HEAD` の範囲でコミットをスカッシュ
4. **Step 4-5**: PR 本文更新とドラフト解除

現在、Step 2 の `pushToRemote()` で non-fast-forward エラーが発生すると、自動的に `pullLatest()` が実行され、HEAD が更新されます。この結果、Step 3 でスカッシュ対象のコミット範囲（`base_commit..HEAD`）が 0 コミットと判定され、スカッシュがスキップされてしまいます。

### 1.2 目的

Step 2 で pull が発生しても、Step 3 のスカッシュが正常に実行されるように修正します。具体的には、Step 2 実行直前の HEAD を保存し、Step 3 でそれを使用することで、pull による HEAD 更新の影響を回避します。

### 1.3 ビジネス価値・技術的価値

| 価値の種類 | 説明 |
|-----------|------|
| **ビジネス価値** | PR に大量のコミットが残らず、1つのスカッシュコミットに統合されることで、レビュー効率が向上 |
| **技術的価値** | Jenkins 環境などリモートとの同期が頻繁に発生する環境での安定動作を実現 |
| **品質価値** | ワークフロー完了時のコミット履歴がクリーンになり、プロジェクトの保守性が向上 |

---

## 2. 機能要件

### FR-001: Step 1 での HEAD 保存機能

| 項目 | 内容 |
|------|------|
| **ID** | FR-001 |
| **タイトル** | Step 2 実行直前の HEAD を保存 |
| **説明** | `executeStep1()` で `base_commit` を取得する際に、現在の HEAD も取得して保存する |
| **優先度** | 高 |
| **受け入れ基準** | AC-001 参照 |

**詳細仕様**:
- `git.revparse(['HEAD'])` を使用して現在の HEAD コミットハッシュを取得
- 戻り値を `{ baseCommit: string, headBeforeCleanup: string }` 形式に変更
- 取得した HEAD をログに出力（デバッグ用）

### FR-002: FinalizeContext 型の拡張

| 項目 | 内容 |
|------|------|
| **ID** | FR-002 |
| **タイトル** | `FinalizeContext` に `headCommit` プロパティを追加 |
| **説明** | スカッシュ範囲の終点を明示的に指定できるよう、オプショナルプロパティを追加 |
| **優先度** | 高 |
| **受け入れ基準** | AC-002 参照 |

**詳細仕様**:
```typescript
export interface FinalizeContext {
  issueNumber: number;
  baseCommit: string;
  targetBranch: string;
  headCommit?: string;  // 新規追加（オプショナル）
}
```

### FR-003: Step 3 での headCommit 使用

| 項目 | 内容 |
|------|------|
| **ID** | FR-003 |
| **タイトル** | Step 3 で保存した HEAD を使用してスカッシュ |
| **説明** | `executeStep3()` で `headBeforeCleanup` を `FinalizeContext.headCommit` に設定し、スカッシュ範囲の終点として使用 |
| **優先度** | 高 |
| **受け入れ基準** | AC-003 参照 |

**詳細仕様**:
- `executeStep3()` のパラメータに `headBeforeCleanup` を追加
- `FinalizeContext` 生成時に `headCommit: headBeforeCleanup` を設定
- `squashCommitsForFinalize()` 内で `context.headCommit` を使用

### FR-004: getCommitsToSquash() の拡張

| 項目 | 内容 |
|------|------|
| **ID** | FR-004 |
| **タイトル** | `getCommitsToSquash()` に `targetHead` パラメータを追加 |
| **説明** | スカッシュ対象コミット範囲の終点を引数で指定可能にする |
| **優先度** | 高 |
| **受け入れ基準** | AC-004 参照 |

**詳細仕様**:
```typescript
private async getCommitsToSquash(
  baseCommit: string,
  targetHead: string = 'HEAD'
): Promise<string[]>
```
- `targetHead` が指定されていない場合は従来通り `'HEAD'` を使用（後方互換性）
- `git.log()` の `to` パラメータを `targetHead` に変更
- デバッグログに `targetHead` の値を出力

### FR-005: squashCommitsForFinalize() の修正

| 項目 | 内容 |
|------|------|
| **ID** | FR-005 |
| **タイトル** | `squashCommitsForFinalize()` で `headCommit` を使用 |
| **説明** | `context.headCommit` が指定されている場合、それを `getCommitsToSquash()` の引数として渡す |
| **優先度** | 高 |
| **受け入れ基準** | AC-005 参照 |

**詳細仕様**:
```typescript
const targetHead = context.headCommit ?? 'HEAD';
const commits = await this.getCommitsToSquash(baseCommit, targetHead);
```

---

## 3. 非機能要件

### NFR-001: 後方互換性

| 項目 | 内容 |
|------|------|
| **ID** | NFR-001 |
| **説明** | 既存の finalize コマンド呼び出しに影響を与えない |
| **基準** | `headCommit` 未指定時は従来通り `HEAD` を使用 |
| **検証方法** | 既存テストがすべてパスすること |

### NFR-002: パフォーマンス

| 項目 | 内容 |
|------|------|
| **ID** | NFR-002 |
| **説明** | HEAD 取得による追加処理時間は無視できる程度であること |
| **基準** | `git.revparse(['HEAD'])` の実行時間は 100ms 以下 |
| **検証方法** | ローカル環境でのテスト実行 |

### NFR-003: 保守性

| 項目 | 内容 |
|------|------|
| **ID** | NFR-003 |
| **説明** | 変更箇所に適切な JSDoc コメントと説明コメントを追加 |
| **基準** | 変更理由と動作が第三者に理解可能 |
| **検証方法** | コードレビュー |

### NFR-004: デバッグ容易性

| 項目 | 内容 |
|------|------|
| **ID** | NFR-004 |
| **説明** | 問題発生時の原因特定が容易であること |
| **基準** | `base_commit`、`headBeforeCleanup`、現在の HEAD をログ出力 |
| **検証方法** | ログ出力の確認 |

---

## 4. 制約事項

### 4.1 技術的制約

| 制約 | 説明 |
|------|------|
| **TypeScript 準拠** | 既存の TypeScript 設定（strict モード）に準拠 |
| **ESLint 準拠** | 既存の ESLint ルールに準拠 |
| **simple-git ライブラリ** | Git 操作には既存の simple-git ライブラリを使用 |
| **既存アーキテクチャ維持** | GitManager / SquashManager / RemoteManager の責務分離を維持 |

### 4.2 リソース制約

| 制約 | 説明 |
|------|------|
| **修正対象ファイル数** | 最大 3 ファイル（`finalize.ts`、`squash-manager.ts`、テストファイル） |
| **新規ファイル作成** | 不可（既存ファイルの拡張のみ） |

### 4.3 ポリシー制約

| 制約 | 説明 |
|------|------|
| **テストカバレッジ** | 修正箇所のカバレッジ 80% 以上を維持 |
| **コミットメッセージ形式** | Conventional Commits 形式を使用 |

---

## 5. 前提条件

### 5.1 システム環境

| 項目 | 前提条件 |
|------|----------|
| **Node.js バージョン** | 18.x 以上 |
| **Git バージョン** | 2.x 以上 |
| **ファイルシステム** | `.ai-workflow/issue-<NUM>/` ディレクトリが存在 |

### 5.2 依存コンポーネント

| コンポーネント | バージョン | 役割 |
|---------------|-----------|------|
| simple-git | ^3.x | Git 操作ラッパー |
| MetadataManager | - | metadata.json の読み書き |
| GitManager | - | Git 操作のファサード |
| SquashManager | - | スカッシュ処理 |
| RemoteManager | - | リモート操作 |

### 5.3 実行前提

| 項目 | 前提条件 |
|------|----------|
| **init コマンド実行済み** | `base_commit` が metadata.json に記録されている |
| **フィーチャーブランチ上** | main/master ブランチではスカッシュ不可 |
| **リモートリポジトリ設定済み** | origin が設定されている |

---

## 6. 受け入れ基準

### AC-001: Step 1 での HEAD 保存機能

```gherkin
Given: finalize コマンドが実行される
When: Step 1 が実行される
Then: base_commit と headBeforeCleanup の両方が取得される
  And: headBeforeCleanup は現在の HEAD コミットハッシュと一致する
  And: ログに "HEAD (before cleanup): <hash>" が出力される
```

### AC-002: FinalizeContext 型の拡張

```gherkin
Given: FinalizeContext 型が定義されている
When: headCommit プロパティが追加される
Then: headCommit はオプショナル（`headCommit?: string`）である
  And: 既存コードで headCommit を指定しなくてもコンパイルエラーにならない
  And: TypeScript の型チェックをパスする
```

### AC-003: Step 3 での headCommit 使用

```gherkin
Given: Step 1 で headBeforeCleanup が取得されている
  And: Step 2 で push 時に pull が発生し HEAD が更新されている
When: Step 3 が実行される
Then: スカッシュ範囲は base_commit..headBeforeCleanup で計算される
  And: pull 後の HEAD は使用されない
  And: スカッシュが正常に実行される
```

### AC-004: getCommitsToSquash() の拡張

```gherkin
Scenario: targetHead 指定あり
Given: getCommitsToSquash(baseCommit, targetHead) が呼び出される
When: targetHead が "abc1234" と指定されている
Then: git.log() の to パラメータが "abc1234" になる
  And: baseCommit..abc1234 の範囲でコミットが取得される

Scenario: targetHead 指定なし（後方互換性）
Given: getCommitsToSquash(baseCommit) が呼び出される
When: targetHead が省略されている
Then: git.log() の to パラメータが "HEAD" になる
  And: baseCommit..HEAD の範囲でコミットが取得される
```

### AC-005: squashCommitsForFinalize() の修正

```gherkin
Scenario: headCommit 指定あり
Given: FinalizeContext に headCommit が設定されている
When: squashCommitsForFinalize(context) が呼び出される
Then: getCommitsToSquash() に headCommit が渡される
  And: スカッシュ範囲が baseCommit..headCommit になる

Scenario: headCommit 指定なし（後方互換性）
Given: FinalizeContext に headCommit が設定されていない
When: squashCommitsForFinalize(context) が呼び出される
Then: getCommitsToSquash() に 'HEAD' が渡される
  And: スカッシュ範囲が baseCommit..HEAD になる
```

### AC-006: Issue #510 シナリオの再現テスト

```gherkin
Given: ワークフローが初期化されている（base_commit が記録されている）
  And: フィーチャーブランチ上に複数のコミットがある
  And: リモートブランチに別の変更がある（non-fast-forward 状態）
When: finalize コマンドが実行される
  And: Step 2 の push で non-fast-forward エラーが発生する
  And: pullLatest() が自動実行され HEAD が更新される
Then: Step 3 で headBeforeCleanup を使用してスカッシュ範囲が計算される
  And: "Only 0 commit(s) found. Skipping squash." が表示されない
  And: スカッシュが正常に実行される
  And: 1つのスカッシュコミットが作成される
```

---

## 7. スコープ外

以下の項目は本 Issue のスコープ外とします：

### 7.1 明確にスコープ外とする事項

| 項目 | 理由 |
|------|------|
| **RemoteManager.pushToRemote() の修正** | 既存の push + pull 動作は他のフェーズで必要 |
| **pull 動作の無効化オプション追加** | 影響範囲が大きく、別 Issue で検討 |
| **エージェントによるコミットメッセージ生成** | finalize コマンドではテンプレートメッセージを使用 |
| **FinalizeContext 型の別ファイル分離** | 現状の配置で問題なし |
| **CI/CD パイプラインの変更** | 本 Issue では対象外 |

### 7.2 将来的な拡張候補

| 項目 | 説明 |
|------|------|
| **スカッシュ範囲の明示的指定オプション** | CLI から `--from-commit` `--to-commit` を指定可能に |
| **pull 発生時の警告ログ強化** | Step 2 で pull が発生した場合に明確な警告を表示 |
| **FinalizeContext の型定義ファイル分離** | `types/commands.ts` への移動 |

---

## 8. 用語集

| 用語 | 定義 |
|------|------|
| **base_commit** | ワークフロー開始時（init コマンド実行時）の HEAD コミットハッシュ |
| **headBeforeCleanup** | Step 2（クリーンアップ）実行直前の HEAD コミットハッシュ |
| **non-fast-forward** | ローカルブランチがリモートブランチより古い状態で push しようとした際のエラー |
| **スカッシュ** | 複数のコミットを1つのコミットに統合する Git 操作 |
| **FinalizeContext** | finalize コマンド用のコンテキスト型（issueNumber, baseCommit, targetBranch, headCommit を含む） |

---

## 9. 品質ゲートチェックリスト（Phase 1）

- [x] **機能要件が明確に記載されている**: FR-001〜FR-005 で定義
- [x] **受け入れ基準が定義されている**: AC-001〜AC-006 で Given-When-Then 形式で定義
- [x] **スコープが明確である**: スコープ外セクションで明確化
- [x] **論理的な矛盾がない**: 各要件間の整合性を確認済み

---

## 10. 関連ドキュメント

| ドキュメント | パス |
|------------|------|
| Planning Document | `.ai-workflow/issue-510/00_planning/output/planning.md` |
| finalize コマンド実装 | `src/commands/finalize.ts` |
| SquashManager 実装 | `src/core/git/squash-manager.ts` |
| RemoteManager 実装 | `src/core/git/remote-manager.ts` |

---

## 11. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-12-25 | 初版作成 |
