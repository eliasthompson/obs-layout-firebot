import { describe, expect, it, vi } from 'vitest';

import type { ConnectObs, ObsClient } from '@/lib/connectObs';
import type { ObsBatchResult, ObsRequest } from '@/types/ObsRequest';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { addressRequest, type ObsAddressBook } from '@/lib/addressRequests';
import { buildMovePhases, buildMoveRequests, joinMovePhases, mapMovePhases } from '@/lib/buildMoveRequests';
import { planLayoutMoves } from '@/lib/planLayoutMoves';
import { resolveCanvasConfig } from '@/lib/resolveCanvasConfig';
import { runLayout } from '@/lib/runLayout';

const config: ScenesConfig = {
  canvases: { main: { container: 'C', participants: { L: { sources: { camera: { source: 'cam' } } } } } },
  scenes: { only: { participants: [{ layout: 'L' }] } },
};
const connection = { url: 'ws://obs:4455', password: '' };
const ok = { result: true, code: 100 };

/** A client whose main program shows the container unless a test says otherwise. */
const fakeConnect = (results: ObsBatchResult[]) => {
  const client: ObsClient = {
    call: vi.fn(() => Promise.resolve({ currentProgramSceneName: 'C' })),
    callBatch: vi.fn(() => Promise.resolve(results)),
    close: vi.fn(),
  };
  const connect: ConnectObs = vi.fn(() => Promise.resolve(client));
  return { client, connect };
};

