import type { Binding } from '@/types/MoveStep';
import type { LayoutRegionName, ScenesConfig } from '@/types/ScenesConfig';

import { OBS_ALIGNMENT_FLAGS } from '@/constants/obsAlignment';
import { listOverlays } from '@/lib/listOverlays';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';

/**
 * Every item an installation needs filters for: layout items in the container, then each layout's sources and
 * borders, then the standby texts and widgets.
 */
export const listBindings = (config: ScenesConfig): Binding[] => [
  ...Object.entries(config.participants).flatMap(([layout, entry]) => [
    { scene: config.container, source: layout, kind: 'layout' as const },
    ...Object.entries(entry.sources).flatMap(([region, binding]): Binding[] => {
      // The bounds alignment is set up once per item, so it comes from the config and the participant, never a scene
      const { boundsAlignment } = resolveRegionSettings(config, entry, region as LayoutRegionName);
      return [
        {
          scene: layout,
          source: binding.source,
          kind: 'source',
          ...(boundsAlignment ? { boundsAlignment: OBS_ALIGNMENT_FLAGS[boundsAlignment] } : {}),
        },
        ...(binding.border ? [{ scene: layout, source: binding.border, kind: 'border' as const }] : []),
      ];
    }),
  ]),
  ...listOverlays(config).map((overlay) => overlay.binding),
];
