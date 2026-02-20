# AI Workflow Agent - Codebase Overview

**最終更新**: 2026-01-29

## 1. プロジェクト概要
- TypeScript と Jest（ESM モード）を採用した AI Workflow Agent は Codex と Claude のデュアルエージェントを連携させ、GitHub Issue の planning から evaluation まで 10 フェーズにわたる自動化ワークフローを実行します。
- コマンドラインから `npm run dev` もしくは `npm run release` で起動し、対話的なフェーズ制御と PR コメントの生成・投稿をサポートします。
- 本ドキュメントは `/tmp/ai-workflow-repos-183-35addf50/ai-workflow-agent/` 現在構成の要点を 200 行未満に整理した軽量版です。

## 2. ディレクトリ構造要約
```
/tmp/ai-workflow-repos-183-35addf50/ai-workflow-agent/
├── src/
│   ├── index.ts                # CLI エントリーポイント（Commander）
│   ├── main.ts                 # 実行ルートと環境初期化
│   ├── commands/
│   │   ├── execute.ts          # フェーズ実行オーケストレーター
│   │   ├── pr-comment/
│   │   │   ├── analyze.ts      # Analyze フェーズの調整版
│   │   │   └── analyze/        # 分割されたレスポンスパーサー群
│   │   │       ├── response-parser.ts
│   │   │       ├── response-normalizer.ts
│   │   │       └── ...
│   │   ├── init.ts             # ワークフローの初期化ハンドラ
│   │   ├── review.ts           # レビューフェーズ用実行
│   │   └── cleanup.ts          # アーティファクト整理
│   ├── core/
│   │   ├── git/
│   │   │   ├── branch-manager.ts
│   │   │   ├── commit-manager.ts
│   │   │   └── workspace-manager.ts
│   │   ├── github/
│   │   ├── codex-agent-client.ts
│   │   ├── claude-agent-client.ts
│   │   └── helpers/
│   │       ├── logger.ts
│   │       └── error-utils.ts
│   ├── phases/
│   │   ├── base-phase.ts
│   │   ├── lifecycle/
│   │   ├── formatters/
│   │   └── cleanup/
│   ├── prompts/
│   │   ├── {phase}/
│   │   │   └── {lang}/
│   │   │       └── *.txt       # 自動同期されるプロンプトテンプレート
│   └── types/
│       ├── pr-comment.ts
│       └── commands.ts
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
├── scripts/
├── jest.config.cjs
└── package.json
```
- `src/commands/pr-comment/analyze/` に JSON パース・ノーマライズ・提案集約を担う補助モジュールがあり、旧 `parseResponsePlan` から分割された現在の実装を反映しています。
- `core/git/` はサブディレクトリごとに `branch`, `commit`, `workspace` などのファイルを分離し、旧 `git-manager.ts` から Git 処理を再構築しています。

## 3. 主要エントリポイント
- `src/index.ts`/`src/main.ts`: CLI 実行で最初に呼び出され、フェーズ制御やオプション解析を担当します。
- `src/commands/execute.ts`: フェーズ番号に応じたハンドラを呼び出し、Codex と Claude にタスクを振り分けます。
- `src/commands/pr-comment/analyze.ts`: PR コメント分析のオーケストレータ。本体は `analyze/response-parser.ts` などで構成されています。
- `src/core/git/*`: Git 操作（ブランチ作成、コミット、ワークスペース切替）を API 化した再利用部品。
- `src/phases/*`: 各フェーズのログ記録・状態遷移・エラーハンドリングを共通化した Layer。

## 4. 現在の主要機能概要
- **10 フェーズワークフロー**: Issue 解決のため planning, analyze, review, finalize など 10 ステージを移行し、各フェーズに専用プロンプトやリソースを割り当てています。
- **PR コメント自動化**: `analyze`, `execute`, `finalize` コマンドを組み合わせ、Codex と Claude を交互に実行して提案を生成・正規化・投稿します。
- **Git 操作の分離**: `core/git/` でブランチ管理、コミット生成、ワークツリー差分の取得を抽象化し、レビューやロールバックで再利用しています。
- **プロンプト同期**: `scripts/sync-prompts.sh` などで `src/prompts/` を `dist/` に自動デプロイし、多言語テンプレートを一元管理します。
- **Jest ESM テスト**: `jest.config.cjs` と TypeScript の `ts-jest` 設定で、ESM モードのユニット/統合テストを実行可能にしています。

## 5. コーディング規約の要約
- `logger.ts` から提供される `defaultLogger` を使い、すべてのコマンドやフェーズで `debug`, `info`, `error` を一貫して呼び出します。
- `config.ts` で環境変数と設定値を集約し、各フェーズの初期化時に読み込む設計です。
- `error-utils.ts` はエラーの整形とスタックのフィルタリングを担当し、例外発生時には `handleFatalError()` を通して `process.exitCode` を設定します。
- `core/helpers` および `types/` で共通定義を管理し、`tsconfig.json` の `paths` エイリアスを活用してインポートを短縮しています。

## 6. 開発・ビルド手順
1. `npm install` で依存を取得。
2. `npm run build` で TypeScript をコンパイルし、`dist/` に成果物を出力。
3. `npm run dev` で Watch モードを起動し、CLI ローカルテストを実行。
4. `npm test` で Jest によるユニット/統合テストを実行。
5. `scripts/sync-prompts.sh` を定期実行すると、`src/prompts` の更新が `dist/prompts` に反映されます。
- PR コメント機能の調整は `tests/unit/pr-comment` 以下のテストに加え、`tests/integration/pr-comment-workflow.test.ts` で end-to-end を確認します。

## 7. 更新履歴
1. 2026-01-29: 最新のディレクトリ構成とエントリポイントを反映するため全体リライト（文書サイズ約170行）。
2. 2025-12-15: Analyze フェーズで `response-parser.ts` を導入し、旧 `parseResponsePlan` 記述を分割。
3. 2025-09-30: Git 操作を `core/git/` に整理し、`git-manager.ts` を廃止。
4. 2025-05-20: 10 フェーズワークフローと多言語プロンプト同期仕組みを構築。

## 8. 継続的メンテナンス留意点
- セクション構成を保ちつつ、頻繁に変化する `src/commands` と `src/core` の構造のみ差分更新してください。
- 主要エントリポイントや `scripts/` の場所が変わった場合、節 3・4 の記述を同期して更新日も必ず修正。
- コード構造の大幅な変更がある際には、ここから `docs/` などへの参照リンクを適切に切り替えてください。
