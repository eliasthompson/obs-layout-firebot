import type { ObsClient } from '@/lib/connectObs';
import type { ObsRequest } from '@/types/ObsRequest';
import type { ObsSceneItem, ObsState } from '@/types/ObsState';
import type { LayoutRegionName, ScenesConfig } from '@/types/ScenesConfig';

import { WIDTH_FILTER_NAME } from '@/constants/filterNames';
import { REQUEST_BATCH_EXECUTION_SERIAL_REALTIME } from '@/constants/obsWebSocket';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';
import { sizesFont } from '@/lib/sizesFont';

/** The parts of a GetSceneItemList item the state keeps. */
interface ReportedSceneItem extends Omit<ObsSceneItem, 'sourceSize'> {
  sceneItemTransform?: { sourceWidth: number; sourceHeight: number };
}

/**
 * Read what a transition starts from. Standby needs the items of the container, the standby text scene, and every
 * layout scene, and the width each border was last moved to. A text source sized to its region needs its layout
 * scene's items, for how tall it renders, and its current font size. A config that needs neither reads nothing.
 * Anything OBS cannot answer is left out, and the move batch reports the missing item itself.
 */
export const readObsState = async (client: ObsClient, config: ScenesConfig): Promise<ObsState> => {
  const state: ObsState = { sceneItems: {}, borderWidths: {}, fontSizes: {} };
  const bindings = Object.values(config.participants).flatMap((entry) => Object.values(entry.sources));
  // A text is sized when any layer sizes it: the config's regions, the participant's, or any scene's settings for it
  const sceneRegions = Object.values(config.scenes).flatMap((scene) =>
    (scene.participants ?? []).flatMap(({ layout, regions }) => (regions ? [{ layout, regions }] : [])),
  );
  const texts = [
    ...new Set(
      Object.entries(config.participants).flatMap(([layout, entry]) =>
        Object.entries(entry.sources)
          .filter(([region]) =>
            [undefined, ...sceneRegions.filter((entry) => entry.layout === layout).map((entry) => entry.regions)].some(
              (regions) => sizesFont(resolveRegionSettings(config, entry, region as LayoutRegionName, regions)),
            ),
          )
          .map(([, binding]) => binding.source),
      ),
    ),
  ];
  if (!config.standby && !texts.length) return state;

  const scenes = [
    ...new Set([
      ...(config.standby ? [config.container, config.standby.textScene] : []),
      ...Object.keys(config.participants),
    ]),
  ];
  const borders = config.standby
    ? [...new Set(bindings.flatMap((binding) => (binding.border ? [binding.border] : [])))]
    : [];
  const requests: ObsRequest[] = [
    ...scenes.map((sceneName) => ({ requestType: 'GetSceneItemList', requestData: { sceneName } })),
    ...borders.map((sourceName) => ({
      requestType: 'GetSourceFilter',
      requestData: { sourceName, filterName: WIDTH_FILTER_NAME },
    })),
    ...texts.map((inputName) => ({ requestType: 'GetInputSettings', requestData: { inputName } })),
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
  texts.forEach((source, index) => {
    const result = results[scenes.length + borders.length + index];
    const size = (result.responseData?.inputSettings as undefined | { font?: { size?: unknown } })?.font?.size;
    if (result.requestStatus.result && typeof size === 'number') state.fontSizes[source] = size;
  });

  return state;
};
