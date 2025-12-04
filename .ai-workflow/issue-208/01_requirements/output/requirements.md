# 要件定義書 - Issue #208

## 0. Planning Documentの確認

Planning Documentから以下の重要な戦略を確認しました：

- **実装戦略**: EXTEND（既存コード拡張）
  - `rollback.ts`のバリデーションロジック拡張
  - `metadata-manager.ts`に整合性チェックメソッド追加
  - 必要に応じて`evaluation.ts`のフェーズリセット処理を修正

- **テスト戦略**: UNIT_INTEGRATION
  - ユニットテスト：バリデーションロジックの単体テスト
  - インテグレーションテスト：ワークフロー全体での動作確認

- **リスク評価**: 中（影響範囲が広く、根本原因が不明）
  - メタデータ整合性チェックは、rollback以外のフェーズにも影響する可能性
  - バリデーション追加により、既存の正常なワークフローが誤検知される可能性

- **見積もり工数**: 8~12時間

## 1. 概要

### 1.1. 背景

AI Workflow Agentの`metadata.json`において、`status: "pending"`のフェーズに`completed_steps: ["execute", "review"]`が設定される不整合が発生している。この不整合により、`rollback`コマンドが「フェーズがまだ開始されていない」というエラーで失敗し、ワークフローの差し戻し機能が使用できない状態になっている。

不整合は以下のような状態で発生：
- `status: "pending"` → 未開始を示す
- `completed_steps: ["execute", "review"]` → 既に実行済みステップが存在

この矛盾により、`rollback`コマンドのバリデーション（`status === 'pending'`のみをチェック）が不適切に動作し、実際には作業が進行しているフェーズを「未開始」と誤判定している。

### 1.2. 目的

本Issue修正により、以下を実現する：

1. **メタデータの不整合を許容する柔軟なバリデーション**：`rollback`コマンドが`completed_steps`を考慮してフェーズの開始状態を正しく判定できるようにする
2. **整合性チェックの自動化**：メタデータ更新時に`status`と`completed_steps`の整合性を自動検証し、不整合を早期検出・警告する
3. **根本原因の特定と修正**：不整合が発生する根本原因（Evaluation Phase、マイグレーション処理、Jenkins環境の同期問題）を特定し、必要に応じて修正する

### 1.3. ビジネス価値・技術的価値

- **ビジネス価値**：
  - ワークフローの差し戻し機能が確実に動作し、開発効率が向上
  - メタデータの整合性が保たれ、ワークフローの信頼性が向上
  - 手動でのメタデータ修正作業が不要になり、オペレーションコストが削減

- **技術的価値**：
  - メタデータ管理の堅牢性が向上し、将来的な不整合の発生を予防
  - 防御的プログラミング（Defensive Programming）により、不整合状態でも動作可能なシステムを実現
  - 既存の正常なワークフローへの影響を最小化し、後方互換性を維持

## 2. 機能要件

### FR-1: Rollbackバリデーションロジックの改善（優先度：高）

**説明**：`src/commands/rollback.ts`の`validateRollbackOptions()`メソッドを改善し、`completed_steps`を考慮してフェーズの開始状態を判定する。

**詳細要件**：
- **FR-1.1**: `status === 'pending'`のフェーズでも、`completed_steps`が空でない場合は「開始済み」として扱う
- **FR-1.2**: `completed_steps`が空でない場合、差し戻し可能なフェーズとして判定する
- **FR-1.3**: エラーメッセージを改善し、ユーザーに不整合の原因を明示する
  - 現在：「フェーズがまだ開始されていない」
  - 改善後：「フェーズのステータスは'pending'ですが、completed_stepsが存在するため開始済みと判定しました」

**受け入れ基準**：
- Given: `status: "pending"`かつ`completed_steps: ["execute", "review"]`のフェーズが存在
- When: `rollback --to-phase <phase>`コマンドを実行
- Then: エラーが発生せず、差し戻しが成功する

