// The OBS setup `obs:deploy` runs over the websocket. For every bound item it creates, disabled, the filters the
// script drives, and gives region items a bounds type a rectangle can size. Borders render at native size (no
// bounds) and get Move Value filters for their own width and height, plus, with a `borderColor` config, a Move Value
// filter that fades their color filter's setting. Every toggled source but standby text gets an Opacity color filter
// plus the Move Value filter that animates it, and the standby text scene is cropped at the canvas center. Move
// Source filters on the managed scenes that no longer match a bound item (renamed or removed sources) are deleted.
// Idempotent: existing filters are updated only where they differ, never duplicated.
import type { ObsClient } from '@/lib/connectObs';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import {
  COLOR_MOVE_FILTER_NAME,
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
import { containsValues } from '@/lib/containsValues';
import { colorMoveFilterSettings } from '@/lib/filterSettings';
import { listBindings } from '@/lib/listBindings';
import { moveFilterName } from '@/lib/moveFilterName';
import { resolveBorderColor } from '@/lib/resolveBorderColor';
import { standbyLine } from '@/lib/standbyLine';

interface SceneItem {
  sceneItemId: number;
  sourceName: string;
}

interface Filter {
  filterName: string;
  filterKind: string;
  filterEnabled: boolean;
  filterSettings: Record<string, unknown>;
}

interface Transform {
  boundsType: string;
  alignment: number;
  boundsAlignment: number;
  width: number;
  height: number;
}

/** The color the Move: Color filter is created with when the border's color filter does not report one: white. */
const DEFAULT_COLOR = 0xffffffff;

const moveTiming = { custom_duration: true, enabled_match_moving: true };

export interface SetupOptions {
  /** Report every change without making it. */
  dryRun: boolean;
  /** A prefix naming the canvas in the output. */
  label?: string;
}

/** Set OBS up for the config over an open connection. Returns how many changes were made, or would be made. */
export const runSetup = async (client: ObsClient, config: CanvasScenesConfig, { dryRun, label = '' }: SetupOptions) => {
  const bindings = listBindings(config);
  const borderColor = resolveBorderColor(config);
  const would = dryRun ? 'WOULD ' : '';
  let changes = 0;

  const filtersOf = async (sourceName: string) =>
    (await client.call('GetSourceFilterList', { sourceName })).filters as Filter[];

  /**
   * Create or update a filter and set its enabled state, leaving one that already matches alone. `initial` holds the
   * values the transitions keep rewriting, such as an opacity: set when the filter is created, and never reset, so a
   * hidden item stays faded out. Returns false when another kind of filter has the name.
   */
  const ensureFilter = async (
    sourceName: string,
    filterName: string,
    filterKind: string,
    filterSettings: Record<string, unknown>,
    enabled = false,
    initial: Record<string, unknown> = {},
  ) => {
    const existing = (await filtersOf(sourceName)).find((filter) => filter.filterName === filterName);
    if (existing && existing.filterKind !== filterKind) {
      console.log(`SKIP    ${label}${sourceName} / ${filterName} exists but is a ${existing.filterKind}`);
      return false;
    }
    if (existing?.filterEnabled === enabled && containsValues(filterSettings, existing.filterSettings)) return true;
    changes += 1;
    console.log(`${would}${existing ? 'UPDATE' : 'CREATE'}  ${label}${sourceName} / ${filterName}`);
    if (dryRun) return true;
    if (existing) {
      await client.call('SetSourceFilterSettings', { sourceName, filterName, filterSettings, overlay: true });
    } else {
      await client.call('CreateSourceFilter', {
        sourceName,
        filterName,
        filterKind,
        filterSettings: { ...initial, ...filterSettings },
      });
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
        changes += 1;
        console.log(`${would}REMOVE  ${label}${scene} / ${filter.filterName} (no bound item)`);
        if (!dryRun) await client.call('RemoveSourceFilter', { sourceName: scene, filterName: filter.filterName });
      }
    }
  };

  const setTransform = async (scene: string, sceneItemId: number, sceneItemTransform: Record<string, unknown>) => {
    changes += 1;
    if (!dryRun) await client.call('SetSceneItemTransform', { sceneName: scene, sceneItemId, sceneItemTransform });
  };

  const itemsByScene = new Map<string, SceneItem[]>();
  for (const { scene } of bindings) {
    if (!itemsByScene.has(scene)) {
      itemsByScene.set(scene, (await client.call('GetSceneItemList', { sceneName: scene })).sceneItems as SceneItem[]);
      await pruneMoveFilters(scene);
    }
  }

  for (const { scene, source, kind, boundsAlignment } of bindings) {
    const item = itemsByScene.get(scene)?.find((candidate) => candidate.sourceName === source);
    if (!item) {
      console.log(`SKIP    ${label}${scene} has no item "${source}"`);
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
      const transformChanges = Object.entries(wanted).filter(
        ([key, value]) => transform[key as keyof Transform] !== value,
      );
      if (transformChanges.length) {
        console.log(
          `${would}TRANSFORM ${label}${scene} / ${source}: ${transformChanges.map(([key, value]) => `${key}=${String(value)}`).join(', ')}`,
        );
        await setTransform(scene, item.sceneItemId, {
          ...Object.fromEntries(transformChanges),
          boundsWidth: transform.width,
          boundsHeight: transform.height,
        });
      }
    }

    await ensureFilter(scene, moveFilterName(source), MOVE_SOURCE_FILTER_KIND, {
      source,
      transform: kind !== 'layout',
      ...moveTiming,
    });

    // The Opacity filter stays enabled: it is the fade itself. The Move Value filter animates it. Standby text never
    // fades, it slides behind the text scene's crop.
    if (kind !== 'text') {
      await ensureFilter(source, OPACITY_FILTER_NAME, COLOR_FILTER_KIND, {}, true, { opacity: 1 });
      await ensureFilter(
        source,
        OPACITY_MOVE_FILTER_NAME,
        MOVE_VALUE_FILTER_KIND,
        {
          move_value_type: MOVE_VALUE_TYPE_SINGLE_SETTING,
          filter: OPACITY_FILTER_NAME,
          setting_name: 'opacity',
          value_type: MOVE_VALUE_FLOAT,
          ...moveTiming,
        },
        false,
        { setting_float: 1 },
      );
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
        await ensureFilter(
          source,
          filterName,
          MOVE_VALUE_FILTER_KIND,
          {
            move_value_type: MOVE_VALUE_TYPE_SINGLE_SETTING,
            filter: '',
            setting_name: settingName,
            value_type: MOVE_VALUE_INT,
            ...moveTiming,
          },
          false,
          { setting_int: value },
        );
      }

      // The color filter is the user's own; the Move: Color filter starts at the color it has now
      if (borderColor) {
        const hasColorFilter = (await filtersOf(source)).some((filter) => filter.filterName === borderColor.filter);
        if (!hasColorFilter) {
          console.log(`SKIP    ${label}${source} has no "${borderColor.filter}" filter to color (borderColor.filter)`);
        } else {
          const settings = (
            await client.call('GetSourceFilter', { sourceName: source, filterName: borderColor.filter })
          ).filterSettings as Record<string, unknown>;
          const color = settings[borderColor.setting];
          // The target color is whatever the last recolor wrote, so only a new filter gets one
          const { setting_color, ...colorMove } = colorMoveFilterSettings(
            borderColor,
            typeof color === 'number' ? color : DEFAULT_COLOR,
          );
          await ensureFilter(source, COLOR_MOVE_FILTER_NAME, MOVE_VALUE_FILTER_KIND, colorMove, false, {
            setting_color,
          });
        }
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
      const transform = (
        await client.call('GetSceneItemTransform', { sceneName: config.container, sceneItemId: item.sceneItemId })
      ).sceneItemTransform as Record<string, unknown>;
      const wanted = { positionX: cut, positionY: 0, alignment: 5, cropLeft: cut };
      const transformChanges = Object.entries(wanted).filter(([key, value]) => transform[key] !== value);
      if (transformChanges.length) {
        console.log(
          `${would}TRANSFORM ${label}${config.container} / ${textScene}: ${transformChanges.map(([key, value]) => `${key}=${String(value)}`).join(', ')}`,
        );
        await setTransform(config.container, item.sceneItemId, Object.fromEntries(transformChanges));
      }
    } else {
      console.log(`SKIP    ${label}${config.container} has no item "${textScene}"`);
    }
  }

  return changes;
};
