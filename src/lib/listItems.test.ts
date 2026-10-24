import { describe, expect, it } from 'vitest';

import { listItems, listItemScenes } from '@/lib/listItems';

const config = {
  container: '[Scene] Canvas',
  items: {
    '[Audio] Voice': { visible: true },
    Mic: { source: '[Audio] Microphone', scene: '[Audio] Voice', visible: false },
    Music: { scene: '[Scene] Canvas', visible: true },
  },
};

describe('listItems', () => {
  it('lists each item under its key, in the container and named by its key unless it says otherwise', () => {
    expect(listItems(config)).toEqual([
      { key: '[Audio] Voice', scene: '[Scene] Canvas', source: '[Audio] Voice', visible: true },
      { key: 'Mic', scene: '[Audio] Voice', source: '[Audio] Microphone', visible: false },
      { key: 'Music', scene: '[Scene] Canvas', source: 'Music', visible: true },
    ]);
  });

  it('lists nothing for a canvas without items', () => {
    expect(listItems({ container: 'C' })).toEqual([]);
  });
});

describe('listItemScenes', () => {
  it('lists the scenes and groups that hold the items, once each', () => {
    expect(listItemScenes(config)).toEqual(['[Scene] Canvas', '[Audio] Voice']);
  });
});
