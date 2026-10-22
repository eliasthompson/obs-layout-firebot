import type { FirebotRunRequest, FirebotRunResult } from '@/types/FirebotRunRequest';
import type { LayoutState } from '@/types/LayoutState';

import { version } from '#package.json';
import { DEFAULT_CONFIG_VARIABLE, STATE_VARIABLE_SUFFIX } from '@/constants/filterNames';
import { assertConfig } from '@/lib/assertConfig';
import { connectObs, type ConnectObs } from '@/lib/connectObs';
import { readFirebotIntegrations } from '@/lib/readFirebotIntegrations';
import { resolveObsConnection } from '@/lib/resolveObsConnection';
import { runLayout } from '@/lib/runLayout';

/** The modifier name that stands for every modifier, in the reset preset. */
const EVERY_MODIFIER = '*';

export const getScriptManifest = () => ({
  name: 'OBS Layout',
  description: 'Moves OBS scene items into an obs-layout-generator layout using Move Transition filters',
  author: 'Elias Thompson',
  // Inlined by the build, so the script Firebot shows carries the version of the package it came from
  version,
  firebotVersion: '5',
  startupOnly: false,
});

export const getDefaultParameters = () => ({
  sceneKey: {
    type: 'string',
    default: '',
    description: 'Scene key',
    secondaryDescription:
      'Key under "scenes" in the layout config to apply, with the modifiers switched on, for example "[Scene] 16:9 1P". Leave empty to switch a modifier instead.',
  },
  configVariable: {
    type: 'string',
    default: DEFAULT_CONFIG_VARIABLE,
    description: 'Config variable',
    secondaryDescription:
      'Name of the custom variable that holds the layout config object. The active scene and modifiers are kept in the variable of this name with "State" added.',
  },
  modifier: {
    type: 'string',
    default: '',
    description: 'Modifier',
    secondaryDescription:
      'Key under "modifiers" in the layout config to switch on or off, after which the last scene is applied again; "*" for every modifier.',
  },
  modifierState: {
    type: 'string',
    default: 'on',
    description: 'Modifier state',
    secondaryDescription: '"on" or "off", for the modifier.',
  },
});

export interface CreateRunOptions {
  /** Firebot profile folder, where `integrations.json` holds the OBS connection settings. */
  profileDir: string;
  connect?: ConnectObs;
  readIntegrations?: (profileDir: string) => string | undefined;
}

const failure = (message: string): FirebotRunResult => ({ success: false, errorMessage: `OBS Layout: ${message}` });

const parameter = (value: string | undefined, fallback = '') => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
};

/** The stored state, or an empty one when the variable is missing or not what the script wrote. */
const readState = (raw: unknown): LayoutState => {
  const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof parsed !== 'object' || parsed === null) return { modifiers: [] };
  const { sceneKey, modifiers } = parsed as { sceneKey?: unknown; modifiers?: unknown };
  return {
    ...(typeof sceneKey === 'string' && sceneKey ? { sceneKey } : {}),
    modifiers: Array.isArray(modifiers) ? modifiers.filter((name): name is string => typeof name === 'string') : [],
  };
};

/**
 * Build Firebot's `run` entry point. A scene key applies that scene with the modifiers switched on and remembers it;
 * a modifier switches on or off, or every one off with `*`, and the remembered scene is applied again. Reports to
 * Firebot's log.
 */
export const createRun =
  ({ profileDir, connect = connectObs, readIntegrations = readFirebotIntegrations }: CreateRunOptions) =>
  async (runRequest: FirebotRunRequest): Promise<FirebotRunResult> => {
    const { logger, customVariableManager } = runRequest.modules;
    const requestedScene = parameter(runRequest.parameters.sceneKey);
    const configVariable = parameter(runRequest.parameters.configVariable, DEFAULT_CONFIG_VARIABLE);
    const stateVariable = `${configVariable}${STATE_VARIABLE_SUFFIX}`;
    const modifier = parameter(runRequest.parameters.modifier);
    const enabled = parameter(runRequest.parameters.modifierState, 'on').toLowerCase() !== 'off';

    if (!requestedScene && !modifier) return failure('the sceneKey and modifier parameters are both empty.');

    try {
      const rawConfig = customVariableManager.getCustomVariable(configVariable);
      const config: unknown = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
      assertConfig(config);
      const state = readState(customVariableManager.getCustomVariable(stateVariable));

      // A modifier run changes the set and reapplies the last scene; a scene run keeps the set
      let modifiers = state.modifiers;
      if (modifier === EVERY_MODIFIER) {
        modifiers = [];
      } else if (modifier) {
        if (!(modifier in (config.modifiers ?? {}))) return failure(`no modifier "${modifier}" in the layout config.`);
        modifiers = enabled
          ? [...modifiers.filter((name) => name !== modifier), modifier]
          : modifiers.filter((name) => name !== modifier);
      }
      const sceneKey = requestedScene || state.sceneKey;
      const nextState: LayoutState = { ...(sceneKey === undefined ? {} : { sceneKey }), modifiers };

      if (sceneKey === undefined) {
        customVariableManager.addCustomVariable(stateVariable, nextState, 0);
        logger.info(`OBS Layout: modifiers ${modifiers.length ? modifiers.join(', ') : 'off'}; no scene to apply yet.`);
        return { success: true };
      }

      const connection = resolveObsConnection(config, readIntegrations(profileDir));
      const summary = await runLayout({ config, sceneKey, modifiers, connection, connect });
      customVariableManager.addCustomVariable(stateVariable, nextState, 0);
      const shown = summary.steps.filter((step) => step.visible).length;

      logger.info(
        `OBS Layout: scene "${sceneKey}"${modifiers.length ? ` with ${modifiers.join(', ')}` : ''}, ${String(shown)} items shown, ${String(summary.steps.length - shown)} hidden, ${String(summary.requests.length)} requests in ${String(summary.durationMs)} ms.`,
      );
      for (const { canvas, skipped } of summary.canvases) {
        if (skipped) logger.warn(`OBS Layout: left the "${canvas}" canvas as it is: ${skipped}.`);
      }
      for (const result of summary.failed) {
        logger.warn(
          `OBS Layout: ${result.requestType} failed: ${String(result.requestStatus.code)} ${result.requestStatus.comment ?? ''}`.trimEnd(),
        );
      }

      return summary.failed.length
        ? failure(
            `${String(summary.failed.length)} of ${String(summary.requests.length)} OBS requests failed, see the log.`,
          )
        : { success: true };
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  };
