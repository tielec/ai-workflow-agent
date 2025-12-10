# auto-issue コマンドでカテゴリに応じたエージェント優先順位の設定

## 概要

`auto-issue` コマンドは現在、`--agent auto` モードで常に Codex を優先し、Claude にフォールバックする動作となっています。しかし、バグ検出・リファクタリング機会検出・機能拡張提案といった分析・推論タスクでは、Claude の方が優れた結果を出すことが期待されます。

カテゴリ（`--category`）に応じてエージェントの優先順位を自動的に調整する機能を実装します。

## 背景

### 現在の動作

`agent-setup.ts` の `setupAgentClients()` 関数は、`--agent auto` モードで以下の優先順位を使用しています：

```typescript
case 'auto':
default: {
  // Auto モード: Codex を優先、Claude にフォールバック
  if (hasCodexCredentials) {
    codexClient = new CodexAgentClient({ workingDir, model: resolvedCodexModel });
  }

  if (hasClaudeCredentials) {
    if (!codexClient) {
      // Codex が利用不可の場合のみ Claude にフォールバック
      logger.info(`Codex agent unavailable (...). Using Claude Code (model=...).`);
    }
    claudeClient = new ClaudeAgentClient({ ... });
  }
  break;
}
```

**問題点**:
- Codex は具体的なコード生成（Implementation Phase 等）が得意だが、分析・推論タスクでは Claude に劣る
- バグ検出、リファクタリング機会検出、機能拡張提案は「コードの文脈理解」「潜在的な問題の推論」「創造的思考」が重要
- これらのタスクでは Claude の方が優れた結果を出すことが期待される

### エージェント特性の比較

| タスク | 適切なエージェント | 理由 |
|--------|------------------|------|
| **バグ検出** (`bug`) | **Claude 優先** | コードの文脈理解、潜在的な問題の推論が重要 |
| **リファクタリング検出** (`refactor`) | **Claude 優先** | コード品質の分析、アーキテクチャ理解が必要 |
| **機能拡張提案** (`enhancement`) | **Claude 優先** | 創造的思考、ユーザー体験の理解が必要（特に `--creative-mode` 使用時） |
| **実装タスク** (Implementation Phase 等) | **Codex 優先** | 具体的なコード生成が得意 |

### Issue #306 との関連

Issue #306 では、フェーズの特性に応じてエージェント優先順位を自動選択する機能が実装されました：

- `planning`, `requirements`, `design`, `test_scenario`, `documentation`, `report`, `evaluation` → `claude-first`
- `implementation`, `test_implementation`, `testing` → `codex-first`

同様のアプローチを `auto-issue` コマンドにも適用します。

## 目標

`auto-issue` コマンドで `--agent auto` モード使用時、カテゴリに応じてエージェントの優先順位を自動的に調整し、最適な結果を得る。

**重要**: フォールバック機構は維持し、優先エージェントが利用不可の場合は代替エージェントを使用する。

## 実装詳細

### 対象ファイル

1. `src/commands/execute/agent-setup.ts` - `agentPriority` パラメータを追加
2. `src/commands/auto-issue.ts` - カテゴリに応じた優先順位を設定

### カテゴリ別優先順位マッピング

```typescript
// src/commands/auto-issue.ts

/**
 * カテゴリに応じたエージェント優先順位
 */
const CATEGORY_AGENT_PRIORITY: Record<string, 'codex-first' | 'claude-first'> = {
  bug: 'claude-first',           // バグ検出は分析・推論が重要
  refactor: 'claude-first',      // リファクタリング機会検出は品質分析が重要
  enhancement: 'claude-first',   // 機能拡張提案は創造的思考が重要
  all: 'claude-first',           // 全カテゴリを含むため Claude 優先
};
```

### agent-setup.ts の拡張

