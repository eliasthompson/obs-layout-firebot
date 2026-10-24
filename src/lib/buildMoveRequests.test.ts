import { describe, expect, it } from 'vitest';

import type { MoveStep } from '@/types/MoveStep';

import { buildMovePhases, buildMoveRequests, joinMovePhases, mapMovePhases } from '@/lib/buildMoveRequests';
import { filterWrites } from '@/lib/filterWrites';

const layout: MoveStep = {
  scene: '[Scene] Content',
  source: '[Layout] Person 1',
  kind: 'layout',
  filterName: 'Move: [Layout] Person 1',
  region: undefined,
  size: undefined,
  visible: true,
  duration: 300,
  delay: 0,
};
const border: MoveStep = {
  scene: '[Layout] Person 1',
  source: '[Border] Camera 1',
  kind: 'border',
  filterName: 'Move: [Border] Camera 1',
  region: { x: 225, y: 120, width: 1470, height: 840 },
  size: { width: 1452, height: 822 },
  visible: true,
  duration: 300,
  delay: 0,
};
const name: MoveStep = {
  scene: '[Layout] Person 1',
  source: '[Text] Name 1',
  kind: 'source',
  filterName: 'Move: [Text] Name 1',
  region: { x: 1512, y: 827, width: 366, height: 106 },
  size: undefined,
  fontSize: 48,
  visible: true,
  duration: 300,
  delay: 0,
};

const enable = (writes: ReturnType<typeof filterWrites>, filterEnabled: boolean) =>
  writes.map(({ sourceName, filterName }) => ({
    requestType: 'SetSourceFilterEnabled',
    requestData: { sourceName, filterName, filterEnabled },
  }));

describe('buildMoveRequests', () => {
  it('disables, writes, sleeps, enables the border sizes, sleeps a frame, then enables the rest', () => {
    const writes = [layout, border].flatMap(filterWrites);
    const sizeWrites = writes.filter(
      (write) => write.filterName === 'Move: Width' || write.filterName === 'Move: Height',
    );
    const otherWrites = writes.filter((write) => !sizeWrites.includes(write));

    expect(writes).toHaveLength(6);
    expect(sizeWrites).toHaveLength(2);
    expect(buildMoveRequests([layout, border])).toEqual([
      ...enable(writes, false),
      ...writes.map((write) => ({ requestType: 'SetSourceFilterSettings', requestData: { ...write, overlay: false } })),
      { requestType: 'Sleep', requestData: { sleepFrames: 2 } },
      ...enable(sizeWrites, true),
      { requestType: 'Sleep', requestData: { sleepFrames: 1 } },
      ...enable(otherWrites, true),
    ]);
  });

  it('skips the lead sleep when nothing resizes, and sets font sizes with the settings', () => {
    const writes = filterWrites(name);

    expect(buildMoveRequests([name])).toEqual([
      ...enable(writes, false),
      ...writes.map((write) => ({ requestType: 'SetSourceFilterSettings', requestData: { ...write, overlay: false } })),
      {
        requestType: 'SetInputSettings',
        requestData: { inputName: '[Text] Name 1', inputSettings: { font: { size: 48 } }, overlay: true },
      },
      { requestType: 'Sleep', requestData: { sleepFrames: 2 } },
      ...enable(writes, true),
    ]);
  });

  it('settles a handed-off border at full opacity, then toggles every handoff in one frame before the moves', () => {
    const heir: MoveStep = { ...border, handoff: { sceneItemId: 7, visible: true } };
    const dropped: MoveStep = {
      ...border,
      source: '[Border] Content 1',
      filterName: 'Move: [Border] Content 1',
      visible: false,
      handoff: { sceneItemId: 4, visible: false },
    };
    const requests = buildMoveRequests([heir, dropped]);
    const index = (requestType: string, from = 0) =>
      requests.findIndex((request, at) => at >= from && request.requestType === requestType);
    const settle = index('Sleep');

    expect(requests.filter((request) => request.requestData.filterName === 'Opacity')).toEqual([
      {
        requestType: 'SetSourceFilterSettings',
        requestData: {
          sourceName: '[Border] Camera 1',
          filterName: 'Opacity',
          filterSettings: { opacity: 1 },
          overlay: true,
        },
      },
    ]);
    expect(index('SetSourceFilterSettings', settle)).toBe(-1);
    expect(requests.slice(settle + 1, settle + 3)).toEqual([
      {
        requestType: 'SetSceneItemEnabled',
        requestData: { sceneName: '[Layout] Person 1', sceneItemId: 7, sceneItemEnabled: true },
      },
      {
        requestType: 'SetSceneItemEnabled',
        requestData: { sceneName: '[Layout] Person 1', sceneItemId: 4, sceneItemEnabled: false },
      },
    ]);
    expect(requests[settle + 3]?.requestType).toBe('SetSourceFilterEnabled');
  });

  it('builds just the settle sleep for no steps', () => {
    expect(buildMoveRequests([])).toEqual([{ requestType: 'Sleep', requestData: { sleepFrames: 2 } }]);
  });

  it('joins the canvases stage by stage, so every canvas moves in the same frames', () => {
    const left = buildMovePhases([layout]);
    const right = buildMovePhases([border]);
    const joined = joinMovePhases([left, right]);
    const sleeps = joined.flatMap((request, index) => (request.requestType === 'Sleep' ? [index] : []));

    expect(joined).toEqual([
      ...left.prepare,
      ...right.prepare,
      { requestType: 'Sleep', requestData: { sleepFrames: 2 } },
      ...right.sizes,
      { requestType: 'Sleep', requestData: { sleepFrames: 1 } },
      ...left.moves,
      ...right.moves,
    ]);
    expect(sleeps).toHaveLength(2);
    expect(buildMoveRequests([layout, border])).toEqual(joinMovePhases([buildMovePhases([layout, border])]));
  });

  it('toggles items after every move is enabled, so they fade as the moves start', () => {
    const toggles = [
      { scene: 'Voice', source: 'Mic', sceneItemId: 5, visible: false },
      { scene: 'C', source: 'Music', sceneItemId: 16, visible: true },
    ];
    const requests = buildMoveRequests([layout], toggles);

    expect(requests.slice(-2)).toEqual([
      {
        requestType: 'SetSceneItemEnabled',
        requestData: { sceneName: 'Voice', sceneItemId: 5, sceneItemEnabled: false },
      },
      { requestType: 'SetSceneItemEnabled', requestData: { sceneName: 'C', sceneItemId: 16, sceneItemEnabled: true } },
    ]);
    expect(requests.slice(0, -2)).toEqual(buildMoveRequests([layout]));
  });

  it('passes every stage through a function', () => {
    const phases = buildMovePhases([border], [{ scene: 'C', source: 'Music', sceneItemId: 16, visible: true }]);
    const tagged = mapMovePhases(phases, (request) => ({
      ...request,
      requestData: { ...request.requestData, tag: 1 },
    }));

    for (const stage of ['prepare', 'handoffs', 'sizes', 'moves', 'toggles'] as const) {
      expect(tagged[stage]).toEqual(
        phases[stage].map((request) => ({ ...request, requestData: { ...request.requestData, tag: 1 } })),
      );
    }
  });
});
