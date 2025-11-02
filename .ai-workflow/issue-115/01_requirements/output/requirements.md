# 要件定義書 - Issue #115

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Phase（Phase 0）で策定された開発計画を確認しました：

- **実装戦略**: EXTEND（既存テストファイルの修正）
- **テスト戦略**: UNIT_ONLY（修正後の動作確認のみ）
- **テストコード戦略**: EXTEND_TEST（既存テストの修正）
- **見積もり工数**: 4~6時間
- **複雑度**: 簡単
- **リスク評価**: 低

### スコープ・技術選定・リスク・スケジュール

**スコープ**:
- 対象範囲: 2つのテストファイルのみ
  - `tests/integration/phases/fallback-mechanism.test.ts`（統合テスト15個）
  - `tests/unit/phases/base-phase-fallback.test.ts`（ユニットテスト4個 + 1個のテストデータ修正）
- 変更内容: テストコードの修正のみ（プロダクションコードは変更不要）

**技術選定**:
- Jest + TypeScript 5.x + ESM
- 既存のテストフレームワーク設定を継承
- Issue #102, #105で解決済みの知見を活用

**リスク**:
- 技術的リスク: 低（既知の問題で前例あり）
- スコープリスク: 低（明確な3タスク、具体的な修正箇所が特定済み）
- 依存リスク: 低（外部システム依存なし）

**スケジュール**:
- Phase 1（要件定義）: 0.5h
- Phase 2（設計）: 1h
- Phase 3（テストシナリオ）: 0.5h
- Phase 4（実装）: 3~4h
- Phase 5（テストコード実装）: 0h（スキップ）
- Phase 6（テスト実行）: 1h
- Phase 7（ドキュメント）: 0.5h
- Phase 8（レポート）: 0.5h

### Planning Documentで策定された戦略

この要件定義では、Planning Documentで策定された以下の戦略を踏まえます：

1. **EXTEND戦略**: 既存のテストファイルを修正し、テスト仕様自体は変更しない
2. **UNIT_ONLY戦略**: 修正後、`npm test` で全テストが通過することを確認する（メタテスト不要）
3. **EXTEND_TEST戦略**: 新規テストケースは追加せず、実装の問題（型エラー、モック設定）のみを修正

---

## 1. 概要

### 背景

本Issueは、Issue #113「フォールバック機構の導入」のEvaluation Phase（Phase 9）で特定された残タスクをまとめたものです。Issue #113は、Planning、Requirements、Design、TestScenario、Implementation、Reportの6フェーズでフォールバック機構を実装し、ワークフローの堅牢性を向上させました。実装完了後のEvaluationで、**コア機能は完全に動作している**ことが確認されましたが、以下の3つのテストコード品質問題が残されました：

1. **統合テストのTypeScriptコンパイルエラー**（15個のテストケース未実行）
2. **ユニットテストのモック設定問題**（4個のexecutePhaseTemplateテスト失敗）
3. **isValidOutputContentテストのテストデータ不足**（1個のテスト失敗）

これらは**プロダクションコードのバグではなく、テストコード自体の技術的問題**であることが、Evaluation Reportで明確に分析されています（evaluation_report.md lines 205-222）。

### 目的

本Issueの目的は、Issue #113で実装されたフォールバック機構のテストカバレッジを完全に機能させることです。具体的には：

- TypeScript 5.xとJestの型定義互換性問題を解決し、統合テスト15個を実行可能にする
- モック設定の範囲を適切に限定し、ユニットテスト4個を成功させる
- テストデータにPlanning Phaseのキーワードを追加し、1個のテストを成功させる
- 全テストスイート（57ファイル）が引き続き成功することを確認する（回帰なし）

### ビジネス価値

- **フォールバック機構の本番投入準備完了**: 統合テストが成功することで、6つのフェーズでフォールバック機構を有効化する準備が整う
- **CI/CD安定性向上**: Jenkins等のCI環境で統合テストが正しく実行され、自動テストの信頼性が向上
- **Issue #113の完全完了**: 評価フェーズで `PASS_WITH_ISSUES` となっていたものが `PASS` に昇格

### 技術的価値

- **テストコード品質向上**: Issue #113で実装されたフォールバック機構のテストカバレッジが完全に（48/48 = 100%）機能する
- **型安全性向上**: TypeScript 5.x型定義との完全な互換性により、将来の型エラーを予防
- **テクニカルデットの解消**: Issue #113で積み残されていたテストコード品質の問題が解決

---

## 2. 機能要件

