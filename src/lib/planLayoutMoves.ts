import type { LayoutConfig, LayoutMetric, LayoutOptions } from '@eliasthompson/obs-layout-generator';

import { createLayoutGenerator, LAYOUT_OPTIONS_DEFAULT } from '@eliasthompson/obs-layout-generator';

import type { Binding, MoveStep, SourceSize } from '@/types/MoveStep';
import type { ObsSceneItem, ObsState } from '@/types/ObsState';
import type { Rect } from '@/types/Rect';
import type {
  CanvasScenesConfig,
  LayoutRegionName,
  ParticipantPoolEntry,
  RegionSettings,
  SceneBinding,
  SceneParticipant,
} from '@/types/ScenesConfig';

import { DEFAULT_DURATION, DEFAULT_STANDBY_TEXT_GAP } from '@/constants/filterNames';
import { adjustInsetRatios, type RegionInsets } from '@/lib/adjustInsetRatios';
import { growRegion, shrinkRegion } from '@/lib/growRegion';
import { layoutArea } from '@/lib/layoutArea';
import { listOverlays } from '@/lib/listOverlays';
import { moveFilterName } from '@/lib/moveFilterName';
import { resolveModifiers } from '@/lib/resolveModifiers';
import { resolveParticipantConfig } from '@/lib/resolveParticipantConfig';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';
import { sizesFont } from '@/lib/sizesFont';
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
  config: CanvasScenesConfig,
  sceneOptions: LayoutOptions | undefined,
) => sceneOptions?.[name] ?? config.options?.[name] ?? LAYOUT_OPTIONS_DEFAULT[name];

/** How tall a line renders per pixel of font size when the source could not be measured: a common line height. */
const DEFAULT_LINE_HEIGHT_RATIO = 1.25;

/**
 * How tall a text source's line renders per pixel of font size: its rendered height at its current font size, which
 * also counts the lines it wraps to, or a common line height when it could not be measured.
 */
const lineHeightRatioFor = (fontSize: number | undefined, sourceHeight: number | undefined) =>
  fontSize && sourceHeight ? sourceHeight / fontSize : DEFAULT_LINE_HEIGHT_RATIO;

/**
 * The font size that fits a text source into a height: its largest size, sized down toward its smallest when a line
 * at the largest would not fit.
 */
const fontSizeFor = (settings: RegionSettings, height: number, lineHeightRatio: number) =>
  Math.min(
    settings.fontSizeMax ?? Number.POSITIVE_INFINITY,
    Math.max(settings.fontSizeMin ?? 1, Math.floor(height / lineHeightRatio)),
  );

/** A shown participant's settings for a region: the config's, their own, and the scene's, layered. */
const settingsFor = (config: CanvasScenesConfig, participant: SceneParticipant, region: LayoutRegionName) =>
  resolveRegionSettings(config, config.participants[participant.layout], region, participant.regions);

/**
 * The name heights the shown participants' name text sources ask for: the inset on both sides plus a line at the
 * smallest font size for `nameHeightMin`, and at the largest for `nameHeightMax`, the largest of either across them.
 * Each is left out when no name binding sets that font size, or when the options already set it.
 *
 * @param lineHeightRatio - How tall a text source in a layout renders per pixel of font size.
 */
const derivedNameHeights = (
  config: CanvasScenesConfig,
  scene: SceneBinding,
  shown: SceneParticipant[],
  lineHeightRatio: (layout: string, source: string) => number,
): Pick<LayoutOptions, 'nameHeightMax' | 'nameHeightMin'> => {
  const derive = (option: 'nameHeightMax' | 'nameHeightMin', setting: 'fontSizeMax' | 'fontSizeMin') => {
    if (scene.options?.[option] !== undefined || config.options?.[option] !== undefined) return {};

    const heights = shown.flatMap((participant) => {
      const binding = config.participants[participant.layout].sources.name;
      const name = settingsFor(config, participant, 'name');
      const fontSize = name[setting];
      // A line rounds up, so the font sized back from the height is the whole font size
      return binding && fontSize
        ? [(name.inset ?? 0) * 2 + Math.ceil(fontSize * lineHeightRatio(participant.layout, binding.source))]
        : [];
    });

    return heights.length ? { [option]: Math.max(...heights) } : {};
  };

  return { ...derive('nameHeightMin', 'fontSizeMin'), ...derive('nameHeightMax', 'fontSizeMax') };
};

