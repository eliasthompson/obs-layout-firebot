import type { MoveStep } from '@/types/MoveStep';
import type { ConfigProblem } from '@/types/ObsInventory';
import type { LayoutRegionName, ScenesConfig } from '@/types/ScenesConfig';

import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { resolveCanvas, type ResolvedCanvas } from '@/lib/resolveCanvasConfig';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';
import { sizesFont } from '@/lib/sizesFont';

/** How one canvas binds a source: as a region's source or its border, and whether its font is sized. */
interface SourceUse {
  canvas: string;
  isBorder: boolean;
  sizesFont: boolean;
}

/** Every combination of the modifiers, from none to all, so each preset is checked as any of them leaves it. */
const modifierSets = (names: readonly string[]): string[][] =>
  names.reduce<string[][]>((sets, name) => [...sets, ...sets.map((set) => [...set, name])], [[]]);

const describeStep = (step: MoveStep | undefined) =>
  step
    ? `${step.visible ? 'shows' : 'hides'} it after ${String(step.delay)} ms over ${String(step.duration)} ms`
    : 'leaves it as it is';

const sameMove = (a: MoveStep | undefined, b: MoveStep | undefined) =>
  a?.visible === b?.visible && a?.delay === b?.delay && a?.duration === b?.duration;

/**
 * Sources bound on more than one canvas, and every way that sharing would break. A canvas writes a source's fade on the
 * source itself, so canvases can share it only when every preset fades it alike on all of them; its position and size
 * are each canvas's own item. Borders are sized, and texts may have their font sized, on the source too, per canvas,
 * so those can never be shared. A preset that leaves one sharing canvas as it is while another changes the source is
 * a problem as well.
 *
 * @param config - The whole config.
 * @returns An error per source that cannot be shared, and per preset and source the canvases would fade differently.
 */
export const findSharedSourceProblems = (config: ScenesConfig): ConfigProblem[] => {
  const problems: ConfigProblem[] = [];
  const error = (message: string) => problems.push({ severity: 'error', message });
  const canvases = Object.fromEntries(
    Object.keys(config.canvases).map((canvas): [string, ResolvedCanvas] => [canvas, resolveCanvas(config, canvas)]),
  );
  const uses = new Map<string, SourceUse[]>();

  for (const [canvas, { config: view }] of Object.entries(canvases)) {
    for (const entry of Object.values(view.participants)) {
      for (const [region, binding] of Object.entries(entry.sources)) {
        const settings = resolveRegionSettings(view, entry, region as LayoutRegionName);
        const add = (source: string, use: SourceUse) => uses.set(source, [...(uses.get(source) ?? []), use]);
        add(binding.source, { canvas, isBorder: false, sizesFont: sizesFont(settings) });
        if (binding.border) add(binding.border, { canvas, isBorder: true, sizesFont: false });
      }
    }
  }

  const shared = [...uses].filter(([, sourceUses]) => new Set(sourceUses.map(({ canvas }) => canvas)).size > 1);
  const movable: [string, string[]][] = [];
  for (const [source, sourceUses] of shared) {
    const on = [...new Set(sourceUses.map(({ canvas }) => canvas))];
    const where = `"${source}" is bound on the ${on.join(' and ')} canvases`;
    if (sourceUses.some(({ isBorder }) => isBorder)) {
      error(`${where}, but it is a border, which each canvas sizes; give each canvas its own`);
    } else if (sourceUses.some((use) => use.sizesFont)) {
      error(`${where}, but its font is sized, which each canvas does for its own regions; give each canvas its own`);
    } else {
      movable.push([source, on]);
    }
  }
  if (!movable.length) return problems;
  // One combination of modifiers is enough to show a preset's problem with a source
  const reported = new Set<string>();

  for (const sceneKey of Object.keys(config.scenes)) {
    for (const modifiers of modifierSets(Object.keys(config.modifiers ?? {}))) {
      // What each canvas does with every source this preset moves; a canvas that leaves the preset out does nothing
      const plans = Object.fromEntries(
        Object.entries(canvases).map(([canvas, { config: view }]): [string, MoveStep[] | undefined] => {
          if (!Object.hasOwn(view.scenes, sceneKey)) return [canvas, undefined];
          try {
            return [canvas, planLayoutMoves(view, sceneKey, undefined, modifiers)];
          } catch {
            // A preset that cannot be planned is reported by the scene checks
            return [canvas, undefined];
          }
        }),
      );
      const withModifiers = modifiers.length ? ` with ${modifiers.join(', ')}` : '';

      for (const [source, on] of movable) {
        if (reported.has(`${sceneKey}\n${source}`)) continue;
        const moves = on.map((canvas) => ({
          canvas,
          step: plans[canvas]?.find((step) => step.source === source && step.kind !== 'layout'),
        }));
        const [first, ...rest] = moves;
        if (rest.every(({ step }) => sameMove(first.step, step))) continue;
        reported.add(`${sceneKey}\n${source}`);
        error(
          `scene "${sceneKey}"${withModifiers} would fade the shared "${source}" differently: ` +
            moves.map(({ canvas, step }) => `${canvas} ${describeStep(step)}`).join(', ') +
            '; every canvas that shares a source has to fade it alike',
        );
      }
    }
  }

  return problems;
};
