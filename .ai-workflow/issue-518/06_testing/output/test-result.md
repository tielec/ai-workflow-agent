# テスト失敗による実装修正の必要性

## 修正が必要な理由
- 2025-12-25に `npm test` をフル実行したところ、28スイート・229テストが失敗し、クリティカルなワークフローが壊れているままのためPhase 6には進めません。
- メタデータ移行とバックアップ周りのモックが崩れ、ロールバック系ユニットテストで TypeError が多発。Git初期化/クレデンシャル処理でも想定外の警告が出ています。
- エージェント実行・ステップ実行・プロンプト配布といった主要シナリオでも期待動作が確認できず、現在の実装では品質ゲートを満たしません。

## 失敗したテスト
- tests/unit/core/metadata-manager-rollback.test.ts の各UC (existsSyncモックエラーで連鎖失敗)
- tests/unit/git-manager-issue16.test.ts (init系コミット/リモート設定の警告)
- tests/integration/agent-client-execution.test.ts (Codex実行フローでログ出力が呼ばれず)
- tests/unit/phases/lifecycle/step-executor.test.ts (UC-SE-03 の beforeEach でタイムアウト)
- tests/unit/prompts/issue-207-prompt-simplification.test.ts および tests/unit/prompts/prompt-simplification.test.ts (dist配下のプロンプトファイル未生成)
- 上記以外にも複数スイートが失敗し、総計で229件のテストが赤字

## 必要な実装修正
- MetadataManager の移行/バックアップ処理と fsモックの整合を取り、rollback関連テストで TypeError が出ないようにする。
- GitManager/RemoteManager の初期化・クレデンシャル設定フローをテスト環境向けに安全化し、init系テストを緑に戻す。
- エージェント実行フローでのログ出力・spawn呼び出しを再度モック期待に合わせる。
- dist/prompts へのコピー生成をビルドまたはテスト前処理で保証し、プロンプト配布テストを通す。
- step-executor のセットアップ遅延/ハングを解消し、全スイートが完走するまで再実行して確認する。
