# AGENTS.md

Firebot custom script, plus the `obs-layout-firebot` CLI to install and operate it, that lays out OBS scene items with
`@eliasthompson/obs-layout-generator` and the OBS Move Transition plugin. Published to npm as
`@eliasthompson/obs-layout-firebot`; the script file is copied into a Firebot profile by the CLI.

## Commands

- `npm run typecheck`: `tsc --noEmit`
- `npm run lint` / `npm run lint:fix`: ESLint with type-aware rules
- `npm run format` / `npm run format:check`: Prettier
- `npm run test` / `npm run test:coverage` / `npm run test:watch`: Vitest
- `npm run build`: tsdown, emits `dist/obs-layout.js` (the Firebot script, one CommonJS file with the library bundled
  in), `dist/index.js` and `dist/index.d.ts` (the library and config types), and `dist/cli.js` (the CLI)
- `npm run init`, `setup`, `install-script`, `deploy`, `restart-firebot`, `apply`, `capture`, `fades`: the CLI's
  commands run from source with `tsx` (`tsx tools/cli.ts <command>`). See README.md

Before finishing a change, run typecheck, lint, format check, test coverage, and build. All five must pass.

## Layout

- `src/constants/`, `src/lib/`, `src/types/`: source, one export group per file.
- `src/index.ts`: the only index file and the library entry; `export *` for every file (`export type *` for type-only
  files). Do not add per-directory index files.
- `src/firebot.ts`: the bundle entry Firebot loads. It only wires `src/lib` to the real file system and OBS, so it
  carries no logic of its own and is outside the coverage set.
- `src/lib/*.test.ts`: one test file beside each lib file. Coverage of `src/lib` is held at 100% for statements,
  branches, functions, and lines; code that tests cannot reach should be restructured (inject the socket, the file
  reader, the clock) rather than excluded.
- `tools/cli.ts`: the CLI entry, dispatching to `tools/commands/<command>.ts`, each exporting a function that takes
  the arguments after the command name. `tools/lib/` holds what the commands share: paths and settings
  (`environment.ts`) and process control (`processes.ts`). Tools import from `@/` like the source and are typechecked
  and linted, but have no tests, so logic worth testing (preset syncing, settings merging) belongs in `src/lib`.
- `config/scenes.example.ts`: the example config, shipped in the package and copied by `obs-layout-firebot init`.
  Everything else in `config/` is per-user and git-ignored: `scenes.ts` (the live config) and
  `preset-effect-lists.json` (written by `deploy`).
- `dist/`: build output, git-ignored. Never edit it.

## Conventions

- Object keys and interface/type members are deliberately not sorted. Keep semantic orders like `x, y, width, height`,
  and list an object's keys in the same order as its type.
- In config files (tsconfig, tsdown, ESLint, Prettier, package.json `scripts`), keep keys alphabetical and do not add
  comments.
- Configs are TypeScript modules whose default export `satisfies ScenesConfig`, with a type-only import so they need
  nothing from the package at runtime. The CLI loads them with jiti, not Node's type stripping, which reads `.ts` in a
  CommonJS package as CommonJS and fails on `export default`. `.js` and `.json` configs load too. A config is stored
  in a Firebot variable, so it must stay plain JSON data.
- Tool settings resolve as command-line option, then environment variable, then the config's `firebot` / `obs`
  entries, then the platform default. Add new ones to `tools/lib/environment.ts`, `.env.example`, and the README.
- The tools run on Windows, macOS, and Linux. Anything platform-specific goes through `process.platform` with a case
  per platform, not a separate script per OS.
- obs-move-transition setting values live in `src/constants/moveTransition.ts` with the header they come from. Do not
  use a Move Value filter in its "settings" mode on a color source: it rewrites the color.
- Changes to the request batch order (disable, write, sleep, enable) need a reason in a comment; the order works
  around OBS deferring filter updates to the next video tick.
- Firebot caches a custom script once loaded. After installing a new build, restart Firebot.
- The minimum OBS, obs-websocket, Move Transition, and Firebot versions are listed in README.md. Using a request,
  filter setting, or Firebot API that raises one of them means updating that list.

## Toolchain constraints

- TypeScript is pinned to 6.x because typescript-eslint does not support 7.x yet. Do not upgrade it until it does.
- Do not use `baseUrl` in tsconfig; `paths` resolves relative to the tsconfig file. `paths` also maps the package's
  own name to `src/index.ts`, so configs in `config/` import it the way a user's config would.
- `src/` runs inside Firebot's Electron main process and uses Node built-ins and the global `WebSocket`; it is not
  platform-neutral and does not need to be. The CLI needs Node 22.4 or later for the global `WebSocket`.
- To work against an unreleased `@eliasthompson/obs-layout-generator`, link the sibling repo with
  `npx link ../obs-layout-generator` instead of changing the dependency in package.json.
