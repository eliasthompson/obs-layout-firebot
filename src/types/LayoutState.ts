/**
 * What the script keeps between runs, in the Firebot variable named after the config variable with `State` added:
 * the scene last applied and the modifiers switched on. A layout preset applies its scene with these modifiers; a
 * modifier preset changes them and applies the scene again.
 */
export interface LayoutState {
  /** Key of the scene last applied, standby scenes included; missing until a scene preset has run. */
  sceneKey?: string;
  /** Names of the modifiers switched on, in the order they were switched on. */
  modifiers: string[];
}
