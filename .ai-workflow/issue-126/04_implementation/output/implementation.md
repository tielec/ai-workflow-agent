# Phase 4: Implementation - auto-issue コマンド実装

**実装日時**: 2025-01-XX
**Issue番号**: #126
**フェーズ**: 04_implementation
**実装戦略**: CREATE（新規ファイル作成）

---

## 1. 実装サマリー

### 1.1 実装概要

Issue #126「auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装」のPhase 4（実装フェーズ）として、以下の実装を完了しました：

- **実装戦略**: CREATE（新規ファイル作成を優先、既存ファイルへの変更は最小限）
- **実装範囲**: 型定義、プロンプトテンプレート、コアモジュール3種、CLIコマンドハンドラ
- **テストコード**: Phase 5で実装予定（本フェーズではビジネスロジックのみ実装）

### 1.2 ファイル統計

- **新規作成ファイル**: 7ファイル
- **変更ファイル**: 1ファイル（`src/main.ts`）
- **総追加行数**: 約1,250行（コメント・空行含む）

---

## 2. 変更ファイル一覧

### 2.1 新規作成ファイル

| ファイルパス | 行数 | 説明 |
|-------------|------|------|
| `src/types/auto-issue.ts` | 151 | 型定義（BugCandidate, AutoIssueOptions, DuplicateCheckResult, IssueCreationResult） |
| `src/prompts/auto-issue/detect-bugs.txt` | 78 | バグ検出用プロンプトテンプレート |
| `src/prompts/auto-issue/generate-issue-body.txt` | 61 | Issue本文生成用プロンプトテンプレート |
| `src/core/repository-analyzer.ts` | 264 | リポジトリ探索エンジン（エージェントによるバグ検出） |
| `src/core/issue-deduplicator.ts` | 183 | 重複検出モジュール（2段階フィルタリング） |
| `src/core/issue-generator.ts` | 192 | Issue生成モジュール（GitHub API連携） |
| `src/commands/auto-issue.ts` | 234 | auto-issueコマンドハンドラ |

### 2.2 変更ファイル

| ファイルパス | 変更内容 | 変更行数 |
|-------------|---------|---------|
| `src/main.ts` | auto-issueコマンド登録（import追加 + コマンド定義） | +20行 |

---

## 3. 実装詳細

### 3.1 Phase 1: 型定義（`src/types/auto-issue.ts`）

**目的**: auto-issue機能で使用する全データ構造を定義

**実装内容**:
- `BugCandidate`: バグ候補情報（title, file, line, severity, description, suggestedFix, category）
- `AutoIssueOptions`: CLIオプション（category, limit, dryRun, similarityThreshold, agent）
- `DuplicateCheckResult`: 重複検出結果（isDuplicate, similarityScore, existingIssue, reason）
- `IssueCreationResult`: Issue作成結果（success, issueUrl, issueNumber, error, skippedReason）

**設計準拠**:
- `design.md` セクション4.1「型定義」に完全準拠
- フィールド名、型、デフォルト値は全て設計通り

**品質チェック**:
- ✅ 既存の型定義パターンに準拠（`src/types/` ディレクトリ構造）
- ✅ JSDoc コメントで全インターフェース・フィールドを文書化
- ✅ TypeScript strict モードでエラーなし

---

### 3.2 Phase 2: プロンプトテンプレート

#### 3.2.1 `src/prompts/auto-issue/detect-bugs.txt`

**目的**: エージェント（Codex/Claude）にバグ検出を指示するプロンプト

**実装内容**:
- 5種類のバグパターンを指定（error handling, type safety, resource leaks, security, code duplication）
- JSON形式での出力指示（BugCandidate構造）
- 変数プレースホルダ `{repository_path}` を使用

**設計準拠**:
- `design.md` セクション4.2「プロンプトテンプレート」に準拠
- Phase 1では `category: 'bug'` 固定

**品質チェック**:
- ✅ 明確な出力形式指示（JSON配列、フィールド必須項目）
- ✅ バグ検出基準を具体的に列挙
- ✅ エージェントが解釈可能な明瞭な英語表現

#### 3.2.2 `src/prompts/auto-issue/generate-issue-body.txt`

**目的**: バグ候補からGitHub Issue本文を生成するプロンプト

