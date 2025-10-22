# 要件定義書 - Issue #22

**Issue番号**: #22
**タイトル**: [REFACTOR] CLI コマンド処理の分離 (main.ts リファクタリング)
**作成日**: 2025-01-20
**ステータス**: Requirements Phase

---

## 0. Planning Document の確認

### 開発計画の全体像

Planning Document (planning.md) で策定された以下の計画を前提として、要件定義を実施します：

- **実装戦略**: REFACTOR（既存コード改善が中心、機能追加なし）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテストと統合テストを組み合わせ）
- **テストコード戦略**: BOTH_TEST（既存テストの拡張 + 新規テストの作成）
- **見積もり工数**: 14~18時間（Phase 1 〜 Phase 8）
- **複雑度**: 中程度
- **リスク評価**: 中（破壊的変更の可能性、循環依存、型定義の不整合）

### 計画書で定義されたスコープ

1. **main.ts を 200行以下に削減**（現行: 1309行）
2. **4つのコマンドモジュールを新規作成**（init.ts, execute.ts, review.ts, list-presets.ts）
3. **共有ユーティリティモジュールの作成**（repository-utils.ts, types/commands.ts）
4. **既存テストの互換性維持**（ユニットテスト18件 + 統合テスト18件）
5. **破壊的変更の禁止**（既存動作の完全な維持）

---

## 1. 概要

### 背景

現在の `src/main.ts` は 1309行に達しており、以下の問題が顕在化しています：

1. **コマンドハンドラ処理が肥大化**
   - `handleInitCommand`: 229行（L229-L450）
   - `handleExecuteCommand`: 346行（L452-L798）
   - `handleReviewCommand`: 18行（L800-L817）
   - `listPresets`: 26行（L1201-L1225）

2. **責務の混在**
   - CLIルーティング
   - コマンド処理ロジック
   - ヘルパー関数（Issue URL解析、リポジトリ解決、ブランチ検証等）

3. **テストカバレッジの困難性**
   - 多くの関数が private（export されていない）ため、ユニットテストが間接的
   - 既存テスト（`tests/unit/main-preset-resolution.test.ts`）はロジックを再現してテスト

### 目的

**main.ts をコマンドルーターとしての責務に特化させ、各コマンド処理を独立したモジュールに分離することで、以下を実現します：**

1. **コードの可読性向上** - main.ts を 200行以下に削減し、エントリーポイントの見通しを改善
2. **保守性向上** - コマンドごとの責務を明確化し、変更影響範囲を限定
3. **テスト容易性向上** - 各コマンドモジュールが独立してテスト可能
4. **SOLID原則の適用** - 単一責任原則（Single Responsibility Principle）に準拠

### ビジネス価値・技術的価値

**ビジネス価値**:
- 開発速度の向上（コマンド追加・修正が容易）
- バグ混入リスクの低減（影響範囲が明確）
- オンボーディングの効率化（新規開発者がコードを理解しやすい）

**技術的価値**:
- アーキテクチャの健全性向上（疎結合、高凝集）
- 他のリファクタリング（Phase管理、メタデータ管理等）の基盤構築
- CI/CDパイプラインの安定性向上（テスト実行時間の短縮、テストの並列化が可能）

---

## 2. 機能要件

### FR-1: コマンドモジュールの分離

#### FR-1.1: initコマンドモジュールの作成

**優先度**: 高

**説明**:
- 新規ファイル `src/commands/init.ts` を作成し、`handleInitCommand` 関数を移動
- Issue初期化に関連するロジックを集約

**要件詳細**:
1. `handleInitCommand(issueUrl: string, customBranch?: string): Promise<void>` を実装
2. 以下の関数を `init.ts` に移動または参照：
   - `parseIssueUrl` - Issue URL解析（共有モジュールへ移動を推奨）
   - `resolveLocalRepoPath` - ローカルリポジトリパス解決（共有モジュールへ移動を推奨）
   - `validateBranchName` - ブランチ名バリデーション
   - `resolveBranchName` - ブランチ名解決（デフォルトまたはカスタム）
   - `getRepoRoot` - リポジトリルート取得（共有モジュールへ移動を推奨）
