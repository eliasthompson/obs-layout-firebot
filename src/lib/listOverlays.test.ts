import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { listOverlays } from '@/lib/listOverlays';

const soon = { x: 1000, y: 480, width: 700, height: 120 };
const clips = { x: 100, y: 300, width: 600, height: 480 };

const config: ScenesConfig = {
  container: '[Scene] Canvas',
  standby: { textScene: '[Widget] Standby Text', lineHeight: 540 },
  participants: {},
  scenes: {
    layout: { participants: [] },
    soon: {
      participants: [],
      standby: {
        text: '[Text] Starting Soon',
        widgets: [{ source: '[Widget] Clips', region: clips }],
      },
    },
    schedule: {
      participants: [],
      standby: { widgets: [{ source: '[Widget] Schedule', region: clips, boundsAlignment: 'top center' }] },
    },
    again: {
      participants: [],
      standby: {
        text: '[Text] Starting Soon',
        widgets: [{ source: '[Widget] Clips', region: soon }],
      },
    },
    blank: { participants: [], standby: {} },
  },
};

describe('listOverlays', () => {
  it('lists each standby text and widget once, from the first scene that uses it, texts aligned center left', () => {
    expect(listOverlays(config)).toEqual([
      {
        binding: { scene: '[Widget] Standby Text', source: '[Text] Starting Soon', kind: 'text', boundsAlignment: 1 },
      },
      { binding: { scene: '[Scene] Canvas', source: '[Widget] Clips', kind: 'widget' }, region: clips },
      {
        binding: { scene: '[Scene] Canvas', source: '[Widget] Schedule', kind: 'widget', boundsAlignment: 4 },
        region: clips,
      },
    ]);
  });

  it('leaves texts out while the config has no standby settings', () => {
    const withoutStandby = { ...config, standby: undefined };

    expect(listOverlays(withoutStandby).map((overlay) => overlay.binding.source)).toEqual([
      '[Widget] Clips',
      '[Widget] Schedule',
    ]);
  });
});
