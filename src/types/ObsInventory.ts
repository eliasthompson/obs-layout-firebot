/** What a deploy reads back from OBS to check a config against, keyed by OBS names. */
export interface ObsInventory {
  /** Source names of the items of every scene. A scene missing here does not exist. */
  sceneItems: Record<string, string[]>;
  /** Filter names on every scene and input the config binds. */
  filters: Record<string, string[]>;
  /** Input kind of every input the config binds, such as `text_gdiplus_v3`. */
  inputKinds: Record<string, string>;
  /** Bounds settings of the items of every scene, by scene, then source name. */
  itemBounds: Record<string, Record<string, ItemBounds>>;
}

/** A scene item's bounds settings, as its transform reports them. */
export interface ItemBounds {
  /** OBS bounds type, such as `OBS_BOUNDS_STRETCH`. */
  boundsType: string;
  /** Missing before obs-websocket 5.5 (OBS 30.2). */
  cropToBounds?: boolean;
}

export interface ConfigProblem {
  severity: 'error' | 'warning';
  message: string;
}
