/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/commands/list-presets.ts',
    'src/commands/review.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
      diagnostics: false,
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  // ESMパッケージ（chalk、strip-ansi、ansi-regex、#ansi-styles）を変換対象に含める
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
  ],
  moduleNameMapper: {
    '^\\.\\./utils/logger\\.js$': '<rootDir>/src/core/utils/logger.ts',
    '^\\.\\./utils/error-utils\\.js$': '<rootDir>/src/core/utils/error-utils.ts',
    '^.+/core/utils/logger\\.js$': '<rootDir>/src/core/utils/logger.ts',
    '^.+/core/utils/error-utils\\.js$': '<rootDir>/src/core/utils/error-utils.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

module.exports = config;
