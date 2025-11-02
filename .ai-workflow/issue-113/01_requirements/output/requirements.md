# 要件定義書 - Issue #113

## 0. Planning Documentの確認

Planning Document（@.ai-workflow/issue-113/00_planning/output/planning.md）を確認しました。

**開発計画の概要**:
- **複雑度**: 中程度
- **見積もり工数**: 12~16時間
- **実装戦略**: EXTEND（既存の`BasePhase.executePhaseTemplate()`を拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）

**主要リスク**:
- BasePhase変更によるリグレッション（軽減策: デフォルト動作維持、既存テスト実行）
- エージェント挙動変化（軽減策: Evaluation Phaseの実績あるパターン流用）
- ログ解析ロジックの複雑化（軽減策: Evaluation Phaseの実装流用）

これらの計画を踏まえ、以下の要件定義を実施します。

---

## 1. 概要

### 背景

現在、AI Workflow Agentの`evaluation`フェーズのみが、エージェントが成果物ファイル（`evaluation_report.md`）を生成しなかった場合のフォールバック処理を実装しています（`src/phases/evaluation.ts:144-156`, `handleMissingEvaluationFile()`）。他のフェーズ（Planning、Requirements、Design、TestScenario、Implementation、Report）でも同様にエージェントがファイルを生成しないケースがあるため、同じフォールバック機構を導入する必要があります。

### 目的

全フェーズにEvaluation Phaseのフォールバック機構を導入することで、以下の目標を達成します：

1. **ワークフローの堅牢性向上**: エージェントがファイル生成に失敗した場合でも自動的にリカバリー
2. **ユーザーの手動介入削減**: エージェントログからの抽出、または自動修正（revise）により、ユーザーの手動修正を不要化
3. **一貫性の確保**: 全フェーズで統一されたフォールバック戦略を採用

### ビジネス価値・技術的価値

**ビジネス価値**:
- **ワークフローの成功率向上**: エージェントのファイル生成失敗時の自動リカバリーにより、ワークフローの完遂率が向上
- **運用コスト削減**: ユーザーの手動介入が減少し、CI/CD環境での無人運用が可能に

**技術的価値**:
- **保守性向上**: BasePhaseへの集約により、フォールバック機構の保守が容易に
- **拡張性向上**: 新規フェーズ追加時、フォールバック機構が自動的に利用可能
- **コード重複削減**: Evaluation Phaseの実装を汎用化して再利用

---

## 2. 機能要件

以下の機能要件は、Planning Documentの「## 4. タスク分割」セクションから抽出し、検証可能な形で記述しています。

### FR-1: BasePhaseへの汎用フォールバック機構の実装

**優先度**: 高

**説明**:
`BasePhase`クラスに汎用的なフォールバックメソッドを追加し、全フェーズで再利用可能にします。

**詳細要件**:
- `BasePhase`に`handleMissingOutputFile(phaseOutputFile: string, logDir: string): Promise<void>`メソッドを追加
- `BasePhase`に`extractContentFromLog(logDir: string, phaseType: string): Promise<string | null>`メソッドを追加（Evaluation Phaseの`extractEvaluationFromLog()`を汎用化）
- Evaluation Phaseの`handleMissingEvaluationFile()`（521-660行）の実装パターンを参考にする

**受け入れ基準**:
- Given: エージェントがファイル生成に失敗した
- When: `handleMissingOutputFile()`が呼び出された
- Then: エージェントログからファイル内容を抽出し、ファイルを生成する

### FR-2: executePhaseTemplate()へのフォールバックロジック統合

**優先度**: 高

**説明**:
`BasePhase.executePhaseTemplate()`メソッドを拡張し、ファイルが生成されなかった場合にフォールバックロジックを自動的に実行します。

**詳細要件**:
- `executePhaseTemplate()`のオプションパラメータに`enableFallback?: boolean`を追加
- ファイル不在時（332-337行のエラー処理）に、`enableFallback: true`の場合はフォールバック処理を実行
- フォールバックフロー: ファイル不在 → ログ抽出 → ファイル生成成功 → 成功を返す / ログ抽出失敗 → revise呼び出し

**受け入れ基準**:
- Given: `executePhaseTemplate()`が`enableFallback: true`で呼び出された
- When: 成果物ファイルが存在しない
- Then: フォールバック処理が実行され、ログ抽出またはreviseによりファイルが生成される

### FR-3: 各フェーズでのフォールバック有効化

**優先度**: 高

