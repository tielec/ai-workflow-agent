# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Issue #126**: Auto-issue command for automatic bug detection and GitHub Issue generation
  - New `auto-issue` CLI command with 5 options (--category, --limit, --dry-run, --similarity-threshold, --agent)
  - RepositoryAnalyzer module for automatic code analysis (30+ languages and file types support after Issue #144)
  - IssueDeduplicator module with 2-stage duplicate detection (cosine similarity + LLM judgment)
  - IssueGenerator module for automatic GitHub Issue creation
  - Phase 1 MVP scope: bug detection only, 30+ programming languages/file types support, src/ directory analysis
  - Comprehensive test coverage: 52 test cases (10 RepositoryAnalyzer, 10 IssueDeduplicator, 8 IssueGenerator, 10 CLI, 14 integration)
- **Issue #144**: Auto-issue language support generalization (v0.5.1)
  - Removed TypeScript/Python-only restriction from RepositoryAnalyzer
  - Added support for 30+ programming languages across 6 categories:
    - Script languages (JavaScript, TypeScript, Python, Ruby, PHP, Perl, Shell)
    - Compiled languages (Go, Java, Kotlin, Rust, C, C++, C#, Swift)
    - JVM languages (Groovy, Scala)
    - CI/CD configuration (Jenkinsfile, Dockerfile, Makefile)
    - Configuration/Data (YAML, JSON, TOML, XML)
    - Infrastructure as Code (Terraform, CloudFormation)
  - Implemented exclusion patterns for 15+ directories (node_modules, dist, build, etc.)
  - Implemented exclusion patterns for 30+ file patterns (generated files, lock files, binaries)
  - Made detect-bugs.txt prompt language-agnostic
  - Test coverage: 20 test cases with 95% success rate (19/20 passed)

### Fixed
- **Issue #140**: ReDoS vulnerability in fillTemplate method (Security Fix)
  - Replaced dynamic RegExp construction with `String.prototype.replaceAll()` to eliminate ReDoS attack risk
  - Fixed improper handling of regex special characters in template variable keys (e.g., `.*`, `+`, `?`)
  - Performance improvement: 99.997% faster for ReDoS patterns, 40-70% faster for normal cases
  - Security classification: OWASP CWE-1333 (Inefficient Regular Expression Complexity) - **Resolved**
  - Requires Node.js 15.0.0+ for `replaceAll()` support
  - Comprehensive test coverage: 28 unit tests + 10 integration tests with ReDoS pattern validation
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
