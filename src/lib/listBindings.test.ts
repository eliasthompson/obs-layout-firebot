import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { listBindings } from '@/lib/listBindings';

const config: ScenesConfig = {
  container: '[Scene] Content',
  participants: {
    '[Layout] Person 1': {
      sources: {
        contentMain: { source: '[Group] Content 1', border: '[Border] Content 1' },
        camera: { source: '[Group] Camera 1' },
        info: { source: '[Group] Info 1', boundsAlignment: 'top center' },
      },
    },
    '[Layout] Person 2': { sources: {} },
  },
  scenes: {},
};

describe('listBindings', () => {
  it('lists the layout item, then each source and its border, per participant', () => {
    expect(listBindings(config)).toEqual([
      { scene: '[Scene] Content', source: '[Layout] Person 1', kind: 'layout' },
      { scene: '[Layout] Person 1', source: '[Group] Content 1', kind: 'source' },
      { scene: '[Layout] Person 1', source: '[Border] Content 1', kind: 'border' },
      { scene: '[Layout] Person 1', source: '[Group] Camera 1', kind: 'source' },
      { scene: '[Layout] Person 1', source: '[Group] Info 1', kind: 'source', boundsAlignment: 4 },
      { scene: '[Scene] Content', source: '[Layout] Person 2', kind: 'layout' },
    ]);
  });

  it('lists the standby texts and widgets after the participants', () => {
    const region = { x: 0, y: 0, width: 10, height: 10 };
    const withStandby: ScenesConfig = {
      ...config,
      participants: {},
      standby: { textScene: 'Standby Text', lineHeight: 540 },
      scenes: {
        soon: {
          participants: [],
          standby: { text: { source: 'Soon', region }, widgets: [{ source: 'Clips', region }] },
        },
      },
    };

    expect(listBindings(withStandby)).toEqual([
      { scene: 'Standby Text', source: 'Soon', kind: 'text', boundsAlignment: 1 },
      { scene: '[Scene] Content', source: 'Clips', kind: 'widget' },
    ]);
  });

  it('lists nothing for an empty pool', () => {
    expect(listBindings({ ...config, participants: {} })).toEqual([]);
  });
});