**説明**:
6フェーズ（Planning、Requirements、Design、TestScenario、Implementation、Report）の`execute()`メソッドで、フォールバック機構を有効化します。

**詳細要件**:
- 各フェーズの`execute()`メソッドで`executePhaseTemplate()`呼び出し時に`enableFallback: true`オプションを指定
- 各フェーズでフォールバック機構が動作することをユニットテストで確認
- フォールバック有効化後も既存の動作に影響がないことを確認（リグレッションテスト）

**受け入れ基準**:
- Given: 各フェーズが実行される
- When: エージェントがファイル生成に失敗する
- Then: フォールバック機構が自動的に動作し、ファイルが生成される

### FR-4: Reviseプロンプトの最適化

**優先度**: 高

**説明**:
6フェーズのreviseプロンプトをEvaluation Phaseのパターンに更新し、ファイル未作成ケースへの対応を強化します。

**詳細要件**:
- 各フェーズのrevise.txtに「⚠️ 最重要：必須アクション」セクションを追加し、Writeツール使用を明示的に指示
- `{previous_log_snippet}`変数を追加し、前回のエージェントログスニペット（最大2000文字）を提供
- ファイル未作成ケースの対応手順を詳細に記載（ログからの抽出、または新規作成）

**受け入れ基準**:
- Given: reviseステップが実行される
- When: プロンプトテンプレートが読み込まれる
- Then: 「⚠️ 最重要：必須アクション」セクションと`{previous_log_snippet}`変数が含まれる

### FR-5: Reviseメソッドへのログスニペット注入

**優先度**: 高

**説明**:
各フェーズの`revise()`メソッドで、`previous_log_snippet`変数にエージェントログの一部を注入します。

**詳細要件**:
- `execute/agent_log.md`から最大2000文字を抽出
- プロンプトテンプレートの`{previous_log_snippet}`変数を置換
- ログが存在しない場合は「（ログなし）」を設定

**受け入れ基準**:
- Given: reviseステップが実行される
- When: エージェントログが存在する
- Then: ログの最初の2000文字がプロンプトに注入される

### FR-6: 型定義の更新

**優先度**: 中

**説明**:
`ExecutePhaseOptions`インターフェースに`enableFallback`オプションを追加します。

**詳細要件**:
- `src/types/commands.ts`（または該当ファイル）の`ExecutePhaseOptions`に`enableFallback?: boolean`を追加
- TypeScriptの型チェックでエラーが発生しないことを確認

**受け入れ基準**:
- Given: 型定義ファイルを編集する
- When: `ExecutePhaseOptions`に`enableFallback`を追加する
- Then: TypeScriptコンパイルが成功する

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **ログ抽出処理**: エージェントログ（最大100KB想定）からの抽出処理は5秒以内に完了すること
- **フォールバック処理全体**: ログ抽出 → revise呼び出しまでの処理は1分以内に完了すること（エージェント実行時間を除く）

### NFR-2: セキュリティ要件

- **ログ解析の安全性**: エージェントログの解析で任意コード実行が発生しないこと（正規表現によるパターンマッチングのみ使用）
- **ファイル生成の安全性**: フォールバック処理で生成されるファイルが、指定ディレクトリ（`.ai-workflow/issue-<NUM>/<PHASE>/output/`）外に書き込まれないこと

### NFR-3: 可用性・信頼性要件

- **フォールバック失敗時の挙動**: フォールバック処理が失敗した場合、エラーメッセージを明示的に返すこと（ワークフロー全体をクラッシュさせない）
- **リトライ回数**: reviseステップは最大3回までリトライすること（既存の`MAX_RETRIES`と同じ）

### NFR-4: 保守性・拡張性要件

- **コードの再利用性**: Evaluation Phaseの実装を汎用化して再利用すること（コード重複を避ける）
- **新規フェーズへの適用**: 新規フェーズ追加時、`executePhaseTemplate()`を使用すれば自動的にフォールバック機構が利用可能であること
- **ログ出力**: フォールバック処理の各ステップで適切なログを出力し、デバッグを容易にすること（`logger.info()`, `logger.warn()`, `logger.error()`を使用）

---

## 4. 制約事項

### 技術的制約

- **既存コードとの整合性**:
  - 統一loggerモジュール（`src/utils/logger.ts`）を使用すること（`console.log`禁止）
  - エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）の`getErrorMessage()`, `getErrorStack()`を使用すること（`as Error`禁止）
  - 環境変数アクセスは`src/core/config.ts`のConfigクラスを経由すること（`process.env`直接アクセス禁止）

