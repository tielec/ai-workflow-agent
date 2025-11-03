# テストコード実装ログ

## 実装サマリー
- テスト戦略: UNIT_INTEGRATION
- テストファイル数: 3個
- テストケース数: 14個

## テストファイル一覧

### 新規作成
- `tests/unit/github/issue-ai-generator.test.ts`: IssueAIGenerator の成功・リトライ・バリデーション・サニタイズロジックを網羅
- `tests/unit/github/issue-client-llm.test.ts`: IssueClient が LLM 成功・フォールバック・無効化を扱うシナリオを検証
- `tests/integration/followup-issue-llm.test.ts`: IssueClient と IssueAIGenerator の統合動作を成功/フォールバックで確認

### 既存修正
- `tests/unit/secret-masker.test.ts`: maskObject の再帰マスキング挙動を追加検証

## テストケース詳細

### ファイル: tests/unit/github/issue-ai-generator.test.ts
- **issue_ai_generator_generate_success_正常系**: LLM 正常応答時のタイトル・本文・メタデータ採用を確認
- **issue_ai_generator_generate_retry_success_正常系**: 一時失敗後のリトライ成功と retryCount を検証
- **issue_ai_generator_generate_invalid_json_異常系**: 非 JSON 応答での IssueAIValidationError を検証
- **issue_ai_generator_generate_missing_sections_異常系**: セクション欠落時のバリデーションエラーを検証
- **issue_ai_generator_sanitize_payload_boundary_境界値**: タスク優先度ソート・文字数制限・マスキングを確認
- **availability_checks**: isAvailable の有効/無効判定を確認

### ファイル: tests/unit/github/issue-client-llm.test.ts
- **issue_client_create_issue_llm_success_正常系**: LLM 結果採用とメタデータ追記を検証
- **issue_client_create_issue_llm_fallback_異常系**: LLM 失敗時の WARN ログとレガシー本文へのフォールバックを確認
- **issue_client_create_issue_llm_disabled_境界値**: LLM 無効設定時に既存テンプレ挙動を維持することを確認

### ファイル: tests/unit/secret-masker.test.ts
- **secret_masker_mask_object_正常系**: 再帰マスキングが循環参照を保持しつつシークレットとトークンを置換することを確認

### ファイル: tests/integration/followup-issue-llm.test.ts
- **applies LLM output and appends metadata when generation succeeds**: IssueClient が IssueAIGenerator の成功結果を採用し、メタデータ節を追加する統合挙動を検証
- **falls back to legacy template when LLM generation fails**: LLM 例外発生時に遅延リトライ後レガシーテンプレートへフォールバックする統合挙動を確認

## 次のステップ
- Phase 6でテストを実行
