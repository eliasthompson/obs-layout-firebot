import { v5 as uuidV5 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { createPresetEffectList, createPresetEffectLists, PRESET_ID_NAMESPACE } from '@/lib/createPresetEffectList';
import { getDefaultParameters } from '@/lib/firebotScript';

describe('createPresetEffectList', () => {
  it('builds a preset that runs the script with the scene key, with ids derived from the variable and key', () => {
    const preset = createPresetEffectList('[Scene] 16:9 1P');
    const definitions = getDefaultParameters();
    const id = uuidV5('layoutScenes\u0000[Scene] 16:9 1P', PRESET_ID_NAMESPACE);

    expect(preset).toEqual({
      id,
      name: '[Scene] 16:9 1P',
      args: [],
      effects: {
        id: uuidV5('effects', id),
        list: [
          {
            id: uuidV5('script', id),
            type: 'firebot:customscript',
            active: true,
            scriptName: 'obs-layout.js',
            parameters: {
              sceneKey: { ...definitions.sceneKey, value: '[Scene] 16:9 1P' },
              configVariable: { ...definitions.configVariable, value: 'layoutScenes' },
              modifier: { ...definitions.modifier, value: '' },
              modifierState: { ...definitions.modifierState, value: 'on' },
            },
          },
        ],
      },
      sortTags: [],
    });
  });

  it('makes the same preset every time, and another one for another key or config variable', () => {
    const preset = createPresetEffectList('key');

    expect(createPresetEffectList('key')).toEqual(preset);
    expect(createPresetEffectList('other').id).not.toBe(preset.id);

    const elsewhere = createPresetEffectList('key', 'otherScenes');
    const parameters = elsewhere.effects.list[0]?.parameters as { configVariable: { value: string } };
    expect(elsewhere.id).not.toBe(preset.id);
    expect(parameters.configVariable.value).toBe('otherScenes');
  });
});

describe('createPresetEffectList for modifiers', () => {
  it('builds on, off, and reset presets that run the script with the modifier parameters', () => {
    const on = createPresetEffectList({ kind: 'modifier', modifier: 'Keyed', enabled: true });
    const off = createPresetEffectList({ kind: 'modifier', modifier: 'Keyed', enabled: false });
    const reset = createPresetEffectList({ kind: 'reset' });
    const values = (preset: typeof on) =>
      Object.fromEntries(
        Object.entries(preset.effects.list[0]?.parameters as Record<string, { value: string }>).map(
          ([name, { value }]) => [name, value],
        ),
      );

    expect(on.name).toBe('Keyed On');
    expect(values(on)).toEqual({
      sceneKey: '',
      configVariable: 'layoutScenes',
      modifier: 'Keyed',
      modifierState: 'on',
    });
    expect(off.name).toBe('Keyed Off');
    expect(values(off)).toMatchObject({ modifier: 'Keyed', modifierState: 'off' });
    expect(reset.name).toBe('Reset Modifiers');
    expect(values(reset)).toMatchObject({ modifier: '*', modifierState: 'on' });
    expect(new Set([createPresetEffectList('Keyed').id, off.id, on.id, reset.id]).size).toBe(4);
  });
});

describe('createPresetEffectLists', () => {
  it("makes one preset per scene key, by id, for the config's variable", () => {
    const config = { canvases: {}, scenes: { A: { participants: [] }, B: { participants: [] } } };
    const a = createPresetEffectList('A');
    const b = createPresetEffectList('B');

    expect(createPresetEffectLists(config)).toEqual({ [a.id]: a, [b.id]: b });
    expect(Object.values(createPresetEffectLists({ ...config, firebot: { variable: 'v' } }))[0]).toEqual(
      createPresetEffectList('A', 'v'),
    );
  });

  it('adds an on and an off preset per modifier, and a reset, after the scenes', () => {
    const config = {
      canvases: {},
      scenes: { A: { participants: [] } },
      modifiers: { Keyed: { config: {} }, Timer: { config: {} } },
    };

    expect(Object.values(createPresetEffectLists(config)).map((preset) => preset.name)).toEqual([
      'A',
      'Keyed On',
      'Keyed Off',
      'Timer On',
      'Timer Off',
      'Reset Modifiers',
    ]);
  });
});
