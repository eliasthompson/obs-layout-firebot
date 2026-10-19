// Where the tools find the config, Firebot, and OBS. Each setting comes from a command-line option, else an
// environment variable (set in the shell or in a .env file in the working directory, see .env.example), else the
// config's `firebot` and `obs` entries, else the default for the platform.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (existsSync('.env')) process.loadEnvFile('.env');

import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { assertConfig } from '@/lib/assertConfig';
import { readFirebotIntegrations } from '@/lib/readFirebotIntegrations';
import { resolveObsConnection } from '@/lib/resolveObsConnection';

export const DEFAULT_CONFIG_PATH = join('config', 'scenes.ts');
export const DEFAULT_PRESETS_PATH = join('config', 'preset-effect-lists.json');
export const DEFAULT_FIREBOT_PROFILE = 'Main';
export const DEFAULT_FIREBOT_API_URL = 'http://localhost:7472/api/v1';
export const DEFAULT_SCENE_COLLECTION = 'Untitled';

/** Per-user application data: %APPDATA% on Windows, Application Support on macOS, the XDG config folder elsewhere. */
export const appDataDir = () => {
  switch (process.platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support');
    case 'win32':
      return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    default:
      return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  }
};

/** The package's own folder, found from this file both in the source tree and in the build. */
export const packageRoot = () => {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('could not find the package folder of obs-layout-firebot');
    dir = parent;
  }
  return dir;
};

/** Load a config file: TypeScript or JavaScript through its default export, JSON as is. Node strips the types. */
export const loadConfig = async (path: string): Promise<ScenesConfig> => {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new Error(`${path} does not exist; run \`obs-layout-firebot init\` to start one from the example`);
  }
  const config: unknown =
    extname(absolute) === '.json'
      ? JSON.parse(readFileSync(absolute, 'utf8'))
      : ((await import(pathToFileURL(absolute).href)) as { default?: unknown }).default;
  assertConfig(config);
  return config;
};

/** The config at an explicit path, else the default one if it exists. For commands that also work without one. */
export const loadOptionalConfig = async (path: string | undefined) =>
  path !== undefined || existsSync(DEFAULT_CONFIG_PATH) ? loadConfig(path ?? DEFAULT_CONFIG_PATH) : undefined;

/** Firebot profile folder: `--profile-dir`, `FIREBOT_PROFILE_DIR`, or the config's profile (default "Main"). */
export const firebotProfileDir = (config?: ScenesConfig, flag?: string) =>
  flag ??
  process.env.FIREBOT_PROFILE_DIR ??
  join(appDataDir(), 'Firebot', 'v5', 'profiles', config?.firebot?.profile ?? DEFAULT_FIREBOT_PROFILE);

/** Firebot's local HTTP API: `FIREBOT_API_URL`, else the config's, else the default port. */
export const firebotApiUrl = (config?: ScenesConfig) =>
  process.env.FIREBOT_API_URL ?? config?.firebot?.apiUrl ?? DEFAULT_FIREBOT_API_URL;

/** Custom variable that holds the config: `--variable`, else the config's, else "layoutScenes". */
export const configVariable = (config: ScenesConfig, flag?: string) =>
  flag ?? config.firebot?.variable ?? DEFAULT_CONFIG_VARIABLE;

/** OBS scene collection file: `--collection`, `OBS_SCENE_COLLECTION`, or the config's collection (default "Untitled"). */
export const obsSceneCollectionPath = (config?: ScenesConfig, flag?: string) =>
  flag ??
  process.env.OBS_SCENE_COLLECTION ??
  join(
    appDataDir(),
    'obs-studio',
    'basic',
    'scenes',
    `${config?.obs?.sceneCollection ?? DEFAULT_SCENE_COLLECTION}.json`,
  );

/** OBS connection: `OBS_WEBSOCKET_URL` / `OBS_WEBSOCKET_PASSWORD`, else the config, else Firebot's integration. */
export const toolObsConnection = (config: ScenesConfig): ObsConnection => {
  const url = process.env.OBS_WEBSOCKET_URL;
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  const obs = { ...config.obs, ...(url === undefined ? {} : { url }), ...(password === undefined ? {} : { password }) };

  return resolveObsConnection({ obs }, readFirebotIntegrations(firebotProfileDir(config)));
};

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export const writeJson = (path: string, value: unknown, indent = 2) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
};

/** Where to copy a file before replacing it: next to it, named with the time. */
export const backupPath = (path: string) => `${path}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
