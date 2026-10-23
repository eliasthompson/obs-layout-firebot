// Deploys the config to OBS in one go: runs the setup over the websocket on every canvas OBS has, then, when the scene
// items' show and hide transitions need setting, restarts OBS around writing them, since only the scene collection
// file holds them and OBS only reads it at startup. OBS writes the collection on exit, so the setup's filters are saved before the file is
// edited. Asks before restarting, never closes OBS while it is streaming or recording, and never forces it: an OBS that
// cannot be closed from here is left for you to close, and then to start again. --dry-run reports every change
// without touching OBS or the file.
//
//   obs-layout-firebot obs:deploy [--config config/scenes.ts] [--transition none|fade] [--duration 300]
//     [--collection <path>] [--yes] [--no-restart] [--dry-run]
import { parseArgs } from 'node:util';

import type { FadesCanvas } from '../lib/fades';

import { obsApp } from '../lib/apps';
import { canvasLabel, openCanvases } from '../lib/canvases';
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
  let fadesCanvases: FadesCanvas[];
  try {
    const canvases = await openCanvases(client, config);
    let changes = 0;
    for (const canvas of canvases) {
      changes += await runSetup(canvas.client, canvas.config, { dryRun, label: canvasLabel(config, canvas.key) });
    }
    fadesCanvases = canvases.map(({ key, config: canvasConfig, uuid, isMain }) => ({
      config: canvasConfig,
      uuid,
      isMain,
      label: canvasLabel(config, key),
    }));
    console.log(
      dryRun ? `dry run: ${String(changes)} setup changes would be made` : `setup done, ${String(changes)} changes`,
    );
    activeCollection = await readActiveSceneCollection(client);
    ({ live } = await readObsLiveStatus(client));
  } finally {
    client.close();
  }
  const collectionPath = obsSceneCollectionPath(config, values.collection, activeCollection);
  const fadeOptions = { transition, duration };

  // 2. The transitions live in the collection file, which OBS rewrites on exit, so OBS has to be restarted around it.
  // The file on disk is what OBS last saved: enough to see which items would change, and an item it does not hold yet
  // is probably unsaved, which the restart saves before the file is written
  console.log(`item transitions in ${collectionPath}:`);
  const pending = writeFades(fadesCanvases, collectionPath, { ...fadeOptions, dryRun: true });
  if (!pending.changed && !pending.missing) {
    console.log(
      dryRun ? 'dry run: OBS would need no restart' : 'the item transitions are set, so OBS needs no restart; deployed',
    );
    return;
  }
  if (dryRun) {
    console.log('dry run: OBS would be restarted to set the item transitions');
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
    writeFades(fadesCanvases, collectionPath, { ...fadeOptions, dryRun: false });
  });
  console.log('deployed to OBS');
};
