/**
 * 統合テスト: Jenkinsfile 互換性・Codex CLI 読み込み・validate スクリプト
 *
 * IT-06/IT-09/IT-10 の要件を自動化し、
 * Jenkins 実機や CI 実行の前提を静的に検証する。
 */

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { detectCodexCliAuth } from '../../../src/core/helpers/codex-credentials';

const loadText = (filePath: string): string => readFileSync(resolve(filePath), 'utf8');

const jenkinsfilePaths = [
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile',
];

const signaturePattern = /def\s+prepareCodexAuthFile\s*\(\s*\)/;
const invocationPattern = /common\.prepareCodexAuthFile\s*\(\s*\)/;

const rememberEnv = (keys: string[]) =>
  keys.reduce<Record<string, string | undefined>>((acc, key) => {
    acc[key] = process.env[key];
    return acc;
  }, {});

const restoreEnv = (backup: Record<string, string | undefined>) => {
  Object.keys(backup).forEach((key) => {
    const value = backup[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
};

describe('Jenkinsfile 互換性 (IT-06)', () => {
  it('指定 Jenkinsfile が prepareCodexAuthFile を引数なしで呼び出す', () => {
    const commonContent = loadText('jenkins/shared/common.groovy');
    expect(commonContent).toMatch(signaturePattern);

    jenkinsfilePaths.forEach((path) => {
      const content = loadText(path);
      expect(content).toMatch(invocationPattern);
    });
  });
});

describe('Codex CLI の auth.json 読み込み前提 (IT-09)', () => {
  const envKeys = ['CODEX_HOME', 'HOME', 'USERPROFILE'];

  it('CODEX_HOME の auth.json を最優先で検出できる', () => {
    const backup = rememberEnv(envKeys);
    const tempRoot = mkdtempSync(join(tmpdir(), 'codex-auth-'));
    const codexHome = join(tempRoot, 'codex-home');
    const homeDir = join(tempRoot, 'home');

    mkdirSync(codexHome, { recursive: true });
    mkdirSync(join(homeDir, '.codex'), { recursive: true });

    const codexAuthPath = join(codexHome, 'auth.json');
    writeFileSync(codexAuthPath, '{"type":"codex"}');

    const homeAuthPath = join(homeDir, '.codex', 'auth.json');
    writeFileSync(homeAuthPath, '{"type":"home"}');

    try {
      process.env.CODEX_HOME = codexHome;
      process.env.HOME = homeDir;

      const result = detectCodexCliAuth();

      expect(result.candidates).toContain(codexAuthPath);
      expect(result.candidates).toContain(homeAuthPath);
      expect(result.authFilePath).toBe(codexAuthPath);
    } finally {
      restoreEnv(backup);
    }
  });

  it('CODEX_HOME がない場合は HOME/.codex/auth.json を検出できる', () => {
    const backup = rememberEnv(envKeys);
    const tempRoot = mkdtempSync(join(tmpdir(), 'codex-auth-home-'));
    const homeDir = join(tempRoot, 'home');
    const homeAuthPath = join(homeDir, '.codex', 'auth.json');

    mkdirSync(join(homeDir, '.codex'), { recursive: true });
    writeFileSync(homeAuthPath, '{"type":"home"}');

    try {
      delete process.env.CODEX_HOME;
      process.env.HOME = homeDir;

      const result = detectCodexCliAuth();

      expect(result.candidates).toContain(homeAuthPath);
      expect(result.authFilePath).toBe(homeAuthPath);
    } finally {
      restoreEnv(backup);
    }
  });
});

describe('npm run validate の構成検証 (IT-10)', () => {
  it('validate スクリプトが lint/test/build を順に実行する', () => {
    const validateScript = loadText('scripts/validate.mjs');

    expect(validateScript).toMatch(/run\('npm', \['run', 'lint'\]\);/);
    expect(validateScript).toMatch(/run\('npm', \['test'\]\);/);
    expect(validateScript).toMatch(/run\('npm', \['run', 'build'\]\);/);
  });

  it('SKIP_VALIDATE_TEST によるテストスキップ分岐が定義されている', () => {
    const validateScript = loadText('scripts/validate.mjs');

    expect(validateScript).toContain('SKIP_VALIDATE_TEST');
    expect(validateScript).toContain('skipping npm test');
  });
});
