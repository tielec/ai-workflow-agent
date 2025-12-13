import { jest } from '@jest/globals';

const actual = jest.requireActual('../../src/commands/auto-issue-output.js');

export const buildAutoIssueJsonPayload = jest.fn(actual.buildAutoIssueJsonPayload);
export const writeAutoIssueOutputFile = jest.fn(actual.writeAutoIssueOutputFile);

export default {
  buildAutoIssueJsonPayload,
  writeAutoIssueOutputFile,
};
