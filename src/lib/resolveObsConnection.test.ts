import { describe, expect, it } from 'vitest';

import { resolveObsConnection } from '@/lib/resolveObsConnection';

const integrations = JSON.stringify({
  OBS: { userSettings: { websocketSettings: { ipAddress: '10.0.0.5', port: 4456, password: 'secret' } } },
});
const defaults = { url: 'ws://localhost:4455', password: '' };

describe('resolveObsConnection', () => {
  it("uses Firebot's OBS integration settings", () => {
    expect(resolveObsConnection({}, integrations)).toEqual({ url: 'ws://10.0.0.5:4456', password: 'secret' });
  });

  it('fills in localhost, the default port, and an empty password for sparse integration settings', () => {
    const sparse = JSON.stringify({ OBS: { userSettings: { websocketSettings: {} } } });

    expect(resolveObsConnection({}, sparse)).toEqual(defaults);
  });

  it('prefers the config over the integration settings, field by field', () => {
    expect(resolveObsConnection({ obs: { url: 'ws://cfg:1' } }, integrations)).toEqual({
      url: 'ws://cfg:1',
      password: 'secret',
    });
    expect(resolveObsConnection({ obs: { password: 'other' } }, integrations)).toEqual({
      url: 'ws://10.0.0.5:4456',
      password: 'other',
    });
  });

  it('works from the config alone', () => {
    expect(resolveObsConnection({ obs: { url: 'ws://cfg:1' } }, undefined)).toEqual({
      url: 'ws://cfg:1',
      password: '',
    });
  });

  it('ignores an unreadable or incomplete integrations file', () => {
    expect(resolveObsConnection({ obs: { url: 'ws://cfg:1', password: 'p' } }, 'not json')).toEqual({
      url: 'ws://cfg:1',
      password: 'p',
    });
    expect(resolveObsConnection({}, '{}')).toEqual(defaults);
    expect(resolveObsConnection({}, '{"OBS":{"userSettings":{}}}')).toEqual(defaults);
  });

  it("falls back to obs-websocket's defaults when nothing is configured", () => {
    expect(resolveObsConnection({}, undefined)).toEqual(defaults);
  });
});
