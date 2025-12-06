# 要件定義書

## Issue概要

- **Issue番号**: #253
- **タイトル**: metadata.json から pr_url が消失する（または最初から埋め込まれない）問題
- **状態**: open
- **作成日**: 2025年（推定）
- **優先度**: 中（PR情報の欠落によるワークフロー問題）

---

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-253/00_planning/output/planning.md`）で策定された開発計画を確認しました：

### 実装戦略
- **EXTEND戦略**: `src/commands/init.ts` の既存処理を拡張
- **変更範囲**: 単一ファイル（約600行）のみ
- **処理順序変更**: PR作成を先に行い、その後でコミット&プッシュを実行

### テスト戦略
- **UNIT_INTEGRATION**: ユニットテストと統合テストの両方を実施
- **ユニットテスト**: `handleInitCommand` のロジック検証（モック使用）
- **統合テスト**: 実際のGit操作とファイルシステムを使用

### リスク
- **低リスク**: 影響範囲が限定的（1ファイルのみ）
- **既存Git操作APIを再利用**: 新規実装を最小限に抑える
- **ロールバック容易**: 処理順序変更のみで、データ構造は変更なし

### 見積もり工数
- **合計**: 4.5〜6時間
- **Phase 1（要件定義）**: 0.5時間
- **Phase 2（設計）**: 0.5時間
- **Phase 3（テストシナリオ）**: 0.5時間
- **Phase 4（実装）**: 1〜2時間
- **Phase 5（テストコード実装）**: 1時間
- **Phase 6（テスト実行）**: 0.5時間
- **Phase 7（ドキュメント）**: 0.5時間
- **Phase 8（レポート）**: 0.5時間

**要件定義の方針**: Planning Documentで策定された戦略を踏まえ、処理順序変更によるPR情報の確実な保存を最優先の機能要件とします。

---

## 1. 概要

### 背景
`ai-workflow-agent` の `init` コマンドは、Issue に対してワークフローを初期化し、メタデータ、ブランチ、ドラフトPRを作成します。しかし、現在の実装では以下の問題が発生しています：

1. **PR作成後の `pr_url` がリモートの `metadata.json` に保存されない**
2. **`execute` コマンド開始時に `pr_url` が欠落している**

これにより、ワークフロー実行中にPR URLが参照できず、GitHub連携機能が正常に動作しません。

### 根本原因
**PR作成後の `metadata.json` がコミット&プッシュされていない。**

現在の処理フロー（`src/commands/init.ts:287-364`）:
```
1. metadata.json を保存（pr_url なし）
2. コミット & プッシュ（pr_url なしの metadata.json）
3. PR作成
4. pr_url を metadata.json に保存（ローカルのみ）← 問題箇所
```

### 目的
PR作成後の `pr_url` と `pr_number` をリモートの `metadata.json` に確実に保存し、`execute` コマンド開始時に正しく読み込めるようにします。

### ビジネス価値
- **ワークフロー連携の正常化**: PR URLを使用したGitHub連携機能が正常に動作
- **トレーサビリティの向上**: Issue とPRの対応が明確になり、ワークフロー進捗が追跡可能
- **自動化の信頼性向上**: メタデータの整合性が保たれ、ワークフロー全体の安定性が向上

### 技術的価値
- **既存APIの再利用**: `gitManager.commitPhaseOutput`、`gitManager.pushToRemote` を使用
- **最小限の変更**: 処理順序の変更とコミット追加のみ（データ構造変更なし）
- **テスト容易性**: ユニットテストと統合テストで検証可能

---

## 2. 機能要件

### FR-1: PR作成後のメタデータ保存（優先度: 高）
**説明**: PR作成成功後、`pr_url` と `pr_number` をリモートの `metadata.json` に保存する。

**詳細**:
- PR作成に成功した場合、`metadata.json` の以下のフィールドを更新する：
  - `pr_url`: 作成されたPRのURL（例: `https://github.com/owner/repo/pull/123`）
  - `pr_number`: 作成されたPRの番号（例: `123`）
- ローカルファイルに保存後、Gitコミット&プッシュを実行する
- コミットメッセージは既存の形式に従う（例: `[ai-workflow] Phase 0 (planning) - init completed`）

