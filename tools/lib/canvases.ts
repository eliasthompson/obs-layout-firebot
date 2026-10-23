// The config's canvases as the tools reach them: each canvas's view of the config, a connection that addresses its
// requests to it, and its UUID, which the scene collection file records on every scene. A canvas OBS does not have is
// reported and left out, so the rest still deploys.
import type { ObsClient } from '@/lib/connectObs';
import type { CanvasScenesConfig, ScenesConfig } from '@/types/ScenesConfig';

import { addressClient, readAddressBook } from '@/lib/addressRequests';
import { listScenes } from '@/lib/listBindings';
import { locateCanvas, readObsCanvases } from '@/lib/readObsCanvases';
import { resolveCanvasConfig } from '@/lib/resolveCanvasConfig';

export interface ToolCanvas {
  /** The canvas, by its key in `canvases`. */
  key: string;
  config: CanvasScenesConfig;
  /** The connection, addressing every request to the canvas. */
  client: ObsClient;
  /** The canvas's UUID, when OBS lists its canvases. */
  uuid?: string;
  isMain: boolean;
}

/**
 * Reach every canvas of the config that OBS has.
 *
 * @param client - The open connection.
 * @param config - The whole config.
 * @param keys - The canvases to reach, by key; every canvas when left out.
 * @returns The canvases OBS has, in the config's order.
 */
export const openCanvases = async (
  client: ObsClient,
  config: ScenesConfig,
  keys: readonly string[] = Object.keys(config.canvases),
): Promise<ToolCanvas[]> => {
  const obsCanvases = await readObsCanvases(client);
  const canvases: ToolCanvas[] = [];

  for (const key of keys) {
    const view = resolveCanvasConfig(config, key);
    const located = locateCanvas(config.canvases[key].canvas, obsCanvases);
    if (located.kind === 'missing') {
      console.log(`SKIP    the "${key}" canvas: ${located.problem}`);
      continue;
    }
    if (located.kind === 'main') {
      canvases.push({
        key,
        config: view,
        client,
        uuid: obsCanvases?.find((canvas) => canvas.isMain)?.uuid,
        isMain: true,
      });
      continue;
    }
    const book = await readAddressBook(client, located.canvas.uuid, listScenes(view));
    canvases.push({ key, config: view, client: addressClient(client, book), uuid: located.canvas.uuid, isMain: false });
  }

  return canvases;
};

/** A prefix naming the canvas, for output about a config with more than one. */
export const canvasLabel = (config: ScenesConfig, key: string) =>
  Object.keys(config.canvases).length > 1 ? `[${key}] ` : '';
