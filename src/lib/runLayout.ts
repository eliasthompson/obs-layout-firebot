import type { MoveStep } from '@/types/MoveStep';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';
import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { REQUEST_BATCH_EXECUTION_SERIAL_FRAME } from '@/constants/obsWebSocket';
import { buildMoveRequests } from '@/lib/buildMoveRequests';
import { connectObs, type ConnectObs } from '@/lib/connectObs';
import { planLayoutMoves } from '@/lib/planLayoutMoves';

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

/** Plan the moves for a scene key and send them to OBS as one frame-synced batch over a fresh connection. */
export const runLayout = async ({
  config,
  sceneKey,
  connection,
  connect = connectObs,
  now = Date.now,
}: RunLayoutOptions): Promise<RunLayoutSummary> => {
  const steps = planLayoutMoves(config, sceneKey);
  const requests = buildMoveRequests(steps);
  const started = now();
  const client = await connect(connection);
  try {
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
