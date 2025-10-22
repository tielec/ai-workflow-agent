# テストシナリオ - Issue #38

**Issue番号**: #38
**タイトル**: [FOLLOW-UP] Issue #26 - 残タスク
**状態**: open
**URL**: https://github.com/tielec/ai-workflow-agent/issues/38
**作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Claude Code)

---

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-38/00_planning/output/planning.md`）で策定された全体戦略を確認しました：

- **複雑度判定**: **簡単**（テストコードのAPIシグネチャ修正のみ、新規実装なし）
- **見積もり工数**: 6～9時間（1.5～2日間）
- **リスク評価**: **低**（修正内容が明確、技術的に容易）
- **実装戦略**: **EXTEND**（既存テストコードを最新APIシグネチャに適合させる）
- **テスト戦略**: **UNIT_INTEGRATION**（既存のユニットテストと統合テストを修正）
- **テストコード戦略**: **EXTEND_TEST**（既存テストファイルへの修正のみ）

**スコープの明確化**:

Issue #38は、**Issue #26のテストコード（9ファイル）をPhase 4の最新APIシグネチャに適合させる**ことが目的です。実装自体（Phase 4）は以下の点で優れていることが確認されています：

- ✅ 後方互換性100%維持
- ✅ 行数削減目標達成（250行削減、21.9%）
- ✅ コーディング規約準拠（ESLint、Prettier）
- ✅ 単一責任原則（SRP）、DRY原則の遵守
- ✅ 既存テストの88.1%（384個）が成功

したがって、本テストシナリオは**テストコード修正後の検証シナリオ**であり、**新規機能のテストシナリオではありません**。

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2の設計書で決定）

### テスト対象の範囲

**Phase 5（テストコード実装）で修正された9ファイルのテストコード**が正常に動作することを検証します：

**優先度1（APIシグネチャ修正、5ファイル）**:
1. `tests/unit/core/helpers/codex-agent-client.test.ts`
2. `tests/unit/core/helpers/claude-agent-client.test.ts`
3. `tests/unit/core/metadata-manager.test.ts`
4. `tests/integration/agent-client-execution.test.ts`
5. `tests/integration/metadata-persistence.test.ts`

**優先度2（型定義修正、2ファイル）**:
6. `tests/unit/core/helpers/log-formatter.test.ts`
7. `tests/unit/core/helpers/dependency-messages.test.ts`

**優先度3（フェーズ名修正、1ファイル）**:
8. `tests/unit/core/helpers/validation.test.ts`

**優先度4（モック方式修正、1ファイル）**:
9. `tests/unit/core/helpers/metadata-io.test.ts`

### テストの目的

1. **修正されたテストコードがPhase 4の最新APIシグネチャと一致していることを検証**
2. **Issue #26のテストファイル9個がすべて合格すること（REQ-013）**
3. **カバレッジ目標を達成すること（REQ-014）**: 全体80%以上、新規ヘルパーモジュール85%以上
4. **既存テストの成功率を維持すること（REQ-015）**: 88.1%以上
5. **Issue #26のマージ準備が完了すること**

### テスト戦略の根拠

- **既存テストの修正**: Issue #26で作成されたユニットテスト（6ファイル）と統合テスト（2ファイル）の修正が中心
- **新規テストケース追加なし**: テストシナリオは既に包括的（66個のユニットテストケース、6個の統合テストケース）
- **BDD不要**: 内部リファクタリングのテスト修正であり、ユーザーストーリー中心のテストは不要
- **Planning Documentとの整合性**: Line 78で「テスト戦略: UNIT_INTEGRATION」と判断されている

---

## 2. Unitテストシナリオ

### 2.1 優先度1: APIシグネチャ修正（5ファイル）

#### 2.1.1 CodexAgentClient - コンストラクタシグネチャ修正

**テストファイル**: `tests/unit/core/helpers/codex-agent-client.test.ts`

**テストケース名**: `CodexAgentClient_コンストラクタ_オプションオブジェクト形式`

- **目的**: `CodexAgentClient`のコンストラクタが新API（オプションオブジェクト形式）で正常に動作することを検証（REQ-001）
- **前提条件**:
  - Phase 4の実装で`CodexAgentClient`のコンストラクタが`{ workingDir: string }`形式に変更されている
  - テストコードが修正され、`new CodexAgentClient({ workingDir: '/test/workspace' })`形式で呼び出している
- **入力**:
  ```typescript
  { workingDir: '/test/workspace' }
  ```
- **期待結果**:
  - `CodexAgentClient`インスタンスが正常に生成される
  - 型エラーが発生しない
  - `client.workingDir === '/test/workspace'`である
- **テストデータ**:
  - `workingDir: '/test/workspace'`（架空のパス）

**受け入れ基準（REQ-001より）**:
- Given: `CodexAgentClient`クラスのテストコード
- When: コンストラクタを`{ workingDir: ... }`形式で呼び出す
- Then: テストが合格し、型エラーが発生しない

---

**テストケース名**: `CodexAgentClient_executeTask_workingDirectoryオプション`

- **目的**: `executeTask`メソッドのオプションキー名が`workingDirectory`であることを検証（REQ-002）
- **前提条件**:
  - Phase 4の実装で`executeTask`メソッドのオプションが`{ workingDirectory: string }`形式に変更されている
  - テストコードが修正され、`{ workingDirectory: '/test/dir' }`形式で呼び出している
- **入力**:
  ```typescript
  prompt: 'test prompt'
  options: { workingDirectory: '/test/dir' }
  ```
- **期待結果**:
  - `executeTask`が正常に実行される
  - 型エラーが発生しない
  - 正しいディレクトリ（`/test/dir`）で実行される
- **テストデータ**:
  - `prompt: 'test prompt'`
  - `workingDirectory: '/test/dir'`（架空のパス）

**受け入れ基準（REQ-002より）**:
- Given: `CodexAgentClient.executeTask()`のテストコード
- When: オプションで`workingDirectory`キーを使用する
- Then: テストが合格し、正しいディレクトリで実行される

---

#### 2.1.2 ClaudeAgentClient - コンストラクタシグネチャ修正

**テストファイル**: `tests/unit/core/helpers/claude-agent-client.test.ts`

**テストケース名**: `ClaudeAgentClient_コンストラクタ_オプションオブジェクト形式`

- **目的**: `ClaudeAgentClient`のコンストラクタが新API（オプションオブジェクト形式）で正常に動作することを検証（REQ-003）
- **前提条件**:
  - Phase 4の実装で`ClaudeAgentClient`のコンストラクタが`{ workingDir: string }`形式に変更されている
  - テストコードが修正され、`new ClaudeAgentClient({ workingDir: '/test/workspace' })`形式で呼び出している
- **入力**:
  ```typescript
  { workingDir: '/test/workspace' }
  ```
- **期待結果**:
  - `ClaudeAgentClient`インスタンスが正常に生成される
  - 型エラーが発生しない
  - `client.workingDir === '/test/workspace'`である
- **テストデータ**:
  - `workingDir: '/test/workspace'`（架空のパス）

**受け入れ基準（REQ-003より）**:
- Given: `ClaudeAgentClient`クラスのテストコード
- When: コンストラクタを`{ workingDir: ... }`形式で呼び出す
- Then: テストが合格し、型エラーが発生しない

---

#### 2.1.3 MetadataManager - コンストラクタ引数型修正

**テストファイル**: `tests/unit/core/metadata-manager.test.ts`

**テストケース名**: `MetadataManager_コンストラクタ_string型引数`

- **目的**: `MetadataManager`のコンストラクタがstring型のIssue番号を受け付けることを検証（REQ-004）
- **前提条件**:
  - Phase 4の実装で`MetadataManager`のコンストラクタ引数がnumber型からstring型に変更されている
  - テストコードが修正され、`new MetadataManager('26')`形式で呼び出している
- **入力**:
  ```typescript
  issueNumber: '26'
  ```
- **期待結果**:
  - `MetadataManager`インスタンスが正常に生成される
  - 型エラーが発生しない
  - `manager.issueNumber === '26'`である
- **テストデータ**:
  - `issueNumber: '26'`（Issue #26の番号）

**受け入れ基準（REQ-004より）**:
- Given: `MetadataManager`クラスのテストコード
- When: コンストラクタに文字列型のIssue番号を渡す
- Then: テストが合格し、型エラーが発生しない

---

**テストケース名**: `MetadataManager_updatePhaseStatus_outputFile単数形`

- **目的**: `updatePhaseStatus`メソッドのオプションが`outputFile`（単数形）であることを検証（REQ-005）
- **前提条件**:
  - Phase 4の実装で`updatePhaseStatus`のオプションキー名が`outputFiles`（複数形）から`outputFile`（単数形）に変更されている
  - テストコードが修正され、`{ outputFile: '...' }`形式で呼び出している
- **入力**:
  ```typescript
  phaseName: 'requirements'
  status: 'completed'
  options: { outputFile: '/path/to/requirements.md' }
  ```
- **期待結果**:
  - `updatePhaseStatus`が正常に実行される
  - 型エラーが発生しない
  - 正しいファイルパス（`/path/to/requirements.md`）が記録される
- **テストデータ**:
  - `phaseName: 'requirements'`
  - `status: 'completed'`
  - `outputFile: '/path/to/requirements.md'`（架空のパス）

**受け入れ基準（REQ-005より）**:
- Given: `MetadataManager.updatePhaseStatus()`のテストコード
- When: オプションで`outputFile`キー（単数形）を使用する
- Then: テストが合格し、正しいファイルパスが記録される

---

**テストケース名**: `MetadataManager_addCost_3引数`

- **目的**: `addCost`メソッドが3引数（フェーズ名、ステップ名、トークン数）で動作することを検証（REQ-006）
- **前提条件**:
  - Phase 4の実装で`addCost`メソッドの引数が4引数から3引数に変更されている（コストは自動計算）
  - テストコードが修正され、3引数で呼び出している
- **入力**:
  ```typescript
  phaseName: 'requirements'
  stepName: 'execute'
  tokens: 1000
  ```
- **期待結果**:
  - `addCost`が正常に実行される
  - 型エラーが発生しない
  - コストが自動計算される（トークン数 × 単価）
- **テストデータ**:
  - `phaseName: 'requirements'`
  - `stepName: 'execute'`
  - `tokens: 1000`

**受け入れ基準（REQ-006より）**:
- Given: `MetadataManager.addCost()`のテストコード
- When: フェーズ名、ステップ名、トークン数の3引数で呼び出す
- Then: テストが合格し、コストが自動計算される

---

### 2.2 優先度2: 型定義修正（2ファイル）

#### 2.2.1 log-formatter - CodexEvent['message']型修正

**テストファイル**: `tests/unit/core/helpers/log-formatter.test.ts`

**テストケース名**: `formatCodexLog_CodexEventMessage_オブジェクト形式`

- **目的**: `CodexEvent['message']`型がオブジェクト形式（`{ role, content }`）であることを検証（REQ-009）
- **前提条件**:
  - Phase 4の実装で`CodexEvent['message']`型が文字列からオブジェクト形式に変更されている
  - テストコードが修正され、`message: { role: 'system', content: [...] }`形式で使用している
- **入力**:
  ```typescript
  event: {
    type: 'turn_start',
    message: {
      role: 'system',
      content: [{ type: 'text', text: 'System message' }]
    },
    timestamp: '2025-01-22T10:00:00Z'
  }
  ```
- **期待結果**:
  - `formatCodexLog`が正常に実行される
  - 型エラーが発生しない
  - ログフォーマットが正しく生成される
- **テストデータ**:
  - 上記`event`オブジェクト（モックイベント）

**受け入れ基準（REQ-009より）**:
- Given: `formatCodexLog()`のテストコード
- When: `message`フィールドをオブジェクト形式で渡す
- Then: テストが合格し、型エラーが発生しない

---

#### 2.2.2 dependency-messages - PhaseName型インポート修正

**テストファイル**: `tests/unit/core/helpers/dependency-messages.test.ts`

**テストケース名**: `buildErrorMessage_PhaseName型_インポートパス`

- **目的**: `PhaseName`型が`../../../types.js`からインポートされていることを検証（REQ-010）
- **前提条件**:
  - Phase 4の実装で`PhaseName`型定義が`src/types.ts`に集約されている
  - テストコードが修正され、`import type { PhaseName } from '../../../types.js'`形式でインポートしている
- **入力**:
  ```typescript
  phaseName: '00_planning' (PhaseName型)
  dependencyPhase: '01_requirements' (PhaseName型)
  ```
- **期待結果**:
  - `buildErrorMessage`が正常に実行される
  - 型エラーが発生しない（`PhaseName`型が正しくインポートされている）
  - エラーメッセージが正しく生成される
- **テストデータ**:
  - `phaseName: '00_planning'`
  - `dependencyPhase: '01_requirements'`

**受け入れ基準（REQ-010より）**:
- Given: `buildErrorMessage()`、`buildWarningMessage()`のテストコード
- When: `PhaseName`型を`../types.js`からインポートする
- Then: テストが合格し、型エラーが発生しない

---

### 2.3 優先度3: フェーズ名修正（1ファイル）

#### 2.3.1 validation - validPhases配列修正

**テストファイル**: `tests/unit/core/helpers/validation.test.ts`

**テストケース名**: `validatePhaseName_validPhases_プレフィックス付き`

- **目的**: `validPhases`配列がプレフィックス付きフェーズ名（'00_planning'等）であることを検証（REQ-011）
- **前提条件**:
  - Phase 4の実装でフェーズ名がプレフィックス付き形式に統一されている
  - テストコードが修正され、`validPhases = ['00_planning', '01_requirements', ...]`形式で定義されている
- **入力**:
  ```typescript
  phaseName: '00_planning'
  ```
- **期待結果**:
  - `validatePhaseName('00_planning')`が`true`を返す
  - `validatePhaseName('planning')`（旧形式）が`false`を返す
  - 型エラーが発生しない
- **テストデータ**:
  - `validPhases: ['00_planning', '01_requirements', '02_design', ...]`（プレフィックス付き）

**受け入れ基準（REQ-011より）**:
- Given: `validatePhaseName()`のテストコード
- When: プレフィックス付きフェーズ名を使用する
- Then: テストが合格し、フェーズ名バリデーションが正常に動作する

---

### 2.4 優先度4: モック方式修正（1ファイル）

#### 2.4.1 metadata-io - jest.mock()修正

**テストファイル**: `tests/unit/core/helpers/metadata-io.test.ts`

**テストケース名**: `metadata-io_モック_viSpyOn形式`

- **目的**: `jest.mock()`の代わりに`vi.spyOn()`を使用してモックが正常に動作することを検証（REQ-012）
- **前提条件**:
  - ESモジュールモードでは`jest.mock()`がトップレベルで使用不可
  - テストコードが修正され、`vi.spyOn(fs, 'pathExists')`等の形式でモックを使用している
- **入力**:
  ```typescript
  // backupMetadataFile関数のテスト
  sourcePath: '/path/to/metadata.json'
  backupPath: '/path/to/backup/metadata.json'
  ```
- **期待結果**:
  - `vi.spyOn(fs, 'pathExists')`、`vi.spyOn(fs, 'copy')`等のモックが正常に動作する
  - `backupMetadataFile`関数が正常に実行される
  - 型エラーが発生しない
  - `afterEach()`でモックがリセットされる
- **テストデータ**:
  - `sourcePath: '/path/to/metadata.json'`（架空のパス）
  - `backupPath: '/path/to/backup/metadata.json'`（架空のパス）

**受け入れ基準（REQ-012より）**:
- Given: `metadata-io.ts`の関数（`backupMetadataFile()`、`removeWorkflowDirectory()`等）のテストコード
- When: ESモジュールモードでモックを使用する
- Then: テストが合格し、モック関数が正常に動作する

---

## 3. Integrationテストシナリオ

### 3.1 優先度1: エージェント実行フロー統合テスト

**テストファイル**: `tests/integration/agent-client-execution.test.ts`

#### シナリオ名: `CodexAgentClient_ClaudeAgentClient_統合実行フロー`

- **目的**: `CodexAgentClient`と`ClaudeAgentClient`が新APIシグネチャで統合動作することを検証（REQ-007）
- **前提条件**:
  - Phase 4の実装でコンストラクタがオプションオブジェクト形式に変更されている
  - テストコードが修正され、両クライアントのコンストラクタを`{ workingDir: ... }`形式で呼び出している
- **テスト手順**:
  1. `CodexAgentClient`インスタンスを`{ workingDir: '/test/workspace' }`で生成
  2. `ClaudeAgentClient`インスタンスを`{ workingDir: '/test/workspace' }`で生成
  3. `CodexAgentClient.executeTask('test prompt', { workingDirectory: '/test/dir' })`を実行
  4. `ClaudeAgentClient.executeTask('test prompt', { workingDirectory: '/test/dir' })`を実行
  5. 両クライアントのレスポンスを確認
- **期待結果**:
  - 両クライアントのインスタンスが正常に生成される
  - 両クライアントの`executeTask`が正常に実行される
  - 型エラーが発生しない
  - エージェント実行フローが正常に動作する
- **確認項目**:
  - [ ] `CodexAgentClient`のコンストラクタがオプションオブジェクト形式である
  - [ ] `ClaudeAgentClient`のコンストラクタがオプションオブジェクト形式である
  - [ ] `executeTask`のオプションが`workingDirectory`キーである
  - [ ] 両クライアントの実行結果が期待される形式である

**受け入れ基準（REQ-007より）**:
- Given: エージェント実行フローの統合テストコード
- When: `CodexAgentClient`、`ClaudeAgentClient`のコンストラクタを新API形式で呼び出す
- Then: 統合テストが合格し、エージェント実行フローが正常に動作する

---

### 3.2 優先度1: メタデータ永続化フロー統合テスト

**テストファイル**: `tests/integration/metadata-persistence.test.ts`

#### シナリオ名: `MetadataManager_永続化フロー_新APIシグネチャ`

- **目的**: `MetadataManager`が新APIシグネチャでメタデータ永続化フローを正常に実行することを検証（REQ-008）
- **前提条件**:
  - Phase 4の実装でコンストラクタ引数がstring型に、`updatePhaseStatus`が`outputFile`（単数形）に、`addCost`が3引数に変更されている
  - テストコードが修正され、すべてのAPIを新シグネチャで呼び出している
- **テスト手順**:
  1. `MetadataManager`インスタンスを`'26'`（string型）で生成
  2. `manager.updatePhaseStatus('01_requirements', 'in_progress')`を実行
  3. `manager.addCost('01_requirements', 'execute', 1000)`を実行（3引数）
  4. `manager.updatePhaseStatus('01_requirements', 'completed', { outputFile: '/path/to/requirements.md' })`を実行（`outputFile`単数形）
  5. メタデータファイルを読み込み、永続化されたデータを確認
- **期待結果**:
  - `MetadataManager`インスタンスが正常に生成される
  - すべてのメソッド呼び出しが正常に実行される
  - 型エラーが発生しない
  - メタデータが正しい形式で永続化される
  - コストが自動計算される（トークン数 × 単価）
- **確認項目**:
  - [ ] `MetadataManager`のコンストラクタ引数がstring型である
  - [ ] `updatePhaseStatus`のオプションが`outputFile`（単数形）である
  - [ ] `addCost`の引数が3引数である
  - [ ] メタデータファイルにフェーズステータスが記録されている
  - [ ] メタデータファイルにコスト情報が記録されている
  - [ ] メタデータファイルに出力ファイルパスが記録されている

**受け入れ基準（REQ-008より）**:
- Given: メタデータ永続化フローの統合テストコード
- When: `MetadataManager`のコンストラクタと各メソッドを新API形式で呼び出す
- Then: 統合テストが合格し、メタデータ永続化フローが正常に動作する

---

## 4. テストデータ

### 4.1 正常データ

**CodexAgentClient / ClaudeAgentClient**:
```typescript
{
  workingDir: '/test/workspace',
  workingDirectory: '/test/dir'
}
```

**MetadataManager**:
```typescript
{
  issueNumber: '26',
  phaseName: '01_requirements',
  status: 'completed',
  outputFile: '/path/to/requirements.md',
  stepName: 'execute',
  tokens: 1000
}
```

**CodexEvent**:
```typescript
{
  type: 'turn_start',
  message: {
    role: 'system',
    content: [{ type: 'text', text: 'System message' }]
  },
  timestamp: '2025-01-22T10:00:00Z'
}
```

**PhaseName**:
```typescript
['00_planning', '01_requirements', '02_design', '03_test-scenario', '04_implementation', '05_test-implementation', '06_testing', '07_documentation', '08_report', '09_evaluation']
```

### 4.2 異常データ

本Issueは**テストコードの技術的調整**であり、新規機能追加ではないため、異常データのテストは既存のIssue #26テストシナリオでカバー済みです。

本テストシナリオでは、**修正されたテストコードが正常に動作すること**を検証します。

### 4.3 境界値データ

本Issueは**テストコードの技術的調整**であり、新規機能追加ではないため、境界値データのテストは既存のIssue #26テストシナリオでカバー済みです。

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

- **ローカル環境**: 開発者のローカルマシンで`npm test`を実行
- **CI/CD環境**: Jenkins環境で自動テスト実行（Issue #26のCI/CD設定を使用）

### 5.2 必要な外部サービス・データベース

**なし**

本Issueはテストコードのみの修正であり、外部サービスやデータベースは使用しません。

### 5.3 モック/スタブの必要性

**必要**

- **fs-extra**: `metadata-io.test.ts`で`vi.spyOn()`を使用してモック
- **Codex API / Claude API**: `codex-agent-client.test.ts`、`claude-agent-client.test.ts`でモック（既存のIssue #26モック設定を使用）

---

## 6. テスト実行シナリオ（Phase 6）

### 6.1 テストケース: npm test実行

**目的**: Issue #26のテストファイル9個がすべて合格することを検証（REQ-013）

- **前提条件**:
  - Phase 5（テストコード実装）でREQ-001～REQ-012の修正が完了している
  - すべてのテストファイルがPhase 4の最新APIシグネチャに適合している
- **テスト手順**:
  1. プロジェクトルートで`npm test`を実行
  2. テスト結果を確認
  3. Issue #26のテストファイル9個の合格状況を確認
  4. 既存テストの成功率を確認（88.1%以上を維持）
- **期待結果**:
  - Issue #26のテストファイル9個がすべて合格する（失敗0個）
  - 既存テストの成功率が88.1%以上を維持している
  - テスト実行時間が修正前後で±10%以内である（NFR-001）
- **確認項目**:
  - [ ] `tests/unit/core/helpers/codex-agent-client.test.ts`: すべて合格
  - [ ] `tests/unit/core/helpers/claude-agent-client.test.ts`: すべて合格
  - [ ] `tests/unit/core/metadata-manager.test.ts`: すべて合格
  - [ ] `tests/integration/agent-client-execution.test.ts`: すべて合格
  - [ ] `tests/integration/metadata-persistence.test.ts`: すべて合格
  - [ ] `tests/unit/core/helpers/log-formatter.test.ts`: すべて合格
  - [ ] `tests/unit/core/helpers/dependency-messages.test.ts`: すべて合格
  - [ ] `tests/unit/core/helpers/validation.test.ts`: すべて合格
  - [ ] `tests/unit/core/helpers/metadata-io.test.ts`: すべて合格
  - [ ] 既存テストの成功率: 88.1%以上

**受け入れ基準（REQ-013より）**:
- Given: REQ-001～REQ-012の修正が完了している
- When: `npm test`を実行する
- Then: Issue #26のテストファイル9個がすべて合格する（失敗0個）

---

### 6.2 テストケース: カバレッジ確認

**目的**: カバレッジ目標を達成することを検証（REQ-014）

- **前提条件**:
  - Phase 5（テストコード実装）でREQ-001～REQ-012の修正が完了している
  - REQ-013（npm test）が合格している
- **テスト手順**:
  1. プロジェクトルートで`npm run test:coverage`を実行
  2. カバレッジレポート（HTML形式）を確認
  3. 全体カバレッジを確認
  4. 新規ヘルパーモジュール（6ファイル）のカバレッジを確認
- **期待結果**:
  - 全体カバレッジが80%以上である
  - 新規ヘルパーモジュール（6ファイル）のカバレッジが85%以上である
  - カバレッジレポート生成時間が修正前後で±15%以内である（NFR-001）
- **確認項目**:
  - [ ] 全体カバレッジ: ≥80%
  - [ ] `src/core/helpers/agent-event-parser.ts`: ≥85%
  - [ ] `src/core/helpers/log-formatter.ts`: ≥85%
  - [ ] `src/core/helpers/env-setup.ts`: ≥85%
  - [ ] `src/core/helpers/metadata-io.ts`: ≥85%
  - [ ] `src/core/helpers/validation.ts`: ≥85%
  - [ ] `src/core/helpers/dependency-messages.ts`: ≥85%

**受け入れ基準（REQ-014より）**:
- Given: REQ-001～REQ-013の修正が完了している
- When: `npm run test:coverage`を実行する
- Then: 全体カバレッジが80%以上、新規ヘルパーモジュールが85%以上である

---

## 7. ドキュメント更新シナリオ（Phase 7）

### 7.1 テストケース: Issue #26レポート更新

**目的**: Issue #26レポートの「テスト結果」セクションが更新されていることを検証（REQ-015）

- **前提条件**:
  - Phase 5（テストコード実装）でREQ-001～REQ-012の修正が完了している
  - Phase 6（テスト実行）でREQ-013～REQ-014が合格している
- **テスト手順**:
  1. `.ai-workflow/issue-26/08_report/output/report.md`を開く
  2. 「テスト結果」セクションを確認
  3. テスト合格率を確認
  4. カバレッジ結果を確認
  5. 「マージ推奨」の表記を確認
- **期待結果**:
  - 「テスト結果」セクションに最新のテスト結果が反映されている
  - テスト合格率が100%（52個中52個合格）である
  - カバレッジ結果が記載されている（全体80%以上、新規ヘルパーモジュール85%以上）
  - 「✅ マージ推奨」の表記がある
- **確認項目**:
  - [ ] テスト合格率: 100%（52個中52個合格）
  - [ ] 失敗したテスト: 0個
  - [ ] カバレッジ: 全体≥80%、新規ヘルパーモジュール≥85%
  - [ ] 「✅ マージ推奨」の表記がある

**受け入れ基準（REQ-015より）**:
- Given: REQ-001～REQ-014の修正が完了している
- When: `report.md`を更新する
- Then: 「テスト結果」セクションに最新のテスト結果（合格率100%、カバレッジ結果）が反映され、「✅ マージ推奨」の表記がある

---

## 8. 品質ゲート確認

### Phase 3品質ゲート

本テストシナリオは以下の品質ゲートを満たしています：

- ✅ **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテスト（セクション2）と統合テスト（セクション3）を作成
- ✅ **主要な正常系がカバーされている**: REQ-001～REQ-015のすべての要件に対応するテストシナリオを作成
- ✅ **主要な異常系がカバーされている**: 既存のIssue #26テストシナリオでカバー済み（本Issueは技術的調整のみ）
- ✅ **期待結果が明確である**: 各テストケースに「期待結果」と「確認項目」を明記

### 全体的な受け入れ基準（要件定義書より）

本テストシナリオは、以下の**すべての全体的な受け入れ基準**を検証するシナリオを含んでいます：

- ✅ **AC-001**: セクション6.1でREQ-013（npm testですべて合格）を検証
- ✅ **AC-002**: セクション6.2でREQ-014（カバレッジ目標達成）を検証
- ✅ **AC-003**: セクション6.1でREQ-013（既存テスト成功率88.1%以上維持）を検証
- ✅ **AC-004**: セクション7.1でREQ-015（Issue #26レポート更新）を検証

---

## 9. まとめ

本テストシナリオは、Issue #38（Issue #26の残タスク）のテストコード修正後の検証を実現するための詳細なシナリオです。

**重要なポイント**:

1. **テスト戦略: UNIT_INTEGRATION** … ユニットテスト（セクション2）と統合テスト（セクション3）を作成
2. **テスト対象: 修正されたテストコード9ファイル** … Phase 5で修正されたテストコードが正常に動作することを検証
3. **主要な検証項目**:
   - REQ-001～REQ-012: APIシグネチャ、型定義、フェーズ名、モック方式の修正が正しく反映されている
   - REQ-013: npm testでIssue #26のテスト9個がすべて合格する
   - REQ-014: カバレッジ目標を達成する（全体80%以上、新規ヘルパーモジュール85%以上）
   - REQ-015: Issue #26レポートが更新される
4. **既存テストシナリオの活用**: 既存のIssue #26テストシナリオ（66個のユニットテストケース、6個の統合テストケース）は包括的であり、本Issueでは新規テストケース追加は不要
5. **品質ゲート達成**: Phase 3の4つの品質ゲートをすべて満たしている

本テストシナリオに従ってPhase 6（テスト実行）とPhase 7（ドキュメント更新）を実行することで、Issue #26の残タスクを効率的に完了し、高品質なテストスイートを確立できます。

---

**テストシナリオ作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Claude Code)
**承認者**: （レビュー後に記入）