3. エクスポート：`export async function handleInitCommand(...): Promise<void>`

**受け入れ基準**:
- Given: GitHub Issue URL と カスタムブランチ名（任意）が指定される
- When: `handleInitCommand` が呼び出される
- Then: メタデータが作成され、ブランチがチェックアウトされ、Draft PRが作成される

#### FR-1.2: executeコマンドモジュールの作成

**優先度**: 高

**説明**:
- 新規ファイル `src/commands/execute.ts` を作成し、`handleExecuteCommand` 関数を移動
- フェーズ実行に関連するロジックを集約

**要件詳細**:
1. `handleExecuteCommand(options: any): Promise<void>` を実装
2. 以下の関数を `execute.ts` に移動：
   - `executePhasesSequential` - フェーズの順次実行
   - `executePhasesFrom` - 特定フェーズからの実行
   - `createPhaseInstance` - フェーズインスタンス作成
   - `resolvePresetName` - プリセット名解決（後方互換性対応）
   - `getPresetPhases` - プリセットのフェーズリスト取得
   - `canResumeWorkflow` - ワークフロー再開可否判定
   - `loadExternalDocuments` - 外部ドキュメント読み込み
   - `resetMetadata` - メタデータリセット
3. エクスポート：`export async function handleExecuteCommand(...): Promise<void>`

**受け入れ基準**:
- Given: Issue番号、フェーズ名（またはプリセット名）、エージェントモードが指定される
- When: `handleExecuteCommand` が呼び出される
- Then: 指定されたフェーズが順次実行され、実行サマリーが出力される

#### FR-1.3: reviewコマンドモジュールの作成

**優先度**: 中

**説明**:
- 新規ファイル `src/commands/review.ts` を作成し、`handleReviewCommand` 関数を移動
- フェーズレビューに関連するロジックを集約

**要件詳細**:
1. `handleReviewCommand(options: any): Promise<void>` を実装
2. 現在のロジック（18行）をそのまま移動
3. エクスポート：`export async function handleReviewCommand(...): Promise<void>`

**受け入れ基準**:
- Given: Issue番号とフェーズ名が指定される
- When: `handleReviewCommand` が呼び出される
- Then: 指定されたフェーズのステータスが表示される

#### FR-1.4: list-presetsコマンドモジュールの作成

**優先度**: 中

**説明**:
- 新規ファイル `src/commands/list-presets.ts` を作成し、`listPresets` 関数を移動
- プリセット一覧表示に関連するロジックを集約

**要件詳細**:
1. `listPresets(): void` を実装
2. 現在のロジック（26行）をそのまま移動
3. エクスポート：`export function listPresets(): void`

**受け入れ基準**:
- Given: コマンド `list-presets` が実行される
- When: `listPresets` が呼び出される
- Then: 利用可能なプリセット一覧と非推奨プリセット一覧が表示される

### FR-2: 共有ユーティリティモジュールの作成

#### FR-2.1: リポジトリユーティリティモジュールの作成

**優先度**: 高

**説明**:
- 新規ファイル `src/core/repository-utils.ts` を作成
- 複数コマンドで使用されるリポジトリ関連の関数を集約

**要件詳細**:
1. 以下の関数を移動：
   - `parseIssueUrl(issueUrl: string): IssueInfo` - Issue URL解析（既にexport済み）
   - `resolveLocalRepoPath(repoName: string): string` - ローカルリポジトリパス解決（既にexport済み）
   - `findWorkflowMetadata(issueNumber: string): Promise<{repoRoot: string; metadataPath: string}>` - メタデータ探索（既にexport済み）
   - `getRepoRoot(): Promise<string>` - リポジトリルート取得（新規export）
