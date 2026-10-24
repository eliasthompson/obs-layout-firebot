// Deploys the config to Firebot in one go: checks it against OBS (each canvas's scenes, items, filters), stores it in
// Firebot's custom variable, installs the built script into the profile when it changed, and offers to restart Firebot
// when it still has to load the config's presets (one per scene key, derived from the config) or a new script.
// Firebot must be running; OBS is waited for unless --skip-obs is given. Firebot is never closed forcibly: one that
// cannot be closed from here is left for you to close, and then to start again. --dry-run reports every change without
// writing.
//
//   obs-layout-firebot firebot:deploy [--config config/scenes.ts] [--variable layoutScenes] [--skip-obs] [--yes]
//     [--no-restart] [--dry-run]
import { parseArgs } from 'node:util';

import type { ObsClient } from '@/lib/connectObs';
import type { ConfigProblem, ItemBounds, ObsInventory } from '@/types/ObsInventory';
import type { CanvasScenesConfig, ScenesConfig } from '@/types/ScenesConfig';

import { createPresetEffectLists } from '@/lib/createPresetEffectList';
import { findConfigProblems, findSceneProblems } from '@/lib/findConfigProblems';
import { listBindings, listScenes } from '@/lib/listBindings';
import { compareLayoutPresets } from '@/lib/mergeLayoutPresets';

import { canvasLabel, openCanvases } from '../lib/canvases';
import {
  configVariable,
  confirm,
  DEFAULT_CONFIG_PATH,
  firebotApiUrl,
  firebotProfileDir,
  loadConfig,
  sleep,
  toolObsConnection,
} from '../lib/environment';
import { installScriptFile, warnGeneratorMismatch } from '../lib/installScript';
import { connectObsPatiently, ensureObsRunning } from '../lib/obs';
import { readProfilePresets, restartFirebot } from './firebotRestart';

/** How long to wait for Firebot to come back with the presets: longer when the user starts it by hand. */
const RESTART_WAIT_MS = 180_000;
const MANUAL_RESTART_WAIT_MS = 600_000;

