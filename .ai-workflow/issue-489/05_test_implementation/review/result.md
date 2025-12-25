## 品質ゲート評価

**⚠️ 重要: 各項目に対して明示的にPASS/FAILを判定してください。1つでもFAILがあれば最終判定は自動的にFAILです。**

- [x/  ] **Phase 3のテストシナリオがすべて実装されている**: **PASS** – `getWorkflowLanguage()`、`parseExecuteOptions()/validateExecuteOptions()`、`MetadataManager` の言語 getter/setter、及び CLI/ENV/META/default の優先順位に関する統合の流れがテストコードとして追加されており（参照: `tests/unit/core/config.test.ts:354`, `tests/unit/commands/execute/options-parser.test.ts:224`, `tests/unit/metadata-manager.test.ts:137`, `tests/integration/language-setting.test.ts:10`）、シナリオで示された主要観点を押さえています。ただし `src/commands/execute.ts:64` にある `resolveWorkflowLanguage` を直接叩くユニットレベルの検証がまだないため、補足テストを検討してください。
- [x/  ] **テストコードが実行可能である**: **PASS** – Jest の構文/構成に準拠したテスト群で、環境変数を `beforeEach`/`afterEach` で巻き戻すなど実行順序に影響しづらい構造になっています（`tests/unit/core/config.test.ts:354-407` など）。静的な型・依存も明示されており、ビルドエラーの痕跡はありません。
- [x/  ] **テストの意図がコメントで明確**: **PASS** – 各テストに Given/When/Then コメントや説明的な名称が付いており、仕様意図を追いやすくなっています（例: `tests/unit/commands/execute/options-parser.test.ts:224-347`）。

**品質ゲート総合判定: PASS_WITH_SUGGESTIONS**
- すべての品質ゲートがPASSですが、追加のユニット検証とシナリオ整合性強化の余地があるため PASS_WITH_SUGGESTIONS とします。

## 詳細レビュー

### 1. テストシナリオとの整合性

**良好な点**:
- `getWorkflowLanguage()` が `ja/en`, 未設定、正規化、不正値・空白を網羅する形で追加されており `config` 層のシナリオをしっかり追跡しています（`tests/unit/core/config.test.ts:354`）。
- `parseExecuteOptions()` と `validateExecuteOptions()` に言語オプションの正規化・許容値/バリデーションのケースが加わり、コマンド層の要件も取り込まれています（`tests/unit/commands/execute/options-parser.test.ts:224-438`）。
- `MetadataManager` の `setLanguage/getLanguage` が保存・取得・不正値対応を確認しており、メタデータ層もカバーされています（`tests/unit/metadata-manager.test.ts:137-161`）。
- 統合テストで CLI/ENV/META/default の優先順位や永続化を追跡し、実際のフローに近い確認ができています（`tests/integration/language-setting.test.ts:10-86`）。

**懸念点**:
- `resolveWorkflowLanguage` そのものを呼び出すユニットテストがなく、優先順位ロジックが統合テスト内の `resolveLanguage` ヘルパーで再実装されているため、実装コード自体の回帰検知になっていません（`src/commands/execute.ts:64`）。この関数を直接叩く単体テストを加えると、Phase 3 のシナリオで示された `RES-` 系ケースにより忠実になります。

### 2. テストカバレッジ

**良好な点**:
- 主要な正常系と異常系を意図的に分けており、言語周りの値や CLI を跨いだ優先順位を複数角度から押さえています（config/headers/metadata/integration）。
- コメントつきテスト名と Given/When/Then でカバレッジの目的が読み取れるため、レビュー時の確認も容易です。

**改善の余地**:
- `AI_WORKFLOW_LANGUAGE=Ja` や `metadata.language` に `null` を保存するといった細かい正規化ケースがまだ明示的にテストされていないため、Validation/Config のセットでさらに補強すると安心感が増します（例: `tests/unit/core/config.test.ts` で `Ja` もしくは `tests/unit/commands/execute/options-parser.test.ts` で `language=en` の「純粋ケース」）。

### 3. テストの独立性

**良好な点**:
- 環境変数を毎回バックアップ/復元しているので、テスト間の漏れがありません（`tests/unit/core/config.test.ts:354-407`）。
- `MetadataManager` テストは `beforeEach` で `jest.restoreAllMocks()` を使い、グローバルな fs 呼び出しを隔離しています（`tests/unit/metadata-manager.test.ts:28-48`）。

