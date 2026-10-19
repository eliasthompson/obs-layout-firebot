/** Firebot settings the script needs: custom scripts allowed, and the config variable kept across restarts. */
export const REQUIRED_FIREBOT_SETTINGS = Object.freeze(['runCustomScripts', 'persistCustomVariables'] as const);

/** A profile's `settings.json`. */
export interface FirebotSettingsFile {
  settings?: Record<string, unknown>;
}

/** The settings file with every required setting turned on, and the names of the ones that were not. */
export const enableScriptSettings = (file: FirebotSettingsFile) => {
  const changed = REQUIRED_FIREBOT_SETTINGS.filter((name) => file.settings?.[name] !== true);

  return {
    file: { ...file, settings: { ...file.settings, ...Object.fromEntries(changed.map((name) => [name, true])) } },
    changed,
  };
};
