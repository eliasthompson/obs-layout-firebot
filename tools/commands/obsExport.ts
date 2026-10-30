// Exports OBS's scene collection and profile into the project, with every secret blanked, so the setup can be committed
// and restored: `<to>/scenes/<collection>.json` and `<to>/profiles/<profile>/`, laid out like OBS's `basic` folder.
// With OBS running, it exports the collection and profile OBS has loaded; otherwise the config's. OBS saves its files
// on its own schedule, so the export holds what OBS last saved. --dry-run reports what it would write.
//
//   obs-layout-firebot obs:export [--to obs] [--collection <file>] [--profile <folder>] [--config config/scenes.ts]
//     [--dry-run]
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
import { connectObsPatiently, readActiveProfile, readActiveSceneCollection } from '../lib/obs';
import { isRunning } from '../lib/processes';

export const obsExport = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      collection: { type: 'string' },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'dry-run': { type: 'boolean', default: false },
      profile: { type: 'string' },
      to: { type: 'string' },
    },
  });
  const config = await loadConfig(values.config);

  // OBS knows which collection and profile it has loaded; without it, the config names them
  let activeCollection: string | undefined;
  let activeProfile: string | undefined;
  if (isRunning(OBS_PROCESS_NAME)) {
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
