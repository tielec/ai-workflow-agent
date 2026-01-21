import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const addConfigMock = jest.fn();
const addMock = jest.fn();
const commitMock = jest.fn();
const statusMock = jest.fn();
const simpleGitMock = jest.fn().mockReturnValue({
  status: statusMock,
  addConfig: addConfigMock,
  add: addMock,
  commit: commitMock,
});

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  statusMock.mockReset();
  addConfigMock.mockReset();
  addMock.mockReset();
  commitMock.mockReset();
});

describe('commitIfNeeded', () => {
  async function importModule() {
    await jest.unstable_mockModule('simple-git', () => ({
      default: simpleGitMock,
    }));
    await jest.unstable_mockModule('../../../../src/core/config.js', () => ({
      config: {
        getGitCommitUserName: jest.fn().mockReturnValue('Tester'),
        getGitCommitUserEmail: jest.fn().mockReturnValue('tester@example.com'),
        getLogLevel: jest.fn().mockReturnValue('info'),
        getLogNoColor: jest.fn().mockReturnValue(true),
      },
    }));

    return import('../../../../src/commands/pr-comment/analyze/git-operations.js');
  }

  it('変更がある場合にコミットを実行する (TC-UNIT-GO-001 & TC-UNIT-GO-004)', async () => {
    statusMock.mockResolvedValue({ files: [{ path: 'file.txt' }] });
    const { commitIfNeeded } = await importModule();

    await commitIfNeeded('/repo', '[ai-workflow] Test commit');

    expect(statusMock).toHaveBeenCalled();
    expect(addMock).toHaveBeenCalledWith(['file.txt']);
    expect(commitMock).toHaveBeenCalledWith('[ai-workflow] Test commit');
  });

  it('変更がない場合は何もしない (TC-UNIT-GO-002)', async () => {
    statusMock.mockResolvedValue({ files: [] });
    const { commitIfNeeded } = await importModule();

    await commitIfNeeded('/repo', 'noop');

    expect(addMock).not.toHaveBeenCalled();
    expect(commitMock).not.toHaveBeenCalled();
    expect(addConfigMock).not.toHaveBeenCalled();
  });

  it('Gitユーザー設定は初回のみ実行する (TC-UNIT-GO-003)', async () => {
    statusMock.mockResolvedValueOnce({ files: [{ path: 'a.ts' }] });
    statusMock.mockResolvedValueOnce({ files: [{ path: 'b.ts' }] });
    const { commitIfNeeded } = await importModule();

    await commitIfNeeded('/repo', 'first');
    await commitIfNeeded('/repo', 'second');

    // user.name と user.email の2回のみ
    expect(addConfigMock).toHaveBeenCalledTimes(2);
    expect(commitMock).toHaveBeenCalledTimes(2);
  });
});
