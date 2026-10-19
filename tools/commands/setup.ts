// One-time OBS setup for a layout config. For every bound item it creates, disabled, the filters the script drives,
// and gives region items a bounds type a rectangle can size. Borders render at native size (no bounds) and get Move
// Value filters for their own width and height. Every toggled source but standby text gets an Opacity color filter
// plus the Move Value filter that animates it, and the standby text scene is cropped at the canvas center. Move Source
// filters on the managed scenes that no longer match a bound item (renamed or
// removed sources) are deleted. Idempotent: existing filters are updated, not duplicated.
//
//   obs-layout-firebot setup [--config config/scenes.ts]
import { parseArgs } from 'node:util';

import type { ObsClient } from '@/lib/connectObs';

import {
  HEIGHT_FILTER_NAME,
  MOVE_FILTER_PREFIX,
  OPACITY_FILTER_NAME,
  OPACITY_MOVE_FILTER_NAME,
  WIDTH_FILTER_NAME,
} from '@/constants/filterNames';
import {
  COLOR_FILTER_KIND,
  MOVE_SOURCE_FILTER_KIND,
  MOVE_VALUE_FILTER_KIND,
  MOVE_VALUE_FLOAT,
  MOVE_VALUE_INT,
  MOVE_VALUE_TYPE_SINGLE_SETTING,
} from '@/constants/moveTransition';
import { STANDBY_TEXT_BOUNDS_TYPE } from '@/constants/obsAlignment';
import { connectObs } from '@/lib/connectObs';
import { listBindings } from '@/lib/listBindings';
import { moveFilterName } from '@/lib/moveFilterName';
import { standbyLine } from '@/lib/standbyLine';

import { DEFAULT_CONFIG_PATH, loadConfig, toolObsConnection } from '../lib/environment';

interface SceneItem {
  sceneItemId: number;
  sourceName: string;
}

interface Filter {
  filterName: string;
  filterKind: string;
}

interface Transform {
  boundsType: string;
  alignment: number;
  boundsAlignment: number;
  width: number;
  height: number;
}

const moveTiming = { custom_duration: true, enabled_match_moving: true };

