import { describe, expect, it, vi } from 'vitest';

import type { ConnectObs, ObsClient } from '@/lib/connectObs';
import type { ObsBatchResult } from '@/types/ObsRequest';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { buildMoveRequests } from '@/lib/buildMoveRequests';
import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { runLayout } from '@/lib/runLayout';

const config: ScenesConfig = {
  container: 'C',
  participants: { L: { sources: { camera: { source: 'cam' } } } },
  scenes: { only: { participants: [{ layout: 'L' }] } },
};
const connection = { url: 'ws://obs:4455', password: '' };

const fakeConnect = (results: ObsBatchResult[]) => {
  const client: ObsClient = {
    call: vi.fn(),
    callBatch: vi.fn(() => Promise.resolve(results)),
    close: vi.fn(),
  };
  const connect: ConnectObs = vi.fn(() => Promise.resolve(client));
  return { client, connect };
};

describe('runLayout', () => {
  it('connects, sends the batch frame-synced, and closes', async () => {
    const steps = planLayoutMoves(config, 'only');
    const requests = buildMoveRequests(steps);
    const results = requests.map((request) => ({
      requestType: request.requestType,
      requestStatus: { result: true, code: 100 },
    }));
    const { client, connect } = fakeConnect(results);
    const clock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1047);

    const summary = await runLayout({ config, sceneKey: 'only', connection, connect, now: clock });

    expect(connect).toHaveBeenCalledWith(connection);
    expect(client.callBatch).toHaveBeenCalledWith(requests, 1);
    expect(client.close).toHaveBeenCalledOnce();
    expect(summary).toEqual({ steps, requests, results, failed: [], durationMs: 47 });
  });

  it('reports failed requests', async () => {
    const failed = { requestType: 'SetSourceFilterEnabled', requestStatus: { result: false, code: 600 } };
    const { connect } = fakeConnect([{ requestType: 'Sleep', requestStatus: { result: true, code: 100 } }, failed]);

    const summary = await runLayout({ config, sceneKey: 'only', connection, connect });

    expect(summary.failed).toEqual([failed]);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('closes the connection even when the batch fails', async () => {
    const { client, connect } = fakeConnect([]);
    vi.mocked(client.callBatch).mockRejectedValueOnce(new Error('gone'));

    await expect(runLayout({ config, sceneKey: 'only', connection, connect })).rejects.toThrow('gone');
    expect(client.close).toHaveBeenCalledOnce();
  });
});
