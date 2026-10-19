import type { ObsConnection, ScenesConfig } from '@/types/ScenesConfig';

import { DEFAULT_OBS_PASSWORD, DEFAULT_OBS_URL } from '@/constants/obsWebSocket';

interface FirebotIntegrations {
  OBS?: {
    userSettings?: {
      websocketSettings?: {
        ipAddress?: string;
        port?: number;
        password?: string;
      };
    };
  };
}

const parseIntegrations = (integrationsJson: string | undefined): Partial<ObsConnection> => {
  if (integrationsJson === undefined) return {};
  try {
    const settings = (JSON.parse(integrationsJson) as FirebotIntegrations).OBS?.userSettings?.websocketSettings;
    if (!settings) return {};
    return {
      url: `ws://${settings.ipAddress ?? 'localhost'}:${String(settings.port ?? 4455)}`,
      password: settings.password ?? DEFAULT_OBS_PASSWORD,
    };
  } catch {
    return {};
  }
};

/**
 * Where to reach OBS, field by field: the config's `obs` entry, then Firebot's own OBS integration settings (the
 * text of the profile's `integrations.json`), then obs-websocket's defaults of localhost:4455 with no password.
 */
export const resolveObsConnection = (
  config: Pick<ScenesConfig, 'obs'>,
  integrationsJson: string | undefined,
): ObsConnection => {
  const fromFirebot = parseIntegrations(integrationsJson);

  return {
    url: config.obs?.url ?? fromFirebot.url ?? DEFAULT_OBS_URL,
    password: config.obs?.password ?? fromFirebot.password ?? DEFAULT_OBS_PASSWORD,
  };
};
