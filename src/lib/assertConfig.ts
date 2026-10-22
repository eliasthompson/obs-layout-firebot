import type { ScenesConfig } from '@/types/ScenesConfig';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Check the shape a layout config read from a Firebot variable or a file must have before it is used. */
export const assertConfig: (config: unknown) => asserts config is ScenesConfig = (config) => {
  if (!isObject(config)) throw new Error('layout config must be an object');
  if (!isObject(config.canvases)) {
    // A version 3 config has its container and participants at the top
    throw new Error(
      typeof config.container === 'string'
        ? 'config.canvases is missing: this is a version 3 config, so move its container, options, participants, and standby into a canvas under canvases'
        : 'config.canvases must be an object of canvases',
    );
  }
  const canvases = Object.entries(config.canvases);
  if (!canvases.length) throw new Error('config.canvases must have at least one canvas');
  for (const [key, canvas] of canvases) {
    if (!isObject(canvas)) throw new Error(`config.canvases.${key} must be an object`);
    if (canvas.canvas !== undefined && (typeof canvas.canvas !== 'string' || !canvas.canvas)) {
      throw new Error(`config.canvases.${key}.canvas must name an OBS canvas, or be left out for the main one`);
    }
    if (typeof canvas.container !== 'string' || !canvas.container) {
      throw new Error(`config.canvases.${key}.container must name the container scene`);
    }
    if (!isObject(canvas.participants)) throw new Error(`config.canvases.${key}.participants must be an object`);
  }
  if (!isObject(config.scenes)) throw new Error('config.scenes must be an object');
};