**処理フロー**:
```typescript
if (prResult.success) {
  metadataManager.data.pr_number = prResult.pr_number ?? null;
  metadataManager.data.pr_url = prResult.pr_url ?? null;
  metadataManager.save(); // ローカル保存

  // PR情報をコミット&プッシュ
  const prCommitResult = await gitManager.commitPhaseOutput(
    'planning', 0, 'init', issueNumber, repoRoot
  );
  if (prCommitResult.success) {
    await gitManager.pushToRemote();
  }
}
```

### FR-2: 処理順序の変更（優先度: 高）
**説明**: PR作成とメタデータコミット&プッシュの順序を最適化する。

**詳細**:
- 現在の順序: `metadata保存 → コミット&プッシュ → PR作成 → metadata保存（ローカルのみ）`
- 修正後の順序: `PR作成 → metadata保存（pr_url含む）→ コミット&プッシュ`
- これにより、`pr_url` を含むメタデータが確実にリモートにプッシュされる

**代替案**:
処理順序を変更せず、PR作成後に追加のコミット&プッシュを実行する（FR-1の方式）。両方のアプローチを設計フェーズで評価します。

### FR-3: エラーハンドリングの強化（優先度: 中）
**説明**: PR作成失敗時やコミット&プッシュ失敗時の適切なエラーハンドリングを実装する。

**詳細**:
- PR作成失敗時: 明確なエラーログを出力し、ワークフロー初期化を中断する
- コミット&プッシュ失敗時: エラーログを出力し、ユーザーに手動プッシュを促す
- 既存のエラーハンドリングパターン（`src/utils/error-utils.ts`）を踏襲する

### FR-4: メタデータ読み込みの検証（優先度: 低）
**説明**: `execute` コマンド開始時に `pr_url` が正しく読み込まれることを確認する。

**詳細**:
- `metadata.json` の読み込み後、`pr_url` フィールドが存在するか検証
- `pr_url` が `null` または空文字列の場合、警告ログを出力（エラーではない）
- `execute` コマンド実行時の `git pull` により、リモートのメタデータが正しく同期されることを確認

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
- **Git操作のレスポンスタイム**: コミット&プッシュは10秒以内に完了する
- **メタデータ保存**: ファイル書き込みは1秒以内に完了する
- **既存処理への影響**: `init` コマンド全体の実行時間が5秒以上増加しない

### NFR-2: セキュリティ要件
- **Personal Access Tokenの保護**: メタデータに含まれるGit URLからトークンを除去する（既存の `sanitizeGitUrl` 機能を利用、Issue #54で実装済み）
- **コミットメッセージ**: センシティブ情報（APIキー、トークン等）を含まない

### NFR-3: 可用性・信頼性要件
- **冪等性**: `init` コマンドを複数回実行しても、メタデータが正しく保存される
- **リトライロジック**: Git操作失敗時は既存のリトライロジックを使用する（`RemoteManager` の `isRetriableError`）
- **既存テストの互換性**: 既存のユニットテスト・統合テストがすべてパスする

### NFR-4: 保守性・拡張性要件
- **コードの可読性**: 変更箇所にコメントを追加し、処理順序の意図を明記する
- **テストカバレッジ**: 新規追加コードのカバレッジは80%以上を維持する
- **ドキュメント**: CLAUDE.md にバグ修正履歴を記録する（該当セクションがある場合）

---

## 4. 制約事項

### 技術的制約
- **変更対象ファイル**: `src/commands/init.ts` のみ（約600行）
- **既存API使用**: `gitManager.commitPhaseOutput`、`gitManager.pushToRemote`、`metadataManager.save` を再利用
- **データ構造変更なし**: `metadata.json` の形式は変更しない（`pr_url`, `pr_number` フィールドは既存）
- **Git操作API**: `simple-git` ライブラリを使用（変更なし）

### リソース制約
- **工数**: Phase 4（実装）は1〜2時間以内に完了する
- **テスト工数**: ユニットテスト実装0.5時間、統合テスト実装0.5時間
- **レビュー期間**: Phase 6（テスト実行）で既存テストの破壊がないことを確認

### ポリシー制約
- **コーディング規約**:
  - TypeScript 5.x の厳格な型チェックに準拠
  - `process.env` への直接アクセス禁止（`config.getXxx()` を使用）
  - `console.log` 禁止（`logger.info()` 等を使用）
  - `as Error` 型アサーション禁止（`getErrorMessage()` を使用）
