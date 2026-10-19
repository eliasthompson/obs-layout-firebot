import type { MoveStep } from '@/types/MoveStep';
import type { FilterWrite, ObsRequest } from '@/types/ObsRequest';

import { HEIGHT_FILTER_NAME, SETTLE_FRAMES, SIZE_LEAD_FRAMES, WIDTH_FILTER_NAME } from '@/constants/filterNames';
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
  const sizeWrites = writes.filter(isSizeWrite);
  const otherWrites = writes.filter((write) => !isSizeWrite(write));

  return [
    ...setEnabled(writes, false),
    ...writes.map((write): ObsRequest => ({
      requestType: 'SetSourceFilterSettings',
      requestData: { ...write, overlay: false },
    })),
    ...fontSizes,
    { requestType: 'Sleep', requestData: { sleepFrames: SETTLE_FRAMES } },
    ...setEnabled(sizeWrites, true),
    ...(sizeWrites.length ? [{ requestType: 'Sleep', requestData: { sleepFrames: SIZE_LEAD_FRAMES } }] : []),
    ...setEnabled(otherWrites, true),
  ];
};