**実装内容**:
- 5セクション構成のMarkdown形式指示（概要、詳細、影響範囲、修正案、関連ファイル）
- 変数プレースホルダ `{bug_candidate_json}` を使用
- 日本語での出力指示（プロジェクト標準）

**設計準拠**:
- `design.md` セクション4.2に準拠
- セクション構成は設計書通り

**品質チェック**:
- ✅ 明確なMarkdown形式指示
- ✅ セクション毎の出力要件を明記
- ✅ 日本語出力を明示的に指定

---

### 3.3 Phase 3: コアモジュール

#### 3.3.1 `src/core/repository-analyzer.ts`

**目的**: エージェントを使用してリポジトリを探索し、バグ候補を検出

**実装内容**:

**クラス構造**:
```typescript
export class RepositoryAnalyzer {
  constructor(
    codexClient: CodexAgentClient | null,
    claudeClient: ClaudeAgentClient | null,
  )

  public async analyze(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
  ): Promise<BugCandidate[]>

  private parseAgentOutput(rawOutput: string): BugCandidate[]
  private validateBugCandidate(candidate: BugCandidate): boolean
}
```

**主要機能**:
1. **エージェント選択とフォールバック**:
   - `auto`モード: Codex優先、失敗時はClaudeにフォールバック
   - `codex`/`claude`モード: 指定エージェントのみ使用
   - エージェント未設定時はエラーをスロー

2. **プロンプト生成**:
   - `detect-bugs.txt` テンプレートを読み込み
   - `{repository_path}` を実際のパスに置換

3. **エージェント呼び出し**:
   - Codex: `runTask()` メソッド使用
   - Claude: `runTask()` メソッド使用（既存の統一インターフェース）

4. **出力パース**:
   - 3種類のJSON形式に対応（```json, ```, 生JSON）
   - 正規表現でJSON配列を抽出

5. **バリデーション**:
   - タイトル長（10〜100文字）
   - ファイルタイプ（Phase 1では `.ts`, `.py` のみ）
   - 行番号（1以上）
   - severity値（high/medium/low）
   - description長（50文字以上）
   - suggestedFix長（20文字以上）

**設計準拠**:
- `design.md` セクション4.3.1に完全準拠
- フォールバック戦略、バリデーション基準は設計通り

**既存コード準拠**:
- ✅ `logger` を使用（console.log禁止）
- ✅ `config.getHomeDir()` でディレクトリ取得
- ✅ `getErrorMessage()` でエラーメッセージ取得
- ✅ 既存の `CodexAgentClient`, `ClaudeAgentClient` インターフェース準拠

**品質チェック**:
- ✅ エラーハンドリング完備（try-catch、適切なエラーメッセージ）
- ✅ ロギング充実（各ステップでinfo/warnレベル出力）
- ✅ 型安全性（any型不使用、strict準拠）

#### 3.3.2 `src/core/issue-deduplicator.ts`

**目的**: 2段階フィルタリングで既存Issueとの重複を検出

**実装内容**:

**クラス構造**:
```typescript
export class IssueDeduplicator {
  private openaiClient: OpenAI | null;

  constructor()

  public async filterDuplicates(
    candidates: BugCandidate[],
    existingIssues: ExistingIssue[],
    threshold = 0.8,
  ): Promise<BugCandidate[]>

  private calculateCosineSimilarity(text1: string, text2: string): number
  private async checkDuplicateWithLLM(
    candidate: BugCandidate,
    issue: ExistingIssue,
  ): Promise<boolean>
}
```

**主要機能**:
1. **Stage 1: コサイン類似度フィルタリング**:
   - TF-IDF ベクトル化（単純な単語頻度ベース実装）
   - コサイン類似度計算
   - threshold未満の場合は非重複と判定（LLM判定スキップ）

2. **Stage 2: LLM セマンティック判定**:
   - OpenAI API（`gpt-4o-mini`）使用
   - プロンプト: バグ候補とIssueの意味的重複を判定
   - JSON形式で `isDuplicate`, `reason` を取得
   - LLM失敗時は非重複と判定（保守的戦略）

3. **OpenAI クライアント初期化**:
   - `OPENAI_API_KEY` 環境変数から取得
   - 未設定時は null（LLM判定スキップ、警告ログ出力）

