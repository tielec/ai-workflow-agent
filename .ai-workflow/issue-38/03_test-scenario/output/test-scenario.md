# テストシナリオ - Issue #38

**Issue番号**: #38
**タイトル**: [FOLLOW-UP] Issue #26 - 残タスク
**状態**: open
**URL**: https://github.com/tielec/ai-workflow-agent/issues/38
**作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Claude Code)

---

## 0. Planning DocumentとDesign Documentの確認

### 開発計画の全体像

Planning Document（`.ai-workflow/issue-38/00_planning/output/planning.md`）とDesign Document（`.ai-workflow/issue-38/02_design/output/design.md`）で策定された全体戦略を確認しました：

- **複雑度判定**: **簡単**（テストコードのAPIシグネチャ修正のみ、新規実装なし）
- **見積もり工数**: 6～9時間（1.5～2日間）
- **リスク評価**: **低**（修正内容が明確、技術的に容易）
- **実装戦略**: **EXTEND**（既存テストコードを最新APIシグネチャに適合させる）
- **テスト戦略**: **UNIT_INTEGRATION**（既存のユニットテストと統合テストを修正）
- **テストコード戦略**: **EXTEND_TEST**（既存テストファイルへの修正のみ）

### スコープの明確化

Issue #26の評価レポート（`evaluation_report.md`）で特定された残タスクは、**Phase 5（テストコード実装）でPhase 4の最新APIシグネチャを正しく反映できなかった問題**です。実装自体（Phase 4）は以下の点で優れていることが確認されています：

- ✅ 後方互換性100%維持
- ✅ 行数削減目標達成（250行削減、21.9%）
- ✅ コーディング規約準拠（ESLint、Prettier）
- ✅ 単一責任原則（SRP）、DRY原則の遵守
- ✅ 既存テストの88.1%（384個）が成功

したがって、本Issueのスコープは**テストコードの技術的調整のみ**であり、**新規実装やコアロジックの変更は不要**です。

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

### テスト対象の範囲

本Issueは**既存テストコードの修正**が対象です。以下の9ファイルが修正対象となります：

**ユニットテスト（6ファイル）**:
1. `tests/unit/core/helpers/codex-agent-client.test.ts`
2. `tests/unit/core/helpers/claude-agent-client.test.ts`
3. `tests/unit/core/metadata-manager.test.ts`
4. `tests/unit/core/helpers/log-formatter.test.ts`
5. `tests/unit/core/helpers/dependency-messages.test.ts`
6. `tests/unit/core/helpers/validation.test.ts`

**統合テスト（2ファイル）**:
7. `tests/integration/agent-client-execution.test.ts`
8. `tests/integration/metadata-persistence.test.ts`

**その他（1ファイル）**:
9. `tests/unit/core/helpers/metadata-io.test.ts`（モック方式修正）

### テストの目的

1. **APIシグネチャの整合性検証**: Phase 4の最新実装と一致することを確認
2. **既存機能の回帰検証**: リファクタリングにより既存機能が破壊されていないことを確認
3. **テストカバレッジの達成**: 全体80%以上、新規ヘルパーモジュール85%以上
4. **Issue #26のマージ準備完了**: すべてのテストが合格し、マージ可能な状態にする

### テスト戦略の理由

- **新規テストケース追加なし**: Issue #26で既に66個のユニットテストケース、6個の統合テストケースが作成されており、テストシナリオは包括的
- **既存テストの修正のみ**: Phase 4の最新APIシグネチャに適合させる技術的調整が中心
- **BDD不要**: ユーザーストーリー中心のテストは不要（内部リファクタリングのテスト修正）

---

## 2. Unitテストシナリオ

### 2.1 優先度1: APIシグネチャ修正（3ファイル）

#### 2.1.1 CodexAgentClient（tests/unit/core/helpers/codex-agent-client.test.ts）

Issue #26で既に作成されたテストケースは以下の通りです（評価レポートより）。本Issueでは、これらのテストケースのsetup部分を修正します。

##### テストケース1: コンストラクタシグネチャの検証

**要件**: REQ-001

**目的**: `CodexAgentClient`のコンストラクタがオプションオブジェクト形式で正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
const client = new CodexAgentClient('/test/workspace');

