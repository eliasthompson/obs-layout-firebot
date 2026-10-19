import type { Binding } from '@/types/MoveStep';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { OBS_ALIGNMENT_FLAGS } from '@/constants/obsAlignment';

/** Every item an installation needs filters for: layout items in the container, then each layout's sources and borders. */
export const listBindings = (config: ScenesConfig): Binding[] =>
  Object.entries(config.participants).flatMap(([layout, entry]) => [
    { scene: config.container, source: layout, kind: 'layout' as const },
    ...Object.values(entry.sources).flatMap((binding): Binding[] => [
      {
        scene: layout,
        source: binding.source,
        kind: 'source',
        ...(binding.boundsAlignment ? { boundsAlignment: OBS_ALIGNMENT_FLAGS[binding.boundsAlignment] } : {}),
      },
      ...(binding.border ? [{ scene: layout, source: binding.border, kind: 'border' as const }] : []),
    ]),
  ]);
