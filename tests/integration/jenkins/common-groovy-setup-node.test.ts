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
const npmrcPath = resolve('.npmrc');

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
let npmrcContent = '';

beforeAll(() => {
  // Given: 対象ファイルを読み込む
  commonContent = loadFile(commonPath);
  developmentDoc = loadFile(developmentDocPath);
  environmentDoc = loadFile(environmentDocPath);
  npmrcContent = loadFile(npmrcPath);

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
    const installIndex = setupNodeBlock.indexOf('npm_install_with_retry "npm install --include=dev"');

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

  it('IT-847-001: リトライラッパー関数が定義されている', () => {
    // Given: 抽出済みの関数ブロック
    // When: リトライラッパー関数を検索する
    // Then: npm_install_with_retry 関数定義が含まれる
    expect(setupNodeBlock).toContain('npm_install_with_retry');
  });

  it('IT-847-002: 最大リトライ回数が 3 回に設定されている', () => {
    // Given: 抽出済みの関数ブロック
    // When: 最大試行回数の設定を検査する
    // Then: max_attempts=3 が設定されている
    expect(setupNodeBlock).toContain('max_attempts=3');
  });

  it('IT-847-003: リトライ間に npm cache verify が実行される', () => {
    // Given: 抽出済みの関数ブロック
    // When: リトライ間の処理を検査する
    // Then: npm cache verify コマンドが含まれている
    expect(setupNodeBlock).toContain('npm cache verify');
  });

  it('IT-847-004: 最終失敗時のエラーメッセージが [ERROR] フォーマットである', () => {
    // Given: 抽出済みの関数ブロック
    // When: 最終失敗時のメッセージを検査する
    // Then: [ERROR] プレフィックスのエラーメッセージが含まれている
    expect(setupNodeBlock).toContain('[ERROR] npm install failed after');
  });

  it('IT-847-005: リトライ中の警告メッセージが [WARN] フォーマットである', () => {
    // Given: 抽出済みの関数ブロック
    // When: 試行失敗時のメッセージを検査する
    // Then: [WARN] プレフィックスの警告メッセージが含まれている
    expect(setupNodeBlock).toContain('[WARN] npm install failed (attempt');
  });

  it('IT-847-006: npm ネットワーク設定環境変数が含まれている', () => {
    // Given: 抽出済みの関数ブロック
    // When: npm ネットワーク設定の環境変数を検査する
    // Then: 4 つの環境変数設定が含まれている
    expect(setupNodeBlock).toContain('npm_config_fetch_retries=5');
    expect(setupNodeBlock).toContain('npm_config_fetch_retry_mintimeout=20000');
    expect(setupNodeBlock).toContain('npm_config_fetch_retry_maxtimeout=120000');
    expect(setupNodeBlock).toContain('npm_config_fetch_timeout=600000');
  });

  it('IT-847-007: フォールバック A が npm_install_with_retry 経由で呼び出されている', () => {
    // Given: 抽出済みの関数ブロック
    // When: フォールバック A の npm ci 呼び出しを検査する
    // Then: npm_install_with_retry 経由で呼び出されている
    expect(setupNodeBlock).toContain('npm_install_with_retry "npm ci --include=dev"');
  });

  it('IT-847-008: フォールバック B が npm_install_with_retry 経由で呼び出されている', () => {
    // Given: 抽出済みの関数ブロック
    // When: フォールバック B の npm install 呼び出しを検査する
    // Then: npm_install_with_retry 経由で呼び出されている
    expect(setupNodeBlock).toContain('npm_install_with_retry "npm install --include=dev"');
  });

  it('IT-847-009: リトライ間のスリープ（バックオフ）が含まれている', () => {
    // Given: 抽出済みの関数ブロック
    // When: バックオフ処理を検査する
    // Then: sleep コマンドが含まれている
    expect(setupNodeBlock).toContain('sleep $((attempt * 10))');
  });
});

describe('.npmrc network settings for setupNodeEnvironment (統合)', () => {
  it('IT-847-010: .npmrc に fetch-retries=5 が含まれている', () => {
    // Given: .npmrc ファイルの内容
    // When: ファイル内容を検査する
    // Then: fetch-retries=5 が含まれている
    expect(npmrcContent).toContain('fetch-retries=5');
  });

  it('IT-847-011: .npmrc に fetch-retry-mintimeout=20000 が含まれている', () => {
    // Given: .npmrc ファイルの内容
    // When: ファイル内容を検査する
    // Then: fetch-retry-mintimeout=20000 が含まれている
    expect(npmrcContent).toContain('fetch-retry-mintimeout=20000');
  });

  it('IT-847-012: .npmrc に fetch-retry-maxtimeout=120000 が含まれている', () => {
    // Given: .npmrc ファイルの内容
    // When: ファイル内容を検査する
    // Then: fetch-retry-maxtimeout=120000 が含まれている
    expect(npmrcContent).toContain('fetch-retry-maxtimeout=120000');
  });

  it('IT-847-013: .npmrc に fetch-timeout=600000 が含まれている', () => {
    // Given: .npmrc ファイルの内容
    // When: ファイル内容を検査する
    // Then: fetch-timeout=600000 が含まれている
    expect(npmrcContent).toContain('fetch-timeout=600000');
  });

  it('IT-847-014: 既存の node-options 設定が維持されている', () => {
    // Given: .npmrc ファイルの内容
    // When: ファイル内容を検査する
    // Then: 既存の node-options 設定が維持されている
    expect(npmrcContent).toContain('node-options=--experimental-vm-modules --max-old-space-size=4096');
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

  it('IT-847-015: DEVELOPMENT.md にリトライ機構の説明が追記されている', () => {
    // Given: DEVELOPMENT.md の内容
    // When: リトライ機構の説明を検査する
    // Then: リトライラッパーとキャッシュ検証の説明が含まれている
    expect(developmentDoc).toContain('npm_install_with_retry');
    expect(developmentDoc).toContain('npm cache verify');
  });

  it('IT-847-016: ENVIRONMENT.md に npm ネットワーク設定の説明が追記されている', () => {
    // Given: ENVIRONMENT.md の内容
    // When: npm ネットワーク設定の説明を検査する
    // Then: fetch-retries と fetch-timeout の説明が含まれている
    expect(environmentDoc).toContain('fetch-retries');
    expect(environmentDoc).toContain('fetch-timeout');
  });
});
