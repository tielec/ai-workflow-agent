# 要件定義書

**Issue番号**: #126
**タイトル**: auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装
**親Issue**: #121 AIエージェントによる自動Issue作成機能の実装
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Document (Issue #126) の分析結果：

**実装戦略**: **CREATE**
- 完全に新しいサブシステム（`auto-issue` コマンド）の追加
- 既存のエージェント実行基盤（CodexAgentClient/ClaudeAgentClient）を活用
- 既存コードへの影響は最小限（`src/main.ts` へのコマンド登録のみ）

**テスト戦略**: **UNIT_INTEGRATION**
- ユニットテスト: 重複検出ロジック、バグ候補データ構造、Issue本文生成ロジック
- インテグレーションテスト: エンドツーエンド動作確認、エージェント実行、GitHub API統合

**テストコード戦略**: **CREATE_TEST**
- 新規テストファイル作成（`tests/unit/core/repository-analyzer.test.ts` 等5ファイル）

**総工数**: 20〜28時間
- Phase 1（要件定義）: 2〜3時間
- Phase 2（設計）: 3〜4時間
- Phase 3（テストシナリオ）: 2〜3時間
- Phase 4（実装）: 8〜10時間
- Phase 5（テストコード実装）: 3〜4時間
- Phase 6（テスト実行）: 1〜2時間
- Phase 7（ドキュメント）: 1〜2時間
- Phase 8（レポート）: 1時間

**主要リスク**:
1. エージェントプロンプト設計の不確実性（高リスク）
2. 重複検出の精度問題（中リスク）
3. 言語非依存性の検証コスト（中リスク）

**Phase 1限定スコープ**:
- バグ検出のみ実装（refactor/enhancement検出は Phase 2へ）
- 対象言語: TypeScript, Python（Go/Java/Rust等は Phase 2へ）

---

## 1. 概要

### 1.1 背景

AI Workflow Agentプロジェクトでは、GitHub Issueに対して10フェーズのワークフロー（Planning → Evaluation）を自動実行する機能を提供しています。しかし、リポジトリ内のバグや改善点を自動的に検出し、Issueとして起票する機能は未実装です。

親Issue #121では、AIエージェント（Codex/Claude）を活用した自動Issue作成機能の実装が計画されており、本Issue #126はそのPhase 1（MVP）として、CLIコマンド基盤とバグ検出機能を実装します。

### 1.2 目的

以下の目的を達成します：

1. **自動バグ検出**: エージェントを活用してリポジトリ内のバグや潜在的な問題を自動検出
2. **言語非依存性**: TypeScript以外のリポジトリ（Python, Go等）にも対応
3. **重複排除**: 既存Issueとの重複を検出し、不要なIssue作成を防止
4. **既存基盤活用**: CodexAgentClient/ClaudeAgentClientを再利用し、開発コストを削減

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- 開発チームの負担軽減（手動バグ探索の自動化）
- バグの早期発見による品質向上
- Issue管理の効率化（重複排除、自動ラベル付与）

**技術的価値**:
- エージェントベースアーキテクチャの拡張実績
- 既存基盤（CodexAgentClient/ClaudeAgentClient）の再利用性実証
- マルチリポジトリ対応の実装パターン確立

---

## 2. 機能要件

### FR-1: CLIコマンド基盤

**優先度**: 高

**説明**: `auto-issue` コマンドを新規追加し、バグ検出→Issue生成までのワークフローを実行可能にする。

**詳細要件**:

#### FR-1.1: コマンド登録
- `src/main.ts` に `auto-issue` コマンドを登録する
- Commander.jsの既存パターンに従って実装する

#### FR-1.2: コマンドハンドラ
- `src/commands/auto-issue.ts` に `handleAutoIssueCommand()` を実装する
- 以下の処理フローを実装:
  1. オプションパース
  2. エージェント認証（既存の `resolveAgentCredentials()` を活用）
  3. RepositoryAnalyzer → IssueDeduplicator → IssueGenerator の順次実行
  4. 結果サマリーの表示

#### FR-1.3: CLIオプション
以下のオプションをサポートする:

| オプション | 型 | デフォルト | 説明 | Phase 1対応 |
|-----------|-----|-----------|------|-----------|
| `--category <type>` | string | "bug" | 検出カテゴリ（bug/refactor/enhancement/all） | bug のみ |
| `--limit <NUM>` | number | 5 | 生成する最大Issue数 | ✅ |
| `--dry-run` | boolean | false | Issue作成をスキップし、候補のみ表示 | ✅ |
| `--similarity-threshold <0-1>` | number | 0.8 | 重複判定の閾値（0.0〜1.0） | ✅ |
| `--agent <mode>` | string | "auto" | 使用エージェント（auto/codex/claude） | ✅ |

**検証可能性**:
- 全オプションが `--help` で表示される
- 各オプションが期待通りに動作する（ユニットテスト）

---

### FR-2: リポジトリ探索エンジン（バグ検出）

**優先度**: 高

**説明**: Claude Code / Codex エージェントを使用してリポジトリのコードベースを探索し、バグ候補を検出する。

**詳細要件**:

#### FR-2.1: モジュール構成
- `src/core/repository-analyzer.ts` を新規作成
- 以下のクラス/メソッドを実装:
  - `RepositoryAnalyzer` クラス
  - `analyze(repoPath: string, agent: 'codex' | 'claude'): Promise<BugCandidate[]>`
  - `parseAgentOutput(rawOutput: string): BugCandidate[]`
  - `validateBugCandidate(candidate: BugCandidate): boolean`

#### FR-2.2: エージェント統合
- 既存の `CodexAgentClient` / `ClaudeAgentClient` を活用
- `--agent` オプションで使用エージェントを選択（auto/codex/claude）
- フォールバック機構: Codex失敗時にClaude使用（`--agent auto` の場合）

#### FR-2.3: バグ検出パターン
エージェントに以下のバグパターンを検出させる:

1. **エラーハンドリングの欠如**
   - try-catchブロックなし
   - エラーの無視（空のcatchブロック）
   - Promise拒否の未処理（unhandled rejection）

2. **型安全性の問題**
   - `any` の過度な使用（TypeScript）
   - 型アサーション（`as`）の乱用
   - 動的型付け言語での型ヒント欠如（Python等）

3. **リソースリーク**
   - ファイルハンドルの未クローズ
   - データベース接続の未解放
   - イベントリスナーの未削除

4. **セキュリティ上の懸念**
   - ハードコードされたシークレット（APIキー、パスワード）
   - SQLインジェクションの可能性
   - 環境変数の直接参照（サニタイズなし）

5. **コードの重複**
   - DRY原則違反
   - コピーペーストコード

#### FR-2.4: 言語非依存性
- TypeScript以外の言語にも対応:
  - **Phase 1対応**: TypeScript, Python
  - **Phase 2以降**: Go, Java, Rust, C++
- エージェントプロンプトは言語固有の記述を避け、汎用的な指示を使用

#### FR-2.5: 出力フォーマット
エージェントの出力を以下の構造化データにパース:

```typescript
interface BugCandidate {
  title: string;          // バグタイトル（50〜80文字）
  file: string;           // ファイルパス（相対パス）
  line: number;           // 行番号
  severity: 'high' | 'medium' | 'low';  // 深刻度
  description: string;    // 詳細説明（200〜500文字）
  suggestedFix: string;   // 修正案（100〜300文字）
  category: 'bug';        // カテゴリ（Phase 1では固定）
}
```

**検証可能性**:
- TypeScriptリポジトリで最低5パターンのバグを検出できる
- Pythonリポジトリで最低3パターンのバグを検出できる
- エージェント出力を正しくパースできる（ユニットテスト）

---

### FR-3: 重複Issue検出機能

**優先度**: 高

**説明**: OpenAI API を使用して既存Issueとの重複を検出し、不要なIssue作成を防止する。

**詳細要件**:

#### FR-3.1: モジュール構成
- `src/core/issue-deduplicator.ts` を新規作成
- 以下のクラス/メソッドを実装:
  - `IssueDeduplicator` クラス
  - `filterDuplicates(candidates: BugCandidate[], existingIssues: Issue[]): Promise<BugCandidate[]>`
  - `calculateCosineSimilarity(text1: string, text2: string): number`
  - `checkDuplicateWithLLM(candidate: BugCandidate, issue: Issue): Promise<boolean>`

#### FR-3.2: 2段階フィルタリング
以下の2段階で重複を検出:

**第1段階: コサイン類似度**
- TF-IDFベクトル化 + コサイン類似度計算
- 閾値: `--similarity-threshold` オプション（デフォルト0.8）
- 高速な初期フィルタリング（APIコスト削減）

**第2段階: LLM判定**
- OpenAI API（`gpt-4o-mini`）を使用
- 意味的類似度の最終判定
- コサイン類似度 > 閾値 のペアのみ対象

#### FR-3.3: 重複判定ロジック
以下の比較を実施:

1. **タイトルの類似度**（重み: 0.4）
   - 例: "Fix memory leak in CodexAgentClient" vs "メモリリーク修正"

2. **本文の類似度**（重み: 0.6）
   - ファイルパス、行番号、詳細説明を総合的に比較

3. **LLMによる最終判定**
   - プロンプト: "以下の2つのIssueは重複していますか？YES/NO で回答してください。"
   - レスポンス解析: "YES" を含む場合は重複と判定

#### FR-3.4: 閾値調整
- `--similarity-threshold` オプションで閾値を調整可能（0.0〜1.0）
- デフォルト: 0.8（80%以上の類似度で重複と判定）

**検証可能性**:
- 同一内容のIssueペアで重複判定できる（ユニットテスト）
- 閾値0.9で厳格化、0.7で緩和されることを確認（ユニットテスト）
- False Positive/Negativeの発生率を計測（インテグレーションテスト）

---

### FR-4: Issue生成エンジン（基本版）

**優先度**: 高

**説明**: Claude Code / Codex エージェントを使用してIssue本文を生成し、GitHub APIでIssueを作成する。

**詳細要件**:

#### FR-4.1: モジュール構成
- `src/core/issue-generator.ts` を新規作成
- 以下のクラス/メソッドを実装:
  - `IssueGenerator` クラス
  - `generate(candidate: BugCandidate, agent: 'codex' | 'claude'): Promise<IssueCreationResult>`
  - `createIssueBody(candidate: BugCandidate, agentOutput: string): string`
  - `createIssueOnGitHub(title: string, body: string, labels: string[]): Promise<Issue>`

#### FR-4.2: エージェントによるIssue本文生成
エージェントに以下のフォーマットでIssue本文を生成させる:

```markdown
## 概要
（バグの概要を1〜2文で説明）

## 詳細
（バグの詳細な説明）

## 影響範囲
（このバグが与える影響）

## 修正案
（推奨される修正方法）

## 関連ファイル
- ファイルパス (行番号)
```

#### FR-4.3: GitHub API統合
- 既存の `GitHubClient` (IssueClient) を活用
- `octokit.issues.create()` でIssue作成
- ラベル自動付与:
  - `auto-generated`（自動生成されたIssue）
  - `bug`（バグ報告）

#### FR-4.4: dry-runモード
- `--dry-run` オプション使用時は以下の動作:
  1. エージェントによるIssue本文生成は実施
  2. GitHub APIへのIssue作成はスキップ
  3. 生成されたIssue候補をコンソールに表示
  4. ログに "DRY RUN MODE: Skipping issue creation" と記録

**検証可能性**:
- エージェントが5セクションすべてを含むMarkdownを生成できる（ユニットテスト）
- `--dry-run` でIssue作成がスキップされる（ユニットテスト）
- GitHub APIでIssueが正常に作成される（インテグレーションテスト）

---

### FR-5: 型定義

**優先度**: 高

**説明**: 各モジュールで使用する型定義を統一的に管理する。

**詳細要件**:

#### FR-5.1: ファイル構成
- `src/types/auto-issue.ts` を新規作成
- 以下の型定義を実装:

```typescript
// バグ候補
export interface BugCandidate {
  title: string;
  file: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestedFix: string;
  category: 'bug';  // Phase 1では固定
}

// CLIオプション
export interface AutoIssueOptions {
  category: 'bug' | 'refactor' | 'enhancement' | 'all';
  limit: number;
  dryRun: boolean;
  similarityThreshold: number;
  agent: 'auto' | 'codex' | 'claude';
}

// 重複検出結果
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarityScore: number;
  existingIssue?: Issue;
  reason: string;
}

// Issue作成結果
export interface IssueCreationResult {
  success: boolean;
  issueUrl?: string;
  issueNumber?: number;
  error?: string;
}
```

**検証可能性**:
- 型定義が各モジュールで正しくimportされる（コンパイルチェック）

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

**優先度**: 中

#### NFR-1.1: 実行時間
- **小規模リポジトリ**（100ファイル以下）: 5分以内
- **中規模リポジトリ**（100〜500ファイル）: 10分以内
- **大規模リポジトリ**（500ファイル以上）: 15分以内（Phase 1ではスコープ外）

#### NFR-1.2: タイムアウト設定
- エージェント実行: 最大5分でタイムアウト
- タイムアウト時は部分結果を返却

#### NFR-1.3: リトライ制御
- OpenAI API呼び出し: 最大3回までリトライ（指数バックオフ）
- エージェント実行: フォールバック機構（Codex → Claude）

**検証可能性**:
- テストリポジトリで実行時間を計測（インテグレーションテスト）
- タイムアウト発生時に適切なエラーメッセージを表示（ユニットテスト）

---

### NFR-2: セキュリティ要件

**優先度**: 高

#### NFR-2.1: シークレットマスキング
- ログ出力時にAPIキー、トークンをマスキング（既存の `SecretMasker` を活用）
- 環境変数の直接参照を避ける（既存の `config.ts` を活用）

#### NFR-2.2: APIキー管理
- `OPENAI_API_KEY`: 重複検出に使用
- `CODEX_API_KEY` / `CLAUDE_CODE_CREDENTIALS_PATH`: エージェント実行に使用
- 既存の環境変数管理パターンを踏襲

#### NFR-2.3: GitHub API レート制限
- レート制限検出: レスポンスヘッダー（`X-RateLimit-Remaining`）を監視
- レート制限時: 指数バックオフで再試行
- `--limit` オプションでIssue作成数を制限（デフォルト5件）

**検証可能性**:
- ログにシークレットが含まれないことを確認（ユニットテスト）
- レート制限発生時に適切なエラーメッセージを表示（インテグレーションテスト）

---

### NFR-3: 可用性・信頼性要件

**優先度**: 中

#### NFR-3.1: エラーハンドリング
- エージェント実行失敗時: フォールバック機構（Codex → Claude）
- OpenAI API失敗時: リトライ → フォールバック（重複検出スキップ）
- GitHub API失敗時: エラーログ記録 → 処理継続（他の候補は作成）

#### NFR-3.2: 部分的成功のサポート
- 10個のバグ候補のうち5個でIssue作成失敗 → 5個は成功として扱う
- 最終サマリーに成功/失敗の内訳を表示

**検証可能性**:
- エージェント失敗時にフォールバックが動作する（ユニットテスト）
- 部分的成功の結果が正しく表示される（インテグレーションテスト）

---

### NFR-4: 保守性・拡張性要件

**優先度**: 高

#### NFR-4.1: コードの再利用性
- 既存の `CodexAgentClient` / `ClaudeAgentClient` を活用
- 既存の `GitHubClient` (IssueClient) を活用
- 既存の `resolveAgentCredentials()` を活用

#### NFR-4.2: モジュール独立性
- 各モジュール（RepositoryAnalyzer, IssueDeduplicator, IssueGenerator）は独立してテスト可能
- 依存性注入パターンを使用（テストモック化が容易）

#### NFR-4.3: Phase 2への拡張性
- `--category refactor|enhancement` のサポート追加が容易
- 新しい言語（Go, Java, Rust）への対応が容易
- 新しいバグパターンの追加が容易

**検証可能性**:
- 各モジュールが独立してユニットテストできる
- Phase 2拡張時に既存コードの変更が最小限（設計レビュー）

---

## 4. 制約事項

### 4.1 技術的制約

#### TC-1: エージェント依存
- バグ検出・Issue本文生成はエージェント（Codex/Claude）に依存
- エージェントの出力品質によって検出精度が変動

#### TC-2: OpenAI API依存
- 重複検出機能はOpenAI API（`gpt-4o-mini`）に依存
- APIコストが発生（1回の実行で約$0.01〜$0.10）

#### TC-3: 既存パッケージ制約
- 新規依存パッケージの追加は最小限に
- 既存の `openai` パッケージ（v4.57.2）を活用

#### TC-4: Phase 1限定スコープ
- バグ検出のみ実装（refactor/enhancement検出は Phase 2へ）
- 対象言語: TypeScript, Python のみ（Go/Java/Rust等は Phase 2へ）

### 4.2 リソース制約

#### TC-5: 開発期間
- 総工数: 20〜28時間
- 実装期間: 約3〜5日

#### TC-6: APIコスト上限
- 環境変数 `MAX_OPENAI_COST_USD` で上限制御（Phase 2で実装予定）

### 4.3 ポリシー制約

#### TC-7: コーディング規約
- 既存のコーディング規約に従う（CLAUDE.md参照）
- 統一loggerモジュール（`src/utils/logger.ts`）を使用
- `process.env` への直接アクセス禁止（`config.ts` を使用）
- `as Error` 型アサーション禁止（`error-utils.ts` を使用）

#### TC-8: Git操作
- 各コミットは明確な目的を持つ
- コミットメッセージは `[ai-workflow] {purpose}` 形式

---

## 5. 前提条件

### 5.1 システム環境

- Node.js 20以上
- npm 10以上
- Git 2.30以上
- TypeScript 5.6以上

### 5.2 依存コンポーネント

#### 既存モジュール
- `src/core/codex-agent-client.ts`: Codexエージェント実行
- `src/core/claude-agent-client.ts`: Claudeエージェント実行
- `src/commands/execute/agent-setup.ts`: `resolveAgentCredentials()` を提供
- `src/core/github-client.ts`: GitHub API操作（IssueClient）
- `src/core/config.ts`: 環境変数管理
- `src/utils/logger.ts`: 統一ログモジュール
- `src/utils/error-utils.ts`: エラーハンドリング

#### 外部サービス
- OpenAI API: 重複検出に使用
- GitHub API: Issue作成・検索に使用
- Codex CLI: バグ検出に使用（オプション）
- Claude Code SDK: バグ検出に使用（オプション）

### 5.3 環境変数

#### 必須
- `GITHUB_TOKEN`: GitHub パーソナルアクセストークン（repo, workflow, read:org スコープ）
- `GITHUB_REPOSITORY`: `owner/repo` 形式

#### オプション（エージェント選択による）
- `CODEX_API_KEY` または `OPENAI_API_KEY`: Codex エージェント用
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude credentials.json へのパス

#### オプション（重複検出用）
- `OPENAI_API_KEY`: 重複検出用（Codexと共用可能）

---

## 6. 受け入れ基準

### AC-1: CLIコマンド動作

**Given**: リポジトリルートで `npm run build` が完了している
**When**: `node dist/index.js auto-issue --category bug --dry-run` を実行
**Then**: 以下が成立する:
- エラーなく実行完了
- バグ候補が1件以上表示される
- GitHub APIへのIssue作成はスキップされる
- ログに "DRY RUN MODE: Skipping issue creation" が記録される

---

### AC-2: エージェント選択

**Given**: 環境変数 `CODEX_API_KEY` が設定されている
**When**: 以下の3パターンで実行:
1. `--agent auto`
2. `--agent codex`
3. `--agent claude`

**Then**: 以下が成立する:
- `auto`: Codex使用 → 失敗時はClaude使用
- `codex`: Codex専用モード（Claude未使用）
- `claude`: Claude専用モード（Codex未使用）

---

### AC-3: バグ検出精度（TypeScript）

**Given**: テストリポジトリ（ai-workflow-agent）が存在する
**When**: `node dist/index.js auto-issue --category bug --dry-run` を実行
**Then**: 以下のバグパターンが最低5件検出される:
1. エラーハンドリング欠如（try-catchなし）
2. 型安全性問題（`any` の過度な使用）
3. リソースリーク（ファイルハンドルの未クローズ）
4. セキュリティ懸念（環境変数の直接参照）
5. コードの重複（DRY原則違反）

---

### AC-4: バグ検出精度（Python）

**Given**: Pythonリポジトリが存在する（別途用意）
**When**: `node dist/index.js auto-issue --category bug --dry-run` を実行
**Then**: 以下が成立する:
- バグ候補が最低3件検出される
- Pythonコードが正しく解析される
- エラーなく実行完了

---

### AC-5: 重複検出

**Given**: 既存Issue「Fix memory leak in CodexAgentClient」が存在する
**When**: バグ検出で「メモリリーク」が検出される
**Then**: 以下が成立する:
- 重複と判定される（`isDuplicate: true`）
- 類似度スコアが 0.8 以上
- `--dry-run` でスキップ理由が表示される（例: "Skipped (duplicate with #123)"）

---

### AC-6: 閾値調整

**Given**: 類似度0.85のIssueペアが存在する
**When**: 以下の2パターンで実行:
1. `--similarity-threshold 0.9`
2. `--similarity-threshold 0.7`

**Then**: 以下が成立する:
- 閾値0.9: 重複と判定されない（0.85 < 0.9）
- 閾値0.7: 重複と判定される（0.85 > 0.7）

---

### AC-7: Issue生成（本番実行）

**Given**: `--dry-run` オプションなし
**When**: `node dist/index.js auto-issue --category bug --limit 3` を実行
**Then**: 以下が成立する:
- 最大3件のIssueが作成される
- 各Issueに以下のラベルが付与される: `auto-generated`, `bug`
- 各Issueに5セクション（概要、詳細、影響範囲、修正案、関連ファイル）が含まれる
- コンソールに作成されたIssue URLが表示される

---

### AC-8: ユニットテスト

**Given**: テストコードが実装されている
**When**: `npm run test:unit` を実行
**Then**: 以下が成立する:
- `tests/unit/core/repository-analyzer.test.ts`: 合格
- `tests/unit/core/issue-deduplicator.test.ts`: 合格（類似度計算テスト含む）
- `tests/unit/core/issue-generator.test.ts`: 合格
- `tests/unit/commands/auto-issue.test.ts`: 合格
- カバレッジ: 80%以上

---

### AC-9: インテグレーションテスト

**Given**: インテグレーションテストが実装されている
**When**: `npm run test:integration` を実行
**Then**: 以下が成立する:
- `tests/integration/auto-issue-workflow.test.ts`: 合格
- エンドツーエンドワークフロー（コマンド実行 → Issue作成）が動作
- dry-runモードが期待通り動作
- エージェントフォールバック（Codex → Claude）が動作

---

### AC-10: ドキュメント

**Given**: CLAUDE.mdが存在する
**When**: CLAUDE.mdを確認
**Then**: 以下のセクションが追加されている:
- `## auto-issue コマンド`
- コマンドオプション一覧
- サンプルコマンド（dry-run含む）
- エージェント選択の説明

---

## 7. スコープ外

以下の機能はPhase 1ではスコープ外とし、Phase 2以降で対応します：

### 7.1 Phase 2への引き継ぎ事項

#### Refactor検出
- `--category refactor` オプション
- コードの重複検出（既存機能の改善提案）
- アーキテクチャ改善提案

#### Enhancement検出
- `--category enhancement` オプション
- 新機能追加の提案
- パフォーマンス最適化の提案

#### 言語拡張
- Go, Java, Rust, C++への対応
- 言語固有のバグパターン（例: Goのゴルーチンリーク）

#### 高度な重複検出
- Issue本文の意味的類似度（埋め込みベクトル活用）
- コメント履歴を考慮した重複判定

#### バッチ処理モード
- 複数リポジトリの一括スキャン
- スケジュール実行（cron統合）

### 7.2 Phase 1での学習項目

Phase 2の設計に活かすため、以下を記録します:

1. **エージェントプロンプトのベストプラクティス**
   - 精度が高かったプロンプトパターン
   - 失敗したプロンプトパターン

2. **重複検出の精度データ**
   - False Positive/Negative の発生率
   - 最適な閾値（`--similarity-threshold`）

3. **実行時間の計測データ**
   - リポジトリサイズ別の実行時間
   - エージェント別の性能比較（Codex vs Claude）

4. **ユーザーフィードバック**
   - dry-runモードでの使い勝手
   - 生成されたIssue品質の評価

---

## 8. 付録

### 8.1 データフロー図

```
User Input (CLI)
     ↓
handleAutoIssueCommand()
     ↓
├─ resolveAgentCredentials() → [Codex/Claude選択]
│
├─ RepositoryAnalyzer.analyze()
│   ├─ CodexAgentClient.executeTask() or ClaudeAgentClient.executeTask()
│   ├─ parseAgentOutput()
│   └─ BugCandidate[] → [バグ候補一覧]
│
├─ IssueDeduplicator.filterDuplicates()
│   ├─ GitHub API: issues.listForRepo()
│   ├─ calculateCosineSimilarity() → [初期フィルタリング]
│   ├─ OpenAI API: chat.completions.create() → [LLM判定]
│   └─ BugCandidate[] (filtered) → [重複除外済み]
│
└─ IssueGenerator.generate()
    ├─ CodexAgentClient.executeTask() or ClaudeAgentClient.executeTask()
    ├─ createIssueBody()
    ├─ GitHub API: issues.create() (dry-runでスキップ)
    └─ IssueCreationResult[] → [作成結果]
         ↓
Console Output (サマリー)
```

### 8.2 エージェントプロンプト例

#### バグ検出プロンプト（`src/prompts/auto-issue/detect-bugs.txt`）

```
あなたはコードレビューの専門家です。以下のリポジトリからバグや問題点を検出してください。

# 検出対象パターン
1. エラーハンドリングの欠如（try-catchなし、エラー無視）
2. 型安全性の問題（anyの過度な使用、型アサーションの乱用）
3. リソースリーク（unclosed streams、未解放リソース）
4. セキュリティ上の懸念（ハードコードされたシークレット、SQLインジェクション）
5. コードの重複（DRY原則違反）

# 出力フォーマット
各バグ候補をJSON形式で出力してください:
{
  "bugs": [
    {
      "title": "エラーハンドリングの欠如",
      "file": "src/core/codex-agent-client.ts",
      "line": 42,
      "severity": "high",
      "description": "executeTask()メソッドでエラーハンドリングが不足しています。",
      "suggestedFix": "try-catchブロックを追加してください。"
    }
  ]
}

# リポジトリパス
{repository_path}
```

#### Issue本文生成プロンプト（`src/prompts/auto-issue/generate-issue-body.txt`）

```
以下のバグ候補から、GitHub Issue本文を生成してください。

# バグ候補
{bug_candidate_json}

# Issue本文フォーマット
## 概要
（バグの概要を1-2文で説明）

## 詳細
（バグの詳細な説明）

## 影響範囲
（このバグが与える影響）

## 修正案
（推奨される修正方法）

## 関連ファイル
- ファイルパス (行番号)
```

### 8.3 期待される成果物

#### ソースコード
- `src/commands/auto-issue.ts`（約200行）
- `src/core/repository-analyzer.ts`（約250行）
- `src/core/issue-deduplicator.ts`（約200行）
- `src/core/issue-generator.ts`（約180行）
- `src/types/auto-issue.ts`（約100行）
- `src/main.ts`（約10行追加）

#### テストコード
- `tests/unit/core/repository-analyzer.test.ts`
- `tests/unit/core/issue-deduplicator.test.ts`
- `tests/unit/core/issue-generator.test.ts`
- `tests/unit/commands/auto-issue.test.ts`
- `tests/integration/auto-issue-workflow.test.ts`

#### ドキュメント
- `CLAUDE.md`（`## auto-issue コマンド` セクション追加）
- `README.md`（クイックスタート例追加）

#### プロンプトテンプレート
- `src/prompts/auto-issue/detect-bugs.txt`
- `src/prompts/auto-issue/generate-issue-body.txt`

---

## 9. 品質ゲート確認

### ✅ 機能要件が明確に記載されている
- FR-1〜FR-5で5つの主要機能を定義
- 各機能に詳細要件を記載（FR-1.1〜FR-5.1）

### ✅ 受け入れ基準が定義されている
- AC-1〜AC-10で10個の受け入れ基準を定義
- Given-When-Then形式で記述

### ✅ スコープが明確である
- Phase 1スコープ: バグ検出のみ（TypeScript, Python）
- Phase 2へ引き継ぎ: refactor/enhancement検出、言語拡張

### ✅ 論理的な矛盾がない
- Planning Documentとの整合性を確認
- 既存アーキテクチャとの互換性を検証

---

**承認日**: _________________
**承認者**: _________________

**次フェーズ**: Phase 2 (設計)
**担当者**: AI Workflow Agent
