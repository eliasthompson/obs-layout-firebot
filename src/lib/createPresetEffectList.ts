import { randomUUID } from 'node:crypto';

import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { getDefaultParameters } from '@/lib/firebotScript';

export const SCRIPT_FILE_NAME = 'obs-layout.js';

/** A Firebot preset effect list as stored in the profile's `effects/preset-effect-lists.json`. */
export interface PresetEffectList {
  id: string;
  name: string;
  args: { name: string }[];
  effects: {
    id: string;
    list: Record<string, unknown>[];
  };
  sortTags: string[];
}

export interface CreatePresetEffectListOptions {
  /** Custom variable the script reads the config from. Default "layoutScenes". */
  configVariable?: string;
  createId?: () => string;
}

/**
 * The preset that applies one scene key: change to the container scene, then run the script with that key. The
 * parameters use Firebot's stored shape, the parameter definitions with a `value` each.
 */
export const createPresetEffectList = (
  sceneKey: string,
  container: string,
  { configVariable = DEFAULT_CONFIG_VARIABLE, createId = randomUUID }: CreatePresetEffectListOptions = {},
): PresetEffectList => {
  const definitions = getDefaultParameters();
  const values: Record<keyof typeof definitions, string> = { sceneKey, configVariable };

  return {
    id: createId(),
    name: sceneKey,
    args: [],
    effects: {
      id: createId(),
      list: [
        { id: createId(), type: 'ebiggz:obs-change-scene', active: true, sceneName: container, custom: false },
        {
          id: createId(),
          type: 'firebot:customscript',
          active: true,
          scriptName: SCRIPT_FILE_NAME,
          parameters: Object.fromEntries(
            Object.entries(definitions).map(([name, definition]) => [
              name,
              { ...definition, value: values[name as keyof typeof definitions] },
            ]),
          ),
        },
      ],
    },
    sortTags: [],
  };
};

/** The scene key a stored preset applies, from its script effect, else its name. */
export const presetSceneKey = (preset: PresetEffectList): string => {
  const script = preset.effects.list.find((effect) => effect.type === 'firebot:customscript');
  const parameters = script?.parameters as undefined | { sceneKey?: { value?: unknown } };
  const value = parameters?.sceneKey?.value;

  return typeof value === 'string' && value ? value : preset.name;
};
