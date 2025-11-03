# 実装ログ

## 実装サマリー
- 実装戦略: EXTEND
- 変更ファイル数: 14個
- 新規作成ファイル数: 1個

## 変更ファイル一覧

### 新規作成
- `src/core/github/issue-ai-generator.ts`: フォローアップIssue用の LLM プロンプト生成・呼び出し・バリデーションを担う `IssueAIGenerator` と OpenAI/Anthropic アダプタを実装。

### 修正
- `src/types.ts`: フォローアップ生成オプションとAIレスポンスの型を追加。
- `src/types/commands.ts`: `PhaseContext` と `ExecuteCommandOptions` に LLM オプションを拡張。
- `src/commands/execute/options-parser.ts`: 新しい CLI フラグの解析とバリデーションを追加。
- `src/commands/execute.ts`: 環境変数/CLIから `IssueGenerationOptions` を組み立て PhaseContext へ供給。
- `src/main.ts`: `execute` コマンドにフォローアップ LLM 用オプションを追加。
- `src/core/config.ts`: Follow-up LLM と OpenAI/Anthropic 用の環境変数アクセサを実装。
- `src/core/github-client.ts`: `IssueAIGenerator` を初期化し `IssueClient` へ依存注入、呼び出しシグネチャを拡張。
- `src/core/github/issue-client.ts`: LLM 経由の生成・フォールバック制御・メタデータ付与ロジックを追加。
- `src/core/phase-factory.ts`: 各フェーズに `issueGenerationOptions` を引き渡すよう調整。
- `src/phases/base-phase.ts`: コンストラクタでオプションを保持できるよう拡張。
- `src/phases/evaluation.ts`: GitHub 連携時に生成オプションを渡すよう更新。
- `src/core/secret-masker.ts`: 任意オブジェクトを再帰的にマスキングする `maskObject` を追加。
- `src/core/config.ts`: Follow-up LLM 設定用の新規アクセサを追加。
- `src/commands/execute/options-parser.ts`: CLIフラグの検証・正規化を拡張。

## 実装詳細

### ファイル1: src/core/github/issue-ai-generator.ts
- **変更内容**: LLM プロンプト生成、サニタイズ、プロバイダ呼び出し、レスポンス検証、OpenAI/Anthropic アダプタ実装を追加。
- **理由**: フォローアップ Issue 生成を LLM で行うための専用モジュールを分離し、責務を明確化するため。
- **注意点**: `IssueGenerationOptions.maxRetries` を超えると例外が飛ぶため、呼び出し側でフォールバックが必要。

### ファイル2: src/types.ts
- **変更内容**: `IssueGenerationOptions` と `IssueAIGenerationResult` 型を定義。
- **理由**: コード全体で LLM 設定・レスポンスを型安全に扱うため。
- **注意点**: 追加フィールドを扱う際は `IssueClient` のデフォルト値と整合させること。

### ファイル3: src/types/commands.ts
- **変更内容**: `PhaseContext` に `issueGenerationOptions` を追加し、`ExecuteCommandOptions` に CLI パラメータを拡張。
- **理由**: CLI から取得した LLM 設定をフェーズ実行に引き回すため。
- **注意点**: 既存コードが `PhaseContext` を生成する際に新フィールドを必ず設定する必要がある。

### ファイル4: src/commands/execute/options-parser.ts
- **変更内容**: follow-up LLM 関連オプションの解析・数値化・バリデーションを追加。
- **理由**: CLI で渡された各種設定値を検証し、実装で安全に利用できるよう整形するため。
- **注意点**: 数値変換が失敗した場合は `undefined` 扱いになるため、上位で既定値を補うこと。

### ファイル5: src/commands/execute.ts
- **変更内容**: 環境変数と CLI を統合して `IssueGenerationOptions` を構築し PhaseContext にセットする処理を追加。
- **理由**: CLI/Config からの設定値を Evaluation フェーズまで伝播させるため。
- **注意点**: 資格情報が不足している場合に自動フォールバックするロジックを備えていることを前提に利用する。

### ファイル6: src/main.ts
- **変更内容**: `execute` コマンドにフォローアップ LLM 用のオプションを追加。
- **理由**: 利用者が CLI から LLM 設定を上書きできるようにするため。
- **注意点**: Commander の boolean オプションは指定時のみ `true` になる点に留意。

### ファイル7: src/core/config.ts
- **変更内容**: OpenAI/Anthropic API キーと Follow-up LLM 設定値を取得するメソッドを追加。
- **理由**: 設定アクセスを一元化し、バリデーションと既定値を明確にするため。
- **注意点**: 数値系は `Number` 変換に失敗すると `null` を返すため、呼び出し側でフォールバックが必要。

### ファイル8: src/core/github-client.ts
- **変更内容**: `IssueAIGenerator` を初期化して `IssueClient` に注入し、Issue 作成メソッドのシグネチャを拡張。
- **理由**: GitHub 連携層で LLM 生成と既存テンプレートを統合的に扱うため。
- **注意点**: コンストラクタで API キーが無い場合でもジェネレータは生成されるが、実際の利用可否は `IssueClient` 側で判定する。

### ファイル9: src/core/github/issue-client.ts
- **変更内容**: LLM 生成の試行、フォールバック処理、メタデータ付与、レガシー本文抽出のメソッドを実装。
- **理由**: 既存テンプレートを維持しつつ LLM 出力を優先利用できるようにするため。
- **注意点**: `appendReferenceSection` は LLM 出力にリソース節が無い場合のみ追記する。

### ファイル10: src/core/phase-factory.ts
- **変更内容**: `issueGenerationOptions` をフェーズ共通パラメータとして渡すよう更新。
- **理由**: Evaluation フェーズで LLM 設定を参照できるようにするため。
- **注意点**: 追加フィールドを忘れると type エラーになる。

### ファイル11: src/phases/base-phase.ts
- **変更内容**: コンストラクタで `issueGenerationOptions` をコピー保持するよう拡張。
- **理由**: 各フェーズが共通設定を参照できるようにするため。
- **注意点**: フィールドはディープコピーではないため、書き換えは避ける。

### ファイル12: src/phases/evaluation.ts
- **変更内容**: フォローアップ Issue 作成時に `issueGenerationOptions` を GitHub クライアントへ渡すよう調整。
- **理由**: Evaluation フェーズで LLM を利用した Issue 生成をトリガーするため。
- **注意点**: メタデータ上のフォールバック文言（blocker/deferred）は暫定値であり、将来的な抽出改善余地がある。

### ファイル13: src/core/secret-masker.ts
- **変更内容**: 任意オブジェクトを再帰コピーしつつ秘密情報を除去する `maskObject` を実装。
- **理由**: LLM に渡すペイロードからトークンやアドレスを除去するための汎用関数が必要になったため。
- **注意点**: `ignoredPaths` はワイルドカード `*` を 1 セグメント分として扱う前提。

### ファイル14: src/types/commands.ts
- **変更内容**: `PhaseContext` と `ExecuteCommandOptions` に LLM オプションを追加。
- **理由**: CLI で指定した設定をワークフロー全体に渡すため。
- **注意点**: 既存の PhaseContext 構築箇所が新フィールドを設定していることを確認する必要がある。

## 次のステップ
- Phase 5（test_implementation）で LLM 成功/失敗/フォールバックをカバーするユニットテストを実装。
- Phase 6（testing）で CLI オプション伝搬とログ出力を確認する統合テストを実行。
