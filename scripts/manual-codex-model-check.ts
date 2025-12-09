import { Command } from 'commander';

import { resolveCodexModel } from '../src/core/codex-agent-client.js';
import { config } from '../src/core/config.js';

const program = new Command();

program
  .description('Inspect Codex model resolution order (CLI option > CODEX_MODEL env > default)')
  .option('--codex-model <model>', 'Codex model override (mimics --codex-model CLI option)')
  .option('--label <name>', 'Scenario label for logging', 'manual-check')
  .parse(process.argv);

const options = program.opts<{ codexModel?: string; label: string }>();

const envCodexModel = config.getCodexModel();
const codexModelInput = options.codexModel ?? envCodexModel;
const resolvedCodexModel = resolveCodexModel(codexModelInput);

const payload = {
  scenario: options.label,
  cliCodexModel: options.codexModel ?? null,
  envCodexModel,
  resolutionSource: options.codexModel ? 'cli' : envCodexModel ? 'env' : 'default',
  resolvedCodexModel,
};

console.log(JSON.stringify(payload, null, 2));
