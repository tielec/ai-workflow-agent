# テストシナリオ

## Issue #489: CLI全コマンドに--language/AI_WORKFLOW_LANGUAGEを追加しワークフロー言語を一元設定可能にする

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略: UNIT_INTEGRATION

**Phase 2 設計書より引用**:
- **判断根拠**:
  1. 機能の複雑度: 中程度（複数レイヤーにまたがる設定値の伝播）
  2. 優先順位ロジックの正確性検証が重要
  3. 既存テストとの整合性を確保

### テスト対象の範囲

| レイヤー | テスト対象 | テスト種別 |
|---------|-----------|-----------|
| Configuration Layer | `config.ts` - `getWorkflowLanguage()` | Unit |
| Command Layer | `options-parser.ts` - 言語パース・バリデーション | Unit |
| Metadata Layer | `metadata-manager.ts` - `setLanguage()`, `getLanguage()` | Unit |
| CLI Layer | `main.ts` - 各コマンドの `--language` オプション | Integration |
| 優先順位ロジック | CLI > 環境変数 > メタデータ > デフォルト | Integration |

### テストの目的

1. **正確性**: 言語設定が各レイヤーで正しく処理されることを検証
2. **優先順位**: CLI > 環境変数 > メタデータ > デフォルト(`ja`)の優先順位が正しく機能することを検証
3. **後方互換性**: 既存のメタデータ（`language`フィールドなし）でも正常に動作することを検証
4. **バリデーション**: 不正な言語値が適切にエラーハンドリングされることを検証

---

## 2. Unitテストシナリオ

### 2.1 config.ts - getWorkflowLanguage() テスト

**テストファイル**: `tests/unit/core/config.test.ts`（既存ファイル拡張）

#### 2.1.1 正常系テストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| CFG-001 | getWorkflowLanguage_環境変数ja設定時_jaを返す | 環境変数 `ja` が正しく取得されることを検証 | `AI_WORKFLOW_LANGUAGE=ja` | なし | `'ja'` |
| CFG-002 | getWorkflowLanguage_環境変数en設定時_enを返す | 環境変数 `en` が正しく取得されることを検証 | `AI_WORKFLOW_LANGUAGE=en` | なし | `'en'` |
| CFG-003 | getWorkflowLanguage_環境変数未設定時_nullを返す | 未設定時に `null` を返すことを検証 | `AI_WORKFLOW_LANGUAGE` 未設定 | なし | `null` |

**テストコード例**:
```typescript
describe('Config - getWorkflowLanguage()', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('正常系', () => {
    test('AI_WORKFLOW_LANGUAGE=ja の場合、ja を返す', () => {
      // Given: 環境変数が設定されている
      process.env.AI_WORKFLOW_LANGUAGE = 'ja';

      // When: getWorkflowLanguage() を呼び出す
      const result = config.getWorkflowLanguage();

      // Then: 'ja' が返される
      expect(result).toBe('ja');
    });

    test('AI_WORKFLOW_LANGUAGE=en の場合、en を返す', () => {
      process.env.AI_WORKFLOW_LANGUAGE = 'en';
      const result = config.getWorkflowLanguage();
      expect(result).toBe('en');
    });

    test('AI_WORKFLOW_LANGUAGE 未設定の場合、null を返す', () => {
      delete process.env.AI_WORKFLOW_LANGUAGE;
      const result = config.getWorkflowLanguage();
      expect(result).toBeNull();
    });
  });
});
```

#### 2.1.2 大文字小文字正規化テストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| CFG-004 | getWorkflowLanguage_大文字JA_jaに正規化 | 大文字入力が正規化されることを検証 | `AI_WORKFLOW_LANGUAGE=JA` | なし | `'ja'` |
| CFG-005 | getWorkflowLanguage_大文字EN_enに正規化 | 大文字入力が正規化されることを検証 | `AI_WORKFLOW_LANGUAGE=EN` | なし | `'en'` |
| CFG-006 | getWorkflowLanguage_混合ケースJa_jaに正規化 | 混合ケース入力が正規化されることを検証 | `AI_WORKFLOW_LANGUAGE=Ja` | なし | `'ja'` |

