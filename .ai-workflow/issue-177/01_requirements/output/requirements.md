# 要件定義書 - Issue #177

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### 全体戦略
- **実装戦略**: EXTEND（既存ファイルの拡張が中心、新規ファイルはテストコードのみ）
- **テスト戦略**: UNIT_ONLY（ユニットテスト中心、外部システム連携なし）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルへの追加）
- **複雑度**: 中程度（3ファイルの変更、新規テストケース約10件）
- **見積もり工数**: 8〜12時間
- **リスク評価**: 中（Dockerイメージサイズ増加、セキュリティリスク等）

### 主要なリスクと軽減策
1. **Dockerイメージサイズの大幅増加**（100MB → 500MB+）
   - 軽減策: apt-get clean、マルチステージビルド検討
2. **Node.jsインストール失敗**
   - 軽減策: NodeSource公式リポジトリ使用、インストール後の動作確認
3. **セキュリティリスク**（悪意のあるパッケージインストール）
   - 軽減策: Docker隔離環境、agent_log.mdによる事後監査
4. **ビルド時間の増加**
   - 軽減策: レイヤーキャッシュ活用、5分以内を目標

### 影響範囲
- **変更ファイル**: Dockerfile（約49→70行）、config.ts（約412→450行）、base-phase.ts（約764→810行）、config.test.ts（約880→1000行）
- **依存関係の変更**: Ubuntu パッケージ（build-essential、sudo等）、Node.js 20.x
- **マイグレーション**: 不要（環境変数追加のみ、オプショナル）

---

## 1. 概要

### 1.1 背景

現在のDockerイメージは `node:20-slim` ベースであり、Node.js以外の言語環境（Python、Go、Java、Rust、Ruby等）が含まれていません。しかし、AI Workflow Agentが対象とするリポジトリは多様であり、以下のような状況が発生します：

- **多言語プロジェクト**: Node.js以外の言語（Python、Go等）を使用するリポジトリに対してワークフローを実行する場合、テスト実行フェーズ（Phase 6: Testing）でテストを実行できない
- **言語固有のツール**: コード品質チェック（Pylint、golangci-lint等）やビルドツール（Maven、Gradle等）が不足している
- **統合テスト**: 複数言語の統合テストを実行する場合、必要な言語ランタイムが不足している

Docker内部は隔離環境であるため、エージェントが必要なパッケージを自由にインストールしても、ホストシステムや他のコンテナに影響を与えることはありません。

### 1.2 目的

Docker環境で実行されるAIエージェント（Codex/Claude）が、必要に応じて言語環境やビルドツールを自由にインストールできるようにすることで、以下を実現します：

1. **多言語リポジトリのサポート**: Python、Go、Java、Rust、Ruby等のリポジトリに対してもワークフローを実行可能にする
2. **テスト実行の完全性**: Phase 6（Testing）でリポジトリ固有のテストスイートを実行可能にする
3. **エージェントの自律性向上**: エージェントが必要なツールを自己判断でインストールできるようにし、人間の介入を最小化する

### 1.3 ビジネス価値・技術的価値

- **ビジネス価値**: 対応可能なリポジトリの範囲が拡大し、AI Workflow Agentの適用範囲が広がる
- **技術的価値**: エージェントの自律性が向上し、ワークフローの完全自動化に近づく
- **運用価値**: 言語環境のセットアップ作業が不要になり、オペレーターの負担が軽減される

---

## 2. 機能要件

### FR-1: Dockerベースイメージの変更（優先度: 高）

**要件**:
- Dockerfileのベースイメージを `node:20-slim` から `ubuntu:22.04` に変更する
- Node.js 20.x を公式リポジトリ（NodeSource）からインストールする
- インストール後、`node --version` で動作確認を実施する

**詳細**:
- Ubuntu 22.04を選定した理由: LTS版であり、幅広いパッケージリポジトリを利用可能
- NodeSource リポジトリを使用する理由: Node.js公式推奨のインストール方法であり、安定性が高い

