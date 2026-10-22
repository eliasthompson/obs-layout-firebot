import { describe, expect, it, vi } from 'vitest';

import type { ObsClient } from '@/lib/connectObs';

import { locateCanvas, type ObsCanvas, readObsCanvases } from '@/lib/readObsCanvases';

const clientAnswering = (answer: Promise<Record<string, unknown>>): ObsClient => ({
  call: vi.fn(() => answer),
  callBatch: vi.fn(),
  close: vi.fn(),
});

const main: ObsCanvas = { name: 'Main', uuid: 'main-uuid', isMain: true, width: 1920, height: 1080 };
const vertical: ObsCanvas = { name: 'Aitum Vertical', uuid: 'vertical-uuid', isMain: false, width: 1080, height: 1920 };

describe('readObsCanvases', () => {
  it('reads each canvas with its UUID, whether it is the main one, and its base resolution', async () => {
    const client = clientAnswering(
      Promise.resolve({
        canvases: [
          {
            canvasName: 'Main',
            canvasUuid: 'main-uuid',
            canvasFlags: { MAIN: true },
            canvasVideoSettings: { baseWidth: 1920, baseHeight: 1080 },
          },
          {
            canvasName: 'Aitum Vertical',
            canvasUuid: 'vertical-uuid',
            canvasFlags: { MAIN: false },
            canvasVideoSettings: { baseWidth: 1080, baseHeight: 1920 },
          },
          { canvasName: 'Bare', canvasUuid: 'bare-uuid' },
        ],
      }),
    );

    await expect(readObsCanvases(client)).resolves.toEqual([
      main,
      vertical,
      { name: 'Bare', uuid: 'bare-uuid', isMain: false, width: 0, height: 0 },
    ]);
    expect(client.call).toHaveBeenCalledWith('GetCanvasList');
  });

  it('reads no canvases from an empty answer, and none at all when OBS cannot list them', async () => {
    await expect(readObsCanvases(clientAnswering(Promise.resolve({})))).resolves.toEqual([]);
    await expect(
      readObsCanvases(clientAnswering(Promise.reject(new Error('unknown request')))),
    ).resolves.toBeUndefined();
  });
});

describe('locateCanvas', () => {
  it('takes no name, or the main canvas by name, as the main canvas', () => {
    expect(locateCanvas(undefined, undefined)).toEqual({ kind: 'main' });
    expect(locateCanvas('Main', [main, vertical])).toEqual({ kind: 'main' });
  });

  it('finds another canvas by name', () => {
    expect(locateCanvas('Aitum Vertical', [main, vertical])).toEqual({ kind: 'other', canvas: vertical });
  });

  it('says why a canvas cannot be found', () => {
    expect(locateCanvas('Aitum Vertical', undefined)).toEqual({
      kind: 'missing',
      problem: 'OBS cannot list its canvases to find "Aitum Vertical"; that takes OBS 32.1 or later',
    });
    expect(locateCanvas('Aitum Vertical', [main])).toEqual({
      kind: 'missing',
      problem: 'OBS has no canvas "Aitum Vertical"; it has "Main"',
    });
  });
});
