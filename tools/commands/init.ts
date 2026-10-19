// Starts a config from the example that ships with the package. Never overwrites an existing file.
//
//   obs-layout-firebot init [--config config/scenes.ts]
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULT_CONFIG_PATH, packageRoot } from '../lib/environment';

export const init = (args: string[]) => {
  const { values } = parseArgs({ args, options: { config: { type: 'string', default: DEFAULT_CONFIG_PATH } } });
  if (existsSync(values.config)) throw new Error(`${values.config} already exists`);

  mkdirSync(dirname(values.config), { recursive: true });
  copyFileSync(join(packageRoot(), 'config', 'scenes.example.ts'), values.config);
  console.log(`created ${values.config}; bind your OBS scenes and sources in it, then run obs-layout-firebot setup`);
};
