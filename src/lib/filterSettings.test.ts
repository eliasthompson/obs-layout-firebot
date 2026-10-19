import { describe, expect, it } from 'vitest';

import type { MoveStep } from '@/types/MoveStep';

import {
  intSettingFilterSettings,
  moveFilterSettings,
  moveTiming,
  opacityMoveFilterSettings,
  visibilityFilterSettings,
} from '@/lib/filterSettings';

const shown: MoveStep = {
  scene: '[Layout] Person 1',
  source: '[Group] Camera 1',
  kind: 'source',
  filterName: 'Move: [Group] Camera 1',
  region: { x: 1500, y: 555, width: 390, height: 390 },
  size: undefined,
  visible: true,
  duration: 300,
};
const hidden: MoveStep = { ...shown, visible: false, duration: 500 };

describe('moveTiming', () => {
  it('uses a custom duration with cubic ease in-out and self-disabling', () => {
    expect(moveTiming(250)).toEqual({
      custom_duration: true,
      duration: 250,
      easing_match: 3,
      easing_function_match: 2,
      enabled_match_moving: true,
    });
  });
});

describe('moveFilterSettings', () => {
  it('moves to the rectangle with absolute values and shows at start', () => {
    expect(moveFilterSettings(shown, { x: 1, y: 2, width: 3, height: 4 })).toEqual({
      source: '[Group] Camera 1',
      transform: true,
      pos: { x: 1, y: 2 },
      bounds: { x: 3, y: 4 },
      scale: { x: 1, y: 1 },
      rot: 0,
      crop: { left: 0, top: 0, right: 0, bottom: 0 },
      ...moveTiming(300),
      change_visibility: 1,
    });
  });

  it('hides at the end for hidden steps', () => {
    expect(moveFilterSettings(hidden, { x: 1, y: 2, width: 3, height: 4 })).toMatchObject({
      change_visibility: 2,
      duration: 500,
    });
  });
});

describe('visibilityFilterSettings', () => {
  it('toggles visibility without a transform', () => {
    expect(visibilityFilterSettings(shown)).toEqual({
      source: '[Group] Camera 1',
      transform: false,
      ...moveTiming(300),
      change_visibility: 1,
    });
    expect(visibilityFilterSettings(hidden)).toMatchObject({ change_visibility: 2 });
  });
});

describe('intSettingFilterSettings', () => {
  it('animates one integer setting of the attached source', () => {
    expect(intSettingFilterSettings('width', 1452, 300)).toEqual({
      move_value_type: 0,
      filter: '',
      setting_name: 'width',
      value_type: 1,
      setting_int: 1452,
      ...moveTiming(300),
    });
  });
});

describe('opacityMoveFilterSettings', () => {
  it('fades the Opacity filter to 1 when shown and 0 when hidden', () => {
    expect(opacityMoveFilterSettings(shown)).toEqual({
      move_value_type: 0,
      filter: 'Opacity',
      setting_name: 'opacity',
      value_type: 2,
      setting_float: 1,
      ...moveTiming(300),
    });
    expect(opacityMoveFilterSettings(hidden)).toMatchObject({ setting_float: 0, duration: 500 });
  });
});
