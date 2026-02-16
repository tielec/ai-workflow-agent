import process from 'node:process';
import { Command, Option } from 'commander';

import { PHASE_PRESETS } from './core/phase-dependencies.js';
import { handleInitCommand } from './commands/init.js';
import { handleExecuteCommand } from './commands/execute.js';
import { handleReviewCommand } from './commands/review.js';
import { listPresets } from './commands/list-presets.js';
import { handleMigrateCommand } from './commands/migrate.js';
import { handleRollbackCommand, handleRollbackAutoCommand } from './commands/rollback.js';
import { handleAutoIssueCommand } from './commands/auto-issue.js';
import { handleAutoCloseIssueCommand } from './commands/auto-close-issue.js';
import { handleCleanupCommand } from './commands/cleanup.js';
import { handleFinalizeCommand } from './commands/finalize.js';
import { handlePRCommentInitCommand } from './commands/pr-comment/init.js';
import { handlePRCommentAnalyzeCommand } from './commands/pr-comment/analyze.js';
import { handlePRCommentExecuteCommand } from './commands/pr-comment/execute.js';
import { handlePRCommentFinalizeCommand } from './commands/pr-comment/finalize.js';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './types.js';
import { handleValidateCredentialsCommand } from './commands/validate-credentials.js';
import { handleRewriteIssueCommand } from './commands/rewrite-issue.js';

/**
 * CLIエントリーポイント
 */
