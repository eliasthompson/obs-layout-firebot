import { describe, expect, it } from 'vitest';

import type { ObsInventory } from '@/types/ObsInventory';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { findConfigProblems } from '@/lib/findConfigProblems';

const config: ScenesConfig = {
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

  describe('border color', () => {
    const colored: ScenesConfig = { ...config, borderColor: { filter: 'Stroke' } };

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
    const standby: ScenesConfig = {
      ...config,
      options: { regionBorder: 6 },
      borderPadding: 9,
      standby: { textScene: 'Text', lineHeight: 540 },
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
        'scenes use standby, but the config has no standby settings (textScene, lineHeight)',
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

  it('checks scene entries for empty participant lists and unknown layouts', () => {
    const scenes = { empty: { participants: [] }, ghost: { participants: [{ layout: 'P2' }] } };

    expect(findConfigProblems({ ...config, scenes }, inventory)).toEqual([
      { severity: 'error', message: 'scene "empty" shows no participants' },
      { severity: 'error', message: 'scene "ghost" uses unknown participant "P2"' },
    ]);
  });

  it('checks modifiers, the modifiers scenes force, and the participant on the standby line', () => {
    const withModifiers: ScenesConfig = {
      ...config,
      options: { regionBorder: 6 },
      standby: { textScene: 'Text', lineHeight: 540 },
      modifiers: { Keyed: { config: {}, participants: ['P1', 'P9'] }, Names: { config: {} } },
      scenes: {
        solo: { participants: [{ layout: 'P1' }], modifiers: { Keyed: true, Ghost: false } },
        soon: { standby: { line: 'P8' } },
      },
    };
    const withText = { ...inventory, sceneItems: { ...inventory.sceneItems, Program: ['Text', 'P1'], Text: [] } };

    expect(messages(findConfigProblems(withModifiers, withText))).toEqual([
      'modifier "Keyed" names unknown participant "P9"',
      'scene "solo" forces unknown modifier "Ghost"',
      'scene "soon" puts unknown participant "P8" on the standby line',
    ]);
  });
});