**懸念点**:
- 統合テスト側では `process.env` を書き換えているため、`afterEach` で戻す処理が漏れると他のテストに影響しそうですが、現状は `process.env = originalEnv` で問題ありません（`tests/integration/language-setting.test.ts:22-43`）。

### 4. テストの可読性

**良好な点**:
- Given/When/Then コメントと長い日本語タイトルを併用しており、何を検証しているのか即座に把握できます（`tests/unit/commands/execute/options-parser.test.ts:224-347`）。
- Describe/it の構造も分かれておりカテゴリごとの意図が明確です（`tests/unit/metadata-manager.test.ts:137-161`）。

**改善の余地**:
- 一部コメントだけ英語（統合テストの `describe`）なので、ドキュメントと合わせて統一しておくと読みやすさがさらに向上します。

### 5. モック・スタブの使用

**良好な点**:
- `MetadataManager` テストで `fs-extra` の各メソッドを `jest.spyOn` し、`WorkflowState.load` もモックすることで外部 I/O を排除しています（`tests/unit/metadata-manager.test.ts:1-48`）。
- これにより `MetadataManager` 記録/読み出しの記述が純粋なロジックのテストに集中しています。

**懸念点**:
- 統合テストでは `resolveLanguage` ヘルパーを使って優先順位を計算しており、実際の CLI / `resolveWorkflowLanguage` を通らないため、コマンド側の挙動が保証されていません（`tests/integration/language-setting.test.ts:16-87`）。

### 6. テストコードの品質

**良好な点**:
- 全体的に jest のベストプラクティスに則った構造で、`expect` の対象も明確です（各ファイル）。
- テスト名/コメントがテスト意図を示しており、リグレッションが導入された場合すぐに原因が探せそうです。

**懸念点**:
- 実行確認はされていないため、テストスイートの実行時に未発見のタイムアウトや依存問題があるか不明のままです。可能であれば `npm test -- tests/integration/language-setting.test.ts` などを Phase 6 で回すと安心です。

## ブロッカー（BLOCKER）

**次フェーズに進めない重大な問題**

特にありません。

## 改善提案（SUGGESTION）

1. **`resolveWorkflowLanguage` に対するユニットカバレッジ追加**
   - 現状: 優先順位ロジックは `tests/integration/language-setting.test.ts` のヘルパーで再現しているだけで、`src/commands/execute.ts:64` の関数自体には直接触れていません。
   - 提案: 関数をエクスポートして、CLI/ENV/META/default の全組み合わせケースを直接検証する単体テストを追加すると、Priority ロジックの回帰防止力が上がります。
   - 効果: Phase 3 シナリオの `RES-001` 〜 `RES-004` を明文化し、CLI が実際にその関数を使う構造を保証できる。

2. **統合テストで CLI エントリポイントや `handleExecuteCommand` を経由する**
   - 現状: `language-setting.test.ts` は `resolveLanguage` というローカルヘルパーと `MetadataManager` の API で検証しており、実際のコマンド呼び出しや `handleExecuteCommand` に対して挙動を確認していません。
   - 提案: `executeCommand` を模したショートカットや実際の CLI コマンド（`handleExecuteCommand` の簡易実行）を導入し、PhaseContext に `language` が引き継がれることを直接確認すると、E2E 信頼度が向上します。
   - 効果: コマンドレベルでの意図した優先順位/メタデータ保存を把握し、`resolveWorkflowLanguage` の再利用性も補強できます。

## 総合評価

**主な強み**:
- 各レイヤー（config/options/metadata/integration）で言語オプションの正常系・異常系を意識したテストが追加されており、Phase 3 のテストシナリオとの整合性が高い。
- モックとプロセス制御を適切に使うことで独立性と可読性を維持している。

**主な改善提案**:
- 直接 `resolveWorkflowLanguage` をテスト対象に含めて優先順位ロジックを明示的に検証し、統合テストでも実際のコマンド経路を通すことで文書化されたシナリオを完全に満たす。

テスト実装は全体的に堅実で次フェーズに進める状態ですが、上述の補強を加えればより信頼性が高まるため、PASS_WITH_SUGGESTIONS と判断します。

---
**判定: PASS_WITH_SUGGESTIONS**