2. エクスポート：すべての関数を `export`

**受け入れ基準**:
- Given: GitHub Issue URLまたはリポジトリ名が指定される
- When: 各関数が呼び出される
- Then: リポジトリ情報が正しく解決され、エラー時は適切なエラーメッセージが返される

#### FR-2.2: コマンド型定義モジュールの作成

**優先度**: 中

**説明**:
- 新規ファイル `src/types/commands.ts` を作成
- コマンド関連の型定義を集約

**要件詳細**:
1. 以下の型定義を移動：
   - `PhaseContext` - フェーズ実行コンテキスト
   - `PhaseResultMap` - フェーズ実行結果マップ
   - `ExecutionSummary` - 実行サマリー
   - `IssueInfo` - Issue情報（既にexport済み）
   - `BranchValidationResult` - ブランチバリデーション結果
2. エクスポート：すべての型を `export`

**受け入れ基準**:
- Given: コマンドモジュールが型定義をimportする
- When: TypeScriptコンパイルが実行される
- Then: 型エラーが発生せず、正しく型チェックが行われる

### FR-3: main.ts の簡素化

#### FR-3.1: main.ts をコマンドルーターに再構成

**優先度**: 高

**説明**:
- main.ts から各コマンドハンドラを削除し、新規モジュールからimport
- main.ts はCLI定義（commander）とルーティングのみを担当

**要件詳細**:
1. 以下をmain.tsに残す：
   - `runCli()` - CLI エントリーポイント
   - `commander` 定義（program定義、.command()、.action()）
   - `reportFatalError()` - エラーハンドリング
   - `reportExecutionSummary()` - 実行サマリー表示
   - `isValidPhaseName()` - フェーズ名バリデーション
   - `PHASE_ORDER` - フェーズ順序定義
2. 以下を削除（各モジュールへ移動）：
   - `handleInitCommand` → `src/commands/init.ts`
   - `handleExecuteCommand` → `src/commands/execute.ts`
   - `handleReviewCommand` → `src/commands/review.ts`
   - `listPresets` → `src/commands/list-presets.ts`
   - 各ヘルパー関数 → `src/core/repository-utils.ts` または各コマンドモジュール
3. 新規モジュールからの import を追加

**受け入れ基準**:
- Given: main.ts が簡素化される
- When: `wc -l src/main.ts` を実行
- Then: 200行以下であることが確認される

### FR-4: 既存動作の完全な維持

#### FR-4.1: CLI インターフェースの互換性

**優先度**: 高

**説明**:
- リファクタリング前後で CLI インターフェースが完全に一致
- ユーザーは既存のコマンドを変更なしで使用可能

**要件詳細**:
1. `init` コマンド: `--issue-url`, `--branch` オプションが動作
2. `execute` コマンド: `--issue`, `--phase`, `--preset`, `--agent` 等すべてのオプションが動作
3. `review` コマンド: `--phase`, `--issue` オプションが動作
4. `list-presets` コマンド: オプションなしで動作
5. エラーメッセージの一貫性（リファクタリング前後で同一）

**受け入れ基準**:
- Given: 既存のCLIコマンド（例: `node dist/index.js init --issue-url ...`）が実行される
- When: リファクタリング後のコードが実行される
- Then: リファクタリング前と完全に同一の結果が得られる

#### FR-4.2: エージェントモードの互換性

**優先度**: 高

**説明**:
- Codex / Claude の自動フォールバック機能が正常に動作
- エージェント選択ロジックが変更されない

**要件詳細**:
1. `--agent auto` モード: Codex API キーがあれば Codex、なければ Claude にフォールバック
2. `--agent codex` モード: Codex のみ使用
3. `--agent claude` モード: Claude のみ使用
4. 認証情報の検証ロジックが変更されない