### FR-2: MetadataManager整合性チェックメソッドの追加（優先度：高）

**説明**：`src/core/metadata-manager.ts`に新規メソッド`validatePhaseConsistency()`を追加し、フェーズの整合性をチェックする。

**詳細要件**：
- **FR-2.1**: `validatePhaseConsistency(phaseName: PhaseName): ValidationResult`メソッドを実装
- **FR-2.2**: 以下の不整合パターンを検出：
  - `status === 'pending'` かつ `completed_steps.length > 0` → 警告
  - `status === 'completed'` かつ `completed_steps.length === 0` → 警告
  - `status === 'in_progress'` かつ `started_at === null` → 警告
- **FR-2.3**: 不整合検出時は警告ログを出力し、処理は継続（エラーで停止しない）
- **FR-2.4**: `resetSubsequentPhases()`および`updatePhaseForRollback()`メソッド内で`validatePhaseConsistency()`を呼び出し、整合性チェックを自動実行

**受け入れ基準**：
- Given: `status: "pending"`かつ`completed_steps: ["execute"]`のメタデータが存在
- When: `resetSubsequentPhases()`または`updatePhaseForRollback()`を実行
- Then: 警告ログ「Phase <phase>: status is 'pending' but completed_steps is not empty」が出力される
- And: 処理は継続され、エラーで停止しない

### FR-3: Evaluation Phaseのフェーズリセット処理の調査と修正（優先度：中）

**説明**：`src/phases/evaluation.ts`の`rollbackToPhase()`メソッド（行247付近）を調査し、`completed_steps`が正しくリセットされているか確認する。

**詳細要件**：
- **FR-3.1**: `evaluation.ts`の`rollbackToPhase()`メソッドを調査し、フェーズリセット時の処理を確認
- **FR-3.2**: `resetSubsequentPhases()`が`status`と`completed_steps`を同時にリセットしているか確認
- **FR-3.3**: 必要に応じて、`completed_steps: []`の明示的なリセット処理を追加
- **FR-3.4**: Issue #194（スカッシュコミット機能）との関連を調査し、不整合の原因を特定

**受け入れ基準**：
- Given: Evaluation Phaseで`FAIL_PHASE_TEST_IMPLEMENTATION`の判定が発生
- When: 後続フェーズ（test_implementation、testing、documentation、report）がリセットされる
- Then: すべてのフェーズで`status: "pending"`かつ`completed_steps: []`が設定される

### FR-4: Jenkins環境とローカル環境のメタデータ同期調査（優先度：低）

**説明**：Jenkins上の一時ディレクトリで実行されたワークフローのメタデータとローカルのメタデータが不整合な状態でマージされる問題を調査する。

**詳細要件**：
- **FR-4.1**: Jenkins環境でのワークフロー実行ログを調査
- **FR-4.2**: Git pull/pushでメタデータが正しく同期されているか確認
- **FR-4.3**: メタデータのマージ競合が発生していないか確認

**受け入れ基準**：
- Given: Jenkins環境でワークフローを実行
- When: ローカル環境でメタデータを確認
- Then: `status`と`completed_steps`の整合性が保たれている

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **NFR-1.1**: `validatePhaseConsistency()`メソッドは1フェーズあたり10ms以内で完了すること
- **NFR-1.2**: 整合性チェックによるワークフロー全体の実行時間への影響は1%以内に抑えること

### NFR-2: セキュリティ要件

- **NFR-2.1**: メタデータファイル（`metadata.json`）の読み書き時、パストラバーサル攻撃を防止すること
- **NFR-2.2**: バリデーションロジックでユーザー入力（フェーズ名）を適切にサニタイズすること

### NFR-3: 可用性・信頼性要件

- **NFR-3.1**: 不整合検出時も処理を継続し、ワークフロー全体が停止しないこと（防御的プログラミング）
- **NFR-3.2**: 既存の正常なワークフローに影響を与えず、後方互換性を維持すること
- **NFR-3.3**: バリデーション失敗時は詳細なログを出力し、デバッグを容易にすること

