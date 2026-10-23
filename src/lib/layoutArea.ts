import { LAYOUT_OPTIONS_DEFAULT, type LayoutOptions } from '@eliasthompson/obs-layout-generator';

import type { Rect } from '@/types/Rect';

/**
 * The layout area, the canvas less its margins, as obs-layout-generator lays out inside it. Its padding and region
 * borders are even on every side, so the content area shares its center.
 *
 * @param options - The canvas options, over the library defaults.
 * @returns The layout area in canvas pixels.
 */
export const layoutArea = (options: LayoutOptions | undefined): Rect => {
  const option = <Name extends keyof typeof LAYOUT_OPTIONS_DEFAULT>(name: Name) =>
    options?.[name] ?? LAYOUT_OPTIONS_DEFAULT[name];
  const x = option('canvasMarginLeft');
  const y = option('canvasMarginTop');

  return {
    x,
    y,
    width: option('canvasWidth') - x - option('canvasMarginRight'),
    height: option('canvasHeight') - y - option('canvasMarginBottom'),
  };
};
