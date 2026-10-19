import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { createPresetEffectList } from '@/lib/createPresetEffectList';
import { syncPresetEffectLists } from '@/lib/syncPresetEffectLists';

const config = (scenes: string[], variable?: string): ScenesConfig => ({
  container: 'Program',
  participants: {},
  scenes: Object.fromEntries(scenes.map((key) => [key, { participants: [] }])),
  ...(variable === undefined ? {} : { firebot: { variable } }),
});

const ids = () => {
  let next = 0;
  return { createId: () => `id-${String(++next)}` };
};

describe('syncPresetEffectLists', () => {
  it('creates a preset for every scene key', () => {
    const sync = syncPresetEffectLists({}, config(['A', 'B']), ids());

    expect(sync.added).toEqual(['A', 'B']);
    expect(sync.removed).toEqual([]);
    expect(sync.updated).toEqual([]);
    expect(Object.values(sync.presets).map((preset) => preset.name)).toEqual(['A', 'B']);
  });

  it('keeps matching presets with their ids and drops the ones for removed keys', () => {
    const kept = createPresetEffectList('A', 'Program', { createId: () => 'kept' });
    const gone = createPresetEffectList('Gone', 'Program', { createId: () => 'gone' });
    const sync = syncPresetEffectLists({ kept, gone }, config(['A', 'B']), ids());

    expect(sync.presets.kept).toBe(kept);
    expect('gone' in sync.presets).toBe(false);
    expect(sync.added).toEqual(['B']);
    expect(sync.removed).toEqual(['Gone']);
  });

  it('points new and kept presets at the configured variable', () => {
    const kept = createPresetEffectList('A', 'Program', { createId: () => 'kept' });
    const sync = syncPresetEffectLists({ kept }, config(['A', 'B'], 'otherScenes'), ids());
    const variables = Object.values(sync.presets).map(
      (preset) => (preset.effects.list[1]?.parameters as { configVariable: { value: string } }).configVariable.value,
    );

    expect(variables).toEqual(['otherScenes', 'otherScenes']);
    expect(sync.updated).toEqual(['A']);
  });

  it('leaves a preset without a configVariable parameter alone', () => {
    const bare = createPresetEffectList('A', 'Program', { createId: () => 'bare' });
    bare.effects.list = [];
    const sync = syncPresetEffectLists({ bare }, config(['A']), ids());

    expect(sync.presets.bare).toBe(bare);
    expect(sync.updated).toEqual([]);
  });
});
