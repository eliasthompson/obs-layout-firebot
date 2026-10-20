// Restarts Firebot around installing the presets file into the profile and making sure custom scripts and persistent
// custom variables are enabled, since Firebot reads these files only at startup and caches custom scripts. Firebot is
// closed the way its window would be, never forcibly; one that cannot be closed from here, for example running as
// administrator, is left for you to close, and then to start again. Backs up every file it replaces next to it.
// --dry-run reports what it would install and the restart without writing, closing, or starting anything.
//
//   obs-layout-firebot firebot:restart [--config config/scenes.ts] [--presets config/preset-effect-lists.json]
//     [--profile-dir <Firebot profile folder>] [--yes] [--dry-run]
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { PresetEffectList } from '@/lib/createPresetEffectList';
import type { FirebotSettingsFile } from '@/lib/enableScriptSettings';
import type { StoredPreset } from '@/lib/mergeLayoutPresets';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { enableScriptSettings } from '@/lib/enableScriptSettings';
import { mergeLayoutPresets } from '@/lib/mergeLayoutPresets';

import { FIREBOT_PROCESS_NAME, firebotApp } from '../lib/apps';
import {
  backupPath,
  confirm,
  DEFAULT_PRESETS_PATH,
  firebotProfileDir,
  loadOptionalConfig,
  readJson,
  writeJson,
} from '../lib/environment';
import { describeRestart, isRunning, restartApp } from '../lib/processes';

export interface RestartFirebotOptions {
  config: ScenesConfig | undefined;
  presetsPath: string;
  profileDir?: string;
}

/** Write the presets and settings into the profile. Only safe while Firebot is closed, unless it is a dry run. */
const installProfileFiles = (profileDir: string, presetsPath: string, dryRun = false) => {
  const would = dryRun ? 'dry run: would have ' : '';

  // The presets file owns every layout preset; presets made for other things stay in the profile
  if (existsSync(presetsPath)) {
    const target = join(profileDir, 'effects', 'preset-effect-lists.json');
    const profilePresets = existsSync(target) ? (readJson(target) as Record<string, StoredPreset>) : {};
    const merge = mergeLayoutPresets(profilePresets, readJson(presetsPath) as Record<string, PresetEffectList>);
    if (!dryRun) {
      if (existsSync(target)) copyFileSync(target, backupPath(target));
      writeJson(target, merge.presets);
    }
    console.log(
      `${would}installed ${String(merge.added)} layout presets to ${target} (${String(merge.replaced)} previous layout presets replaced, ${String(merge.kept)} other presets kept)`,
    );
  } else {
    console.log(`no presets file at ${presetsPath}; run firebot:deploy to create it`);
  }

  // The settings the script needs
  const settingsPath = join(profileDir, 'settings.json');
  if (existsSync(settingsPath)) {
    const { file, changed } = enableScriptSettings(readJson(settingsPath) as FirebotSettingsFile);
    if (changed.length) {
      if (!dryRun) {
        copyFileSync(settingsPath, backupPath(settingsPath));
        writeJson(settingsPath, file);
      }
      console.log(`${would}enabled ${changed.join(' and ')}`);
    }
  }
};

/** Restart Firebot with the presets and settings installed. Resolves with how the restart went. */
export const restartFirebot = ({ config, presetsPath, profileDir: profileDirFlag }: RestartFirebotOptions) => {
  const profileDir = firebotProfileDir(config, profileDirFlag);
  return restartApp(firebotApp(config), () => {
    installProfileFiles(profileDir, presetsPath);
  });
};

export const firebotRestart = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      presets: { type: 'string', default: DEFAULT_PRESETS_PATH },
      'profile-dir': { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });
  const config = await loadOptionalConfig(values.config);

  if (values['dry-run']) {
    installProfileFiles(firebotProfileDir(config, values['profile-dir']), values.presets, true);
    describeRestart(firebotApp(config));
    return;
  }
  if (isRunning(FIREBOT_PROCESS_NAME) && !(await confirm('Restart Firebot now?', values.yes))) {
    console.log('not restarted');
    return;
  }

  await restartFirebot({ config, presetsPath: values.presets, profileDir: values['profile-dir'] });
};