// 【修正後】
const client = new CodexAgentClient({ workingDir: '/test/workspace' });
```

**前提条件**:
- TypeScriptコンパイラが正常に動作している
- `CodexAgentClient`クラスがインポートされている

**入力**:
- `{ workingDir: '/test/workspace' }`（オプションオブジェクト）

**期待結果**:
- インスタンスが正常に作成される
- 型エラーが発生しない
- `client.workingDir`が`'/test/workspace'`である

**テストデータ**:
- 正常系: `{ workingDir: '/test/workspace' }`
- 境界値: `{ workingDir: '/' }`（ルートディレクトリ）
- 異常系: `{ workingDir: '' }`（空文字列、Issue #26で既にカバー済み）

---

##### テストケース2: executeTaskオプションの検証

**要件**: REQ-002

**目的**: `executeTask`メソッドのオプションキー名`workingDirectory`が正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
await client.executeTask('test prompt', { workingDir: '/test/dir' });

// 【修正後】
await client.executeTask('test prompt', { workingDirectory: '/test/dir' });
```

**前提条件**:
- `CodexAgentClient`インスタンスが作成されている
- モックエージェントが設定されている

**入力**:
- `prompt`: `'test prompt'`
- `options`: `{ workingDirectory: '/test/dir' }`

**期待結果**:
- タスクが正常に実行される
- 型エラーが発生しない
- 正しいディレクトリ（`/test/dir`）でタスクが実行される

**テストデータ**:
- 正常系: `{ workingDirectory: '/test/dir' }`
- 境界値: `{ workingDirectory: '/tmp' }`
- 異常系: `{ workingDirectory: '/nonexistent' }`（Issue #26で既にカバー済み）

---

#### 2.1.2 ClaudeAgentClient（tests/unit/core/helpers/claude-agent-client.test.ts）

##### テストケース3: コンストラクタシグネチャの検証

**要件**: REQ-003

**目的**: `ClaudeAgentClient`のコンストラクタがオプションオブジェクト形式で正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
const client = new ClaudeAgentClient('/test/workspace');

// 【修正後】
const client = new ClaudeAgentClient({ workingDir: '/test/workspace' });
```

**前提条件**:
- TypeScriptコンパイラが正常に動作している
- `ClaudeAgentClient`クラスがインポートされている

**入力**:
- `{ workingDir: '/test/workspace' }`（オプションオブジェクト）

**期待結果**:
- インスタンスが正常に作成される
- 型エラーが発生しない
- `client.workingDir`が`'/test/workspace'`である

**テストデータ**:
- 正常系: `{ workingDir: '/test/workspace' }`
- 境界値: `{ workingDir: '/' }`（ルートディレクトリ）
- 異常系: `{ workingDir: '' }`（空文字列、Issue #26で既にカバー済み）

---

#### 2.1.3 MetadataManager（tests/unit/core/metadata-manager.test.ts）

##### テストケース4: コンストラクタ引数型の検証

**要件**: REQ-004

**目的**: `MetadataManager`のコンストラクタがstring型のIssue番号で正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
const manager = new MetadataManager(26);

// 【修正後】
const manager = new MetadataManager('26');
```

**前提条件**:
- TypeScriptコンパイラが正常に動作している
- `MetadataManager`クラスがインポートされている

**入力**:
- `'26'`（string型のIssue番号）

**期待結果**:
- インスタンスが正常に作成される
- 型エラーが発生しない
- `manager.issueNumber`が`'26'`である

**テストデータ**:
- 正常系: `'26'`
- 境界値: `'1'`（1桁のIssue番号）
- 異常系: `''`（空文字列、Issue #26で既にカバー済み）

---

##### テストケース5: updatePhaseStatusオプションの検証

**要件**: REQ-005

**目的**: `updatePhaseStatus`メソッドのオプションキー名`outputFile`（単数形）が正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
await manager.updatePhaseStatus('requirements', 'completed', {
  outputFiles: ['/path/to/file1.md', '/path/to/file2.md']
});

// 【修正後】
await manager.updatePhaseStatus('requirements', 'completed', {
  outputFile: '/path/to/file1.md'
});
```

**前提条件**:
- `MetadataManager`インスタンスが作成されている
- メタデータファイルが存在する

**入力**:
- `phaseName`: `'requirements'`
- `status`: `'completed'`
- `options`: `{ outputFile: '/path/to/file1.md' }`

**期待結果**:
- フェーズステータスが正常に更新される
- 型エラーが発生しない
- 単一ファイルパス（`/path/to/file1.md`）が記録される

**テストデータ**:
- 正常系: `{ outputFile: '/path/to/file1.md' }`
- 境界値: `{ outputFile: '/tmp/test.md' }`
- 異常系: `{ outputFile: '' }`（空文字列、Issue #26で既にカバー済み）

---

##### テストケース6: addCost引数数の検証

**要件**: REQ-006

**目的**: `addCost`メソッドが3引数で正しく動作し、コストが自動計算されることを検証

**修正内容**:
```typescript
// 【修正前】
await manager.addCost('requirements', 'execute', 1000, 0.02);

