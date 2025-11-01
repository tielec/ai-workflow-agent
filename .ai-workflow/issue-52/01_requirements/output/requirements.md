# 要件定義書 - Issue #52

## 0. Planning Document の確認

Planning Document（@.ai-workflow/issue-52/00_planning/output/planning.md）で策定された開発計画を確認しました：

### 開発計画の全体像
- **実装戦略**: REFACTOR（既存コードのリファクタリング）
- **テスト戦略**: UNIT_INTEGRATION（単体テスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（新規テスト作成 + 既存テスト拡張）
- **見積もり工数**: 14~20時間（2~3日）
- **リスク評価**: 低（後方互換性100%維持、既存テストスイート充実）

### 技術選定
- **ファサードパターン**: CommitManagerは既存の公開APIを維持し、内部的にFileSelector/CommitMessageBuilderに処理を委譲
- **依存性注入**: 各モジュールはコンストラクタでSimpleGit/MetadataManagerを受け取る
- **既存実績**: GitManager（Issue #25）、GitHubClient（Issue #24）で同様のパターンを成功裏に実装済み

### スケジュール
- Phase 1（要件定義）: 2時間
- Phase 2（設計）: 2~3時間
- Phase 3（テストシナリオ）: 2時間
- Phase 4（実装）: 4~6時間
- Phase 5（テストコード実装）: 2~3時間
- Phase 6（テスト実行）: 1時間
- Phase 7（ドキュメント）: 1~2時間
- Phase 8（レポート）: 0.5時間

---

## 1. 概要

### 背景
現在の `src/core/git/commit-manager.ts`（586行）は、以下の複数の責務を持っており、単一責任の原則（SRP）に違反しています：

1. **コミット実行**: フェーズ出力コミット、ステップ出力コミット、初期化コミット、クリーンアップコミット
2. **ファイル選択ロジック**: 変更ファイル検出、Issue番号フィルタリング、フェーズ固有パターンマッチング、ディレクトリスキャン
3. **コミットメッセージ構築**: フェーズ完了メッセージ、ステップ完了メッセージ、初期化メッセージ、クリーンアップメッセージ
4. **SecretMasker統合**: シークレットマスキング処理の呼び出し
5. **Git設定管理**: user.name/user.emailの検証と設定

この状態では、以下の問題が発生します：

- ファイル選択ロジックを独立してテストできない（448-566行の複雑なロジック）
- `commitPhaseOutput` と `commitStepOutput` 間のコード重複（約40行）
- 複雑なファイル選択ルールがコミットロジックに埋もれている
- 新規フェーズ追加時に大規模なファイル変更が必要（保守性低下）

### 目的
`commit-manager.ts` を以下の3つのモジュールに分解し、単一責任の原則に準拠したアーキテクチャを実現する：

1. **FileSelector** (約150行): ファイル選択・フィルタリングロジック
2. **CommitMessageBuilder** (約100行): コミットメッセージ構築ロジック
3. **CommitManager** (約200行): コミット実行（リファクタリング後）

### ビジネス価値
- **テスト容易性向上**: ファイル選択ロジックを独立してテストできる（現在は不可能）
- **保守性向上**: 各モジュールが明確な責務を持ち、変更影響範囲が限定される
- **再利用性向上**: FileSelector/CommitMessageBuilderを他モジュールでも利用可能
- **コード品質向上**: 重複コード削除（約40行）、責務の明確化

### 技術的価値
- **アーキテクチャ一貫性**: GitManager（Issue #25）、GitHubClient（Issue #24）と同様のファサードパターンを採用
- **拡張性向上**: 新規フェーズ追加時、FileSelectorのパターン定義のみ変更すれば済む
- **リグレッション防止**: 既存テストスイート（363行）により後方互換性を保証

---

## 2. 機能要件

### 2.1. FileSelector（ファイル選択モジュール）の作成 [優先度: 高]

**説明**: `src/core/git/file-selector.ts` を新規作成し、ファイル選択・フィルタリングロジックを担当する。

**詳細要件**:

#### FR-2.1.1: クラス骨格とコンストラクタ [優先度: 高]
- FileSelector クラスを定義
- コンストラクタで SimpleGit インスタンスを依存性注入で受け取る
- TypeScript の型定義を厳密に適用（`SimpleGit` 型）

**受け入れ基準**:
- Given: FileSelector のインスタンスを生成する
- When: SimpleGit インスタンスをコンストラクタに渡す
- Then: FileSelector が正常に初期化される

