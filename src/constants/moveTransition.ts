// Setting values of the obs-move-transition plugin, from its move-transition.h

export const MOVE_SOURCE_FILTER_KIND = 'move_source_filter';
export const MOVE_VALUE_FILTER_KIND = 'move_value_filter';
export const COLOR_FILTER_KIND = 'color_filter_v2';

export const CHANGE_VISIBILITY_SHOW_START = 1;
export const CHANGE_VISIBILITY_HIDE_END = 2;

export const EASE_IN_OUT = 3;
export const EASING_CUBIC = 2;

/** `move_value_type` for one named setting. The "settings" mode (1) rewrites every setting, including a color. */
export const MOVE_VALUE_TYPE_SINGLE_SETTING = 0;
/** `value_type` of a Move Value filter. */
export const MOVE_VALUE_INT = 1;
export const MOVE_VALUE_FLOAT = 2;
export const MOVE_VALUE_COLOR = 3;