**テストコード例**:
```typescript
describe('大文字小文字正規化', () => {
  test('AI_WORKFLOW_LANGUAGE=JA の場合、ja に正規化される', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'JA';
    const result = config.getWorkflowLanguage();
    expect(result).toBe('ja');
  });

  test('AI_WORKFLOW_LANGUAGE=EN の場合、en に正規化される', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'EN';
    const result = config.getWorkflowLanguage();
    expect(result).toBe('en');
  });

  test('AI_WORKFLOW_LANGUAGE=Ja の場合、ja に正規化される', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'Ja';
    const result = config.getWorkflowLanguage();
    expect(result).toBe('ja');
  });
});
```

#### 2.1.3 異常系・エッジケーステストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| CFG-007 | getWorkflowLanguage_不正値fr_nullを返す | 許可外の値が無視されることを検証 | `AI_WORKFLOW_LANGUAGE=fr` | なし | `null` |
| CFG-008 | getWorkflowLanguage_空文字_nullを返す | 空文字が無視されることを検証 | `AI_WORKFLOW_LANGUAGE=` | なし | `null` |
| CFG-009 | getWorkflowLanguage_空白文字_nullを返す | 空白のみが無視されることを検証 | `AI_WORKFLOW_LANGUAGE=   ` | なし | `null` |
| CFG-010 | getWorkflowLanguage_前後空白あり_正規化される | 前後の空白がトリムされることを検証 | `AI_WORKFLOW_LANGUAGE= ja ` | なし | `'ja'` |
| CFG-011 | getWorkflowLanguage_japanese_nullを返す | 許可外の完全な値が無視されることを検証 | `AI_WORKFLOW_LANGUAGE=japanese` | なし | `null` |

**テストコード例**:
```typescript
describe('異常系・エッジケース', () => {
  test('AI_WORKFLOW_LANGUAGE=fr の場合、null を返す（許可外の値）', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'fr';
    const result = config.getWorkflowLanguage();
    expect(result).toBeNull();
  });

  test('AI_WORKFLOW_LANGUAGE が空文字の場合、null を返す', () => {
    process.env.AI_WORKFLOW_LANGUAGE = '';
    const result = config.getWorkflowLanguage();
    expect(result).toBeNull();
  });

  test('AI_WORKFLOW_LANGUAGE が空白のみの場合、null を返す', () => {
    process.env.AI_WORKFLOW_LANGUAGE = '   ';
    const result = config.getWorkflowLanguage();
    expect(result).toBeNull();
  });

  test('AI_WORKFLOW_LANGUAGE=" ja " の場合、トリムされて ja を返す', () => {
    process.env.AI_WORKFLOW_LANGUAGE = ' ja ';
    const result = config.getWorkflowLanguage();
    expect(result).toBe('ja');
  });

  test('AI_WORKFLOW_LANGUAGE=japanese の場合、null を返す', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'japanese';
    const result = config.getWorkflowLanguage();
    expect(result).toBeNull();
  });
});
```

---

### 2.2 options-parser.ts - 言語オプションパース・バリデーションテスト

**テストファイル**: `tests/unit/commands/execute/options-parser.test.ts`（既存ファイル拡張）

#### 2.2.1 parseExecuteOptions() - 言語パーステストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| OPT-001 | parseExecuteOptions_languageJa_jaを返す | `--language ja` が正しくパースされることを検証 | なし | `{ issue: '123', language: 'ja' }` | `language: 'ja'` |
| OPT-002 | parseExecuteOptions_languageEn_enを返す | `--language en` が正しくパースされることを検証 | なし | `{ issue: '123', language: 'en' }` | `language: 'en'` |
| OPT-003 | parseExecuteOptions_language未指定_undefinedを返す | 未指定時は `undefined` を返すことを検証 | なし | `{ issue: '123' }` | `language: undefined` |
| OPT-004 | parseExecuteOptions_languageJA大文字_jaに正規化 | 大文字入力が正規化されることを検証 | なし | `{ issue: '123', language: 'JA' }` | `language: 'ja'` |
| OPT-005 | parseExecuteOptions_language空白あり_トリムされる | 前後の空白がトリムされることを検証 | なし | `{ issue: '123', language: ' en ' }` | `language: 'en'` |

