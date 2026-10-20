import type { Rect } from '@/types/Rect';

/** `text` items slide out from behind the standby line without fading; `widget` items fade in place. */
export type BindingKind = 'border' | 'layout' | 'source' | 'text' | 'widget';

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
  region: Rect | undefined;
  /** Border only: target width and height of the color source itself. */
  size: SourceSize | undefined;
  /** Text sources with a `fontScale`: the font size to set for the target height. */
  fontSize?: number;
  visible: boolean;
  duration: number;
  /** Milliseconds the move waits before starting, so a later stage starts when an earlier one ends. */
  delay: number;
  /** Shown or hidden in one frame before any move starts, to hand the standby line from one border to another. */
  handoff?: Handoff;
}

export interface Handoff {
  /** The item's id in `scene`, which SetSceneItemEnabled needs. */
  sceneItemId: number;
  visible: boolean;
}
