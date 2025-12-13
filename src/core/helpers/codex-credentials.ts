import { getFsExtra } from '../../utils/fs-proxy.js';
import path from 'node:path';

export const CODEX_MIN_API_KEY_LENGTH = 20;

const fs = getFsExtra();

export function isValidCodexApiKey(apiKey: string | null | undefined): apiKey is string {
  if (!apiKey) {
    return false;
  }
  return apiKey.trim().length >= CODEX_MIN_API_KEY_LENGTH;
}

export interface CodexCliAuthInfo {
  candidates: string[];
  authFilePath: string | null;
}

export function detectCodexCliAuth(): CodexCliAuthInfo {
  const candidates: string[] = [];
  const codexHome = process.env.CODEX_HOME;
  if (codexHome) {
    candidates.push(path.join(codexHome, 'auth.json'));
  }

  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (homeDir) {
    candidates.push(path.join(homeDir, '.codex', 'auth.json'));
  }

  const authFilePath = candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;

  return {
    candidates,
    authFilePath,
  };
}

export function hasCodexCliAuth(): boolean {
  return detectCodexCliAuth().authFilePath !== null;
}
