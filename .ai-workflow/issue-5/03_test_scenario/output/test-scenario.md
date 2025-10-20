# テストシナリオ - Issue #5: Evaluation Phase ファイル保存問題の修正

## 0. Planning Document & Requirements & Design の確認

本テストシナリオは、以下のドキュメントで策定された方針に基づいて作成されています：

- **Planning Document**: `.ai-workflow/issue-5/00_planning/output/planning.md`
  - テスト戦略: **UNIT_INTEGRATION**（ユニット＋統合テスト）
  - テストコード戦略: BOTH_TEST（既存テスト拡張＋新規テスト作成）

- **Requirements Document**: `.ai-workflow/issue-5/01_requirements/output/requirements.md`
  - 受け入れ基準: 6つのAC（AC-1〜AC-6）
  - 機能要件: 5つのFR（FR-1〜FR-5）

- **Design Document**: `.ai-workflow/issue-5/02_design/output/design.md`
  - プロンプト改善設計（最終ステップセクションの追加）
  - コード改善設計（デバッグログ、エラーメッセージ）
  - テスト設計（ユニットテスト、統合テスト）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**（Phase 2で決定）

### テスト対象の範囲

#### Unitテスト
1. **ContentParser.parseEvaluationDecision()** - 評価決定の解析ロジック
   - 4つの決定タイプ（PASS、PASS_WITH_ISSUES、FAIL_PHASE_*、ABORT）の解析
   - 無効な形式のエラーハンドリング

2. **EvaluationPhase のファイル存在チェックロジック**
   - ファイルが存在する場合の正常動作
   - ファイルが存在しない場合のエラーメッセージ

#### Integrationテスト
1. **Evaluation Phase の E2E ライフサイクル**
   - execute() → ファイル保存 → review() サイクル全体
   - エージェントログの分析（Write ツール呼び出しの検証）
   - 修正後のプロンプトでの動作検証

2. **プロンプト効果検証**
   - 修正前/後のプロンプトの動作比較
   - ファイル保存成功率の測定

### テストの目的

1. **根本原因の解決検証**: プロンプト修正により、エージェントが確実にファイル保存を実行することを確認
2. **コード改善の検証**: デバッグログ、エラーメッセージの改善が正常に動作することを確認
3. **回帰防止**: 他のフェーズへの影響がないことを確認
4. **品質保証**: 修正後のコードが受け入れ基準（AC-1〜AC-6）を満たすことを確認

---

## 2. Unitテストシナリオ

### 2.1 ContentParser.parseEvaluationDecision() のテスト

#### テストケース 1-1: PASS 決定の解析（正常系）

**目的**: PASS 決定が正しく解析されることを検証

**前提条件**:
- ContentParser インスタンスが存在する
- 有効な PASS 決定を含む評価レポートが存在する

**入力**:
```markdown
# 評価レポート

## エグゼクティブサマリー
全フェーズが正常に完了しました。

## 決定
DECISION: PASS

## 理由
REASONING:
All phases completed successfully with high quality outputs.
```

**期待結果**:
- `result.success` が `true`
- `result.decision` が `'PASS'`
- `result.reasoning` に "All phases completed successfully" が含まれる
- エラーが発生しない

**テストデータ**: 上記入力Markdown

---

#### テストケース 1-2: PASS_WITH_ISSUES 決定の解析（正常系）

**目的**: PASS_WITH_ISSUES 決定と残タスクが正しく解析されることを検証

**前提条件**:
- ContentParser インスタンスが存在する
- 有効な PASS_WITH_ISSUES 決定を含む評価レポートが存在する

**入力**:
```markdown
# 評価レポート

DECISION: PASS_WITH_ISSUES

REMAINING_TASKS:
- [ ] タスク1: ドキュメントの誤字修正
- [ ] タスク2: テストカバレッジを80%に向上

REASONING:
Implementation is complete but minor improvements needed.
```

**期待結果**:
- `result.success` が `true`
- `result.decision` が `'PASS_WITH_ISSUES'`
- `result.remainingTasks` が配列で、長さが 2
- `result.remainingTasks[0]` に "ドキュメントの誤字修正" が含まれる
- `result.remainingTasks[1]` に "テストカバレッジを80%に向上" が含まれる
- `result.reasoning` に "minor improvements" が含まれる

