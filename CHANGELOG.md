# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Issue #121**: Auto-Issue command for automatic GitHub Issue creation
  - Added `auto-issue` CLI command to automatically detect bugs, refactoring opportunities, and enhancement suggestions
  - Phase 1 (MVP): Bug detection functionality using TypeScript AST analysis (ts-morph)
  - Three core engines: RepositoryAnalyzer, IssueDeduplicator, IssueGenerator
  - Two-stage duplicate detection: Cosine similarity + LLM semantic analysis
  - OpenAI API integration for Issue content generation
  - GitHub API integration for Issue creation with labels (`bug`, `auto-generated`)
  - CLI options: `--category`, `--limit`, `--dry-run`, `--similarity-threshold`, `--creative-mode`
  - New dependencies: `ts-morph` (v21.0.1), `cosine-similarity` (v1.0.1)

### Fixed
- **Issue #102**: Test infrastructure improvements
  - Fixed test expectations in `file-selector.test.ts` to match SimpleGit's FileStatusResult type
  - Fixed Phase number expectations in `commit-message-builder.test.ts` (report=Phase 8, evaluation=Phase 9)
  - Added `chalk` to Jest transformIgnorePatterns for proper ESM package handling
  - Enabled integration test execution (`commit-manager.test.ts`)
- **Issue #105**: Extended Jest ESM package support (Follow-up to #102)
  - Added `#ansi-styles` (chalk's internal dependency) to Jest transformIgnorePatterns
  - Known limitation: chalk v5.3.0's ESM subpath imports are not fully resolved by Jest + ts-jest
  - `commit-manager.test.ts` still fails due to Node.js subpath imports compatibility issue
  - Requires follow-up with experimental-vm-modules configuration or chalk v4.x downgrade

## [0.3.0] - 2025-01-20

### Added
- Step-level Git commits and push functionality (#10)
- Step-level resume feature (#10)
- Metadata schema extension (current_step, completed_steps) (#10)
- CLI command processing separation (#22)
- Jest test framework with 189 unit tests and 90 integration tests (#22)

### Changed
- Reduced main.ts from 1309 lines to 118 lines (91% reduction) (#22)
- Separated command modules (init.ts, execute.ts, review.ts, list-presets.ts) (#22)
- Applied SOLID principles (Single Responsibility Principle) (#22)

## [0.2.0] - 2024-12-15

### Added
- Codex high-reasoning support
- Documentation updates

## [0.1.0] - 2024-11-01

### Added
- Initial TypeScript version
- Minimal CLI equivalent to Python version
