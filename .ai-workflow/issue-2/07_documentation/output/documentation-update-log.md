# プロジェクトドキュメント更新ログ - Issue #2

## 調査したドキュメント

プロジェクトルート直下の全ドキュメントファイルを調査しました（node_modules、.ai-workflow、src/templates 配下を除く）：

- `README.md`
- `CLAUDE.md`
- `ARCHITECTURE.md`
- `TROUBLESHOOTING.md`
- `ROADMAP.md`
- `PROGRESS.md`
- `DOCKER_AUTH_SETUP.md`
- `SETUP_TYPESCRIPT.md`

## 更新したドキュメント

### `README.md`
**更新理由**: ユーザー向けメインドキュメントに新機能を追加

**主な変更内容**:
- CLI オプション一覧に `--cleanup-on-complete` と `--cleanup-on-complete-force` を追加
- 「ワークフローディレクトリの完全削除（オプション）」セクションを新規追加
  - 使用例（基本・CI環境・全フェーズ実行時）を記載
  - 削除対象、実行タイミング、確認プロンプト、Git 自動コミットの説明
  - デフォルト動作（成果物保持）の注意書き

### `CLAUDE.md`
**更新理由**: Claude Code (AI エージェント) 向けガイダンスに実装詳細を追加

**主な変更内容**:
- 「ワークフローディレクトリの完全削除（v0.3.0）」セクションを新規追加
  - CLI オプション、削除対象、確認プロンプト、実装メソッドを記載
  - セキュリティ対策（パス検証、シンボリックリンクチェック）を明記
- Report Phase クリーンアップとの違いを表形式で追加
  - 削除対象、実行タイミング、目的、保護対象の比較

### `ARCHITECTURE.md`
**更新理由**: 開発者向けアーキテクチャドキュメントに技術的詳細を追加

**主な変更内容**:
- 「Evaluation Phase 完了後のクリーンアップ（v0.3.0）」セクションを新規追加
  - 実行フロー（8ステップ）を詳細に記載
  - エラーハンドリング戦略（Report Phaseと同様の処理）
  - セキュリティ対策（パストラバーサル攻撃防止、シンボリックリンク攻撃防止）

### `TROUBLESHOOTING.md`
**更新理由**: トラブルシューティングガイドに新機能のエラーケースを追加

**主な変更内容**:
- 「Evaluation Phase クリーンアップ関連（v0.3.0）」セクションを新規追加（セクション9）
  - 「ワークフローディレクトリ全体が削除された」対処法（Git履歴からの復元方法）
  - 「確認プロンプトが表示されてCIビルドがハングする」対処法（force オプション、CI環境変数）
  - 「クリーンアップで不正なパスエラー」対処法（metadata.json の修正方法）
  - 「シンボリックリンクエラー」説明（セキュリティ保護の動作）
- 既存の「デバッグのヒント」をセクション10に繰り下げ

## 更新不要と判断したドキュメント

- `ROADMAP.md`: 開発ロードマップドキュメント。Issue #2 の機能は v0.3.0 リリース予定として既に反映されており、追加の更新は不要
- `PROGRESS.md`: Python → TypeScript 移行の進捗管理ドキュメント。個別機能の詳細ではなく移行完了状況を記載しているため、既存の「フェーズ完了」情報で十分
- `DOCKER_AUTH_SETUP.md`: Docker/Jenkins での認証設定ガイド。今回の変更は認証に影響しないため更新不要
- `SETUP_TYPESCRIPT.md`: ローカル開発環境構築ガイド。開発環境セットアップには影響しないため更新不要

## 影響分析

Issue #2 で実装された変更内容：

**機能面の変更**:
- 新機能: Evaluation Phase 完了後のオプショナルなワークフローディレクトリ完全削除機能
- 新規 CLI オプション: `--cleanup-on-complete`, `--cleanup-on-complete-force`
- 既存動作への影響: なし（デフォルト動作は変更なし）

**インターフェースの変更**:
- CLI オプション追加: `--cleanup-on-complete` (boolean, default: false), `--cleanup-on-complete-force` (boolean, default: false)
- PhaseRunOptions 拡張: `cleanupOnComplete?`, `cleanupOnCompleteForce?` フィールド追加

**内部構造の変更**:
- `BasePhase` クラスに `cleanupWorkflowArtifacts()` メソッド追加
- `EvaluationPhase.run()` にクリーンアップ統合処理を追加
- セキュリティ対策: パス検証（正規表現）、シンボリックリンクチェック

## ドキュメント更新基準

各ドキュメントの更新判断基準：

1. **README.md**: エンドユーザー（開発者）が CLI を使用する際に必要な情報 → **更新必要**
2. **CLAUDE.md**: AI エージェントが実装詳細を理解するための技術情報 → **更新必要**
3. **ARCHITECTURE.md**: 開発者がシステムアーキテクチャを理解するための技術情報 → **更新必要**
4. **TROUBLESHOOTING.md**: ユーザーが新機能使用時に遭遇する可能性のある問題と対処法 → **更新必要**
5. **ROADMAP.md / PROGRESS.md**: 既存の記載で十分（個別機能の詳細は不要） → **更新不要**
6. **DOCKER_AUTH_SETUP.md / SETUP_TYPESCRIPT.md**: 認証・開発環境には影響なし → **更新不要**

## 品質ゲート確認

- ✅ **影響を受けるドキュメントが特定されている**: 8個のドキュメントを調査し、4個を更新対象として特定
- ✅ **必要なドキュメントが更新されている**: ユーザー向け（README）、開発者向け（CLAUDE、ARCHITECTURE）、トラブルシューティング（TROUBLESHOOTING）を更新
- ✅ **更新内容が記録されている**: 本ログに各ドキュメントの更新理由と変更内容を明記

---

**更新日**: 2025-01-26
**対象 Issue**: #2 - Evaluation Phase 完了後の .ai-workflow クリーンアップオプション
**バージョン**: v0.3.0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