#### FR-2.1.2: getChangedFiles メソッドの実装 [優先度: 高]
- commit-manager.ts の 448-470行から抽出
- `git status` を実行し、変更されたファイルのリストを取得
- `@tmp` を含むファイルを除外
- 以下のステータスを統合: `not_added`, `created`, `deleted`, `modified`, `renamed`, `staged`, `files`

**受け入れ基準**:
- Given: Git リポジトリに変更ファイルが存在する
- When: `getChangedFiles()` を呼び出す
- Then: `@tmp` を除外した全変更ファイルのリストが返される
- And: 重複ファイルが除去される（Set を使用）

#### FR-2.1.3: filterPhaseFiles メソッドの実装 [優先度: 高]
- commit-manager.ts の 475-494行から抽出
- Issue番号でファイルをフィルタリング
- `.ai-workflow/issue-<NUM>/` プレフィックスのファイルを選択
- 他の Issue のファイルを除外
- `@tmp` を含むファイルを除外

**受け入れ基準**:
- Given: 変更ファイルリストに複数のIssueのファイルが含まれる
- When: `filterPhaseFiles(files, '123')` を呼び出す
- Then: Issue #123 に関連するファイルのみが返される
- And: 他の Issue のファイルは除外される
- And: `@tmp` を含むファイルは除外される

#### FR-2.1.4: getPhaseSpecificFiles メソッドの実装 [優先度: 高]
- commit-manager.ts の 499-521行から抽出
- フェーズ名に応じた固有ファイルを取得
- `implementation`: `scanDirectories(['scripts', 'pulumi', 'ansible', 'jenkins'])`
- `test_implementation`: テストファイルパターンでスキャン（`*.test.ts`, `*.spec.js` 等）
- `documentation`: Markdownファイルパターンでスキャン（`*.md`, `*.MD`）
- その他のフェーズ: 空配列を返す

**受け入れ基準**:
- Given: フェーズ名が `implementation` である
- When: `getPhaseSpecificFiles('implementation')` を呼び出す
- Then: `scripts/`, `pulumi/`, `ansible/`, `jenkins/` ディレクトリ配下の変更ファイルが返される

- Given: フェーズ名が `test_implementation` である
- When: `getPhaseSpecificFiles('test_implementation')` を呼び出す
- Then: テストファイルパターンに一致する変更ファイルが返される

- Given: フェーズ名が `documentation` である
- When: `getPhaseSpecificFiles('documentation')` を呼び出す
- Then: Markdownファイル（`*.md`, `*.MD`）が返される

#### FR-2.1.5: scanDirectories メソッドの実装 [優先度: 中]
- commit-manager.ts の 526-540行から抽出
- 指定されたディレクトリ配下の変更ファイルをスキャン
- `@tmp` を含むファイルを除外

**受け入れ基準**:
- Given: 変更ファイルリストに `scripts/deploy.sh` が含まれる
- When: `scanDirectories(['scripts'])` を呼び出す
- Then: `scripts/deploy.sh` が返される
- And: `@tmp` を含むファイルは除外される

#### FR-2.1.6: scanByPatterns メソッドの実装 [優先度: 中]
- commit-manager.ts の 545-566行から抽出
- minimatch を使用したパターンマッチング
- `@tmp` を含むファイルを除外
- パターン例: `*.test.ts`, `**/*.spec.js`

**受け入れ基準**:
- Given: 変更ファイルリストに `src/test.ts` と `src/index.ts` が含まれる
- When: `scanByPatterns(['*.test.ts'])` を呼び出す
- Then: `src/test.ts` のみが返される
- And: `src/index.ts` は除外される
- And: `@tmp` を含むファイルは除外される

---

### 2.2. CommitMessageBuilder（コミットメッセージ構築モジュール）の作成 [優先度: 高]

**説明**: `src/core/git/commit-message-builder.ts` を新規作成し、コミットメッセージ構築ロジックを担当する。

**詳細要件**:

#### FR-2.2.1: クラス骨格とコンストラクタ [優先度: 高]
- CommitMessageBuilder クラスを定義
- コンストラクタで MetadataManager インスタンスを依存性注入で受け取る

**受け入れ基準**:
- Given: CommitMessageBuilder のインスタンスを生成する
- When: MetadataManager インスタンスをコンストラクタに渡す
- Then: CommitMessageBuilder が正常に初期化される