- **使用技術**:
  - TypeScript（既存プロジェクトと同じバージョン）
  - Node.js 20以上
  - 正規表現によるログ解析（Evaluation Phaseのパターンを踏襲）

### リソース制約

- **工数**: 12~16時間（Planning Documentの見積もり）
- **スケジュール**: Phase 1~8を順次実行（Phase 0: Planning完了済み）

### ポリシー制約

- **コーディング規約**: CLAUDE.mdの「## 重要な制約事項」セクションに従う
  - ロギング規約（Issue #61）: console.log等禁止、統一loggerモジュール使用
  - 環境変数アクセス規約（Issue #51）: process.env禁止、Configクラス使用
  - エラーハンドリング規約（Issue #48）: `as Error`禁止、error-utils使用

- **テストカバレッジ**: 新規コードのカバレッジは80%以上とすること

---

## 5. 前提条件

### システム環境

- Node.js 20以上
- TypeScript（既存プロジェクトと同じバージョン）
- npm 10以上

### 依存コンポーネント

- `fs-extra`: ファイルシステム操作
- `path`: パス操作
- `BasePhase`: フェーズ基底クラス
- `MetadataManager`: メタデータ管理
- `logger`: 統一ログモジュール
- `error-utils`: エラーハンドリングユーティリティ

### 外部システム連携

- なし（内部ロジックの改善のみ）

---

## 6. 受け入れ基準

### FR-1: BasePhaseへの汎用フォールバック機構の実装

- **Given**: エージェントが`execute`ステップでファイル生成に失敗した
- **When**: `handleMissingOutputFile()`が呼び出された
- **Then**:
  - エージェントログ（`execute/agent_log.md`）が読み込まれる
  - `extractContentFromLog()`でログから成果物内容を抽出する
  - 抽出した内容が妥当である場合、成果物ファイルとして保存される
  - 抽出失敗時は、`revise()`メソッドが呼び出される

### FR-2: executePhaseTemplate()へのフォールバックロジック統合

- **Given**: `executePhaseTemplate()`が`enableFallback: true`で呼び出された
- **When**: エージェント実行後、成果物ファイルが存在しない
- **Then**:
  - `handleMissingOutputFile()`が自動的に呼び出される
  - ファイル生成に成功した場合、`{ success: true, output: <filepath> }`を返す
  - ファイル生成に失敗した場合、`{ success: false, error: <message> }`を返す

### FR-3: 各フェーズでのフォールバック有効化

- **Given**: Planning、Requirements、Design、TestScenario、Implementation、Reportの各フェーズが実行される
- **When**: エージェントがファイル生成に失敗する
- **Then**:
  - フォールバック処理が自動的に実行される
  - ログ抽出またはreviseによりファイルが生成される
  - メタデータに適切なエラー情報が記録される

### FR-4: Reviseプロンプトの最適化

- **Given**: 各フェーズのrevise.txtが読み込まれる
- **When**: プロンプトテンプレートが解析される
- **Then**:
  - 「⚠️ 最重要：必須アクション」セクションが存在する
  - `{previous_log_snippet}`プレースホルダーが存在する
  - ファイル未作成ケースの対応手順が詳細に記載されている

### FR-5: Reviseメソッドへのログスニペット注入

- **Given**: reviseステップが実行される
- **When**: エージェントログ（`execute/agent_log.md`）が存在する
- **Then**:
  - ログの最初の2000文字が読み込まれる
  - `{previous_log_snippet}`変数が置換される
  - エージェントにログスニペットが提供される

### FR-6: 型定義の更新

- **Given**: TypeScriptコンパイラで型チェックが実行される
- **When**: `ExecutePhaseOptions`インターフェースに`enableFallback`プロパティが追加されている
- **Then**:
  - コンパイルエラーが発生しない
  - `enableFallback?: boolean`が正しく認識される

---

## 7. スコープ外

以下の事項は、本Issue（#113）のスコープ外とします：

### 明確にスコープ外とする事項

- **TestImplementation Phase、Testing Phase、Documentation Phaseへのフォールバック機構の導入**: これらのフェーズは成果物生成パターンが異なるため、別Issueで検討する
- **エージェントログフォーマットの変更**: 既存のログフォーマット（Codex/Claude共通）を前提とする
- **フォールバック機構のUI化**: CLI環境での動作のみをサポート
- **フォールバック成功率の統計情報収集**: メタデータへの記録のみ行い、統計分析機能は別Issueで検討

