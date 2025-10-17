import { CodexAgentClient } from '../src/core/codex-agent-client.js';

async function main() {
  const client = new CodexAgentClient({
    workingDir: process.cwd(),
    model: process.env.CODEX_MODEL ?? undefined,
  });

  const messages = await client.executeTask({
    prompt: [
      'You are a helpful TypeScript assistant.',
      '',
      'Write a short TypeScript function named `greet` that returns "Hello, Codex!".',
    ].join('\n'),
    systemPrompt: process.env.CODEX_SYSTEM_PROMPT ?? undefined,
    maxTurns: 8,
    verbose: true,
  });

  console.log('\n--- Raw Codex events ---');
  messages.forEach((line, index) => {
    console.log(`[${index}] ${line}`);
  });
}

main().catch((error) => {
  console.error('[ERROR] Failed to run Codex sample.');
  console.error(error);
  process.exit(1);
});