**受け入れ基準**:
- Given: 各エージェントモードが指定される
- When: executeコマンドが実行される
- Then: リファクタリング前と同一のエージェントが選択され、同一のログが出力される

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

#### NFR-1.1: ビルド時間の維持

**説明**: リファクタリング後もビルド時間が増加しない

**測定基準**: `npm run build` の実行時間がリファクタリング前の ±10% 以内

#### NFR-1.2: CLI起動時間の維持

**説明**: コマンド実行時のオーバーヘッドが増加しない

**測定基準**: `node dist/index.js --help` の実行時間がリファクタリング前の ±10% 以内

### NFR-2: セキュリティ要件

#### NFR-2.1: 認証情報の保護

**説明**: API キー、GitHub トークン、Claude認証情報の取り扱いロジックが変更されない

**測定基準**: 認証情報が環境変数経由でのみ取得され、ログに出力されない

#### NFR-2.2: パストラバーサル対策

**説明**: ファイルパス解決時のセキュリティチェックが維持される

**測定基準**: `resolveLocalRepoPath`, `findWorkflowMetadata` で不正なパスが拒否される

### NFR-3: 可用性・信頼性要件

#### NFR-3.1: エラーハンドリングの一貫性

**説明**: 既存のエラーハンドリングロジックが維持される

**測定基準**: すべての異常系テストケースが既存と同一の結果を返す

#### NFR-3.2: ログ出力の一貫性

**説明**: リファクタリング前後でログ出力が一致する

**測定基準**:
- `[INFO]`, `[WARNING]`, `[ERROR]`, `[OK]` プレフィックスが維持される
- ログメッセージの内容が変更されない

### NFR-4: 保守性・拡張性要件

#### NFR-4.1: モジュール間の疎結合

**説明**: コマンドモジュール間で直接依存しない（共有モジュール経由）

**測定基準**:
- `src/commands/init.ts` が `src/commands/execute.ts` を import しない
- 循環依存が存在しない（madge 等のツールで検証可能）

#### NFR-4.2: 単一責任原則の遵守

**説明**: 各モジュールが単一の責務のみを持つ

**測定基準**:
- `src/commands/init.ts` - Issue初期化のみ担当
- `src/commands/execute.ts` - フェーズ実行のみ担当
- `src/commands/review.ts` - フェーズレビューのみ担当
- `src/commands/list-presets.ts` - プリセット一覧表示のみ担当
- `src/core/repository-utils.ts` - リポジトリ解決のみ担当

#### NFR-4.3: テスト容易性

**説明**: 各コマンドモジュールが独立してテスト可能

**測定基準**:
- 新規作成されたユニットテスト（`tests/unit/commands/*.test.ts`）が単独実行可能
- モック・スタブを最小限にして実装ロジックを直接テスト可能

---

## 4. 制約事項

### TC-1: 技術的制約

#### TC-1.1: TypeScript コンパイラ制約

- TypeScript 5.x を使用
- ES modules（`.js` 拡張子でimport）を使用
- `tsconfig.json` の設定を変更しない

#### TC-1.2: 既存ライブラリ制約

- 新規ライブラリの追加禁止（既存の `commander`, `fs-extra`, `simple-git` 等のみ使用）
- ライブラリのバージョン変更禁止

#### TC-1.3: ファイル構成制約

- `src/commands/` ディレクトリを新規作成
- `src/types/commands.ts` を新規作成（`src/types/` ディレクトリは既存）
- `dist/` ディレクトリ構造を変更しない

### TC-2: リソース制約

#### TC-2.1: 時間制約

- Phase 4（実装）の見積もり工数: 4~5時間
- Phase 5（テストコード実装）の見積もり工数: 1~2時間
- Phase 6（テスト実行）の見積もり工数: 1時間

#### TC-2.2: テスト実行環境制約

- Jest + ES modules（`NODE_OPTIONS=--experimental-vm-modules`）を使用
- CI環境（Jenkins）でテストが実行可能である必要がある