#### FR-2.2.2: createCommitMessage メソッドの実装 [優先度: 高]
- commit-manager.ts の 350-382行から抽出
- フェーズ完了時のコミットメッセージを生成
- フォーマット:
  ```
  [ai-workflow] Phase <NUM> (<NAME>) - <STATUS>

  Issue: #<ISSUE_NUM>
  Phase: <NUM> (<NAME>)
  Status: <STATUS>
  Review: <REVIEW_RESULT>

  Auto-generated by AI Workflow
  ```

**受け入れ基準**:
- Given: フェーズ名が `requirements`、ステータスが `completed`、レビュー結果が `PASS` である
- When: `createCommitMessage('requirements', 'completed', 'PASS')` を呼び出す
- Then: フォーマットに従ったコミットメッセージが返される
- And: Phase番号が正しく計算される（requirements = Phase 1）
- And: Issue番号がメタデータから取得される

#### FR-2.2.3: buildStepCommitMessage メソッドの実装 [優先度: 高]
- commit-manager.ts の 387-403行から抽出
- ステップ完了時のコミットメッセージを生成
- フォーマット:
  ```
  [ai-workflow] Phase <NUM> (<NAME>) - <STEP> completed

  Issue: #<ISSUE_NUM>
  Phase: <NUM> (<NAME>)
  Step: <STEP>
  Status: completed

  Auto-generated by AI Workflow
  ```

**受け入れ基準**:
- Given: フェーズ名が `implementation`、フェーズ番号が 4、ステップが `execute` である
- When: `buildStepCommitMessage('implementation', 4, 'execute', 123)` を呼び出す
- Then: フォーマットに従ったステップコミットメッセージが返される
- And: ステップ名が正しく埋め込まれる

#### FR-2.2.4: createInitCommitMessage メソッドの実装 [優先度: 中]
- commit-manager.ts の 408-421行から抽出
- ワークフロー初期化時のコミットメッセージを生成
- フォーマット:
  ```
  [ai-workflow] Initialize workflow for issue #<NUM>

  Issue: #<NUM>
  Action: Create workflow metadata and directory structure
  Branch: <BRANCH_NAME>

  Auto-generated by AI Workflow
  ```

**受け入れ基準**:
- Given: Issue番号が 123、ブランチ名が `ai-workflow/issue-123` である
- When: `createInitCommitMessage(123, 'ai-workflow/issue-123')` を呼び出す
- Then: フォーマットに従った初期化コミットメッセージが返される

#### FR-2.2.5: createCleanupCommitMessage メソッドの実装 [優先度: 中]
- commit-manager.ts の 426-443行から抽出
- ログクリーンアップ時のコミットメッセージを生成
- フォーマット:
  ```
  [ai-workflow] Clean up workflow execution logs

  Issue: #<NUM>
  Phase: <NUM> (<NAME>)
  Action: Remove agent execution logs (execute/review/revise directories)
  Preserved: metadata.json, output/*.md

  Auto-generated by AI Workflow
  ```

**受け入れ基準**:
- Given: Issue番号が 123、フェーズが `report` である
- When: `createCleanupCommitMessage(123, 'report')` を呼び出す
- Then: フォーマットに従ったクリーンアップコミットメッセージが返される
- And: フェーズ番号が正しく計算される（report = Phase 8）

---

### 2.3. CommitManager のリファクタリング [優先度: 高]

**説明**: 既存の `commit-manager.ts` をリファクタリングし、FileSelector/CommitMessageBuilder に処理を委譲する。

**詳細要件**:

#### FR-2.3.1: FileSelector/CommitMessageBuilder のインスタンス化 [優先度: 高]
- コンストラクタで FileSelector と CommitMessageBuilder のインスタンスを生成
- 依存性注入パターンを使用

**受け入れ基準**:
- Given: CommitManager のコンストラクタが呼ばれる
- When: SimpleGit と MetadataManager を受け取る
- Then: FileSelector と CommitMessageBuilder が正常に初期化される

#### FR-2.3.2: commitPhaseOutput の委譲実装 [優先度: 高]
- 既存の `commitPhaseOutput` メソッドをリファクタリング
- ファイル選択ロジックを FileSelector に委譲
  - `this.fileSelector.getChangedFiles()`
  - `this.fileSelector.filterPhaseFiles()`
  - `this.fileSelector.getPhaseSpecificFiles()`