```typescript
// src/commands/execute/agent-setup.ts

export interface AgentSetupOptions {
  /**
   * Claude モデル指定（エイリアスまたはフルモデルID）
   */
  claudeModel?: string;

  /**
   * Codex モデル指定（エイリアスまたはフルモデルID）
   */
  codexModel?: string;

  /**
   * エージェント優先順位（Issue #306, auto-issue 拡張）
   * - 'codex-first': Codex 優先、Claude フォールバック（デフォルト）
   * - 'claude-first': Claude 優先、Codex フォールバック
   */
  agentPriority?: 'codex-first' | 'claude-first';
}

export function setupAgentClients(
  agentMode: 'auto' | 'codex' | 'claude',
  workingDir: string,
  credentials: CredentialsResult,
  options: AgentSetupOptions = {},
): AgentSetupResult {
  const { codexApiKey, claudeCodeToken, claudeCredentialsPath } = credentials;
  let codexClient: CodexAgentClient | null = null;
  let claudeClient: ClaudeAgentClient | null = null;

  // Claude モデルの解決
  const claudeModelInput = options.claudeModel ?? config.getClaudeModel();
  const resolvedClaudeModel = resolveClaudeModel(claudeModelInput);

  // Codex モデルの解決
  const codexModelInput = options.codexModel ?? config.getCodexModel();
  const resolvedCodexModel = resolveCodexModel(codexModelInput);

  // 認証情報の可用性チェック
  const hasClaudeCredentials = !!(claudeCodeToken || claudeCredentialsPath);
  const { authFilePath: codexAuthFile } = detectCodexCliAuth();
  const hasCodexCredentials = isValidCodexApiKey(codexApiKey) || codexAuthFile !== null;

  switch (agentMode) {
    case 'codex': {
      // Codex 専用モード（変更なし）
      // ...existing code...
      break;
    }
    case 'claude': {
      // Claude 専用モード（変更なし）
      // ...existing code...
      break;
    }
    case 'auto':
    default: {
      const priority = options.agentPriority ?? 'codex-first';

      if (priority === 'claude-first') {
        // Claude を優先、Codex にフォールバック
        if (hasClaudeCredentials) {
          logger.info(`Claude Code agent enabled (auto mode, claude-first priority, model=${resolvedClaudeModel}).`);
          claudeClient = new ClaudeAgentClient({
            workingDir,
            credentialsPath: claudeCredentialsPath ?? undefined,
            model: resolvedClaudeModel,
          });
        }

        if (hasCodexCredentials) {
          if (!claudeClient) {
            logger.info(`Claude agent unavailable. Using Codex (model=${resolvedCodexModel}).`);
          } else {
            logger.info(`Codex credentials detected. Fallback available (model=${resolvedCodexModel}).`);
          }
          codexClient = new CodexAgentClient({ workingDir, model: resolvedCodexModel });
        } else if (!claudeClient) {
          logger.warn('Both Claude and Codex agents unavailable.');
        }
      } else {
        // 既存の Codex 優先ロジック（codex-first）
        if (hasCodexCredentials) {
          if (isValidCodexApiKey(codexApiKey)) {
            const trimmed = codexApiKey.trim();
            process.env.CODEX_API_KEY = trimmed;
            if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
              process.env.OPENAI_API_KEY = trimmed;
            }
            logger.info(`Codex API key detected. Codex agent enabled (model=${resolvedCodexModel}).`);
          } else {
            logger.info(`CODEX_AUTH_JSON detected. Codex agent enabled via Codex CLI credentials (model=${resolvedCodexModel}).`);
          }
          codexClient = new CodexAgentClient({ workingDir, model: resolvedCodexModel });
        }

        if (hasClaudeCredentials) {
          if (!codexClient) {
            logger.info(`Codex agent unavailable. Using Claude Code (model=${resolvedClaudeModel}).`);
          } else {
            logger.info(`Claude Code credentials detected. Fallback available (model=${resolvedClaudeModel}).`);
          }
          claudeClient = new ClaudeAgentClient({
            workingDir,
            credentialsPath: claudeCredentialsPath ?? undefined,
            model: resolvedClaudeModel,
          });
        }
      }
      break;
    }
  }

  return { codexClient, claudeClient };
}
```

### auto-issue.ts での使用

```typescript
// src/commands/auto-issue.ts

export async function handleAutoIssueCommand(rawOptions: RawAutoIssueOptions): Promise<void> {
  // ...existing code...

  // カテゴリに応じたエージェント優先順位を決定
  const agentPriority = CATEGORY_AGENT_PRIORITY[options.category] ?? 'codex-first';

  logger.debug(`Agent priority for category '${options.category}': ${agentPriority}`);

  // エージェントクライアントを初期化
  const { codexClient, claudeClient } = setupAgentClients(
    options.agent,
    repoPath,
    credentials,
    { agentPriority }, // 優先順位を渡す
  );

  // ...existing code...
}
```

## 動作仕様

### カテゴリ別の優先順位

| Category | `--agent auto` での優先順位 | 動作 |
|----------|---------------------------|------|
| `bug` | `claude-first` | Claude 優先 → Codex フォールバック |
| `refactor` | `claude-first` | Claude 優先 → Codex フォールバック |
| `enhancement` | `claude-first` | Claude 優先 → Codex フォールバック |
| `all` | `claude-first` | Claude 優先 → Codex フォールバック |

### 明示的な `--agent` 指定時

ユーザーが明示的に `--agent` オプションを指定した場合、その指定が優先されます：

```bash
# Codex のみ使用（フォールバックなし）
node dist/index.js auto-issue --category bug --agent codex

# Claude のみ使用（フォールバックなし）
node dist/index.js auto-issue --category bug --agent claude

# カテゴリに応じた優先順位でフォールバック（bug なら claude-first）
node dist/index.js auto-issue --category bug --agent auto
```

### フォールバック動作の保証

**重要**: フォールバック機構は常に維持されます。

#### ケース 1: Claude 優先、Codex フォールバック

```
Category: bug
Agent mode: auto
Priority: claude-first

1. Claude 認証情報チェック
   - ✅ 利用可能 → Claude を使用
   - ❌ 利用不可 → 次へ

2. Codex 認証情報チェック
   - ✅ 利用可能 → Codex にフォールバック
   - ❌ 利用不可 → エラー
```

