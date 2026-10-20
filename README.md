# @eliasthompson/obs-layout-firebot

A [Firebot](https://firebot.app) custom script that moves OBS scene items into layouts computed by
[@eliasthompson/obs-layout-generator](https://github.com/eliasthompson/obs-layout-generator), animated by the OBS
[Move Transition](https://obsproject.com/forum/resources/move.913/) plugin, plus the `obs-layout-firebot` CLI that sets
up OBS and keeps Firebot in sync with your config. One preset effect list per composition switches the stream between,
for example, "16:9 content with a camera beside it" and "camera only", with every source sliding, resizing, and fading
into place together.

## Requirements

| Software        | Minimum            | Why                                                                                                                                                             |
| --------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBS Studio      | 28.0               | Ships obs-websocket 5 (5.0.1), whose frame-synced request batches with `Sleep` the script relies on.                                                            |
| Move Transition | 2.6.2              | First release for OBS 28. The settings the script writes need 2.5.0; use 3.2 or later on OBS 31.1+.                                                             |
| Firebot         | 5.65.0             | First release on Node 22 (Electron 39), whose global `WebSocket` the script uses to reach OBS. The rest needs 5.54.0, which added the built-in OBS integration. |
| Node.js         | 22.4 (for the CLI) | The global `WebSocket` became stable in 22.4; the tools use it to reach OBS.                                                                                    |

The tools run on Windows, macOS, and Linux.

## How it works

The script runs inside Firebot. When a preset calls it with a scene key, it:

1. reads the layout config from a Firebot custom variable (`layoutScenes` by default),
2. runs `generateLayout` for the participants that scene shows,
3. opens its own obs-websocket connection, using the credentials from Firebot's OBS integration,
4. with [standby screens](#standby-screens) configured, reads what OBS shows now, so it knows whether the transition
   starts from standby, and
5. sends one request batch, executed in sync with OBS's video frames, that writes and enables a set of Move
   Transition filters. Moves that belong after others wait through the filters' own start delay, so the whole
   transition is still one batch, and the next preset cuts it short at any point. When program shows another scene,
   the batch ends by switching program to the container, so its scene transition starts with the moves. When the
   container is already on program, no scene transition runs, and preview stays yours for other work.

The filters do the animating:

- **`Move: <source>`** (Move Source) on the scene that contains an item: position, size through bounds, and
  visibility.
- **`Move: Width`** and **`Move: Height`** (Move Value) on each border color source: its own width and height. The
  borders carry stroke and shadow filters that render at the source's native size, so stretching them would distort
  the frame.
- **`Opacity`** (Color Correction) plus **`Move: Opacity`** (Move Value) on every toggled source but standby text:
  fades. OBS's own scene item show/hide Fade brightens toward white on anything with transparency, so it is not used.

Regions a layout does not use fade out while shrinking to a point at the canvas center and are hidden; when a later
layout needs them, they fade in while growing from that point. Participant layouts a scene does not use fade out and
hide in the container scene.

## Getting started

In a folder of your own (an existing project works too):

```sh
npm install --save-dev @eliasthompson/obs-layout-firebot
# describe your OBS scenes and sources in config/scenes.ts (see Config below), then:
npx obs-layout-firebot obs:deploy       # creates the filters in OBS, then restarts OBS if the item transitions need setting
npx obs-layout-firebot firebot:deploy   # checks the config against OBS, stores it in Firebot, installs the script and presets
```

Both deploys ask before restarting their program, and each is the one command to rerun after a change on its side.
After that, each scene key is a preset effect list in Firebot that you can run from a command, a Stream Deck button,
or anywhere else Firebot runs effects. `npx obs-layout-firebot obs:verify "<scene key>"` applies one from the terminal
and checks the result.

`config/` is yours to version; the config holds scene and source names. The presets derive from it, ids included, so
every machine makes the same presets and there is nothing else to keep. Keep the OBS password out of the config (see
[Machine settings](#machine-settings)) if the repository is shared.

## OBS setup

- The WebSocket server enabled (Tools, WebSocket Server Settings) and the Move Transition plugin installed.
- A **container** scene (for example `[Scene] Content`) that holds one nested **layout** scene per participant (for
  example `[Layout] Person 1`), each filling the canvas.
- In each layout scene, one item per region: a group or nested scene for the content, one for the camera, and so on.
  Items that a rectangle sizes keep whatever bounds type they have; items with no bounds type get Stretch.
- Optionally one color source per region as its **border**, with the stroke and shadow filters of your choice. The
  color source is sized to the region's border box, the region grown by `regionBorder`, so `regionBorder` is the
  visible border. `borderPadding` is how far those filters extend the source past it, such as a shadow's size: the
  item sits that much further out, and the padding never pushes regions apart.
- Scene items the script toggles should have **no** show/hide transition. `obs:deploy` sets that in the scene
  collection file, around a restart of OBS.
- For standby screens, a **standby text** scene in the container, below the participant layouts, holding one text
  source per screen, and any standby widgets as items of the container. `obs:deploy` crops the text scene at the canvas
  center.

## Firebot setup

- Settings, Integrations, OBS: enter the WebSocket address and password and connect. The script reads these same
  settings from the profile's `integrations.json`, so there is nothing else to configure.
- **Run Custom Scripts** (Settings, Scripts) and **Persist Custom Variables** (Settings, Advanced) must be on;
  `firebot:restart` turns both on for you. Without the second, the config is gone after a restart.
- Preset effect lists: one per scene key, each a **Run Custom Script** effect running `obs-layout.js` with the
  `sceneKey` parameter set to the key. Their ids derive from the config variable and the scene key, so a Stream Deck
  button or command that runs one keeps working across deploys and machines. `firebot:restart` installs them into the
  profile, and `firebot:deploy` runs it when they are missing or out of date.

Firebot's HTTP API cannot create preset lists, and Firebot caches a custom script once loaded, so both the presets
and a new build need a Firebot restart to take effect.

## Config

`config/scenes.ts` is the master config. It is a TypeScript module whose default export `satisfies ScenesConfig`, so
your editor completes and checks every field as you type, and you can add comments or compute repetitive parts. This
is the complete example; copy it and bind your own scene and source names:

```ts
import type { ScenesConfig } from '@eliasthompson/obs-layout-firebot';

export default {
  // OBS scene that holds one nested layout scene per participant
  container: '[Scene] Content',
  // Canvas options of obs-layout-generator, for every scene
  options: { canvasPadding: 24, canvasMarginTop: 105, canvasMarginBottom: 105, layoutGap: 18, regionBorder: 6 },
  // Pixels the border sources' shadow filters add outside the border on every side
  borderPadding: 9,
  // Optional: the filter on each border that carries its color, so another program can recolor the borders through
  // the "Move: Color" filter obs:deploy adds for it; see Border colors
  // borderColor: { filter: 'Stroke', duration: 500 },
  // Move duration in milliseconds
  duration: 300,
  // Every layout scene, with the OBS item (and border) that fills each region
  participants: {
    '[Layout] Person 1': {
      sources: {
        contentMain: { source: '[Group] Content 1', border: '[Border] Content 1' },
        camera: { source: '[Group] Camera 1', border: '[Border] Camera 1' },
        name: { source: '[Text] Name 1', inset: 12, fontScale: 0.45, fontSizeMin: 24, fontSizeMax: 48 },
      },
    },
    '[Layout] Person 2': {
      sources: {
        contentMain: { source: '[Group] Content 2', border: '[Border] Content 2' },
        camera: { source: '[Group] Camera 2', border: '[Border] Camera 2' },
      },
    },
  },
  // One preset per scene key: the participants it shows, in layout order, each with an optional layout config
  scenes: {
    '[Scene] 16:9 1P': { participants: [{ layout: '[Layout] Person 1' }] },
    '[Scene] Camera 1P': {
      participants: [{ layout: '[Layout] Person 1', config: { contentMain: null } }],
    },
    '[Scene] 4:3 2P': {
      participants: [
        { layout: '[Layout] Person 1', config: { contentMain: { aspectRatio: '4:3' } } },
        { layout: '[Layout] Person 2', config: { contentMain: { aspectRatio: '4:3' } } },
      ],
      duration: 500,
    },
    // A green screen camera: no border, spreading over the gaps around it; its border source fades out
    '[Scene] Green Screen 1P': {
      participants: [{ layout: '[Layout] Person 1', config: { camera: { isGreenScreen: true } } }],
    },
    // A standby screen: the regions collapse into a line at the canvas center and the text slides out from behind it
    '[Standby] Starting Soon': {
      participants: [{ layout: '[Layout] Person 1' }],
      standby: { text: { source: '[Text] Starting Soon', region: { x: 1000, y: 480, width: 700, height: 120 } } },
    },
  },
  // The scene in the container that holds the standby texts, and the height of the standby line
  standby: { textScene: '[Widget] Standby Text', lineHeight: 540 },
  // Optional: where the tools find OBS and Firebot when the defaults do not fit this machine; see Machine settings
  // obs: { sceneCollection: 'Untitled', executable: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
  // firebot: { profile: 'Main', apiUrl: 'http://localhost:7472/api/v1', variable: 'layoutScenes' },
} satisfies ScenesConfig;
```

| Field           | Meaning                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `container`     | OBS scene whose items are the participant layout scenes.                                                      |
| `options`       | `LayoutOptions` for the canvas, as in obs-layout-generator.                                                   |
| `borderPadding` | Pixels the border sources' filters add outside the border on every side. Default `0`.                         |
| `borderColor`   | The filter on each border that carries its color, for recoloring; see [Border colors](#border-colors).        |
| `duration`      | Move duration in milliseconds. Default `300`.                                                                 |
| `participants`  | Every layout scene the installation knows, keyed by scene name, with the source (and border) for each region. |
| `scenes`        | Compositions by scene key: the participants shown, in layout order, each with an optional `LayoutConfig`.     |
| `standby`       | Needed by standby scenes: `textScene` and `lineHeight`; see [Standby screens](#standby-screens).              |
| `obs`           | Optional. `url` and `password` are used over Firebot's OBS integration settings; see [Machine settings].      |
| `firebot`       | Optional. Where the tools find Firebot; see [Machine settings].                                               |

A scene entry may carry its own `options` and `duration`, and a `standby` entry that makes it a standby screen.
Region names are those of `LayoutMetric`: `contentMain`,
`camera`, `contentAux`, `info`, `name`. Each bound source takes a `source`, an optional `border`, an optional
`inset` (pixels the source sits inside its region on every side, as padding within the border, for text or widgets
that should not touch the frame; a ratio declared for an inset region holds for the area inside the inset, so a
`250:49` info strip with a 12 px inset shows 366x72 of content inside a 390x96 region), an optional `boundsAlignment`
(where the source sits inside its bounds when it does not fill them, named as in OBS's transform dialog, such as
`top center`), which `obs:deploy` applies, and for text sources an optional `fontScale`: the font size as a fraction of the
source's height after the inset, set on every move so the text grows with its region. The font stays at `fontSizeMax`
while the text fits and sizes down to `fontSizeMin` when the region is too short; `0.45` reproduces a 48 px font in a
106 px name strip. When a name binding has `fontSizeMin`, the layout is asked for a name at least
`inset × 2 + fontSizeMin` tall unless the options already set `nameHeightMin`.

A participant's `config` is a `LayoutConfig` as obs-layout-generator 2 takes it: `contentMain`, `camera`, `contentAux`,
and `info` each take a region config such as `{ aspectRatio: '4:3' }` or `null` to turn the region off, and `hasName`
adds the name tag. A side region attached to the main region (`isMainAttached`) or to the region above it
(`isAboveAttached`) shares that neighbor's border, so the two border sources overlap on the same pixels there. A green
screen camera (`camera: { isGreenScreen: true }`) has no border and spreads over the gaps around it; its border source
still moves and sizes as if it framed the camera, so the two stay in step, but fades out, and fades back in with the
next layout that frames the camera.

The config is stored in a Firebot variable as JSON, so it has to stay plain data: no functions, dates, or class
instances. A `.js` or `.json` file works too; pass it with `--config`.

### Border colors

The script never colors a border; that is the border source's own filters, such as the Stroke filter of
[obs-stroke-glow-shadow](https://github.com/FiniteSingularity/obs-stroke-glow-shadow). With a `borderColor` entry,
another program can recolor the borders, for example to match each participant's chat color:

```ts
borderColor: { filter: 'Stroke', setting: 'stroke_fill_color', duration: 500 },
```

`filter` is the filter's name on every border, `setting` its color setting (default `stroke_fill_color`, the Stroke
filter's), and `duration` how long a color change fades, in milliseconds (default `500`). `obs:deploy` then adds a
`Move: Color` Move Value filter to every border that has the color filter, pointed at that setting, and
`firebot:deploy` reports borders without the color filter, which it cannot add for you. To recolor a border, write
the new color into the `Move: Color` filter's `setting_color` and enable the filter, and it fades there; a program
that finds no `Move: Color` filter can write the color filter's setting directly instead, which snaps. OBS colors are
integers in alpha, blue, green, red byte order, so `#rrggbb` becomes `0xffbbggrr`. The stroke has to be in color fill
mode for its color to show. The transitions never touch this filter, so a recolor and a layout change can overlap.

The filter names, the Move Transition values, and the settings builders are published for such a program on the
`settings` subpath, which has no Node dependencies and runs in a browser:

```ts
import {
  COLOR_MOVE_FILTER_NAME,
  colorMoveFilterSettings,
  resolveBorderColor,
} from '@eliasthompson/obs-layout-firebot/settings';
```

`colorMoveFilterSettings(resolveBorderColor(config), color)` is exactly what `obs:deploy` wrote into the filter, with
the new target color, so a recolor written with it stays in step with this package.

### Standby screens

A scene entry with `standby` does not lay its participants out. Instead, every region collapses into one vertical line
at the canvas center, and a text slides out from behind it:

```ts
export default {
  // ...
  standby: { textScene: '[Widget] Standby Text', lineHeight: 540 },
  scenes: {
    // ...
    '[Standby] Starting Soon': {
      participants: [{ layout: '[Layout] Person 1' }],
      standby: {
        text: { source: '[Text] Starting Soon', region: { x: 1000, y: 480, width: 700, height: 120 } },
        widgets: [{ source: '[Widget] Standby Clips', region: { x: 120, y: 300, width: 640, height: 480 } }],
      },
    },
  },
} satisfies ScenesConfig;
```

The transition runs in stages, each one `duration` long:

| From → to         | First                                    | Then                               |
| ----------------- | ---------------------------------------- | ---------------------------------- |
| Layout → standby  | Regions collapse into the line           | Text slides out, widgets fade in   |
| Standby → standby | The old text slides back behind the line | The new text slides out            |
| Standby → layout  | Text slides back, widgets fade out       | Regions grow out to the new layout |

- **The line.** Content collapses to no width at the canvas center, which leaves each border's color source two
  borders wide (`regionBorder` per side), `lineHeight` tall. With an inner stroke at least a border wide, the line is
  solid stroke. All borders collapse onto it, but only the first participant's main border stays
  shown (the region obs-layout-generator puts in the main column: main content, else camera, else aux content, else
  info), so their shadows do not stack. Leaving standby for a layout whose main region is another one, that border
  takes over the line in a single frame before the regions grow out.
- **The text** is an item of `textScene`, which `obs:deploy` crops at the canvas center, so text slides out from behind the
  line without fading. Its region is the bounding box: `obs:deploy` makes every standby text cover it (Scale to outer
  bounds), aligned center left, so text relatively wider than the box runs past its right edge. Hidden text waits at
  its region's height just left of the cut, by its rendered width, overflow included. Put `textScene` below the
  participant layouts in the container, so the line covers the cut. Each screen has its own text source; a scene that
  replaces another's text slides the old one back first.
- **Widgets** are items of the container that fade in and out at their region, for example browser sources that rotate
  their own content.
- **What it starts from** is read from OBS on every run: which standby items show, and whether the borders were last
  sized to the line. A transition interrupted part way plans from wherever OBS is.

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
| `obs.sceneCollection` | `OBS_SCENE_COLLECTION`   | `--collection`  | The collection OBS reports as active, else `Untitled`    |
| `obs.executable`      |                          |                 | The standard install (Windows, macOS, Linux package)     |
| `obs.url`             | `OBS_WEBSOCKET_URL`      |                 | Firebot's OBS integration, else `ws://localhost:4455`    |
| `obs.password`        | `OBS_WEBSOCKET_PASSWORD` |                 | Firebot's OBS integration, else none                     |

The config takes a profile and a scene collection by name; the environment variables and options take the full path
of the profile folder and the collection file. The data folders are `%APPDATA%` on Windows,
`~/Library/Application Support` on macOS, and `~/.config` on Linux (Flatpak OBS keeps its own under
`~/.var/app/com.obsproject.Studio/config`; point `OBS_SCENE_COLLECTION` there).

## Commands

Run as `npx obs-layout-firebot <command>`. Commands are grouped by the program they act on. Every command that reads
the config takes `--config <path>` (default `config/scenes.ts`); every command that changes something takes
`--dry-run` to report what it would do instead, and `--yes` to skip its questions.

| Command           | What it does                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `obs:deploy`      | Sets OBS up for the config, then asks to restart OBS when the item transitions need setting; see below. `--no-restart`.     |
| `obs:restart`     | Restarts OBS, never forcibly, after checking that it is not streaming or recording.                                         |
| `obs:verify`      | `obs:verify "<scene key>"`: applies a scene from this machine and compares every item with the plan; exits 1 on a mismatch. |
| `obs:capture`     | `obs:capture "<scene key>" --save frames/`: screenshots during a transition, or white-pixel counts without it.              |
| `firebot:deploy`  | Checks, stores, installs the script, and asks to restart for new presets or a new script; see below. `--skip-obs`.          |
| `firebot:restart` | Restarts Firebot, never forcibly, around installing the presets and turning on the two settings above.                      |

Version 2 renamed and regrouped the commands; see [Upgrading from 1.x](#upgrading-from-1x).

### Restarts

Neither program is ever closed forcibly: OBS and Firebot write their files on the way out, and a forced stop loses
them. A restart asks first, then closes the program the way its window would be closed and waits for it to exit,
up to a minute, because both ask before closing while live: Firebot with chat connected, OBS while streaming or
recording. OBS is never closed while it reports either; `obs:deploy` and `obs:restart` check over the websocket.

When the program cannot be closed from here, most often because it runs as administrator and the terminal does not,
or when it has not closed in time, the tool asks you to close it and waits until it is gone. It then does its file
work and leaves starting the program to you as well, since a program started from a plain terminal would come back
without the rights it had. A program that was not running is started afterwards. Every profile or collection file
that is replaced is backed up next to it, with a timestamp.

### Deploying a change in OBS

`obs:deploy` is the one step for changes on the OBS side, such as new sources, renamed items, or a new participant:

1. It runs the setup over the websocket: filters created or updated, bounds types set, stale Move Source filters
   removed, the standby text scene cropped. This part is idempotent and is all that runs without the restart.
2. It asks which scene collection OBS has loaded, and whether OBS is streaming or recording.
3. It sets every toggled item's show and hide transition in the collection file, which only that file holds and OBS
   only reads at startup, so it asks to restart OBS around writing it. OBS saves the collection on exit, so the
   setup's filters are in the file before it is edited. When every item already has its transition, and the saved
   file holds every bound item, there is nothing to write and OBS is not restarted. `--transition none|fade` and
   `--duration` set what the items get (default `none`, `300`). `--no-restart`, or declining, leaves the restart for a
   later `obs:deploy`.

### Deploying a config change

`firebot:deploy` is the one step for config changes:

1. It reads every bound scene, item, and filter back from OBS and refuses to deploy when something is missing, so a
   typo in a source name is caught before a preset ever fails. Missing filters point at `obs:deploy`. It waits for OBS
   to be started when it is not running; pass `--skip-obs` to deploy without it.
2. It stores the config in the `layoutScenes` variable (or `firebot.variable`). The next preset run uses it; nothing
   needs a restart.
3. It installs the built script into the profile when it differs from the installed one.
4. It derives one preset per scene key from the config and compares them with the profile's presets and the ones
   Firebot has loaded.
5. When a preset is missing, out of date, or left over from a removed key, or the script changed, it asks whether to
   restart Firebot now (`--no-restart` declines), installs the presets and settings into the profile while Firebot is
   closed, and waits for Firebot to come back with the right presets.

Firebot only reads presets and scripts at startup, which is why adding or removing scene keys, or a new build, ends
in a restart. The config owns the layout presets: the restart replaces the profile's layout presets with the config's
and keeps any other presets you made in Firebot. Deleting or editing a layout preset in Firebot's UI does not stick;
change the config instead.

## Adding compositions

- **Another layout for the same participant**: add a scene key with a different `config`. New regions need a source
  bound in the participant's pool entry; run `obs:deploy` once for new sources.
- **Another participant**: build a second layout scene in OBS like the first, add it to `participants`, and list it
  in the scenes that show it. The library splits participants into balanced rows.
- Then `firebot:deploy`, which adds the preset for the new key and offers the restart.

## Upgrading from 1.x

- **Layout configs** take obs-layout-generator 2's nested shape: `contentMainAspectRatio: '4:3'` becomes
  `contentMain: { aspectRatio: '4:3' }`, `null` still turns a region off, and `hasCamera: false` becomes
  `camera: null`. See that package's migration table.
- **`borderPadding`** is drawn outside `regionBorder` now, instead of being taken out of it, so `regionBorder` is the
  visible border. A 1.x config that widened the border to make room for its shadow, such as `regionBorder: 15` with
  `borderPadding: 9`, becomes `regionBorder: 6` with the spacing it gave up added back: `canvasPadding` 9 larger, and
  `canvasGap` and `layoutGap` 18 larger. Plain layouts land on the same pixels, and attached regions and green screen
  cameras meet the visible border.
- **Presets** derive from the config, ids included, so `config/preset-effect-lists.json` and `--presets` are gone;
  delete the file. The first `firebot:deploy` replaces every layout preset with one under its new id, so anything in
  Firebot that runs one needs pointing at it once.
- **Presets no longer change the OBS scene** with an effect of their own: the script switches program to the
  container only when program shows another scene.
- **Commands** are grouped by program: `deploy` is `firebot:deploy`, `restart-firebot` is `firebot:restart`, `apply`
  is `obs:verify`, and `capture` is `obs:capture`. `setup` and `fades` are steps of `obs:deploy`, `install-script` is
  a step of `firebot:deploy`, and `init` is gone in favor of the example above.

## Development

Needs Node 22.4 or later. There is no config in this repo; to try a change against a real installation, link this
checkout into the project that holds the config and keep the build current:

```sh
npx link ../obs-layout-firebot   # in the project with the config, which then runs this checkout's CLI and script
npm run dev                      # here, rebuilding dist/ on every change
```

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