- コミットメッセージ生成を CommitMessageBuilder に委譲
  - `this.messageBuilder.createCommitMessage()`

**受け入れ基準**:
- Given: フェーズ出力コミットを実行する
- When: `commitPhaseOutput('requirements', 'completed', 'PASS')` を呼び出す
- Then: FileSelector でファイルが選択される
- And: CommitMessageBuilder でコミットメッセージが生成される
- And: SecretMasker でシークレットがマスクされる
- And: Git コミットが実行される
- And: 後方互換性が100%維持される（既存の呼び出し元は無変更で動作）

#### FR-2.3.3: commitStepOutput の委譲実装 [優先度: 高]
- 既存の `commitStepOutput` メソッドをリファクタリング
- ファイル選択ロジックを FileSelector に委譲
- コミットメッセージ生成を CommitMessageBuilder に委譲

**受け入れ基準**:
- Given: ステップ出力コミットを実行する
- When: `commitStepOutput('implementation', 4, 'execute', 123, '/path')` を呼び出す
- Then: FileSelector でファイルが選択される
- And: CommitMessageBuilder でステップコミットメッセージが生成される
- And: Git コミットが実行される

#### FR-2.3.4: commitWorkflowInit の委譲実装 [優先度: 中]
- 既存の `commitWorkflowInit` メソッドをリファクタリング
- ファイル選択ロジックを FileSelector に委譲
- コミットメッセージ生成を CommitMessageBuilder に委譲

**受け入れ基準**:
- Given: ワークフロー初期化コミットを実行する
- When: `commitWorkflowInit(123, 'ai-workflow/issue-123')` を呼び出す
- Then: FileSelector でファイルが選択される
- And: CommitMessageBuilder で初期化コミットメッセージが生成される
- And: SecretMasker でメタデータがマスクされる
- And: Git コミットが実行される

#### FR-2.3.5: commitCleanupLogs の委譲実装 [優先度: 中]
- 既存の `commitCleanupLogs` メソッドをリファクタリング
- ファイル選択ロジックを FileSelector に委譲
- コミットメッセージ生成を CommitMessageBuilder に委譲

**受け入れ基準**:
- Given: ログクリーンアップコミットを実行する
- When: `commitCleanupLogs(123, 'report')` を呼び出す
- Then: FileSelector でファイルが選択される
- And: CommitMessageBuilder でクリーンアップコミットメッセージが生成される
- And: Git コミットが実行される

#### FR-2.3.6: createCommitMessage の公開メソッド委譲 [優先度: 低]
- 既存の `createCommitMessage` メソッドを維持
- CommitMessageBuilder に委譲
- git-manager.ts との後方互換性を維持

**受け入れ基準**:
- Given: git-manager.ts から `createCommitMessage` が呼ばれる
- When: `commitManager.createCommitMessage('requirements', 'completed', 'PASS')` を呼び出す
- Then: CommitMessageBuilder に処理が委譲される
- And: 既存の呼び出し元は無変更で動作する

#### FR-2.3.7: 抽出済みメソッドの削除 [優先度: 高]
- `getChangedFiles`, `filterPhaseFiles`, `getPhaseSpecificFiles`, `scanDirectories`, `scanByPatterns` を削除
- `buildStepCommitMessage`, `createInitCommitMessage`, `createCleanupCommitMessage` を削除
- ファイルサイズを 586行 → 約200行に削減

**受け入れ基準**:
- Given: リファクタリングが完了した
- When: commit-manager.ts のファイルサイズを確認する
- Then: 約200行に削減されている（66%削減）
- And: 抽出済みメソッドが全て削除されている

---

## 3. 非機能要件

### 3.1. パフォーマンス要件

#### NFR-3.1.1: 委譲オーバーヘッドの最小化
- 委譲パターンによるオーバーヘッドは、メソッド呼び出し1回のみに限定する
- Git操作（I/O）がボトルネックであり、委譲パターンの影響は0.1%未満である

**受け入れ基準**:
- Given: 統合テスト（step-commit-push.test.ts）を実行する
- When: 実行時間を計測する
- Then: リファクタリング前後でパフォーマンス劣化がない（±5%以内）

### 3.2. 保守性要件

#### NFR-3.2.1: 単一責任の原則（SRP）に準拠
- FileSelector: ファイル選択・フィルタリングロジックのみ
- CommitMessageBuilder: コミットメッセージ構築ロジックのみ
- CommitManager: コミット実行とオーケストレーションのみ

