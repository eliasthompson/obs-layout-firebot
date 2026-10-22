import {
  type AspectRatio,
  createLayoutGenerator,
  generateLayout,
  type LayoutConfig,
  type LayoutMetric,
  transformAspectRatio,
} from '@eliasthompson/obs-layout-generator';
import { describe, expect, it } from 'vitest';

import { adjustInsetRatios } from '@/lib/adjustInsetRatios';

const options = { canvasPadding: 15, canvasMarginTop: 105, canvasMarginBottom: 105, regionBorder: 15 };
const generate = (configs: LayoutConfig[]) => createLayoutGenerator(options)(configs);

/** How far the area inside an inset is from a ratio, in pixels of height. */
const innerError = (region: undefined | { width: number; height: number }, inset: number, ratio: number) => {
  const inner = { width: (region?.width ?? 0) - inset * 2, height: (region?.height ?? 0) - inset * 2 };
  return Math.abs(inner.height - inner.width / ratio);
};

describe('adjustInsetRatios', () => {
  it('makes a side info strip hold its ratio inside the inset', () => {
    const [config] = adjustInsetRatios([{ info: { aspectRatio: '250:49' } }], [{ info: 12 }], generate);
    const [metric] = generate([config]);

    // 390 wide less two insets is 366, which at 250:49 is 71.7 high, so the strip is 96 high
    expect(metric.info).toEqual({ x: 1500, y: 135, width: 390, height: 96, hasBorder: true });
    // The outer ratio lands near 390:96 (4.0625), as close as half a pixel of height requires
    expect(transformAspectRatio(String(config.info?.aspectRatio) as AspectRatio)).toBeCloseTo(390 / 96, 1);
  });

  it('makes a main column region hold its ratio inside the inset when its height is the fixed side', () => {
    const [config] = adjustInsetRatios(
      [{ camera: null, contentMain: { aspectRatio: '4:3' } }],
      [{ contentMain: 20 }],
      generate,
    );
    const [metric] = generate([config]);

    expect(metric.contentMain?.height).toBe(810);
    expect(innerError(metric.contentMain, 20, 4 / 3)).toBeLessThanOrEqual(0.5);
  });

  it('adjusts aux content in the main column', () => {
    const [config] = adjustInsetRatios(
      [{ camera: null, contentAux: { aspectRatio: '4:3' }, contentMain: null }],
      [{ contentAux: 20 }],
      generate,
    );
    const [metric] = generate([config]);

    expect(config.contentAux?.aspectRatio).not.toBe('4:3');
    expect(innerError(metric.contentAux, 20, 4 / 3)).toBeLessThanOrEqual(0.5);
  });

  it('leaves configs alone without insets, with auto or null ratios, for defaults, and for side cameras', () => {
    const configs: LayoutConfig[] = [
      { camera: { mainAspectRatio: '4:3' }, contentAux: null, info: { aspectRatio: 'auto' } },
      { info: { aspectRatio: '1:1' } },
      {},
    ];

    expect(
      adjustInsetRatios(
        configs,
        [{ info: 12, contentAux: 12, camera: 12 }, {}, { contentMain: 12, camera: 12 }],
        generate,
      ),
    ).toBe(configs);
  });

  it('adjusts a main column camera but not an invalid ratio', () => {
    // A square keeps its ratio inside any inset, so the camera uses 4:3 to need an adjustment
    const [camera, invalid] = adjustInsetRatios(
      [
        { camera: { mainAspectRatio: '4:3' }, contentMain: null },
        { contentMain: null, info: { aspectRatio: '0:9' } },
      ],
      [{ camera: 30 }, { info: 12 }],
      generate,
    );

    expect(camera.camera?.mainAspectRatio).not.toBe('4:3');
    expect(invalid.info?.aspectRatio).toBe('0:9');
  });

  it('skips regions the layout omits or shrinks below the inset', () => {
    // No side room on a bare canvas, so the info strip is omitted and its ratio stays declared
    const [omitted] = adjustInsetRatios([{ info: { aspectRatio: '250:49' } }], [{ info: 12 }], (configs) =>
      generateLayout(configs),
    );
    expect(omitted.info?.aspectRatio).toBe('250:49');

    const tiny = (configs: LayoutConfig[]): LayoutMetric[] =>
      configs.map(() => ({ info: { x: 0, y: 0, width: 10, height: 10, hasBorder: true } }));
    expect(adjustInsetRatios([{ info: { aspectRatio: '2:1' } }], [{ info: 12 }], tiny)[0].info?.aspectRatio).toBe(
      '2:1',
    );
  });

  it('settles for the closest result after the allowed passes', () => {
    // A layout that ignores the ratio can never satisfy it; the result is still returned after maxPasses runs
    let runs = 0;
    const stubborn = (configs: LayoutConfig[]): LayoutMetric[] => {
      runs += 1;
      return configs.map(() => ({ info: { x: 0, y: 0, width: 400, height: 100, hasBorder: true } }));
    };
    const [config] = adjustInsetRatios([{ info: { aspectRatio: '1:1' } }], [{ info: 10 }], stubborn, 3);

    expect(runs).toBe(3);
    expect(config.info?.aspectRatio).not.toBe('1:1');
  });
});
