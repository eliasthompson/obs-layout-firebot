import { describe, expect, it } from 'vitest';

import { standbyLine } from '@/lib/standbyLine';

describe('standbyLine', () => {
  it('collapses content to no width up the middle of a landscape canvas, leaving a color source two borders wide', () => {
    const config = {
      container: 'C',
      options: { regionBorder: 6 },
      borderPadding: 9,
      participants: {},
      scenes: {},
    };

    expect(standbyLine(config, 540)).toEqual({
      isHorizontal: false,
      content: { x: 960, y: 276, width: 0, height: 528 },
      border: { x: 945, y: 261, width: 30, height: 558 },
      size: { width: 12, height: 540 },
      cut: 960,
      textScene: { positionX: 960, positionY: 0, cropLeft: 960, cropBottom: 0 },
    });
  });

  it('collapses content to no height across the middle of a portrait canvas, the text scene cropped below it', () => {
    const config = {
      container: 'C',
      options: { canvasWidth: 1080, canvasHeight: 1920, regionBorder: 6 },
      borderPadding: 9,
      participants: {},
      scenes: {},
    };

    expect(standbyLine(config, 720)).toEqual({
      isHorizontal: true,
      content: { x: 186, y: 960, width: 708, height: 0 },
      border: { x: 171, y: 945, width: 738, height: 30 },
      size: { width: 720, height: 12 },
      cut: 960,
      textScene: { positionX: 0, positionY: 0, cropLeft: 0, cropBottom: 960 },
    });
  });

  it('centers the line on the layout area, the canvas less its margins', () => {
    const margins = (options: Record<string, number>) => ({
      container: 'C',
      options: { regionBorder: 6, ...options },
      participants: {},
      scenes: {},
    });
    // 144 above and 422 below a 1920 tall canvas leave a layout area centered at y 821
    const portrait = standbyLine(
      margins({ canvasWidth: 1080, canvasHeight: 1920, canvasMarginTop: 144, canvasMarginBottom: 422 }),
      720,
    );
    // Even margins leave the landscape line where it was; a left margin moves it right
    const landscape = standbyLine(margins({ canvasMarginTop: 105, canvasMarginBottom: 105 }), 540);
    const shifted = standbyLine(margins({ canvasMarginLeft: 200 }), 540);

    expect(portrait).toMatchObject({
      content: { x: 186, y: 821, width: 708, height: 0 },
      cut: 821,
      textScene: { positionX: 0, positionY: 0, cropLeft: 0, cropBottom: 1099 },
    });
    expect(landscape).toMatchObject({ content: { x: 960, y: 276, width: 0, height: 528 }, cut: 960 });
    expect(shifted).toMatchObject({ cut: 1060, textScene: { positionX: 1060, cropLeft: 1060 } });
  });

  it('follows the orientation option over the canvas shape, as the layout does', () => {
    const square = (orientation?: 'auto' | 'landscape' | 'portrait') => ({
      container: 'C',
      options: { canvasWidth: 1080, canvasHeight: 1080, orientation },
      participants: {},
      scenes: {},
    });
    const tall = {
      ...square('landscape'),
      options: { canvasWidth: 1080, canvasHeight: 1920, orientation: 'landscape' as const },
    };

    expect(standbyLine(square('portrait'), 540).isHorizontal).toBe(true);
    expect(standbyLine(square('auto'), 540).isHorizontal).toBe(false);
    expect(standbyLine(tall, 540).isHorizontal).toBe(false);
  });

  it('uses the config canvas and falls back to the library defaults', () => {
    expect(
      standbyLine(
        { container: 'C', options: { canvasWidth: 1281, canvasHeight: 721 }, participants: {}, scenes: {} },
        301,
      ),
    ).toMatchObject({ content: { x: 641, y: 210, width: 0, height: 301 }, size: { width: 0, height: 301 }, cut: 641 });
    expect(standbyLine({ container: 'C', participants: {}, scenes: {} }, 540).cut).toBe(960);
  });
});
