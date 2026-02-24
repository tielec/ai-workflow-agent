/**
 * Integration tests for Issue #785: Dockerfile に主要ランタイムをプリインストール
 *
 * テスト戦略: INTEGRATION_ONLY
 * 確認項目:
 *  - docker build の成功
 *  - 各言語ランタイム (python3, go, java, ruby, sudo) がコンテナ内で動作
 *  - 既存 Node.js 環境 (node, npm) に影響がない
 *  - イメージサイズの増加が +500MB 以内
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const testImageTag = 'ai-workflow-agent:test-785';
const baseImageTag = 'node:20-slim';
const longTimeoutMs = 10 * 60 * 1000;
const megabyte = 1024 * 1024;

jest.setTimeout(longTimeoutMs);

let builtImageSize: number | null = null;
let baseImageSize: number | null = null;
let buildDurationMs: number | null = null;

beforeAll(async () => {
  const buildStart = Date.now();
  await execFileAsync('docker', ['build', '-t', testImageTag, '.'], { cwd: process.cwd() });
  buildDurationMs = Date.now() - buildStart;
  builtImageSize = await inspectImageSize(testImageTag);
  baseImageSize = await inspectImageSize(baseImageTag);
});

afterAll(async () => {
  await execFileAsync('docker', ['rmi', '--force', testImageTag]).catch(() => undefined);
});

async function inspectImageSize(image: string): Promise<number> {
  const { stdout } = await execFileAsync('docker', ['image', 'inspect', '--format', '{{.Size}}', image]);
  const trimmed = stdout.trim();
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`Docker image size for ${image} is not a number: ${trimmed}`);
  }
  return parsed;
}

async function runInContainer(command: string[]): Promise<string> {
  const args = ['run', '--rm', testImageTag, ...command];
  const { stdout, stderr } = await execFileAsync('docker', args, { cwd: process.cwd() });
  return `${stdout}${stderr}`;
}

describe('Integration: Dockerfile runtimes (Issue #785)', () => {
  describe('TS-001: Dockerイメージビルド成功', () => {
    it('ビルド済みのイメージが存在しサイズが記録されている', () => {
      expect(builtImageSize).toBeGreaterThan(0);
    });

    it('ビルド時間は記録されており5分以内で完了', () => {
      expect(buildDurationMs).not.toBeNull();
      expect(buildDurationMs).toBeLessThanOrEqual(5 * 60 * 1000);
    });
  });

  describe('TS-002〜TS-006: 言語ランタイム動作確認', () => {
    it('python3, pip, venv が稼働する', async () => {
      const pythonVersion = await runInContainer(['python3', '--version']);
      expect(pythonVersion).toMatch(/Python 3\./);

      const pipVersion = await runInContainer(['python3', '-m', 'pip', '--version']);
      expect(pipVersion).toMatch(/pip [0-9]+\./);

      const venvHelp = await runInContainer(['python3', '-m', 'venv', '--help']);
      expect(venvHelp).toMatch(/usage: python3 -m venv/);
    });

    it('go version が稼働する', async () => {
      const goOutput = await runInContainer(['go', 'version']);
      expect(goOutput).toMatch(/go version go/);
    });

    it('java および javac が稼働する', async () => {
      const javaOutput = await runInContainer(['java', '-version']);
      expect(javaOutput).toMatch(/\bopenjdk version\b/);

      const javacOutput = await runInContainer(['javac', '-version']);
      expect(javacOutput).toMatch(/javac [0-9]+\./);
    });

    it('ruby と gem が稼働する', async () => {
      const rubyOutput = await runInContainer(['ruby', '--version']);
      expect(rubyOutput).toMatch(/ruby [0-9]+\./);

      const gemOutput = await runInContainer(['gem', '--version']);
      expect(gemOutput).toMatch(/\d+\./);
    });

    it('sudo が稼働する', async () => {
      const sudoOutput = await runInContainer(['sudo', '--version']);
      expect(sudoOutput).toMatch(/Sudo version [0-9]+\./i);
    });
  });

  describe('TS-007: 既存 Node.js 環境の非影響確認', () => {
    it('node --version が v20 系で動作する', async () => {
      const nodeOutput = await runInContainer(['node', '--version']);
      expect(nodeOutput).toMatch(/v20\./);
    });

    it('npm --version が出力される', async () => {
      const npmOutput = await runInContainer(['npm', '--version']);
      expect(npmOutput).toMatch(/\d+\./);
    });
  });

  describe('TS-008: イメージサイズ許容範囲', () => {
    it('+500MB 以内のサイズ増加である', () => {
      expect(builtImageSize).not.toBeNull();
      expect(baseImageSize).not.toBeNull();
      const increaseMb = (builtImageSize! - baseImageSize!) / megabyte;
      expect(increaseMb).toBeGreaterThanOrEqual(0);
      expect(increaseMb).toBeLessThanOrEqual(500);
    });
  });
});