### TC-3: ポリシー制約

#### TC-3.1: コーディング規約

- ESLint ルールに準拠（`npx eslint --ext .ts src` でエラーなし）
- 既存のコーディングスタイルを維持（インデント、命名規則等）

#### TC-3.2: Git コミット規約

- コミットメッセージは `[ai-workflow] Phase 4 (implementation) - execute completed` 形式
- 1つのフェーズで1つのPR（ブランチ `ai-workflow/issue-22`）

#### TC-3.3: 破壊的変更の禁止

- 既存の public API（export された関数・型）の削除禁止
- 既存のCLIオプションの削除・変更禁止
- 既存のメタデータ構造の変更禁止

---

## 5. 前提条件

### PC-1: システム環境

- Node.js 20 以上
- npm 10 以上
- Git 2.x 以上
- TypeScript 5.x（package.jsonで定義）

### PC-2: 依存コンポーネント

- `src/core/metadata-manager.ts` - メタデータ管理（変更なし）
- `src/core/git-manager.ts` - Git操作（変更なし）
- `src/core/github-client.ts` - GitHub API（変更なし）
- `src/core/codex-agent-client.ts` - Codex エージェント（変更なし）
- `src/core/claude-agent-client.ts` - Claude エージェント（変更なし）
- `src/core/phase-dependencies.ts` - フェーズ依存関係（変更なし）
- `src/phases/*.ts` - 各フェーズ実装（変更なし）

### PC-3: 外部システム連携

- GitHub API（Octokit）: Issue情報取得、PR作成
- Codex API: エージェント実行
- Claude Code SDK: エージェント実行
- Git リモートリポジトリ: ブランチ操作、プッシュ

---

## 6. 受け入れ基準

### AC-1: 機能要件の受け入れ基準

#### AC-1.1: initコマンドの動作検証

**Given**: GitHub Issue URL `https://github.com/tielec/ai-workflow-agent/issues/999` が指定される
**When**: `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999` を実行
**Then**:
- メタデータファイル `.ai-workflow/issue-999/metadata.json` が作成される
- ブランチ `ai-workflow/issue-999` が作成される
- Draft PR が作成される（GITHUB_TOKEN が設定されている場合）

#### AC-1.2: executeコマンドの動作検証（フェーズ指定）

**Given**: Issue #999 のワークフローが初期化されている
**When**: `node dist/index.js execute --issue 999 --phase planning` を実行
**Then**:
- Planning Phase が実行される
- `.ai-workflow/issue-999/00_planning/output/planning.md` が生成される
- 実行サマリー `[OK] All phases completed successfully.` が表示される

#### AC-1.3: executeコマンドの動作検証（プリセット指定）

**Given**: Issue #999 のワークフローが初期化されている
**When**: `node dist/index.js execute --issue 999 --preset quick-fix --ignore-dependencies` を実行
**Then**:
- `quick-fix` プリセットのフェーズ（implementation + documentation + report）が実行される
- 各フェーズの成果物が生成される
- 実行サマリー `[OK] All phases completed successfully.` が表示される

#### AC-1.4: reviewコマンドの動作検証

**Given**: Issue #999 の Planning Phase が完了している
**When**: `node dist/index.js review --phase planning --issue 999` を実行
**Then**:
- フェーズステータス `[OK] Phase planning status: completed` が表示される

#### AC-1.5: list-presetsコマンドの動作検証

**Given**: CLIが正常にビルドされている
**When**: `node dist/index.js list-presets` を実行
**Then**:
- 利用可能なプリセット一覧が表示される（`quick-fix`, `review-requirements`, `implementation`, 等）
- 非推奨プリセット一覧が表示される（`requirements-only`, `design-phase`, 等）

### AC-2: 非機能要件の受け入れ基準

#### AC-2.1: main.ts の行数削減検証

**Given**: リファクタリングが完了している
**When**: `wc -l src/main.ts` を実行
**Then**: 200行以下であることが確認される

