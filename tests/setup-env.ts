import { execSync } from 'node:child_process';

// Ensure git identity is available during integration tests that perform commits.
process.env.GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME ?? 'AI Workflow Bot';
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL ?? 'ai-workflow@example.com';
process.env.GIT_COMMITTER_NAME = process.env.GIT_COMMITTER_NAME ?? process.env.GIT_AUTHOR_NAME;
process.env.GIT_COMMITTER_EMAIL =
  process.env.GIT_COMMITTER_EMAIL ?? process.env.GIT_AUTHOR_EMAIL;
process.env.GIT_COMMIT_USER_NAME =
  process.env.GIT_COMMIT_USER_NAME ?? process.env.GIT_AUTHOR_NAME;
process.env.GIT_COMMIT_USER_EMAIL =
  process.env.GIT_COMMIT_USER_EMAIL ?? process.env.GIT_AUTHOR_EMAIL;
// Default language baseline for tests (individual suites may override as needed)
process.env.AI_WORKFLOW_LANGUAGE = 'ja';

if (!process.env.AI_WORKFLOW_GIT_CONFIGURED) {
  try {
    execSync(`git config --global user.name "${process.env.GIT_AUTHOR_NAME}"`);
    execSync(`git config --global user.email "${process.env.GIT_AUTHOR_EMAIL}"`);
    process.env.AI_WORKFLOW_GIT_CONFIGURED = '1';
  } catch {
    // Ignore configuration failures in environments without git; tests that rely on git will surface errors.
  }
}

export {};