- **セキュリティポリシー**: HTTPS形式のGit URLからPersonal Access Tokenを自動除去（Issue #54、`sanitizeGitUrl` 使用）

---

## 5. 前提条件

### システム環境
- Node.js 20以上
- npm 10以上
- Git 2.x以上
- TypeScript 5.x
- Jest（テストフレームワーク）

### 依存コンポーネント
- `src/core/git-manager.ts`: Git操作のファサードクラス
- `src/core/git/commit-manager.ts`: コミット操作の専門マネージャー
- `src/core/git/remote-manager.ts`: リモート操作の専門マネージャー
- `src/core/metadata-manager.ts`: メタデータCRUD操作
- `src/core/github-client.ts`: GitHub API操作（PR作成）
- `src/utils/logger.ts`: 統一ログモジュール
- `src/utils/error-utils.ts`: エラーハンドリングユーティリティ

### 外部システム連携
- **GitHub API**: PR作成に使用（`GITHUB_TOKEN` 環境変数が必須）
- **Git リモートリポジトリ**: メタデータのプッシュ先（認証情報が必須）

---

## 6. 受け入れ基準

### AC-1: PR作成後の `pr_url` がリモートの `metadata.json` に保存される

**Given**: Issue #253 に対して `init` コマンドを実行する
**When**: PR作成に成功し、メタデータが保存された後、リモートリポジトリの `metadata.json` を確認する
**Then**:
- `metadata.json` の `pr_url` フィールドに作成されたPRのURLが格納されている
- `metadata.json` の `pr_number` フィールドに作成されたPRの番号が格納されている
- リモートリポジトリに最新のコミットがプッシュされている

**検証方法**:
```bash
# init コマンド実行
node dist/index.js init --issue-url https://github.com/owner/repo/issues/253

# リモートの metadata.json を確認
git show origin/ai-workflow/issue-253:.ai-workflow/issue-253/metadata.json | grep pr_url
# → "pr_url": "https://github.com/owner/repo/pull/123" が表示される
```

### AC-2: `execute` コマンド開始時に `pr_url` が正しく読み込める

**Given**: `init` コマンドでPRが作成され、`metadata.json` に `pr_url` が保存されている
**When**: `execute` コマンドを実行する
**Then**:
- メタデータ読み込み時に `pr_url` フィールドが正しく読み込まれる
- ログに `pr_url` が記録される（デバッグログまたは進捗コメント）

**検証方法**:
```bash
# execute コマンド実行
node dist/index.js execute --issue 253 --phase planning

# ログを確認
# → "PR URL: https://github.com/owner/repo/pull/123" が記録される
```

### AC-3: 既存のテストがすべてパスする

**Given**: 実装変更が完了している
**When**: ユニットテストと統合テストを実行する
**Then**:
- すべてのユニットテストがパスする（`npm run test:unit`）
- すべての統合テストがパスする（`npm run test:integration`）
- 既存のテストケースに破壊的変更がない

**検証方法**:
```bash
npm run test:unit
npm run test:integration
# → すべてのテストが成功する
```

### AC-4: PR作成失敗時に適切なエラーログが出力される

**Given**: GitHub APIがエラーを返す（例: 認証失敗、ネットワークエラー）
**When**: `init` コマンドを実行する
**Then**:
- PR作成失敗時に明確なエラーログが出力される
- `metadata.json` に `pr_url` が保存されない（`null` のまま）
- ワークフロー初期化が中断される

**検証方法**:
```bash
# GitHub Token を無効化してテスト
export GITHUB_TOKEN="invalid_token"
node dist/index.js init --issue-url https://github.com/owner/repo/issues/253

# エラーログを確認
# → "Failed to create pull request: 401 Unauthorized" が表示される
# → metadata.json の pr_url が null になっている
```

### AC-5: コミット&プッシュ失敗時に警告ログが出力される

**Given**: PR作成に成功したが、Git操作（コミットまたはプッシュ）が失敗する
**When**: `init` コマンドを実行する
**Then**:
- コミット&プッシュ失敗時に警告ログが出力される
- ローカルの `metadata.json` には `pr_url` が保存されている
- ユーザーに手動プッシュを促すメッセージが表示される

