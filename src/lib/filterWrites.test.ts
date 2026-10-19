import { describe, expect, it } from 'vitest';

import type { MoveStep } from '@/types/MoveStep';

import {
  intSettingFilterSettings,
  moveFilterSettings,
  opacityMoveFilterSettings,
  visibilityFilterSettings,
} from '@/lib/filterSettings';
import { filterWrites } from '@/lib/filterWrites';

const border: MoveStep = {
  scene: '[Layout] Person 1',
  source: '[Border] Camera 1',
  kind: 'border',
  filterName: 'Move: [Border] Camera 1',
  region: { x: 225, y: 120, width: 1470, height: 840 },
  size: { width: 1452, height: 822 },
  visible: true,
  duration: 300,
  delay: 0,
};
const layout: MoveStep = {
  scene: '[Scene] Content',
  source: '[Layout] Person 1',
  kind: 'layout',
  filterName: 'Move: [Layout] Person 1',
  region: undefined,
  size: undefined,
  visible: false,
  duration: 300,
  delay: 0,
};

describe('filterWrites', () => {
  it('writes the move, both size filters, and the fade for a border', () => {
    expect(filterWrites(border)).toEqual([
      {
        sourceName: '[Layout] Person 1',
        filterName: 'Move: [Border] Camera 1',
        filterSettings: moveFilterSettings(border, { x: 225, y: 120, width: 1470, height: 840 }),
      },
      {
        sourceName: '[Border] Camera 1',
        filterName: 'Move: Width',
        filterSettings: intSettingFilterSettings('width', 1452, 300, 0),
      },
      {
        sourceName: '[Border] Camera 1',
        filterName: 'Move: Height',
        filterSettings: intSettingFilterSettings('height', 822, 300, 0),
      },
      {
        sourceName: '[Border] Camera 1',
        filterName: 'Move: Opacity',
        filterSettings: opacityMoveFilterSettings(border),
      },
    ]);
  });

  it('writes only the move for standby text, which never fades', () => {
    const text: MoveStep = {
      ...border,
      scene: '[Widget] Standby Text',
      source: '[Text] Starting Soon',
      kind: 'text',
      filterName: 'Move: [Text] Starting Soon',
      size: undefined,
      delay: 300,
    };

    expect(filterWrites(text)).toEqual([
      {
        sourceName: '[Widget] Standby Text',
        filterName: 'Move: [Text] Starting Soon',
        filterSettings: moveFilterSettings(text, { x: 225, y: 120, width: 1470, height: 840 }),
      },
    ]);
  });

  it('writes only visibility and the fade for a layout item', () => {
    expect(filterWrites(layout)).toEqual([
      {
        sourceName: '[Scene] Content',
        filterName: 'Move: [Layout] Person 1',
        filterSettings: visibilityFilterSettings(layout),
      },
      {
        sourceName: '[Layout] Person 1',
        filterName: 'Move: Opacity',
        filterSettings: opacityMoveFilterSettings(layout),
      },
    ]);
  });
});
