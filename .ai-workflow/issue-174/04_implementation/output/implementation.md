# 実装ログ - Issue #174

## 実装概要

Issue #174「FOLLOW-UP Issue生成をエージェントベースに拡張する」の実装フェーズを完了しました。

本実装では、**EXTEND戦略**に基づき、既存の`IssueClient`を拡張し、エージェント（Codex/Claude）を使用してFOLLOW-UP Issueを生成する機能を追加しました。

## 実装戦略

- **戦略**: EXTEND（既存システムの拡張）
- **対象**: `IssueClient`、`GitHubClient`、`execute.ts`、型定義
- **新規クラス**: `IssueAgentGenerator`
- **新規ファイル**: プロンプトテンプレート `src/prompts/followup/generate-followup-issue.txt`

## 実装内容

### 1. プロンプトテンプレート作成

**ファイル**: `src/prompts/followup/generate-followup-issue.txt`

エージェント向けのプロンプトテンプレートを作成しました。以下の変数置換をサポート：

- `{remaining_tasks_json}`: 残タスクのJSON配列
- `{issue_context_json}`: Issue背景コンテキストのJSON
- `{evaluation_report_path}`: 評価レポートファイルパス（`@`プレフィックス付き）
- `{output_file_path}`: 出力ファイルパス
- `{issue_number}`: 元Issue番号

### 2. IssueAgentGeneratorクラス作成

**ファイル**: `src/core/github/issue-agent-generator.ts`

#### クラス概要

- **目的**: エージェントベースのFOLLOW-UP Issue生成
- **依存**: `CodexAgentClient` | `null`, `ClaudeAgentClient` | `null`
- **出力**: ファイルベース（一時ファイルに書き込み → 読み込み → クリーンアップ）

#### 主要メソッド

| メソッド | 説明 |
|---------|------|
| `generate(context, agent)` | FOLLOW-UP Issueを生成（'auto' \| 'codex' \| 'claude'） |
| `buildPrompt(template, context, outputFilePath)` | プロンプト変数置換 |
| `readOutputFile(filePath, context)` | 出力ファイル読み込み＋バリデーション |
| `isValidIssueContent(content)` | Issue本文の妥当性検証（5必須セクション） |
| `createFallbackBody(context)` | フォールバック用テンプレート生成 |
| `generateTitle(issueNumber, remainingTasks)` | タイトル生成（キーワード抽出、80文字制限） |
| `cleanupOutputFile(filePath)` | 一時ファイル削除 |

#### フォールバック機構

1. **エージェントレベル**: Codex失敗 → Claude（`agent: 'auto'`の場合）
2. **ファイル検証レベル**: 出力ファイル不正 → テンプレートベースのフォールバック

#### バリデーションルール

出力ファイルは以下の条件を満たす必要があります：

- **必須セクション**: `## 背景`, `## 目的`, `## 実行内容`, `## 受け入れ基準`, `## 参考情報`
- **最小文字数**: 100文字以上

### 3. IssueClient拡張

**ファイル**: `src/core/github/issue-client.ts`

#### 変更内容

1. **コンストラクタ拡張**
   ```typescript
   constructor(
     octokit: Octokit,
     owner: string,
     repo: string,
     issueAIGenerator: IssueAIGenerator | null = null,
     issueAgentGenerator: IssueAgentGenerator | null = null,  // 新規追加
   )
   ```

2. **createIssueFromEvaluation()メソッド拡張**（行356付近）
   - `provider === 'agent'` の場合、`tryGenerateWithAgent()`を呼び出し
   - エージェント生成成功時 → GitHubにIssue作成
   - エージェント生成失敗時 → LLM APIへフォールバック

3. **新規メソッド追加**: `tryGenerateWithAgent()`（行621-669）
   - `FollowUpContext`を構築（デフォルト値でフォールバック）
   - `issueAgentGenerator.generate(context, 'auto')`を呼び出し
   - 結果を返却（成功/失敗 + タイトル/本文）

#### フォールバック戦略

```
agent mode → tryGenerateWithAgent()
  ├─ success → GitHub Issue作成
  └─ failure → LLM API (IssueAIGenerator)
```

### 4. 型定義拡張

**ファイル**: `src/types.ts`

#### 変更内容

**行111**: `IssueGenerationOptions.provider`型を拡張

```typescript
provider: 'auto' | 'openai' | 'claude' | 'agent';  // 'agent' を追加
```

### 5. execute.tsコマンド拡張

**ファイル**: `src/commands/execute.ts`

#### 変更内容

1. **行194-195**: GitHubClient初期化時にエージェントクライアントを渡す
   ```typescript
   // Issue #174: Pass agent clients to GitHubClient for agent-based FOLLOW-UP Issue generation
   const githubClient = new GitHubClient(githubToken, repoName, codexClient, claudeClient);
   ```