**受け入れ基準**:
```gherkin
Given: Dockerfileが存在する
When: docker build を実行する
Then:
  - ベースイメージが ubuntu:22.04 である
  - Node.js 20.x がインストールされている
  - node --version が v20.x.x を返す
  - npm --version が 10.x.x を返す
```

---

### FR-2: ビルドツールのインストール（優先度: 高）

**要件**:
- `build-essential` パッケージをインストールし、C/C++コンパイラ、make等を利用可能にする
- `sudo` パッケージをインストールし、エージェントがパッケージ管理操作を実行可能にする

**詳細**:
- build-essential には以下が含まれる: gcc, g++, make, libc-dev
- sudo は権限昇格に使用されるが、Docker内部では制約なく実行可能

**受け入れ基準**:
```gherkin
Given: Dockerイメージがビルド済みである
When: コンテナ内で gcc --version を実行する
Then: gccのバージョン情報が表示される

And:
When: コンテナ内で make --version を実行する
Then: makeのバージョン情報が表示される

And:
When: コンテナ内で sudo --version を実行する
Then: sudoのバージョン情報が表示される
```

---

### FR-3: 環境変数の設定（優先度: 高）

**要件**:
- Dockerfile内で環境変数 `AGENT_CAN_INSTALL_PACKAGES=true` を設定する
- この環境変数は、エージェントがパッケージインストールを実行可能であることを示す

**詳細**:
- 環境変数はDockerfileの `ENV` 命令で設定
- デフォルト値は `true`（Docker環境ではパッケージインストールを許可）
- Docker外部（ローカル開発環境）では未設定または `false` となる

**受け入れ基準**:
```gherkin
Given: Dockerイメージがビルド済みである
When: コンテナ内で echo $AGENT_CAN_INSTALL_PACKAGES を実行する
Then: "true" が出力される
```

---

### FR-4: Config クラスの拡張（優先度: 高）

**要件**:
- `src/core/config.ts` の `IConfig` インターフェースに `canAgentInstallPackages(): boolean` メソッドを追加する
- `Config` クラスに実装を追加し、環境変数 `AGENT_CAN_INSTALL_PACKAGES` の値を解析して boolean を返す

**詳細**:
- `canAgentInstallPackages()` メソッドの動作:
  - `AGENT_CAN_INSTALL_PACKAGES` が `"true"` または `"1"` の場合: `true` を返す
  - `AGENT_CAN_INSTALL_PACKAGES` が `"false"`、`"0"`、未設定、空文字列の場合: `false` を返す
- 既存パターン（`getLogNoColor()` メソッド）を踏襲し、`parseBoolean()` 内部ヘルパーメソッドを追加（オプション）

**受け入れ基準**:
```gherkin
Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES が "true" に設定されている
When: config.canAgentInstallPackages() を呼び出す
Then: true が返される

And:
Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES が "1" に設定されている
When: config.canAgentInstallPackages() を呼び出す
Then: true が返される

And:
Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES が "false" に設定されている
When: config.canAgentInstallPackages() を呼び出す
Then: false が返される

And:
Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES が未設定である
When: config.canAgentInstallPackages() を呼び出す
Then: false が返される（デフォルト値）
```

---

### FR-5: プロンプトへの環境情報注入（優先度: 高）

**要件**:
- `src/phases/base-phase.ts` の `loadPrompt()` メソッドを拡張し、環境情報セクションをプロンプトの先頭に注入する
- `config.canAgentInstallPackages()` が `true` の場合のみ注入を実施
- 環境情報セクションには、インストール可能な言語リスト（Python、Go、Java、Rust、Ruby）とインストールコマンドを含める

**詳細**:
- **注入位置**: プロンプトの先頭（既存のテンプレート内容の前）
- **Markdownフォーマット**: セクションヘッダー（`##`）、箇条書き、コードブロックを使用
- **内部ヘルパーメソッド**: `buildEnvironmentInfoSection()` プライベートメソッドを追加（環境情報のMarkdown生成を担当）

