import { describe, expect, it } from 'vitest';

import type { ObsInventory } from '@/types/ObsInventory';
import type { CanvasScenesConfig, ScenesConfig } from '@/types/ScenesConfig';

import { findConfigProblems, findSceneProblems } from '@/lib/findConfigProblems';

const config: CanvasScenesConfig = {
  container: 'Program',
  participants: {
    P1: {
      sources: {
        camera: { source: 'Cam', border: 'CamBorder' },
        name: { source: 'Name' },
      },
      regions: { name: { fontSizeMax: 48 } },
    },
  },
  scenes: { solo: { participants: [{ layout: 'P1' }] } },
};

const inventory: ObsInventory = {
  sceneItems: { Program: ['P1'], P1: ['Cam', 'CamBorder', 'Name'] },
  filters: {
    Program: ['Move: P1'],
    P1: ['Opacity', 'Move: Opacity', 'Move: Cam', 'Move: CamBorder', 'Move: Name'],
    Cam: ['Opacity', 'Move: Opacity'],
    CamBorder: ['Stroke', 'Opacity', 'Move: Opacity', 'Move: Width', 'Move: Height'],
    Name: ['Opacity', 'Move: Opacity'],
  },
  inputKinds: { CamBorder: 'color_source_v3', Name: 'text_gdiplus_v3' },
  itemBounds: {
    P1: {
      Cam: { boundsType: 'OBS_BOUNDS_STRETCH', cropToBounds: false },
      CamBorder: { boundsType: 'OBS_BOUNDS_NONE', cropToBounds: false },
      Name: { boundsType: 'OBS_BOUNDS_MAX_ONLY', cropToBounds: false },
    },
  },
};

const messages = (problems: ReturnType<typeof findConfigProblems>) => problems.map((problem) => problem.message);

