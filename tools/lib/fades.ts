// The show and hide transitions of scene items, set in the OBS scene collection file. obs-websocket has no request
// for scene item transitions, so this edits the file directly, which only works while OBS is closed: OBS rewrites the
// file on exit and reads it on start, so `obs:deploy` runs this between closing and starting OBS. The script fades the
// items it lays out through an Opacity filter, so the usual choice for them is "none"; OBS's own item Fade brightens
// toward white on anything with transparency. Toggled items, and every item of the config's `fadeScenes`, fade through
// OBS's own Fade over the config's duration instead, which fades their audio too.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_DURATION } from '@/constants/filterNames';
import { listBindings } from '@/lib/listBindings';
import { listItems } from '@/lib/listItems';

import { backupPath } from './environment';

interface SceneItem {
  name: string;
  id?: number;
  /** A copy of a group's item that OBS keeps in the group's parent scene, for versions that cannot read groups. */
  group_item_backup?: boolean;
  show_transition?: Record<string, unknown>;
  hide_transition?: Record<string, unknown>;
}

interface SavedScene {
  name: string;
  canvas_uuid?: string;
  settings?: { items?: SceneItem[] };
}

interface SceneCollection {
  /** Every scene and input; a scene records the canvas it belongs to, as OBS 32 and later save it. */
  sources: SavedScene[];
  /** Every group, saved apart from the scenes. */
  groups?: SavedScene[];
}

/** A canvas whose items get transitions, and how the collection file tells its scenes apart. */
export interface FadesCanvas {
  config: CanvasScenesConfig;
  /** The canvas's UUID, when OBS lists its canvases; without it, scenes are found by name alone. */
  uuid?: string;
  isMain: boolean;
  /** A prefix naming the canvas in the output. */
  label: string;
}

export type FadeTransition = 'fade' | 'none';

export interface FadesOptions {
  /** The transition of the items the layout moves. */
  transition: FadeTransition;
  /** Their transition duration in milliseconds. */
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
  /** Items and fade scenes the file does not hold, usually ones OBS has not saved yet. */
  missing: number;
}

// Without a transition id OBS cuts, which is what an item looks like before any transition was chosen
const transitionOf = (itemName: string, kind: 'Hide' | 'Show', transition: FadeTransition, duration: number) =>
  transition === 'none'
    ? { duration }
    : {
        id: 'fade_transition',
        versioned_id: 'fade_transition',
        name: `${itemName} ${kind} Transition`,
        transition: {},
        duration,
      };

/**
 * Set the transitions of every canvas's items in the collection file, backing it up first: the items the layout
 * moves get `transition`, and toggled items and the items of the fade scenes a Fade over the config's duration. Scene
 * names can repeat across canvases, so a scene is found by name on its own canvas first, then on any; a main canvas
 * scene saved before OBS had canvases records none.
 */
export const writeFades = (
  canvases: FadesCanvas[],
  collectionPath: string,
  { transition, duration, dryRun }: FadesOptions,
): FadesResult => {
  const collection = JSON.parse(readFileSync(collectionPath, 'utf8')) as SceneCollection;
  const groups = collection.groups ?? [];

  let changed = 0;
  let missing = 0;
  for (const { config, uuid, isMain, label } of canvases) {
    const onCanvas = ({ canvas_uuid }: SavedScene) =>
      uuid === undefined || canvas_uuid === uuid || (isMain && canvas_uuid === undefined);
    // A scene of another canvas can be nested in this one's, as the main canvas's source lists often are
    const findScene = (name: string) => {
      const named = [...collection.sources, ...groups].filter((candidate) => candidate.name === name);
      return named.find(onCanvas) ?? named.at(0);
    };
    const fadeDuration = config.duration ?? DEFAULT_DURATION;

    const apply = (scene: SavedScene, item: SceneItem, itemTransition: FadeTransition, itemDuration: number) => {
      // A group's item is also kept as a backup in the group's parent scene, which gets the same transitions
      const copies = groups.includes(scene)
        ? collection.sources
            .filter(onCanvas)
            .flatMap((parent) => parent.settings?.items ?? [])
            .filter((copy) => copy.group_item_backup && copy.name === item.name && copy.id === item.id)
        : [];
      const before = JSON.stringify([item.show_transition, item.hide_transition]);
      for (const target of [item, ...copies]) {
        target.show_transition = transitionOf(item.name, 'Show', itemTransition, itemDuration);
        target.hide_transition = transitionOf(item.name, 'Hide', itemTransition, itemDuration);
      }
      const after = JSON.stringify([item.show_transition, item.hide_transition]);
      console.log(`${before === after ? 'KEEP ' : dryRun ? 'WOULD' : 'SET  '} ${label}${scene.name} / ${item.name}`);
      if (before !== after) changed += 1;
    };

    const named = [
      ...listBindings(config).map((binding) => ({ ...binding, transition, duration })),
      ...listItems(config).map((item) => ({ ...item, transition: 'fade' as const, duration: fadeDuration })),
    ];
    for (const { scene: sceneName, source, transition: itemTransition, duration: itemDuration } of named) {
      const scene = findScene(sceneName);
      const item = scene?.settings?.items?.find((candidate) => candidate.name === source);
      if (!scene || !item) {
        console.log(`SKIP  ${label}${sceneName} / ${source}: not found in the scene collection`);
        missing += 1;
        continue;
      }
      apply(scene, item, itemTransition, itemDuration);
    }

    // Every other item of a fade scene; backup copies of a group's items follow the group's own
    const handled = new Set(named.map(({ scene, source }) => `${scene}\n${source}`));
    for (const sceneName of config.fadeScenes ?? []) {
      const scene = findScene(sceneName);
      if (!scene) {
        console.log(`SKIP  ${label}${sceneName}: fade scene not found in the scene collection`);
        missing += 1;
        continue;
      }
      for (const item of scene.settings?.items ?? []) {
        if (!item.group_item_backup && !handled.has(`${sceneName}\n${item.name}`)) {
          apply(scene, item, 'fade', fadeDuration);
        }
      }
    }
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
