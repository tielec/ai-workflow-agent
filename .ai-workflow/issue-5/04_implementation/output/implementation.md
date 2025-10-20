# 実装ログ - Issue #5: Evaluation Phase ファイル保存問題の修正

## 実装サマリー

- **実装戦略**: EXTEND（既存コードの拡張）
- **変更ファイル数**: 2個
- **新規作成ファイル数**: 0個
- **実装日**: 2025-01-20

## 変更ファイル一覧

### 修正

1. **`src/prompts/evaluation/execute.txt`** - プロンプト改善（最重要）
2. **`src/phases/evaluation.ts`** - デバッグログ追加、エラーメッセージ改善

## 実装詳細

### ファイル1: src/prompts/evaluation/execute.txt

**変更内容**: プロンプトの最後に「最終ステップ - 評価レポートの保存（必須）」セクションを追加

**変更箇所**: 152行目（旧）→ 163-180行目（新）

**変更前**:
```markdown
**重要**: 評価レポートは必ず `.ai-workflow/issue-{issue_number}/09_evaluation/output/evaluation_report.md` として保存してください。

## 重要な注意事項
（以下省略）
```

**変更後**:
```markdown
## 重要な注意事項
（省略）

## 最終ステップ - 評価レポートの保存（必須）

評価が完了したら、以下のステップを**必ず実行**してください：

### ステップ1: 評価レポートの内容確認
上記で生成した評価レポート全文（エグゼクティブサマリー、基準評価、決定、推奨事項）が完成していることを確認してください。

### ステップ2: Write ツールを使用してファイル保存
**必ず Write ツールを使用**して、評価レポート全文を以下のパスに保存してください：

```
.ai-workflow/issue-{issue_number}/09_evaluation/output/evaluation_report.md
```

### ステップ3: 保存完了の確認
ファイルが正しく作成されたことを確認してください。

**重要**: このファイルが存在しない場合、Evaluation Phase は失敗します。評価内容の生成だけでなく、**ファイル保存が必須**です。表示（出力）ではなく、**Write ツールによる保存**を忘れないでください。
```

**理由**:
- **根本原因の解決**: プロンプト分析（Phase 1）で特定された「プロンプトの明示性不足」を解決
- **成功パターンの適用**: 他の8つのフェーズで成功しているパターン（Planning、Requirements等）を参考に、Evaluation Phase でもファイル保存指示を明示化
- **ステップバイステップ形式**: エージェントが「評価内容の生成」と「ファイル保存」を明確に分離して認識できるよう、3つのステップに分解
- **Write ツールの明示**: 「必ず Write ツールを使用」という指示を追加し、エージェントが正しいツールを呼び出すように誘導
- **保存必須の強調**: 「ファイルが存在しない場合、フェーズは失敗します」という警告を追加し、保存の重要性を強調

**注意点**:
- プロンプト長が 164 行 → 181 行（+17行）に増加したが、他のフェーズ（Planning: 253行、Report: 277行）と比較して妥当な範囲
- `{issue_number}` プレースホルダーは evaluation.ts で置換されるため、実行時には実際の Issue 番号に変換される
- 既存の「重要な注意事項」セクションと新しい「最終ステップ」セクションの間にセクション境界を明確にし、視覚的に分離

### ファイル2: src/phases/evaluation.ts

**変更内容**: デバッグログの追加、エラーメッセージの改善

**変更箇所1**: 108-115行目（エージェント実行前後のログ）

**追加したログ**:
```typescript
console.info(`[INFO] Phase ${this.phaseName}: Starting agent execution with maxTurns=50`);
console.info(`[INFO] Expected output file: ${path.join(this.outputDir, 'evaluation_report.md')}`);

await this.executeWithAgent(executePrompt, { maxTurns: 50 });

console.info(`[INFO] Phase ${this.phaseName}: Agent execution completed`);
const evaluationFile = path.join(this.outputDir, 'evaluation_report.md');
console.info(`[INFO] Checking for output file existence: ${evaluationFile}`);
```

**理由**:
- トラブルシューティングの容易化: エージェント実行の開始・完了、ファイル存在チェックのタイミングを明確にログに記録
- デバッグ効率の向上: フェーズ実行中のどのステップで問題が発生したかを特定しやすくする
- 既存のログパターンとの整合性: BasePhase や他のフェーズのログスタイルに合わせて `[INFO]` プレフィックスを使用

**変更箇所2**: 117-136行目（ファイル存在チェック失敗時のエラーハンドリング）

