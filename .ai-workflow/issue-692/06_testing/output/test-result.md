# テスト結果

## 実行日時
2026-02-17 08:56:19 UTC

## 実行コマンド
- `npm run build`
- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`
- `npm run validate`

## 結果サマリー
- `npm run build`: 成功
- `npm run lint`: 成功
- `npm run test:unit`: 成功（Tests: 2144 total / 2143 passed / 1 skipped、Suites: 139 passed）
- `npm run test:integration`: 成功（Tests: 774 total / 752 passed / 22 skipped、Suites: 70 passed / 1 skipped）
- `npm run validate`: 成功（`lint` + `npm test` + `build`）
  - `npm test` 結果: Tests 2920 total / 2897 passed / 23 skipped、Suites 210 passed / 1 skipped

## スキップ事項
- OPENAI_API_KEY 未設定により、一部テストがスキップ

## 失敗したテスト
- なし
