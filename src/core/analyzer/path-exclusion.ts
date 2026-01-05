import path from 'node:path';
import { logger } from '../utils/logger.js';

export const EXCLUDED_DIRECTORIES: readonly string[] = [
  'node_modules/',
  'vendor/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  'target/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '.pytest_cache/',
  '.mypy_cache/',
  'coverage/',
  '.next/',
  '.nuxt/',
];

export const EXCLUDED_FILE_PATTERNS: Record<'generated' | 'lockFiles' | 'binary', string[]> = {
  generated: [
    '*.min.js',
    '*.bundle.js',
    '*.generated.*',
    '*.g.go',
    '*.pb.go',
    '*.gen.ts',
  ],
  lockFiles: [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Gemfile.lock',
    'poetry.lock',
    'Pipfile.lock',
    'go.sum',
    'Cargo.lock',
    'composer.lock',
  ],
  binary: [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.a',
    '.lib',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.svg',
    '.webp',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.zip',
    '.tar',
    '.gz',
    '.bz2',
    '.7z',
    '.rar',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.mkv',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
  ],
};

/**
 * Simple wildcard matcher used for exclusion patterns.
 */
export function matchesWildcard(fileName: string, pattern: string): boolean {
  const regexPattern = pattern.replaceAll('.', '\\.').replaceAll('*', '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(fileName);
}

/**
 * Check whether a path belongs to an excluded directory.
 */
export function isExcludedDirectory(filePath: string): boolean {
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
  const sanitizedPath = normalizedPath.replace(/^\.\//, '');

  if (normalizedPath.includes('../')) {
    logger.warn(`Potentially malicious path detected: ${filePath}`);
    return true;
  }

  return EXCLUDED_DIRECTORIES.some((dir) => {
    const normalizedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    const boundaryPattern = new RegExp(`(?:^|/)${normalizedDir}(?:/|$)`);
    return boundaryPattern.test(sanitizedPath);
  });
}

/**
 * Check whether a path matches excluded file patterns.
 */
export function isExcludedFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath);

  if (
    EXCLUDED_FILE_PATTERNS.generated.some((pattern) =>
      pattern.includes('*') ? matchesWildcard(fileName, pattern) : fileName === pattern,
    )
  ) {
    return true;
  }

  if (EXCLUDED_FILE_PATTERNS.lockFiles.includes(fileName)) {
    return true;
  }

  if (EXCLUDED_FILE_PATTERNS.binary.includes(extension)) {
    return true;
  }

  return false;
}
