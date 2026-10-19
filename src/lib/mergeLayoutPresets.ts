import type { PresetEffectList } from '@/lib/createPresetEffectList';

import { SCRIPT_FILE_NAME } from '@/lib/createPresetEffectList';

/** A preset as found in a Firebot profile, which may have been made by hand or by another tool. */
export interface StoredPreset {
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

/** Whether a preset runs the layout script. Those are the presets the presets file owns. */
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
