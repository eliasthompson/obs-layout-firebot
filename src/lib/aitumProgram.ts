import type { ObsClient } from '@/lib/connectObs';
import type { ObsCanvas } from '@/lib/readObsCanvases';
import type { ObsRequest } from '@/types/ObsRequest';

import { AITUM_CURRENT_SCENE, AITUM_SWITCH_SCENE, AITUM_VERTICAL_VENDOR } from '@/constants/aitumVertical';

/**
 * The scene an Aitum Vertical canvas has on program. Aitum tells its canvases apart by size, so the canvas's base
 * resolution picks it.
 *
 * @param client - The open connection.
 * @param canvas - The canvas.
 * @returns The scene's name, or `undefined` when Aitum Vertical cannot say.
 */
export const readAitumProgramScene = async (client: ObsClient, { width, height }: ObsCanvas) => {
  try {
    const { responseData } = (await client.call('CallVendorRequest', {
      vendorName: AITUM_VERTICAL_VENDOR,
      requestType: AITUM_CURRENT_SCENE,
      requestData: { width, height },
    })) as { responseData?: { scene?: unknown } };
    return typeof responseData?.scene === 'string' ? responseData.scene : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The request that puts a scene on program on Aitum Vertical's canvas. Aitum switches every canvas it has, a moment
 * after it answers.
 *
 * @param scene - The scene, by name.
 * @returns The request.
 */
export const switchAitumProgramScene = (scene: string): ObsRequest => ({
  requestType: 'CallVendorRequest',
  requestData: { vendorName: AITUM_VERTICAL_VENDOR, requestType: AITUM_SWITCH_SCENE, requestData: { scene } },
});
