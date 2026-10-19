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

describe('adjustInsetRatios', () => {
  it('makes a side info strip hold its ratio inside the inset', () => {
    const [config] = adjustInsetRatios([{ infoAspectRatio: '250:49' }], [{ info: 12 }], generate);
    const [metric] = generate([config]);

    // 390 wide less two insets is 366, which at 250:49 is 71.7 high, so the strip is 96 high
    expect(metric.info).toEqual({ x: 1500, y: 135, width: 390, height: 96 });
    // The outer ratio lands near 390:96 (4.0625), as close as half a pixel of height requires
    expect(transformAspectRatio(String(config.infoAspectRatio) as AspectRatio)).toBeCloseTo(390 / 96, 1);
  });

  it('makes a main column region hold its ratio inside the inset when its height is the fixed side', () => {
    const [config] = adjustInsetRatios(
      [{ contentMainAspectRatio: '4:3', hasCamera: false }],
      [{ contentMain: 20 }],
      generate,
    );
    const [metric] = generate([config]);
    const inner = { width: (metric.contentMain?.width ?? 0) - 40, height: (metric.contentMain?.height ?? 0) - 40 };

    expect(metric.contentMain?.height).toBe(810);
    expect(Math.abs(inner.height - inner.width / (4 / 3))).toBeLessThan(0.5);
  });

  it('leaves configs alone without insets, with auto or null ratios, and for side cameras', () => {
    const configs: LayoutConfig[] = [
      { infoAspectRatio: 'auto', contentAuxAspectRatio: null, cameraMainAspectRatio: '4:3' },
      { infoAspectRatio: '1:1' },
    ];

    expect(adjustInsetRatios(configs, [{ info: 12, contentAux: 12, camera: 12 }, {}], generate)).toBe(configs);
  });

  it('adjusts a main column camera but not an invalid ratio', () => {
    // A square keeps its ratio inside any inset, so the camera uses 4:3 to need an adjustment
    const [camera, invalid] = adjustInsetRatios(
      [
        { contentMainAspectRatio: null, cameraMainAspectRatio: '4:3' },
        { contentMainAspectRatio: null, infoAspectRatio: '0:9' },
      ],
      [{ camera: 30 }, { info: 12 }],
      generate,
    );

    expect(camera.cameraMainAspectRatio).not.toBe('4:3');
    expect(invalid.infoAspectRatio).toBe('0:9');
  });

  it('skips regions the layout omits or shrinks below the inset', () => {
    // No side room on a bare canvas, so the info strip is omitted and its ratio stays declared
    const [omitted] = adjustInsetRatios([{ infoAspectRatio: '250:49' }], [{ info: 12 }], (configs) =>
      generateLayout(configs),
    );
    expect(omitted.infoAspectRatio).toBe('250:49');

    const tiny = (configs: LayoutConfig[]): LayoutMetric[] =>
      configs.map(() => ({ info: { x: 0, y: 0, width: 10, height: 10 } }));
    expect(adjustInsetRatios([{ infoAspectRatio: '2:1' }], [{ info: 12 }], tiny)[0].infoAspectRatio).toBe('2:1');
  });

  it('settles for the closest result after the allowed passes', () => {
    // A layout that ignores the ratio can never satisfy it; the result is still returned after maxPasses runs
    let runs = 0;
    const stubborn = (configs: LayoutConfig[]): LayoutMetric[] => {
      runs += 1;
      return configs.map(() => ({ info: { x: 0, y: 0, width: 400, height: 100 } }));
    };
    const [config] = adjustInsetRatios([{ infoAspectRatio: '1:1' }], [{ info: 10 }], stubborn, 3);

    expect(runs).toBe(3);
    expect(config.infoAspectRatio).not.toBe('1:1');
  });
});
