import { runCli } from './main.js';

runCli().catch((error) => {
  console.error('[ERROR] Unhandled exception in AI Workflow v2 CLI');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
