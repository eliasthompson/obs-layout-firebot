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
  /** The width each border's `Move: Width` filter last moved it to, by border source name. */
  borderWidths: Record<string, number>;
}