describe('findConfigProblems', () => {
  it('finds nothing wrong with a complete installation', () => {
    expect(findConfigProblems(config, inventory)).toEqual([]);
  });

  it('reports missing scenes and skips their items', () => {
    const problems = findConfigProblems(config, { ...inventory, sceneItems: { Program: ['P1'] } });

    expect(messages(problems)).toEqual(['layout scene "P1" does not exist in OBS']);
    expect(problems[0]?.severity).toBe('error');
  });

  it('reports a missing container and a layout that is not inside it', () => {
    expect(
      messages(findConfigProblems(config, { ...inventory, sceneItems: { P1: inventory.sceneItems.P1 } })),
    ).toContain('container scene "Program" does not exist in OBS');
    expect(
      messages(findConfigProblems(config, { ...inventory, sceneItems: { ...inventory.sceneItems, Program: [] } })),
    ).toContain('layout scene "P1" is not an item of the container "Program"');
  });

  it('reports sources and borders that are not items of their layout scene', () => {
    const problems = findConfigProblems(config, { ...inventory, sceneItems: { ...inventory.sceneItems, P1: ['Cam'] } });

    expect(messages(problems)).toEqual(['"P1" has no item "CamBorder" (camera)', '"P1" has no item "Name" (name)']);
  });

  it('lists missing filters in one error with the setup hint', () => {
    const problems = findConfigProblems(config, {
      ...inventory,
      filters: { ...inventory.filters, CamBorder: ['Stroke'], P1: ['Move: Cam', 'Move: Name'] },
    });

    expect(problems).toEqual([
      {
        severity: 'error',
        message:
          'missing filters, run `obs-layout-firebot obs:deploy`: "Opacity" on "P1", "Move: Opacity" on "P1", "Move: CamBorder" on "P1", "Opacity" on "CamBorder", "Move: Opacity" on "CamBorder", "Move: Width" on "CamBorder", "Move: Height" on "CamBorder"',
      },
    ]);
  });

  it('reports toggled items whose scene or group is missing, items missing from them, and items the layout moves', () => {
    const toggled: CanvasScenesConfig = {
      ...config,
      items: {
        Voice: { visible: true },
        Mic: { scene: 'Voice', visible: true },
        Gone: { scene: 'Nowhere', visible: false },
        Cam: { scene: 'P1', visible: true },
      },
    };

    expect(
      messages(
        findConfigProblems(toggled, {
          ...inventory,
          sceneItems: { ...inventory.sceneItems, Program: ['P1', 'Voice'], Voice: [] },
        }),
      ),
    ).toEqual([
      '"Voice" has no item "Mic" (item "Mic")',
      'item "Gone": scene or group "Nowhere" does not exist in OBS',
      'item "Cam" is "Cam" in "P1", which the layout shows and hides itself',
    ]);
  });

  describe('item bounds', () => {
    const bounded: CanvasScenesConfig = {
      ...config,
      regions: { camera: { boundsType: 'scale to outer bounds', cropToBounds: true } },
    };

    it('lists items whose bounds differ from the config in one error with the setup hint', () => {
      expect(findConfigProblems(bounded, inventory)).toEqual([
        {
          severity: 'error',
          message:
            'item bounds differ from the config, run `obs-layout-firebot obs:deploy`: "Cam" in "P1" (OBS_BOUNDS_STRETCH, not OBS_BOUNDS_SCALE_OUTER, not cropped to bounds)',
        },
      ]);
      expect(
        messages(
          findConfigProblems(
            { ...config, regions: { camera: { cropToBounds: false } } },
            { ...inventory, itemBounds: { P1: { Cam: { boundsType: 'OBS_BOUNDS_STRETCH', cropToBounds: true } } } },
          ),
        ),
      ).toEqual([
        'item bounds differ from the config, run `obs-layout-firebot obs:deploy`: "Cam" in "P1" (cropped to bounds)',
      ]);
    });

    it('finds nothing wrong once setup has applied them, and skips items it has no bounds for', () => {
      expect(
        findConfigProblems(bounded, {
          ...inventory,
          itemBounds: {
            P1: { ...inventory.itemBounds.P1, Cam: { boundsType: 'OBS_BOUNDS_SCALE_OUTER', cropToBounds: true } },
          },
        }),
      ).toEqual([]);
      expect(findConfigProblems(bounded, { ...inventory, itemBounds: {} })).toEqual([]);
      expect(findConfigProblems(bounded, { ...inventory, itemBounds: { P1: {} } })).toEqual([]);
    });

    it('reports a crop to bounds that OBS does not report, which needs OBS 30.2', () => {
      expect(
        messages(
          findConfigProblems(
            { ...config, regions: { camera: { cropToBounds: true } } },
            { ...inventory, itemBounds: { P1: { Cam: { boundsType: 'OBS_BOUNDS_STRETCH' } } } },
          ),
        ),
      ).toEqual(['"Cam" in "P1" sets cropToBounds, which needs OBS 30.2 or later']);
    });
  });

  describe('border color', () => {
    const colored: CanvasScenesConfig = { ...config, borderColor: { filter: 'Stroke' } };

    it('requires the color move filter on every border that has the color filter', () => {
      expect(messages(findConfigProblems(colored, inventory))).toEqual([
        'missing filters, run `obs-layout-firebot obs:deploy`: "Move: Color" on "CamBorder"',
      ]);
      expect(
        findConfigProblems(colored, {
          ...inventory,
          filters: { ...inventory.filters, CamBorder: [...inventory.filters.CamBorder, 'Move: Color'] },
        }),
      ).toEqual([]);
    });

    it('reports borders without the color filter itself, which setup cannot add', () => {
      expect(
        messages(
          findConfigProblems(colored, {
            ...inventory,
            filters: { ...inventory.filters, CamBorder: ['Opacity', 'Move: Opacity', 'Move: Width', 'Move: Height'] },
          }),
        ),
      ).toEqual(['borderColor.filter "Stroke" is missing on "CamBorder"; add it in OBS or change borderColor']);
    });
  });

  it('warns about font sizes on a source that is not text, and says nothing when the kind is unknown', () => {
    expect(findConfigProblems(config, { ...inventory, inputKinds: { Name: 'browser_source' } })).toEqual([
      { severity: 'warning', message: '"Name" (name) has font sizes but is a browser_source, not a text source' },
    ]);
    // Font sizes from the config's regions count too
    expect(
      findConfigProblems(
        { ...config, regions: { camera: { fontSizeMin: 10 } } },
        { ...inventory, inputKinds: { Cam: 'dshow_input' } },
      ),
    ).toEqual([
      { severity: 'warning', message: '"Cam" (camera) has font sizes but is a dshow_input, not a text source' },
    ]);
    expect(findConfigProblems(config, { ...inventory, inputKinds: {} })).toEqual([]);
  });

  describe('standby', () => {
    const region = { x: 0, y: 0, width: 10, height: 10 };
    const standby: CanvasScenesConfig = {
      ...config,
      options: { regionBorder: 6 },
      borderPadding: 9,
      standby: { textScene: 'Text', lineLength: 540 },
      scenes: {
        ...config.scenes,
        soon: {
          participants: [{ layout: 'P1' }],
          standby: { text: 'Soon', widgets: [{ source: 'Clips', region }] },
        },
      },
    };
    const standbyInventory: ObsInventory = {
      ...inventory,
      sceneItems: { ...inventory.sceneItems, Program: ['Text', 'Clips', 'P1'], Text: ['Soon'] },
      filters: {
        ...inventory.filters,
        Program: ['Move: P1', 'Move: Clips'],
        Text: ['Move: Soon'],
        Clips: ['Opacity', 'Move: Opacity'],
      },
    };

    const withoutScene = (scene: string) =>
      Object.fromEntries(Object.entries(standbyInventory.sceneItems).filter(([name]) => name !== scene));

    it('finds nothing wrong with a complete installation, where text needs no fade filters', () => {
      expect(findConfigProblems(standby, standbyInventory)).toEqual([]);
    });

    it('needs the standby settings and a border for the line', () => {
      expect(messages(findConfigProblems({ ...standby, standby: undefined }, standbyInventory))).toEqual([
        'scenes use standby, but the config has no standby settings (textScene, lineLength)',
      ]);
      expect(messages(findConfigProblems({ ...standby, options: {} }, standbyInventory))).toEqual([
        'the standby line is two borders wide, so options.regionBorder (0) must be above 0',
      ]);
    });

    it('reports a missing text scene, one outside the container, and one above the layouts', () => {
      expect(messages(findConfigProblems(standby, { ...standbyInventory, sceneItems: withoutScene('Text') }))).toEqual([
        'standby text scene "Text" does not exist in OBS',
      ]);
      expect(
        messages(
          findConfigProblems(standby, {
            ...standbyInventory,
            sceneItems: { ...standbyInventory.sceneItems, Program: ['Clips', 'P1'] },
          }),
        ),
      ).toEqual(['standby text scene "Text" is not an item of the container "Program"']);
      expect(
        findConfigProblems(standby, {
          ...standbyInventory,
          sceneItems: { ...standbyInventory.sceneItems, Program: ['P1', 'Clips', 'Text'] },
        }),
      ).toEqual([
        {
          severity: 'warning',
          message:
            'standby text scene "Text" sits above "P1" in "Program"; move it below so the line covers the text as it slides out',
        },
      ]);
    });

    it('reports standby items missing from their scenes, and skips the text scene check without a container', () => {
      expect(
        messages(
          findConfigProblems(standby, {
            ...standbyInventory,
            sceneItems: { ...standbyInventory.sceneItems, Program: ['Text', 'P1'], Text: [] },
          }),
        ),
      ).toEqual(['"Text" has no item "Soon" (standby text)', '"Program" has no item "Clips" (standby widget)']);
      expect(
        messages(findConfigProblems(standby, { ...standbyInventory, sceneItems: withoutScene('Program') })),
      ).toEqual(['container scene "Program" does not exist in OBS']);
    });
  });
});

