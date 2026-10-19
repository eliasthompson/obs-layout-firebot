// Stops Firebot, installs the presets file into the profile, makes sure custom scripts and persistent custom
// variables are enabled, and starts Firebot again. Firebot reads these files only at startup and caches custom
// scripts, so this is the step after install-script or a preset change. Backs up every file it replaces next to it.
//
//   obs-layout-firebot restart-firebot [--config config/scenes.ts] [--presets config/preset-effect-lists.json]
//     [--profile-dir <Firebot profile folder>]
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { PresetEffectList } from '@/lib/createPresetEffectList';
import type { FirebotSettingsFile } from '@/lib/enableScriptSettings';
import type { StoredPreset } from '@/lib/mergeLayoutPresets';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { enableScriptSettings } from '@/lib/enableScriptSettings';
import { mergeLayoutPresets } from '@/lib/mergeLayoutPresets';

import {
  backupPath,
  DEFAULT_PRESETS_PATH,
  firebotProfileDir,
  loadOptionalConfig,
  readJson,
  writeJson,
} from '../lib/environment';
import { closeGracefully, isRunning, startDetached } from '../lib/processes';

/** Firebot's process name on each platform: its packager names the executable "Firebot v5" everywhere. */
const FIREBOT_PROCESS_NAME = process.platform === 'win32' ? 'Firebot v5.exe' : 'Firebot v5';

/** Where Firebot's .deb and .rpm packages install it. The .tar.gz has no fixed place. */
const LINUX_PACKAGE_EXECUTABLE = '/usr/lib/firebotv5/Firebot v5';

/**
 * Firebot asks for confirmation before closing while it is live with chat connected, so a close can wait on someone;
 * on exit it also writes its custom variable cache and may run a backup. This leaves room for both.
 */
const CLOSE_TIMEOUT_MS = 60_000;

/**
 * How to start Firebot: the config's executable, else the newest version of the per-user Windows install, the macOS
 * app, or the Linux package. Windows starts it through Explorer, which detaches it from this console; a direct start
 * never came up.
 */
const firebotLauncher = (config: ScenesConfig | undefined): [string, string[]] => {
  const executable = config?.firebot?.executable;
  if (process.platform === 'win32') {
    if (executable !== undefined) return ['explorer.exe', [executable]];
    const installDir = join(process.env.LOCALAPPDATA ?? '', 'firebot');
    const versions = existsSync(installDir)
      ? readdirSync(installDir)
          .filter((name) => name.startsWith('app-'))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      : [];
    if (!versions.length) throw new Error(`no Firebot install in ${installDir}; set firebot.executable in the config`);
    return ['explorer.exe', [join(installDir, versions[0], 'Firebot v5.exe')]];
  }
  if (executable !== undefined) return [executable, []];
  if (process.platform === 'darwin') return ['open', ['-a', 'Firebot']];
  if (existsSync(LINUX_PACKAGE_EXECUTABLE)) return [LINUX_PACKAGE_EXECUTABLE, []];
  throw new Error('set firebot.executable in the config to the Firebot program, so it can be started again');
};

export interface RestartFirebotOptions {
  config: ScenesConfig | undefined;
  presetsPath: string;
  profileDir?: string;
}

/** Restart Firebot with the presets installed. Resolves with how Firebot was stopped. */
export const restartFirebot = async ({ config, presetsPath, profileDir: profileDirFlag }: RestartFirebotOptions) => {
  const profileDir = firebotProfileDir(config, profileDirFlag);
  // Fail before stopping anything when Firebot could not be started again
  const [command, commandArgs] = firebotLauncher(config);

  // 1. Close Firebot and wait for it to exit: it keeps presets in memory and writes its files on the way out
  const stopped = isRunning(FIREBOT_PROCESS_NAME)
    ? await closeGracefully(FIREBOT_PROCESS_NAME, CLOSE_TIMEOUT_MS)
    : 'not running';
  if (stopped === 'killed') {
    console.log(
      'Firebot did not close in time and was stopped forcibly, so it could not save custom variables set since it started',
    );
  } else {
    console.log(stopped === 'closed' ? 'Firebot stopped' : 'Firebot was not running');
  }

  // 2. Presets: the presets file owns every layout preset; presets made for other things stay in the profile
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
    console.log(`no presets file at ${presetsPath}; run deploy to create it`);
  }

  // 3. The settings the script needs
  const settingsPath = join(profileDir, 'settings.json');
  if (existsSync(settingsPath)) {
    const { file, changed } = enableScriptSettings(readJson(settingsPath) as FirebotSettingsFile);
    if (changed.length) {
      copyFileSync(settingsPath, backupPath(settingsPath));
      writeJson(settingsPath, file);
      console.log(`enabled ${changed.join(' and ')}`);
    }
  }

  // 4. Start Firebot again
  startDetached(command, commandArgs);
  console.log(`started Firebot (${[command, ...commandArgs].join(' ')})`);
  return stopped;
};

export const restartFirebotCommand = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string' },
      presets: { type: 'string', default: DEFAULT_PRESETS_PATH },
      'profile-dir': { type: 'string' },
    },
  });

  const stopped = await restartFirebot({
    config: await loadOptionalConfig(values.config),
    presetsPath: values.presets,
    profileDir: values['profile-dir'],
  });
  if (stopped === 'killed') console.log('run deploy once Firebot is back to store the config again');
};