export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name('ai-workflow-v2')
    .description('TypeScript rewrite of the AI workflow automation toolkit')
    .version('0.1.0');

  const createLanguageOption = () =>
    new Option('--language <lang>', `Workflow language (${SUPPORTED_LANGUAGES.join('|')})`).choices(
      [...SUPPORTED_LANGUAGES],
    );

  const applyLanguageOption = (value: unknown) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized) {
        process.env.AI_WORKFLOW_LANGUAGE = normalized;
      }
    }
  };

  // init コマンド
  program
    .command('init')
    .requiredOption('--issue-url <url>', 'GitHub Issue URL')
    .option('--branch <name>', 'Custom branch name (default: ai-workflow/issue-{issue_number})')
    .option('--base-branch <branch>', 'Base branch to branch from (default: current branch)')
    .option('--auto-model-selection', 'Analyze issue difficulty and select models automatically')
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleInitCommand(
          options.issueUrl,
          options.branch,
          options.autoModelSelection,
          options.baseBranch,
          options.language as SupportedLanguage | undefined,
        );
      } catch (error) {
        reportFatalError(error);
      }
    });

  // list-presets コマンド
  program
    .command('list-presets')
    .description('List available presets')
    .action(async () => {
      try {
        listPresets();
      } catch (error) {
        reportFatalError(error);
      }
    });

  // execute コマンド
  program
    .command('execute')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--phase <name>', 'Phase name or "all"', 'all')
    .addOption(
      new Option('--preset <preset>', 'Execute preset workflow').choices(
        Object.keys(PHASE_PRESETS),
      ),
    )
    .option(
      '--skip-phases <phases>',
      'Comma-separated phase names to skip (e.g., test_scenario,testing). Cannot use with --preset.',
    )
    .option('--git-user <name>', 'Git commit user name')
    .option('--git-email <email>', 'Git commit user email')
    .option('--force-reset', 'Clear metadata and restart from Phase 1', false)
    .option('--skip-dependency-check', 'Skip all dependency checks', false)
    .option(
      '--ignore-dependencies',
      'Warn about dependency violations but continue',
      false,
    )
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .addOption(createLanguageOption())
    .option(
      '--claude-model <model>',
      'Claude model (opus|sonnet|haiku or full model ID, default: opus)',
    )
    .option(
      '--codex-model <model>',
      'Codex model (max|mini|5.1|legacy or full model ID, default: max)',
    )
    .option('--requirements-doc <path>', 'External requirements document path')
    .option('--design-doc <path>', 'External design document path')
    .option('--test-scenario-doc <path>', 'External test scenario document path')
    .option(
      '--followup-llm-mode <mode>',
      'Follow-up issue LLM mode (off|auto|openai|claude|agent)',
    )
    .option(
      '--followup-llm-model <name>',
      'Override model name when using follow-up LLM integration',
    )
    .option(
      '--followup-llm-timeout <ms>',
      'Timeout in milliseconds for follow-up LLM requests',
    )
    .option(
      '--followup-llm-max-retries <count>',
      'Maximum retry attempts for follow-up LLM requests',
    )
    .option(
      '--followup-llm-append-metadata',
      'Append LLM generation metadata section to the follow-up issue body',
    )
    .option(
      '--cleanup-on-complete',
      'Delete .ai-workflow directory after evaluation phase completes',
      false,
    )
    .option(
      '--cleanup-on-complete-force',
      'Skip confirmation prompt before cleanup (for CI environments)',
      false,
    )
    .option(
      '--squash-on-complete',
      'Squash all commits into one after workflow completion (Issue #194)',
      false,
    )
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleExecuteCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // review コマンド
  program
    .command('review')
    .requiredOption('--phase <name>', 'Phase name')
    .requiredOption('--issue <number>', 'Issue number')
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleReviewCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // migrate コマンド (Issue #58)
  program
    .command('migrate')
    .description('Migrate workflow metadata')
    .option('--sanitize-tokens', 'Sanitize Personal Access Tokens in metadata.json')
    .option('--dry-run', 'Dry run mode (do not modify files)')
    .option('--issue <number>', 'Target specific issue number')
    .option('--repo <path>', 'Target repository path')
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleMigrateCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // rollback コマンド (Issue #90)
  program
    .command('rollback')
    .description('Roll back a phase to a previous step')
    .requiredOption('--issue <number>', 'Issue number')
    .requiredOption('--to-phase <phase>', 'Target phase to roll back to')
    .option('--reason <text>', 'Rollback reason (text)')
    .option('--reason-file <path>', 'Rollback reason (file path)')
    .option('--to-step <step>', 'Target step (execute|review|revise)', 'revise')
    .option('--from-phase <phase>', 'Source phase (auto-detected if not specified)')
    .option('--force', 'Skip confirmation prompt', false)
    .option('--dry-run', 'Preview changes without updating metadata', false)
    .option('--interactive', 'Interactive mode for entering rollback reason', false)
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleRollbackCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // rollback auto コマンド (Issue #271)
  program
    .command('rollback-auto')
    .description('Automatically detect if rollback is needed using AI agents')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--dry-run', 'Preview mode (do not execute rollback)', false)
    .option('--force', 'Skip confirmation for high-confidence decisions', false)
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleRollbackAutoCommand({
          issueNumber: Number.parseInt(options.issue, 10),
          dryRun: options.dryRun,
          force: options.force,
          agent: options.agent,
        });
      } catch (error) {
        reportFatalError(error);
      }
    });

  // auto-close-issue コマンド (Issue #645)
  program
    .command('auto-close-issue')
    .description('Inspect existing GitHub Issues and close them automatically')
    .option('--category <type>', 'Target category (followup|stale|old|all)', 'followup')
    .option('--limit <number>', 'Maximum number of issues to process', '10')
    .option('--dry-run', 'Preview mode (do not close issues)')
    .option('--no-dry-run', 'Execute mode (actually close issues)')
    .option(
      '--confidence-threshold <number>',
      'Confidence threshold for closing (0.0-1.0)',
      '0.7',
    )
    .option(
      '--days-threshold <number>',
      'Days threshold for stale/old filtering (stale: N days, old: 2N days)',
      '90',
    )
    .option('--require-approval', 'Ask for confirmation before closing', false)
    .option(
      '--exclude-labels <labels>',
      'Comma separated labels to exclude from processing',
      'do-not-close,pinned',
    )
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleAutoCloseIssueCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // auto-issue コマンド (Issue #126)
  program
    .command('auto-issue')
    .description('Detect bugs using AI agents and create GitHub Issues')
    .option('--category <type>', 'Detection category (bug|refactor|enhancement|all)', 'bug')
    .option('--limit <number>', 'Maximum number of issues to create', '5')
    .option('--output-file <path>', 'Write execution summary JSON to the specified path')
    .option('--dry-run', 'Preview mode (do not create issues)', false)
    .option('--similarity-threshold <number>', 'Duplicate detection threshold (0.0-1.0)', '0.8')
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .addOption(createLanguageOption())
    .option(
      '--creative-mode',
      'Enable creative mode for enhancement proposals (experimental ideas)',
      false,
    )
    .option(
      '--custom-instruction <text>',
      'Custom instruction for analysis guidance (max 500 chars, analysis-only)',
    )
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleAutoIssueCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // rewrite-issue コマンド
  program
    .command('rewrite-issue')
    .description('Rewrite existing GitHub Issue with repository context')
    .requiredOption('--issue <number>', 'Issue number to rewrite')
    .addOption(
      new Option('--language <lang>', 'Output language')
        .choices(['ja', 'en'])
        .default('ja'),
    )
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .option('--apply', 'Apply changes to GitHub Issue', false)
    .option('--dry-run', 'Preview mode (default)', false)
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleRewriteIssueCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // validate-credentials コマンド (Issue #598)
  program
    .command('validate-credentials')
    .description('Validate configured credentials for AI workflow')
    .option(
      '--check <category>',
      'Category to check (all|git|github|codex|claude|openai|anthropic)',
      'all',
    )
    .option('--verbose', 'Show detailed diagnostic information', false)
    .option('--output <format>', 'Output format (text|json)', 'text')
    .option('--exit-on-error', 'Return exit code 1 if validation fails', false)
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleValidateCredentialsCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // cleanup コマンド (Issue #212)
  program
    .command('cleanup')
    .description('Clean up workflow execution logs manually')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--dry-run', 'Preview mode (do not delete files)', false)
    .option('--phases <range>', 'Phase range to clean up (e.g., "0-4" or "planning,requirements")')
    .option('--all', 'Delete all workflow artifacts (requires Evaluation Phase completion)', false)
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleCleanupCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // finalize コマンド (Issue #261)
  program
    .command('finalize')
    .description('Finalize workflow completion (cleanup, squash, PR update, draft conversion)')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--dry-run', 'Preview mode (do not execute)', false)
    .option('--skip-squash', 'Skip commit squash step', false)
    .option('--skip-pr-update', 'Skip PR update and draft conversion steps', false)
    .option('--base-branch <branch>', 'PR base branch (default: main)', 'main')
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handleFinalizeCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  // pr-comment コマンド
  const prComment = program.command('pr-comment').description('Handle PR review comments automatically');

  prComment
    .command('init')
    .option('--pr <number>', 'Pull Request number')
    .option('--pr-url <url>', 'Pull Request URL (e.g., https://github.com/owner/repo/pull/123)')
    .option('--issue <number>', 'Issue number to resolve PR from')
    .option('--comment-ids <ids>', 'Comma separated comment ids to include')
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handlePRCommentInitCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  prComment
    .command('analyze')
    .option('--pr <number>', 'Pull Request number')
    .option('--pr-url <url>', 'Pull Request URL (e.g., https://github.com/owner/repo/pull/123)')
    .option('--comment-ids <ids>', 'Comma separated comment ids to include')
    .option('--dry-run', 'Preview mode (do not save artifacts)', false)
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handlePRCommentAnalyzeCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  prComment
    .command('execute')
    .option('--pr <number>', 'Pull Request number')
    .option('--pr-url <url>', 'Pull Request URL (e.g., https://github.com/owner/repo/pull/123)')
    .option('--comment-ids <ids>', 'Comma separated comment ids to include')
    .option('--dry-run', 'Preview mode (do not apply changes or update metadata)', false)
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .option('--batch-size <number>', 'Batch size for processing comments', '3')
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handlePRCommentExecuteCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  prComment
    .command('finalize')
    .option('--pr <number>', 'Pull Request number')
    .option('--pr-url <url>', 'Pull Request URL (e.g., https://github.com/owner/repo/pull/123)')
    .option('--skip-cleanup', 'Skip metadata cleanup', false)
    .option('--dry-run', 'Preview mode (do not resolve threads)', false)
    .option('--squash', 'Squash commits into a single commit', false)
    .addOption(createLanguageOption())
    .action(async (options) => {
      try {
        applyLanguageOption(options.language);
        await handlePRCommentFinalizeCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  await program.parseAsync(process.argv);
}

/**
 * 致命的エラーを報告
 * @param error - エラーオブジェクト
 */
function reportFatalError(error: unknown): never {
  if (error instanceof Error) {
    console.error(`[ERROR] ${error.message}`);
  } else {
    console.error('[ERROR] An unexpected error occurred.');
  }
  process.exit(1);
}
