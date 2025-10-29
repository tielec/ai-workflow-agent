# 要件定義書 - Issue #73

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### 開発計画の全体像
- **複雑度**: 簡単
- **見積もり工数**: 2~4時間
- **実装戦略**: EXTEND（既存のPR生成ロジックを拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **リスク評価**: 低（影響範囲が限定的、既存機能の破壊リスクが低い）

### 重要な設計判断
1. **Issue タイトル取得**: 既存の `GitHubClient.getIssue()` メソッドを活用
2. **PR タイトル生成**: `src/commands/init.ts` の `handleInitCommand()` 関数で、固定文字列 `[AI-Workflow] Issue #${issueNumber}` をIssueタイトルに置き換え
3. **テンプレート最適化**: `src/templates/pr_body_template.md` と `src/templates/pr_body_detailed_template.md` から不要セクションを削除
4. **後方互換性**: PR本文生成ロジックは変更不要（Report Phase の動作は維持）

### 影響範囲
- **変更対象**: `src/commands/init.ts`（1箇所）、PRテンプレート（2ファイル）
- **影響を受けないコンポーネント**: `src/core/github-client.ts`、`src/core/github/pull-request-client.ts`、`src/phases/report.ts`

## 1. 概要

### 背景
現在、AI Workflowで自動生成されるPull Request（PR）のタイトルは `[AI-Workflow] Issue #51` のような形式で作成されるため、PR一覧での可読性が低く、内容を把握しづらい状況です。また、初期化時に生成されるPRテンプレートには、初期化段階では内容が空または不要な情報（レビューポイント、実行環境）が含まれており、PRの品質を低下させています。

### 目的
1. **PR タイトルの最適化**: IssueタイトルをそのままPRタイトルとして使用することで、PR一覧での可読性を大幅に向上させる
2. **PR テンプレートの最適化**: 初期化時に不要なセクション（`### 👀 レビューポイント`、`### ⚙️ 実行環境`）を削除し、PRの初期状態をよりクリーンにする

### ビジネス価値
- **開発効率の向上**: PR一覧で作業内容を素早く把握でき、レビュー対象の選択が容易になる
- **PR品質の向上**: 初期化時のPRテンプレートから不要な情報を削除し、レビュアーの注意を成果物に集中させる
- **ユーザー体験の改善**: GitHub上でのワークフロー可視性が向上

### 技術的価値
- **保守性の向上**: Issueタイトルの変更が自動的にPRタイトルに反映される
- **一貫性の確保**: Issue管理とPR管理の情報を統一
- **後方互換性の維持**: 既存のPR生成ロジック（Report Phase）には影響を与えない

## 2. 機能要件

### 2.1. PR タイトルの自動生成（優先度: 高）

**要件ID**: REQ-73-001

**説明**: `init` コマンド実行時、GitHub Issue のタイトルを取得し、PRタイトルとして使用する。

**詳細仕様**:
- Issue番号から Issue タイトルを取得（`GitHubClient.getIssue(issueNumber)` を使用）
- 取得したタイトルをPRタイトルとして設定（プレフィックス `[AI-Workflow]` は削除）
- 例: Issue タイトル `機能追加: 環境変数アクセスを一元化する設定管理を追加` → PR タイトル `機能追加: 環境変数アクセスを一元化する設定管理を追加`

**実装箇所**: `src/commands/init.ts` の `handleInitCommand()` 関数（Line 320付近）

