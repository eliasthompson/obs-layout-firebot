import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { resolveParticipantConfig } from '@/lib/resolveParticipantConfig';

const config: Pick<ScenesConfig, 'config' | 'modifiers' | 'participants'> = {
  config: { hasName: false, info: { aspectRatio: '250:49', isMainAttached: true } },
  participants: {
    Me: { sources: {}, config: { camera: { mainAspectRatio: '4:3' } } },
    Guest: { sources: {}, config: { camera: { isGreenScreen: true } } },
  },
  modifiers: {
    Keyed: { config: { camera: { isGreenScreen: true } }, participants: ['Me'] },
    Names: { config: { hasName: true } },
  },
};

describe('resolveParticipantConfig', () => {
  it('layers the base config, the pool config, and the scene config, region by region', () => {
    expect(
      resolveParticipantConfig(
        config,
        { layout: 'Me', config: { contentMain: { aspectRatio: '4:3' }, info: null } },
        [],
      ),
    ).toEqual({
      hasName: false,
      info: null,
      camera: { mainAspectRatio: '4:3' },
      contentMain: { aspectRatio: '4:3' },
    });
  });

  it('applies the modifiers in effect to the participants they name, after the scene config', () => {
    expect(resolveParticipantConfig(config, { layout: 'Me' }, ['Keyed', 'Names'])).toEqual({
      hasName: true,
      info: { aspectRatio: '250:49', isMainAttached: true },
      camera: { mainAspectRatio: '4:3', isGreenScreen: true },
    });
    expect(resolveParticipantConfig(config, { layout: 'Guest' }, ['Keyed', 'Names'])).toEqual({
      hasName: true,
      info: { aspectRatio: '250:49', isMainAttached: true },
      camera: { isGreenScreen: true },
    });
  });

  it('ignores unknown modifiers and participants without a pool config', () => {
    expect(resolveParticipantConfig({ participants: {} }, { layout: 'Nobody' }, ['Ghost'])).toEqual({});
  });
});
