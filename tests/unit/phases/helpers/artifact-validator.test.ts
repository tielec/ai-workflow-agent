import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { ArtifactValidator } from '../../../../src/phases/helpers/artifact-validator.js';

const baseEnv = { ...process.env };
let tempRoot: string;

beforeEach(async () => {
  process.env = { ...baseEnv };
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-validator-'));
});

afterEach(async () => {
  process.env = baseEnv;
  if (tempRoot && (await fs.pathExists(tempRoot))) {
    await fs.remove(tempRoot);
  }
});

describe('ArtifactValidator (Issue #603)', () => {
  test('TC-U-603-030: returns success when artifact exists at expected path', async () => {
    const expectedPath = path.join(
      tempRoot,
      'sd-platform-development',
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    await fs.ensureDir(path.dirname(expectedPath));
    await fs.writeFile(expectedPath, '# Requirements');
    const validator = new ArtifactValidator();

    const result = validator.validateArtifact(expectedPath, [tempRoot], 'requirements.md');

    expect(result).toEqual({
      valid: true,
      expectedPath: path.resolve(expectedPath),
      actualPath: path.resolve(expectedPath),
      relocated: false,
    });
  });

  test('TC-U-603-031: returns failure when artifact missing in all locations', () => {
    const expectedPath = path.join(
      tempRoot,
      'sd-platform-development',
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const validator = new ArtifactValidator();

    const result = validator.validateArtifact(expectedPath, [path.join(tempRoot, 'jenkins')], 'requirements.md');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Output file not found');
    expect(result.actualPath).toBeUndefined();
  });

  test('TC-U-603-032: relocates artifact from fallback when enabled', async () => {
    const expectedPath = path.join(
      tempRoot,
      'repo',
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const fallbackDir = path.join(tempRoot, 'jenkins', 'workspace');
    const fallbackPath = path.join(fallbackDir, '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    await fs.ensureDir(path.dirname(fallbackPath));
    await fs.writeFile(fallbackPath, 'from fallback');
    const validator = new ArtifactValidator();

    const result = validator.validateArtifact(expectedPath, [fallbackDir], 'requirements.md');

    expect(result.valid).toBe(true);
    expect(result.relocated).toBe(true);
    expect(result.actualPath).toBe(path.resolve(fallbackPath));
    expect(await fs.pathExists(expectedPath)).toBe(true);
    expect(await fs.pathExists(fallbackPath)).toBe(false);
  });

  test('TC-U-603-033: reports mismatch when relocation disabled', async () => {
    process.env.ARTIFACT_RELOCATE_ON_MISMATCH = 'false';
    const expectedPath = path.join(tempRoot, 'repo', '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    const fallbackDir = path.join(tempRoot, 'jenkins', 'workspace');
    const fallbackPath = path.join(fallbackDir, '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    await fs.ensureDir(path.dirname(fallbackPath));
    await fs.writeFile(fallbackPath, 'misplaced');
    const validator = new ArtifactValidator();

    const result = validator.validateArtifact(expectedPath, [fallbackDir], 'requirements.md');

    expect(result.valid).toBe(false);
    expect(result.actualPath).toBe(path.resolve(fallbackPath));
    expect(result.error).toContain('Artifact found at wrong location');
    expect(await fs.pathExists(fallbackPath)).toBe(true);
    expect(await fs.pathExists(expectedPath)).toBe(false);
  });

  test('TC-U-603-034: searches multiple fallback directories in order', async () => {
    const expectedPath = path.join(tempRoot, 'repo', '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    const firstFallback = path.join(tempRoot, 'jenkins', 'workspace');
    const secondFallback = path.join(tempRoot, 'other-workspace');
    const fallbackPath = path.join(secondFallback, '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    await fs.ensureDir(path.dirname(fallbackPath));
    await fs.writeFile(fallbackPath, 'second fallback');
    const validator = new ArtifactValidator();

    const result = validator.validateArtifact(expectedPath, [firstFallback, secondFallback], 'requirements.md');

    expect(result.valid).toBe(true);
    expect(result.relocated).toBe(true);
    expect(result.actualPath).toBe(path.resolve(fallbackPath));
    expect(await fs.pathExists(expectedPath)).toBe(true);
  });

  test('TC-U-603-035: skips relocation for candidates outside allowed roots', async () => {
    const expectedPath = path.join(tempRoot, 'repo', '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    const suspiciousDir = '/etc';
    const suspiciousPath = path.join(suspiciousDir, '.ai-workflow', 'issue-236', '01_requirements', 'output', 'requirements.md');
    const validator = new ArtifactValidator({ allowedRoots: [tempRoot] });

    const result = validator.validateArtifact(expectedPath, [suspiciousDir], 'requirements.md');

    expect(result.valid).toBe(false);
    expect(result.actualPath).toBeUndefined();
  });
});
