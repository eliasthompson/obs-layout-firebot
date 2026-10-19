import { generateLayout } from '@eliasthompson/obs-layout-generator';
import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { shrinkRegion } from '@/lib/growRegion';
import { planLayoutMoves } from '@/lib/planLayoutMoves';

const neverRegion = { x: -1, y: -1, width: -1, height: -1 };
/** A canvas with no margins, padding, or borders, so a 16:9 main region fills it and leaves no side room */
const bare = { canvasMarginTop: 0, canvasMarginBottom: 0, canvasPadding: 0, regionBorder: 0 };

const options = { canvasPadding: 15, canvasMarginTop: 105, canvasMarginBottom: 105, regionBorder: 15 };

const config: ScenesConfig = {
  container: '[Scene] Content',
  options,
  borderPadding: 9,
  duration: 300,
  participants: {
    '[Layout] Person 1': {
      sources: {
        contentMain: { source: '[Group] Content 1', border: '[Border] Content 1' },
        camera: { source: '[Group] Camera 1', border: '[Border] Camera 1' },
        name: { source: '[Widget] Name 1', border: '[Border] Name 1' },
      },
    },
    '[Layout] Person 2': {
      sources: { camera: { source: '[Group] Camera 2' } },
    },
  },
  scenes: {
    '16:9 1P': { participants: [{ layout: '[Layout] Person 1', config: { hasName: true } }] },
    'Camera 1P': {
      participants: [{ layout: '[Layout] Person 1', config: { contentMainAspectRatio: null } }],
      duration: 500,
    },
    '2P': { participants: [{ layout: '[Layout] Person 1' }, { layout: '[Layout] Person 2' }] },
  },
};

