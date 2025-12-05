# 要件定義書

**Issue番号**: #211
**タイトル**: refactor: Jenkinsfileを実行モード別に分割する
**作成日**: 2025-01-31
**プロジェクト種別**: リファクタリング

---

## 0. Planning Documentの確認

Planning Document（@.ai-workflow/issue-211/00_planning/output/planning.md）の確認結果：

- **実装戦略**: REFACTOR（既存の690行Jenkinsfileを5つの独立ファイルに分割）
- **テスト戦略**: INTEGRATION_ONLY（Jenkins環境での実際の実行テストのみ）
- **リスク評価**: 低（機能追加ではなくリファクタリング、既存Jenkinsfileと並行運用可能）
- **見積もり工数**: 12~18時間
- **主要なリスク**: Jenkins環境でのロードエラー、パラメータ受け渡し不備

Planning Documentで策定された戦略を踏まえ、以下の要件定義を実施します。

---

## 1. 概要

### 背景

現在の `Jenkinsfile`（約690行）は、5つの実行モード（all_phases、preset、single_phase、rollback、auto_issue）をすべて単一ファイルで処理しています。これにより、以下の課題が発生しています：

- **保守性の低下**: 異なる実行モードのロジックが混在し、変更時の影響範囲が不明確
- **テスト困難**: モード別のテストが困難で、全体を網羅する統合テストに依存
- **可読性の低下**: 690行の単一ファイルは理解に時間がかかり、新規参画者のオンボーディングコストが高い

### 目的

実行モード別に独立したJenkinsfileに分割し、以下を実現します：

1. **保守性向上**: 各モードのロジックを独立させ、変更の影響範囲を限定
2. **テスト容易性向上**: モード別の統合テストを可能に
3. **可読性向上**: 各ファイルを短く保ち、理解しやすく
4. **Job設定の柔軟性**: Jenkins側で各モード専用のJobを作成可能に

### ビジネス価値・技術的価値

- **ビジネス価値**:
  - メンテナンスコスト削減（変更時の影響範囲が明確化）
  - 新機能追加時の開発速度向上（独立したファイルへの機能追加が容易）
  - バグ発生リスクの低減（影響範囲が限定的）

- **技術的価値**:
  - コードの再利用性向上（共通処理をcommon.groovyに集約）
  - Jenkins Job DSLとの整合性向上（各モード専用のJob定義が可能）
  - 並行開発の促進（異なるモードへの変更が独立して進行可能）

---

## 2. 機能要件

### FR-1: 共通処理モジュール（common.groovy）の作成
**優先度**: 高

- **FR-1.1**: 認証情報準備機能（prepareAgentCredentials）
  - GITHUB_TOKEN、AWS認証情報、OPENAI_API_KEY、claude-code-oauth-tokenをセットアップ
  - 既存のJenkinsfile内の「Prepare Agent Credentials」ステージと同等の処理

- **FR-1.2**: 環境セットアップ機能（setupEnvironment）
  - REPOS_ROOT準備（/tmp/ai-workflow-repos-${BUILD_ID}）
  - 対象リポジトリのクローン
  - 既存のJenkinsfile内の「Setup Environment」ステージと同等の処理

- **FR-1.3**: Node.js環境セットアップ機能（setupNodeEnvironment）
  - npm install実行
  - npm run build実行
  - 既存のJenkinsfile内の「Setup Node.js Environment」ステージと同等の処理

- **FR-1.4**: 成果物アーカイブ機能（archiveArtifacts）
  - ワークフローメタデータ、ログ、成果物のアーカイブ
  - 既存のJenkinsfile内のPost処理と同等の処理

### FR-2: Jenkinsfile.all-phases の作成
**優先度**: 高

- **FR-2.1**: Initialize Workflowステージ
  - node dist/index.js init --issue-url ${ISSUE_URL} を実行
  - 既存のJenkinsfile内の「Initialize Workflow」ステージと同等の処理

