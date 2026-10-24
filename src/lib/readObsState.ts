import type { ObsClient } from '@/lib/connectObs';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';
import type { ObsSceneItem, ObsState } from '@/types/ObsState';
import type { CanvasScenesConfig, LayoutRegionName } from '@/types/ScenesConfig';

import { HEIGHT_FILTER_NAME, WIDTH_FILTER_NAME } from '@/constants/filterNames';
import { REQUEST_BATCH_EXECUTION_SERIAL_REALTIME } from '@/constants/obsWebSocket';
import { listItemScenes } from '@/lib/listItems';
import { resolveRegionSettings } from '@/lib/resolveRegionSettings';
import { sizesFont } from '@/lib/sizesFont';
import { standbyLine } from '@/lib/standbyLine';

/** The parts of a GetSceneItemList item the state keeps. */
interface ReportedSceneItem extends Omit<ObsSceneItem, 'sourceSize'> {
  sceneItemTransform?: { sourceWidth: number; sourceHeight: number };
}

/**
 * Read what a transition starts from. Standby needs the items of the container, the standby text scene, and every
 * layout scene, and how thick across the line each border was last sized. A text source sized to its region needs its
 * layout scene's items, for how tall it renders, and its current font size. Toggled items need the items of the
 * scenes and groups that hold them, for their ids and whether they show. A config that needs none of these reads
 * nothing. Anything OBS cannot answer is left out, and the move batch reports the missing item itself.
 */
export const readObsState = async (client: ObsClient, config: CanvasScenesConfig): Promise<ObsState> => {
  const state: ObsState = { sceneItems: {}, borderThickness: {}, fontSizes: {} };
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
  const toggledScenes = listItemScenes(config);
  if (!config.standby && !texts.length && !toggledScenes.length) return state;

  const scenes = [
    ...new Set([
      ...(config.standby ? [config.container, config.standby.textScene] : []),
      ...Object.keys(config.participants),
    ]),
  ];
  // A toggled item may sit in a group, whose items only GetGroupSceneItemList lists, and a scene only
  // GetSceneItemList: both are asked, and the one that answers counts
  const itemScenes = toggledScenes.filter((scene) => !scenes.includes(scene));
  const borders = config.standby
    ? [...new Set(bindings.flatMap((binding) => (binding.border ? [binding.border] : [])))]
    : [];
  // A border's thickness across the line is its width beside an upright line, its height beside one across
  const thicknessFilter =
    config.standby && standbyLine(config, config.standby.lineLength).isHorizontal
      ? HEIGHT_FILTER_NAME
      : WIDTH_FILTER_NAME;
  const requests: ObsRequest[] = [
    ...scenes.map((sceneName) => ({ requestType: 'GetSceneItemList', requestData: { sceneName } })),
    ...itemScenes.flatMap((sceneName) => [
      { requestType: 'GetSceneItemList', requestData: { sceneName } },
      { requestType: 'GetGroupSceneItemList', requestData: { sceneName } },
    ]),
    ...borders.map((sourceName) => ({
      requestType: 'GetSourceFilter',
      requestData: { sourceName, filterName: thicknessFilter },
    })),
    ...texts.map((inputName) => ({ requestType: 'GetInputSettings', requestData: { inputName } })),
  ];
  // A batch that does not halt on failure answers every request, in order
  const results = await client.callBatch(requests, REQUEST_BATCH_EXECUTION_SERIAL_REALTIME);

  const keepItems = (scene: string, result: ObsBatchResult) => {
    const items = (result.responseData?.sceneItems ?? []) as ReportedSceneItem[];
    state.sceneItems[scene] = items.map(({ sourceName, sceneItemId, sceneItemEnabled, sceneItemTransform }) => ({
      sourceName,
      sceneItemId,
      sceneItemEnabled,
      ...(sceneItemTransform
        ? { sourceSize: { width: sceneItemTransform.sourceWidth, height: sceneItemTransform.sourceHeight } }
        : {}),
    }));
  };
  scenes.forEach((scene, index) => {
    const result = results[index];
    if (result.requestStatus.result) keepItems(scene, result);
  });
  itemScenes.forEach((scene, index) => {
    const answered = results
      .slice(scenes.length + index * 2, scenes.length + index * 2 + 2)
      .find((result) => result.requestStatus.result);
    if (answered) keepItems(scene, answered);
  });
  const listed = scenes.length + itemScenes.length * 2;
  borders.forEach((border, index) => {
    const result = results[listed + index];
    const thickness = (result.responseData?.filterSettings as undefined | { setting_int?: unknown })?.setting_int;
    if (result.requestStatus.result && typeof thickness === 'number') state.borderThickness[border] = thickness;
  });
  texts.forEach((source, index) => {
    const result = results[listed + borders.length + index];
    const size = (result.responseData?.inputSettings as undefined | { font?: { size?: unknown } })?.font?.size;
    if (result.requestStatus.result && typeof size === 'number') state.fontSizes[source] = size;
  });

  return state;
};
