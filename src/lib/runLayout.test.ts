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

/** A client whose program shows the container unless a test says otherwise. */
const fakeConnect = (results: ObsBatchResult[]) => {
  const client: ObsClient = {
    call: vi.fn(() => Promise.resolve({ currentProgramSceneName: 'C' })),
    callBatch: vi.fn(() => Promise.resolve(results)),
    close: vi.fn(),
  };
  const connect: ConnectObs = vi.fn(() => Promise.resolve(client));
  return { client, connect };
};

describe('runLayout', () => {
  it('plans with the modifiers switched on', async () => {
    const keyed: ScenesConfig = {
      ...config,
      participants: { L: { sources: { camera: { source: 'cam', border: 'edge' } } } },
      modifiers: { Keyed: { config: { camera: { isGreenScreen: true } } } },
    };
    const { connect } = fakeConnect([]);
    const summary = await runLayout({ config: keyed, sceneKey: 'only', modifiers: ['Keyed'], connection, connect });

    expect(summary.steps.find((step) => step.source === 'edge')?.visible).toBe(false);
  });

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

  it('ends the batch by switching to the container only when program shows another scene or cannot be read', async () => {
    const switchToContainer = { requestType: 'SetCurrentProgramScene', requestData: { sceneName: 'C' } };
    const moves = buildMoveRequests(planLayoutMoves(config, 'only'));
    const elsewhere = fakeConnect([]);
    vi.mocked(elsewhere.client.call).mockResolvedValueOnce({ currentProgramSceneName: 'Gameplay' });
    const unknown = fakeConnect([]);
    vi.mocked(unknown.client.call).mockResolvedValueOnce({});
    const unreachable = fakeConnect([]);
    vi.mocked(unreachable.client.call).mockRejectedValueOnce(new Error('no'));

    for (const { connect } of [elsewhere, unknown, unreachable]) {
      const summary = await runLayout({ config, sceneKey: 'only', connection, connect });
      expect(summary.requests).toEqual([...moves, switchToContainer]);
    }
    expect(elsewhere.client.call).toHaveBeenCalledWith('GetCurrentProgramScene');
  });

  it('reports failed requests', async () => {
    const failed = { requestType: 'SetSourceFilterEnabled', requestStatus: { result: false, code: 600 } };
    const { connect } = fakeConnect([{ requestType: 'Sleep', requestStatus: { result: true, code: 100 } }, failed]);

    const summary = await runLayout({ config, sceneKey: 'only', connection, connect });

    expect(summary.failed).toEqual([failed]);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reads what OBS shows first when the config has standby settings, and plans from it', async () => {
    const standby: ScenesConfig = {
      ...config,
      participants: { L: { sources: { camera: { source: 'cam', border: 'camBorder' } } } },
      standby: { textScene: 'T', lineHeight: 540 },
    };
    const { client, connect } = fakeConnect([]);
    const missing = { result: false, code: 600 };
    vi.mocked(client.callBatch).mockResolvedValueOnce([
      {
        requestType: 'GetSceneItemList',
        requestStatus: { result: true, code: 100 },
        responseData: { sceneItems: [{ sourceName: 'L', sceneItemId: 1, sceneItemEnabled: false }] },
      },
      { requestType: 'GetSceneItemList', requestStatus: missing },
      { requestType: 'GetSceneItemList', requestStatus: missing },
      { requestType: 'GetSourceFilter', requestStatus: missing },
    ]);

    const summary = await runLayout({ config: standby, sceneKey: 'only', connection, connect });

    expect(client.callBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.callBatch).mock.calls[0]?.[1]).toBe(0);
    expect(summary.steps).toEqual(
      planLayoutMoves(standby, 'only', {
        sceneItems: { C: [{ sourceName: 'L', sceneItemId: 1, sceneItemEnabled: false }] },
        borderWidths: {},
        fontSizes: {},
      }),
    );
    expect(client.callBatch).toHaveBeenLastCalledWith(summary.requests, 1);
  });

  it('rejects an unknown scene key without connecting', async () => {
    const { connect } = fakeConnect([]);

    await expect(runLayout({ config, sceneKey: 'nope', connection, connect })).rejects.toThrow('No scene "nope"');
    expect(connect).not.toHaveBeenCalled();
  });

  it('closes the connection even when the batch fails', async () => {
    const { client, connect } = fakeConnect([]);
    vi.mocked(client.callBatch).mockRejectedValueOnce(new Error('gone'));

    await expect(runLayout({ config, sceneKey: 'only', connection, connect })).rejects.toThrow('gone');
    expect(client.close).toHaveBeenCalledOnce();
  });
});