2. **行362-368**: `FollowupCliOverrides`型に`'agent'`を追加
   ```typescript
   type FollowupCliOverrides = {
     cliMode?: 'auto' | 'openai' | 'claude' | 'agent' | 'off';  // 'agent' を追加
     // ...
   };
   ```

3. **行372-395**: `applyMode()`関数で`'agent'`をサポート
   - `mode === 'agent'` の場合、`options.enabled = true; options.provider = 'agent';`

**注意**: エージェント認証チェックは不要（行165-170で`codexClient`/`claudeClient`がすでに初期化済み）

### 6. GitHubClient拡張

**ファイル**: `src/core/github-client.ts`

#### 変更内容

1. **行19-21**: インポート追加
   ```typescript
   import { IssueAgentGenerator } from './github/issue-agent-generator.js';
   import type { CodexAgentClient } from './codex-agent-client.js';
   import type { ClaudeAgentClient } from './claude-agent-client.js';
   ```

2. **行77-82**: コンストラクタシグネチャ拡張
   ```typescript
   constructor(
     token?: string | null,
     repository?: string | null,
     codexClient?: CodexAgentClient | null,  // 新規追加
     claudeClient?: ClaudeAgentClient | null, // 新規追加
   )
   ```

3. **行126-130**: `IssueAgentGenerator`のインスタンス化
   ```typescript
   // Issue #174: Initialize IssueAgentGenerator for agent-based FOLLOW-UP Issue generation
   const issueAgentGenerator = new IssueAgentGenerator(
     codexClient ?? null,
     claudeClient ?? null,
   );
   ```

4. **行132-138**: `IssueClient`初期化時に`issueAgentGenerator`を渡す
   ```typescript
   this.issueClient = new IssueClient(
     this.octokit,
     this.owner,
     this.repo,
     issueAIGenerator,
     issueAgentGenerator,  // 新規追加
   );
   ```

### 7. init.ts更新（後方互換性）

**ファイル**: `src/commands/init.ts`

#### 変更内容

**行310-311**: GitHubClient初期化時にnullを渡す（エージェント不要コンテキスト）

```typescript
// Note: Agent clients not available in init context, passing null
const githubClient = new GitHubClient(githubToken, repositoryName, null, null);
```

## 新規作成ファイル

| ファイルパス | 行数 | 説明 |
|------------|------|------|
| `src/prompts/followup/generate-followup-issue.txt` | 96 | エージェント向けプロンプトテンプレート |
| `src/core/github/issue-agent-generator.ts` | 385 | エージェントベースIssue生成クラス |

## 変更ファイル

| ファイルパス | 変更内容 | 影響範囲 |
|------------|---------|---------|
| `src/types.ts` | `provider`型に`'agent'`追加（1行） | 低 |
| `src/core/github/issue-client.ts` | コンストラクタ＋メソッド追加（80行） | 中 |
| `src/commands/execute.ts` | 型定義＋初期化処理（4行） | 低 |
| `src/core/github-client.ts` | コンストラクタ拡張（15行） | 低 |
| `src/commands/init.ts` | GitHubClient初期化（2行） | 低 |
| `src/core/github/issue-ai-generator.ts` | ガードクラウス追加（8行） | 低 |

## 実装上の技術的決定

### 1. ファイルベース出力方式

**理由**: Auto-Issue機能（Issue #121-#128）で実証済みの安定パターンを踏襲

**実装**:
1. 一時ファイルパスを生成（`os.tmpdir() + タイムスタンプ + ランダム文字列`）
2. プロンプトにファイルパスを埋め込み
3. エージェントが出力ファイルに書き込み
4. システムがファイルを読み込み＋検証
5. 一時ファイルを削除

### 2. replaceAll()による変数置換

**理由**: CLAUDE.md制約#12（ReDoS脆弱性回避）

**実装**:
```typescript
return template
  .replaceAll('{remaining_tasks_json}', JSON.stringify(context.remainingTasks, null, 2))
  .replaceAll('{issue_context_json}', JSON.stringify(context.issueContext, null, 2))
  .replaceAll('{evaluation_report_path}', `@${context.evaluationReportPath}`)
  .replaceAll('{output_file_path}', outputFilePath)
  .replaceAll('{issue_number}', String(context.issueNumber));
```

### 3. 2段階フォールバック機構

**レベル1（エージェント選択）**: Codex失敗 → Claude

```typescript
if (agent === 'codex' || agent === 'auto') {
  if (!this.codexClient) {
    // Claudeへフォールバック
    selectedAgent = 'claude';
  } else {
    try {
      await this.codexClient.executeTask({ prompt });
    } catch (error) {
      // Claudeへフォールバック
      selectedAgent = 'claude';
    }
  }
}
```

**レベル2（生成方式）**: Agent失敗 → LLM API