**テストコード例**:
```typescript
describe('parseExecuteOptions - 言語オプション（Issue #489）', () => {
  describe('正常系', () => {
    test('language=ja の場合、正しくパースされる', () => {
      // Given: オプションオブジェクト
      const options: ExecuteCommandOptions = {
        issue: '123',
        language: 'ja',
      };

      // When: パース実行
      const result = parseExecuteOptions(options);

      // Then: language が 'ja' としてパースされる
      expect(result.language).toBe('ja');
    });

    test('language=en の場合、正しくパースされる', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: 'en' };
      const result = parseExecuteOptions(options);
      expect(result.language).toBe('en');
    });

    test('language 未指定の場合、undefined を返す', () => {
      const options: ExecuteCommandOptions = { issue: '123' };
      const result = parseExecuteOptions(options);
      expect(result.language).toBeUndefined();
    });
  });

  describe('正規化', () => {
    test('language=JA（大文字）の場合、ja に正規化される', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: 'JA' };
      const result = parseExecuteOptions(options);
      expect(result.language).toBe('ja');
    });

    test('language=" en "（空白あり）の場合、トリムされて en を返す', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: ' en ' };
      const result = parseExecuteOptions(options);
      expect(result.language).toBe('en');
    });
  });
});
```

#### 2.2.2 validateExecuteOptions() - 言語バリデーションテストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| VAL-001 | validateExecuteOptions_languageJa_エラーなし | 有効値 `ja` でエラーがないことを検証 | なし | `{ language: 'ja' }` | エラーなし（空配列） |
| VAL-002 | validateExecuteOptions_languageEn_エラーなし | 有効値 `en` でエラーがないことを検証 | なし | `{ language: 'en' }` | エラーなし（空配列） |
| VAL-003 | validateExecuteOptions_languageFr_エラーあり | 無効値 `fr` でエラーが発生することを検証 | なし | `{ language: 'fr' }` | `"Option '--language' must be one of: ja, en."` |
| VAL-004 | validateExecuteOptions_languageEmpty_エラーあり | 空文字でエラーが発生することを検証 | なし | `{ language: '' }` | エラーメッセージ含む |
| VAL-005 | validateExecuteOptions_language未指定_エラーなし | 未指定時はエラーがないことを検証 | なし | `{}` | エラーなし（空配列） |

**テストコード例**:
```typescript
describe('validateExecuteOptions - 言語バリデーション（Issue #489）', () => {
  describe('有効値', () => {
    test('language=ja の場合、エラーなし', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: 'ja' };
      const errors = validateExecuteOptions(options);
      expect(errors.filter(e => e.includes('language'))).toHaveLength(0);
    });

    test('language=en の場合、エラーなし', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: 'en' };
      const errors = validateExecuteOptions(options);
      expect(errors.filter(e => e.includes('language'))).toHaveLength(0);
    });

    test('language 未指定の場合、エラーなし', () => {
      const options: ExecuteCommandOptions = { issue: '123' };
      const errors = validateExecuteOptions(options);
      expect(errors.filter(e => e.includes('language'))).toHaveLength(0);
    });
  });

  describe('無効値', () => {
    test('language=fr の場合、バリデーションエラー', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: 'fr' };
      const errors = validateExecuteOptions(options);
      expect(errors).toContain("Option '--language' must be one of: ja, en.");
    });

    test('language が空文字の場合、バリデーションエラー', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: '' };
      const errors = validateExecuteOptions(options);
      expect(errors.some(e => e.includes('language'))).toBe(true);
    });

    test('language=japanese の場合、バリデーションエラー', () => {
      const options: ExecuteCommandOptions = { issue: '123', language: 'japanese' };
      const errors = validateExecuteOptions(options);
      expect(errors).toContain("Option '--language' must be one of: ja, en.");
    });
  });
});
```

---

### 2.3 metadata-manager.ts - 言語getter/setterテスト

**テストファイル**: `tests/unit/metadata-manager.test.ts`（既存ファイル拡張）

