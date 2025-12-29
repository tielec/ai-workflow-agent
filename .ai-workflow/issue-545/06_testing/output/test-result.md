# テスト実行結果

## テスト概要
- `npm test -- tests/unit/utils/git-url-utils.test.ts`: PASS（スイート1/1、テスト29/29、所要0.704s）。ReDoS性能: 大量@入力1ms、通常入力1000回64ms。
- `npm test`: PASS（スイート144/146中144パス・2スキップ、テスト2194/2266パス・72スキップ、所要504.703s）。終了時に未解放ハンドル警告のみで失敗なし。

## 主な確認ポイント
- sanitizeGitUrlの性能テストが500ms閾値内で全てPASS。
- report-cleanup/migrate-sanitize-tokensのファイルI/O系テストはタイムアウト拡張後も完走し、フルスイートで失敗なし。
