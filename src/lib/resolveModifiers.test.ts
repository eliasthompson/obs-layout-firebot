import { describe, expect, it } from 'vitest';

import { resolveModifiers } from '@/lib/resolveModifiers';

const config = {
  modifiers: { Keyed: { config: {} }, Timer: { config: {} }, Names: { config: {} } },
};

describe('resolveModifiers', () => {
  it('orders the active modifiers as the config does and ignores names it does not define', () => {
    expect(resolveModifiers(config, {}, ['Names', 'Ghost', 'Keyed'])).toEqual(['Keyed', 'Names']);
  });

  it('lets a scene force a modifier on or off, whatever is active', () => {
    expect(resolveModifiers(config, { modifiers: { Keyed: false, Timer: true } }, ['Keyed', 'Names'])).toEqual([
      'Timer',
      'Names',
    ]);
  });

  it('resolves nothing without modifiers in the config', () => {
    expect(resolveModifiers({}, { modifiers: { Keyed: true } }, ['Keyed'])).toEqual([]);
  });
});
