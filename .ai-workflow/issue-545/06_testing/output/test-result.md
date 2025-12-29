# テスト実行結果

## テスト結果サマリー
- 総テスト数: 2194件
- 成功: 2193件
- 失敗: 1件
- 成功率: 99.95%

## 条件分岐
以下の形式で失敗したテストの詳細のみを記載します。

### `tests/unit/utils/git-url-utils.test.ts::sanitizeGitUrl パフォーマンステスト（ReDoS脆弱性評価） 通常の入力で1000回実行しても許容範囲内`
- **エラー**: `expect(received).toBeLessThan(expected)` （期待値: < 500, 実測: 5207）
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/utils/git-url-utils.test.ts:391:23)
  ```
  CI環境でのパフォーマンス測定が閾値（500ms）を超過したため失敗しました。