- **FR-2.2**: Execute All Phasesステージ
  - node dist/index.js execute --issue ${ISSUE_NUMBER} --phase all を実行
  - エージェントモード（AGENT_MODE）の制御
  - 既存のJenkinsfile内の「Execute All Phases」ステージと同等の処理

- **FR-2.3**: パラメータ定義
  - ISSUE_URL（必須）
  - AGENT_MODE（既定: auto）
  - OPENAI_API_KEY、GITHUB_TOKEN、AWS認証情報

### FR-3: Jenkinsfile.preset の作成
**優先度**: 高

- **FR-3.1**: Initialize Workflowステージ
  - node dist/index.js init --issue-url ${ISSUE_URL} を実行

- **FR-3.2**: Execute Presetステージ
  - node dist/index.js execute --issue ${ISSUE_NUMBER} --preset ${PRESET} を実行
  - プリセット名（PRESET）の制御

- **FR-3.3**: パラメータ定義
  - ISSUE_URL（必須）
  - PRESET（必須、選択肢: review-requirements、review-design、review-test-scenario、quick-fix、implementation、testing、finalize）
  - AGENT_MODE（既定: auto）
  - OPENAI_API_KEY、GITHUB_TOKEN、AWS認証情報

### FR-4: Jenkinsfile.single-phase の作成
**優先度**: 高

- **FR-4.1**: Initialize Workflowステージ
  - node dist/index.js init --issue-url ${ISSUE_URL} を実行

- **FR-4.2**: Execute Single Phaseステージ
  - node dist/index.js execute --issue ${ISSUE_NUMBER} --phase ${START_PHASE} を実行
  - フェーズ名（START_PHASE）の制御

- **FR-4.3**: パラメータ定義
  - ISSUE_URL（必須）
  - START_PHASE（必須、選択肢: planning、requirements、design、test-scenario、implementation、test-implementation、testing、documentation、report、evaluation）
  - AGENT_MODE（既定: auto）
  - OPENAI_API_KEY、GITHUB_TOKEN、AWS認証情報

### FR-5: Jenkinsfile.rollback の作成
**優先度**: 高

- **FR-5.1**: Initialize Workflowステージ
  - node dist/index.js init --issue-url ${ISSUE_URL} を実行

- **FR-5.2**: Execute Rollbackステージ
  - node dist/index.js rollback --issue ${ISSUE_NUMBER} --to-phase ${ROLLBACK_TO_PHASE} --reason "${ROLLBACK_REASON}" --force を実行
  - 差し戻し先フェーズ（ROLLBACK_TO_PHASE）の制御
  - 差し戻し理由（ROLLBACK_REASON）の渡し方

- **FR-5.3**: パラメータ定義
  - ISSUE_URL（必須）
  - ROLLBACK_TO_PHASE（必須、選択肢: planning、requirements、design、test-scenario、implementation、test-implementation、testing、documentation、report、evaluation）
  - ROLLBACK_REASON（必須、テキスト）
  - AGENT_MODE（既定: auto）
  - OPENAI_API_KEY、GITHUB_TOKEN、AWS認証情報

### FR-6: Jenkinsfile.auto-issue の作成
**優先度**: 高

- **FR-6.1**: Execute Auto Issueステージ
  - node dist/index.js auto-issue --category ${AUTO_ISSUE_CATEGORY} を実行
  - カテゴリ（AUTO_ISSUE_CATEGORY）の制御
  - ※ Initialize Workflowステージは不要

- **FR-6.2**: パラメータ定義
  - AUTO_ISSUE_CATEGORY（既定: bug、選択肢: bug、refactor、enhancement、all）
  - AGENT_MODE（既定: auto）
  - OPENAI_API_KEY、GITHUB_TOKEN、AWS認証情報

### FR-7: Job DSLファイルの更新
**優先度**: 中

- **FR-7.1**: 各Jenkinsfile用のJob定義を追加
  - jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy を更新
  - 各実行モード専用のJob定義を作成（または既存のJob定義を各Jenkinsfileに対応させる）

