import type { PresetEffectList } from '@/lib/createPresetEffectList';

import { containsValues } from '@/lib/containsValues';
import { SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';

/** A preset as found in a Firebot profile, which may have been made by hand or by another tool. */
export interface StoredPreset {
  name?: unknown;
  effects?: { list?: { type?: unknown; scriptName?: unknown }[] };
}

export interface LayoutPresetMerge {
  presets: Record<string, StoredPreset>;
  /** Presets of the profile that do not run the layout script, left as they were. */
  kept: number;
  /** Layout presets of the profile, all replaced. */
  replaced: number;
  added: number;
}

export interface LayoutPresetDifference {
  /** Names of our presets the profile does not hold as they are. */
  stale: string[];
  /** Ids of layout presets the profile holds that are not ours, such as ones for scene keys that are gone. */
  leftOver: string[];
}

/** Whether a preset runs the layout script. Those are the presets the config owns. */
export const isLayoutPreset = (preset: StoredPreset) =>
  preset.effects?.list?.some(
    (effect) => effect.type === 'firebot:customscript' && effect.scriptName === SCRIPT_FILE_NAME,
  ) ?? false;

/** The profile's presets with every layout preset replaced by ours. Presets made for other things stay as they are. */
export const mergeLayoutPresets = (
  profile: Record<string, StoredPreset>,
  ours: Record<string, PresetEffectList>,
): LayoutPresetMerge => {
  const others = Object.entries(profile).filter(([, preset]) => !isLayoutPreset(preset));

  return {
    presets: { ...Object.fromEntries(others), ...ours },
    kept: others.length,
    replaced: Object.keys(profile).length - others.length,
    added: Object.keys(ours).length,
  };
};

/**
 * How the profile's layout presets differ from ours. A stored preset that holds everything ours does matches, so
 * fields Firebot adds when it saves a preset do not count as a difference.
 */
export const compareLayoutPresets = (
  profile: Record<string, StoredPreset>,
  ours: Record<string, PresetEffectList>,
): LayoutPresetDifference => ({
  stale: Object.entries(ours)
    .filter(([id, preset]) => !containsValues(preset, profile[id]))
    .map(([, preset]) => preset.name),
  leftOver: Object.entries(profile)
    .filter(([id, preset]) => isLayoutPreset(preset) && !(id in ours))
    .map(([id]) => id),
});
