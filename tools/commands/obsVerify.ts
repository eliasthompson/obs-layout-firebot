// Applies a scene key straight from this machine, the way the Firebot script does, then reads back every item's
// position, size, visibility, and opacity and compares them with the plan.
//
//   obs-layout-firebot obs:verify "<scene key>" [--config config/scenes.ts]
import { parseArgs } from 'node:util';

import type { MoveStep } from '@/types/MoveStep';

import { OPACITY_FILTER_NAME } from '@/constants/filterNames';
import { connectObs } from '@/lib/connectObs';
import { runLayout } from '@/lib/runLayout';

import { DEFAULT_CONFIG_PATH, loadConfig, sleep, toolObsConnection } from '../lib/environment';

export const obsVerify = async (args: string[]) => {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: { config: { type: 'string', default: DEFAULT_CONFIG_PATH } },
  });
  const [sceneKey = ''] = positionals;
  if (!sceneKey) throw new Error('usage: obs-layout-firebot obs:verify "<scene key>"');

  const config = await loadConfig(values.config);
  const connection = toolObsConnection(config);

  const summary = await runLayout({ config, sceneKey, connection });
  console.log(
    `${String(summary.requests.length)} requests in ${String(summary.durationMs)} ms, ${String(summary.failed.length)} failed`,
  );
  for (const result of summary.failed) {
    console.log(`  ${result.requestType}: ${String(result.requestStatus.code)} ${result.requestStatus.comment ?? ''}`);
  }

  // Staged moves end when the last stage does
  await sleep(Math.max(0, ...summary.steps.map((step) => step.delay + step.duration)) + 500);

  const client = await connectObs(connection);
  const itemIds = new Map<string, number>();
  const itemId = async (step: MoveStep) => {
    const key = `${step.scene}\u0000${step.source}`;
    let id = itemIds.get(key);
    if (id === undefined) {
      id = (await client.call('GetSceneItemId', { sceneName: step.scene, sourceName: step.source }))
        .sceneItemId as number;
      itemIds.set(key, id);
    }
    return id;
  };

  let mismatches = 0;
  try {
    for (const step of summary.steps) {
      const id = await itemId(step);
      const transform = (await client.call('GetSceneItemTransform', { sceneName: step.scene, sceneItemId: id }))
        .sceneItemTransform as { positionX: number; positionY: number; boundsWidth: number; boundsHeight: number };
      const enabled = (await client.call('GetSceneItemEnabled', { sceneName: step.scene, sceneItemId: id }))
        .sceneItemEnabled as boolean;
      // Standby text has no Opacity filter: it never fades
      const opacity =
        step.kind === 'text'
          ? step.visible
            ? 1
            : 0
          : ((
              (await client.call('GetSourceFilter', { sourceName: step.source, filterName: OPACITY_FILTER_NAME }))
                .filterSettings as { opacity?: number }
            ).opacity ?? 1);
      let fontNote = '';
      let fontOk = true;
      if (step.fontSize !== undefined) {
        const { font } = (await client.call('GetInputSettings', { inputName: step.source })).inputSettings as {
          font?: { size?: number };
        };
        fontOk = font?.size === step.fontSize;
        fontNote = ` font=${String(font?.size)} (want ${String(step.fontSize)})`;
      }

      // Borders render at native size, so their size is the color source's own width/height; other items use bounds
      let { boundsWidth: width, boundsHeight: height } = transform;
      if (step.kind === 'border') {
        const settings = (await client.call('GetInputSettings', { inputName: step.source })).inputSettings as {
          width: number;
          height: number;
        };
        width = settings.width;
        height = settings.height;
      }

      const wantWidth = step.size?.width ?? step.region?.width;
      const wantHeight = step.size?.height ?? step.region?.height;
      const placed =
        !step.region ||
        (transform.positionX === step.region.x &&
          transform.positionY === step.region.y &&
          width === wantWidth &&
          height === wantHeight);
      const ok = placed && fontOk && enabled === step.visible && Math.abs(opacity - (step.visible ? 1 : 0)) < 0.01;
      if (!ok) mismatches += 1;

      const target = step.region
        ? `${String(step.region.x)},${String(step.region.y)} ${String(wantWidth)}x${String(wantHeight)}`
        : 'keep';
      console.log(
        `${`${step.scene} / ${step.source}`.padEnd(42)} at ${String(transform.positionX)},${String(transform.positionY)} ${String(width)}x${String(height)} ${enabled ? 'shown ' : 'hidden'} opacity=${opacity.toFixed(2)}${fontNote} | want ${target} ${step.visible ? 'shown' : 'hidden'} ${ok ? 'OK' : 'MISMATCH'}`,
      );
    }
  } finally {
    client.close();
  }

  console.log(mismatches ? `${String(mismatches)} MISMATCHES` : 'all OK');
  if (mismatches || summary.failed.length) process.exitCode = 1;
};
