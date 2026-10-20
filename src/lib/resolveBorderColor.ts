import type { BorderColorSettings, ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_BORDER_COLOR_DURATION, DEFAULT_BORDER_COLOR_SETTING } from '@/constants/filterNames';

export type BorderColor = Required<BorderColorSettings>;

/** The config's border color settings with their defaults filled in, or `undefined` when nothing drives the color. */
export const resolveBorderColor = (config: Pick<ScenesConfig, 'borderColor'>): BorderColor | undefined =>
  config.borderColor
    ? {
        filter: config.borderColor.filter,
        setting: config.borderColor.setting ?? DEFAULT_BORDER_COLOR_SETTING,
        duration: config.borderColor.duration ?? DEFAULT_BORDER_COLOR_DURATION,
      }
    : undefined;