#### AC-2.2: TypeScriptビルド成功検証

**Given**: リファクタリングが完了している
**When**: `npm run build` を実行
**Then**:
- エラーなしでビルドが完了する
- `dist/commands/` ディレクトリが作成される
- `dist/core/repository-utils.js` が作成される
- `dist/types/commands.js` が作成される

#### AC-2.3: ESLint チェック成功検証

**Given**: リファクタリングが完了している
**When**: `npx eslint --ext .ts src` を実行
**Then**: エラーなしで完了する

### AC-3: テスト要件の受け入れ基準

#### AC-3.1: 既存ユニットテスト成功検証

**Given**: リファクタリングが完了し、既存テストのimport修正が完了している
**When**: `npm run test:unit` を実行
**Then**:
- 既存ユニットテスト18件がすべて成功する
- 新規ユニットテスト（`tests/unit/commands/*.test.ts`）がすべて成功する
- テスト失敗が0件である

#### AC-3.2: 既存統合テスト成功検証

**Given**: リファクタリングが完了している
**When**: `npm run test:integration` を実行
**Then**:
- 既存統合テスト18件がすべて成功する
- テスト失敗が0件である

#### AC-3.3: テストカバレッジ維持検証

**Given**: リファクタリングが完了している
**When**: `npm run test:coverage` を実行
**Then**:
- テストカバレッジが現行水準と同等以上である
- カバレッジレポートでエラーが発生しない

### AC-4: 互換性要件の受け入れ基準

#### AC-4.1: CLIインターフェース互換性検証

**Given**: リファクタリング前のCLIコマンド例が記録されている
**When**: 同一のコマンドをリファクタリング後のCLIで実行
**Then**:
- 出力結果が完全に一致する（ログメッセージ、ファイル生成、Git操作）
- エラーメッセージが完全に一致する（異常系テスト時）

#### AC-4.2: エージェントモード互換性検証

**Given**: 各エージェントモード（auto / codex / claude）が指定される
**When**: executeコマンドを実行
**Then**:
- リファクタリング前と同一のエージェントが選択される
- エージェント選択ログが完全に一致する

---

## 7. スコープ外

### OS-1: 明確にスコープ外とする事項

1. **新規機能の追加**
   - 新規コマンドの追加（例: `clean`, `status` 等）
   - 新規CLIオプションの追加
   - 新規プリセットの追加

2. **既存機能の変更**
   - CLI オプション名の変更
   - メタデータ構造の変更
   - プロンプトテンプレートの変更

3. **依存ライブラリの変更**
   - `commander` のバージョンアップ
   - 新規ライブラリの追加（例: `yargs`, `inquirer` 等）

4. **アーキテクチャの大規模変更**
   - フェーズ実行エンジンのリファクタリング（別 Issue で対応）
   - メタデータ管理のリファクタリング（別 Issue で対応）
   - エージェントクライアントのリファクタリング（別 Issue で対応）

5. **ドキュメント以外の更新**
   - README.md の大幅な書き換え（軽微な修正のみ許容）
   - ROADMAP.md の更新

### OS-2: 将来的な拡張候補

1. **コマンドモジュールの動的ロード**
   - プラグインアーキテクチャの導入（将来的な拡張性向上）
   - サードパーティコマンドのサポート

2. **CLIフレームワークの刷新**
   - `commander` から `yargs` または `oclif` への移行検討

3. **共有ユーティリティの拡充**
   - `src/core/cli-utils.ts` の作成（共通オプション解析、バリデーション等）
   - `src/core/error-handling.ts` の作成（統一的なエラーハンドリング）

4. **型安全性の強化**
   - `options: any` を厳密な型定義に置き換え
   - Zod 等のランタイムバリデーションライブラリの導入検討

---

## 8. リスクと軽減策

### Risk-1: 既存テストの互換性喪失