export const setup = async (args: string[]) => {
  const { values } = parseArgs({ args, options: { config: { type: 'string', default: DEFAULT_CONFIG_PATH } } });
  const config = await loadConfig(values.config);
  const bindings = listBindings(config);

  const client: ObsClient = await connectObs(toolObsConnection(config));

  const filtersOf = async (sourceName: string) =>
    (await client.call('GetSourceFilterList', { sourceName })).filters as Filter[];

  /** Create or update a filter and set its enabled state. Returns false when another kind of filter has the name. */
  const ensureFilter = async (
    sourceName: string,
    filterName: string,
    filterKind: string,
    filterSettings: Record<string, unknown>,
    enabled = false,
  ) => {
    const existing = (await filtersOf(sourceName)).find((filter) => filter.filterName === filterName);
    if (!existing) {
      await client.call('CreateSourceFilter', { sourceName, filterName, filterKind, filterSettings });
      console.log(`CREATE  ${sourceName} / ${filterName}`);
    } else if (existing.filterKind !== filterKind) {
      console.log(`SKIP    ${sourceName} / ${filterName} exists but is a ${existing.filterKind}`);
      return false;
    } else {
      await client.call('SetSourceFilterSettings', { sourceName, filterName, filterSettings, overlay: true });
      console.log(`UPDATE  ${sourceName} / ${filterName}`);
    }
    await client.call('SetSourceFilterEnabled', { sourceName, filterName, filterEnabled: enabled });
    return true;
  };

  /** Delete Move Source filters on a managed scene that do not belong to a bound item anymore. */
  const pruneMoveFilters = async (scene: string) => {
    const wanted = new Set(bindings.filter((binding) => binding.scene === scene).map((b) => moveFilterName(b.source)));
    for (const filter of await filtersOf(scene)) {
      const stale =
        filter.filterKind === MOVE_SOURCE_FILTER_KIND &&
        filter.filterName.startsWith(`${MOVE_FILTER_PREFIX} `) &&
        !wanted.has(filter.filterName);
      if (stale) {
        await client.call('RemoveSourceFilter', { sourceName: scene, filterName: filter.filterName });
        console.log(`REMOVE  ${scene} / ${filter.filterName} (no bound item)`);
      }
    }
  };

  try {
    const itemsByScene = new Map<string, SceneItem[]>();
    for (const { scene } of bindings) {
      if (!itemsByScene.has(scene)) {
        itemsByScene.set(
          scene,
          (await client.call('GetSceneItemList', { sceneName: scene })).sceneItems as SceneItem[],
        );
        await pruneMoveFilters(scene);
      }
    }

    for (const { scene, source, kind, boundsAlignment } of bindings) {
      const item = itemsByScene.get(scene)?.find((candidate) => candidate.sourceName === source);
      if (!item) {
        console.log(`SKIP    ${scene} has no item "${source}"`);
        continue;
      }

      if (kind !== 'layout') {
        const transform = (
          await client.call('GetSceneItemTransform', { sceneName: scene, sceneItemId: item.sceneItemId })
        ).sceneItemTransform as Transform;
        // Borders are sized through their own width/height; standby text always covers its bounds, which the script
        // relies on to hide it; other items need bounds and keep a type they already have. Positions are top-left
        // anchored; the alignment inside the bounds is only set when the config asks, or for standby text.
        const boundsType =
          kind === 'border'
            ? 'OBS_BOUNDS_NONE'
            : kind === 'text'
              ? STANDBY_TEXT_BOUNDS_TYPE
              : transform.boundsType === 'OBS_BOUNDS_NONE'
                ? 'OBS_BOUNDS_STRETCH'
                : transform.boundsType;
        const wanted: Partial<Transform> = {
          boundsType,
          alignment: 5,
          ...(boundsAlignment === undefined ? {} : { boundsAlignment }),
        };
        const changes = Object.entries(wanted).filter(([key, value]) => transform[key as keyof Transform] !== value);
        if (changes.length) {
          await client.call('SetSceneItemTransform', {
            sceneName: scene,
            sceneItemId: item.sceneItemId,
            sceneItemTransform: {
              ...Object.fromEntries(changes),
              boundsWidth: transform.width,
              boundsHeight: transform.height,
            },
          });
          console.log(
            `TRANSFORM ${scene} / ${source}: ${changes.map(([key, value]) => `${key}=${String(value)}`).join(', ')}`,
          );
        }
      }

      await ensureFilter(scene, moveFilterName(source), MOVE_SOURCE_FILTER_KIND, {
        source,
        transform: kind !== 'layout',
        ...moveTiming,
      });

      // The Opacity filter stays enabled: it is the fade itself. The Move Value filter animates it. Standby text
      // never fades, it slides behind the text scene's crop.
      if (kind !== 'text') {
        await ensureFilter(source, OPACITY_FILTER_NAME, COLOR_FILTER_KIND, { opacity: 1 }, true);
        await ensureFilter(source, OPACITY_MOVE_FILTER_NAME, MOVE_VALUE_FILTER_KIND, {
          move_value_type: MOVE_VALUE_TYPE_SINGLE_SETTING,
          filter: OPACITY_FILTER_NAME,
          setting_name: 'opacity',
          value_type: MOVE_VALUE_FLOAT,
          setting_float: 1,
          ...moveTiming,
        });
      }

      if (kind === 'border') {
        const { width, height } = (await client.call('GetInputSettings', { inputName: source })).inputSettings as {
          width: number;
          height: number;
        };
        for (const [filterName, settingName, value] of [
          [WIDTH_FILTER_NAME, 'width', width],
          [HEIGHT_FILTER_NAME, 'height', height],
        ] as const) {
          await ensureFilter(source, filterName, MOVE_VALUE_FILTER_KIND, {
            move_value_type: MOVE_VALUE_TYPE_SINGLE_SETTING,
            filter: '',
            setting_name: settingName,
            value_type: MOVE_VALUE_INT,
            setting_int: value,
            ...moveTiming,
          });
        }
      }
    }

    if (config.standby) {
      // The text scene shows nothing left of the line's middle, so text slides out from behind the line. Cropping a
      // scene item moves what is left of it to the item's position, so the item sits at the cut too.
      const { textScene, lineHeight } = config.standby;
      const { cut } = standbyLine(config, lineHeight);
      const item = itemsByScene.get(config.container)?.find((candidate) => candidate.sourceName === textScene);
      if (item) {
        await client.call('SetSceneItemTransform', {
          sceneName: config.container,
          sceneItemId: item.sceneItemId,
          sceneItemTransform: { positionX: cut, positionY: 0, alignment: 5, cropLeft: cut },
        });
        console.log(`TRANSFORM ${config.container} / ${textScene}: cropLeft=${String(cut)}, positionX=${String(cut)}`);
      } else {
        console.log(`SKIP    ${config.container} has no item "${textScene}"`);
      }
    }
    console.log('done');
  } finally {
    client.close();
  }
};
