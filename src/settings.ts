// The package's portable entry, published as `@eliasthompson/obs-layout-firebot/settings`: the filter names, Move
// Transition values, settings builders, and config types that a program driving the same OBS installation needs,
// such as a browser source recoloring the borders. Nothing reachable from here may import a Node built-in, so it runs
// in a browser; `settings.test.ts` checks that.
export * from '@/constants/filterNames';
export * from '@/constants/moveTransition';
export * from '@/constants/obsAlignment';
export * from '@/lib/filterSettings';
export * from '@/lib/growRegion';
export * from '@/lib/moveFilterName';
export * from '@/lib/resolveBorderColor';
export * from '@/lib/resolveModifiers';
export * from '@/lib/resolveParticipantConfig';
export * from '@/lib/resolveRegionSettings';
export type * from '@/types/LayoutState';
export type * from '@/types/MoveStep';
export type * from '@/types/Rect';
export type * from '@/types/ScenesConfig';
