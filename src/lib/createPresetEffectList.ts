import { v5 as uuidV5 } from 'uuid';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { getDefaultParameters } from '@/lib/firebotScript';

export const SCRIPT_FILE_NAME = 'obs-layout.js';

/** Namespace of every id the presets derive, so they never collide with ids made anywhere else. */
export const PRESET_ID_NAMESPACE = '24f82010-5a2c-45c3-aa1d-04fa6cd37d55';

/** The modifier name that stands for every modifier, in the reset preset. */
export const EVERY_MODIFIER = '*';

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

/** What a preset asks the script to do: apply a scene, switch a modifier, or switch every modifier off. */
export type PresetAction =
  { kind: 'modifier'; modifier: string; enabled: boolean } | { kind: 'reset' } | { kind: 'scene'; sceneKey: string };

/** The script parameter values a preset stores for its action. */
const parameterValues = (action: PresetAction, configVariable: string) => ({
  sceneKey: action.kind === 'scene' ? action.sceneKey : '',
  configVariable,
  modifier: action.kind === 'modifier' ? action.modifier : action.kind === 'reset' ? EVERY_MODIFIER : '',
  modifierState: action.kind === 'modifier' && !action.enabled ? 'off' : 'on',
});

/** What the preset is called in Firebot. */
const presetName = (action: PresetAction) => {
  switch (action.kind) {
    case 'modifier':
      return `${action.modifier} ${action.enabled ? 'On' : 'Off'}`;
    case 'reset':
      return 'Reset Modifiers';
    case 'scene':
      return action.sceneKey;
  }
};

/** The id a preset derives from its action, so a scene preset keeps the id it has had since version 2. */
const presetId = (action: PresetAction, configVariable: string) => {
  switch (action.kind) {
    case 'modifier':
      return uuidV5(
        `${configVariable}\u0000modifier\u0000${action.modifier}\u0000${action.enabled ? 'on' : 'off'}`,
        PRESET_ID_NAMESPACE,
      );
    case 'reset':
      return uuidV5(`${configVariable}\u0000reset`, PRESET_ID_NAMESPACE);
    case 'scene':
      return uuidV5(`${configVariable}\u0000${action.sceneKey}`, PRESET_ID_NAMESPACE);
  }
};

/**
 * The preset for one action: it runs the script with the action's parameters, and the script brings the container on
 * air when program shows another scene. A scene key alone stands for applying that scene. The parameters use
 * Firebot's stored shape, the parameter definitions with a `value` each. Its ids derive from the config variable and
 * the action, so every deploy on every machine makes the same preset, and whatever in Firebot calls it keeps working.
 */
export const createPresetEffectList = (
  action: PresetAction | string,
  configVariable: string = DEFAULT_CONFIG_VARIABLE,
): PresetEffectList => {
  const resolved: PresetAction = typeof action === 'string' ? { kind: 'scene', sceneKey: action } : action;
  const id = presetId(resolved, configVariable);
  const definitions = getDefaultParameters();
  const values: Record<keyof typeof definitions, string> = parameterValues(resolved, configVariable);

  return {
    id,
    name: presetName(resolved),
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

/**
 * Every preset the config calls for, by preset id: one per scene key, an on and an off per modifier, and a reset when
 * there are modifiers, all reading the config from its Firebot variable.
 */
export const createPresetEffectLists = (config: ScenesConfig): Record<string, PresetEffectList> => {
  const configVariable = config.firebot?.variable ?? DEFAULT_CONFIG_VARIABLE;
  const modifierNames = Object.keys(config.modifiers ?? {});
  const actions: PresetAction[] = [
    ...Object.keys(config.scenes).map((sceneKey): PresetAction => ({ kind: 'scene', sceneKey })),
    ...modifierNames.flatMap((modifier): PresetAction[] => [
      { kind: 'modifier', modifier, enabled: true },
      { kind: 'modifier', modifier, enabled: false },
    ]),
    ...(modifierNames.length ? [{ kind: 'reset' } as const] : []),
  ];

  return Object.fromEntries(
    actions.map((action) => {
      const preset = createPresetEffectList(action, configVariable);
      return [preset.id, preset];
    }),
  );
};