**受け入れ基準**:
- Given: 各モジュールのソースコードを確認する
- When: 責務が混在していないか検証する
- Then: 各モジュールが明確に単一の責務のみを持つ

#### NFR-3.2.2: コード重複の削除
- `commitPhaseOutput` と `commitStepOutput` 間の重複コード（約40行）を削除
- FileSelector/CommitMessageBuilder の共通ロジックを抽出

**受け入れ基準**:
- Given: リファクタリングが完了した
- When: 重複コードをスキャンする
- Then: 重複コードが削除されている（`commitPhaseOutput` と `commitStepOutput` の重複がない）

### 3.3. テスト容易性要件

#### NFR-3.3.1: 独立したユニットテストが可能
- FileSelector の各メソッドを独立してテストできる
- CommitMessageBuilder の各メソッドを独立してテストできる
- CommitManager の委譲動作をモックでテストできる

**受け入れ基準**:
- Given: ユニットテストを作成する
- When: FileSelector/CommitMessageBuilder のテストを実行する
- Then: 各モジュールが独立してテスト可能である
- And: モックを使用して CommitManager の委譲動作を検証できる

### 3.4. 拡張性要件

#### NFR-3.4.1: 新規フェーズ追加の容易性
- 新規フェーズ追加時、FileSelector の `getPhaseSpecificFiles` メソッドのみ変更すれば済む
- CommitManager 本体への変更は不要

**受け入れ基準**:
- Given: 新規フェーズ `new_phase` を追加する
- When: FileSelector の `getPhaseSpecificFiles` にケースを追加する
- Then: CommitManager 本体への変更なしで新規フェーズに対応できる

### 3.5. 後方互換性要件

#### NFR-3.5.1: 100%の後方互換性維持
- 既存の公開API（`commitPhaseOutput`, `commitStepOutput`, `createCommitMessage` 等）を維持
- git-manager.ts からの呼び出しは無変更で動作

**受け入れ基準**:
- Given: 既存の git-manager.ts から CommitManager を使用する
- When: リファクタリング後のコードで実行する
- Then: すべての既存機能が正常に動作する
- And: git-manager.ts のコード変更が不要である

---

## 4. 制約事項

### 4.1. 技術的制約

#### TC-4.1.1: TypeScript の型安全性
- 全ての新規コードは TypeScript の厳密な型チェックに準拠する
- `any` 型の使用を禁止（`unknown` を使用し、型ガードで絞り込む）

#### TC-4.1.2: ESLint ルールの遵守
- ESLint エラーがゼロであること
- `no-console` ルールに準拠（統一loggerモジュールを使用）

#### TC-4.1.3: 既存のアーキテクチャパターンの踏襲
- ファサードパターン: GitManager（Issue #25）、GitHubClient（Issue #24）と同様のパターンを採用
- 依存性注入パターン: コンストラクタでインスタンスを受け取る

### 4.2. リソース制約

#### TC-4.2.1: 見積もり工数の遵守
- 合計工数: 14~20時間（2~3日）
- Phase 4（実装）: 4~6時間
- Phase 5（テストコード実装）: 2~3時間

### 4.3. ポリシー制約

#### TC-4.3.1: コーディング規約の遵守
- `src/utils/logger.ts` の統一loggerモジュールを使用（`console.log` 禁止）
- `src/utils/error-utils.ts` のエラーハンドリングユーティリティを使用（`as Error` 禁止）
- `src/core/config.ts` の Config クラスで環境変数にアクセス（`process.env` 直接アクセス禁止）

---

## 5. 前提条件

### 5.1. システム環境

#### PC-5.1.1: Node.js/TypeScript 環境
- Node.js 20 以上
- TypeScript 5.x
- npm 10 以上

#### PC-5.1.2: 開発ツール
- ESLint 設定済み
- Jest テストフレームワーク（ES modules モード）

### 5.2. 依存コンポーネント

#### PC-5.2.1: simple-git
- SimpleGit インスタンスが正常に動作する
- Git コマンドがローカル環境で実行可能

#### PC-5.2.2: minimatch
- minimatch ライブラリが利用可能
- パターンマッチングが正常に動作する

#### PC-5.2.3: MetadataManager
- MetadataManager が正常に動作する
- `metadata.json` の読み書きが可能

