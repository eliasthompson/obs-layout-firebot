export interface FirebotLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/** The parts of Firebot's custom script `runRequest` this script uses. */
export interface FirebotRunRequest {
  parameters: {
    /** Scene key to apply, with the active modifiers. */
    sceneKey?: string;
    configVariable?: string;
    /** Modifier to switch, then the last scene is applied again; `*` for every modifier. */
    modifier?: string;
    /** `on` or `off`, for a modifier. */
    modifierState?: string;
  };
  modules: {
    customVariableManager: {
      getCustomVariable: (name: string) => unknown;
      /** Set a custom variable; a `ttl` of 0 keeps it until it is set again, and persistent variables survive restarts. */
      addCustomVariable: (name: string, data: unknown, ttl?: number, propertyPath?: string) => void;
    };
    logger: FirebotLogger;
  };
}

export interface FirebotRunResult {
  success: boolean;
  errorMessage?: string;
}
