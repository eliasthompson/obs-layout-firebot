import { describe, expect, it, vi } from 'vitest';

import type { ObsClient } from '@/lib/connectObs';
import type { ObsBatchResult } from '@/types/ObsRequest';
import type { CanvasScenesConfig } from '@/types/ScenesConfig';

import { readObsState } from '@/lib/readObsState';

const config: CanvasScenesConfig = {
  container: 'C',
  standby: { textScene: 'T', lineLength: 540 },
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

    expect(await readObsState(client, withoutStandby)).toEqual({ sceneItems: {}, borderThickness: {}, fontSizes: {} });
    expect(client.callBatch).not.toHaveBeenCalled();
  });

  it('reads every scene once and each border width in one realtime batch, with source sizes', async () => {
    // A landscape canvas's line is upright, so a border's thickness across it is its width
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
      borderThickness: { camBorder: 12 },
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

  it("reads each border's height instead on a portrait canvas, whose standby line runs across it", async () => {
    const client = fakeClient([
      ok('GetSceneItemList'),
      ok('GetSceneItemList'),
      ok('GetSceneItemList'),
      ok('GetSceneItemList'),
      ok('GetSourceFilter', { filterSettings: { setting_int: 12 } }),
      ok('GetSourceFilter', { filterSettings: { setting_int: 402 } }),
    ]);
    const portrait = { ...config, options: { canvasWidth: 1080, canvasHeight: 1920 } };

    expect((await readObsState(client, portrait)).borderThickness).toEqual({ camBorder: 12, infoBorder: 402 });
    expect(vi.mocked(client.callBatch).mock.calls[0][0].slice(4)).toEqual([
      { requestType: 'GetSourceFilter', requestData: { sourceName: 'camBorder', filterName: 'Move: Height' } },
      { requestType: 'GetSourceFilter', requestData: { sourceName: 'infoBorder', filterName: 'Move: Height' } },
    ]);
  });

  it('leaves out border thicknesses OBS could not report', async () => {
    const client = fakeClient([failed('GetSceneItemList'), failed('GetSourceFilter'), ok('GetSourceFilter')]);
    const borderOnly: CanvasScenesConfig = {
      ...config,
      container: 'L1',
      standby: { textScene: 'L1', lineLength: 540 },
    };

    expect(await readObsState(client, { ...borderOnly, participants: { L1: config.participants.L2 } })).toEqual({
      sceneItems: {},
      borderThickness: {},
      fontSizes: {},
    });
  });

  it("reads the font size of a text sized by the config's regions or by a scene alone", async () => {
    const layered: CanvasScenesConfig = {
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
    const sized: CanvasScenesConfig = {
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
      borderThickness: {},
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

  it('reads the scenes and groups of the toggled items, asking for each both ways, and the borders after them', async () => {
    const withItems: CanvasScenesConfig = {
      ...config,
      items: {
        Voice: { visible: true },
        Mic: { scene: 'Voice', visible: true },
        Cam: { source: 'cam', scene: 'L1', visible: true },
        Gone: { scene: 'Nowhere', visible: false },
      },
    };
    const voice = { sourceName: 'Voice', sceneItemId: 8, sceneItemEnabled: false };
    const mic = { sourceName: 'Mic', sceneItemId: 5, sceneItemEnabled: true };
    const client = fakeClient([
      ok('GetSceneItemList', { sceneItems: [voice] }),
      ok('GetSceneItemList', { sceneItems: [] }),
      ok('GetSceneItemList', { sceneItems: [] }),
      ok('GetSceneItemList', { sceneItems: [] }),
      failed('GetSceneItemList'),
      ok('GetGroupSceneItemList', { sceneItems: [mic] }),
      failed('GetSceneItemList'),
      failed('GetGroupSceneItemList'),
      ok('GetSourceFilter', { filterSettings: { setting_int: 12 } }),
      ok('GetSourceFilter', { filterSettings: { setting_int: 6 } }),
    ]);

    expect(await readObsState(client, withItems)).toEqual({
      sceneItems: { C: [voice], T: [], L1: [], L2: [], Voice: [mic] },
      borderThickness: { camBorder: 12, infoBorder: 6 },
      fontSizes: {},
    });
    expect(vi.mocked(client.callBatch).mock.calls[0][0].slice(4, 8)).toEqual([
      { requestType: 'GetSceneItemList', requestData: { sceneName: 'Voice' } },
      { requestType: 'GetGroupSceneItemList', requestData: { sceneName: 'Voice' } },
      { requestType: 'GetSceneItemList', requestData: { sceneName: 'Nowhere' } },
      { requestType: 'GetGroupSceneItemList', requestData: { sceneName: 'Nowhere' } },
    ]);
  });

  it('reads the toggled items even without standby settings or sized texts', async () => {
    const client = fakeClient([ok('GetSceneItemList', { sceneItems: [] }), failed('GetGroupSceneItemList')]);

    expect(
      await readObsState(client, {
        container: 'C',
        participants: {},
        items: { Voice: { visible: true } },
        scenes: {},
      }),
    ).toEqual({ sceneItems: { C: [] }, borderThickness: {}, fontSizes: {} });
  });
});
