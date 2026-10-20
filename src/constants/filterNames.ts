export const DEFAULT_CONFIG_VARIABLE = 'layoutScenes';
export const DEFAULT_DURATION = 300;
/** Move Source filters are named `Move: <source>` on the scene that contains the source. */
export const MOVE_FILTER_PREFIX = 'Move:';
/** Filters on the toggled sources themselves. Inputs and scenes are global in OBS, so these need no source name. */
export const WIDTH_FILTER_NAME = 'Move: Width';
export const HEIGHT_FILTER_NAME = 'Move: Height';
export const OPACITY_FILTER_NAME = 'Opacity';
export const OPACITY_MOVE_FILTER_NAME = 'Move: Opacity';
/** On border color sources with a `borderColor` config: fades the border color through the configured filter. */
export const COLOR_MOVE_FILTER_NAME = 'Move: Color';
/** The color setting of the Stroke filter of obs-stroke-glow-shadow, the usual border color filter. */
export const DEFAULT_BORDER_COLOR_SETTING = 'stroke_fill_color';
export const DEFAULT_BORDER_COLOR_DURATION = 500;
/** Frames to wait between writing the filters and enabling them, so OBS has applied the deferred settings updates. */
export const SETTLE_FRAMES = 2;
/**
 * Frames the border size filters start ahead of everything else. A Move Value filter changes a source setting, which
 * OBS applies on the source's next tick, so a border's size renders one frame behind the camera's bounds; starting it
 * a frame early lines the two up.
 */
export const SIZE_LEAD_FRAMES = 1;
