# テストシナリオ - Issue #212

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### テスト戦略: UNIT_INTEGRATION

**判断根拠**（Planning Phase より）:
- **ユニットテスト（UNIT）**: CLI引数解析、バリデーション、フェーズ範囲解析のロジック
- **インテグレーションテスト（INTEGRATION）**: ファイルシステム操作、Git統合、Report Phase互換性
- **BDDテスト不要**: 開発者・運用者向けCLIコマンドのため、ユーザーストーリーベースのテストは不要

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**（Phase 2で決定）

### テスト対象の範囲
1. **新規コマンドハンドラ**: `src/commands/cleanup.ts`
   - CLI引数解析（`handleCleanupCommand`）
   - バリデーション（`validateCleanupOptions`）
   - フェーズ範囲解析（`parsePhaseRange`）
   - クリーンアップ実行（`executeCleanup`）
   - ドライランプレビュー（`previewCleanup`）

2. **既存コード拡張**: `src/phases/cleanup/artifact-cleaner.ts`
   - `cleanupWorkflowLogs(phaseRange?: PhaseName[])`のフェーズ範囲指定対応

3. **統合ポイント**:
   - CLIコマンド → ArtifactCleaner → ファイルシステム
   - CLIコマンド → GitManager → Git操作
   - Report Phase → ArtifactCleaner（後方互換性）

### テストの目的
1. **正確性**: CLI引数が正しく解析され、期待通りのクリーンアップが実行される
2. **安全性**: パストラバーサル攻撃、シンボリックリンク攻撃が防止される
3. **互換性**: Report Phaseの既存自動クリーンアップが正常に動作し続ける
4. **ユーザビリティ**: エラーメッセージが明確で、ドライランで事前確認できる

---

## 2. Unitテストシナリオ

### 2.1 validateCleanupOptions() - 正常系

#### テストケース: validateCleanupOptions_正常系_基本的なクリーンアップ
- **目的**: Issue番号のみ指定した基本的なバリデーションが成功することを検証
- **前提条件**:
  - `.ai-workflow/issue-123/metadata.json`が存在する
  - Workflow Phase 0-8が完了している
- **入力**:
  ```typescript
  options = { issue: "123" }
  ```
- **期待結果**: 例外がスローされず、バリデーションが成功する
- **テストデータ**:
  ```json
  {
    "issueNumber": 123,
    "phases": {
      "planning": { "status": "completed" },
      "requirements": { "status": "completed" },
      "design": { "status": "completed" },
      "test_scenario": { "status": "completed" },
      "implementation": { "status": "completed" },
      "test_code": { "status": "completed" },
      "test_execution": { "status": "completed" },
      "documentation": { "status": "completed" },
      "report": { "status": "completed" }
    }
  }
  ```

#### テストケース: validateCleanupOptions_正常系_ドライランモード
- **目的**: ドライランオプションのバリデーションが成功することを検証
- **前提条件**: `.ai-workflow/issue-123/metadata.json`が存在する
- **入力**:
  ```typescript
  options = { issue: "123", dryRun: true }
  ```
- **期待結果**: 例外がスローされず、バリデーションが成功する
- **テストデータ**: 上記metadata.json

#### テストケース: validateCleanupOptions_正常系_フェーズ範囲指定
- **目的**: フェーズ範囲指定のバリデーションが成功することを検証
- **前提条件**: `.ai-workflow/issue-123/metadata.json`が存在する
- **入力**:
  ```typescript
  options = { issue: "123", phases: "0-4" }
  ```
- **期待結果**: 例外がスローされず、バリデーションが成功する
- **テストデータ**: 上記metadata.json

#### テストケース: validateCleanupOptions_正常系_完全クリーンアップ（Evaluation完了後）
- **目的**: Evaluation完了後の完全クリーンアップバリデーションが成功することを検証
- **前提条件**:
  - `.ai-workflow/issue-123/metadata.json`が存在する
  - Evaluation Phaseが完了している
- **入力**:
  ```typescript
  options = { issue: "123", all: true }
  ```
