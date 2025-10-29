# 要件定義書: Issue #51

**Issue番号**: #51
**タイトル**: 機能追加: 環境変数アクセスを一元化する設定管理を追加
**重要度**: MEDIUM
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/51
**作成日**: 2025-01-29

---

## 0. Planning Documentの確認

Planning Phase で策定された開発計画を確認しました：

### 実装戦略
- **戦略**: CREATE（新規モジュール作成中心）
- **判断根拠**: 新規モジュール `src/core/config.ts` の作成が中心で、既存コードへの変更はインポート文の追加とメソッド呼び出しの置き換えのみ

### テスト戦略
- **戦略**: UNIT_ONLY（ユニットテストのみ）
- **判断根拠**: Config クラスは純粋な環境変数アクセスロジックで外部依存がなく、既存の統合テストは Config モックにより動作継続

### 見積もり工数
- **総工数**: 16～24時間（2～3日）
- **内訳**:
  - Config クラス設計・実装: 4～6時間
  - 既存コード置き換え: 8～12時間
  - テストコード実装: 3～4時間
  - ドキュメント更新: 1～2時間

### リスク評価
- **総合リスク**: 中（Medium）
- **主要リスク**: 後方互換性リスク（Medium）、テスト網羅性リスク（Low）、CI/CD 統合リスク（Low）

### 影響範囲
- **変更対象ファイル**: 20ファイル以上（commands/ 3ファイル、core/ 8ファイル、phases/ 1ファイル、utils/ 1ファイル等）
- **依存関係変更**: なし（標準ライブラリのみ使用）
- **マイグレーション**: 不要（環境変数の名前や形式は変更なし）

---

## 1. 概要

### 背景
現在、AI Workflow プロジェクトでは環境変数が 20 箇所以上で `process.env` を通じて直接アクセスされています。これにより以下の問題が発生しています：

1. **一元化された検証の欠如**: 環境変数の存在チェックやバリデーションが各所で重複実装されている
2. **デフォルト値の不整合**: フォールバックロジック（例: `CODEX_API_KEY || OPENAI_API_KEY`）が複数箇所に分散し、一貫性が保証されていない
3. **テストの困難性**: `process.env` を直接参照しているため、テスト時にモックが困難
4. **型安全性の欠如**: 環境変数の値は `string | undefined` 型であり、必須設定とオプション設定の区別が不明確
5. **ドキュメントの不足**: どの環境変数が必須でどれがオプションなのか、コード上で自明ではない

### 目的
環境変数アクセスを一元化する設定管理モジュール（Config クラス）を導入し、以下を実現します：

1. **一元化された検証**: 必須環境変数の検証を単一ポイントで実施
2. **型安全なアクセス**: 必須設定は `string` 型、オプション設定は `string | null` 型を返すメソッドを提供
3. **自己文書化**: メソッド名とシグネチャで必須/オプション設定を明示
4. **テスト容易性**: Config インスタンスをモックすることでテストが容易に
5. **保守性向上**: デフォルト値やフォールバックロジックの変更が単一ポイントで可能

### ビジネス価値・技術的価値
- **開発効率向上**: 新規環境変数の追加が Config クラスの1箇所で完結し、全コードベースで即座に利用可能
- **品質向上**: 一元化された検証により、設定不足によるランタイムエラーを早期検出
- **保守性向上**: 環境変数関連のロジックが単一モジュールに集約され、変更時の影響範囲が明確
- **テスト効率向上**: Config モックにより、テストコードの記述量を削減

---

## 2. 機能要件

### FR-1: Config クラスの実装（優先度: 高）
**説明**: 環境変数アクセスを一元化する Config クラスを `src/core/config.ts` に実装する。

**詳細要件**:
- IConfig インターフェースを定義し、すべての環境変数アクセスメソッドを宣言
- Config クラスが IConfig を実装
- Singleton パターンで `config` インスタンスをエクスポート
- すべてのメソッドに JSDoc コメントを付与

