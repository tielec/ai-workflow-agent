# 詳細設計書: Issue #442

## pr-comment execute コマンドでエージェントログをファイルに保存すべき

---

## 0. 設計概要

### 設計目的

`pr-comment execute` コマンド実行時に、`ReviewCommentAnalyzer.runAgent()` メソッドで実行されるエージェントの実行ログをMarkdownファイルとして保存する機能を実装する。

### スコープサマリー

| 項目 | 内容 |
|------|------|
| **変更対象** | `src/core/pr-comment/comment-analyzer.ts` |
| **テスト対象** | `tests/unit/pr-comment/comment-analyzer.test.ts` |
| **参考実装** | `src/commands/pr-comment/analyze.ts` の `persistAgentLog()` |
| **出力ファイル** | `.ai-workflow/pr-{NUM}/execute/agent_log_comment_{commentId}.md` |

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────────┐
│                     pr-comment execute コマンド                      │
│                  (src/commands/pr-comment/execute.ts)               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ analyze() 呼び出し
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ReviewCommentAnalyzer クラス                      │
│              (src/core/pr-comment/comment-analyzer.ts)               │
├─────────────────────────────────────────────────────────────────────┤
│  + analyze(commentMeta, context, agent): AnalysisResult             │
│  - runAgent(agent, prompt, repoPath, commentId): RunAgentResult     │
│  - saveAgentLog(logData, commentId): Promise<void>  [NEW]           │
│  - logFormatter: LogFormatter  [NEW]                                 │
└─────────────────────────────────────────────────────────────────────┘
                    │                           │
                    │ エージェント実行          │ ログ保存
                    ▼                           ▼
┌────────────────────────────┐    ┌────────────────────────────────────┐
│   CodexAgentClient /       │    │          LogFormatter              │
│   ClaudeAgentClient        │    │  (src/phases/formatters/           │
└────────────────────────────┘    │        log-formatter.ts)           │
                                  └────────────────────────────────────┘
                                                 │
                                                 │ formatAgentLog()
                                                 ▼
                                  ┌────────────────────────────────────┐
                                  │  agent_log_comment_{id}.md         │
                                  │  (.ai-workflow/pr-{N}/execute/)    │
                                  └────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

```
┌──────────────────────┐      ┌──────────────────────┐
│  execute.ts          │      │  analyze.ts          │
│  (executeコマンド)    │      │  (analyzeコマンド)   │
└──────────┬───────────┘      └──────────┬───────────┘
           │                             │
           │                             │ persistAgentLog() [既存]
           │                             │
           ▼                             ▼
┌──────────────────────────────────────────────────────┐
│        ReviewCommentAnalyzer                         │
│  ┌─────────────────────────────────────────────────┐ │
│  │ runAgent() メソッド                              │ │
│  │  - エージェント実行                              │ │
│  │  - ログ保存 [NEW]                               │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
           │
           │ 依存
           ▼
┌──────────────────────┐
│     LogFormatter     │
│  formatAgentLog()    │
└──────────────────────┘
```

### 1.3 データフロー