```typescript
if (generationOptions.provider === 'agent') {
  const agentResult = await this.tryGenerateWithAgent(...);
  if (agentResult.success) {
    // GitHubにIssue作成
  } else {
    // LLM APIへフォールバック
    generationResult = await this.issueAIGenerator.generate(...);
  }
}
```

### 4. デフォルト値によるロバスト性確保

`tryGenerateWithAgent()`でissueContextが未定義の場合のフォールバック:

```typescript
const context: FollowUpContext = {
  remainingTasks: tasks,
  issueContext: issueContext ?? {
    summary: `Issue #${issueNumber} で特定された残タスクです。`,
    blockerStatus: 'ブロッカーのステータスは不明です。',
    deferredReason: '残タスクが発生した理由は記録されていません。',
  },
  issueNumber,
  evaluationReportPath,
};
```

## 後方互換性

### 既存機能への影響

- **LLM APIベース生成（IssueAIGenerator）**: **完全互換**（無変更）
- **テンプレートベース生成**: **完全互換**（フォールバック先として継続使用）
- **provider: 'auto' | 'openai' | 'claude'**: **完全互換**（既存動作維持）

### 新規機能

- **provider: 'agent'**: 新規追加（既存コードに影響なし）
- `--followup-llm-mode agent`: 新規CLIオプション（既存動作に影響なし）

## テスト戦略（Phase 5で実装予定）

以下のテストはPhase 5（test_implementation）で実装します：

### ユニットテスト

1. **IssueAgentGenerator**
   - `buildPrompt()`: 変数置換ロジック
   - `isValidIssueContent()`: バリデーション（5必須セクション、最小文字数）
   - `generateTitle()`: タイトル生成（キーワード抽出、80文字制限）
   - `createFallbackBody()`: フォールバックテンプレート生成

2. **execute.ts**
   - `applyMode()`: 'agent'モード処理
   - `resolveIssueGenerationOptions()`: agent modeの設定解決

### インテグレーションテスト

1. **エージェント実行フロー**
   - Codex実行 → 出力ファイル生成 → 検証 → Issue作成
   - Claude実行 → 出力ファイル生成 → 検証 → Issue作成
   - Auto mode（Codex → Claude フォールバック）

2. **フォールバックテスト**
   - エージェント失敗 → LLM API フォールバック
   - 出力ファイル不正 → テンプレート フォールバック

3. **バリデーションテスト**
   - 必須セクション欠落 → フォールバック
   - 最小文字数未満 → フォールバック

## 残課題

以下は実装完了済み、Phase 5でテストを追加：

- ✅ プロンプトテンプレート作成
- ✅ IssueAgentGeneratorクラス実装
- ✅ IssueClient拡張
- ✅ 型定義拡張
- ✅ execute.ts拡張
- ✅ GitHubClient拡張
- ✅ init.ts更新

以下はPhase 5で実装予定：

- ⏳ ユニットテスト作成（`tests/unit/issue-agent-generator.test.ts`）
- ⏳ インテグレーションテスト作成（`tests/integration/issue-agent-generator.test.ts`）
- ⏳ リグレッションテスト（既存のLLM API生成が壊れていないことを確認）

### 8. IssueAIGenerator拡張（型安全性）

**ファイル**: `src/core/github/issue-ai-generator.ts`

#### 変更内容

1. **isAvailable()メソッド**（行99-102）
   - `provider === 'agent'`の場合、`false`を返す（IssueAgentGeneratorが処理すべき）

   ```typescript
   // Issue #174: 'agent' provider is handled by IssueAgentGenerator, not this class
   if (options.provider === 'agent') {
     return false;
   }
   ```

2. **pickProvider()メソッド**（行147-152）
   - `provider === 'agent'`の場合、エラーをスロー（ガードクラウス）

   ```typescript
   // Issue #174: 'agent' provider should never reach this method
   if (options.provider === 'agent') {
     throw new IssueAIUnavailableError(
       'Agent provider is not supported by IssueAIGenerator. Use IssueAgentGenerator instead.',
     );
   }
   ```

**理由**: TypeScript型チェックを通すため、`IssueAIGenerator`が'agent'プロバイダを受け取らないようガードクラウスを追加

## ビルド検証

```bash
npm run build
```

**結果**: ✅ TypeScriptコンパイル成功（エラーなし）

## 実装完了日時

2025-01-15 (Implementation Phase)

## 参考

- Planning Document: `.ai-workflow/issue-174/00_planning/output/planning.md`
- Design Document: `.ai-workflow/issue-174/02_design/output/design.md`
- Test Scenario: `.ai-workflow/issue-174/03_test_scenario/output/test-scenario.md`
- Requirements: `.ai-workflow/issue-174/01_requirements/output/requirements.md`
- CLAUDE.md: プロジェクトガイドライン

---

**実装完了**: Phase 4（Implementation）
**次フェーズ**: Phase 5（Test Implementation）
