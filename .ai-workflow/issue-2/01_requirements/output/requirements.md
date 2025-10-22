# 要件定義書 - Issue #2

## 0. Planning Document の確認

Planning Phase で策定された開発計画を確認しました：

- **実装戦略**: EXTEND（既存クラスの拡張中心）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **複雑度**: 中程度
- **見積もり工数**: 8~12時間
- **リスク評価**: 低

Planning Document で定義された戦略を踏まえ、以下の要件定義を実施します。特に、Report Phase の既存クリーンアップ機能（`cleanupWorkflowLogs()`）の設計パターンを踏襲し、後方互換性を維持しつつ、オプション機能として実装します。

---

## 1. 概要

### 背景

現在の AI Workflow では、Report Phase (Phase 8) 完了後に `cleanupWorkflowLogs()` が実行され、デバッグログ（`execute/`, `review/`, `revise/` ディレクトリ）を削除することで、約 70% のリポジトリサイズ削減を実現しています。

しかし、Evaluation Phase (Phase 9) が完了し、ワークフロー全体が正常に終了した後も、`.ai-workflow/issue-*` ディレクトリ全体（`metadata.json`、各フェーズの `output/*.md` ファイル、`00_planning/` ディレクトリ全体）が残り続けます。

PR がマージされた後、これらの成果物が不要になるケースがあり、特に Jenkins CI/CD 環境でのリソース管理において、オプションでクリーンアップできる機能が求められています。

### 目的

Evaluation Phase (Phase 9) 完了後に、オプションで `.ai-workflow/issue-*` ディレクトリ全体を削除する機能を実装し、CI/CD パイプラインでのストレージリソース管理を効率化します。

### ビジネス価値

- **リソース効率化**: Jenkins ワークスペースのディスク使用量を削減
- **自動化の促進**: PR マージ後の手動クリーンアップ作業を自動化
- **柔軟性の向上**: 成果物保持が必要なケースとの使い分けが可能

### 技術的価値

- **既存設計パターンの踏襲**: Report Phase のクリーンアップ機能と同様のアプローチにより、実装の一貫性を保持
- **後方互換性の維持**: オプション機能として実装し、既存ワークフローに影響を与えない
- **エラーハンドリングの堅牢性**: クリーンアップ失敗時もワークフロー全体は成功として扱う

---

## 2. 機能要件

### FR-1: CLI オプションの追加（優先度: 高）

**要件**: Evaluation Phase 実行時に、クリーンアップを制御する CLI オプションを追加する。

**詳細**:
- `--cleanup-on-complete`: Evaluation Phase 完了後に `.ai-workflow/issue-*` ディレクトリを削除
- `--cleanup-on-complete-force`: 削除前の確認プロンプトをスキップ（CI 環境用）

**受け入れ基準**:
- Given: `--cleanup-on-complete` オプションが指定されている
- When: `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
- Then: Evaluation Phase 完了後にクリーンアップが実行される

### FR-2: クリーンアップメソッドの実装（優先度: 高）

**要件**: `.ai-workflow/issue-*` ディレクトリ全体を削除するメソッドを実装する。

**詳細**:
- メソッド名: `cleanupWorkflowArtifacts()`
- 実装場所: `src/phases/base-phase.ts` または `src/phases/evaluation.ts`
- 削除対象: `.ai-workflow/issue-<NUM>/` ディレクトリ全体
- 削除方法: `fs-extra.removeSync()` を使用

**受け入れ基準**:
- Given: `.ai-workflow/issue-123/` ディレクトリが存在する
- When: `cleanupWorkflowArtifacts()` メソッドを呼び出す
- Then: ディレクトリ全体が削除される
- And: INFO レベルのログメッセージが出力される

### FR-3: 削除前の確認プロンプト（優先度: 中）

**要件**: 対話的環境（ローカル開発）では、削除前に確認プロンプトを表示する。

**詳細**:
- 環境判定: 環境変数 `CI` の有無で CI 環境を判定
- 対話的環境: 削除前に警告メッセージを表示し、ユーザー確認を求める
- CI 環境: 確認プロンプトを自動的にスキップ
- `--cleanup-on-complete-force` フラグ: 明示的に確認をスキップ

**受け入れ基準**:
- Given: ローカル開発環境（`CI` 環境変数が未設定）
- And: `--cleanup-on-complete` オプションが指定されている
- And: `--cleanup-on-complete-force` オプションが指定されていない
- When: クリーンアップ実行前
- Then: 警告メッセージが表示される
- And: ユーザー確認を求める

**受け入れ基準（CI 環境）**:
- Given: CI 環境（`CI=true`）
- And: `--cleanup-on-complete` オプションが指定されている
- When: クリーンアップ実行前
- Then: 確認プロンプトなしで削除が実行される

### FR-4: Git コミット & プッシュの自動実行（優先度: 高）

**要件**: クリーンアップ実行後、削除を Git コミットし、リモートにプッシュする。

**詳細**:
- コミットメッセージ: `chore: cleanup workflow artifacts for issue #<NUM>`
- 実行タイミング: クリーンアップ直後
- Git 操作: 既存の `GitManager` を使用（`commit()`, `push()` メソッド）