**受け入れ基準**:
- Given: Config クラスが実装されている
- When: `import { config } from '@/core/config'` でインポートできる
- Then: すべての環境変数アクセスメソッドが利用可能である

### FR-2: 必須環境変数の検証（優先度: 高）
**説明**: 必須環境変数が設定されていない場合、明確なエラーメッセージとともに例外をスローする。

**対象環境変数**:
- `GITHUB_TOKEN`: GitHub API アクセス用トークン
- `HOME` / `USERPROFILE`: ホームディレクトリパス（いずれか必須）

**詳細要件**:
- 必須環境変数が未設定の場合、`Error` をスローする
- エラーメッセージには変数名と設定方法を含める
- `HOME` と `USERPROFILE` はどちらか一方が設定されていれば良い

**受け入れ基準**:
- Given: `GITHUB_TOKEN` が未設定
- When: `config.getGitHubToken()` を呼び出す
- Then: `Error: GITHUB_TOKEN environment variable is required` が投げられる

### FR-3: オプション環境変数のアクセス（優先度: 高）
**説明**: オプション環境変数は `string | null` を返すメソッドを提供し、未設定時は `null` を返す。

**対象環境変数**:
- `GITHUB_REPOSITORY`: GitHub リポジトリ名（owner/repo 形式）
- `CODEX_API_KEY`: Codex API キー
- `OPENAI_API_KEY`: OpenAI API キー（Codex のフォールバック）
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude Code 認証ファイルパス
- `CLAUDE_CODE_OAUTH_TOKEN`: Claude Code OAuth トークン
- `GIT_COMMIT_USER_NAME`: Git コミット作成者名
- `GIT_COMMIT_USER_EMAIL`: Git コミット作成者メール
- `GIT_AUTHOR_NAME`: Git Author 名（フォールバック）
- `GIT_AUTHOR_EMAIL`: Git Author メール（フォールバック）
- `REPOS_ROOT`: リポジトリの親ディレクトリ
- `CODEX_CLI_PATH`: Codex CLI バイナリパス
- `LOG_LEVEL`: ログレベル（debug/info/warn/error）
- `LOG_NO_COLOR`: カラーリング無効化フラグ
- `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`: Claude 権限スキップフラグ

**詳細要件**:
- すべてのオプション環境変数は `string | null` を返す
- 未設定時は `null` を返す（例外をスローしない）
- 値のトリム処理（前後の空白除去）を実施

**受け入れ基準**:
- Given: `REPOS_ROOT` が未設定
- When: `config.getReposRoot()` を呼び出す
- Then: `null` が返される

### FR-4: フォールバックロジックの実装（優先度: 高）
**説明**: 複数の環境変数からフォールバックするロジックを Config クラスに集約する。

**対象フォールバック**:
1. Codex API キー: `CODEX_API_KEY` || `OPENAI_API_KEY`
2. ホームディレクトリ: `HOME` || `USERPROFILE`
3. Git ユーザー名: `GIT_COMMIT_USER_NAME` || `GIT_AUTHOR_NAME`
4. Git メール: `GIT_COMMIT_USER_EMAIL` || `GIT_AUTHOR_EMAIL`

**詳細要件**:
- 既存のフォールバックロジックを完全に保持
- 優先順位を明確にドキュメント化（JSDoc コメント）

**受け入れ基準**:
- Given: `CODEX_API_KEY` が未設定、`OPENAI_API_KEY` が設定済み
- When: `config.getCodexApiKey()` を呼び出す
- Then: `OPENAI_API_KEY` の値が返される

### FR-5: CI環境判定メソッドの実装（優先度: 中）
**説明**: CI 環境かどうかを判定するメソッドを提供する。

**詳細要件**:
- `isCI()` メソッドを実装
- `CI=true` または `CI=1` または `JENKINS_HOME` が設定されている場合に `true` を返す
- それ以外は `false` を返す

