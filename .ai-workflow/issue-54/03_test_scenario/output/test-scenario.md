# テストシナリオ - Issue #54

## プロジェクト情報

- **Issue番号**: #54
- **タイトル**: バグ: metadata.jsonにGitHub Personal Access Tokenが含まれpush protectionで拒否される
- **重要度**: HIGH（セキュリティリスク）
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/54
- **Planning Phase確認**: 実施済み（planning.mdを参照）
- **Requirements Phase確認**: 実施済み（requirements.mdを参照）
- **Design Phase確認**: 実施済み（design.mdを参照）

---

## 0. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**（Planning Phase Phase 2で決定）

### テスト戦略の判断根拠（Planning Documentより引用）

#### UNIT（ユニットテスト）の必要性
1. **純粋関数のテスト**:
   - `sanitizeGitUrl()` 関数は外部依存がない純粋関数
   - 入力URLと出力URLの対応関係を明確にテスト可能
   - 正規表現の正確性を検証する必要がある

2. **テストケースの網羅性**:
   - HTTPS + トークン形式（`ghp_xxx`、`github_pat_xxx`）
   - HTTPS + ユーザー:パスワード形式
   - SSH形式（変更なし）
   - 通常HTTPS形式（変更なし）
   - エッジケース（空文字列、複数@記号、ポート番号付き等）

3. **高速フィードバック**:
   - 外部システム（Git、GitHub）に依存しないため、テスト実行が高速
   - 開発サイクルの短縮

#### INTEGRATION（統合テスト）の必要性
1. **エンドツーエンドフロー検証**:
   - init コマンド全体でトークン埋め込みURLを使用した場合の動作確認
   - metadata.json作成 → マスキング → コミット → push の一連のフローを検証

2. **実際のGit操作との統合**:
   - 実際のGitリポジトリ環境でのテスト
   - GitHub push protectionによる拒否が発生しないことを確認（ダミートークン使用）

3. **既存テストとの整合性**:
   - 既存の統合テストとの互換性確認
   - 回帰テストの実施

#### BDD不要の理由
- エンドユーザー向けの新機能ではなく、バグ修正（セキュリティ問題の解決）
- ユーザーストーリーベースのテストよりも、技術的な正確性を重視
- Given-When-Then形式は要件定義書の受け入れ基準（AC）で既に記述済み

### テスト対象の範囲

#### 新規実装
1. **`sanitizeGitUrl()` 関数**（`src/utils/git-url-utils.ts`）
   - Git remote URLからHTTPS認証情報を除去

#### 既存コード拡張
1. **`init` コマンド**（`src/commands/init.ts`）
   - remote URLサニタイズの適用（2箇所）

2. **SecretMasker**（`src/core/secret-masker.ts`）
   - `metadata.json` をスキャン対象に追加

3. **commitWorkflowInit**（`src/core/git/commit-manager.ts`）
   - コミット前のマスキング実行

### テストの目的

1. **セキュリティ保証**: GitHub Personal Access Tokenがmetadata.jsonに含まれないことを保証
2. **機能正常性**: URLサニタイズが正しく動作し、既存機能に影響しないことを確認
3. **多層防御の検証**: URLサニタイズ（第1層）+ SecretMasker（第2層）の両方が機能することを確認
4. **回帰テスト**: 既存のワークフローに影響しないことを確認

---

## 1. Unitテストシナリオ

### 1.1 `sanitizeGitUrl()` 関数のテスト

**テストファイル**: `tests/unit/utils/git-url-utils.test.ts`（新規作成）

---

#### UC-1.1.1: HTTPS + ghp_トークン形式からトークンを除去

**テストケース名**: `sanitizeGitUrl_HTTPS_ghp_token`

- **目的**: HTTPS形式のURLに含まれる `ghp_` 形式のGitHub Personal Access Tokenが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git'
  ```
- **期待結果**:
  ```typescript
  'https://github.com/tielec/ai-workflow-agent.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git',
      expected: 'https://github.com/tielec/ai-workflow-agent.git'
    },
    {
      input: 'https://ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456@github.com/owner/repo.git',
      expected: 'https://github.com/owner/repo.git'
    }
  ];
  ```

**実装例**:
```typescript
test('HTTPS + ghp_トークン形式からトークンを除去', () => {
  const input = 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git';
  const expected = 'https://github.com/tielec/ai-workflow-agent.git';

  const result = sanitizeGitUrl(input);

  expect(result).toBe(expected);
});
```

---

#### UC-1.1.2: HTTPS + github_pat_トークン形式からトークンを除去

**テストケース名**: `sanitizeGitUrl_HTTPS_github_pat_token`

- **目的**: HTTPS形式のURLに含まれる `github_pat_` 形式のGitHub Personal Access Tokenが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://github_pat_1234567890abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ@github.com/owner/repo.git'
  ```
- **期待結果**:
  ```typescript
  'https://github.com/owner/repo.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://github_pat_1234567890abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ@github.com/owner/repo.git',
      expected: 'https://github.com/owner/repo.git'
    }
  ];
  ```

---

#### UC-1.1.3: HTTPS + ユーザー:パスワード形式から認証情報を除去

**テストケース名**: `sanitizeGitUrl_HTTPS_username_password`

