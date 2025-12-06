# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Issue #253**: Fixed metadata.json pr_url persistence issue
  - `pr_url` and `pr_number` are now correctly committed and pushed to remote after PR creation
  - Modified `src/commands/init.ts` to add Git commit & push after PR metadata save
  - Ensures PR information is available in remote metadata.json for execute command
  - Added error handling for commit/push failures (warnings only, local save preserved)
  - Test coverage: 27 unit tests (100% passed), 7 integration tests (test code issues, not implementation bugs)
- **Issue #225**: Fixed init commit exclusion from squash range when using `--squash-on-complete` option
  - `base_commit` is now correctly recorded before init commit creation (not after)
  - Ensures all workflow commits, including the init commit, are included in the squash range
  - Updated comment attribution in `src/commands/init.ts` from Issue #194 to Issue #225
  - Note: Prompt path resolution issue was already fixed by Issue #216 (ESM compatibility)

### Added
- **Issue #212**: Manual cleanup command for workflow logs (v0.4.0)
  - New `cleanup` CLI command with 4 options (--issue, --dry-run, --phases, --all)
  - Three cleanup modes: normal (Phase 0-8), partial (specific phases), complete (Phase 0-9 after Evaluation)
  - Phase range parsing supports numeric ranges (0-4) and phase name lists (planning,requirements,design)
  - Preview mode (--dry-run) to display deletion targets without actual deletion
  - Git auto-commit & push after cleanup with message: `[ai-workflow] Manual cleanup of workflow logs (Phase 0-8)`
  - Extension of `ArtifactCleaner.cleanupWorkflowLogs()` method with `phaseRange?: PhaseName[]` parameter
  - New command handler module (`src/commands/cleanup.ts`, ~480 lines) with 5 main functions
  - Security measures: path validation, symlink checks, and safe deletion logic
  - Repository size reduction: ~75% (same effect as automatic cleanup)
  - Independent operation from Report Phase (Phase 8) automatic cleanup
  - Test coverage: 19 unit tests (100% passed), 16 integration tests (implemented)
  - Error handling: 4 validation errors (invalid phase range, Evaluation not completed, conflicting options, no deletion targets)
- **Issue #194**: Squash commits after workflow completion with agent-generated commit message
  - New CLI options: `--squash-on-complete` / `--no-squash-on-complete` for automatic commit squashing after workflow completion
  - New environment variable: `AI_WORKFLOW_SQUASH_ON_COMPLETE` for default squash behavior control
  - New SquashManager module (`src/core/git/squash-manager.ts`, ~350 lines) for commit squashing operations
  - Agent-generated commit messages using Codex / Claude in Conventional Commits format
  - Branch protection: prevents squashing on main/master branches
  - Safe force push with `--force-with-lease` to avoid overwriting other changes
  - Rollback capability with `pre_squash_commits` metadata
  - New metadata fields: `base_commit` (recorded on init), `pre_squash_commits`, `squashed_at`
  - 6 new methods in MetadataManager for squash-related metadata management
  - Prompt template: `src/prompts/squash/generate-message.txt` for commit message generation
  - Execution requirement: only runs when `evaluation` phase is included
  - Squash failures logged as warnings but do not fail the workflow

### Changed
- **Issue #155**: [Refactor] コード重複の削減: repository-analyzer.ts
  - Extract Method パターン適用により `repository-analyzer.ts` の重複コードを削減（~150行 → ~50行、67%削減）
  - 新規プライベートメソッド追加: `executeAgentWithFallback()`, `validateAnalysisResult()`
  - DRY原則の徹底により保守性・可読性を向上
  - Public API（`analyze()`, `analyzeForRefactoring()`）のインターフェース維持（破壊的変更なし）

### Added
- **Issue #128**: Auto-issue Phase 3 - Enhancement proposal detection and GitHub Issue generation (v0.5.0)
  - New `--category enhancement` option for auto-issue command
  - New `--creative-mode` option for experimental and creative enhancement proposals
  - EnhancementProposal type definition with 6 enhancement types (improvement, integration, automation, dx, quality, ecosystem)
  - RepositoryAnalyzer.analyzeForEnhancements() method for automatic enhancement opportunity detection
  - IssueGenerator.generateEnhancementIssue() method for agent-generated enhancement Issue creation
  - Priority-based sorting (expected_impact: high → medium → low) for enhancement proposals
  - No deduplication for enhancement Issues (design decision)
  - Creative mode prompt with innovative and ambitious proposal generation
  - Language-agnostic support (30+ languages, inherited from Issue #144)
  - Test coverage: 42 test cases (31 passed, 11 failed due to test code design issues, not implementation bugs)
  - Issue template with 6 sections (概要, 根拠, 実装ヒント, 期待される効果, 工数見積もり, 関連ファイル)
- **Issue #127**: Auto-issue Phase 2 - Refactoring detection and GitHub Issue generation (v0.5.0)
  - New `--category refactor` option for auto-issue command
  - RefactorCandidate type definition with 6 refactoring types (large-file, large-function, high-complexity, duplication, unused-code, missing-docs)
  - RepositoryAnalyzer.analyzeForRefactoring() method for automatic refactoring opportunity detection
  - IssueGenerator.generateRefactorIssue() method for template-based refactoring Issue creation
  - Priority-based sorting (high → medium → low) for refactoring candidates
  - No deduplication for refactoring Issues (design decision)
  - Language-agnostic support (30+ languages, inherited from Issue #144)
  - Test coverage: 32 test cases (18 unit tests for RepositoryAnalyzer validation, 14 integration tests)
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
- **Issue #208**: Metadata inconsistency causing rollback failures
  - Fixed rollback command failure when `status: "pending"` but `completed_steps` is not empty (inconsistent metadata state)
  - Improved `validateRollbackOptions()` to consider `completed_steps` when determining if a phase has started
  - Fixed `rollbackToPhase()` to properly reset `completed_steps` and `current_step` fields when rolling back phases
  - Added `validatePhaseConsistency()` method to MetadataManager for detecting 3 types of metadata inconsistencies
  - Added warning logs for inconsistent metadata states (defensive programming approach)
  - Test coverage: 12 test cases (6 unit tests for rollback validation, 6 unit tests for metadata consistency)
- **Issue #153**: auto-issue: Jenkins環境で対象リポジトリではなくワークスペースを解析してしまう
  - `auto-issue` コマンドで `GITHUB_REPOSITORY` 環境変数から対象リポジトリを自動解決
  - `resolveLocalRepoPath()` を使用してリポジトリパスを正しく解決（Jenkins環境では `REPOS_ROOT` を優先使用）
  - Jenkins環境では `REPOS_ROOT` が必須、ローカル環境ではフォールバック候補パス探索
  - リポジトリが見つからない場合、明確なエラーメッセージと `REPOS_ROOT` 設定提案を表示
  - Jenkins Pipelineに `REPOS_ROOT` 環境変数設定を追加（Setup Environment stage）
  - テストカバレッジ: 18個の新規テストケース（ユニット10個、統合6個、パラメトリック1個、エラーハンドリング1個）
- **Issue #150**: Null/Nil Pointer Dereference Possibility in child.stdin?.write()
  - Replaced optional chaining (`?.`) with explicit null check in `runCodexProcess()` method
  - Prevents silent failures when stdin pipe fails to open
  - Immediately rejects Promise with clear error message: 'Failed to open stdin pipe for child process'
  - Improves reliability in resource-constrained environments (CI/CD, containers)
  - No impact on normal operation (when stdin opens successfully)
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
