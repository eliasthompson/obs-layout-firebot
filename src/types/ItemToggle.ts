/** An item scenes and modifiers toggle, as OBS knows it. */
export interface ItemBinding {
  /** Its key in the canvas's `items`, which scenes and modifiers name it by. */
  key: string;
  /** The OBS scene or group that holds the item. */
  scene: string;
  /** OBS source name of the item. */
  source: string;
  /** Whether it shows when neither the scene nor a modifier in effect says. */
  visible: boolean;
}

/** An item shown or hidden through its own show or hide transition. */
export interface ItemToggle {
  /** The OBS scene or group that holds the item. */
  scene: string;
  /** OBS source name of the item. */
  source: string;
  /** The item's id in `scene`, which SetSceneItemEnabled needs. */
  sceneItemId: number;
  visible: boolean;
}