#### 2.3.1 setLanguage() テストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| META-001 | setLanguage_ja_メタデータに保存される | `ja` が正しく保存されることを検証 | MetadataManager初期化済み | `'ja'` | `metadata.language === 'ja'` |
| META-002 | setLanguage_en_メタデータに保存される | `en` が正しく保存されることを検証 | MetadataManager初期化済み | `'en'` | `metadata.language === 'en'` |
| META-003 | setLanguage_呼び出し後_saveが実行される | 保存処理が実行されることを検証 | MetadataManager初期化済み | `'ja'` | `save()` が呼び出される |

**テストコード例**:
```typescript
describe('MetadataManager - setLanguage()（Issue #489）', () => {
  let metadataManager: MetadataManager;
  let writeJsonSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    // モックセットアップ
    writeJsonSyncSpy = jest.spyOn(fs, 'writeJsonSync').mockImplementation(() => {});
    // ... その他のモック
    metadataManager = new MetadataManager(/* 必要なパラメータ */);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('setLanguage("ja") でメタデータに ja が保存される', () => {
    // When: setLanguage を呼び出す
    metadataManager.setLanguage('ja');

    // Then: メタデータに language が設定される
    expect(metadataManager.getLanguage()).toBe('ja');
  });

  test('setLanguage("en") でメタデータに en が保存される', () => {
    metadataManager.setLanguage('en');
    expect(metadataManager.getLanguage()).toBe('en');
  });

  test('setLanguage 呼び出し後、save() が実行される', () => {
    metadataManager.setLanguage('ja');
    expect(writeJsonSyncSpy).toHaveBeenCalled();
  });
});
```

#### 2.3.2 getLanguage() テストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| META-004 | getLanguage_ja保存済み_jaを返す | 保存された `ja` が取得できることを検証 | `language: 'ja'` がメタデータに存在 | なし | `'ja'` |
| META-005 | getLanguage_en保存済み_enを返す | 保存された `en` が取得できることを検証 | `language: 'en'` がメタデータに存在 | なし | `'en'` |
| META-006 | getLanguage_未設定_nullを返す | 未設定時に `null` を返すことを検証 | `language` フィールドなし | なし | `null` |
| META-007 | getLanguage_nullが保存_nullを返す | `null` が保存されている場合の動作を検証 | `language: null` がメタデータに存在 | なし | `null` |

**テストコード例**:
```typescript
describe('MetadataManager - getLanguage()（Issue #489）', () => {
  describe('保存済みの値がある場合', () => {
    test('language=ja が保存されている場合、ja を返す', () => {
      // Given: メタデータに language: 'ja' が存在
      jest.spyOn(fs, 'readJsonSync').mockReturnValue({
        issue_number: '489',
        language: 'ja',
      });
      const metadataManager = new MetadataManager(/* パラメータ */);

      // When: getLanguage を呼び出す
      const result = metadataManager.getLanguage();

      // Then: 'ja' が返される
      expect(result).toBe('ja');
    });

    test('language=en が保存されている場合、en を返す', () => {
      jest.spyOn(fs, 'readJsonSync').mockReturnValue({
        issue_number: '489',
        language: 'en',
      });
      const metadataManager = new MetadataManager(/* パラメータ */);
      expect(metadataManager.getLanguage()).toBe('en');
    });
  });

  describe('後方互換性', () => {
    test('language フィールドが存在しない場合、null を返す', () => {
      // Given: 既存メタデータに language フィールドがない
      jest.spyOn(fs, 'readJsonSync').mockReturnValue({
        issue_number: '489',
        // language フィールドなし
      });
      const metadataManager = new MetadataManager(/* パラメータ */);

      // When: getLanguage を呼び出す
      const result = metadataManager.getLanguage();

      // Then: null が返される（フォールバックは呼び出し元で処理）
      expect(result).toBeNull();
    });

    test('language=null が保存されている場合、null を返す', () => {
      jest.spyOn(fs, 'readJsonSync').mockReturnValue({
        issue_number: '489',
        language: null,
      });
      const metadataManager = new MetadataManager(/* パラメータ */);
      expect(metadataManager.getLanguage()).toBeNull();
    });
  });
});
```

---

### 2.4 resolveWorkflowLanguage() - 優先順位ロジックテスト