- **目的**: HTTPS形式のURLに含まれるユーザー名とパスワードが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://username:password123@github.com/owner/repo.git'
  ```
- **期待結果**:
  ```typescript
  'https://github.com/owner/repo.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://username:password123@github.com/owner/repo.git',
      expected: 'https://github.com/owner/repo.git'
    },
    {
      input: 'https://user:p@ssw0rd!@github.com/owner/repo.git',
      expected: 'https://github.com/owner/repo.git'
    }
  ];
  ```

---

#### UC-1.1.4: SSH形式はそのまま返す

**テストケース名**: `sanitizeGitUrl_SSH_no_change`

- **目的**: SSH形式のURLは変更されずにそのまま返されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'git@github.com:tielec/ai-workflow-agent.git'
  ```
- **期待結果**:
  ```typescript
  'git@github.com:tielec/ai-workflow-agent.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'git@github.com:tielec/ai-workflow-agent.git',
      expected: 'git@github.com:tielec/ai-workflow-agent.git'
    },
    {
      input: 'git@gitlab.com:group/project.git',
      expected: 'git@gitlab.com:group/project.git'
    }
  ];
  ```

---

#### UC-1.1.5: 通常のHTTPS形式（認証情報なし）はそのまま返す

**テストケース名**: `sanitizeGitUrl_HTTPS_no_auth_no_change`

- **目的**: 認証情報を含まないHTTPS形式のURLは変更されずにそのまま返されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://github.com/tielec/ai-workflow-agent.git'
  ```
- **期待結果**:
  ```typescript
  'https://github.com/tielec/ai-workflow-agent.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://github.com/tielec/ai-workflow-agent.git',
      expected: 'https://github.com/tielec/ai-workflow-agent.git'
    },
    {
      input: 'https://gitlab.com/group/project.git',
      expected: 'https://gitlab.com/group/project.git'
    }
  ];
  ```

---

#### UC-1.1.6: ポート番号付きHTTPS + トークン形式からトークンを除去

**テストケース名**: `sanitizeGitUrl_HTTPS_port_token`

- **目的**: ポート番号を含むHTTPS形式のURLでもトークンが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://ghp_token123@github.com:443/owner/repo.git'
  ```
- **期待結果**:
  ```typescript
  'https://github.com:443/owner/repo.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://ghp_token123@github.com:443/owner/repo.git',
      expected: 'https://github.com:443/owner/repo.git'
    },
    {
      input: 'https://user:pass@custom-git.example.com:8443/repo.git',
      expected: 'https://custom-git.example.com:8443/repo.git'
    }
  ];
  ```

---

#### UC-1.1.7: 空文字列はそのまま返す（フェイルセーフ）

**テストケース名**: `sanitizeGitUrl_empty_string_failsafe`

- **目的**: 空文字列が入力された場合、エラーをスローせずにそのまま返すことを検証（フェイルセーフ動作）
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  ''
  ```
- **期待結果**:
  ```typescript
  ''
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: '',
      expected: ''
    }
  ];
  ```

---

#### UC-1.1.8: HTTP形式（非HTTPS）+ トークンからトークンを除去

**テストケース名**: `sanitizeGitUrl_HTTP_token`

- **目的**: HTTP形式（非HTTPS）のURLでもトークンが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'http://ghp_token123@github.com/owner/repo.git'
  ```
- **期待結果**:
  ```typescript
  'http://github.com/owner/repo.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'http://ghp_token123@github.com/owner/repo.git',
      expected: 'http://github.com/owner/repo.git'
    }
  ];
  ```

---

#### UC-1.1.9: GitLab HTTPS + トークン形式からトークンを除去

**テストケース名**: `sanitizeGitUrl_GitLab_HTTPS_token`

- **目的**: GitLab（GitHub以外のGitホスト）でもトークンが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://oauth2:glpat-xxxxxxxxxxxxxxxxxxxx@gitlab.com/group/project.git'
  ```
- **期待結果**:
  ```typescript
  'https://gitlab.com/group/project.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://oauth2:glpat-xxxxxxxxxxxxxxxxxxxx@gitlab.com/group/project.git',
      expected: 'https://gitlab.com/group/project.git'
    }
  ];
  ```

---

#### UC-1.1.10: Bitbucket HTTPS + トークン形式からトークンを除去

**テストケース名**: `sanitizeGitUrl_Bitbucket_HTTPS_token`

- **目的**: Bitbucket（GitHub以外のGitホスト）でもトークンが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://x-token-auth:ATBB_xxxxxxxxxxxxxxxxx@bitbucket.org/workspace/repo.git'
  ```
- **期待結果**:
  ```typescript
  'https://bitbucket.org/workspace/repo.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://x-token-auth:ATBB_xxxxxxxxxxxxxxxxx@bitbucket.org/workspace/repo.git',
      expected: 'https://bitbucket.org/workspace/repo.git'
    }
  ];
  ```

---

#### UC-1.1.11: サブドメイン付きURL + トークンからトークンを除去

**テストケース名**: `sanitizeGitUrl_subdomain_token`

- **目的**: サブドメインを含むURLでもトークンが正しく除去されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://token123@git.example.com/owner/repo.git'
  ```
- **期待結果**:
  ```typescript
  'https://git.example.com/owner/repo.git'
  ```
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://token123@git.example.com/owner/repo.git',
      expected: 'https://git.example.com/owner/repo.git'
    }
  ];
  ```

