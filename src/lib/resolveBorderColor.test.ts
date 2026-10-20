import { describe, expect, it } from 'vitest';

import { resolveBorderColor } from '@/lib/resolveBorderColor';

describe('resolveBorderColor', () => {
  it('fills in the Stroke filter setting and the fade duration', () => {
    expect(resolveBorderColor({ borderColor: { filter: 'Stroke' } })).toEqual({
      filter: 'Stroke',
      setting: 'stroke_fill_color',
      duration: 500,
    });
  });

  it('keeps explicit settings', () => {
    expect(resolveBorderColor({ borderColor: { filter: 'Glow', setting: 'glow_fill_color', duration: 250 } })).toEqual({
      filter: 'Glow',
      setting: 'glow_fill_color',
      duration: 250,
    });
  });

  it('resolves nothing when the config has no border color', () => {
    expect(resolveBorderColor({})).toBeUndefined();
  });
});
