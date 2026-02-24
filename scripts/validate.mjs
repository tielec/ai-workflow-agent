import { spawnSync } from 'node:child_process';

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const skipTest = process.env.SKIP_VALIDATE_TEST === '1';

run('npm', ['run', 'lint']);

if (skipTest) {
  console.info('[validate] SKIP_VALIDATE_TEST=1 detected; skipping npm test.');
} else {
  run('npm', ['test']);
}

run('npm', ['run', 'build']);