**受け入れ基準**: [REQ-73-001-AC1](#req-73-001-ac1)、[REQ-73-001-AC2](#req-73-001-ac2)

---

### 2.2. Issue タイトル取得エラーハンドリング（優先度: 高）

**要件ID**: REQ-73-002

**説明**: Issue タイトル取得失敗時、従来のPRタイトル形式 `[AI-Workflow] Issue #${issueNumber}` にフォールバックする。

**詳細仕様**:
- GitHub API エラー（ネットワークエラー、レート制限、認証エラー、Issue不存在）をキャッチ
- エラー発生時、警告ログを出力（`logger.warn('Failed to fetch Issue title, falling back to default PR title: ...')`）
- フォールバック先: `[AI-Workflow] Issue #${issueNumber}`
- エラーログには失敗理由を含める

**実装箇所**: `src/commands/init.ts` の `handleInitCommand()` 関数

**受け入れ基準**: [REQ-73-002-AC1](#req-73-002-ac1)、[REQ-73-002-AC2](#req-73-002-ac2)

---

### 2.3. 長いPRタイトルの切り詰め（優先度: 中）

**要件ID**: REQ-73-003

**説明**: GitHub PRタイトルの最大長（256文字）を超える場合、タイトルを切り詰める。

**詳細仕様**:
- IssueタイトルがGitHub PR タイトルの最大長（256文字）を超える場合、253文字で切り詰め、末尾に `...` を追加
- 切り詰め処理は Issue タイトル取得成功時のみ実施（フォールバック時は不要）
- 例: 300文字のタイトル → 253文字 + `...` = 256文字

**実装箇所**: `src/commands/init.ts` の `handleInitCommand()` 関数

**受け入れ基準**: [REQ-73-003-AC1](#req-73-003-ac1)

---

### 2.4. PR テンプレート最適化（優先度: 高）

**要件ID**: REQ-73-004

**説明**: 初期化時に生成されるPRテンプレートから、不要なセクション（`### 👀 レビューポイント`、`### ⚙️ 実行環境`）を削除する。

**詳細仕様**:
- **削除対象セクション**:
  1. `### 👀 レビューポイント` セクション全体（初期化時は常に「（レビューの記載なし）」と表示される）
  2. `### ⚙️ 実行環境` セクション全体（モデル名やブランチ名は他のセクションでも確認可能）

- **保持セクション**:
  1. `### 📋 関連Issue` … Issue番号を明示（`Closes #N` でGitHub連携）
  2. `### 🔄 ワークフロー進捗` … 各フェーズの進捗状況を視覚化
  3. `### 📁 成果物` … ワークフローディレクトリへのパス

- **対象ファイル**:
  1. `src/templates/pr_body_template.md`（初期化時に使用）
  2. `src/templates/pr_body_detailed_template.md`（Report Phase で使用）

**実装箇所**: `src/templates/pr_body_template.md`、`src/templates/pr_body_detailed_template.md`

**受け入れ基準**: [REQ-73-004-AC1](#req-73-004-ac1)、[REQ-73-004-AC2](#req-73-004-ac2)

---

### 2.5. デバッグログの追加（優先度: 低）

**要件ID**: REQ-73-005

**説明**: PR タイトル生成時、デバッグ用のログを出力する。

**詳細仕様**:
- Issue タイトル取得成功時: `logger.info('Using Issue title as PR title: {title}')`
- Issue タイトル取得失敗時: `logger.warn('Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #{issueNumber}')`
- 長いタイトル切り詰め時: `logger.info('Truncating PR title to 256 characters')`

**実装箇所**: `src/commands/init.ts` の `handleInitCommand()` 関数

**受け入れ基準**: [REQ-73-005-AC1](#req-73-005-ac1)

## 3. 非機能要件

### 3.1. パフォーマンス要件

**要件ID**: NFR-73-001

**説明**: Issue タイトル取得は3秒以内に完了すること。

**詳細**:
- GitHub API の Issue 取得は通常1秒以内に完了（ネットワーク遅延を考慮し、3秒をタイムアウトとする）
- タイムアウト時はエラーハンドリング（REQ-73-002）が発動

---

### 3.2. セキュリティ要件

**要件ID**: NFR-73-002

**説明**: Issue タイトルに特殊文字が含まれる場合でも、XSS攻撃のリスクがないこと。

**詳細**:
- GitHub PR タイトルはHTMLエスケープされるため、基本的に安全
- テストケースで特殊文字（`<`, `>`, `&`, `"`）を含むタイトルを検証
- 必要に応じてサニタイズ処理を追加（ただし、GitHubが自動処理するため不要と予想）

---

### 3.3. 可用性・信頼性要件

**要件ID**: NFR-73-003

**説明**: Issue タイトル取得失敗時もワークフロー初期化は継続すること。

**詳細**:
- GitHub API エラー時、従来のタイトル形式にフォールバックし、エラーとせず警告ログのみ出力
- ワークフロー初期化の中断を避ける

---

### 3.4. 保守性・拡張性要件

**要件ID**: NFR-73-004

**説明**: PR タイトル生成ロジックは、将来的な拡張（プレフィックス追加、フォーマット変更等）に対応できる設計とすること。

**詳細**:
- PR タイトル生成ロジックを独立した関数として抽出（`generatePrTitle(issueNumber, issueTitle)` 等）
- テストケースで関数の動作を検証
- 将来的なプレフィックス追加（例: `[ai-workflow]`、`[WIP]`）に対応しやすい設計

---

### 3.5. テスト容易性要件

**要件ID**: NFR-73-005

**説明**: PR タイトル生成ロジックはユニットテスト可能な設計とすること。

**詳細**:
- Issue タイトル取得をモック化可能（`GitHubClient.getIssue()` のモック）
- エラーハンドリング、長いタイトル切り詰め、正常系をそれぞれテスト可能

## 4. 制約事項

### 4.1. 技術的制約

1. **GitHub API レート制限**: GitHub API は1時間あたり5000リクエスト（認証済み）の制限があるため、Issue タイトル取得は必要最小限に留める
2. **既存コード設計**: `GitHubClient.getIssue()` メソッドは既に存在し、Issue情報を取得可能（新規実装不要）
3. **PR タイトル最大長**: GitHub PR タイトルは最大256文字（この制限を超える場合は切り詰めが必要）
4. **後方互換性**: 既存のPR生成ロジック（`src/core/github-client.ts`、`src/phases/report.ts`）は変更しない

### 4.2. リソース制約

1. **工数制約**: 見積もり工数は2~4時間（Planning Document参照）
2. **スコープ制約**: PRタイトル生成とテンプレート最適化のみ（PR本文生成ロジックは対象外）

### 4.3. ポリシー制約

1. **コーディング規約**: ESLint / Prettier 準拠、TypeScript厳格モード（CLAUDE.md 参照）
2. **環境変数アクセス規約**: `process.env` への直接アクセス禁止、Config クラス（`src/core/config.ts`）を使用（CLAUDE.md 参照）
3. **ロギング規約**: `console.log` 禁止、統一loggerモジュール（`src/utils/logger.ts`）を使用（CLAUDE.md 参照）

## 5. 前提条件

### 5.1. システム環境

1. **Node.js**: 20以上
2. **TypeScript**: 5.x
3. **GitHub API**: v3 REST API（Octokit経由）

### 5.2. 依存コンポーネント

1. **GitHubClient**: `src/core/github-client.ts`（Issue取得、PR作成機能を提供）
2. **Logger**: `src/utils/logger.ts`（統一ログモジュール）
3. **Config**: `src/core/config.ts`（環境変数アクセス管理）

### 5.3. 外部システム連携

1. **GitHub API**: Issue情報取得、PR作成
2. **Git**: ブランチ作成、コミット、プッシュ

### 5.4. 環境変数

1. **GITHUB_TOKEN**: GitHub パーソナルアクセストークン（必須）
2. **GITHUB_REPOSITORY**: `owner/repo` 形式（必須）

## 6. 受け入れ基準

### <a name="req-73-001-ac1"></a>REQ-73-001-AC1: PR タイトルが Issue タイトルと一致する

**Given**: GitHub Issue #73 が存在し、タイトルが `自動生成のPRの内容を最適化したい` である
**When**: `init` コマンドを実行する（`node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/73`）
**Then**:
- 生成されたPRのタイトルが `自動生成のPRの内容を最適化したい` である
- プレフィックス `[AI-Workflow]` は含まれない

---

### <a name="req-73-001-ac2"></a>REQ-73-001-AC2: PR タイトルにプレフィックスが含まれない

**Given**: GitHub Issue #51 が存在し、タイトルが `機能追加: 環境変数アクセスを一元化する設定管理を追加` である
**When**: `init` コマンドを実行する
**Then**:
- 生成されたPRのタイトルが `機能追加: 環境変数アクセスを一元化する設定管理を追加` である
- `[AI-Workflow]` プレフィックスは含まれない

---

### <a name="req-73-002-ac1"></a>REQ-73-002-AC1: Issue 取得失敗時のフォールバック

**Given**: GitHub Issue #999 が存在しない（404 Not Found）
**When**: `init` コマンドを実行する（`node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999`）
**Then**:
- 生成されたPRのタイトルが `[AI-Workflow] Issue #999` である
- 警告ログが出力される（`Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999`）
- ワークフロー初期化は正常に完了する

---

### <a name="req-73-002-ac2"></a>REQ-73-002-AC2: GitHub API レート制限エラー時のフォールバック

**Given**: GitHub API のレート制限に達している（403 Rate Limit Exceeded）
**When**: `init` コマンドを実行する
**Then**:
- 生成されたPRのタイトルが `[AI-Workflow] Issue #${issueNumber}` である
- 警告ログが出力される（`Failed to fetch Issue title due to rate limit, falling back to default PR title`）
- ワークフロー初期化は正常に完了する

---

### <a name="req-73-003-ac1"></a>REQ-73-003-AC1: 長い PR タイトルの切り詰め

**Given**: GitHub Issue #100 が存在し、タイトルが300文字である
**When**: `init` コマンドを実行する
**Then**:
- 生成されたPRのタイトルが256文字である（253文字 + `...`）
- 情報ログが出力される（`Truncating PR title to 256 characters`）
- 切り詰められたタイトルは可読性を保つ

---

### <a name="req-73-004-ac1"></a>REQ-73-004-AC1: PR テンプレートから不要セクションが削除される

**Given**: `init` コマンドを実行する
**When**: 生成されたPRのテンプレートを確認する
**Then**:
- `### 👀 レビューポイント` セクションが存在しない
- `### ⚙️ 実行環境` セクションが存在しない
- `### 📋 関連Issue` セクションは存在する
- `### 🔄 ワークフロー進捗` セクションは存在する
- `### 📁 成果物` セクションは存在する

---

### <a name="req-73-004-ac2"></a>REQ-73-004-AC2: Report Phase のPR本文生成には影響しない

**Given**: Report Phase（Phase 8）を実行する
**When**: PR本文が更新される
**Then**:
- PR本文の更新ロジックは従来通り動作する（変更なし）
- `generatePrBodyDetailed()` メソッドが正常に動作する

---

### <a name="req-73-005-ac1"></a>REQ-73-005-AC1: デバッグログが出力される

**Given**: `init` コマンドを実行する
**When**: Issue タイトル取得が成功する
**Then**:
- 情報ログが出力される（`Using Issue title as PR title: {title}`）
- ログレベルは `info` である

## 7. スコープ外

以下の項目は、本Issue（#73）のスコープ外とします：

### 7.1. 現時点でスコープ外とする事項

1. **PR本文生成ロジックの変更**: Report Phase（Phase 8）の `generatePrBodyDetailed()` メソッドは変更しない
2. **PR タイトルの動的更新**: PRタイトルは初期化時のみ設定され、Issue タイトル変更時の自動更新は行わない
3. **カスタムPRタイトルフォーマット**: ユーザーがPRタイトルフォーマットをカスタマイズする機能は提供しない
4. **PR説明文の自動生成**: Issue本文をPR説明文として自動挿入する機能は提供しない
5. **PRラベルの自動付与**: IssueラベルをPRに自動的に転記する機能は提供しない

### 7.2. 将来的な拡張候補

1. **カスタムプレフィックス設定**: ユーザーがPRタイトルにプレフィックス（例: `[WIP]`、`[Draft]`）を追加できる機能
2. **PR タイトルのリアルタイム同期**: Issue タイトル変更時、関連PRのタイトルを自動更新する機能
3. **PR テンプレートのカスタマイズ**: ユーザーがPRテンプレートをカスタマイズできる機能（プロジェクト固有のセクション追加等）
4. **多言語対応**: PR タイトル・テンプレートの多言語化（英語、日本語等）

## 8. リスクと懸念事項

### 8.1. 高優先度リスク

なし（Planning Document でリスク評価「低」と判定）

### 8.2. 中優先度リスク

1. **Issue タイトルが長すぎる場合の表示崩れ**
   - **確率**: 中
   - **影響度**: 低
   - **軽減策**: GitHub PR タイトルの最大長（256文字）を考慮し、長いタイトルは切り詰める（REQ-73-003）

2. **Issue タイトルに特殊文字が含まれる場合の表示崩れ**
   - **確率**: 中
   - **影響度**: 低
   - **軽減策**: テストケースで特殊文字（`<`, `>`, `&`, `"`）を含むタイトルを検証（NFR-73-002）

### 8.3. 低優先度リスク

1. **Issue タイトル取得失敗による PR 作成の中断**
   - **確率**: 低
   - **影響度**: 低
   - **軽減策**: Issue 取得失敗時は従来のタイトルにフォールバック（REQ-73-002）

2. **テンプレート変更による既存ワークフローの影響**
   - **確率**: 低
   - **影響度**: 低
   - **軽減策**: Report Phase（Phase 8）は `pr_body_detailed_template.md` を使用するため、初期化時のテンプレート変更の影響は限定的（Planning Document 参照）

## 9. 検証方法

### 9.1. ユニットテスト

1. **PR タイトル生成ロジック**:
   - Issue タイトル取得成功時のPRタイトル生成検証
   - Issue タイトル取得失敗時のフォールバック動作検証
   - 長いタイトル（256文字以上）の切り詰め動作検証

2. **テストファイル**: `tests/unit/commands/init-pr-title.test.ts`（新規作成）

### 9.2. 統合テスト

1. **init コマンド実行フロー**:
   - init コマンド実行 → PR作成 → タイトル確認の一連の流れ
   - 既存ブランチへの再初期化時のPRタイトル確認

2. **テストファイル**: `tests/integration/init-pr-title-integration.test.ts`（新規作成）

### 9.3. 手動テスト

1. **実際のGitHubリポジトリでの動作確認**:
   - 実際のIssueに対して `init` コマンドを実行
   - 生成されたPRのタイトル・テンプレートを確認

2. **エッジケーステスト**:
   - 長いタイトル（256文字以上）のIssue
   - 特殊文字を含むタイトルのIssue
   - 存在しないIssue番号

## 10. 成功基準

本要件定義は、以下の条件を満たした場合に成功とみなします：

### 10.1. 必須成功基準

- [ ] **機能要件が明確に記載されている**: 全5個の機能要件（REQ-73-001 〜 REQ-73-005）が具体的かつ測定可能な形で記述されている
- [ ] **受け入れ基準が定義されている**: 全7個の受け入れ基準（REQ-73-001-AC1 〜 REQ-73-005-AC1）がGiven-When-Then形式で記述されている
- [ ] **スコープが明確である**: スコープ内（セクション2）とスコープ外（セクション7）が明確に区別されている
- [ ] **論理的な矛盾がない**: 機能要件、非機能要件、制約事項の間で矛盾がない

### 10.2. 追加成功基準

- [ ] **Planning Documentとの整合性**: Planning Documentで策定された実装戦略（EXTEND）、テスト戦略（UNIT_INTEGRATION）、影響範囲が反映されている
- [ ] **検証可能性**: 全ての機能要件に対して、ユニットテスト・統合テスト・手動テストのいずれかで検証可能である
- [ ] **完全性**: Issue本文の情報（改善点1、改善点2）が漏れなく要件に反映されている

## 11. 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-20 | 1.0 | 初版作成 | AI Workflow Phase 1 (Requirements) |

---

**作成日**: 2025-01-20
**承認者**: AI Workflow Phase 1 (Requirements)
**次フェーズ**: Phase 2 (Design)
