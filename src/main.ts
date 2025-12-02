import process from 'node:process';
import { Command, Option } from 'commander';

import { PHASE_PRESETS } from './core/phase-dependencies.js';
import { handleInitCommand } from './commands/init.js';
import { handleExecuteCommand } from './commands/execute.js';
import { handleReviewCommand } from './commands/review.js';
import { listPresets } from './commands/list-presets.js';
import { handleMigrateCommand } from './commands/migrate.js';
import { handleRollbackCommand } from './commands/rollback.js';
import { handleAutoIssueCommand } from './commands/auto-issue.js';

/**
 * CLIエントリーポイント
 */
export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name('ai-workflow-v2')
    .description('TypeScript rewrite of the AI workflow automation toolkit')
    .version('0.1.0');

  // init コマンド
  program
    .command('init')
    .requiredOption('--issue-url <url>', 'GitHub Issue URL')
    .option('--branch <name>', 'Custom branch name (default: ai-workflow/issue-{issue_number})')
    .action(async (options) => {
      try {
        await handleInitCommand(options.issueUrl, options.branch);
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
    .action(async (options) => {
      try {
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
    .action(async (options) => {
      try {
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
    .action(async (options) => {
      try {
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
    .action(async (options) => {
      try {
        await handleRollbackCommand(options);
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
    .option('--dry-run', 'Preview mode (do not create issues)', false)
    .option('--similarity-threshold <number>', 'Duplicate detection threshold (0.0-1.0)', '0.8')
    .addOption(
      new Option('--agent <mode>', 'Agent mode')
        .choices(['auto', 'codex', 'claude'])
        .default('auto'),
    )
    .option(
      '--creative-mode',
      'Enable creative mode for enhancement proposals (experimental ideas)',
      false,
    )
    .action(async (options) => {
      try {
        await handleAutoIssueCommand(options);
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
