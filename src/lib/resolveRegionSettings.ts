import type {
  CanvasScenesConfig,
  LayoutRegionName,
  ParticipantPoolEntry,
  RegionSettings,
  SceneRegionSettingsMap,
} from '@/types/ScenesConfig';

/** A layer's settings for a region, without the fields it leaves undefined, so they fall through to the layer below. */
const set = (settings: RegionSettings | undefined): RegionSettings =>
  Object.fromEntries(Object.entries(settings ?? {}).filter(([, value]) => value !== undefined));

/**
 * How a participant's source sits in a region, built up in layers: the config's `regions` for every participant,
 * then the participant's own, then what a scene says for them. Each field comes from the last layer that sets it.
 *
 * @param config - The config, for its `regions`.
 * @param entry - The participant's pool entry, for its `regions`.
 * @param region - The region.
 * @param sceneRegions - The scene's region settings for the participant, when planning a scene.
 */
export const resolveRegionSettings = (
  config: Pick<CanvasScenesConfig, 'regions'>,
  entry: Pick<ParticipantPoolEntry, 'regions'>,
  region: LayoutRegionName,
  sceneRegions?: SceneRegionSettingsMap,
): RegionSettings => ({
  ...set(config.regions?.[region]),
  ...set(entry.regions?.[region]),
  ...set(sceneRegions?.[region]),
});