**テストファイル**: `tests/unit/commands/execute/resolve-language.test.ts`（新規作成 または `execute.test.ts` に追加）

#### 2.4.1 優先順位テストケース

| ID | テストケース名 | 目的 | 前提条件 | 入力 | 期待結果 |
|----|---------------|------|---------|------|---------|
| RES-001 | resolveWorkflowLanguage_CLI指定あり_CLIが優先 | CLIオプションが最優先であることを検証 | CLI=en, ENV=ja, META=ja | `cliLanguage: 'en'` | `'en'` |
| RES-002 | resolveWorkflowLanguage_CLI未指定ENV指定_ENVが優先 | 環境変数が2番目であることを検証 | CLI=なし, ENV=en, META=ja | `cliLanguage: undefined` | `'en'` |
| RES-003 | resolveWorkflowLanguage_CLIENV未指定META指定_METAが優先 | メタデータが3番目であることを検証 | CLI=なし, ENV=なし, META=en | `cliLanguage: undefined` | `'en'` |
| RES-004 | resolveWorkflowLanguage_全て未指定_デフォルトja | デフォルト値 `ja` が使用されることを検証 | CLI=なし, ENV=なし, META=なし | `cliLanguage: undefined` | `'ja'` |

**テストコード例**:
```typescript
describe('resolveWorkflowLanguage - 優先順位ロジック（Issue #489）', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockMetadataManager: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockMetadataManager = {
      getLanguage: jest.fn(),
    } as unknown as jest.Mocked<MetadataManager>;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('CLI > ENV > META > デフォルト: CLI指定ありの場合、CLIの値を使用', () => {
    // Given: CLI=en, ENV=ja, META=ja
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    mockMetadataManager.getLanguage.mockReturnValue('ja');

    // When: CLI言語を 'en' で解決
    const result = resolveWorkflowLanguage('en', mockMetadataManager);

    // Then: CLI の 'en' が返される
    expect(result).toBe('en');
  });

  test('CLI未指定の場合、環境変数の値を使用', () => {
    // Given: CLI=なし, ENV=en, META=ja
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    mockMetadataManager.getLanguage.mockReturnValue('ja');

    // When: CLI言語を undefined で解決
    const result = resolveWorkflowLanguage(undefined, mockMetadataManager);

    // Then: ENV の 'en' が返される
    expect(result).toBe('en');
  });

  test('CLI・ENV未指定の場合、メタデータの値を使用', () => {
    // Given: CLI=なし, ENV=なし, META=en
    delete process.env.AI_WORKFLOW_LANGUAGE;
    mockMetadataManager.getLanguage.mockReturnValue('en');

    // When: CLI言語を undefined で解決
    const result = resolveWorkflowLanguage(undefined, mockMetadataManager);

    // Then: META の 'en' が返される
    expect(result).toBe('en');
  });

  test('全て未指定の場合、デフォルト値 "ja" を使用', () => {
    // Given: CLI=なし, ENV=なし, META=なし
    delete process.env.AI_WORKFLOW_LANGUAGE;
    mockMetadataManager.getLanguage.mockReturnValue(null);

    // When: CLI言語を undefined で解決
    const result = resolveWorkflowLanguage(undefined, mockMetadataManager);

    // Then: デフォルト 'ja' が返される
    expect(result).toBe('ja');
  });

  test('メタデータマネージャーが null の場合、デフォルト値を使用', () => {
    // Given: MetadataManager が null
    delete process.env.AI_WORKFLOW_LANGUAGE;

    // When: MetadataManager を null で呼び出す
    const result = resolveWorkflowLanguage(undefined, null);

    // Then: デフォルト 'ja' が返される
    expect(result).toBe('ja');
  });
});
```

---

## 3. Integrationテストシナリオ

**テストファイル**: `tests/integration/language-setting.test.ts`（新規作成）

### 3.1 CLI → メタデータ保存 → 再読み込みフロー

#### シナリオ名: init コマンドでの言語設定の永続化

