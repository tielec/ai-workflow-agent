# CLAUDE.md

このファイルは、このリポジトリで作業する際に Claude Code (claude.ai/code) にガイダンスを提供します。

## 目次

- [プロジェクト概要](#プロジェクト概要)
- [クイックスタート](#クイックスタート)
- [アーキテクチャ概要](#アーキテクチャ概要)
- [コーディング規約](#コーディング規約)
- [重要な制約事項](#重要な制約事項)
- [ドキュメント索引](#ドキュメント索引)

## プロジェクト概要

TypeScript ベースの AI Workflow 自動化ツールキットで、デュアルエージェント（Codex + Claude）をサポートしています。GitHub Issue に対して planning から evaluation までの 10 フェーズのワークフローを実行し、マルチリポジトリワークフロー、Jenkins 統合、永続的なメタデータ管理をサポートします。

**主要機能**:
- **デュアルエージェント**: Codex（gpt-5.1-codex-max）と Claude（Opus 4.5）の自動フォールバック
- **10フェーズワークフロー**: Planning → Requirements → Design → Test Scenario → Implementation → Test Implementation → Testing → Documentation → Report → Evaluation
- **永続化メタデータ**: `.ai-workflow/issue-*/metadata.json` でワークフロー状態を管理
- **マルチリポジトリ対応**: Issue URL から対象リポジトリを自動判定（v0.2.0）
- **Jenkins統合**: Docker コンテナ内で TypeScript CLI を実行

**リポジトリ構成**:
```
ai-workflow-agent/
├── src/
│   ├── core/                  # エージェント・Git/GitHub ヘルパー・メタデータ管理
│   ├── phases/                # 各フェーズ実装（planning 〜 evaluation）
│   ├── prompts/               # フェーズ/コマンド別・言語別プロンプト（{phase|category}/{lang}/*.txt）
│   ├── templates/             # PR ボディなどのテンプレート（{lang}/pr_body*.md）
│   ├── main.ts                # CLI 定義
│   └── index.ts               # bin エントリ
├── tests/
│   ├── unit/                  # ユニットテスト
│   └── integration/           # 統合テスト
├── docs/                      # ドキュメント（詳細は下記参照）
└── dist/                      # ビルド成果物（npm run build 後に生成）
```

## クイックスタート

### ビルド & 開発コマンド

```bash
# 依存関係のインストール
npm install

# TypeScript ソースのビルド（dist/ へコンパイルし、prompts/templates をコピー）
npm run build

# ウォッチモードで開発
npm run dev

# テスト実行
npm test                    # すべてのテスト
npm run test:unit          # ユニットテストのみ
npm run test:integration   # 統合テストのみ
npm run test:coverage      # カバレッジレポート付き
```

### CLI の基本的な使用方法

```bash
# Issue に対してワークフローを初期化
node dist/index.js init --issue-url <GITHUB_ISSUE_URL>

# 全フェーズを実行
node dist/index.js execute --issue <NUM> --phase all

# 特定のフェーズを実行
node dist/index.js execute --issue <NUM> --phase <PHASE_NAME>
```

**詳細な CLI リファレンスは [docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md) を参照してください。**

## アーキテクチャ概要

### フェーズ実行フロー

1. **CLI エントリー**（`src/main.ts`）: コマンドルーティング → 各コマンドハンドラへ委譲
2. **Issue URL 解析**: GitHub URL から owner/repo/issue を抽出
3. **マルチリポジトリ解決**: `REPOS_ROOT` 環境変数を使用して対象リポジトリを特定
4. **メタデータ読み込み**: `.ai-workflow/issue-<NUM>/metadata.json` を読み込み
5. **フェーズ実行**: `BasePhase.run()` による順次実行:
   - `execute()`: エージェントで成果物を生成 + Git コミット & プッシュ
   - `review()`: 出力を検証（オプション） + Git コミット & プッシュ
   - `revise()`: 自動修正サイクル（最大 3 回まで） + Git コミット & プッシュ

### コアモジュール（抜粋）

**コマンド処理**:
- `src/main.ts`: CLI 定義とコマンドルーティング（118行）
- `src/commands/init.ts`: Issue初期化（ブランチ作成、メタデータ初期化、PR作成）
- `src/commands/execute.ts`: フェーズ実行ファサード（497行、Issue #46でリファクタリング）
- `src/commands/rollback.ts`: フェーズ差し戻し（手動/自動）

**フェーズライフサイクル**:
- `src/phases/base-phase.ts`: execute/review/revise ライフサイクルを持つ抽象基底クラス（476行）
- `src/phases/lifecycle/step-executor.ts`: ステップ実行ロジック（233行）
- `src/phases/lifecycle/phase-runner.ts`: フェーズライフサイクル管理（244行）

**エージェント統合**:
- `src/core/codex-agent-client.ts`: Codex CLI ラッパー（200行）
- `src/core/claude-agent-client.ts`: Claude Agent SDK ラッパー（206行）
- `src/phases/core/agent-executor.ts`: エージェント実行ロジック（270行）

**Git/GitHub統合**:
- `src/core/git-manager.ts`: Git操作のファサードクラス（181行）
- `src/core/github-client.ts`: GitHub Octokit ラッパー（402行）

**メタデータ管理**:
- `src/core/metadata-manager.ts`: `.ai-workflow/issue-*/metadata.json` に対する CRUD 操作（347行）

**詳細なアーキテクチャ情報は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。**

### プロンプト & テンプレート配置（多言語化）

- プロンプトはフェーズ/コマンド別に `src/prompts/{phase|category}/{lang}/*.txt`（`ja`/`en`）へ配置
- PR 本文テンプレートは `src/templates/{lang}/pr_body*_template.md` に分割
- `PromptLoader` が `config.getLanguage()` を参照し、指定言語が無い場合はデフォルト（`ja`）へフォールバック
- すべてのプロンプトには言語別の明示的な出力指示を含める（英語: `**IMPORTANT: Write all document content in English...**` / 日本語: `**重要: すべてのドキュメント内容を日本語で記述してください...**`）

## コーディング規約

### 1. 統一ロギング規約（Issue #61）

**必須**: `console.log`/`error`/`warn`等の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用してください。

```typescript
import { logger } from '@/utils/logger';

// ✅ 正しい使用方法
logger.debug('デバッグ情報', { metadata: 'value' });
logger.info('情報メッセージ');
logger.warn('警告メッセージ');
logger.error('エラーメッセージ', error);

// ❌ 禁止
console.log('情報メッセージ');  // ESLint no-console ルールでエラー
```

**ログレベル制御**:
- `LOG_LEVEL` 環境変数で制御（`debug` | `info` | `warn` | `error`、デフォルト: `info`）
- 開発時は `LOG_LEVEL=debug` を推奨

### 2. 環境変数アクセス規約（Issue #51）

**必須**: `process.env` への直接アクセスは禁止。Config クラス（`src/core/config.ts`）を使用してください。

```typescript
import { config } from '@/core/config';

// ✅ 正しい使用方法
const token = config.getGitHubToken();        // 必須環境変数（未設定時は例外）
const reposRoot = config.getReposRoot();      // オプション環境変数（未設定時は null）
const codexKey = config.getCodexApiKey();     // エージェント用
const openAiKey = config.getOpenAiApiKey();   // API用

// ❌ 禁止
const token = process.env.GITHUB_TOKEN;  // 直接アクセス禁止
```

**用途別の API キー分離**（Issue #188）:
- `CODEX_API_KEY`: Codex エージェント専用
- `OPENAI_API_KEY`: OpenAI API 専用（テキスト生成）
- `CLAUDE_CODE_OAUTH_TOKEN`: Claude Code エージェント（優先）
- `CLAUDE_CODE_API_KEY`: Claude Code エージェント（フォールバック）
- `ANTHROPIC_API_KEY`: Anthropic API 専用（テキスト生成）

### 3. エラーハンドリング規約（Issue #48）

**必須**: `as Error` 型アサーションの使用は禁止。エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）を使用してください。

```typescript
import { getErrorMessage, getErrorStack, isError } from '@/utils/error-utils';

// ✅ 正しい使用方法
try {
  // 処理
} catch (error: unknown) {
  const message = getErrorMessage(error);  // 安全にメッセージ取得
  const stack = getErrorStack(error);      // スタックトレース取得
  logger.error(message, { stack });

  if (isError(error)) {
    // Error オブジェクトの場合の処理
  }
}

// ❌ 禁止
catch (error) {
  const message = (error as Error).message;  // 型アサーション禁止
}
```

### 4. セキュリティ: ReDoS攻撃の防止（Issue #140、Issue #161）

正規表現を動的に生成する場合、ユーザー入力やテンプレート変数をそのまま `new RegExp()` に渡すと ReDoS（Regular Expression Denial of Service）攻撃のリスクがあります。

**推奨される対策**:
- **文字列置換**: リテラル文字列の置換には `String.prototype.replaceAll()` を使用（Node.js 15.0.0以降）
- **エスケープ処理**: 正規表現が必須の場合は、ユーザー入力を適切にエスケープ

```typescript
// ✅ 正しい使用方法
let result = template;
for (const [key, value] of Object.entries(context)) {
  result = result.replaceAll(`{${key}}`, value);
}

// ❌ ReDoS脆弱性のある例
for (const [key, value] of Object.entries(context)) {
  const regex = new RegExp(`{${key}}`, 'g');  // 危険
  result = result.replace(regex, value);
}
```

**実装完了**: `fillTemplate` メソッド（`src/core/claude-agent-client.ts` および `src/core/codex-agent-client.ts`）では、ReDoS脆弱性を完全に排除（99.997%のパフォーマンス改善を達成、Issue #161で修正完了）

### 5. テストコード品質のベストプラクティス（Issue #115）

#### TypeScript 5.x + Jest型定義の互換性

TypeScript 5.xの厳格な型チェックにより、`jest.fn().mockResolvedValue()`の型推論が正しく機能しない場合があります。

```typescript
// ✅ 型パラメータを明示的に指定
mockGitHub = {
  getIssueInfo: jest.fn<any>().mockResolvedValue({ number: 113 }),
} as any;

// ✅ mockResolvedValue()の戻り値に型アノテーション
jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([] as any[]);
```

#### モッククリーンアップの重要性

**必須**: `afterEach()`で`jest.restoreAllMocks()`を呼び出し、テスト後に全モックをクリーンアップしてください。

```typescript
describe('My Test Suite', () => {
  afterEach(() => {
    // ✅ 全モックをクリーンアップ
    jest.restoreAllMocks();

    // テストディレクトリのクリーンアップ
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
  });

  it('should handle file operations', () => {
    // テスト内でモックを作成
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // テスト処理...
  });
  // ✅ afterEach()で自動的にモックがクリーンアップされる
});
```

**テストの詳細は [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) を参照してください。**

## 重要な制約事項

1. **プロンプトは決定的**: `src/prompts/` 内のすべてのテンプレートはビルド時に `dist/` へコピーされる

2. **メタデータはバージョン管理対象**: `.ai-workflow/` はフィーチャーブランチにコミットされる

3. **PR の手動編集不可**: PR 本文は Report phase（Phase 8）で生成される

4. **フェーズ依存関係は厳格**（`--skip-dependency-check` または `--ignore-dependencies` を使用しない限り）

5. **Git 操作にはクリーンな作業ツリーが必要**（pull 時、未コミットの変更がある場合はスキップ）

6. **ファイル参照は `@relative/path` 形式を使用**（エージェントコンテキスト用、`getAgentFileReference()` 参照）

7. **Git URLのセキュリティ**: HTTPS形式のGit URLに埋め込まれたPersonal Access Tokenは自動的に除去される（v0.3.1、Issue #54）。SSH形式の利用を推奨。

8. **ロギング規約（Issue #61）**: console.log/error/warn等の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用する。

9. **環境変数アクセス規約（Issue #51）**: `process.env` への直接アクセスは禁止。Config クラス（`src/core/config.ts`）の `config.getXxx()` メソッドを使用する。

10. **エラーハンドリング規約（Issue #48）**: `as Error` 型アサーションの使用は禁止。エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）の `getErrorMessage()`, `getErrorStack()`, `isError()` を使用する。

11. **フォールバック機構の制約（Issue #113）**: フォールバック機構（`enableFallback: true`）が有効なフェーズでは、エージェントが成果物ファイルを生成しなくても、ログから自動抽出またはrevise呼び出しで復旧を試みる。ただし、以下の条件を満たす必要がある：
    - **ログ存在**: `agent_log.md` が存在すること
    - **コンテンツ長**: 抽出内容が100文字以上
    - **セクション数**: 2個以上のセクションヘッダー（`##`）を含む
    - **キーワード**: フェーズ固有キーワードが少なくとも1つ含まれる
    - **revise実装**: ログ抽出失敗時にreviseメソッドが実装されていること

12. **InstructionValidator の動作（Issue #655）**: エージェント優先順は `codex-agent (mini) → claude-agent (haiku) → OpenAI gpt-4o-mini → pattern` の順で検証し、使用した経路は `validationMethod` に記録される。`CODEX_API_KEY`、`CLAUDE_CODE_OAUTH_TOKEN`/`CLAUDE_CODE_API_KEY`、`OPENAI_API_KEY` のいずれかが設定されていれば LLM 検証を実行し、すべて無い場合はパターン検証のみ（警告付き続行）。

## 主要な設計パターン

### エージェントフォールバック戦略
1. プライマリエージェント（`--agent` フラグに基づいて Codex または Claude）
2. 認証エラーまたは空出力の場合: 代替エージェントにフォールバック
3. エージェント選択はコンソールとメタデータに記録

### エージェント優先順位の自動選択（Issue #306）

`--agent auto` モード実行時、フェーズの特性に応じてエージェントの優先順位が自動的に選択されます。

| フェーズ | 優先順位 | 理由 |
|---------|---------|------|
| planning / requirements / design / test_scenario / documentation / report / evaluation | claude-first | 戦略立案、情報整理、ドキュメント作成が得意 |
| implementation / test_implementation / testing | codex-first | 具体的なコード実装、テスト実行が得意 |

### モデル自動選択機能（Issue #363）

Issue の難易度に基づいて、各フェーズ・ステップで使用するモデルを自動的に最適化します。

```bash
# init 時に --auto-model-selection を指定
node dist/index.js init \
  --issue-url https://github.com/owner/repo/issues/123 \
  --auto-model-selection
```

#### Jenkins パラメータ: AUTO_MODEL_SELECTION（Issue #379）
- パラメータ名: `AUTO_MODEL_SELECTION`（自動モデル選択フラグ）。Jenkins ジョブのパラメータ/環境変数として利用。
- `AUTO_MODEL_SELECTION` デフォルト: **true**（標準設定）。
- true の挙動: 難易度分析を自動実行し、フェーズ難易度に応じてモデルを割り当てる（simple/moderate/complex のマッピングを使用）。
- false の挙動: 難易度分析を行わず、`AGENT_MODE` など手動で設定したモデル構成をそのまま使用。
- 参考: Issue #379（Jenkins 統合で AUTO_MODEL_SELECTION を明示）

**難易度別モデルマッピング**:
- `simple`: 全フェーズで execute/review/revise ともに Sonnet/Mini
- `moderate`: planning/requirements/design/test_scenario/evaluation は Opus/Max、implementation/test_implementation/testing は execute=Opus/Max, revise=Opus/Max
- `complex`: 全フェーズで execute/revise が Opus/Max

**重要**: `review` ステップは難易度に関係なく常に軽量モデルを使用（コスト最適化）。

### 自動リトライ付きレビューサイクル
1. フェーズを実行 → 2. 出力をレビュー → 3. 失敗した場合: 修正（最大 3 回まで）→ 4. レビューを繰り返し

### 再開機能
- `ResumeManager`（`src/utils/resume.ts`）が不完全/失敗したフェーズを検出
- `--phase all` で最後の失敗から継続

## ドキュメント索引

### ユーザー向けドキュメント

- **[README.md](./README.md)** - プロジェクト概要、クイックスタート、主要機能
- **[docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md)** - CLIコマンドの詳細、オプション、使用例
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - アーキテクチャ詳細、モジュール構成、データフロー
- **[docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md)** - 環境変数一覧、認証設定、Jenkins統合
- **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)** - 開発環境セットアップ、ビルド方法、テスト実行

### その他のドキュメント

- **DOCKER_AUTH_SETUP.md** - Codex/Claude 認証のセットアップ
- **SETUP_TYPESCRIPT.md** - ローカル開発環境のセットアップ手順
- **TROUBLESHOOTING.md** - よくある問題と解決方法
- **ROADMAP.md** - 今後の機能計画

### Quick Links

| タスク | ドキュメント |
|-------|-------------|
| CLI コマンドを調べる | [docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md) |
| 環境変数を設定する | [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) |
| 開発環境をセットアップする | [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) |
| アーキテクチャを理解する | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| テストを書く | [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md#テスト) |
| コーディング規約を確認する | このドキュメント（[コーディング規約](#コーディング規約)） |
| Jenkins で実行する | [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#jenkins統合) |
| トラブルシューティング | TROUBLESHOOTING.md, [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#トラブルシューティング) |

---

**重要**: Claude Code で開発する際は、このドキュメントのコーディング規約と制約事項を厳守してください。詳細な情報が必要な場合は、上記のドキュメント索引から適切なドキュメントを参照してください。