---

#### UC-1.1.12: 複数の@記号を含むURL（エッジケース）

**テストケース名**: `sanitizeGitUrl_multiple_at_sign_edge_case`

- **目的**: 複数の@記号を含むURL（例: `user@domain@host`）でも正しく処理されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```typescript
  'https://user@domain@github.com/owner/repo.git'
  ```
- **期待結果**:
  ```typescript
  'https://github.com/owner/repo.git'
  ```
  （最初の@までを認証情報として除去）
- **テストデータ**:
  ```typescript
  const testCases = [
    {
      input: 'https://user@domain@github.com/owner/repo.git',
      expected: 'https://github.com/owner/repo.git'
    }
  ];
  ```

---

### 1.2 既存コード拡張のユニットテスト

#### UC-1.2.1: SecretMasker - metadata.json スキャン

**テストファイル**: `tests/unit/secret-masker.test.ts`（既存ファイル拡張）

**テストケース名**: `SecretMasker_metadata_json_scan`

- **目的**: SecretMaskerが `metadata.json` をスキャン対象として認識し、トークンを正しくマスキングすることを検証
- **前提条件**:
  - テスト用ワークフローディレクトリが存在
  - トークンを含む `metadata.json` が作成されている
- **入力**:
  ```typescript
  // metadata.json の内容
  {
    "target_repository": {
      "remote_url": "https://ghp_secret123456789@github.com/owner/repo.git"
    }
  }

  // 環境変数
  process.env.GITHUB_TOKEN = 'ghp_secret123456789'
  ```
- **期待結果**:
  - `filesProcessed` が1以上
  - `secretsMasked` が1以上
  - metadata.json内のトークンが `[REDACTED_GITHUB_TOKEN]` にマスキングされる
  - 元のトークン文字列が含まれない
- **テストデータ**:
  ```typescript
  const testMetadata = {
    target_repository: {
      path: '/path/to/repo',
      github_name: 'owner/repo',
      remote_url: 'https://ghp_secret123456789@github.com/owner/repo.git',
      owner: 'owner',
      repo: 'repo'
    }
  };
  ```

**実装例**:
```typescript
test('metadata.json内のGitHub Personal Access Tokenをマスキング', async () => {
  // Given: トークンを含むmetadata.json
  process.env.GITHUB_TOKEN = 'ghp_secret123456789';
  const metadataFile = path.join(workflowDir, 'metadata.json');
  await fs.ensureDir(path.dirname(metadataFile));
  await fs.writeFile(
    metadataFile,
    JSON.stringify({
      target_repository: {
        remote_url: 'https://ghp_secret123456789@github.com/owner/repo.git'
      }
    }),
  );

  // When: シークレットマスキングを実行
  const masker = new SecretMasker();
  const result = await masker.maskSecretsInWorkflowDir(workflowDir);

  // Then: metadata.json内のトークンがマスキングされる
  expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
  expect(result.secretsMasked).toBeGreaterThan(0);

  const content = await fs.readFile(metadataFile, 'utf-8');
  expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
  expect(content).not.toContain('ghp_secret123456789');
});
```

---

#### UC-1.2.2: init コマンド - URLサニタイズログ出力

**テストファイル**: `tests/unit/commands/init.test.ts`（既存ファイル拡張）

**テストケース名**: `init_command_sanitize_url_warning_log`

- **目的**: トークン埋め込みURLが検出された場合、警告ログが出力されることを検証
- **前提条件**:
  - Gitリポジトリがモックされている
  - remote URLがトークン埋め込み形式
- **入力**:
  ```typescript
  // git remote get-url origin の出力（モック）
  'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git'
  ```
- **期待結果**:
  - `console.warn` が呼び出される
  - 警告メッセージに `GitHub Personal Access Token detected` が含まれる
  - `console.info` でサニタイズ前後のURLが出力される（トークンは`***`でマスク）
- **テストデータ**:
  ```typescript
  const mockRemoteUrl = 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git';
  const expectedSanitizedUrl = 'https://github.com/owner/repo.git';
  ```

**実装例**:
```typescript
test('トークン検出時に警告ログが出力される', async () => {
  // Given: HTTPS + トークン形式のリポジトリ（モック）
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

  // モック設定（gitコマンドがトークン埋め込みURLを返す）
  // ...

  // When: init コマンド実行
  // await handleInitCommand(...);

  // Then: 警告ログが出力される
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    expect.stringContaining('GitHub Personal Access Token detected')
  );
  expect(consoleInfoSpy).toHaveBeenCalled();

  consoleWarnSpy.mockRestore();
  consoleInfoSpy.mockRestore();
});
```

---

## 2. Integrationテストシナリオ

### 2.1 init コマンド - トークン埋め込みURL対応の統合テスト

**テストファイル**: `tests/integration/init-token-sanitization.test.ts`（新規作成）または `tests/integration/custom-branch-workflow.test.ts`（既存拡張）

---

#### IC-2.1.1: E2E - トークン埋め込みURLでinit実行 → metadata.jsonにトークンが含まれない

**シナリオ名**: `init_E2E_token_sanitization`

