import type { LayoutConfig } from '@eliasthompson/obs-layout-generator';

import { mergeLayoutConfigs } from '@eliasthompson/obs-layout-generator';

import type { CanvasScenesConfig, SceneParticipant } from '@/types/ScenesConfig';

/**
 * The layout config a shown participant gets, built up in layers: the config's `config`, then the participant's pool
 * `config`, then what the scene says for them, then each modifier in effect that applies to them. Each layer merges
 * over the last region by region.
 *
 * @param config - The config, for the base layer, the pool, and the modifiers.
 * @param participant - The scene's entry for the participant.
 * @param modifiers - The modifiers in effect, in the order to apply them.
 * @returns The merged config, ready for obs-layout-generator.
 */
export const resolveParticipantConfig = (
  config: Pick<CanvasScenesConfig, 'config' | 'modifiers' | 'participants'>,
  participant: SceneParticipant,
  modifiers: readonly string[],
): LayoutConfig => {
  // Record lookups are typed as always present; the layout key is checked before the plan runs
  const pool = participant.layout in config.participants ? config.participants[participant.layout].config : undefined;
  const layers = [
    config.config ?? {},
    pool ?? {},
    participant.config ?? {},
    ...modifiers.flatMap((name) => {
      const modifier = config.modifiers?.[name];
      return modifier && (!modifier.participants || modifier.participants.includes(participant.layout))
        ? [modifier.config ?? {}]
        : [];
    }),
  ];

  return layers.reduce(mergeLayoutConfigs, {});
};