describe('findSceneProblems', () => {
  const canvases: ScenesConfig['canvases'] = {
    landscape: {
      container: 'Program',
      participants: { P1: { sources: {} }, P2: { sources: {} } },
      standby: { textScene: 'Text', lineLength: 540 },
    },
    portrait: { canvas: 'Aitum Vertical', container: 'Program', participants: { P1: { sources: {} } } },
  };

  it('finds nothing wrong with scenes every canvas shows', () => {
    expect(findSceneProblems({ canvases, scenes: { solo: { participants: [{ layout: 'P1' }] } } })).toEqual([]);
  });

  it('reports empty participant lists, and scenes no canvas shows with why', () => {
    const scenes: ScenesConfig['scenes'] = {
      empty: { participants: [] },
      ghost: { participants: [{ layout: 'P9' }] },
      nowhere: { participants: [{ layout: 'P1' }], canvases: { landscape: false, portrait: false } },
    };

    expect(findSceneProblems({ canvases, scenes })).toEqual([
      { severity: 'error', message: 'scene "empty" shows no participants' },
      {
        severity: 'error',
        message:
          'scene "ghost" shows on no canvas (landscape: it shows "P9", which the canvas does not have; portrait: it shows "P9", which the canvas does not have)',
      },
      {
        severity: 'error',
        message:
          'scene "nowhere" shows on no canvas (landscape: the scene leaves it out; portrait: the scene leaves it out)',
      },
    ]);
  });

  it('warns about a scene a canvas leaves out, unless the scene leaves the canvas out itself', () => {
    const scenes: ScenesConfig['scenes'] = {
      duo: { participants: [{ layout: 'P1' }, { layout: 'P2' }] },
      landscapeDuo: { participants: [{ layout: 'P1' }, { layout: 'P2' }], canvases: { portrait: false } },
      soon: { standby: {} },
    };

    expect(findSceneProblems({ canvases, scenes })).toEqual([
      {
        severity: 'warning',
        message:
          'scene "duo" is left out of the "portrait" canvas, because it shows "P2", which the canvas does not have; set its canvases: { portrait: false } if that is on purpose',
      },
      {
        severity: 'warning',
        message:
          'scene "soon" is left out of the "portrait" canvas, because it is a standby scene, and the canvas has no standby settings; set its canvases: { portrait: false } if that is on purpose',
      },
    ]);
  });

  it('checks the participants of modifiers on every canvas, and the modifiers scenes force', () => {
    const config: ScenesConfig = {
      canvases,
      modifiers: { Keyed: { config: {}, participants: ['P1', 'P2', 'P9'] }, Names: { config: {} } },
      scenes: { solo: { participants: [{ layout: 'P1' }], modifiers: { Keyed: true, Ghost: false } } },
    };

    expect(findSceneProblems(config).map((problem) => problem.message)).toEqual([
      'modifier "Keyed" names participant "P9", which no canvas has',
      'scene "solo" forces unknown modifier "Ghost"',
    ]);
  });

  it('checks the items scenes and modifiers toggle against every canvas', () => {
    const config: ScenesConfig = {
      canvases: { ...canvases, landscape: { ...canvases.landscape, items: { Voice: { visible: true } } } },
      modifiers: { Quiet: { items: { Voice: false, Music: false } } },
      scenes: { solo: { participants: [{ layout: 'P1' }], items: { Voice: true, Alerts: false } } },
    };

    expect(findSceneProblems(config).map((problem) => problem.message)).toEqual([
      'modifier "Quiet" toggles item "Music", which no canvas has',
      'scene "solo" toggles item "Alerts", which no canvas has',
    ]);
  });
});
