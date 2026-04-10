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
  // --- node_modules symlink ---
  it('IT-833-001: node_modules の symlink コマンドが含まれている', () => {
    expect(setupNodeBlock).toContain('ln -s /workspace/node_modules node_modules');
  });

  it('IT-833-002: node_modules の symlink ガード条件が含まれている', () => {
    expect(setupNodeBlock).toContain('[ -d /workspace/node_modules ]');
    expect(setupNodeBlock).toContain('[ ! -e node_modules ]');
  });

  it('IT-833-003: symlink 成功メッセージが含まれている', () => {
    expect(setupNodeBlock).toContain('Linking pre-built node_modules from ECR image');
  });

  // --- dist は symlink せず毎回ビルド ---
  it('IT-833-004: dist の symlink は行わない', () => {
    expect(setupNodeBlock).not.toContain('ln -s /workspace/dist');
  });

  it('IT-833-005: npm run build が常に実行される', () => {
    expect(setupNodeBlock).toContain('npm run build');
  });

  // --- package.json 差分検証 ---
  it('IT-833-006: package.json の dependencies 差分検証が含まれている', () => {
    expect(setupNodeBlock).toContain('/workspace/package.json');
    expect(setupNodeBlock).toContain('dependencies');
    expect(setupNodeBlock).toContain('devDependencies');
  });

  it('IT-833-007: 差分検証の結果で symlink 可否を判定している', () => {
    expect(setupNodeBlock).toContain('DEPS_MATCH');
  });

  // --- フォールバック ---
  it('IT-833-008: dependencies 不一致時に npm install が実行される', () => {
    expect(setupNodeBlock).toContain('dependencies differ from ECR image');
    expect(setupNodeBlock).toContain('npm install --include=dev');
  });

  it('IT-833-009: ECR node_modules 未検出時に npm install が実行される', () => {
    expect(setupNodeBlock).toContain('ECR image node_modules not found');
    expect(setupNodeBlock).toContain('npm install --include=dev');
  });

  // --- 環境情報出力 ---
  it('IT-833-010: node --version の出力が維持されている', () => {
    expect(setupNodeBlock).toContain('node --version');
  });

  it('IT-833-011: npm --version の出力が維持されている', () => {
    expect(setupNodeBlock).toContain('npm --version');
  });

  it('IT-833-012: whoami の出力が維持されている', () => {
    expect(setupNodeBlock).toContain('whoami');
  });

  it('IT-833-013: ステージヘッダーが維持されている', () => {
    expect(setupNodeBlock).toContain('Stage: Setup Node.js Environment');
  });

  it('IT-833-014: HOME ディレクトリの出力が維持されている', () => {
    expect(setupNodeBlock).toContain('HOME directory: $HOME');
  });

  // --- コード品質 ---
  it('IT-833-015: JSDoc コメントに symlink の説明が含まれている', () => {
    expect(setupNodeBlock).toContain('symlink');
  });

  it('IT-833-016: sh はシングルクォートで記述されている', () => {
    expect(setupNodeBlock).toContain("sh '''");
    expect(setupNodeBlock).not.toContain('sh """');
  });

  it('IT-833-017: WORKFLOW_DIR との整合性が維持されている', () => {
    expect(setupNodeBlock).toContain('dir(env.WORKFLOW_DIR');
  });

  it('IT-833-018: npm install --include=dev が無条件に実行されない', () => {
    // npm install は条件分岐（フォールバック）内でのみ出現する
    expect(setupNodeBlock).not.toContain('Installing dependencies (including dev)...');
  });
});

describe('docs update for setupNodeEnvironment (統合)', () => {
  it('IT-833-019: DEVELOPMENT.md に symlink 再利用方式の説明が追記されている', () => {
    expect(developmentDoc).toContain('symlink');
    expect(developmentDoc).toContain('ECR');
    expect(developmentDoc).toContain('/workspace/node_modules');
    expect(developmentDoc).toContain('npm run build');
  });

  it('IT-833-020: ENVIRONMENT.md に symlink 再利用方式の説明が追記されている', () => {
    expect(environmentDoc).toContain('setupNodeEnvironment');
    expect(environmentDoc).toContain('/workspace/node_modules');
    expect(environmentDoc).toContain('フォールバック');
  });
});
