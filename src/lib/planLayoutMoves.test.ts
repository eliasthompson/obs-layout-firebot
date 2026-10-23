import { generateLayout } from '@eliasthompson/obs-layout-generator';
import { describe, expect, it } from 'vitest';

import type { ObsState } from '@/types/ObsState';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import { growRegion, shrinkRegion } from '@/lib/growRegion';
import { overlaysLeave, planLayoutMoves } from '@/lib/planLayoutMoves';

const neverRegion = { x: -1, y: -1, width: -1, height: -1 };
/** A canvas with no margins, padding, or borders, so a 16:9 main region fills it and leaves no side room */
const bare = { canvasMarginTop: 0, canvasMarginBottom: 0, canvasPadding: 0, regionBorder: 0 };

const options = { canvasPadding: 24, canvasMarginTop: 105, canvasMarginBottom: 105, layoutGap: 18, regionBorder: 6 };

const config: CanvasScenesConfig = {
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
    const inset: CanvasScenesConfig = {
      ...config,
      participants: {
        L: {
          sources: {
            info: { source: 'info', border: 'infoBorder' },
            name: { source: 'name' },
            camera: { source: 'cam' },
          },
          regions: { info: { inset: 12 }, name: { inset: 12, fontSizeMax: 48 }, camera: { inset: 0 } },
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
    const bounded: CanvasScenesConfig = {
      ...config,
      participants: {
        L: {
          sources: { name: { source: 'name' } },
          regions: { name: { inset: 12, fontSizeMin: 24, fontSizeMax: 48 } },
        },
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

    // A third of the 810 px camera is capped by the library at 130; 106 px inside the insets fits 84 px of unmeasured
    // text, so the font stays at its 48 px maximum
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
    const plain: CanvasScenesConfig = {
      ...config,
      participants: { L: { sources: { name: { source: 'name' } }, regions: { name: { fontSizeMin: 60 } } } },
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

  it('sizes the font from how tall the source renders at its current size, and assumes a line height otherwise', () => {
    const measured: CanvasScenesConfig = {
      ...config,
      participants: {
        L: {
          sources: { name: { source: 'name' } },
          regions: { name: { inset: 12, fontSizeMin: 24, fontSizeMax: 100 } },
        },
      },
      scenes: { tall: { participants: [{ layout: 'L', config: { contentMain: null, hasName: true } }] } },
    };
    const stateWith = (sourceHeight: number, fontSize?: number) =>
      ({
        sceneItems: {
          L: [
            {
              sourceName: 'name',
              sceneItemId: 1,
              sceneItemEnabled: true,
              sourceSize: { width: 300, height: sourceHeight },
            },
          ],
        },
        borderThickness: {},
        fontSizes: fontSize === undefined ? {} : { name: fontSize },
      }) satisfies ObsState as ObsState;
    const fontSize = (sourceHeight: number, size?: number) =>
      planLayoutMoves(measured, 'tall', stateWith(sourceHeight, size)).find((step) => step.source === 'name')?.fontSize;

    // The name is 106 px tall inside its insets. A 40 px font that renders 60 px tall has a line height of 1.5
    expect(fontSize(60, 40)).toBe(70);
    // An empty text renders at no height, and a source without a font read, as if a line were 1.25 times its size
    expect(fontSize(0, 40)).toBe(84);
    expect(fontSize(60)).toBe(84);
    expect(planLayoutMoves(measured, 'tall').find((step) => step.source === 'name')?.fontSize).toBe(84);
  });

  it("layers region settings from the config's regions, the participant's, and the scene's", () => {
    const [metric] = generateLayout([{ hasName: true, info: { aspectRatio: '250:49' } }], options);
    const layered: CanvasScenesConfig = {
      ...config,
      regions: { info: { inset: 12 }, name: { inset: 12, fontSizeMin: 24, fontSizeMax: 48 } },
      participants: {
        L: { sources: { info: { source: 'info' }, name: { source: 'name' } }, regions: { name: { fontSizeMax: 40 } } },
      },
      scenes: {
        plain: { participants: [{ layout: 'L', config: { hasName: true, info: { aspectRatio: '250:49' } } }] },
        tight: {
          participants: [
            {
              layout: 'L',
              config: { hasName: true, info: { aspectRatio: '250:49' } },
              regions: { info: { inset: 0 }, name: { fontSizeMax: 30 } },
            },
          ],
        },
      },
    };
    const stepFor = (sceneKey: string, source: string) =>
      planLayoutMoves(layered, sceneKey).find((step) => step.source === source);

    // The config's 12 px inset applies to the info strip, and its ratio holds inside it as in the inset test above
    expect(stepFor('plain', 'info')).toMatchObject({ region: { x: 1512, y: 147, width: 366, height: 72 } });
    // The participant's 40 px cap wins over the config's 48
    expect(stepFor('plain', 'name')?.fontSize).toBe(40);
    // The scene removes the inset and lowers the cap again
    expect(stepFor('tight', 'info')).toMatchObject({ region: metric.info });
    expect(stepFor('tight', 'name')?.fontSize).toBe(30);
  });

  it('sizes a hidden name for where it waits, and leaves the font size alone for a name sent away', () => {
    const hiddenName: CanvasScenesConfig = {
      ...config,
      participants: {
        L: { sources: { name: { source: 'name' }, camera: { source: 'cam' } }, regions: { name: { fontSizeMax: 48 } } },
      },
      scenes: {
        shown: { participants: [{ layout: 'L', config: { hasName: true } }] },
        one: { participants: [{ layout: 'L', config: { hasName: false } }] },
        away: { participants: [{ layout: 'L', config: { camera: null, contentMain: null } }] },
      },
    };
    const nameIn = (sceneKey: string) => planLayoutMoves(hiddenName, sceneKey).find((step) => step.source === 'name');

    // It fades in at the size it shows at, since a font size cannot be animated
    expect(nameIn('one')?.visible).toBe(false);
    expect(nameIn('one')?.fontSize).toBe(nameIn('shown')?.fontSize);
    expect(nameIn('away')?.fontSize).toBeUndefined();
  });

  it('frames the name itself with a name border, without a border box', () => {
    const [metric] = generateLayout([{ hasName: true }], options);
    const steps = planLayoutMoves(config, '16:9 1P');

    expect(steps[6]).toMatchObject({
      source: '[Border] Name 1',
      region: growRegion(metric.name ?? neverRegion, 9),
      size: { width: metric.name?.width, height: metric.name?.height },
    });
  });

  it('moves a green screen camera border with the camera as if it framed it, but fades it out', () => {
    const [metric] = generateLayout([{ camera: { isGreenScreen: true } }], options);
    const steps = planLayoutMoves(config, 'Green');
    const camera = steps.find((step) => step.source === '[Group] Camera 1');
    const border = steps.find((step) => step.source === '[Border] Camera 1');

    expect(metric.camera?.hasBorder).toBe(false);
    expect(camera).toMatchObject({ region: metric.camera, visible: true });
    expect(border).toMatchObject({
      region: growRegion(metric.camera ?? neverRegion, 6 + 9),
      size: { width: (metric.camera?.width ?? 0) + 12, height: (metric.camera?.height ?? 0) + 12 },
      visible: false,
    });
    // The content border still frames its region
    expect(steps.find((step) => step.source === '[Border] Content 1')).toMatchObject({ visible: true });
  });

  it("overlaps an attached region's color source with its neighbor's on exactly the shared border", () => {
    const attached: CanvasScenesConfig = {
      ...config,
      participants: {
        L: {
          sources: {
            contentMain: { source: 'main', border: 'mainBorder' },
            info: { source: 'info', border: 'infoBorder' },
          },
        },
      },
      scenes: { one: { participants: [{ layout: 'L', config: { info: { isMainAttached: true } } }] } },
    };
    const steps = planLayoutMoves(attached, 'one');
    const main = steps.find((step) => step.source === 'mainBorder');
    const info = steps.find((step) => step.source === 'infoBorder');
    const mainRight = (main?.region?.x ?? 0) + 9 + (main?.size?.width ?? 0);
    const infoLeft = (info?.region?.x ?? 0) + 9;

    // The shadow padding sits outside both, so it never pushes the two borders apart
    expect(mainRight - infoLeft).toBe(6);
  });

  it('sends unused regions to a 1x1 point at the canvas center, hidden, with the scene duration', () => {
    const steps = planLayoutMoves(config, 'Camera 1P');
    const content = steps.find((step) => step.source === '[Group] Content 1');
    const border = steps.find((step) => step.source === '[Border] Content 1');

    expect(content).toMatchObject({ region: { x: 960, y: 540, width: 1, height: 1 }, visible: false, duration: 500 });
    expect(border).toMatchObject({ region: { x: 960, y: 540, width: 1, height: 1 }, size: { width: 1, height: 1 } });
  });

  it("centers that point on the layout area, so uneven margins move it, the scene's own options included", () => {
    const portrait = {
      ...config,
      options: { ...options, canvasWidth: 1080, canvasHeight: 1920, canvasMarginTop: 144, canvasMarginBottom: 422 },
    };
    const unused = (scenes: typeof config.scenes) =>
      planLayoutMoves({ ...portrait, scenes }, 'Camera 1P').find((step) => step.source === '[Group] Content 1')?.region;

    expect(unused(config.scenes)).toEqual({ x: 540, y: 821, width: 1, height: 1 });
    expect(
      unused({ 'Camera 1P': { ...config.scenes['Camera 1P'], options: { canvasMarginLeft: 100 } } }),
    ).toMatchObject({ x: 590 });
  });

  it('hides a name the layout leaves out where it would be, and moves nothing else for it', () => {
    const [named] = generateLayout([{ contentMain: null, hasName: true }], options);
    const steps = planLayoutMoves(config, 'Camera 1P');
    const name = steps.find((step) => step.source === '[Widget] Name 1');
    const border = steps.find((step) => step.source === '[Border] Name 1');

    expect(named.name).toBeDefined();
    expect(name).toMatchObject({ region: named.name, visible: false });
    expect(border).toMatchObject({ region: growRegion(named.name ?? neverRegion, 9), visible: false });
    expect(steps.find((step) => step.source === '[Group] Camera 1')).toMatchObject({
      region: named.camera,
      visible: true,
    });
  });

  it('sends a name with no host left to the canvas center', () => {
    const steps = planLayoutMoves(
      {
        ...config,
        scenes: {
          empty: { participants: [{ layout: '[Layout] Person 1', config: { camera: null, contentMain: null } }] },
        },
      },
      'empty',
    );

    expect(steps.find((step) => step.source === '[Widget] Name 1')).toMatchObject({
      region: { x: 960, y: 540, width: 1, height: 1 },
      visible: false,
    });
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
    const bare: CanvasScenesConfig = {
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

  it('sets the border item out by the padding, whatever it is, with its color source filling the border box', () => {
    const [metric] = generateLayout([{}], options);
    const wide: CanvasScenesConfig = {
      ...config,
      borderPadding: 5000,
      scenes: { one: { participants: [{ layout: '[Layout] Person 1' }] } },
    };
    const box = growRegion(metric.camera ?? neverRegion, 6);

    expect(planLayoutMoves(wide, 'one').find((step) => step.source === '[Border] Camera 1')).toMatchObject({
      region: growRegion(box, 5000),
      size: { width: box.width, height: box.height },
    });
  });

  it('lays out several participants in input order', () => {
    const metrics = generateLayout([{}, {}], options);
    const steps = planLayoutMoves(config, '2P');

    expect(steps.find((step) => step.source === '[Group] Camera 1')).toMatchObject({ region: metrics[0].camera });
    expect(steps.find((step) => step.source === '[Group] Camera 2')).toMatchObject({ region: metrics[1].camera });
    expect(steps.filter((step) => step.kind === 'layout').every((step) => step.visible)).toBe(true);
  });

  it('rejects unknown scene keys and participants, and a layout scene without participants', () => {
    expect(() => planLayoutMoves(config, 'nope')).toThrow('No scene "nope"');
    expect(() =>
      planLayoutMoves({ ...config, scenes: { bad: { participants: [{ layout: 'ghost' }] } } }, 'bad'),
    ).toThrow('unknown participant "ghost"');
    expect(() => planLayoutMoves({ ...config, scenes: { empty: {} } }, 'empty')).toThrow('shows no participants');
  });

  it('layers the config, the pool, the scene, and the modifiers switched on, as the scene allows', () => {
    const layered: CanvasScenesConfig = {
      ...config,
      config: { hasName: true },
      participants: {
        ...config.participants,
        '[Layout] Person 1': { ...config.participants['[Layout] Person 1'], config: { hasName: false } },
      },
      modifiers: {
        Keyed: { config: { camera: { isGreenScreen: true } } },
        Names: { config: { hasName: true } },
      },
      scenes: {
        plain: { participants: [{ layout: '[Layout] Person 1' }] },
        framed: { participants: [{ layout: '[Layout] Person 1' }], modifiers: { Keyed: false, Names: true } },
      },
    };
    const visible = (sceneKey: string, modifiers: string[], source: string) =>
      planLayoutMoves(layered, sceneKey, undefined, modifiers).find((step) => step.source === source)?.visible;

    // The pool's hasName: false wins over the config's hasName: true until the Names modifier is on
    expect(visible('plain', [], '[Widget] Name 1')).toBe(false);
    expect(visible('plain', ['Names'], '[Widget] Name 1')).toBe(true);
    // Keyed fades the camera border out, unless the scene forces it off; framed also forces Names on
    expect(visible('plain', ['Keyed'], '[Border] Camera 1')).toBe(false);
    expect(visible('framed', ['Keyed'], '[Border] Camera 1')).toBe(true);
    expect(visible('framed', [], '[Widget] Name 1')).toBe(true);
  });
});

describe('planLayoutMoves standby', () => {
  // Text OBS has not sized yet stands in a box the line suggests: 540 wide, 270 tall, centered on the line, 30 past it
  const unsizedText = { x: 990, y: 405, width: 540, height: 270 };
  const clipsRegion = { x: 100, y: 300, width: 600, height: 480 };
  const standby: CanvasScenesConfig = {
    container: '[Scene] Canvas',
    options,
    borderPadding: 9,
    duration: 300,
    standby: { textScene: '[Widget] Standby Text', lineLength: 540 },
    participants: {
      '[Layout] Person 1': {
        sources: {
          contentMain: { source: 'main', border: 'mainBorder' },
          camera: { source: 'cam', border: 'camBorder' },
          info: { source: 'info', border: 'infoBorder' },
          name: { source: 'name' },
        },
        regions: { name: { inset: 12, fontSizeMax: 48 } },
      },
      '[Layout] Person 2': { sources: { camera: { source: 'cam2', border: 'cam2Border' } } },
    },
    scenes: {
      '16:9': { participants: [{ layout: '[Layout] Person 1' }] },
      camera: { participants: [{ layout: '[Layout] Person 1', config: { contentMain: null } }] },
      soon: {
        participants: [{ layout: '[Layout] Person 1' }],
        standby: { text: 'soonText', widgets: [{ source: 'clips', region: clipsRegion }] },
      },
      brb: {
        participants: [{ layout: '[Layout] Person 1' }],
        standby: { text: 'brbText', widgets: [{ source: 'clips', region: clipsRegion }] },
      },
      both: {
        participants: [{ layout: '[Layout] Person 1' }, { layout: '[Layout] Person 2' }],
        standby: {},
      },
      everyone: { standby: { line: '[Layout] Person 2' } },
    },
  };
  // The line: no content width at the center, a 30x558 border item, and a 12x540 color source
  const content = { x: 960, y: 276, width: 0, height: 528 };
  const line = { x: 945, y: 261, width: 30, height: 558 };
  const lineSize = { width: 12, height: 540 };

  /** OBS state with the items of each scene shown or not; items get ids in listed order from 1. */
  const stateOf = (scenes: Record<string, Record<string, boolean>>, borderThickness: Record<string, number> = {}) => ({
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
    borderThickness,
    fontSizes: {},
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
      region: unsizedText,
      size: undefined,
      visible: true,
      duration: 300,
      delay: 300,
    });
    expect(steps.clips).toMatchObject({ scene: '[Scene] Canvas', kind: 'widget', region: clipsRegion, delay: 300 });
    // Unused text waits left of the cut at the line's middle, by its own width
    expect(steps.brbText).toMatchObject({ region: { ...unsizedText, x: 960 - 540 }, visible: false, delay: 0 });
    expect(Object.values(steps).some((step) => step.handoff)).toBe(false);
  });

  it('shows text at its rendered size, centered on the line a gap past it, and hides it left of the cut', () => {
    const sized = (width: number, height: number) => ({
      ...stateOf({}),
      sceneItems: {
        '[Widget] Standby Text': [
          { sourceName: 'brbText', sceneItemId: 1, sceneItemEnabled: false, sourceSize: { width, height } },
        ],
      },
    });
    const region = (sceneKey: string, width: number, height: number) =>
      bySource(planLayoutMoves(standby, sceneKey, sized(width, height))).brbText.region;

    // 1100x200 text sits 30 px past the cut at 960, centered on the canvas's 540
    expect(region('brb', 1100, 200)).toEqual({ x: 990, y: 440, width: 1100, height: 200 });
    // Hidden, the same text waits entirely left of the cut
    expect(region('soon', 1100, 200)).toEqual({ x: 960 - 1100, y: 440, width: 1100, height: 200 });
    // An empty text reports no height, so the stand-in box decides
    expect(region('soon', 0, 0)).toEqual({ ...unsizedText, x: 960 - 540 });
    // The gap is configurable
    const wider = { ...standby, standby: { textScene: '[Widget] Standby Text', lineLength: 540, textGap: 50 } };
    expect(bySource(planLayoutMoves(wider, 'brb', sized(100, 50))).brbText.region).toEqual({
      x: 1010,
      y: 515,
      width: 100,
      height: 50,
    });
  });

  describe('on a portrait canvas, whose line runs across it', () => {
    const portrait: CanvasScenesConfig = {
      ...standby,
      options: { ...options, canvasWidth: 1080, canvasHeight: 1920 },
      standby: { textScene: '[Widget] Standby Text', lineLength: 720 },
    };
    // The line: no content height at the middle, a 738x30 border item, and a 720x12 color source
    const across = { x: 186, y: 960, width: 708, height: 0 };
    const acrossLine = { x: 171, y: 945, width: 738, height: 30 };
    const acrossSize = { width: 720, height: 12 };
    // Unsized text stands in a 720x360 box, centered on the line, 30 above it
    const unsizedAbove = { x: 180, y: 570, width: 720, height: 360 };

    it('collapses the regions to no height across the middle, and slides text up out of it', () => {
      const steps = bySource(planLayoutMoves(portrait, 'soon'));

      expect(steps.main).toMatchObject({ region: across, visible: false });
      expect(steps.mainBorder).toMatchObject({ region: acrossLine, size: acrossSize, visible: true });
      expect(steps.soonText).toMatchObject({ region: unsizedAbove, visible: true, delay: 300 });
      // Unused text waits below the cut, where the text scene's crop hides it
      expect(steps.brbText).toMatchObject({ region: { ...unsizedAbove, y: 960 }, visible: false });
    });

    it('centers text at its rendered size above the line, the gap between them', () => {
      const sized = {
        ...stateOf({}),
        sceneItems: {
          '[Widget] Standby Text': [
            { sourceName: 'brbText', sceneItemId: 1, sceneItemEnabled: false, sourceSize: { width: 600, height: 200 } },
          ],
        },
      };

      expect(bySource(planLayoutMoves(portrait, 'brb', sized)).brbText.region).toEqual({
        x: 240,
        y: 730,
        width: 600,
        height: 200,
      });
    });

    it('knows a border on the line by its height, and hands the line over leaving standby', () => {
      const fromSoon = stateOf({ '[Layout] Person 1': { mainBorder: true, cam: false, camBorder: false } }, collapsed);
      // A border as wide as the line is not on it; only the line's thickness across says so
      const wideButOpen = stateOf(
        { '[Layout] Person 1': { mainBorder: true, cam: false, camBorder: false } },
        { mainBorder: 720, camBorder: 720 },
      );

      expect(bySource(planLayoutMoves(portrait, 'camera', fromSoon)).camBorder.handoff).toEqual({
        sceneItemId: 3,
        visible: true,
      });
      expect(planLayoutMoves(portrait, 'camera', wideButOpen).some((step) => step.handoff)).toBe(false);
    });
  });

  it('collapses every participant when a standby scene lists none, with the named one on the line', () => {
    const steps = bySource(planLayoutMoves(standby, 'everyone'));

    expect(steps['[Layout] Person 1']).toMatchObject({ visible: true });
    expect(steps['[Layout] Person 2']).toMatchObject({ visible: true });
    expect(steps.cam2Border).toMatchObject({ region: line, size: lineSize, visible: true });
    expect(steps.mainBorder).toMatchObject({ region: line, visible: false });
    expect(() => planLayoutMoves({ ...standby, scenes: { bad: { standby: { line: 'ghost' } } } }, 'bad')).toThrow(
      'puts unknown participant "ghost" on the standby line',
    );
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

    expect(steps.soonText).toMatchObject({ region: { ...unsizedText, x: 420 }, visible: false, delay: 0 });
    expect(steps.brbText).toMatchObject({ region: unsizedText, visible: true, delay: 300 });
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

    expect(steps.soonText).toMatchObject({ region: { ...unsizedText, x: 420 }, visible: false, delay: 0 });
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
    const noCameraBorder: CanvasScenesConfig = {
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

  it('tells whether overlays leave first, and holds the regions back when another canvas says they do', () => {
    const fromSoon = stateOf({ '[Widget] Standby Text': { soonText: true } });

    expect(overlaysLeave(standby, '16:9', fromSoon)).toBe(true);
    expect(overlaysLeave(standby, 'soon', fromSoon)).toBe(false);
    expect(overlaysLeave(standby, '16:9', stateOf({}))).toBe(false);
    expect(overlaysLeave({ ...standby, standby: undefined }, '16:9', fromSoon)).toBe(false);
    expect(overlaysLeave(standby, 'ghost', fromSoon)).toBe(true);
    // Nothing leaves on this canvas, but another canvas of the preset waits, so this one does too
    expect(bySource(planLayoutMoves(standby, '16:9', stateOf({}))).main.delay).toBe(0);
    expect(bySource(planLayoutMoves(standby, '16:9', stateOf({}), [], true)).main.delay).toBe(300);
  });

  it('rejects a standby scene without standby settings', () => {
    expect(() => planLayoutMoves({ ...standby, standby: undefined }, 'soon')).toThrow(
      'Scene "soon" is a standby scene, but the layout config has no standby settings',
    );
  });
});
