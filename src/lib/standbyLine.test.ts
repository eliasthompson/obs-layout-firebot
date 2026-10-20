import { describe, expect, it } from 'vitest';

import { standbyLine } from '@/lib/standbyLine';

describe('standbyLine', () => {
  it('collapses content to no width at the canvas center, leaving a color source two borders wide', () => {
    const config = {
      container: 'C',
      options: { regionBorder: 6 },
      borderPadding: 9,
      participants: {},
      scenes: {},
    };

    expect(standbyLine(config, 540)).toEqual({
      content: { x: 960, y: 276, width: 0, height: 528 },
      border: { x: 945, y: 261, width: 30, height: 558 },
      size: { width: 12, height: 540 },
      cut: 960,
    });
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
