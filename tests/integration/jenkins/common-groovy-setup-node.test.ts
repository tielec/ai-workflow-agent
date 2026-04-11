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

  // --- リトライ機構 ---
  it('IT-823-001: リトライラッパー（until / max_attempts）の存在を確認する', () => {
    // 意図: npm install が一時的な失敗時にリトライされる構造を保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: リトライラッパーの構文を確認する
    // Then: until ループと最大リトライ回数が含まれている
    expect(setupNodeBlock).toContain('until install_cmd');
    expect(setupNodeBlock).toContain('max_attempts=3');
    expect(setupNodeBlock).toContain('run_npm_install_with_retry');
  });

  it('IT-823-002: npm cache verify がリトライ内で呼ばれる', () => {
    // 意図: キャッシュ検証が失敗してもリトライが継続できることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: リトライ内のキャッシュ検証呼び出しを確認する
    // Then: npm cache verify が存在し、失敗許容が設定されている
    expect(setupNodeBlock).toContain('npm cache verify');
    expect(setupNodeBlock).toContain('npm cache verify || true');
  });

  it('IT-823-003: npm ネットワーク設定の環境変数が設定されている', () => {
    // 意図: 一過性のネットワーク障害への耐性を高める設定が注入されることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: npm_config の環境変数を確認する
    // Then: 4つの設定がすべて含まれている
    expect(setupNodeBlock).toContain('npm_config_fetch_retries=5');
    expect(setupNodeBlock).toContain('npm_config_fetch_retry_mintimeout=20000');
    expect(setupNodeBlock).toContain('npm_config_fetch_retry_maxtimeout=120000');
    expect(setupNodeBlock).toContain('npm_config_fetch_timeout=600000');
  });

  it('IT-823-004: package-lock.json がある場合に npm ci が使われる', () => {
    // 意図: 再現可能なインストールのため npm ci が選択されることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: npm ci の記述を確認する
    // Then: npm ci --include=dev が含まれている
    expect(setupNodeBlock).toContain('npm ci --include=dev');
  });

  it('IT-823-005: package-lock.json の存在チェック分岐がある', () => {
    // 意図: package-lock.json の有無で npm ci / npm install が切り替わることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: シェル条件分岐の記述を確認する
    // Then: package-lock.json の存在チェックが含まれている
    expect(setupNodeBlock).toContain('[ -f package-lock.json ]');
  });

  it('IT-823-006: [WARN] / [ERROR] 形式のログメッセージがある', () => {
    // 意図: リトライ時と最終失敗時のログ形式が規定どおりであることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: ログメッセージの文字列を確認する
    // Then: [WARN] と [ERROR] の文言が含まれている
    expect(setupNodeBlock).toContain('[ERROR] npm install failed after');
    expect(setupNodeBlock).toContain('[WARN] npm install failed (attempt');
  });

  it('IT-823-007: リトライ間のバックオフスリープが実装されている', () => {
    // 意図: リトライ間隔が指数バックオフであることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: スリープの算術式を確認する
    // Then: attempt に比例したスリープが含まれている
    expect(setupNodeBlock).toContain('sleep $((attempt * 10))');
  });

  it('IT-823-010: JSDoc にリトライ・npm ci・ネットワーク設定の説明がある', () => {
    // 意図: 仕様変更がコードコメントに反映されていることを保証する
    // Given: setupNodeEnvironment() ブロック（JSDoc 含む）が抽出済み
    // When: JSDoc 内の説明文を確認する
    // Then: リトライ、npm ci、ネットワーク設定に関する記述が含まれている
    expect(setupNodeBlock).toContain('リトライ');
    expect(setupNodeBlock).toContain('npm ci');
    expect(setupNodeBlock).toContain('ネットワーク設定');
  });

  it('IT-823-011: sh のシングルクォートが維持されている', () => {
    // 意図: Groovy 変数展開を避ける既存の制約が保持されていることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: sh ブロックのクォート形式を確認する
    // Then: シングルクォートが使用され、ダブルクォートは使われていない
    expect(setupNodeBlock).toContain("sh '''");
    expect(setupNodeBlock).not.toContain('sh """');
  });

  it('IT-823-012: フォールバックでリトライラッパーが呼び出される', () => {
    // 意図: 直接 npm install が実行されず、リトライラッパー経由になることを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: フォールバック箇所の呼び出しを確認する
    // Then: run_npm_install_with_retry が含まれている
    expect(setupNodeBlock).toContain('run_npm_install_with_retry');
  });

  it('IT-823-013: npm run build はリトライ対象外である', () => {
    // 意図: ビルド処理がインストールのリトライ対象に含まれないことを保証する
    // Given: setupNodeEnvironment() ブロックが抽出済み
    // When: リトライ関数の中身を抽出する
    // Then: npm run build が関数内に含まれていない
    const retryFunctionMatch = setupNodeBlock.match(
      /run_npm_install_with_retry\(\)\s*{([\s\S]*?)^\s*}/m
    );
    expect(retryFunctionMatch).not.toBeNull();
    const retryFunctionBody = retryFunctionMatch ? retryFunctionMatch[1] : '';
    expect(setupNodeBlock).toContain('npm run build');
    expect(retryFunctionBody).not.toContain('npm run build');
  });
});

describe('.npmrc settings (統合)', () => {
  it('IT-823-008: .npmrc にネットワーク設定が追記されている', () => {
    // 意図: npm のネットワーク耐性設定がファイル設定として保持されていることを保証する
    // Given: .npmrc の内容が読み込み済み
    // When: 設定値の存在を確認する
    // Then: 4項目すべてが含まれている
    expect(npmrcContent).toContain('fetch-retries=5');
    expect(npmrcContent).toContain('fetch-retry-mintimeout=20000');
    expect(npmrcContent).toContain('fetch-retry-maxtimeout=120000');
    expect(npmrcContent).toContain('fetch-timeout=600000');
  });

  it('IT-823-009: .npmrc の既存設定が保持されている', () => {
    // 意図: 追記によって既存の node-options 設定が失われないことを保証する
    // Given: .npmrc の内容が読み込み済み
    // When: node-options の記述を確認する
    // Then: 既存設定が含まれている
    expect(npmrcContent).toContain(
      'node-options=--experimental-vm-modules --max-old-space-size=4096'
    );
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

  it('IT-823-014: DEVELOPMENT.md にリトライと npm ci の説明がある', () => {
    // 意図: ドキュメントにリトライ対応と npm ci 切替が記載されていることを保証する
    // Given: DEVELOPMENT.md の内容が読み込み済み
    // When: リトライと npm ci に関する記述を確認する
    // Then: 両方の記述が含まれている
    expect(developmentDoc).toContain('リトライ');
    expect(developmentDoc).toContain('npm ci');
  });

  it('IT-823-015: ENVIRONMENT.md に npm ネットワーク設定の説明がある', () => {
    // 意図: npm ネットワーク設定がドキュメントに反映されていることを保証する
    // Given: ENVIRONMENT.md の内容が読み込み済み
    // When: fetch-retries / fetch-timeout の記述を確認する
    // Then: 主要な設定項目が含まれている
    expect(environmentDoc).toContain('fetch-retries');
    expect(environmentDoc).toContain('fetch-timeout');
  });
});