```
1. execute.ts が ReviewCommentAnalyzer.analyze() を呼び出す
2. analyze() が runAgent() を呼び出す
3. runAgent() がエージェント（Codex/Claude）を実行
4. runAgent() が実行結果をLogFormatterで整形 [NEW]
5. runAgent() がログファイルを保存 [NEW]
6. runAgent() が抽出結果を返す
7. analyze() が結果を処理してJSONファイルに保存
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- 新規ファイル・クラスの作成は不要
- 既存の `ReviewCommentAnalyzer` クラスの `runAgent()` メソッドを拡張
- 既存の `LogFormatter` クラスをインポートして使用するのみ
- 既存のコードパターン（`pr-comment analyze` の `persistAgentLog()` 実装）を参考に拡張
- 変更範囲は1ファイル（+ テストファイル）に限定

**具体的な変更内容**:
1. `ReviewCommentAnalyzer` クラスに `LogFormatter` をインポート
2. コンストラクタで `LogFormatter` インスタンスを初期化
3. `runAgent()` メソッドに `commentId` パラメータを追加
4. `runAgent()` 内でログを保存する `saveAgentLog()` プライベートメソッドを追加
5. `analyze()` メソッドから `runAgent()` への呼び出しを修正

---

## 3. テスト戦略判断

### テスト戦略: UNIT_ONLY

**判断根拠**:
- `ReviewCommentAnalyzer` クラスの内部ロジック変更のみ
- `LogFormatter` は既存でテスト済み（独立したユニットテストが存在）
- 外部システム連携（GitHub API等）への影響なし
- `runAgent()` メソッドの単体テストで十分カバー可能
- 既存テストファイル（`comment-analyzer.test.ts`）が存在し、パターンを踏襲可能

**テスト観点**:
1. エージェント実行成功時のログ保存
2. エージェント実行失敗時（エラー発生時）のログ保存
3. ログ保存失敗時のエラーハンドリング（分析処理は継続）
4. `LogFormatter.formatAgentLog()` の正しい呼び出し確認

---

## 4. テストコード戦略判断

### テストコード戦略: EXTEND_TEST

**判断根拠**:
- 既存テストファイル `tests/unit/pr-comment/comment-analyzer.test.ts` が存在
- 新規テストファイル作成の必要なし
- 既存テストのパターン（モック、Jest設定等）を流用可能
- `runAgent()` メソッドのテストケースを追加するのみ
- 既存の `fs.writeFile` モックをそのまま活用可能

**追加するテストケース**:
1. `saveAgentLog()` が正しいパスにファイルを書き込むこと
2. エラー時もログが保存されること
3. ログ保存失敗時に警告ログが出力され、分析処理は継続すること

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

| ファイル | 影響内容 | リスク |
|---------|---------|--------|
| `src/core/pr-comment/comment-analyzer.ts` | `runAgent()` メソッド拡張、`LogFormatter` 追加 | 低 |
| `tests/unit/pr-comment/comment-analyzer.test.ts` | テストケース追加 | 低 |

### 5.2 依存関係の変更

| 種類 | 内容 |
|------|------|
| **新規依存追加** | `LogFormatter`（`src/phases/formatters/log-formatter.js`）のインポート |
| **既存依存変更** | なし |

**注意**: `LogFormatter` は既にプロジェクト内に存在し、`pr-comment analyze` や `pr-comment execute` で使用されているため、新規の外部依存は発生しない。

### 5.3 マイグレーション要否

| 項目 | 要否 |
|------|------|
| データベーススキーマ変更 | なし |
| 設定ファイル変更 | なし |
| 破壊的変更 | なし（内部メソッドのシグネチャ変更のみ） |

### 5.4 出力ファイル構成（変更後）

```
.ai-workflow/pr-{NUM}/execute/
├── agent_log.md                    # 既存: executeコマンド全体のログ
├── agent_log_comment_{id}.md       # NEW: 各コメント分析のエージェントログ
├── analysis-{id}.json              # 既存: 分析結果（JSON）
└── ...
```

---

## 6. 変更・追加ファイルリスト

### 6.1 修正が必要な既存ファイル

| ファイルパス | 変更内容 |
|-------------|---------|
| `src/core/pr-comment/comment-analyzer.ts` | `LogFormatter` のインポート追加、`runAgent()` メソッド拡張、`saveAgentLog()` メソッド追加 |
| `tests/unit/pr-comment/comment-analyzer.test.ts` | ログ保存関連のテストケース追加 |

### 6.2 新規作成ファイル

なし

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 クラス設計

#### ReviewCommentAnalyzer クラスの変更

```typescript
// 現在のクラス構造
export class ReviewCommentAnalyzer {
  private readonly promptTemplatePath: string;
  private readonly outputDir: string;

  constructor(promptsDir: string, outputDir: string) {
    this.promptTemplatePath = path.join(promptsDir, 'pr-comment', 'analyze.txt');
    this.outputDir = outputDir;
  }
  // ...
}

// 変更後のクラス構造
export class ReviewCommentAnalyzer {
  private readonly promptTemplatePath: string;
  private readonly outputDir: string;
  private readonly logFormatter: LogFormatter;  // NEW

