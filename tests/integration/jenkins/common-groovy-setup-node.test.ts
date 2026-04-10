/**
 * 統合テスト: setupNodeEnvironment の実装検証
 *
 * Jenkins 実機の統合検証は手動で行う前提のため、ここでは
 * common.groovy の実装が設計どおりの構成になっていることを静的に確認する。
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const commonPath = resolve('jenkins/shared/common.groovy');
const developmentDocPath = resolve('docs/DEVELOPMENT.md');
const environmentDocPath = resolve('docs/ENVIRONMENT.md');

const loadFile = (path: string): string => readFileSync(path, 'utf8');

const extractFunctionBlock = (content: string, functionName: string): string => {
  const signature = new RegExp(`def\\s+${functionName}\\s*\\(\\s*\\)`);
  const signatureMatch = signature.exec(content);
  if (!signatureMatch) {
    return '';
  }

  let startIndex = signatureMatch.index;
  const beforeSignature = content.slice(0, startIndex);
  const jsdocStart = beforeSignature.lastIndexOf('/**');
  const jsdocEnd = beforeSignature.lastIndexOf('*/');
  if (jsdocStart !== -1 && jsdocEnd !== -1 && jsdocEnd > jsdocStart) {
    const between = beforeSignature.slice(jsdocEnd + 2).trim();
    if (between === '') {
      startIndex = jsdocStart;
    }
  }

  const braceStart = content.indexOf('{', signatureMatch.index + signatureMatch[0].length);
  if (braceStart === -1) {
    return '';
  }

  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTripleSingle = false;
  let inTripleDouble = false;
  let inSlashy = false;
  let inDollarSlashy = false;
  let lastNonWhitespace: string | null = null;

  for (let i = braceStart; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    const next2 = content[i + 2];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inTripleSingle) {
      if (char === "'" && next === "'" && next2 === "'") {
        inTripleSingle = false;
        i += 2;
      }
      continue;
    }
    if (inTripleDouble) {
      if (char === '"' && next === '"' && next2 === '"') {
        inTripleDouble = false;
        i += 2;
      }
      continue;
    }
    if (inSingleQuote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }
    if (inSlashy) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '/') {
        inSlashy = false;
      }
      continue;
    }
    if (inDollarSlashy) {
      if (char === '/' && next === '$') {
        inDollarSlashy = false;
        i += 1;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (char === '$' && next === '/') {
      inDollarSlashy = true;
      i += 1;
      continue;
    }
    if (char === "'" && next === "'" && next2 === "'") {
      inTripleSingle = true;
      i += 2;
      continue;
    }
    if (char === '"' && next === '"' && next2 === '"') {
      inTripleDouble = true;
      i += 2;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (char === '/' && next !== '/' && next !== '*') {
      const canStartSlashy =
        lastNonWhitespace === null ||
        /[=(:,{[!&|?+\-*/%^~<>]/.test(lastNonWhitespace);
      if (canStartSlashy) {
        inSlashy = true;
        continue;
      }
    }

    if (char.trim() !== '') {
      lastNonWhitespace = char;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, i + 1);
      }
    }
  }

  return '';
};

let commonContent = '';
let setupNodeBlock = '';
let developmentDoc = '';
let environmentDoc = '';

beforeAll(() => {
  // Given: 対象ファイルを読み込む
  commonContent = loadFile(commonPath);
  developmentDoc = loadFile(developmentDocPath);
  environmentDoc = loadFile(environmentDocPath);

  // When: setupNodeEnvironment() ブロックを抽出する
  setupNodeBlock = extractFunctionBlock(commonContent, 'setupNodeEnvironment');
});

describe('common.groovy setupNodeEnvironment (統合)', () => {
  it('IT-833-001: node_modules の symlink コマンドが含まれている', () => {
    // Given: 抽出済みの関数ブロック
    // When: symlink コマンドを検索する
    // Then: /workspace/node_modules の symlink 作成が含まれる
    expect(setupNodeBlock).toContain('ln -s /workspace/node_modules node_modules');
  });

  it('IT-833-002: dist の symlink コマンドが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('ln -s /workspace/dist dist');
  });

  it('IT-833-003: node_modules の symlink ガード条件が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('[ -d /workspace/node_modules ]');
    expect(setupNodeBlock).toContain('[ ! -e node_modules ]');
  });

  it('IT-833-004: dist の symlink ガード条件が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('[ -d /workspace/dist ]');
    expect(setupNodeBlock).toContain('[ ! -e dist ]');
  });

  it('IT-833-005: symlink 成功メッセージが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('Linking pre-built node_modules from ECR image');
    expect(setupNodeBlock).toContain('Linking pre-built dist from ECR image');
  });

  it('IT-833-006: セーフティネット検証コマンドが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('node dist/index.js check');
  });

  it('IT-833-007: セーフティネット検証成功メッセージが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('ECR image artifacts verified successfully');
  });

  it('IT-833-008: セーフティネット検証の stdout/stderr 抑制が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('>/dev/null 2>&1');
  });

  it('IT-833-009: node_modules と dist の両方存在チェックが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('[ -e node_modules ]');
    expect(setupNodeBlock).toContain('[ -e dist ]');
  });

  it('IT-833-010: 検証失敗時の警告メッセージが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('WARNING: ECR image artifacts verification failed');
  });

  it('IT-833-011: フォールバック時の symlink 削除が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('rm -f node_modules dist');
    expect(setupNodeBlock).not.toMatch(/rm\s+-rf\s+node_modules\s+dist/);
  });

  it('IT-833-012: フォールバック A に npm ci --include=dev が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('npm ci --include=dev');
  });

  it('IT-833-013: フォールバック A に npm run build が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('npm run build');
  });

  it('IT-833-014: 成果物未検出時の警告メッセージが含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('WARNING: ECR image artifacts not found');
  });

  it('IT-833-015: フォールバック B に npm install --include=dev が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('npm install --include=dev');
  });

  it('IT-833-016: フォールバック B にも npm run build が含まれている', () => {
    // Given
    // When
    // Then
    const matches = setupNodeBlock.match(/npm run build/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('IT-833-017: node --version の出力が維持されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('node --version');
  });

  it('IT-833-018: npm --version の出力が維持されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('npm --version');
  });

  it('IT-833-019: whoami の出力が維持されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('whoami');
  });

  it('IT-833-020: ステージヘッダーが維持されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('Stage: Setup Node.js Environment');
  });

  it('IT-833-021: HOME ディレクトリの出力が維持されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('HOME directory: $HOME');
  });

  it('IT-833-022: JSDoc コメントに symlink の説明が含まれている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('symlink');
  });

  it('IT-833-023: sh はシングルクォートで記述されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain("sh '''");
    expect(setupNodeBlock).not.toContain('sh """');
  });

  it('IT-833-024: npm install --include=dev が無条件に実行されない', () => {
    // Given
    // When: npm install の出現位置を確認する
    const warningIndex = setupNodeBlock.indexOf('WARNING: ECR image artifacts not found');
    const installIndex = setupNodeBlock.indexOf('npm install --include=dev');

    // Then: フォールバック警告の後でのみ実行され、旧メッセージは存在しない
    expect(warningIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThan(warningIndex);
    expect(setupNodeBlock).not.toContain('Installing dependencies (including dev)...');
    expect(setupNodeBlock).not.toContain('Building TypeScript sources...');
  });

  it('IT-833-025: WORKFLOW_DIR との整合性が維持されている', () => {
    // Given
    // When
    // Then
    expect(setupNodeBlock).toContain('dir(env.WORKFLOW_DIR');
  });
});

describe('docs update for setupNodeEnvironment (統合)', () => {
  it('IT-833-026: DEVELOPMENT.md に symlink 再利用方式の説明が追記されている', () => {
    // Given
    // When
    // Then
    expect(developmentDoc).toContain('symlink');
    expect(developmentDoc).toContain('ECR');
    expect(developmentDoc).toContain('/workspace/node_modules');
    expect(developmentDoc).toContain('/workspace/dist');
    expect(developmentDoc).toContain('npm run build');
  });

  it('IT-833-027: ENVIRONMENT.md に symlink 再利用方式の説明が追記されている', () => {
    // Given
    // When
    // Then
    expect(environmentDoc).toContain('setupNodeEnvironment');
    expect(environmentDoc).toContain('/workspace/node_modules');
    expect(environmentDoc).toContain('/workspace/dist');
    expect(environmentDoc).toContain('フォールバック');
  });
});
