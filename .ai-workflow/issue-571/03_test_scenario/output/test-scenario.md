# テストシナリオ: Issue #571

## Implement prompt file switching based on language setting

---

## 0. テスト戦略サマリー

### 選択されたテスト戦略（Phase 2から引用）

**テスト戦略**: **UNIT_INTEGRATION**

**判断根拠**:
1. **ユニットテストが必要な理由**:
   - `loadPrompt()` のパス解決ロジックは単体でテスト可能
   - フォールバック動作の境界値テストが必要
   - `MetadataManager.getLanguage()` の単体テスト

2. **統合テストが必要な理由**:
   - 実際のプロンプトファイル構造での読み込み確認
   - 全10フェーズでの多言語切り替えの動作確認
   - ビルド後（`dist/prompts/`）の動作確認

3. **BDDテストが不要な理由**:
   - エンドユーザー向け機能ではなく、内部実装の拡張
   - ユーザーストーリーが存在しない

### テスト対象の範囲

| コンポーネント | テスト種別 | 優先度 |
|--------------|----------|-------|
| `MetadataManager.getLanguage()` | Unit | 高 |
| `BasePhase.loadPrompt()` | Unit | 高 |
| プロンプトファイル構造 | Integration | 高 |
| 全10フェーズの多言語切り替え | Integration | 中 |
| ビルド後の動作確認 | Integration | 中 |

### テストの目的

1. `loadPrompt()` メソッドが言語設定に基づいて正しいプロンプトファイルを読み込むことを検証
2. フォールバック機構が正常に動作することを検証
3. 既存の環境情報注入・差し戻しコンテキスト注入との互換性を検証
4. 全10フェーズで多言語切り替えが正常に動作することを検証

### テストカバレッジ目標

- ユニットテスト: 90%以上（ロジック部分）
- 統合テスト: 全10フェーズ × 2言語 × 3種類 = 60パターン

---

## 1. Unitテストシナリオ

### 1.1 MetadataManager.getLanguage() テスト

**テストファイル**: `tests/unit/core/metadata-manager-language.test.ts`

#### TC-571-U01: getLanguage() - 日本語設定の取得

| 項目 | 内容 |
|-----|------|
| **目的** | metadata.jsonのlanguageが'ja'の場合、'ja'が返されることを検証 |
| **前提条件** | MetadataManagerインスタンスが初期化済み |
| **入力** | `metadata.language = 'ja'` |
| **期待結果** | `getLanguage()` が `'ja'` を返す |
| **テストデータ** | `{ language: 'ja', issue_number: '571', ... }` |

```typescript
test('TC-571-U01: getLanguage() returns "ja" when metadata.language is "ja"', () => {
  // Given
  const mockState = {
    data: { language: 'ja', issue_number: '571' }
  };
  const metadataManager = new MetadataManager(mockState);

  // When
  const result = metadataManager.getLanguage();

  // Then
  expect(result).toBe('ja');
});
```

#### TC-571-U02: getLanguage() - 英語設定の取得

| 項目 | 内容 |
|-----|------|
| **目的** | metadata.jsonのlanguageが'en'の場合、'en'が返されることを検証 |
| **前提条件** | MetadataManagerインスタンスが初期化済み |
| **入力** | `metadata.language = 'en'` |
| **期待結果** | `getLanguage()` が `'en'` を返す |
| **テストデータ** | `{ language: 'en', issue_number: '571', ... }` |

```typescript
test('TC-571-U02: getLanguage() returns "en" when metadata.language is "en"', () => {
  // Given
  const mockState = {
    data: { language: 'en', issue_number: '571' }
  };
  const metadataManager = new MetadataManager(mockState);

  // When
  const result = metadataManager.getLanguage();

  // Then
  expect(result).toBe('en');
});
```

#### TC-571-U03: getLanguage() - 未定義時のデフォルト値

| 項目 | 内容 |
|-----|------|
| **目的** | metadata.languageが未定義の場合、デフォルト言語'ja'が返されることを検証 |
| **前提条件** | MetadataManagerインスタンスが初期化済み |
| **入力** | `metadata.language = undefined` |
| **期待結果** | `getLanguage()` が `'ja'` (DEFAULT_LANGUAGE) を返す |
| **テストデータ** | `{ issue_number: '571' }` (languageフィールドなし) |