/** Read back every scene, item, and filter a canvas's config binds, to check it against. */
const readObsInventory = async (client: ObsClient, config: CanvasScenesConfig): Promise<ObsInventory> => {
  const inventory: ObsInventory = { sceneItems: {}, filters: {}, inputKinds: {}, itemBounds: {} };
  const { scenes } = (await client.call('GetSceneList')) as { scenes: { sceneName: string }[] };
  const sceneNames = new Set(scenes.map((scene) => scene.sceneName));
  for (const scene of listScenes(config)) {
    if (!sceneNames.has(scene)) continue;
    const { sceneItems } = (await client.call('GetSceneItemList', { sceneName: scene })) as {
      sceneItems: { sourceName: string; inputKind?: string; sceneItemTransform: ItemBounds }[];
    };
    inventory.sceneItems[scene] = sceneItems.map((item) => item.sourceName);
    inventory.itemBounds[scene] = Object.fromEntries(
      sceneItems.map(({ sourceName, sceneItemTransform: { boundsType, cropToBounds } }) => [
        sourceName,
        { boundsType, ...(cropToBounds === undefined ? {} : { cropToBounds }) },
      ]),
    );
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
  return inventory;
};

/** Print each problem, and say whether any is an error. */
const reportProblems = (problems: ConfigProblem[]) => {
  for (const problem of problems) {
    console.log(`${problem.severity === 'error' ? 'ERROR  ' : 'WARNING'} ${problem.message}`);
  }
  return problems.some((problem) => problem.severity === 'error');
};

/**
 * Check the config against every canvas OBS has, printing each problem. A canvas OBS does not have is reported and
 * skipped, so the rest still deploys.
 *
 * @returns Whether any problem is an error, and how many items the canvases bind.
 */
const checkCanvases = async (config: ScenesConfig) => {
  const client = await connectObsPatiently(toolObsConnection(config));
  try {
    const problems: ConfigProblem[] = [];
    let bound = 0;
    for (const canvas of await openCanvases(client, config)) {
      const label = canvasLabel(config, canvas.key);
      const inventory = await readObsInventory(canvas.client, canvas.config);
      problems.push(
        ...findConfigProblems(canvas.config, inventory).map((problem) => ({
          ...problem,
          message: `${label}${problem.message}`,
        })),
      );
      bound += listBindings(canvas.config).length;
    }
    return { failed: reportProblems(problems), bound };
  } finally {
    client.close();
  }
};

const loadedPresetIds = async (apiUrl: string) =>
  new Set(((await (await fetch(`${apiUrl}/effects/preset`)).json()) as { id: string }[]).map((preset) => preset.id));

export const firebotDeploy = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      'dry-run': { type: 'boolean', default: false },
      'no-restart': { type: 'boolean', default: false },
      'skip-obs': { type: 'boolean', default: false },
      variable: { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });
  const dryRun = values['dry-run'];

  const loaded = await loadConfig(values.config);
  const variable = configVariable(loaded, values.variable);
  const config: ScenesConfig = { ...loaded, firebot: { ...loaded.firebot, variable } };
  const apiUrl = firebotApiUrl(config);

  // 1. Check the scenes and modifiers, which needs no OBS, then each canvas against OBS
  if (reportProblems(findSceneProblems(config))) {
    console.log('not deployed: fix the errors above first');
    process.exitCode = 1;
    return;
  }
  if (values['skip-obs']) {
    console.log('skipping the OBS check');
  } else {
    await ensureObsRunning();
    const { failed, bound } = await checkCanvases(config);
    if (failed) {
      console.log('not deployed: fix the errors above first');
      process.exitCode = 1;
      return;
    }
    console.log(`OBS check passed for ${String(bound)} bound items`);
  }

  // 2. Store the config in Firebot
  const scenesTotal = Object.keys(config.scenes).length.toString();
  if (dryRun) {
    console.log(`dry run: would store ${scenesTotal} scenes in the "${variable}" variable`);
  } else {
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
    console.log(`stored ${scenesTotal} scenes in the "${variable}" variable`);
  }

  // 3. The script: Firebot caches a loaded one, so a new build is a reason to restart
  warnGeneratorMismatch();
  const profileDir = firebotProfileDir(config);
  const scriptChanged = installScriptFile(profileDir, dryRun) === 'installed';

  // 4. The presets derive from the config. The profile has to hold exactly them, and Firebot has to have loaded them
  const presets = createPresetEffectLists(config);
  const profilePresets = readProfilePresets(profileDir);
  const { stale, leftOver } = compareLayoutPresets(profilePresets, presets);
  const loadedIds = await loadedPresetIds(apiUrl).catch((error: unknown) => {
    throw new Error(`Firebot is not reachable at ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
  });
  const notLoaded = Object.values(presets).filter((preset) => !loadedIds.has(preset.id));

  if (!stale.length && !leftOver.length && !notLoaded.length && !scriptChanged) {
    console.log(
      dryRun
        ? 'dry run: Firebot would need no restart'
        : 'Firebot has the script and exactly the presets of the config; deployed',
    );
    return;
  }

  // 5. Firebot only reads presets and scripts at startup
  const names = (presetIds: string[]) =>
    presetIds.map((id) => (typeof profilePresets[id].name === 'string' ? profilePresets[id].name : id)).join(', ');
  if (stale.length) console.log(`Firebot's profile lacks these presets as the config makes them: ${stale.join(', ')}`);
  if (notLoaded.length) {
    console.log(`Firebot has not loaded these presets: ${notLoaded.map((preset) => preset.name).join(', ')}`);
  }
  if (leftOver.length) console.log(`Firebot still has layout presets the config no longer makes: ${names(leftOver)}`);
  if (scriptChanged) console.log('Firebot has an old build of the script');
  if (dryRun) {
    console.log('dry run: Firebot would be restarted to apply them');
    return;
  }
  if (values['no-restart'] || !(await confirm('Restart Firebot now to apply them?', values.yes))) {
    console.log('not restarted; run `obs-layout-firebot firebot:restart` when ready');
    return;
  }

  const outcome = await restartFirebot({ config });

  if (outcome === 'manual') console.log('waiting for Firebot to come back with the presets');
  const deadline = Date.now() + (outcome === 'manual' ? MANUAL_RESTART_WAIT_MS : RESTART_WAIT_MS);
  while (Date.now() < deadline) {
    try {
      const ids = await loadedPresetIds(apiUrl);
      if (Object.keys(presets).every((id) => ids.has(id)) && leftOver.every((id) => !ids.has(id))) {
        console.log('Firebot is back with exactly the presets of the config; deployed');
        return;
      }
    } catch {
      // Firebot is still starting
    }
    await sleep(2000);
  }
  throw new Error('Firebot came back with the wrong presets, or did not come back in time');
};