### NFR-4: 保守性・拡張性要件

- **NFR-4.1**: `validatePhaseConsistency()`メソッドは単一責任原則（SRP）に従い、整合性チェックのみを担当すること
- **NFR-4.2**: 新規の不整合パターンが追加された場合、容易に拡張できる設計とすること
- **NFR-4.3**: ユニットテストで全メソッドの動作を保証し、カバレッジ90%以上を維持すること

## 4. 制約事項

### 4.1. 技術的制約

- **TC-1**: TypeScript 5.x の型システムに準拠すること
- **TC-2**: 既存の`MetadataManager`クラスのインターフェース（公開メソッド）を変更しないこと（後方互換性）
- **TC-3**: 既存の`rollback`コマンドのCLIオプションを変更しないこと
- **TC-4**: `metadata.json`のスキーマ（データ構造）を変更しないこと

### 4.2. リソース制約

- **RC-1**: 実装工数は8~12時間以内に収めること（Planning Documentの見積もりに準拠）
- **RC-2**: 変更対象ファイルは2~3ファイルに限定すること
  - `src/commands/rollback.ts`
  - `src/core/metadata-manager.ts`
  - （必要に応じて）`src/phases/evaluation.ts`

### 4.3. ポリシー制約

- **PC-1**: CLAUDE.mdの開発ガイドライン（ロギング規約、エラーハンドリング規約、環境変数アクセス規約）に準拠すること
- **PC-2**: Issue #48のエラーハンドリングユーティリティ（`getErrorMessage()`, `getErrorStack()`）を使用すること
- **PC-3**: Issue #61の統一loggerモジュール（`logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`）を使用すること
- **PC-4**: `console.log`の直接使用は禁止（ESLintの`no-console`ルールで強制）

## 5. 前提条件

### 5.1. システム環境

- Node.js 20.x 以上
- TypeScript 5.x
- Jest（テストフレームワーク）

### 5.2. 依存コンポーネント

- `src/core/metadata-manager.ts`：メタデータの読み書きと整合性チェック
- `src/commands/rollback.ts`：差し戻しコマンドの実装
- `src/phases/evaluation.ts`：評価フェーズとフェーズリセット処理
- `src/utils/logger.ts`：統一ログモジュール（Issue #61）
- `src/utils/error-utils.ts`：エラーハンドリングユーティリティ（Issue #48）

### 5.3. 外部システム連携

- Git：メタデータのバージョン管理
- GitHub：Issue情報の取得
- Jenkins（任意）：CI/CD環境でのワークフロー実行

## 6. 受け入れ基準

### AC-1: Rollbackバリデーションロジックの改善

- **Given**: `metadata.json`に以下の状態のフェーズが存在
  ```json
  "test_implementation": {
    "status": "pending",
    "completed_steps": ["execute", "review"]
  }
  ```
- **When**: `rollback --issue 194 --to-phase test_implementation --to-step revise --reason "test"`を実行
- **Then**: エラーが発生せず、差し戻しが成功する
- **And**: ログに「Phase test_implementation: status is 'pending' but completed_steps is not empty, treating as started」という警告が出力される

### AC-2: MetadataManager整合性チェック

- **Given**: `status: "pending"`かつ`completed_steps: ["execute"]`のフェーズが存在
- **When**: `updatePhaseForRollback()`または`resetSubsequentPhases()`を実行
- **Then**: 警告ログ「[WARN] Phase <phase>: status is 'pending' but completed_steps is not empty」が出力される
- **And**: メソッド実行は継続され、エラーで停止しない

### AC-3: Evaluation Phaseのフェーズリセット

- **Given**: Evaluation Phaseで`FAIL_PHASE_TEST_IMPLEMENTATION`の判定が発生
- **When**: `resetSubsequentPhases()`が呼び出される
- **Then**: 後続フェーズ（test_implementation、testing、documentation、report）のメタデータが以下の状態にリセットされる
  ```json
  {
    "status": "pending",
    "completed_steps": [],
    "started_at": null,
    "current_step": null
  }
  ```

