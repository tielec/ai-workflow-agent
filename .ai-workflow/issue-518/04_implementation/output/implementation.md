# 実装完了レポート

## 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `tests/integration/finalize-command.test.ts` | 修正 | finalize 統合テストを ESM 対応の動的モックパターンへ置き換え、モック初期化を統一 |
| `tests/integration/cleanup-command.test.ts` | 修正 | cleanup 統合テストを ESM 安全なモックパターンにリファクタし、モックリセットを標準化 |
| `__mocks__/fs-extra.ts` | 修正 | manual mock に `__esModule` を追加し ESM 互換性を明示 |
| `tests/MOCK_GUIDELINES.md` | 新規 | Jest ESM モックの推奨パターンとアンチパターンをまとめたガイドラインを追加 |

## 主要な変更点
- finalize/cleanup 統合テストの依存モックを `jest.unstable_mockModule` + `beforeAll` 動的インポートに統一し、モックのリセット/初期値もヘルパーで集中管理。
- `MetadataManager` など依存クラスを動的インポートに切り替え、モック済み依存を確実に使用するよう修正。
- `__mocks__/fs-extra.ts` に `__esModule` を付与し、default/named 両対応の ESM 互換 manual mock を提供。
- Jest ESM 向けモックガイドライン文書を追加し、推奨記法とチェックリストを整理。

## テスト実施状況
- ビルド: 未実行（依頼なし）
- リント: 未実行（依頼なし）
- 基本動作確認: `npm test -- tests/integration/finalize-command.test.ts`, `npm test -- tests/integration/cleanup-command.test.ts`
