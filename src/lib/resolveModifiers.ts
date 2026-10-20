import type { SceneBinding, ScenesConfig } from '@/types/ScenesConfig';

/**
 * The modifiers in effect for a scene: the ones switched on, as the config orders them, less those the scene forces
 * off, plus those it forces on. Names the config does not define are ignored.
 *
 * @param config - The config, for the modifiers it defines and their order.
 * @param scene - The scene being applied, for the modifiers it forces.
 * @param active - Names of the modifiers switched on.
 * @returns The names in effect, in the config's order.
 */
export const resolveModifiers = (
  config: Pick<ScenesConfig, 'modifiers'>,
  scene: Pick<SceneBinding, 'modifiers'>,
  active: readonly string[],
): string[] =>
  Object.keys(config.modifiers ?? {}).filter((name) => {
    const forced = scene.modifiers?.[name];
    return forced ?? active.includes(name);
  });