### 将来的な拡張候補

- **フォールバック戦略のカスタマイズ**: フェーズごとに異なるフォールバック戦略を設定可能にする（例: ログ抽出のみ、reviseのみ、両方）
- **フォールバックトリガー条件の拡張**: ファイル不在だけでなく、空ファイル、不正フォーマットファイルも検出する
- **複数ファイル生成フェーズへの対応**: Implementation Phaseのように複数ファイルを生成するフェーズでのフォールバック機構
- **エージェントログ以外のソースからの抽出**: GitHubコメント、Issue本文などからの情報抽出

---

## 8. 補足情報

### Evaluation Phaseのフォールバック機構（参考）

Evaluation Phaseで実装済みのフォールバック機構の仕様を以下に示します。

**実装箇所**: `src/phases/evaluation.ts:521-660`

**フォールバックフロー**:
1. **ファイル不在チェック**: `execute()`完了後、`evaluation_report.md`の存在を確認（144行）
2. **ログ抽出（Step 1）**: `extractEvaluationFromLog()`でエージェントログから評価内容を抽出（545-548行）
   - パターン1: `# 評価レポート`または`# Evaluation Report`から始まるセクション
   - パターン2: `DECISION:`キーワードを含む大きなブロック
   - 妥当性チェック: 100文字以上、`DECISION:`キーワード含む、セクションヘッダー2個以上
3. **ファイル生成**: 抽出した内容を`evaluation_report.md`として保存（553行）
4. **Revise呼び出し（Step 2）**: 抽出失敗時、`revise()`メソッドで再実行（560-572行）

**Reviseプロンプトの特徴**（`src/prompts/evaluation/revise.txt`）:
- **「⚠️ 最重要：必須アクション」セクション**: Writeツール使用を明示的に指示（5-14行）
- **前回のログスニペット提供**: `{previous_log_snippet}`変数（31-37行）
- **ケースA: ファイル未作成の場合の対応手順**: ログからの抽出または新規作成（41-52行）

この実装を参考に、他のフェーズでも同様の機構を導入します。

---

## 9. 変更が必要なファイル一覧

Planning Documentの「## 3. 影響範囲分析」セクションから抽出しました。

### コアロジック

1. `src/phases/base-phase.ts` (約476行)
   - `executePhaseTemplate()`の拡張（フォールバックロジック追加）
   - 汎用フォールバックメソッドの追加（`handleMissingOutputFile()`, `extractContentFromLog()`）

2. `src/phases/core/agent-executor.ts` (約270行)
   - エージェントログ保存ロジックの確認（フォールバックで使用）

### 各フェーズファイル

3. `src/phases/planning.ts`
4. `src/phases/requirements.ts`
5. `src/phases/design.ts`
6. `src/phases/test-scenario.ts`
7. `src/phases/implementation.ts`
8. `src/phases/report.ts`

各ファイルで：
- `execute()`メソッドに`enableFallback: true`オプション追加
- （必要に応じて）フェーズ固有のフォールバック処理のカスタマイズ

### プロンプトファイル

9. `src/prompts/planning/revise.txt`
10. `src/prompts/requirements/revise.txt`
11. `src/prompts/design/revise.txt`
12. `src/prompts/test-scenario/revise.txt`
13. `src/prompts/implementation/revise.txt`
14. `src/prompts/report/revise.txt`

各ファイルで：
- 「⚠️ 最重要：必須アクション」セクション追加
- Writeツール使用を明示的に指示
- `{previous_log_snippet}`変数の追加

### 型定義

15. `src/types/commands.ts` (または該当する型定義ファイル)
    - `ExecutePhaseOptions`インターフェースに`enableFallback?: boolean`追加

---

## 10. 品質ゲート確認チェックリスト

以下のチェックリストは、要件定義書の品質を確保するためのものです。

- [x] **機能要件が明確に記載されている**: FR-1〜FR-6で6つの機能要件を定義
- [x] **受け入れ基準が定義されている**: 各機能要件にGiven-When-Then形式の受け入れ基準を記載
- [x] **スコープが明確である**: スコープ外の事項を明示（TestImplementation/Testing/Documentationフェーズはスコープ外）
- [x] **論理的な矛盾がない**: Planning Documentの戦略（EXTEND、UNIT_INTEGRATION、BOTH_TEST）と整合性あり

---

**以上、要件定義書の完成版です。**