**影響度**: 高
**確率**: 中

**リスク詳細**:
- 既存ユニットテスト（`tests/unit/main-preset-resolution.test.ts` 等）が、main.ts の private 関数をテスト用に再現している
- リファクタリング後、これらのテストが正しく動作しない可能性

**軽減策**:
1. Phase 5（テストコード実装）で既存テストのimport修正を最優先で実施
2. 既存テストが期待する関数シグネチャを維持する
3. Phase 6（テスト実行）で全件実行し、リグレッションがないことを確認
4. 失敗した場合はロールバック可能なようにGitブランチで管理

### Risk-2: 循環依存の発生

**影響度**: 中
**確率**: 低

**リスク詳細**:
- コマンドモジュール間で相互依存が発生する可能性
- 例: `init.ts` が `execute.ts` をimportし、`execute.ts` が `init.ts` をimportする

**軽減策**:
1. Phase 2（設計）で依存関係図を作成し、循環依存を事前検出
2. 共有ユーティリティモジュール（`repository-utils.ts`, `types/commands.ts`）を独立したモジュールとして設計
3. コマンドモジュール間では直接importせず、必ず共有モジュールを経由する設計
4. TypeScriptコンパイラの循環依存警告を有効化（`tsconfig.json`）

### Risk-3: 型定義の不整合

**影響度**: 中
**確率**: 中

**リスク詳細**:
- 共有型定義（`PhaseContext`, `ExecutionSummary` 等）を移動時、型エラーが発生する可能性
- `src/types/commands.ts` と各コマンドモジュールで型定義が重複する可能性

**軽減策**:
1. Phase 4-1（共有ユーティリティモジュール作成）で共有型定義を最優先で作成（`types/commands.ts`）
2. TypeScript strict mode（`tsconfig.json`）を活用して型エラーをビルド時に検出
3. Phase 6（テスト実行）でビルドエラーがないことを確認（`npm run build`）
4. 型定義の重複を避けるため、single source of truth原則を徹底

### Risk-4: main.ts の行数削減目標未達成

**影響度**: 中
**確率**: 低

**リスク詳細**:
- 200行以下という目標を達成できない可能性
- コマンドルーティングロジックが予想以上に複雑

**軽減策**:
1. Phase 2（設計）で各モジュールに移動するロジックを明確に洗い出し
2. Phase 4-5（main.tsリファクタリング）でmain.tsに残すロジックを最小限に制限（commander定義、ルーティング、エラーハンドリングのみ）
3. Phase 8（レポート）で最終検証を実施し、200行以下であることを確認
4. 200行を超える場合はさらにヘルパー関数を抽出（例: `src/core/cli-router.ts`）

### Risk-5: Git履歴の追跡性低下

**影響度**: 低
**確率**: 高

**リスク詳細**:
- 大規模なファイル移動により、Git履歴の追跡が困難になる可能性
- `git blame` でオリジナルのコミット履歴が失われる

**軽減策**:
1. Git mv コマンドを使用せず、新規ファイル作成 + 元ファイル削除の方式で実装
2. コミットメッセージに「Refactor: Extract XXX from main.ts」と明記
3. Phase 8（レポート）のPR本文で変更内容を詳細に説明
4. ARCHITECTURE.md を更新し、リファクタリングの経緯を記録

---

## 9. 検証シナリオ（テストシナリオの基礎）

### VS-1: 正常系シナリオ

#### VS-1.1: 新規Issueのワークフロー初期化 → フェーズ実行

1. **前提条件**: Issue #999 が存在する、ブランチが存在しない
2. **ステップ1**: `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999`
   - **期待結果**: メタデータ作成、ブランチ作成、Draft PR作成
3. **ステップ2**: `node dist/index.js execute --issue 999 --phase planning`
   - **期待結果**: Planning Phase 完了、`planning.md` 生成