**環境情報セクションの内容例**:
```markdown
## 🛠️ 開発環境情報

このDocker環境では、以下のプログラミング言語をインストール可能です：

- **Python**: `apt-get update && apt-get install -y python3 python3-pip`
- **Go**: `apt-get update && apt-get install -y golang-go`
- **Java**: `apt-get update && apt-get install -y default-jdk`
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`
- **Ruby**: `apt-get update && apt-get install -y ruby ruby-dev`

テスト実行や品質チェックに必要な言語環境は、自由にインストールしてください。
```

**受け入れ基準**:
```gherkin
Given: AGENT_CAN_INSTALL_PACKAGES が true である
When: BasePhase.loadPrompt() を呼び出す
Then:
  - プロンプトの先頭に環境情報セクションが注入される
  - セクション内にPython、Go、Java、Rust、Rubyのインストールコマンドが含まれる

And:
Given: AGENT_CAN_INSTALL_PACKAGES が false である
When: BasePhase.loadPrompt() を呼び出す
Then: 環境情報セクションは注入されない（既存プロンプトのまま）
```

---

### FR-6: ユニットテストの追加（優先度: 高）

**要件**:
- `tests/unit/core/config.test.ts` に `canAgentInstallPackages()` メソッドのテストスイートを追加する
- 環境変数パターン（true、1、false、0、未設定、空文字列、その他の値）を網羅的にテストする
- 既存のテストパターン（Given/When/Then）に従ってテストケースを実装する

**詳細**:
- 約10件のテストケースを追加（環境変数の各パターン）
- `beforeEach()` で環境変数をリセット
- `afterEach()` で環境変数をクリーンアップ

**受け入れ基準**:
```gherkin
Given: config.test.ts にテストスイートが追加されている
When: npm test を実行する
Then:
  - canAgentInstallPackages() の全テストケースが成功する
  - カバレッジレポートで新規コードのカバレッジが80%以上である
