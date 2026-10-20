import type { MoveStep } from '@/types/MoveStep';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';
import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { REQUEST_BATCH_EXECUTION_SERIAL_FRAME } from '@/constants/obsWebSocket';
import { buildMoveRequests } from '@/lib/buildMoveRequests';
import { connectObs, type ConnectObs, type ObsClient } from '@/lib/connectObs';
import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { readObsState } from '@/lib/readObsState';

export interface RunLayoutOptions {
  config: ScenesConfig;
  sceneKey: string;
  /** Names of the modifiers switched on. */
  modifiers?: readonly string[];
  connection: ObsConnection;
  connect?: ConnectObs;
  now?: () => number;
}

export interface RunLayoutSummary {
  steps: MoveStep[];
  requests: ObsRequest[];
  results: ObsBatchResult[];
  failed: ObsBatchResult[];
  durationMs: number;
}

/** The scene on program, or `undefined` when OBS cannot say. */
const readProgramScene = async (client: ObsClient) => {
  try {
    const { currentProgramSceneName } = await client.call('GetCurrentProgramScene');
    return typeof currentProgramSceneName === 'string' ? currentProgramSceneName : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Read what OBS shows now, plan the moves for a scene key from there, and send them as one frame-synced batch over a
 * fresh connection. The container is switched to program only when program shows another scene, or OBS cannot say
 * which, so a layout already on air changes without a scene transition and preview stays free for other work. The
 * switch ends the batch, so its transition starts with the moves.
 */
export const runLayout = async ({
  config,
  sceneKey,
  modifiers = [],
  connection,
  connect = connectObs,
  now = Date.now,
}: RunLayoutOptions): Promise<RunLayoutSummary> => {
  // Fail on an unknown scene key before connecting
  planLayoutMoves(config, sceneKey, undefined, modifiers);
  const started = now();
  const client = await connect(connection);
  try {
    const steps = planLayoutMoves(config, sceneKey, await readObsState(client, config), modifiers);
    const onProgram = (await readProgramScene(client)) === config.container;
    const requests: ObsRequest[] = [
      ...buildMoveRequests(steps),
      ...(onProgram ? [] : [{ requestType: 'SetCurrentProgramScene', requestData: { sceneName: config.container } }]),
    ];
    const results = await client.callBatch(requests, REQUEST_BATCH_EXECUTION_SERIAL_FRAME);
    return {
      steps,
      requests,
      results,
      failed: results.filter((result) => !result.requestStatus.result),
      durationMs: now() - started,
    };
  } finally {
    client.close();
  }
};
