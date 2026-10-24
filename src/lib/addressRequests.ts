import type { ObsClient } from '@/lib/connectObs';
import type { ObsRequest } from '@/types/ObsRequest';

import { REQUEST_BATCH_EXECUTION_SERIAL_REALTIME } from '@/constants/obsWebSocket';

/**
 * How to reach what a canvas other than OBS's main one names. obs-websocket looks names up on the main canvas, and a
 * request's `canvasUuid` limits every name in it to that canvas, inputs included, though inputs belong to the main
 * canvas. So requests for such a canvas address scenes and sources by UUID, which work on any canvas.
 */
export interface ObsAddressBook {
  canvasUuid: string;
  /** UUIDs of the canvas's scenes, by name. */
  scenes: Record<string, string>;
  /** UUIDs of the sources of the items in the canvas's scenes, by name. */
  sources: Record<string, string>;
}

/** Requests that take a canvas to list or create scenes in, rather than a scene or source to act on. */
const CANVAS_REQUESTS = new Set(['CreateScene', 'GetSceneList']);

/**
 * Address a request to a canvas: the scenes and sources it names by UUID, found in the address book, a group as the
 * source of the item it is. A scene or
 * source the book does not know keeps its name and gets the canvas, so OBS reports it missing from that canvas. An
 * input it does not know keeps its name, since inputs are looked up on the main canvas.
 *
 * @param request - A request that names its targets, as the layout builds them for the main canvas.
 * @param book - The canvas's address book.
 * @returns The request for the canvas.
 */
export const addressRequest = (request: ObsRequest, { canvasUuid, scenes, sources }: ObsAddressBook): ObsRequest => {
  if (CANVAS_REQUESTS.has(request.requestType)) {
    return { ...request, requestData: { ...request.requestData, canvasUuid } };
  }
  const { sceneName, sourceName, inputName, ...requestData } = request.requestData;
  const addressed: Record<string, unknown> = { ...requestData };
  let isUnknown = false;

  if (typeof sceneName === 'string') {
    if (Object.hasOwn(scenes, sceneName)) {
      addressed.sceneUuid = scenes[sceneName];
    } else if (Object.hasOwn(sources, sceneName)) {
      // A group is a scene to obs-websocket, but not in the canvas's scene list: it is the source of an item
      addressed.sceneUuid = sources[sceneName];
    } else {
      addressed.sceneName = sceneName;
      isUnknown = true;
    }
  }
  // GetSceneItemId looks its source up among the scene's items by name, so its sourceName stays
  if (typeof sourceName === 'string') {
    if (request.requestType === 'GetSceneItemId') {
      addressed.sourceName = sourceName;
    } else if (Object.hasOwn(scenes, sourceName)) {
      addressed.sourceUuid = scenes[sourceName];
    } else if (Object.hasOwn(sources, sourceName)) {
      addressed.sourceUuid = sources[sourceName];
    } else {
      addressed.sourceName = sourceName;
      isUnknown = true;
    }
  }
  if (typeof inputName === 'string') {
    if (Object.hasOwn(sources, inputName)) addressed.inputUuid = sources[inputName];
    else addressed.inputName = inputName;
  }

  return { ...request, requestData: isUnknown ? { ...addressed, canvasUuid } : addressed };
};

/**
 * A client whose requests are addressed to a canvas, so code written for the main canvas runs on another unchanged.
 *
 * @param client - The open connection.
 * @param book - The canvas's address book.
 * @returns A client that addresses every request it sends.
 */
export const addressClient = (client: ObsClient, book: ObsAddressBook): ObsClient => ({
  call: (requestType, requestData = {}) => {
    const addressed = addressRequest({ requestType, requestData }, book);
    return client.call(addressed.requestType, addressed.requestData);
  },
  callBatch: (requests, executionType) =>
    client.callBatch(
      requests.map((request) => addressRequest(request, book)),
      executionType,
    ),
  close: () => {
    client.close();
  },
});

/**
 * Read a canvas's address book: the UUIDs of its scenes, and of the sources of the items in the scenes the layout
 * uses. A scene that does not exist is left out, and the requests that name it fail with OBS's own message.
 *
 * @param client - The open connection.
 * @param canvasUuid - The canvas.
 * @param sceneNames - The scenes whose items the layout drives on that canvas.
 * @returns The address book.
 */
export const readAddressBook = async (
  client: ObsClient,
  canvasUuid: string,
  sceneNames: readonly string[],
): Promise<ObsAddressBook> => {
  const [list, ...itemLists] = await client.callBatch(
    [
      { requestType: 'GetSceneList', requestData: { canvasUuid } },
      ...sceneNames.map((sceneName) => ({ requestType: 'GetSceneItemList', requestData: { sceneName, canvasUuid } })),
    ],
    REQUEST_BATCH_EXECUTION_SERIAL_REALTIME,
  );
  const sceneList = (list.responseData?.scenes ?? []) as { sceneName: string; sceneUuid: string }[];
  const items = itemLists.flatMap(
    (result) => (result.responseData?.sceneItems ?? []) as { sourceName: string; sourceUuid: string }[],
  );

  return {
    canvasUuid,
    scenes: Object.fromEntries(sceneList.map(({ sceneName, sceneUuid }) => [sceneName, sceneUuid])),
    sources: Object.fromEntries(items.map(({ sourceName, sourceUuid }) => [sourceName, sourceUuid])),
  };
};
