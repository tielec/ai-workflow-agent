import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import { logger } from '../../../src/utils/logger.js';

describe('RepositoryAnalyzer invalid JSONバックアップ処理', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-analyzer-backup-'));
    jest.spyOn(PromptLoader, 'loadPrompt').mockReturnValue('prompt');
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('パース失敗時にバックアップファイルを保存する (TC-RA-020)', async () => {
    // TC-RA-020: 無効JSON発生時にバックアップ保存されることを検証
    const outputPath = path.join(tempDir, 'refactor-output.json');
    const analyzer = new RepositoryAnalyzer(null, null, {
      outputFileFactory: () => outputPath,
    });
    const executeAgentWithFallbackMock = jest
      .spyOn(analyzer as any, 'executeAgentWithFallback')
      .mockImplementationOnce(async (_prompt, _path, _repo, _agent) => {
        fs.writeFileSync(outputPath, '{"title": "大きなファイル, "description": "エスケープ不備"}');
      });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'codex');

    const backupPath = outputPath.replace(/\.json$/, '.invalid.json');
    expect(result).toEqual([]);
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf-8')).toContain('エスケープ不備');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(backupPath));
    expect(logger.error).toHaveBeenCalled();
  });

  it('空配列の有効JSONではバックアップを作成しない (TC-RA-021)', async () => {
    // TC-RA-021: パース成功時はバックアップを生成しないことを確認
    const outputPath = path.join(tempDir, 'refactor-empty.json');
    const analyzer = new RepositoryAnalyzer(null, null, {
      outputFileFactory: () => outputPath,
    });
    jest
      .spyOn(analyzer as any, 'executeAgentWithFallback')
      .mockImplementationOnce(async () => {
        fs.writeFileSync(outputPath, '[]', 'utf-8');
      });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'codex');

    const backupPath = outputPath.replace(/\.json$/, '.invalid.json');
    expect(result).toEqual([]);
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(fs.existsSync(backupPath)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('.invalid.json'));
  });

  it('バックアップ保存失敗時でも処理を継続しエラーログを出力する (TC-RA-022)', async () => {
    // TC-RA-022: バックアップ保存失敗時に処理継続とエラーログ出力が行われることを検証
    const outputPath = path.join(tempDir, 'refactor-copy-fail.json');

    const analyzer = new RepositoryAnalyzer(null, null, {
      outputFileFactory: () => outputPath,
    });
    jest.spyOn(analyzer as any, 'saveInvalidJsonBackup').mockImplementation(() => {
      logger.error('Failed to save invalid JSON backup: copy failed');
      return null;
    });
    jest
      .spyOn(analyzer as any, 'executeAgentWithFallback')
      .mockImplementationOnce(async () => {
        fs.writeFileSync(outputPath, '{"invalid": json content}');
      });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'codex');

    const backupPath = outputPath.replace(/\.json$/, '.invalid.json');
    expect(result).toEqual([]);
    expect(fs.existsSync(backupPath)).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save invalid JSON backup'),
    );
  });
});