### FR-8: 既存Jenkinsfileの並行運用
**優先度**: 低

- **FR-8.1**: 既存Jenkinsfileに非推奨警告コメントを追加
- **FR-8.2**: 移行完了後、十分な猶予期間を経て既存Jenkinsfileを削除

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **NFR-1.1**: 各Jenkinsfileの実行時間は、既存Jenkinsfileと同等またはそれ以下であること
- **NFR-1.2**: common.groovyのロード時間は1秒以内であること

### NFR-2: セキュリティ要件

- **NFR-2.1**: 認証情報（GITHUB_TOKEN、OPENAI_API_KEY、AWS認証情報、claude-code-oauth-token）は環境変数として安全に管理されること
- **NFR-2.2**: Job DSLパラメータ経由で渡される認証情報は、Jenkinsビルド実行時のみ有効であること
- **NFR-2.3**: 認証情報がJenkinsビルドログに出力されないこと

### NFR-3: 可用性・信頼性要件

- **NFR-3.1**: 各Jenkinsfileは独立して動作し、他のJenkinsfileの障害に影響されないこと
- **NFR-3.2**: common.groovyのロードエラー時は、明確なエラーメッセージを表示し、ビルドを失敗させること

### NFR-4: 保守性・拡張性要件

- **NFR-4.1**: 各Jenkinsfileは200行以下に保つこと（可読性の目安）
- **NFR-4.2**: 共通処理はcommon.groovyに集約し、重複コードを排除すること
- **NFR-4.3**: 新規実行モード追加時は、新しいJenkinsfileを追加するだけで対応可能であること

---

## 4. 制約事項

### 技術的制約

- **TC-1**: Groovy構文を使用すること（Jenkinsfileの標準）
- **TC-2**: 既存のDockerイメージ（ai-workflow-agent）を使用すること
- **TC-3**: Jenkins Pipeline Syntax（Declarative Pipeline）を使用すること
- **TC-4**: common.groovyは `load` 構文でロードすること（例: `def common = load 'jenkins/shared/common.groovy'`）

### リソース制約

- **RC-1**: 実装期間は12~18時間以内に完了すること（Planning Documentの見積もりに基づく）
- **RC-2**: Jenkins環境での統合テストに十分な時間を確保すること（Phase 6で2~3時間）

### ポリシー制約

- **PC-1**: 既存Jenkinsfileの動作を変更しないこと（並行運用期間中）
- **PC-2**: 既存のJenkins Job設定に影響を与えないこと
- **PC-3**: Git コミットメッセージは `[ai-workflow] Phase {number} ({name}) - {step} completed` 形式に従うこと

---

## 5. 前提条件

### システム環境

- **ENV-1**: Jenkins 2.x以上がインストールされていること
- **ENV-2**: Docker 24以上がインストールされていること
- **ENV-3**: Job DSL Plugin、Pipeline Plugin、Docker Pipeline Pluginが有効であること

### 依存コンポーネント

- **DEP-1**: ai-workflow-agent Dockerイメージがビルド済みであること
- **DEP-2**: Jenkins Credentialsに `claude-code-oauth-token` が登録されていること
- **DEP-3**: GitHub Personal Access Token（GITHUB_TOKEN）が有効であること

### 外部システム連携

- **EXT-1**: GitHub API（Issue情報取得、PR作成、コメント投稿）が利用可能であること
- **EXT-2**: OpenAI API（Codexエージェント）が利用可能であること
- **EXT-3**: AWS S3（成果物アーカイブ）が利用可能であること（オプション）

---

## 6. 受け入れ基準

### AC-1: 共通処理モジュール（common.groovy）

**Given**: jenkins/shared/common.groovyが存在する
**When**: 各Jenkinsfileから `load 'jenkins/shared/common.groovy'` でロードする
**Then**: prepareAgentCredentials、setupEnvironment、setupNodeEnvironment、archiveArtifacts関数が使用可能である