```typescript
test('TC-571-U03: getLanguage() returns DEFAULT_LANGUAGE when metadata.language is undefined', () => {
  // Given
  const mockState = {
    data: { issue_number: '571' } // No language field
  };
  const metadataManager = new MetadataManager(mockState);

  // When
  const result = metadataManager.getLanguage();

  // Then
  expect(result).toBe('ja');
});
```

#### TC-571-U04: getLanguage() - 無効な言語コード

| 項目 | 内容 |
|-----|------|
| **目的** | metadata.languageが無効な値の場合、デフォルト言語にフォールバックすることを検証 |
| **前提条件** | MetadataManagerインスタンスが初期化済み |
| **入力** | `metadata.language = 'fr'` (サポートされていない言語) |
| **期待結果** | `getLanguage()` が `'ja'` (DEFAULT_LANGUAGE) を返す |
| **テストデータ** | `{ language: 'fr', issue_number: '571' }` |

```typescript
test('TC-571-U04: getLanguage() returns DEFAULT_LANGUAGE for unsupported language code', () => {
  // Given
  const mockState = {
    data: { language: 'fr', issue_number: '571' }
  };
  const metadataManager = new MetadataManager(mockState);

  // When
  const result = metadataManager.getLanguage();

  // Then
  expect(result).toBe('ja');
});
```

#### TC-571-U05: getLanguage() - パストラバーサル攻撃対策

| 項目 | 内容 |
|-----|------|
| **目的** | 悪意のある言語コードがデフォルト言語にフォールバックすることを検証 |
| **前提条件** | MetadataManagerインスタンスが初期化済み |
| **入力** | `metadata.language = '../../../etc/passwd'` |
| **期待結果** | `getLanguage()` が `'ja'` (DEFAULT_LANGUAGE) を返す |
| **テストデータ** | `{ language: '../../../etc/passwd', issue_number: '571' }` |

```typescript
test('TC-571-U05: getLanguage() prevents path traversal attack', () => {
  // Given
  const mockState = {
    data: { language: '../../../etc/passwd', issue_number: '571' }
  };
  const metadataManager = new MetadataManager(mockState);

  // When
  const result = metadataManager.getLanguage();

  // Then
  expect(result).toBe('ja'); // Fallback to safe default
});
```

---

### 1.2 BasePhase.loadPrompt() テスト

**テストファイル**: `tests/unit/phases/base-phase-language-switching.test.ts`

#### TC-571-U06: loadPrompt() - 日本語プロンプトの読み込み

| 項目 | 内容 |
|-----|------|
| **目的** | language='ja'の場合、ja/ディレクトリからプロンプトが読み込まれることを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- `src/prompts/planning/ja/execute.txt` が存在 |
| **入力** | `loadPrompt('execute')` with `language = 'ja'` |
| **期待結果** | `src/prompts/planning/ja/execute.txt` の内容が返される |
| **テストデータ** | テスト用プロンプトファイル |

```typescript
test('TC-571-U06: loadPrompt() loads Japanese prompt when language is "ja"', () => {
  // Given
  const mockMetadataManager = {
    getLanguage: () => 'ja'
  };
  const phase = new TestPhase(mockMetadataManager);

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).toContain('Japanese prompt content');
  // Verify the path resolution
  expect(fs.readFileSync).toHaveBeenCalledWith(
    expect.stringContaining('/planning/ja/execute.txt'),
    'utf-8'
  );
});
```

#### TC-571-U07: loadPrompt() - 英語プロンプトの読み込み

| 項目 | 内容 |
|-----|------|
| **目的** | language='en'の場合、en/ディレクトリからプロンプトが読み込まれることを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- `src/prompts/planning/en/execute.txt` が存在 |
| **入力** | `loadPrompt('execute')` with `language = 'en'` |
| **期待結果** | `src/prompts/planning/en/execute.txt` の内容が返される |
| **テストデータ** | テスト用プロンプトファイル |

```typescript
test('TC-571-U07: loadPrompt() loads English prompt when language is "en"', () => {
  // Given
  const mockMetadataManager = {
    getLanguage: () => 'en'
  };
  const phase = new TestPhase(mockMetadataManager);

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).toContain('English prompt content');
  expect(fs.readFileSync).toHaveBeenCalledWith(
    expect.stringContaining('/planning/en/execute.txt'),
    'utf-8'
  );
});
```

