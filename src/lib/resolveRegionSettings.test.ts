import { describe, expect, it } from 'vitest';

import { resolveRegionSettings } from '@/lib/resolveRegionSettings';

const config = {
  regions: { info: { inset: 12, boundsAlignment: 'top center' as const }, name: { fontSizeMin: 24, fontSizeMax: 48 } },
};

describe('resolveRegionSettings', () => {
  it("layers the config's regions, the participant's, and the scene's, field by field", () => {
    expect(
      resolveRegionSettings(config, { regions: { name: { inset: 8, fontSizeMax: 60 } } }, 'name', {
        name: { inset: 4 },
      }),
    ).toEqual({ inset: 4, fontSizeMin: 24, fontSizeMax: 60 });
    expect(resolveRegionSettings(config, {}, 'info')).toEqual({ inset: 12, boundsAlignment: 'top center' });
  });

  it('leaves a field a layer sets to undefined to the layer below', () => {
    expect(resolveRegionSettings(config, { regions: { info: { inset: undefined } } }, 'info', { info: {} })).toEqual({
      inset: 12,
      boundsAlignment: 'top center',
    });
  });

  it('resolves nothing for a region no layer sets', () => {
    expect(resolveRegionSettings({}, { regions: {} }, 'camera')).toEqual({});
  });
});
