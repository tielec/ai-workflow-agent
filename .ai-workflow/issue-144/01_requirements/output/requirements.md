# 要件定義書

**Issue**: #144 - auto-issue: 言語サポートの汎用化（TypeScript/Python制限の撤廃）
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 0. Planning Documentの確認

Planning Phase (Phase 0) で策定された開発計画を確認しました：

### 開発計画の全体像
- **実装戦略**: EXTEND（既存コードの拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト＋インテグレーションテスト）
- **テストコード戦略**: EXTEND_TEST（既存テストの拡張）
- **複雑度**: 中程度
- **見積もり工数**: 6〜8時間（1日程度）
- **リスク評価**: 中（プロンプト変更によるバグ検出精度低下、既存機能の回帰リスク）

### 実装対象ファイル
1. `src/core/repository-analyzer.ts` (約280行)
   - `validateBugCandidate()` メソッドの言語制限削除（lines 223-235）
   - 除外パターン追加（新規）
2. `src/prompts/auto-issue/detect-bugs.txt` (約92行)
   - 検出対象パターンセクション（lines 3-35）の汎用化
   - 注意事項セクション（lines 78-91）の更新

### タスク分割（8フェーズ）
1. Phase 1: 要件定義（1h）
2. Phase 2: 設計（1h）
3. Phase 3: テストシナリオ（1h）
4. Phase 4: 実装（2〜3h）
5. Phase 5: テストコード実装（1〜2h）
6. Phase 6: テスト実行（0.5h）
7. Phase 7: ドキュメント（0.5h）
8. Phase 8: レポート（0.5h）

**本要件定義書は、上記の開発計画を踏まえて作成します。**

---

## 1. 概要

### 1.1 背景

Issue #126 で実装された `auto-issue` 機能は、AIエージェントを活用してリポジトリのコードベースを自動分析し、潜在的なバグを検出してGitHub Issueを自動生成する革新的な機能です。しかし、現在の実装（Phase 1 MVP）では、検出対象がTypeScript（`.ts`, `.tsx`）とPython（`.py`）のみに制限されており、多言語リポジトリでの利用が困難です。

この制限により、以下の問題が発生しています：

1. **Go、Java、Ruby、Groovy等の主要言語がサポート対象外**
   - マイクロサービス環境で複数言語が混在する場合、TypeScript/Python以外のコードが検出対象から漏れる
   - CI/CD設定ファイル（Jenkinsfile、Dockerfile等）のバグが検出できない

2. **プロンプトの言語固有性**
   - TypeScript/Python固有の例（「`any` の過度な使用」、「型ヒント欠如」）が多数含まれる
   - 他言語での検出精度が低下する可能性

3. **除外パターンの未定義**
   - バイナリファイル、生成ファイル、node_modules等の除外ロジックが不明確
   - 不要なファイルがバグ候補として検出される可能性

### 1.2 目的

本Issueの目的は、`auto-issue` 機能の言語サポートを汎用化し、**あらゆるプログラミング言語のリポジトリで使用可能にする**ことです。具体的には以下を実現します：

1. **言語制限の完全撤廃**
   - `validateBugCandidate()` のファイル拡張子チェック（lines 223-235）を削除
   - 代わりに除外パターン（バイナリ、生成ファイル等）のみでフィルタリング

2. **プロンプトの言語非依存化**
   - TypeScript/Python固有の記述を削除
   - 言語共通のバグパターン（エラーハンドリング、リソースリーク、セキュリティ問題等）を中心に再構成

3. **サポート対象言語の明確化**
   - スクリプト言語、コンパイル言語、IaC、CI/CD設定ファイル等を明示的にサポート
   - ドキュメント（CLAUDE.md）に対象言語リストを記載

### 1.3 ビジネス価値

- **開発効率の向上**: 多言語リポジトリ全体を自動分析し、手動レビューの負荷を削減
- **品質向上**: 複数言語のバグを一括検出し、潜在的な問題を早期発見
- **運用負荷の削減**: CI/CD設定ファイルのバグも検出し、本番環境での障害を防止

### 1.4 技術的価値

- **汎用性**: あらゆるプログラミング言語のリポジトリで使用可能
- **拡張性**: 新規言語追加時も設定変更不要（除外パターンのみで制御）
- **保守性**: 言語非依存のプロンプト設計により、AIモデル更新時の影響を最小化

---

## 2. 機能要件

### FR-1: ファイル拡張子制限の撤廃（高優先度）

**要件ID**: FR-1
**優先度**: 高
**概要**: `validateBugCandidate()` メソッドから言語固有のファイル拡張子チェックを削除する。