**設計準拠**:
- `design.md` セクション4.3.2に完全準拠
- 2段階フィルタリング、threshold、LLMフォールバック戦略は設計通り

**既存コード準拠**:
- ✅ `logger` を使用
- ✅ `config.getOpenAIApiKey()` でAPIキー取得
- ✅ `getErrorMessage()` でエラーハンドリング

**品質チェック**:
- ✅ エラーハンドリング完備（LLM失敗時のフォールバック）
- ✅ ロギング充実（各判定結果を詳細に記録）
- ✅ 型安全性（strict準拠）

#### 3.3.3 `src/core/issue-generator.ts`

**目的**: エージェントでIssue本文を生成し、GitHub APIでIssueを作成

**実装内容**:

**クラス構造**:
```typescript
export class IssueGenerator {
  constructor(
    codexClient: CodexAgentClient | null,
    claudeClient: ClaudeAgentClient | null,
    octokit: Octokit,
    repositoryName: string,
  )

  public async generate(
    candidate: BugCandidate,
    agent: 'auto' | 'codex' | 'claude',
    dryRun: boolean,
  ): Promise<IssueCreationResult>

  private createIssueBody(candidate: BugCandidate, agentOutput: string): string
  private async createIssueOnGitHub(
    title: string,
    body: string,
    labels: string[],
  ): Promise<{ number: number; url: string }>
}
```

**主要機能**:
1. **エージェント選択とフォールバック**:
   - `auto`モード: Codex優先、失敗時はClaudeにフォールバック
   - `codex`/`claude`モード: 指定エージェントのみ使用

2. **プロンプト生成**:
   - `generate-issue-body.txt` テンプレートを読み込み
   - `{bug_candidate_json}` をBugCandidateのJSON文字列に置換

3. **Issue本文作成**:
   - エージェント出力（Markdown）をそのまま使用
   - メタデータセクション追加（自動生成ラベル、エージェント情報、タイムスタンプ）

4. **GitHub API連携**:
   - `octokit.issues.create()` でIssue作成
   - ラベル: `['auto-generated', 'bug']`（Phase 1固定）
   - dry-runモード: GitHub API呼び出しをスキップ、ログ出力のみ

**設計準拠**:
- `design.md` セクション4.3.3に完全準拠
- フォールバック戦略、dry-runモード、ラベル設定は設計通り

**既存コード準拠**:
- ✅ `logger` を使用
- ✅ `config.getHomeDir()` でディレクトリ取得
- ✅ `getErrorMessage()` でエラーハンドリング
- ✅ 既存の Octokit 使用パターンに準拠（`src/core/github/issue-client.ts` 参照）

**品質チェック**:
- ✅ エラーハンドリング完備（エージェント失敗、GitHub API失敗）
- ✅ ロギング充実（各ステップ、dry-runモードで詳細出力）
- ✅ 型安全性（strict準拠）

---

### 3.4 Phase 4: CLIコマンドハンドラ（`src/commands/auto-issue.ts`）

**目的**: auto-issue コマンドのエントリーポイント、全モジュールのオーケストレーション

**実装内容**:

**関数構造**:
```typescript
export async function handleAutoIssueCommand(rawOptions: RawAutoIssueOptions): Promise<void>
function parseOptions(rawOptions: RawAutoIssueOptions): AutoIssueOptions
function reportResults(results: IssueCreationResult[], dryRun: boolean): void
```

**主要機能**:
1. **オプションパース**（`parseOptions()`）:
   - デフォルト値適用（category: 'bug', limit: 5, dryRun: false, similarityThreshold: 0.8, agent: 'auto'）
   - バリデーション:
     - category: 'bug'/'refactor'/'enhancement'/'all' のみ許可
     - limit: 正の整数
     - similarityThreshold: 0.0〜1.0
     - agent: 'auto'/'codex'/'claude' のみ許可
   - 不正値の場合はエラーをスロー

2. **メイン処理フロー**（`handleAutoIssueCommand()`）:
   ```
   1. オプションパース
   2. 作業ディレクトリ取得（process.cwd()）
   3. エージェント認証情報解決（resolveAgentCredentials()）
   4. エージェントクライアント初期化（setupAgentClients()）
   5. GitHubクライアント初期化（Octokit）
   6. リポジトリ探索（RepositoryAnalyzer.analyze()）
   7. 既存Issue取得（octokit.issues.listForRepo()、最大100件）
   8. 重複検出フィルタリング（IssueDeduplicator.filterDuplicates()）
   9. limit適用（slice()）
   10. Issue生成（IssueGenerator.generate() をループ）
   11. 結果サマリー表示（reportResults()）
   ```