| ID | シナリオ | 目的 | 前提条件 | テスト手順 | 期待結果 | 確認項目 |
|----|---------|------|---------|-----------|---------|---------|
| INT-001 | init --language ja でメタデータに保存 | init時の言語保存を検証 | 一時ディレクトリ作成済み | 1. `init --language ja` 実行 2. メタデータ読み込み | `metadata.language === 'ja'` | ファイル存在、フィールド値 |
| INT-002 | init --language en でメタデータに保存 | init時の言語保存を検証 | 一時ディレクトリ作成済み | 1. `init --language en` 実行 2. メタデータ読み込み | `metadata.language === 'en'` | ファイル存在、フィールド値 |
| INT-003 | init 後の execute で言語が引き継がれる | 言語の引き継ぎを検証 | init --language en 実行済み | 1. `execute --issue 489` 実行 2. PhaseContext確認 | `context.language === 'en'` | コンテキスト値 |

**テストコード例**:
```typescript
describe('Language Setting Integration Tests（Issue #489）', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lang-test-'));
    process.chdir(tempDir);
    // Git初期化など必要なセットアップ
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('init コマンドでの言語設定', () => {
    test('--language ja でメタデータに language: "ja" が保存される', async () => {
      // Given: 新規ワークフロー

      // When: init --language ja を実行
      await executeCommand(['init', '--issue-url', 'https://github.com/test/test/issues/1', '--language', 'ja']);

      // Then: メタデータに language が保存される
      const metadata = await fs.readJson(path.join(tempDir, '.ai-workflow/issue-1/metadata.json'));
      expect(metadata.language).toBe('ja');
    });

    test('--language en でメタデータに language: "en" が保存される', async () => {
      await executeCommand(['init', '--issue-url', 'https://github.com/test/test/issues/1', '--language', 'en']);

      const metadata = await fs.readJson(path.join(tempDir, '.ai-workflow/issue-1/metadata.json'));
      expect(metadata.language).toBe('en');
    });
  });
});
```

### 3.2 環境変数優先順位フロー

#### シナリオ名: 環境変数とCLIオプションの優先順位

| ID | シナリオ | 目的 | 前提条件 | テスト手順 | 期待結果 | 確認項目 |
|----|---------|------|---------|-----------|---------|---------|
| INT-004 | CLI > ENV: CLI指定がENVより優先 | CLIが最優先であることを検証 | ENV=ja | 1. `execute --language en` 実行 | 言語設定が `en` | 実行時言語 |
| INT-005 | ENV > META: ENV指定がMETAより優先 | ENVが2番目であることを検証 | ENV=en, META=ja | 1. `execute` 実行 | 言語設定が `en` | 実行時言語 |
| INT-006 | META > DEFAULT: META指定がデフォルトより優先 | METAが3番目であることを検証 | ENV=なし, META=en | 1. `execute` 実行 | 言語設定が `en` | 実行時言語 |

**テストコード例**:
```typescript
describe('優先順位テスト', () => {
  test('CLI > ENV: CLIオプションが環境変数より優先される', async () => {
    // Given: 環境変数が設定されている
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';

    // When: CLI で --language en を指定
    const result = await executeCommand(['execute', '--issue', '489', '--language', 'en']);

    // Then: 言語設定は CLI の 'en' になる
    expect(result.language).toBe('en');
  });

  test('ENV > META: 環境変数がメタデータより優先される', async () => {
    // Given: メタデータに language: 'ja' がある
    await setupMetadataWithLanguage('ja');
    process.env.AI_WORKFLOW_LANGUAGE = 'en';

    // When: CLI オプションなしで execute
    const result = await executeCommand(['execute', '--issue', '489']);

    // Then: 言語設定は ENV の 'en' になる
    expect(result.language).toBe('en');
  });
});
```

### 3.3 後方互換性フロー

#### シナリオ名: 既存メタデータ（languageフィールドなし）との互換性

| ID | シナリオ | 目的 | 前提条件 | テスト手順 | 期待結果 | 確認項目 |
|----|---------|------|---------|-----------|---------|---------|
| INT-007 | 既存メタデータで language なし → デフォルト ja | 後方互換性を検証 | 既存メタデータ（languageなし） | 1. `execute` 実行 | 言語設定が `ja` | デフォルト動作 |
| INT-008 | 既存メタデータに language 追加可能 | 既存メタデータへの追加を検証 | 既存メタデータ（languageなし） | 1. `execute --language en` 実行 | `metadata.language === 'en'` | フィールド追加 |
| INT-009 | 既存フィールドが破壊されない | 他フィールドへの影響を検証 | 既存メタデータ | 1. `setLanguage()` 実行 | 他フィールド変更なし | 既存フィールド |

