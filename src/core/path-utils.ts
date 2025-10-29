import { dirname, resolve } from 'node:path';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(moduleDir, '..', '..');

export const resolveProjectPath = (...segments: string[]): string =>
  resolve(projectRoot, ...segments);
