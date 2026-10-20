// Deploys the config to Firebot in one go: checks it against OBS (scenes, items, filters), stores it in Firebot's
// custom variable, installs the built script into the profile when it changed, and offers to restart Firebot when it
// still has to load the config's presets (one per scene key, derived from the config) or a new script. Firebot must
// be running; OBS is waited for unless --skip-obs is given. Firebot is never closed forcibly: one that cannot be
// closed from here is left for you to close, and then to start again. --dry-run reports every change without writing.
//
//   obs-layout-firebot firebot:deploy [--config config/scenes.ts] [--variable layoutScenes] [--skip-obs] [--yes]
//     [--no-restart] [--dry-run]
import { parseArgs } from 'node:util';

import type { ObsInventory } from '@/types/ObsInventory';
import type { ScenesConfig } from '@/types/ScenesConfig';

import { createPresetEffectLists } from '@/lib/createPresetEffectList';
import { findConfigProblems } from '@/lib/findConfigProblems';
import { listBindings } from '@/lib/listBindings';
import { compareLayoutPresets } from '@/lib/mergeLayoutPresets';

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
import { installScriptFile } from '../lib/installScript';
import { connectObsPatiently, ensureObsRunning } from '../lib/obs';
import { readProfilePresets, restartFirebot } from './firebotRestart';

/** How long to wait for Firebot to come back with the presets: longer when the user starts it by hand. */
const RESTART_WAIT_MS = 180_000;
const MANUAL_RESTART_WAIT_MS = 600_000;

/** Read back every scene, item, and filter the config binds, to check the config against. */
const readObsInventory = async (config: ScenesConfig): Promise<ObsInventory> => {
  const client = await connectObsPatiently(toolObsConnection(config));
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

  // 1. Check the config against OBS
  if (values['skip-obs']) {
    console.log('skipping the OBS check');
  } else {
    await ensureObsRunning();
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