#### TC-571-U08: loadPrompt() - フォールバック動作（言語プロンプト欠落）

| 項目 | 内容 |
|-----|------|
| **目的** | 指定言語のプロンプトが存在しない場合、日本語にフォールバックすることを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- `src/prompts/planning/fr/execute.txt` が存在しない<br>- `src/prompts/planning/ja/execute.txt` が存在 |
| **入力** | `loadPrompt('execute')` with `language = 'fr'` |
| **期待結果** | - `src/prompts/planning/ja/execute.txt` の内容が返される<br>- WARNログが出力される |
| **テストデータ** | テスト用プロンプトファイル（jaのみ） |

```typescript
test('TC-571-U08: loadPrompt() falls back to Japanese when specified language prompt is missing', () => {
  // Given
  const mockMetadataManager = {
    getLanguage: () => 'fr'
  };
  const phase = new TestPhase(mockMetadataManager);
  // Mock: fr/execute.txt doesn't exist, ja/execute.txt exists

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).toContain('Japanese prompt content');
  expect(logger.warn).toHaveBeenCalledWith(
    expect.stringContaining("falling back to 'ja'")
  );
});
```

#### TC-571-U09: loadPrompt() - エラーハンドリング（デフォルト言語も欠落）

| 項目 | 内容 |
|-----|------|
| **目的** | デフォルト言語のプロンプトも存在しない場合、エラーがスローされることを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- `src/prompts/planning/ja/execute.txt` が存在しない |
| **入力** | `loadPrompt('execute')` with `language = 'en'` (en/も存在しない) |
| **期待結果** | - エラーがスローされる<br>- エラーメッセージにファイルパスが含まれる |
| **テストデータ** | プロンプトファイルなし |

```typescript
test('TC-571-U09: loadPrompt() throws error when both specified and default language prompts are missing', () => {
  // Given
  const mockMetadataManager = {
    getLanguage: () => 'en'
  };
  const phase = new TestPhase(mockMetadataManager);
  // Mock: Both en/execute.txt and ja/execute.txt don't exist

  // When & Then
  expect(() => phase.loadPrompt('execute')).toThrow(
    expect.stringContaining('Prompt file not found')
  );
  expect(() => phase.loadPrompt('execute')).toThrow(
    expect.stringContaining('fallback also failed')
  );
});
```

#### TC-571-U10: loadPrompt() - 環境情報注入との組み合わせ（execute）

| 項目 | 内容 |
|-----|------|
| **目的** | 言語切り替え後も環境情報注入（Issue #177）が正常に動作することを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- `AGENT_CAN_INSTALL_PACKAGES=true`<br>- 英語プロンプトが存在 |
| **入力** | `loadPrompt('execute')` with `language = 'en'` |
| **期待結果** | - 英語プロンプトが読み込まれる<br>- 環境情報セクションがプロンプトの先頭に追加される |
| **テストデータ** | 英語プロンプトファイル |

```typescript
test('TC-571-U10: loadPrompt() injects environment info into English execute prompt', () => {
  // Given
  const mockMetadataManager = {
    getLanguage: () => 'en'
  };
  const phase = new TestPhase(mockMetadataManager);
  process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

  // When
  const prompt = phase.loadPrompt('execute');

  // Then
  expect(prompt).toContain('## Development Environment');
  expect(prompt).toContain('English prompt content');
  expect(prompt.indexOf('Development Environment')).toBeLessThan(
    prompt.indexOf('English prompt content')
  );
});
```

#### TC-571-U11: loadPrompt() - 差し戻しコンテキスト注入との組み合わせ（revise）

| 項目 | 内容 |
|-----|------|
| **目的** | 言語切り替え後も差し戻しコンテキスト注入（Issue #90）が正常に動作することを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- 差し戻しコンテキストが存在<br>- 英語プロンプトが存在 |
| **入力** | `loadPrompt('revise')` with `language = 'en'` |
| **期待結果** | - 英語プロンプトが読み込まれる<br>- 差し戻しコンテキストセクションがプロンプトの先頭に追加される |
| **テストデータ** | 英語プロンプトファイル、差し戻しコンテキスト |