**テストデータ**: 上記入力Markdown

---

#### テストケース 1-3: FAIL_PHASE_2 決定の解析（正常系）

**目的**: FAIL_PHASE_* 決定と失敗フェーズ、問題点が正しく解析されることを検証

**前提条件**:
- ContentParser インスタンスが存在する
- 有効な FAIL_PHASE_2 決定を含む評価レポートが存在する

**入力**:
```markdown
# 評価レポート

DECISION: FAIL_PHASE_2

FAILED_PHASE: design

ISSUES:
1. アーキテクチャ設計が不完全
2. データベーススキーマが定義されていない
3. API仕様が曖昧

REASONING:
Design phase has critical issues that must be addressed before proceeding.
```

**期待結果**:
- `result.success` が `true`
- `result.decision` が `'FAIL_PHASE_2'`
- `result.failedPhase` が `'design'`
- `result.issues` が配列で、長さが 3
- `result.issues[0]` に "アーキテクチャ設計が不完全" が含まれる
- `result.reasoning` に "critical issues" が含まれる

**テストデータ**: 上記入力Markdown

---

#### テストケース 1-4: ABORT 決定の解析（正常系）

**目的**: ABORT 決定と中止理由、推奨アクションが正しく解析されることを検証

**前提条件**:
- ContentParser インスタンスが存在する
- 有効な ABORT 決定を含む評価レポートが存在する

**入力**:
```markdown
# 評価レポート

DECISION: ABORT

ABORT_REASON:
プロジェクトの技術スタックが要件と根本的に不一致です。

RECOMMENDED_ACTIONS:
1. 技術スタックの再選定
2. 要件の見直し
3. プロジェクト計画の再策定

REASONING:
Fundamental mismatch between requirements and chosen technology stack.
```

**期待結果**:
- `result.success` が `true`
- `result.decision` が `'ABORT'`
- `result.abortReason` に "技術スタックが要件と根本的に不一致" が含まれる
- `result.recommendedActions` が配列で、長さが 3
- `result.recommendedActions[0]` に "技術スタックの再選定" が含まれる
- `result.reasoning` に "Fundamental mismatch" が含まれる

**テストデータ**: 上記入力Markdown

---

#### テストケース 1-5: 無効な決定形式の解析（異常系）

**目的**: DECISION が存在しない場合、エラーが正しく返されることを検証

**前提条件**:
- ContentParser インスタンスが存在する
- DECISION を含まない評価レポートが存在する

**入力**:
```markdown
# 評価レポート

これは評価レポートですが、DECISION が含まれていません。

## 理由
何らかの理由
```

**期待結果**:
- `result.success` が `false`
- `result.error` に "判定タイプが見つかりません" または "DECISION not found" が含まれる
- `result.decision` が `null` または `undefined`

**テストデータ**: 上記入力Markdown

---

#### テストケース 1-6: 境界値テスト - 空の評価レポート（異常系）

**目的**: 空のファイルを解析した場合、エラーが正しく返されることを検証

**前提条件**:
- ContentParser インスタンスが存在する

**入力**:
```markdown
```

**期待結果**:
- `result.success` が `false`
- `result.error` に "判定タイプが見つかりません" が含まれる

**テストデータ**: 空文字列

---

### 2.2 EvaluationPhase のファイル存在チェックロジックのテスト

#### テストケース 2-1: ファイルが存在する場合（正常系）

**目的**: evaluation_report.md が存在する場合、正常に読み込まれることを検証

**前提条件**:
- EvaluationPhase インスタンスが存在する
- `{outputDir}/evaluation_report.md` が存在する

**入力**:
- ファイルパス: `{outputDir}/evaluation_report.md`
- ファイル内容: 有効な評価レポート（DECISION: PASS を含む）

**期待結果**:
- ファイル存在チェックが成功
- `fs.existsSync()` が `true` を返す
- ファイル内容が正しく読み込まれる
- エラーが発生しない

**テストデータ**:
- ファイル: `evaluation_report.md`
- 内容: テストケース 1-1 のMarkdown

---

#### テストケース 2-2: ファイルが存在しない場合（異常系）

**目的**: evaluation_report.md が存在しない場合、適切なエラーメッセージが返されることを検証

**前提条件**:
- EvaluationPhase インスタンスが存在する
- `{outputDir}/evaluation_report.md` が存在しない

