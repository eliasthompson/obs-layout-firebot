import type { LayoutRegion } from '@eliasthompson/obs-layout-generator';

import { LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { SourceSize } from '@/types/MoveStep';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { growRegion } from '@/lib/growRegion';

export interface StandbyLine {
  /** Where every region's content collapses to: no width, centered on the canvas, as tall as the line's inside. */
  content: LayoutRegion;
  /** The border box of a collapsed region, where a border item sits. */
  border: LayoutRegion;
  /** A collapsed border's color source: the line itself, two border rings wide. */
  size: SourceSize;
  /** Canvas x the standby text slides out from: the middle of the line, where the text scene is cropped. */
  cut: number;
}

/**
 * The standby line every region collapses into. A border's color source is its content grown by the border ring
 * (`regionBorder` minus `borderPadding`) on every side, so content with no width leaves a color source of exactly two
 * rings, and an inner stroke at least a ring wide fills it from both sides. Uses the config's options, not a scene's,
 * because the text scene's crop is set up once for the whole canvas.
 */
export const standbyLine = (config: ScenesConfig, lineHeight: number): StandbyLine => {
  const canvasWidth = config.options?.canvasWidth ?? LAYOUT_OPTIONS_DEFAULT.canvasWidth;
  const canvasHeight = config.options?.canvasHeight ?? LAYOUT_OPTIONS_DEFAULT.canvasHeight;
  const regionBorder = config.options?.regionBorder ?? LAYOUT_OPTIONS_DEFAULT.regionBorder;
  const ring = regionBorder - (config.borderPadding ?? 0);
  const cut = Math.round(canvasWidth / 2);
  const content = {
    x: cut,
    y: Math.round((canvasHeight - lineHeight) / 2) + ring,
    width: 0,
    height: lineHeight - ring * 2,
  };

  return { content, border: growRegion(content, regionBorder), size: { width: ring * 2, height: lineHeight }, cut };
};
