import { describe, expect, it } from 'vitest';

import { growRegion, shrinkRegion } from '@/lib/growRegion';

describe('growRegion', () => {
  it('grows a region by the border on every side', () => {
    expect(growRegion({ x: 30, y: 135, width: 1440, height: 810 }, 15)).toEqual({
      x: 15,
      y: 120,
      width: 1470,
      height: 840,
    });
  });

  it('leaves a region alone for a zero border', () => {
    const region = { x: 1, y: 2, width: 3, height: 4 };

    expect(growRegion(region, 0)).toEqual(region);
  });
});

describe('shrinkRegion', () => {
  it('shrinks a region by the inset on every side', () => {
    expect(shrinkRegion({ x: 1500, y: 815, width: 390, height: 130 }, 12)).toEqual({
      x: 1512,
      y: 827,
      width: 366,
      height: 106,
    });
  });

  it('never shrinks below one pixel', () => {
    expect(shrinkRegion({ x: 0, y: 0, width: 10, height: 30 }, 20)).toEqual({ x: 20, y: 20, width: 1, height: 1 });
  });
});
