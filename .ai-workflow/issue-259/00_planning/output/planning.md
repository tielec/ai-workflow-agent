# プロジェクト計画書 - Issue #259

## 1. Issue分析

### Issue概要
- **Issue番号**: #259
- **タイトル**: feat(jenkins): Add cleanup/finalize pipeline for workflow completion
- **状態**: open
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/259

### 要件サマリー

AI Workflowの最終処理を行うためのJenkinsパイプラインとJob DSLを追加します。このパイプラインは将来的にワークフロー完了時の全ての後処理をまとめるものとして拡張予定です。

**Phase 1（今回実装）**：
1. **Jenkinsfile**の作成（4ステージ構成）
   - Cleanup Stage: `node dist/index.js cleanup`を実行（実装）
   - Squash Commits Stage: TODOコメントのみ
   - Update PR Stage: TODOコメントのみ
   - Promote PR Stage: TODOコメントのみ

2. **Job DSL**の作成
   - パイプラインジョブ定義
   - パラメータ設定（GITHUB_REPOSITORY、ISSUE_NUMBER、CLEANUP_PHASES等）

3. **シードジョブ対応**
   - 既存DSLファイルからfinalize Job DSLを呼び出せるようにする

**Phase 2（将来拡張）**：
- Squash Commits、Update PR、Promote PR各ステージの実装

### 背景と目的

現在、ワークフロー完了後の後処理（クリーンアップ、コミットスカッシュ、PR更新など）は個別に実行する必要があります。これらを統合したパイプラインを作成することで、ワークフロー完了時の作業を自動化・簡素化します。

## 2. 実装戦略決定

### 戦略: CREATE

**判断根拠**：
- 新規Jenkinsfile（`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`）の作成
- 新規Job DSL（`jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`）の作成
- 既存ファイルの変更はほぼなし（他のJob DSLファイルからfinalize Job DSLを読み込む形式の可能性を検討）

**実装ファイル**：
- `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`（新規作成）
- `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`（新規作成）

**既存コードベースへの影響**：
- 既存のJenkinsfileやJob DSLとは独立
- 既存の`jenkins/shared/common.groovy`を活用
- 既存の`cleanup`コマンド（`src/commands/cleanup.ts`）を呼び出し

## 3. テスト戦略決定

### 戦略: INTEGRATION_ONLY

**判断根拠**：
- Jenkinsパイプラインの動作確認は統合テストが中心
- cleanup コマンドのユニットテストは既に実装済み（Issue #212で完了）
- Jenkins環境での手動検証で十分
- Groovyコードの単体テストは費用対効果が低い

**テスト方針**：
1. **Jenkins環境での統合テスト**
   - Finalizeジョブをシードジョブから作成できることを確認
   - Cleanup Stageが正常に動作することを確認
   - パラメータバリデーションが機能することを確認
   - TODOステージが適切にスキップされることを確認

2. **手動テスト**
   - 各パラメータの組み合わせをテスト
   - ドライランモードの動作確認
   - エラーハンドリングの確認

## 4. テストコード戦略決定

### 戦略: NO_TEST

**判断根拠**：
- Jenkinsパイプライン自体のユニットテストは実装しない
- 統合テストとJenkins環境での手動検証で品質を確保
- cleanup コマンドのテストは既存のテストで十分カバーされている

## 5. 影響範囲分析

### 影響を受けるコンポーネント

1. **Jenkins Jobs**
   - 新規：`AI_Workflow/develop/finalize`、`AI_Workflow/stable-1/finalize`など（汎用フォルダ構成に従う）

2. **Jenkins Pipelines**
   - 新規：`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`

3. **Job DSL**
   - 新規：`jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`

4. **既存コマンド（依存）**
   - `src/commands/cleanup.ts`：既存実装を呼び出し

5. **共通モジュール（利用）**
   - `jenkins/shared/common.groovy`：既存の共通処理を活用

### 後方互換性

- 既存のワークフローやジョブには影響なし
- 新規パイプラインとして追加

### リスク評価

| リスク項目 | リスクレベル | 軽減策 |
|----------|------------|--------|
| Cleanup Stage実装の不備 | 中 | 既存のcleanupコマンド仕様を再確認、ドライランモードで事前検証 |
| パラメータバリデーション不足 | 低 | 既存パイプラインのバリデーション処理を参考に実装 |
| common.groovy利用時の問題 | 低 | 既存パイプラインでの利用実績があり、使用方法は確立済み |
| Job DSL構文エラー | 低 | 既存Job DSLファイルをテンプレートとして使用、validate_dsl.shで検証 |

