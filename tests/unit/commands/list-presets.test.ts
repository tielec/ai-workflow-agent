import { describe, test, expect, jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import { listPresets } from '../../../src/commands/list-presets.js';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
} from '../../../src/core/phase-dependencies.js';
import { logger } from '../../../src/utils/logger.js';

describe('listPresets', () => {
  const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  beforeEach(() => {
    infoSpy.mockClear();
    exitSpy.mockClear();
  });

  afterEach(() => {
    infoSpy.mockClear();
    exitSpy.mockClear();
  });

  afterAll(() => {
    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test('プリセット一覧と非推奨プリセットを出力し、終了コード0で終了する', () => {
    listPresets();

    expect(exitSpy).toHaveBeenCalledWith(0);

    for (const [name, phases] of Object.entries(PHASE_PRESETS)) {
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(name));
      for (const phase of phases) {
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(phase));
      }
    }

    for (const [oldName, newName] of Object.entries(DEPRECATED_PRESETS)) {
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(oldName));
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(newName));
    }

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('npm run start -- execute --issue <number> --preset <preset-name>'),
    );
  });
});
