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

/** A layout's requests, by the stage of the move batch they run in. */
export interface MovePhases {
  /** Every filter stopped and rewritten, the font sizes, and the opacities handoffs start from. */
  prepare: ObsRequest[];
  /** Items shown or hidden in one frame to hand the standby line to another border. */
  handoffs: ObsRequest[];
  /** The border size filters enabled, a frame ahead of the rest. */
  sizes: ObsRequest[];
  /** Every other filter enabled. */
  moves: ObsRequest[];
}

/**
 * The obs-websocket requests that apply the moves, by stage; `joinMovePhases` makes them one SERIAL_FRAME batch.
 * Every filter is stopped and rewritten first, so a move still running from a previous scene is cut short instead of
 * swallowing the new target. OBS applies a filter's settings on its next video tick, and a Move filter that is still
 * enabled would start from inside that update with its old values, so the batch sleeps a couple of frames before
 * enabling anything. Border size filters are enabled a frame before the rest, because the sizes they write reach the
 * screen a frame later than the item transforms the other filters write. Font sizes cannot be animated and are set
 * with the filter settings.
 *
 * A handoff passes the standby line to another border: the new border's opacity is set to full with the filter
 * settings, so it has settled by the time both items toggle in the same frame after the sleep, and the line never
 * blinks or doubles up.
 */
export const buildMovePhases = (steps: MoveStep[]): MovePhases => {
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
  return {
    prepare: [
      ...setEnabled(writes, false),
      ...writes.map((write): ObsRequest => ({
        requestType: 'SetSourceFilterSettings',
        requestData: { ...write, overlay: false },
      })),
      ...fontSizes,
      ...handoffOpacities,
    ],
    handoffs: handoffToggles,
    sizes: setEnabled(writes.filter(isSizeWrite), true),
    moves: setEnabled(
      writes.filter((write) => !isSizeWrite(write)),
      true,
    ),
  };
};

/**
 * Every stage's requests passed through a function, such as addressing them to a canvas.
 *
 * @param phases - A layout's requests by stage.
 * @param map - What to do to each request.
 * @returns The requests by stage, mapped.
 */
export const mapMovePhases = (phases: MovePhases, map: (request: ObsRequest) => ObsRequest): MovePhases => ({
  prepare: phases.prepare.map(map),
  handoffs: phases.handoffs.map(map),
  sizes: phases.sizes.map(map),
  moves: phases.moves.map(map),
});

/**
 * One SERIAL_FRAME batch from the moves of every canvas: each stage of every canvas runs in the same frame, so the
 * canvases move together.
 *
 * @param phases - Each canvas's requests by stage.
 * @returns The batch.
 */
export const joinMovePhases = (phases: MovePhases[]): ObsRequest[] => {
  const stage = (name: keyof MovePhases) => phases.flatMap((canvasPhases) => canvasPhases[name]);
  const sizes = stage('sizes');

  return [
    ...stage('prepare'),
    { requestType: 'Sleep', requestData: { sleepFrames: SETTLE_FRAMES } },
    ...stage('handoffs'),
    ...sizes,
    ...(sizes.length ? [{ requestType: 'Sleep', requestData: { sleepFrames: SIZE_LEAD_FRAMES } }] : []),
    ...stage('moves'),
  ];
};

/**
 * The obs-websocket requests that apply one canvas's moves, as one SERIAL_FRAME batch.
 *
 * @param steps - The canvas's move steps.
 * @returns The batch.
 */
export const buildMoveRequests = (steps: MoveStep[]): ObsRequest[] => joinMovePhases([buildMovePhases(steps)]);
