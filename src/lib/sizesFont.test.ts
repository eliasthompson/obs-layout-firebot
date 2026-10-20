import { describe, expect, it } from 'vitest';

import { sizesFont } from '@/lib/sizesFont';

describe('sizesFont', () => {
  it('is true for a binding with a largest or a smallest font size', () => {
    expect(sizesFont({ fontSizeMax: 48 })).toBe(true);
    expect(sizesFont({ fontSizeMin: 24 })).toBe(true);
  });

  it('is false for a binding without font sizes', () => {
    expect(sizesFont({ inset: 12 })).toBe(false);
  });
});