// 【修正後】
await manager.addCost('requirements', 'execute', 1000);
```

**前提条件**:
- `MetadataManager`インスタンスが作成されている
- メタデータファイルが存在する

**入力**:
- `phaseName`: `'requirements'`
- `stepName`: `'execute'`
- `tokens`: `1000`

**期待結果**:
- コストが正常に記録される
- 型エラーが発生しない
- コストが自動計算される（トークン数に基づく）

**テストデータ**:
- 正常系: `('requirements', 'execute', 1000)`
- 境界値: `('requirements', 'execute', 0)`（トークン数0）
- 異常系: `('requirements', 'execute', -1)`（負のトークン数、Issue #26で既にカバー済み）

---

### 2.2 優先度2: 型定義修正（2ファイル）

#### 2.2.1 log-formatter（tests/unit/core/helpers/log-formatter.test.ts）

##### テストケース7: CodexEvent['message']型の検証

**要件**: REQ-009

**目的**: `formatCodexLog`関数が新しい`message`型（オブジェクト形式）で正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
const event: CodexEvent = {
  type: 'turn_start',
  message: 'System message',
  timestamp: new Date().toISOString(),
};

// 【修正後】
const event: CodexEvent = {
  type: 'turn_start',
  message: {
    role: 'system',
    content: [{ type: 'text', text: 'System message' }]
  },
  timestamp: new Date().toISOString(),
};
```

**前提条件**:
- `formatCodexLog`関数がインポートされている
- `CodexEvent`型定義が正しい

**入力**:
- `event`: 上記の新しい形式のイベントオブジェクト

**期待結果**:
- ログが正常にフォーマットされる
- 型エラーが発生しない
- `message.content[0].text`が正しく抽出される

**テストデータ**:
- 正常系: `{ role: 'system', content: [{ type: 'text', text: 'System message' }] }`
- 境界値: `{ role: 'user', content: [] }`（空のcontent）
- 異常系: `{ role: 'unknown', content: [{ type: 'invalid', text: '' }] }`（Issue #26で既にカバー済み）

---

#### 2.2.2 dependency-messages（tests/unit/core/helpers/dependency-messages.test.ts）

##### テストケース8: PhaseName型インポートの検証

**要件**: REQ-010

**目的**: `PhaseName`型が正しくインポートされ、型エラーが発生しないことを検証

**修正内容**:
```typescript
// 【修正前】
import type { PhaseName } from '???';

// 【修正後】
import type { PhaseName } from '../../../types.js';
```

**前提条件**:
- `PhaseName`型が`src/types.ts`に定義されている
- 相対パスが正しい（`tests/unit/core/helpers/` → `src/types.ts`）

**入力**:
- テストファイル内で`PhaseName`型を使用する

**期待結果**:
- TypeScriptコンパイラが型エラーを出さない
- `buildErrorMessage`、`buildWarningMessage`関数が正常に動作する

**テストデータ**:
- 正常系: `'00_planning'`、`'01_requirements'`等のプレフィックス付きフェーズ名
- 境界値: `'09_evaluation'`（最後のフェーズ）
- 異常系: `'invalid_phase'`（Issue #26で既にカバー済み）

---

### 2.3 優先度3: フェーズ名修正（1ファイル）

#### 2.3.1 validation（tests/unit/core/helpers/validation.test.ts）

##### テストケース9: validPhases配列の検証

**要件**: REQ-011

**目的**: `validatePhaseName`関数がプレフィックス付きフェーズ名で正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
const validPhases = ['planning', 'requirements', 'design', ...];

