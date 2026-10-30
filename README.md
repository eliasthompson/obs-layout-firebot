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

A [canvas](#canvases) other than OBS's main one, such as the vertical canvas of Twitch Dual Format, also needs:

| Software       | Minimum | Why                                                                                                                                      |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OBS Studio     | 32.1    | Ships obs-websocket 5.7.2, whose scene and filter requests take a canvas, and which lists the canvases.                                  |
| Aitum Vertical | 1.6.3   | Puts its vertical canvas on OBS's own canvases (1.6.0) and switches that canvas's program scene; 1.6.3 fixed editing transforms on 32.1. |

A config that sets a region's `cropToBounds` needs OBS 30.2 or later, which ships obs-websocket 5.5.1, the first to
report and set a scene item's crop to its bounds.

The tools run on Windows, macOS, and Linux.

## How it works

The script runs inside Firebot. When a preset calls it with a scene key, it:

1. reads the layout config from a Firebot custom variable (`layoutScenes` by default),
2. runs `generateLayout` for the participants that scene shows, on every [canvas](#canvases) that shows it,
3. opens its own obs-websocket connection, using the credentials from Firebot's OBS integration,
4. with [standby screens](#standby-screens) configured, reads what OBS shows now, so it knows whether the transition
   starts from standby, and
5. sends one request batch for every canvas, executed in sync with OBS's video frames, that writes and enables a set
   of Move Transition filters. Moves that belong after others wait through the filters' own start delay, so the whole
   transition is still one batch, and the next preset cuts it short at any point. When a canvas's program shows
   another scene, the batch ends by switching it to the canvas's container, so its scene transition starts with the
   moves. When the container is already on program, no scene transition runs, and preview stays yours for other
   work.

The filters do the animating:

- **`Move: <source>`** (Move Source) on the scene that contains an item: position, size through bounds, and
  visibility.
- **`Move: Width`** and **`Move: Height`** (Move Value) on each border color source: its own width and height. The
  borders carry stroke and shadow filters that render at the source's native size, so stretching them would distort
  the frame.
- **`Opacity`** (Color Correction) plus **`Move: Opacity`** (Move Value) on every toggled source but standby text:
  fades. OBS's own scene item show/hide Fade brightens toward white on anything with transparency, so it is not used.

Regions a layout does not use fade out while shrinking to a point at the center of the layout area (the canvas less
its margins) and are hidden; when a later layout needs them, they fade in while growing from that point. The name is
the exception: it has no border and always sits over another region, so without `hasName` it fades out where it would
be, keeps moving with its host while hidden, and fades back in place. Participant layouts a scene does not use fade
out and hide in the container scene.

## Getting started

In a folder of your own (an existing project works too):

```sh
npm install --save-dev @eliasthompson/obs-layout-firebot @eliasthompson/obs-layout-generator
# describe your OBS scenes and sources in config/scenes.ts (see Config below), then:
npx obs-layout-firebot obs:deploy       # creates the filters in OBS, then restarts OBS if the item transitions need setting
npx obs-layout-firebot firebot:deploy   # checks the config against OBS, stores it in Firebot, installs the script and presets
```

obs-layout-generator is a peer dependency: the config's layout types come from it, and the CLI lays out with your
project's copy, the same one your own code uses. The script Firebot runs is a single file with the generator bundled
in, the version this package was built with; `firebot:deploy` warns when that is not the version you have installed.

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
  Items that a rectangle sizes get the bounds type their region's `boundsType` sets; without one they keep whatever
  bounds type they have, and items with no bounds type get Stretch.
- Optionally one color source per region as its **border**, with the stroke and shadow filters of your choice. The
  color source is sized to the region's border box, the region grown by `regionBorder`, so `regionBorder` is the
  visible border. `borderPadding` is how far those filters extend the source past it, such as a shadow's size: the
  item sits that much further out, and the padding never pushes regions apart.
- Scene items the script lays out should have **no** show/hide transition, since it fades them itself. `obs:deploy`
  sets that in the scene collection file, around a restart of OBS. [Toggled items](#toggled-items-and-fades), and
  every item of the canvas's `fadeScenes`, get a Fade instead.
- For standby screens, a **standby text** scene in the container, below the participant layouts, holding one text
  source per screen, and any standby widgets as items of the container. `obs:deploy` crops the text scene at the canvas
  center: left of it on a landscape canvas, below it on a portrait one.
- For a second canvas, such as Aitum Vertical's: the same container, layout scenes, and items on that canvas, with
  sources of its own; see [Canvases](#canvases).

## Firebot setup

- Settings, Integrations, OBS: enter the WebSocket address and password and connect. The script reads these same
  settings from the profile's `integrations.json`, so there is nothing else to configure.
- **Run Custom Scripts** (Settings, Scripts) and **Persist Custom Variables** (Settings, Advanced) must be on;
  `firebot:restart` turns both on for you. Without the second, the config is gone after a restart.
- Preset effect lists: one per scene key, and an on, an off, and a reset for the modifiers, each a **Run Custom
  Script** effect running `obs-layout.js` with the scene key or modifier as its parameters. Their ids derive from the
  config variable and the action, so a Stream Deck button or command that runs one keeps working across deploys and
  machines. `firebot:restart` installs them into the profile, and `firebot:deploy` runs it when they are missing or
  out of date.

Firebot's HTTP API cannot create preset lists, and Firebot caches a custom script once loaded, so both the presets
and a new build need a Firebot restart to take effect.

## Config

`config/scenes.ts` is the master config. It is a TypeScript module whose default export `satisfies ScenesConfig`, so
your editor completes and checks every field as you type, and you can add comments or compute repetitive parts. It
can import from the rest of your project, by relative path or through your tsconfig.json's `paths` aliases, which the
CLI resolves as TypeScript does. This is the complete example; copy it and bind your own scene and source names:

```ts
import type { ParticipantPoolEntry, ScenesConfig } from '@eliasthompson/obs-layout-firebot';

// One person's sources on a canvas. OBS shares source names across canvases, so each canvas's copies get a suffix
const person = (n: number, suffix = ''): ParticipantPoolEntry => ({
  sources: {
    contentMain: { source: `[Group] Content ${n}${suffix}`, border: `[Border] Content ${n}${suffix}` },
    info: { source: `[Widget] Info ${n}${suffix}`, border: `[Border] Info ${n}${suffix}` },
    camera: { source: `[Group] Camera ${n}${suffix}`, border: `[Border] Camera ${n}${suffix}` },
    name: { source: `[Text] Name ${n}${suffix}` },
  },
});

export default {
  // Each OBS canvas the presets lay out, by a key of your choosing; a preset applies its scene on every canvas that
  // shows it, in one batch
  canvases: {
    landscape: {
      // OBS scene that holds one nested layout scene per participant
      container: '[Scene] Content',
      // Canvas options of obs-layout-generator, for every scene on this canvas
      options: { canvasPadding: 24, canvasMarginTop: 105, canvasMarginBottom: 105, layoutGap: 18, regionBorder: 6 },
      // Every layout scene on this canvas, with the OBS item (and border) that fills each region, and what is true of
      // that participant in every composition
      participants: {
        '[Layout] Person 1': person(1),
        // A guest who always streams keyed
        '[Layout] Person 2': { ...person(2), config: { camera: { isGreenScreen: true } } },
      },
      // The scene in the container that holds the standby texts, the height of the standby line, and how far past
      // the line a text shows
      standby: { textScene: '[Widget] Standby Text', lineLength: 540, textGap: 30 },
      // Optional: items scenes and modifiers show and hide, with whether they show when neither says; they fade
      // through OBS's own Fade, audio included. See Toggled items and fades
      items: {
        '[Audio] Voice': { visible: true },
        Music: { source: '[Audio] Music', scene: '[Audio] Background', visible: false },
      },
      // Optional: scenes and groups whose every item obs:deploy gives a Fade, such as a region's source list
      fadeScenes: ['[List] Content 1 Sources'],
    },
    // Optional: Aitum Vertical's canvas, by the name OBS lists it under; see Canvases. The scenes name participants by
    // the same keys, and its OBS scenes have names of their own, so the two canvases' scenes never look alike
    portrait: {
      canvas: 'Aitum Vertical',
      container: '[Scene] Content (V)',
      options: {
        canvasWidth: 1080,
        canvasHeight: 1920,
        orientation: 'portrait',
        canvasPadding: 24,
        canvasMarginTop: 144,
        canvasMarginBottom: 422,
        layoutGap: 18,
        regionBorder: 6,
      },
      // The same key, in the OBS scene `scene` names
      participants: { '[Layout] Person 1': { ...person(1, ' (V)'), scene: '[Layout] Person 1 (V)' } },
      // A portrait canvas's line runs across it, and its text shows above the line
      standby: { textScene: '[Widget] Standby Text (V)', lineLength: 720, textGap: 30 },
    },
  },
  // Pixels the border sources' shadow filters add outside the border on every side
  borderPadding: 9,
  // Optional: the filter on each border that carries its color, so another program can recolor the borders through
  // the "Move: Color" filter obs:deploy adds for it; see Border colors
  // borderColor: { filter: 'Stroke', duration: 500 },
  // Move duration in milliseconds
  duration: 300,
  // The layout config every participant starts from, under the canvas's, their pool config, and the scene's; see
  // Layers and modifiers
  config: { camera: { mainAspectRatio: '4:3' } },
  // How every participant's sources sit in their regions, under the canvas's, each participant's own, and the scenes'
  regions: {
    camera: { boundsType: 'scale to outer bounds', cropToBounds: true },
    info: { inset: 12, boundsAlignment: 'top center' },
    name: { inset: 12, fontSizeMin: 24, fontSizeMax: 48 },
  },
  // One preset per scene key: the participants it shows, in layout order, each with what the composition changes
  scenes: {
    '[Scene] 16:9 1P': { participants: [{ layout: '[Layout] Person 1' }] },
    '[Scene] Camera 1P': {
      participants: [{ layout: '[Layout] Person 1', config: { contentMain: null } }],
      // A camera on its own needs no timer strip, whatever is switched on
      modifiers: { Timer: false },
    },
    '[Scene] 4:3 2P': {
      participants: [
        { layout: '[Layout] Person 1', config: { contentMain: { aspectRatio: '4:3' } } },
        { layout: '[Layout] Person 2', config: { contentMain: { aspectRatio: '4:3' } } },
      ],
      duration: 500,
      modifiers: { Names: true },
      // The vertical canvas has no second person, so this scene leaves it as it is
      canvases: { portrait: false },
    },
    // Standby screens: every participant collapses into a line at the layout area's center and the text slides out from
    // behind it; `line` names whose main border is the line, the first participant when left out
    '[Standby] Starting Soon': { standby: { text: '[Text] Starting Soon' }, items: { Music: true } },
    '[Standby] Be Right Back': {
      standby: { text: '[Text] Be Right Back', line: '[Layout] Person 2' },
      // Mutes the voice while away; scenes that do not say bring it back
      items: { '[Audio] Voice': false, Music: true },
      canvases: { portrait: false },
    },
  },
  // Layout configs that presets switch on and off over any scene: an "<name> On" and "<name> Off" preset each, plus
  // "Reset Modifiers"; see Layers and modifiers
  modifiers: {
    // A green screen camera: no border, spreading over the gaps around it; its border source fades out
    Keyed: { config: { camera: { isGreenScreen: true } }, participants: ['[Layout] Person 1'] },
    // A region config switches the region on, so the strip's whole shape lives here
    Timer: { config: { info: { aspectRatio: '250:49', isMainAttached: true } } },
    Names: { config: { hasName: true } },
    // A modifier may only toggle items, over whatever the scene says
    Muted: { items: { '[Audio] Voice': false } },
  },
  // Optional: where the tools find OBS and Firebot when the defaults do not fit this machine; see Machine settings
  // obs: { sceneCollection: 'Untitled', profile: 'Untitled', exportDir: 'obs', executable: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
  // firebot: { profile: 'Main', apiUrl: 'http://localhost:7472/api/v1', variable: 'layoutScenes' },
} satisfies ScenesConfig;
```

| Field           | Meaning                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvases`      | The OBS canvases to lay out, by a key of your choosing, each with the fields below; see [Canvases](#canvases).                                                                                       |
| `borderPadding` | Pixels the border sources' filters add outside the border on every side. Default `0`.                                                                                                                |
| `borderColor`   | The filter on each border that carries its color, for recoloring; see [Border colors](#border-colors).                                                                                               |
| `duration`      | Move duration in milliseconds. Default `300`.                                                                                                                                                        |
| `config`        | The `LayoutConfig` every participant starts from; see [Layers and modifiers](#layers-and-modifiers).                                                                                                 |
| `regions`       | Region settings every participant starts from: `inset`, `boundsAlignment`, `boundsType`, `cropToBounds`, `fontSizeMax`, `fontSizeMin` per region; see [Layers and modifiers](#layers-and-modifiers). |
| `scenes`        | Compositions by scene key: the participants shown, in layout order, each with the `config` the composition changes, the modifiers the scene forces, and the items it toggles.                        |
| `modifiers`     | `LayoutConfig`s and item toggles presets switch on and off over any scene; see [Layers and modifiers](#layers-and-modifiers).                                                                        |
| `obs`           | Optional. `url` and `password` are used over Firebot's OBS integration settings; see [Machine settings].                                                                                             |
| `firebot`       | Optional. Where the tools find Firebot; see [Machine settings].                                                                                                                                      |

Each canvas takes:

| Field          | Meaning                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas`       | Optional. The OBS canvas by name, as OBS lists it, such as `Aitum Vertical`; OBS's main canvas when left out.                                                                                                               |
| `container`    | OBS scene whose items are the canvas's participant layout scenes.                                                                                                                                                           |
| `options`      | `LayoutOptions` for the canvas, as in obs-layout-generator.                                                                                                                                                                 |
| `config`       | Optional. This canvas's `LayoutConfig` layer, over the config's and under each participant's.                                                                                                                               |
| `regions`      | Optional. This canvas's region settings, over the config's and under each participant's.                                                                                                                                    |
| `participants` | Every participant on the canvas, keyed by the name scenes use for it, with its layout scene in `scene` when that is not the key, the source (and border) for each region, and the participant's own `config` and `regions`. |
| `standby`      | Needed for standby scenes on this canvas: `textScene`, `lineLength`, `textGap`; see [Standby screens](#standby-screens).                                                                                                    |
| `items`        | Optional. Items scenes and modifiers show and hide, by the key they name them by; see [Toggled items and fades](#toggled-items-and-fades).                                                                                  |
| `fadeScenes`   | Optional. OBS scenes and groups whose every item `obs:deploy` gives a Fade; see [Toggled items and fades](#toggled-items-and-fades).                                                                                        |

A scene entry may carry its own `options` and `duration`, a `standby` entry that makes it a standby screen, `items`,
the items it shows (`true`) or hides (`false`), and `canvases`, what it changes on each canvas; see
[Canvases](#canvases).
Region names are those of `LayoutMetric`: `contentMain`,
`camera`, `contentAux`, `info`, `name`. Each bound source takes a `source` and an optional `border`, the OBS items.
How a source sits in its region is set per region in `regions`: on the config for every participant, on a pool entry
for that participant, and on a scene's participant entry for that composition, each over the last. A region takes an
optional
`inset` (pixels the source sits inside its region on every side, as padding within the border, for text or widgets
that should not touch the frame; a ratio declared for an inset region holds for the area inside the inset, so a
`250:49` info strip with a 12 px inset shows 366x72 of content inside a 390x96 region), an optional `boundsAlignment`
(where the source sits inside its bounds when it does not fill them, named as in OBS's transform dialog, such as
`top center`), an optional `boundsType` (how the source fills its bounds, named as in the same dialog, such as
`scale to outer bounds` for a 16:9 camera covering a square region; the item keeps its own type when this is left
out), and an optional `cropToBounds` (OBS's "Crop to Bounding Box", so a source scaled to outer bounds does not spill
past its region; needs OBS 30.2 or later), all three of which `obs:deploy` applies to the item, and for text sources an optional `fontSizeMax` and `fontSizeMin`. With
either set, the font is set on every move to the largest size whose line fits the source's height after the inset:
it stays at `fontSizeMax` while that fits and sizes down to `fontSizeMin` when the region is too short. How tall a
line renders per pixel of font size is measured from the source itself, its rendered height at its current font size,
so no ratio is configured; a source that renders nothing yet, such as an empty text, is sized as if a line were a
quarter taller than its font. The item's bounds must not scale the text up, or the font size changes nothing on
screen. When a name region has `fontSizeMin`, the layout is asked for a name at least `inset × 2` plus a line at
`fontSizeMin` tall, unless the options already set `nameHeightMin`; when it has `fontSizeMax`, for a name at most
`inset × 2` plus a line at `fontSizeMax` tall, unless the options already set `nameHeightMax`, so the name is no
taller than its text at the largest size needs. Lines are measured as above, and the largest such height across the
scene's participants is asked for. The layout still keeps the name to a third of its host.

A participant's `config` is a `LayoutConfig` as obs-layout-generator takes it: `contentMain`, `camera`, `contentAux`,
and `info` each take a region config such as `{ aspectRatio: '4:3' }` or `null` to turn the region off, and `hasName`
adds the name tag. A side region attached to the main region (`isMainAttached`) or to the side region before it
(`isPreviousAttached`) shares that neighbor's border, so the two border sources overlap on the same pixels there. A green
screen camera (`camera: { isGreenScreen: true }`) has no border and spreads over the gaps around it; its border source
still moves and sizes as if it framed the camera, so the two stay in step, but fades out, and fades back in with the
next layout that frames the camera.

The config is stored in a Firebot variable as JSON, so it has to stay plain data: no functions, dates, or class
instances. A `.js` or `.json` file works too; pass it with `--config`.

### Layers and modifiers

A shown participant's layout config is built up in layers, each merged over the last region by region, so a layer
can change one field of a region without restating the rest, and `null` on any layer turns a region off:

1. the config's `config`: what every participant starts from, such as the camera's ratio when it takes the main
   column;
2. the canvas's `config`: what differs on that canvas, such as names on a vertical canvas only;
3. the participant's pool `config`: what is true of them in every composition, such as a guest who always streams
   keyed;
4. the scene's `config` for them: what the composition changes, such as the content shape;
5. every modifier in effect, in the order `modifiers` lists them.

Region settings layer the same way, field by field per region: the config's `regions`, then the canvas's, then the
pool entry's, then the scene participant's. The bounds settings (`boundsAlignment`, `boundsType`, `cropToBounds`) are
the exception: `obs:deploy` sets them on the item once, so they layer over the config, the canvas, and the pool entry
only. Setting them in the config rather than by hand in OBS keeps every participant's items alike, a new
participant's included.

Modifiers are the switches: named layout configs that presets switch on and off at runtime, over whatever scene is
up. A region config in any layer switches the region on, so a region that only a modifier should show, such as a
timer strip, is described in the modifier alone. Switched-on modifiers stay on across scene changes, so a scene preset applies its scene with them, and a scene
can force one on or off with its `modifiers` (`{ Timer: false }`), whatever is switched on. A modifier applies to
every shown participant unless it names `participants`. A modifier's `items` toggle items over the scene's, and a
modifier with only `items` leaves the layout as it is, such as a `Muted` switch for the voice. The script keeps the active scene and modifiers in the
Firebot variable named after the config variable with `State` added, and `firebot:deploy` makes a preset per scene
key, an `<name> On` and `<name> Off` preset per modifier, and `Reset Modifiers`. A modifier preset run before any
scene preset only remembers the modifier. With the example above, eight content shapes with a timer and a keyed
camera as modifiers make eight scene presets and five modifier presets instead of 32 scenes.

### Toggled items and fades

A canvas's `items` are items the presets show and hide that the layout does not move, such as audio groups: the voice
muted on standby screens, music only between scenes. Each is keyed by the name scenes and modifiers use for it, with
its OBS source in `source` when that is not the key, the OBS scene or group that holds it in `scene` when that is not
the container, and `visible`, whether it shows when nothing says otherwise. Whether an item shows in a scene is its
`visible`, then the scene's `items`, then each modifier in effect in the order `modifiers` lists them, the last that
names it winning, so a scene that does not name an item puts it back to `visible`. The same keys on every canvas let
one list of scenes toggle each canvas's own items; a canvas without a key leaves it out. The script shows and hides
the items in the same batch as the moves, so they fade with the layout.

A toggled item fades through its own show and hide transition, which `obs:deploy` sets to OBS's Fade over the config's
`duration`. OBS fades an item's audio along with its picture while the transition runs, so an audio group fades out
rather than cutting. A canvas's `fadeScenes` gives the same Fade to every item of the OBS scenes and groups it lists,
such as the scenes that list a region's sources, so switching a source in them by hand or from Firebot fades too.
Items the layout moves keep the transition `obs:deploy` gives them. OBS's Fade brightens toward white on anything with
transparency, such as a keyed or browser source, so leave those scenes out.

OBS mixes the audio of every canvas into one mix that every output takes a track of, and a source shown on two canvases
is mixed once, outside its scenes and their transitions. Keep audio sources on one canvas, usually the main one, so
hiding them silences them and their fades are heard.

### Canvases

`canvases` lists every OBS canvas the presets lay out. Most installations have one, OBS's main canvas, which leaves out
`canvas`. A second, such as the vertical canvas [Aitum Vertical](https://github.com/Aitum/obs-vertical-canvas) adds for Twitch Dual Format, names
the OBS canvas in `canvas`, and needs OBS 32.1 or later and Aitum Vertical 1.6.3 or later; a config with only the main
canvas needs neither.

- **One preset, every canvas.** A preset applies its scene on every canvas that shows it, in one frame-synced batch,
  so the canvases move together; when standby texts or widgets leave first on any canvas, every canvas's regions wait
  for them. Scenes, modifiers, and the standby line name participants by their key in each canvas's `participants`,
  so the same keys on every canvas let one list of scenes serve them all.
- **A scene can change per canvas.** A scene's `canvases` entry for a canvas replaces its `participants` there, adds
  `options`, or, for a standby scene, lays its own `standby` text, widgets, or line over the scene's, since each canvas
  has its own text sources and widget regions; `false` leaves that canvas as it is when the preset runs. A canvas
  without every participant a scene shows, or without `standby` settings for a standby scene, leaves the scene out
  too; `firebot:deploy` warns about those unless the scene says `false` for that canvas, and a scene no canvas shows is
  an error.
- **Each canvas has its own scenes and sources.** OBS lets scene names repeat across canvases, so the vertical canvas
  can have its own `[Scene] Content` and `[Layout] Person 1`. To tell them apart, give them names of their own, such
  as `[Scene] Content (V)`: `container` names the canvas's container, and a participant entry's `scene` names its
  layout scene, so its key stays the one the scenes use. Source names are shared across canvases, and the layout
  fades and resizes its sources, so each canvas needs its own groups, borders, and name texts, for example with a
  ` (V)` suffix. A capture, such as a camera, can still be shared by nesting it in each canvas's group.
- **A source can be shared when every canvas fades it alike.** The layout fades a source through filters on the
  source itself, but places it through each canvas's own item. So a scene both canvases always show and hide together,
  such as a content group, or a standby widget, can serve both, each canvas laying out its own item of it.
  `firebot:deploy` checks that every preset, under every combination of modifiers, fades each shared source the same
  way on every canvas that binds it, and refuses a preset that leaves one of those canvases out while another changes
  the source, or a border or sized name text bound on more than one canvas, since each canvas sizes those itself.
  Standby texts only ever move, so canvases may share them freely.
- **A scene is the size of its canvas.** OBS sizes a scene to the canvas it belongs to, and obs-websocket cannot give
  one a size of its own. A vertical canvas's scene is 1080×1920, so a nested scene that has to keep a landscape
  shape, such as a camera group whose item scales to fit with a crop, belongs on the main canvas, where the vertical
  layout can still nest it, or needs a Crop/Pad filter that cuts it to that shape.
- **Program switching.** The main canvas's container goes on program through OBS, another canvas's through Aitum
  Vertical, each only when that canvas shows another scene. OBS has no program scene for a canvas other than its main
  one, so no other plugin's canvas can be switched.
- **A missing canvas is skipped.** When OBS does not have a canvas the config names, for example without Aitum
  Vertical, the script lays out the rest and warns in Firebot's log, and the tools report it and deploy the rest.

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

A scene entry with `standby` does not lay its participants out. Instead, every region collapses into one line at the
center of the layout area (the canvas less its margins), upright on a landscape canvas and across a portrait one, and
a text slides out from behind it:

```ts
export default {
  // ...
  canvases: {
    landscape: {
      // ...
      standby: { textScene: '[Widget] Standby Text', lineLength: 540 },
    },
  },
  scenes: {
    // ...
    '[Standby] Starting Soon': {
      standby: {
        text: '[Text] Starting Soon',
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

- **The line.** Content collapses to no width at the layout area's center, which leaves each border's color source two
  borders wide (`regionBorder` per side), `lineLength` tall. A portrait canvas turns it on its side: content collapses
  to no height, and the line runs across the canvas, `lineLength` wide and two borders tall. Portrait is
  obs-layout-generator's `orientation` option, or a layout area taller than wide when it is `auto`, as the layout
  decides. With an inner stroke at least a border wide, the line is solid stroke. Every participant collapses onto it
  unless the scene lists `participants`, and only the `line` participant's main border stays shown (the first
  participant when left out; the main region is the one obs-layout-generator puts in the main column: main content,
  else camera, else aux content, else info), so their shadows do not stack. Leaving standby for a layout whose main
  region is another one, that border takes over the line in a single frame before the regions grow out.
- **The text** is an item of `textScene`, which `obs:deploy` crops at the line's middle, so text slides out from
  behind the line without fading. It shows at its rendered size, which the script reads from OBS, centered on the line
  and `textGap` pixels past it (default 30): right of an upright line, above one across. Until OBS has reported a size,
  a box the line's proportions suggest stands in. Hidden text waits entirely past the cut, left of an upright line and
  below one across. Put `textScene` below the participant layouts in the container, so the line covers the cut. Each
  screen has its own text source; a scene that replaces another's text slides the old one back first. The text sources
  only ever move, so canvases can share them, each nesting them in a text scene of its own, unless a canvas wants its
  lines aligned otherwise, which is a setting of the source.
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
| `obs.sceneCollection` | `OBS_SCENE_COLLECTION`   | `--collection`  | The collection OBS reports as active, else `Untitled`¹   |
| `obs.profile`         | `OBS_PROFILE_DIR`        | `--profile`     | The profile OBS reports as active, else `Untitled`¹      |
| `obs.exportDir`       |                          | `--to`          | `obs`, in the folder you run the tools from              |
| `obs.executable`      |                          |                 | The standard install (Windows, macOS, Linux package)     |
| `obs.url`             | `OBS_WEBSOCKET_URL`      |                 | Firebot's OBS integration, else `ws://localhost:4455`    |
| `obs.password`        | `OBS_WEBSOCKET_PASSWORD` |                 | Firebot's OBS integration, else none                     |

¹ The scene collection and OBS profile go by what OBS says first: the ones it has loaded when it is running, else the
ones it last had loaded and opens with next, from its `user.ini` (or `global.ini` before OBS 31). Only when neither
says do the config's names apply, so they matter only on a machine where OBS has never run.

The config takes profiles and a scene collection by name; the environment variables and options take the full path
of the profile folder and the collection file. The data folders are `%APPDATA%` on Windows,
`~/Library/Application Support` on macOS, and `~/.config` on Linux (Flatpak OBS keeps its own under
`~/.var/app/com.obsproject.Studio/config`; point `OBS_SCENE_COLLECTION` there).

## Commands

Run as `npx obs-layout-firebot <command>`. Commands are grouped by the program they act on. Every command that reads
the config takes `--config <path>` (default `config/scenes.ts`); every command that changes something takes
`--dry-run` to report what it would do instead, and `--yes` to skip its questions.

| Command           | What it does                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `obs:deploy`      | Sets OBS up for the config on every canvas, then asks to restart OBS when the item transitions need setting; see below. `--no-restart`.                                                                                                         |
| `obs:restart`     | Restarts OBS, never forcibly, after checking that it is not streaming or recording.                                                                                                                                                             |
| `obs:verify`      | `obs:verify "<scene key>"`: applies a scene from this machine and compares every item on every canvas with the plan; exits 1 on a mismatch. `--modifiers Keyed,Timer` applies it as the script would with those switched on.                    |
| `obs:capture`     | `obs:capture "<scene key>" --save frames/`: screenshots of a canvas's container during a transition, or white-pixel counts without it. `--canvas portrait` picks the canvas, the first that shows the scene by default. `--modifiers` as above. |
| `obs:export`      | Copies OBS's scene collection and profile into the project, with every secret blanked, so the setup can be committed; see [Exporting the OBS setup](#exporting-the-obs-setup). `--to obs`, `--collection`, `--profile`, `--no-wait`.            |
| `obs:prune`       | **Deletes for good** the old backups `obs:deploy` made of the scene collections, keeping the newest of each; see [Pruning backups](#pruning-backups). `--keep 3`, `--collection`.                                                               |
| `firebot:deploy`  | Checks, stores, installs the script, and asks to restart for new presets or a new script; see below. `--skip-obs`.                                                                                                                              |
| `firebot:restart` | Restarts Firebot, never forcibly, around installing the presets and turning on the two settings above.                                                                                                                                          |
| `firebot:prune`   | **Deletes for good** the old backups the tools made of the profile's script, presets, and settings, keeping the newest of each; see [Pruning backups](#pruning-backups). `--keep 3`, `--profile-dir`.                                           |

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
that is replaced is backed up next to it, with a timestamp; see [Pruning backups](#pruning-backups) for clearing old
ones.

### Exporting the OBS setup

`obs:export` copies the scene collection and the profile into the project, laid out like OBS's own `basic` folder,
so the setup can be committed and restored by copying the files back into OBS's data folder with OBS closed:

```text
obs/
  scenes/<collection>.json
  profiles/<profile>/basic.ini, service.json, streamEncoder.json, …
```

It exports the collection and profile OBS has loaded, asking OBS over the websocket. When OBS is not running, as
after a deploy that restarted it and left starting it to you, it waits for OBS to start; without a terminal to wait
on, or with `--no-wait`, it exports the ones OBS last had loaded instead. Only the profile's
`.ini` and `.json` files are copied, and exported profile files the profile no longer has are removed. Secret values
are blanked on the way: the stream key in `service.json`, the account tokens in `basic.ini`, and any other setting
named like a key, token, password, or secret. The command lists each by name, never its value. After a restore, paste
the stream key back in, or reconnect the account, under Settings → Stream. Everything else is copied character for
character, so exporting an unchanged setup writes nothing, and git shows each change to the setup as a diff.

OBS saves its files on its own schedule, usually right after a change, so the export holds what OBS last saved. Run
it after `obs:deploy`, which saves the collection when it restarts OBS, or a moment after a change in OBS.

### Pruning backups

Every deploy that replaces a file backs it up next to it first, as `<file>.<time>.bak`, and nothing removes those
copies on its own. `obs:prune` and `firebot:prune` delete the old ones, keeping the newest of each file (3 by default,
`--keep` to change it):

| Command         | Prunes the backups of                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `obs:prune`     | Every scene collection file in OBS's folder, or only the one `--collection` (or `OBS_SCENE_COLLECTION`) names    |
| `firebot:prune` | The profile's `scripts/obs-layout.js`, `effects/preset-effect-lists.json`, and `settings.json` (`--profile-dir`) |

**This is destructive.** The files are deleted, not moved to the recycle bin, so once a backup is gone, the version
of the file it held is gone too; `--keep 0` deletes every backup. Each command lists what it would delete and asks
before deleting anything, unless `--yes`; run it with `--dry-run` first to see the list alone. It only ever touches
backups the tools made, matched by their exact name: the files themselves, OBS's own `<collection>.json.bak`, backups
other programs or older tools made, and every other file stay as they are. Nothing needs to be closed first.

### Deploying a change in OBS

`obs:deploy` is the one step for changes on the OBS side, such as new sources, renamed items, or a new participant:

1. It runs the setup over the websocket on every canvas OBS has: filters created or updated, bounds types set, stale
   Move Source filters removed, the standby text scene cropped. This part is idempotent and is all that runs without
   the restart. A canvas OBS does not have is reported and skipped.
2. It asks which scene collection OBS has loaded, and whether OBS is streaming or recording.
3. It sets the show and hide transitions in the collection file, which only that file holds and OBS only reads at
   startup, so it asks to restart OBS around writing it: the items the layout moves get `--transition none|fade` over
   `--duration` (default `none`, `300`), and toggled items and every item of the `fadeScenes` a Fade over the config's
   `duration`. Scene names can repeat across canvases, so each scene is found on its own canvas first, then on any, as
   a source list nested from the main canvas is. A group's items are set in the group and in the copy OBS keeps of
   them in its parent scene. OBS saves the collection on exit, so the setup's filters are in the file before it is
   edited. When every item already has its transition, and the saved file holds every bound item, toggled item, and
   fade scene, there is nothing to write and OBS is not restarted. `--no-restart`, or declining, leaves the restart for
   a later `obs:deploy`.

### Deploying a config change

`firebot:deploy` is the one step for config changes:

1. It checks the scenes and modifiers, then reads every bound scene, item, and filter back from OBS on every canvas,
   and refuses to deploy when something is missing, so a typo in a source name is caught before a preset ever fails.
   Missing filters, and items whose bounds differ from the config's `boundsType` or `cropToBounds`, point at
   `obs:deploy`. A toggled item has to be in its scene or group, and cannot be an item the layout moves, which it
   shows and hides itself; a scene or modifier that toggles a key no canvas has is an error. A canvas OBS does not have is reported and skipped. It waits for OBS to be
   started when it is not running; pass `--skip-obs` to check the scenes and modifiers alone.
2. It stores the config in the `layoutScenes` variable (or `firebot.variable`). The next preset run uses it; nothing
   needs a restart.
3. It installs the built script into the profile when it differs from the installed one, and warns when the
   obs-layout-generator bundled into the script is not the version installed in your project.
4. It derives the presets from the config, one per scene key plus the modifier and reset presets, and compares them
   with the profile's presets and the ones Firebot has loaded.
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

## Upgrading from 4.x

- **obs-layout-generator 4** is the peer dependency: install `@eliasthompson/obs-layout-generator@^4`. In layout
  configs, `isAboveAttached` is now `isPreviousAttached`; see that package's migration notes for its other changes.
- **Name heights.** A name binding's `fontSizeMax` now sets the layout's `nameHeightMax` too, the inset on both sides
  plus a line at that size, as `fontSizeMin` already set `nameHeightMin`, unless the options set it.
- **Unused regions** wait at the middle of their participant's main region rather than the layout area's, so they
  shrink into and grow out of the main content.

## Upgrading from 3.x

- **Canvases.** `container`, `options`, `participants`, and `standby` move into a canvas under `canvases`, such as
  `canvases: { landscape: { container, options, participants, standby } }`; everything else stays where it is. The
  scene keys, and so the preset ids, are unchanged, so nothing in Firebot needs pointing at a preset again. A 3.x
  config is refused with a message saying so.
- **More canvases.** A second canvas is optional; see [Canvases](#canvases) for what it needs in OBS.
- **`standby.lineHeight` is now `lineLength`**, since a portrait canvas's line runs across it. A config with the old
  name is refused with a message saying so.
- **Library.** Functions that lay out or check one canvas take its view of the config, a `CanvasScenesConfig`, which
  `resolveCanvasConfig` gives. `findConfigProblems` checks one canvas against OBS, and `findSceneProblems` checks the
  scenes and modifiers. `runLayout` reports what it did on each canvas in `canvases`, and `buildMoveRequests` is built
  from `buildMovePhases` and `joinMovePhases`, which join the canvases' moves into one batch.

## Upgrading from 2.x

- **`fontScale`** is gone. A text region with `fontSizeMax` or `fontSizeMin` is sized from how tall it renders at
  its current font size, read from OBS before every move, so remove the field; the sizes keep their meaning.
- **Region settings moved off the bindings.** `inset`, `boundsAlignment`, `fontSizeMax`, and `fontSizeMin` live in a
  `regions` map by region name, on the config, on a pool entry, or on a scene's participant entry, instead of beside
  the source names.
- **Standby text** is the source name alone: `text: '[Text] Starting Soon'` instead of a source and region. The text
  shows at its rendered size, centered on the line, `standby.textGap` past it. A standby scene may also drop its
  `participants`, which collapses everyone, and name the `line` participant.
- **Layers and modifiers** are new and optional: a `config` and `regions` on the config, on each pool entry, and on
  a scene's participant entry, and `modifiers` with their presets. Existing scene presets keep their ids; the
  modifier presets are added on the first deploy.

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
