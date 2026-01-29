# auto-close-issue Jenkinsパイプライン利用ガイド

## 概要

`auto-close-issue` Jenkinsパイプラインは、AIエージェントを活用して既存のオープンIssueを検品し、クローズが推奨されるIssueを安全に自動クローズするJenkinsジョブです。

**主な特徴:**
- ドライランモードでの事前確認（デフォルト: ON）
- AIによる高精度なIssueクローズ判定
- 柔軟なパラメータ設定
- 安全機能（除外ラベル、承認要求オプション）

## パラメータ詳細説明

### 基本設定

#### GITHUB_REPOSITORY（必須）
**説明**: 処理対象のGitHubリポジトリを `owner/repo` 形式で指定
**例**: `tielec/ai-workflow-agent`
**注意**: 必須パラメータです。未入力の場合、ジョブが失敗します

#### AGENT_MODE
**説明**: 使用するAIエージェントの選択
**選択肢**:
- `auto`: Codex APIキーがあればCodex優先、なければClaude Codeを使用（推奨）
- `codex`: Codex（OpenAI）のみを使用
- `claude`: Claude Code（Anthropic）のみを使用

#### LANGUAGE
**説明**: ワークフローの出力言語
**選択肢**:
- `ja`: 日本語（デフォルト）
- `en`: English

### Issue処理設定

#### AUTO_CLOSE_CATEGORY
**説明**: 処理対象のIssue分類カテゴリ
**選択肢**:
- `followup`: フォローアップが必要なIssue（デフォルト）
- `stale`: 長期間更新のないIssue
- `old`: 古いIssue
- `all`: 全カテゴリ

#### AUTO_CLOSE_LIMIT
**説明**: 1回のジョブ実行で処理するIssueの上限数
**範囲**: 1〜50
**デフォルト**: 10
**推奨値**: 初回実行は5以下、慣れてから10〜20に増加

#### CONFIDENCE_THRESHOLD
**説明**: AIによるクローズ推奨判定の信頼度閾値
**範囲**: 0.0〜1.0
**デフォルト**: 0.7
**調整指針**:
- `0.9以上`: 非常に保守的（確実にクローズできるもののみ）
- `0.7〜0.8`: バランス重視（推奨範囲）
- `0.5〜0.6`: やや積極的（要注意）

#### DAYS_THRESHOLD
**説明**: Issueの最終更新からの経過日数閾値
**デフォルト**: 90
**調整例**:
- アクティブなプロジェクト: 30〜60日
- メンテナンスモード: 180〜365日

#### EXCLUDE_LABELS
**説明**: 処理対象から除外するラベル（カンマ区切り）
**デフォルト**: `do-not-close,pinned`
**推奨ラベル**:
- `do-not-close`: 手動でクローズを禁止
- `pinned`: 重要なIssue
- `wontfix`: 修正しないことが確定
- `help-wanted`: コミュニティからの協力を求める

### 実行制御設定

#### DRY_RUN（重要）
**説明**: ドライランモード（実際のIssueクローズを行わない）
**デフォルト**: `true`（安全のため）
**推奨フロー**:
1. 初回は必ず `true` で実行し、結果を確認
2. 問題なければ `false` に変更して本実行

#### REQUIRE_APPROVAL
**説明**: Issueクローズ前に承認を要求
**デフォルト**: `false`
**注意**: CI環境では対話的確認ができないため、ローカル実行でのみ有効

### APIキー設定

以下のAPIキーから、使用するエージェントに応じて必要なものを設定してください:

- **GITHUB_TOKEN**: GitHub API アクセス用（必須）
- **OPENAI_API_KEY**: Codexエージェント使用時
- **CODEX_API_KEY**: Codexエージェント使用時
- **CODEX_AUTH_JSON**: Codex認証情報（JSON形式）
- **CLAUDE_CODE_OAUTH_TOKEN**: Claude Codeエージェント使用時
- **ANTHROPIC_API_KEY**: Claude エージェント使用時

## 実行例

### 1. 初回実行（保守的設定）

```
GITHUB_REPOSITORY: tielec/ai-workflow-agent
AUTO_CLOSE_CATEGORY: followup
AUTO_CLOSE_LIMIT: 5
CONFIDENCE_THRESHOLD: 0.8
DAYS_THRESHOLD: 90
EXCLUDE_LABELS: do-not-close,pinned,help-wanted
REQUIRE_APPROVAL: false
DRY_RUN: true  ← 必ずtrueで開始
AGENT_MODE: auto
LANGUAGE: ja
```

**結果確認のポイント**:
- コンソールログでクローズ候補Issueの一覧を確認
- AIの判定理由を読み、妥当性を確認
- 意図しないIssueが含まれていないかチェック

### 2. 本実行（DRY_RUN無効）

```
（上記設定で DRY_RUN: false に変更）
```

### 3. 積極的なクリーンアップ

```
GITHUB_REPOSITORY: tielec/ai-workflow-agent
AUTO_CLOSE_CATEGORY: all
AUTO_CLOSE_LIMIT: 20
CONFIDENCE_THRESHOLD: 0.7
DAYS_THRESHOLD: 180
EXCLUDE_LABELS: do-not-close,pinned
REQUIRE_APPROVAL: false
DRY_RUN: false
AGENT_MODE: auto
LANGUAGE: ja
```

## トラブルシューティングガイド

