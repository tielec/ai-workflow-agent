/**
 * エラーハンドリングユーティリティモジュール
 * unknown 型のエラーから安全にメッセージやスタックトレースを抽出する関数を提供します。
 *
 * @module error-utils
 */

/**
 * エラーライク型（将来的な拡張用）
 * カスタムエラーオブジェクトの判定に使用可能
 */
export interface ErrorLike {
  message: string;
  stack?: string;
}

/**
 * unknown型のエラーから安全にエラーメッセージを抽出します。
 *
 * このユーティリティ関数は、catch ブロックで捕捉したエラーが
 * Error オブジェクトでない場合でも安全に処理できます。
 *
 * @param error - 抽出元のエラー（unknown型）
 * @returns エラーメッセージ文字列
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   console.error(getErrorMessage(error));  // "Something went wrong"
 * }
 * ```
 *
 * @example 非Errorオブジェクトの場合
 * ```typescript
 * try {
 *   throw 'String error';
 * } catch (error) {
 *   console.error(getErrorMessage(error));  // "String error"
 * }
 * ```
 *
 * @example nullの場合
 * ```typescript
 * try {
 *   throw null;
 * } catch (error) {
 *   console.error(getErrorMessage(error));  // "null"
 * }
 * ```
 *
 * @remarks
 * - Error オブジェクトの場合: `error.message` を返す
 * - 文字列の場合: そのまま返す
 * - null の場合: `"null"` を返す
 * - undefined の場合: `"undefined"` を返す
 * - その他の型: `String(error)` で文字列化して返す
 * - この関数は決して例外をスローしません
 */
export function getErrorMessage(error: unknown): string {
  // 1. Error オブジェクトの判定
  if (error instanceof Error) {
    return error.message;
  }

  // 2. 文字列の判定
  if (typeof error === 'string') {
    return error;
  }

  // 3. null / undefined のフォールバック
  if (error === null) {
    return 'null';
  }

  if (error === undefined) {
    return 'undefined';
  }

  // 4. その他（number、object、Symbol等）
  // String(error) で安全に文字列化
  try {
    return String(error);
  } catch (conversionError) {
    // 文字列化に失敗した場合のフォールバック
    // （循環参照オブジェクト等）
    return '[Unparseable error]';
  }
}

/**
 * unknown型のエラーから安全にスタックトレースを抽出します。
 *
 * Error オブジェクトの場合のみスタックトレースを返します。
 * 非Error オブジェクトの場合は undefined を返します。
 *
 * @param error - 抽出元のエラー（unknown型）
 * @returns スタックトレース文字列（Error の場合）または undefined
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   const stack = getErrorStack(error);
 *   if (stack) {
 *     console.error('Stack trace:', stack);
 *   }
 * }
 * ```
 *
 * @example 非Errorオブジェクトの場合
 * ```typescript
 * try {
 *   throw 'String error';
 * } catch (error) {
 *   const stack = getErrorStack(error);
 *   console.log(stack);  // undefined
 * }
 * ```
 *
 * @remarks
 * - Error オブジェクトかつ stack プロパティが存在する場合: `error.stack` を返す
 * - それ以外の場合: `undefined` を返す
 * - この関数は決して例外をスローしません
 */
export function getErrorStack(error: unknown): string | undefined {
  // Error オブジェクトかつ stack プロパティが存在する場合のみ返す
  if (error instanceof Error && typeof error.stack === 'string') {
    return error.stack;
  }

  // それ以外は undefined
  return undefined;
}

/**
 * unknown型の値が Error オブジェクトかどうかを判定する型ガード関数です。
 *
 * TypeScript の型システムと連携し、型ナローイングをサポートします。
 *
 * @param error - 判定対象の値（unknown型）
 * @returns Error オブジェクトの場合 true、それ以外は false
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   if (isError(error)) {
 *     // ここで error は Error 型にナローイングされる
 *     console.error(error.message);  // OK
 *     console.error(error.stack);    // OK
 *   } else {
 *     console.error('Non-error thrown:', error);
 *   }
 * }
 * ```
 *
 * @example Error のサブクラス
 * ```typescript
 * try {
 *   throw new TypeError('Type error');
 * } catch (error) {
 *   if (isError(error)) {
 *     console.log('This is an Error object');  // true
 *   }
 * }
 * ```
 *
 * @remarks
 * - `instanceof Error` を使用して判定
 * - Error のサブクラス（TypeError、SyntaxError 等）も true を返す
 * - この関数は決して例外をスローしません
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}