**受け入れ基準**:
- Given: クリーンアップが正常に完了した
- When: Git コミット & プッシュを実行
- Then: `.ai-workflow/issue-123/` の削除が Git コミットされる
- And: コミットメッセージが `chore: cleanup workflow artifacts for issue #123` である
- And: リモートリポジトリにプッシュされる

### FR-5: エラーハンドリング（優先度: 高）

**要件**: クリーンアップ失敗時もワークフロー全体は成功として扱う。

**詳細**:
- エラー発生時: ERROR レベルのログを出力
- ワークフロー継続: クリーンアップ失敗でもフェーズ全体は `completed` ステータスとする
- エラーケース:
  - ディレクトリが存在しない
  - 削除権限がない
  - ファイルシステムエラー

**受け入れ基準**:
- Given: `.ai-workflow/issue-123/` ディレクトリが存在しない
- When: `cleanupWorkflowArtifacts()` メソッドを呼び出す
- Then: ERROR レベルのログメッセージが出力される
- And: Evaluation Phase のステータスは `completed` のまま

**受け入れ基準（削除権限なし）**:
- Given: `.ai-workflow/issue-123/` ディレクトリへの削除権限がない
- When: `cleanupWorkflowArtifacts()` メソッドを呼び出す
- Then: ERROR レベルのログメッセージが出力される
- And: Evaluation Phase のステータスは `completed` のまま

### FR-6: Evaluation Phase への統合（優先度: 高）

**要件**: Evaluation Phase の `run()` メソッド内で、フェーズ完了後にクリーンアップを実行する。

**詳細**:
- 実行タイミング: Evaluation Phase のステータスが `completed` になった直後
- 実行条件: `--cleanup-on-complete` オプションが指定されている場合のみ
- 実装ファイル: `src/phases/evaluation.ts`

**受け入れ基準**:
- Given: `--cleanup-on-complete` オプションが指定されている
- And: Evaluation Phase が正常に完了した
- When: Evaluation Phase の `run()` メソッドが終了する
- Then: `cleanupWorkflowArtifacts()` メソッドが呼び出される
- And: `.ai-workflow/issue-*` ディレクトリが削除される

### FR-7: ログ出力（優先度: 中）

**要件**: クリーンアップ実行時に適切なレベルのログメッセージを出力する。

**詳細**:
- INFO レベル: クリーンアップ開始・完了メッセージ
- WARNING レベル: 削除前の警告メッセージ（対話的環境）
- ERROR レベル: クリーンアップ失敗時のエラーメッセージ

**ログメッセージ例**:
```
[INFO] Deleting workflow artifacts: .ai-workflow/issue-123
[OK] Workflow artifacts deleted successfully.
[WARNING] About to delete workflow directory: .ai-workflow/issue-123
[WARNING] This action cannot be undone.
[ERROR] Failed to delete workflow artifacts: EACCES: permission denied
```