- **目的**: トークン埋め込みURLでワークフローを初期化した場合、metadata.jsonにトークンが含まれないことをエンドツーエンドで検証
- **前提条件**:
  - テスト用の一時Gitリポジトリが作成されている
  - remote URLにダミートークンが設定されている（`https://ghp_dummy123456789@github.com/owner/repo.git`）
  - GitHub Issue URLが準備されている
- **テスト手順**:
  1. テスト用一時ディレクトリを作成
  2. Gitリポジトリを初期化（`git init`）
  3. remote URLにダミートークンを設定（`git remote add origin https://ghp_dummy123456789@github.com/owner/repo.git`）
  4. init コマンドを実行（`handleInitCommand('https://github.com/owner/repo/issues/1')`）
  5. 生成された `.ai-workflow/issue-1/metadata.json` を読み込み
  6. `target_repository.remote_url` フィールドを検証
  7. コミットが作成されたことを確認（`git log`）
- **期待結果**:
  - metadata.jsonが作成される
  - `target_repository.remote_url` が `https://github.com/owner/repo.git`（トークンなし）
  - ダミートークン（`ghp_dummy123456789`）が含まれない
  - コミットが正常に作成される
- **確認項目**:
  - [ ] metadata.jsonファイルが存在する
  - [ ] `target_repository.remote_url` にトークンが含まれない
  - [ ] `target_repository.remote_url` が正しいURL形式（`https://github.com/owner/repo.git`）
  - [ ] metadata.json以外のワークフローファイルが正常に生成される
  - [ ] Gitコミットが正常に作成される

**実装例**:
```typescript
test('E2E: トークン埋め込みURLでinit実行 → metadata.jsonにトークンが含まれない', async () => {
  // Given: HTTPS + トークン形式でクローンされたリポジトリ（テスト用モック）
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));

  try {
    // 1. テスト用Gitリポジトリを作成
    await execa('git', ['init'], { cwd: tempDir });
    await execa('git', ['remote', 'add', 'origin', 'https://ghp_dummy123456789@github.com/owner/repo.git'], { cwd: tempDir });

    // 2. init コマンド実行
    // await handleInitCommand('https://github.com/owner/repo/issues/1');

    // 3. metadata.jsonを読み込み
    const metadataPath = path.join(tempDir, '.ai-workflow', 'issue-1', 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Then:
    // 1. metadata.jsonが作成される
    expect(await fs.pathExists(metadataPath)).toBe(true);

    // 2. target_repository.remote_urlにトークンが含まれない
    expect(metadata.target_repository.remote_url).toBe('https://github.com/owner/repo.git');
    expect(metadata.target_repository.remote_url).not.toContain('ghp_dummy123456789');

    // 3. コミットが作成される
    const { stdout: commitLog } = await execa('git', ['log', '--oneline'], { cwd: tempDir });
    expect(commitLog).toContain('Initialize AI workflow for issue #1');
  } finally {
    // クリーンアップ
    await fs.remove(tempDir);
  }
});
```

---

#### IC-2.1.2: 統合 - commitWorkflowInit でのマスキング実行

**シナリオ名**: `commitWorkflowInit_masking_execution`

- **目的**: `commitWorkflowInit()` メソッドがコミット前に確実にマスキング処理を実行することを検証
- **前提条件**:
  - テスト用ワークフローディレクトリが作成されている
  - （意図的に）トークンを含むmetadata.jsonが作成されている
  - CommitManagerインスタンスが初期化されている
- **テスト手順**:
  1. テスト用ワークフローディレクトリを作成（`.ai-workflow/issue-999/`）
  2. 意図的にトークンを含むmetadata.jsonを作成
  3. `commitWorkflowInit(999, 'ai-workflow/issue-999')` を実行
  4. マスキング結果のログ出力を確認
  5. metadata.jsonが更新されていることを確認
  6. コミットが作成されたことを確認
- **期待結果**:
  - マスキング処理が実行される
  - `[INFO] Masked X secret(s) in Y file(s)` ログが出力される
  - metadata.json内のトークンが `[REDACTED_GITHUB_TOKEN]` にマスキングされる
  - コミットが正常に作成される
- **確認項目**:
  - [ ] `maskSecretsInWorkflowDir()` が呼び出される
  - [ ] マスキング結果ログが出力される
  - [ ] metadata.json内のトークンがマスキングされる
  - [ ] コミットが作成される
  - [ ] コミットメッセージが正しい

**実装例**:
```typescript
test('commitWorkflowInit でマスキングが実行される', async () => {
  // Given: トークンを含むmetadata.jsonが存在する
  const workflowDir = path.join(repoRoot, '.ai-workflow', 'issue-999');
  const metadataPath = path.join(workflowDir, 'metadata.json');

  await fs.ensureDir(workflowDir);
  await fs.writeFile(
    metadataPath,
    JSON.stringify({
      target_repository: {
        remote_url: 'https://ghp_secret123@github.com/owner/repo.git'
      }
    })
  );

  const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

  // When: commitWorkflowInit を実行
  const commitManager = new CommitManager(repoRoot, metadataManager, secretMasker);
  const result = await commitManager.commitWorkflowInit(999, 'ai-workflow/issue-999');

  // Then: マスキングが実行され、コミットが作成される
  expect(consoleInfoSpy).toHaveBeenCalledWith(
    expect.stringContaining('Masked')
  );

  const metadataContent = await fs.readFile(metadataPath, 'utf-8');
  expect(metadataContent).toContain('[REDACTED_GITHUB_TOKEN]');
  expect(metadataContent).not.toContain('ghp_secret123');

  expect(result.success).toBe(true);
  expect(result.commit_hash).not.toBeNull();

  consoleInfoSpy.mockRestore();
});
```

