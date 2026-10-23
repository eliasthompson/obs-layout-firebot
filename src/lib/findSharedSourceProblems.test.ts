import { describe, expect, it } from 'vitest';

import type { ParticipantPoolEntry, ScenesConfig } from '@/types/ScenesConfig';

import { findSharedSourceProblems } from '@/lib/findSharedSourceProblems';

/** A person whose camera and info scene are shared, with a border of each canvas's own. */
const person = (suffix: string): ParticipantPoolEntry => ({
  sources: {
    camera: { source: 'Cam', border: `Cam Border${suffix}` },
    info: { source: 'Info', border: `Info Border${suffix}` },
  },
});

const canvases: ScenesConfig['canvases'] = {
  landscape: { container: 'Canvas', participants: { P: person('') } },
  portrait: {
    canvas: 'Aitum Vertical',
    container: 'Canvas (V)',
    options: { canvasWidth: 1080, canvasHeight: 1920 },
    participants: { P: { ...person(' (V)'), scene: 'P (V)' } },
  },
};

const messages = (config: ScenesConfig) => findSharedSourceProblems(config).map(({ message }) => message);

// The camera as the main region shows on both canvases; beside 16:9 content on a canvas without margins it has no room
const camera = { contentMain: null };

describe('findSharedSourceProblems', () => {
  it('lets canvases share a source every preset fades alike, under every combination of modifiers', () => {
    const config: ScenesConfig = {
      canvases,
      scenes: { camera: { participants: [{ layout: 'P', config: camera }] } },
      modifiers: { Keyed: { config: { camera: { isGreenScreen: true } } }, Names: { config: { hasName: true } } },
    };

    expect(findSharedSourceProblems(config)).toEqual([]);
  });

  it('checks nothing more when the canvases share no source', () => {
    const own: ScenesConfig = {
      canvases: { ...canvases, portrait: { ...canvases.portrait, participants: {} } },
      scenes: { camera: { participants: [{ layout: 'P' }] } },
    };

    expect(findSharedSourceProblems(own)).toEqual([]);
  });

  it('never shares a border or a text whose font is sized, since each canvas sizes them', () => {
    const config: ScenesConfig = {
      canvases: {
        landscape: {
          container: 'Canvas',
          participants: { P: { sources: { camera: { source: 'Cam', border: 'Border' }, name: { source: 'Name' } } } },
        },
        portrait: {
          container: 'Canvas (V)',
          participants: {
            P: { sources: { camera: { source: 'Cam (V)', border: 'Border' }, name: { source: 'Name' } } },
          },
          regions: { name: { fontSizeMax: 48 } },
        },
      },
      scenes: {},
    };

    expect(messages(config)).toEqual([
      '"Border" is bound on the landscape and portrait canvases, but it is a border, which each canvas sizes; give each canvas its own',
      '"Name" is bound on the landscape and portrait canvases, but its font is sized, which each canvas does for its own regions; give each canvas its own',
    ]);
  });

  it('reports a preset that would fade a shared source differently, or leaves a sharing canvas as it is', () => {
    const config: ScenesConfig = {
      canvases,
      scenes: {
        split: {
          participants: [{ layout: 'P', config: camera }],
          canvases: { portrait: { participants: [{ layout: 'P', config: { ...camera, camera: null } }] } },
        },
        landscapeOnly: { participants: [{ layout: 'P', config: camera }], canvases: { portrait: false } },
        empty: { participants: [] },
      },
    };

    expect(messages(config)).toEqual([
      'scene "split" would fade the shared "Cam" differently: landscape shows it after 0 ms over 300 ms, portrait hides it after 0 ms over 300 ms; every canvas that shares a source has to fade it alike',
      'scene "landscapeOnly" would fade the shared "Cam" differently: landscape shows it after 0 ms over 300 ms, portrait leaves it as it is; every canvas that shares a source has to fade it alike',
      'scene "landscapeOnly" would fade the shared "Info" differently: landscape hides it after 0 ms over 300 ms, portrait leaves it as it is; every canvas that shares a source has to fade it alike',
    ]);
  });

  it('checks standby widgets canvases share, and leaves shared standby texts alone, since those only move', () => {
    const clips = { source: 'Clips', region: { x: 0, y: 0, width: 100, height: 100 } };
    const config: ScenesConfig = {
      canvases: {
        landscape: { ...canvases.landscape, standby: { textScene: 'Texts', lineLength: 540 } },
        portrait: { ...canvases.portrait, standby: { textScene: 'Texts (V)', lineLength: 720 } },
      },
      scenes: {
        soon: { standby: { text: 'Soon', widgets: [clips] }, canvases: { portrait: { standby: { widgets: [] } } } },
        brb: { standby: { text: 'Back', widgets: [clips] } },
      },
    };

    expect(messages(config)).toEqual([
      'scene "soon" would fade the shared "Clips" differently: landscape shows it after 300 ms over 300 ms, portrait hides it after 0 ms over 300 ms; every canvas that shares a source has to fade it alike',
    ]);
  });

  it('names the modifiers a problem shows under, once per preset and source', () => {
    // The shared camera is P's on landscape and Q's on portrait, and the modifier hides only P's
    const config: ScenesConfig = {
      canvases: {
        landscape: canvases.landscape,
        portrait: { ...canvases.portrait, participants: { Q: person(' (V)') } },
      },
      scenes: {
        solo: {
          participants: [{ layout: 'P', config: camera }],
          canvases: { portrait: { participants: [{ layout: 'Q', config: camera }] } },
        },
      },
      modifiers: { Away: { config: { camera: null }, participants: ['P'] }, Names: { config: { hasName: true } } },
    };

    expect(messages(config)).toEqual([
      'scene "solo" with Away would fade the shared "Cam" differently: landscape hides it after 0 ms over 300 ms, portrait shows it after 0 ms over 300 ms; every canvas that shares a source has to fade it alike',
    ]);
  });
});
