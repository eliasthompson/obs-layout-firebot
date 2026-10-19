// Applies a scene key while sampling screenshots of a source, to look at a transition frame by frame. Without
// --save it reports near-white pixel counts per frame (handy for spotting flashes); with --save it writes PNG frames.
//
//   obs-layout-firebot capture "<scene key>" [--source "[Scene] Content"] [--save frames/]
//     [--watch-input "[Border] Camera 1"] [--disable-filters Stroke,Shadow] [--config config/scenes.ts]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { connectObs } from '@/lib/connectObs';
import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { runLayout } from '@/lib/runLayout';

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

export const capture = async (args: string[]) => {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'disable-filters': { type: 'string' },
      save: { type: 'string' },
      source: { type: 'string' },
      'watch-input': { type: 'string' },
    },
  });
  const [sceneKey = ''] = positionals;
  if (!sceneKey) throw new Error('usage: obs-layout-firebot capture "<scene key>"');

  const config = await loadConfig(values.config);
  const connection = toolObsConnection(config);
  const shotSource = values.source ?? config.container;
  const disableFilters = values['disable-filters']?.split(',') ?? [];
  const steps = planLayoutMoves(config, sceneKey);
  const borders = steps.filter((step) => step.kind === 'border').map((step) => step.source);

  const client = await connectObs(connection);

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
        imageWidth: 640,
        imageHeight: 360,
      })) as { imageData: string };
      writeFileSync(join(values.save, `frame-${String(saved++).padStart(2, '0')}.png`), imageBytes(imageData));
      return undefined;
    }
    const { imageData } = (await client.call('GetSourceScreenshot', {
      sourceName: shotSource,
      imageFormat: 'bmp',
      imageWidth: 480,
      imageHeight: 270,
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

    const summary = await runLayout({ config, sceneKey, connection });
    await sleep((steps[0]?.duration ?? 300) + 500);
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