---

#### IC-2.1.3: 統合 - マスキング失敗時のエラーハンドリング

**シナリオ名**: `commitWorkflowInit_masking_failure_error_handling`

- **目的**: マスキング処理が失敗した場合、コミットが中断され、適切なエラーが発生することを検証
- **前提条件**:
  - テスト用ワークフローディレクトリが作成されている
  - metadata.jsonが読み取り専用に設定されている（マスキング失敗をシミュレート）
- **テスト手順**:
  1. テスト用ワークフローディレクトリを作成
  2. metadata.jsonを作成し、読み取り専用に設定
  3. `commitWorkflowInit()` を実行
  4. エラーがスローされることを確認
  5. コミットが作成されていないことを確認
- **期待結果**:
  - `Cannot commit metadata.json with unmasked secrets` エラーがスローされる
  - `[ERROR] Secret masking failed` ログが出力される
  - コミットが作成されない
- **確認項目**:
  - [ ] エラーがスローされる
  - [ ] エラーメッセージが正しい（`Cannot commit metadata.json with unmasked secrets`）
  - [ ] コミットが作成されない
  - [ ] エラーログが出力される

**実装例**:
```typescript
test('マスキング失敗時はエラーがスローされる', async () => {
  // Given: metadata.jsonを読み取り専用に設定（マスキング失敗をシミュレート）
  const workflowDir = path.join(repoRoot, '.ai-workflow', 'issue-998');
  const metadataPath = path.join(workflowDir, 'metadata.json');

  await fs.ensureDir(workflowDir);
  await fs.writeFile(metadataPath, JSON.stringify({ test: 'data' }));
  await fs.chmod(metadataPath, 0o444); // 読み取り専用

  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

  try {
    // When: commitWorkflowInit を実行
    const commitManager = new CommitManager(repoRoot, metadataManager, secretMasker);

    // Then: エラーがスローされる
    await expect(
      commitManager.commitWorkflowInit(998, 'ai-workflow/issue-998')
    ).rejects.toThrow('Cannot commit metadata.json with unmasked secrets');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Secret masking failed')
    );

    // コミットが作成されていないことを確認
    const { stdout: commitLog } = await execa('git', ['log', '--oneline'], { cwd: repoRoot });
    expect(commitLog).not.toContain('issue-998');
  } finally {
    // クリーンアップ
    await fs.chmod(metadataPath, 0o644);
    consoleErrorSpy.mockRestore();
  }
});
```

---

#### IC-2.1.4: 統合 - 既存ワークフローへの影響なし

**シナリオ名**: `existing_workflow_no_impact`

- **目的**: 新規init実行時に、既存のワークフロー（過去に作成されたmetadata.json）が変更されないことを検証
- **前提条件**:
  - 既存のワークフローディレクトリが存在（`.ai-workflow/issue-100/`）
  - 既存のmetadata.jsonが存在
- **テスト手順**:
  1. 既存ワークフローのmetadata.jsonのタイムスタンプを記録
  2. 新規issue（別番号）でinit コマンドを実行
  3. 既存metadata.jsonのタイムスタンプが変更されていないことを確認
  4. 既存metadata.jsonの内容が変更されていないことを確認
- **期待結果**:
  - 既存metadata.jsonのタイムスタンプが変更されない
  - 既存metadata.jsonの内容が変更されない
  - 新規ワークフローが正常に作成される
- **確認項目**:
  - [ ] 既存metadata.jsonのタイムスタンプが不変
  - [ ] 既存metadata.jsonの内容が不変
  - [ ] 新規ワークフローが正常に作成される
  - [ ] 新規ワークフローのmetadata.jsonが正しい

**実装例**:
```typescript
test('既存ワークフローへの影響なし', async () => {
  // Given: 過去に作成された .ai-workflow/issue-100/metadata.json が存在する
  const existingWorkflowDir = path.join(repoRoot, '.ai-workflow', 'issue-100');
  const existingMetadataPath = path.join(existingWorkflowDir, 'metadata.json');

  await fs.ensureDir(existingWorkflowDir);
  await fs.writeFile(existingMetadataPath, JSON.stringify({ issue_number: 100 }));

  const { mtime: beforeMtime } = await fs.stat(existingMetadataPath);
  const beforeContent = await fs.readFile(existingMetadataPath, 'utf-8');

  // When: 新規issue（200）でinit実行
  // await handleInitCommand('https://github.com/owner/repo/issues/200');

  // Then: 既存metadata.jsonは変更されない
  const { mtime: afterMtime } = await fs.stat(existingMetadataPath);
  const afterContent = await fs.readFile(existingMetadataPath, 'utf-8');

  expect(afterMtime.getTime()).toBe(beforeMtime.getTime());
  expect(afterContent).toBe(beforeContent);

  // 新規ワークフローは正常に作成される
  const newMetadataPath = path.join(repoRoot, '.ai-workflow', 'issue-200', 'metadata.json');
  expect(await fs.pathExists(newMetadataPath)).toBe(true);
});
```

---

