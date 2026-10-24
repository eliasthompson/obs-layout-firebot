import { describe, expect, it, vi } from 'vitest';

import type { ConnectObs, ObsClient } from '@/lib/connectObs';
import type { FirebotRunRequest } from '@/types/FirebotRunRequest';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';

import { version as packageVersion } from '#package.json';
import { createRun, getDefaultParameters, getScriptManifest } from '@/lib/firebotScript';

const config = {
  canvases: {
    main: { container: 'C', participants: { L: { sources: { camera: { source: 'cam', border: 'edge' } } } } },
  },
  // No main content, so the camera takes the main column and is shown on a default canvas
  scenes: { only: { participants: [{ layout: 'L', config: { contentMain: null } }] } },
  modifiers: { Keyed: { config: { camera: { isGreenScreen: true } } } },
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

const request = (parameters: FirebotRunRequest['parameters'], variable: unknown = config, state?: unknown) => {
  const logs: string[] = [];
  const runRequest: FirebotRunRequest = {
    parameters,
    modules: {
      customVariableManager: {
        getCustomVariable: vi.fn((name: string) => (name.endsWith('State') ? state : variable)),
        addCustomVariable: vi.fn(),
      },
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
    expect(getScriptManifest()).toMatchObject({
      name: 'OBS Layout',
      version: packageVersion,
      firebotVersion: '5',
      startupOnly: false,
    });
  });
});

describe('getDefaultParameters', () => {
  it('declares the scene key and the config variable, defaulting to layoutScenes', () => {
    const parameters = getDefaultParameters();

    expect(Object.keys(parameters)).toEqual(['sceneKey', 'configVariable', 'modifier', 'modifierState']);
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
      expect.stringMatching(/^info OBS Layout: scene "only", 3 items shown, 0 hidden, \d+ requests in \d+ ms\.$/),
    ]);
    expect(runRequest.modules.customVariableManager.addCustomVariable).toHaveBeenCalledWith(
      'layoutScenesState',
      { sceneKey: 'only', modifiers: [] },
      0,
    );
  });

  it('counts the items it toggled in the summary', async () => {
    const toggled = {
      ...config,
      canvases: { main: { ...config.canvases.main, items: { Voice: { visible: false } } } },
    };
    const { connect } = fakeConnect((count) =>
      count === 3
        ? [
            {
              requestType: 'GetSceneItemList',
              requestStatus: { result: true, code: 100 },
              responseData: { sceneItems: [] },
            },
            {
              requestType: 'GetSceneItemList',
              requestStatus: { result: true, code: 100 },
              responseData: { sceneItems: [{ sourceName: 'Voice', sceneItemId: 8, sceneItemEnabled: true }] },
            },
            { requestType: 'GetGroupSceneItemList', requestStatus: { result: false, code: 602 } },
          ]
        : allOk(count),
    );
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const { runRequest, logs } = request({ sceneKey: 'only' }, toggled);

    await expect(run(runRequest)).resolves.toEqual({ success: true });
    expect(logs[0]).toMatch(/^info OBS Layout: scene "only", 3 items shown, 0 hidden, 1 toggled, \d+ requests/);
  });

  it('switches a modifier on, applies the remembered scene with it, and keeps it for the next scene', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const on = request({ modifier: 'Keyed' }, config, JSON.stringify({ sceneKey: 'only', modifiers: [] }));

    await expect(run(on.runRequest)).resolves.toEqual({ success: true });
    expect(on.logs[0]).toMatch(/^info OBS Layout: scene "only" with Keyed, 2 items shown, 1 hidden/);
    expect(on.runRequest.modules.customVariableManager.addCustomVariable).toHaveBeenCalledWith(
      'layoutScenesState',
      { sceneKey: 'only', modifiers: ['Keyed'] },
      0,
    );

    const next = request({ sceneKey: 'only' }, config, { sceneKey: 'only', modifiers: ['Keyed'] });
    await expect(run(next.runRequest)).resolves.toEqual({ success: true });
    expect(next.logs[0]).toMatch(/with Keyed/);

    const off = request({ modifier: 'Keyed', modifierState: 'OFF' }, config, {
      sceneKey: 'only',
      modifiers: ['Keyed'],
    });
    await expect(run(off.runRequest)).resolves.toEqual({ success: true });
    expect(off.runRequest.modules.customVariableManager.addCustomVariable).toHaveBeenCalledWith(
      'layoutScenesState',
      { sceneKey: 'only', modifiers: [] },
      0,
    );
  });

  it('switches every modifier off with *, and remembers a modifier without a scene to apply yet', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const reset = request({ modifier: '*' }, config, { sceneKey: 'only', modifiers: ['Keyed', 'Ghost'] });

    await expect(run(reset.runRequest)).resolves.toEqual({ success: true });
    expect(reset.runRequest.modules.customVariableManager.addCustomVariable).toHaveBeenCalledWith(
      'layoutScenesState',
      { sceneKey: 'only', modifiers: [] },
      0,
    );

    const early = request({ modifier: 'Keyed' }, config, { modifiers: 'not a list' });
    await expect(run(early.runRequest)).resolves.toEqual({ success: true });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(early.logs).toEqual(['info OBS Layout: modifiers Keyed; no scene to apply yet.']);

    const nothing = request({ modifier: '*' });
    await expect(run(nothing.runRequest)).resolves.toEqual({ success: true });
    expect(nothing.logs).toEqual(['info OBS Layout: modifiers off; no scene to apply yet.']);
    expect(early.runRequest.modules.customVariableManager.addCustomVariable).toHaveBeenCalledWith(
      'layoutScenesState',
      { modifiers: ['Keyed'] },
      0,
    );
  });

  it('switches a modifier on once, drops stray state values, and takes an empty scene key as none', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const again = request({ modifier: 'Keyed' }, config, { sceneKey: '', modifiers: ['Keyed', 7, 'Ghost'] });

    await expect(run(again.runRequest)).resolves.toEqual({ success: true });
    expect(connect).not.toHaveBeenCalled();
    expect(again.runRequest.modules.customVariableManager.addCustomVariable).toHaveBeenCalledWith(
      'layoutScenesState',
      { modifiers: ['Ghost', 'Keyed'] },
      0,
    );
  });

  it('fails on a modifier the config does not define, before touching OBS', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });

    await expect(run(request({ modifier: 'Ghost' }).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: no modifier "Ghost" in the layout config.',
    });
    await expect(run(request({ modifier: 'Keyed' }, { ...config, modifiers: undefined }).runRequest)).resolves.toEqual({
      success: false,
      errorMessage: 'OBS Layout: no modifier "Keyed" in the layout config.',
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('warns about a canvas OBS does not have, and still applies the scene on the rest', async () => {
    const { connect } = fakeConnect(allOk);
    const run = createRun({ profileDir: '/profile', connect, readIntegrations: () => integrations });
    const dual = {
      ...config,
      canvases: {
        ...config.canvases,
        portrait: {
          canvas: 'Aitum Vertical',
          container: 'C',
          participants: { L: { sources: { camera: { source: 'cam (V)' } } } },
        },
      },
    };
    const { runRequest, logs } = request({ sceneKey: 'only' }, dual);

    await expect(run(runRequest)).resolves.toEqual({ success: true });
    expect(logs.slice(1)).toEqual([
      'warn OBS Layout: left the "portrait" canvas as it is: OBS cannot list its canvases to find "Aitum Vertical"; that takes OBS 32.1 or later.',
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
      errorMessage: 'OBS Layout: the sceneKey and modifier parameters are both empty.',
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
