# 開発者ガイド

このドキュメントでは、AI Workflow Agent の開発環境のセットアップ、ビルド、テスト方法について説明します。

## 目次

- [前提条件](#前提条件)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [ビルドとコマンド](#ビルドとコマンド)
- [テスト](#テスト)
- [コーディング規約](#コーディング規約)
- [デバッグ](#デバッグ)
- [コントリビューション](#コントリビューション)

## 前提条件

- **Node.js**: 20 以上
- **npm**: 10 以上
- **Git**: 最新版推奨
- **エディタ**: VS Code 推奨（TypeScript IntelliSense サポート）

## 開発環境のセットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/tielec/ai-workflow-agent.git
cd ai-workflow-agent
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

開発に必要な環境変数を設定します。詳細は [docs/ENVIRONMENT.md](./ENVIRONMENT.md) を参照してください。

```bash
# 必須
export GITHUB_TOKEN="ghp_..."
export GITHUB_REPOSITORY="tielec/ai-workflow-agent"

# エージェント認証（どちらか一方）
export CODEX_API_KEY="sk-..."
# または
export CLAUDE_CODE_OAUTH_TOKEN="sess..."

# オプション
export LOG_LEVEL="debug"  # 開発時は debug 推奨
export REPOS_ROOT="$HOME/projects"
```

### 4. ビルド

```bash
npm run build
```

## ビルドとコマンド

### 利用可能なnpmスクリプト

```bash
# TypeScript ソースのビルド（dist/ へコンパイルし、prompts/templates をコピー）
npm run build

# ウォッチモードで開発（ファイル変更を自動検出して再ビルド）
npm run dev

# テスト実行
npm test                    # すべてのテスト
npm run test:unit          # ユニットテストのみ
npm run test:integration   # 統合テストのみ
npm run test:coverage      # カバレッジレポート付き

# リント
npm run lint               # ESLint でコードチェック
npm run lint:fix           # ESLint で自動修正

# 型チェック
npm run type-check         # TypeScript 型チェック（コンパイルなし）
```

### ビルドの仕組み

1. **TypeScript コンパイル**: `src/` → `dist/`
2. **静的アセットコピー**: `scripts/copy-static-assets.mjs` により、以下がコピーされます
   - `src/prompts/` → `dist/prompts/`
   - `src/templates/` → `dist/templates/`

### ローカルでCLIを実行

```bash
# ビルド後に実行
node dist/index.js <command> [options]

# 例: ワークフロー初期化
node dist/index.js init --issue-url https://github.com/owner/repo/issues/123

# 例: フェーズ実行
node dist/index.js execute --issue 123 --phase planning
```

## テスト

### テスト構成

- **ユニットテスト**: `tests/unit/` - 個別モジュールの単体テスト
- **統合テスト**: `tests/integration/` - モジュール間の統合テスト
- **テストフレームワーク**: Jest with ES modules

### テスト実行

```bash
# すべてのテスト
npm test

# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# カバレッジレポート付き
npm run test:coverage

# 特定のテストファイルのみ実行
npm test -- tests/unit/core/metadata-manager.test.ts

# ウォッチモード（開発時に便利）
npm test -- --watch
```

### Jest設定（ESMパッケージ対応）

`jest.config.cjs` の `transformIgnorePatterns` で、ESMパッケージ（`chalk`, `strip-ansi`, `ansi-regex`, `#ansi-styles`）を変換対象に含める設定を追加しています：

```javascript
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
],
```

この設定により、統合テスト（`commit-manager.test.ts` 等）で chalk を使用するモジュールが正しく処理されます。

**主な変更履歴**:
- Issue #102: chalk、strip-ansi、ansi-regex を transformIgnorePatterns に追加
- Issue #105: chalk の内部依存（#ansi-styles）を transformIgnorePatterns に追加

**既知の制限**:
- chalk v5.3.0（ESM only）の内部依存である `#ansi-styles` は Node.js の subpath imports 機能を使用しています
- Jest の `transformIgnorePatterns` に `#ansi-styles` を追加しても、一部の環境では完全にESMエラーが解決されない場合があります
- 問題が継続する場合は、experimental-vm-modules の設定強化、または chalk v4.x（CommonJS版）への切り替えを検討してください

詳細は Issue #102、Issue #105 を参照してください。

### テストコード品質のベストプラクティス

#### TypeScript 5.x + Jest型定義の互換性

TypeScript 5.xの厳格な型チェックにより、`jest.fn().mockResolvedValue()`の型推論が正しく機能しない場合があります。

**解決策**:
- **解決策1**: 型パラメータを明示的に指定（`jest.fn<any>()`）
- **解決策2**: 型アサーションを`as any`に統一

**参考**: Issue #102、Issue #105、Issue #115

**型アノテーション例**:
```typescript
// ❌ 型推論エラーの例
mockGitHub = {
  getIssueInfo: jest.fn().mockResolvedValue({ number: 113 }),  // TS2352エラー
} as any;

// ✅ 型パラメータを明示的に指定
mockGitHub = {
  getIssueInfo: jest.fn<any>().mockResolvedValue({ number: 113 }),
} as any;

// ✅ mockResolvedValue()の戻り値に型アノテーション
jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

// ✅ mockImplementation()のパラメータ型をanyに
jest.spyOn(phase as any, 'revise').mockImplementation(async (feedback: any) => {
  return { success: true, output: 'planning.md' };
});
```

#### モック設定のベストプラクティス

過度に広範囲なモック設定は、意図しない影響を与える可能性があります。

**モック範囲を限定する戦略**:
1. 特定ファイルパスのみをモック
2. 必要最小限のメソッドのみをモック
3. モックを設定しない（実ファイルシステムアクセスを許可）

**モッククリーンアップの重要性**（Issue #115で強調）:

- **必須**: `afterEach()`で`jest.restoreAllMocks()`を呼び出し、テスト後に全モックをクリーンアップ
- **理由**: テスト間でモックが残留すると、意図しない副作用が発生する
- **例**: 前のテストの`jest.spyOn(fs, 'readFileSync')`が後続のテストに影響

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

**モック範囲を限定する例**（Issue #115のupdateFileSystemMock戦略）:
```typescript
/**
 * ファイルシステムモックを限定的に設定
 *
 * プロンプトファイル読み込み（loadPrompt）に影響を与えないよう、
 * 特定のファイルパスのみをモックする。
 */
function setupFileSystemMock(): void {
  // 空の関数 = モックを設定しない
  // 実ファイルシステムアクセスを許可し、loadPrompt()が正常に動作する
}
```

#### テストデータの充実

フェーズ固有のキーワード検証テストでは、適切なテストデータを用意する必要があります。

**Planning Phaseの例** (Issue #115):
- 日本語キーワード: 実装戦略、テスト戦略、タスク分割
- 英語キーワード: Implementation Strategy、Test Strategy、Task Breakdown
- 最小文字数: 100文字以上
- 最小セクション数: 2個以上の`##`ヘッダー

```typescript
// ✅ 適切なテストデータ
const content = `
# Planning Document

## Section 1: Implementation Strategy
This is a comprehensive analysis with detailed explanations.
実装戦略: EXTEND strategy will be used for this implementation.

## Section 2: Test Strategy
More detailed content with implementation strategy information.
テスト戦略: UNIT_INTEGRATION testing approach will be applied.

## Section 3: Task Breakdown
Additional sections with test strategy details.
タスク分割: Tasks are divided into multiple phases.
`;

// ❌ 不十分なテストデータ（キーワード欠落、短すぎる）
const content = `
# Planning Document

## Section 1
Short content.
`;
```

## コーディング規約

### 統一ロギング規約（Issue #61）

**必須**: console.log/error/warn等の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用してください。

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

### 環境変数アクセス規約（Issue #51）

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

### エラーハンドリング規約（Issue #48）

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

### セキュリティ: ReDoS攻撃の防止（Issue #140、Issue #161）

正規表現を動的に生成する場合、ユーザー入力やテンプレート変数をそのまま `new RegExp()` に渡すと ReDoS（Regular Expression Denial of Service）攻撃のリスクがあります。

**推奨される対策**:

- **文字列置換**: リテラル文字列の置換には `String.prototype.replaceAll()` を使用（Node.js 15.0.0以降）
- **エスケープ処理**: 正規表現が必須の場合は、ユーザー入力を適切にエスケープ（例: `escape-string-regexp` ライブラリ）
- **パフォーマンステスト**: 正規表現パターンに対してタイムアウトテストを実施（OWASP CWE-1333）

**実装完了**: `fillTemplate` メソッド（`src/core/claude-agent-client.ts` および `src/core/codex-agent-client.ts`）では、`new RegExp(\`{${key}}\`, 'g')` を `replaceAll(\`{${key}}\`, value)` に置換し、ReDoS脆弱性を完全に排除（99.997%のパフォーマンス改善を達成、Issue #161で修正完了）

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

## デバッグ

### ログレベル制御

開発時は `LOG_LEVEL=debug` を設定すると詳細なログが出力されます。

```bash
# デバッグログを有効化
export LOG_LEVEL=debug
node dist/index.js execute --issue 123 --phase planning
```

### エージェントログの確認

エージェント実行ログは `.ai-workflow/issue-<NUM>/<phase>/execute/agent_log.md` に保存されます。

```bash
# Planning フェーズのログを確認
cat .ai-workflow/issue-123/00_planning/execute/agent_log.md
```

### VS Code デバッガー設定

`.vscode/launch.json` を作成してデバッガーを使用できます。

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Execute Command",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/dist/index.js",
      "args": ["execute", "--issue", "123", "--phase", "planning"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "LOG_LEVEL": "debug",
        "GITHUB_TOKEN": "ghp_...",
        "CODEX_API_KEY": "sk-..."
      }
    }
  ]
}
```

## コントリビューション

### ブランチ戦略

- **main**: 本番リリースブランチ
- **develop**: 開発用ブランチ
- **feature/**: 機能追加ブランチ
- **fix/**: バグ修正ブランチ

### プルリクエストの作成

1. `develop` ブランチから新しいブランチを作成
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```

2. 変更を加えてコミット
   ```bash
   git add .
   git commit -m "Add my feature"
   ```

3. テストとリントを実行
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

4. プッシュしてPRを作成
   ```bash
   git push origin feature/my-feature
   ```

### コミットメッセージ規約

Conventional Commits 形式を推奨します。

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type**:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードフォーマット
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: ビルドプロセス、補助ツール変更

**例**:
```
feat(core): Add support for custom branch names

- Add --branch option to init command
- Validate branch names against Git naming rules
- Update documentation

Closes #123
```

### CI/CD

GitHub Actions により、以下が自動実行されます：

- **テスト**: すべてのテストが実行され、カバレッジレポートが生成されます
- **リント**: ESLint でコードスタイルをチェックします
- **型チェック**: TypeScript コンパイラで型エラーをチェックします
- **ビルド**: プロダクションビルドが成功することを確認します

PRをマージする前に、すべてのCIチェックが通過していることを確認してください。

## トラブルシューティング

### よくある問題

#### ビルドエラー: "Cannot find module"

**原因**: 依存関係が正しくインストールされていない

**解決策**:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### テストエラー: ESM関連エラー

**原因**: Jest の ESM サポート設定が不足している

**解決策**:
- `jest.config.cjs` の `transformIgnorePatterns` を確認
- `NODE_OPTIONS=--experimental-vm-modules` が設定されているか確認

#### エージェント認証エラー

**原因**: 環境変数が正しく設定されていない

**解決策**:
```bash
# Codex の場合
export CODEX_API_KEY="sk-..."

# Claude の場合
export CLAUDE_CODE_OAUTH_TOKEN="sess..."
# または
export CLAUDE_CODE_API_KEY="sk-ant-..."
```

詳細は [docs/ENVIRONMENT.md](./ENVIRONMENT.md) を参照してください。

## 参考リンク

- [README.md](../README.md) - プロジェクト概要
- [docs/CLI_REFERENCE.md](./CLI_REFERENCE.md) - CLI使用方法
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) - アーキテクチャ詳細
- [docs/ENVIRONMENT.md](./ENVIRONMENT.md) - 環境変数・認証設定
