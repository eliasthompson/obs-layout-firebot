// Example layout config. `obs-layout-firebot init` copies it to config/scenes.ts, which is yours to edit; the type
// gives every field autocomplete and checks it as you type. See the README for what each field does.
import type { ScenesConfig } from '@eliasthompson/obs-layout-firebot';

export default {
  // OBS scene that holds one nested layout scene per participant
  container: '[Scene] Content',
  // Canvas options of obs-layout-generator, for every scene
  options: { canvasPadding: 15, canvasMarginTop: 105, canvasMarginBottom: 105, regionBorder: 15 },
  // Pixels the border sources' stroke and shadow filters add on every side
  borderPadding: 9,
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
      participants: [{ layout: '[Layout] Person 1', config: { contentMainAspectRatio: null } }],
    },
    '[Scene] 4:3 2P': {
      participants: [
        { layout: '[Layout] Person 1', config: { contentMainAspectRatio: '4:3' } },
        { layout: '[Layout] Person 2', config: { contentMainAspectRatio: '4:3' } },
      ],
      duration: 500,
    },
  },
  // Optional: where the tools find OBS and Firebot when the defaults do not fit this machine
  // obs: { url: 'ws://localhost:4455', password: '', sceneCollection: 'Untitled' },
  // firebot: { profile: 'Main', apiUrl: 'http://localhost:7472/api/v1', variable: 'layoutScenes' },
} satisfies ScenesConfig;
