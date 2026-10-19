import { describe, expect, it } from 'vitest';

import { moveFilterName } from '@/lib/moveFilterName';

describe('moveFilterName', () => {
  it('prefixes the source name', () => {
    expect(moveFilterName('[Group] Camera 1')).toBe('Move: [Group] Camera 1');
  });
});
