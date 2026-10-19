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
        name: { source: 'Name', fontScale: 0.45 },
      },
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
          'missing filters, run `obs-layout-firebot setup`: "Opacity" on "P1", "Move: Opacity" on "P1", "Move: CamBorder" on "P1", "Opacity" on "CamBorder", "Move: Opacity" on "CamBorder", "Move: Width" on "CamBorder", "Move: Height" on "CamBorder"',
      },
    ]);
  });

  it('warns about a font scale on a source that is not text, and says nothing when the kind is unknown', () => {
    expect(findConfigProblems(config, { ...inventory, inputKinds: { Name: 'browser_source' } })).toEqual([
      { severity: 'warning', message: '"Name" (name) has a fontScale but is a browser_source, not a text source' },
    ]);
    expect(findConfigProblems(config, { ...inventory, inputKinds: {} })).toEqual([]);
  });

  it('checks scene entries for empty participant lists and unknown layouts', () => {
    const scenes = { empty: { participants: [] }, ghost: { participants: [{ layout: 'P2' }] } };

    expect(findConfigProblems({ ...config, scenes }, inventory)).toEqual([
      { severity: 'warning', message: 'scene "empty" shows no participants' },
      { severity: 'error', message: 'scene "ghost" uses unknown participant "P2"' },
    ]);
  });
});
