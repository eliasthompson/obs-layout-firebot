import { describe, expect, it, vi } from 'vitest';

import type { ObsClient } from '@/lib/connectObs';
import type { ObsBatchResult } from '@/types/ObsRequest';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { readObsState } from '@/lib/readObsState';

const config: ScenesConfig = {
  container: 'C',
  standby: { textScene: 'T', lineHeight: 540 },
  participants: {
    L1: { sources: { camera: { source: 'cam', border: 'camBorder' }, name: { source: 'name' } } },
    L2: {
      sources: { camera: { source: 'cam2', border: 'camBorder' }, info: { source: 'info', border: 'infoBorder' } },
    },
  },
  scenes: {},
};

const ok = (requestType: string, responseData?: Record<string, unknown>): ObsBatchResult => ({
  requestType,
  requestStatus: { result: true, code: 100 },
  ...(responseData ? { responseData } : {}),
});
const failed = (requestType: string): ObsBatchResult => ({ requestType, requestStatus: { result: false, code: 600 } });

const fakeClient = (results: ObsBatchResult[]) => {
  const client: ObsClient = { call: vi.fn(), callBatch: vi.fn(() => Promise.resolve(results)), close: vi.fn() };
  return client;
};

describe('readObsState', () => {
  it('reads nothing when the config has no standby settings', async () => {
    const client = fakeClient([]);
    const withoutStandby = { ...config, standby: undefined };

    expect(await readObsState(client, withoutStandby)).toEqual({ sceneItems: {}, borderWidths: {} });
    expect(client.callBatch).not.toHaveBeenCalled();
  });

  it('reads every scene once and each border width in one realtime batch, with source sizes', async () => {
    const item = { sourceName: 'cam', sceneItemId: 3, sceneItemEnabled: true, sceneItemIndex: 0, inputKind: 'dshow' };
    const transform = { positionX: 9, sourceWidth: 580, sourceHeight: 402, width: 580, height: 402 };
    const client = fakeClient([
      ok('GetSceneItemList', {
        sceneItems: [{ ...item, sourceName: 'L1', sceneItemId: 1, sceneItemTransform: transform }],
      }),
      failed('GetSceneItemList'),
      ok('GetSceneItemList', { sceneItems: [item] }),
      ok('GetSceneItemList'),
      ok('GetSourceFilter', { filterSettings: { setting_int: 12 } }),
      ok('GetSourceFilter', { filterSettings: {} }),
    ]);

    expect(await readObsState(client, config)).toEqual({
      sceneItems: {
        C: [{ sourceName: 'L1', sceneItemId: 1, sceneItemEnabled: true, sourceSize: { width: 580, height: 402 } }],
        L1: [{ sourceName: 'cam', sceneItemId: 3, sceneItemEnabled: true }],
        L2: [],
      },
      borderWidths: { camBorder: 12 },
    });
    expect(client.callBatch).toHaveBeenCalledWith(
      [
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'C' } },
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'T' } },
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'L1' } },
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'L2' } },
        { requestType: 'GetSourceFilter', requestData: { sourceName: 'camBorder', filterName: 'Move: Width' } },
        { requestType: 'GetSourceFilter', requestData: { sourceName: 'infoBorder', filterName: 'Move: Width' } },
      ],
      0,
    );
  });

  it('leaves out border widths OBS could not report', async () => {
    const client = fakeClient([failed('GetSceneItemList'), failed('GetSourceFilter'), ok('GetSourceFilter')]);
    const borderOnly: ScenesConfig = { ...config, container: 'L1', standby: { textScene: 'L1', lineHeight: 540 } };

    expect(await readObsState(client, { ...borderOnly, participants: { L1: config.participants.L2 } })).toEqual({
      sceneItems: {},
      borderWidths: {},
    });
  });
});