- **期待結果**: 例外がスローされず、バリデーションが成功する
- **テストデータ**:
  ```json
  {
    "issueNumber": 123,
    "phases": {
      "planning": { "status": "completed" },
      // ... (Phase 0-8 completed)
      "evaluation": { "status": "completed" }
    }
  }
  ```

---

### 2.2 validateCleanupOptions() - 異常系

#### テストケース: validateCleanupOptions_異常系_Issue番号未指定
- **目的**: Issue番号未指定時にエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  options = {} // issue未指定
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: --issue option is required"
- **テストデータ**: なし

#### テストケース: validateCleanupOptions_異常系_Issue番号が非数値
- **目的**: Issue番号が非数値の場合にエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  options = { issue: "abc" }
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Invalid issue number: abc. Must be a positive integer."
- **テストデータ**: なし

#### テストケース: validateCleanupOptions_異常系_ワークフロー不存在
- **目的**: ワークフローが存在しない場合にエラーがスローされることを検証
- **前提条件**: `.ai-workflow/issue-999/metadata.json`が存在しない
- **入力**:
  ```typescript
  options = { issue: "999" }
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Workflow for issue #999 not found"
- **テストデータ**: なし

#### テストケース: validateCleanupOptions_異常系_無効なフェーズ範囲（範囲外）
- **目的**: フェーズ範囲が0-9の範囲外の場合にエラーがスローされることを検証
- **前提条件**: `.ai-workflow/issue-123/metadata.json`が存在する
- **入力**:
  ```typescript
  options = { issue: "123", phases: "10-12" }
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Invalid phase range: 10-12. Valid range is 0-9"
- **テストデータ**: metadata.json

#### テストケース: validateCleanupOptions_異常系_無効なフェーズ名
- **目的**: 無効なフェーズ名が指定された場合にエラーがスローされることを検証
- **前提条件**: `.ai-workflow/issue-123/metadata.json`が存在する
- **入力**:
  ```typescript
  options = { issue: "123", phases: "invalid_phase,planning" }
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Invalid phase name: invalid_phase"
- **テストデータ**: metadata.json

#### テストケース: validateCleanupOptions_異常系_Evaluation未完了で--all指定
- **目的**: Evaluation未完了時に--allオプションを指定した場合にエラーがスローされることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/metadata.json`が存在する
  - Evaluation Phaseが未完了（`status: "in_progress"`）
- **入力**:
  ```typescript
  options = { issue: "123", all: true }
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: --all option requires Evaluation Phase to be completed. Current status: in_progress"
- **テストデータ**:
  ```json
  {
    "issueNumber": 123,
    "phases": {
      // ... (Phase 0-8 completed)
      "evaluation": { "status": "in_progress" }
    }
  }
  ```

#### テストケース: validateCleanupOptions_異常系_--phasesと--allの同時指定
- **目的**: --phasesと--allを同時に指定した場合にエラーがスローされることを検証
- **前提条件**: `.ai-workflow/issue-123/metadata.json`が存在する
- **入力**:
  ```typescript
  options = { issue: "123", phases: "0-4", all: true }
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Cannot specify both --phases and --all options"
- **テストデータ**: metadata.json

---

### 2.3 parsePhaseRange() - 正常系

#### テストケース: parsePhaseRange_正常系_数値範囲（0-4）
- **目的**: 数値範囲「0-4」が正しくフェーズ名配列に変換されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "0-4"
  ```
- **期待結果**:
  ```typescript
  ['planning', 'requirements', 'design', 'test_scenario', 'implementation']
  ```
- **テストデータ**: なし

#### テストケース: parsePhaseRange_正常系_数値範囲（0-9）
- **目的**: 数値範囲「0-9」が全フェーズ名配列に変換されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "0-9"
  ```
- **期待結果**:
  ```typescript
  ['planning', 'requirements', 'design', 'test_scenario', 'implementation',
   'test_code', 'test_execution', 'documentation', 'report', 'evaluation']
  ```