### AC-4: 既存ワークフローへの影響確認

- **Given**: 正常な`metadata.json`（`status`と`completed_steps`が整合している状態）
- **When**: `rollback`コマンドまたは`resetSubsequentPhases()`を実行
- **Then**: 既存の動作が変更されず、後方互換性が維持される
- **And**: 不要な警告ログが出力されない

### AC-5: ユニットテスト

- **Given**: `validateRollbackOptions()`および`validatePhaseConsistency()`のテストケースが実装されている
- **When**: `npm run test:unit`を実行
- **Then**: すべてのテストがパスする
- **And**: 新規コードのカバレッジが90%以上である

### AC-6: インテグレーションテスト

- **Given**: 不整合状態の`metadata.json`を含むテストシナリオが実装されている
- **When**: `npm run test:integration`を実行
- **Then**: 不整合状態でのrollback成功シナリオがパスする
- **And**: 既存の正常なワークフローへの影響がないことが確認される

## 7. スコープ外

### 7.1. 明確にスコープ外とする事項

以下の事項は本Issueのスコープ外とする：

1. **メタデータの自動マイグレーション**：
   - 既存の不整合状態の`metadata.json`を自動的に修正する機能は実装しない
   - 理由：rollback実行時に自動修正されるため、追加のマイグレーション処理は不要

2. **Jenkins環境のメタデータ同期改善**：
   - Jenkins環境でのメタデータ同期問題の抜本的な改善は行わない
   - 理由：調査の結果、問題が確認されなかった場合は対応不要

3. **メタデータスキーマの変更**：
   - `metadata.json`のデータ構造（スキーマ）は変更しない
   - 理由：後方互換性を維持し、既存のワークフローへの影響を最小化

4. **Rollbackコマンドの新機能追加**：
   - `rollback`コマンドに新しいCLIオプションや機能は追加しない
   - 理由：本Issueはバグ修正であり、新機能追加は別Issueで対応

### 7.2. 将来的な拡張候補

以下は本Issue完了後の将来的な拡張候補として記録する：

1. **メタデータ整合性チェックの自動実行**：
   - ワークフロー開始時に全フェーズの整合性を自動チェック
   - 不整合が検出された場合、自動修正または警告表示

2. **メタデータリカバリー機能**：
   - 不整合状態のメタデータを手動で修正するCLIコマンド
   - 例：`ai-workflow fix-metadata --issue <NUM>`

3. **Jenkins環境のメタデータ同期監視**：
   - Jenkins環境でメタデータの同期状況を監視し、不整合を早期検出
   - Git pull/push時のマージ競合を自動検知

4. **不整合パターンの拡張**：
   - 新しい不整合パターン（例：`retry_count`と`completed_steps`の不整合）への対応
   - より高度なバリデーションロジックの実装

## 8. 用語集

| 用語 | 説明 |
|------|------|
| metadata.json | AI Workflowのワークフロー状態を記録するメタデータファイル（`.ai-workflow/issue-<NUM>/metadata.json`） |
| status | フェーズの状態（`pending`, `in_progress`, `completed`, `failed`） |
| completed_steps | フェーズ内で完了済みのステップ（`execute`, `review`, `revise`） |
| rollback | ワークフローを前のフェーズに差し戻す機能（v0.4.0、Issue #90で追加） |
| validateRollbackOptions | `rollback`コマンドのバリデーションメソッド（`src/commands/rollback.ts`） |
| validatePhaseConsistency | フェーズの整合性をチェックするメソッド（本Issueで新規追加） |
| resetSubsequentPhases | 後続フェーズをリセットするメソッド（`src/core/metadata-manager.ts`） |
| Evaluation Phase | ワークフローの最終評価を行うフェーズ（Phase 9） |
| 防御的プログラミング | 不整合状態でも処理を継続できるようにするプログラミング手法 |

