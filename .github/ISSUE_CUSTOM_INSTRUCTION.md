## 概要

`auto-issue` コマンドに `--custom-instruction` オプションを追加し、ユーザーがバグ検出・リファクタリング検出時に追加指示を与えられるようにする。同時に、破壊的操作を含む危険な指示をブロックする安全性検証機能を実装する。

> **✅ 実装完了（Issue #655）**: InstructionValidator をエージェント優先（Codex → Claude → OpenAI → パターン）のフォールバックチェーンに統一し、OpenAI キーなしでも検証できるようにした。CLI コマンド誤検出を抑制する SAFE_PATTERNS と、信頼度 low 時に警告のみで続行する挙動を追加。

## 背景

現在、`auto-issue` コマンドは以下の3つのカテゴリをサポートしています：
- `bug`: バグ検出
- `refactor`: リファクタリング機会検出
- `enhancement`: 機能拡張提案

これらのカテゴリは事前定義されたプロンプトテンプレートを使用していますが、ユーザーが特定の観点（例: 重複関数、パフォーマンスボトルネック、セキュリティ脆弱性など）を重点的に調査したい場合、柔軟性が不足しています。

## 目標

1. **カスタム指示オプション**: ユーザーが自由に追加指示を与えられる
2. **安全性検証**: 破壊的操作やセキュリティリスクのある指示を自動的にブロック
3. **既存機能との統合**: 既存のカテゴリ（bug/refactor/enhancement）と組み合わせて使用可能

## ユースケース

### ✅ 許可される指示の例

```bash
# 重複コードに焦点を当てる
node dist/index.js auto-issue --category refactor \
  --custom-instruction "重複関数や類似ロジックを重点的に検出してください"

# パフォーマンス問題に焦点を当てる
node dist/index.js auto-issue --category bug \
  --custom-instruction "N+1クエリやメモリリークなどのパフォーマンス問題を優先的に検出してください"

# 特定のファイルパターンに焦点を当てる
node dist/index.js auto-issue --category bug \
  --custom-instruction "src/core/ 配下のファイルを重点的に調査してください"

# セキュリティ観点を追加
node dist/index.js auto-issue --category bug \
  --custom-instruction "SQLインジェクションやXSS脆弱性を重点的に検出してください"
```

### ❌ ブロックされるべき危険な指示の例

```bash
# ファイル削除
--custom-instruction "古いファイルを削除してください"

# コード変更
--custom-instruction "バグを見つけたら自動的に修正してください"

# Git操作
--custom-instruction "不要なブランチを削除してください"

# システムコマンド実行
--custom-instruction "npm install を実行してください"

# 環境変更
--custom-instruction "設定ファイルを更新してください"
```

## 実装詳細

### 1. CLI オプションの追加

#### `src/commands/auto-issue.ts`

```typescript
export interface AutoIssueCommandOptions {
  category: 'bug' | 'refactor' | 'enhancement' | 'all';
  limit?: number;
  dryRun?: boolean;
  similarityThreshold?: number;
  agent?: 'auto' | 'codex' | 'claude';
  creativeMode?: boolean;
  // 新規追加
  customInstruction?: string;
}
```

#### `src/main.ts`

```typescript
program
  .command('auto-issue')
  .option('--custom-instruction <text>', 'Custom instruction for analysis (max 500 chars)')
  // ... 既存オプション
```

### 2. 安全性検証モジュール

#### `src/core/instruction-validator.ts`（Issue #655でリファクタリング）

- **エージェント優先のフォールバック**: `codex-agent (mini) → claude-agent (haiku) → openai gpt-4o-mini → pattern` の順に検証し、`validationMethod` に実際の経路（`'codex-agent' | 'claude-agent' | 'llm' | 'pattern'`）を記録。
- **応答パース強化**: `parseAgentResponse()` でコードブロック内JSON、複数メッセージ、ネストしたオブジェクトを抽出して正規化。
- **パターンマッチング改善**: `SAFE_PATTERNS` で `execute --phase` や `npm/yarn/pnpm run` といったCLI操作を安全扱いし、Issue #654 の誤検出を低減。`DANGEROUS_PATTERNS` は従来の削除/Git/システムコマンド/設定変更/DB/自動修正を継続。`confidence='low'` は警告ログを出しつつ処理続行。
- **キャッシュとリトライ**: TTL 1時間・最大1000件のLRUキャッシュを維持。LLM 呼び出しは指数バックオフ付きで最大3回リトライ。
- **CLI側ガード**: `auto-issue.ts` のオプションパーサで500文字上限と明示的な削除指示を事前に拒否してから、インスタンス化した `InstructionValidator` で検証する。

