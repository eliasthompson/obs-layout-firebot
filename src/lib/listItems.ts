import type { ItemBinding } from '@/types/ItemToggle';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

/**
 * Every item scenes and modifiers toggle on a canvas, with the OBS scene or group that holds it, its source, and
 * whether it shows by default.
 *
 * @param config - The canvas's view of the config.
 * @returns The items, in the order `items` lists them.
 */
export const listItems = (config: Pick<CanvasScenesConfig, 'container' | 'items'>): ItemBinding[] =>
  Object.entries(config.items ?? {}).map(([key, { source = key, scene = config.container, visible }]) => ({
    key,
    scene,
    source,
    visible,
  }));

/**
 * The OBS scenes and groups that hold a canvas's toggled items, once each.
 *
 * @param config - The canvas's view of the config.
 */
export const listItemScenes = (config: Pick<CanvasScenesConfig, 'container' | 'items'>): string[] => [
  ...new Set(listItems(config).map((item) => item.scene)),
];