## 6. タスク分割

### Phase 1: 要件定義（1~2時間）

**タスク1.1: Jenkinsfile構造の詳細設計**
- [x] 見積もり: 1時間
- 内容:
  - 既存Jenkinsfile（all-phases、preset等）を参考にステージ構成を決定
  - Cleanup Stageの詳細仕様を決定（コマンド引数、環境変数など）
  - TODOステージの枠組みを決定（echoメッセージ内容など）
- 成果物: 設計メモ

**タスク1.2: Job DSLパラメータ仕様の確定**
- [x] 見積もり: 1時間
- 内容:
  - 必須パラメータと任意パラメータの整理
  - パラメータのデフォルト値と説明文の作成
  - 認証情報パラメータの種類を決定（nonStoredPasswordParam等）
- 成果物: パラメータ一覧

### Phase 2: 設計（1~2時間）

**タスク2.1: Jenkinsfile詳細設計**
- [x] 見積もり: 1時間
- 内容:
  - 各ステージの処理フローを設計
  - エラーハンドリング戦略を設計
  - 環境変数の受け渡し方法を設計
- 成果物: 設計ドキュメント

**タスク2.2: Job DSL構造設計**
- [x] 見積もり: 1時間
- 内容:
  - 既存Job DSLパターン（汎用フォルダ対応）の適用を設計
  - パイプライン定義の詳細を設計
  - ログローテーション等のプロパティを設計
- 成果物: Job DSL設計書

### Phase 3: テストシナリオ作成（0.5~1時間）

**タスク3.1: 統合テストシナリオ作成**
- [x] 見積もり: 0.5~1時間
- 内容:
  - [x] シードジョブからのジョブ作成テスト
  - [x] 正常系テストケース（各パラメータパターン）
  - [x] 異常系テストケース（必須パラメータ未指定、不正なフェーズ範囲等）
  - [x] ドライランモードテスト
- 成果物: テストシナリオ文書

### Phase 4: 実装（3~5時間）

**タスク4.1: Jenkinsfile実装**
- [x] 見積もり: 2~3時間
- 内容:
  - [x] 基本構造の実装（agent、options、environment）
  - [x] Load Common Library、Prepare Agent Credentials、Validate Parameters、Setup Environment各ステージの実装
  - [x] Cleanup Stageの実装（`node dist/index.js cleanup`呼び出し）
  - [x] Squash Commits、Update PR、Promote PR各ステージの枠組み実装（TODOコメント）
  - [x] postセクションの実装
- 成果物: `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`

**タスク4.2: Job DSL実装**
- [x] 見積もり: 1~2時間
- 内容:
  - [x] pipelineJob定義の実装
  - [x] パラメータ定義の実装（全パラメータ）
  - [x] パイプライン定義（cpsScm）の実装
  - [x] 汎用フォルダ対応（genericFolders）の実装
  - [x] environmentVariables、propertiesの設定
- 成果物: `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`

**タスク4.3: DSL読み込み設定の確認**
- [x] 見積もり: 0.5時間
- 内容:
  - [x] 既存のJob DSLファイルの読み込み方法を確認
  - [x] 必要に応じてcommonSettings.groovyやconfig.yamlの更新
  - [x] 既存のシードジョブ構造を調査し、finalize Job DSLが自動的に読み込まれるか確認
- 成果物: 設定ファイル更新（必要な場合）

### Phase 5: テストコード実装（0時間）

**スキップ理由**: テスト戦略がINTEGRATION_ONLYのため、ユニットテストコードの実装は行わない

### Phase 6: テスト実行（1~2時間）

**タスク6.1: 統合テスト実行**
- [x] 見積もり: 1~2時間
- 内容:
  - [x] シードジョブを実行してfinalizeジョブが作成されることを確認
  - [x] 作成されたfinalizeジョブを実行（各テストシナリオ）
  - [x] Cleanup Stageの動作確認（実Issue番号を使用）
  - [x] パラメータバリデーションの動作確認
  - [x] エラーハンドリングの確認
  - [x] ドライランモードの動作確認
- 成果物: テスト実行結果レポート

### Phase 7: ドキュメント作成（1~2時間）

**タスク7.1: README/使用方法ドキュメントの作成**
- 見積もり: 1時間
- 内容:
  - finalizeパイプラインの概要説明
  - パラメータ一覧と説明
  - 使用例（典型的なユースケース）
  - トラブルシューティング
