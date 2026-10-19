import type { LayoutRegion } from '@eliasthompson/obs-layout-generator';

import type { MoveStep } from '@/types/MoveStep';

import { OPACITY_FILTER_NAME } from '@/constants/filterNames';
import {
  CHANGE_VISIBILITY_HIDE_END,
  CHANGE_VISIBILITY_SHOW_START,
  EASE_IN_OUT,
  EASING_CUBIC,
  MOVE_VALUE_FLOAT,
  MOVE_VALUE_INT,
  MOVE_VALUE_TYPE_SINGLE_SETTING,
} from '@/constants/moveTransition';

/**
 * Settings shared by every Move filter: custom duration, a start delay for staged moves, easing, and self-disabling
 * when the move ends.
 */
export const moveTiming = (duration: number, delay: number) => ({
  custom_duration: true,
  duration,
  start_delay: delay,
  easing_match: EASE_IN_OUT,
  easing_function_match: EASING_CUBIC,
  enabled_match_moving: true,
});

/** Shown items become visible as the move starts; hidden ones are hidden when it ends, after fading out. */
const changeVisibility = (step: MoveStep) => (step.visible ? CHANGE_VISIBILITY_SHOW_START : CHANGE_VISIBILITY_HIDE_END);

/**
 * Move Source filter settings that move a scene item to a rectangle. Values are absolute because no `_sign` keys are
 * set. Borders have no bounds, so only their position applies; their size moves through their own filters.
 */
export const moveFilterSettings = (step: MoveStep, region: LayoutRegion) => ({
  source: step.source,
  transform: true,
  pos: { x: region.x, y: region.y },
  bounds: { x: region.width, y: region.height },
  scale: { x: 1, y: 1 },
  rot: 0,
  crop: { left: 0, top: 0, right: 0, bottom: 0 },
  ...moveTiming(step.duration, step.delay),
  change_visibility: changeVisibility(step),
});

/** Move Source filter settings for a layout item in the container: visibility only, it never moves. */
export const visibilityFilterSettings = (step: MoveStep) => ({
  source: step.source,
  transform: false,
  ...moveTiming(step.duration, step.delay),
  change_visibility: changeVisibility(step),
});

/** Move Value filter settings animating one integer setting of the source the filter is attached to. */
export const intSettingFilterSettings = (settingName: string, value: number, duration: number, delay: number) => ({
  move_value_type: MOVE_VALUE_TYPE_SINGLE_SETTING,
  filter: '',
  setting_name: settingName,
  value_type: MOVE_VALUE_INT,
  setting_int: value,
  ...moveTiming(duration, delay),
});

/** Move Value filter settings animating the Opacity filter's `opacity` to 1 (shown) or 0 (hidden). */
export const opacityMoveFilterSettings = (step: MoveStep) => ({
  move_value_type: MOVE_VALUE_TYPE_SINGLE_SETTING,
  filter: OPACITY_FILTER_NAME,
  setting_name: 'opacity',
  value_type: MOVE_VALUE_FLOAT,
  setting_float: step.visible ? 1 : 0,
  ...moveTiming(step.duration, step.delay),
});
