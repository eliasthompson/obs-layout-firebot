import type { ItemToggle } from '@/types/ItemToggle';
import type { ObsSceneItem, ObsState } from '@/types/ObsState';
import type { CanvasScenesConfig, SceneBinding } from '@/types/ScenesConfig';

import { listItems } from '@/lib/listItems';
import { resolveModifiers } from '@/lib/resolveModifiers';

/**
 * The toggles that bring a canvas's items to what a scene shows. Whether an item shows is its default, then what the
 * scene says, then each modifier in effect in the config's order, the last that names it winning. Items already as
 * wanted are left out, and so are items OBS did not report, which `firebot:deploy` reports as missing.
 *
 * @param state - What OBS shows now, from `readObsState`.
 * @param modifiers - Names of the modifiers switched on.
 */
export const planItemToggles = (
  config: CanvasScenesConfig,
  sceneKey: string,
  state: ObsState,
  modifiers: readonly string[] = [],
): ItemToggle[] => {
  // Record lookups are typed as always present; the key comes from user input
  const scene = config.scenes[sceneKey] as SceneBinding | undefined;
  if (!scene) {
    throw new Error(
      `No scene "${sceneKey}" in the layout config. Known scenes: ${Object.keys(config.scenes).join(', ')}`,
    );
  }
  const layers = [
    scene.items,
    ...resolveModifiers(config, scene, modifiers).map((name) => config.modifiers?.[name].items),
  ];

  return listItems(config).flatMap(({ key, scene: sceneName, source, visible: shownByDefault }) => {
    const visible = layers.reduce((shown, items) => items?.[key] ?? shown, shownByDefault);
    // Record lookups are typed as always present; a scene OBS could not report is missing
    const item = (state.sceneItems[sceneName] as ObsSceneItem[] | undefined)?.find(
      (candidate) => candidate.sourceName === source,
    );
    return item && item.sceneItemEnabled !== visible
      ? [{ scene: sceneName, source, sceneItemId: item.sceneItemId, visible }]
      : [];
  });
};