  constructor(promptsDir: string, outputDir: string) {
    this.promptTemplatePath = path.join(promptsDir, 'pr-comment', 'analyze.txt');
    this.outputDir = outputDir;
    this.logFormatter = new LogFormatter();  // NEW
  }
  // ...
}
```

### 7.2 関数設計

#### 7.2.1 `runAgent()` メソッドの変更

**現在のシグネチャ**:
```typescript
private async runAgent(
  agent: CodexAgentClient | ClaudeAgentClient,
  prompt: string,
  repoPath: string,
): Promise<string | null>
```

**変更後のシグネチャ**:
```typescript
private async runAgent(
  agent: CodexAgentClient | ClaudeAgentClient,
  prompt: string,
  repoPath: string,
  commentId: number,  // NEW: ログファイル名生成用
): Promise<string | null>
```

**変更後の実装**:
```typescript
private async runAgent(
  agent: CodexAgentClient | ClaudeAgentClient,
  prompt: string,
  repoPath: string,
  commentId: number,
): Promise<string | null> {
  const startTime = Date.now();
  let messages: string[] = [];

  try {
    logger.debug(`Running agent for PR comment analysis...`);
    messages = await agent.executeTask({
      prompt,
      maxTurns: 1,
      verbose: true,
      workingDirectory: repoPath,
    });
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.debug(`Agent execution completed, processing response...`);

    // NEW: エージェントログを保存
    const agentName = agent instanceof CodexAgentClient ? 'Codex Agent' : 'Claude Agent';
    await this.saveAgentLog({
      messages,
      startTime,
      endTime,
      duration,
      error: null,
      agentName,
    }, commentId);

    if (agent instanceof CodexAgentClient) {
      return this.extractFromCodexMessages(messages);
    }
    return this.extractFromClaudeMessages(messages);
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.warn(`Agent execution failed: ${getErrorMessage(error)}`);

    // NEW: エラー時もログを保存
    const agentName = agent instanceof CodexAgentClient ? 'Codex Agent' : 'Claude Agent';
    await this.saveAgentLog({
      messages,
      startTime,
      endTime,
      duration,
      error: error as Error,
      agentName,
    }, commentId);

    return null;
  }
}
```

#### 7.2.2 `saveAgentLog()` メソッドの新規追加

**シグネチャ**:
```typescript
private async saveAgentLog(
  logData: {
    messages: string[];
    startTime: number;
    endTime: number;
    duration: number;
    error: Error | null;
    agentName: string;
  },
  commentId: number,
): Promise<void>
```

**実装**:
```typescript
/**
 * エージェント実行ログをファイルに保存
 *
 * @param logData - ログデータ（メッセージ、時刻、エラー情報等）
 * @param commentId - PRコメントID（ファイル名生成用）
 */
private async saveAgentLog(
  logData: {
    messages: string[];
    startTime: number;
    endTime: number;
    duration: number;
    error: Error | null;
    agentName: string;
  },
  commentId: number,
): Promise<void> {
  try {
    const agentLogContent = this.logFormatter.formatAgentLog(
      logData.messages,
      logData.startTime,
      logData.endTime,
      logData.duration,
      logData.error,
      logData.agentName,
    );

    const logFile = path.join(this.outputDir, `agent_log_comment_${commentId}.md`);
    await fsp.writeFile(logFile, agentLogContent, 'utf-8');
    logger.debug(`Agent log saved to: ${logFile}`);
  } catch (logError) {
    // ログ保存失敗は警告のみ、分析処理は継続
    logger.warn(`Failed to save agent log: ${getErrorMessage(logError)}`);
  }
}
```

#### 7.2.3 `analyze()` メソッドの修正

**変更箇所**:
```typescript
// 変更前
if (agent) {
  rawContent = await this.runAgent(agent, prompt, context.repoPath);
}