## 9. リスクと対応策

### リスク1: 根本原因の特定に時間がかかる

- **影響度**: 高
- **確率**: 中
- **対応策**：
  - Phase 1（要件定義）でIssue #194のワークフロー実行ログを優先調査
  - Evaluation Phaseの`rollbackToPhase()`メソッドを詳細にレビュー
  - 最悪の場合、原因特定を後回しにして、まずrollbackバリデーションを改善（対症療法）

### リスク2: バリデーション追加により既存ワークフローが誤検知される

- **影響度**: 高
- **確率**: 低
- **対応策**：
  - インテグレーションテストで既存ワークフローの動作確認を徹底
  - 不整合検出時は「警告」レベルとし、エラーで停止しない
  - ログに詳細な情報を出力し、問題発生時のデバッグを容易に

### リスク3: MetadataManagerの変更が他機能に影響

- **影響度**: 中
- **確率**: 中
- **対応策**：
  - `validatePhaseConsistency()`は参照のみで副作用なし（read-only）
  - 既存の`resetSubsequentPhases()`の動作を変更しない（追加のチェックのみ）
  - ユニットテストで全メソッドの動作確認

### リスク4: Evaluation Phaseの修正が必要になり工数増加

- **影響度**: 中
- **確率**: 中
- **対応策**：
  - Phase 1（要件定義）で優先的に調査し、早期に判断
  - 修正が必要な場合はPhase 4（実装）で実施（見積もりに0~1h含まれている）
  - 最悪の場合、Evaluation Phase修正は別Issueとして切り出し

## 10. 参考情報

### 関連Issue

- **Issue #90**: ロールバック機能（rollbackコマンドの実装元）
- **Issue #194**: スカッシュコミット機能（不整合発生の原因候補）
- **Issue #10**: ステップ単位の進捗管理（`completed_steps`導入）

### 参考ドキュメント

- `CLAUDE.md`: rollbackコマンドの仕様（行66~112）
- `ARCHITECTURE.md`: MetadataManagerの設計思想（行128）
- `src/commands/rollback.ts`: 既存のrollbackバリデーションロジック（行91~136）
- `src/core/metadata-manager.ts`: フェーズリセット処理（行352~379）

### 不整合発生の3つの原因候補

1. **マイグレーション後のステータスリセット**：
   - `completed_steps`が追加された後、何らかの処理で`status`だけが`pending`にリセットされた
   - **確認ポイント**: `resetSubsequentPhases()`が`status`と`completed_steps`を同時にリセットしているか

2. **Jenkins環境とローカル環境のメタデータ同期問題**：
   - Jenkins上の一時ディレクトリで実行されたワークフローのメタデータとローカルのメタデータが不整合な状態でマージされた
   - **確認ポイント**: Git pull/pushでメタデータが正しく同期されているか

3. **Evaluation Phaseの`decision`処理**：
   - Evaluation Phaseが`FAIL_PHASE_X`を設定する際に、後続フェーズのステータスを不適切にリセットした
   - **確認ポイント**: `evaluation.ts`の`rollbackToPhase()`呼び出し（行247）が`completed_steps`をリセットしているか

### 推奨されるバリデーションアプローチ

**Option 1: Defensive（防御的）**
- `completed_steps`が空でないフェーズは「開始済み」として扱う
- 不整合は警告ログのみで、処理は継続

**Option 2: Strict（厳格）**
- 不整合を検出したらエラーで停止
- ユーザーに手動でのメタデータ修正を促す

**推奨**: **Option 1（防御的アプローチ）**
- 理由: rollbackコマンドの目的は「ワークフローの復旧」であり、厳格すぎるバリデーションは逆効果
- ただし、警告ログで不整合を明示し、後続の調査・修正を促す

---

**要件定義書作成日**: 2025-01-30
**作成者**: AI Workflow Agent
**承認者**: （レビュー後に記入）
**バージョン**: 1.0
