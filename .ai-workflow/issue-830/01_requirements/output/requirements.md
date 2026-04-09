# Issue #830 要件定義書

## 0. Planning Documentの確認（Planning Phaseが実行されている場合）
Planning Documentを確認し、実装戦略はEXTEND、テスト戦略はUNIT_INTEGRATION、テストコード戦略はEXTEND_TESTであることを把握した。スコープはDockerfileへのClaude Code CLI導入、認証失敗検出ロジックの厳密化、既存ユニットテスト拡張が中心である。リスクは「Claude Code CLI導入失敗」「認証失敗検出の過検出/未検出」「既存テスト回帰」「Dockerイメージ再ビルドの外部依存」で、対策としてbest-effort導入ログ、検出対象の限定、重点テスト実行、リトライ手順明記を前提とする。スケジュールは概ね10〜14時間の見積で、要件定義→設計→テスト設計→実装→テスト実装→テスト実行→ドキュメント→レポートの順で進む。

## 1. 概要
- 要約: `all-phases` ジョブの `test_implementation` フェーズが常にFAILUREになる。原因は「Claude Code CLI未導入」と「認証失敗検出の誤検知」の2つが独立に存在し、後者でCodexの正常完了後に誤ってフォールバックが発動し、前者によりClaudeが即時終了するためである。
- 背景: 既存DockerイメージにはCodex CLIのみがインストールされ、Claude Code CLIが欠落している。加えて、認証失敗検出がエージェント出力全文（stdout含む）を文字列スキャンするため、リポジトリ内ソースの文字列が誤検知を誘発する。
- 目的: Claude Code CLIをDockerイメージへ導入し、認証失敗検出を誤検知しない厳密な判定へ改善する。
- ビジネス価値: `all-phases` の安定稼働によりCIの信頼性と開発速度を回復し、無駄なフォールバックによるコストを削減する。
- 技術的価値: 依存関係の欠落を解消し、認証エラー検知の正確性を高めることで運用品質を向上させる。

## 2. 機能要件
Issue本文に「## TODO」セクションは存在しないため、Issueの「完了条件」を機能要件として定義する。

1. FR-1: DockerfileにClaude Code CLIのインストールを追加する。内容はDockerfileのnpm install工程に `@anthropic-ai/claude-code@latest` を追加し、`claude --version` による確認（best-effort）を実行する。優先度は高。
2. FR-2: 認証失敗検出ロジックを厳密化する。内容は `src/phases/core/agent-executor.ts` のauthFailed検出をstdout由来の任意文字列に依存しない方式へ変更する（例: JSON構造化イベント/エラーのみ、または厳密なJSONパターン一致）。優先度は高。
3. FR-3: 誤検知が起きないことをテストで保証する。内容はリポジトリ内ソースを読み取るケースを含め、認証失敗の誤検知が発生しないこと、および正しい認証エラーが検出されることをユニットテストで担保する。優先度は高。
4. FR-4: 既存ユニットテストが継続して通ることを保証する。内容は `tests/unit/phases/core/agent-executor*.test.ts` を含む既存テストが改修後も成功すること。優先度は中。
5. FR-5: ECRイメージを再ビルドし `all-phases` が通ることを確認する。内容はDockerイメージを再ビルドし、`all-phases` が成功することを確認する。優先度は中。

## 3. 非機能要件
- パフォーマンス要件: 既存ワークフローの総実行時間を悪化させないこと（CLI導入・検出ロジック変更による顕著な実行時間増がないこと）。
- セキュリティ要件: Claude/Codexの認証情報はログに平文出力しないこと。認証失敗検出はエラー構造に限定し、機密情報の漏えいに繋がるログ増加を避けること。
- 可用性・信頼性要件: `all-phases` の `test_implementation` が再現的に失敗しないこと。CLI導入失敗時は警告ログを残し、ビルドや実行が即時停止しない設計（best-effort方針の場合）を明確化すること。
- 保守性・拡張性要件: 認証失敗検出は将来のイベント形式変更に追随しやすい実装（構造化イベント中心）とすること。

## 4. 制約事項
- 技術的制約: 既存のDockerfile、`agent-executor.ts`、既存ユニットテスト群を前提に改修すること。新規の大規模サブシステム追加は行わない。
- リソース制約: 見積もり工数は10〜14時間。要件定義・設計・実装・テストまでを段階的に実施する。
- ポリシー制約: 既存コーディング規約およびCI運用方針に従うこと。認証情報の取り扱いに関する既存ポリシーに準拠すること。

## 5. 前提条件
- システム環境: Dockerビルド環境が利用可能であること。Node.js/npmがDockerイメージ内に存在すること。
- 依存コンポーネント: `@anthropic-ai/claude-agent-sdk` が `@anthropic-ai/claude-code` のCLIを参照する設計であること。
- 外部システム連携: ECRへのイメージ再ビルド/デプロイが可能であること。CI環境で `all-phases` が実行可能であること。

## 6. 受け入れ基準（Given-When-Then）
1. AC-1（FR-1）: Given: Dockerfileのビルド環境が利用可能。When: Dockerイメージをビルドする。Then: `@anthropic-ai/claude-code@latest` がインストールされ、`claude --version` の結果が確認できる（失敗時はWARNINGログを出す）。
2. AC-2（FR-2）: Given: Codexが正常に `type=turn.completed` を出力する。When: 認証失敗検出を実行する。Then: stdoutにソースコード文字列が含まれていても認証失敗と誤判定しない。
3. AC-3（FR-2）: Given: Codexの構造化イベント/エラーに認証失敗が含まれる。When: 認証失敗検出を実行する。Then: 認証失敗として検出され、適切なフォールバック/エラー処理が行われる。
4. AC-4（FR-3）: Given: リポジトリ内の該当ソースを参照するテストケース。When: ユニットテストを実行する。Then: 誤検知が発生しないことがテストで保証される。
5. AC-5（FR-4）: Given: 既存のユニットテスト群。When: `tests/unit/phases/core/agent-executor*.test.ts` を含むテストを実行する。Then: すべて成功する。
6. AC-6（FR-5）: Given: Claude Code CLI導入と認証失敗検出の改修が完了している。When: ECRイメージを再ビルドし `all-phases` を実行する。Then: `test_implementation` を含む全フェーズが成功する。

## 7. スコープ外
- スコープ外: Claude/Codex以外のエージェント導入やワークフロー構造の大規模変更。
- スコープ外: 新規のCIパイプライン設計変更。
- スコープ外: 認証方式そのものの刷新（トークン発行方式の変更等）。
- 将来的な拡張候補: 認証失敗検出ロジックの汎用化（複数SDK/CLI対応）。
- 将来的な拡張候補: 失敗時の自動再試行やリカバリーフローの拡充。