#### PC-5.2.4: SecretMasker
- SecretMasker が正常に動作する
- シークレットマスキング機能が利用可能

### 5.3. 外部システム連携

#### PC-5.3.1: Git リポジトリ
- ローカル Git リポジトリが存在する
- `.ai-workflow/issue-*/` ディレクトリ構造が作成済み

---

## 6. 受け入れ基準

### 6.1. FileSelector の受け入れ基準

#### AC-6.1.1: getChangedFiles の動作検証
- **Given**: Git リポジトリに `src/index.ts` と `.ai-workflow/issue-123/metadata.json` が変更されている
- **When**: `fileSelector.getChangedFiles()` を呼び出す
- **Then**: `['src/index.ts', '.ai-workflow/issue-123/metadata.json']` が返される
- **And**: `@tmp` を含むファイルは除外される
- **And**: 重複ファイルが除去される

#### AC-6.1.2: filterPhaseFiles の動作検証
- **Given**: 変更ファイルに `.ai-workflow/issue-123/metadata.json` と `.ai-workflow/issue-456/metadata.json` と `src/index.ts` が含まれる
- **When**: `fileSelector.filterPhaseFiles(files, '123')` を呼び出す
- **Then**: `['.ai-workflow/issue-123/metadata.json', 'src/index.ts']` が返される
- **And**: Issue #456 のファイルは除外される

#### AC-6.1.3: getPhaseSpecificFiles の動作検証（implementation）
- **Given**: フェーズが `implementation` で、`scripts/deploy.sh` が変更されている
- **When**: `fileSelector.getPhaseSpecificFiles('implementation')` を呼び出す
- **Then**: `['scripts/deploy.sh']` が返される

#### AC-6.1.4: getPhaseSpecificFiles の動作検証（test_implementation）
- **Given**: フェーズが `test_implementation` で、`src/index.test.ts` が変更されている
- **When**: `fileSelector.getPhaseSpecificFiles('test_implementation')` を呼び出す
- **Then**: `['src/index.test.ts']` が返される

#### AC-6.1.5: getPhaseSpecificFiles の動作検証（documentation）
- **Given**: フェーズが `documentation` で、`README.md` が変更されている
- **When**: `fileSelector.getPhaseSpecificFiles('documentation')` を呼び出す
- **Then**: `['README.md']` が返される

#### AC-6.1.6: scanDirectories の動作検証
- **Given**: 変更ファイルに `scripts/deploy.sh` と `src/index.ts` が含まれる
- **When**: `fileSelector.scanDirectories(['scripts'])` を呼び出す
- **Then**: `['scripts/deploy.sh']` のみが返される

#### AC-6.1.7: scanByPatterns の動作検証
- **Given**: 変更ファイルに `src/index.test.ts` と `src/index.ts` が含まれる
- **When**: `fileSelector.scanByPatterns(['*.test.ts'])` を呼び出す
- **Then**: `['src/index.test.ts']` のみが返される

### 6.2. CommitMessageBuilder の受け入れ基準

#### AC-6.2.1: createCommitMessage の動作検証
- **Given**: フェーズが `requirements`、ステータスが `completed`、レビュー結果が `PASS` である
- **When**: `messageBuilder.createCommitMessage('requirements', 'completed', 'PASS')` を呼び出す
- **Then**: 以下のフォーマットのメッセージが返される:
  ```
  [ai-workflow] Phase 1 (requirements) - completed

  Issue: #123
  Phase: 1 (requirements)
  Status: completed
  Review: PASS

  Auto-generated by AI Workflow
  ```

#### AC-6.2.2: buildStepCommitMessage の動作検証
- **Given**: フェーズが `implementation`、フェーズ番号が 4、ステップが `execute`、Issue番号が 123 である
- **When**: `messageBuilder.buildStepCommitMessage('implementation', 4, 'execute', 123)` を呼び出す
- **Then**: 以下のフォーマットのメッセージが返される:
  ```
  [ai-workflow] Phase 4 (implementation) - execute completed

  Issue: #123
  Phase: 4 (implementation)
  Step: execute
  Status: completed

  Auto-generated by AI Workflow
  ```

