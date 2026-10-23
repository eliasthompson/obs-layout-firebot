// Applies a scene key while sampling screenshots of a source on one canvas, to look at a transition frame by frame.
// Without --save it reports near-white pixel counts per frame (handy for spotting flashes); with --save it writes PNG
// frames. The canvas is the first that shows the scene unless --canvas names one, and the source its container.
//
//   obs-layout-firebot obs:capture "<scene key>" [--canvas portrait] [--source "[Scene] Content"] [--save frames/]
//     [--watch-input "[Border] Camera 1"] [--disable-filters Stroke,Shadow] [--modifiers Keyed,Timer] [--config config/scenes.ts]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { ObsClient } from '@/lib/connectObs';

import { connectObs } from '@/lib/connectObs';
import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { readObsCanvases } from '@/lib/readObsCanvases';
import { resolveCanvasConfig } from '@/lib/resolveCanvasConfig';
import { runLayout } from '@/lib/runLayout';

import { openCanvases } from '../lib/canvases';
import { DEFAULT_CONFIG_PATH, loadConfig, sleep, toolObsConnection } from '../lib/environment';

const analyzeBmp = (buffer: Buffer) => {
  const offset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const height = Math.abs(buffer.readInt32LE(22));
  const bytesPerPixel = buffer.readUInt16LE(28) / 8;
  const rowSize = Math.floor((bytesPerPixel * 8 * width + 31) / 32) * 4;
  let white = 0;
  let maxLuma = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = offset + y * rowSize + x * bytesPerPixel;
      const [b, g, r] = [buffer[i] ?? 0, buffer[i + 1] ?? 0, buffer[i + 2] ?? 0];
      maxLuma = Math.max(maxLuma, 0.2126 * r + 0.7152 * g + 0.0722 * b);
      if (r > 235 && g > 235 && b > 235) white += 1;
    }
  }
  return { white, maxLuma: Math.round(maxLuma) };
};

const imageBytes = (imageData: string) => Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');

/** A canvas's base size: from the canvas list, else OBS's video settings, which are the main canvas's. */
const canvasSize = async (client: ObsClient, uuid: string | undefined) => {
  const listed =
    uuid === undefined ? undefined : (await readObsCanvases(client))?.find((canvas) => canvas.uuid === uuid);
  if (listed?.width && listed.height) return listed;
  const { baseWidth, baseHeight } = (await client.call('GetVideoSettings')) as {
    baseWidth: number;
    baseHeight: number;
  };
  return { width: baseWidth, height: baseHeight };
};

export const obsCapture = async (args: string[]) => {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      canvas: { type: 'string' },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'disable-filters': { type: 'string' },
      modifiers: { type: 'string' },
      save: { type: 'string' },
      source: { type: 'string' },
      'watch-input': { type: 'string' },
    },
  });
  const [sceneKey = ''] = positionals;
  if (!sceneKey) throw new Error('usage: obs-layout-firebot obs:capture "<scene key>"');

  const config = await loadConfig(values.config);
  const connection = toolObsConnection(config);
  // Modifiers to apply the scene with, as the script would with them switched on
  const modifiers =
    values.modifiers
      ?.split(',')
      .map((name) => name.trim())
      .filter(Boolean) ?? [];
  const canvasKey =
    values.canvas ??
    Object.keys(config.canvases).find((key) => Object.hasOwn(resolveCanvasConfig(config, key).scenes, sceneKey));
  if (canvasKey === undefined) throw new Error(`no canvas shows "${sceneKey}"`);
  const canvasConfig = resolveCanvasConfig(config, canvasKey);
  const shotSource = values.source ?? canvasConfig.container;
  const disableFilters = values['disable-filters']?.split(',') ?? [];
  const steps = planLayoutMoves(canvasConfig, sceneKey, undefined, modifiers);
  const borders = steps.filter((step) => step.kind === 'border').map((step) => step.source);

  const connected = await connectObs(connection);
  // Screenshots and filter switches reach the canvas through its own addressing
  const canvas = (await openCanvases(connected, config, [canvasKey])).at(0);
  if (!canvas) {
    connected.close();
    throw new Error(`OBS does not have the "${canvasKey}" canvas`);
  }
  const { client } = canvas;
  const { width, height } = await canvasSize(connected, canvas.uuid);
  // OBS keeps the source's shape when given one side, so frames fit their long side to `size` on any canvas
  const fit = (size: number) => (width >= height ? { imageWidth: size } : { imageHeight: size });

  let saved = 0;
  const snapshot = async () => {
    if (values['watch-input'] !== undefined) {
      const settings = (await client.call('GetInputSettings', { inputName: values['watch-input'] })).inputSettings as {
        color?: number;
        width?: number;
        height?: number;
      };
      console.log(
        `  ${values['watch-input']}: color=0x${((settings.color ?? 0) >>> 0).toString(16).padStart(8, '0')} ${String(settings.width)}x${String(settings.height)}`,
      );
    }
    if (values.save !== undefined) {
      const { imageData } = (await client.call('GetSourceScreenshot', {
        sourceName: shotSource,
        imageFormat: 'png',
        ...fit(640),
      })) as { imageData: string };
      writeFileSync(join(values.save, `frame-${String(saved++).padStart(2, '0')}.png`), imageBytes(imageData));
      return undefined;
    }
    const { imageData } = (await client.call('GetSourceScreenshot', {
      sourceName: shotSource,
      imageFormat: 'bmp',
      ...fit(480),
    })) as { imageData: string };
    return analyzeBmp(imageBytes(imageData));
  };

  try {
    if (values.save !== undefined) mkdirSync(values.save, { recursive: true });
    for (const filterName of disableFilters) {
      for (const source of borders)
        await client.call('SetSourceFilterEnabled', { sourceName: source, filterName, filterEnabled: false });
    }
    if (disableFilters.length) console.log(`disabled ${disableFilters.join(', ')} on ${borders.join(', ')}`);

    const baseline = await snapshot();
    if (baseline) console.log(`baseline: white=${String(baseline.white)} maxLuma=${String(baseline.maxLuma)}`);

    const frames: { t: number; white: number; maxLuma: number }[] = [];
    const sampling = { active: true };
    const sampler = (async () => {
      const start = Date.now();
      while (sampling.active) {
        const t = Date.now() - start;
        const sample = await snapshot();
        if (sample) frames.push({ t, ...sample });
        await sleep(25);
      }
    })();

    const summary = await runLayout({ config, sceneKey, modifiers, connection });
    // Staged moves end when the last stage does
    await sleep(Math.max(0, ...summary.steps.map((step) => step.delay + step.duration)) + 500);
    sampling.active = false;
    await sampler;

    console.log(
      `${String(summary.requests.length)} requests in ${String(summary.durationMs)} ms, ${String(summary.failed.length)} failed`,
    );
    for (const frame of frames) {
      console.log(
        `${String(frame.t).padStart(5)} ms  white=${String(frame.white).padStart(6)}  maxLuma=${String(frame.maxLuma).padStart(3)}`,
      );
    }
    if (values.save !== undefined) console.log(`${String(saved)} frames saved to ${values.save}`);

    for (const filterName of disableFilters) {
      for (const source of borders)
        await client.call('SetSourceFilterEnabled', { sourceName: source, filterName, filterEnabled: true });
    }
  } finally {
    client.close();
  }
};