// 変更後
if (agent) {
  rawContent = await this.runAgent(agent, prompt, context.repoPath, commentMeta.comment.id);
}
```

### 7.3 データ構造設計

#### 7.3.1 ログデータインターフェース（内部使用）

```typescript
interface AgentLogData {
  messages: string[];      // エージェントの生出力メッセージ
  startTime: number;       // 実行開始時刻（ミリ秒）
  endTime: number;         // 実行終了時刻（ミリ秒）
  duration: number;        // 実行時間（ミリ秒）
  error: Error | null;     // エラーオブジェクト（成功時はnull）
  agentName: string;       // エージェント名（'Codex Agent' または 'Claude Agent'）
}
```

### 7.4 インターフェース設計

#### 7.4.1 LogFormatter との連携

既存の `LogFormatter.formatAgentLog()` をそのまま使用：

```typescript
// LogFormatter API（変更なし）
formatAgentLog(
  messages: string[],
  startTime: number,
  endTime: number,
  duration: number,
  error: Error | null,
  agentName: string,
): string
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

- 本機能は既存の認証・認可の範囲内で動作
- ログファイルはローカルファイルシステムに保存され、GitHub API等への送信なし
- 追加の認証処理は不要

### 8.2 データ保護

| 項目 | 対応 |
|------|------|
| 機密情報の取り扱い | エージェントログには環境変数やAPIキーが含まれる可能性があるため、`.gitignore` で `.ai-workflow/` を除外することを推奨（既存の運用） |
| ファイルアクセス権 | デフォルトのファイルパーミッションを使用（`fs.writeFile` のデフォルト） |
| ログの暗号化 | 不要（ローカルファイルのみ） |

### 8.3 セキュリティリスクと対策

| リスク | 対策 |
|--------|------|
| ログファイルへの機密情報漏洩 | エージェントが出力する内容に依存（現状維持）。必要に応じてログのサニタイズを将来的に検討 |
| ファイルパスインジェクション | `commentId` は整数値であり、パスインジェクションリスクは低い |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

| 要件 | 対応 |
|------|------|
| ログ保存処理時間 | 1コメントあたり100ms以下（`fs.writeFile` の非同期処理） |
| ファイルサイズ | 1ログファイルあたり1MB以下（通常は数KB） |
| メモリ使用量 | `LogFormatter` は既存実装を使用し、追加のメモリ負荷は最小限 |

### 9.2 スケーラビリティ

| 要件 | 対応 |
|------|------|
| 大量コメント処理 | 各コメントごとに個別ファイルを生成するため、処理負荷が分散 |
| ディスク容量 | ログファイルは小さく、ディスク容量への影響は軽微 |

### 9.3 保守性

| 要件 | 対応 |
|------|------|
| コード重複の防止 | 既存の `LogFormatter` クラスを再利用し、新規フォーマッタは作成しない |
| コーディング規約 | プロジェクトの既存コードパターンに準拠（`pr-comment analyze` の `persistAgentLog()` を参考） |
| JSDoc | `saveAgentLog()` メソッドにJSDocコメントを追加 |
| エラーハンドリング | `getErrorMessage()` ヘルパーを使用してエラーメッセージを取得 |

### 9.4 テスト容易性

| 要件 | 対応 |
|------|------|
| モック可能性 | `fs.writeFile` のモックによりファイル書き込みをテスト可能（既存パターン） |
| テストカバレッジ | 追加コードの80%以上をユニットテストでカバー |

---

## 10. 実装の順序

### 10.1 推奨実装順序

```
1. LogFormatter のインポート追加
   ↓
2. コンストラクタでの logFormatter インスタンス化
   ↓
3. saveAgentLog() メソッドの実装
   ↓
4. runAgent() メソッドのシグネチャ変更と実装修正
   ↓
5. analyze() メソッドからの呼び出し修正
   ↓
6. テストケースの追加
   ↓
7. テスト実行と修正
```

### 10.2 依存関係の考慮

| 順序 | タスク | 依存 |
|------|--------|------|
| 1 | `LogFormatter` インポート | なし |
| 2 | コンストラクタ修正 | タスク1に依存 |
| 3 | `saveAgentLog()` 実装 | タスク1, 2に依存 |
| 4 | `runAgent()` 修正 | タスク3に依存 |
| 5 | `analyze()` 修正 | タスク4に依存 |
| 6 | テストケース追加 | タスク5に依存 |