```typescript
test('TC-571-U11: loadPrompt() injects rollback context into English revise prompt', () => {
  // Given
  const mockRollbackContext = {
    from_phase: 'requirements',
    reason: 'Quality issues detected',
    details: { blocker_count: 2 }
  };
  const mockMetadataManager = {
    getLanguage: () => 'en',
    getRollbackContext: () => mockRollbackContext
  };
  const phase = new TestPhase(mockMetadataManager);

  // When
  const prompt = phase.loadPrompt('revise');

  // Then
  expect(prompt).toContain('## Rollback Context');
  expect(prompt).toContain('requirements');
  expect(prompt).toContain('English revise prompt content');
});
```

#### TC-571-U12: loadPrompt() - reviewプロンプトの読み込み

| 項目 | 内容 |
|-----|------|
| **目的** | reviewプロンプトも言語設定に基づいて正しく読み込まれることを検証 |
| **前提条件** | - BasePhaseインスタンスが初期化済み<br>- `src/prompts/planning/en/review.txt` が存在 |
| **入力** | `loadPrompt('review')` with `language = 'en'` |
| **期待結果** | `src/prompts/planning/en/review.txt` の内容が返される |
| **テストデータ** | テスト用プロンプトファイル |

```typescript
test('TC-571-U12: loadPrompt() loads English review prompt', () => {
  // Given
  const mockMetadataManager = {
    getLanguage: () => 'en'
  };
  const phase = new TestPhase(mockMetadataManager);

  // When
  const prompt = phase.loadPrompt('review');

  // Then
  expect(fs.readFileSync).toHaveBeenCalledWith(
    expect.stringContaining('/planning/en/review.txt'),
    'utf-8'
  );
});
```

---

### 1.3 型定義テスト

**テストファイル**: `tests/unit/types/language-types.test.ts`

#### TC-571-U13: Language型の定義確認

| 項目 | 内容 |
|-----|------|
| **目的** | Language型が'ja'と'en'のみを許容することを検証 |
| **前提条件** | `src/types.ts` がインポート可能 |
| **入力** | なし（型チェック） |
| **期待結果** | - `'ja'` と `'en'` は有効な Language 型<br>- 他の文字列は型エラー |
| **テストデータ** | なし |

```typescript
test('TC-571-U13: Language type accepts only "ja" and "en"', () => {
  // TypeScript compile-time check
  const jaLang: Language = 'ja'; // Should compile
  const enLang: Language = 'en'; // Should compile
  // const frLang: Language = 'fr'; // Should NOT compile

  expect(jaLang).toBe('ja');
  expect(enLang).toBe('en');
});
```

#### TC-571-U14: DEFAULT_LANGUAGE定数の値確認

| 項目 | 内容 |
|-----|------|
| **目的** | DEFAULT_LANGUAGE定数が'ja'であることを検証 |
| **前提条件** | `src/types.ts` がインポート可能 |
| **入力** | なし |
| **期待結果** | `DEFAULT_LANGUAGE === 'ja'` |
| **テストデータ** | なし |

```typescript
test('TC-571-U14: DEFAULT_LANGUAGE is "ja"', () => {
  expect(DEFAULT_LANGUAGE).toBe('ja');
});
```

---

## 2. Integrationテストシナリオ

**テストファイル**: `tests/integration/prompt-language-switching.test.ts`

### 2.1 プロンプトファイル構造確認テスト

#### TC-571-I01: 全10フェーズの日本語ディレクトリ構造確認

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | Japanese Prompt Directory Structure |
| **目的** | 全10フェーズに日本語プロンプトディレクトリが存在することを検証 |
| **前提条件** | `src/prompts/` ディレクトリが存在 |
| **テスト手順** | 1. 各フェーズの `ja/` ディレクトリを確認<br>2. `execute.txt`, `review.txt`, `revise.txt` の存在を確認 |
| **期待結果** | 10フェーズ × 3ファイル = 30ファイルが存在 |
| **確認項目** | planning, requirements, design, test_scenario, implementation, test_implementation, testing, documentation, report, evaluation |

```typescript
describe('TC-571-I01: Japanese prompt directory structure', () => {
  const phases = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];
  const promptTypes = ['execute', 'review', 'revise'];

  phases.forEach(phase => {
    promptTypes.forEach(type => {
      test(`${phase}/ja/${type}.txt exists`, () => {
        const filePath = path.join(promptsRoot, phase, 'ja', `${type}.txt`);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});
```