### AC-2: Jenkinsfile.all-phases

**Given**: ISSUE_URL、AGENT_MODE、OPENAI_API_KEY、GITHUB_TOKENが設定されている
**When**: Jenkinsfile.all-phasesを実行する
**Then**:
- Initialize Workflowステージが成功する
- Execute All Phasesステージが成功する
- 既存Jenkinsfile（EXECUTION_MODE=all_phases）と同等の結果が得られる

### AC-3: Jenkinsfile.preset

**Given**: ISSUE_URL、PRESET、AGENT_MODE、OPENAI_API_KEY、GITHUB_TOKENが設定されている
**When**: Jenkinsfile.presetを実行する
**Then**:
- Initialize Workflowステージが成功する
- Execute Presetステージが成功する
- 既存Jenkinsfile（EXECUTION_MODE=preset）と同等の結果が得られる

### AC-4: Jenkinsfile.single-phase

**Given**: ISSUE_URL、START_PHASE、AGENT_MODE、OPENAI_API_KEY、GITHUB_TOKENが設定されている
**When**: Jenkinsfile.single-phaseを実行する
**Then**:
- Initialize Workflowステージが成功する
- Execute Single Phaseステージが成功する
- 既存Jenkinsfile（EXECUTION_MODE=single_phase）と同等の結果が得られる

### AC-5: Jenkinsfile.rollback

**Given**: ISSUE_URL、ROLLBACK_TO_PHASE、ROLLBACK_REASON、AGENT_MODE、OPENAI_API_KEY、GITHUB_TOKENが設定されている
**When**: Jenkinsfile.rollbackを実行する
**Then**:
- Initialize Workflowステージが成功する
- Execute Rollbackステージが成功する
- 既存Jenkinsfile（EXECUTION_MODE=rollback）と同等の結果が得られる

### AC-6: Jenkinsfile.auto-issue

**Given**: AUTO_ISSUE_CATEGORY、AGENT_MODE、OPENAI_API_KEY、GITHUB_TOKENが設定されている
**When**: Jenkinsfile.auto-issueを実行する
**Then**:
- Execute Auto Issueステージが成功する
- 既存Jenkinsfile（EXECUTION_MODE=auto_issue）と同等の結果が得られる

### AC-7: エラーハンドリング

**Given**: common.groovyのロードに失敗する
**When**: 各Jenkinsfileを実行する
**Then**:
- 明確なエラーメッセージが表示される（例: "Failed to load jenkins/shared/common.groovy"）
- ビルドが失敗する

### AC-8: パラメータ検証

**Given**: 必須パラメータ（ISSUE_URL等）が未設定である
**When**: 各Jenkinsfileを実行する
**Then**:
- パラメータ不足のエラーメッセージが表示される
- ビルドが失敗する

### AC-9: 並行運用

**Given**: 既存Jenkinsfileと新Jenkinsfileが両方存在する
**When**: どちらのJenkinsfileも実行する
**Then**:
- 既存Jenkinsfileは従来通り動作する
- 新Jenkinsfileは既存Jenkinsfileと同等の結果を返す
- 互いに影響を与えない

### AC-10: ドキュメント更新

**Given**: すべての新Jenkinsfileが実装されている
**When**: ドキュメントを確認する
**Then**:
- CLAUDE.mdのJenkins統合セクションが更新されている
- ARCHITECTURE.mdのJenkinsでの利用セクションが更新されている
- README.mdのJenkins関連説明が更新されている
- 各Jenkinsfileにコメントが追加されている（責務、パラメータ説明）

---

## 7. スコープ外

### OUT-1: 既存Jenkinsfileの削除
- 並行運用期間を設け、十分な検証後に削除を検討（本Issueの範囲外）

### OUT-2: Jenkins Job DSLの完全な再設計
- 既存のJob DSL構造を維持し、最小限の変更で対応（本Issueの範囲内）
- Job DSLの抜本的な見直しは将来的な拡張候補