**入力**:
- ファイルパス: `{outputDir}/evaluation_report.md`

**期待結果**:
- `result.success` が `false`
- `result.error` に以下が含まれる:
  - "evaluation_report.md が見つかりません"
  - ファイルの絶対パス
  - "エージェントが Write ツールを呼び出していない可能性があります"
  - エージェントログのパス（`{executeDir}/agent_log.md`）
- コンソールに ERROR ログが出力される

**テストデータ**: ファイルなし

---

#### テストケース 2-3: デバッグログの出力検証（正常系）

**目的**: デバッグログが正しく出力されることを検証

**前提条件**:
- EvaluationPhase インスタンスが存在する
- execute() メソッドが呼び出される

**入力**:
- maxTurns: 50

**期待結果**:
- 以下のログが順番に出力される:
  1. `[INFO] Phase evaluation: Starting agent execution with maxTurns=50`
  2. `[INFO] Expected output file: {evaluationFile}`
  3. `[INFO] Phase evaluation: Agent execution completed`
  4. `[INFO] Checking for output file existence: {evaluationFile}`

**テストデータ**: なし（ログ出力のみ）

---

## 3. Integrationテストシナリオ

### 3.1 Evaluation Phase の E2E ライフサイクルテスト

#### シナリオ 1: 修正後のプロンプトでファイル保存が成功する（正常系）

**目的**: 修正後のプロンプト（最終ステップセクション追加）により、エージェントが確実に evaluation_report.md を作成することを検証

**前提条件**:
- 修正後の `src/prompts/evaluation/execute.txt` が存在する
- 全フェーズの成果物（planning.md、requirements.md 等）がモックとして準備されている
- テスト用の一時ディレクトリが作成されている
- MetadataManager が初期化されている

**テスト手順**:
1. EvaluationPhase インスタンスを作成（テスト用の一時ディレクトリを使用）
2. モックエージェントを設定（Write ツールを呼び出す動作をシミュレート）
3. `evaluationPhase.execute()` を実行
4. ファイル存在を確認
5. ファイル内容を確認
6. エージェントログを確認

**期待結果**:
- `result.success` が `true`
- `{outputDir}/evaluation_report.md` が作成される
- ファイル内容に以下が含まれる:
  - エグゼクティブサマリー
  - 7つの評価基準の評価
  - DECISION: （PASS、PASS_WITH_ISSUES、FAIL_PHASE_*、ABORT のいずれか）
  - REASONING
  - 推奨事項
- エージェントログ（`{executeDir}/agent_log.md`）に Write ツール呼び出しが記録されている

**確認項目**:
- [ ] evaluation_report.md が存在する
- [ ] ファイルサイズが 1KB 以上（空ファイルでない）
- [ ] ファイルが有効な Markdown 形式である
- [ ] DECISION が含まれる
- [ ] エージェントログに "Write" または "write" が含まれる

---

#### シナリオ 2: ファイル保存失敗時のエラーハンドリング（異常系）

**目的**: エージェントがファイル保存を実行しなかった場合、適切なエラーメッセージが表示されることを検証

**前提条件**:
- EvaluationPhase インスタンスが存在する
- モックエージェントが Write ツールを呼び出さない設定

**テスト手順**:
1. EvaluationPhase インスタンスを作成
2. モックエージェントを設定（Write ツールを呼び出さない動作をシミュレート）
3. `evaluationPhase.execute()` を実行
4. エラーメッセージを確認
5. MetadataManager の状態を確認

**期待結果**:
- `result.success` が `false`
- `result.error` に以下が含まれる:
  - "evaluation_report.md が見つかりません"
  - ファイルの絶対パス
  - "エージェントが Write ツールを呼び出していない可能性があります"
  - エージェントログのパス
- コンソールに ERROR ログが出力される
- MetadataManager で evaluation フェーズのステータスが 'failed' になる

**確認項目**:
- [ ] result.success === false
- [ ] result.error が詳細なエラーメッセージを含む
- [ ] エージェントログのパスが含まれる
- [ ] MetadataManager のステータスが 'failed'

---

#### シナリオ 3: 評価決定の解析と MetadataManager への保存（正常系）

**目的**: evaluation_report.md の評価決定が正しく解析され、MetadataManager に保存されることを検証

