// The show and hide transition of every scene item the script toggles, set in the OBS scene collection file.
// obs-websocket has no request for scene item transitions, so this edits the file directly, which only works while
// OBS is closed: OBS rewrites the file on exit and reads it on start, so `obs:deploy` runs this between closing and
// starting OBS. The script fades through an Opacity filter, so the usual choice is "none"; OBS's own item Fade
// brightens toward white on anything with transparency.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { listBindings } from '@/lib/listBindings';

import { backupPath } from './environment';

interface SceneItem {
  name: string;
  show_transition?: Record<string, unknown>;
  hide_transition?: Record<string, unknown>;
}

interface SceneCollection {
  sources: { name: string; settings?: { items?: SceneItem[] } }[];
}

export type FadeTransition = 'fade' | 'none';

export interface FadesOptions {
  transition: FadeTransition;
  /** Transition duration in milliseconds. */
  duration: number;
  /** Report every change without writing the file. */
  dryRun: boolean;
}

export const parseFadeTransition = (value: string): FadeTransition => {
  if (value !== 'none' && value !== 'fade') throw new Error('--transition must be none or fade');
  return value;
};

export interface FadesResult {
  /** Items whose transitions changed, or would. */
  changed: number;
  /** Bound items the file does not hold, usually ones OBS has not saved yet. */
  missing: number;
}

/** Set the transitions in the collection file, backing it up first. */
export const writeFades = (
  config: ScenesConfig,
  collectionPath: string,
  { transition, duration, dryRun }: FadesOptions,
): FadesResult => {
  const collection = JSON.parse(readFileSync(collectionPath, 'utf8')) as SceneCollection;

  // Without a transition id OBS cuts, which is what an item looks like before any transition was chosen
  const transitionOf = (itemName: string, kind: 'Hide' | 'Show') =>
    transition === 'none'
      ? { duration }
      : {
          id: 'fade_transition',
          versioned_id: 'fade_transition',
          name: `${itemName} ${kind} Transition`,
          transition: {},
          duration,
        };

  let changed = 0;
  let missing = 0;
  for (const { scene, source } of listBindings(config)) {
    const item = collection.sources
      .find((candidate) => candidate.name === scene)
      ?.settings?.items?.find((candidate) => candidate.name === source);
    if (!item) {
      console.log(`SKIP  ${scene} / ${source}: not found in the scene collection`);
      missing += 1;
      continue;
    }
    const before = JSON.stringify([item.show_transition, item.hide_transition]);
    item.show_transition = transitionOf(source, 'Show');
    item.hide_transition = transitionOf(source, 'Hide');
    const after = JSON.stringify([item.show_transition, item.hide_transition]);
    console.log(`${before === after ? 'KEEP ' : dryRun ? 'WOULD' : 'SET  '} ${scene} / ${source}`);
    if (before !== after) changed += 1;
  }

  if (!changed) {
    console.log('nothing to change');
  } else if (dryRun) {
    console.log(`${String(changed)} items to write to ${collectionPath}`);
  } else {
    const backup = backupPath(collectionPath);
    copyFileSync(collectionPath, backup);
    writeFileSync(collectionPath, JSON.stringify(collection, null, 4));
    console.log(`wrote ${String(changed)} items to ${collectionPath}, backup at ${backup}`);
  }
  return { changed, missing };
};
