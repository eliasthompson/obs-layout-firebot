// Sets the show and hide transition of every scene item the script toggles, in the OBS scene collection file.
// obs-websocket has no request for scene item transitions, so this edits the file directly, which only works while
// OBS is closed: OBS rewrites the file on exit and reads it on start. The script fades through an Opacity filter, so
// the usual choice is "none"; OBS's own item Fade brightens toward white on anything with transparency.
//
//   obs-layout-firebot fades [--transition none|fade] [--duration 300] [--collection <path>] [--config <path>] [--force]
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { listBindings } from '@/lib/listBindings';

import { backupPath, DEFAULT_CONFIG_PATH, loadConfig, obsSceneCollectionPath } from '../lib/environment';
import { isRunning } from '../lib/processes';

interface SceneItem {
  name: string;
  show_transition?: Record<string, unknown>;
  hide_transition?: Record<string, unknown>;
}

interface SceneCollection {
  sources: { name: string; settings?: { items?: SceneItem[] } }[];
}

/** The OBS executable's process name on each platform. */
const OBS_PROCESS_NAME = process.platform === 'win32' ? 'obs64.exe' : process.platform === 'darwin' ? 'OBS' : 'obs';

export const fades = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      collection: { type: 'string' },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      duration: { type: 'string', default: '300' },
      force: { type: 'boolean', default: false },
      transition: { type: 'string', default: 'none' },
    },
  });
  if (values.transition !== 'none' && values.transition !== 'fade') {
    throw new Error('--transition must be none or fade');
  }
  const duration = Number(values.duration);

  if (!values.force && isRunning(OBS_PROCESS_NAME)) {
    throw new Error('OBS is running; close it first (it rewrites the scene collection on exit), or pass --force');
  }

  const config = await loadConfig(values.config);
  const collectionPath = obsSceneCollectionPath(config, values.collection);
  const collection = JSON.parse(readFileSync(collectionPath, 'utf8')) as SceneCollection;

  // Without a transition id OBS cuts, which is what an item looks like before any transition was chosen
  const transition = (itemName: string, kind: 'Hide' | 'Show') =>
    values.transition === 'none'
      ? { duration }
      : {
          id: 'fade_transition',
          versioned_id: 'fade_transition',
          name: `${itemName} ${kind} Transition`,
          transition: {},
          duration,
        };

  let changed = 0;
  for (const { scene, source } of listBindings(config)) {
    const item = collection.sources
      .find((candidate) => candidate.name === scene)
      ?.settings?.items?.find((candidate) => candidate.name === source);
    if (!item) {
      console.log(`SKIP  ${scene} / ${source}: not found in the scene collection`);
      continue;
    }
    const before = JSON.stringify([item.show_transition, item.hide_transition]);
    item.show_transition = transition(source, 'Show');
    item.hide_transition = transition(source, 'Hide');
    const after = JSON.stringify([item.show_transition, item.hide_transition]);
    console.log(`${before === after ? 'KEEP ' : 'SET  '} ${scene} / ${source}`);
    if (before !== after) changed += 1;
  }

  if (changed) {
    const backup = backupPath(collectionPath);
    copyFileSync(collectionPath, backup);
    writeFileSync(collectionPath, JSON.stringify(collection, null, 4));
    console.log(`wrote ${String(changed)} items, backup at ${backup}`);
  } else {
    console.log('nothing to change');
  }
};