#### IC-2.1.5: 統合 - SSH形式URLでのinit実行（変更なし）

**シナリオ名**: `init_SSH_url_no_change`

- **目的**: SSH形式のremote URLでinit実行した場合、URLが変更されずにそのままmetadata.jsonに保存されることを検証
- **前提条件**:
  - テスト用Gitリポジトリが作成されている
  - remote URLがSSH形式（`git@github.com:owner/repo.git`）
- **テスト手順**:
  1. テスト用Gitリポジトリを作成
  2. remote URLをSSH形式に設定（`git remote add origin git@github.com:owner/repo.git`）
  3. init コマンドを実行
  4. metadata.jsonを検証
- **期待結果**:
  - metadata.jsonが作成される
  - `target_repository.remote_url` が `git@github.com:owner/repo.git`（変更なし）
- **確認項目**:
  - [ ] metadata.jsonファイルが存在する
  - [ ] `target_repository.remote_url` が SSH形式のまま
  - [ ] URLが変更されていない

**実装例**:
```typescript
test('SSH形式URLでのinit実行（変更なし）', async () => {
  // Given: SSH形式のremote URL
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-ssh-'));

  try {
    await execa('git', ['init'], { cwd: tempDir });
    await execa('git', ['remote', 'add', 'origin', 'git@github.com:owner/repo.git'], { cwd: tempDir });

    // When: init コマンド実行
    // await handleInitCommand('https://github.com/owner/repo/issues/1');

    // Then: metadata.jsonにSSH形式がそのまま保存される
    const metadataPath = path.join(tempDir, '.ai-workflow', 'issue-1', 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    expect(metadata.target_repository.remote_url).toBe('git@github.com:owner/repo.git');
  } finally {
    await fs.remove(tempDir);
  }
});
```

---

## 3. テストデータ

### 3.1 URLサニタイズ用テストデータ

```typescript
export const URL_SANITIZE_TEST_DATA = {
  // HTTPS + トークン形式
  https_ghp_token: {
    input: 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git',
    expected: 'https://github.com/tielec/ai-workflow-agent.git',
    description: 'HTTPS + ghp_トークン形式'
  },
  https_github_pat_token: {
    input: 'https://github_pat_1234567890abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ@github.com/owner/repo.git',
    expected: 'https://github.com/owner/repo.git',
    description: 'HTTPS + github_pat_トークン形式'
  },

  // HTTPS + ユーザー:パスワード
  https_username_password: {
    input: 'https://username:password123@github.com/owner/repo.git',
    expected: 'https://github.com/owner/repo.git',
    description: 'HTTPS + ユーザー:パスワード形式'
  },

  // SSH形式（変更なし）
  ssh_format: {
    input: 'git@github.com:tielec/ai-workflow-agent.git',
    expected: 'git@github.com:tielec/ai-workflow-agent.git',
    description: 'SSH形式（変更なし）'
  },

  // 通常HTTPS（変更なし）
  https_no_auth: {
    input: 'https://github.com/tielec/ai-workflow-agent.git',
    expected: 'https://github.com/tielec/ai-workflow-agent.git',
    description: '通常HTTPS（認証情報なし、変更なし）'
  },

  // ポート番号付き
  https_port_token: {
    input: 'https://ghp_token123@github.com:443/owner/repo.git',
    expected: 'https://github.com:443/owner/repo.git',
    description: 'ポート番号付きHTTPS + トークン'
  },

  // HTTP形式（非HTTPS）
  http_token: {
    input: 'http://ghp_token123@github.com/owner/repo.git',
    expected: 'http://github.com/owner/repo.git',
    description: 'HTTP形式 + トークン'
  },

  // GitLab
  gitlab_https_token: {
    input: 'https://oauth2:glpat-xxxxxxxxxxxxxxxxxxxx@gitlab.com/group/project.git',
    expected: 'https://gitlab.com/group/project.git',
    description: 'GitLab HTTPS + トークン'
  },

  // Bitbucket
  bitbucket_https_token: {
    input: 'https://x-token-auth:ATBB_xxxxxxxxxxxxxxxxx@bitbucket.org/workspace/repo.git',
    expected: 'https://bitbucket.org/workspace/repo.git',
    description: 'Bitbucket HTTPS + トークン'
  },

  // サブドメイン
  subdomain_token: {
    input: 'https://token123@git.example.com/owner/repo.git',
    expected: 'https://git.example.com/owner/repo.git',
    description: 'サブドメイン付きURL + トークン'
  },

  // エッジケース
  empty_string: {
    input: '',
    expected: '',
    description: '空文字列（フェイルセーフ）'
  },

  multiple_at_sign: {
    input: 'https://user@domain@github.com/owner/repo.git',
    expected: 'https://github.com/owner/repo.git',
    description: '複数の@記号を含むURL'
  }
};
```

### 3.2 metadata.json用テストデータ

