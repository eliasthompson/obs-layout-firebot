import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    clean: true,
    deps: {
      alwaysBundle: ['@eliasthompson/obs-layout-generator'],
    },
    dts: false,
    entry: {
      'obs-layout': 'src/firebot.ts',
    },
    format: 'cjs',
    outExtensions: () => ({ js: '.js' }),
    platform: 'node',
    target: 'node22',
  },
  {
    clean: false,
    dts: true,
    entry: {
      index: 'src/index.ts',
    },
    exports: {
      legacy: true,
    },
    fixedExtension: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  },
  {
    clean: false,
    dts: false,
    entry: {
      cli: 'tools/cli.ts',
    },
    fixedExtension: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  },
]);