#### TC-571-I02: 全10フェーズの英語ディレクトリ構造確認

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | English Prompt Directory Structure |
| **目的** | 全10フェーズに英語プロンプトディレクトリが存在することを検証 |
| **前提条件** | `src/prompts/` ディレクトリが存在 |
| **テスト手順** | 1. 各フェーズの `en/` ディレクトリを確認<br>2. `execute.txt`, `review.txt`, `revise.txt` の存在を確認 |
| **期待結果** | 10フェーズ × 3ファイル = 30ファイルが存在 |
| **確認項目** | planning, requirements, design, test_scenario, implementation, test_implementation, testing, documentation, report, evaluation |

```typescript
describe('TC-571-I02: English prompt directory structure', () => {
  const phases = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];
  const promptTypes = ['execute', 'review', 'revise'];

  phases.forEach(phase => {
    promptTypes.forEach(type => {
      test(`${phase}/en/${type}.txt exists`, () => {
        const filePath = path.join(promptsRoot, phase, 'en', `${type}.txt`);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});
```

---

### 2.2 多言語プロンプト読み込みテスト

#### TC-571-I03: 全10フェーズで日本語プロンプトが読み込まれる

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | Japanese Prompt Loading for All Phases |
| **目的** | language='ja'設定時に、全フェーズで日本語プロンプトが正しく読み込まれることを検証 |
| **前提条件** | - 日本語プロンプトファイルが存在<br>- MetadataManagerがlanguage='ja'を返す |
| **テスト手順** | 1. language='ja'でMetadataManagerを設定<br>2. 各フェーズでloadPrompt()を呼び出し<br>3. 日本語プロンプトが読み込まれることを確認 |
| **期待結果** | 全10フェーズで日本語プロンプトが読み込まれる |
| **確認項目** | 各フェーズの execute/review/revise プロンプトが日本語であること |

```typescript
describe('TC-571-I03: Japanese prompt loading for all phases', () => {
  const phases = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];

  beforeEach(() => {
    // Set language to Japanese
    mockMetadataManager.getLanguage = () => 'ja';
  });

  phases.forEach(phaseName => {
    test(`${phaseName} phase loads Japanese prompts`, async () => {
      const phase = createPhase(phaseName);

      const executePrompt = phase.loadPrompt('execute');
      const reviewPrompt = phase.loadPrompt('review');
      const revisePrompt = phase.loadPrompt('revise');

      // Verify prompts are loaded from ja/ directory
      expect(executePrompt).toBeTruthy();
      expect(reviewPrompt).toBeTruthy();
      expect(revisePrompt).toBeTruthy();
      // Content should be in Japanese (contains Japanese characters or specific markers)
    });
  });
});
```

#### TC-571-I04: 全10フェーズで英語プロンプトが読み込まれる

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | English Prompt Loading for All Phases |
| **目的** | language='en'設定時に、全フェーズで英語プロンプトが正しく読み込まれることを検証 |
| **前提条件** | - 英語プロンプトファイルが存在<br>- MetadataManagerがlanguage='en'を返す |
| **テスト手順** | 1. language='en'でMetadataManagerを設定<br>2. 各フェーズでloadPrompt()を呼び出し<br>3. 英語プロンプトが読み込まれることを確認 |
| **期待結果** | 全10フェーズで英語プロンプトが読み込まれる |
| **確認項目** | 各フェーズの execute/review/revise プロンプトが英語であること |

```typescript
describe('TC-571-I04: English prompt loading for all phases', () => {
  const phases = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];

  beforeEach(() => {
    // Set language to English
    mockMetadataManager.getLanguage = () => 'en';
  });

  phases.forEach(phaseName => {
    test(`${phaseName} phase loads English prompts`, async () => {
      const phase = createPhase(phaseName);

      const executePrompt = phase.loadPrompt('execute');
      const reviewPrompt = phase.loadPrompt('review');
      const revisePrompt = phase.loadPrompt('revise');

      // Verify prompts are loaded from en/ directory
      expect(executePrompt).toBeTruthy();
      expect(reviewPrompt).toBeTruthy();
      expect(revisePrompt).toBeTruthy();
      // Content should be in English (no Japanese characters)
    });
  });
});
```

---

### 2.3 ビルド後のディレクトリ構造テスト

