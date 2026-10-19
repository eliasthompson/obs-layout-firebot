import type { LayoutConfig, LayoutOptions, LayoutRegion } from '@eliasthompson/obs-layout-generator';

import { createLayoutGenerator, LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { Binding, MoveStep } from '@/types/MoveStep';
import type { LayoutRegionName, SceneBinding, ScenesConfig, SourceBinding } from '@/types/ScenesConfig';

import { DEFAULT_DURATION } from '@/constants/filterNames';
import { adjustInsetRatios, type RegionInsets } from '@/lib/adjustInsetRatios';
import { growRegion, shrinkRegion } from '@/lib/growRegion';
import { moveFilterName } from '@/lib/moveFilterName';

/** The scene's value, else the config's, else the library default. `undefined` never wins. */
const resolveOption = <Name extends keyof typeof LAYOUT_OPTIONS_DEFAULT>(
  name: Name,
  config: ScenesConfig,
  sceneOptions: LayoutOptions | undefined,
) => sceneOptions?.[name] ?? config.options?.[name] ?? LAYOUT_OPTIONS_DEFAULT[name];

/** The font size for a text source of this height: `fontScale` of it, held within the binding's bounds. */
const fontSizeFor = (binding: SourceBinding, fontScale: number, height: number) =>
  Math.min(
    binding.fontSizeMax ?? Number.POSITIVE_INFINITY,
    Math.max(binding.fontSizeMin ?? 1, Math.round(height * fontScale)),
  );

/**
 * The smallest name height the shown participants' text sources ask for: the inset on both sides plus the smallest
 * font size. `undefined` when no binding sets a smallest font, or when the options already set `nameHeightMin`.
 */
const derivedNameHeightMin = (config: ScenesConfig, scene: SceneBinding) => {
  if (scene.options?.nameHeightMin !== undefined || config.options?.nameHeightMin !== undefined) return undefined;

  const minimums = scene.participants.flatMap(({ layout }) => {
    const name = config.participants[layout].sources.name;
    return name?.fontSizeMin ? [(name.inset ?? 0) * 2 + name.fontSizeMin] : [];
  });

  return minimums.length ? Math.max(...minimums) : undefined;
};

/**
 * Resolve the layout for a scene key into one move step per bound item of the participants it shows, plus one
 * visibility step per participant layout in the pool. Regions a layout does not use are sent to a 1x1 point at the
 * canvas center and hidden, so a later layout grows them out of that point.
 */
export const planLayoutMoves = (config: ScenesConfig, sceneKey: string): MoveStep[] => {
  // Record lookups are typed as always present; the key comes from user input
  const scene = config.scenes[sceneKey] as SceneBinding | undefined;
  if (!scene) {
    throw new Error(
      `No scene "${sceneKey}" in the layout config. Known scenes: ${Object.keys(config.scenes).join(', ')}`,
    );
  }
  for (const participant of scene.participants) {
    if (!(participant.layout in config.participants)) {
      throw new Error(
        `Scene "${sceneKey}" uses unknown participant "${participant.layout}". Known: ${Object.keys(config.participants).join(', ')}`,
      );
    }
  }

  const nameHeightMin = derivedNameHeightMin(config, scene);
  const sceneOptions = { ...scene.options, ...(nameHeightMin === undefined ? {} : { nameHeightMin }) };
  const generate = (configs: LayoutConfig[]) => createLayoutGenerator(config.options)(configs, sceneOptions);
  // Declared ratios hold inside a region's inset (the name has no ratio), so the layout gets adjusted outer ratios
  const insets = scene.participants.map(({ layout }): RegionInsets =>
    Object.fromEntries(
      Object.entries(config.participants[layout].sources)
        .filter(([region, binding]) => region !== 'name' && binding.inset)
        .map(([region, binding]) => [region, binding.inset]),
    ),
  );
  const metrics = generate(
    adjustInsetRatios(
      scene.participants.map((participant) => participant.config ?? {}),
      insets,
      generate,
    ),
  );
  const regionBorder = resolveOption('regionBorder', config, scene.options);
  const neutral: LayoutRegion = {
    x: Math.round(resolveOption('canvasWidth', config, scene.options) / 2),
    y: Math.round(resolveOption('canvasHeight', config, scene.options) / 2),
    width: 1,
    height: 1,
  };
  const borderPadding = config.borderPadding ?? 0;
  const duration = scene.duration ?? config.duration ?? DEFAULT_DURATION;
  const shownIndex = new Map(scene.participants.map((participant, index) => [participant.layout, index]));

  const step = (binding: Binding, region: LayoutRegion | undefined): MoveStep => {
    const visible = region !== undefined;
    const target = region ?? neutral;

    return {
      ...binding,
      filterName: moveFilterName(binding.source),
      region: target,
      size:
        binding.kind === 'border'
          ? {
              width: visible ? Math.max(1, target.width - borderPadding * 2) : 1,
              height: visible ? Math.max(1, target.height - borderPadding * 2) : 1,
            }
          : undefined,
      visible,
      duration,
    };
  };

  return Object.entries(config.participants).flatMap(([layout, entry]) => {
    const index = shownIndex.get(layout);
    const layoutStep: MoveStep = {
      scene: config.container,
      source: layout,
      kind: 'layout',
      filterName: moveFilterName(layout),
      region: undefined,
      size: undefined,
      visible: index !== undefined,
      duration,
    };
    // Items of a participant that is not in this scene stay where they are behind their hidden layout item
    if (index === undefined) return [layoutStep];

    // generateLayout returns one metric per config, in order
    const metric = metrics[index];
    const regionSteps = Object.entries(entry.sources).flatMap(([regionName, binding]) => {
      const region = metric[regionName as LayoutRegionName];
      // The source may sit inside its region as padding; the border still frames the whole region
      const inner = region && binding.inset ? shrinkRegion(region, binding.inset) : region;
      const sourceStep = step({ scene: layout, source: binding.source, kind: 'source' }, inner);
      // A text source scales its font with its height; hidden text keeps its last size
      if (inner && binding.fontScale) sourceStep.fontSize = fontSizeFor(binding, binding.fontScale, inner.height);
      const steps = [sourceStep];
      if (binding.border) {
        // The name sits inside its host region and has no border, so its border binding is sized like the name itself
        const border = region && regionName !== 'name' ? growRegion(region, regionBorder) : region;
        steps.push(step({ scene: layout, source: binding.border, kind: 'border' }, border));
      }
      return steps;
    });

    return [layoutStep, ...regionSteps];
  });
};
