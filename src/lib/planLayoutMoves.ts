import type { LayoutConfig, LayoutMetric, LayoutOptions } from '@eliasthompson/obs-layout-generator';

import { createLayoutGenerator, LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { Binding, MoveStep, SourceSize } from '@/types/MoveStep';
import type { ObsSceneItem, ObsState } from '@/types/ObsState';
import type { Rect } from '@/types/Rect';
import type {
  LayoutRegionName,
  ParticipantPoolEntry,
  SceneBinding,
  ScenesConfig,
  SourceBinding,
} from '@/types/ScenesConfig';

import { DEFAULT_DURATION } from '@/constants/filterNames';
import { adjustInsetRatios, type RegionInsets } from '@/lib/adjustInsetRatios';
import { growRegion, shrinkRegion } from '@/lib/growRegion';
import { listOverlays } from '@/lib/listOverlays';
import { moveFilterName } from '@/lib/moveFilterName';
import { standbyLine, type StandbyLine } from '@/lib/standbyLine';

/** Regions that can take a participant's main column, in the order obs-layout-generator gives it to them. */
const MAIN_REGIONS = ['contentMain', 'camera', 'contentAux', 'info'] as const satisfies readonly LayoutRegionName[];

interface Target {
  /** `undefined` for layout items, which only fade and toggle. */
  region: Rect | undefined;
  visible: boolean;
  /** Border only: the color source's own size. */
  size?: SourceSize;
}

/** The scene's value, else the config's, else the library default. `undefined` never wins. */
const resolveOption = <Name extends keyof typeof LAYOUT_OPTIONS_DEFAULT>(
  name: Name,
  config: ScenesConfig,
  sceneOptions: LayoutOptions | undefined,
) => sceneOptions?.[name] ?? config.options?.[name] ?? LAYOUT_OPTIONS_DEFAULT[name];

/**
 * How wide standby text renders in its bounding box: it covers the box from the left, so text relatively wider than
 * the box runs past its right edge. The box's own width when OBS did not report the source's size.
 */
const coverWidth = (box: Rect, size: SourceSize | undefined) =>
  size && size.height > 0 ? Math.max(box.width, Math.ceil((size.width * box.height) / size.height)) : box.width;

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

/** The layout of the scene's participants, with ratios declared for inset regions holding inside the inset. */
const layoutMetrics = (config: ScenesConfig, scene: SceneBinding): LayoutMetric[] => {
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

  return generate(
    adjustInsetRatios(
      scene.participants.map((participant) => participant.config ?? {}),
      insets,
      generate,
    ),
  );
};

/**
 * Plan the transition to a scene key: one move step per bound item of the participants it shows, one visibility step
 * per participant layout in the pool, and one step per standby text and widget. Regions a layout does not use are
 * sent to a 1x1 point at the canvas center and hidden, so a later layout grows them out of that point.
 *
 * A standby scene collapses its participants' regions into the standby line instead: content to no width at the
 * canvas center, every border onto the line, and only the first participant's main border left showing as the line
 * (the one showing now, so the line never blinks). Its text slides out and its widgets fade in once the collapse is
 * done. Leaving standby runs the other way: overlays leave first, then the regions grow out, and the new layout's
 * main border takes over the line in the same frame if another border held it.
 *
 * @param state - What OBS shows now, from `readObsState`. Without it, the plan assumes nothing is shown.
 */
export const planLayoutMoves = (
  config: ScenesConfig,
  sceneKey: string,
  state: ObsState = { sceneItems: {}, borderWidths: {} },
): MoveStep[] => {
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
  if (scene.standby && !config.standby) {
    throw new Error(`Scene "${sceneKey}" is a standby scene, but the layout config has no standby settings`);
  }

  const line = config.standby ? standbyLine(config, config.standby.lineHeight) : undefined;
  const regionBorder = resolveOption('regionBorder', config, scene.options);
  const neutral: Rect = {
    x: Math.round(resolveOption('canvasWidth', config, scene.options) / 2),
    y: Math.round(resolveOption('canvasHeight', config, scene.options) / 2),
    width: 1,
    height: 1,
  };
  const borderPadding = config.borderPadding ?? 0;
  const duration = scene.duration ?? config.duration ?? DEFAULT_DURATION;
  const shownIndex = new Map(scene.participants.map((participant, index) => [participant.layout, index]));
  const metrics = scene.standby ? [] : layoutMetrics(config, scene);

  // Record lookups are typed as always present; a scene OBS could not report is missing
  const sceneItem = (sceneName: string, source: string) =>
    (state.sceneItems[sceneName] as ObsSceneItem[] | undefined)?.find((item) => item.sourceName === source);
  const isShown = (sceneName: string, source: string) => sceneItem(sceneName, source)?.sceneItemEnabled === true;

  // Overlays showing now that the scene does not show leave first, and everything else waits for them
  const overlays = listOverlays(config);
  const wanted = new Map(
    [...(scene.standby?.text ? [scene.standby.text] : []), ...(scene.standby?.widgets ?? [])].map((overlay) => [
      overlay.source,
      overlay.region,
    ]),
  );
  const leaving = overlays.some(({ binding }) => !wanted.has(binding.source) && isShown(binding.scene, binding.source));
  const regionDelay = leaving ? duration : 0;

  const step = (binding: Binding, { region, visible, size }: Target, delay = regionDelay): MoveStep => ({
    ...binding,
    filterName: moveFilterName(binding.source),
    region,
    size: binding.kind === 'border' ? size : undefined,
    visible,
    duration,
    delay,
  });

  /** Where a region goes in a layout, or the neutral point when the layout does not use it. */
  const layoutTarget = (kind: 'border' | 'source', region: Rect | undefined): Target =>
    region
      ? {
          region,
          visible: true,
          size: {
            width: Math.max(1, region.width - borderPadding * 2),
            height: Math.max(1, region.height - borderPadding * 2),
          },
        }
      : { region: neutral, visible: false, size: kind === 'border' ? { width: 1, height: 1 } : undefined };

  const layoutSteps = (layout: string, entry: ParticipantPoolEntry, metric: LayoutMetric) =>
    Object.entries(entry.sources).flatMap(([regionName, binding]) => {
      const region = metric[regionName as LayoutRegionName];
      // The source may sit inside its region as padding; the border still frames the whole region
      const inner = region && binding.inset ? shrinkRegion(region, binding.inset) : region;
      const sourceStep = step({ scene: layout, source: binding.source, kind: 'source' }, layoutTarget('source', inner));
      // A text source scales its font with its height; hidden text keeps its last size
      if (inner && binding.fontScale) sourceStep.fontSize = fontSizeFor(binding, binding.fontScale, inner.height);
      const steps = [sourceStep];
      if (binding.border) {
        // The name sits inside its host region and has no border, so its border binding is sized like the name itself
        const border = region && regionName !== 'name' ? growRegion(region, regionBorder) : region;
        const borderStep = step(
          { scene: layout, source: binding.border, kind: 'border' },
          layoutTarget('border', border),
        );
        // A green screen camera has no border. Its border source still moves and sizes as if it framed the camera, so
        // the two stay in step, but it fades out, and fades back in with the next layout that frames the camera
        if (region && regionName !== 'name' && !region.hasBorder) borderStep.visible = false;
        steps.push(borderStep);
      }
      return steps;
    });

  const collapseSteps = (layout: string, entry: ParticipantPoolEntry, owner: string | undefined, to: StandbyLine) =>
    Object.values(entry.sources).flatMap((binding) => [
      step({ scene: layout, source: binding.source, kind: 'source' }, { region: to.content, visible: false }),
      ...(binding.border
        ? [
            step(
              { scene: layout, source: binding.border, kind: 'border' },
              { region: to.border, visible: binding.border === owner, size: to.size },
            ),
          ]
        : []),
    ]);

  const mainBorders = (entry: ParticipantPoolEntry) =>
    MAIN_REGIONS.flatMap((region) => entry.sources[region]?.border ?? []);

  /**
   * Leaving standby with another border on the line than the new layout's main border: that border shows at full
   * opacity and the others drop, in the same frame, so the regions grow out of the same line.
   */
  const handOff = (layout: string, entry: ParticipantPoolEntry, metric: LayoutMetric, steps: MoveStep[]) => {
    const collapsed =
      line !== undefined &&
      Object.values(entry.sources).some(
        ({ border }) => border !== undefined && state.borderWidths[border] === line.size.width,
      );
    const heirs = MAIN_REGIONS.flatMap((region) => (metric[region] ? (entry.sources[region]?.border ?? []) : []));
    const heirItem = heirs.length ? sceneItem(layout, heirs[0]) : undefined;
    if (!collapsed || !heirItem || heirItem.sceneItemEnabled) return;

    for (const borderStep of steps) {
      const item = sceneItem(layout, borderStep.source);
      if (borderStep.kind !== 'border' || !item) continue;
      if (item === heirItem) borderStep.handoff = { sceneItemId: item.sceneItemId, visible: true };
      else if (item.sceneItemEnabled && !borderStep.visible) {
        borderStep.handoff = { sceneItemId: item.sceneItemId, visible: false };
      }
    }
  };

  const participantSteps = Object.entries(config.participants).flatMap(([layout, entry]) => {
    const index = shownIndex.get(layout);
    const layoutStep = step(
      { scene: config.container, source: layout, kind: 'layout' },
      { region: undefined, visible: index !== undefined },
    );
    // Items of a participant that is not in this scene stay where they are behind their hidden layout item
    if (index === undefined) return [layoutStep];

    if (scene.standby && line) {
      const borders = mainBorders(entry);
      const owner = index === 0 ? (borders.find((border) => isShown(layout, border)) ?? borders[0]) : undefined;
      return [layoutStep, ...collapseSteps(layout, entry, owner, line)];
    }

    // generateLayout returns one metric per config, in order
    const metric = metrics[index];
    const steps = layoutSteps(layout, entry, metric);
    if (index === 0) handOff(layout, entry, metric, steps);
    return [layoutStep, ...steps];
  });

  const overlaySteps = overlays.map(({ binding: { scene: overlayScene, source, kind }, region }) => {
    const target = wanted.get(source);
    // Hidden text waits left of the cut, where the text scene's crop hides all of it, overflow included; a widget fades
    // where it is
    const hidden =
      kind === 'text' && line
        ? { ...region, x: line.cut - coverWidth(region, sceneItem(overlayScene, source)?.sourceSize) }
        : region;
    // An overlay coming in waits for the regions to collapse, or for the overlay it replaces to leave
    const entering = target !== undefined && !isShown(overlayScene, source);
    return step(
      { scene: overlayScene, source, kind },
      { region: target ?? hidden, visible: target !== undefined },
      entering ? duration : 0,
    );
  });

  return [...participantSteps, ...overlaySteps];
};
