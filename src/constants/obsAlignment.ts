/** OBS alignment flags (OBS_ALIGN_*) by the names the OBS transform dialog uses, for a scene item's bounds alignment. */
export const OBS_ALIGNMENT_FLAGS = Object.freeze({
  'top left': 5,
  'top center': 4,
  'top right': 6,
  'center left': 1,
  center: 0,
  'center right': 2,
  'bottom left': 9,
  'bottom center': 8,
  'bottom right': 10,
} as const);

export type ObsAlignment = keyof typeof OBS_ALIGNMENT_FLAGS;

/** Standby text covers its bounding box from the left, so text wider than the box runs past the right edge only. */
export const STANDBY_TEXT_ALIGNMENT: ObsAlignment = 'center left';
/** The bounds type of standby text: the text covers its whole bounding box. */
export const STANDBY_TEXT_BOUNDS_TYPE = 'OBS_BOUNDS_SCALE_OUTER';