/** The layout of the scene's participants, with ratios declared for inset regions holding inside the inset. */
const layoutMetrics = (
  config: CanvasScenesConfig,
  scene: SceneBinding,
  shown: SceneParticipant[],
  configs: LayoutConfig[],
  lineHeightRatio: (layout: string, source: string) => number,
): LayoutMetric[] => {
  const sceneOptions = { ...scene.options, ...derivedNameHeights(config, scene, shown, lineHeightRatio) };
  const generate = (layoutConfigs: LayoutConfig[]) =>
    createLayoutGenerator(config.options)(layoutConfigs, sceneOptions);
  // Declared ratios hold inside a region's inset (the name has no ratio), so the layout gets adjusted outer ratios
  const insets = shown.map((participant): RegionInsets =>
    Object.fromEntries(
      Object.keys(config.participants[participant.layout].sources)
        .map((region) => [region, settingsFor(config, participant, region as LayoutRegionName).inset] as const)
        .filter(([region, inset]) => region !== 'name' && inset),
    ),
  );

  return generate(adjustInsetRatios(configs, insets, generate));
};

/** Whether OBS shows an item now, from what `readObsState` read; a scene OBS could not report shows nothing. */
const isItemShown = (state: ObsState, sceneName: string, source: string) =>
  // Record lookups are typed as always present
  (state.sceneItems[sceneName] as ObsSceneItem[] | undefined)?.find((item) => item.sourceName === source)
    ?.sceneItemEnabled === true;

/**
 * Whether a scene's regions on a canvas wait for its overlays to leave first: a standby text or widget the canvas
 * shows now that the scene does not show. Every canvas a preset lays out waits when any of them does, so the
 * canvases move together and a source they share is faded alike.
 *
 * @param state - What OBS shows on the canvas now, from `readObsState`.
 */
export const overlaysLeave = (config: CanvasScenesConfig, sceneKey: string, state: ObsState): boolean => {
  // Record lookups are typed as always present; the key comes from user input
  const scene = config.scenes[sceneKey] as SceneBinding | undefined;
  const wanted = new Set([
    ...(scene?.standby?.text && config.standby ? [scene.standby.text] : []),
    ...(scene?.standby?.widgets ?? []).map((widget) => widget.source),
  ]);
  return listOverlays(config).some(
    ({ binding }) => !wanted.has(binding.source) && isItemShown(state, binding.scene, binding.source),
  );
};

/**
 * Plan the transition to a scene key: one move step per bound item of the participants it shows, one visibility step
 * per participant layout in the pool, and one step per standby text and widget. Each shown participant's config is
 * built up from the config's base, their pool entry, the scene, and the modifiers in effect. Regions a layout does
 * not use are sent to a 1x1 point at the middle of the participant's main region and hidden, so they shrink into the
 * main content and a later layout grows them out of it. The name is the exception: it has no border and always sits over a host region, so without one it stays
 * hidden where it would be, and only fades.
 *
 * A standby scene collapses every participant's regions into the standby line instead: content to no width (no height
 * on a portrait canvas, whose line runs across it) at the middle of the layout area, every border onto the line, and
 * only the line participant's main border left showing as the line (the one showing now, so the line never blinks).
 * Its text slides out, at its rendered size and centered on the line, right of an upright line and above one across,
 * and its widgets fade in once the collapse is done. Leaving standby runs the other way: overlays leave first, then the
 * regions grow out, and the new layout's main border takes over the line in the same frame if another border held it.
 *
 * @param state - What OBS shows now, from `readObsState`. Without it, the plan assumes nothing is shown.
 * @param modifiers - Names of the modifiers switched on.
 * @param waitForOverlays - Whether the regions wait as if overlays were leaving, because they are on another canvas
 *   the preset lays out; see `overlaysLeave`.
 */
