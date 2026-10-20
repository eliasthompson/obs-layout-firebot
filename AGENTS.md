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
- `npm run dev`: tsdown in watch mode, so a project that links this checkout runs the current source. The CLI's
  commands (`obs:deploy`, `obs:restart`, `obs:verify`, `obs:capture`, `firebot:deploy`, `firebot:restart`) run there,
  against that project's config. Commands are grouped by the program they act on, and each deploy is the one command
  for its side; the steps it is made of live in `tools/lib`. See README.md

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
- `tools/cli.ts`: the CLI entry, dispatching to `tools/commands/<group><Command>.ts` (`obsDeploy.ts` for
  `obs:deploy`), each exporting a function that takes the arguments after the command name. `tools/lib/` holds the
  steps and what the commands share: the OBS setup (`setup.ts`), the item transitions in the collection file
  (`fades.ts`), the script install (`installScript.ts`), paths, settings, and prompts (`environment.ts`), process
  control (`processes.ts`), the two apps' process names and launchers (`apps.ts`), and OBS-side questions such as
  whether it is live (`obs.ts`). Tools import from `@/` like the source and are typechecked and linted, but have no
  tests, so logic worth testing (preset syncing, settings merging) belongs in `src/lib`.
- There is no config in this repo: the example lives in README.md, and a user's config lives in their own project,
  where `firebot:deploy` also writes `preset-effect-lists.json`. To try a change against a real installation, link
  this checkout into that project with `npx link`, keep `npm run dev` rebuilding `dist/`, and run the commands there.
- `dist/`: build output, git-ignored. Never edit it.

## Conventions

- Object keys and interface/type members are deliberately not sorted. Keep semantic orders like `x, y, width, height`,
  and list an object's keys in the same order as its type.
- In config files (tsconfig, tsdown, ESLint, Prettier, package.json `scripts`), keep keys alphabetical and do not add
  comments.
- Configs are TypeScript modules whose default export `satisfies ScenesConfig`, with a type-only import so they need
  nothing from the package at runtime. Keep the README example complete and in step with `ScenesConfig`; it is the
  only example. The CLI loads them with jiti, not Node's type stripping, which reads `.ts` in a
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
- The tools never force a process to exit. OBS and Firebot write their files on the way out, and both may be running
  as administrator, which this tool cannot close. `restartApp` in `processes.ts` asks the user to close such an app
  and waits, then leaves starting it to the user too, so the app keeps the rights it had. Route every restart through
  it, and never close OBS while it reports streaming or recording.
- A command that writes to OBS, a file, or Firebot takes `--dry-run` and reports what it would do instead.
- Firebot caches a custom script once loaded. After installing a new build, restart Firebot.
- The minimum OBS, obs-websocket, Move Transition, and Firebot versions are listed in README.md. Using a request,
  filter setting, or Firebot API that raises one of them means updating that list.

## Toolchain constraints

- TypeScript is pinned to 6.x because typescript-eslint does not support 7.x yet. Do not upgrade it until it does.
- Do not use `baseUrl` in tsconfig; `paths` resolves relative to the tsconfig file.
- `src/` runs inside Firebot's Electron main process and uses Node built-ins and the global `WebSocket`; it is not
  platform-neutral and does not need to be. The CLI needs Node 22.4 or later for the global `WebSocket`.
- To work against an unreleased `@eliasthompson/obs-layout-generator`, link the sibling repo with
  `npx link ../obs-layout-generator` instead of changing the dependency in package.json.