#### AC-6.2.3: createInitCommitMessage の動作検証
- **Given**: Issue番号が 123、ブランチ名が `ai-workflow/issue-123` である
- **When**: `messageBuilder.createInitCommitMessage(123, 'ai-workflow/issue-123')` を呼び出す
- **Then**: 以下のフォーマットのメッセージが返される:
  ```
  [ai-workflow] Initialize workflow for issue #123

  Issue: #123
  Action: Create workflow metadata and directory structure
  Branch: ai-workflow/issue-123

  Auto-generated by AI Workflow
  ```

#### AC-6.2.4: createCleanupCommitMessage の動作検証
- **Given**: Issue番号が 123、フェーズが `report` である
- **When**: `messageBuilder.createCleanupCommitMessage(123, 'report')` を呼び出す
- **Then**: 以下のフォーマットのメッセージが返される:
  ```
  [ai-workflow] Clean up workflow execution logs

  Issue: #123
  Phase: 8 (report)
  Action: Remove agent execution logs (execute/review/revise directories)
  Preserved: metadata.json, output/*.md

  Auto-generated by AI Workflow
  ```

### 6.3. CommitManager の受け入れ基準

#### AC-6.3.1: commitPhaseOutput の委譲動作検証
- **Given**: フェーズ出力コミットを実行する
- **When**: `commitManager.commitPhaseOutput('requirements', 'completed', 'PASS')` を呼び出す
- **Then**: FileSelector の `getChangedFiles()`, `filterPhaseFiles()`, `getPhaseSpecificFiles()` が呼ばれる
- **And**: CommitMessageBuilder の `createCommitMessage()` が呼ばれる
- **And**: SecretMasker の `maskSecretsInWorkflowDir()` が呼ばれる
- **And**: Git コミットが正常に実行される
- **And**: `CommitResult` オブジェクトが返される

#### AC-6.3.2: commitStepOutput の委譲動作検証
- **Given**: ステップ出力コミットを実行する
- **When**: `commitManager.commitStepOutput('implementation', 4, 'execute', 123, '/path')` を呼び出す
- **Then**: FileSelector の `getChangedFiles()`, `filterPhaseFiles()` が呼ばれる
- **And**: CommitMessageBuilder の `buildStepCommitMessage()` が呼ばれる
- **And**: Git コミットが正常に実行される

#### AC-6.3.3: 後方互換性の検証
- **Given**: 既存の統合テスト（step-commit-push.test.ts）を実行する
- **When**: リファクタリング後のコードで実行する
- **Then**: すべてのテストが成功する
- **And**: git-manager.ts のコード変更が不要である

### 6.4. テストカバレッジの受け入れ基準

#### AC-6.4.1: ユニットテストカバレッジ
- **Given**: ユニットテストを実行する
- **When**: カバレッジレポートを生成する
- **Then**: 各モジュールのカバレッジが90%以上である
- **And**: 全ての公開メソッドがテストされている

#### AC-6.4.2: 統合テストの成功
- **Given**: 統合テスト（step-commit-push.test.ts）を実行する
- **When**: リファクタリング後のコードで実行する
- **Then**: すべてのテストが成功する
- **And**: パフォーマンス劣化がない（±5%以内）

---

## 7. スコープ外

### 7.1. 将来的な拡張候補

以下の項目は、このリファクタリングのスコープ外とし、将来的な改善候補として扱います：

#### OUT-7.1.1: Git 操作の抽象化
- Git 操作（`git.add()`, `git.commit()`, `git.push()`）を独立したモジュールに抽出
- 現時点では CommitManager に残す
- 理由: Git 操作はコミット実行の本質的な責務であり、過度な分割は不要

#### OUT-7.1.2: SecretMasker の統合方法の見直し
- SecretMasker の呼び出しを別モジュールに委譲
- 現時点では CommitManager に残す
- 理由: SecretMasker はコミット前処理の一部であり、CommitManager の責務範囲内

#### OUT-7.1.3: ensureGitConfig の抽出
- Git 設定管理を独立したモジュールに抽出
- 現時点では CommitManager に残す
- 理由: Git 設定はコミット実行の前提条件であり、CommitManager の責務範囲内

#### OUT-7.1.4: phaseOrder 定数の共有戦略の改善
- phaseOrder 定数を外部モジュール（`src/types.ts` 等）に抽出
- 現時点では CommitMessageBuilder に保持
- 理由: 現在は CommitMessageBuilder のみが使用しており、早期最適化を避ける

#### OUT-7.1.5: パフォーマンス最適化
- ファイルスキャンのキャッシング機能
- 並列処理の導入
- 現時点では実装しない
- 理由: Git I/O がボトルネックであり、最適化効果が限定的

