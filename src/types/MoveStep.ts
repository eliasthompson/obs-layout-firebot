import type { LayoutRegion } from '@eliasthompson/obs-layout-generator';

export type BindingKind = 'border' | 'layout' | 'source';

export interface Binding {
  /** OBS scene that contains the item. */
  scene: string;
  /** OBS source name of the item. */
  source: string;
  kind: BindingKind;
  /** OBS alignment flags for the item's bounds alignment, when the config sets one. */
  boundsAlignment?: number;
}

export interface SourceSize {
  width: number;
  height: number;
}

export interface MoveStep extends Binding {
  /** Name of the Move Source filter on `scene`. */
  filterName: string;
  /** Target rectangle of the scene item, or `undefined` for layout items, which only fade and toggle. */
  region: LayoutRegion | undefined;
  /** Border only: target width and height of the color source itself. */
  size: SourceSize | undefined;
  /** Text sources with a `fontScale`: the font size to set for the target height. */
  fontSize?: number;
  visible: boolean;
  duration: number;
}