### OUT-3: Create Pull Requestステージの実装
- Jenkinsfile.all-phasesに「Create Pull Request」ステージの記載があるが、実装は将来実装予定（本Issueの範囲外）

### OUT-4: Jenkins Pipeline Shared Librariesへの移行
- 現時点ではcommon.groovyをloadする方式を採用
- Jenkins Pipeline Shared Librariesへの移行は将来的な拡張候補

### OUT-5: 他のCI/CDシステムへの対応
- 本Issueはjenkins環境のリファクタリングに限定
- GitHub Actions、CircleCI等への対応は別Issue

---

## 8. 実装優先順位

1. **Phase 1（最優先）**: common.groovyの実装とJenkinsfile.all-phasesの作成
   - 共通処理の抽出が他のJenkinsfileの基盤となるため
   - all_phasesは最も使用頻度が高い実行モード

2. **Phase 2**: Jenkinsfile.preset、Jenkinsfile.single-phaseの作成
   - presetは開発者が頻繁に使用する実行モード
   - single_phaseはデバッグ時に使用

3. **Phase 3**: Jenkinsfile.rollback、Jenkinsfile.auto-issueの作成
   - rollbackは緊急時の対応用
   - auto_issueは補助的な機能

4. **Phase 4**: Job DSL更新、ドキュメント更新、並行運用検証
   - すべてのJenkinsfile実装後に実施

---

## 9. リスク管理

### リスク1: common.groovyのロードエラー
- **影響度**: 高（すべてのJenkinsfileが動作不能）
- **確率**: 中
- **軽減策**:
  - Phase 2（設計フェーズ）でload構文を事前検証
  - Phase 6（テストフェーズ）で各実行モードごとに統合テスト
  - Jenkins Pipeline Syntax Generatorでload構文を確認

### リスク2: パラメータの受け渡し不備
- **影響度**: 中（特定の実行モードのみ影響）
- **確率**: 中
- **軽減策**:
  - 各Jenkinsfileでパラメータ定義を標準化
  - Phase 6で全パラメータパターンを網羅的にテスト
  - エラーメッセージを充実させ、問題の早期発見を促進

### リスク3: 並行運用期間中の混乱
- **影響度**: 低（ユーザー体験の低下）
- **確率**: 中
- **軽減策**:
  - 旧Jenkinsfileに非推奨警告コメントを追加
  - ドキュメントに移行手順を明記
  - 移行完了後、旧Jenkinsfileを削除する前に十分な猶予期間を設ける

---

## 10. 成功指標

### KPI-1: コード品質
- 各Jenkinsfileが200行以下であること
- 重複コードが存在しないこと（共通処理はcommon.groovyに集約）

### KPI-2: 互換性
- 既存Jenkinsfile（EXECUTION_MODE別）と新Jenkinsfileの実行結果が一致すること
- すべての実行モードで統合テストが成功すること

### KPI-3: ドキュメント品質
- CLAUDE.md、ARCHITECTURE.md、README.mdが更新されていること
- 各Jenkinsfileにコメントが追加されていること

### KPI-4: 移行成功率
- 並行運用期間中、新Jenkinsfileの実行成功率が95%以上であること
- 既存Jenkinsfileの実行成功率に影響を与えないこと

---

## 11. 完了条件

以下の条件をすべて満たした場合、本要件定義は完了とします：

- [ ] すべての機能要件（FR-1 ~ FR-8）が明確に記載されている
- [ ] すべての非機能要件（NFR-1 ~ NFR-4）が定義されている
- [ ] すべての受け入れ基準（AC-1 ~ AC-10）が検証可能な形で記述されている
- [ ] スコープ外の項目が明確に定義されている
- [ ] リスク管理策が具体的に記載されている
- [ ] 成功指標（KPI）が測定可能である

---

**作成日**: 2025-01-31
**最終更新日**: 2025-01-31
**ステータス**: 初版作成完了