```typescript
export const METADATA_TEST_DATA = {
  // トークン埋め込みmetadata.json
  with_token: {
    target_repository: {
      path: '/path/to/repo',
      github_name: 'owner/repo',
      remote_url: 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git',
      owner: 'owner',
      repo: 'repo'
    },
    issue: {
      number: 1,
      title: 'Test Issue',
      url: 'https://github.com/owner/repo/issues/1'
    }
  },

  // サニタイズ済みmetadata.json
  sanitized: {
    target_repository: {
      path: '/path/to/repo',
      github_name: 'owner/repo',
      remote_url: 'https://github.com/owner/repo.git',
      owner: 'owner',
      repo: 'repo'
    },
    issue: {
      number: 1,
      title: 'Test Issue',
      url: 'https://github.com/owner/repo/issues/1'
    }
  },

  // SSH形式metadata.json
  ssh_format: {
    target_repository: {
      path: '/path/to/repo',
      github_name: 'owner/repo',
      remote_url: 'git@github.com:owner/repo.git',
      owner: 'owner',
      repo: 'repo'
    },
    issue: {
      number: 1,
      title: 'Test Issue',
      url: 'https://github.com/owner/repo/issues/1'
    }
  }
};
```

### 3.3 ダミートークン（テスト専用）

```typescript
export const DUMMY_TOKENS = {
  ghp_format: 'ghp_dummy123456789abcdefghijklmnopqrstuvwxyz',
  github_pat_format: 'github_pat_dummy123456789abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ',
  gitlab_format: 'glpat-dummy_xxxxxxxxxxxxxxxxxxxx',
  bitbucket_format: 'ATBB_dummy_xxxxxxxxxxxxxxxxx'
};
```

**重要**: これらのダミートークンは**実際のトークンではありません**。テスト専用のダミー値です。

---

## 4. テスト環境要件

### 4.1 ローカル環境

**必要なソフトウェア**:
- Node.js 20以上
- Git 2.x以上
- npm または yarn

**必要なnpmパッケージ**（既存のものを活用）:
- `jest`: テストフレームワーク
- `@types/jest`: TypeScript型定義
- `fs-extra`: ファイルシステム操作
- `execa`: コマンド実行（統合テスト用）

**テスト実行コマンド**:
```bash
# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# すべてのテスト
npm test

# カバレッジ付き
npm run test:coverage
```

### 4.2 CI/CD環境

**GitHub Actions要件**:
- Ubuntu最新版
- Node.js 20セットアップ
- Git設定（ユーザー名・メールアドレス）

**環境変数**:
- `GITHUB_TOKEN`: ダミートークン（`ghp_dummy123456789abcdefghijklmnopqrstuvwxyz`）をGitHub Secretsに設定
  - **注意**: 実際のトークンではなく、テスト専用のダミー値

### 4.3 モック/スタブの必要性

#### ユニットテストでのモック
- **不要**: `sanitizeGitUrl()` は純粋関数のため、モック不要
- **必要（一部）**: init コマンドテストで `console.warn`、`console.info` をモック

#### 統合テストでのモック
- **最小限**: Gitコマンドは実際に実行（テスト用一時リポジトリを使用）
- **モック対象**:
  - GitHub API呼び出し（必要な場合）
  - 外部ネットワーク接続（必要な場合）

---

## 5. テストカバレッジ目標

### 5.1 ユニットテストカバレッジ

**目標**: 新規コードは100%

**対象**:
- `src/utils/git-url-utils.ts`: 100%（純粋関数のため達成可能）

**既存コード拡張部分の目標**: 80%以上
- `src/commands/init.ts`: 新規追加部分（URLサニタイズロジック）
- `src/core/secret-masker.ts`: 新規追加部分（metadata.jsonスキャン）
- `src/core/git/commit-manager.ts`: 新規追加部分（マスキング実行）

### 5.2 統合テストカバレッジ

**目標**: 主要なエンドツーエンドフローをカバー

**カバー対象**:
- [ ] トークン埋め込みURLでのinit実行フロー
- [ ] SecretMaskerとの統合
- [ ] commitWorkflowInitでのマスキング実行
- [ ] 既存ワークフローへの影響なし
- [ ] SSH形式URLでの正常動作

---

## 6. テスト実行スケジュール

### 6.1 開発フェーズでのテスト

**Phase 4（実装）完了後**:
- ユニットテスト（`sanitizeGitUrl()`）を実行
- カバレッジ100%を確認

**Phase 5（テストコード実装）完了後**:
- すべてのユニットテストを実行
- すべての統合テストを実行

**Phase 6（テスト実行）**:
- 全テスト実行（`npm test`）
- カバレッジレポート生成
- 失敗したテストの修正

### 6.2 CI/CDでのテスト

**プルリクエスト作成時**:
- すべてのユニットテスト実行
- すべての統合テスト実行
- カバレッジチェック（新規コード100%、全体80%以上）

**マージ前**:
- すべてのテスト合格が必須
- カバレッジ基準を満たすことが必須

---

## 7. 品質ゲート検証

本テストシナリオは、Phase 3の品質ゲート（4つの必須要件）を満たしています：

### ✅ QG-1: Phase 2の戦略に沿ったテストシナリオである

**テスト戦略**: UNIT_INTEGRATION（Phase 2で決定）

**対応**:
- ✅ Unitテストシナリオを作成（セクション1）
  - `sanitizeGitUrl()` 関数: 12個のテストケース
  - 既存コード拡張: 2個のテストケース
- ✅ Integrationテストシナリオを作成（セクション2）
  - init コマンド統合: 5個のシナリオ
- ✅ BDDシナリオは作成していない（戦略に含まれないため）