**テストコード例**:
```typescript
describe('後方互換性テスト', () => {
  test('language フィールドがない既存メタデータでデフォルト ja が使用される', async () => {
    // Given: language フィールドがない既存メタデータ
    const existingMetadata = {
      issue_number: '100',
      issue_url: 'https://github.com/test/test/issues/100',
      current_phase: 'planning',
      // language フィールドなし
    };
    await fs.writeJson(path.join(tempDir, '.ai-workflow/issue-100/metadata.json'), existingMetadata);

    // When: execute を実行
    const result = await executeCommand(['execute', '--issue', '100']);

    // Then: デフォルト言語 'ja' が使用される
    expect(result.language).toBe('ja');
  });

  test('既存メタデータに language フィールドを追加しても他のフィールドは保持される', async () => {
    // Given: 既存メタデータ
    const existingMetadata = {
      issue_number: '100',
      issue_url: 'https://github.com/test/test/issues/100',
      current_phase: 'design',
      cost_tracking: { total: 100 },
    };
    await fs.writeJson(path.join(tempDir, '.ai-workflow/issue-100/metadata.json'), existingMetadata);

    // When: execute --language en を実行
    await executeCommand(['execute', '--issue', '100', '--language', 'en']);

    // Then: 既存フィールドが保持され、language が追加される
    const metadata = await fs.readJson(path.join(tempDir, '.ai-workflow/issue-100/metadata.json'));
    expect(metadata.issue_number).toBe('100');
    expect(metadata.current_phase).toBe('design');
    expect(metadata.cost_tracking.total).toBe(100);
    expect(metadata.language).toBe('en');
  });
});
```

### 3.4 エラーハンドリングフロー

#### シナリオ名: 不正な言語値の入力

| ID | シナリオ | 目的 | 前提条件 | テスト手順 | 期待結果 | 確認項目 |
|----|---------|------|---------|-----------|---------|---------|
| INT-010 | --language fr でバリデーションエラー | 無効値のエラーを検証 | なし | 1. `execute --language fr` 実行 | エラーメッセージ表示 | エラー内容 |
| INT-011 | エラーメッセージに許可値が含まれる | ユーザーフレンドリーなエラーを検証 | なし | 1. `execute --language xyz` 実行 | `ja|en` が含まれる | メッセージ内容 |

**テストコード例**:
```typescript
describe('エラーハンドリング', () => {
  test('--language fr を指定するとバリデーションエラーが発生する', async () => {
    // When: 無効な言語を指定
    const result = await executeCommand(['execute', '--issue', '489', '--language', 'fr']);

    // Then: エラーが発生し、許可値が表示される
    expect(result.error).toBeDefined();
    expect(result.error).toContain('ja');
    expect(result.error).toContain('en');
  });
});
```

---

## 4. テストデータ

### 4.1 正常データ

| データ名 | 値 | 用途 |
|---------|-----|------|
| 有効言語_ja | `'ja'` | 日本語設定のテスト |
| 有効言語_en | `'en'` | 英語設定のテスト |
| 大文字言語_JA | `'JA'` | 大文字正規化テスト |
| 大文字言語_EN | `'EN'` | 大文字正規化テスト |
| 混合ケース_Ja | `'Ja'` | 混合ケース正規化テスト |

### 4.2 異常データ

| データ名 | 値 | 用途 |
|---------|-----|------|
| 無効言語_fr | `'fr'` | 許可外言語のバリデーションテスト |
| 無効言語_japanese | `'japanese'` | 長い無効値のバリデーションテスト |
| 空文字 | `''` | 空文字ハンドリングテスト |
| 空白のみ | `'   '` | 空白のみハンドリングテスト |
| null | `null` | nullハンドリングテスト |
| undefined | `undefined` | 未定義ハンドリングテスト |

### 4.3 境界値データ