- **テストデータ**: なし

#### テストケース: parsePhaseRange_正常系_フェーズ名リスト（planning,requirements）
- **目的**: フェーズ名リスト「planning,requirements」が正しく配列に変換されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "planning,requirements"
  ```
- **期待結果**:
  ```typescript
  ['planning', 'requirements']
  ```
- **テストデータ**: なし

#### テストケース: parsePhaseRange_正常系_単一フェーズ（planning）
- **目的**: 単一フェーズ名「planning」が正しく配列に変換されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "planning"
  ```
- **期待結果**:
  ```typescript
  ['planning']
  ```
- **テストデータ**: なし

---

### 2.4 parsePhaseRange() - 異常系

#### テストケース: parsePhaseRange_異常系_無効な範囲（10-12）
- **目的**: 範囲外の数値範囲が指定された場合にエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "10-12"
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Invalid phase range: 10-12. Valid range is 0-9"
- **テストデータ**: なし

#### テストケース: parsePhaseRange_異常系_逆順範囲（4-0）
- **目的**: 逆順の範囲が指定された場合にエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "4-0"
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Invalid phase range: 4-0. Start must be less than or equal to end."
- **テストデータ**: なし

#### テストケース: parsePhaseRange_異常系_無効な形式（abc）
- **目的**: 無効な形式が指定された場合にエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = "abc"
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Invalid phase name: abc"
- **テストデータ**: なし

