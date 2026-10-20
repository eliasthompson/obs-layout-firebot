// Deploys the config to OBS in one go: runs the setup over the websocket, then restarts OBS around setting the scene
// items' show and hide transitions, which only the scene collection file holds and OBS only reads at startup. OBS
// writes the collection on exit, so the setup's filters are saved before the file is edited. Asks before restarting,
// never closes OBS while it is streaming or recording, and never forces it: an OBS that cannot be closed from here is
// left for you to close, and then to start again. --dry-run reports every change without touching OBS or the file.
//
//   obs-layout-firebot obs:deploy [--config config/scenes.ts] [--transition none|fade] [--duration 300]
//     [--collection <path>] [--yes] [--no-restart] [--dry-run]
import { parseArgs } from 'node:util';

import { obsApp } from '../lib/apps';
import {
  confirm,
  DEFAULT_CONFIG_PATH,
  loadConfig,
  obsSceneCollectionPath,
  toolObsConnection,
} from '../lib/environment';
import { parseFadeTransition, writeFades } from '../lib/fades';
import { connectObsPatiently, ensureObsRunning, readActiveSceneCollection, readObsLiveStatus } from '../lib/obs';
import { restartApp } from '../lib/processes';
import { runSetup } from '../lib/setup';

export const obsDeploy = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      collection: { type: 'string' },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'dry-run': { type: 'boolean', default: false },
      duration: { type: 'string', default: '300' },
      'no-restart': { type: 'boolean', default: false },
      transition: { type: 'string', default: 'none' },
      yes: { type: 'boolean', default: false },
    },
  });
  const transition = parseFadeTransition(values.transition);
  const duration = Number(values.duration);
  const dryRun = values['dry-run'];
  const config = await loadConfig(values.config);

  // 1. Filters and transforms, over the websocket, and what the restart needs to know while OBS is still up
  await ensureObsRunning();
  const client = await connectObsPatiently(toolObsConnection(config));
  let activeCollection: string;
  let live: boolean;
  try {
    const changes = await runSetup(client, config, { dryRun });
    console.log(
      dryRun ? `dry run: ${String(changes)} setup changes would be made` : `setup done, ${String(changes)} changes`,
    );
    activeCollection = await readActiveSceneCollection(client);
    ({ live } = await readObsLiveStatus(client));
  } finally {
    client.close();
  }
  const collectionPath = obsSceneCollectionPath(config, values.collection, activeCollection);
  const fadeOptions = { transition, duration, dryRun };

  // 2. The transitions live in the collection file, which OBS rewrites on exit, so OBS has to be restarted around it
  if (dryRun) {
    console.log(`dry run: OBS would be restarted to set the item transitions in ${collectionPath}:`);
    // The file on disk is what OBS last saved, which is enough to see which items would change
    writeFades(config, collectionPath, fadeOptions);
    return;
  }
  if (live) {
    console.log('OBS is streaming or recording, so it was not restarted; run `obs:deploy` again when it is not');
    return;
  }
  if (values['no-restart'] || !(await confirm('Restart OBS now to set the item transitions?', values.yes))) {
    console.log('not restarted; run `obs:deploy` again when ready, the setup is safe to repeat');
    return;
  }

  await restartApp(obsApp(config), () => {
    writeFades(config, collectionPath, fadeOptions);
  });
  console.log('deployed to OBS');
};