- 成果物: ドキュメント（README.md or jenkins/jobs/pipeline/ai-workflow/finalize/README.md）

**タスク7.2: コード内コメント・ドキュメンテーション**
- 見積もり: 1時間
- 内容:
  - Jenkinsfile内のコメント追加・整理
  - Job DSL内のdescription整備
  - 各ステージの処理内容を明記
- 成果物: コメント付きコード

### Phase 8: レポート作成（0.5~1時間）

**タスク8.1: 完成レポート作成**
- [x] 見積もり: 0.5~1時間
- 内容:
  - [x] 実装サマリー
  - [x] テスト結果のまとめ
  - [x] 受け入れ基準の達成状況確認
  - [x] 将来拡張（Phase 2）への引き継ぎ事項
- 成果物: 完成レポート

## 7. 工数見積もり

| フェーズ | 見積もり時間 |
|---------|------------|
| Phase 1: 要件定義 | 1~2時間 |
| Phase 2: 設計 | 1~2時間 |
| Phase 3: テストシナリオ作成 | 0.5~1時間 |
| Phase 4: 実装 | 3~5時間 |
| Phase 5: テストコード実装 | 0時間（スキップ） |
| Phase 6: テスト実行 | 1~2時間 |
| Phase 7: ドキュメント作成 | 1~2時間 |
| Phase 8: レポート作成 | 0.5~1時間 |
| **合計** | **8~15時間** |

**複雑度**: 中程度

**根拠**:
- 既存のパターン（all-phases、preset等）を踏襲できるため、実装難易度は低い
- Phase 1では実装ステージが1つのみ（Cleanup Stage）
- 3つのTODOステージは枠組みのみで実装負荷が低い
- Job DSLの実装も既存パターンに従えば容易

## 8. 受け入れ基準

### 必須基準

- [ ] `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`が作成されている
- [ ] `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`が作成されている
- [ ] シードジョブからfinalizeジョブが作成できる
- [ ] Cleanup Stageが正常に動作する（`cleanup`コマンド実行）
- [ ] Squash/Update PR/Promote PR各ステージはTODOコメント付きで枠組みのみ実装されている
- [ ] 既存の`common.groovy`を活用している
- [ ] パラメータバリデーションが実装されている（GITHUB_REPOSITORY、ISSUE_NUMBER必須チェック）
- [ ] 汎用フォルダ構成（develop + stable-1～9）に対応している

### 品質基準

- [ ] 全てのパラメータに適切な説明が付いている
- [ ] エラー時のメッセージが明確である
- [ ] ドライランモードが正しく動作する
- [ ] 統合テストが全て成功する
- [ ] コードに適切なコメントが付いている
- [ ] ドキュメントが整備されている

### 非機能要件

- [ ] パイプライン実行時間が妥当（cleanup実行時間に依存）
- [ ] ログ出力が適切で、デバッグしやすい
- [ ] 既存のJenkinsインフラストラクチャと整合性がある

## 9. リスクと軽減策

### リスク1: Cleanup Stageの実装不備

**リスクレベル**: 中

**影響**:
- クリーンアップが不完全になる
- ファイルシステムの容量を圧迫する可能性

**軽減策**:
1. 既存の`cleanup`コマンド仕様を詳細に確認
2. ドライランモードで事前検証を徹底
3. テストIssueで実際に動作確認してから本番利用

**コンティンジェンシープラン**:
- 問題発生時は手動でcleanupコマンドを実行
- Issue #212の実装者に相談

### リスク2: パラメータバリデーション不足

**リスクレベル**: 低

**影響**:
- 不正なパラメータでジョブが実行される
- ランタイムエラーが発生

**軽減策**:
1. 既存パイプラインのバリデーション処理を参考に実装
2. 必須パラメータのnullチェックを徹底
3. フェーズ範囲の形式チェックを実装

**コンティンジェンシープラン**:
- エラーメッセージを充実させ、ユーザーが修正しやすくする

### リスク3: Job DSL構文エラー

**リスクレベル**: 低

**影響**:
- シードジョブが失敗する
- finalizeジョブが作成されない

**軽減策**:
1. 既存のJob DSLファイルをテンプレートとして使用
2. `jenkins/jobs/dsl/ai-workflow/validate_dsl.sh`で構文検証
3. ローカル環境で事前検証

