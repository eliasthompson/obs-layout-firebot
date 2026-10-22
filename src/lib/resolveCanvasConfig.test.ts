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
      standby: { textScene: 'Texts', lineHeight: 540 },
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
      standby: { textScene: 'Texts', lineHeight: 540 },
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

  it('fails on a canvas the config does not have', () => {
    expect(() => resolveCanvas(config, 'square')).toThrow(
      'No canvas "square" in the layout config. Known canvases: landscape, portrait',
    );
  });
});
