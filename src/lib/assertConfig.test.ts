import { describe, expect, it } from 'vitest';

import { assertConfig } from '@/lib/assertConfig';

const valid = { container: '[Scene] Content', participants: {}, scenes: {} };

describe('assertConfig', () => {
  it('accepts a config with a container, participants, and scenes', () => {
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

  it('rejects a missing or empty container', () => {
    expect(() => {
      assertConfig({ ...valid, container: '' });
    }).toThrow('config.container');
    expect(() => {
      assertConfig({ ...valid, container: undefined });
    }).toThrow('config.container');
  });

  it('rejects participants and scenes that are not objects', () => {
    expect(() => {
      assertConfig({ ...valid, participants: null });
    }).toThrow('config.participants');
    expect(() => {
      assertConfig({ ...valid, scenes: 'nope' });
    }).toThrow('config.scenes');
  });
});
