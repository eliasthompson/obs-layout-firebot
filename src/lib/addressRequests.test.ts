import { describe, expect, it, vi } from 'vitest';

import type { ObsClient } from '@/lib/connectObs';

import { addressClient, addressRequest, type ObsAddressBook, readAddressBook } from '@/lib/addressRequests';

const book: ObsAddressBook = {
  canvasUuid: 'canvas',
  scenes: { Canvas: 'scene-canvas', Person: 'scene-person' },
  sources: { Person: 'scene-person', Border: 'source-border', Name: 'source-name' },
};

describe('addressRequest', () => {
  it('addresses known scenes, sources, and inputs by UUID, and keeps the rest of the request', () => {
    expect(
      addressRequest(
        { requestType: 'SetSourceFilterSettings', requestData: { sourceName: 'Person', filterName: 'Move: Cam' } },
        book,
      ),
    ).toEqual({
      requestType: 'SetSourceFilterSettings',
      requestData: { sourceUuid: 'scene-person', filterName: 'Move: Cam' },
    });
    expect(
      addressRequest(
        { requestType: 'SetSourceFilterEnabled', requestData: { sourceName: 'Border', filterEnabled: true } },
        book,
      ).requestData,
    ).toEqual({ sourceUuid: 'source-border', filterEnabled: true });
    expect(
      addressRequest({ requestType: 'SetSceneItemEnabled', requestData: { sceneName: 'Person', sceneItemId: 3 } }, book)
        .requestData,
    ).toEqual({ sceneUuid: 'scene-person', sceneItemId: 3 });
    expect(
      addressRequest({ requestType: 'SetInputSettings', requestData: { inputName: 'Name' } }, book).requestData,
    ).toEqual({
      inputUuid: 'source-name',
    });
  });

  it('addresses a group, which the scene list leaves out, by the UUID of the item it is', () => {
    expect(
      addressRequest({ requestType: 'SetSceneItemEnabled', requestData: { sceneName: 'Border', sceneItemId: 5 } }, book)
        .requestData,
    ).toEqual({ sceneUuid: 'source-border', sceneItemId: 5 });
  });

  it('gives the canvas to a scene or source it does not know, and leaves an unknown input to the main canvas', () => {
    expect(
      addressRequest({ requestType: 'GetSceneItemList', requestData: { sceneName: 'Gone' } }, book).requestData,
    ).toEqual({ sceneName: 'Gone', canvasUuid: 'canvas' });
    expect(
      addressRequest({ requestType: 'GetSourceFilterList', requestData: { sourceName: 'Gone' } }, book).requestData,
    ).toEqual({ sourceName: 'Gone', canvasUuid: 'canvas' });
    expect(
      addressRequest({ requestType: 'GetInputSettings', requestData: { inputName: 'Gone' } }, book).requestData,
    ).toEqual({
      inputName: 'Gone',
    });
  });

  it('keeps the item name GetSceneItemId searches for, and gives the canvas to scene lists', () => {
    expect(
      addressRequest(
        { requestType: 'GetSceneItemId', requestData: { sceneName: 'Canvas', sourceName: 'Person' } },
        book,
      ).requestData,
    ).toEqual({ sceneUuid: 'scene-canvas', sourceName: 'Person' });
    expect(addressRequest({ requestType: 'GetSceneList', requestData: {} }, book)).toEqual({
      requestType: 'GetSceneList',
      requestData: { canvasUuid: 'canvas' },
    });
  });

  it('leaves a request that names nothing alone', () => {
    const sleep = { requestType: 'Sleep', requestData: { sleepFrames: 2 } };

    expect(addressRequest(sleep, book)).toEqual(sleep);
  });
});

describe('addressClient', () => {
  it('addresses every request and batch it sends, and closes the connection', async () => {
    const client: ObsClient = {
      call: vi.fn(() => Promise.resolve({ answer: true })),
      callBatch: vi.fn(() => Promise.resolve([])),
      close: vi.fn(),
    };
    const addressed = addressClient(client, book);

    await expect(addressed.call('GetSourceFilterList', { sourceName: 'Border' })).resolves.toEqual({ answer: true });
    await addressed.call('GetSceneList');
    await addressed.callBatch([{ requestType: 'GetSceneItemList', requestData: { sceneName: 'Person' } }], 0);
    addressed.close();

    expect(client.call).toHaveBeenCalledWith('GetSourceFilterList', { sourceUuid: 'source-border' });
    expect(client.call).toHaveBeenCalledWith('GetSceneList', { canvasUuid: 'canvas' });
    expect(client.callBatch).toHaveBeenCalledWith(
      [{ requestType: 'GetSceneItemList', requestData: { sceneUuid: 'scene-person' } }],
      0,
    );
    expect(client.close).toHaveBeenCalledOnce();
  });
});

describe('readAddressBook', () => {
  it("reads the canvas's scenes and the sources of the items in the layout's scenes in one batch", async () => {
    const ok = { result: true, code: 100 };
    const client: ObsClient = {
      call: vi.fn(),
      callBatch: vi.fn(() =>
        Promise.resolve([
          {
            requestType: 'GetSceneList',
            requestStatus: ok,
            responseData: { scenes: [{ sceneName: 'Canvas', sceneUuid: 'scene-canvas' }] },
          },
          {
            requestType: 'GetSceneItemList',
            requestStatus: ok,
            responseData: { sceneItems: [{ sourceName: 'Person', sourceUuid: 'scene-person' }] },
          },
          { requestType: 'GetSceneItemList', requestStatus: { result: false, code: 600 } },
        ]),
      ),
      close: vi.fn(),
    };

    await expect(readAddressBook(client, 'canvas', ['Canvas', 'Gone'])).resolves.toEqual({
      canvasUuid: 'canvas',
      scenes: { Canvas: 'scene-canvas' },
      sources: { Person: 'scene-person' },
    });
    expect(client.callBatch).toHaveBeenCalledWith(
      [
        { requestType: 'GetSceneList', requestData: { canvasUuid: 'canvas' } },
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'Canvas', canvasUuid: 'canvas' } },
        { requestType: 'GetSceneItemList', requestData: { sceneName: 'Gone', canvasUuid: 'canvas' } },
      ],
      0,
    );
  });

  it('reads an empty book when OBS lists nothing', async () => {
    const client: ObsClient = {
      call: vi.fn(),
      callBatch: vi.fn(() =>
        Promise.resolve([{ requestType: 'GetSceneList', requestStatus: { result: false, code: 600 } }]),
      ),
      close: vi.fn(),
    };

    await expect(readAddressBook(client, 'canvas', [])).resolves.toEqual({
      canvasUuid: 'canvas',
      scenes: {},
      sources: {},
    });
  });
});
