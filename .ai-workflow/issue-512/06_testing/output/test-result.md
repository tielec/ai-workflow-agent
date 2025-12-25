# テスト失敗による実装修正の必要性

## 修正が必要な理由
- `npm run test:integration` を再実行したが 27/48 スイート（266 テスト）が失敗し、品質ゲートを満たせませんでした。
- `fs` 周りのモック/依存が崩れており、`fs.ensureDir`/`remove`/`emptyDir` 等が未定義のまま呼ばれて多数の TypeError が発生しています（例: `pr-comment-finalize.integration.test.ts`, `multi-repo-workflow.test.ts`, `init-token-sanitization.test.ts`).
- `finalize-command.test.ts` では `jest.mocked(fs.existsSync).mockReturnValue` が関数でなくなり複数ケースが実行できません。
- `claude-agent-client-template.test.ts` はプロンプト用の実ファイルが存在せず ENOENT で落ちています。
- `agent-client-execution.test.ts` でも Codex 実行のモックが十分でなく、ログ出力検証が通っていません。

## 失敗したテスト
- `tests/integration/agent-client-execution.test.ts`: Codex 実行フローで `consoleLogSpy` 未呼び出し。
- `tests/integration/finalize-command.test.ts`: `jest.mocked(fs.existsSync).mockReturnValue` が関数でなく TypeError、多数のシナリオが停止。
- `tests/integration/init-token-sanitization.test.ts`: `fs.ensureDir` が未定義でセットアップ段階から失敗。
- `tests/integration/pr-comment-finalize.integration.test.ts` など: `fs.remove`/`emptyDir` 未定義。
- `tests/integration/claude-agent-client-template.test.ts`: プロンプトファイル欠如による ENOENT。
- その他一部で `fs.ensureDir` 不在やモック不足が原因の類似エラーが多発。

## 必要な実装修正
- 依存モジュールとして `fs-extra` を用いるテストで、インポート/モックを `fs-extra` に揃え、`ensureDir`/`remove`/`emptyDir`/`pathExists` などが利用できるように修正する。
- `finalize-command.test.ts` の `fs` モック方法を見直し、`jest.mocked` が利用できるオブジェクトに切り替える。
- `init-token-sanitization.test.ts` などセットアップで `fs.ensureDir` を呼ぶ箇所は `fs-extra` への置き換え、または適切なモックを追加する。
- `claude-agent-client-template.test.ts` ではテスト用プロンプトファイルを事前に作成するか、`fs.readFileSync` をモックして内容を供給する。
- `agent-client-execution.test.ts` の Codex 実行モックを強化し、`spawn` とログ出力が確実に呼ばれるようイベント・`stdin` のモックを調整する。
