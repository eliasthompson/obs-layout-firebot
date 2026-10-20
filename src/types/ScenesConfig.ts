import type { LayoutConfig, LayoutMetric, LayoutOptions } from '@eliasthompson/obs-layout-generator';

import type { ObsAlignment } from '@/constants/obsAlignment';
import type { Rect } from '@/types/Rect';

export type LayoutRegionName = keyof LayoutMetric;

/**
 * How a region's source sits in its region. Settable for every participant in the config's `regions`, per
 * participant in their pool entry's `regions`, and per scene on the scene's participant entry, each layer over the
 * last.
 */
export interface RegionSettings {
  /** Pixels the source sits inside its region on every side, as padding within the border. The border is unaffected. */
  inset?: number;
  /**
   * Where the source sits inside its bounds when it does not fill them, as OBS names it. Left alone when omitted.
   * `obs:deploy` applies it to the item, so it layers over the config and the pool entry, not per scene.
   */
  boundsAlignment?: ObsAlignment;
  /**
   * Text sources only. With either font size set, the font is set on every move to the largest size whose line fits
   * the source's height after the inset, measured from how tall the source renders at its current size. The font
   * stays at this size while it fits, and only sizes down when the region is too short for it.
   */
  fontSizeMax?: number;
  /** How far the font may size down. With an inset, the layout's smallest name height is inset × 2 + fontSizeMin. */
  fontSizeMin?: number;
}

/** Region settings by region name. */
export type RegionSettingsMap = Partial<Record<LayoutRegionName, RegionSettings>>;

/** What a scene may change per region: everything but the bounds alignment, which is set up once per item. */
export type SceneRegionSettingsMap = Partial<Record<LayoutRegionName, Omit<RegionSettings, 'boundsAlignment'>>>;

/** A region's OBS items. */
export interface SourceBinding {
  /** OBS source name of the scene item that fills the region. */
  source: string;
  /** OBS source name of a color source drawn as the region's border: the region grown by `regionBorder`. */
  border?: string;
}

export interface ParticipantPoolEntry {
  sources: Partial<Record<LayoutRegionName, SourceBinding>>;
  /** This participant's own region settings, over the config's `regions` and under a scene's. */
  regions?: RegionSettingsMap;
  /**
   * This participant's own layout config, true of them in every composition, merged over the config's `config` and
   * under a scene's. A guest who always streams keyed would carry `camera: { isGreenScreen: true }` here.
   */
  config?: LayoutConfig;
}

export interface SceneParticipant {
  /** Key in `participants`: the OBS scene that holds this participant's items, nested in the container. */
  layout: string;
  /**
   * What this composition changes for the participant, merged over their pool config: a region config or `null`
   * per region, and `hasName`, as obs-layout-generator takes them. A green screen camera (`camera.isGreenScreen`)
   * has no border; its border source still follows the camera as if it framed it, but fades out, and fades back in
   * with the next layout that frames the camera.
   */
  config?: LayoutConfig;
  /** This composition's region settings for the participant, over their own and the config's `regions`. */
  regions?: SceneRegionSettingsMap;
}

/**
 * A named layout config that presets switch on and off at runtime, merged over every shown participant's config
 * after the scene's. Active modifiers stay active across scene changes, so a layout preset applies the layout with
 * whatever is on; a scene can force one on or off with its `modifiers`.
 */
export interface Modifier {
  config: LayoutConfig;
  /** Only these participants, by their key in `participants`; every participant when left out. */
  participants?: string[];
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
   * The standby text, an item of the standby text scene, that slides out from behind the line. It shows at its
   * rendered size, centered on the line, `textGap` pixels past it.
   */
  text?: string;
  /** Items of the container that fade in at their regions while the text slides out. */
  widgets?: OverlayBinding[];
  /** The participant whose main border becomes the line, by its key in `participants`. Default the first one. */
  line?: string;
}

export interface SceneBinding {
  /**
   * The participants shown, in layout order. A standby scene leaves it out: every participant collapses into the
   * line, and anything else is hidden.
   */
  participants?: SceneParticipant[];
  options?: LayoutOptions;
  /** Move duration in milliseconds. */
  duration?: number;
  /** Collapse the participants' regions into the standby line instead of laying them out, and show these overlays. */
  standby?: StandbyBinding;
  /** Modifiers this scene forces on (`true`) or off (`false`), whatever is active, by their key in `modifiers`. */
  modifiers?: Record<string, boolean>;
}

export interface StandbySettings {
  /** Scene in the container, below the participant layouts, that holds every standby text and hides what is left of the line. */
  textScene: string;
  /** Height of the line in pixels. Its width is the border on both sides: 2 × regionBorder. */
  lineHeight: number;
  /** Pixels between the line and a standby text, which shows at its rendered size, centered on the line. Default 30. */
  textGap?: number;
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
  /**
   * Custom variable that holds this config, written by `firebot:deploy` and read by the presets. The script keeps the
   * active scene and modifiers in the variable of the same name with `State` added. Default "layoutScenes".
   */
  variable?: string;
  /** Firebot executable, for `firebot:restart` where the default install location does not apply. */
  executable?: string;
}

export interface ScenesConfig {
  /** OBS scene that contains every participant layout scene as an item. */
  container: string;
  options?: LayoutOptions;
  /**
   * Pixels the border sources' filters, such as a shadow, add outside the border on every side. The border item sits
   * this much further out, so its color source still fills the border box. `regionBorder` is the visible border.
   */
  borderPadding?: number;
  /** The filter that colors the borders, when something else drives their color. */
  borderColor?: BorderColorSettings;
  /** Move duration in milliseconds, used by scenes that do not set their own. */
  duration?: number;
  /** The layout config every participant starts from in every scene: the base layer under the pool and scene configs. */
  config?: LayoutConfig;
  /** Region settings every participant starts from, under their own and the scenes'. */
  regions?: RegionSettingsMap;
  /** Every layout scene the installation knows, with its bound sources. */
  participants: Record<string, ParticipantPoolEntry>;
  /** Compositions by scene key, each listing the participants it shows in layout order. */
  scenes: Record<string, SceneBinding>;
  /** Layout configs presets switch on and off over the scenes, by name, applied in this order. */
  modifiers?: Record<string, Modifier>;
  /** Needed by scenes with a `standby` entry. */
  standby?: StandbySettings;
  /** Overrides Firebot's OBS integration settings. */
  obs?: ObsSettings;
  firebot?: FirebotSettings;
}
