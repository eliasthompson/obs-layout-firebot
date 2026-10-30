// What the tools ask OBS beyond the layout itself: that it is running and reachable, whether it is live, and which
// scene collection and profile it has loaded.
import type { ObsClient } from '@/lib/connectObs';
import type { ObsConnection } from '@/types/ScenesConfig';

import { connectObs } from '@/lib/connectObs';

import { OBS_PROCESS_NAME } from './apps';
import { sleep } from './environment';
import { isRunning } from './processes';

/** Wait for OBS to be running when a step needs it, telling the user; without a terminal to wait on, fail instead. */
export const ensureObsRunning = async () => {
  if (isRunning(OBS_PROCESS_NAME)) return;
  if (!process.stdin.isTTY) throw new Error('OBS is not running');
  console.log('OBS is not running; start it to continue, waiting...');
  while (!isRunning(OBS_PROCESS_NAME)) await sleep(1000);
  console.log('OBS is running');
};

/** Connect to OBS, retrying while its websocket server is still coming up after a start. */
export const connectObsPatiently = async (connection: ObsConnection, attempts = 10): Promise<ObsClient> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await connectObs(connection);
    } catch (error) {
      if (attempt >= attempts || !(error instanceof Error) || !error.message.startsWith('could not connect')) {
        throw error;
      }
      await sleep(2000);
    }
  }
};

/** Whether OBS is streaming or recording right now. */
export const readObsLiveStatus = async (client: ObsClient) => {
  const { outputActive: streaming } = (await client.call('GetStreamStatus')) as { outputActive: boolean };
  const { outputActive: recording } = (await client.call('GetRecordStatus')) as { outputActive: boolean };
  return { streaming, recording, live: streaming || recording };
};

/** The name of the scene collection OBS has loaded. */
export const readActiveSceneCollection = async (client: ObsClient) =>
  ((await client.call('GetSceneCollectionList')) as { currentSceneCollectionName: string }).currentSceneCollectionName;

/** The name of the profile OBS has loaded. */
export const readActiveProfile = async (client: ObsClient) =>
  ((await client.call('GetProfileList')) as { currentProfileName: string }).currentProfileName;