```

---

## 3. 非機能要件

### NFR-1: パフォーマンス（優先度: 中）

**要件**:
- Dockerイメージサイズは 500MB以下を目標とする
- Dockerイメージビルド時間は 5分以内を目標とする
- プロンプト注入処理のオーバーヘッドは 100ms以内とする

**理由**:
- node:20-slim（約200MB）から ubuntu:22.04 + Node.js（約400〜500MB）への変更により、イメージサイズが増加
- apt-get clean、マルチステージビルド等の最適化により、サイズ増加を抑制

**測定方法**:
- `docker images` コマンドでイメージサイズを確認
- `docker build` コマンドの実行時間を計測
- `console.time()` / `console.timeEnd()` でプロンプト注入処理時間を計測

---

### NFR-2: セキュリティ（優先度: 高）

**要件**:
- 環境変数 `AGENT_CAN_INSTALL_PACKAGES` のデフォルト値は `false` とする（Docker内部のみ `true`）
- エージェントが実行するコマンドは `agent_log.md` に記録され、事後監査が可能である
- Dockerコンテナは隔離環境であり、悪意のあるパッケージインストールがホストに影響を与えない

**理由**:
- エージェントが任意のパッケージをインストールできるため、悪意のあるパッケージがインストールされるリスクがある
- Docker隔離環境により、ホストシステムへの影響は限定的
- agent_log.md による監査証跡により、事後的な問題調査が可能

**対策**:
- デフォルトでパッケージインストールを無効化（Docker外部での安全性）
- agent_log.md に実行コマンドを記録（監査証跡）
- Dockerコンテナの隔離性を活用（ホストへの影響を防止）

---

### NFR-3: 保守性（優先度: 中）

**要件**:
- 既存の Config パターンを踏襲する（`getLogNoColor()` パターン）
- 既存の BasePhase パターンを踏襲する（`loadPrompt()` 拡張パターン）
- テストコードは既存パターン（Given/When/Then）に従う

**理由**:
- コードの一貫性を保つことで、保守性が向上
- 既存パターンを踏襲することで、学習コストが低減

---

### NFR-4: 後方互換性（優先度: 高）

**要件**:
- 環境変数未設定時はデフォルト動作（パッケージインストール無効、`false`）とする
- 既存のワークフローに影響を与えない（Dockerイメージの変更のみ）
- プロンプト注入は既存プロンプトの先頭に追加するのみで、既存プロンプト内容は変更しない

**理由**:
- 既存のローカル開発環境やCI環境に影響を与えないようにする
- 環境変数未設定時は従来通りの動作を維持

---

## 4. 制約事項

### 4.1 技術的制約

1. **ベースイメージ**: Ubuntu 22.04 LTS を使用（他のディストリビューションは対象外）
2. **Node.jsバージョン**: Node.js 20.x のみサポート（NodeSource公式リポジトリから取得）
3. **パッケージマネージャ**: apt-get のみサポート（yum、dnf等は対象外）
4. **言語サポート**: Python、Go、Java、Rust、Ruby の5言語を優先的にサポート（他言語は将来拡張）

### 4.2 リソース制約

1. **Dockerイメージサイズ**: 500MB以下を目標（超過する場合は最適化策を検討）
2. **ビルド時間**: 5分以内を目標（超過する場合はレイヤーキャッシュ活用）
3. **工数**: 8〜12時間（Planning Documentの見積もりに従う）

### 4.3 ポリシー制約

1. **セキュリティポリシー**: エージェントが実行するコマンドはagent_log.mdに記録すること（監査証跡）
2. **コーディング規約**: 既存の Config パターン、BasePhase パターンを踏襲すること
3. **テスト規約**: 新規コードのカバレッジは80%以上を維持すること

---

## 5. 前提条件

### 5.1 システム環境

- **Docker**: 24.0以上がインストールされている
- **Git**: 2.30以上がインストールされている
- **Node.js**: ローカル開発環境では Node.js 20.x がインストールされている

### 5.2 依存コンポーネント

- **NodeSource リポジトリ**: Node.js 20.x の公式インストール元として使用
- **Ubuntu APT リポジトリ**: build-essential、sudo等のパッケージ取得元
- **Rustup**: Rust言語のインストールスクリプト提供元

### 5.3 外部システム連携

- **GitHub**: リポジトリのクローン、プッシュ、PR作成に使用
- **Jenkins**: CI/CD環境でDockerイメージビルドに使用（`Jenkinsfile`）
- **Codex/Claude API**: エージェントとして使用（パッケージインストールを実行）

---

## 6. 受け入れ基準

### AC-1: Dockerイメージのビルド成功

```gherkin
Given: Dockerfileが ubuntu:22.04 ベースに変更されている
When: docker build -t ai-workflow-agent . を実行する
Then:
  - ビルドが成功する（エラーなし）
  - イメージサイズが500MB以下である
  - ビルド時間が5分以内である
```

### AC-2: Node.js動作確認

```gherkin
Given: Dockerイメージがビルド済みである
When: docker run ai-workflow-agent node --version を実行する
Then: v20.x.x が出力される

And:
When: docker run ai-workflow-agent npm --version を実行する
Then: 10.x.x が出力される
```

### AC-3: ビルドツール動作確認

```gherkin
Given: Dockerイメージがビルド済みである
When: docker run ai-workflow-agent gcc --version を実行する
Then: gccのバージョン情報が出力される

And:
When: docker run ai-workflow-agent make --version を実行する
Then: makeのバージョン情報が出力される

And:
When: docker run ai-workflow-agent sudo --version を実行する
Then: sudoのバージョン情報が出力される
```

### AC-4: 環境変数の設定確認

```gherkin
Given: Dockerイメージがビルド済みである
When: docker run ai-workflow-agent bash -c 'echo $AGENT_CAN_INSTALL_PACKAGES' を実行する
Then: "true" が出力される
```

### AC-5: Config クラスの動作確認

```gherkin
Given: config.ts に canAgentInstallPackages() メソッドが実装されている
When: AGENT_CAN_INSTALL_PACKAGES=true の環境で config.canAgentInstallPackages() を呼び出す
Then: true が返される