**詳細**:
- **削除対象**: `src/core/repository-analyzer.ts` の lines 223-235
  ```typescript
  // 削除するコード
  const isTypeScript = candidate.file.endsWith('.ts') || candidate.file.endsWith('.tsx');
  const isPython = candidate.file.endsWith('.py');
  if (!isTypeScript && !isPython) {
    logger.debug(
      `Invalid candidate: file "${candidate.file}" is not TypeScript or Python (Phase 1 limitation)`,
    );
    return false;
  }
  ```
- **削除後の動作**: ファイルパスが存在し、除外パターンに該当しない場合は検証を通過
- **検証条件**: 必須フィールド（title、file、line、severity、description、suggestedFix、category）の存在とフォーマットのみチェック

**検証可能な指標**:
- Go（`.go`）、Java（`.java`）、Ruby（`.rb`）、Groovy（`.groovy`）等のファイルが `validateBugCandidate()` を通過すること
- Jenkinsfile、Dockerfile等の拡張子なしファイルも検証を通過すること

---

### FR-2: 除外パターンの実装（高優先度）

**要件ID**: FR-2
**優先度**: 高
**概要**: バイナリファイル、生成ファイル、依存関係ディレクトリを除外するロジックを追加する。

**詳細**:
- **除外対象ディレクトリ**:
  - `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `out/`, `target/`, `__pycache__/`, `.venv/`, `venv/`
- **除外対象ファイルパターン**:
  - 生成ファイル: `*.min.js`, `*.bundle.js`, `*.generated.*`, `*.g.go`, `*.pb.go`
  - バイナリファイル: `.exe`, `.dll`, `.so`, `.dylib`, `.png`, `.jpg`, `.gif`, `.ico`, `.pdf`, `.zip`, `.tar`, `.gz`
  - ロックファイル: `package-lock.json`, `yarn.lock`, `Gemfile.lock`, `poetry.lock`, `Pipfile.lock`, `go.sum`
- **実装方法**: `validateBugCandidate()` 内に除外パターンチェックロジックを追加、またはヘルパー関数（`isExcludedFile()`, `isExcludedDirectory()`）を新規作成

**検証可能な指標**:
- `node_modules/lodash/index.js` 等の依存関係ファイルがバリデーションで除外されること
- `dist/bundle.min.js` 等の生成ファイルが除外されること
- `.exe`, `.png` 等のバイナリファイルが除外されること

---

### FR-3: プロンプトの言語非依存化（高優先度）

**要件ID**: FR-3
**優先度**: 高
**概要**: `src/prompts/auto-issue/detect-bugs.txt` を言語非依存のバグパターンに再構成する。

**詳細**:
- **削除する言語固有記述**:
  - 「`any` の過度な使用（TypeScript）」（line 14）
  - 「動的型付け言語での型ヒント欠如（Python等）」（line 16）
  - 「対象ディレクトリ: src/, lib/, app/ 等のソースコードディレクトリ」（line 90）

- **追加する言語共通パターン**:
  1. **エラーハンドリングの欠如**（既存を拡張）
     - エラー返り値の無視（Go、C等）
     - Panicの未処理（Go、Rust等）
     - Exception未キャッチ（Java、C#等）
  2. **リソースリークの拡張**
     - defer/finally の欠如（Go、Java等）
     - RAII違反（C++）
     - コンテキストキャンセルの未処理（Go）
  3. **並行処理の問題**（新規追加）
     - レースコンディション（goroutine、スレッド等）
     - デッドロック（Mutex、Channel等）
     - 未同期のグローバル変数アクセス
  4. **Null/Nil参照の可能性**（新規追加）
     - Null/Nilポインタデリファレンス（Go、Java、C#等）
     - Optional未チェック（Swift、Rust等）
  5. **セキュリティ問題の拡張**
     - コマンドインジェクション（Shell、Groovy等）
     - パストラバーサル（ファイル操作全般）

- **除外パターンの明記**（新規セクション）:
  ```markdown
  # 除外対象

  以下のパターンは検出対象から除外してください：
  - 依存関係ディレクトリ: node_modules/, vendor/, .git/, dist/, build/, out/, target/
  - 生成ファイル: *.min.js, *.bundle.js, *.generated.*, *.g.go, *.pb.go
  - バイナリファイル: .exe, .dll, .so, .dylib, 画像ファイル, アーカイブファイル
  - ロックファイル: package-lock.json, yarn.lock, Gemfile.lock, poetry.lock, go.sum
  ```

**検証可能な指標**:
- プロンプト内に「TypeScript」「Python」の単語が言語固有の文脈で使用されていないこと
- 5つの言語共通パターンがすべて記載されていること
- 除外パターンセクションが追加されていること

---

### FR-4: サポート対象言語の明示（中優先度）

**要件ID**: FR-4
**優先度**: 中
**概要**: CLAUDE.mdのドキュメントにサポート対象言語リストを記載する。

**詳細**:
- **対象ドキュメント**: `CLAUDE.md` の「### 自動バグ検出＆Issue生成（v0.5.0、Issue #126で追加）」セクション（lines 163-205）
- **追加内容**:
  - 「**Phase 1 MVP の制限事項**」セクション（lines 201-204）を更新
  - 「対象ファイル: TypeScript (`.ts`) と Python (`.py`) のみ」を削除
  - 「サポート対象言語」セクションを新規追加

**サポート対象言語リスト**:
| カテゴリ | 言語/ファイル |
|---------|--------------|
| **スクリプト言語** | JavaScript (.js, .jsx, .mjs), TypeScript (.ts, .tsx), Python (.py), Ruby (.rb), PHP (.php), Perl (.pl), Shell (.sh, .bash) |
| **コンパイル言語** | Go (.go), Java (.java), Kotlin (.kt), Rust (.rs), C (.c, .h), C++ (.cpp, .hpp), C# (.cs), Swift (.swift) |
| **JVM言語** | Groovy (.groovy), Scala (.scala) |
| **CI/CD設定** | Jenkinsfile, Dockerfile, Makefile |
| **設定/データ** | YAML (.yml, .yaml), JSON (.json), TOML (.toml), XML (.xml) |
| **IaC** | Terraform (.tf), CloudFormation (.template) |

**検証可能な指標**:
- CLAUDE.mdに上記の言語リストが記載されていること
- 「TypeScript/Python のみ」の記述が削除されていること

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

**要件ID**: NFR-1
**指標**: 既存の実装（TypeScript/Python限定）と同等のパフォーマンスを維持する。

**詳細**:
- **バリデーション処理時間**: 1000件のバグ候補を処理する場合、3秒以内に完了
- **除外パターンマッチング**: 正規表現またはパス比較によるO(n)の処理で実装
- **影響**: 除外パターン追加により、既存の言語制限チェックが除外パターンチェックに置き換わるため、パフォーマンス劣化は最小限

**検証方法**:
- ユニットテストでバリデーション処理時間を計測
- 1000件の候補を3秒以内に処理できることを確認

---

### NFR-2: セキュリティ要件

**要件ID**: NFR-2
**指標**: 除外パターンのバイパス攻撃を防止する。

**詳細**:
- **パストラバーサル攻撃**: `../../node_modules/` 等の相対パスでの除外パターンバイパスを防止
  - 対策: ファイルパスを正規化してから除外パターンチェックを実施
- **シンボリックリンク攻撃**: シンボリックリンクを介した除外パターンバイパスを防止
  - 対策: ファイルパス検証時にシンボリックリンクをチェック（既存の `src/phases/cleanup/artifact-cleaner.ts` の `isSymbolicLink()` ロジックを参考）

**検証方法**:
- ユニットテストで `../../node_modules/lodash/index.js` が除外されることを確認
- セキュリティレビューで脆弱性が指摘されないこと

---

### NFR-3: 保守性・拡張性要件

**要件ID**: NFR-3
**指標**: 新規言語追加時に設定変更が不要であること。

**詳細**:
- **拡張ポイント**: 除外パターンのみで制御し、言語固有の拡張子チェックは行わない
- **将来的な拡張**: 言語固有のバグパターン（例: Go特有のgoroutineリーク）を検出する場合も、プロンプト拡張のみで対応可能

**検証方法**:
- 新規言語（例: Zig `.zig`）のファイルが追加された場合、コード変更なしで検出対象になることを確認

---

### NFR-4: 互換性要件

**要件ID**: NFR-4
**指標**: 既存のTypeScript/Pythonリポジトリでの動作を100%維持する。

**詳細**:
- **回帰防止**: 既存の `tests/unit/commands/auto-issue.test.ts` のテストケースがすべてパスすること
- **検出精度**: TypeScript/Pythonファイルのバグ検出数が従来と同等以上であること

**検証方法**:
- Phase 6（Testing）で既存のユニットテスト・インテグレーションテストを実行
- テストカバレッジが90%以上を維持していること

---

## 4. 制約事項

### 4.1 技術的制約

1. **既存インターフェースの保持**
   - `BugCandidate` 型の変更不可（`src/types/auto-issue.ts`）
   - `RepositoryAnalyzer.analyze()` メソッドのシグネチャ変更不可

2. **AIエージェントの制約**
   - エージェント（Codex/Claude）がプロンプトを正しく解釈しない場合、検出精度が低下する可能性
   - 緩和策: プロンプト設計時に明確な指示と例示を追加

3. **既存コードとの整合性**
   - `src/core/config.ts` の環境変数アクセス規約に従う（Issue #51）
   - `src/utils/logger.ts` の統一loggerモジュールを使用（Issue #61）
   - `src/utils/error-utils.ts` のエラーハンドリングユーティリティを使用（Issue #48）

### 4.2 リソース制約

1. **時間制約**: 見積もり工数6〜8時間（1日程度）を厳守
2. **スコープ制約**: 新規ファイル追加なし、既存ファイル2つのみ修正
3. **テストコード制約**: 既存テストの拡張のみ、新規テストファイル作成不可

### 4.3 ポリシー制約

1. **コーディング規約**:
   - `process.env` への直接アクセス禁止（Config クラス使用）
   - `console.log` 禁止（統一loggerモジュール使用）
   - `as Error` 型アサーション禁止（error-utilsモジュール使用）

2. **セキュリティポリシー**:
   - ReDoS攻撃の防止（Issue #140）: 正規表現動的生成時は `replaceAll()` を使用
   - Personal Access Token の除去（Issue #54）

---

## 5. 前提条件

### 5.1 システム環境

- Node.js 20以上
- TypeScript 5.x
- Jest（テストフレームワーク）
- fs-extra（ファイル操作）

### 5.2 依存コンポーネント

- `src/core/codex-agent-client.ts` - Codexエージェント
- `src/core/claude-agent-client.ts` - Claudeエージェント
- `src/types/auto-issue.ts` - BugCandidate型定義
- `src/utils/logger.ts` - 統一loggerモジュール
- `src/utils/error-utils.ts` - エラーハンドリングユーティリティ

### 5.3 外部システム連携

- **GitHub API**: Issue作成時に使用（`src/core/github-client.ts` 経由）
- **AIエージェント**: Codex（`gpt-5-codex`）またはClaude（`claude-3-sonnet-20240229`）

---

## 6. 受け入れ基準

### AC-1: 多言語ファイルの検出
**Given**: リポジトリに TypeScript, Python, Go, Java, Ruby, Groovy, Jenkinsfile が存在する
**When**: `auto-issue` コマンドを実行する
**Then**: すべての言語のファイルがバグ検出対象になり、バリデーションを通過する

### AC-2: 除外パターンの動作
**Given**: リポジトリに `node_modules/lodash/index.js`, `dist/bundle.min.js`, `test.png` が存在する
**When**: `auto-issue` コマンドを実行する
**Then**: これらのファイルは除外され、バグ候補として検出されない

### AC-3: 既存機能の保持
**Given**: TypeScript/Pythonのみのリポジトリ
**When**: `auto-issue` コマンドを実行する
**Then**: 従来と同じバグ候補が検出され、検出精度が低下していない

### AC-4: プロンプトの言語非依存性
**Given**: 新しいプロンプト（`detect-bugs.txt`）が適用される
**When**: プロンプト内容を確認する
**Then**: TypeScript/Python固有の記述が削除され、言語共通のバグパターンのみが記載されている

### AC-5: ドキュメント更新
**Given**: CLAUDE.mdが更新される
**When**: CLAUDE.mdを確認する
**Then**: サポート対象言語リストが記載され、「TypeScript/Python のみ」の記述が削除されている

### AC-6: テスト完全性
**Given**: 新規テストケースが追加される
**When**: `npm run test:unit` および `npm run test:integration` を実行する
**Then**: すべてのテストがパスし、カバレッジが90%以上である

---

## 7. スコープ外

以下の機能は本Issueのスコープ外とし、将来的な拡張として別Issueで対応します：

### 7.1 言語固有の最適化
- Go特有のgoroutineリーク検出
- Java特有のメモリリーク検出（Garbage Collection関連）
- Rust特有の所有権違反検出

**理由**: 本Issueは「言語制限の撤廃」のみをスコープとし、言語固有の最適化は別Issue（Phase 2以降）で対応する。

### 7.2 除外パターンのカスタマイズ
- ユーザー定義の除外パターン追加機能
- `.autoissue-ignore` ファイル等の設定ファイルサポート

**理由**: Phase 1 MVPでは除外パターンをハードコードし、カスタマイズ機能は将来的な拡張とする。

### 7.3 リファクタリング・エンハンスメントのサポート
- `--category refactor` オプションのサポート
- `--category enhancement` オプションのサポート

**理由**: Phase 1 MVPでは `bug` カテゴリのみをサポートし、他カテゴリは別Issueで対応する。

---

## 8. リスクと緩和策

### リスク1: プロンプト変更によるバグ検出精度の低下

**影響度**: 高
**確率**: 中

**緩和策**:
- Phase 3でフェーズ固有キーワード検証を実施し、プロンプト品質を担保
- Phase 5で多言語リポジトリテストを実施し、検出精度を検証
- 既存のTypeScript/Pythonリポジトリでの回帰テストを必須化

**検証方法**:
- 多言語リポジトリ（TypeScript, Python, Go, Java, Ruby）でエンドツーエンドテストを実行
- 検出されたバグ候補の精度（適合率・再現率）を測定

---

### リスク2: 除外パターンの誤設定による検出漏れ

**影響度**: 中
**確率**: 低

**緩和策**:
- Phase 1（要件定義）で除外パターンリストを徹底的に整理
- Phase 5で `node_modules/`, `dist/`, `build/` 等の除外テストを実装
- ログ出力で「除外されたファイル数」を明示し、オペレーターが確認可能に

**検証方法**:
- ユニットテストで除外パターンのエッジケース（`../../node_modules/` 等）をカバー
- インテグレーションテストで実際のリポジトリ構造での動作を確認

---

### リスク3: 既存機能の回帰（TypeScript/Python検出が動作しなくなる）

**影響度**: 高
**確率**: 低

**緩和策**:
- Phase 5で既存テストケース（`tests/unit/commands/auto-issue.test.ts`）を必ず実行
- Phase 6で既存リポジトリでの動作確認を実施
- バリデーションロジック変更時は慎重にテスト

**検証方法**:
- 既存のユニットテスト・インテグレーションテストがすべてパスすること
- テストカバレッジが90%以上を維持していること

---

### リスク4: スコープクリープ（追加言語固有の最適化要求）

**影響度**: 低
**確率**: 中

**緩和策**:
- Issue #144のスコープは「言語制限の撤廃」のみと明確化
- 言語固有の最適化は別Issueとして切り出す（例: Issue #XXX: Go特有のgoroutineリーク検出）
- Phase 2でプロンプト設計時にスコープを再確認

**検証方法**:
- Phase 0（Planning）で策定したスコープからの逸脱がないことを確認
- Phase 8（Report）でスコープ遵守を最終確認

---

## 9. 補足情報

### 9.1 関連Issue

- **親Issue**: #121 - AIエージェントによる自動Issue作成機能の実装
- **前提Issue**: #126 - auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装
- **関連Issue**:
  - #51 - 環境変数アクセス管理（Config クラス）
  - #61 - 統一loggerモジュール
  - #48 - エラーハンドリングユーティリティ
  - #140 - ReDoS攻撃の防止

### 9.2 参考ドキュメント

- `CLAUDE.md` - auto-issueコマンドの仕様（lines 163-211）
- `ARCHITECTURE.md` - RepositoryAnalyzerのアーキテクチャ
- Planning Document - `.ai-workflow/issue-144/00_planning/output/planning.md`

### 9.3 用語集

| 用語 | 定義 |
|------|------|
| **バグ候補（BugCandidate）** | AIエージェントが検出した潜在的なバグ情報（ファイルパス、行番号、説明、修正案を含む） |
| **除外パターン** | バグ検出対象から除外するファイル・ディレクトリのパターン（正規表現またはパス比較） |
| **言語非依存** | 特定のプログラミング言語に依存せず、あらゆる言語で適用可能な設計 |
| **Phase 1 MVP** | auto-issue機能の最小実行可能プロダクト（TypeScript/Python限定、bugカテゴリのみ） |

---

## 10. 承認

本要件定義書は、以下の品質ゲートを満たしていることを確認しました：

- [x] **機能要件が明確に記載されている**: FR-1〜FR-4で4つの機能要件を定義
- [x] **受け入れ基準が定義されている**: AC-1〜AC-6で6つの受け入れ基準を定義（Given-When-Then形式）
- [x] **スコープが明確である**: 第7章「スコープ外」で明確に定義
- [x] **論理的な矛盾がない**: 各セクション間で矛盾がないことを確認

**次フェーズ（Phase 2: Design）に進む準備が整っています。**

---

**作成者**: AI Workflow Agent
**レビュー状態**: Pending Review
**最終更新日**: 2025-01-30