---

## 11. 詳細実装コード

### 11.1 変更後の完全なコード（主要部分）

#### インポート部分（追加）

```typescript
// 既存のインポート
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
// ...

// NEW: LogFormatter のインポート
import { LogFormatter } from '../../phases/formatters/log-formatter.js';
```

#### クラス定義（変更）

```typescript
export class ReviewCommentAnalyzer {
  private readonly promptTemplatePath: string;
  private readonly outputDir: string;
  private readonly logFormatter: LogFormatter;  // NEW

  constructor(promptsDir: string, outputDir: string) {
    this.promptTemplatePath = path.join(promptsDir, 'pr-comment', 'analyze.txt');
    this.outputDir = outputDir;
    this.logFormatter = new LogFormatter();  // NEW
  }
  // ...
}
```

### 11.2 テストケース設計

#### 追加するテストケース

```typescript
describe('runAgent with logging', () => {
  let mockAgent: jest.Mocked<CodexAgentClient>;
  let writeFileSpy: jest.SpiedFunction<typeof fsp.writeFile>;

  beforeEach(() => {
    mockAgent = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<CodexAgentClient>;

    writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);
  });

  it('saves agent log on successful execution', async () => {
    const mockMessages = [JSON.stringify({
      type: 'result',
      result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
    })];
    mockAgent.executeTask.mockResolvedValue(mockMessages);

    await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

    // ログファイルが正しいパスに書き込まれることを確認
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('agent_log_comment_100.md'),
      expect.any(String),
      'utf-8'
    );
  });

  it('saves agent log on failed execution', async () => {
    mockAgent.executeTask.mockRejectedValue(new Error('Agent timeout'));

    await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

    // エラー時もログファイルが書き込まれることを確認
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('agent_log_comment_100.md'),
      expect.any(String),
      'utf-8'
    );
  });

  it('continues analysis when log save fails', async () => {
    const mockMessages = [JSON.stringify({
      type: 'result',
      result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
    })];
    mockAgent.executeTask.mockResolvedValue(mockMessages);

    // ログ保存を失敗させる
    writeFileSpy.mockImplementation(async (filePath: fs.PathLike) => {
      if (String(filePath).includes('agent_log_comment')) {
        throw new Error('Permission denied');
      }
      return undefined;
    });

    // 分析処理は正常に完了することを確認
    const result = await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);
    expect(result.success).toBe(true);
  });
});
```

---

## 12. 品質ゲートチェックリスト（Phase 2）

- [x] **実装戦略の判断根拠が明記されている**: EXTEND（既存クラスの拡張）
- [x] **テスト戦略の判断根拠が明記されている**: UNIT_ONLY（ユニットテストのみ）
- [x] **テストコード戦略の判断根拠が明記されている**: EXTEND_TEST（既存テストファイルを拡張）
- [x] **既存コードへの影響範囲が分析されている**: セクション5で詳細分析
- [x] **変更が必要なファイルがリストアップされている**: セクション6で一覧化
- [x] **設計が実装可能である**: セクション7, 11で詳細コードを提示

---

## 13. トレーサビリティマトリクス

### 要件 → 設計の対応

| 要件ID | 要件概要 | 設計セクション |
|--------|---------|---------------|
| FR-001 | エージェント実行成功時のログ保存 | 7.2.1, 7.2.2 |
| FR-002 | エージェント実行失敗時のログ保存 | 7.2.1, 7.2.2 |
| FR-003 | ログファイルのフォーマット | 7.4.1 |
| FR-004 | コメントIDの識別 | 7.2.2 |
| FR-005 | LogFormatterインスタンスの初期化 | 7.1 |
| FR-006 | runAgent()メソッドのシグネチャ変更 | 7.2.1 |
| NFR-001 | パフォーマンス | 9.1 |
| NFR-002 | 信頼性 | 7.2.2（エラーハンドリング） |
| NFR-003 | 保守性 | 9.3 |
| NFR-004 | テスト容易性 | 9.4 |

---

## 14. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | - | 初版作成 |