本Issueは**テストコード修正**のため、通常の機能要件（FR-1, FR-2...）ではなく、**テスト要件（TR-1, TR-2...）**として定義します。

### TR-1: 統合テストのTypeScriptコンパイルエラー解消

**優先度**: 高

**説明**:
`tests/integration/phases/fallback-mechanism.test.ts` の15個の統合テストが、TypeScript 5.xとJestのモック型定義の不一致によりコンパイルエラーで実行できない問題を解決する。

**具体的な要件**:
- TypeScript 5.xの型チェックに適合するJestモック型アノテーションを追加する
- `jest.fn().mockResolvedValue()` の型推論エラーを解消する
- 15個の統合テストケース全体で型エラーを解消する
- `tsc --noEmit` でTypeScriptコンパイルが成功することを確認する

**対象ファイル**:
- `tests/integration/phases/fallback-mechanism.test.ts`（約520行）

**参考情報**:
- Evaluation Report lines 153-158: 根本原因は「Jest mock type definitions incompatible with TypeScript 5.x strict type checking」
- Evaluation Report lines 219: 「Fix is straightforward (mock type definitions)」
- Issue #102, #105: 類似のTypeScript/Jest型問題の解決例

### TR-2: ユニットテストのモック設定の修正

**優先度**: 高

**説明**:
`tests/unit/phases/base-phase-fallback.test.ts` のexecutePhaseTemplateテスト4個が、`fs.readFileSync` モックが過度に広範囲に影響し、`loadPrompt()` メソッドにも影響を与えることで失敗している問題を解決する。

**具体的な要件**:
- `fs.readFileSync` モックが `loadPrompt()` に影響しないよう、モック範囲を限定する
- 特定ファイルパスのみをモックするか、`loadPrompt()` を別途モックする方法を採用する
- 4個のexecutePhaseTemplateテストケースが全て成功することを確認する
- 他のテストケース（23個のコア機能テスト）に影響を与えないことを確認する

**対象ファイル**:
- `tests/unit/phases/base-phase-fallback.test.ts`（約660行）

**参考情報**:
- Evaluation Report lines 160-165: 根本原因は「Overly broad mock scope」、推奨は「Refactor mocks to target specific file paths or mock loadPrompt() separately」
- Test Result Report lines 145-160: executePhaseTemplateテストが4/4失敗（fs.readFileSync mockがloadPrompt()に影響）

### TR-3: isValidOutputContentテストデータの修正

**優先度**: 高（ただしTR-1, TR-2より影響度は低い）

**説明**:
`tests/unit/phases/base-phase-fallback.test.ts` の1個のisValidOutputContentテスト（"should validate content with sufficient length and sections"）が、テストデータにPlanning Phaseの必須キーワードが欠落しているため失敗している問題を解決する。

**具体的な要件**:
- テストデータに Planning phase キーワード（「実装戦略」「テスト戦略」「タスク分割」のいずれか1つ以上）を追加する
- 1個のテストケース（"should validate content with sufficient length and sections"）が成功することを確認する
- 他の11個のisValidOutputContentテストに影響を与えないことを確認する

**対象ファイル**:
- `tests/unit/phases/base-phase-fallback.test.ts`（約660行）

**参考情報**:
- Evaluation Report lines 169-174: 根本原因は「Test data doesn't match validation requirements」、推奨は「Add at least one required keyword to test content」
- Test Result Report lines 130-143: 「Test content missing Planning phase keywords (実装戦略, テスト戦略, タスク分割)」

### TR-4: 全テストスイートの回帰なし確認

**優先度**: 高

**説明**:
TR-1, TR-2, TR-3の修正により、他のテストファイル（57ファイル中の残り55ファイル）に影響を与えていないことを確認する。

**具体的な要件**:
- `npm test` で全57テストファイルが成功することを確認する
- カバレッジレポート（`npm run test:coverage`）で問題ないことを確認する
- 修正によって新たなテスト失敗が発生していないことを確認する

**対象範囲**:
- 全テストスイート（57テストファイル）

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

**説明**: テスト実行時間の悪化を防ぐ。

**基準**:
- TR-2のモック修正により、ユニットテストの実行時間が2倍以上に増加しないこと
- 全テストスイート（`npm test`）の実行時間が30秒以上増加しないこと

**理由**: モック範囲を限定する際、過度に複雑なモック設定を避け、テスト実行効率を維持する。

### NFR-2: 保守性要件

**説明**: 修正後のテストコードが保守しやすく、将来の変更に強い設計であること。