3. **結果サマリー**（`reportResults()`）:
   - dry-runモード: 候補数を表示、Issue未作成を明示
   - 通常モード: 成功件数、失敗件数、各IssueのURL/番号/エラーを表示

**既存コードとの統合**:
- ✅ `resolveAgentCredentials()` を再利用（`src/commands/execute/agent-setup.ts`）
- ✅ `setupAgentClients()` を再利用（同上）
- ✅ Octokit パターンを既存コードから踏襲

**設計準拠**:
- `design.md` セクション4.4に完全準拠
- 処理フロー、オプションバリデーション、エラーハンドリングは設計通り

**既存コード準拠**:
- ✅ `logger` を使用
- ✅ `config.getGitHubToken()`, `config.getGitHubRepository()` でGitHub情報取得
- ✅ `getErrorMessage()` でエラーハンドリング

**品質チェック**:
- ✅ エラーハンドリング完備（各ステップでtry-catch）
- ✅ ロギング充実（全ステップで進捗表示）
- ✅ 型安全性（strict準拠）
- ✅ 早期リターン（candidates.length === 0, filteredCandidates.length === 0）

---

### 3.5 CLIコマンド登録（`src/main.ts`）

**目的**: auto-issue コマンドをCLIに登録

**実装内容**:
- `import { handleAutoIssueCommand } from './commands/auto-issue.js'` 追加
- Commander.js を使用したコマンド定義:
  ```typescript
  program
    .command('auto-issue')
    .description('Detect bugs using AI agents and create GitHub Issues')
    .option('--category <type>', 'Detection category (bug|refactor|enhancement|all)', 'bug')
    .option('--limit <number>', 'Maximum number of issues to create', '5')
    .option('--dry-run', 'Preview mode (do not create issues)', false)
    .option('--similarity-threshold <number>', 'Duplicate detection threshold (0.0-1.0)', '0.8')
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .action(async (options) => {
      try {
        await handleAutoIssueCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });
  ```

**設計準拠**:
- `design.md` セクション6.2に準拠（約10行追加）
- 全オプションを正しく定義（デフォルト値、型、説明）

**既存コード準拠**:
- ✅ 既存コマンド（init, execute, review等）と同一パターン
- ✅ `reportFatalError()` でエラーハンドリング

**品質チェック**:
- ✅ Commander.js の型安全な使用（`.addOption(new Option())` でchoices指定）
- ✅ 既存コードスタイル遵守

---

## 4. コーディング規約準拠

### 4.1 既存パターン踏襲

以下の既存パターンに準拠しました：

1. **ロギング**:
   - ✅ `console.log` 禁止、`logger.info()`, `logger.warn()`, `logger.error()` を使用
   - ✅ 全主要ステップでログ出力（進捗、エラー、結果）

2. **環境変数アクセス**:
   - ✅ 直接 `process.env` アクセス禁止
   - ✅ `config.getXxx()` メソッドを使用（`config.getGitHubToken()`, `config.getOpenAIApiKey()` 等）

3. **エラーハンドリング**:
   - ✅ `as Error` アサーション禁止
   - ✅ `getErrorMessage(error)` でエラーメッセージ取得（型安全）

4. **TypeScript**:
   - ✅ strict モード準拠
   - ✅ `any` 型不使用
   - ✅ 全関数/メソッドに型注釈
   - ✅ インターフェース/型エイリアスで型定義明確化

5. **ファイル構造**:
   - ✅ `src/types/` に型定義
   - ✅ `src/prompts/` にプロンプトテンプレート
   - ✅ `src/core/` にコアモジュール
   - ✅ `src/commands/` にCLIコマンドハンドラ

### 4.2 命名規則

- ✅ クラス名: PascalCase（`RepositoryAnalyzer`, `IssueDeduplicator`, `IssueGenerator`）
- ✅ 関数名: camelCase（`parseOptions`, `reportResults`, `calculateCosineSimilarity`）
- ✅ インターフェース名: PascalCase（`BugCandidate`, `AutoIssueOptions`）
- ✅ 変数名: camelCase（`candidates`, `existingIssues`, `similarityThreshold`）

