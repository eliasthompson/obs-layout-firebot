import { describe, expect, it } from 'vitest';

import { containsValues } from '@/lib/containsValues';

describe('containsValues', () => {
  it('matches equal values, and objects that hold every wanted key, nested', () => {
    expect(containsValues(1, 1)).toBe(true);
    expect(containsValues({ a: 1, b: { c: 'x' } }, { a: 1, b: { c: 'x', d: 2 }, e: 3 })).toBe(true);
  });

  it('rejects a different or missing value, and a value where an object is wanted', () => {
    expect(containsValues(1, 2)).toBe(false);
    expect(containsValues({ a: 1 }, { a: 2 })).toBe(false);
    expect(containsValues({ a: 1 }, {})).toBe(false);
    expect(containsValues({ a: 1 }, null)).toBe(false);
    expect(containsValues({ a: 1 }, 'a')).toBe(false);
  });

  it('wants arrays of the same length, item by item', () => {
    expect(containsValues([{ a: 1 }], [{ a: 1, b: 2 }])).toBe(true);
    expect(containsValues([{ a: 1 }], [{ a: 1 }, { a: 2 }])).toBe(false);
    expect(containsValues([1], { 0: 1 })).toBe(false);
  });
});