**基準**:
- TR-1の型アノテーション修正が、TypeScript 5.x以降のバージョンアップに対応可能な形式であること
- TR-2のモック設定が、他の開発者にも理解しやすいコメント付きで記述されていること
- 修正箇所にコメントを追加し、なぜその修正が必要だったかを記録すること

**理由**: Issue #102, #105で解決済みの知見を活用し、同様の問題の再発を防ぐため。

### NFR-3: 可読性要件

**説明**: 修正後のテストコードが、テストの意図を明確に示すこと。

**基準**:
- Given-When-Then構造を維持すること
- テストケース名が修正後も明確であること
- 不要なコメントを追加せず、コードが自己文書化されていること

**理由**: テストコードは仕様書の役割も果たすため、可読性が重要。

### NFR-4: 型安全性要件

**説明**: TypeScript 5.xの型安全性を最大限活用すること。

**基準**:
- `as any` による型アサーション回避を最優先とすること（Issue #113評価レポートで推奨されている「最悪の場合」の手段）
- 型定義拡張により、正しい型推論を可能にすること
- `tsc --noEmit` で一切のエラーが出ないこと

**理由**: Planning Documentの「TypeScript 5.x + Jest + ESMのベストプラクティス確立」目標に沿うため。

---

## 4. 制約事項

### 技術的制約

1. **プロダクションコードは変更不可**: 本Issueはテストコードの修正のみに限定する（planning.md lines 405-406）
2. **テスト仕様は変更不可**: 既存の48個のテストケースの目的と期待結果は維持する（planning.md lines 406-407）
3. **TypeScript 5.6.3**: 現在のTypeScriptバージョンを継続使用する
4. **Jest設定は変更不可**: `jest.config.cjs` は既にIssue #102, #105で対応済みのため、さらなる変更は不要（planning.md lines 400）
5. **ESMパッケージ対応**: `transformIgnorePatterns` の設定を維持する（CLAUDE.md lines 365-383）

### リソース制約

1. **時間制約**: 見積もり総工数は4~6時間（planning.md lines 388, 415）
2. **人員制約**: 単独作業を前提とする
3. **スコープ制約**: 2つのテストファイルのみに限定（planning.md lines 18-19）

### ポリシー制約

1. **コーディング規約**: 既存のテストコードのスタイルを踏襲する
2. **コミット規約**: 各タスク完了後、適切なコミットメッセージでコミットする
3. **ドキュメント規約**: CLAUDE.mdへのテストコード品質改善のベストプラクティス記載（planning.md lines 181-184）

### セキュリティ制約

- 本Issueはテストコード修正のみのため、セキュリティ上の新規制約は想定しない
- 既存のセキュリティポリシー（Secret Masking等）を遵守する

---

## 5. 前提条件

### システム環境

- **Node.js**: 20.x
- **npm**: 10.x
- **TypeScript**: 5.6.3
- **Jest**: 既存のバージョン（`package.json` に記載）
- **OS**: Linux, macOS, Windows（クロスプラットフォーム対応）

### 依存コンポーネント

- **Issue #113の実装が完了**: プロダクションコード（`src/phases/base-phase.ts` 等）のフォールバック機構が実装済み（planning.md lines 398）
- **開発環境が正常**: Node.js 20、npm 10、TypeScript 5.6.3がインストール済み（planning.md lines 399）
- **Jest設定が正常**: `jest.config.cjs` が既にESMパッケージ（chalk、strip-ansi等）に対応済み（planning.md lines 400）
- **全テストが基本的に成功**: 修正対象の19個以外の全テスト（28個のユニットテスト + 他のテスト）が成功している（planning.md lines 401）

### 外部システム連携

- 本Issueは外部システムとの連携を必要としない（ローカルテスト実行のみ）

### 既知の制限事項

- **Jest + ESM + TypeScript 5.x**: Issue #102, #105で既知の問題が存在するが、解決策は確立されている（CLAUDE.md lines 375-383）
- **chalk v5.3.0の内部依存**: `#ansi-styles` は Node.js の subpath imports 機能を使用しており、一部の環境では完全にESMエラーが解決されない場合がある（CLAUDE.md lines 379-382）

---

## 6. 受け入れ基準

本Issueは**テスト修正**のため、通常の受け入れ基準（AC-1, AC-2...）ではなく、**テスト受け入れ基準（TAC-1, TAC-2...）**として定義します。

### TAC-1: 統合テストの実行成功