// 【修正後】
const validPhases = ['00_planning', '01_requirements', '02_design', ...];
```

**前提条件**:
- `validatePhaseName`関数がインポートされている
- プレフィックス付きフェーズ名が定義されている

**入力**:
- 正常系: `'00_planning'`
- 異常系: `'planning'`（プレフィックスなし）

**期待結果**:
- 正常系: `true`が返される
- 異常系: `false`が返される
- 型エラーが発生しない

**テストデータ**:
- 正常系: `'00_planning'`, `'01_requirements'`, `'02_design'`, `'03_test-scenario'`, `'04_implementation'`, `'05_test-implementation'`, `'06_testing'`, `'07_documentation'`, `'08_report'`, `'09_evaluation'`
- 境界値: `'00_planning'`（最初のフェーズ）、`'09_evaluation'`（最後のフェーズ）
- 異常系: `'planning'`（プレフィックスなし）、`'invalid_phase'`（Issue #26で既にカバー済み）

---

### 2.4 優先度4: モック方式修正（1ファイル）

#### 2.4.1 metadata-io（tests/unit/core/helpers/metadata-io.test.ts）

##### テストケース10: ESモジュールモード対応モックの検証

**要件**: REQ-012

**目的**: ESモジュールモードでモック（`vi.spyOn()`）が正しく動作することを検証

**修正内容**:
```typescript
// 【修正前】
jest.mock('fs-extra');

