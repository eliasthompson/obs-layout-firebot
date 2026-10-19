import type { MoveStep } from '@/types/MoveStep';
import type { FilterWrite, ObsRequest } from '@/types/ObsRequest';

import {
  HEIGHT_FILTER_NAME,
  OPACITY_FILTER_NAME,
  SETTLE_FRAMES,
  SIZE_LEAD_FRAMES,
  WIDTH_FILTER_NAME,
} from '@/constants/filterNames';
import { filterWrites } from '@/lib/filterWrites';

const isSizeWrite = (write: FilterWrite) =>
  write.filterName === WIDTH_FILTER_NAME || write.filterName === HEIGHT_FILTER_NAME;

/**
 * The obs-websocket requests that apply the moves, meant to run as one SERIAL_FRAME batch. Every filter is stopped
 * and rewritten first, so a move still running from a previous scene is cut short instead of swallowing the new
 * target. OBS applies a filter's settings on its next video tick, and a Move filter that is still enabled would start
 * from inside that update with its old values, so the batch sleeps a couple of frames before enabling anything.
 * Border size filters are enabled a frame before the rest, because the sizes they write reach the screen a frame
 * later than the item transforms the other filters write. Font sizes cannot be animated and are set with the
 * filter settings.
 *
 * A handoff passes the standby line to another border: the new border's opacity is set to full with the filter
 * settings, so it has settled by the time both items toggle in the same frame after the sleep, and the line never
 * blinks or doubles up.
 */
export const buildMoveRequests = (steps: MoveStep[]): ObsRequest[] => {
  const writes = steps.flatMap(filterWrites);
  const setEnabled = (targets: FilterWrite[], filterEnabled: boolean): ObsRequest[] =>
    targets.map(({ sourceName, filterName }) => ({
      requestType: 'SetSourceFilterEnabled',
      requestData: { sourceName, filterName, filterEnabled },
    }));
  const fontSizes = steps.flatMap((step): ObsRequest[] =>
    step.fontSize === undefined
      ? []
      : [
          {
            requestType: 'SetInputSettings',
            requestData: { inputName: step.source, inputSettings: { font: { size: step.fontSize } }, overlay: true },
          },
        ],
  );
  const handoffs = steps.flatMap((step) => (step.handoff ? [{ step, handoff: step.handoff }] : []));
  const handoffOpacities = handoffs.flatMap(({ step, handoff }): ObsRequest[] =>
    handoff.visible
      ? [
          {
            requestType: 'SetSourceFilterSettings',
            requestData: {
              sourceName: step.source,
              filterName: OPACITY_FILTER_NAME,
              filterSettings: { opacity: 1 },
              overlay: true,
            },
          },
        ]
      : [],
  );
  const handoffToggles = handoffs.map(({ step, handoff }): ObsRequest => ({
    requestType: 'SetSceneItemEnabled',
    requestData: { sceneName: step.scene, sceneItemId: handoff.sceneItemId, sceneItemEnabled: handoff.visible },
  }));
  const sizeWrites = writes.filter(isSizeWrite);
  const otherWrites = writes.filter((write) => !isSizeWrite(write));

  return [
    ...setEnabled(writes, false),
    ...writes.map((write): ObsRequest => ({
      requestType: 'SetSourceFilterSettings',
      requestData: { ...write, overlay: false },
    })),
    ...fontSizes,
    ...handoffOpacities,
    { requestType: 'Sleep', requestData: { sleepFrames: SETTLE_FRAMES } },
    ...handoffToggles,
    ...setEnabled(sizeWrites, true),
    ...(sizeWrites.length ? [{ requestType: 'Sleep', requestData: { sleepFrames: SIZE_LEAD_FRAMES } }] : []),
    ...setEnabled(otherWrites, true),
  ];
};
