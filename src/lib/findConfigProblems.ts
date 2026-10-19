import type { ConfigProblem, ObsInventory } from '@/types/ObsInventory';
import type { ScenesConfig } from '@/types/ScenesConfig';

import {
  HEIGHT_FILTER_NAME,
  OPACITY_FILTER_NAME,
  OPACITY_MOVE_FILTER_NAME,
  WIDTH_FILTER_NAME,
} from '@/constants/filterNames';
import { listBindings } from '@/lib/listBindings';
import { moveFilterName } from '@/lib/moveFilterName';

const SETUP_HINT = 'run `obs-layout-firebot setup`';

/**
 * Everything in a config that would make a preset fail or misbehave, checked against what OBS has: missing scenes,
 * items, and filters are errors; a text option on a source that is not text is a warning.
 */
export const findConfigProblems = (config: ScenesConfig, inventory: ObsInventory): ConfigProblem[] => {
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
      if (binding.fontScale !== undefined && kind !== undefined && !kind.startsWith('text_')) {
        warning(`"${binding.source}" (${region}) has a fontScale but is a ${kind}, not a text source`);
      }
    }
  }

  const missingFilters = listBindings(config).flatMap(({ scene, source, kind }) => {
    if (!hasScene(scene) || !hasItem(scene, source)) return [];
    const wanted = [
      [scene, moveFilterName(source)],
      [source, OPACITY_FILTER_NAME],
      [source, OPACITY_MOVE_FILTER_NAME],
      ...(kind === 'border'
        ? [
            [source, WIDTH_FILTER_NAME],
            [source, HEIGHT_FILTER_NAME],
          ]
        : []),
    ];
    return wanted
      .filter(([on, filterName]) => !hasFilter(on, filterName))
      .map(([on, filterName]) => `"${filterName}" on "${on}"`);
  });
  if (missingFilters.length) error(`missing filters, ${SETUP_HINT}: ${missingFilters.join(', ')}`);

  for (const [sceneKey, scene] of Object.entries(config.scenes)) {
    if (!scene.participants.length) warning(`scene "${sceneKey}" shows no participants`);
    for (const { layout } of scene.participants) {
      if (!(layout in config.participants)) error(`scene "${sceneKey}" uses unknown participant "${layout}"`);
    }
  }

  return problems;
};
