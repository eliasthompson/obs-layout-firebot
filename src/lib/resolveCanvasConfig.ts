import { mergeLayoutConfigs } from '@eliasthompson/obs-layout-generator';

import type {
  CanvasScenesConfig,
  LayoutRegionName,
  Modifier,
  ParticipantPoolEntry,
  RegionSettings,
  RegionSettingsMap,
  SceneBinding,
  ScenesConfig,
} from '@/types/ScenesConfig';

export interface ResolvedCanvas {
  /** The canvas's view of the config. */
  config: CanvasScenesConfig;
  /**
   * Scenes the canvas leaves out, by scene key: why, or `null` when the scene leaves the canvas out itself with
   * `canvases: { <canvas>: false }`.
   */
  leftOut: Record<string, null | string>;
}

/** A layer's settings for a region, without the fields it leaves undefined, so they fall through to the layer below. */
const defined = (settings: RegionSettings | undefined): RegionSettings =>
  Object.fromEntries(Object.entries(settings ?? {}).filter(([, value]) => value !== undefined));

/** Two region settings layers as one, field by field, the upper winning. */
const mergeRegions = (below: RegionSettingsMap | undefined, above: RegionSettingsMap | undefined) => {
  if (!below || !above) return above ?? below;
  const regions = [...new Set([...Object.keys(below), ...Object.keys(above)])] as LayoutRegionName[];
  return Object.fromEntries(
    regions.map((region) => [region, { ...defined(below[region]), ...defined(above[region]) }]),
  ) as RegionSettingsMap;
};

/**
 * A canvas's participants keyed by their OBS scenes, and how to rename a participant key to its scene.
 *
 * @param canvasKey - The canvas, for the error.
 * @param participants - The canvas's participants, by key.
 * @returns The participants by scene, and the renaming, which leaves a key the canvas does not have as it is.
 */
const keyByScene = (canvasKey: string, participants: Record<string, ParticipantPoolEntry>) => {
  const byScene: Record<string, ParticipantPoolEntry> = {};
  const keys: Record<string, string> = {};

  for (const [key, { scene = key, ...entry }] of Object.entries(participants)) {
    if (Object.hasOwn(byScene, scene)) {
      const other = Object.keys(keys).find((otherKey) => keys[otherKey] === scene);
      throw new Error(
        `config.canvases.${canvasKey}.participants: "${String(other)}" and "${key}" both use the OBS scene "${scene}"`,
      );
    }
    byScene[scene] = entry;
    keys[key] = scene;
  }

  return { byScene, sceneOf: (key: string) => (Object.hasOwn(keys, key) ? keys[key] : key) };
};

/**
 * Resolve one canvas's view of a config: the canvas's container, options, participants, and standby settings, its
 * `config` and `regions` merged over the config's, and every scene it shows with its changes for the canvas applied.
 * A scene that leaves the canvas out, shows a participant the canvas does not have, or needs standby settings the
 * canvas lacks is left out of the view. The view keys participants by their OBS scenes, and renames them so wherever
 * the scenes and modifiers name them, so what lays out a canvas only ever deals in its OBS scenes.
 *
 * @param config - The whole config.
 * @param canvasKey - The canvas, by its key in `canvases`.
 * @returns The canvas's view, and the scenes it leaves out with why.
 */
export const resolveCanvas = (config: ScenesConfig, canvasKey: string): ResolvedCanvas => {
  if (!Object.hasOwn(config.canvases, canvasKey)) {
    throw new Error(
      `No canvas "${canvasKey}" in the layout config. Known canvases: ${Object.keys(config.canvases).join(', ')}`,
    );
  }
  const { canvases, scenes, modifiers, config: sharedLayoutConfig, regions: sharedRegions, ...shared } = config;
  const {
    container,
    options,
    config: canvasLayoutConfig,
    regions: canvasRegions,
    participants,
    standby,
  } = canvases[canvasKey];
  const layoutConfig =
    sharedLayoutConfig && canvasLayoutConfig
      ? mergeLayoutConfigs(sharedLayoutConfig, canvasLayoutConfig)
      : (canvasLayoutConfig ?? sharedLayoutConfig);
  const regions = mergeRegions(sharedRegions, canvasRegions);
  const { byScene, sceneOf } = keyByScene(canvasKey, participants);
  const canvasScenes: Record<string, SceneBinding> = {};
  const leftOut: Record<string, null | string> = {};

  for (const [sceneKey, { canvases: sceneCanvases, ...scene }] of Object.entries(scenes)) {
    const change = sceneCanvases?.[canvasKey];
    if (change === false) {
      leftOut[sceneKey] = null;
      continue;
    }
    const shown = change?.participants ?? scene.participants;
    // A canvas's own standby text, widgets, or line only change a standby scene
    const sceneStandby = scene.standby && change?.standby ? { ...scene.standby, ...change.standby } : scene.standby;
    const missing = [
      ...new Set(
        [
          ...(shown ?? []).map(({ layout }) => layout),
          ...(sceneStandby?.line === undefined ? [] : [sceneStandby.line]),
        ].filter((layout) => !Object.hasOwn(participants, layout)),
      ),
    ];
    if (missing.length) {
      leftOut[sceneKey] =
        `it shows ${missing.map((layout) => `"${layout}"`).join(', ')}, which the canvas does not have`;
      continue;
    }
    if (sceneStandby && !standby) {
      leftOut[sceneKey] = 'it is a standby scene, and the canvas has no standby settings';
      continue;
    }
    canvasScenes[sceneKey] = {
      ...scene,
      ...(shown
        ? { participants: shown.map((participant) => ({ ...participant, layout: sceneOf(participant.layout) })) }
        : {}),
      ...(change?.options ? { options: { ...scene.options, ...change.options } } : {}),
      ...(sceneStandby
        ? {
            standby:
              sceneStandby.line === undefined ? sceneStandby : { ...sceneStandby, line: sceneOf(sceneStandby.line) },
          }
        : {}),
    };
  }
  const canvasModifiers =
    modifiers &&
    Object.fromEntries(
      Object.entries(modifiers).map(([name, modifier]): [string, Modifier] => [
        name,
        modifier.participants ? { ...modifier, participants: modifier.participants.map(sceneOf) } : modifier,
      ]),
    );

  return {
    config: {
      ...shared,
      container,
      ...(options ? { options } : {}),
      ...(layoutConfig ? { config: layoutConfig } : {}),
      ...(regions ? { regions } : {}),
      participants: byScene,
      ...(standby ? { standby } : {}),
      scenes: canvasScenes,
      ...(canvasModifiers ? { modifiers: canvasModifiers } : {}),
    },
    leftOut,
  };
};

/**
 * One canvas's view of a config, as `resolveCanvas` resolves it.
 *
 * @param config - The whole config.
 * @param canvasKey - The canvas, by its key in `canvases`.
 * @returns The canvas's view.
 */
export const resolveCanvasConfig = (config: ScenesConfig, canvasKey: string): CanvasScenesConfig =>
  resolveCanvas(config, canvasKey).config;