**前提条件**:
- EvaluationPhase インスタンスが存在する
- `{outputDir}/evaluation_report.md` が存在する（DECISION: PASS_WITH_ISSUES を含む）

**テスト手順**:
1. evaluation_report.md を手動で作成（DECISION: PASS_WITH_ISSUES を含む）
2. EvaluationPhase インスタンスを作成
3. `evaluationPhase.execute()` を実行
4. MetadataManager のデータを確認

**期待結果**:
- `result.success` が `true`
- `result.decision` が `'PASS_WITH_ISSUES'`
- `result.remainingTasks` が配列で、タスクが含まれる
- MetadataManager の `evaluation_decision` フィールドに以下が保存される:
  - `decision: 'PASS_WITH_ISSUES'`
  - `reasoning: ...`
  - `remainingTasks: [...]`

**確認項目**:
- [ ] MetadataManager.data.evaluation_decision が存在する
- [ ] evaluation_decision.decision === 'PASS_WITH_ISSUES'
- [ ] evaluation_decision.remainingTasks が配列である
- [ ] metadata.json ファイルに保存されている

---

### 3.2 プロンプト効果検証テスト

#### シナリオ 4: 複数回実行での成功率測定（信頼性検証）

**目的**: 修正後のプロンプトで、複数回実行して 100% の成功率を達成することを検証（NFR-2: 信頼性要件、AC-4: プロンプト効果検証完了）

**前提条件**:
- 修正後の `src/prompts/evaluation/execute.txt` が存在する
- 実際の Codex / Claude エージェント（モックでない）を使用
- 全フェーズの成果物が準備されている

**テスト手順**:
1. Evaluation Phase を 3 回連続実行
2. 各実行ごとに以下を記録:
   - ファイル保存の成功/失敗
   - エージェントの Turn 数
   - エージェントログで Write ツール呼び出しの有無
   - evaluation_report.md のファイルサイズ
3. 成功率を計算（成功回数 / 実行回数）

**期待結果**:
- 成功率が 100%（3回中3回成功）
- 各実行で evaluation_report.md が作成される
- 各実行のエージェントログに Write ツール呼び出しが記録される
- 各実行の evaluation_report.md に DECISION が含まれる

**確認項目**:
- [ ] 3回中3回ファイルが作成される
- [ ] 全実行でエージェントログに Write 呼び出しが記録される
- [ ] 全実行で有効な DECISION が含まれる
- [ ] Turn 数が maxTurns（50）以内である

---

#### シナリオ 5: エージェントログの詳細分析（動作検証）

**目的**: エージェントが「最終ステップ」セクションを認識し、ステップバイステップでファイル保存を実行していることを検証

**前提条件**:
- 修正後の `src/prompts/evaluation/execute.txt` が存在する
- 実際の Codex / Claude エージェント（モックでない）を使用
- 全フェーズの成果物が準備されている

**テスト手順**:
1. Evaluation Phase を実行
2. エージェントログ（`{executeDir}/agent_log.md`）を詳細に分析
3. 以下のパターンを検索:
   - "最終ステップ" または "ステップ1" / "ステップ2" / "ステップ3"
   - "Write ツール"
   - "evaluation_report.md"
4. Turn ごとの動作を記録

**期待結果**:
- エージェントが「最終ステップ」セクションに言及している
- エージェントが "Write ツールを使用" と明示している
- エージェントログに Write ツール呼び出しが記録されている
- ファイル保存が実行された Turn 番号が特定できる

**確認項目**:
- [ ] エージェントログに "最終ステップ" または "ステップ" が含まれる
- [ ] エージェントログに "Write" が含まれる
- [ ] Write ツール呼び出しが記録されている Turn を特定できる
- [ ] ファイル保存が最終 Turn またはその直前で実行されている

---

### 3.3 他フェーズへの影響検証テスト

#### シナリオ 6: 他フェーズの動作に影響がないことを確認（回帰テスト）

**目的**: Evaluation Phase の修正が、他のフェーズ（Planning、Requirements 等）に影響を与えないことを検証

**前提条件**:
- 修正後のコードが存在する
- 全フェーズの既存テストが存在する

**テスト手順**:
1. 全フェーズの既存テストを実行（`npm test`）
2. Planning Phase、Requirements Phase、Design Phase の統合テストを個別に実行
3. テスト結果を確認

