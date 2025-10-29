import process from 'node:process';

import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PRESET_DESCRIPTIONS,
} from '../core/phase-dependencies.js';

/**
 * 利用可能なプリセット一覧を表示
 */
export function listPresets(): void {
  console.info('Available Presets:\n');

  // 現行プリセットの一覧表示
  for (const [name, phases] of Object.entries(PHASE_PRESETS)) {
    const description = PRESET_DESCRIPTIONS[name] || '';
    const phaseList = phases.join(' → ');
    console.info(`  ${name.padEnd(25)} - ${description}`);
    console.info(`    Phases: ${phaseList}\n`);
  }

  console.info('\nDeprecated Presets (will be removed in 6 months):\n');

  // 非推奨プリセットの一覧表示
  for (const [oldName, newName] of Object.entries(DEPRECATED_PRESETS)) {
    console.info(`  ${oldName.padEnd(25)} → Use '${newName}' instead`);
  }

  console.info('\nUsage:');
  console.info('  npm run start -- execute --issue <number> --preset <preset-name>');
  console.info('  npm run start -- execute --issue <number> --phase <phase-name>');
  console.info('  npm run start -- execute --issue <number> --phase all');

  process.exit(0);
}
