import { describe, expect, it } from 'vitest';

import { layoutArea } from '@/lib/layoutArea';

describe('layoutArea', () => {
  it('takes the margins off the canvas', () => {
    expect(
      layoutArea({
        canvasWidth: 1080,
        canvasHeight: 1920,
        canvasMarginTop: 144,
        canvasMarginBottom: 422,
        canvasMarginLeft: 10,
        canvasMarginRight: 30,
        canvasPadding: 24,
      }),
    ).toEqual({ x: 10, y: 144, width: 1040, height: 1354 });
  });

  it('is the whole default canvas without options', () => {
    expect(layoutArea(undefined)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});