**期待結果**:
- 全フェーズの既存テストが成功する
- テストカバレッジが低下しない（80%以上を維持）
- 新たな失敗テストが発生しない

**確認項目**:
- [ ] 既存テストの成功率が 100%
- [ ] テストカバレッジが 80% 以上
- [ ] Planning Phase のテストが成功
- [ ] Requirements Phase のテストが成功
- [ ] Design Phase のテストが成功

---

## 4. テストデータ

### 4.1 正常データ

#### 評価レポート - PASS（最小構成）
```markdown
# 評価レポート

DECISION: PASS

REASONING:
All phases completed successfully.
```

#### 評価レポート - PASS_WITH_ISSUES（完全構成）
```markdown
# 評価レポート

## エグゼクティブサマリー
プロジェクトは全体として成功していますが、いくつかの軽微な改善点があります。

## 評価基準

### 1. 要件充足度
評価: 5/5
すべての要件が満たされています。

### 2. 設計品質
評価: 4/5
設計は堅牢ですが、一部のドキュメントに改善の余地があります。

（省略: 他の評価基準）

## 決定
DECISION: PASS_WITH_ISSUES

REMAINING_TASKS:
- [ ] API ドキュメントの誤字修正
- [ ] テストカバレッジを85%に向上

## 理由
REASONING:
Implementation is complete and meets all functional requirements. However, minor documentation improvements and test coverage increase are recommended.

## 推奨事項
1. API ドキュメントのレビュー
2. 追加のエッジケーステストの作成
```

### 4.2 異常データ

#### 評価レポート - DECISION なし
```markdown
# 評価レポート

これは評価レポートですが、DECISION が含まれていません。
```

#### 評価レポート - 無効な DECISION
```markdown
# 評価レポート

DECISION: INVALID_DECISION_TYPE

REASONING:
This is an invalid decision type.
```

### 4.3 境界値データ

#### 評価レポート - 空ファイル
```markdown
```

#### 評価レポート - DECISION のみ
```markdown
DECISION: PASS
```

### 4.4 モックエージェントのテストデータ

#### モックエージェント設定 - ファイル保存成功
```typescript
{
  shouldWriteFile: true,
  decisionType: 'PASS',
  turnCount: 3,
  outputContent: '# 評価レポート\n\nDECISION: PASS\n\nREASONING:\nAll phases completed successfully.'
}
```

#### モックエージェント設定 - ファイル保存失敗
```typescript
{
  shouldWriteFile: false,
  decisionType: null,
  turnCount: 2,
  outputContent: null // ファイルを作成しない
}
```

---

## 5. テスト環境要件

### 5.1 ローカル環境

- **Node.js**: 20.x 以上
- **TypeScript**: 5.x
- **テストフレームワーク**: Jest
- **ファイルシステム**: fs-extra
- **一時ディレクトリ**: os.tmpdir()

### 5.2 CI/CD 環境（GitHub Actions）

- **OS**: Ubuntu latest
- **Node.js**: 20.x
- **環境変数**:
  - `OPENAI_API_KEY`（Codex テスト用、オプション）
  - `ANTHROPIC_API_KEY`（Claude テスト用、オプション）

### 5.3 モック/スタブの必要性

#### 必要なモック
1. **CodexAgentClient / ClaudeAgentClient**:
   - 統合テスト（シナリオ 1、2、3）で使用
   - Write ツール呼び出しの有無を制御
   - エージェントログの生成をシミュレート

2. **GitHubClient**:
   - Issue、PR、コメント投稿をモック
   - 実際の GitHub API 呼び出しを回避

3. **ファイルシステム**:
   - 一時ディレクトリを使用（os.tmpdir()）
   - テスト後にクリーンアップ（fs.removeSync）

#### 実際のエージェントを使用するテスト
- シナリオ 4: 複数回実行での成功率測定
- シナリオ 5: エージェントログの詳細分析

**注意**: これらのテストは CI/CD 環境では API キーが必要なため、オプショナルとする（環境変数が設定されている場合のみ実行）。

---

## 6. 受け入れ基準との対応

### AC-1: プロンプト分析完了
**対応テスト**: なし（Phase 1 の成果物）

