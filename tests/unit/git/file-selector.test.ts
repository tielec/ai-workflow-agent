/**
 * Unit tests for FileSelector
 * Tests file selection and filtering logic
 */

// @ts-nocheck

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { FileSelector } from '../../../src/core/git/file-selector';
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
      files: ['src/index.ts', 'src/other.ts'],
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
