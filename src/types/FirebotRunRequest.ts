export interface FirebotLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/** The parts of Firebot's custom script `runRequest` this script uses. */
export interface FirebotRunRequest {
  parameters: {
    sceneKey?: string;
    configVariable?: string;
  };
  modules: {
    customVariableManager: {
      getCustomVariable: (name: string) => unknown;
    };
    logger: FirebotLogger;
  };
}

export interface FirebotRunResult {
  success: boolean;
  errorMessage?: string;
}
