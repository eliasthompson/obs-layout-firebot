import type { ObsClient } from '@/lib/connectObs';

/** A canvas as GetCanvasList reports it. */
export interface ObsCanvas {
  name: string;
  uuid: string;
  /** Whether it is OBS's main canvas, whose scenes requests find by name. */
  isMain: boolean;
  /** Base resolution, which Aitum Vertical tells its canvases apart by. */
  width: number;
  height: number;
}

/** Where a canvas the config names is in OBS. */
export type LocatedCanvas =
  { kind: 'main' } | { kind: 'missing'; problem: string } | { kind: 'other'; canvas: ObsCanvas };

interface ReportedCanvas {
  canvasName: string;
  canvasUuid: string;
  canvasFlags?: { MAIN?: boolean };
  canvasVideoSettings?: { baseWidth?: number; baseHeight?: number };
}

/**
 * The canvases OBS has.
 *
 * @param client - The open connection.
 * @returns Every canvas, or `undefined` when OBS cannot list them, which takes OBS 32.1 or later (obs-websocket 5.7).
 */
export const readObsCanvases = async (client: ObsClient): Promise<ObsCanvas[] | undefined> => {
  try {
    const { canvases } = (await client.call('GetCanvasList')) as { canvases?: ReportedCanvas[] };
    return (canvases ?? []).map(({ canvasName, canvasUuid, canvasFlags, canvasVideoSettings }) => ({
      name: canvasName,
      uuid: canvasUuid,
      isMain: canvasFlags?.MAIN === true,
      width: canvasVideoSettings?.baseWidth ?? 0,
      height: canvasVideoSettings?.baseHeight ?? 0,
    }));
  } catch {
    return undefined;
  }
};

/**
 * Find the OBS canvas a canvas config names.
 *
 * @param name - The config's `canvas`, or `undefined` for OBS's main canvas.
 * @param canvases - What `readObsCanvases` read, when anything named a canvas.
 * @returns The main canvas, another canvas, or why it cannot be used.
 */
export const locateCanvas = (name: string | undefined, canvases: ObsCanvas[] | undefined): LocatedCanvas => {
  if (name === undefined) return { kind: 'main' };
  if (!canvases) {
    return { kind: 'missing', problem: `OBS cannot list its canvases to find "${name}"; that takes OBS 32.1 or later` };
  }
  const canvas = canvases.find((candidate) => candidate.name === name);
  if (!canvas) {
    return {
      kind: 'missing',
      problem: `OBS has no canvas "${name}"; it has ${canvases.map((candidate) => `"${candidate.name}"`).join(', ')}`,
    };
  }
  return canvas.isMain ? { kind: 'main' } : { kind: 'other', canvas };
};