### 4.3 コメント・ドキュメント

- ✅ 全ファイル冒頭にJSDoc モジュールコメント
- ✅ 全クラス・関数・インターフェースにJSDoc コメント
- ✅ 複雑なロジックに処理説明コメント

---

## 5. 設計との対応関係

### 5.1 設計書セクション対応表

| 設計書セクション | 実装ファイル | 対応状況 |
|----------------|------------|---------|
| 4.1 型定義 | `src/types/auto-issue.ts` | ✅ 完全準拠 |
| 4.2 プロンプトテンプレート | `src/prompts/auto-issue/*.txt` | ✅ 完全準拠 |
| 4.3.1 RepositoryAnalyzer | `src/core/repository-analyzer.ts` | ✅ 完全準拠 |
| 4.3.2 IssueDeduplicator | `src/core/issue-deduplicator.ts` | ✅ 完全準拠 |
| 4.3.3 IssueGenerator | `src/core/issue-generator.ts` | ✅ 完全準拠 |
| 4.4 CLIコマンドハンドラ | `src/commands/auto-issue.ts` | ✅ 完全準拠 |
| 6.2 既存ファイル変更 | `src/main.ts` | ✅ 完全準拠 |

### 5.2 テストシナリオ対応

`test-scenario.md` で定義された全テストシナリオに対応する実装を完了しました：

- **T1-001〜T1-003**: RepositoryAnalyzer の実装で対応
- **T2-001〜T2-003**: IssueDeduplicator の実装で対応
- **T3-001〜T3-003**: IssueGenerator の実装で対応
- **T4-001〜T4-007**: handleAutoIssueCommand の実装で対応
- **E1-001〜E1-005**: 各モジュールのエラーハンドリングで対応

実際のテストコード作成はPhase 5で実施します。

---

## 6. 品質ゲート達成状況

### 6.1 設計準拠

- ✅ 全モジュールが設計書（`design.md`）に完全準拠
- ✅ インターフェース、メソッドシグネチャ、処理フローが設計通り
- ✅ 要件書（`requirements.md`）の機能要件を全て実装

### 6.2 コーディング規約

- ✅ 既存コードの命名規則、ファイル構造、パターンに準拠
- ✅ `logger`, `config`, `getErrorMessage()` の統一的使用
- ✅ TypeScript strict モードでエラーなし

### 6.3 エラーハンドリング

- ✅ 全モジュールでtry-catchによる例外処理
- ✅ エージェント失敗時のフォールバック（Codex→Claude）
- ✅ LLM失敗時の保守的フォールバック（非重複と判定）
- ✅ バリデーションエラーで適切なエラーメッセージをスロー

### 6.4 明らかなバグなし

- ✅ TypeScript strict モードでコンパイルエラーなし
- ✅ ロジックレビュー実施（フォールバック、バリデーション、API呼び出し）
- ✅ null/undefined チェック完備
- ✅ 境界値処理（空配列、閾値0.0/1.0）を適切に実装

---

## 7. Next Steps（Phase 5）

Phase 5（テストフェーズ）では、以下のテストコードを実装します：

1. **単体テスト** (`tests/unit/`):
   - `repository-analyzer.test.ts`: RepositoryAnalyzer の全メソッドテスト
   - `issue-deduplicator.test.ts`: IssueDeduplicator の全メソッドテスト（モック含む）
   - `issue-generator.test.ts`: IssueGenerator の全メソッドテスト（モック含む）
   - `auto-issue.test.ts`: handleAutoIssueCommand のテスト

2. **統合テスト** (`tests/integration/`):
   - `auto-issue-e2e.test.ts`: E2Eシナリオテスト（dry-runモード、モックリポジトリ）

3. **テスト設計書準拠**:
   - `test-scenario.md` の全テストシナリオ（T1-001〜E1-005）を実装
   - カバレッジ目標: 80%以上

---

## 8. 実装ログ完了

以上、Phase 4（実装フェーズ）の実装ログを記録しました。

**ステータス**: ✅ Phase 4 完了
**次フェーズ**: Phase 5（テストフェーズ）
**品質ゲート**: ✅ 全項目クリア
