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

    expect(await readObsState(client, withoutStandby)).toEqual({ sceneItems: {}, borderWidths: {}, fontSizes: {} });
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
      fontSizes: {},
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
      fontSizes: {},
    });
  });

  it("reads the font size of a text sized by the config's regions or by a scene alone", async () => {
    const layered: ScenesConfig = {
      ...config,
      standby: undefined,
      regions: { name: { fontSizeMax: 48 } },
      participants: {
        L1: { sources: { name: { source: 'name' }, info: { source: 'info' } } },
      },
      scenes: {
        one: { participants: [{ layout: 'L1' }, { layout: 'L1', regions: { info: { fontSizeMin: 20 } } }] },
        everyone: {},
      },
    };
    const client = fakeClient([
      ok('GetSceneItemList', { sceneItems: [] }),
      ok('GetInputSettings'),
      ok('GetInputSettings'),
    ]);

    await readObsState(client, layered);

    expect(client.callBatch).toHaveBeenCalledWith(
      [
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'L1' } },
        { requestType: 'GetInputSettings', requestData: { inputName: 'name' } },
        { requestType: 'GetInputSettings', requestData: { inputName: 'info' } },
      ],
      0,
    );
  });

  it('reads the layout scenes and the font size of every text sized to its region, without standby', async () => {
    const sized: ScenesConfig = {
      ...config,
      standby: undefined,
      participants: {
        L1: {
          sources: { name: { source: 'name' }, info: { source: 'info' } },
          regions: { name: { fontSizeMax: 48 }, info: { fontSizeMin: 20 } },
        },
        L2: { sources: { name: { source: 'name' } }, regions: { name: { fontSizeMax: 48 } } },
      },
    };
    const client = fakeClient([
      ok('GetSceneItemList', {
        sceneItems: [
          {
            sourceName: 'name',
            sceneItemId: 2,
            sceneItemEnabled: true,
            sceneItemTransform: { sourceWidth: 300, sourceHeight: 60 },
          },
        ],
      }),
      ok('GetSceneItemList', { sceneItems: [] }),
      ok('GetInputSettings', { inputSettings: { font: { size: 40, face: 'Roboto' } } }),
      ok('GetInputSettings', { inputSettings: {} }),
    ]);

    expect(await readObsState(client, sized)).toEqual({
      sceneItems: {
        L1: [{ sourceName: 'name', sceneItemId: 2, sceneItemEnabled: true, sourceSize: { width: 300, height: 60 } }],
        L2: [],
      },
      borderWidths: {},
      fontSizes: { name: 40 },
    });
    expect(client.callBatch).toHaveBeenCalledWith(
      [
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'L1' } },
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'L2' } },
        { requestType: 'GetInputSettings', requestData: { inputName: 'name' } },
        { requestType: 'GetInputSettings', requestData: { inputName: 'info' } },
      ],
      0,
    );
  });
});
