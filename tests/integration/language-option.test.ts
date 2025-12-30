import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command } from 'commander';
import { runCli } from '../../src/main.js';

function captureProgram(): {
  getProgram: () => Command | undefined;
  restore: () => void;
} {
  let program: Command | undefined;
  const originalArgv = [...process.argv];
  const parseSpy = jest
    .spyOn(Command.prototype, 'parseAsync')
    .mockImplementation(async function parse(this: Command) {
      program = this;
      return this;
    });

  return {
    getProgram: () => program,
    restore: () => {
      process.argv = originalArgv;
      parseSpy.mockRestore();
      jest.resetModules();
    },
  };
}

function getCommand(program: Command | undefined, name: string): Command {
  const cmd = program?.commands.find((command) => command.name() === name);
  expect(cmd).toBeDefined();
  return cmd!;
}

function expectLanguageOption(command: Command) {
  const languageOption = command.options.find((opt) => opt.long === '--language');
  expect(languageOption).toBeDefined();
  expect(languageOption?.argChoices).toEqual(['ja', 'en']);
  expect(languageOption?.flags).toContain('<lang>');
}

describe('Issue #526: 全コマンドに --language オプションが追加されている', () => {
  let teardown: () => void;
  let getProgram: () => Command | undefined;

  beforeEach(() => {
    ({ restore: teardown, getProgram } = captureProgram());
  });

  afterEach(() => {
    teardown();
  });

  test('トップレベルの各コマンドで --language が選択可能', async () => {
    process.argv = ['node', 'cli', '--help'];
    await runCli();

    const program = getProgram();

    const commands = [
      'init',
      'execute',
      'review',
      'rollback',
      'rollback-auto',
      'auto-issue',
      'cleanup',
      'finalize',
      'migrate',
    ];

    commands.forEach((name) => {
      const command = getCommand(program, name);
      expectLanguageOption(command);
    });
  });

  test('pr-comment サブコマンドでも --language が選択可能', async () => {
    process.argv = ['node', 'cli', 'pr-comment', '--help'];
    await runCli();

    const program = getProgram();

    const prComment = getCommand(program, 'pr-comment');
    const subCommands = ['init', 'analyze', 'execute', 'finalize'];

    subCommands.forEach((name) => {
      const sub = getCommand(prComment, name);
      expectLanguageOption(sub);
    });
  });
});
