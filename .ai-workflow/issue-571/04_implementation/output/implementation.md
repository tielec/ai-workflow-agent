# 実装ログ (Issue #571)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/types.ts` | 修正 | `Language` 型と `DEFAULT_LANGUAGE` を追加 |
| `src/core/metadata-manager.ts` | 修正 | `getLanguage()` を実装し無効値はデフォルトへフォールバック |
| `src/phases/base-phase.ts` | 修正 | `loadPrompt` を言語別ディレクトリ対応にし、欠損時はデフォルト言語へ警告付きでフォールバック |
| `src/prompts/*/{ja,en}/*.txt` | 追加/移動 | 既存日本語プロンプトを `ja/` に再配置し、英語版を `en/` に追加 |
| `tests/unit/core/metadata-manager-language.test.ts` | 追加 | 言語設定取得の正常系・フォールバックを検証 |
| `tests/unit/phases/base-phase-language-switching.test.ts` | 追加 | `loadPrompt` の言語切替とフォールバック動作を検証 |

## 修正履歴

### 修正1: プロンプトの多言語対応
- **指摘内容**: 言語設定に応じたプロンプト切替が未対応で、フォールバックも不明確だった。
- **修正内容**: 言語型とデフォルト言語を定義し、`MetadataManager.getLanguage()` で無効値を弾くように追加。`BasePhase.loadPrompt` を `{phase}/{language}/{step}.txt` パスへ対応させ、指定言語が無い場合は日本語へ警告付きでフォールバックするように変更。既存プロンプトを `ja/` 配下へ移設し、英語版を新規追加。
- **影響範囲**: `src/types.ts`, `src/core/metadata-manager.ts`, `src/phases/base-phase.ts`, `src/prompts/*/{ja,en}/*.txt`

### 修正2: 言語切替ロジックのテスト追加
- **指摘内容**: 言語設定取得およびプロンプト読み込みのテストが不足していた。
- **修正内容**: `MetadataManager.getLanguage()` の正常系・無効値フォールバックをカバーするユニットテストを追加。`BasePhase.loadPrompt` が英語プロンプトを読めること、存在しない言語指定でデフォルトにフォールバックし警告を出すことを確認するユニットテストを作成。
- **影響範囲**: `tests/unit/core/metadata-manager-language.test.ts`, `tests/unit/phases/base-phase-language-switching.test.ts`

## テスト実施状況
- 自動テスト: 未実行（ローカル依存関係未セットアップのため）