#### テストケース: parsePhaseRange_異常系_空文字列
- **目的**: 空文字列が指定された場合にエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  rangeStr = ""
  ```
- **期待結果**:
  - 例外がスローされる
  - エラーメッセージ: "Error: Phase range cannot be empty"
- **テストデータ**: なし

---

### 2.5 ArtifactCleaner.cleanupWorkflowLogs() - フェーズ範囲指定（ユニットテスト）

#### テストケース: cleanupWorkflowLogs_正常系_デフォルト動作（フェーズ範囲未指定）
- **目的**: フェーズ範囲未指定時にphases 00-08が削除対象となることを検証
- **前提条件**:
  - `ArtifactCleaner`インスタンスが生成されている
  - ファイルシステム操作はモック化
- **入力**:
  ```typescript
  await artifactCleaner.cleanupWorkflowLogs(); // 引数なし
  ```
- **期待結果**:
  - phases 00-08の`execute/`, `review/`, `revise/`ディレクトリが削除対象としてリストアップされる
  - `metadata.json`, `output/*.md`は削除対象外
- **テストデータ**: なし（モック化）

#### テストケース: cleanupWorkflowLogs_正常系_フェーズ範囲指定（0-4）
- **目的**: フェーズ範囲指定時に指定されたフェーズのみが削除対象となることを検証
- **前提条件**:
  - `ArtifactCleaner`インスタンスが生成されている
  - ファイルシステム操作はモック化
- **入力**:
  ```typescript
  const phaseRange: PhaseName[] = ['planning', 'requirements', 'design', 'test_scenario', 'implementation'];
  await artifactCleaner.cleanupWorkflowLogs(phaseRange);
  ```
- **期待結果**:
  - phases 00-04の`execute/`, `review/`, `revise/`ディレクトリのみが削除対象としてリストアップされる
  - phases 05-09は削除対象外
- **テストデータ**: なし（モック化）

---

### 2.6 previewCleanup() - ドライランモード（ユニットテスト）

#### テストケース: previewCleanup_正常系_基本的なプレビュー
- **目的**: ドライランモードで削除対象ファイルが正しくプレビュー表示されることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/`に複数フェーズのデバッグログが存在する
  - ファイルシステム操作はモック化
- **入力**:
  ```typescript
  options = { issue: "123", dryRun: true }
  ```
- **期待結果**:
  - コンソールに削除対象ファイルのリストが表示される
  - 各ファイルのパスとサイズが表示される
  - 合計ファイル数と合計サイズが表示される
  - 実際のファイル削除は行われない
  - メッセージ例: "Dry run completed. 120 files would be deleted (45.2 MB)"
- **テストデータ**:
  - モックファイルリスト: 120ファイル、合計45.2MB

#### テストケース: previewCleanup_正常系_フェーズ範囲指定のプレビュー
- **目的**: フェーズ範囲指定時のドライランが正しく動作することを検証
- **前提条件**:
  - `.ai-workflow/issue-123/`に複数フェーズのデバッグログが存在する
  - ファイルシステム操作はモック化
- **入力**:
  ```typescript
  options = { issue: "123", dryRun: true, phases: "0-4" }
  ```
- **期待結果**:
  - phases 00-04の削除対象ファイルのみが表示される
  - phases 05-09のファイルは表示されない
  - メッセージ例: "Dry run completed. 60 files would be deleted (22.5 MB) from phases 0-4"
- **テストデータ**:
  - モックファイルリスト: 60ファイル（phases 00-04のみ）、合計22.5MB

---

## 3. Integrationテストシナリオ

### 3.1 基本的なクリーンアップコマンド（cleanup --issue <NUM>）

#### シナリオ名: 基本的なクリーンアップ実行
- **目的**: CLI経由でクリーンアップコマンドを実行し、ファイルが削除され、Gitコミット＆プッシュが実行されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - phases 00-08のデバッグログ（`execute/`, `review/`, `revise/`）が存在する
  - `metadata.json`, `output/*.md`が存在する
  - Gitリモートリポジトリが設定されている
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123`
  2. ファイルシステムを確認
  3. Git履歴を確認
- **期待結果**:
  - phases 00-08の`execute/`, `review/`, `revise/`ディレクトリが削除される
  - `metadata.json`, `output/*.md`は保持される
  - Gitコミットが作成される（コミットメッセージ: `[ai-workflow] Clean up workflow execution logs (manual cleanup)`）
  - リモートリポジトリにプッシュされる
  - コンソールに成功メッセージが表示される: "Workflow logs cleaned up successfully"
- **確認項目**:
  - [ ] phases 00-08の`execute/`, `review/`, `revise/`ディレクトリが存在しない
  - [ ] `metadata.json`が保持されている
  - [ ] `output/planning.md`等が保持されている
  - [ ] Gitコミットが作成されている
  - [ ] リモートにプッシュされている
  - [ ] 成功メッセージが表示されている

---

### 3.2 ドライランモード（cleanup --issue <NUM> --dry-run）

#### シナリオ名: ドライランによる削除対象プレビュー
- **目的**: ドライランモードで削除対象ファイルのプレビューが表示され、実際の削除は行われないことを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - phases 00-08のデバッグログが存在する（合計約100ファイル、40MB）
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123 --dry-run`
  2. コンソール出力を確認
  3. ファイルシステムを確認
  4. Git履歴を確認
- **期待結果**:
  - コンソールに削除対象ファイルのリストが表示される
  - ファイルパス、サイズ、削除対象数が表示される
  - 実際のファイル削除は行われない
  - Gitコミットは作成されない
  - メッセージ例: "Dry run completed. 100 files would be deleted (40.0 MB)"
- **確認項目**:
  - [ ] 削除対象ファイルのリストが表示されている
  - [ ] phases 00-08の`execute/`, `review/`, `revise/`ディレクトリが存在している（削除されていない）
  - [ ] Gitコミットが作成されていない
  - [ ] ドライラン完了メッセージが表示されている

---

### 3.3 部分クリーンアップ（cleanup --issue <NUM> --phases 0-4）

#### シナリオ名: フェーズ範囲指定によるクリーンアップ
- **目的**: フェーズ範囲指定時に指定されたフェーズのみが削除され、他のフェーズは保持されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - phases 00-09のデバッグログが存在する
  - Gitリモートリポジトリが設定されている
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123 --phases 0-4`
  2. ファイルシステムを確認
  3. Git履歴を確認
- **期待結果**:
  - phases 00-04の`execute/`, `review/`, `revise/`ディレクトリのみが削除される
  - phases 05-09のデバッグログは保持される
  - `metadata.json`, `output/*.md`は保持される
  - Gitコミット＆プッシュが実行される
  - 成功メッセージに削除対象フェーズが表示される: "Cleaned up phases 0-4 successfully"
- **確認項目**:
  - [ ] phases 00-04の`execute/`, `review/`, `revise/`ディレクトリが存在しない
  - [ ] phases 05-09の`execute/`, `review/`, `revise/`ディレクトリが存在する
  - [ ] `metadata.json`が保持されている
  - [ ] Gitコミットが作成されている
  - [ ] 成功メッセージに「phases 0-4」が表示されている

---

### 3.4 部分クリーンアップ（cleanup --issue <NUM> --phases planning,requirements）

#### シナリオ名: フェーズ名指定によるクリーンアップ
- **目的**: フェーズ名リスト指定時に指定されたフェーズのみが削除されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - phases 00-09のデバッグログが存在する
  - Gitリモートリポジトリが設定されている
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123 --phases planning,requirements`
  2. ファイルシステムを確認
  3. Git履歴を確認
- **期待結果**:
  - Phase 0 (planning), Phase 1 (requirements) のデバッグログのみが削除される
  - 他のフェーズ（02-09）は保持される
  - Gitコミット＆プッシュが実行される
- **確認項目**:
  - [ ] Phase 0, 1の`execute/`, `review/`, `revise/`ディレクトリが存在しない
  - [ ] Phases 02-09のデバッグログが存在する
  - [ ] Gitコミットが作成されている

---

### 3.5 完全クリーンアップ（cleanup --issue <NUM> --all）

#### シナリオ名: Evaluation完了後の完全クリーンアップ
- **目的**: Evaluation Phase完了後、--allオプションで`.ai-workflow/issue-<NUM>/`ディレクトリ全体が削除されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - `metadata.json`のEvaluation Phaseが完了している（`status: "completed"`）
  - CI環境ではない（`process.env.CI !== 'true'`）→ 確認プロンプトが表示される
  - Gitリモートリポジトリが設定されている
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123 --all`
  2. 確認プロンプトで「y」を入力
  3. ファイルシステムを確認
  4. Git履歴を確認
- **期待結果**:
  - 確認プロンプトが表示される: "This will delete all workflow artifacts for issue #123. Continue? (y/N):"
  - `.ai-workflow/issue-123/`ディレクトリ全体が削除される
  - Gitコミットが作成される（コミットメッセージ: `[ai-workflow] Clean up all workflow artifacts`）
  - リモートリポジトリにプッシュされる
- **確認項目**:
  - [ ] 確認プロンプトが表示されている
  - [ ] `.ai-workflow/issue-123/`ディレクトリが存在しない
  - [ ] Gitコミットが作成されている（コミットメッセージ確認）
  - [ ] リモートにプッシュされている

---

### 3.6 完全クリーンアップ（CI環境での自動承認）

#### シナリオ名: CI環境での完全クリーンアップ（自動承認）
- **目的**: CI環境では確認プロンプトが表示されず、自動的にクリーンアップが実行されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - `metadata.json`のEvaluation Phaseが完了している
  - CI環境（`process.env.CI === 'true'`）
  - Gitリモートリポジトリが設定されている
- **テスト手順**:
  1. 環境変数設定: `export CI=true`
  2. コマンド実行: `node dist/index.js cleanup --issue 123 --all`
  3. ファイルシステムを確認
  4. Git履歴を確認
- **期待結果**:
  - 確認プロンプトは表示されない（自動承認）
  - `.ai-workflow/issue-123/`ディレクトリ全体が削除される
  - Gitコミット＆プッシュが実行される
- **確認項目**:
  - [ ] 確認プロンプトが表示されていない
  - [ ] `.ai-workflow/issue-123/`ディレクトリが存在しない
  - [ ] Gitコミットが作成されている
  - [ ] リモートにプッシュされている

---

### 3.7 エラーハンドリング

#### シナリオ名: ワークフロー不存在時のエラーメッセージ表示
- **目的**: ワークフローが存在しない場合、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-999/`ディレクトリが存在しない
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 999`
  2. 終了コードを確認
  3. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "Error: Workflow for issue #999 not found"
  - 終了コード: 1
  - ファイル削除は行われない
- **確認項目**:
  - [ ] エラーメッセージが表示されている
  - [ ] 終了コード1で終了している
  - [ ] ファイル削除が行われていない

#### シナリオ名: 無効なフェーズ範囲のエラーメッセージ表示
- **目的**: 無効なフェーズ範囲が指定された場合、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123 --phases 10-12`
  2. 終了コードを確認
  3. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "Error: Invalid phase range: 10-12. Valid range is 0-9"
  - 終了コード: 1
  - ファイル削除は行われない
- **確認項目**:
  - [ ] エラーメッセージが表示されている
  - [ ] 終了コード1で終了している
  - [ ] ファイル削除が行われていない

#### シナリオ名: Evaluation未完了時の--allオプションエラー
- **目的**: Evaluation未完了時に--allオプションを指定した場合、エラーメッセージが表示されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - `metadata.json`のEvaluation Phaseが未完了（`status: "in_progress"`）
- **テスト手順**:
  1. コマンド実行: `node dist/index.js cleanup --issue 123 --all`
  2. 終了コードを確認
  3. エラーメッセージを確認
- **期待結果**:
  - エラーメッセージが表示される: "Error: --all option requires Evaluation Phase to be completed. Current status: in_progress"
  - 終了コード: 1
  - ファイル削除は行われない
- **確認項目**:
  - [ ] エラーメッセージが表示されている
  - [ ] 終了コード1で終了している
  - [ ] ファイル削除が行われていない

---

### 3.8 Report Phase自動クリーンアップとの互換性

#### シナリオ名: Report Phase完了後の自動クリーンアップ
- **目的**: Report Phase完了後、既存の自動クリーンアップが正常に動作し続けることを検証（後方互換性）
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/`ディレクトリが存在する
  - phases 00-08のデバッグログが存在する
  - Report Phaseが実行可能な状態
  - Gitリモートリポジトリが設定されている
- **テスト手順**:
  1. Report Phaseを実行: `node dist/index.js report --issue 123`
  2. Report Phase完了を待つ
  3. ファイルシステムを確認
  4. Git履歴を確認
- **期待結果**:
  - Report Phase完了後、自動的にクリーンアップが実行される
  - phases 00-08の`execute/`, `review/`, `revise/`ディレクトリが削除される
  - `metadata.json`, `output/*.md`は保持される
  - Gitコミットが作成される（コミットメッセージ: `[ai-workflow] Clean up workflow execution logs`）
  - リモートリポジトリにプッシュされる
- **確認項目**:
  - [ ] Report Phase完了後にクリーンアップが自動実行されている
  - [ ] phases 00-08の`execute/`, `review/`, `revise/`ディレクトリが存在しない
  - [ ] `metadata.json`, `output/*.md`が保持されている
  - [ ] Gitコミットが作成されている（コミットメッセージ確認）
  - [ ] 既存の動作から変更がない（後方互換性）

---

### 3.9 セキュリティテスト

#### シナリオ名: パストラバーサル攻撃の防止
- **目的**: パストラバーサル攻撃（例: `../../etc/passwd`）が防止されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
- **テスト手順**:
  1. Issue番号にパストラバーサルを含む値を指定（モック化）
  2. バリデーションロジックを実行
  3. エラーが発生することを確認
- **期待結果**:
  - バリデーションでエラーがスローされる
  - 不正なパスへのアクセスは拒否される
  - エラーメッセージ: "Error: Invalid workflow path"
- **確認項目**:
  - [ ] パストラバーサル攻撃が防止されている
  - [ ] エラーメッセージが表示されている
  - [ ] 不正なパスへのアクセスが拒否されている

#### シナリオ名: シンボリックリンク攻撃の防止
- **目的**: シンボリックリンクを使用した攻撃が防止されることを検証
- **前提条件**:
  - テスト用リポジトリが初期化されている
  - `.ai-workflow/issue-123/00_planning/execute/`がシンボリックリンク
- **テスト手順**:
  1. シンボリックリンクディレクトリを作成
  2. クリーンアップコマンドを実行
  3. シンボリックリンクが削除されないことを確認
- **期待結果**:
  - シンボリックリンクは削除対象外
  - WARNINGログが出力される: "Skipping symbolic link: .ai-workflow/issue-123/00_planning/execute/"
- **確認項目**:
  - [ ] シンボリックリンクが削除されていない
  - [ ] WARNINGログが出力されている
  - [ ] 他の通常ディレクトリは正常に削除されている

---

## 4. テストデータ

### 4.1 正常データ

#### metadata.json（Phase 0-8完了）
```json
{
  "issueNumber": 123,
  "phases": {
    "planning": { "status": "completed" },
    "requirements": { "status": "completed" },
    "design": { "status": "completed" },
    "test_scenario": { "status": "completed" },
    "implementation": { "status": "completed" },
    "test_code": { "status": "completed" },
    "test_execution": { "status": "completed" },
    "documentation": { "status": "completed" },
    "report": { "status": "completed" }
  }
}
```

#### metadata.json（Evaluation完了）
```json
{
  "issueNumber": 123,
  "phases": {
    "planning": { "status": "completed" },
    "requirements": { "status": "completed" },
    "design": { "status": "completed" },
    "test_scenario": { "status": "completed" },
    "implementation": { "status": "completed" },
    "test_code": { "status": "completed" },
    "test_execution": { "status": "completed" },
    "documentation": { "status": "completed" },
    "report": { "status": "completed" },
    "evaluation": { "status": "completed" }
  }
}
```

#### ディレクトリ構造（テスト用）
```
.ai-workflow/
└── issue-123/
    ├── metadata.json
    ├── 00_planning/
    │   ├── execute/
    │   │   ├── turn-1.json  (10KB)
    │   │   └── turn-2.json  (12KB)
    │   ├── review/
    │   │   └── turn-2-review.json  (5KB)
    │   ├── revise/
    │   │   └── turn-2-revise.json  (5KB)
    │   └── output/
    │       └── planning.md  (15KB)
    ├── 01_requirements/
    │   ├── execute/
    │   │   ├── turn-1.json  (8KB)
    │   │   └── turn-2.json  (10KB)
    │   ├── review/
    │   ├── revise/
    │   └── output/
    │       └── requirements.md  (20KB)
    # ... (phases 02-08 similar structure)
```

### 4.2 異常データ

#### metadata.json（Evaluation未完了）
```json
{
  "issueNumber": 123,
  "phases": {
    "planning": { "status": "completed" },
    "requirements": { "status": "completed" },
    "design": { "status": "completed" },
    "test_scenario": { "status": "completed" },
    "implementation": { "status": "completed" },
    "test_code": { "status": "completed" },
    "test_execution": { "status": "completed" },
    "documentation": { "status": "completed" },
    "report": { "status": "completed" },
    "evaluation": { "status": "in_progress" }  // 未完了
  }
}
```

### 4.3 境界値データ

#### 大量ファイル（パフォーマンステスト用）
- ファイル数: 1000ファイル
- 合計サイズ: 約100MB
- 期待動作: 10秒以内に削除完了

#### 警告閾値テスト
- ファイル数: 1001ファイル
- 期待動作: WARNING表示「Large number of files (1001) will be deleted. This may take some time.」

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

#### ローカル開発環境
- **OS**: Linux、macOS、Windows（WSL推奨）
- **Node.js**: 20.x以上
- **npm**: 10.x以上
- **Git**: 2.x以上

#### CI/CD環境
- **Jenkins**: Jenkinsfileで統合テストを実行
- **環境変数**: `CI=true`が設定されている

### 5.2 必要な外部サービス

#### Gitリモートリポジトリ
- テスト用のリモートリポジトリ（GitHub）
- プッシュ権限が必要

#### ファイルシステム
- 読み書き権限が必要
- テスト用の一時ディレクトリ（`/tmp`等）

### 5.3 モック/スタブの必要性

#### ユニットテスト
- **ファイルシステム操作**: `fs.promises.rm()`, `fs.promises.readdir()`をモック化
- **Git操作**: `GitManager.commitCleanupLogs()`, `GitManager.pushToRemote()`をモック化
- **メタデータ読み込み**: `MetadataManager.loadMetadata()`をモック化

#### インテグレーションテスト
- **モック不使用**: 実際のファイルシステムとGit操作を使用
- **テスト用リポジトリ**: 各テストケースで独立したテスト用ディレクトリを作成

---

## 6. テストカバレッジ目標

### 6.1 ユニットテストカバレッジ
- **目標**: 90%以上
- **重点領域**:
  - `validateCleanupOptions()`: 100%
  - `parsePhaseRange()`: 100%
  - `handleCleanupCommand()`: 90%以上
  - `executeCleanup()`: 90%以上
  - `previewCleanup()`: 90%以上

### 6.2 インテグレーションテストカバレッジ
- **目標**: 主要なシナリオをすべてカバー
- **重点領域**:
  - 基本的なクリーンアップ（必須）
  - ドライランモード（必須）
  - フェーズ範囲指定（必須）
  - 完全クリーンアップ（必須）
  - エラーハンドリング（必須）
  - Report Phase互換性（必須）

---

## 7. 品質ゲート確認

本テストシナリオは、以下の品質ゲートを満たしています：

### ✅ Phase 2の戦略に沿ったテストシナリオである
- **UNIT_INTEGRATION戦略**に基づき、ユニットテストとインテグレーションテストのシナリオを作成
- BDDシナリオは不要（開発者向けCLIコマンドのため）

### ✅ 主要な正常系がカバーされている
- 基本的なクリーンアップ（FR-1）
- ドライランモード（FR-2）
- フェーズ範囲指定（FR-3）
- 完全クリーンアップ（FR-4）
- Report Phase互換性（FR-6）

### ✅ 主要な異常系がカバーされている
- Issue番号未指定・非数値
- ワークフロー不存在
- 無効なフェーズ範囲
- Evaluation未完了時の--all指定
- パストラバーサル攻撃
- シンボリックリンク攻撃

### ✅ 期待結果が明確である
- すべてのテストケースで具体的な期待結果を記載
- 検証可能な確認項目チェックリストを作成
- エラーメッセージ、終了コード、ファイルシステム状態を明確に定義

---

## 8. テスト実施スケジュール

### Phase 5: テストコード実装（2~3時間）
- ユニットテスト実装（1~1.5時間）
- インテグレーションテスト実装（1~1.5時間）

### Phase 6: テスト実行（0.5~1時間）
- ユニットテスト実行（0.25~0.5時間）
- インテグレーションテスト実行（0.25~0.5時間）
- カバレッジ確認（目標: 90%以上）

---

## 9. まとめ

本テストシナリオでは、Issue #212「ワークフローログクリーンアップを独立したコマンドとして実装する」について、以下を明確化しました：

1. **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
2. **ユニットテストシナリオ**: 22個のテストケース（正常系12個、異常系10個）
3. **インテグレーションテストシナリオ**: 9個の主要シナリオ
4. **テストカバレッジ目標**: ユニットテスト90%以上、インテグレーションテスト主要シナリオ100%
5. **品質ゲート**: すべての必須要件を満たしている

**次のフェーズ（Phase 4: Implementation）への準備完了**:
- テストシナリオに基づき、実装を開始できる状態
- テストコード実装（Phase 5）に必要な情報がすべて揃っている
- 品質ゲートを満たしており、クリティカルシンキングレビューをパスできる見込み

---

**作成日**: 2025-12-04
**バージョン**: 1.0
**ステータス**: Ready for Review
