# 進捗サマリー（Python → TypeScript）

| 区分 | コンポーネント | 目的 / 機能 | 状態 | 主なファイル |
|------|---------------|-------------|------|--------------|
| フェーズ | Planning | フェーズ 0: 計画書作成 | ✅ 完了 | `src/phases/planning.ts` |
| フェーズ | Requirements | フェーズ 1: 要件整理 | ✅ 完了 | `src/phases/requirements.ts` |
| フェーズ | Design | フェーズ 2: 設計 | ✅ 完了 | `src/phases/design.ts` |
| フェーズ | Test Scenario | フェーズ 3: テストシナリオ | ✅ 完了 | `src/phases/test-scenario.ts` |
| フェーズ | Implementation | フェーズ 4: 実装 | ✅ 完了 | `src/phases/implementation.ts` |
| フェーズ | Test Implementation | フェーズ 5: テストコード実装 | ✅ 完了 | `src/phases/test-implementation.ts` |
| フェーズ | Testing | フェーズ 6: テスト実行 | ✅ 完了 | `src/phases/testing.ts` |
| フェーズ | Documentation | フェーズ 7: ドキュメント更新 | ✅ 完了 | `src/phases/documentation.ts` |
| フェーズ | Report | フェーズ 8: レポート作成 | ✅ 完了 | `src/phases/report.ts` |
| フェーズ | Evaluation | フェーズ 9: 評価 | ✅ 完了 | `src/phases/evaluation.ts` |
| コア | Metadata 管理 | メタデータの保存・集計 | ✅ 完了 | `src/core/metadata-manager.ts` |
| コア | WorkflowState | メタデータ読み書き・移行 | ✅ 完了 | `src/core/workflow-state.ts` |
| コア | Git 連携 | Git / PR 操作 | ✅ 完了 | `src/core/git-manager.ts`, `src/core/github-client.ts` |
| コア | Claude エージェント | Claude Agent SDK ラッパー | ✅ 完了 | `src/core/claude-agent-client.ts` |
| コア | Codex エージェント | Codex CLI ラッパー | ✅ 完了 | `src/core/codex-agent-client.ts` |
| コア | Content Parser | OpenAI 経由のレビュー解析 | ✅ 完了 | `src/core/content-parser.ts` |
| コア | Phase Dependencies | 依存関係判定・プリセット | ✅ 完了 | `src/core/phase-dependencies.ts` |
| CLI | `init` コマンド | 初期化・ブランチ作成 | ✅ 完了 | `src/main.ts` |
| CLI | `execute` コマンド | フェーズ実行・再開 | ✅ 完了 | `src/main.ts` |
| CLI | `review` コマンド | フェーズ進捗確認 | ✅ 完了 | `src/main.ts` |
| テンプレート | プロンプト / PR テンプレート | Claude / PR 用フォーマット | ✅ 完了 | `src/prompts/**`, `src/templates/**` |
| インフラ | Dockerfile | Jenkins 用コンテナ | ✅ 完了 | `Dockerfile`（Node.js 20 ベース） |
| テスト | 自動テスト整備 | ユニット / 統合テスト | 🔄 進行中 | `package.json`（スクリプト追加予定） |

> ✅: TypeScript 版へ移行済み / 🔄: 継続作業中 / ⏳: 着手予定

現在、**テスト整備（ユニット / 統合テスト）** の拡充が主な残作業です。TypeScript 実装の挙動検証を強化するため、順次テストスイートを追加していきます。
