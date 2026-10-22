import { describe, expect, it } from 'vitest';

import { assertConfig } from '@/lib/assertConfig';

const canvas = { container: '[Scene] Content', participants: {} };
const valid = { canvases: { landscape: canvas, portrait: { ...canvas, canvas: 'Aitum Vertical' } }, scenes: {} };

describe('assertConfig', () => {
  it('accepts a config with canvases, each with a container and participants, and scenes', () => {
    expect(() => {
      assertConfig(valid);
    }).not.toThrow();
  });

  it('rejects anything that is not an object', () => {
    for (const value of [undefined, null, 'text', 3]) {
      expect(() => {
        assertConfig(value);
      }).toThrow('layout config must be an object');
    }
  });

  it('rejects missing or empty canvases, and points a version 3 config at them', () => {
    expect(() => {
      assertConfig({ scenes: {} });
    }).toThrow('config.canvases must be an object of canvases');
    expect(() => {
      assertConfig({ ...canvas, scenes: {} });
    }).toThrow('config.canvases is missing: this is a version 3 config');
    expect(() => {
      assertConfig({ canvases: {}, scenes: {} });
    }).toThrow('config.canvases must have at least one canvas');
  });

  it('rejects a canvas that is not an object, or names no OBS canvas, container, or participants', () => {
    for (const [landscape, message] of [
      [null, 'config.canvases.landscape must be an object'],
      [{ ...canvas, canvas: '' }, 'config.canvases.landscape.canvas must name an OBS canvas'],
      [{ ...canvas, container: '' }, 'config.canvases.landscape.container'],
      [{ ...canvas, container: undefined }, 'config.canvases.landscape.container'],
      [{ ...canvas, participants: null }, 'config.canvases.landscape.participants'],
    ] as const) {
      expect(() => {
        assertConfig({ ...valid, canvases: { landscape } });
      }).toThrow(message);
    }
  });

  it('rejects scenes that are not an object', () => {
    expect(() => {
      assertConfig({ ...valid, scenes: 'nope' });
    }).toThrow('config.scenes');
  });
});