---

## 8. 補足事項

### 8.1. 既存実績の活用

このプロジェクトでは、以下のモジュールで既にファサードパターンが成功裏に実装されています：

- **GitManager** (Issue #25): 548行から181行へ67%削減
  - CommitManager, BranchManager, RemoteManager への分離
- **GitHubClient** (Issue #24): 702行から402行へ42.7%削減
  - IssueClient, PullRequestClient, CommentClient, ReviewClient への分離

これらの実績から、CommitManager の分解も同様のパターンで成功する見込みが高いと判断します。

### 8.2. minimatch の使用状況

現在、`commit-manager.ts` の 545-566行で `minimatch` ライブラリを使用したパターンマッチングが実装されています。この部分を FileSelector に抽出する際、既存の挙動を100%維持する必要があります。

具体的には、以下のパターンマッチングロジックを保持します：

```typescript
minimatch(file, pattern, { dot: true }) ||
minimatch(file, `**/${pattern}`, { dot: true })
```

このロジックにより、以下の2つのパターンマッチングが可能になります：

1. ファイル名の直接マッチ（例: `index.test.ts`）
2. ディレクトリを含むパスのマッチ（例: `src/index.test.ts` が `**/*.test.ts` にマッチ）

### 8.3. 既存テストの活用

既存の `commit-manager.test.ts`（363行）には、以下のテストが含まれています：

- **メッセージ生成テスト（62~148行）**: CommitMessageBuilder のテストに移行
- **ファイルヘルパーテスト（461~577行）**: FileSelector のテストに移行
- **コミット操作テスト（150~362行）**: CommitManager の委譲テストにリファクタリング

既存テストの大部分が再利用可能であるため、テストコード実装の工数は比較的少なく見積もられています（2~3時間）。

### 8.4. リスク軽減策

#### リスク1: ファイル選択ロジックの抽出時のバグ混入
- **軽減策**: 既存テストスイート（363行）を全て実行し、リグレッションを検出
- **軽減策**: FileSelector の単体テストで境界値テスト（`@tmp`除外、Issue番号フィルタリング）を徹底
- **軽減策**: minimatch パターンマッチングの挙動を既存テストで再現

#### リスク2: 委譲パターンのパフォーマンスオーバーヘッド
- **軽減策**: 委譲オーバーヘッドはメソッド呼び出し1回のみ（無視可能）
- **軽減策**: Git操作（I/O）がボトルネックであり、委譲パターンの影響は0.1%未満と見込む
- **軽減策**: 統合テスト（step-commit-push.test.ts）でパフォーマンス劣化がないことを確認

#### リスク3: メッセージ生成ロジックのフォーマット変更
- **軽減策**: CommitMessageBuilder のテストで既存メッセージフォーマットを厳密に検証
- **軽減策**: `git log` の出力が既存コミットと一致することを目視確認
- **軽減策**: フォーマット文字列をコピー＆ペーストでミスを防止

#### リスク4: 後方互換性の破壊
- **軽減策**: ファサードパターンにより公開APIを100%維持
- **軽減策**: git-manager.ts からの呼び出しインターフェースを変更しない
- **軽減策**: 既存の統合テスト（step-commit-push.test.ts）で後方互換性を検証

---

## 9. 成功基準（品質ゲート）

このリファクタリングが成功したと判断する基準：

### 9.1. コード品質
- ✅ CommitManager が586行から約200行に削減される（66%削減）
- ✅ 単一責任の原則に準拠した3つのモジュールに分解される
- ✅ ESLint エラーなし、TypeScript コンパイルエラーなし

### 9.2. テストカバレッジ
- ✅ ユニットテストカバレッジ90%以上
- ✅ 全てのテストが成功（ユニット + 統合）
- ✅ 後方互換性が100%維持される

### 9.3. 保守性
- ✅ FileSelector と CommitMessageBuilder が独立してテスト可能
- ✅ 各モジュールが明確な責務を持つ
- ✅ 委譲パターンにより拡張が容易

### 9.4. ドキュメント
- ✅ ARCHITECTURE.md と CLAUDE.md が最新の構造を反映
- ✅ 全てのコードに適切なJSDocコメント

---

**要件定義書作成日**: 2025-01-31
**見積もり総工数**: 14~20時間
**想定期間**: 2~3日
**リスク評価**: 低
**後方互換性**: 100%維持