### 3. プロンプトへの統合

カスタム指示をプロンプトの「重要な注意事項」セクションの前に注入：

```markdown
# カスタム指示

以下のユーザー指示を考慮して分析を行ってください：

> {custom_instruction}

この指示は分析の重点を示すものであり、基本的な検出ルールは維持してください。
```

### 4. 検証フロー

1. ユーザーがカスタム指示を入力（500文字超や明示的削除指示は CLI パーサで即時エラー）
2. `new InstructionValidator(repoPath).validate()` で検証（codex-agent → claude-agent → OpenAI → pattern）
3. 危険パターンはエラー／`confidence='low'` は警告のみで続行し、`validationMethod` をログ出力
4. 安全と判定された指示をプロンプトへ注入
5. エージェント実行

## 実装手順

### Step 1: 安全性検証モジュールの作成
- [x] `src/core/instruction-validator.ts` を実装（LLMベース検証、フォールバック、キャッシュ）
- [x] `src/prompts/validation/validate-instruction.txt` を作成
- [x] ユニットテストを作成（`tests/unit/core/instruction-validator.test.ts`）

### Step 2: CLI オプションの追加
- [x] `src/types/auto-issue.ts` に型定義を追加（`ValidationResult`, `LLMValidationResponse` 等）
- [x] `src/main.ts` にオプションを追加（`--custom-instruction`）
- [x] `src/commands/auto-issue.ts` を更新（InstructionValidator呼び出し追加）

### Step 3: auto-issue コマンドへの統合
- [x] カスタム指示パラメータを追加
- [x] 検証ロジックを統合（検証失敗時はエラー、confidence: low時は警告）

### Step 4: テスト
- [x] ユニットテスト実装（21ケース）
- [x] 統合テスト実装（8ケース）
- [x] 全テストPASS（29件成功）

## セキュリティ考慮事項

### 多層防御アプローチ

1. **クライアント側検証**: `InstructionValidator` による事前チェック
2. **プロンプトサンドボックス**: エージェントは読み取り専用で実行
3. **ファイル出力制限**: JSON 出力ファイルのみ書き込み許可
4. **Git 操作不可**: auto-issue は Git 操作を一切行わない

### 想定される攻撃ベクトルと対策

| 攻撃ベクトル | 対策 |
|------------|------|
| プロンプトインジェクション | 危険キーワードパターンマッチング |
| コマンドインジェクション | シェルコマンド実行を含む指示をブロック |
| ファイルシステム操作 | 読み取り専用モードで実行 |
| Git 履歴改ざん | Git 操作を含む指示をブロック |

## 期待される動作

### 正常ケース

```bash
$ node dist/index.js auto-issue --category refactor \
    --custom-instruction "重複関数を重点的に検出してください"

[INFO] Using custom instruction: 重複関数を重点的に検出してください
[INFO] Analyzing repository for refactoring opportunities...
[INFO] Found 5 refactoring candidates (filtered by custom instruction)
```

### エラーケース

```bash
$ node dist/index.js auto-issue --category bug \
    --custom-instruction "古いファイルを削除してください"

[ERROR] Invalid custom instruction: Dangerous operation detected: "削除".
        Custom instructions must be limited to analysis guidance only.
```

## 後方互換性

- `--custom-instruction` はオプショナルパラメータ
- 指定しない場合は従来通りの動作
- 既存のカテゴリ（bug/refactor/enhancement）との併用可能

## 関連Issue

- Issue #126: バグ検出機能の実装
- Issue #127: リファクタリング検出機能の実装
- Issue #128: 機能拡張提案機能の実装