**変更前**:
```typescript
if (!fs.existsSync(evaluationFile)) {
  return {
    success: false,
    output: null,
    decision: null,
    error: `evaluation_report.md が見つかりません: ${evaluationFile}`,
  };
}
```

**変更後**:
```typescript
if (!fs.existsSync(evaluationFile)) {
  // エージェントログのパスを取得
  const agentLogPath = path.join(this.executeDir, 'agent_log.md');
  const agentLogExists = fs.existsSync(agentLogPath);

  console.error(`[ERROR] Phase ${this.phaseName}: Output file not found: ${evaluationFile}`);
  console.error(`[ERROR] Agent may not have called Write tool`);
  console.error(`[ERROR] Agent log path: ${agentLogPath} (exists: ${agentLogExists})`);

  return {
    success: false,
    output: null,
    decision: null,
    error: [
      `evaluation_report.md が見つかりません: ${evaluationFile}`,
      `エージェントが Write ツールを呼び出していない可能性があります。`,
      `エージェントログを確認してください: ${agentLogPath}`,
    ].join('\n'),
  };
}
```

**理由**:
- **エラーメッセージの詳細化**: ファイルが見つからない理由（Write ツール未呼び出し）を明示
- **次のアクション提示**: エージェントログのパスを提示し、ユーザーが問題を調査しやすくする
- **エージェントログ存在確認**: ログファイルの存在をチェックし、ログが存在するかどうかをユーザーに伝える
- **複数行エラーメッセージ**: `join('\n')` を使用して、複数の情報を見やすく整形

**注意点**:
- `this.executeDir` は BasePhase で定義されており、エージェント実行ログが保存されるディレクトリを指す
- エラーログは `console.error` で出力され、標準エラーに記録される
- エラーメッセージは PhaseExecutionResult の `error` フィールドに含まれ、CLI 出力やメタデータに記録される

### 変更箇所3: maxTurns 設定の検証

**現状**: 108行目で `maxTurns: 50` が設定されている

**検証結果**: Planning Phase（Phase 0）も `maxTurns: 50` を使用しており、他のフェーズと同等。設計書（7.2.1節）で「調査結果により変更不要の可能性が高い」と記載されているため、現在の設定を維持。

**判断根拠**:
- 他フェーズとの整合性（Planning Phase は 50、Requirements Phase はデフォルト50）
- プロンプト修正により、ファイル保存は maxTurns 内で完了すると期待される
- 必要に応じて Phase 6（テスト実行）の結果を見て調整可能

## 実装の設計準拠性

### Planning Document（Phase 0）との整合性
- ✅ 実装戦略: **EXTEND**（既存コードの拡張）に準拠
- ✅ 見積もり工数: Phase 4 の見積もり 1~1.5h（プロンプト修正）+ 0.5~1h（コード改善）= 1.5~2.5h に準拠
- ✅ リスク評価: 低（プロンプト修正が中心、他フェーズへの影響なし）

### Design Document（Phase 2）との整合性
- ✅ 7.1.2節「プロンプト改善設計」に従った実装
- ✅ 7.2.1節「デバッグログの追加」に従った実装
- ✅ 7.2.1節「エラーメッセージの改善」に従った実装
- ✅ 変更ファイルリスト（6章）に記載された2ファイルのみを修正

### Requirements Document（Phase 1）との整合性
- ✅ FR-2「Evaluation Phase プロンプトの改善」を実装
- ✅ FR-3「ファイル保存検証の強化」を実装
- ✅ NFR-3「保守性要件」を満たす（コーディングスタイルに準拠）

## 品質ゲート確認（Phase 4）

- ✅ **Phase 2の設計に沿った実装である**: 設計書の7.1.2節、7.2.1節に完全準拠
- ✅ **既存コードの規約に準拠している**: TypeScript スタイル、インデント（2スペース）、命名規則を維持
- ✅ **基本的なエラーハンドリングがある**: ファイル存在チェック、エージェントログ存在チェックを実装
- ✅ **コードが可読である**: console.info/error によるログ、コメントによる意図説明
- ✅ **明らかなバグがない**: 既存ロジックを破壊せず、追加ログとエラーメッセージのみを変更

## 影響範囲

### 変更されたコンポーネント
1. **Evaluation Phase プロンプト**: エージェントへの指示を改善
2. **Evaluation Phase 実行ロジック**: デバッグログとエラーハンドリングを強化

### 変更されていないコンポーネント
- ✅ BasePhase（execute/review/revise サイクル）
- ✅ 他のフェーズのプロンプト（Task 4-3 は Phase 4 範囲外、Phase 6 テスト後に判断）
- ✅ ContentParser（評価決定の解析ロジック）
- ✅ エージェントクライアント（Codex / Claude）

