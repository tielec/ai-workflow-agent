import process from 'node:process';
import { PHASE_PRESETS, DEPRECATED_PRESETS, PRESET_DESCRIPTIONS } from '../core/phase-dependencies.js';
import { PhaseName } from '../types.js';

/**
 * プリセット名を解決（後方互換性対応）
 */
export function resolvePresetName(presetName: string): {
  resolvedName: string;
  warning?: string;
} {
  // 現行プリセット名の場合
  if (PHASE_PRESETS[presetName]) {
    return { resolvedName: presetName };
  }

  // 非推奨プリセット名の場合
  if (DEPRECATED_PRESETS[presetName]) {
    const newName = DEPRECATED_PRESETS[presetName];

    // full-workflowの特殊ケース
    if (presetName === 'full-workflow') {
      return {
        resolvedName: '',
        warning: `[WARNING] Preset "${presetName}" is deprecated. Please use "--phase all" instead.`,
      };
    }

    // 通常の非推奨プリセット
    return {
      resolvedName: newName,
      warning: `[WARNING] Preset "${presetName}" is deprecated. Please use "${newName}" instead. This alias will be removed in 6 months.`,
    };
  }

  // 存在しないプリセット名
  throw new Error(`[ERROR] Unknown preset: ${presetName}. Use 'list-presets' command to see available presets.`);
}

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

export function getPresetPhases(presetName: string): PhaseName[] {
  const phases = PHASE_PRESETS[presetName];
  if (!phases) {
    throw new Error(
      `Invalid preset: '${presetName}'. Available presets: ${Object.keys(PHASE_PRESETS).join(', ')}`,
    );
  }
  return phases as PhaseName[];
}
