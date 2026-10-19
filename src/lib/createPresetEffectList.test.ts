import { describe, expect, it } from 'vitest';

import { createPresetEffectList, presetSceneKey } from '@/lib/createPresetEffectList';
import { getDefaultParameters } from '@/lib/firebotScript';

describe('createPresetEffectList', () => {
  it('builds a preset that changes to the container and runs the script with the scene key', () => {
    let next = 0;
    const preset = createPresetEffectList('[Scene] 16:9 1P', '[Scene] Program', {
      createId: () => `id-${String(++next)}`,
    });
    const definitions = getDefaultParameters();

    expect(preset).toEqual({
      id: 'id-1',
      name: '[Scene] 16:9 1P',
      args: [],
      effects: {
        id: 'id-2',
        list: [
          { id: 'id-3', type: 'ebiggz:obs-change-scene', active: true, sceneName: '[Scene] Program', custom: false },
          {
            id: 'id-4',
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

  it('points the script at another config variable', () => {
    const preset = createPresetEffectList('key', 'container', { configVariable: 'otherScenes' });
    const parameters = preset.effects.list[1]?.parameters as { configVariable: { value: string } };

    expect(parameters.configVariable.value).toBe('otherScenes');
  });

  it('uses random ids by default', () => {
    const preset = createPresetEffectList('key', 'container');

    expect(preset.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(preset.id).not.toBe(preset.effects.id);
  });
});

describe('presetSceneKey', () => {
  it('reads the scene key from the script effect', () => {
    const preset = createPresetEffectList('key', 'container');
    preset.name = 'Renamed by hand';

    expect(presetSceneKey(preset)).toBe('key');
  });

  it('falls back to the preset name without a usable script parameter', () => {
    const preset = createPresetEffectList('key', 'container');
    preset.effects.list = [{ type: 'firebot:customscript', parameters: { sceneKey: { value: '' } } }];
    expect(presetSceneKey(preset)).toBe('key');

    preset.effects.list = [];
    expect(presetSceneKey(preset)).toBe('key');
  });
});
