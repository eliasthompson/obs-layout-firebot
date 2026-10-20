// The two desktop apps the tools restart, Firebot and OBS: their process names and how to start each on every
// platform. The config's `firebot.executable` and `obs.executable` override the default install locations.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ScenesConfig } from '@/types/ScenesConfig';

import type { App, Launcher } from './processes';

/** Firebot's process name on each platform: its packager names the executable "Firebot v5" everywhere. */
export const FIREBOT_PROCESS_NAME = process.platform === 'win32' ? 'Firebot v5.exe' : 'Firebot v5';

/** The OBS executable's process name on each platform. */
export const OBS_PROCESS_NAME =
  process.platform === 'win32' ? 'obs64.exe' : process.platform === 'darwin' ? 'OBS' : 'obs';

/** Where Firebot's .deb and .rpm packages install it. The .tar.gz has no fixed place. */
const LINUX_FIREBOT_EXECUTABLE = '/usr/lib/firebotv5/Firebot v5';

/** The OBS installer's default location on Windows. */
const WINDOWS_OBS_EXECUTABLE = join(
  process.env.ProgramFiles ?? 'C:\\Program Files',
  'obs-studio',
  'bin',
  '64bit',
  'obs64.exe',
);

/**
 * Both apps ask before closing while live: Firebot with chat connected, OBS while streaming or recording. Both write
 * their files on the way out, and Firebot may run a backup. This leaves room for all of that.
 */
export const CLOSE_TIMEOUT_MS = 60_000;

/**
 * How to start Firebot: the config's executable, else the newest version of the per-user Windows install, the macOS
 * app, or the Linux package. Windows starts it through Explorer, which detaches it from this console.
 */
const firebotLauncher = (config: ScenesConfig | undefined): Launcher => {
  const executable = config?.firebot?.executable;
  if (process.platform === 'win32') {
    if (executable !== undefined) return { command: 'explorer.exe', args: [executable] };
    const installDir = join(process.env.LOCALAPPDATA ?? '', 'firebot');
    const versions = existsSync(installDir)
      ? readdirSync(installDir)
          .filter((name) => name.startsWith('app-'))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      : [];
    if (!versions.length) throw new Error(`no Firebot install in ${installDir}; set firebot.executable in the config`);
    return { command: 'explorer.exe', args: [join(installDir, versions[0], 'Firebot v5.exe')] };
  }
  if (executable !== undefined) return { command: executable, args: [] };
  if (process.platform === 'darwin') return { command: 'open', args: ['-a', 'Firebot'] };
  if (existsSync(LINUX_FIREBOT_EXECUTABLE)) return { command: LINUX_FIREBOT_EXECUTABLE, args: [] };
  throw new Error('set firebot.executable in the config to the Firebot program, so it can be started again');
};

/**
 * How to start OBS: the config's executable, else the default install. OBS looks for its data files from its working
 * directory, so it is started from its own folder; on Windows, Explorer does that and detaches it from this console.
 */
const obsLauncher = (config: ScenesConfig | undefined): Launcher => {
  const executable = config?.obs?.executable;
  if (process.platform === 'win32') {
    const path = executable ?? WINDOWS_OBS_EXECUTABLE;
    if (!existsSync(path)) throw new Error(`no OBS at ${path}; set obs.executable in the config`);
    return { command: 'explorer.exe', args: [path] };
  }
  if (executable !== undefined) return { command: executable, args: [], cwd: dirname(executable) };
  if (process.platform === 'darwin') return { command: 'open', args: ['-a', 'OBS'] };
  if (existsSync('/usr/bin/obs')) return { command: '/usr/bin/obs', args: [] };
  throw new Error(
    'set obs.executable in the config to the OBS program (for Flatpak, a script running `flatpak run com.obsproject.Studio`), so it can be started again',
  );
};

export const firebotApp = (config: ScenesConfig | undefined): App => ({
  label: 'Firebot',
  processName: FIREBOT_PROCESS_NAME,
  launcher: () => firebotLauncher(config),
  closeTimeoutMs: CLOSE_TIMEOUT_MS,
});

export const obsApp = (config: ScenesConfig | undefined): App => ({
  label: 'OBS',
  processName: OBS_PROCESS_NAME,
  launcher: () => obsLauncher(config),
  closeTimeoutMs: CLOSE_TIMEOUT_MS,
});
