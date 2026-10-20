// Restarts Firebot around installing the presets file into the profile and making sure custom scripts and persistent
// custom variables are enabled, since Firebot reads these files only at startup and caches custom scripts. Firebot is
// closed the way its window would be, never forcibly; one that cannot be closed from here, for example running as
// administrator, is left for you to close, and then to start again. Backs up every file it replaces next to it.
//
//   obs-layout-firebot firebot:restart [--config config/scenes.ts] [--presets config/preset-effect-lists.json]
//     [--profile-dir <Firebot profile folder>] [--yes]
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
import { isRunning, restartApp } from '../lib/processes';

export interface RestartFirebotOptions {
  config: ScenesConfig | undefined;
  presetsPath: string;
  profileDir?: string;
}

/** Write the presets and settings into the profile. Only safe while Firebot is closed. */
const installProfileFiles = (profileDir: string, presetsPath: string) => {
  // The presets file owns every layout preset; presets made for other things stay in the profile
  if (existsSync(presetsPath)) {
    const target = join(profileDir, 'effects', 'preset-effect-lists.json');
    const profilePresets = existsSync(target) ? (readJson(target) as Record<string, StoredPreset>) : {};
    if (existsSync(target)) copyFileSync(target, backupPath(target));
    const merge = mergeLayoutPresets(profilePresets, readJson(presetsPath) as Record<string, PresetEffectList>);
    writeJson(target, merge.presets);
    console.log(
      `installed ${String(merge.added)} layout presets to ${target} (${String(merge.replaced)} previous layout presets replaced, ${String(merge.kept)} other presets kept)`,
    );
  } else {
    console.log(`no presets file at ${presetsPath}; run firebot:deploy to create it`);
  }

  // The settings the script needs
  const settingsPath = join(profileDir, 'settings.json');
  if (existsSync(settingsPath)) {
    const { file, changed } = enableScriptSettings(readJson(settingsPath) as FirebotSettingsFile);
    if (changed.length) {
      copyFileSync(settingsPath, backupPath(settingsPath));
      writeJson(settingsPath, file);
      console.log(`enabled ${changed.join(' and ')}`);
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
      presets: { type: 'string', default: DEFAULT_PRESETS_PATH },
      'profile-dir': { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });

  if (isRunning(FIREBOT_PROCESS_NAME) && !(await confirm('Restart Firebot now?', values.yes))) {
    console.log('not restarted');
    return;
  }

  await restartFirebot({
    config: await loadOptionalConfig(values.config),
    presetsPath: values.presets,
    profileDir: values['profile-dir'],
  });
};
