/** What a deploy reads back from OBS to check a config against, keyed by OBS names. */
export interface ObsInventory {
  /** Source names of the items of every scene. A scene missing here does not exist. */
  sceneItems: Record<string, string[]>;
  /** Filter names on every scene and input the config binds. */
  filters: Record<string, string[]>;
  /** Input kind of every input the config binds, such as `text_gdiplus_v3`. */
  inputKinds: Record<string, string>;
}

export interface ConfigProblem {
  severity: 'error' | 'warning';
  message: string;
}
