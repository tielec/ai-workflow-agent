# 実装ログ - Issue #177

## 実装サマリー

- **実装戦略**: EXTEND（既存ファイルの拡張）
- **変更ファイル数**: 3個
- **新規作成ファイル数**: 0個

## 変更ファイル一覧

### 修正

1. `Dockerfile`: Ubuntuベースへの移行、Node.js 20.xインストール、build-essential/sudo追加
2. `src/core/config.ts`: `canAgentInstallPackages()` メソッドと `parseBoolean()` ヘルパーメソッドの追加
3. `src/phases/base-phase.ts`: プロンプト注入ロジックと `buildEnvironmentInfoSection()` メソッドの追加

## 実装詳細

### ファイル1: Dockerfile

**変更内容**:
- ベースイメージを `node:20-slim` から `ubuntu:22.04` に変更
- Node.js 20.x を NodeSource 公式リポジトリからインストール
- `build-essential`（gcc, g++, make等）、`sudo` をインストール
- 環境変数 `AGENT_CAN_INSTALL_PACKAGES=true` を設定
- イメージサイズ最適化のため、各RUNコマンド後に `rm -rf /var/lib/apt/lists/*` を実行

**理由**:
- Docker環境でAIエージェントが多言語環境（Python、Go、Java、Rust、Ruby）を自由にインストール可能にするため
- NodeSourceリポジトリは Node.js 公式推奨のインストール方法であり、安定性が高い
- `build-essential` により、C/C++コンパイラやmakeなどのビルドツール群を一括インストール
- `sudo` により、エージェントがパッケージ管理操作を実行可能に

**注意点**:
- イメージサイズが約200MB（node:20-slim）から約400〜500MB（ubuntu:22.04 + Node.js）に増加する可能性がある
- `apt-get clean` と `/var/lib/apt/lists/*` 削除により、できる限りサイズ増加を抑制
- Node.js バージョン確認（`RUN node --version && npm --version`）をビルド時に実行し、インストールの成功を検証

### ファイル2: src/core/config.ts

**変更内容**:
1. `IConfig` インターフェースに `canAgentInstallPackages(): boolean` メソッドを追加
2. `Config` クラスに実装を追加:
   - `public canAgentInstallPackages(): boolean` - 環境変数 `AGENT_CAN_INSTALL_PACKAGES` を解析し、boolean を返す
   - `private parseBoolean(value: string | null, defaultValue: boolean): boolean` - 文字列を boolean に変換する内部ヘルパーメソッド

**理由**:
- 既存パターン（`getLogNoColor()` メソッド）を踏襲し、コードの一貫性を維持
- `parseBoolean()` ヘルパーメソッドにより、boolean型環境変数のパースロジックを共通化
- 環境変数が未設定または空文字列の場合、デフォルト値（`false`）を返すことで、安全側に倒す（セキュリティ観点）
- `toLowerCase().trim()` により、大文字小文字の違いや前後の空白を許容

**注意点**:
- `parseBoolean()` は `"true"` と `"1"` のみを `true` と解釈する（`"yes"` や `"on"` は `false` として扱う）
- デフォルト値は `false`（Docker環境では Dockerfile で明示的に `true` を設定）
- 既存のフォローアップLLM設定メソッド（`getFollowupLlmAppendMetadata()`）でも類似のロジックがあるが、今回は設計書に従い新規ヘルパーメソッドを追加

### ファイル3: src/phases/base-phase.ts

**変更内容**:
1. `import { config } from '../core/config.js';` を追加
2. `loadPrompt()` メソッドに環境情報注入ロジックを追加:
   - `execute` ステップのみに環境情報を注入（`review` および `revise` には注入しない）
   - `config.canAgentInstallPackages()` が `true` の場合のみ注入
   - プロンプトの先頭に環境情報セクションを挿入
   - 注入時にログ出力（`logger.info()`）
3. `buildEnvironmentInfoSection()` プライベートメソッドを追加:
   - Markdown形式の環境情報セクションを生成
   - Python、Go、Java、Rust、Rubyの5言語のインストールコマンドを記載

**理由**:
- `execute` ステップのみに注入することで、エージェントが初回実行時にのみ環境情報を受け取る（`review` や `revise` では不要）
- プロンプトの先頭に注入することで、エージェントが最初に環境情報を確認できる
- 既存の差し戻し情報注入ロジック（Issue #90）と同様のパターンを踏襲
- `buildEnvironmentInfoSection()` を private メソッドとして実装し、責務を分離

**注意点**:
- 環境情報注入は**既存のプロンプト内容の前**に挿入されるため、プロンプトテンプレートの先頭に追加情報が表示される
- `config.canAgentInstallPackages()` が `false` の場合（Docker外部のローカル開発環境）、環境情報は注入されない
- 5言語のインストールコマンドは設計書に従って記載（将来的に言語リストを環境変数から読み込む拡張が可能）

## 技術的な考慮事項

### 1. 既存コードの規約準拠

- **CLAUDE.md** の規約に従い、以下を遵守:
  - `process.env` への直接アクセスを避け、`config` クラス経由でアクセス（Issue #51）
  - 統一loggerモジュール（`src/utils/logger.ts`）を使用（Issue #61）
  - 既存パターン（`getLogNoColor()`、差し戻し情報注入）を踏襲

### 2. 後方互換性

- 環境変数 `AGENT_CAN_INSTALL_PACKAGES` が未設定の場合、デフォルト動作（`false`）を維持
- 既存のワークフローに影響を与えない（Docker環境のみで有効化）
- プロンプト注入は既存プロンプトの前に追加するのみで、既存内容を変更しない

### 3. セキュリティ対策

- デフォルトでパッケージインストールを無効化（`false`）
- Docker環境のみで有効化（`AGENT_CAN_INSTALL_PACKAGES=true` を Dockerfile で設定）
- Docker隔離環境により、悪意のあるパッケージインストールのホストへの影響を防止

### 4. パフォーマンス最適化

- Dockerイメージサイズ削減:
  - `apt-get clean` でキャッシュ削除
  - `rm -rf /var/lib/apt/lists/*` でパッケージリスト削除
- Dockerレイヤーキャッシュの活用:
  - 頻繁に変更されるファイル（`COPY . .`）を後半に配置

## 次のステップ

- **Phase 5（test_implementation）**: テストコードの実装
  - `tests/unit/core/config.test.ts` に `canAgentInstallPackages()` のテストスイートを追加（約10件のテストケース）
  - 環境変数パターン網羅テスト（true、1、false、0、未設定、空文字列、その他の値）
- **Phase 6（testing）**: テストの実行
  - `npm test` でユニットテストを実行
  - カバレッジレポート確認（新規コードのカバレッジ 80%以上を目標）
  - Docker イメージビルドテスト（`docker build`）
  - イメージサイズ確認（500MB以下を目標）
  - コンテナ起動テスト（`docker run`）

## 品質ゲート確認

- [x] **Phase 2の設計に沿った実装である**: 設計書の「詳細設計」セクションに完全準拠
- [x] **既存コードの規約に準拠している**: CLAUDE.md、既存パターンを踏襲
- [x] **基本的なエラーハンドリングがある**: `parseBoolean()` で null/空文字列を適切に処理
- [x] **明らかなバグがない**: 実装ロジックは単純で、テストシナリオでカバー可能

---

**作成日時**: 2025-01-31
**作成者**: AI Workflow Agent (Implementation Phase)
**Issue番号**: #177
**バージョン**: v1.0
