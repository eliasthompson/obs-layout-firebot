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

describe('createPresetEffectLists', () => {
  it("makes one preset per scene key, by id, for the config's variable", () => {
    const config = { container: 'C', participants: {}, scenes: { A: { participants: [] }, B: { participants: [] } } };
    const a = createPresetEffectList('A');
    const b = createPresetEffectList('B');

    expect(createPresetEffectLists(config)).toEqual({ [a.id]: a, [b.id]: b });
    expect(Object.values(createPresetEffectLists({ ...config, firebot: { variable: 'v' } }))[0]).toEqual(
      createPresetEffectList('A', 'v'),
    );
  });
});
