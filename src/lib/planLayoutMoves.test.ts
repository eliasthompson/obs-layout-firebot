import { generateLayout } from '@eliasthompson/obs-layout-generator';
import { describe, expect, it } from 'vitest';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { growRegion, shrinkRegion } from '@/lib/growRegion';
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
      participants: [{ layout: '[Layout] Person 1', config: { contentMain: null } }],
      duration: 500,
    },
    '2P': { participants: [{ layout: '[Layout] Person 1' }, { layout: '[Layout] Person 2' }] },
    Green: { participants: [{ layout: '[Layout] Person 1', config: { camera: { isGreenScreen: true } } }] },
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
      delay: 0,
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
    const [metric] = generateLayout([{ hasName: true, info: { aspectRatio: '65:16' } }], options);
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
      scenes: { one: { participants: [{ layout: 'L', config: { hasName: true, info: { aspectRatio: '250:49' } } }] } },
    };
    const steps = planLayoutMoves(inset, 'one');

    expect(metric.info).toEqual({ x: 1500, y: 135, width: 390, height: 96, hasBorder: true });
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
        tall: { participants: [{ layout: 'L', config: { contentMain: null, hasName: true } }] },
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
    const [tallMetric] = generateLayout([{ contentMain: null, hasName: true }], {
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

  it('moves a green screen camera border with the camera as if it framed it, but fades it out', () => {
    const [metric] = generateLayout([{ camera: { isGreenScreen: true } }], options);
    const steps = planLayoutMoves(config, 'Green');
    const camera = steps.find((step) => step.source === '[Group] Camera 1');
    const border = steps.find((step) => step.source === '[Border] Camera 1');

    expect(metric.camera?.hasBorder).toBe(false);
    expect(camera).toMatchObject({ region: metric.camera, visible: true });
    expect(border).toMatchObject({
      region: growRegion(metric.camera ?? neverRegion, 15),
      size: { width: (metric.camera?.width ?? 0) + 12, height: (metric.camera?.height ?? 0) + 12 },
      visible: false,
    });
    // The content border still frames its region
    expect(steps.find((step) => step.source === '[Border] Content 1')).toMatchObject({ visible: true });
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
      scenes: { only: { participants: [{ layout: 'L', config: { camera: null, contentMain: null } }] } },
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

describe('planLayoutMoves standby', () => {
  const soonRegion = { x: 1000, y: 480, width: 700, height: 120 };
  const brbRegion = { x: 1000, y: 480, width: 640, height: 120 };
  const clipsRegion = { x: 100, y: 300, width: 600, height: 480 };
  const standby: ScenesConfig = {
    container: '[Scene] Canvas',
    options,
    borderPadding: 9,
    duration: 300,
    standby: { textScene: '[Widget] Standby Text', lineHeight: 540 },
    participants: {
      '[Layout] Person 1': {
        sources: {
          contentMain: { source: 'main', border: 'mainBorder' },
          camera: { source: 'cam', border: 'camBorder' },
          info: { source: 'info', border: 'infoBorder' },
          name: { source: 'name', inset: 12, fontScale: 0.45 },
        },
      },
      '[Layout] Person 2': { sources: { camera: { source: 'cam2', border: 'cam2Border' } } },
    },
    scenes: {
      '16:9': { participants: [{ layout: '[Layout] Person 1' }] },
      camera: { participants: [{ layout: '[Layout] Person 1', config: { contentMain: null } }] },
      soon: {
        participants: [{ layout: '[Layout] Person 1' }],
        standby: {
          text: { source: 'soonText', region: soonRegion },
          widgets: [{ source: 'clips', region: clipsRegion }],
        },
      },
      brb: {
        participants: [{ layout: '[Layout] Person 1' }],
        standby: {
          text: { source: 'brbText', region: brbRegion },
          widgets: [{ source: 'clips', region: clipsRegion }],
        },
      },
      both: {
        participants: [{ layout: '[Layout] Person 1' }, { layout: '[Layout] Person 2' }],
        standby: {},
      },
    },
  };
  // The line: no content width at the center, a 30x558 border box, and a 12x540 color source
  const content = { x: 960, y: 276, width: 0, height: 528 };
  const line = { x: 945, y: 261, width: 30, height: 558 };
  const lineSize = { width: 12, height: 540 };

  /** OBS state with the items of each scene shown or not; items get ids in listed order from 1. */
  const stateOf = (scenes: Record<string, Record<string, boolean>>, borderWidths: Record<string, number> = {}) => ({
    sceneItems: Object.fromEntries(
      Object.entries(scenes).map(([scene, items]) => [
        scene,
        Object.entries(items).map(([sourceName, sceneItemEnabled], index) => ({
          sourceName,
          sceneItemId: index + 1,
          sceneItemEnabled,
        })),
      ]),
    ),
    borderWidths,
  });
  const collapsed = { mainBorder: 12, camBorder: 12, infoBorder: 12 };
  const bySource = (steps: ReturnType<typeof planLayoutMoves>) =>
    Object.fromEntries(steps.map((step) => [step.source, step]));

  it('collapses the regions into the line, keeps the main border showing, then brings in the overlays', () => {
    const from16x9 = stateOf({
      '[Layout] Person 1': { main: true, mainBorder: true, cam: true, camBorder: true, infoBorder: false },
    });
    const steps = bySource(planLayoutMoves(standby, 'soon', from16x9));

    expect(steps['[Layout] Person 1']).toMatchObject({ visible: true, delay: 0 });
    for (const source of ['main', 'cam', 'info', 'name']) {
      expect(steps[source]).toMatchObject({ region: content, visible: false, delay: 0 });
      expect(steps[source].fontSize).toBeUndefined();
    }
    expect(steps.mainBorder).toMatchObject({ region: line, size: lineSize, visible: true, delay: 0 });
    expect(steps.camBorder).toMatchObject({ region: line, size: lineSize, visible: false, delay: 0 });
    expect(steps.infoBorder).toMatchObject({ region: line, size: lineSize, visible: false });
    expect(steps.soonText).toEqual({
      scene: '[Widget] Standby Text',
      source: 'soonText',
      kind: 'text',
      filterName: 'Move: soonText',
      region: soonRegion,
      size: undefined,
      visible: true,
      duration: 300,
      delay: 300,
    });
    expect(steps.clips).toMatchObject({ scene: '[Scene] Canvas', kind: 'widget', region: clipsRegion, delay: 300 });
    // Unused text waits left of the cut at the line's middle; without a reported size, by its box
    expect(steps.brbText).toMatchObject({ region: { ...brbRegion, x: 960 - 640 }, visible: false, delay: 0 });
    expect(Object.values(steps).some((step) => step.handoff)).toBe(false);
  });

  it('hides text that covers its box past the right edge far enough left that none of it shows', () => {
    const sized = (width: number, height: number) => ({
      ...stateOf({}),
      sceneItems: {
        '[Widget] Standby Text': [
          { sourceName: 'brbText', sceneItemId: 1, sceneItemEnabled: false, sourceSize: { width, height } },
        ],
      },
    });
    const hiddenX = (width: number, height: number) =>
      bySource(planLayoutMoves(standby, 'soon', sized(width, height))).brbText.region?.x;

    // 1100x200 text covers the 640x120 box at 0.6 scale, 660 wide: 20 px past the box
    expect(hiddenX(1100, 200)).toBe(960 - 660);
    // Text relatively taller than the box covers it at the box width, overflowing above and below instead
    expect(hiddenX(300, 200)).toBe(960 - 640);
    // An empty text reports no height, and the box decides
    expect(hiddenX(0, 0)).toBe(960 - 640);
  });

  it('keeps whichever main border shows now, and the first one when none does', () => {
    const fromCamera = stateOf({ '[Layout] Person 1': { mainBorder: false, camBorder: true } });

    expect(bySource(planLayoutMoves(standby, 'soon', fromCamera)).camBorder.visible).toBe(true);
    expect(bySource(planLayoutMoves(standby, 'soon', fromCamera)).mainBorder.visible).toBe(false);
    expect(bySource(planLayoutMoves(standby, 'soon')).mainBorder.visible).toBe(true);
  });

  it('collapses later participants without a line of their own', () => {
    const steps = bySource(planLayoutMoves(standby, 'both'));

    expect(steps['[Layout] Person 2']).toMatchObject({ visible: true });
    expect(steps.cam2Border).toMatchObject({ region: line, visible: false });
    expect(steps.mainBorder.visible).toBe(true);
    expect(steps.soonText).toMatchObject({ visible: false, delay: 0 });
  });

  it('slides one text back before the next slides out, leaving a shared widget where it is', () => {
    const fromSoon = stateOf(
      {
        '[Scene] Canvas': { '[Layout] Person 1': true, clips: true },
        '[Widget] Standby Text': { soonText: true, brbText: false },
        '[Layout] Person 1': { mainBorder: true },
      },
      collapsed,
    );
    const steps = bySource(planLayoutMoves(standby, 'brb', fromSoon));

    expect(steps.soonText).toMatchObject({ region: { ...soonRegion, x: 260 }, visible: false, delay: 0 });
    expect(steps.brbText).toMatchObject({ region: brbRegion, visible: true, delay: 300 });
    expect(steps.clips).toMatchObject({ visible: true, delay: 0 });
    expect(steps.mainBorder).toMatchObject({ region: line, visible: true, delay: 300 });
  });

  it('leaving standby, slides the text back and fades the widgets first, then grows the regions out', () => {
    const fromSoon = stateOf(
      {
        '[Scene] Canvas': { clips: true },
        '[Widget] Standby Text': { soonText: true },
        '[Layout] Person 1': { main: false, mainBorder: true, cam: false, camBorder: false, infoBorder: false },
      },
      collapsed,
    );
    const steps = bySource(planLayoutMoves(standby, '16:9', fromSoon));

    expect(steps.soonText).toMatchObject({ region: { ...soonRegion, x: 260 }, visible: false, delay: 0 });
    expect(steps.clips).toMatchObject({ region: clipsRegion, visible: false, delay: 0 });
    expect(steps['[Layout] Person 1']).toMatchObject({ visible: true, delay: 300 });
    expect(steps.main).toMatchObject({ visible: true, delay: 300 });
    expect(steps.camBorder).toMatchObject({ visible: true, delay: 300 });
    // The main border already holds the line, so nothing is handed off
    expect(Object.values(steps).some((step) => step.handoff)).toBe(false);
  });

  it("hands the line to the new layout's main border in one frame when another border holds it", () => {
    const fromSoon = stateOf({ '[Layout] Person 1': { mainBorder: true, cam: false, camBorder: false } }, collapsed);
    const steps = bySource(planLayoutMoves(standby, 'camera', fromSoon));

    expect(steps.camBorder).toMatchObject({ visible: true, handoff: { sceneItemId: 3, visible: true } });
    expect(steps.mainBorder).toMatchObject({ visible: false, handoff: { sceneItemId: 1, visible: false } });
    // A border OBS did not report is left alone
    expect(steps.infoBorder.handoff).toBeUndefined();
    expect(steps.cam.handoff).toBeUndefined();
  });

  it('leaves a border showing in the new layout as it is when the line changes hands', () => {
    const fromCameraStandby = stateOf(
      { '[Layout] Person 1': { mainBorder: false, camBorder: true, infoBorder: false } },
      collapsed,
    );
    const steps = bySource(planLayoutMoves(standby, '16:9', fromCameraStandby));

    expect(steps.mainBorder.handoff).toEqual({ sceneItemId: 1, visible: true });
    expect(steps.camBorder).toMatchObject({ visible: true });
    expect(steps.camBorder.handoff).toBeUndefined();
    expect(steps.infoBorder.handoff).toBeUndefined();
  });

  it('hands nothing off outside standby, or without a main border to take the line', () => {
    const fromCamera = stateOf(
      { '[Layout] Person 1': { mainBorder: false, camBorder: true } },
      { mainBorder: 1, camBorder: 402 },
    );
    const noCameraBorder: ScenesConfig = {
      ...standby,
      participants: {
        '[Layout] Person 1': {
          sources: { contentMain: { source: 'main', border: 'mainBorder' }, camera: { source: 'cam' } },
        },
      },
    };
    const fromSoon = stateOf({ '[Layout] Person 1': { mainBorder: true } }, collapsed);

    expect(planLayoutMoves(standby, '16:9', fromCamera).some((step) => step.handoff)).toBe(false);
    expect(planLayoutMoves(noCameraBorder, 'camera', fromSoon).some((step) => step.handoff)).toBe(false);
    expect(planLayoutMoves(standby, 'camera', stateOf({}, collapsed)).some((step) => step.handoff)).toBe(false);
  });

  it('rejects a standby scene without standby settings', () => {
    expect(() => planLayoutMoves({ ...standby, standby: undefined }, 'soon')).toThrow(
      'Scene "soon" is a standby scene, but the layout config has no standby settings',
    );
  });
});
