import type { LayoutConfig, LayoutMetric, LayoutOptions } from '@eliasthompson/obs-layout-generator';

import type { ObsAlignment } from '@/constants/obsAlignment';
import type { Rect } from '@/types/Rect';

export type LayoutRegionName = keyof LayoutMetric;

export interface SourceBinding {
  /** OBS source name of the scene item that fills the region. */
  source: string;
  /** OBS source name of a color source drawn as the region's border, sized by `regionBorder` and `borderPadding`. */
  border?: string;
  /** Pixels the source sits inside its region on every side, as padding within the border. The border is unaffected. */
  inset?: number;
  /** Where the source sits inside its bounds when it does not fill them, as OBS names it. Left alone when omitted. */
  boundsAlignment?: ObsAlignment;
  /** Text sources only: font size as a fraction of the source's own height (after the inset), set on every move. */
  fontScale?: number;
  /** The font stays at this size while the text fits, and only sizes down when the region is too short for it. */
  fontSizeMax?: number;
  /** How far the font may size down. With an inset, the layout's smallest name height is inset × 2 + fontSizeMin. */
  fontSizeMin?: number;
}

export interface ParticipantPoolEntry {
  sources: Partial<Record<LayoutRegionName, SourceBinding>>;
}

export interface SceneParticipant {
  /** Key in `participants`: the OBS scene that holds this participant's items, nested in the container. */
  layout: string;
  /**
   * The participant's regions, as obs-layout-generator takes them: a region config or `null` per region, and
   * `hasName`. A green screen camera (`camera.isGreenScreen`) has no border; its border source still follows the
   * camera as if it framed it, but fades out, and fades back in with the next layout that frames the camera.
   */
  config?: LayoutConfig;
}

export interface OverlayBinding {
  /** OBS source name of the item. */
  source: string;
  /** Where the item sits while shown, in canvas pixels. */
  region: Rect;
  /** Where the source sits inside its bounds when it does not fill them, as OBS names it. Left alone when omitted. */
  boundsAlignment?: ObsAlignment;
}

export interface StandbyBinding {
  /**
   * An item of the standby text scene that slides out from behind the line. Its region is the bounding box, which the
   * text covers from the left, centered vertically, so text wider than the box runs past its right edge.
   */
  text?: Omit<OverlayBinding, 'boundsAlignment'>;
  /** Items of the container that fade in at their regions while the text slides out. */
  widgets?: OverlayBinding[];
}

export interface SceneBinding {
  participants: SceneParticipant[];
  options?: LayoutOptions;
  /** Move duration in milliseconds. */
  duration?: number;
  /** Collapse the participants' regions into the standby line instead of laying them out, and show these overlays. */
  standby?: StandbyBinding;
}

export interface StandbySettings {
  /** Scene in the container, below the participant layouts, that holds every standby text and hides what is left of the line. */
  textScene: string;
  /** Height of the line in pixels. Its width is the border ring on both sides: 2 × (regionBorder − borderPadding). */
  lineHeight: number;
}

export interface ObsConnection {
  url: string;
  password: string;
}

export interface ObsSettings extends Partial<ObsConnection> {
  /** Tools only: the scene collection `obs:deploy` edits when OBS cannot say which one is active. Default "Untitled". */
  sceneCollection?: string;
  /** Tools only: the OBS program, for `obs:restart` where the default install location does not apply. */
  executable?: string;
}

/**
 * The filter on every border color source that carries the border color, so another program can recolor the borders
 * by writing that setting, and fade them through the `Move: Color` filter `obs:deploy` creates for it.
 */
export interface BorderColorSettings {
  /** Filter name on each border, such as the Stroke filter of obs-stroke-glow-shadow. */
  filter: string;
  /** The filter's color setting. Default "stroke_fill_color", the Stroke filter's. */
  setting?: string;
  /** Milliseconds a color change fades over. Default 500. */
  duration?: number;
}

/** Where the tools find Firebot. The script itself runs inside Firebot and ignores these. */
export interface FirebotSettings {
  /** Profile the tools install into and read the OBS integration from. Default "Main". */
  profile?: string;
  /** Firebot's local HTTP API. Default "http://localhost:7472/api/v1". */
  apiUrl?: string;
  /** Custom variable that holds this config, written by `deploy` and read by the presets. Default "layoutScenes". */
  variable?: string;
  /** Firebot executable, for `restart-firebot` where the default install location does not apply. */
  executable?: string;
}

export interface ScenesConfig {
  /** OBS scene that contains every participant layout scene as an item. */
  container: string;
  options?: LayoutOptions;
  /** Pixels the border sources' filters add on every side; the color source is shrunk by this much. */
  borderPadding?: number;
  /** The filter that colors the borders, when something else drives their color. */
  borderColor?: BorderColorSettings;
  /** Move duration in milliseconds, used by scenes that do not set their own. */
  duration?: number;
  /** Every layout scene the installation knows, with its bound sources. */
  participants: Record<string, ParticipantPoolEntry>;
  /** Compositions by scene key, each listing the participants it shows in layout order. */
  scenes: Record<string, SceneBinding>;
  /** Needed by scenes with a `standby` entry. */
  standby?: StandbySettings;
  /** Overrides Firebot's OBS integration settings. */
  obs?: ObsSettings;
  firebot?: FirebotSettings;
}
