import { describe, expect, it } from 'vitest';

import { createPresetEffectList } from '@/lib/createPresetEffectList';
import { isLayoutPreset, mergeLayoutPresets } from '@/lib/mergeLayoutPresets';

describe('isLayoutPreset', () => {
  it('matches presets that run the layout script', () => {
    expect(isLayoutPreset(createPresetEffectList('A', 'Program'))).toBe(true);
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
    const chat = { effects: { list: [{ type: 'firebot:chat' }] } };
    const old = createPresetEffectList('Old', 'Program', { createId: () => 'old' });
    const ours = createPresetEffectList('New', 'Program', { createId: () => 'new' });
    const merge = mergeLayoutPresets({ chat, old }, { new: ours });

    expect(merge.presets).toEqual({ chat, new: ours });
    expect(merge).toMatchObject({ kept: 1, replaced: 1, added: 1 });
  });
});
