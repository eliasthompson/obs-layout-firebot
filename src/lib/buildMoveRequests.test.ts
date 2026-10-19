import { describe, expect, it } from 'vitest';

import type { MoveStep } from '@/types/MoveStep';

import { buildMoveRequests } from '@/lib/buildMoveRequests';
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

  it('builds just the settle sleep for no steps', () => {
    expect(buildMoveRequests([])).toEqual([{ requestType: 'Sleep', requestData: { sleepFrames: 2 } }]);
  });
});
