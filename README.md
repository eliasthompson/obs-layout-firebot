# @eliasthompson/obs-layout-firebot

A [Firebot](https://firebot.app) custom script that moves OBS scene items into layouts computed by
[@eliasthompson/obs-layout-generator](https://github.com/eliasthompson/obs-layout-generator), animated by the OBS
[Move Transition](https://obsproject.com/forum/resources/move.913/) plugin, plus the `obs-layout-firebot` CLI that sets
up OBS and keeps Firebot in sync with your config. One preset effect list per composition switches the stream between,
for example, "16:9 content with a camera beside it" and "camera only", with every source sliding, resizing, and fading
into place together.

## Requirements

| Software        | Minimum             | Why                                                                                                                                                             |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBS Studio      | 28.0                | Ships obs-websocket 5 (5.0.1), whose frame-synced request batches with `Sleep` the script relies on.                                                            |
| Move Transition | 2.6.2               | First release for OBS 28. The settings the script writes need 2.5.0; use 3.2 or later on OBS 31.1+.                                                             |
| Firebot         | 5.65.0              | First release on Node 22 (Electron 39), whose global `WebSocket` the script uses to reach OBS. The rest needs 5.54.0, which added the built-in OBS integration. |
| Node.js         | 22.18 (for the CLI) | Built-in TypeScript type stripping, which loads `config/scenes.ts` without a build step.                                                                        |

The tools run on Windows, macOS, and Linux.

## How it works

The script runs inside Firebot. When a preset calls it with a scene key, it:

1. reads the layout config from a Firebot custom variable (`layoutScenes` by default),
2. runs `generateLayout` for the participants that scene shows,
3. opens its own obs-websocket connection, using the credentials from Firebot's OBS integration, and
4. sends one request batch, executed in sync with OBS's video frames, that writes and enables a set of Move
   Transition filters.

The filters do the animating:

- **`Move: <source>`** (Move Source) on the scene that contains an item: position, size through bounds, and
  visibility.
- **`Move: Width`** and **`Move: Height`** (Move Value) on each border color source: its own width and height. The
  borders carry stroke and shadow filters that render at the source's native size, so stretching them would distort
  the frame.
- **`Opacity`** (Color Correction) plus **`Move: Opacity`** (Move Value) on every toggled source: fades. OBS's own
  scene item show/hide Fade brightens toward white on anything with transparency, so it is not used.

Regions a layout does not use fade out while shrinking to a point at the canvas center and are hidden; when a later
layout needs them, they fade in while growing from that point. Participant layouts a scene does not use fade out and
hide in the container scene.

## Getting started

In a folder of your own (an existing project works too):

```sh
npm install --save-dev @eliasthompson/obs-layout-firebot
npx obs-layout-firebot init             # creates config/scenes.ts from the example
# bind your OBS scenes and sources in config/scenes.ts, then:
npx obs-layout-firebot setup            # creates the filters in OBS for every bound item (safe to rerun)
npx obs-layout-firebot install-script   # copies the script into the Firebot profile's scripts folder
npx obs-layout-firebot deploy           # checks the config against OBS, stores it in Firebot, adds the presets
```

`deploy` ends by offering to restart Firebot, which loads the new script and presets. After that, each scene key is a
preset effect list in Firebot that you can run from a command, a Stream Deck button, or anywhere else Firebot runs
effects. `npx obs-layout-firebot apply "<scene key>"` applies one from the terminal and checks the result.

Keep `config/` out of version control if the folder is shared: it holds your scene names, possibly an OBS password,
and the `preset-effect-lists.json` that `deploy` writes.

## OBS setup

- The WebSocket server enabled (Tools, WebSocket Server Settings) and the Move Transition plugin installed.
- A **container** scene (for example `[Scene] Content`) that holds one nested **layout** scene per participant (for
  example `[Layout] Person 1`), each filling the canvas.
- In each layout scene, one item per region: a group or nested scene for the content, one for the camera, and so on.
  Items that a rectangle sizes keep whatever bounds type they have; items with no bounds type get Stretch.
- Optionally one color source per region as its **border**, with the stroke and shadow filters of your choice. The
  color source is sized to the region's border box minus `borderPadding` pixels per side, where `borderPadding` is
  how far those filters extend the source.
- Scene items the script toggles should have **no** show/hide transition. `obs-layout-firebot fades` sets that, in the
  scene collection file, while OBS is closed.

## Firebot setup

- Settings, Integrations, OBS: enter the WebSocket address and password and connect. The script reads these same
  settings from the profile's `integrations.json`, so there is nothing else to configure.
- **Run Custom Scripts** (Settings, Scripts) and **Persist Custom Variables** (Settings, Advanced) must be on;
  `restart-firebot` turns both on for you. Without the second, the config is gone after a restart.
- Preset effect lists: one per scene key, each with a **Change OBS Scene** effect for the container scene and a
  **Run Custom Script** effect running `obs-layout.js` with the `sceneKey` parameter set to the key. `deploy`
  generates them and `restart-firebot` installs them into the profile.

Firebot's HTTP API cannot create preset lists, and Firebot caches a custom script once loaded, so both the presets
and a new build need a Firebot restart to take effect.

## Config

`config/scenes.ts` is the master config. It is a TypeScript module whose default export `satisfies ScenesConfig`, so
your editor completes and checks every field as you type, and you can add comments or compute repetitive parts.
`config/scenes.example.ts` is the full example that `init` copies.

```ts
import type { ScenesConfig } from '@eliasthompson/obs-layout-firebot';

export default {
  container: '[Scene] Content',
  options: { canvasPadding: 15, canvasMarginTop: 105, canvasMarginBottom: 105, regionBorder: 15 },
  borderPadding: 9,
  duration: 300,
  participants: {
    '[Layout] Person 1': {
      sources: {
        contentMain: { source: '[Group] Content 1', border: '[Border] Content 1' },
        camera: { source: '[Group] Camera 1', border: '[Border] Camera 1' },
      },
    },
  },
  scenes: {
    '[Scene] 16:9 1P': { participants: [{ layout: '[Layout] Person 1' }] },
    '[Scene] Camera 1P': {
      participants: [{ layout: '[Layout] Person 1', config: { contentMainAspectRatio: null } }],
    },
  },
} satisfies ScenesConfig;
```

| Field           | Meaning                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `container`     | OBS scene whose items are the participant layout scenes.                                                      |
| `options`       | `LayoutOptions` for the canvas, as in obs-layout-generator.                                                   |
| `borderPadding` | Pixels the border sources' filters add on every side. Default `0`.                                            |
| `duration`      | Move duration in milliseconds. Default `300`.                                                                 |
| `participants`  | Every layout scene the installation knows, keyed by scene name, with the source (and border) for each region. |
| `scenes`        | Compositions by scene key: the participants shown, in layout order, each with an optional `LayoutConfig`.     |
| `obs`           | Optional. `url` and `password` are used over Firebot's OBS integration settings; see [Machine settings].      |
| `firebot`       | Optional. Where the tools find Firebot; see [Machine settings].                                               |

A scene entry may carry its own `options` and `duration`. Region names are those of `LayoutMetric`: `contentMain`,
`camera`, `contentAux`, `info`, `name`. Each bound source takes a `source`, an optional `border`, an optional
`inset` (pixels the source sits inside its region on every side, as padding within the border, for text or widgets
that should not touch the frame; a ratio declared for an inset region holds for the area inside the inset, so a
`250:49` info strip with a 12 px inset shows 366x72 of content inside a 390x96 region), an optional `boundsAlignment`
(where the source sits inside its bounds when it does not fill them, named as in OBS's transform dialog, such as
`top center`), which `setup` applies, and for text sources an optional `fontScale`: the font size as a fraction of the
source's height after the inset, set on every move so the text grows with its region. The font stays at `fontSizeMax`
while the text fits and sizes down to `fontSizeMin` when the region is too short; `0.45` reproduces a 48 px font in a
106 px name strip. When a name binding has `fontSizeMin`, the layout is asked for a name at least
`inset × 2 + fontSizeMin` tall unless the options already set `nameHeightMin`.

The config is stored in a Firebot variable as JSON, so it has to stay plain data: no functions, dates, or class
instances. A `.js` or `.json` file works too; pass it with `--config`.

### Machine settings

Where the tools find Firebot and OBS. Each setting is taken from a command-line option, else an environment variable
(in the shell, or in a `.env` file in the folder you run the tools from; `.env.example` lists them), else the config,
else the default.

| Config                | Environment variable     | Option          | Default                                                  |
| --------------------- | ------------------------ | --------------- | -------------------------------------------------------- |
| `firebot.profile`     | `FIREBOT_PROFILE_DIR`    | `--profile-dir` | `Main`, under Firebot's data folder                      |
| `firebot.apiUrl`      | `FIREBOT_API_URL`        |                 | `http://localhost:7472/api/v1`                           |
| `firebot.variable`    |                          | `--variable`    | `layoutScenes`                                           |
| `firebot.executable`  |                          |                 | The standard install (Windows, macOS); required on Linux |
| `obs.sceneCollection` | `OBS_SCENE_COLLECTION`   | `--collection`  | `Untitled`, under OBS's data folder                      |
| `obs.url`             | `OBS_WEBSOCKET_URL`      |                 | Firebot's OBS integration, else `ws://localhost:4455`    |
| `obs.password`        | `OBS_WEBSOCKET_PASSWORD` |                 | Firebot's OBS integration, else none                     |

The config takes a profile and a scene collection by name; the environment variables and options take the full path
of the profile folder and the collection file. The data folders are `%APPDATA%` on Windows,
`~/Library/Application Support` on macOS, and `~/.config` on Linux (Flatpak OBS keeps its own under
`~/.var/app/com.obsproject.Studio/config`; point `OBS_SCENE_COLLECTION` there).

## Commands

Run as `npx obs-layout-firebot <command>`. Every command that reads the config takes `--config <path>` (default
`config/scenes.ts`).

| Command           | What it does                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `init`            | Creates `config/scenes.ts` from the example. Never overwrites.                                             |
| `setup`           | Creates or updates, disabled, every filter the script drives, and gives region items a bounds type.        |
| `install-script`  | Copies `obs-layout.js` into the profile's `scripts` folder. Restart Firebot afterwards.                    |
| `deploy`          | Checks, stores, and syncs the presets; see below. `--skip-obs`, `--yes`, `--no-restart`, `--presets`.      |
| `restart-firebot` | Stops Firebot, installs the presets, turns on the two settings above, and starts Firebot again.            |
| `apply`           | `apply "<scene key>"`: applies a scene from this machine and compares every item with the plan.            |
| `capture`         | `capture "<scene key>" --save frames/`: screenshots during a transition, or white-pixel counts without it. |
| `fades`           | Sets the toggled scene items' show/hide transitions in the scene collection file. OBS must be closed.      |

`restart-firebot` closes Firebot the way closing its window would and forces it after 60 seconds. While you are live
with chat connected, Firebot asks before closing; answer it, or the close is forced. A forced close skips Firebot's
save of its custom variables, so `deploy` stores the config again once Firebot is back (after a standalone
`restart-firebot`, run `deploy` yourself). It backs up every profile file it replaces next to it, with a timestamp.

### Deploying a config change

`deploy` is the one step for config changes:

1. It reads every bound scene, item, and filter back from OBS and refuses to deploy when something is missing, so a
   typo in a source name is caught before a preset ever fails. Missing filters point at `setup`. Pass `--skip-obs` to
   deploy with OBS closed.
2. It stores the config in the `layoutScenes` variable (or `firebot.variable`). The next preset run uses it; nothing
   needs a restart.
3. It makes `config/preset-effect-lists.json` match the scene keys: a preset is added for every new key and removed
   for every key that is gone, and existing presets keep their ids. When Firebot's loaded presets differ from that
   file, it asks in the terminal whether to restart Firebot now. `--yes` answers for you, `--no-restart` skips the
   question.

Firebot only reads presets at startup, which is why adding or removing scene keys ends in a restart. The presets file
owns the layout presets: the restart replaces the profile's layout presets with it and keeps any other presets you
made in Firebot. Deleting a layout preset in Firebot's UI does not stick; remove its scene key from the config instead.

## Adding compositions

- **Another layout for the same participant**: add a scene key with a different `config`. New regions need a source
  bound in the participant's pool entry; run `setup` once for new sources.
- **Another participant**: build a second layout scene in OBS like the first, add it to `participants`, and list it
  in the scenes that show it. The library splits participants into balanced rows.
- Then `deploy`, which adds the preset for the new key and offers the restart.

## Development

Needs Node 22.18 or later. In this repo, `npm run <command>` runs each CLI command from source (for example
`npm run deploy -- --skip-obs`), and `config/` is git-ignored apart from the example, so your own `config/scenes.ts`
can live here.

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run build
```

See [AGENTS.md](AGENTS.md) for project conventions.

## License

[MIT](LICENSE) © Elias Thompson

[Machine settings]: #machine-settings
