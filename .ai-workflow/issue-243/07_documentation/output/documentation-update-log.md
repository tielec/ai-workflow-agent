# ドキュメント更新レポート

## 更新サマリー

以下のテーブル形式で更新したドキュメントのみをリストアップしてください：

| ファイル | 更新理由 |
|---------|---------|
| `CLAUDE.md` | Issue #243のレビュー結果パースロジック改善（JSON抽出前処理とマーカーパターン優先判定）をコアモジュールセクションに追記 |
| `ARCHITECTURE.md` | content-parser.tsモジュールの説明に、Issue #243で追加された新規メソッド（extractJsonFromResponse, inferDecisionFromText）とLLMレスポンス形式対応の改善を記載 |
