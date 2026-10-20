import { v5 as uuidV5 } from 'uuid';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { getDefaultParameters } from '@/lib/firebotScript';

export const SCRIPT_FILE_NAME = 'obs-layout.js';

/** Namespace of every id the presets derive, so they never collide with ids made anywhere else. */
export const PRESET_ID_NAMESPACE = '24f82010-5a2c-45c3-aa1d-04fa6cd37d55';

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

/**
 * The preset that applies one scene key: it runs the script with that key, and the script brings the container on air
 * when program shows another scene. The parameters use Firebot's stored shape, the parameter definitions with a
 * `value` each. Its ids derive from the config variable and the scene key, so every deploy on every machine makes the
 * same preset, and whatever in Firebot calls it keeps working.
 */
export const createPresetEffectList = (
  sceneKey: string,
  configVariable: string = DEFAULT_CONFIG_VARIABLE,
): PresetEffectList => {
  const id = uuidV5(`${configVariable}\u0000${sceneKey}`, PRESET_ID_NAMESPACE);
  const definitions = getDefaultParameters();
  const values: Record<keyof typeof definitions, string> = { sceneKey, configVariable };

  return {
    id,
    name: sceneKey,
    args: [],
    effects: {
      id: uuidV5('effects', id),
      list: [
        {
          id: uuidV5('script', id),
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

/** One preset per scene key of the config, by preset id, reading the config from its Firebot variable. */
export const createPresetEffectLists = (config: ScenesConfig): Record<string, PresetEffectList> =>
  Object.fromEntries(
    Object.keys(config.scenes).map((sceneKey) => {
      const preset = createPresetEffectList(sceneKey, config.firebot?.variable ?? DEFAULT_CONFIG_VARIABLE);
      return [preset.id, preset];
    }),
  );
