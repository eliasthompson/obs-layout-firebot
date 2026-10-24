import { describe, expect, it } from 'vitest';

import type { ObsState } from '@/types/ObsState';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import { planItemToggles } from '@/lib/planItemToggles';

const config: CanvasScenesConfig = {
  container: 'C',
  participants: {},
  items: {
    Voice: { visible: true },
    Music: { visible: false },
    Mic: { scene: 'Voice', visible: true },
  },
  scenes: {
    play: { participants: [] },
    standby: { standby: {}, items: { Voice: false, Music: true } },
  },
  modifiers: {
    Quiet: { items: { Music: false } },
    Loud: { items: { Music: true, Voice: true } },
    Keyed: { config: { camera: { isGreenScreen: true } } },
  },
};

const stateOf = (voice: boolean, music: boolean, mic: boolean): ObsState => ({
  sceneItems: {
    C: [
      { sourceName: 'Voice', sceneItemId: 8, sceneItemEnabled: voice },
      { sourceName: 'Music', sceneItemId: 16, sceneItemEnabled: music },
    ],
    Voice: [{ sourceName: 'Mic', sceneItemId: 5, sceneItemEnabled: mic }],
  },
  borderThickness: {},
  fontSizes: {},
});

describe('planItemToggles', () => {
  it("toggles each item to its default where the scene says nothing, and to the scene's say where it does", () => {
    expect(planItemToggles(config, 'play', stateOf(false, true, false))).toEqual([
      { scene: 'C', source: 'Voice', sceneItemId: 8, visible: true },
      { scene: 'C', source: 'Music', sceneItemId: 16, visible: false },
      { scene: 'Voice', source: 'Mic', sceneItemId: 5, visible: true },
    ]);
    expect(planItemToggles(config, 'standby', stateOf(true, false, true))).toEqual([
      { scene: 'C', source: 'Voice', sceneItemId: 8, visible: false },
      { scene: 'C', source: 'Music', sceneItemId: 16, visible: true },
    ]);
  });

  it('leaves out items already as wanted', () => {
    expect(planItemToggles(config, 'play', stateOf(true, false, true))).toEqual([]);
  });

  it("puts the modifiers in effect over the scene, in the config's order, the last that names an item winning", () => {
    expect(planItemToggles(config, 'standby', stateOf(false, false, true), ['Quiet'])).toEqual([]);
    expect(planItemToggles(config, 'standby', stateOf(false, false, true), ['Loud', 'Quiet', 'Keyed'])).toEqual([
      { scene: 'C', source: 'Voice', sceneItemId: 8, visible: true },
      { scene: 'C', source: 'Music', sceneItemId: 16, visible: true },
    ]);
    // A scene forcing a modifier on counts it in effect
    expect(
      planItemToggles(
        { ...config, scenes: { forced: { participants: [], modifiers: { Loud: true } } } },
        'forced',
        stateOf(true, false, true),
      ),
    ).toEqual([{ scene: 'C', source: 'Music', sceneItemId: 16, visible: true }]);
  });

  it('leaves out items OBS did not report', () => {
    expect(planItemToggles(config, 'play', { sceneItems: { C: [] }, borderThickness: {}, fontSizes: {} })).toEqual([]);
  });

  it('rejects an unknown scene key', () => {
    expect(() => planItemToggles(config, 'nope', stateOf(true, true, true))).toThrow(
      'No scene "nope" in the layout config. Known scenes: play, standby',
    );
  });
});