#### TC-571-I05: ビルド後の多言語ディレクトリ構造確認

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | Built Prompt Directory Structure |
| **目的** | npm run build後に、dist/prompts/に多言語構造がコピーされることを検証 |
| **前提条件** | `npm run build` が実行済み |
| **テスト手順** | 1. `npm run build` を実行<br>2. `dist/prompts/{phase}/ja/` の存在を確認<br>3. `dist/prompts/{phase}/en/` の存在を確認<br>4. ファイル内容が `src/prompts/` と一致することを確認 |
| **期待結果** | dist/prompts/ に多言語ディレクトリ構造が存在し、内容がsrcと一致 |
| **確認項目** | 全10フェーズのja/とen/ディレクトリ |

```typescript
describe('TC-571-I05: Built prompt directory structure', () => {
  beforeAll(async () => {
    // Run build
    await execAsync('npm run build');
  });

  const phases = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];
  const languages = ['ja', 'en'];
  const promptTypes = ['execute', 'review', 'revise'];

  phases.forEach(phase => {
    languages.forEach(lang => {
      promptTypes.forEach(type => {
        test(`dist/prompts/${phase}/${lang}/${type}.txt exists`, () => {
          const distPath = path.join(distDir, 'prompts', phase, lang, `${type}.txt`);
          const srcPath = path.join(srcDir, 'prompts', phase, lang, `${type}.txt`);

          expect(fs.existsSync(distPath)).toBe(true);

          // Verify content matches
          const distContent = fs.readFileSync(distPath, 'utf-8');
          const srcContent = fs.readFileSync(srcPath, 'utf-8');
          expect(distContent).toBe(srcContent);
        });
      });
    });
  });
});
```

---

### 2.4 フォールバック統合テスト

#### TC-571-I06: 存在しない言語からのフォールバック動作

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | Fallback Behavior Integration |
| **目的** | 存在しない言語設定時に、日本語へ正しくフォールバックすることを検証 |
| **前提条件** | - 日本語プロンプトが存在<br>- 指定言語（例: fr）のプロンプトが存在しない |
| **テスト手順** | 1. language='fr'でMetadataManagerを設定<br>2. loadPrompt()を呼び出し<br>3. 日本語プロンプトが読み込まれることを確認<br>4. WARNログが出力されることを確認 |
| **期待結果** | 日本語プロンプトが読み込まれ、警告ログが出力される |
| **確認項目** | - フォールバック成功<br>- ログ出力あり<br>- エラーなし |

```typescript
describe('TC-571-I06: Fallback behavior integration', () => {
  test('Falls back to Japanese when unsupported language is set', () => {
    // Given
    mockMetadataManager.getLanguage = () => 'fr';
    const phase = new PlanningPhase(mockMetadataManager, mockGitHubClient);
    const loggerWarnSpy = jest.spyOn(logger, 'warn');

    // When
    const prompt = phase.loadPrompt('execute');

    // Then
    expect(prompt).toBeTruthy();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("falling back to 'ja'")
    );
    // Verify content is Japanese
  });
});
```

---

### 2.5 回帰テスト

#### TC-571-I07: 既存テストの回帰確認

| 項目 | 内容 |
|-----|------|
| **シナリオ名** | Regression Test Suite |
| **目的** | プロンプトファイル構造変更後も、既存テストが全てパスすることを検証 |
| **前提条件** | プロンプトファイル構造が変更済み |
| **テスト手順** | 1. `npm test` を実行<br>2. 全テストがパスすることを確認 |
| **期待結果** | 既存のテストスイートが全てパス |
| **確認項目** | - ユニットテスト<br>- 統合テスト<br>- 既存のbase-phaseテスト |

```typescript
describe('TC-571-I07: Regression test verification', () => {
  test('All existing tests pass after prompt structure change', async () => {
    // This is a meta-test to verify the overall test suite
    // Actual verification is done by running npm test in CI/CD

    const result = await execAsync('npm test -- --passWithNoTests');
    expect(result.code).toBe(0);
  });
});
```

---

## 3. テストデータ

### 3.1 正常データ

| データ種別 | 値 | 用途 |
|----------|-----|-----|
| 日本語言語コード | `'ja'` | 日本語プロンプト読み込みテスト |
| 英語言語コード | `'en'` | 英語プロンプト読み込みテスト |
| 有効なmetadata | `{ language: 'ja', issue_number: '571' }` | 正常系テスト |
| 有効なmetadata (en) | `{ language: 'en', issue_number: '571' }` | 正常系テスト |

