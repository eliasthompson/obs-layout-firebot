import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { resolveCanvas, resolveCanvasConfig } from '@/lib/resolveCanvasConfig';

const config: ScenesConfig = {
  canvases: {
    landscape: {
      container: 'Canvas',
      options: { canvasWidth: 1920, canvasHeight: 1080 },
      participants: {
        A: { sources: { camera: { source: 'Cam A' } } },
        B: { sources: { camera: { source: 'Cam B' } } },
      },
      standby: { textScene: 'Texts', lineLength: 540 },
    },
    portrait: {
      canvas: 'Aitum Vertical',
      container: 'Canvas',
      options: { canvasWidth: 1080, canvasHeight: 1920 },
      config: { hasName: true },
      regions: { name: { fontSizeMax: 36 }, camera: { inset: 4 } },
      participants: { A: { sources: { camera: { source: 'Cam A (V)' } } } },
    },
  },
  borderPadding: 9,
  config: { camera: { isGreenScreen: true } },
  regions: { name: { inset: 12, fontSizeMax: 48, fontSizeMin: undefined } },
  scenes: {
    One: { participants: [{ layout: 'A' }], options: { canvasGap: 24 } },
    Two: { participants: [{ layout: 'A' }, { layout: 'B' }] },
    Swapped: {
      participants: [{ layout: 'B' }],
      canvases: { portrait: { participants: [{ layout: 'A' }], options: { layoutGap: 18 } } },
    },
    Landscape: { participants: [{ layout: 'A' }], canvases: { portrait: false } },
    Standby: { standby: { text: 'Soon', line: 'B' } },
  },
  modifiers: { Keyed: { config: { camera: { isGreenScreen: true } } } },
};