**受け入れ基準**:
- Given: クリーンアップが実行される
- When: 各段階でログメッセージが出力される
- Then: INFO/WARNING/ERROR レベルのログが適切に表示される

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- ディレクトリ削除処理は、通常のワークフローディレクトリサイズ（数 MB 〜 数十 MB）に対して、5 秒以内に完了すること
- クリーンアップ処理が Evaluation Phase 全体の実行時間に対して 10% 以上の影響を与えないこと

### NFR-2: 信頼性要件

- クリーンアップ失敗時も、Evaluation Phase 全体は成功ステータスを維持すること
- Git コミット & プッシュの失敗時は、適切なエラーログを出力し、ユーザーに通知すること
- ファイルシステムエラー（権限不足、ディスク容量不足）に対して、適切なエラーハンドリングを実施すること

### NFR-3: 保守性要件

- Report Phase の `cleanupWorkflowLogs()` と同様の実装パターンを採用し、コードの一貫性を保つこと
- メソッド名、ログメッセージ形式、エラーハンドリング戦略を統一すること
- 将来的に他のフェーズでも同様のクリーンアップ機能を追加できるよう、汎用的な設計とすること

### NFR-4: 拡張性要件

- 削除対象ディレクトリを柔軟に指定できるよう、メソッドの引数設計を考慮すること
- 将来的に「特定のファイルのみ保護」「条件付き削除」などの拡張要件に対応できる設計とすること

### NFR-5: セキュリティ要件

- 削除対象ディレクトリのパスを検証し、意図しないディレクトリの削除を防止すること
- `.ai-workflow/issue-*` 形式以外のパスが指定された場合は、エラーを返すこと
- シンボリックリンク攻撃（symlink attack）に対する防御を実施すること

### NFR-6: ユーザビリティ要件

- 対話的環境では、削除前に明確な警告メッセージを表示すること
- ログメッセージは、削除対象のパスと削除理由を明示すること
- エラーメッセージは、原因と対処方法を含むこと

---

## 4. 制約事項

### 技術的制約

1. **既存の依存関係を使用**:
   - `fs-extra` … ファイルシステム操作
   - `simple-git` … Git 操作
   - `commander` … CLI オプション定義
   - 新規の npm パッケージ追加は不要

2. **既存の GitManager / MetadataManager を活用**:
   - 新規の抽象化レイヤーは作成しない
   - 既存の API（`commit()`, `push()`, `getWorkflowDir()`）を利用

3. **TypeScript コーディング規約に準拠**:
   - ESLint ルールに従う
   - 型安全性を保つ（`any` 型の使用を最小化）

4. **Node.js 20 以上のサポート**:
   - ES2022 の機能を使用可能
   - `fs-extra` の同期 API（`removeSync()`）を使用

### リソース制約

1. **見積もり工数**: 8~12 時間（Planning Document より）
2. **実装優先度**: Medium（既存機能の拡張であり、緊急性は低い）
3. **レビュー体制**: 自己レビュー + 自動テスト

### ポリシー制約

1. **後方互換性の維持**:
   - `--cleanup-on-complete` オプションは完全にオプショナル
   - デフォルト動作は変更しない（従来通り成果物を保持）
   - 既存のワークフローに影響を与えない

2. **Git コミットポリシー**:
   - コミットメッセージは Conventional Commits 形式（`chore:` プレフィックス）
   - 自動コミットは `GIT_COMMIT_USER_NAME` / `GIT_COMMIT_USER_EMAIL` を使用

3. **ログ出力ポリシー**:
   - INFO/WARNING/ERROR レベルを適切に使い分ける
   - 機密情報（API キー、トークンなど）をログに出力しない

---

## 5. 前提条件

### システム環境

1. **Node.js**: 20 以上
2. **npm**: 10 以上
3. **Git**: 2.x 以上
4. **OS**: Linux / macOS / Windows（Jenkins Docker 環境を含む）

### 依存コンポーネント

1. **既存モジュール**:
   - `src/main.ts` … CLI エントリーポイント
   - `src/phases/base-phase.ts` … フェーズ基底クラス
   - `src/phases/evaluation.ts` … Evaluation Phase 実装
   - `src/core/git-manager.ts` … Git 操作
   - `src/core/metadata-manager.ts` … メタデータ管理

