import { LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { SourceSize } from '@/types/MoveStep';
import type { Rect } from '@/types/Rect';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import { growRegion } from '@/lib/growRegion';

export interface StandbyLine {
  /** Where every region's content collapses to: no width, centered on the canvas, as tall as the line's inside. */
  content: Rect;
  /** Where a collapsed region's border item sits: its border box, grown by the border padding. */
  border: Rect;
  /** A collapsed border's color source: the line itself, two borders wide. */
  size: SourceSize;
  /** Canvas x the standby text slides out from: the middle of the line, where the text scene is cropped. */
  cut: number;
}

/**
 * The standby line every region collapses into. A border's color source is its content grown by `regionBorder` on
 * every side, so content with no width leaves a color source of exactly two borders, and an inner stroke at least a
 * border wide fills it from both sides. Uses the config's options, not a scene's, because the text scene's crop is set
 * up once for the whole canvas.
 */
export const standbyLine = (config: CanvasScenesConfig, lineHeight: number): StandbyLine => {
  const canvasWidth = config.options?.canvasWidth ?? LAYOUT_OPTIONS_DEFAULT.canvasWidth;
  const canvasHeight = config.options?.canvasHeight ?? LAYOUT_OPTIONS_DEFAULT.canvasHeight;
  const regionBorder = config.options?.regionBorder ?? LAYOUT_OPTIONS_DEFAULT.regionBorder;
  const cut = Math.round(canvasWidth / 2);
  const content = {
    x: cut,
    y: Math.round((canvasHeight - lineHeight) / 2) + regionBorder,
    width: 0,
    height: lineHeight - regionBorder * 2,
  };
  const border = growRegion(growRegion(content, regionBorder), config.borderPadding ?? 0);

  return { content, border, size: { width: regionBorder * 2, height: lineHeight }, cut };
};
