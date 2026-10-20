import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = join(import.meta.dirname, '.');

/** Every `@/` module a source file imports, type-only imports left out since they vanish at build time. */
const runtimeImports = (source: string) =>
  [...source.matchAll(/^(?:export|import)\s+(?!type\b)[^;]*?from\s+'@\/([^']+)'/gm)].map(([, path]) => `${path}.ts`);

/** The module and everything it imports at runtime, as paths under `src/`. */
const importGraph = (entry: string, seen = new Set<string>()) => {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const path of runtimeImports(readFileSync(join(SRC_DIR, entry), 'utf8'))) importGraph(path, seen);
  return seen;
};

describe('settings entry', () => {
  it('reaches no Node built-in, so it runs in a browser', () => {
    const nodeImports = [...importGraph('settings.ts')].filter((path) =>
      /from\s+'node:/.test(readFileSync(join(SRC_DIR, path), 'utf8')),
    );

    expect(nodeImports).toEqual([]);
  });

  it('covers what a program recoloring the borders needs', () => {
    const source = readFileSync(join(SRC_DIR, 'settings.ts'), 'utf8');

    for (const module of [
      'constants/filterNames',
      'constants/moveTransition',
      'lib/filterSettings',
      'lib/resolveBorderColor',
    ]) {
      expect(source).toContain(`'@/${module}'`);
    }
  });
});