**Given**: `tests/integration/phases/fallback-mechanism.test.ts` が存在する
**When**: `npm test tests/integration/phases/fallback-mechanism.test.ts` を実行する
**Then**:
- 15個の統合テストケースが全て成功する（15/15 passing）
- TypeScriptコンパイルエラーが一切発生しない
- `tsc --noEmit` でエラーが発生しない

**検証方法**:
```bash
npm test tests/integration/phases/fallback-mechanism.test.ts
tsc --noEmit
```

**成功条件**:
- テスト結果に "15 passed" が表示される
- コンパイルエラーが0件

**失敗条件**:
- テスト結果に "failed" が表示される
- コンパイルエラーが1件以上

### TAC-2: executePhaseTemplateユニットテストの成功

**Given**: `tests/unit/phases/base-phase-fallback.test.ts` が存在する
**When**: `npm test tests/unit/phases/base-phase-fallback.test.ts` を実行する
**Then**:
- 33個のユニットテストケース全てが成功する（33/33 passing）
- 特に、executePhaseTemplateテスト4個が全て成功する
- `loadPrompt()` が意図通り動作する

**検証方法**:
```bash
npm test tests/unit/phases/base-phase-fallback.test.ts
```

**成功条件**:
- テスト結果に "33 passed" が表示される
- executePhaseTemplate関連のテストに "passed" が表示される

**失敗条件**:
- テスト結果に "failed" が表示される
- executePhaseTemplate関連のテストに "failed" が表示される

### TAC-3: isValidOutputContentテストの成功

**Given**: `tests/unit/phases/base-phase-fallback.test.ts` が存在する
**When**: isValidOutputContentテスト（"should validate content with sufficient length and sections"）を実行する
**Then**:
- 当該テストケースが成功する
- Planning Phaseキーワード（「実装戦略」「テスト戦略」「タスク分割」のいずれか）がテストデータに含まれる

**検証方法**:
```bash
npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="should validate content with sufficient length and sections"
```

**成功条件**:
- テスト結果に "1 passed" が表示される

**失敗条件**:
- テスト結果に "failed" が表示される

### TAC-4: 全テストスイートの回帰なし

**Given**: 全テストファイル（57ファイル）が存在する
**When**: `npm test` を実行する
**Then**:
- 全57テストファイルが成功する
- カバレッジレポート（`npm run test:coverage`）で問題が検出されない
- 修正によって他のテストが破壊されていない

**検証方法**:
```bash
npm test
npm run test:coverage
```

**成功条件**:
- テスト結果に "Test Suites: 57 passed, 57 total" が表示される
- カバレッジレポートで新たな警告が発生していない

**失敗条件**:
- テスト結果に "failed" が表示される
- 修正前に成功していたテストが失敗する

### TAC-5: TypeScriptコンパイル成功

**Given**: 修正後のテストファイルが存在する
**When**: `tsc --noEmit` を実行する
**Then**:
- TypeScriptコンパイルエラーが一切発生しない
- 型推論が正しく動作する

**検証方法**:
```bash
tsc --noEmit
```

**成功条件**:
- コマンドが終了コード0で終了する
- エラーメッセージが一切表示されない

**失敗条件**:
- エラーメッセージが表示される
- 警告メッセージが表示される（`as any` 使用等）

### TAC-6: パフォーマンス基準

**Given**: 修正前のテスト実行時間が測定されている
**When**: 修正後のテストを実行する
**Then**:
- ユニットテストの実行時間が2倍以上に増加していない
- 全テストスイート実行時間が30秒以上増加していない

**検証方法**:
```bash
time npm test tests/unit/phases/base-phase-fallback.test.ts
time npm test
```

**成功条件**:
- 実行時間が許容範囲内

**失敗条件**:
- 実行時間が基準を超過

---

## 7. スコープ外

以下の事項は、本Issueのスコープ外として明確に除外します：

### プロダクションコード修正

- `src/phases/base-phase.ts` のフォールバック機構の修正
- その他の `src/` 配下のファイルの修正

**理由**: 本IssueはテストコードのみのIssueであり、Evaluation Reportで「コア実装は完全に動作している」ことが確認されているため（evaluation_report.md lines 199-203）。

### 新規テストケースの追加

- 48個以外のテストケースの追加
- 新しいテストシナリオの策定

**理由**: Issue #113で既に48個のテストケースが実装済みであり、本Issueは「既存テストの修正」のみをスコープとする（planning.md lines 79-82）。

### Jest設定ファイルの変更