// 【修正後】
beforeEach(async () => {
  vi.spyOn(fs, 'pathExists').mockResolvedValue(true);
  vi.spyOn(fs, 'copy').mockResolvedValue(undefined);
  vi.spyOn(fs, 'remove').mockResolvedValue(undefined);
  // ... 他のメソッドも同様
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**前提条件**:
- Vitestの`vi`がインポートされている
- `fs-extra`がインポートされている

**入力**:
- `backupMetadataFile`、`removeWorkflowDirectory`等の関数を呼び出す

**期待結果**:
- モック関数が正常に動作する
- 実際のファイルシステムにアクセスしない
- テスト後にモックがリセットされる

**テストデータ**:
- 正常系: `pathExists`が`true`を返す
- 異常系: `pathExists`が`false`を返す（ファイルが存在しない）
- エラー系: `copy`がエラーをスローする（Issue #26で既にカバー済み）

---

## 3. Integrationテストシナリオ

### 3.1 優先度1: APIシグネチャ修正（2ファイル）

#### 3.1.1 エージェント実行フロー（tests/integration/agent-client-execution.test.ts）

##### シナリオ1: CodexAgentとClaudeAgentの実行フロー統合

**要件**: REQ-007

**目的**: `CodexAgentClient`と`ClaudeAgentClient`が最新APIシグネチャで正しく統合されることを検証

**修正内容**:
- `CodexAgentClient`のコンストラクタシグネチャ修正（テストケース1と同じ）
- `ClaudeAgentClient`のコンストラクタシグネチャ修正（テストケース3と同じ）

**前提条件**:
- テスト用ワークスペースディレクトリが存在する
- モックエージェントが設定されている

**テスト手順**:
1. `CodexAgentClient`インスタンスを`{ workingDir: '/test/workspace' }`で作成
2. `ClaudeAgentClient`インスタンスを`{ workingDir: '/test/workspace' }`で作成
3. 各エージェントでタスクを実行
4. 結果を検証

**期待結果**:
- 両方のエージェントが正常にインスタンス化される
- タスクが正常に実行される
- 型エラーが発生しない
- 実行ログが正しく記録される

**確認項目**:
- [ ] `CodexAgentClient`インスタンスが作成される
- [ ] `ClaudeAgentClient`インスタンスが作成される
- [ ] `executeTask`メソッドが正常に実行される
- [ ] 実行ログに正しいworkingDirが記録される
- [ ] エラーが発生しない

---

#### 3.1.2 メタデータ永続化フロー（tests/integration/metadata-persistence.test.ts）

##### シナリオ2: MetadataManagerの永続化フロー統合

**要件**: REQ-008

**目的**: `MetadataManager`が最新APIシグネチャで正しく永続化フローを実行することを検証

**修正内容**:
- `MetadataManager`のコンストラクタ引数型修正（テストケース4と同じ）
- `updatePhaseStatus`オプション修正（テストケース5と同じ）
- `addCost`引数数修正（テストケース6と同じ）

**前提条件**:
- テスト用メタデータディレクトリが存在する
- メタデータファイルが初期状態である

**テスト手順**:
1. `MetadataManager`インスタンスを`'26'`（string型）で作成
2. `updatePhaseStatus`メソッドを`{ outputFile: '...' }`形式で呼び出す
3. `addCost`メソッドを3引数で呼び出す
4. メタデータファイルを読み込んで検証

**期待結果**:
- `MetadataManager`インスタンスが正常に作成される
- フェーズステータスが正しく更新される
- コストが正しく記録される（自動計算）
- メタデータファイルに正しいデータが永続化される

**確認項目**:
- [ ] `MetadataManager`インスタンスが作成される（string型Issue番号）
- [ ] `updatePhaseStatus`が正常に実行される（単数形outputFile）
- [ ] `addCost`が正常に実行される（3引数）
- [ ] メタデータファイルにフェーズステータスが記録される
- [ ] メタデータファイルにコストが記録される（自動計算）
- [ ] エラーが発生しない

---

## 4. テスト実行シナリオ（Phase 6）

### 4.1 全テスト実行（REQ-013）

**目的**: Issue #26のテストファイル9個がすべて合格することを確認

**前提条件**:
- REQ-001～REQ-012の修正が完了している
- テスト環境が正しく設定されている

**テスト手順**:
1. `npm test`を実行
2. テスト結果を確認
3. Issue #26のテストファイル9個の合格状況を確認

**期待結果**:
- Issue #26のテストファイル9個がすべて合格する（失敗0個）
- 既存テストの成功率が88.1%以上を維持している
- テスト実行時間が修正前後で±10%以内

**確認項目**:
- [ ] `codex-agent-client.test.ts`が合格
- [ ] `claude-agent-client.test.ts`が合格
- [ ] `metadata-manager.test.ts`が合格
- [ ] `log-formatter.test.ts`が合格
- [ ] `dependency-messages.test.ts`が合格
- [ ] `validation.test.ts`が合格
- [ ] `metadata-io.test.ts`が合格
- [ ] `agent-client-execution.test.ts`が合格
- [ ] `metadata-persistence.test.ts`が合格
- [ ] 既存テストの成功率が88.1%以上

---

### 4.2 カバレッジ確認（REQ-014）

**目的**: カバレッジ目標（全体80%以上、新規ヘルパーモジュール85%以上）を達成することを確認

**前提条件**:
- REQ-001～REQ-013の修正が完了している
- `npm run test:coverage`が実行可能である

**テスト手順**:
1. `npm run test:coverage`を実行
2. カバレッジレポートを確認
3. 全体カバレッジを確認
4. 新規ヘルパーモジュール（6ファイル）のカバレッジを確認

**期待結果**:
- 全体カバレッジが80%以上である
- 新規ヘルパーモジュール（6ファイル）のカバレッジが85%以上である
- カバレッジレポート生成時間が修正前後で±15%以内

**確認項目**:
- [ ] 全体カバレッジが80%以上
- [ ] `agent-event-parser.ts`のカバレッジが85%以上
- [ ] `log-formatter.ts`のカバレッジが85%以上
- [ ] `env-setup.ts`のカバレッジが85%以上
- [ ] `metadata-io.ts`のカバレッジが85%以上
- [ ] `validation.ts`のカバレッジが85%以上
- [ ] `dependency-messages.ts`のカバレッジが85%以上

---

## 5. テストデータ

### 5.1 正常データ

#### CodexAgentClient/ClaudeAgentClient
```typescript
{
  workingDir: '/test/workspace'
}
```

#### MetadataManager
```typescript
{
  issueNumber: '26',
  phaseName: 'requirements',
  status: 'completed',
  outputFile: '/path/to/file1.md',
  tokens: 1000
}
```

#### CodexEvent（log-formatter）
```typescript
{
  type: 'turn_start',
  message: {
    role: 'system',
    content: [{ type: 'text', text: 'System message' }]
  },
  timestamp: '2025-01-22T12:00:00.000Z'
}
```

#### PhaseName（validation）
```typescript
[
  '00_planning',
  '01_requirements',
  '02_design',
  '03_test-scenario',
  '04_implementation',
  '05_test-implementation',
  '06_testing',
  '07_documentation',
  '08_report',
  '09_evaluation'
]
```

---

### 5.2 異常データ

#### CodexAgentClient/ClaudeAgentClient
```typescript
{
  workingDir: ''  // 空文字列
}
```

#### MetadataManager
```typescript
{
  issueNumber: '',  // 空文字列
  phaseName: 'invalid_phase',  // 無効なフェーズ名
  tokens: -1  // 負のトークン数
}
```

#### PhaseName（validation）
```typescript
'planning'  // プレフィックスなし
'invalid_phase'  // 無効なフェーズ名
```

**注意**: 異常データのテストケースは、Issue #26で既にカバーされています。本Issueではsetup部分の修正のみを行い、新規テストケースの追加は不要です。

---

### 5.3 境界値データ

#### CodexAgentClient/ClaudeAgentClient
```typescript
{
  workingDir: '/'  // ルートディレクトリ
}
```

#### MetadataManager
```typescript
{
  issueNumber: '1',  // 1桁のIssue番号
  tokens: 0  // トークン数0
}
```

#### PhaseName（validation）
```typescript
'00_planning'  // 最初のフェーズ
'09_evaluation'  // 最後のフェーズ
```

---

## 6. テスト環境要件

### 6.1 必要なテスト環境

- **ローカル環境**: 開発時のテスト実行
- **CI/CD環境**: Jenkins環境での自動テスト実行

### 6.2 必要な外部サービス・データベース

**不要**: 本Issueはテストコードのみの修正であり、外部サービスやデータベースは不要です。

### 6.3 モック/スタブの必要性

**必要**:
- `fs-extra`のモック（`metadata-io.test.ts`）
- エージェント実行のモック（`agent-client-execution.test.ts`）
- ファイルシステムのモック（`metadata-persistence.test.ts`）

**修正内容**:
- `jest.mock()`から`vi.spyOn()`への変更（ESモジュールモード対応）

---

## 7. 成功基準とトレーサビリティマトリクス

### 7.1 要件との対応表

| 要件ID | 要件名 | テストケースID | テストケース名 | カバレッジ |
|--------|--------|----------------|----------------|------------|
| REQ-001 | CodexAgentClientのコンストラクタシグネチャ修正 | TC-1 | コンストラクタシグネチャの検証 | ✅ |
| REQ-002 | CodexAgentClientのexecuteTaskオプション修正 | TC-2 | executeTaskオプションの検証 | ✅ |
| REQ-003 | ClaudeAgentClientのコンストラクタシグネチャ修正 | TC-3 | コンストラクタシグネチャの検証 | ✅ |
| REQ-004 | MetadataManagerのコンストラクタ引数型修正 | TC-4 | コンストラクタ引数型の検証 | ✅ |
| REQ-005 | MetadataManagerのupdatePhaseStatusオプション修正 | TC-5 | updatePhaseStatusオプションの検証 | ✅ |
| REQ-006 | MetadataManagerのaddCost引数数修正 | TC-6 | addCost引数数の検証 | ✅ |
| REQ-007 | 統合テスト（agent-client-execution.test.ts）のAPIシグネチャ修正 | TC-11 | エージェント実行フロー統合 | ✅ |
| REQ-008 | 統合テスト（metadata-persistence.test.ts）のAPIシグネチャ修正 | TC-12 | メタデータ永続化フロー統合 | ✅ |
| REQ-009 | log-formatter.test.tsのCodexEvent['message']型修正 | TC-7 | CodexEvent['message']型の検証 | ✅ |
| REQ-010 | dependency-messages.test.tsのPhaseName型インポート修正 | TC-8 | PhaseName型インポートの検証 | ✅ |
| REQ-011 | validation.test.tsのvalidPhases配列修正 | TC-9 | validPhases配列の検証 | ✅ |
| REQ-012 | metadata-io.test.tsのjest.mock()修正 | TC-10 | ESモジュールモード対応モックの検証 | ✅ |
| REQ-013 | npm testでIssue #26のテストがすべて合格すること | 全テスト実行 | 全テスト実行シナリオ | ✅ |
| REQ-014 | カバレッジ目標の達成 | カバレッジ確認 | カバレッジ確認シナリオ | ✅ |

### 7.2 受け入れ基準との対応表

| 受け入れ基準ID | 受け入れ基準 | テストシナリオ | 達成状況 |
|----------------|--------------|----------------|----------|
| AC-001 | Issue #26のテストがすべて合格する | 全テスト実行シナリオ（4.1） | ✅ |
| AC-002 | カバレッジ目標を達成する | カバレッジ確認シナリオ（4.2） | ✅ |
| AC-003 | 既存テストの成功率を維持する | 全テスト実行シナリオ（4.1） | ✅ |
| AC-004 | Issue #26レポートが更新される | REQ-015（本フェーズではスコープ外） | Phase 7で実施 |

---

## 8. リスクと軽減策

### リスク1: APIシグネチャの理解不足

**影響度**: 高
**確率**: 低

**テスト観点**:
- テストコードの修正が正確であることを確認するため、Phase 4の実装ファイル（`src/core/*.ts`）を直接読んで確認する
- TypeScript型定義を確認してコンストラクタとメソッドのシグネチャを把握する

**軽減策**:
- テストケース1～10で型エラーが発生しないことを確認
- 統合テストシナリオ1～2で実際の動作を検証

---

### リスク2: 修正後も一部のテストが失敗

**影響度**: 中
**確率**: 低

**テスト観点**:
- 全テスト実行シナリオ（4.1）で、Issue #26のテストファイル9個がすべて合格することを確認
- 既存テストの成功率が88.1%以上を維持することを確認

**軽減策**:
- テスト失敗時の原因分析とクイック修正のバッファを確保（0.5h）
- 評価レポートの「成功したテスト」（`agent-event-parser.test.ts`、`env-setup.test.ts`）をリファレンスとして活用

---

### リスク3: カバレッジ目標未達

**影響度**: 低
**確率**: 極低

**テスト観点**:
- カバレッジ確認シナリオ（4.2）で、全体カバレッジが80%以上、新規ヘルパーモジュールが85%以上であることを確認

**軽減策**:
- Issue #26の実装は既にカバレッジ目標を考慮して設計されている
- テストコードの修正範囲が限定的（APIシグネチャのみ）であり、カバレッジへの影響は最小限

---

## 9. 品質ゲート確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **達成**: テスト戦略「UNIT_INTEGRATION」に従い、ユニットテストシナリオ（セクション2）と統合テストシナリオ（セクション3）を作成
- **根拠**: Planning Document（Line 78）とDesign Document（Line 176）で「テスト戦略: UNIT_INTEGRATION」と決定されており、本テストシナリオもこれに準拠

### ✅ 主要な正常系がカバーされている

- **達成**: すべての機能要件（REQ-001～REQ-014）に対応する正常系テストケースを作成
- **根拠**:
  - REQ-001～006: ユニットテストケース1～6
  - REQ-007～008: 統合テストシナリオ1～2
  - REQ-009～012: ユニットテストケース7～10
  - REQ-013～014: 全テスト実行シナリオとカバレッジ確認シナリオ

### ✅ 主要な異常系がカバーされている

- **達成**: 異常系テストケースは、Issue #26で既にカバーされている
- **根拠**: 本Issueは「テストコードのAPIシグネチャ修正」のみであり、新規異常系テストケースの追加は不要
- **補足**: セクション5.2で異常データを明記し、Issue #26で既にカバー済みであることを記載

### ✅ 期待結果が明確である

- **達成**: 各テストケースとシナリオで「期待結果」を明確に記載
- **根拠**:
  - ユニットテストケース1～10: 「期待結果」セクションで具体的な出力・状態変化を記載
  - 統合テストシナリオ1～2: 「期待結果」と「確認項目」チェックリストで検証ポイントを明示
  - 全テスト実行シナリオとカバレッジ確認シナリオ: 「期待結果」と「確認項目」で合格基準を明示

---

## 10. まとめ

本テストシナリオは、Issue #38（Issue #26の残タスク）のテストコード修正を検証するための詳細シナリオです。

**重要なポイント**:

1. **テスト戦略: UNIT_INTEGRATION** … 既存のユニットテスト（6ファイル）と統合テスト（2ファイル）を修正
2. **新規テストケース追加なし** … Issue #26で既に66個のユニットテストケース、6個の統合テストケースが作成されており、setup部分の修正のみ
3. **修正範囲**: テストコード9ファイル（APIシグネチャ、型定義、フェーズ名、モック方式）
4. **成功基準**: Issue #26のテスト9個すべて合格、既存テスト成功率88.1%以上維持、カバレッジ80%以上

**品質ゲート**:
- ✅ Phase 2の戦略に沿ったテストシナリオである
- ✅ 主要な正常系がカバーされている
- ✅ 主要な異常系がカバーされている（Issue #26で既にカバー済み）
- ✅ 期待結果が明確である

本テストシナリオに従ってPhase 5（テストコード実装）とPhase 6（テスト実行）を実行することで、Issue #26の残タスクを効率的に完了し、高品質なテストスイートを確立できます。

---

**テストシナリオ作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Claude Code)
**承認者**: （レビュー後に記入）
