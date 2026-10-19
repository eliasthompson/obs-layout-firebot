// Copies the built script into the Firebot profile's scripts folder. Firebot caches a loaded script, so it has to be
// restarted afterwards for the new build to run.
//
//   obs-layout-firebot install-script [--profile-dir <Firebot profile folder>] [--config config/scenes.ts]
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';

import { firebotProfileDir, loadOptionalConfig, packageRoot } from '../lib/environment';

export const installScript = async (args: string[]) => {
  const { values } = parseArgs({ args, options: { config: { type: 'string' }, 'profile-dir': { type: 'string' } } });
  const config = await loadOptionalConfig(values.config);

  const source = join(packageRoot(), 'dist', SCRIPT_FILE_NAME);
  if (!existsSync(source)) throw new Error(`${source} is missing; build the package first`);

  const scriptsDir = join(firebotProfileDir(config, values['profile-dir']), 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  const target = join(scriptsDir, SCRIPT_FILE_NAME);
  copyFileSync(source, target);

  console.log(`installed ${target}`);
  console.log('Restart Firebot so it loads the new build: obs-layout-firebot restart-firebot');
};