- `jest.config.cjs` の変更
- `package.json` のJest関連依存関係の変更

**理由**: Issue #102, #105で既に適切に設定されており、さらなる変更は不要（planning.md lines 400）。

### 他のテストファイルの修正

- `tests/integration/phases/fallback-mechanism.test.ts` 以外の統合テスト
- `tests/unit/phases/base-phase-fallback.test.ts` 以外のユニットテスト

**理由**: 本Issueは2つのテストファイルのみをスコープとし、他のテストファイルは既に成功している（planning.md lines 98-99）。

### フォールバック機構の拡張

- TestImplementation、Testing、Documentationフェーズへのフォールバック機構適用
- カスタマイズ可能なフォールバック戦略の実装
- 空ファイル・不正ファイル検出の強化

**理由**: これらはEvaluation Reportの「Long-Term (Future Enhancements)」に分類されており、別のIssueで対応すべき事項（evaluation_report.md lines 248-252）。

### ドキュメントの大規模更新

- ARCHITECTURE.md の大幅な書き換え
- README.md の大幅な書き換え

**理由**: 本Issueではテストコード品質改善のベストプラクティスをCLAUDE.mdに記載する程度に留める（planning.md lines 181-184）。

### 将来的な拡張候補

以下は、本Issueのスコープ外ですが、将来的な拡張候補として記録します：

1. **テストカバレッジメトリクスの追加**: 各テストのカバレッジを詳細に追跡する仕組み（evaluation_report.md line 245）
2. **フォールバック成功率のロギング**: フォールバック機構の各パスの使用頻度を追跡（evaluation_report.md line 246）
3. **TypeScript 5.x + Jest + ESMのボイラープレート**: 今後のテストファイル作成時に参考にできるテンプレート

---

## 8. 補足情報

### Issue #113からの引き継ぎ事項

本Issueは、Issue #113のEvaluation Phaseで特定された残タスクです。以下の点に注意してください：

1. **プロダクションコードは変更不要**: Evaluation Reportで「コア実装は完全に動作している」と評価されている（evaluation_report.md lines 199-203）
2. **テスト失敗の原因は明確**: 型定義互換性問題、モック設定問題、テストデータ不足（evaluation_report.md lines 153-174）
3. **修正方法は明示済み**: Evaluation Reportで具体的な推奨修正方法が記載されている（evaluation_report.md lines 238-246）

### 参考ドキュメント

本Issueの実装にあたり、以下のドキュメントを参照してください：

- **Issue #113 Evaluation Report**: `.ai-workflow/issue-113/09_evaluation/output/evaluation_report.md`（残タスクの詳細分析）
- **Issue #113 Test Result Report**: `.ai-workflow/issue-113/06_testing/output/test-result.md`（テスト失敗の詳細）
- **CLAUDE.md**: テストコードのロギング規約、環境変数アクセス規約、エラーハンドリング規約
- **ARCHITECTURE.md**: BasePhaseのフォールバック機構の設計
- **Issue #102, #105**: Jest + ESM + TypeScript 5.xの既知の問題と解決策

### 用語集

- **フォールバック機構**: エージェントが成果物ファイルの生成に失敗した場合の自動復旧機能（Issue #113で実装）
- **TypeScript 5.x**: TypeScript 5.6.3（現在使用中のバージョン）
- **Jest**: JavaScriptテストフレームワーク
- **ESM**: ECMAScript Modules（JavaScript標準のモジュールシステム）
- **モック**: テスト時に本物のオブジェクトの代わりに使用する偽のオブジェクト
- **型アノテーション**: TypeScriptで型を明示的に指定する記法

---

## 9. 品質ゲート（Phase 1）

本要件定義書は、以下の品質ゲートを満たしています：

- [x] **機能要件が明確に記載されている**: TR-1〜TR-4として4つのテスト要件を明確に定義
- [x] **受け入れ基準が定義されている**: TAC-1〜TAC-6として6つのテスト受け入れ基準をGiven-When-Then形式で定義
- [x] **スコープが明確である**: スコープ（2つのテストファイル、3つのタスク）とスコープ外（プロダクションコード修正、新規テスト追加等）を明確に分離
- [x] **論理的な矛盾がない**: Planning Documentの戦略（EXTEND/UNIT_ONLY/EXTEND_TEST）と整合し、Evaluation Reportの分析と矛盾しない

---

**要件定義作成日**: 2025-11-02
**作成者**: Claude (AI Assistant)
**Issue**: #115
**参照**: Issue #113 Evaluation Report, Planning Document
