import type { ObsAddressBook } from '@/lib/addressRequests';
import type { MovePhases } from '@/lib/buildMoveRequests';
import type { LocatedCanvas } from '@/lib/readObsCanvases';
import type { ItemToggle } from '@/types/ItemToggle';
import type { MoveStep } from '@/types/MoveStep';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';
import type { ObsState } from '@/types/ObsState';
import type { CanvasScenesConfig, ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { REQUEST_BATCH_EXECUTION_SERIAL_FRAME } from '@/constants/obsWebSocket';
import { addressClient, addressRequest, readAddressBook } from '@/lib/addressRequests';
import { readAitumProgramScene, switchAitumProgramScene } from '@/lib/aitumProgram';
import { buildMovePhases, joinMovePhases, mapMovePhases } from '@/lib/buildMoveRequests';
import { connectObs, type ConnectObs, type ObsClient } from '@/lib/connectObs';
import { listScenes } from '@/lib/listBindings';
import { planItemToggles } from '@/lib/planItemToggles';
import { overlaysLeave, planLayoutMoves } from '@/lib/planLayoutMoves';
import { locateCanvas, readObsCanvases } from '@/lib/readObsCanvases';
import { readObsState } from '@/lib/readObsState';
import { resolveCanvas } from '@/lib/resolveCanvasConfig';

export interface RunLayoutOptions {
  config: ScenesConfig;
  sceneKey: string;
  /** Names of the modifiers switched on. */
  modifiers?: readonly string[];
  connection: ObsConnection;
  connect?: ConnectObs;
  now?: () => number;
}

/** What a run did on one canvas. */
export interface CanvasRun {
  /** The canvas, by its key in `canvases`. */
  canvas: string;
  steps: MoveStep[];
  /** The items it showed or hid. */
  toggles: ItemToggle[];
  /** Why the canvas was left as it is, when OBS does not have it; its steps and toggles are then empty. */
  skipped?: string;
  /** How its requests reached it, for a canvas other than OBS's main one. */
  book?: ObsAddressBook;
}

export interface RunLayoutSummary {
  /** Every canvas that shows the scene, in the config's order. */
  canvases: CanvasRun[];
  /** Every canvas's steps. */
  steps: MoveStep[];
  /** Every canvas's toggles. */
  toggles: ItemToggle[];
  requests: ObsRequest[];
  results: ObsBatchResult[];
  failed: ObsBatchResult[];
  durationMs: number;
}

/** A canvas a run reached, with what it shows now, or one OBS does not have, with why. */
type ReachedCanvas =
  | { canvas: string; skipped: string }
  | {
      canvas: string;
      view: CanvasScenesConfig;
      located: Exclude<LocatedCanvas, { kind: 'missing' }>;
      book: ObsAddressBook | undefined;
      state: ObsState;
    };

/** The scene on the main canvas's program, or `undefined` when OBS cannot say. */
const readProgramScene = async (client: ObsClient) => {
  try {
    const { currentProgramSceneName } = await client.call('GetCurrentProgramScene');
    return typeof currentProgramSceneName === 'string' ? currentProgramSceneName : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Apply a scene key on every canvas that shows it: read what OBS shows now, plan each canvas's moves from there, and
 * send them as one frame-synced batch over a fresh connection, so the canvases move together. A canvas other than
 * OBS's main one is addressed by UUID. A canvas's container is switched to program only when program shows another
 * scene, or OBS cannot say which, so a layout already on air changes without a scene transition and preview stays
 * free for other work; the main canvas through OBS, another through Aitum Vertical. The switches end the batch, so
 * their transitions start with the moves. A canvas OBS does not have is left as it is, and the summary says why. When
 * overlays leave first on any canvas, every canvas's regions wait for them, so the canvases keep moving together.
 */
export const runLayout = async ({
  config,
  sceneKey,
  modifiers = [],
  connection,
  connect = connectObs,
  now = Date.now,
}: RunLayoutOptions): Promise<RunLayoutSummary> => {
  // Fail on an unknown scene key, or one no canvas can show, before connecting
  if (!Object.hasOwn(config.scenes, sceneKey)) {
    throw new Error(
      `No scene "${sceneKey}" in the layout config. Known scenes: ${Object.keys(config.scenes).join(', ')}`,
    );
  }
  const resolved = Object.keys(config.canvases).map((canvas) => ({ canvas, ...resolveCanvas(config, canvas) }));
  const shown = resolved.filter(({ config: view }) => Object.hasOwn(view.scenes, sceneKey));
  if (!shown.length) {
    const reasons = resolved.map(
      ({ canvas, leftOut }) => `${canvas}: ${leftOut[sceneKey] ?? 'the scene leaves it out'}`,
    );
    throw new Error(`Scene "${sceneKey}" shows on no canvas (${reasons.join('; ')})`);
  }
  for (const { config: view } of shown) planLayoutMoves(view, sceneKey, undefined, modifiers);

  const started = now();
  const client = await connect(connection);
  try {
    const obsCanvases = shown.some(({ canvas }) => config.canvases[canvas].canvas !== undefined)
      ? await readObsCanvases(client)
      : undefined;
    const runs: CanvasRun[] = [];
    const phases: MovePhases[] = [];
    const switches: ObsRequest[] = [];

    // What every canvas shows now, first, since one canvas's leaving overlays hold back every canvas's regions
    const reached: ReachedCanvas[] = [];
    for (const { canvas, config: view } of shown) {
      const located = locateCanvas(config.canvases[canvas].canvas, obsCanvases);
      if (located.kind === 'missing') {
        reached.push({ canvas, skipped: located.problem });
        continue;
      }
      const book =
        located.kind === 'other' ? await readAddressBook(client, located.canvas.uuid, listScenes(view)) : undefined;
      const state = await readObsState(book ? addressClient(client, book) : client, view);
      reached.push({ canvas, view, located, book, state });
    }
    const waitForOverlays = reached.some(
      (entry) => !('skipped' in entry) && overlaysLeave(entry.view, sceneKey, entry.state),
    );

    for (const entry of reached) {
      if ('skipped' in entry) {
        runs.push({ canvas: entry.canvas, steps: [], toggles: [], skipped: entry.skipped });
        continue;
      }
      const { canvas, view, located, book, state } = entry;
      const steps = planLayoutMoves(view, sceneKey, state, modifiers, waitForOverlays);
      const toggles = planItemToggles(view, sceneKey, state, modifiers);
      phases.push(
        book
          ? mapMovePhases(buildMovePhases(steps, toggles), (request) => addressRequest(request, book))
          : buildMovePhases(steps, toggles),
      );

      if (located.kind === 'other') {
        if ((await readAitumProgramScene(client, located.canvas)) !== view.container) {
          switches.push(switchAitumProgramScene(view.container));
        }
      } else if ((await readProgramScene(client)) !== view.container) {
        switches.push({ requestType: 'SetCurrentProgramScene', requestData: { sceneName: view.container } });
      }
      runs.push({ canvas, steps, toggles, ...(book ? { book } : {}) });
    }

    const requests = phases.length ? [...joinMovePhases(phases), ...switches] : [];
    const results = requests.length ? await client.callBatch(requests, REQUEST_BATCH_EXECUTION_SERIAL_FRAME) : [];
    return {
      canvases: runs,
      steps: runs.flatMap((run) => run.steps),
      toggles: runs.flatMap((run) => run.toggles),
      requests,
      results,
      failed: results.filter((result) => !result.requestStatus.result),
      durationMs: now() - started,
    };
  } finally {
    client.close();
  }
};