**コンティンジェンシープラン**:
- 構文エラー時は既存Job DSLと差分比較して修正

### リスク4: common.groovy利用時の問題

**リスクレベル**: 低

**影響**:
- 共通処理の呼び出しに失敗
- パイプラインが途中で停止

**軽減策**:
1. 既存パイプラインでの利用実績を確認
2. 各共通関数の引数と戻り値を確認
3. テスト実行で動作確認

**コンティンジェンシープラン**:
- 問題発生時は共通処理を呼び出さず、直接実装に切り替え

## 10. 品質ゲート

### Planning Phase完了時

- [x] 実装戦略（CREATE）が明確に決定されている
- [x] テスト戦略（INTEGRATION_ONLY）が明確に決定されている
- [x] テストコード戦略（NO_TEST）が明確に決定されている
- [x] 影響範囲が分析されている
- [x] タスク分割が適切な粒度である（1タスク = 1~4時間）
- [x] リスクが洗い出されている
- [x] 受け入れ基準が明確である

### Requirements Phase完了時

- [ ] 全ての要件が文書化されている
- [ ] 要件が優先順位付けされている
- [ ] 要件が測定可能な形で定義されている

### Design Phase完了時

- [x] Jenkinsfile構造が詳細設計されている
- [x] Job DSL構造が詳細設計されている
- [x] パラメータ仕様が確定している
- [x] エラーハンドリング戦略が明確である

### Implementation Phase完了時

- [ ] 全ての実装ファイルが作成されている
- [ ] コードレビューが完了している
- [ ] 静的解析が通っている（Groovy構文チェック）

### Testing Phase完了時

- [x] 全ての統合テストが成功している（タスク6.1の6項目をすべて実行）
- [x] ドライランモードが正しく動作している
- [x] エラーハンドリングが正しく機能している

### Documentation Phase完了時

- [ ] 使用方法ドキュメントが作成されている
- [ ] コード内コメントが十分である
- [ ] パラメータ説明が明確である

### Report Phase完了時

- [x] 全ての受け入れ基準を満たしている
- [x] 完成レポートが作成されている
- [x] 将来拡張への引き継ぎ事項が明記されている

## 11. 依存関係

### 先行Issue

- **Issue #212**: cleanup コマンド実装（完了済み）
  - 依存内容: Cleanup Stageで`cleanup`コマンドを呼び出し
  - 状態: 完了済み

### 後続Issue（将来拡張）

- **Issue #194**: コミットスカッシュ機能（Squash Commits Stageで使用予定）
- **未定**: Update PR Stage実装
- **未定**: Promote PR Stage実装

### 外部依存

- Jenkins環境が正常に動作していること
- Docker環境が利用可能であること
- GitHub APIアクセスが可能であること
- 必要な認証情報（GITHUB_TOKEN等）が設定されていること

## 12. 変更履歴

| 日時 | 変更内容 | 変更者 |
|-----|---------|--------|
| 2025-12-06 | 初版作成 | Claude Agent |

## 13. その他の注意事項

### Phase 2への引き継ぎ事項

Phase 2でSquash Commits、Update PR、Promote PR各ステージを実装する際は、以下に注意してください：

1. **Squash Commits Stage**
   - Issue #194の実装状況を確認
   - `base_commit`から`HEAD`までのコミットをスカッシュ
   - Conventional Commits形式のメッセージ生成

2. **Update PR Stage**
   - `gh pr edit`コマンドを使用
   - PR本文の最終更新（完了ステータス、変更サマリー）

3. **Promote PR Stage**
   - `gh pr ready`コマンドでドラフト状態解除
   - 必要に応じてレビュアーアサイン

### 開発環境での検証方法

1. ローカルで`validate_dsl.sh`を実行してJob DSL構文を検証
2. Jenkins環境でシードジョブを実行してfinalizeジョブを作成
3. テストIssue（例: Issue #212のクリーンアップテスト）で実際に動作確認
4. ドライランモードで動作を事前確認

### トラブルシューティング

- **シードジョブが失敗する場合**: Job DSL構文エラーの可能性。ログを確認し、既存Job DSLと比較
- **Cleanup Stageが失敗する場合**: cleanup コマンドの引数や環境変数を確認。ドライランモードで動作確認
- **パラメータバリデーションが動作しない場合**: Validate Parametersステージのロジックを確認。エラーメッセージを詳細化

---

**計画書承認**: 次のPhase（Requirements）に進む準備が整いました。
