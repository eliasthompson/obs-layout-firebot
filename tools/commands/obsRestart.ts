// Restarts OBS: closes it the way its window would be closed, never forcibly, and starts it again. With a config it
// first checks over the websocket that OBS is not streaming or recording. An OBS that cannot be closed from here, for
// example one running as administrator, is left for you to close, and then to start again. --dry-run runs the checks
// and reports the restart without closing or starting anything.
//
//   obs-layout-firebot obs:restart [--config config/scenes.ts] [--yes] [--dry-run]
import { parseArgs } from 'node:util';

import type { ScenesConfig } from '@/types/ScenesConfig';

import { OBS_PROCESS_NAME, obsApp } from '../lib/apps';
import { confirm, loadOptionalConfig, toolObsConnection } from '../lib/environment';
import { connectObsPatiently, readObsLiveStatus } from '../lib/obs';
import { describeRestart, isRunning, restartApp } from '../lib/processes';

/** Throw when OBS is streaming or recording; closing it then is never what anyone wants. */
export const assertObsNotLive = async (config: ScenesConfig) => {
  const client = await connectObsPatiently(toolObsConnection(config));
  try {
    const { streaming, recording } = await readObsLiveStatus(client);
    if (streaming || recording) {
      throw new Error(`OBS is ${streaming ? 'streaming' : 'recording'}; not restarting it`);
    }
  } finally {
    client.close();
  }
};

export const obsRestart = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
  });
  const dryRun = values['dry-run'];
  const config = await loadOptionalConfig(values.config);

  if (isRunning(OBS_PROCESS_NAME)) {
    if (config) await assertObsNotLive(config);
    else console.log('no config, so whether OBS is live was not checked');
    if (!dryRun && !(await confirm('Restart OBS now?', values.yes))) {
      console.log('not restarted');
      return;
    }
  }

  if (dryRun) {
    describeRestart(obsApp(config));
    return;
  }
  await restartApp(obsApp(config), () => undefined);
};
