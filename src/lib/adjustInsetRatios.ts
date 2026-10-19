import type { AspectRatio, LayoutConfig, LayoutMetric } from '@eliasthompson/obs-layout-generator';

import { transformAspectRatio } from '@eliasthompson/obs-layout-generator';

import type { LayoutRegionName } from '@/types/ScenesConfig';

/** The config field that sets each region's ratio. The name has none, and the camera's only counts in the main column. */
const RATIO_FIELDS = {
  contentMain: 'contentMainAspectRatio',
  contentAux: 'contentAuxAspectRatio',
  info: 'infoAspectRatio',
  camera: 'cameraMainAspectRatio',
} as const satisfies Partial<Record<LayoutRegionName, keyof LayoutConfig>>;

/** Insets per region for one participant, in pixels. */
export type RegionInsets = Partial<Record<LayoutRegionName, number>>;

interface Target {
  participant: number;
  region: keyof typeof RATIO_FIELDS;
  inset: number;
  /** The declared ratio, which must hold inside the inset. */
  wanted: number;
  /** The ratio currently given to the layout for the whole region. */
  outer: number;
}

const declaredRatio = (config: LayoutConfig, region: keyof typeof RATIO_FIELDS): number | undefined => {
  const value = config[RATIO_FIELDS[region]];
  if (typeof value !== 'string' || value === 'auto') return undefined;
  // A camera ratio only shapes the camera when it takes the main column, which happens without main content
  if (region === 'camera' && config.contentMainAspectRatio !== null) return undefined;
  const ratio = transformAspectRatio(value);
  return ratio > 0 ? ratio : undefined;
};

/**
 * Re-express the aspect ratio of every inset region so the declared ratio holds for the area inside the inset rather
 * than for the whole region. The layout decides which side of a region is fixed (the side column's width, or the
 * row's height), so the outer ratio is found by iterating the layout and correcting each ratio by how far the inner
 * area's ratio is off, until every inner area is within half a pixel of its ratio.
 *
 * @param configs - One layout config per participant, as declared.
 * @param insets - Insets per participant and region; regions without an inset keep their ratio as declared.
 * @param generate - Runs the layout for a set of configs, with the options already bound.
 * @param maxPasses - Layout runs to spend before settling for the closest result.
 * @returns Configs to lay out, with adjusted ratios where an inset applies.
 */
export const adjustInsetRatios = (
  configs: LayoutConfig[],
  insets: RegionInsets[],
  generate: (configs: LayoutConfig[]) => LayoutMetric[],
  maxPasses = 8,
): LayoutConfig[] => {
  const targets = configs.flatMap((config, participant) =>
    (Object.keys(RATIO_FIELDS) as (keyof typeof RATIO_FIELDS)[]).flatMap((region): Target[] => {
      const inset = insets[participant]?.[region] ?? 0;
      const wanted = declaredRatio(config, region);
      return inset > 0 && wanted !== undefined ? [{ participant, region, inset, wanted, outer: wanted }] : [];
    }),
  );
  if (!targets.length) return configs;

  const adjusted = configs.map((config) => ({ ...config }));
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const metrics = generate(adjusted);
    let settled = true;

    for (const target of targets) {
      const region = metrics[target.participant]?.[target.region];
      if (!region) continue;
      const innerWidth = region.width - target.inset * 2;
      const innerHeight = region.height - target.inset * 2;
      if (innerWidth <= 0 || innerHeight <= 0) continue;
      if (Math.abs(innerHeight - innerWidth / target.wanted) < 0.5) continue;

      // Too wide inside means the region needs to be taller, so its outer ratio shrinks, and the other way round
      settled = false;
      target.outer *= target.wanted / (innerWidth / innerHeight);
      adjusted[target.participant] = {
        ...adjusted[target.participant],
        [RATIO_FIELDS[target.region]]: `${target.outer.toFixed(6)}:1` as AspectRatio,
      };
    }

    if (settled) break;
  }

  return adjusted;
};