### 後方互換性
- ✅ 既存の metadata.json スキーマは変更なし
- ✅ 出力ディレクトリ構造は変更なし
- ✅ API インターフェースは変更なし

## 次のステップ

### Phase 5: Test Implementation（テストコード実装）
- [ ] ユニットテスト実装: ContentParser.parseEvaluationDecision() のテスト（テストシナリオ 2.1）
- [ ] 統合テスト実装: Evaluation Phase の E2E テスト（テストシナリオ 3.1-3.3）
- [ ] テストカバレッジ確認: 80% 以上を目標

### Phase 6: Testing（テスト実行）
- [ ] ローカルテスト実行: `npm test` によるユニット・統合テストの実行
- [ ] 実際のワークフローでの検証: 修正後の Evaluation Phase を実際の Issue で実行
- [ ] プロンプト効果検証: 3回連続実行で 100% の成功率を確認（テストシナリオ 3.2 シナリオ 4）

### Phase 7: Documentation（ドキュメント）
- [ ] プロンプト設計ガイドライン作成: ファイル保存指示のベストプラクティスを文書化
- [ ] TROUBLESHOOTING.md 更新: 同様の問題が発生した場合の対処法を追記

### Phase 8: Report（レポート）
- [ ] 修正内容のサマリー作成
- [ ] 検証結果の記録
- [ ] 再発防止策の文書化

## 実装完了チェックリスト

- ✅ プロンプト修正完了（src/prompts/evaluation/execute.txt）
- ✅ コード改善完了（src/phases/evaluation.ts）
- ✅ 実装ログ作成完了（本ファイル）
- ✅ 設計書との整合性確認完了
- ✅ 品質ゲート確認完了

## 補足情報

### プロンプト修正の効果予測

**修正前の問題**:
- エージェントが Turn 2 で評価レポートを生成するが、Turn 3 で Write ツールを呼び出さずに終了
- ファイル保存指示が 152 行目（プロンプトの最後から 11 行目）に埋もれていた

**修正後の期待動作**:
- エージェントが「最終ステップ」セクションを認識し、ステップバイステップでファイル保存を実行
- Write ツール使用が明示されているため、正しいツールを呼び出す
- 保存必須の強調により、ファイル保存を後回しにしない

**検証方法**（Phase 6 で実施）:
1. エージェントログで「最終ステップ」または「ステップ1/2/3」への言及を確認
2. エージェントログで Write ツール呼び出しを確認
3. evaluation_report.md の作成を確認
4. 3回連続実行で 100% の成功率を確認

### デバッグログの活用方法

**ログ出力例**（正常動作時）:
```
[INFO] Phase evaluation: Starting agent execution with maxTurns=50
[INFO] Expected output file: /path/to/.ai-workflow/issue-5/09_evaluation/output/evaluation_report.md
[INFO] Phase evaluation: Agent execution completed
[INFO] Checking for output file existence: /path/to/.ai-workflow/issue-5/09_evaluation/output/evaluation_report.md
[INFO] 評価判定: PASS
```

**ログ出力例**（ファイル保存失敗時）:
```
[INFO] Phase evaluation: Starting agent execution with maxTurns=50
[INFO] Expected output file: /path/to/.ai-workflow/issue-5/09_evaluation/output/evaluation_report.md
[INFO] Phase evaluation: Agent execution completed
[INFO] Checking for output file existence: /path/to/.ai-workflow/issue-5/09_evaluation/output/evaluation_report.md
[ERROR] Phase evaluation: Output file not found: /path/to/.ai-workflow/issue-5/09_evaluation/output/evaluation_report.md
[ERROR] Agent may not have called Write tool
[ERROR] Agent log path: /path/to/.ai-workflow/issue-5/09_evaluation/execute/agent_log.md (exists: true)
```

**トラブルシューティング手順**:
1. エラーログで `[ERROR] Agent may not have called Write tool` を確認
2. エージェントログ（agent_log.md）を開く
3. Write ツール呼び出しの有無を確認
4. プロンプトの「最終ステップ」セクションへの言及を確認
5. 必要に応じてプロンプトを再調整

---

**実装者**: Claude (AI Workflow Orchestrator)
**実装日**: 2025-01-20
**対象 Issue**: #5 - Evaluation Phase: 評価レポートファイルが作成されない問題の調査と修正
**実装戦略**: EXTEND（既存コードの拡張）
**実装フェーズ**: Phase 4 (Implementation)
