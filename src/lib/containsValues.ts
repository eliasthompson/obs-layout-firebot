/**
 * Whether every value in `want` is also in `have`, nested objects and arrays included, so a settings object or stored
 * preset still matches after the program that keeps it adds keys of its own.
 */
export const containsValues = (want: unknown, have: unknown): boolean =>
  typeof want === 'object' && want !== null
    ? typeof have === 'object' &&
      have !== null &&
      Array.isArray(want) === Array.isArray(have) &&
      (!Array.isArray(want) || want.length === (have as unknown[]).length) &&
      Object.entries(want).every(([key, value]) => containsValues(value, (have as Record<string, unknown>)[key]))
    : want === have;
