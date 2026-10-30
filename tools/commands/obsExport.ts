// Exports OBS's scene collection and profile into the project, with every secret blanked, so the setup can be committed
// and restored: `<to>/scenes/<collection>.json` and `<to>/profiles/<profile>/`, laid out like OBS's `basic` folder.
// It exports the collection and profile OBS has loaded, waiting for OBS to start when it is not running, as after a
// deploy that restarted it. Without a terminal to wait on, or with --no-wait, it exports the ones OBS last had loaded,
// from its settings, else the config's. OBS saves its files on its own schedule, so the export holds what OBS last
// saved. --dry-run reports what it would write.
//
//   obs-layout-firebot obs:export [--to obs] [--collection <file>] [--profile <folder>] [--config config/scenes.ts]
//     [--no-wait] [--dry-run]
import { parseArgs } from 'node:util';

import { OBS_PROCESS_NAME } from '../lib/apps';
import {
  DEFAULT_CONFIG_PATH,
  loadConfig,
  obsExportDir,
  obsProfileDir,
  obsSceneCollectionPath,
  toolObsConnection,
} from '../lib/environment';
import { exportObs } from '../lib/exportObs';
import { connectObsPatiently, ensureObsRunning, readActiveProfile, readActiveSceneCollection } from '../lib/obs';
import { isRunning } from '../lib/processes';

export const obsExport = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      collection: { type: 'string' },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'dry-run': { type: 'boolean', default: false },
      'no-wait': { type: 'boolean', default: false },
      profile: { type: 'string' },
      to: { type: 'string' },
    },
  });
  const config = await loadConfig(values.config);

  // OBS knows which collection and profile it has loaded, so the export waits for it to start, as after a deploy that
  // restarted it. Without a terminal to wait on, or with --no-wait, OBS's settings say which it last had loaded
  let activeCollection: string | undefined;
  let activeProfile: string | undefined;
  if (isRunning(OBS_PROCESS_NAME) || (process.stdin.isTTY && !values['no-wait'])) {
    await ensureObsRunning();
    const client = await connectObsPatiently(toolObsConnection(config));
    try {
      activeCollection = await readActiveSceneCollection(client);
      activeProfile = await readActiveProfile(client);
    } finally {
      client.close();
    }
  }

  exportObs({
    collectionPath: obsSceneCollectionPath(config, values.collection, activeCollection),
    profileDir: obsProfileDir(config, values.profile, activeProfile),
    exportDir: obsExportDir(config, values.to),
    dryRun: values['dry-run'],
  });
};