describe('planLayoutMoves', () => {
  it('lays out shown participants and hides the rest', () => {
    const [metric] = generateLayout([{ hasName: true }], options);
    const steps = planLayoutMoves(config, '16:9 1P');

    expect(steps.map((step) => [step.source, step.visible])).toEqual([
      ['[Layout] Person 1', true],
      ['[Group] Content 1', true],
      ['[Border] Content 1', true],
      ['[Group] Camera 1', true],
      ['[Border] Camera 1', true],
      ['[Widget] Name 1', true],
      ['[Border] Name 1', true],
      ['[Layout] Person 2', false],
    ]);
    expect(steps[0]).toEqual({
      scene: '[Scene] Content',
      source: '[Layout] Person 1',
      kind: 'layout',
      filterName: 'Move: [Layout] Person 1',
      region: undefined,
      size: undefined,
      visible: true,
      duration: 300,
    });
    expect(steps[1]).toMatchObject({ scene: '[Layout] Person 1', kind: 'source', region: metric.contentMain });
    expect(steps[2]).toMatchObject({
      kind: 'border',
      region: { x: 15, y: 120, width: 1470, height: 840 },
      size: { width: 1452, height: 822 },
    });
    expect(steps[7]).toMatchObject({ scene: '[Scene] Content', kind: 'layout', region: undefined, visible: false });
  });

  it('insets a source inside its region while the border frames the whole region', () => {
    const [metric] = generateLayout([{ hasName: true, infoAspectRatio: '65:16' }], options);
    const inset: ScenesConfig = {
      ...config,
      participants: {
        L: {
          sources: {
            info: { source: 'info', border: 'infoBorder', inset: 12 },
            name: { source: 'name', inset: 12, fontScale: 0.45 },
            camera: { source: 'cam', inset: 0 },
          },
        },
      },
      // 250:49 is the ratio of the content inside the 12 px inset; the whole strip comes out at 65:16 (390x96)
      scenes: { one: { participants: [{ layout: 'L', config: { hasName: true, infoAspectRatio: '250:49' } }] } },
    };
    const steps = planLayoutMoves(inset, 'one');

    expect(metric.info).toEqual({ x: 1500, y: 135, width: 390, height: 96 });
    expect(steps.find((step) => step.source === 'info')).toMatchObject({
      region: { x: 1512, y: 147, width: 366, height: 72 },
    });
    expect(steps.find((step) => step.source === 'infoBorder')).toMatchObject({
      region: { x: 1485, y: 120, width: 420, height: 126 },
      size: { width: 402, height: 108 },
    });
    expect(steps.find((step) => step.source === 'name')).toMatchObject({
      region: { x: 1512, y: 827, width: 366, height: 106 },
      fontSize: 48,
    });
    expect(steps.find((step) => step.source === 'cam')).toMatchObject({ region: metric.camera });
    expect(steps.find((step) => step.source === 'cam')?.fontSize).toBeUndefined();
  });

  it('keeps the font size within its bounds and asks the layout for the matching smallest name height', () => {
    const bounded: ScenesConfig = {
      ...config,
      participants: {
        L: { sources: { name: { source: 'name', inset: 12, fontScale: 0.45, fontSizeMin: 24, fontSizeMax: 48 } } },
      },
      scenes: {
        tall: { participants: [{ layout: 'L', config: { contentMainAspectRatio: null, hasName: true } }] },
        tiny: {
          participants: [{ layout: 'L', config: { hasName: true } }],
          options: { ...bare, canvasWidth: 480, canvasHeight: 270 },
        },
        explicit: {
          participants: [{ layout: 'L', config: { hasName: true } }],
          options: { ...bare, canvasWidth: 480, canvasHeight: 270, nameHeightMin: 0 },
        },
      },
    };
    const [tallMetric] = generateLayout([{ contentMainAspectRatio: null, hasName: true }], {
      ...options,
      nameHeightMin: 48,
    });
    const tall = planLayoutMoves(bounded, 'tall').find((step) => step.source === 'name');
    const tiny = planLayoutMoves(bounded, 'tiny').find((step) => step.source === 'name');
    const explicit = planLayoutMoves(bounded, 'explicit').find((step) => step.source === 'name');

    // A third of the 810 px camera is capped by the library at 130, so the font stays at its 48 px maximum
    expect(tall?.region).toEqual(shrinkRegion(tallMetric.name ?? neverRegion, 12));
    expect(tall?.fontSize).toBe(48);
    // Two 12 px insets plus the 24 px smallest font ask the layout for a 48 px name; the font sizes down to 24
    expect(tiny?.region?.height).toBe(48 - 24);
    expect(tiny?.fontSize).toBe(24);
    // An explicit nameHeightMin in the scene options or the config options is left alone
    expect(explicit?.region?.height).toBeLessThan(24);
    expect(explicit?.fontSize).toBe(24);
    const configLevel = { ...bounded, options: { ...bounded.options, nameHeightMin: 0 } };
    expect(planLayoutMoves(configLevel, 'tiny').find((step) => step.source === 'name')?.region?.height).toBeLessThan(
      24,
    );
  });

  it('asks for the smallest font height alone as the smallest name height when the text has no inset', () => {
    const plain: ScenesConfig = {
      ...config,
      participants: { L: { sources: { name: { source: 'name', fontScale: 0.45, fontSizeMin: 60 } } } },
      scenes: {
        tiny: {
          participants: [{ layout: 'L', config: { hasName: true } }],
          options: { ...bare, canvasWidth: 480, canvasHeight: 270 },
        },
      },
    };

    // A third of the 270 px content is 90, capped at 45 by the library, then raised to the 60 px smallest font
    expect(planLayoutMoves(plain, 'tiny').find((step) => step.source === 'name')?.region?.height).toBe(60);
  });

  it('leaves the font size alone for hidden text', () => {
    const hiddenName: ScenesConfig = {
      ...config,
      participants: { L: { sources: { name: { source: 'name', fontScale: 0.45 }, camera: { source: 'cam' } } } },
      scenes: { one: { participants: [{ layout: 'L', config: { hasName: false } }] } },
    };

    const name = planLayoutMoves(hiddenName, 'one').find((step) => step.source === 'name');

    expect(name?.visible).toBe(false);
    expect(name?.fontSize).toBeUndefined();
  });

  it('sizes a name border like the name itself, without a border box', () => {
    const [metric] = generateLayout([{ hasName: true }], options);
    const steps = planLayoutMoves(config, '16:9 1P');

    expect(steps[6]).toMatchObject({ source: '[Border] Name 1', region: metric.name });
  });

  it('sends unused regions to a 1x1 point at the canvas center, hidden, with the scene duration', () => {
    const steps = planLayoutMoves(config, 'Camera 1P');
    const content = steps.find((step) => step.source === '[Group] Content 1');
    const border = steps.find((step) => step.source === '[Border] Content 1');

    expect(content).toMatchObject({ region: { x: 960, y: 540, width: 1, height: 1 }, visible: false, duration: 500 });
    expect(border).toMatchObject({ region: { x: 960, y: 540, width: 1, height: 1 }, size: { width: 1, height: 1 } });
  });

  it('uses the scene options over the config options for the center and border', () => {
    const scenes = {
      small: {
        participants: [{ layout: '[Layout] Person 2' }],
        options: { canvasWidth: 1280, canvasHeight: 720, regionBorder: 0 },
      },
    };
    const steps = planLayoutMoves({ ...config, scenes }, 'small');

    expect(steps.find((step) => step.source === '[Layout] Person 1')).toMatchObject({ visible: false });
    expect(steps.find((step) => step.source === '[Group] Camera 2')).toMatchObject({
      region: generateLayout([{}], { ...options, ...scenes.small.options })[0].camera,
      size: undefined,
    });
  });

  it('falls back to the library defaults and no border padding', () => {
    const bare: ScenesConfig = {
      container: 'C',
      participants: { L: { sources: { camera: { source: 'cam', border: 'edge' } } } },
      scenes: { only: { participants: [{ layout: 'L', config: { contentMainAspectRatio: null, hasCamera: false } }] } },
    };
    const steps = planLayoutMoves(bare, 'only');

    expect(steps.find((step) => step.source === 'cam')).toMatchObject({
      region: { x: 960, y: 540, width: 1, height: 1 },
      visible: false,
      duration: 300,
    });
    expect(steps.find((step) => step.source === 'edge')).toMatchObject({ size: { width: 1, height: 1 } });
  });

  it('keeps the border size at least 1x1 when padding exceeds the region', () => {
    const tiny: ScenesConfig = {
      ...config,
      borderPadding: 5000,
      scenes: { one: { participants: [{ layout: '[Layout] Person 1' }] } },
    };

    expect(planLayoutMoves(tiny, 'one').find((step) => step.source === '[Border] Camera 1')).toMatchObject({
      size: { width: 1, height: 1 },
    });
  });

  it('lays out several participants in input order', () => {
    const metrics = generateLayout([{}, {}], options);
    const steps = planLayoutMoves(config, '2P');

    expect(steps.find((step) => step.source === '[Group] Camera 1')).toMatchObject({ region: metrics[0].camera });
    expect(steps.find((step) => step.source === '[Group] Camera 2')).toMatchObject({ region: metrics[1].camera });
    expect(steps.filter((step) => step.kind === 'layout').every((step) => step.visible)).toBe(true);
  });

  it('rejects unknown scene keys and participants', () => {
    expect(() => planLayoutMoves(config, 'nope')).toThrow('No scene "nope"');
    expect(() =>
      planLayoutMoves({ ...config, scenes: { bad: { participants: [{ layout: 'ghost' }] } } }, 'bad'),
    ).toThrow('unknown participant "ghost"');
  });
});
