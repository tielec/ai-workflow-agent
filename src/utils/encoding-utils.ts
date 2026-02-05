/**
 * UTF-8エンコーディング検証・修正ユーティリティ
 *
 * Mojibake（UTF-8がLatin-1として誤解釈されたパターン）を検出・修正し、
 * JSON処理やファイル出力前に安全な文字列へ正規化するための関数群。
 */

/**
 * UTF-8がLatin-1として誤解釈されたパターンを含むかを検出する。
 * 代表的なMojibake文字（Ã, Â など）が連続して出現するかを判定する。
 */
export function isMojibake(str: string): boolean {
  if (!str || str.length === 0) {
    return false;
  }

  // UTF-8多バイトがLatin-1で解釈された際に現れる典型的なシーケンスを検出
  const mojibakePattern = /(Ã[\u0000-\u007F]|Â[\u0000-\u007F]|æ[\u0000-\u007F]|å[\u0000-\u007F]|¢[\u0000-\u007F])/;
  return mojibakePattern.test(str);
}

/**
 * 渡された文字列がUTF-8として往復変換可能かを判定する。
 */
export function isValidUtf8(str: string): boolean {
  try {
    const encoded = Buffer.from(str, 'utf-8');
    const decoded = encoded.toString('utf-8');
    return decoded === str;
  } catch {
    return false;
  }
}

/**
 * Latin-1誤解釈によるMojibakeを可能な範囲で修正する。
 * 修正後もMojibakeが残る、またはUTF-8として無効な場合は元の文字列を返す。
 */
export function fixMojibake(str: string): string {
  if (!str || str.length === 0) {
    return str;
  }

  if (!isMojibake(str)) {
    return str;
  }

  try {
    const bytes = Buffer.from(str, 'latin1');
    const fixed = bytes.toString('utf-8');

    if (isMojibake(fixed) || !isValidUtf8(fixed)) {
      return str;
    }

    return fixed;
  } catch {
    return str;
  }
}

/**
 * JSON解析前に安全な文字列へ正規化する。
 * - Mojibake修正
 * - 制御文字の除去（改行/タブは保持）
 */
export function sanitizeForJson(str: string): string {
  if (!str || str.length === 0) {
    return str;
  }

  let result = fixMojibake(str);

  // JSONで問題となる制御文字を除去（改行・タブは保持）
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return result;
}

/**
 * オブジェクトの全文字列プロパティを再帰的にサニタイズする。
 * 元オブジェクトは変更せず、新しい構造を返却する。
 */
export function sanitizeObjectStrings(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeForJson(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectStrings(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeObjectStrings(value);
    }
    return result;
  }

  return obj;
}