describe('runLayout', () => {
  it('plans with the modifiers switched on', async () => {
    const keyed: ScenesConfig = {
      ...config,
      canvases: {
        main: { container: 'C', participants: { L: { sources: { camera: { source: 'cam', border: 'edge' } } } } },
      },
      modifiers: { Keyed: { config: { camera: { isGreenScreen: true } } } },
    };
    const { connect } = fakeConnect([]);
    const summary = await runLayout({ config: keyed, sceneKey: 'only', modifiers: ['Keyed'], connection, connect });

    expect(summary.steps.find((step) => step.source === 'edge')?.visible).toBe(false);
  });

  it('connects, sends the batch frame-synced, and closes', async () => {
    const steps = planLayoutMoves(resolveCanvasConfig(config, 'main'), 'only');
    const requests = buildMoveRequests(steps);
    const results = requests.map((request) => ({ requestType: request.requestType, requestStatus: ok }));
    const { client, connect } = fakeConnect(results);
    const clock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1047);

    const summary = await runLayout({ config, sceneKey: 'only', connection, connect, now: clock });

    expect(connect).toHaveBeenCalledWith(connection);
    expect(client.call).not.toHaveBeenCalledWith('GetCanvasList');
    expect(client.callBatch).toHaveBeenCalledWith(requests, 1);
    expect(client.close).toHaveBeenCalledOnce();
    expect(summary).toEqual({
      canvases: [{ canvas: 'main', steps, toggles: [] }],
      steps,
      toggles: [],
      requests,
      results,
      failed: [],
      durationMs: 47,
    });
  });

  it('ends the batch by switching to the container only when program shows another scene or cannot be read', async () => {
    const switchToContainer = { requestType: 'SetCurrentProgramScene', requestData: { sceneName: 'C' } };
    const moves = buildMoveRequests(planLayoutMoves(resolveCanvasConfig(config, 'main'), 'only'));
    const elsewhere = fakeConnect([]);
    vi.mocked(elsewhere.client.call).mockResolvedValueOnce({ currentProgramSceneName: 'Gameplay' });
    const unknown = fakeConnect([]);
    vi.mocked(unknown.client.call).mockResolvedValueOnce({});
    const unreachable = fakeConnect([]);
    vi.mocked(unreachable.client.call).mockRejectedValueOnce(new Error('no'));

    for (const { connect } of [elsewhere, unknown, unreachable]) {
      const summary = await runLayout({ config, sceneKey: 'only', connection, connect });
      expect(summary.requests).toEqual([...moves, switchToContainer]);
    }
    expect(elsewhere.client.call).toHaveBeenCalledWith('GetCurrentProgramScene');
  });

  it('reports failed requests', async () => {
    const failed = { requestType: 'SetSourceFilterEnabled', requestStatus: { result: false, code: 600 } };
    const { connect } = fakeConnect([{ requestType: 'Sleep', requestStatus: ok }, failed]);

    const summary = await runLayout({ config, sceneKey: 'only', connection, connect });

    expect(summary.failed).toEqual([failed]);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reads what OBS shows first when the config has standby settings, and plans from it', async () => {
    const standby: ScenesConfig = {
      ...config,
      canvases: {
        main: {
          container: 'C',
          participants: { L: { sources: { camera: { source: 'cam', border: 'camBorder' } } } },
          standby: { textScene: 'T', lineLength: 540 },
        },
      },
    };
    const { client, connect } = fakeConnect([]);
    const missing = { result: false, code: 600 };
    vi.mocked(client.callBatch).mockResolvedValueOnce([
      {
        requestType: 'GetSceneItemList',
        requestStatus: ok,
        responseData: { sceneItems: [{ sourceName: 'L', sceneItemId: 1, sceneItemEnabled: false }] },
      },
      { requestType: 'GetSceneItemList', requestStatus: missing },
      { requestType: 'GetSceneItemList', requestStatus: missing },
      { requestType: 'GetSourceFilter', requestStatus: missing },
    ]);

    const summary = await runLayout({ config: standby, sceneKey: 'only', connection, connect });

    expect(client.callBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.callBatch).mock.calls[0]?.[1]).toBe(0);
    expect(summary.steps).toEqual(
      planLayoutMoves(resolveCanvasConfig(standby, 'main'), 'only', {
        sceneItems: { C: [{ sourceName: 'L', sceneItemId: 1, sceneItemEnabled: false }] },
        borderThickness: {},
        fontSizes: {},
      }),
    );
    expect(client.callBatch).toHaveBeenLastCalledWith(summary.requests, 1);
  });

  it('toggles the items the scene and the modifiers say, from what OBS shows, at the end of the batch', async () => {
    const toggled: ScenesConfig = {
      ...config,
      canvases: { main: { ...config.canvases.main, items: { Voice: { visible: true }, Music: { visible: true } } } },
      scenes: { only: { participants: [{ layout: 'L' }], items: { Voice: false } } },
      modifiers: { Quiet: { items: { Music: false } } },
    };
    const { client, connect } = fakeConnect([]);
    // The layout scene, then the container the items sit in, asked as a scene and as a group
    vi.mocked(client.callBatch).mockResolvedValueOnce([
      { requestType: 'GetSceneItemList', requestStatus: ok, responseData: { sceneItems: [] } },
      {
        requestType: 'GetSceneItemList',
        requestStatus: ok,
        responseData: {
          sceneItems: [
            { sourceName: 'Voice', sceneItemId: 8, sceneItemEnabled: true },
            { sourceName: 'Music', sceneItemId: 16, sceneItemEnabled: true },
          ],
        },
      },
      { requestType: 'GetGroupSceneItemList', requestStatus: { result: false, code: 602 } },
    ]);

    const summary = await runLayout({ config: toggled, sceneKey: 'only', modifiers: ['Quiet'], connection, connect });
    const toggles = [
      { scene: 'C', source: 'Voice', sceneItemId: 8, visible: false },
      { scene: 'C', source: 'Music', sceneItemId: 16, visible: false },
    ];

    expect(summary.toggles).toEqual(toggles);
    expect(summary.canvases[0]?.toggles).toEqual(toggles);
    expect(summary.requests).toEqual(buildMoveRequests(summary.steps, toggles));
  });

  it("holds every canvas's regions back while any canvas's overlays leave, so they move together", async () => {
    const two: ScenesConfig = {
      canvases: {
        a: {
          container: 'CA',
          participants: { L: { sources: { camera: { source: 'cam' } } } },
          standby: { textScene: 'TA', lineLength: 540 },
        },
        b: {
          container: 'CB',
          participants: { L: { sources: { camera: { source: 'cam (b)' } } } },
          standby: { textScene: 'TB', lineLength: 540 },
        },
      },
      scenes: {
        only: { participants: [{ layout: 'L' }] },
        soon: { standby: { text: 'soon' }, canvases: { b: { standby: { text: 'soon (b)' } } } },
      },
    };
    const items = (sceneItems: unknown[] = []) => ({
      requestType: 'GetSceneItemList',
      requestStatus: ok,
      responseData: { sceneItems },
    });
    const { client, connect } = fakeConnect([]);
    // Canvas a still shows its standby text; canvas b shows nothing
    vi.mocked(client.callBatch)
      .mockResolvedValueOnce([
        items(),
        items([{ sourceName: 'soon', sceneItemId: 1, sceneItemEnabled: true }]),
        items(),
      ])
      .mockResolvedValueOnce([items(), items(), items()]);

    const summary = await runLayout({ config: two, sceneKey: 'only', connection, connect });
    const camOf = (canvas: number) => summary.canvases[canvas].steps.find((step) => step.kind === 'source');

    expect(camOf(0)?.delay).toBe(300);
    expect(camOf(1)?.delay).toBe(300);
    expect(summary.canvases[1].steps).toEqual(
      planLayoutMoves(
        resolveCanvasConfig(two, 'b'),
        'only',
        { sceneItems: { CB: [], TB: [], L: [] }, borderThickness: {}, fontSizes: {} },
        [],
        true,
      ),
    );
  });

  it('rejects an unknown scene key, or one no canvas shows, without connecting', async () => {
    const { connect } = fakeConnect([]);
    const hidden: ScenesConfig = {
      ...config,
      scenes: { ...config.scenes, gone: { participants: [{ layout: 'L' }], canvases: { main: false } } },
    };

    await expect(runLayout({ config, sceneKey: 'nope', connection, connect })).rejects.toThrow(
      'No scene "nope" in the layout config. Known scenes: only',
    );
    await expect(runLayout({ config: hidden, sceneKey: 'gone', connection, connect })).rejects.toThrow(
      'Scene "gone" shows on no canvas (main: the scene leaves it out)',
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('closes the connection even when the batch fails', async () => {
    const { client, connect } = fakeConnect([]);
    vi.mocked(client.callBatch).mockRejectedValueOnce(new Error('gone'));

    await expect(runLayout({ config, sceneKey: 'only', connection, connect })).rejects.toThrow('gone');
    expect(client.close).toHaveBeenCalledOnce();
  });

  describe('with a canvas other than the main one', () => {
    const dual: ScenesConfig = {
      canvases: {
        landscape: { container: 'C', participants: { L: { sources: { camera: { source: 'cam' } } } } },
        portrait: {
          canvas: 'Aitum Vertical',
          container: 'C',
          options: { canvasWidth: 1080, canvasHeight: 1920 },
          participants: { L: { sources: { camera: { source: 'cam (V)' } } } },
        },
      },
      scenes: { only: { participants: [{ layout: 'L' }] } },
    };
    const obsCanvases = [
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
    ];
    const book: ObsAddressBook = {
      canvasUuid: 'vertical-uuid',
      scenes: { C: 'uuid-C', L: 'uuid-L' },
      sources: { L: 'uuid-L', 'cam (V)': 'uuid-cam' },
    };
    const switchVertical = {
      requestType: 'CallVendorRequest',
      requestData: { vendorName: 'aitum-vertical-canvas', requestType: 'switch_scene', requestData: { scene: 'C' } },
    };

    /** A client OBS answers for both canvases: the main program and Aitum's vertical program, by the request. */
    const dualConnect = (verticalProgram: unknown, canvases: unknown = obsCanvases) => {
      const { client, connect } = fakeConnect([]);
      vi.mocked(client.call).mockImplementation((requestType) => {
        if (requestType === 'GetCanvasList') return Promise.resolve({ canvases });
        if (requestType === 'CallVendorRequest') {
          return verticalProgram instanceof Error
            ? Promise.reject(verticalProgram)
            : Promise.resolve({ responseData: { scene: verticalProgram } });
        }
        return Promise.resolve({ currentProgramSceneName: 'C' });
      });
      vi.mocked(client.callBatch).mockImplementation((requests: ObsRequest[]) =>
        Promise.resolve(
          requests[0]?.requestType === 'GetSceneList'
            ? [
                {
                  requestType: 'GetSceneList',
                  requestStatus: ok,
                  responseData: {
                    scenes: [
                      { sceneName: 'C', sceneUuid: 'uuid-C' },
                      { sceneName: 'L', sceneUuid: 'uuid-L' },
                    ],
                  },
                },
                {
                  requestType: 'GetSceneItemList',
                  requestStatus: ok,
                  responseData: { sceneItems: [{ sourceName: 'L', sourceUuid: 'uuid-L' }] },
                },
                {
                  requestType: 'GetSceneItemList',
                  requestStatus: ok,
                  responseData: { sceneItems: [{ sourceName: 'cam (V)', sourceUuid: 'uuid-cam' }] },
                },
              ]
            : [],
        ),
      );
      return { client, connect };
    };

    it("moves both canvases in one batch, the other canvas's requests by UUID, and switches it through Aitum", async () => {
      const { client, connect } = dualConnect('Elsewhere');
      const landscapeSteps = planLayoutMoves(resolveCanvasConfig(dual, 'landscape'), 'only');
      const portraitSteps = planLayoutMoves(resolveCanvasConfig(dual, 'portrait'), 'only');

      const summary = await runLayout({ config: dual, sceneKey: 'only', connection, connect });

      expect(client.callBatch).toHaveBeenCalledWith(
        [
          { requestType: 'GetSceneList', requestData: { canvasUuid: 'vertical-uuid' } },
          { requestType: 'GetSceneItemList', requestData: { sceneName: 'C', canvasUuid: 'vertical-uuid' } },
          { requestType: 'GetSceneItemList', requestData: { sceneName: 'L', canvasUuid: 'vertical-uuid' } },
        ],
        0,
      );
      expect(client.call).toHaveBeenCalledWith('CallVendorRequest', {
        vendorName: 'aitum-vertical-canvas',
        requestType: 'current_scene',
        requestData: { width: 1080, height: 1920 },
      });
      expect(summary.canvases).toEqual([
        { canvas: 'landscape', steps: landscapeSteps, toggles: [] },
        { canvas: 'portrait', steps: portraitSteps, toggles: [], book },
      ]);
      expect(summary.steps).toEqual([...landscapeSteps, ...portraitSteps]);
      expect(summary.requests).toEqual([
        ...joinMovePhases([
          buildMovePhases(landscapeSteps),
          mapMovePhases(buildMovePhases(portraitSteps), (request) => addressRequest(request, book)),
        ]),
        switchVertical,
      ]);
      expect(summary.requests).toContainEqual({
        requestType: 'SetSourceFilterEnabled',
        requestData: { filterName: 'Move: cam (V)', filterEnabled: true, sourceUuid: 'uuid-L' },
      });
    });

    it("leaves the other canvas's program alone when Aitum has the container on it, and switches when it cannot say", async () => {
      const onAir = await runLayout({ config: dual, sceneKey: 'only', connection, connect: dualConnect('C').connect });
      const unknown = await runLayout({
        config: dual,
        sceneKey: 'only',
        connection,
        connect: dualConnect(new Error('no Aitum')).connect,
      });

      expect(onAir.requests).not.toContainEqual(switchVertical);
      expect(unknown.requests.at(-1)).toEqual(switchVertical);
    });

    it('leaves a canvas OBS does not have as it is, and lays out the rest', async () => {
      const missing = await runLayout({
        config: dual,
        sceneKey: 'only',
        connection,
        connect: dualConnect('C', obsCanvases.slice(0, 1)).connect,
      });
      const { client: old, connect: oldConnect } = dualConnect('C');
      vi.mocked(old.call).mockImplementation((requestType) =>
        requestType === 'GetCanvasList'
          ? Promise.reject(new Error('unknown request'))
          : Promise.resolve({ currentProgramSceneName: 'C' }),
      );
      const tooOld = await runLayout({ config: dual, sceneKey: 'only', connection, connect: oldConnect });

      expect(missing.canvases[1]).toEqual({
        canvas: 'portrait',
        steps: [],
        toggles: [],
        skipped: 'OBS has no canvas "Aitum Vertical"; it has "Main"',
      });
      expect(missing.requests).toEqual(buildMoveRequests(missing.canvases[0].steps));
      expect(tooOld.canvases[1].skipped).toBe(
        'OBS cannot list its canvases to find "Aitum Vertical"; that takes OBS 32.1 or later',
      );
    });

    it('sends nothing when every canvas that shows the scene is missing', async () => {
      const verticalOnly: ScenesConfig = {
        ...dual,
        scenes: { only: { participants: [{ layout: 'L' }], canvases: { landscape: false } } },
      };
      const { client, connect } = dualConnect('C', obsCanvases.slice(0, 1));

      const summary = await runLayout({ config: verticalOnly, sceneKey: 'only', connection, connect });

      expect(summary.requests).toEqual([]);
      expect(summary.results).toEqual([]);
      expect(client.callBatch).not.toHaveBeenCalled();
    });
  });
});
