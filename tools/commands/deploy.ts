// Deploys the config: checks it against OBS (scenes, items, filters), stores it in Firebot's custom variable, keeps
// the presets file at one preset per scene key, and offers to restart Firebot when Firebot still has to load presets.
// Firebot must be running; OBS must be running unless --skip-obs is given.
//
//   obs-layout-firebot deploy [--config config/scenes.ts] [--presets config/preset-effect-lists.json]
//     [--variable layoutScenes] [--skip-obs] [--yes] [--no-restart]
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import type { PresetEffectList } from '@/lib/createPresetEffectList';
import type { ObsInventory } from '@/types/ObsInventory';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { connectObs } from '@/lib/connectObs';
import { findConfigProblems } from '@/lib/findConfigProblems';
import { listBindings } from '@/lib/listBindings';
import { syncPresetEffectLists } from '@/lib/syncPresetEffectLists';

import {
  configVariable,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PRESETS_PATH,
  firebotApiUrl,
  loadConfig,
  readJson,
  sleep,
  toolObsConnection,
  writeJson,
} from '../lib/environment';
import { restartFirebot } from './restartFirebot';

/** Read back every scene, item, and filter the config binds, to check the config against. */
const readObsInventory = async (config: ScenesConfig): Promise<ObsInventory> => {
  const client = await connectObs(toolObsConnection(config));
  const inventory: ObsInventory = { sceneItems: {}, filters: {}, inputKinds: {} };
  try {
    const { scenes } = (await client.call('GetSceneList')) as { scenes: { sceneName: string }[] };
    const sceneNames = new Set(scenes.map((scene) => scene.sceneName));
    const textScenes = config.standby ? [config.standby.textScene] : [];
    for (const scene of new Set([config.container, ...textScenes, ...Object.keys(config.participants)])) {
      if (!sceneNames.has(scene)) continue;
      const { sceneItems } = (await client.call('GetSceneItemList', { sceneName: scene })) as {
        sceneItems: { sourceName: string; inputKind?: string }[];
      };
      inventory.sceneItems[scene] = sceneItems.map((item) => item.sourceName);
      for (const item of sceneItems) {
        if (item.inputKind !== undefined) inventory.inputKinds[item.sourceName] = item.inputKind;
      }
    }
    for (const source of new Set(listBindings(config).flatMap(({ scene, source }) => [scene, source]))) {
      try {
        const { filters } = (await client.call('GetSourceFilterList', { sourceName: source })) as {
          filters: { filterName: string }[];
        };
        inventory.filters[source] = filters.map((filter) => filter.filterName);
      } catch {
        // A source that does not exist is reported through the scene items check
      }
    }
  } finally {
    client.close();
  }
  return inventory;
};

const loadedPresetNames = async (apiUrl: string) =>
  new Set(
    ((await (await fetch(`${apiUrl}/effects/preset`)).json()) as { name: string }[]).map((preset) => preset.name),
  );

export const deploy = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'no-restart': { type: 'boolean', default: false },
      presets: { type: 'string', default: DEFAULT_PRESETS_PATH },
      'skip-obs': { type: 'boolean', default: false },
      variable: { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });

  const loaded = await loadConfig(values.config);
  const variable = configVariable(loaded, values.variable);
  const config: ScenesConfig = { ...loaded, firebot: { ...loaded.firebot, variable } };
  const apiUrl = firebotApiUrl(config);

  // 1. Check the config against OBS
  if (values['skip-obs']) {
    console.log('skipping the OBS check');
  } else {
    const problems = findConfigProblems(config, await readObsInventory(config));
    for (const problem of problems)
      console.log(`${problem.severity === 'error' ? 'ERROR  ' : 'WARNING'} ${problem.message}`);
    if (problems.some((problem) => problem.severity === 'error')) {
      console.log('not deployed: fix the errors above first');
      process.exitCode = 1;
      return;
    }
    console.log(`OBS check passed for ${String(listBindings(config).length)} bound items`);
  }

  // 2. Store the config in Firebot
  const storeConfig = async () => {
    const response = await fetch(`${apiUrl}/custom-variables/${encodeURIComponent(variable)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: config, ttl: 0 }),
    }).catch((error: unknown) => {
      throw new Error(
        `Firebot is not reachable at ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    if (!response.ok) throw new Error(`Firebot answered ${String(response.status)} ${response.statusText}`);
    console.log(`stored ${Object.keys(config.scenes).length.toString()} scenes in the "${variable}" variable`);
  };
  await storeConfig();

  // 3. Presets: the presets file holds exactly one per scene key
  const stored = existsSync(values.presets) ? (readJson(values.presets) as Record<string, PresetEffectList>) : {};
  const { presets, added, removed, updated } = syncPresetEffectLists(stored, config);
  if (added.length || removed.length || updated.length || !existsSync(values.presets)) {
    writeJson(values.presets, presets);
    if (added.length) console.log(`added presets to ${values.presets}: ${added.join(', ')}`);
    if (removed.length) console.log(`removed presets from ${values.presets}: ${removed.join(', ')}`);
    if (updated.length) console.log(`pointed presets at the "${variable}" variable: ${updated.join(', ')}`);
  }

  // Firebot's loaded presets have to match the file: new ones to load, removed ones to drop, changed ones to reload
  const firebotNames = await loadedPresetNames(apiUrl);
  const ourNames = new Set(Object.values(presets).map((preset) => preset.name));
  const notLoaded = [...ourNames].filter((name) => !firebotNames.has(name));
  const leftOver = [...firebotNames].filter(
    (name) => removed.includes(name) || (!ourNames.has(name) && name in config.scenes),
  );

  if (!notLoaded.length && !leftOver.length && !updated.length) {
    console.log('Firebot has exactly the presets of the config; deployed');
    return;
  }

  // 4. Firebot only reads presets at startup
  if (notLoaded.length) console.log(`Firebot has not loaded these presets: ${notLoaded.join(', ')}`);
  if (leftOver.length) console.log(`Firebot still has these removed presets: ${leftOver.join(', ')}`);
  if (updated.length) console.log(`Firebot has an old version of these presets: ${updated.join(', ')}`);
  if (values['no-restart']) {
    console.log('restart Firebot with `obs-layout-firebot restart-firebot` to apply them');
    return;
  }

  let confirmed = values.yes;
  if (!confirmed && process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question('Restart Firebot now to apply them? [y/N] ');
    prompt.close();
    confirmed = /^y(es)?$/i.test(answer.trim());
  }
  if (!confirmed) {
    console.log('not restarted; run `obs-layout-firebot restart-firebot` when ready');
    return;
  }

  const stopped = await restartFirebot({ config, presetsPath: values.presets });

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const names = await loadedPresetNames(apiUrl);
      if (notLoaded.every((name) => names.has(name)) && leftOver.every((name) => !names.has(name))) {
        // A forced stop skips Firebot's save of its custom variables, so the config may be an older one
        if (stopped === 'killed') await storeConfig();
        console.log('Firebot is back with exactly the presets of the config; deployed');
        return;
      }
    } catch {
      // Firebot is still starting
    }
    await sleep(2000);
  }
  throw new Error('Firebot came back with the wrong presets, or did not come back within three minutes');
};
