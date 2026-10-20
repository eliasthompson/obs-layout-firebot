import type { LayoutRegion } from '@eliasthompson/obs-layout-generator';

/** A rectangle in canvas pixels: a layout region without its border flag, as items are moved and configs place overlays. */
export type Rect = Pick<LayoutRegion, 'height' | 'width' | 'x' | 'y'>;
