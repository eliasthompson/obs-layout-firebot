// Restarts Firebot around installing the config's presets into the profile and making sure custom scripts and
// persistent custom variables are enabled, since Firebot reads these files only at startup and caches custom scripts.
// The presets derive from the config, so without one the profile's presets are left as they are. Firebot is closed the
// way its window would be, never forcibly; one that cannot be closed from here, for example running as administrator,
// is left for you to close, and then to start again. Backs up every file it replaces next to it. --dry-run reports
// what it would install and the restart without writing, closing, or starting anything.
//
//   obs-layout-firebot firebot:restart [--config config/scenes.ts] [--profile-dir <Firebot profile folder>] [--yes]
//     [--dry-run]
import { copyFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { FirebotSettingsFile } from '@/lib/enableScriptSettings';
import type { StoredPreset } from '@/lib/mergeLayoutPresets';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { createPresetEffectLists } from '@/lib/createPresetEffectList';
import { enableScriptSettings } from '@/lib/enableScriptSettings';
import { mergeLayoutPresets } from '@/lib/mergeLayoutPresets';

import { FIREBOT_PROCESS_NAME, firebotApp } from '../lib/apps';
import {
  backupPath,
  confirm,
  firebotProfileDir,
  firebotProfileFiles,
  loadOptionalConfig,
  readJson,
  writeJson,
} from '../lib/environment';
import { describeRestart, isRunning, restartApp } from '../lib/processes';

export interface RestartFirebotOptions {
  config: ScenesConfig | undefined;
  profileDir?: string;
}

/** The presets the profile holds, by id: its presets file, which Firebot reads at startup and writes from its UI. */
export const readProfilePresets = (profileDir: string): Record<string, StoredPreset> => {
  const path = firebotProfileFiles(profileDir).presets;
  return existsSync(path) ? (readJson(path) as Record<string, StoredPreset>) : {};
};

/** Write the presets and settings into the profile. Only safe while Firebot is closed, unless it is a dry run. */
const installProfileFiles = (profileDir: string, config: ScenesConfig | undefined, dryRun = false) => {
  const would = dryRun ? 'dry run: would have ' : '';

  // The config owns every layout preset; presets made for other things stay in the profile
  if (config) {
    const target = firebotProfileFiles(profileDir).presets;
    const merge = mergeLayoutPresets(readProfilePresets(profileDir), createPresetEffectLists(config));
    if (!dryRun) {
      if (existsSync(target)) copyFileSync(target, backupPath(target));
      writeJson(target, merge.presets);
    }
    console.log(
      `${would}installed ${String(merge.added)} layout presets to ${target} (${String(merge.replaced)} previous layout presets replaced, ${String(merge.kept)} other presets kept)`,
    );
  } else {
    console.log('no config, so the presets were left as they are');
  }

  // The settings the script needs
  const settingsPath = firebotProfileFiles(profileDir).settings;
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
export const restartFirebot = ({ config, profileDir: profileDirFlag }: RestartFirebotOptions) => {
  const profileDir = firebotProfileDir(config, profileDirFlag);
  return restartApp(firebotApp(config), () => {
    installProfileFiles(profileDir, config);
  });
};

export const firebotRestart = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'profile-dir': { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });
  const config = await loadOptionalConfig(values.config);

  if (values['dry-run']) {
    installProfileFiles(firebotProfileDir(config, values['profile-dir']), config, true);
    describeRestart(firebotApp(config));
    return;
  }
  if (isRunning(FIREBOT_PROCESS_NAME) && !(await confirm('Restart Firebot now?', values.yes))) {
    console.log('not restarted');
    return;
  }

  await restartFirebot({ config, profileDir: values['profile-dir'] });
};
