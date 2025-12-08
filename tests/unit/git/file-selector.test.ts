/**
 * Unit tests for FileSelector
 * Tests file selection and filtering logic
 */

// @ts-nocheck

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { FileSelector, isSecuritySensitiveFile, shouldExcludeDebugFile } from '../../../src/core/git/file-selector';
import { SimpleGit } from 'simple-git';

describe('FileSelector - getChangedFiles', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
  });

  test('getChangedFiles_正常系_変更ファイルを正しく取得', async () => {
    // Given: Git statusで複数のステータスが返される
    mockGit.status.mockResolvedValue({
      not_added: ['src/new-file.ts'],
      created: ['src/created.ts'],
      modified: ['src/modified.ts'],
      staged: ['src/staged.ts'],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: すべての変更ファイルが取得される
    expect(files).toContain('src/new-file.ts');
    expect(files).toContain('src/created.ts');
    expect(files).toContain('src/modified.ts');
    expect(files).toContain('src/staged.ts');
    expect(files).toHaveLength(4);
  });

  test('getChangedFiles_正常系_@tmpを除外', async () => {
    // Given: @tmp を含むファイルが存在する
    mockGit.status.mockResolvedValue({
      modified: ['src/index.ts', 'src/@tmp/temp.ts', '.ai-workflow/issue-123/@tmp/log.txt'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: @tmp を含むファイルが除外される
    expect(files).toContain('src/index.ts');
    expect(files).not.toContain('src/@tmp/temp.ts');
    expect(files).not.toContain('.ai-workflow/issue-123/@tmp/log.txt');
    expect(files).toHaveLength(1);
  });

  test('getChangedFiles_境界値_重複ファイルの除去', async () => {
    // Given: 重複ファイルが複数のステータスに含まれる
    mockGit.status.mockResolvedValue({
      modified: ['src/index.ts'],
      staged: ['src/index.ts'],
      // FileStatusResult 型に準拠（path, index, working_dir を含むオブジェクト）
      files: [
        { path: 'src/index.ts', index: 'M', working_dir: 'M' },
        { path: 'src/other.ts', index: 'M', working_dir: 'M' }
      ],
      not_added: [],
      created: [],
      deleted: [],
      renamed: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: 重複が除去される
    expect(files).toContain('src/index.ts');
    expect(files).toContain('src/other.ts');
    expect(files).toHaveLength(2);
  });

  test('getChangedFiles_正常系_renamedファイルの処理', async () => {
    // Given: リネームされたファイルが存在する
    mockGit.status.mockResolvedValue({
      renamed: [{ from: 'old.ts', to: 'new.ts' }],
      modified: [],
      staged: [],
      not_added: [],
      created: [],
      deleted: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: rename.to が使用される
    expect(files).toContain('new.ts');
    expect(files).not.toContain('old.ts');
    expect(files).toHaveLength(1);
  });

  test('getChangedFiles_境界値_変更ファイルなし', async () => {
    // Given: すべてのステータスが空
    mockGit.status.mockResolvedValue({
      modified: [],
      staged: [],
      not_added: [],
      created: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: 空配列が返される
    expect(files).toEqual([]);
  });
});

describe('FileSelector - filterPhaseFiles', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
  });

  test('filterPhaseFiles_正常系_Issue番号でフィルタリング', () => {
    // Given: 複数のIssueのファイルが含まれる
    const files = [
      '.ai-workflow/issue-123/metadata.json',
      '.ai-workflow/issue-456/metadata.json',
      'src/index.ts',
    ];

    // When: filterPhaseFiles を呼び出す
    const filtered = fileSelector.filterPhaseFiles(files, '123');

    // Then: Issue #123 のファイルのみが返される
    expect(filtered).toContain('.ai-workflow/issue-123/metadata.json');
    expect(filtered).toContain('src/index.ts');
    expect(filtered).not.toContain('.ai-workflow/issue-456/metadata.json');
    expect(filtered).toHaveLength(2);
  });

  test('filterPhaseFiles_正常系_@tmpを除外', () => {
    // Given: @tmp を含むファイルが存在する
    const files = [
      '.ai-workflow/issue-123/metadata.json',
      '.ai-workflow/issue-123/@tmp/log.txt',
      'src/index.ts',
    ];

    // When: filterPhaseFiles を呼び出す
    const filtered = fileSelector.filterPhaseFiles(files, '123');

    // Then: @tmp を含むファイルが除外される
    expect(filtered).toContain('.ai-workflow/issue-123/metadata.json');
    expect(filtered).toContain('src/index.ts');
    expect(filtered).not.toContain('.ai-workflow/issue-123/@tmp/log.txt');
    expect(filtered).toHaveLength(2);
  });

  test('filterPhaseFiles_正常系_非ai-workflowファイルを含める', () => {
    // Given: .ai-workflow/ 以外のファイルが含まれる
    const files = [
      'src/core/git/file-selector.ts',
      'tests/unit/git/file-selector.test.ts',
      'README.md',
    ];

    // When: filterPhaseFiles を呼び出す
    const filtered = fileSelector.filterPhaseFiles(files, '123');

    // Then: すべてのファイルが含まれる
    expect(filtered).toContain('src/core/git/file-selector.ts');
    expect(filtered).toContain('tests/unit/git/file-selector.test.ts');
    expect(filtered).toContain('README.md');
    expect(filtered).toHaveLength(3);
  });

  test('filterPhaseFiles_境界値_空のファイルリスト', () => {
    // Given: 空のファイルリスト
    const files: string[] = [];

    // When: filterPhaseFiles を呼び出す
    const filtered = fileSelector.filterPhaseFiles(files, '123');

    // Then: 空配列が返される
    expect(filtered).toEqual([]);
  });
});

describe('FileSelector - getPhaseSpecificFiles', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
  });

  test('getPhaseSpecificFiles_正常系_implementationフェーズ', async () => {
    // Given: implementation フェーズで、scripts/ ディレクトリのファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['scripts/deploy.sh', 'pulumi/index.ts', 'src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getPhaseSpecificFiles を呼び出す
    const files = await fileSelector.getPhaseSpecificFiles('implementation');

    // Then: scripts/, pulumi/ ディレクトリのファイルのみが返される
    expect(files).toContain('scripts/deploy.sh');
    expect(files).toContain('pulumi/index.ts');
    expect(files).not.toContain('src/index.ts');
  });

  test('getPhaseSpecificFiles_正常系_test_implementationフェーズ', async () => {
    // Given: test_implementation フェーズで、テストファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['src/index.test.ts', 'src/index.ts', 'tests/test_util.py'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getPhaseSpecificFiles を呼び出す
    const files = await fileSelector.getPhaseSpecificFiles('test_implementation');

    // Then: テストファイルパターンに一致するファイルのみが返される
    expect(files).toContain('src/index.test.ts');
    expect(files).toContain('tests/test_util.py');
    expect(files).not.toContain('src/index.ts');
  });

  test('getPhaseSpecificFiles_正常系_documentationフェーズ', async () => {
    // Given: documentation フェーズで、Markdownファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['README.md', 'docs/API.MD', 'src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getPhaseSpecificFiles を呼び出す
    const files = await fileSelector.getPhaseSpecificFiles('documentation');

    // Then: Markdownファイルのみが返される
    expect(files).toContain('README.md');
    expect(files).toContain('docs/API.MD');
    expect(files).not.toContain('src/index.ts');
  });

  test('getPhaseSpecificFiles_正常系_その他のフェーズ', async () => {
    // Given: その他のフェーズ（requirements）
    mockGit.status.mockResolvedValue({
      modified: ['src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getPhaseSpecificFiles を呼び出す
    const files = await fileSelector.getPhaseSpecificFiles('requirements');

    // Then: 空配列が返される
    expect(files).toEqual([]);
  });
});

describe('FileSelector - scanDirectories', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
  });

  test('scanDirectories_正常系_単一ディレクトリ', async () => {
    // Given: scripts/ ディレクトリのファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['scripts/deploy.sh', 'src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanDirectories を呼び出す
    const files = await (fileSelector as any).scanDirectories(['scripts']);

    // Then: scripts/ ディレクトリのファイルのみが返される
    expect(files).toContain('scripts/deploy.sh');
    expect(files).not.toContain('src/index.ts');
    expect(files).toHaveLength(1);
  });

  test('scanDirectories_正常系_複数ディレクトリ', async () => {
    // Given: 複数のディレクトリのファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['scripts/deploy.sh', 'pulumi/index.ts', 'ansible/playbook.yml', 'src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanDirectories を呼び出す
    const files = await (fileSelector as any).scanDirectories(['scripts', 'pulumi', 'ansible']);

    // Then: 指定されたディレクトリのファイルのみが返される
    expect(files).toContain('scripts/deploy.sh');
    expect(files).toContain('pulumi/index.ts');
    expect(files).toContain('ansible/playbook.yml');
    expect(files).not.toContain('src/index.ts');
    expect(files).toHaveLength(3);
  });

  test('scanDirectories_正常系_@tmpを除外', async () => {
    // Given: @tmp を含むファイルが存在する
    mockGit.status.mockResolvedValue({
      modified: ['scripts/deploy.sh', 'scripts/@tmp/temp.sh'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanDirectories を呼び出す
    const files = await (fileSelector as any).scanDirectories(['scripts']);

    // Then: @tmp を含むファイルが除外される
    expect(files).toContain('scripts/deploy.sh');
    expect(files).not.toContain('scripts/@tmp/temp.sh');
    expect(files).toHaveLength(1);
  });

  test('scanDirectories_境界値_該当ファイルなし', async () => {
    // Given: 該当するディレクトリのファイルがない
    mockGit.status.mockResolvedValue({
      modified: ['src/index.ts', 'tests/test.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanDirectories を呼び出す
    const files = await (fileSelector as any).scanDirectories(['scripts']);

    // Then: 空配列が返される
    expect(files).toEqual([]);
  });
});

describe('FileSelector - scanByPatterns', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
  });

  test('scanByPatterns_正常系_単一パターン', async () => {
    // Given: テストファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['src/index.test.ts', 'src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanByPatterns を呼び出す
    const files = await (fileSelector as any).scanByPatterns(['*.test.ts']);

    // Then: パターンに一致するファイルのみが返される
    expect(files).toContain('src/index.test.ts');
    expect(files).not.toContain('src/index.ts');
    expect(files).toHaveLength(1);
  });

  test('scanByPatterns_正常系_複数パターン', async () => {
    // Given: 複数のテストファイルが変更されている
    mockGit.status.mockResolvedValue({
      modified: ['src/index.test.ts', 'src/util.spec.ts', 'src/index.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanByPatterns を呼び出す
    const files = await (fileSelector as any).scanByPatterns(['*.test.ts', '*.spec.ts']);

    // Then: いずれかのパターンに一致するファイルが返される
    expect(files).toContain('src/index.test.ts');
    expect(files).toContain('src/util.spec.ts');
    expect(files).not.toContain('src/index.ts');
    expect(files).toHaveLength(2);
  });

  test('scanByPatterns_正常系_minimatchの2つのマッチング方式', async () => {
    // Given: ディレクトリを含むパスとファイル名のみのパスが存在する
    mockGit.status.mockResolvedValue({
      modified: ['src/index.test.ts', 'index.test.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanByPatterns を呼び出す
    const files = await (fileSelector as any).scanByPatterns(['*.test.ts']);

    // Then: 両方のマッチング方式でマッチしたファイルが含まれる
    expect(files).toContain('src/index.test.ts');
    expect(files).toContain('index.test.ts');
    expect(files).toHaveLength(2);
  });

  test('scanByPatterns_正常系_@tmpを除外', async () => {
    // Given: @tmp を含むファイルが存在する
    mockGit.status.mockResolvedValue({
      modified: ['src/index.test.ts', 'src/@tmp/temp.test.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanByPatterns を呼び出す
    const files = await (fileSelector as any).scanByPatterns(['*.test.ts']);

    // Then: @tmp を含むファイルが除外される
    expect(files).toContain('src/index.test.ts');
    expect(files).not.toContain('src/@tmp/temp.test.ts');
    expect(files).toHaveLength(1);
  });

  test('scanByPatterns_境界値_該当ファイルなし', async () => {
    // Given: パターンに一致するファイルがない
    mockGit.status.mockResolvedValue({
      modified: ['src/index.ts', 'src/util.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanByPatterns を呼び出す
    const files = await (fileSelector as any).scanByPatterns(['*.test.ts']);

    // Then: 空配列が返される
    expect(files).toEqual([]);
  });

  test('scanByPatterns_境界値_重複ファイルの除去', async () => {
    // Given: 複数パターンにマッチするファイルが存在する
    mockGit.status.mockResolvedValue({
      modified: ['src/index.test.ts'],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: scanByPatterns を呼び出す（重複マッチする可能性のあるパターン）
    const files = await (fileSelector as any).scanByPatterns(['*.test.ts', '*.test.*']);

    // Then: 重複が除去される
    expect(files).toContain('src/index.test.ts');
    expect(files).toHaveLength(1);
  });
});

describe('isSecuritySensitiveFile - Security file filtering', () => {
  test('isSecuritySensitiveFile_正常系_.codex/auth.jsonを検出', () => {
    // Given: .codex/auth.json ファイルパス
    const testCases = [
      '.codex/auth.json',
      '.codex/',
      'some/path/.codex/auth.json',
      'user/home/.codex/auth.json',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(isSecuritySensitiveFile(filePath)).toBe(true);
    }
  });

  test('isSecuritySensitiveFile_正常系_credentials.jsonを検出', () => {
    // Given: credentials.json ファイルパス
    const testCases = [
      'credentials.json',
      '.claude/credentials.json',
      'some/path/credentials.json',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(isSecuritySensitiveFile(filePath)).toBe(true);
    }
  });

  test('isSecuritySensitiveFile_正常系_.envファイルを検出', () => {
    // Given: .env 系ファイルパス
    const testCases = [
      '.env',
      '.env.local',
      '.env.production',
      '.env.development',
      'config/.env',
      'config/.env.local',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(isSecuritySensitiveFile(filePath)).toBe(true);
    }
  });

  test('isSecuritySensitiveFile_正常系_auth.jsonを検出', () => {
    // Given: auth.json ファイルパス
    const testCases = [
      'auth.json',
      'config/auth.json',
      'some/nested/path/auth.json',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(isSecuritySensitiveFile(filePath)).toBe(true);
    }
  });

  test('isSecuritySensitiveFile_正常系_Windowsパス区切りを正規化', () => {
    // Given: Windowsスタイルのパス
    const testCases = [
      '.codex\\auth.json',
      'some\\path\\.codex\\auth.json',
      '.env',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(isSecuritySensitiveFile(filePath)).toBe(true);
    }
  });

  test('isSecuritySensitiveFile_正常系_通常ファイルはfalse', () => {
    // Given: 通常のファイルパス
    const testCases = [
      'src/index.ts',
      'package.json',
      '.ai-workflow/issue-123/metadata.json',
      'README.md',
      'tests/auth.test.ts',
      '.gitignore',
      'config/settings.json',
    ];

    // When/Then: すべて false を返す
    for (const filePath of testCases) {
      expect(isSecuritySensitiveFile(filePath)).toBe(false);
    }
  });
});

describe('FileSelector - Security: Exclude sensitive files', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
  });

  test('getChangedFiles_セキュリティ_.codex/auth.jsonを除外', async () => {
    // Given: .codex/auth.json が変更されている
    mockGit.status.mockResolvedValue({
      modified: ['src/index.ts', '.codex/auth.json'],
      not_added: ['.env', '.env.local'],
      created: ['credentials.json'],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: セキュリティ機密ファイルが除外される
    expect(files).toContain('src/index.ts');
    expect(files).not.toContain('.codex/auth.json');
    expect(files).not.toContain('.env');
    expect(files).not.toContain('.env.local');
    expect(files).not.toContain('credentials.json');
    expect(files).toHaveLength(1);
  });

  test('getChangedFiles_セキュリティ_status.filesからも除外', async () => {
    // Given: status.files に .codex/auth.json が含まれる
    mockGit.status.mockResolvedValue({
      modified: [],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [
        { path: 'src/index.ts', index: 'M', working_dir: 'M' },
        { path: '.codex/auth.json', index: 'M', working_dir: 'M' },
        { path: 'auth.json', index: 'A', working_dir: ' ' },
      ],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: セキュリティ機密ファイルが除外される
    expect(files).toContain('src/index.ts');
    expect(files).not.toContain('.codex/auth.json');
    expect(files).not.toContain('auth.json');
    expect(files).toHaveLength(1);
  });

  test('filterPhaseFiles_セキュリティ_機密ファイルを除外', () => {
    // Given: 機密ファイルを含むファイルリスト
    const files = [
      '.ai-workflow/issue-123/metadata.json',
      'src/index.ts',
      '.codex/auth.json',
      '.env',
      'credentials.json',
    ];

    // When: filterPhaseFiles を呼び出す
    const filtered = fileSelector.filterPhaseFiles(files, '123');

    // Then: セキュリティ機密ファイルが除外される
    expect(filtered).toContain('.ai-workflow/issue-123/metadata.json');
    expect(filtered).toContain('src/index.ts');
    expect(filtered).not.toContain('.codex/auth.json');
    expect(filtered).not.toContain('.env');
    expect(filtered).not.toContain('credentials.json');
    expect(filtered).toHaveLength(2);
  });
});

describe('shouldExcludeDebugFile - Debug-only file filtering', () => {
  // config.getLogLevel() をモック
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalEnv;
    }
  });

  test('shouldExcludeDebugFile_正常系_agent_log_raw.txtを検出', () => {
    // Given: LOG_LEVEL が info（デフォルト）
    process.env.LOG_LEVEL = 'info';

    const testCases = [
      'agent_log_raw.txt',
      '.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt',
      'some/path/agent_log_raw.txt',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(shouldExcludeDebugFile(filePath)).toBe(true);
    }
  });

  test('shouldExcludeDebugFile_正常系_prompt.txtを検出', () => {
    // Given: LOG_LEVEL が info
    process.env.LOG_LEVEL = 'info';

    const testCases = [
      'prompt.txt',
      '.ai-workflow/issue-123/00_planning/execute/prompt.txt',
      '.ai-workflow/issue-456/01_requirements/review/prompt.txt',
      'some/path/prompt.txt',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(shouldExcludeDebugFile(filePath)).toBe(true);
    }
  });

  test('shouldExcludeDebugFile_正常系_debugモードでは除外しない', () => {
    // Given: LOG_LEVEL が debug
    process.env.LOG_LEVEL = 'debug';

    const testCases = [
      'agent_log_raw.txt',
      'prompt.txt',
      '.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt',
      '.ai-workflow/issue-123/00_planning/execute/prompt.txt',
    ];

    // When/Then: すべて false を返す（debug モードでは除外しない）
    for (const filePath of testCases) {
      expect(shouldExcludeDebugFile(filePath)).toBe(false);
    }
  });

  test('shouldExcludeDebugFile_正常系_通常ファイルはfalse', () => {
    // Given: LOG_LEVEL が info
    process.env.LOG_LEVEL = 'info';

    const testCases = [
      'src/index.ts',
      'package.json',
      '.ai-workflow/issue-123/metadata.json',
      'agent_log.md',
      'README.md',
      '.ai-workflow/issue-123/00_planning/output/planning.md',
    ];

    // When/Then: すべて false を返す
    for (const filePath of testCases) {
      expect(shouldExcludeDebugFile(filePath)).toBe(false);
    }
  });

  test('shouldExcludeDebugFile_正常系_Windowsパス区切りを正規化', () => {
    // Given: LOG_LEVEL が info、Windowsスタイルのパス
    process.env.LOG_LEVEL = 'info';

    const testCases = [
      '.ai-workflow\\issue-123\\00_planning\\execute\\agent_log_raw.txt',
      '.ai-workflow\\issue-123\\00_planning\\execute\\prompt.txt',
    ];

    // When/Then: すべて true を返す
    for (const filePath of testCases) {
      expect(shouldExcludeDebugFile(filePath)).toBe(true);
    }
  });
});

describe('FileSelector - Debug-only file exclusion', () => {
  let fileSelector: FileSelector;
  let mockGit: jest.Mocked<SimpleGit>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
    } as any;

    fileSelector = new FileSelector(mockGit);
    originalEnv = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';  // デフォルトはinfo
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalEnv;
    }
  });

  test('getChangedFiles_デバッグファイル_agent_log_raw.txtとprompt.txtを除外', async () => {
    // Given: agent_log_raw.txt と prompt.txt が変更されている
    mockGit.status.mockResolvedValue({
      modified: [
        'src/index.ts',
        '.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt',
        '.ai-workflow/issue-123/00_planning/execute/prompt.txt',
        '.ai-workflow/issue-123/00_planning/output/planning.md',
      ],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: agent_log_raw.txt と prompt.txt が除外される
    expect(files).toContain('src/index.ts');
    expect(files).toContain('.ai-workflow/issue-123/00_planning/output/planning.md');
    expect(files).not.toContain('.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt');
    expect(files).not.toContain('.ai-workflow/issue-123/00_planning/execute/prompt.txt');
    expect(files).toHaveLength(2);
  });

  test('getChangedFiles_デバッグファイル_debugモードでは除外しない', async () => {
    // Given: LOG_LEVEL が debug
    process.env.LOG_LEVEL = 'debug';

    mockGit.status.mockResolvedValue({
      modified: [
        'src/index.ts',
        '.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt',
        '.ai-workflow/issue-123/00_planning/execute/prompt.txt',
      ],
      not_added: [],
      created: [],
      staged: [],
      deleted: [],
      renamed: [],
      files: [],
    } as any);

    // When: getChangedFiles を呼び出す
    const files = await fileSelector.getChangedFiles();

    // Then: debug モードではすべてのファイルが含まれる
    expect(files).toContain('src/index.ts');
    expect(files).toContain('.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt');
    expect(files).toContain('.ai-workflow/issue-123/00_planning/execute/prompt.txt');
    expect(files).toHaveLength(3);
  });

  test('filterPhaseFiles_デバッグファイル_prompt.txtを除外', () => {
    // Given: prompt.txt を含むファイルリスト
    const files = [
      '.ai-workflow/issue-123/metadata.json',
      '.ai-workflow/issue-123/00_planning/execute/prompt.txt',
      '.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt',
      '.ai-workflow/issue-123/00_planning/output/planning.md',
      'src/index.ts',
    ];

    // When: filterPhaseFiles を呼び出す
    const filtered = fileSelector.filterPhaseFiles(files, '123');

    // Then: prompt.txt と agent_log_raw.txt が除外される
    expect(filtered).toContain('.ai-workflow/issue-123/metadata.json');
    expect(filtered).toContain('.ai-workflow/issue-123/00_planning/output/planning.md');
    expect(filtered).toContain('src/index.ts');
    expect(filtered).not.toContain('.ai-workflow/issue-123/00_planning/execute/prompt.txt');
    expect(filtered).not.toContain('.ai-workflow/issue-123/00_planning/execute/agent_log_raw.txt');
    expect(filtered).toHaveLength(3);
  });
});