2. **npm パッケージ**:
   - `fs-extra` … ファイルシステム操作
   - `simple-git` … Git 操作
   - `commander` … CLI オプション解析

### 外部システム連携

1. **GitHub**:
   - Git リモートリポジトリ（プッシュ先）
   - `GITHUB_TOKEN` 環境変数が設定されていること

2. **Jenkins CI/CD**:
   - Docker コンテナ内で実行
   - 環境変数 `CI=true` が設定されていること
   - ワークスペースへの書き込み権限があること

---

## 6. 受け入れ基準

### AC-1: CLI オプションの動作確認

**シナリオ**: `--cleanup-on-complete` オプション指定時にクリーンアップが実行される

- Given: Issue #123 のワークフローが Evaluation Phase まで完了している
- And: `.ai-workflow/issue-123/` ディレクトリが存在する
- When: `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
- Then: Evaluation Phase が正常に完了する
- And: `.ai-workflow/issue-123/` ディレクトリが削除される
- And: Git コミットが作成される（コミットメッセージ: `chore: cleanup workflow artifacts for issue #123`）
- And: リモートリポジトリにプッシュされる

### AC-2: デフォルト動作の確認

**シナリオ**: オプション未指定時は成果物を保持する

- Given: Issue #123 のワークフローが Evaluation Phase まで完了している
- And: `.ai-workflow/issue-123/` ディレクトリが存在する
- When: `node dist/index.js execute --issue 123 --phase evaluation` を実行（オプションなし）
- Then: Evaluation Phase が正常に完了する
- And: `.ai-workflow/issue-123/` ディレクトリが保持される（削除されない）

### AC-3: 確認プロンプトの動作確認（対話的環境）

**シナリオ**: ローカル開発環境では削除前に確認プロンプトを表示

- Given: ローカル開発環境（`CI` 環境変数が未設定）
- And: `--cleanup-on-complete` オプションが指定されている
- And: `--cleanup-on-complete-force` オプションが指定されていない
- When: クリーンアップ実行前
- Then: 以下の警告メッセージが表示される:
  ```
  [WARNING] About to delete workflow directory: .ai-workflow/issue-123
  [WARNING] This action cannot be undone.
  ```
- And: ユーザー確認を求める（"Proceed? (yes/no)"）

### AC-4: 確認プロンプトのスキップ（CI 環境）

**シナリオ**: CI 環境では確認プロンプトなしで削除

- Given: CI 環境（`CI=true`）
- And: `--cleanup-on-complete` オプションが指定されている
- When: クリーンアップ実行
- Then: 確認プロンプトなしで削除が実行される
- And: INFO レベルのログメッセージが出力される

### AC-5: 確認プロンプトのスキップ（force フラグ）

**シナリオ**: `--cleanup-on-complete-force` オプションで確認をスキップ

- Given: ローカル開発環境（`CI` 環境変数が未設定）
- And: `--cleanup-on-complete-force` オプションが指定されている
- When: クリーンアップ実行
- Then: 確認プロンプトなしで削除が実行される

### AC-6: エラーハンドリング（ディレクトリ不在）

**シナリオ**: 削除対象ディレクトリが存在しない場合

- Given: `.ai-workflow/issue-123/` ディレクトリが存在しない
- When: `cleanupWorkflowArtifacts()` メソッドを呼び出す
- Then: ERROR レベルのログメッセージが出力される
- And: Evaluation Phase のステータスは `completed` のまま（失敗しない）
- And: ワークフロー全体は成功として扱われる

### AC-7: エラーハンドリング（削除権限なし）

**シナリオ**: 削除権限がない場合

- Given: `.ai-workflow/issue-123/` ディレクトリへの削除権限がない
- When: `cleanupWorkflowArtifacts()` メソッドを呼び出す
- Then: ERROR レベルのログメッセージが出力される（例: "EACCES: permission denied"）
- And: Evaluation Phase のステータスは `completed` のまま
- And: ワークフロー全体は成功として扱われる