export const planLayoutMoves = (
  config: CanvasScenesConfig,
  sceneKey: string,
  state: ObsState = { sceneItems: {}, borderThickness: {}, fontSizes: {} },
  modifiers: readonly string[] = [],
  waitForOverlays = false,
): MoveStep[] => {
  // Record lookups are typed as always present; the key comes from user input
  const scene = config.scenes[sceneKey] as SceneBinding | undefined;
  if (!scene) {
    throw new Error(
      `No scene "${sceneKey}" in the layout config. Known scenes: ${Object.keys(config.scenes).join(', ')}`,
    );
  }
  if (scene.standby && !config.standby) {
    throw new Error(`Scene "${sceneKey}" is a standby scene, but the layout config has no standby settings`);
  }
  // A standby scene collapses everyone unless it says who
  const shown: SceneParticipant[] =
    scene.participants ?? (scene.standby ? Object.keys(config.participants).map((layout) => ({ layout })) : []);
  if (!scene.standby && !shown.length) throw new Error(`Scene "${sceneKey}" shows no participants`);
  for (const participant of shown) {
    if (!(participant.layout in config.participants)) {
      throw new Error(
        `Scene "${sceneKey}" uses unknown participant "${participant.layout}". Known: ${Object.keys(config.participants).join(', ')}`,
      );
    }
  }
  const lineLayout = scene.standby?.line ?? shown.at(0)?.layout;
  if (scene.standby && lineLayout !== undefined && !(lineLayout in config.participants)) {
    throw new Error(`Scene "${sceneKey}" puts unknown participant "${lineLayout}" on the standby line`);
  }

  const line = config.standby ? standbyLine(config, config.standby.lineLength) : undefined;
  const textGap = config.standby?.textGap ?? DEFAULT_STANDBY_TEXT_GAP;
  const regionBorder = resolveOption('regionBorder', config, scene.options);
  // The middle of the layout area, where the standby line is, and where a participant's regions wait when its layout
  // shows none of them
  const area = layoutArea({ ...config.options, ...scene.options });
  const neutral: Rect = {
    x: Math.round(area.x + area.width / 2),
    y: Math.round(area.y + area.height / 2),
    width: 1,
    height: 1,
  };
  const borderPadding = config.borderPadding ?? 0;
  const duration = scene.duration ?? config.duration ?? DEFAULT_DURATION;
  const shownIndex = new Map(shown.map((participant, index) => [participant.layout, index]));
  const inEffect = resolveModifiers(config, scene, modifiers);

  // Record lookups are typed as always present; a scene OBS could not report is missing
  const sceneItem = (sceneName: string, source: string) =>
    (state.sceneItems[sceneName] as ObsSceneItem[] | undefined)?.find((item) => item.sourceName === source);
  const isShown = (sceneName: string, source: string) => isItemShown(state, sceneName, source);
  const lineHeightRatio = (layout: string, source: string) =>
    lineHeightRatioFor(
      source in state.fontSizes ? state.fontSizes[source] : undefined,
      sceneItem(layout, source)?.sourceSize?.height,
    );

  const configs = scene.standby
    ? []
    : shown.map((participant) => resolveParticipantConfig(config, participant, inEffect));
  const metrics = scene.standby ? [] : layoutMetrics(config, scene, shown, configs, lineHeightRatio);
  // The layout as if every participant had a name, which moves nothing else, for where a name left out would be
  const namedMetrics = configs.every((layoutConfig) => layoutConfig.hasName)
    ? metrics
    : layoutMetrics(
        config,
        scene,
        shown,
        configs.map((layoutConfig) => ({ ...layoutConfig, hasName: true })),
        lineHeightRatio,
      );

  /**
   * Where standby text shows: at its rendered size, centered on the line, a gap past it: right of an upright line,
   * above one across. Until OBS reports the size, a box the line's proportions suggest.
   */
  const textRegion = (source: string, to: StandbyLine, textScene: string): Rect => {
    const size = sceneItem(textScene, source)?.sourceSize;
    const length = Math.max(to.size.width, to.size.height);
    const { width, height } = size && size.height > 0 ? size : { width: length, height: Math.round(length / 2) };
    return to.isHorizontal
      ? { x: Math.round(to.content.x + to.content.width / 2 - width / 2), y: to.cut - textGap - height, width, height }
      : { x: to.cut + textGap, y: Math.round(to.content.y + to.content.height / 2 - height / 2), width, height };
  };

  // Overlays showing now that the scene does not show leave first, and everything else waits for them
  const overlays = listOverlays(config);
  const wanted = new Map<string, Rect>([
    ...(scene.standby?.text && line && config.standby
      ? [[scene.standby.text, textRegion(scene.standby.text, line, config.standby.textScene)] as const]
      : []),
    ...(scene.standby?.widgets ?? []).map((widget) => [widget.source, widget.region] as const),
  ]);
  const regionDelay = waitForOverlays || overlaysLeave(config, sceneKey, state) ? duration : 0;

  const step = (binding: Binding, { region, visible, size }: Target, delay = regionDelay): MoveStep => ({
    ...binding,
    filterName: moveFilterName(binding.source),
    region,
    size: binding.kind === 'border' ? size : undefined,
    visible,
    duration,
    delay,
  });

  /**
   * Where the regions a participant's layout leaves out wait: a point at the middle of its main region, so they grow
   * out of and shrink into the main content, or the neutral point when the layout shows nothing of the participant.
   */
  const parkingPoint = (metric: LayoutMetric): Rect => {
    const main = MAIN_REGIONS.map((region) => metric[region]).find((region) => region !== undefined);
    return main
      ? { x: Math.round(main.x + main.width / 2), y: Math.round(main.y + main.height / 2), width: 1, height: 1 }
      : neutral;
  };

  /** Where a region goes in a layout, or the participant's parking point when the layout does not use it. */
  const layoutTarget = (kind: 'border' | 'source', region: Rect | undefined, parked: Rect): Target =>
    region
      ? {
          region,
          visible: true,
          size: {
            width: Math.max(1, region.width - borderPadding * 2),
            height: Math.max(1, region.height - borderPadding * 2),
          },
        }
      : { region: parked, visible: false, size: kind === 'border' ? { width: 1, height: 1 } : undefined };

  const layoutSteps = (
    layout: string,
    entry: ParticipantPoolEntry,
    metric: LayoutMetric,
    namedMetric: LayoutMetric,
    participant: SceneParticipant,
  ) => {
    const parked = parkingPoint(metric);
    return Object.entries(entry.sources).flatMap(([regionName, binding]) => {
      // A name the layout leaves out waits hidden where it would be, over its host, so switching names only fades it
      const placed = metric[regionName as LayoutRegionName];
      const region = regionName === 'name' ? (placed ?? namedMetric.name) : placed;
      const settings = settingsFor(config, participant, regionName as LayoutRegionName);
      // The source may sit inside its region as padding; the border still frames the whole region
      const inner = region && settings.inset ? shrinkRegion(region, settings.inset) : region;
      const sourceStep = step(
        { scene: layout, source: binding.source, kind: 'source' },
        layoutTarget('source', inner, parked),
      );
      // A text source is sized to fit its height, from how tall it renders now; text sent away keeps its last size
      if (inner && sizesFont(settings)) {
        sourceStep.fontSize = fontSizeFor(settings, inner.height, lineHeightRatio(layout, binding.source));
      }
      const steps = [sourceStep];
      if (binding.border) {
        // The color source fills the border box, and the item sits borderPadding further out, where the border's
        // filters reach. The name sits inside its host region and has no border, so its border source frames the name
        const box = region && regionName !== 'name' ? growRegion(region, regionBorder) : region;
        const border = box && growRegion(box, borderPadding);
        const borderStep = step(
          { scene: layout, source: binding.border, kind: 'border' },
          layoutTarget('border', border, parked),
        );
        // A green screen camera has no border. Its border source still moves and sizes as if it framed the camera, so
        // the two stay in step, but it fades out, and fades back in with the next layout that frames the camera
        if (region && regionName !== 'name' && !region.hasBorder) borderStep.visible = false;
        steps.push(borderStep);
      }
      if (!placed) for (const hidden of steps) hidden.visible = false;
      return steps;
    });
  };

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
        ({ border }) =>
          border !== undefined &&
          state.borderThickness[border] === (line.isHorizontal ? line.size.height : line.size.width),
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
      const owner =
        layout === lineLayout ? (borders.find((border) => isShown(layout, border)) ?? borders[0]) : undefined;
      return [layoutStep, ...collapseSteps(layout, entry, owner, line)];
    }

    // generateLayout returns one metric per config, in order
    const metric = metrics[index];
    const steps = layoutSteps(layout, entry, metric, namedMetrics[index], shown[index]);
    if (index === 0) handOff(layout, entry, metric, steps);
    return [layoutStep, ...steps];
  });

  const overlaySteps = overlays.map(({ binding: { scene: overlayScene, source, kind }, region }) => {
    const target = wanted.get(source);
    // Hidden text waits past the cut, where the text scene's crop hides all of it: left of an upright line, below one
    // across. A widget fades where it is
    const shownAt =
      kind === 'text' && line && config.standby ? textRegion(source, line, config.standby.textScene) : region;
    const hidden =
      kind === 'text' && line && shownAt
        ? line.isHorizontal
          ? { ...shownAt, y: line.cut }
          : { ...shownAt, x: line.cut - shownAt.width }
        : shownAt;
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