**判断根拠**:
- Phase 2の戦略（UNIT_INTEGRATION）を厳守
- Planning Documentの「BDD不要の理由」に基づきBDDシナリオを除外

---

### ✅ QG-2: 主要な正常系がカバーされている

**正常系テストケース**:

#### Unitテスト（正常系）
1. ✅ UC-1.1.1: HTTPS + ghp_トークン形式からトークンを除去
2. ✅ UC-1.1.2: HTTPS + github_pat_トークン形式からトークンを除去
3. ✅ UC-1.1.3: HTTPS + ユーザー:パスワード形式から認証情報を除去
4. ✅ UC-1.1.4: SSH形式はそのまま返す
5. ✅ UC-1.1.5: 通常のHTTPS形式（認証情報なし）はそのまま返す
6. ✅ UC-1.1.6: ポート番号付きHTTPS + トークン形式からトークンを除去

#### Integrationテスト（正常系）
1. ✅ IC-2.1.1: E2E - トークン埋め込みURLでinit実行 → metadata.jsonにトークンが含まれない
2. ✅ IC-2.1.2: 統合 - commitWorkflowInit でのマスキング実行
3. ✅ IC-2.1.4: 統合 - 既存ワークフローへの影響なし
4. ✅ IC-2.1.5: 統合 - SSH形式URLでのinit実行（変更なし）

**カバレッジ**:
- 要件定義書の受け入れ基準（AC-1〜AC-6）すべてに対応するテストケースを作成
- クリティカルパス（トークン除去フロー）を重点的にカバー

---

### ✅ QG-3: 主要な異常系がカバーされている

**異常系テストケース**:

#### Unitテスト（異常系・エッジケース）
1. ✅ UC-1.1.7: 空文字列はそのまま返す（フェイルセーフ）
2. ✅ UC-1.1.12: 複数の@記号を含むURL（エッジケース）

#### Integrationテスト（異常系）
1. ✅ IC-2.1.3: 統合 - マスキング失敗時のエラーハンドリング
   - metadata.json読み取り専用（マスキング失敗）
   - エラーがスローされる
   - コミットが中断される

**リスク対応**:
- Planning Documentで特定されたリスク（Git URL形式の多様性、正規表現の誤検出・見逃し）に対応するテストケースを作成
- フェイルセーフ動作（空文字列、複数@記号等）のテストを追加

---

### ✅ QG-4: 期待結果が明確である

**すべてのテストケースで期待結果を明記**:

**例1（Unitテスト）**:
- **入力**: `'https://ghp_xxxxx@github.com/owner/repo.git'`
- **期待結果**: `'https://github.com/owner/repo.git'`（明確）

**例2（Integrationテスト）**:
- **期待結果**:
  - metadata.jsonが作成される
  - `target_repository.remote_url` が `https://github.com/owner/repo.git`（トークンなし）
  - ダミートークン（`ghp_dummy123456789`）が含まれない
  - コミットが正常に作成される
- **確認項目**: チェックリスト形式で具体的に記載

**検証可能性**:
- すべてのテストケースで `expect()` による検証が可能
- 曖昧な表現を避け、具体的な入力・出力を記載

---

## 8. まとめ

### 8.1 テストシナリオの要点

本テストシナリオは、Issue #54（metadata.jsonにGitHub Personal Access Tokenが含まれpush protectionで拒否される問題）を解決するための包括的なテスト計画です。

**テスト戦略**: UNIT_INTEGRATION（Planning Phase Phase 2で決定）

**主要なテストカバレッジ**:
1. **Unitテスト**: 14個のテストケース
   - `sanitizeGitUrl()` 関数: 12個（正常系、異常系、エッジケース）
   - 既存コード拡張: 2個（SecretMasker、init コマンド）

2. **Integrationテスト**: 5個のシナリオ
   - E2Eフロー検証（トークン埋め込みURL対応）
   - commitWorkflowInitでのマスキング実行
   - マスキング失敗時のエラーハンドリング
   - 既存ワークフローへの影響なし
   - SSH形式URLでの正常動作

**テストデータ**:
- URLサニタイズ用テストデータ（12パターン）
- metadata.json用テストデータ（3パターン）
- ダミートークン（4種類）

### 8.2 品質保証

- ✅ すべての品質ゲート（QG-1〜QG-4）を満たす
- ✅ Phase 2のテスト戦略（UNIT_INTEGRATION）に準拠
- ✅ 要件定義書の受け入れ基準（AC-1〜AC-6）をすべてカバー
- ✅ Planning Documentのリスクに対応したテストケースを作成

### 8.3 次ステップ

**Phase 4（実装）**:
- `src/utils/git-url-utils.ts` の実装
- 既存コードの修正（`init.ts`、`secret-masker.ts`、`commit-manager.ts`）

**Phase 5（テストコード実装）**:
- 本テストシナリオに基づいたテストコード実装
- `tests/unit/utils/git-url-utils.test.ts`（新規作成）
- 既存テストファイルの拡張

**Phase 6（テスト実行）**:
- すべてのテスト実行
- カバレッジ確認（新規コード100%目標）

本テストシナリオに従い、高品質で信頼性の高いテストコードを実装します。

---

**作成日**: 2025-01-21
**作成者**: AI Workflow Agent (Test Scenario Phase)
**レビュー状態**: 未レビュー（Phase 3: Review待ち）