**検証方法**:
```bash
# ネットワークを遮断してテスト
# → "Warning: Failed to push metadata.json. Please push manually." が表示される
```

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項
以下の項目は本Issueのスコープ外とし、将来的な拡張候補とします：

1. **`pr_url` 以外のメタデータフィールドの修正**
   - 本Issueは `pr_url` と `pr_number` の保存に限定
   - 他のメタデータフィールド（`target_repository`, `cost_tracking` 等）は対象外

2. **`metadata.json` のスキーマ変更**
   - データ構造は変更せず、既存フィールド（`pr_url`, `pr_number`）の値のみ更新
   - マイグレーション処理は不要

3. **Git操作の並列化・最適化**
   - コミット&プッシュは順次実行（既存の実装を踏襲）
   - 並列化によるパフォーマンス改善は対象外

4. **PR作成方式の変更**
   - ドラフトPR作成の仕様は変更しない
   - PR本文生成ロジックは対象外

5. **`execute` コマンドの変更**
   - メタデータ読み込み処理は変更しない
   - `pr_url` の検証ロジック追加は対象外（FR-4で警告ログのみ実装）

### 7.2 将来的な拡張候補
以下の項目は別Issueで対応する候補として記録します：

1. **メタデータ同期の強化**
   - リモートとローカルのメタデータ差分検出
   - 競合解決ロジックの実装

2. **PR作成後のWebhook通知**
   - PR作成成功をSlack/Discord等に通知
   - メタデータ更新イベントの配信

3. **メタデータのバージョン管理**
   - `metadata.json` のバージョンフィールド追加
   - スキーマ変更時のマイグレーション処理

---

## 8. 依存関係とインテグレーションポイント

### 既存コンポーネントへの依存
| コンポーネント | 使用箇所 | 依存内容 |
|--------------|---------|---------|
| `GitManager` | `src/commands/init.ts` | `commitPhaseOutput()`, `pushToRemote()` を使用 |
| `MetadataManager` | `src/commands/init.ts` | `data.pr_url`, `data.pr_number` の更新、`save()` を使用 |
| `GitHubClient` | `src/commands/init.ts` | `createPullRequest()` を使用 |
| `Logger` | `src/commands/init.ts` | エラーログ、デバッグログの出力 |
| `ErrorUtils` | `src/commands/init.ts` | エラーメッセージの抽出（`getErrorMessage()`） |

### 外部APIへの依存
| API | 目的 | 認証情報 |
|-----|------|---------|
| GitHub REST API | PR作成 | `GITHUB_TOKEN` 環境変数 |
| Git リモートリポジトリ | メタデータプッシュ | SSH Key または HTTPS トークン |

---

## 9. 品質ゲート確認

以下の品質ゲート（Phase 1必須要件）を満たしていることを確認しました：

- [x] **機能要件が明確に記載されている**
  - FR-1〜FR-4 で機能要件を明確に定義
  - 各要件に優先度（高/中/低）を付与
  - 処理フローをTypeScriptコード例で示した

- [x] **受け入れ基準が定義されている**
  - AC-1〜AC-5 で受け入れ基準を Given-When-Then 形式で記述
  - 検証方法を具体的なコマンド例で示した
  - Planning Documentの品質ゲート（AC-1, AC-2, AC-3）をすべて含む

- [x] **スコープが明確である**
  - セクション7「スコープ外」で対象外事項を明記
  - 変更対象ファイル（`src/commands/init.ts` のみ）を明確化
  - 将来的な拡張候補を記録

- [x] **論理的な矛盾がない**
  - 機能要件と受け入れ基準が対応している
  - 非機能要件と制約事項が矛盾していない
  - Planning Documentの戦略（EXTEND、UNIT_INTEGRATION、BOTH_TEST）と整合している

---

## 10. 次ステップ

Phase 2（設計）に進み、以下を実施してください：

1. **処理フロー設計**: 修正前後の処理フローを詳細化（シーケンス図推奨）
2. **エラーハンドリング設計**: PR作成失敗時、コミット失敗時の処理フローを定義
3. **実装方針の決定**: FR-1（追加コミット&プッシュ）とFR-2（処理順序変更）のどちらを採用するか評価
4. **テスト設計への引継ぎ**: Phase 3でユニットテスト・統合テストのシナリオ作成に必要な情報を整理
