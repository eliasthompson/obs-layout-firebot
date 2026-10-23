// Installing the built script into the Firebot profile's scripts folder, a step of `firebot:deploy`. Firebot caches
// a loaded script, so a new build is one of the reasons the deploy restarts Firebot.
import { version as bundledGeneratorVersion } from '@eliasthompson/obs-layout-generator/package.json';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';

import { backupPath, firebotProfileFiles, packageRoot, readJson } from './environment';

export type InstallScriptResult = 'installed' | 'unchanged';

/**
 * Warn when the obs-layout-generator bundled into the script is not the one installed here. The script carries the
 * version this package was built with (the build inlines it here too), while the CLI and the project's own code use
 * the project's copy, the peer dependency, so the two can lay out the same config differently.
 */
export const warnGeneratorMismatch = () => {
  const manifest = createRequire(import.meta.url).resolve('@eliasthompson/obs-layout-generator/package.json');
  const { version: installed } = readJson(manifest) as { version: string };
  if (installed === bundledGeneratorVersion) return;
  console.log(
    `WARNING the script bundles obs-layout-generator ${bundledGeneratorVersion} but ${installed} is installed here, so its layouts can differ from this project's`,
  );
};

/**
 * Install the built script into the profile when it differs from what is there. Returns whether anything changed, or
 * would change on a dry run.
 */
export const installScriptFile = (profileDir: string, dryRun = false): InstallScriptResult => {
  const source = join(packageRoot(), 'dist', SCRIPT_FILE_NAME);
  if (!existsSync(source)) throw new Error(`${source} is missing; build the package first`);

  const target = firebotProfileFiles(profileDir).script;
  if (existsSync(target) && readFileSync(target).equals(readFileSync(source))) {
    console.log(`script is up to date at ${target}`);
    return 'unchanged';
  }
  if (dryRun) {
    console.log(`dry run: would install ${target}`);
    return 'installed';
  }
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) copyFileSync(target, backupPath(target));
  copyFileSync(source, target);
  console.log(`installed ${target}`);
  return 'installed';
};
