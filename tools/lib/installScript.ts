// Installing the built script into the Firebot profile's scripts folder, a step of `firebot:deploy`. Firebot caches
// a loaded script, so a new build is one of the reasons the deploy restarts Firebot.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';

import { backupPath, packageRoot } from './environment';

export type InstallScriptResult = 'installed' | 'unchanged';

/**
 * Install the built script into the profile when it differs from what is there. Returns whether anything changed, or
 * would change on a dry run.
 */
export const installScriptFile = (profileDir: string, dryRun = false): InstallScriptResult => {
  const source = join(packageRoot(), 'dist', SCRIPT_FILE_NAME);
  if (!existsSync(source)) throw new Error(`${source} is missing; build the package first`);

  const scriptsDir = join(profileDir, 'scripts');
  const target = join(scriptsDir, SCRIPT_FILE_NAME);
  if (existsSync(target) && readFileSync(target).equals(readFileSync(source))) {
    console.log(`script is up to date at ${target}`);
    return 'unchanged';
  }
  if (dryRun) {
    console.log(`dry run: would install ${target}`);
    return 'installed';
  }
  mkdirSync(scriptsDir, { recursive: true });
  if (existsSync(target)) copyFileSync(target, backupPath(target));
  copyFileSync(source, target);
  console.log(`installed ${target}`);
  return 'installed';
};
