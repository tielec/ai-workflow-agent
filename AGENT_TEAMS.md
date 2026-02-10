# Agent Teams 実践ガイド

このドキュメントは、ai-workflow-agent プロジェクトで Claude Code の Agent Teams を使用する際の具体的な手順とベストプラクティスを提供します。

**基本概念と組織論的背景は [CLAUDE.md § Agent Teams 運用ガイドライン](./CLAUDE.md#agent-teams-運用ガイドライン) を参照してください。**

---

## 目次

- [セットアップ](#セットアップ)
- [基本的な使い方](#基本的な使い方)
- [具体的なタスク例](#具体的なタスク例)
- [検証ワークフロー](#検証ワークフロー)
- [トラブルシューティング](#トラブルシューティング)
- [FAQ](#faq)

---

## セットアップ

### 環境変数の設定

Agent Teams を使用する前に、以下の環境変数が設定されていることを確認してください。

```bash
# 必須
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"  # GitHub Personal Access Token

# エージェント用（少なくとも1つ必要）
export CODEX_API_KEY="sk-xxxxxxxxxxxx"           # Codex エージェント用
export CLAUDE_CODE_OAUTH_TOKEN="oauth_xxxx"      # Claude Code エージェント用（優先）
export CLAUDE_CODE_API_KEY="sk-xxxxxxxxxxxx"    # Claude Code エージェント用（フォールバック）

# オプション
export REPOS_ROOT="/path/to/repos"               # マルチリポジトリ対応
export LOG_LEVEL="debug"                         # ログレベル（開発時）
export LANGUAGE="ja"                             # プロンプト言語（ja/en）
```

**詳細は [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) を参照してください。**

### Agent Teams の有効化

Claude Code で Agent Teams を有効化します。

```bash
# 環境変数で有効化
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

または `~/.claude/settings.json` で設定：

```json
{
  "experimental": {
    "agentTeams": true
  }
}
```

### 依存関係のインストール

```bash
npm install
npm run build
```

---

## 基本的な使い方

### チームの起動

Claude Code のセッションで、以下のようにチームを起動します。

```
このプロジェクトの planning フェーズのプロンプトを改善したいです。
Agent Teams を使って以下のタスクに分けて並列で作業してください：

1. 日本語プロンプトの改善（src/prompts/planning/ja/*.txt）
2. 英語プロンプトの改善（src/prompts/planning/en/*.txt）
3. プロンプトの検証ツールの実装

各エージェントは作業完了後に npm run validate を実行して検証してください。
```

### 操作方法

| 操作 | キー |
|---|---|
| チームメイト間の切り替え | Shift+Up/Down |
| セッションの表示 | Enter |
| 作業の中断 | Escape |

---

## 具体的なタスク例

### タスク例1：複数フェーズのプロンプト改善

**目的**: 各フェーズのプロンプトを並列で改善する

**チーム構成**:
- Agent 1: planning フェーズのプロンプト改善
- Agent 2: implementation フェーズのプロンプト改善
- Agent 3: testing フェーズのプロンプト改善
- Agent 4: documentation フェーズのプロンプト改善

**指示例**:
```
以下のフェーズのプロンプトを改善してください。Agent Teams を使って並列で作業してください：

1. planning フェーズ（src/prompts/planning/）
2. implementation フェーズ（src/prompts/implementation/）
3. testing フェーズ（src/prompts/testing/）
4. documentation フェーズ（src/prompts/documentation/）

各エージェントは以下を実施してください：
- プロンプトの明確性を向上させる
- 多言語対応（ja/en）を確認する
- 作業完了後に npm run validate を実行する
```

### タスク例2：コードレビューと品質監査

**目的**: 多角的な視点でコードベースをレビューする

**チーム構成**:
- Agent 1: セキュリティレビュー（ReDoS、認証、エラーハンドリング）
- Agent 2: パフォーマンスレビュー（ボトルネック、最適化ポイント）
- Agent 3: 可読性レビュー（コメント、命名規則、ドキュメント）
- Agent 4: テストカバレッジ分析（未テスト箇所の特定）

**指示例**:
```
コードベースの品質監査を実施してください。Agent Teams を使って以下の観点で並列レビューしてください：

1. セキュリティ監査（ReDoS、認証、エラーハンドリング規約の遵守）
2. パフォーマンス分析（ボトルネック、最適化ポイント）
3. 可読性評価（コメント、命名規則、ドキュメント整合性）
4. テストカバレッジ分析（未テスト箇所の特定と追加テストの提案）

各エージェントは発見事項をレポートにまとめてください。
```

### タスク例3：ドキュメント並列更新

**目的**: 複数のドキュメントを同時に最新化する

**チーム構成**:
- Agent 1: README.md の更新
- Agent 2: docs/CLI_REFERENCE.md の更新
- Agent 3: docs/ARCHITECTURE.md の更新
- Agent 4: docs/DEVELOPMENT.md の更新

**指示例**:
```
プロジェクトドキュメントを最新の実装に合わせて更新してください。Agent Teams を使って並列で作業してください：

1. README.md - 最新の機能とクイックスタートを反映
2. docs/CLI_REFERENCE.md - 新しいコマンドオプションを追加
3. docs/ARCHITECTURE.md - 最新のモジュール構成を反映
4. docs/DEVELOPMENT.md - テスト手順とベストプラクティスを更新

各エージェントは作業完了後に npm run build で確認してください。
```

### タスク例4：独立したバグ修正

**目的**: 複数の独立したバグを並列で修正する

**チーム構成**:
- Agent 1: Issue #123 の修正
- Agent 2: Issue #124 の修正
- Agent 3: Issue #125 の修正

**指示例**:
```
以下のバグを並列で修正してください。Agent Teams を使用します：

1. Issue #123: メタデータの読み込みエラー
2. Issue #124: プロンプトローダーのフォールバック不具合
3. Issue #125: Git コミットメッセージの文字化け

各エージェントは以下を実施してください：
- バグの原因を調査
- 修正を実装
- テストケースを追加
- npm run validate で検証
```

---

## 検証ワークフロー

Agent Teams で作業した後は、必ず以下のワークフローで検証してください。

### 統合検証コマンド

```bash
# 推奨：すべての検証を一括実行
npm run validate
```

これは以下のコマンドを順次実行します：

1. `npm run lint` - TypeScript 型チェック
2. `npm test` - ユニット・統合テスト
3. `npm run build` - ビルド確認

### 個別検証コマンド

必要に応じて個別に実行することもできます。

```bash
# TypeScript 型チェック
npm run lint

# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# カバレッジレポート付き
npm run test:coverage

# ビルド確認
npm run build
```

### Git 操作

Agent Teams で変更を加えた後は、以下の手順でコミットします。

```bash
# ステータス確認
git status

# 変更内容の確認
git diff

# ステージング
git add <ファイル>

# コミット
git commit -m "feat: <変更内容の要約>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# プッシュ（リモートブランチに反映）
git push
```

---

## トラブルシューティング

### エージェントが無応答になる

**症状**: エージェントがタスクを実行中に応答しなくなる

**原因**:
- タスクが大きすぎる
- 複雑な依存関係がある
- リソース不足

**対処法**:
1. タスクをより小さく分割する
2. 新しいエージェントを起動して再試行する
3. 依存関係を明確にする

**例**:
```
# ❌ 悪い例（3記事を1エージェントに割り当て）
medium-priority-fixer が 3 記事の修正を担当 → 無応答

# ✅ 改善例（1記事ずつ別のエージェントに割り当て）
fixer-1 が記事1を修正
fixer-2 が記事2を修正
fixer-3 が記事3を修正
```

### マージコンフリクトが発生する

**症状**: 複数のエージェントが同じファイルを編集してコンフリクトが発生する

**原因**:
- タスク分解が不適切（同一ファイルへの同時書き込み）

**対処法**:
1. タスクをファイル単位で分割する
2. 機能単位で分割する（フロント/バックではなく、認証機能/決済機能など）

**例**:
```
# ❌ 悪い分解（コンフリクトを誘発）
├── Agent 1: フロントエンドを担当
├── Agent 2: バックエンドを担当
└── ※ 一つの機能変更が両方に及ぶため頻繁に衝突する

# ✅ 改善案（機能単位で分割）
├── Agent 1: 認証機能（フロント+バック+テスト）
├── Agent 2: 決済機能（フロント+バック+テスト）
└── Agent 3: 通知機能（フロント+バック+テスト）
```

### テストが失敗する

**症状**: `npm run validate` でテストが失敗する

**原因**:
- 既存機能を壊す変更が入った
- テストケースが不足している
- 環境変数が設定されていない

**対処法**:
1. エラーメッセージを確認する
2. `npm test` を実行して詳細を確認する
3. 修正を加えた後、再度 `npm run validate` を実行する

**例**:
```bash
# テスト実行
npm test

# 特定のテストファイルのみ実行
npm test -- tests/unit/core/config.test.ts

# デバッグモードで実行
LOG_LEVEL=debug npm test
```

### ビルドが失敗する

**症状**: `npm run build` でビルドエラーが発生する

**原因**:
- TypeScript の型エラー
- import/export の不整合
- 依存関係の問題

**対処法**:
1. `npm run lint` で型チェックを実行する
2. エラーメッセージから該当箇所を特定する
3. 修正後、`npm run build` を再実行する

**例**:
```bash
# 型チェックのみ実行
npm run lint

# ビルドを実行
npm run build

# クリーンビルド
rm -rf dist
npm run build
```

---

## FAQ

### Q1: Agent Teams はいつ使うべきですか？

**A**: 以下の条件に当てはまる場合、Agent Teams の使用を検討してください：

- **Read-Heavy なタスク**: 複数ファイルの調査・レビュー
- **独立性の高いタスク**: 各タスクが独立して完結できる
- **多角的な視点が必要**: セキュリティ、パフォーマンス、可読性など
- **並列化の価値がコストを上回る**: 時間短縮の効果が大きい

逆に、以下の場合は単一エージェントまたはサブエージェントが適しています：

- **Write-Heavy なタスク**: 同一ファイルへの同時書き込み
- **小規模な修正**: 単一ファイルの typo 修正など
- **強い逐次依存**: A完了後にBを開始する必要がある

### Q2: チームサイズはどのくらいが適切ですか？

**A**: 2〜4 エージェントから始めることを推奨します。

- **小規模チーム（2〜4）**: コスト効率が良く、管理しやすい
- **中規模チーム（5〜8）**: 大規模なレビュータスクに適している
- **大規模チーム（9〜16）**: コストが高くなるため、慎重に検討する

### Q3: コストはどのくらいかかりますか？

**A**: Agent Teams は各インスタンスが個別に課金されます。

- **例**: 4エージェント × 10ターン × Sonnet = 約 $X（実際のコストはタスク内容による）
- **コスト削減のヒント**:
  - 計画フェーズは Opus、実行フェーズは Sonnet にする
  - 読み取り中心のタスクから始める
  - トークン消費パターンを理解してからスケールする

### Q4: エージェントが失敗したらどうすればいいですか？

**A**: 以下の手順で対処してください：

1. エラーメッセージを確認する
2. タスクをより小さく分割する
3. 新しいエージェントを起動して再試行する
4. 必要に応じて人間（コーチ役）に相談する

### Q5: Agent Teams とサブエージェントの違いは何ですか？

**A**: 主な違いは以下の通りです：

| 項目 | サブエージェント | Agent Teams |
|---|---|---|
| 意思決定 | トップダウン（親が判断） | 分散型（各自が判断） |
| 情報の流れ | 垂直（親⇔子） | 水平（チームメイト間直接） |
| タスク管理 | 親が配分・制御 | カンバンボード型の自律取得 |
| 適した環境 | 目標・手段が明確 | 複雑・予測不能・多角的視点が必要 |
| コスト構造 | 親セッションの一部 | 各インスタンスが個別課金 |

---

## 参考資料

- [CLAUDE.md § Agent Teams 運用ガイドライン](./CLAUDE.md#agent-teams-運用ガイドライン) - 基本概念と MVV
- [Claude Code Agent Teams ドキュメント](https://code.claude.com/docs/en/agent-teams) - 公式ドキュメント
- [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) - Nicholas Carlini による実践事例
- [Buurtzorg: scaling up an organization](https://link.springer.com/article/10.1007/s41469-024-00184-y) - ビュートゾルフの組織設計

---

**最終更新**: 2026-02-08