4. **ステップ3**: `node dist/index.js review --phase planning --issue 999`
   - **期待結果**: `[OK] Phase planning status: completed`

#### VS-1.2: プリセット実行

1. **前提条件**: Issue #999 が初期化されている
2. **ステップ1**: `node dist/index.js list-presets`
   - **期待結果**: プリセット一覧表示
3. **ステップ2**: `node dist/index.js execute --issue 999 --preset quick-fix --ignore-dependencies`
   - **期待結果**: implementation + documentation + report 完了

### VS-2: 異常系シナリオ

#### VS-2.1: 不正なIssue URL

1. **ステップ**: `node dist/index.js init --issue-url https://example.com/invalid`
   - **期待結果**: `[ERROR] Invalid GitHub Issue URL: ...` が表示され、終了コード 1

#### VS-2.2: ワークフロー未初期化時のexecute

1. **ステップ**: `node dist/index.js execute --issue 888 --phase planning`
   - **期待結果**: `Error: Workflow not found. Run init first.` が表示され、終了コード 1

#### VS-2.3: 不正なブランチ名

1. **ステップ**: `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999 --branch "invalid branch"`
   - **期待結果**: `[ERROR] Invalid branch name: ... Branch name contains invalid characters (spaces, ...)` が表示され、終了コード 1

### VS-3: エッジケースシナリオ

#### VS-3.1: マルチリポジトリワークフロー

1. **前提条件**: `REPOS_ROOT` 環境変数が設定されている、別リポジトリ `my-app` が存在する
2. **ステップ1**: `node dist/index.js init --issue-url https://github.com/tielec/my-app/issues/100`
   - **期待結果**: `my-app` リポジトリにメタデータ作成、ブランチ作成
3. **ステップ2**: `node dist/index.js execute --issue 100 --phase planning`
   - **期待結果**: Planning Phase が `my-app` リポジトリで実行される

#### VS-3.2: カスタムブランチ名での初期化

1. **ステップ1**: `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999 --branch feature/custom-work`
   - **期待結果**: ブランチ `feature/custom-work` 作成、メタデータに `branch_name: "feature/custom-work"` 記録
2. **ステップ2**: `node dist/index.js execute --issue 999 --phase planning`
   - **期待結果**: `feature/custom-work` ブランチで Planning Phase 実行

---

## 10. 品質ゲート（Requirements Phase）

本要件定義書は、以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: FR-1 〜 FR-4 で具体的な機能要件を定義
- ✅ **受け入れ基準が定義されている**: AC-1 〜 AC-4 で検証可能な受け入れ基準を定義
- ✅ **スコープが明確である**: OS-1（スコープ外）、OS-2（将来的な拡張候補）を明記
- ✅ **論理的な矛盾がない**: Planning Document との整合性を確保、各要件が相互に矛盾しない

---

## 11. 参考資料

### 関連ドキュメント

- **Planning Document**: `.ai-workflow/issue-22/00_planning/output/planning.md` - 開発計画全体
- **ARCHITECTURE.md**: アーキテクチャ設計思想
- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **README.md**: プロジェクト概要と使用方法

### 関連Issue

- **親Issue #1**: リファクタリングの全体計画
- **Issue #22**: [REFACTOR] CLI コマンド処理の分離 (main.ts リファクタリング)

### 既存コード参照

- `src/main.ts`: 現行実装（1309行）
- `tests/unit/main-preset-resolution.test.ts`: 既存ユニットテスト（プリセット解決）
- `tests/unit/branch-validation.test.ts`: 既存ユニットテスト（ブランチ検証）
- `tests/unit/repository-resolution.test.ts`: 既存ユニットテスト（リポジトリ解決）
- `tests/integration/workflow-init-cleanup.test.ts`: 既存統合テスト（ワークフロー初期化）

---

**要件定義書バージョン**: 1.0
**作成日**: 2025-01-20
**作成者**: AI Workflow Agent
**レビュー状態**: Pending Review
