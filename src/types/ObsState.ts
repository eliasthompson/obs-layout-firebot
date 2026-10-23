import type { SourceSize } from '@/types/MoveStep';

/** A scene item as GetSceneItemList reports it. */
export interface ObsSceneItem {
  sourceName: string;
  sceneItemId: number;
  sceneItemEnabled: boolean;
  /** The source's own size before any scaling, when OBS reports it. */
  sourceSize?: SourceSize;
}

/** What the script reads from OBS before planning, to know what the transition starts from. */
export interface ObsState {
  /** Items of every scene read, by scene name. A scene that could not be read is missing. */
  sceneItems: Record<string, ObsSceneItem[]>;
  /**
   * How thick across the standby line each border was last sized, by border source name: the width its `Move: Width`
   * filter last moved it to for an upright line, the height its `Move: Height` filter did for one across.
   */
  borderThickness: Record<string, number>;
  /** The current font size of every text source whose font is sized to its region, by source name. */
  fontSizes: Record<string, number>;
}