describe('resolveCanvas', () => {
  it('gives the main canvas its container, options, participants, standby, and every scene it can show', () => {
    expect(resolveCanvasConfig(config, 'landscape')).toEqual({
      container: 'Canvas',
      options: { canvasWidth: 1920, canvasHeight: 1080 },
      participants: config.canvases.landscape.participants,
      standby: { textScene: 'Texts', lineLength: 540 },
      borderPadding: 9,
      config: { camera: { isGreenScreen: true } },
      regions: { name: { inset: 12, fontSizeMax: 48, fontSizeMin: undefined } },
      scenes: {
        One: { participants: [{ layout: 'A' }], options: { canvasGap: 24 } },
        Two: { participants: [{ layout: 'A' }, { layout: 'B' }] },
        Swapped: { participants: [{ layout: 'B' }] },
        Landscape: { participants: [{ layout: 'A' }] },
        Standby: { standby: { text: 'Soon', line: 'B' } },
      },
      modifiers: config.modifiers,
    });
  });

  it('gives a canvas its toggled items and fade scenes, and leaves them out of a canvas that has none', () => {
    const withItems: ScenesConfig = {
      ...config,
      canvases: {
        ...config.canvases,
        landscape: { ...config.canvases.landscape, items: { Voice: { visible: true } }, fadeScenes: ['Lists'] },
      },
    };

    expect(resolveCanvasConfig(withItems, 'landscape')).toMatchObject({
      items: { Voice: { visible: true } },
      fadeScenes: ['Lists'],
    });
    expect(resolveCanvasConfig(withItems, 'portrait')).not.toHaveProperty('items');
    expect(resolveCanvasConfig(withItems, 'portrait')).not.toHaveProperty('fadeScenes');
  });

  it("merges the canvas's config and regions over the config's, and applies the scenes' changes for the canvas", () => {
    const portrait = resolveCanvasConfig(config, 'portrait');

    expect(portrait.config).toEqual({ camera: { isGreenScreen: true }, hasName: true });
    expect(portrait.regions).toEqual({ name: { inset: 12, fontSizeMax: 36 }, camera: { inset: 4 } });
    expect(portrait.scenes.Swapped).toEqual({ participants: [{ layout: 'A' }], options: { layoutGap: 18 } });
    expect(portrait).not.toHaveProperty('standby');
  });

  it('leaves out scenes the canvas cannot show, with why, and scenes that leave the canvas out themselves', () => {
    const { config: portrait, leftOut } = resolveCanvas(config, 'portrait');

    expect(Object.keys(portrait.scenes)).toEqual(['One', 'Swapped']);
    expect(leftOut).toEqual({
      Two: 'it shows "B", which the canvas does not have',
      Landscape: null,
      Standby: 'it shows "B", which the canvas does not have',
    });
    expect(
      resolveCanvas({ ...config, scenes: { Standby: { standby: { text: 'Soon' } } } }, 'portrait').leftOut,
    ).toEqual({ Standby: 'it is a standby scene, and the canvas has no standby settings' });
  });

  it('takes either layer alone when only the config or the canvas sets it', () => {
    const bare: ScenesConfig = { ...config, config: undefined, regions: undefined };
    const portrait = resolveCanvasConfig(bare, 'portrait');
    const landscape = resolveCanvasConfig(bare, 'landscape');

    expect(portrait.config).toEqual({ hasName: true });
    expect(portrait.regions).toEqual({ name: { fontSizeMax: 36 }, camera: { inset: 4 } });
    expect(landscape).not.toHaveProperty('config');
    expect(landscape).not.toHaveProperty('regions');
    expect(
      resolveCanvasConfig({ ...bare, canvases: { only: { container: 'C', participants: {} } } }, 'only'),
    ).not.toHaveProperty('options');
  });

  it('keys participants by their OBS scenes, and renames them so in the scenes, standby line, and modifiers', () => {
    const named: ScenesConfig = {
      ...config,
      canvases: {
        ...config.canvases,
        portrait: {
          ...config.canvases.portrait,
          participants: {
            A: { scene: 'A (V)', sources: { camera: { source: 'Cam A (V)' } } },
            B: { scene: 'B (V)', sources: { camera: { source: 'Cam B (V)' } } },
          },
          standby: { textScene: 'Texts (V)', lineLength: 540 },
        },
      },
      modifiers: { Keyed: { config: {}, participants: ['B', 'Z'] }, Names: { config: { hasName: true } } },
    };
    const portrait = resolveCanvasConfig(named, 'portrait');

    expect(portrait.participants).toEqual({
      'A (V)': { sources: { camera: { source: 'Cam A (V)' } } },
      'B (V)': { sources: { camera: { source: 'Cam B (V)' } } },
    });
    expect(portrait.scenes.Two).toEqual({ participants: [{ layout: 'A (V)' }, { layout: 'B (V)' }] });
    expect(portrait.scenes.Standby).toEqual({ standby: { text: 'Soon', line: 'B (V)' } });
    expect(portrait.modifiers).toEqual({
      Keyed: { config: {}, participants: ['B (V)', 'Z'] },
      Names: { config: { hasName: true } },
    });
    expect(resolveCanvasConfig(named, 'landscape').scenes.Two).toEqual({
      participants: [{ layout: 'A' }, { layout: 'B' }],
    });
    expect(resolveCanvasConfig({ ...named, modifiers: undefined }, 'portrait')).not.toHaveProperty('modifiers');
  });

  it("lays a canvas's own standby text, widgets, or line over a standby scene's", () => {
    const widgets = [{ source: 'Clips (V)', region: { x: 0, y: 1200, width: 1080, height: 600 } }];
    const own: ScenesConfig = {
      ...config,
      canvases: {
        ...config.canvases,
        portrait: { ...config.canvases.portrait, standby: { textScene: 'Texts (V)', lineLength: 720 } },
      },
      scenes: {
        Standby: {
          standby: { text: 'Soon', line: 'A' },
          canvases: { portrait: { standby: { text: 'Soon (V)', widgets } } },
        },
        Away: { standby: { text: 'Away', line: 'B' }, canvases: { portrait: { standby: { line: 'A' } } } },
        Plain: { participants: [{ layout: 'A' }], canvases: { portrait: { standby: { text: 'Ignored' } } } },
      },
    };
    const portrait = resolveCanvas(own, 'portrait');

    expect(portrait.config.scenes.Standby).toEqual({ standby: { text: 'Soon (V)', line: 'A', widgets } });
    // The canvas has no "B", but its own line puts "A" there
    expect(portrait.config.scenes.Away).toEqual({ standby: { text: 'Away', line: 'A' } });
    expect(portrait.config.scenes.Plain).toEqual({ participants: [{ layout: 'A' }] });
    expect(resolveCanvasConfig(own, 'landscape').scenes.Standby).toEqual({ standby: { text: 'Soon', line: 'A' } });
  });

  it('fails on two participants of a canvas in the same OBS scene', () => {
    const shared: ScenesConfig = {
      ...config,
      canvases: {
        landscape: {
          ...config.canvases.landscape,
          participants: { A: { sources: {} }, B: { scene: 'A', sources: {} } },
        },
      },
    };

    expect(() => resolveCanvas(shared, 'landscape')).toThrow(
      'config.canvases.landscape.participants: "A" and "B" both use the OBS scene "A"',
    );
  });

  it('fails on a canvas the config does not have', () => {
    expect(() => resolveCanvas(config, 'square')).toThrow(
      'No canvas "square" in the layout config. Known canvases: landscape, portrait',
    );
  });
});
