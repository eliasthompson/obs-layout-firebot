import type { Binding } from '@/types/MoveStep';
import type { Rect } from '@/types/Rect';
import type { OverlayBinding, ScenesConfig } from '@/types/ScenesConfig';

import { OBS_ALIGNMENT_FLAGS, STANDBY_TEXT_ALIGNMENT } from '@/constants/obsAlignment';

export interface Overlay {
  binding: Binding & { kind: 'text' | 'widget' };
  /** Where a widget sits while shown, from the first scene that uses it. A text is placed from its rendered size. */
  region?: Rect;
}

/**
 * Every standby text and widget any scene uses, once each, in the order scenes first use them. Texts are items of the
 * standby text scene and are left out while `standby` is not set; widgets are items of the container.
 */
export const listOverlays = (config: ScenesConfig): Overlay[] => {
  const overlays = new Map<string, Overlay>();
  const add = (
    scene: string,
    kind: Overlay['binding']['kind'],
    { source, region, boundsAlignment }: Partial<OverlayBinding> & Pick<OverlayBinding, 'source'>,
  ) => {
    if (overlays.has(source)) return;
    overlays.set(source, {
      binding: {
        scene,
        source,
        kind,
        ...(boundsAlignment ? { boundsAlignment: OBS_ALIGNMENT_FLAGS[boundsAlignment] } : {}),
      },
      ...(region ? { region } : {}),
    });
  };

  for (const { standby } of Object.values(config.scenes)) {
    if (standby?.text && config.standby) {
      add(config.standby.textScene, 'text', { source: standby.text, boundsAlignment: STANDBY_TEXT_ALIGNMENT });
    }
    for (const widget of standby?.widgets ?? []) add(config.container, 'widget', widget);
  }

  return [...overlays.values()];
};
