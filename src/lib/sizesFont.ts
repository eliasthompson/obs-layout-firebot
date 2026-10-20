import type { RegionSettings } from '@/types/ScenesConfig';

/** Whether a region's font is sized on every move: its settings have a largest or a smallest font size. */
export const sizesFont = (settings: RegionSettings) =>
  settings.fontSizeMax !== undefined || settings.fontSizeMin !== undefined;