| データ名 | 値 | 用途 |
|---------|-----|------|
| 前後空白あり_ja | `' ja '` | トリム処理テスト |
| 前後空白あり_en | `' en '` | トリム処理テスト |

### 4.4 既存メタデータテンプレート

```json
{
  "issue_number": "100",
  "issue_url": "https://github.com/test/test/issues/100",
  "issue_title": "Test Issue",
  "workflow_version": "0.1.0",
  "current_phase": "planning",
  "design_decisions": {},
  "cost_tracking": { "total": 0 }
}
```

### 4.5 言語設定済みメタデータテンプレート

```json
{
  "issue_number": "489",
  "issue_url": "https://github.com/tielec/ai-workflow-agent/issues/489",
  "issue_title": "[Enhancement] CLI全コマンドに--language/AI_WORKFLOW_LANGUAGEを追加",
  "workflow_version": "0.1.0",
  "current_phase": "planning",
  "language": "en",
  "design_decisions": {},
  "cost_tracking": { "total": 0 }
}
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

| 環境 | 要件 | 備考 |
|------|------|------|
| ローカル | Node.js 18以上 | 開発環境での実行 |
| CI/CD | GitHub Actions | PRマージ前のテスト実行 |

### 5.2 必要な外部サービス・データベース

| サービス | 必要性 | 備考 |
|---------|--------|------|
| GitHub API | Integrationテストでモック使用 | 実際のAPI呼び出しは不要 |
| ファイルシステム | 必須 | 一時ディレクトリを使用 |

### 5.3 モック/スタブの必要性

| 対象 | モック方法 | 用途 |
|------|-----------|------|
| `process.env` | 直接操作 + バックアップ/リストア | 環境変数テスト |
| `fs` モジュール | `jest.spyOn()` | ファイル操作のモック |
| `MetadataManager` | `jest.mock()` または手動モック | 優先順位テスト |
| `WorkflowState` | `jest.spyOn()` | 状態管理のモック |

---

## 6. 品質ゲート確認

### Phase 3: テストシナリオ

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATIONに基づき、Unitテスト（セクション2）とIntegrationテスト（セクション3）を作成
- [x] **主要な正常系がカバーされている**:
  - 有効言語値（ja, en）のパース・保存・取得
  - 優先順位ロジック（CLI > ENV > META > デフォルト）
  - 後方互換性（既存メタデータ対応）
- [x] **主要な異常系がカバーされている**:
  - 無効言語値（fr, japanese等）のバリデーションエラー
  - 空文字、空白のみ、nullのハンドリング
- [x] **期待結果が明確である**: 各テストケースに具体的な期待結果を記載

---

## 7. テストケースサマリー

### 7.1 Unitテスト一覧

| カテゴリ | テストケース数 | 対象ファイル |
|---------|---------------|-------------|
| config.getWorkflowLanguage() | 11 | `tests/unit/core/config.test.ts` |
| parseExecuteOptions() - 言語 | 5 | `tests/unit/commands/execute/options-parser.test.ts` |
| validateExecuteOptions() - 言語 | 5 | `tests/unit/commands/execute/options-parser.test.ts` |
| metadata-manager.setLanguage() | 3 | `tests/unit/metadata-manager.test.ts` |
| metadata-manager.getLanguage() | 4 | `tests/unit/metadata-manager.test.ts` |
| resolveWorkflowLanguage() | 5 | `tests/unit/commands/execute/resolve-language.test.ts` |
| **合計** | **33** | |

### 7.2 Integrationテスト一覧

| カテゴリ | テストケース数 | 対象ファイル |
|---------|---------------|-------------|
| init コマンド言語設定 | 3 | `tests/integration/language-setting.test.ts` |
| 優先順位フロー | 3 | `tests/integration/language-setting.test.ts` |
| 後方互換性フロー | 3 | `tests/integration/language-setting.test.ts` |
| エラーハンドリング | 2 | `tests/integration/language-setting.test.ts` |
| **合計** | **11** | |

### 7.3 総テストケース数

- **Unitテスト**: 33ケース
- **Integrationテスト**: 11ケース
- **合計**: 44ケース

---

**テストシナリオ作成日**: 2025-01-15
**対象Issue**: #489
**テストシナリオバージョン**: 1.0
