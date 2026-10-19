import type { FirebotRunRequest, FirebotRunResult } from '@/types/FirebotRunRequest';

import { version } from '#package.json';
import { DEFAULT_CONFIG_VARIABLE } from '@/constants/filterNames';
import { assertConfig } from '@/lib/assertConfig';
import { connectObs, type ConnectObs } from '@/lib/connectObs';
import { readFirebotIntegrations } from '@/lib/readFirebotIntegrations';
import { resolveObsConnection } from '@/lib/resolveObsConnection';
import { runLayout } from '@/lib/runLayout';

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
    secondaryDescription: 'Key under "scenes" in the layout config to apply, for example "[Scene] 16:9 1P".',
  },
  configVariable: {
    type: 'string',
    default: DEFAULT_CONFIG_VARIABLE,
    description: 'Config variable',
    secondaryDescription: 'Name of the custom variable that holds the layout config object.',
  },
});

export interface CreateRunOptions {
  /** Firebot profile folder, where `integrations.json` holds the OBS connection settings. */
  profileDir: string;
  connect?: ConnectObs;
  readIntegrations?: (profileDir: string) => string | undefined;
}

const failure = (message: string): FirebotRunResult => ({ success: false, errorMessage: `OBS Layout: ${message}` });

/** Build Firebot's `run` entry point: read the config variable, apply the scene key, report to Firebot's log. */
export const createRun =
  ({ profileDir, connect = connectObs, readIntegrations = readFirebotIntegrations }: CreateRunOptions) =>
  async (runRequest: FirebotRunRequest): Promise<FirebotRunResult> => {
    const { logger, customVariableManager } = runRequest.modules;
    const sceneKey = runRequest.parameters.sceneKey?.trim() ?? '';
    const requestedVariable = runRequest.parameters.configVariable?.trim();
    const configVariable =
      requestedVariable === undefined || requestedVariable === '' ? DEFAULT_CONFIG_VARIABLE : requestedVariable;

    if (!sceneKey) return failure('the sceneKey parameter is empty.');

    try {
      const rawConfig = customVariableManager.getCustomVariable(configVariable);
      const config: unknown = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
      assertConfig(config);

      const connection = resolveObsConnection(config, readIntegrations(profileDir));
      const summary = await runLayout({ config, sceneKey, connection, connect });
      const shown = summary.steps.filter((step) => step.visible).length;

      logger.info(
        `OBS Layout: scene "${sceneKey}", ${String(shown)} items shown, ${String(summary.steps.length - shown)} hidden, ${String(summary.requests.length)} requests in ${String(summary.durationMs)} ms.`,
      );
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