### よくあるエラーと対処法

#### 1. "GITHUB_REPOSITORY parameter is required"

**原因**: GITHUB_REPOSITORYパラメータが未設定
**対処法**: リポジトリを `owner/repo` 形式で正しく入力

#### 2. "GITHUB_REPOSITORY must be in 'owner/repo' format"

**原因**: リポジトリ名の形式が不正
**対処法**: スラッシュ（/）を1つだけ含む形式で入力
**例**: ❌ `https://github.com/user/repo` → ✅ `user/repo`

#### 3. "AUTO_CLOSE_LIMIT must be an integer between 1 and 50"

**原因**: 上限数の設定が範囲外
**対処法**: 1〜50の整数を入力

#### 4. "No issues found matching criteria"

**原因**: 指定条件に該当するIssueが存在しない
**対処法**:
- `DAYS_THRESHOLD` を短く設定（例: 30日）
- `AUTO_CLOSE_CATEGORY` を `all` に変更
- `CONFIDENCE_THRESHOLD` を下げる（例: 0.6）

#### 5. API認証エラー

**症状**: `401 Unauthorized` または `403 Forbidden`
**対処法**:
- GitHubトークンの有効期限を確認
- トークンに必要な権限（`repo`スコープ）があることを確認
- 他のAPIキーも有効であることを確認

### パフォーマンス問題

#### 実行時間が長い

**原因と対処法**:
- `AUTO_CLOSE_LIMIT` を減らす（推奨: 10以下）
- 対象リポジトリのIssue数が多すぎる場合は、カテゴリを絞る
- `DAYS_THRESHOLD` を適切に設定してIssue候補を絞る

#### APIリクエスト制限

**症状**: `Rate limit exceeded`
**対処法**:
- 実行間隔を開ける（1時間以上）
- 処理数を減らす
- GitHub Enterprise を使用している場合は管理者に相談

### 結果の検証方法

#### ドライラン結果の確認

1. **コンソールログ確認**:
   ```
   Stage: Execute Auto Close Issue
   ========================================
   Category: followup
   Limit: 10
   Dry Run: true

   [AI Agent Results]
   Issue #123: "古いバグレポート" → Close recommended (confidence: 0.85)
   Issue #456: "未完了の機能要求" → Keep open (confidence: 0.45)
   ```

2. **判定理由の確認**:
   各IssueのAI判定理由を読み、妥当性を判断

3. **除外確認**:
   除外ラベル付きIssueが適切に除外されていることを確認

#### 本実行後の確認

1. **GitHubでの確認**:
   - クローズされたIssueの一覧確認
   - クローズコメントの内容確認

2. **ログでの確認**:
   - 処理されたIssue数
   - エラーの有無
   - 実行時間

### 緊急時の対処

#### 誤ってIssueをクローズしてしまった場合

1. **GitHub UI での復旧**:
   - 該当Issueを開く
   - "Reopen issue" ボタンをクリック

2. **API での一括復旧**:
   ```bash
   # 特定期間にクローズされたIssueを一括で再オープン
   # （GitHubのAPIまたはCLIツールを使用）
   ```

#### パイプラインの緊急停止

1. **Jenkins UI**: "Abort" ボタンでビルドを強制停止
2. **影響確認**: 部分的に実行されたクローズ処理の確認

### 設定チューニング

#### 初期設定からの段階的調整

1. **Phase 1（保守的）**:
   - `CONFIDENCE_THRESHOLD: 0.9`
   - `AUTO_CLOSE_LIMIT: 5`
   - `DRY_RUN: true`

2. **Phase 2（標準）**:
   - `CONFIDENCE_THRESHOLD: 0.7`
   - `AUTO_CLOSE_LIMIT: 10`
   - `DRY_RUN: false`

3. **Phase 3（積極的）**:
   - `CONFIDENCE_THRESHOLD: 0.6`
   - `AUTO_CLOSE_LIMIT: 20`
   - カテゴリを `all` に拡張

### 監視とアラート

#### 定期実行の監視ポイント

- 実行成功率
- 処理されたIssue数の変化
- API使用量
- 実行時間の推移

#### アラート設定例

- 3回連続失敗時
- 処理時間が15分超過時
- API制限エラー時

## ベストプラクティス

### 運用指針

1. **段階的導入**: 小さな設定から始めて徐々に拡張
2. **定期レビュー**: クローズされたIssueを定期的にレビュー
3. **チーム共有**: 設定変更時はチームメンバーに事前通知
4. **バックアップ**: 重要なIssueは事前にエクスポート

### 効果的な設定

- **開発アクティブ期**: `DAYS_THRESHOLD: 30`, `CONFIDENCE_THRESHOLD: 0.8`
- **リリース直後**: `DAYS_THRESHOLD: 14`, `CONFIDENCE_THRESHOLD: 0.9`
- **メンテナンス期**: `DAYS_THRESHOLD: 180`, `CONFIDENCE_THRESHOLD: 0.6`

### 除外ラベルの活用

推奨ラベル体系:
- `do-not-close`: 手動クローズ禁止
- `needs-investigation`: 調査中
- `breaking-change`: 破壊的変更
- `security`: セキュリティ関連
- `documentation`: ドキュメント関連

---

**注意**: このパイプラインはIssueの自動クローズを行うため、実行前に必ずドライランで結果を確認し、チーム内での合意を得てから使用してください。