**受け入れ基準**:
- Given: `CI=true` が設定されている
- When: `config.isCI()` を呼び出す
- Then: `true` が返される

### FR-6: 既存コードの段階的置き換え（優先度: 高）
**説明**: 既存コードの `process.env` アクセスを Config クラスのメソッド呼び出しに置き換える。

**置き換え対象**（優先順位順）:
1. `src/commands/execute.ts` (約17箇所)
2. `src/commands/init.ts` (約1箇所)
3. `src/core/repository-utils.ts` (2箇所: `REPOS_ROOT`, `HOME`)
4. `src/core/github-client.ts` (2箇所: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`)
5. `src/core/codex-agent-client.ts` (1箇所: `CODEX_CLI_PATH`)
6. `src/core/claude-agent-client.ts` (3箇所: `CLAUDE_CODE_CREDENTIALS_PATH`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`)
7. `src/core/content-parser.ts` (1箇所: `OPENAI_API_KEY`)
8. `src/core/logger.ts` (1箇所: `LOG_LEVEL`)
9. `src/core/git/commit-manager.ts` (4箇所: `GIT_COMMIT_USER_NAME`, `GIT_COMMIT_USER_EMAIL`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`)
10. `src/core/git/remote-manager.ts` (1箇所: `GITHUB_TOKEN`)
11. `src/phases/base-phase.ts` (1箇所: `CI` 環境判定)
12. `src/utils/logger.ts` (2箇所: `LOG_LEVEL`, `LOG_NO_COLOR`)

**詳細要件**:
- 各ファイルに `import { config } from '@/core/config'` を追加
- `process.env.XXX` を `config.getXxx()` に置き換え
- エラーハンドリングは既存ロジックを保持（Config クラスで例外をスローする場合はそのまま）
- TypeScript コンパイルエラーがゼロであることを確認

**受け入れ基準**:
- Given: すべての対象ファイルが置き換え済み
- When: `grep -r "process\.env\.(GITHUB_TOKEN|CODEX_API_KEY|HOME|REPOS_ROOT)" src/` を実行
- Then: Config クラス以外でヒットしない（`src/core/config.ts` と `src/core/helpers/env-setup.ts` を除く）

### FR-7: 後方互換性の維持（優先度: 高）
**説明**: 環境変数の名前、形式、デフォルト値を変更せず、既存の動作を完全に保持する。

**詳細要件**:
- 環境変数名は変更しない
- デフォルト値は既存ロジックと完全一致
- フォールバックロジックの優先順位を変更しない
- ユーザー（開発者、CI環境）は既存の環境変数設定を変更不要

**受け入れ基準**:
- Given: 既存の環境変数設定でワークフローが動作していた
- When: Config クラス導入後に同じ環境変数設定で実行
- Then: 同じ動作をする（エラーメッセージを除く）

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
**説明**: Config クラスのメソッド呼び出しが既存の `process.env` アクセスと同等以上のパフォーマンスを持つ。

**詳細要件**:
- メソッド呼び出しのオーバーヘッドは無視できるレベル（1ms未満）
- 環境変数の値をキャッシュしない（実行時の動的変更に対応）

**受け入れ基準**:
- Given: Config クラスのメソッド呼び出し
- When: 100回連続で呼び出す
- Then: 合計実行時間が10ms未満である

### NFR-2: セキュリティ要件
**説明**: 環境変数の値をログやエラーメッセージに含めない。

**詳細要件**:
- エラーメッセージには変数名のみを含め、値は含めない
- ログ出力時も環境変数の値をマスキング（SecretMasker 統合は別Issue）

**受け入れ基準**:
- Given: `GITHUB_TOKEN` が未設定
- When: `config.getGitHubToken()` を呼び出す
- Then: エラーメッセージに `GITHUB_TOKEN` という文字列は含まれるが、実際の値は含まれない

### NFR-3: 可用性・信頼性要件
**説明**: Config クラスの初期化エラーが適切にハンドリングされ、システム全体が停止しない。

**詳細要件**:
- 必須環境変数が未設定の場合、明確なエラーメッセージとともに例外をスロー
- オプション環境変数の取得失敗時は `null` を返し、例外をスローしない
- CI/CD 環境での動作を妨げない

**受け入れ基準**:
- Given: オプション環境変数が未設定
- When: Config クラスのメソッドを呼び出す
- Then: 例外はスローされず、`null` が返される

### NFR-4: 保守性・拡張性要件
**説明**: 新規環境変数の追加が Config クラスの1箇所で完結し、全コードベースで即座に利用可能。

**詳細要件**:
- IConfig インターフェースにメソッドを追加
- Config クラスに実装を追加
- JSDoc コメントを追加
- 既存メソッドの変更不要

**受け入れ基準**:
- Given: 新規環境変数 `NEW_VAR` を追加したい
- When: Config クラスに `getNewVar()` メソッドを追加
- Then: 全コードベースで `config.getNewVar()` が利用可能になる

---

## 4. 制約事項

### 技術的制約
1. **使用技術**: TypeScript 5.6.3、Node.js 20 以上
2. **既存アーキテクチャとの整合性**: Singleton パターンで実装し、依存性注入（DI）は不要
3. **外部ライブラリ**: 標準ライブラリのみ使用（新規依存関係の追加なし）
4. **既存テストの互換性**: Config モックにより既存テストが無変更で動作する

### リソース制約
1. **時間**: 2～3日（16～24時間）
2. **人員**: 1名（AI Workflow Agent）
3. **予算**: なし（追加コストなし）

### ポリシー制約
1. **セキュリティポリシー**: 環境変数の値をログやエラーメッセージに含めない
2. **コーディング規約**: ESLint ルール準拠（`no-console` ルールによる `logger` 使用強制）
3. **テストカバレッジ**: Config クラスのユニットテストカバレッジ 90% 以上
4. **ドキュメント**: CLAUDE.md および README.md の更新必須

---

## 5. 前提条件

### システム環境
- Node.js 20 以上
- TypeScript 5.6.3
- Jest 30.2.0（ES modules 対応）
- 既存の環境変数設定が正しく機能している

### 依存コンポーネント
- `src/utils/logger.ts`: 統一ログモジュール（Issue #61で追加済み）
- 既存のエージェントクライアント（CodexAgentClient、ClaudeAgentClient）
- 既存の Git/GitHub 統合モジュール

### 外部システム連携
- なし（環境変数は Node.js の標準機能）

---

## 6. 受け入れ基準

### AC-1: Config クラスの完成
**受け入れ基準**:
- Given: Config クラスが実装されている
- When: すべての環境変数アクセスメソッドを呼び出す
- Then: 正しい値が返されるか、適切な例外がスローされる

### AC-2: 必須環境変数の検証
**受け入れ基準**:
- Given: `GITHUB_TOKEN` が未設定
- When: `config.getGitHubToken()` を呼び出す
- Then: `Error` が投げられ、エラーメッセージに変数名と設定方法が含まれる

### AC-3: オプション環境変数の取得
**受け入れ基準**:
- Given: `REPOS_ROOT` が未設定
- When: `config.getReposRoot()` を呼び出す
- Then: `null` が返される（例外はスローされない）

### AC-4: フォールバックロジックの動作
**受け入れ基準**:
- Given: `CODEX_API_KEY` が未設定、`OPENAI_API_KEY` が設定済み
- When: `config.getCodexApiKey()` を呼び出す
- Then: `OPENAI_API_KEY` の値が返される

### AC-5: CI環境判定
**受け入れ基準**:
- Given: `CI=true` が設定されている
- When: `config.isCI()` を呼び出す
- Then: `true` が返される

### AC-6: 既存コードの置き換え完了
**受け入れ基準**:
- Given: すべての対象ファイルが置き換え済み
- When: TypeScript コンパイルを実行
- Then: エラーがゼロである

### AC-7: ユニットテストの完成
**受け入れ基準**:
- Given: `tests/unit/core/config.test.ts` が実装されている
- When: `npm run test:unit` を実行
- Then: すべてのテストが成功し、カバレッジが 90% 以上である

### AC-8: 統合テストの成功
**受け入れ基準**:
- Given: Config クラスが導入されている
- When: `npm run test:integration` を実行
- Then: すべての統合テストが成功する（既存テストの破壊なし）

### AC-9: ドキュメントの更新
**受け入れ基準**:
- Given: CLAUDE.md と README.md が更新されている
- When: ドキュメントを確認
- Then: Config クラスの使用方法と環境変数一覧が記載されている

### AC-10: 後方互換性の確認
**受け入れ基準**:
- Given: 既存の環境変数設定でワークフローが動作していた
- When: Config クラス導入後に同じ環境変数設定で実行
- Then: 同じ動作をする（既存ワークフローが破壊されていない）

---

## 7. スコープ外

### 明確にスコープ外とする事項
1. **環境変数の値の暗号化**: Config クラスは環境変数を読み取るのみで、暗号化・復号化は行わない
2. **環境変数の動的変更**: Config クラスは `process.env` を直接読み取り、キャッシュしない（既存動作を保持）
3. **環境変数の検証ルール拡充**: 既存の検証ロジック（例: メールアドレス形式チェック）は保持するが、新規検証ルールは追加しない
4. **設定ファイルからの読み込み**: Config クラスは環境変数のみを対象とし、`.env` ファイルや JSON 設定ファイルの読み込みは行わない
5. **環境変数のリロード**: アプリケーション起動後に環境変数を動的にリロードする機能は提供しない
6. **ESLint ルール追加**: `no-process-env` ルールの追加は別Issue で検討（Planning Document に記載あり）

### 将来的な拡張候補
1. **環境変数の検証ルール拡充**: メールアドレス形式、URL 形式、数値範囲などの詳細な検証
2. **設定ファイルのサポート**: `.env` ファイルや JSON 設定ファイルからの読み込み
3. **環境変数のキャッシュ**: パフォーマンス最適化のため、初回アクセス時にキャッシュ
4. **環境変数の動的リロード**: `config.reload()` メソッドによる動的な再読み込み
5. **ESLint ルール追加**: `no-process-env` ルールで `process.env` の直接アクセスを禁止し、Config クラスの使用を強制

---

## 品質ゲート（Phase 1）

作成した要件定義書は、以下の品質ゲートを満たしています：

- [x] **機能要件が明確に記載されている**: FR-1～FR-7 で7つの機能要件を具体的に記述
- [x] **受け入れ基準が定義されている**: AC-1～AC-10 で10の受け入れ基準を Given-When-Then 形式で記述
- [x] **スコープが明確である**: スコープ外とする6つの事項を明示的に列挙
- [x] **論理的な矛盾がない**: 機能要件、非機能要件、制約事項間で矛盾なく整合性を確認

---

## 参考資料

### Issue 本文
- Issue URL: https://github.com/tielec/ai-workflow-agent/issues/51
- 提案する解決策、メリット、実装計画が記載されている

### Planning Document
- `.ai-workflow/issue-51/00_planning/output/planning.md`
- 実装戦略（CREATE）、テスト戦略（UNIT_ONLY）、工数見積もり、リスク評価、タスク分割が記載されている

### プロジェクトドキュメント
- `CLAUDE.md`: プロジェクトの全体方針、環境変数一覧、コーディング規約
- `ARCHITECTURE.md`: アーキテクチャ設計思想、モジュール構成、設計パターン
- `README.md`: プロジェクト概要、環境変数一覧、使用方法

---

**要件定義書バージョン**: 1.0
**作成者**: AI Workflow Agent (Requirements Phase)
