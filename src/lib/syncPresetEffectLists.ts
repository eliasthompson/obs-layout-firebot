import type { CreatePresetEffectListOptions, PresetEffectList } from '@/lib/createPresetEffectList';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { createPresetEffectList, presetSceneKey, SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';

export interface PresetSync {
  /** One preset per scene key, by preset id. */
  presets: Record<string, PresetEffectList>;
  /** Scene keys that got a new preset. */
  added: string[];
  /** Names of presets dropped because their scene key is gone. */
  removed: string[];
  /** Names of kept presets whose script now reads another config variable. */
  updated: string[];
}

/** The script effect's stored `configVariable` parameter, which a variable change rewrites. */
const configVariableParameter = (preset: PresetEffectList) => {
  const script = preset.effects.list.find(
    (effect) => effect.type === 'firebot:customscript' && effect.scriptName === SCRIPT_FILE_NAME,
  );
  return (script?.parameters as undefined | { configVariable?: { value?: unknown } })?.configVariable;
};

/**
 * Make a presets map hold exactly one preset per scene key of the config. Presets that still match keep their id, so
 * anything in Firebot that calls them keeps working; presets for removed keys are dropped and missing ones created.
 */
export const syncPresetEffectLists = (
  presets: Record<string, PresetEffectList>,
  config: ScenesConfig,
  { createId }: Pick<CreatePresetEffectListOptions, 'createId'> = {},
): PresetSync => {
  const configVariable = config.firebot?.variable ?? DEFAULT_CONFIG_VARIABLE;
  const synced: Record<string, PresetEffectList> = {};
  const removed: string[] = [];
  const updated: string[] = [];

  for (const [id, preset] of Object.entries(presets)) {
    if (!(presetSceneKey(preset) in config.scenes)) {
      removed.push(preset.name);
      continue;
    }
    const parameter = configVariableParameter(preset);
    if (parameter && parameter.value !== configVariable) {
      parameter.value = configVariable;
      updated.push(preset.name);
    }
    synced[id] = preset;
  }

  const keys = new Set(Object.values(synced).map(presetSceneKey));
  const added = Object.keys(config.scenes).filter((sceneKey) => !keys.has(sceneKey));
  for (const sceneKey of added) {
    const preset = createPresetEffectList(sceneKey, config.container, { configVariable, createId });
    synced[preset.id] = preset;
  }

  return { presets: synced, added, removed, updated };
};
