import { describe, expect, it, vi } from 'vitest';

import type { ObsClient } from '@/lib/connectObs';

import { readAitumProgramScene, switchAitumProgramScene } from '@/lib/aitumProgram';

const vertical = { name: 'Aitum Vertical', uuid: 'vertical-uuid', isMain: false, width: 1080, height: 1920 };

const clientAnswering = (answer: Promise<Record<string, unknown>>): ObsClient => ({
  call: vi.fn(() => answer),
  callBatch: vi.fn(),
  close: vi.fn(),
});

describe('readAitumProgramScene', () => {
  it("asks Aitum Vertical for the scene on program on the canvas of the canvas's size", async () => {
    const client = clientAnswering(
      Promise.resolve({
        vendorName: 'aitum-vertical-canvas',
        requestType: 'current_scene',
        responseData: { scene: 'Canvas', success: true },
      }),
    );

    await expect(readAitumProgramScene(client, vertical)).resolves.toBe('Canvas');
    expect(client.call).toHaveBeenCalledWith('CallVendorRequest', {
      vendorName: 'aitum-vertical-canvas',
      requestType: 'current_scene',
      requestData: { width: 1080, height: 1920 },
    });
  });

  it('cannot say when Aitum Vertical answers without a scene, or is not there', async () => {
    await expect(
      readAitumProgramScene(clientAnswering(Promise.resolve({ responseData: { success: false } })), vertical),
    ).resolves.toBeUndefined();
    await expect(readAitumProgramScene(clientAnswering(Promise.resolve({})), vertical)).resolves.toBeUndefined();
    await expect(
      readAitumProgramScene(clientAnswering(Promise.reject(new Error('no vendor'))), vertical),
    ).resolves.toBeUndefined();
  });
});

describe('switchAitumProgramScene', () => {
  it('asks Aitum Vertical to switch to a scene by name', () => {
    expect(switchAitumProgramScene('Canvas')).toEqual({
      requestType: 'CallVendorRequest',
      requestData: {
        vendorName: 'aitum-vertical-canvas',
        requestType: 'switch_scene',
        requestData: { scene: 'Canvas' },
      },
    });
  });
});
