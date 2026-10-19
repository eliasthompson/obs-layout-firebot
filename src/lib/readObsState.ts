import type { ObsClient } from '@/lib/connectObs';
import type { ObsRequest } from '@/types/ObsRequest';
import type { ObsSceneItem, ObsState } from '@/types/ObsState';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { WIDTH_FILTER_NAME } from '@/constants/filterNames';
import { REQUEST_BATCH_EXECUTION_SERIAL_REALTIME } from '@/constants/obsWebSocket';

/** The parts of a GetSceneItemList item the state keeps. */
interface ReportedSceneItem extends Omit<ObsSceneItem, 'sourceSize'> {
  sceneItemTransform?: { sourceWidth: number; sourceHeight: number };
}

/**
 * Read what a transition starts from: the items of the container, the standby text scene, and every layout scene,
 * and the width each border was last moved to. Only standby needs this, so a config without `standby` reads nothing.
 * Anything OBS cannot answer is left out, and the move batch reports the missing item itself.
 */
export const readObsState = async (client: ObsClient, config: ScenesConfig): Promise<ObsState> => {
  const state: ObsState = { sceneItems: {}, borderWidths: {} };
  if (!config.standby) return state;

  const scenes = [...new Set([config.container, config.standby.textScene, ...Object.keys(config.participants)])];
  const borders = [
    ...new Set(
      Object.values(config.participants).flatMap((entry) =>
        Object.values(entry.sources).flatMap((binding) => (binding.border ? [binding.border] : [])),
      ),
    ),
  ];
  const requests: ObsRequest[] = [
    ...scenes.map((sceneName) => ({ requestType: 'GetSceneItemList', requestData: { sceneName } })),
    ...borders.map((sourceName) => ({
      requestType: 'GetSourceFilter',
      requestData: { sourceName, filterName: WIDTH_FILTER_NAME },
    })),
  ];
  // A batch that does not halt on failure answers every request, in order
  const results = await client.callBatch(requests, REQUEST_BATCH_EXECUTION_SERIAL_REALTIME);

  scenes.forEach((scene, index) => {
    const result = results[index];
    if (!result.requestStatus.result) return;
    const items = (result.responseData?.sceneItems ?? []) as ReportedSceneItem[];
    state.sceneItems[scene] = items.map(({ sourceName, sceneItemId, sceneItemEnabled, sceneItemTransform }) => ({
      sourceName,
      sceneItemId,
      sceneItemEnabled,
      ...(sceneItemTransform
        ? { sourceSize: { width: sceneItemTransform.sourceWidth, height: sceneItemTransform.sourceHeight } }
        : {}),
    }));
  });
  borders.forEach((border, index) => {
    const result = results[scenes.length + index];
    const width = (result.responseData?.filterSettings as undefined | { setting_int?: unknown })?.setting_int;
    if (result.requestStatus.result && typeof width === 'number') state.borderWidths[border] = width;
  });

  return state;
};
