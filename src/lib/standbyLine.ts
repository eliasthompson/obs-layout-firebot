import { LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { SourceSize } from '@/types/MoveStep';
import type { Rect } from '@/types/Rect';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import { growRegion } from '@/lib/growRegion';
import { layoutArea } from '@/lib/layoutArea';

export interface StandbyLine {
  /** Whether the line runs across the canvas, as on a portrait canvas, rather than up it. */
  isHorizontal: boolean;
  /** Where every region's content collapses to: no width (or height) at the line, as long as the line's inside. */
  content: Rect;
  /** Where a collapsed region's border item sits: its border box, grown by the border padding. */
  border: Rect;
  /** A collapsed border's color source: the line itself, two borders thick. */
  size: SourceSize;
  /**
   * Where the standby text slides out from: the middle of the line, where the text scene is cropped. A canvas x for an
   * upright line, which the text shows right of; a canvas y for one across, which the text shows above.
   */
  cut: number;
  /** The text scene item's position and crop, so it shows nothing on the hidden side of the cut. */
  textScene: { positionX: number; positionY: number; cropLeft: number; cropBottom: number };
}

/**
 * The standby line every region collapses into, centered on the layout area, the canvas less its margins: up the
 * middle of a landscape canvas, across the middle of a portrait one, which obs-layout-generator's `orientation` option
 * decides as the layout does. A border's color source is its content grown by `regionBorder` on every side, so
 * content with no width leaves a color source of exactly two borders, and an inner stroke at least a border wide
 * fills it from both sides. Uses the config's options, not a scene's, because the text scene's crop is set up once for
 * the whole canvas.
 */
export const standbyLine = (config: CanvasScenesConfig, lineLength: number): StandbyLine => {
  const canvasHeight = config.options?.canvasHeight ?? LAYOUT_OPTIONS_DEFAULT.canvasHeight;
  const regionBorder = config.options?.regionBorder ?? LAYOUT_OPTIONS_DEFAULT.regionBorder;
  const orientation = config.options?.orientation ?? LAYOUT_OPTIONS_DEFAULT.orientation;
  const area = layoutArea(config.options);
  // The padding and borders inside the layout area are even on every side, so they never change which way it is longer
  const isHorizontal = orientation === 'portrait' || (orientation !== 'landscape' && area.height > area.width);
  const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  const cut = Math.round(isHorizontal ? center.y : center.x);
  const along = Math.round((isHorizontal ? center.x : center.y) - lineLength / 2) + regionBorder;
  const content = isHorizontal
    ? { x: along, y: cut, width: lineLength - regionBorder * 2, height: 0 }
    : { x: cut, y: along, width: 0, height: lineLength - regionBorder * 2 };
  const border = growRegion(growRegion(content, regionBorder), config.borderPadding ?? 0);

  return {
    isHorizontal,
    content,
    border,
    size: isHorizontal
      ? { width: lineLength, height: regionBorder * 2 }
      : { width: regionBorder * 2, height: lineLength },
    cut,
    // Cropping a scene item's left moves what is left of it to the item's position, so the item sits at the cut too
    textScene: isHorizontal
      ? { positionX: 0, positionY: 0, cropLeft: 0, cropBottom: canvasHeight - cut }
      : { positionX: cut, positionY: 0, cropLeft: cut, cropBottom: 0 },
  };
};
