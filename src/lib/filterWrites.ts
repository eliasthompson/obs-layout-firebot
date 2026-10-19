import type { MoveStep } from '@/types/MoveStep';
import type { FilterWrite } from '@/types/ObsRequest';

import { HEIGHT_FILTER_NAME, OPACITY_MOVE_FILTER_NAME, WIDTH_FILTER_NAME } from '@/constants/filterNames';
import {
  intSettingFilterSettings,
  moveFilterSettings,
  opacityMoveFilterSettings,
  visibilityFilterSettings,
} from '@/lib/filterSettings';

/**
 * Every filter a step drives, with the settings to write: its move, its border size, and its fade. Standby text never
 * fades; it slides out of sight behind the text scene's crop.
 */
export const filterWrites = (step: MoveStep): FilterWrite[] => [
  {
    sourceName: step.scene,
    filterName: step.filterName,
    filterSettings: step.region ? moveFilterSettings(step, step.region) : visibilityFilterSettings(step),
  },
  ...(step.size
    ? [
        {
          sourceName: step.source,
          filterName: WIDTH_FILTER_NAME,
          filterSettings: intSettingFilterSettings('width', step.size.width, step.duration, step.delay),
        },
        {
          sourceName: step.source,
          filterName: HEIGHT_FILTER_NAME,
          filterSettings: intSettingFilterSettings('height', step.size.height, step.duration, step.delay),
        },
      ]
    : []),
  ...(step.kind === 'text'
    ? []
    : [
        {
          sourceName: step.source,
          filterName: OPACITY_MOVE_FILTER_NAME,
          filterSettings: opacityMoveFilterSettings(step),
        },
      ]),
];
