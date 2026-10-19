import type { MoveStep } from '@/types/MoveStep';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';
import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { REQUEST_BATCH_EXECUTION_SERIAL_FRAME } from '@/constants/obsWebSocket';
import { buildMoveRequests } from '@/lib/buildMoveRequests';
import { connectObs, type ConnectObs } from '@/lib/connectObs';
import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { readObsState } from '@/lib/readObsState';

export interface RunLayoutOptions {
  config: ScenesConfig;
  sceneKey: string;
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

/**
 * Read what OBS shows now, plan the moves for a scene key from there, and send them as one frame-synced batch over a
 * fresh connection.
 */
export const runLayout = async ({
  config,
  sceneKey,
  connection,
  connect = connectObs,
  now = Date.now,
}: RunLayoutOptions): Promise<RunLayoutSummary> => {
  // Fail on an unknown scene key before connecting
  planLayoutMoves(config, sceneKey);
  const started = now();
  const client = await connect(connection);
  try {
    const steps = planLayoutMoves(config, sceneKey, await readObsState(client, config));
    const requests = buildMoveRequests(steps);
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