### 3.2 異常データ

| データ種別 | 値 | 用途 |
|----------|-----|-----|
| 未サポート言語コード | `'fr'` | フォールバックテスト |
| 未定義言語 | `undefined` | デフォルト値テスト |
| 空文字列 | `''` | 境界値テスト |
| 悪意のある入力 | `'../../../etc/passwd'` | セキュリティテスト |

### 3.3 境界値データ

| データ種別 | 値 | 用途 |
|----------|-----|-----|
| 空の言語コード | `''` | 空文字列の処理確認 |
| null値 | `null` | null処理の確認 |
| 長い文字列 | `'a'.repeat(1000)` | 長い入力の処理確認 |

### 3.4 テスト用プロンプトファイル

テストで使用するモック用プロンプトファイルの内容：

**日本語プロンプト（`tests/fixtures/prompts/planning/ja/execute.txt`）**:
```
# プランニングフェーズ - 実行プロンプト
これは日本語のテスト用プロンプトです。
```

**英語プロンプト（`tests/fixtures/prompts/planning/en/execute.txt`）**:
```
# Planning Phase - Execute Prompt
This is an English test prompt.
```

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

| 環境 | 説明 |
|-----|------|
| **ローカル開発環境** | Node.js 18以上、npm |
| **CI/CD環境** | GitHub Actions |
| **テストフレームワーク** | Jest |

### 4.2 必要な外部サービス・データベース

| サービス | 必要性 | 備考 |
|--------|-------|-----|
| ファイルシステム | 必須 | プロンプトファイルの読み込み |
| GitHub API | 不要 | モックで対応 |
| LLM API | 不要 | モックで対応 |

### 4.3 モック/スタブの必要性

| コンポーネント | モック種別 | 説明 |
|--------------|----------|-----|
| MetadataManager | モック | `getLanguage()` の戻り値を制御 |
| GitHubClient | モック | テストでは不要 |
| Logger | スパイ | ログ出力の検証 |
| fs.existsSync | モック（一部） | ファイル存在確認の制御 |
| fs.readFileSync | モック（一部） | ファイル読み込みの制御 |

---

## 5. テスト実行コマンド

### 5.1 ユニットテスト

```bash
# 多言語関連ユニットテストのみ
npm run test:unit -- --testPathPattern="language-switching|metadata-manager-language"

# 全ユニットテスト
npm run test:unit
```

### 5.2 統合テスト

```bash
# 多言語関連統合テストのみ
npm run test:integration -- --testPathPattern="prompt-language-switching"

# 全統合テスト
npm run test:integration
```

### 5.3 全テスト

```bash
npm test
```

---

## 6. 受け入れ基準との対応

| 受け入れ基準 | テストケース | カバレッジ |
|------------|------------|----------|
| AC-001: 日本語プロンプトの読み込み | TC-571-U06, TC-571-I03 | ✓ |
| AC-002: 英語プロンプトの読み込み | TC-571-U07, TC-571-I04 | ✓ |
| AC-003: フォールバック動作 | TC-571-U08, TC-571-I06 | ✓ |
| AC-004: エラーハンドリング | TC-571-U09 | ✓ |
| AC-005: ビルド後のディレクトリ構造 | TC-571-I05 | ✓ |
| AC-006: 全10フェーズでの多言語切り替え | TC-571-I03, TC-571-I04 | ✓ |
| AC-007: 既存テストの回帰なし | TC-571-I07 | ✓ |

---

## 品質ゲート（Phase 3）チェックリスト

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテスト14件、統合テスト7件を定義
- [x] **主要な正常系がカバーされている**: 日本語/英語プロンプト読み込み、全10フェーズでの動作確認
- [x] **主要な異常系がカバーされている**: フォールバック動作、エラーハンドリング、セキュリティ対策
- [x] **期待結果が明確である**: 各テストケースで具体的な期待結果を記載

---

## 関連Issue・PR

- **Issue #526**: 言語設定オプションの実装（解決ロジック・永続化）
- **PR #568**: Issue #526の実装
- **Issue #177**: 環境情報注入（関連する既存実装）
- **Issue #90**: 差し戻しコンテキスト注入（関連する既存実装）
- **Planning Document**: `.ai-workflow/issue-571/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-571/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-571/02_design/output/design.md`

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-01-XX | 初版作成 |
