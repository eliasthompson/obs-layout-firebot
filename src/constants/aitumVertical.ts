// Aitum Vertical's obs-websocket vendor requests, which switch the program scene of the canvas it adds. OBS has no
// program scene for a canvas other than its main one, so these are the only way to read or set it.

/** The vendor name Aitum Vertical registers its requests under. */
export const AITUM_VERTICAL_VENDOR = 'aitum-vertical-canvas';
/** Reads a canvas's program scene, `{ scene }`, from the first canvas matching an optional `width` and `height`. */
export const AITUM_CURRENT_SCENE = 'current_scene';
/** Switches every Aitum canvas to a scene, `{ scene }`, by name; it takes effect a moment after it answers. */
export const AITUM_SWITCH_SCENE = 'switch_scene';
