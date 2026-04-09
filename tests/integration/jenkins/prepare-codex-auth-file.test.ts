/**
 * 統合テスト: prepareCodexAuthFile の実装検証
 *
 * Jenkins 実機の統合検証は手動で行う前提のため、ここでは
 * common.groovy の実装が設計どおりの構成になっていることを静的に確認する。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const commonPath = resolve('jenkins/shared/common.groovy');

const loadCommon = (): string => readFileSync(commonPath, 'utf8');

const extractFunctionBlock = (content: string, functionName: string): string => {
  const signature = new RegExp(`def\\s+${functionName}\\s*\\(\\s*\\)`);
  const signatureMatch = signature.exec(content);
  if (!signatureMatch) {
    return '';
  }

  const startIndex = signatureMatch.index;
  const braceStart = content.indexOf('{', startIndex + signatureMatch[0].length);
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

const getPrepareCodexAuthBlock = (): string => {
  const content = loadCommon();
  return extractFunctionBlock(content, 'prepareCodexAuthFile');
};

describe('common.groovy prepareCodexAuthFile (統合)', () => {
  it('CODEX_AUTH_JSON が空の場合にスキップし CODEX_HOME を空にする (IT-05)', () => {
    // Given: common.groovy から対象関数ブロックを抽出
    const block = getPrepareCodexAuthBlock();

    // When: スキップ条件と環境変数操作を確認する
    // Then: 空チェック -> スキップ -> CODEX_HOME を空に設定
    expect(block).toContain("if (!codexAuth.trim())");
    expect(block).toContain('CODEX_AUTH_JSON is empty; skipping Codex auth setup.');
    expect(block).toContain("env.CODEX_HOME = ''");
    expect(block).toContain('return');
  });

  it('writeFile を使用せず sh ベースの書き込みに統一している (IT-01/IT-07)', () => {
    // Given
    const block = getPrepareCodexAuthBlock();

    // When/Then: writeFile が存在せず、withEnv + sh が存在する
    expect(block).not.toContain('writeFile');
    expect(block).toContain('withEnv([');
    expect(block).toContain('CODEX_AUTH_JSON_VALUE');
    expect(block).toContain("sh '''");
  });

  it('機密情報をログに出さないため set +x と printf を使用する (IT-04)', () => {
    // Given
    const block = getPrepareCodexAuthBlock();

    // When/Then: set +x と printf 経由の書き込みが含まれる
    expect(block).toContain('set +x');
    expect(block).toContain("printf '%s' \"$CODEX_AUTH_JSON_VALUE\" > \"$AUTH_FILE_PATH\"");
  });

  it('書き込み失敗時に set -e と exit 1 でエラーハンドリングする (IT-07)', () => {
    // Given
    const block = getPrepareCodexAuthBlock();

    // When/Then: 失敗時に exit 1 する構成を明示的に検証
    expect(block).toContain('set -e');
    expect(block).toContain('Failed to write auth.json');
    expect(block).toContain('exit 1');
  });

  it('auth.json を 600 権限で保存し ~/.codex/auth.json にコピーする (IT-02/IT-03)', () => {
    // Given
    const block = getPrepareCodexAuthBlock();

    // When/Then: 600 の chmod とコピー処理が含まれる
    expect(block).toContain('chmod 600 "$AUTH_FILE_PATH"');
    expect(block).toContain('cp "$AUTH_FILE_PATH" "$HOME_AUTH_FILE"');
    expect(block).toContain('chmod 600 "$HOME_AUTH_FILE"');
    expect(block).toContain('HOME_CODEX_DIR');
  });

  it('CODEX_HOME を workspace tmp 配下に設定し、準備完了ログを出す (IT-01/IT-02)', () => {
    // Given
    const block = getPrepareCodexAuthBlock();

    // When/Then: CODEX_HOME を設定し、完了ログを出力する
    expect(block).toContain('def workspaceTmp');
    expect(block).toContain('def codexHome');
    expect(block).toContain('env.CODEX_HOME = codexHome');
    expect(block).toContain('Codex auth.json prepared at');
    expect(block).toContain('Codex auth.json copied to');
  });

  it('デバッグログは機密情報を含めず ls -la のみを出力する (IT-08)', () => {
    // Given
    const block = getPrepareCodexAuthBlock();

    // When/Then: id と ls -la の出力が含まれ、値の直接出力がない
    expect(block).toContain('echo "[INFO] id: $(id)"');
    expect(block).toContain('ls -la "$AUTH_FILE_PATH" "$HOME_AUTH_FILE"');
    expect(block).not.toMatch(/echo\s+"[^"]*CODEX_AUTH_JSON_VALUE/);
  });
});