### AC-8: Git コミット & プッシュの成功

**シナリオ**: クリーンアップ後に Git 操作が成功する

- Given: クリーンアップが正常に完了した
- When: Git コミット & プッシュを実行
- Then: コミットメッセージが `chore: cleanup workflow artifacts for issue #123` である
- And: リモートリポジトリにプッシュされる
- And: Git ログに削除コミットが記録される

### AC-9: ログ出力の確認

**シナリオ**: 適切なレベルのログメッセージが出力される

- Given: クリーンアップが実行される
- When: 各段階でログメッセージが出力される
- Then: 以下のログメッセージが表示される:
  - INFO: `[INFO] Deleting workflow artifacts: .ai-workflow/issue-123`
  - INFO: `[OK] Workflow artifacts deleted successfully.`
- And: エラー発生時は ERROR レベルのログが表示される

### AC-10: 全フェーズ実行時の動作確認

**シナリオ**: `--phase all` でも動作する

- Given: `--phase all --cleanup-on-complete` オプションが指定されている
- When: すべてのフェーズを実行
- Then: Evaluation Phase 完了後にクリーンアップが実行される
- And: `.ai-workflow/issue-123/` ディレクトリが削除される

---

## 7. スコープ外

### 明確にスコープ外とする事項

1. **特定ファイルの保護機能**:
   - 「metadata.json のみ保持」「output/*.md のみ保持」などの選択的削除機能は本 Issue のスコープ外
   - 将来的な拡張として検討可能

2. **他のフェーズでのクリーンアップ**:
   - Evaluation Phase 以外（Planning、Implementation など）でのクリーンアップ機能は対象外
   - 必要に応じて別 Issue で対応

3. **リモートリポジトリのクリーンアップ**:
   - GitHub リポジトリ上の `.ai-workflow/issue-*` ディレクトリの削除は本 Issue のスコープ外
   - Git コミット & プッシュまでが対象

4. **UI/GUI での操作**:
   - CLI オプションのみをサポート
   - Web UI やダッシュボードでの操作は対象外

5. **クリーンアップのスケジュール実行**:
   - Cron ジョブや定期実行機能は対象外
   - 手動実行または CI/CD パイプラインでの実行のみサポート

6. **削除済みディレクトリの復元機能**:
   - 削除後のロールバック機能は提供しない
   - ユーザーは Git 履歴から復元する必要がある

### 将来的な拡張候補

1. **選択的クリーンアップ**:
   - `--cleanup-keep-metadata` … metadata.json のみ保持
   - `--cleanup-keep-output` … output/*.md のみ保持

2. **他のフェーズへの適用**:
   - `--cleanup-after-report` … Report Phase 完了後にクリーンアップ
   - `--cleanup-on-failure` … フェーズ失敗時にクリーンアップ

3. **クリーンアップポリシーの設定ファイル化**:
   - `.ai-workflow-config.json` でクリーンアップルールを定義

4. **削除前のアーカイブ機能**:
   - クリーンアップ前に `.ai-workflow/issue-*/` を ZIP 圧縮してアーカイブ

---

## 補足情報

### Report Phase クリーンアップとの違い

| 項目 | Report Phase (Phase 8) | Evaluation Phase (Phase 9) |
|------|------------------------|----------------------------|
| **削除対象** | デバッグログ（`execute/`, `review/`, `revise/`） | ワークフロー全体（`.ai-workflow/issue-<NUM>/`） |
| **削除範囲** | Phase 01-08 のログディレクトリ | ディレクトリ全体（`metadata.json`, `output/*.md` 含む） |
| **実行タイミング** | Report Phase 完了時（常に実行） | Evaluation Phase 完了時（オプション指定時のみ） |
| **目的** | PR レビューの負荷軽減（約 70% 削減） | ワークフロー完了後のクリーンアップ（完全削除） |
| **保護対象** | `00_planning/`, `metadata.json`, `output/*.md` | なし（全て削除） |
| **実行条件** | 自動実行 | `--cleanup-on-complete` オプション指定時 |

### 実装参考: Report Phase のクリーンアップ

Report Phase の既存実装（`src/phases/report.ts`）を参考に、以下のパターンを踏襲します：

```typescript
protected async cleanupWorkflowLogs(): Promise<void> {
  const workflowDir = this.metadata.workflowDir;
  const phasesToCleanup = ['01_requirements', '02_design', '03_test_scenario',
                          '04_implementation', '05_test_implementation',
                          '06_testing', '07_documentation', '08_report'];

  for (const phase of phasesToCleanup) {
    const phaseDir = path.join(workflowDir, phase);
    for (const subdir of ['execute', 'review', 'revise']) {
      const targetDir = path.join(phaseDir, subdir);
      if (fs.existsSync(targetDir)) {
        fs.removeSync(targetDir);
      }
    }
  }
}
```

Evaluation Phase のクリーンアップでは、ディレクトリ全体を削除するため、よりシンプルな実装となります：

```typescript
protected async cleanupWorkflowArtifacts(force: boolean = false): Promise<void> {
  const workflowDir = this.metadata.workflowDir; // .ai-workflow/issue-<NUM>

  if (!force && !this.isCIEnvironment()) {
    const confirmed = await this.promptUserConfirmation();
    if (!confirmed) {
      console.info('[INFO] Cleanup cancelled by user.');
      return;
    }
  }

  try {
    console.info(`[INFO] Deleting workflow artifacts: ${workflowDir}`);
    fs.removeSync(workflowDir);
    console.info('[OK] Workflow artifacts deleted successfully.');
  } catch (error) {
    console.error(`[ERROR] Failed to delete workflow artifacts: ${error.message}`);
    // エラーでもワークフローは継続
  }
}
```

### ユースケース詳細

**ケース 1: Jenkins CI/CD での PR マージ後の自動クリーンアップ**

```bash
# Jenkinsfile で PR マージ後に実行
node dist/index.js execute \
  --issue 123 \
  --phase evaluation \
  --cleanup-on-complete-force \
  --agent auto
```

- CI 環境（`CI=true`）のため、確認プロンプトは自動スキップ
- Evaluation Phase 完了後、ワークフローディレクトリを削除
- Git コミット & プッシュを自動実行

**ケース 2: ローカル開発での手動クリーンアップ**

```bash
# ローカル環境で確認プロンプト付きで実行
node dist/index.js execute \
  --issue 123 \
  --phase evaluation \
  --cleanup-on-complete
```

- 対話的環境のため、削除前に確認プロンプトを表示
- ユーザーが "yes" を入力した場合のみ削除を実行

**ケース 3: 成果物を保持したい場合（デフォルト動作）**

```bash
# オプションなしで実行（従来通り）
node dist/index.js execute \
  --issue 123 \
  --phase evaluation
```

- クリーンアップは実行されない
- `.ai-workflow/issue-123/` ディレクトリは保持される

---

## まとめ

本要件定義書は、Evaluation Phase 完了後に `.ai-workflow/issue-*` ディレクトリ全体をオプションで削除する機能の要件を定義しました。

### 主要ポイント

1. **既存設計パターンの踏襲**: Report Phase のクリーンアップ機能と同様のアプローチを採用
2. **後方互換性の維持**: オプション機能として実装し、デフォルト動作は変更しない
3. **エラーハンドリング**: クリーンアップ失敗時もワークフロー全体は成功として扱う
4. **CI/CD 対応**: 確認プロンプトの自動スキップにより、Jenkins 等の CI 環境で問題なく動作

### 品質ゲートの確認

- ✅ **機能要件が明確に記載されている**: FR-1 〜 FR-7 で具体的に定義
- ✅ **受け入れ基準が定義されている**: AC-1 〜 AC-10 で Given-When-Then 形式で記述
- ✅ **スコープが明確である**: セクション 7 でスコープ外を明示
- ✅ **論理的な矛盾がない**: 機能要件と受け入れ基準、非機能要件が整合

本要件定義書は、Phase 1 の品質ゲートを満たしており、次の Phase 2（設計）に進む準備が整っています。
