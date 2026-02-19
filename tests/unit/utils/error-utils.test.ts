/**
 * Unit tests for error-utils module
 *
 * Tests cover:
 * - getErrorMessage(): Error message extraction from all types (Error, string, number, null, undefined, object, Symbol)
 * - getErrorStack(): Stack trace extraction from Error objects
 * - isError(): Type guard function for Error detection
 * - Edge cases: circular references, custom toString(), empty values
 * - Never throw guarantee: All functions must not throw exceptions
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { ConflictError, getErrorMessage, getErrorStack, isError } from '../../../src/utils/error-utils.js';

describe('Error Utils Module', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getErrorMessage()', () => {
    describe('Normal Cases', () => {
      it('should extract message from Error object (TC-U001)', () => {
        // Given: Standard Error object
        const error = new Error('Test error message');

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: error.message is returned
        expect(message).toBe('Test error message');
      });

      it('should extract message from Error subclasses (TC-U002)', () => {
        // Given: Various Error subclasses
        const typeError = new TypeError('Type error message');
        const syntaxError = new SyntaxError('Syntax error message');
        const rangeError = new RangeError('Range error message');
        const referenceError = new ReferenceError('Reference error message');

        // When: extracting error messages
        const typeMessage = getErrorMessage(typeError);
        const syntaxMessage = getErrorMessage(syntaxError);
        const rangeMessage = getErrorMessage(rangeError);
        const refMessage = getErrorMessage(referenceError);

        // Then: all error messages are correctly extracted
        expect(typeMessage).toBe('Type error message');
        expect(syntaxMessage).toBe('Syntax error message');
        expect(rangeMessage).toBe('Range error message');
        expect(refMessage).toBe('Reference error message');
      });

      it('should return string as-is (TC-U003)', () => {
        // Given: String error
        const error = 'String error message';

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: string is returned unchanged
        expect(message).toBe('String error message');
      });

      it('should convert number to string (TC-U004)', () => {
        // Given: Various number types
        const error1 = 404;
        const error2 = 0;
        const error3 = -1;
        const error4 = Infinity;
        const error5 = NaN;

        // When: extracting error messages
        const message1 = getErrorMessage(error1);
        const message2 = getErrorMessage(error2);
        const message3 = getErrorMessage(error3);
        const message4 = getErrorMessage(error4);
        const message5 = getErrorMessage(error5);

        // Then: numbers are converted to strings
        expect(message1).toBe('404');
        expect(message2).toBe('0');
        expect(message3).toBe('-1');
        expect(message4).toBe('Infinity');
        expect(message5).toBe('NaN');
      });

      it('should handle object conversion (TC-U007)', () => {
        // Given: Various object types
        const objectError1 = { code: 500, message: 'Internal error' };
        const objectError2 = {
          toString() {
            return 'Custom error';
          },
        };
        const arrayError1: unknown[] = [];
        const arrayError2 = [1, 2, 3];

        // When: extracting error messages
        const message1 = getErrorMessage(objectError1);
        const message2 = getErrorMessage(objectError2);
        const message3 = getErrorMessage(arrayError1);
        const message4 = getErrorMessage(arrayError2);

        // Then: objects are converted to strings
        expect(message1).toBe('[object Object]');
        expect(message2).toBe('Custom error'); // custom toString() is called
        expect(message3).toBe('');
        expect(message4).toBe('1,2,3');
      });
    });

    describe('Boundary Cases', () => {
      it('should handle null (TC-U005)', () => {
        // Given: null error
        const error = null;

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: "null" is returned
        expect(message).toBe('null');
      });

      it('should handle undefined (TC-U006)', () => {
        // Given: undefined error
        const error = undefined;

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: "undefined" is returned
        expect(message).toBe('undefined');
      });

      it('should handle empty string (TC-U010)', () => {
        // Given: empty string error
        const error = '';

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: empty string is returned unchanged
        expect(message).toBe('');
      });
    });

  describe('Edge Cases', () => {
      it('should handle Symbol (TC-U008)', () => {
        // Given: Symbol error
        const error = Symbol('test');

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: Symbol is converted to string
        expect(message).toBe('Symbol(test)');
      });

      it('should handle circular reference object (TC-U009)', () => {
        // Given: object with circular reference
        const obj: any = { name: 'circular' };
        obj.self = obj;

        // When: extracting error message
        // Then: should not throw error (never throw guarantee)
        expect(() => getErrorMessage(obj)).not.toThrow();

        const message = getErrorMessage(obj);
        // Note: Circular reference objects may produce "[object Object]" or fallback
        expect(typeof message).toBe('string');
      });

      it('should handle object with throwing toString() (TC-U301)', () => {
        // Given: object with toString() that throws
        const obj = {
          toString() {
            throw new Error('toString() error');
          },
        };

        // When: extracting error message
        // Then: should not throw error (never throw guarantee)
        expect(() => getErrorMessage(obj)).not.toThrow();

        const message = getErrorMessage(obj);
        // Should fallback to "[Unparseable error]"
        expect(message).toBe('[Unparseable error]');
      });

      it('should handle Error with empty message', () => {
        // Given: Error with empty message
        const error = new Error('');

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: empty string is returned
        expect(message).toBe('');
      });

      it('should handle very long error message', () => {
        // Given: Error with very long message (10000 characters)
        const longMessage = 'a'.repeat(10000);
        const error = new Error(longMessage);

        // When: extracting error message
        const message = getErrorMessage(error);

        // Then: entire message is returned without truncation
        expect(message).toBe(longMessage);
        expect(message.length).toBe(10000);
      });
    });

    describe('Never Throw Guarantee', () => {
      it('should never throw for any input (TC-U301)', () => {
        // Given: Various edge case inputs
        const inputs: unknown[] = [
          new Error('test'),
          'string',
          123,
          null,
          undefined,
          {},
          [],
          Symbol('test'),
          true,
          false,
          BigInt(123),
        ];

        // When/Then: all inputs are processed without throwing
        inputs.forEach((input) => {
          expect(() => getErrorMessage(input)).not.toThrow();
          expect(typeof getErrorMessage(input)).toBe('string');
        });
      });
    });
  });

  describe('getErrorStack()', () => {
    describe('Normal Cases', () => {
      it('should extract stack trace from Error object (TC-U101)', () => {
        // Given: Error object with stack trace
        const error = new Error('Test error');

        // When: extracting stack trace
        const stack = getErrorStack(error);

        // Then: stack trace is returned
        expect(stack).toBeDefined();
        expect(typeof stack).toBe('string');
        expect(stack).toContain('Error: Test error');
      });

      it('should extract stack trace from Error subclasses (TC-U104)', () => {
        // Given: Various Error subclasses
        const typeError = new TypeError('Type error');
        const syntaxError = new SyntaxError('Syntax error');

        // When: extracting stack traces
        const typeStack = getErrorStack(typeError);
        const syntaxStack = getErrorStack(syntaxError);

        // Then: stack traces are returned
        expect(typeStack).toBeDefined();
        expect(typeof typeStack).toBe('string');
        expect(typeStack).toContain('TypeError: Type error');

        expect(syntaxStack).toBeDefined();
        expect(typeof syntaxStack).toBe('string');
        expect(syntaxStack).toContain('SyntaxError: Syntax error');
      });
    });

    describe('Abnormal Cases', () => {
      it('should return undefined for Error without stack (TC-U102)', () => {
        // Given: Error object without stack trace
        const error = new Error('Test error');
        delete (error as any).stack;

        // When: extracting stack trace
        const stack = getErrorStack(error);

        // Then: undefined is returned
        expect(stack).toBeUndefined();
      });

      it('should return undefined for non-Error objects (TC-U103)', () => {
        // Given: Various non-Error types
        const stringError = 'string error';
        const numberError = 404;
        const nullError = null;
        const undefinedError = undefined;
        const objectError = { message: 'fake error' };

        // When: extracting stack traces
        const stringStack = getErrorStack(stringError);
        const numberStack = getErrorStack(numberError);
        const nullStack = getErrorStack(nullError);
        const undefinedStack = getErrorStack(undefinedError);
        const objectStack = getErrorStack(objectError);

        // Then: all return undefined
        expect(stringStack).toBeUndefined();
        expect(numberStack).toBeUndefined();
        expect(nullStack).toBeUndefined();
        expect(undefinedStack).toBeUndefined();
        expect(objectStack).toBeUndefined();
      });
    });

    describe('Never Throw Guarantee', () => {
      it('should never throw for any input (TC-U302)', () => {
        // Given: Various edge case inputs
        const inputs: unknown[] = [
          new Error('test'),
          'string',
          123,
          null,
          undefined,
          {},
          [],
          Symbol('test'),
          { stack: 'fake stack' }, // object with stack property but not Error
        ];

        // When/Then: all inputs are processed without throwing
        inputs.forEach((input) => {
          expect(() => getErrorStack(input)).not.toThrow();
          const result = getErrorStack(input);
          expect(result === undefined || typeof result === 'string').toBe(true);
        });
      });
    });
  });

  describe('isError()', () => {
    describe('Normal Cases', () => {
      it('should return true for Error object (TC-U201)', () => {
        // Given: Standard Error object
        const error = new Error('Test error');

        // When: checking if it is Error
        const result = isError(error);

        // Then: true is returned
        expect(result).toBe(true);
      });

      it('should return true for Error subclasses (TC-U202)', () => {
        // Given: Various Error subclasses
        const typeError = new TypeError('Type error');
        const syntaxError = new SyntaxError('Syntax error');
        const rangeError = new RangeError('Range error');
        const referenceError = new ReferenceError('Reference error');

        // When: checking if they are Errors
        const typeResult = isError(typeError);
        const syntaxResult = isError(syntaxError);
        const rangeResult = isError(rangeError);
        const refResult = isError(referenceError);

        // Then: all return true
        expect(typeResult).toBe(true);
        expect(syntaxResult).toBe(true);
        expect(rangeResult).toBe(true);
        expect(refResult).toBe(true);
      });

      it('should return false for non-Error objects (TC-U203)', () => {
        // Given: Various non-Error types
        const stringError = 'string error';
        const numberError = 404;
        const nullError = null;
        const undefinedError = undefined;
        const objectError = { message: 'fake error' };
        const arrayError: unknown[] = [];
        const symbolError = Symbol('error');

        // When: checking if they are Errors
        const stringResult = isError(stringError);
        const numberResult = isError(numberError);
        const nullResult = isError(nullError);
        const undefinedResult = isError(undefinedError);
        const objectResult = isError(objectError);
        const arrayResult = isError(arrayError);
        const symbolResult = isError(symbolError);

        // Then: all return false
        expect(stringResult).toBe(false);
        expect(numberResult).toBe(false);
        expect(nullResult).toBe(false);
        expect(undefinedResult).toBe(false);
        expect(objectResult).toBe(false);
        expect(arrayResult).toBe(false);
        expect(symbolResult).toBe(false);
      });
    });

    describe('Type Narrowing', () => {
      it('should enable type narrowing in TypeScript (TC-U204)', () => {
        // Given: unknown error
        const error: unknown = new Error('Test error');

        // When: using isError() as type guard
        if (isError(error)) {
          // Then: error is narrowed to Error type
          // These accesses should not cause TypeScript compilation errors
          const message: string = error.message;
          const stack: string | undefined = error.stack;
          const name: string = error.name;

          expect(message).toBe('Test error');
          expect(typeof stack).toBe('string');
          expect(name).toBe('Error');
        } else {
          // Should not reach here
          fail('isError() should return true for Error object');
        }
      });

      it('should correctly narrow type for non-Error values', () => {
        // Given: non-Error value
        const error: unknown = 'string error';

        // When: using isError() as type guard
        if (isError(error)) {
          // Should not reach here
          fail('isError() should return false for string');
        } else {
          // Then: type narrowing works correctly
          // error remains unknown type
          expect(typeof error).toBe('string');
        }
      });
    });

    describe('Never Throw Guarantee', () => {
      it('should never throw for any input (TC-U303)', () => {
        // Given: Various edge case inputs
        const inputs: unknown[] = [
          new Error('test'),
          'string',
          123,
          null,
          undefined,
          {},
          [],
          Symbol('test'),
          true,
          false,
          BigInt(123),
        ];

        // When/Then: all inputs are processed without throwing
        inputs.forEach((input) => {
          expect(() => isError(input)).not.toThrow();
          expect(typeof isError(input)).toBe('boolean');
        });
      });
    });
  });

  describe('Integration with Real Error Scenarios', () => {
    it('should handle try-catch with Error object', () => {
      // Given: function that throws Error
      const throwError = () => {
        throw new Error('Something went wrong');
      };

      // When: catching and processing error
      try {
        throwError();
      } catch (error) {
        // Then: error utilities work correctly
        expect(getErrorMessage(error)).toBe('Something went wrong');
        expect(getErrorStack(error)).toBeDefined();
        expect(isError(error)).toBe(true);
      }
    });

    it('should handle try-catch with string throw', () => {
      // Given: function that throws string
      const throwString = () => {
        throw 'String error';
      };

      // When: catching and processing error
      try {
        throwString();
      } catch (error) {
        // Then: error utilities work correctly
        expect(getErrorMessage(error)).toBe('String error');
        expect(getErrorStack(error)).toBeUndefined();
        expect(isError(error)).toBe(false);
      }
    });

    it('should handle try-catch with null throw', () => {
      // Given: function that throws null
      const throwNull = () => {
        throw null;
      };

      // When: catching and processing error
      try {
        throwNull();
      } catch (error) {
        // Then: error utilities work correctly
        expect(getErrorMessage(error)).toBe('null');
        expect(getErrorStack(error)).toBeUndefined();
        expect(isError(error)).toBe(false);
      }
    });

    it('should handle try-catch with undefined throw', () => {
      // Given: function that throws undefined
      const throwUndefined = () => {
        throw undefined;
      };

      // When: catching and processing error
      try {
        throwUndefined();
      } catch (error) {
        // Then: error utilities work correctly
        expect(getErrorMessage(error)).toBe('undefined');
        expect(getErrorStack(error)).toBeUndefined();
        expect(isError(error)).toBe(false);
      }
    });

    it('should handle try-catch with number throw', () => {
      // Given: function that throws number
      const throwNumber = () => {
        throw 404;
      };

      // When: catching and processing error
      try {
        throwNumber();
      } catch (error) {
        // Then: error utilities work correctly
        expect(getErrorMessage(error)).toBe('404');
        expect(getErrorStack(error)).toBeUndefined();
        expect(isError(error)).toBe(false);
      }
    });

    it('should handle try-catch with custom object throw', () => {
      // Given: function that throws custom object
      const throwObject = () => {
        throw { code: 500, message: 'Internal error' };
      };

      // When: catching and processing error
      try {
        throwObject();
      } catch (error) {
        // Then: error utilities work correctly
        expect(getErrorMessage(error)).toBe('[object Object]');
        expect(getErrorStack(error)).toBeUndefined();
        expect(isError(error)).toBe(false);
      }
    });
  });

  describe('Functional Equivalence with "as Error" Cast', () => {
    it('should produce same message as (error as Error).message for Error objects', () => {
      // Given: Error object
      const error: unknown = new Error('Test message');

      // When: comparing getErrorMessage() vs (error as Error).message
      const utilMessage = getErrorMessage(error);
      const castMessage = (error as Error).message;

      // Then: results are identical
      expect(utilMessage).toBe(castMessage);
    });

    it('should be safer than (error as Error).message for non-Error objects', () => {
      // Given: non-Error object
      const error: unknown = 'string error';

      // When: using getErrorMessage() (safe)
      const utilMessage = getErrorMessage(error);

      // Then: getErrorMessage() returns string safely
      expect(utilMessage).toBe('string error');

      // Note: (error as Error).message would return undefined at runtime
      // and cause potential issues
    });
  });

  describe('ConflictError', () => {
    it('ConflictError_インスタンス生成_Errorを継承', () => {
      // Given: ConflictError
      const error = new ConflictError('Merge conflict detected', ['src/a.ts']);

      // When / Then: Error を継承し、メッセージと名前が正しい
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('Merge conflict detected');
      expect(error.name).toBe('ConflictError');
      expect(error.conflictFiles).toEqual(['src/a.ts']);
      expect(isError(error)).toBe(true);
      expect(getErrorMessage(error)).toBe('Merge conflict detected');
    });

    it('ConflictError_スタックトレース_正しく取得される', () => {
      // Given: ConflictError
      const error = new ConflictError('conflict');

      // When: スタックトレースを取得
      const stack = getErrorStack(error);

      // Then: スタックトレースが存在する
      expect(stack).toBeDefined();
      expect(typeof stack).toBe('string');
    });
  });
});
