import { MOVE_FILTER_PREFIX } from '@/constants/filterNames';

/** Name of the Move Source filter that drives a source, attached to the scene that contains the source. */
export const moveFilterName = (source: string) => `${MOVE_FILTER_PREFIX} ${source}`;
