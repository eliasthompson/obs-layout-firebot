import { LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { ConfigProblem, ObsInventory } from '@/types/ObsInventory';
import type { CanvasScenesConfig, LayoutRegionName, ScenesConfig } from '@/types/ScenesConfig';

import {
  COLOR_MOVE_FILTER_NAME,
  HEIGHT_FILTER_NAME,
  OPACITY_FILTER_NAME,
  OPACITY_MOVE_FILTER_NAME,
  WIDTH_FILTER_NAME,
} from '@/constants/filterNames';
import { listBindings } from '@/lib/listBindings';
import { listOverlays } from '@/lib/listOverlays';
import { moveFilterName } from '@/lib/moveFilterName';
import { resolveBorderColor } from '@/lib/resolveBorderColor';
import { resolveCanvas } from '@/lib/resolveCanvasConfig';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';
import { sizesFont } from '@/lib/sizesFont';

const SETUP_HINT = 'run `obs-layout-firebot obs:deploy`';

/**
 * Everything in a canvas's config that would make a preset fail or misbehave, checked against what OBS has on that
 * canvas: missing scenes, items, and filters are errors; a text option on a source that is not text is a warning.
 * `findSceneProblems` checks the scenes and modifiers, which every canvas shares.
 */
export const findConfigProblems = (config: CanvasScenesConfig, inventory: ObsInventory): ConfigProblem[] => {
  const problems: ConfigProblem[] = [];
  const error = (message: string) => problems.push({ severity: 'error', message });
  const warning = (message: string) => problems.push({ severity: 'warning', message });
  // Record lookups are typed as always present, so presence is checked with `in` first
  const hasScene = (scene: string) => scene in inventory.sceneItems;
  const hasItem = (scene: string, source: string) => hasScene(scene) && inventory.sceneItems[scene].includes(source);
  const hasFilter = (source: string, filterName: string) =>
    source in inventory.filters && inventory.filters[source].includes(filterName);
  const inputKind = (source: string) => (source in inventory.inputKinds ? inventory.inputKinds[source] : undefined);

  if (!hasScene(config.container)) error(`container scene "${config.container}" does not exist in OBS`);

  for (const [layout, entry] of Object.entries(config.participants)) {
    if (!hasScene(layout)) {
      error(`layout scene "${layout}" does not exist in OBS`);
      continue;
    }
    if (hasScene(config.container) && !hasItem(config.container, layout)) {
      error(`layout scene "${layout}" is not an item of the container "${config.container}"`);
    }
    for (const [region, binding] of Object.entries(entry.sources)) {
      for (const source of [binding.source, ...(binding.border ? [binding.border] : [])]) {
        if (!hasItem(layout, source)) error(`"${layout}" has no item "${source}" (${region})`);
      }
      const kind = inputKind(binding.source);
      const settings = resolveRegionSettings(config, entry, region as LayoutRegionName);
      if (sizesFont(settings) && kind !== undefined && !kind.startsWith('text_')) {
        warning(`"${binding.source}" (${region}) has font sizes but is a ${kind}, not a text source`);
      }
    }
  }

  if (Object.values(config.scenes).some((scene) => scene.standby)) {
    if (config.standby) {
      const { textScene } = config.standby;
      const regionBorder = config.options?.regionBorder ?? LAYOUT_OPTIONS_DEFAULT.regionBorder;
      if (regionBorder <= 0) {
        error(
          `the standby line is two borders wide, so options.regionBorder (${String(regionBorder)}) must be above 0`,
        );
      }
      if (!hasScene(textScene)) error(`standby text scene "${textScene}" does not exist in OBS`);
      else if (hasScene(config.container)) {
        // Items are listed bottom to top
        const items = inventory.sceneItems[config.container];
        const textIndex = items.indexOf(textScene);
        const below = Object.keys(config.participants).filter((layout) => {
          const index = items.indexOf(layout);
          return index !== -1 && index < textIndex;
        });
        if (textIndex === -1) {
          error(`standby text scene "${textScene}" is not an item of the container "${config.container}"`);
        } else if (below.length) {
          warning(
            `standby text scene "${textScene}" sits above ${below.map((layout) => `"${layout}"`).join(', ')} in "${config.container}"; move it below so the line covers the text as it slides out`,
          );
        }
      }
    } else {
      error('scenes use standby, but the config has no standby settings (textScene, lineLength)');
    }
    for (const { binding } of listOverlays(config)) {
      if (hasScene(binding.scene) && !hasItem(binding.scene, binding.source)) {
        error(`"${binding.scene}" has no item "${binding.source}" (standby ${binding.kind})`);
      }
    }
  }

  // The border color filter is the user's own; setup only adds the Move Value filter that fades it
  const borderColor = resolveBorderColor(config);
  const bindings = listBindings(config).filter(({ scene, source }) => hasScene(scene) && hasItem(scene, source));
  const missingColorFilters = bindings.flatMap(({ source, kind }) =>
    borderColor && kind === 'border' && !hasFilter(source, borderColor.filter) ? [`"${source}"`] : [],
  );
  if (borderColor && missingColorFilters.length) {
    error(
      `borderColor.filter "${borderColor.filter}" is missing on ${missingColorFilters.join(', ')}; add it in OBS or change borderColor`,
    );
  }

  const missingFilters = bindings.flatMap(({ scene, source, kind }) => {
    const wanted = [
      [scene, moveFilterName(source)],
      // Standby text never fades
      ...(kind === 'text'
        ? []
        : [
            [source, OPACITY_FILTER_NAME],
            [source, OPACITY_MOVE_FILTER_NAME],
          ]),
      ...(kind === 'border'
        ? [
            [source, WIDTH_FILTER_NAME],
            [source, HEIGHT_FILTER_NAME],
            ...(borderColor && hasFilter(source, borderColor.filter) ? [[source, COLOR_MOVE_FILTER_NAME]] : []),
          ]
        : []),
    ];
    return wanted
      .filter(([on, filterName]) => !hasFilter(on, filterName))
      .map(([on, filterName]) => `"${filterName}" on "${on}"`);
  });
  if (missingFilters.length) error(`missing filters, ${SETUP_HINT}: ${missingFilters.join(', ')}`);

  return problems;
};

/**
 * Everything in the scenes and modifiers every canvas shares that would make a preset fail: a scene that shows no
 * participants or no canvas, a forced modifier or a modifier participant that does not exist. A scene a canvas leaves
 * out because the canvas lacks what it shows is a warning, since it may be on purpose; the scene's
 * `canvases: { <canvas>: false }` says so.
 */
export const findSceneProblems = (config: ScenesConfig): ConfigProblem[] => {
  const problems: ConfigProblem[] = [];
  const error = (message: string) => problems.push({ severity: 'error', message });
  const warning = (message: string) => problems.push({ severity: 'warning', message });
  const canvases = Object.keys(config.canvases).map((canvas) => ({ canvas, ...resolveCanvas(config, canvas) }));
  // Modifiers name participants by key; the canvases' views key them by their OBS scenes
  const layouts = new Set(Object.values(config.canvases).flatMap(({ participants }) => Object.keys(participants)));
  const modifierNames = Object.keys(config.modifiers ?? {});

  for (const [name, modifier] of Object.entries(config.modifiers ?? {})) {
    for (const layout of modifier.participants ?? []) {
      if (!layouts.has(layout)) error(`modifier "${name}" names participant "${layout}", which no canvas has`);
    }
  }

  for (const [sceneKey, scene] of Object.entries(config.scenes)) {
    // A standby scene without participants collapses everyone; a layout scene has to show someone
    if (!scene.standby && !scene.participants?.length) error(`scene "${sceneKey}" shows no participants`);
    for (const name of Object.keys(scene.modifiers ?? {})) {
      if (!modifierNames.includes(name)) error(`scene "${sceneKey}" forces unknown modifier "${name}"`);
    }
    const leftOut = canvases.filter(({ leftOut: left }) => Object.hasOwn(left, sceneKey));
    if (leftOut.length === canvases.length) {
      const reasons = leftOut.map(
        ({ canvas, leftOut: left }) => `${canvas}: ${left[sceneKey] ?? 'the scene leaves it out'}`,
      );
      error(`scene "${sceneKey}" shows on no canvas (${reasons.join('; ')})`);
      continue;
    }
    for (const { canvas, leftOut: left } of leftOut) {
      const reason = left[sceneKey];
      if (reason !== null) {
        warning(
          `scene "${sceneKey}" is left out of the "${canvas}" canvas, because ${reason}; set its canvases: { ${canvas}: false } if that is on purpose`,
        );
      }
    }
  }

  return problems;
};
