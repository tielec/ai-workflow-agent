# テスト実行結果

## 再実行結果

### 再実行1: 2025-12-22 13:28:27
- **修正内容**: fs関連のモック整理（fs-extra利用への置換、node:fsモック追加）、auto-issueのリポジトリ解決モック調整、execute系テストのESM対応などを実施。
- **成功**: 1191件
- **失敗**: 406件
- **変更**: 前回415件失敗から減少したものの、fsモック不足とリポジトリ解決モック不備で主要シナリオが依然失敗。
- **主な失敗原因**:
  - auto-issue系: `resolveLocalRepoPathMock` が `jest.fn` にならず `mockReset` 不可。`jest.mock` の定義を`jest.fn()`返却に修正する必要あり。
  - fs依存テスト: `fs.ensureDir`/`remove` 未定義のまま (git-manager-issue16系、metadata-manager-rollback、change-applier等)。対象テストでfs-extraを利用するか、モックを拡充してPromise版の実装を差し込む必要あり。
  - metadata-io/metadata-manager: node:fsモックが`jest.fn`化されておらず `existsSync.mockReturnValue` などが未定義。モックの初期化を見直す必要あり。
  - claude-agent-client: `test-prompt.md` 読み込みで ENOENT。`readFileSync` のモックを固定値返却にするなどでファイル依存を排除する必要あり。

現在も主要テストが環境モック不足で失敗しているため、モック実装とfs依存箇所の整備を優先して修正が必要です。
