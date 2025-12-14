/**
 * unit tests: ensure the groovy archiveArtifacts flow is present and consumed by Jenkins pipelines
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'node:path';

const COMMON_ARCHIVE_PATH = path.join(process.cwd(), 'jenkins', 'shared', 'common.groovy');
const PIPELINE_FILES = [
  path.join('jenkins', 'jobs', 'pipeline', 'ai-workflow', 'all-phases', 'Jenkinsfile'),
  path.join('jenkins', 'jobs', 'pipeline', 'ai-workflow', 'preset', 'Jenkinsfile'),
  path.join('jenkins', 'jobs', 'pipeline', 'ai-workflow', 'single-phase', 'Jenkinsfile'),
];

describe('archiveArtifacts Groovy flow', () => {
  let groovyScript: string;

  beforeAll(() => {
    groovyScript = fs.readFileSync(COMMON_ARCHIVE_PATH, 'utf-8');
  });

  test('Given the revised script, it sanitizes issue numbers and surfaces warnings when needed', () => {
    // Given the current implementation of archiveArtifacts
    // When we inspect the Groovy source
    // Then the sanitized identifier logic and warning messages are present
    expect(groovyScript).toMatch(/def safeIssueNumber = issueNumber\.replaceAll\('\[\^A-Za-z0-9_-]', ''\)/);
    expect(groovyScript).toMatch(/echo "\[WARN\] Issue number contains unsafe characters\. Sanitized to '\$\{safeIssueNumber\}'\."/);
  });

  test('Given a valid issue directory, it copies artifacts from REPOS_ROOT into the workspace first', () => {
    // Given the `sourcePath` and `destPath` variables inside the script
    // When we examine the copy block
    // Then the mkdir/cp commands plus informational logs are in place
    expect(groovyScript).toMatch(/echo "Copying artifacts from REPOS_ROOT to WORKSPACE\.\.\."/);
    expect(groovyScript).toMatch(/mkdir -p '\$\{destPath\}'/);
    expect(groovyScript).toMatch(/cp -r '\$\{sourcePath\}\/\.' '\$\{destPath\}\/' \|\| true/);
  });

  test('Given the workspace staging area, it archives only workspace-relative paths and cleans up afterwards', () => {
    // Given the workspace relative artifactPath
    // When we review the archiving section
    // Then archiveArtifacts step and cleanup command target the expected paths
    expect(groovyScript).toMatch(/def artifactPath = "artifacts\/\.ai-workflow\/issue-\$\{safeIssueNumber\}\/\*\*\/\*"/);
    expect(groovyScript).toMatch(/archiveArtifacts artifacts: artifactPath, allowEmptyArchive: true/);
    expect(groovyScript).toMatch(/rm -rf '\$\{env\.WORKSPACE\}\/artifacts' \|\| true/);
    expect(groovyScript).toMatch(/echo "Temporary artifact copy cleaned up"/);
  });
});

describe('pipeline Jenkinsfiles consume common.archiveArtifacts', () => {
  test.each(PIPELINE_FILES)('Given %s, it invokes the shared archiveArtifacts helper', (filePath) => {
    const fullPath = path.join(process.cwd(), filePath);
    const contents = fs.readFileSync(fullPath, 'utf-8');
    // Given the pipeline definition
    // When we inspect the post.always block
    // Then the shared helper is called to archive artifacts
    expect(contents).toMatch(/common\.archiveArtifacts\(env\.ISSUE_NUMBER\)/);
  });
});