And:
Given: AGENT_CAN_INSTALL_PACKAGES が未設定である
When: config.canAgentInstallPackages() を呼び出す
Then: false が返される
```

### AC-6: プロンプト注入の動作確認

```gherkin
Given: AGENT_CAN_INSTALL_PACKAGES=true が設定されている
When: BasePhase.loadPrompt() を呼び出す
Then:
  - プロンプトの先頭に環境情報セクションが注入される
  - セクション内に "## 🛠️ 開発環境情報" ヘッダーが含まれる
  - Python、Go、Java、Rust、Rubyのインストールコマンドが含まれる

And:
Given: AGENT_CAN_INSTALL_PACKAGES が未設定である
When: BasePhase.loadPrompt() を呼び出す
Then: 環境情報セクションは注入されない
```

### AC-7: ユニットテストの成功

```gherkin
Given: config.test.ts に canAgentInstallPackages() のテストスイートが追加されている
When: npm test を実行する
Then:
  - 全テストケースが成功する（失敗なし）
  - カバレッジレポートで新規コードのカバレッジが80%以上である
```

### AC-8: 統合テスト（実際のワークフロー実行）

```gherkin
Given: Dockerイメージがビルド済みである
And: Pythonリポジトリの Issue が存在する
When: docker run でワークフローを実行する
Then:
  - Planning Phase（Phase 0）が成功する
  - Requirements Phase（Phase 1）が成功する
  - Implementation Phase（Phase 4）で Python がインストールされる
  - Testing Phase（Phase 6）で Pythonテストが実行される
  - エージェントログに "apt-get install -y python3" が記録される
```

---

## 7. スコープ外

以下は明確にスコープ外とします：

### 7.1 将来的な拡張候補

1. **他の言語のサポート**: PHP、Perl、Scala、Kotlin等（現時点ではPython、Go、Java、Rust、Rubyの5言語のみ）
2. **マルチステージビルドによる最適化**: Dockerイメージサイズをさらに削減（v1.1以降で検討）
3. **パッケージインストールの制限機能**: 特定のパッケージのみ許可するホワイトリスト機能（セキュリティ強化）
4. **エージェントログの監査機能強化**: 危険なコマンドの検出・警告機能

### 7.2 対象外とする事項

1. **Windows/macOS環境のサポート**: DockerはLinuxコンテナのみを対象とする
2. **他のパッケージマネージャのサポート**: yum、dnf、pacman等は対象外（apt-getのみ）
3. **ローカル開発環境でのパッケージインストール**: Docker環境のみを対象とする（AGENT_CAN_INSTALL_PACKAGES=true はDocker内部のみ）
4. **既存ワークフローの変更**: 既存のメタデータ、プロンプトテンプレート等は変更しない

---

## 8. 補足情報

### 8.1 Planning Documentとの整合性確認

本要件定義書は、Planning Documentで策定された以下の方針に従っています：

- ✅ **実装戦略（EXTEND）**: 既存ファイル（Dockerfile、config.ts、base-phase.ts）の拡張のみ
- ✅ **テスト戦略（UNIT_ONLY）**: ユニットテスト中心（config.test.ts への追加）
- ✅ **テストコード戦略（EXTEND_TEST）**: 既存テストファイルへの追加
- ✅ **リスク軽減策**: Planning Documentで特定されたリスク（イメージサイズ増加、Node.jsインストール失敗、セキュリティリスク、ビルド時間増加）に対する軽減策を非機能要件に反映

### 8.2 参考資料

- Planning Document: `.ai-workflow/issue-177/00_planning/output/planning.md`
- 既存のConfig実装: `src/core/config.ts` の `getLogNoColor()` メソッド
- 既存のBasePhase実装: `src/phases/base-phase.ts` の `loadPrompt()` メソッド
- 既存のテストパターン: `tests/unit/core/config.test.ts`

---

**作成日時**: 2025-01-31
**作成者**: AI Workflow Agent (Requirements Phase)
**Issue番号**: #177
**バージョン**: v1.0
