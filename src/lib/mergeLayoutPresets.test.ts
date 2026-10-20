import { describe, expect, it } from 'vitest';

import { createPresetEffectList } from '@/lib/createPresetEffectList';
import { compareLayoutPresets, isLayoutPreset, mergeLayoutPresets } from '@/lib/mergeLayoutPresets';

const chat = { effects: { list: [{ type: 'firebot:chat' }] } };

describe('isLayoutPreset', () => {
  it('matches presets that run the layout script', () => {
    expect(isLayoutPreset(createPresetEffectList('A'))).toBe(true);
  });

  it('ignores other scripts, other effects, and presets without effects', () => {
    expect(isLayoutPreset({ effects: { list: [{ type: 'firebot:customscript', scriptName: 'other.js' }] } })).toBe(
      false,
    );
    expect(isLayoutPreset({ effects: { list: [{ type: 'firebot:chat' }] } })).toBe(false);
    expect(isLayoutPreset({ effects: {} })).toBe(false);
    expect(isLayoutPreset({})).toBe(false);
  });
});

describe('mergeLayoutPresets', () => {
  it('replaces every layout preset and keeps the rest', () => {
    const old = createPresetEffectList('Old');
    const ours = createPresetEffectList('New');
    const merge = mergeLayoutPresets({ chat, [old.id]: old }, { [ours.id]: ours });

    expect(merge.presets).toEqual({ chat, [ours.id]: ours });
    expect(merge).toMatchObject({ kept: 1, replaced: 1, added: 1 });
  });
});

describe('compareLayoutPresets', () => {
  const kept = createPresetEffectList('Kept');
  const added = createPresetEffectList('Added');
  const gone = createPresetEffectList('Gone');
  const ours = { [kept.id]: kept, [added.id]: added };

  it('finds our presets the profile lacks, and its layout presets that are not ours', () => {
    expect(compareLayoutPresets({ chat, [kept.id]: kept, [gone.id]: gone }, ours)).toEqual({
      stale: ['Added'],
      leftOver: [gone.id],
    });
  });

  it('takes a stored preset with extra fields as ours, and one with changed values as stale', () => {
    const saved = { ...kept, sortTags: [], effects: { ...kept.effects, queue: null } };
    const edited = { ...kept, name: 'Renamed in Firebot' };

    expect(compareLayoutPresets({ [kept.id]: saved, [added.id]: added }, ours)).toEqual({ stale: [], leftOver: [] });
    expect(compareLayoutPresets({ [kept.id]: edited, [added.id]: added }, ours).stale).toEqual(['Kept']);
  });
});
