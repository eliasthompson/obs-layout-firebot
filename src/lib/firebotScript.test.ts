import { describe, expect, it, vi } from 'vitest';

import type { ConnectObs, ObsClient } from '@/lib/connectObs';
import type { FirebotRunRequest } from '@/types/FirebotRunRequest';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';

import { createRun, getDefaultParameters, getScriptManifest } from '@/lib/firebotScript';

const config = {
  container: 'C',
  participants: { L: { sources: { camera: { source: 'cam' } } } },
  // No main content, so the camera takes the main column and is shown on a default canvas
  scenes: { only: { participants: [{ layout: 'L', config: { contentMainAspectRatio: null } }] } },
};
const integrations = JSON.stringify({ OBS: { userSettings: { websocketSettings: { port: 4455, password: 'pw' } } } });

const fakeConnect = (results: ((count: number) => ObsBatchResult[]) | ObsBatchResult[]) => {
  const client: ObsClient = {
    call: vi.fn(),
    callBatch: vi.fn((requests: ObsRequest[]) =>
      Promise.resolve(typeof results === 'function' ? results(requests.length) : results),
    ),
    close: vi.fn(),
  };
  const connect: ConnectObs = vi.fn(() => Promise.resolve(client));
  return { client, connect };
};

const request = (parameters: FirebotRunRequest['parameters'], variable: unknown = config) => {
  const logs: string[] = [];
  const runRequest: FirebotRunRequest = {
    parameters,
    modules: {
      customVariableManager: { getCustomVariable: vi.fn(() => variable) },
      logger: {
        info: (message) => logs.push(`info ${message}`),
        warn: (message) => logs.push(`warn ${message}`),
        error: (message) => logs.push(`error ${message}`),
      },
    },
  };
  return { runRequest, logs };
};

const allOk = (count: number) =>
  Array.from({ length: count }, () => ({ requestType: 'x', requestStatus: { result: true, code: 100 } }));

describe('getScriptManifest', () => {
  it('describes the script for Firebot', () => {
    expect(getScriptManifest()).toMatchObject({ name: 'OBS Layout', firebotVersion: '5', startupOnly: false });
  });
});

describe('getDefaultParameters', () => {
  it('declares the scene key and the config variable, defaulting to layoutScenes', () => {
    const parameters = getDefaultParameters();

    expect(Object.keys(parameters)).toEqual(['sceneKey', 'configVariable']);
    expect(parameters.configVariable.default).toBe('layoutScenes');
  });
});

describe('createRun', () => {
  it('applies the scene from the config variable and logs a summary', async () => {
    const { client, connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const { runRequest, logs } = request({ sceneKey: ' only ' });

    await expect(run(runRequest)).resolves.toEqual({ success: true });
    expect(runRequest.modules.customVariableManager.getCustomVariable).toHaveBeenCalledWith('layoutScenes');
    expect(connect).toHaveBeenCalledWith({ url: 'ws://localhost:4455', password: 'pw' });
    expect(client.callBatch).toHaveBeenCalledOnce();
    expect(logs).toEqual([
      expect.stringMatching(/^info OBS Layout: scene "only", 2 items shown, 0 hidden, \d+ requests in \d+ ms\.$/),
    ]);
  });

  it('reads another variable, accepts JSON text, and uses the config connection over the profile', async () => {
    const { connect } = fakeConnect(allOk);
    const readIntegrations = vi.fn(() => integrations);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations });
    const { runRequest } = request(
      { sceneKey: 'only', configVariable: 'other' },
      JSON.stringify({ ...config, obs: { url: 'ws://cfg:1', password: 'x' } }),
    );

    await expect(run(runRequest)).resolves.toEqual({ success: true });
    expect(runRequest.modules.customVariableManager.getCustomVariable).toHaveBeenCalledWith('other');
    expect(readIntegrations).toHaveBeenCalledWith('/profile');
    expect(connect).toHaveBeenCalledWith({ url: 'ws://cfg:1', password: 'x' });
  });

  it('fails without a scene key, before touching OBS', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });

    await expect(run(request({ sceneKey: '  ' }).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: the sceneKey parameter is empty.',
    });
    await expect(run(request({}).runRequest)).resolves.toMatchObject({ success: false });
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails on a config variable that is missing or malformed', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });

    await expect(run(request({ sceneKey: 'only' }, null).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: layout config must be an object',
    });
    await expect(run(request({ sceneKey: 'only' }, '{bad json').runRequest)).resolves.toMatchObject({
      success: false,
      errorMessage: expect.stringContaining('OBS Layout: ') as string,
    });
  });

  it('fails on an unknown scene key', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });

    await expect(run(request({ sceneKey: 'nope' }).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: No scene "nope" in the layout config. Known scenes: only',
    });
  });

  it('logs and fails when OBS refuses requests', async () => {
    const { connect } = fakeConnect((count) => [
      { requestType: 'SetSourceFilterEnabled', requestStatus: { result: false, code: 600, comment: 'No filter' } },
      { requestType: 'Sleep', requestStatus: { result: false, code: 500 } },
      ...allOk(count - 2),
    ]);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const { runRequest, logs } = request({ sceneKey: 'only' });

    await expect(run(runRequest)).resolves.toEqual({
      success: false,
      errorMessage: expect.stringMatching(/^OBS Layout: 2 of \d+ OBS requests failed, see the log\.$/) as string,
    });
    expect(logs.slice(1)).toEqual([
      'warn OBS Layout: SetSourceFilterEnabled failed: 600 No filter',
      'warn OBS Layout: Sleep failed: 500',
    ]);
  });

  it('reports a connection failure and a thrown non-Error', async () => {
    const connect: ConnectObs = vi.fn(() => Promise.reject(new Error('OBS rejected the websocket password')));
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });

    await expect(run(request({ sceneKey: 'only' }).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: OBS rejected the websocket password',
    });

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers the path for non-Error values
    const odd: ConnectObs = vi.fn(() => Promise.reject('plain text'));
    const oddRun = createRun({ profileDir: '/profile', connect: odd, readIntegrations: () => integrations });

    await expect(oddRun(request({ sceneKey: 'only' }).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: plain text',
    });
  });

  it("reads the real integrations file by default and falls back to obs-websocket's defaults", async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/definitely/not/a/profile', connect });

    await expect(run(request({ sceneKey: 'only' }).runRequest)).resolves.toEqual({ success: true });
    expect(connect).toHaveBeenCalledWith({ url: 'ws://localhost:4455', password: '' });
  });
});
