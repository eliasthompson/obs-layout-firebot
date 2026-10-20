import type { Rect } from '@/types/Rect';

/** Grow a region by the border width on every side: the border box obs-layout-generator describes. */
export const growRegion = (region: Rect, border: number): Rect => ({
  x: region.x - border,
  y: region.y - border,
  width: region.width + border * 2,
  height: region.height + border * 2,
});

/** Shrink a region by an inset on every side, never below 1x1. */
export const shrinkRegion = (region: Rect, inset: number): Rect => ({
  x: region.x + inset,
  y: region.y + inset,
  width: Math.max(1, region.width - inset * 2),
  height: Math.max(1, region.height - inset * 2),
});