#### ケース 2: Codex 優先、Claude フォールバック（従来動作）

```
Category: (未実装のカテゴリ)
Agent mode: auto
Priority: codex-first (デフォルト)

1. Codex 認証情報チェック
   - ✅ 利用可能 → Codex を使用
   - ❌ 利用不可 → 次へ

2. Claude 認証情報チェック
   - ✅ 利用可能 → Claude にフォールバック
   - ❌ 利用不可 → エラー
```

## 期待される効果

### 品質向上

- **バグ検出精度**: Claude の優れた文脈理解により、潜在的なバグをより正確に検出
- **リファクタリング提案**: コード品質の分析能力により、適切なリファクタリング機会を特定
- **機能拡張提案**: 創造的思考により、ユーザー体験を向上させる提案を生成

### コスト効率

- **Claude Sonnet の活用**: Codex より安価で、分析タスクでは十分な品質
- **適材適所**: 実装タスクは Codex、分析タスクは Claude と使い分け

### 後方互換性

- **既存動作の維持**: `--agent` オプション未指定時の動作は変更なし（カテゴリに応じた最適化のみ）
- **明示的指定の尊重**: ユーザーが `--agent codex` または `--agent claude` を指定した場合、その指定が優先される

## テスト計画

### ユニットテスト

1. **`agent-setup.ts` のテスト**:
   - `agentPriority: 'claude-first'` で Claude が優先されることを確認
   - Claude 利用不可時に Codex へフォールバックすることを確認
   - `agentPriority: 'codex-first'` で従来動作が維持されることを確認

2. **`auto-issue.ts` のテスト**:
   - 各カテゴリ（`bug`, `refactor`, `enhancement`, `all`）で正しい `agentPriority` が設定されることを確認

### 統合テスト

1. **Claude 優先シナリオ**:
   ```bash
   # bug カテゴリで Claude が優先されることを確認
   CLAUDE_CODE_OAUTH_TOKEN=xxx CODEX_API_KEY=yyy \
     node dist/index.js auto-issue --category bug --dry-run
   # ログで "Claude Code agent enabled (auto mode, claude-first priority)" を確認
   ```

2. **フォールバックシナリオ**:
   ```bash
   # Claude 未設定、Codex のみ設定
   CODEX_API_KEY=yyy \
     node dist/index.js auto-issue --category bug --dry-run
   # ログで "Claude agent unavailable. Using Codex" を確認
   ```

3. **明示的指定シナリオ**:
   ```bash
   # --agent codex 指定で Codex のみ使用
   CLAUDE_CODE_OAUTH_TOKEN=xxx CODEX_API_KEY=yyy \
     node dist/index.js auto-issue --category bug --agent codex --dry-run
   # ログで "Codex agent enabled (codex mode)" を確認
   ```

## 実装チェックリスト

- [ ] `src/commands/execute/agent-setup.ts` に `agentPriority` パラメータを追加
- [ ] `setupAgentClients()` 関数で `claude-first` 優先順位をサポート
- [ ] `src/commands/auto-issue.ts` に `CATEGORY_AGENT_PRIORITY` マッピングを追加
- [ ] `handleAutoIssueCommand()` で `agentPriority` を `setupAgentClients()` に渡す
- [ ] ユニットテスト追加（`agent-setup.test.ts`）
- [ ] ユニットテスト追加（`auto-issue.test.ts`）
- [ ] 統合テスト実施（3シナリオ）
- [ ] ドキュメント更新（CLAUDE.md、README.md）

## 関連Issue

- Issue #306: エージェント優先順位の自動選択（フェーズ別）
- Issue #126: 自動バグ検出＆Issue生成（Phase 1）
- Issue #127: 自動リファクタリング検出＆Issue生成（Phase 2）
- Issue #128: 自動機能拡張提案＆Issue生成（Phase 3）

## 後方互換性

### 影響なし

- **`--agent codex` 指定時**: Codex のみ使用（変更なし）
- **`--agent claude` 指定時**: Claude のみ使用（変更なし）
- **`--agent auto` 未指定時**: カテゴリに応じた最適化が適用されるが、フォールバック動作は維持

### 動作変更

- **`--agent auto` かつ `--category bug/refactor/enhancement/all`**: Claude が優先されるようになる（従来は Codex 優先）
- ただし、Claude 利用不可時は Codex へフォールバックするため、実用上の影響は最小限

## 成功基準

- ✅ `--category bug --agent auto` で Claude が優先的に使用される
- ✅ Claude 利用不可時に Codex へフォールバックする
- ✅ `--agent codex` 指定時は Codex のみ使用される（フォールバックなし）
- ✅ `--agent claude` 指定時は Claude のみ使用される（フォールバックなし）
- ✅ ユニットテストカバレッジ 80% 以上
- ✅ 統合テスト 3シナリオすべて成功
