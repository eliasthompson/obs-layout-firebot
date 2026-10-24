import type { Binding } from '@/types/MoveStep';
import type { CanvasScenesConfig, LayoutRegionName } from '@/types/ScenesConfig';

import { OBS_ALIGNMENT_FLAGS, OBS_BOUNDS_TYPES } from '@/constants/obsAlignment';
import { listOverlays } from '@/lib/listOverlays';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';

/**
 * Every scene whose items a canvas's layout drives: the container, the standby text scene, and every layout scene.
 *
 * @param config - The canvas's view of the config.
 * @returns The scene names, once each.
 */
export const listScenes = (config: CanvasScenesConfig): string[] => [
  ...new Set([
    config.container,
    ...(config.standby ? [config.standby.textScene] : []),
    ...Object.keys(config.participants),
  ]),
];

/**
 * Every item an installation needs filters for: layout items in the container, then each layout's sources and
 * borders, then the standby texts and widgets.
 */
export const listBindings = (config: CanvasScenesConfig): Binding[] => [
  ...Object.entries(config.participants).flatMap(([layout, entry]) => [
    { scene: config.container, source: layout, kind: 'layout' as const },
    ...Object.entries(entry.sources).flatMap(([region, binding]): Binding[] => {
      // The bounds settings are set up once per item, so they come from the config and the participant, never a scene
      const { boundsAlignment, boundsType, cropToBounds } = resolveRegionSettings(
        config,
        entry,
        region as LayoutRegionName,
      );
      return [
        {
          scene: layout,
          source: binding.source,
          kind: 'source',
          ...(boundsAlignment ? { boundsAlignment: OBS_ALIGNMENT_FLAGS[boundsAlignment] } : {}),
          ...(boundsType ? { boundsType: OBS_BOUNDS_TYPES[boundsType] } : {}),
          ...(cropToBounds === undefined ? {} : { cropToBounds }),
        },
        ...(binding.border ? [{ scene: layout, source: binding.border, kind: 'border' as const }] : []),
      ];
    }),
  ]),
  ...listOverlays(config).map((overlay) => overlay.binding),
];
