import { createJiti } from 'jiti';
// Where the tools find the config, Firebot, and OBS. Each setting comes from a command-line option, else an
// environment variable (set in the shell or in a .env file in the working directory, see .env.example), else the
// config's `firebot` and `obs` entries, else the default for the platform.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

if (existsSync('.env')) process.loadEnvFile('.env');

import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { assertConfig } from '@/lib/assertConfig';
import { backupName } from '@/lib/backups';
import { SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';
import { readFirebotIntegrations } from '@/lib/readFirebotIntegrations';
import { readObsLastUsed } from '@/lib/readObsLastUsed';
import { resolveObsConnection } from '@/lib/resolveObsConnection';

export const DEFAULT_CONFIG_PATH = join('config', 'scenes.ts');
export const DEFAULT_FIREBOT_PROFILE = 'Main';
export const DEFAULT_FIREBOT_API_URL = 'http://localhost:7472/api/v1';
export const DEFAULT_SCENE_COLLECTION = 'Untitled';
export const DEFAULT_OBS_PROFILE = 'Untitled';
export const DEFAULT_OBS_EXPORT_DIR = 'obs';

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

/**
 * Load a config file: TypeScript or JavaScript through its default export, JSON as is. jiti compiles the module, so a
 * `.ts` config with `export default` loads whatever the `type` of the user's package.json, which Node's own type
 * stripping does not: it reads `.ts` in a CommonJS package as CommonJS. Its imports resolve through the `paths` of the
 * tsconfig.json nearest each importing file, as TypeScript resolves them, so a config can import through the
 * project's path aliases; an import no alias matches, such as a relative one, resolves as usual.
 */
export const loadConfig = async (path: string): Promise<ScenesConfig> => {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new Error(`${path} does not exist; start one from the example in the README`);
  }
  const config: unknown =
    extname(absolute) === '.json'
      ? JSON.parse(readFileSync(absolute, 'utf8'))
      : // jiti looks for the tsconfig from its parent file, so the search starts at the config, not this package
        await createJiti(absolute, { tsconfigPaths: true }).import(absolute, { default: true });
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

/** A name made file-safe the way OBS names its files and folders: spaces to underscores, other punctuation dropped. */
const obsFileSafeName = (name: string) => name.replace(/\s/gu, '_').replace(/[^\p{L}\p{N}_]/gu, '');

/**
 * The file OBS keeps a scene collection in. OBS names it after the collection made file-safe (spaces to underscores,
 * other punctuation dropped, a number added when taken), so it is found by the name it holds, else by that rule.
 */
const sceneCollectionFile = (name: string) => {
  const dir = obsScenesDir();
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => extname(file) === '.json') : [];
  const named = files.find((file) => {
    try {
      return (JSON.parse(readFileSync(join(dir, file), 'utf8')) as { name?: unknown }).name === name;
    } catch {
      return false;
    }
  });
  return join(dir, named ?? `${obsFileSafeName(name)}.json`);
};

/** The folder OBS keeps its scene collection files in. */
export const obsScenesDir = () => join(appDataDir(), 'obs-studio', 'basic', 'scenes');

/** The folder OBS keeps its profile folders in. */
export const obsProfilesDir = () => join(appDataDir(), 'obs-studio', 'basic', 'profiles');

/**
 * The folder OBS keeps a profile in, named as a scene collection's file is, so it is found by the `Name` its
 * `basic.ini` holds, else by the same rule.
 */
const profileFolder = (name: string) => {
  const dir = obsProfilesDir();
  const folders = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : [];
  const named = folders.find(({ name: folder }) => {
    const ini = join(dir, folder, 'basic.ini');
    return existsSync(ini) && readFileSync(ini, 'utf8').split(/\r?\n/u).includes(`Name=${name}`);
  });
  return join(dir, named?.name ?? obsFileSafeName(name));
};

/**
 * The profile and scene collection OBS last had loaded, and loads on its next start, for when OBS is not running to
 * say: from `user.ini` (OBS 31 and later), else `global.ini`. Each is left out unless its folder or file exists.
 */
const obsLastUsed = () => {
  const studioDir = join(appDataDir(), 'obs-studio');
  const [user, global] = ['user.ini', 'global.ini'].map((file) => {
    const path = join(studioDir, file);
    return existsSync(path) ? readObsLastUsed(readFileSync(path, 'utf8')) : {};
  });
  const profileDir = user.profileDir ?? global.profileDir;
  const sceneCollectionFile = user.sceneCollectionFile ?? global.sceneCollectionFile;
  const profilePath = profileDir === undefined ? undefined : join(obsProfilesDir(), profileDir);
  const collectionPath = sceneCollectionFile === undefined ? undefined : join(obsScenesDir(), sceneCollectionFile);
  return {
    profilePath: profilePath !== undefined && existsSync(profilePath) ? profilePath : undefined,
    collectionPath: collectionPath !== undefined && existsSync(collectionPath) ? collectionPath : undefined,
  };
};

/**
 * OBS profile folder: `--profile`, `OBS_PROFILE_DIR`, the folder of the profile OBS reported as active when it was
 * asked, the one OBS last had loaded when it could not be asked, else the config's profile (default "Untitled").
 */
export const obsProfileDir = (config?: ScenesConfig, flag?: string, activeProfile?: string) =>
  flag ??
  process.env.OBS_PROFILE_DIR ??
  (activeProfile === undefined ? obsLastUsed().profilePath : undefined) ??
  profileFolder(activeProfile ?? config?.obs?.profile ?? DEFAULT_OBS_PROFILE);

/** Where `obs:export` writes: `--to`, else the config's `obs.exportDir`, else "obs", relative to the working folder. */
export const obsExportDir = (config?: ScenesConfig, flag?: string) =>
  resolve(flag ?? config?.obs?.exportDir ?? DEFAULT_OBS_EXPORT_DIR);

/**
 * OBS scene collection file: `--collection`, `OBS_SCENE_COLLECTION`, the file of the collection OBS reported as active
 * when it was asked, the one OBS last had loaded when it could not be asked, else the config's collection (default
 * "Untitled").
 */
export const obsSceneCollectionPath = (config?: ScenesConfig, flag?: string, activeCollection?: string) =>
  flag ??
  process.env.OBS_SCENE_COLLECTION ??
  (activeCollection === undefined ? obsLastUsed().collectionPath : undefined) ??
  sceneCollectionFile(activeCollection ?? config?.obs?.sceneCollection ?? DEFAULT_SCENE_COLLECTION);

/** Ask a yes/no question on the terminal. `yes` answers it beforehand; without a terminal the answer is no. */
export const confirm = async (question: string, yes = false) => {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question} [y/N] `);
  prompt.close();
  return /^y(es)?$/i.test(answer.trim());
};

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
export const backupPath = (path: string) => backupName(path, new Date());

/** The Firebot profile files the tools write, each backed up before it is replaced. */
export const firebotProfileFiles = (profileDir: string) => ({
  script: join(profileDir, 'scripts', SCRIPT_FILE_NAME),
  presets: join(profileDir, 'effects', 'preset-effect-lists.json'),
  settings: join(profileDir, 'settings.json'),
});

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
