import { mergeLayoutConfigs } from '@eliasthompson/obs-layout-generator';

import type {
  CanvasScenesConfig,
  LayoutRegionName,
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
 * Resolve one canvas's view of a config: the canvas's container, options, participants, and standby settings, its
 * `config` and `regions` merged over the config's, and every scene it shows with its changes for the canvas applied.
 * A scene that leaves the canvas out, shows a participant the canvas does not have, or needs standby settings the
 * canvas lacks is left out of the view.
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
  const { canvases, scenes, config: sharedLayoutConfig, regions: sharedRegions, ...shared } = config;
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
  const canvasScenes: Record<string, SceneBinding> = {};
  const leftOut: Record<string, null | string> = {};

  for (const [sceneKey, { canvases: sceneCanvases, ...scene }] of Object.entries(scenes)) {
    const change = sceneCanvases?.[canvasKey];
    if (change === false) {
      leftOut[sceneKey] = null;
      continue;
    }
    const shown = change?.participants ?? scene.participants;
    const missing = [
      ...new Set(
        [
          ...(shown ?? []).map(({ layout }) => layout),
          ...(scene.standby?.line === undefined ? [] : [scene.standby.line]),
        ].filter((layout) => !Object.hasOwn(participants, layout)),
      ),
    ];
    if (missing.length) {
      leftOut[sceneKey] =
        `it shows ${missing.map((layout) => `"${layout}"`).join(', ')}, which the canvas does not have`;
      continue;
    }
    if (scene.standby && !standby) {
      leftOut[sceneKey] = 'it is a standby scene, and the canvas has no standby settings';
      continue;
    }
    canvasScenes[sceneKey] = {
      ...scene,
      ...(shown ? { participants: shown } : {}),
      ...(change?.options ? { options: { ...scene.options, ...change.options } } : {}),
    };
  }

  return {
    config: {
      ...shared,
      container,
      ...(options ? { options } : {}),
      ...(layoutConfig ? { config: layoutConfig } : {}),
      ...(regions ? { regions } : {}),
      participants,
      ...(standby ? { standby } : {}),
      scenes: canvasScenes,
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