### AC-2: Evaluation Phase プロンプト修正完了
**対応テスト**:
- シナリオ 1: 修正後のプロンプトでファイル保存が成功する
- シナリオ 5: エージェントログの詳細分析

### AC-3: ファイル保存検証強化完了
**対応テスト**:
- テストケース 2-2: ファイルが存在しない場合（異常系）
- テストケース 2-3: デバッグログの出力検証（正常系）
- シナリオ 2: ファイル保存失敗時のエラーハンドリング

### AC-4: プロンプト効果検証完了
**対応テスト**:
- シナリオ 4: 複数回実行での成功率測定（信頼性検証）
- シナリオ 5: エージェントログの詳細分析

### AC-5: テストコード実装完了
**対応テスト**:
- すべてのユニットテスト（セクション 2）
- すべての統合テスト（セクション 3）

### AC-6: ドキュメント作成完了
**対応テスト**: なし（Phase 7 の成果物）

---

## 7. テスト実行計画

### 7.1 優先度

**Priority 1（最重要）**:
- シナリオ 1: 修正後のプロンプトでファイル保存が成功する
- テストケース 1-1 〜 1-4: ContentParser の正常系テスト
- シナリオ 4: 複数回実行での成功率測定

**Priority 2（重要）**:
- シナリオ 2: ファイル保存失敗時のエラーハンドリング
- シナリオ 3: 評価決定の解析と MetadataManager への保存
- テストケース 2-2: ファイルが存在しない場合（異常系）

**Priority 3（推奨）**:
- シナリオ 5: エージェントログの詳細分析
- シナリオ 6: 他フェーズへの影響検証
- テストケース 1-5、1-6: ContentParser の異常系・境界値テスト

### 7.2 実行順序

1. **Phase 5（テストコード実装）**:
   - ユニットテストの実装（セクション 2）
   - 統合テストの実装（セクション 3）

2. **Phase 6（テスト実行）**:
   - ローカルテスト実行（`npm test`）
   - テストカバレッジ確認（80%以上）
   - 実際のワークフローでの検証（シナリオ 4）

### 7.3 成功基準

- **ユニットテスト**: 全テストケース（8ケース）が成功
- **統合テスト**: Priority 1 の3シナリオが成功
- **テストカバレッジ**: 80% 以上
- **信頼性検証**: シナリオ 4 で 100% の成功率（3回中3回）

---

## 8. 品質ゲート確認（Phase 3）

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION 戦略に準拠（ユニットテスト8ケース、統合テスト6シナリオ）
- [x] **主要な正常系がカバーされている**:
  - ContentParser の4つの決定タイプ解析（PASS、PASS_WITH_ISSUES、FAIL_PHASE_*、ABORT）
  - Evaluation Phase の E2E ライフサイクル（シナリオ 1、3）
  - プロンプト効果検証（シナリオ 4）
- [x] **主要な異常系がカバーされている**:
  - 無効な決定形式の解析（テストケース 1-5、1-6）
  - ファイル保存失敗時のエラーハンドリング（テストケース 2-2、シナリオ 2）
- [x] **期待結果が明確である**: 各テストケース/シナリオに具体的な期待結果と確認項目を記載

---

## 9. リスクと軽減策

### リスク1: エージェントの非決定的動作
- **影響度**: 中
- **確率**: 中
- **軽減策**:
  - シナリオ 4 で複数回実行（3回）して再現性を確認
  - 失敗時は追加で2回実行し、5回中4回以上の成功率を許容

### リスク2: 実際のエージェント API が利用不可
- **影響度**: 中
- **確率**: 低
- **軽減策**:
  - シナリオ 4、5 は API キーが設定されている場合のみ実行
  - モックエージェントでの統合テスト（シナリオ 1、2、3）を優先

### リスク3: テスト実装の工数超過
- **影響度**: 低
- **確率**: 中
- **軽減策**:
  - Priority 1 のテストを最優先で実装
  - Priority 3 のテストは時間が許す場合のみ実装

---

**作成日**: 2025-01-20
**対象 Issue**: #5 - Evaluation Phase: 評価レポートファイルが作成されない問題の調査と修正
**テスト戦略**: UNIT_INTEGRATION（ユニット＋統合テスト）
**総テストケース数**: 14（ユニット8 + 統合6）
**想定工数**: 1時間（Planning Document の Phase 3 見積もりに準拠）
