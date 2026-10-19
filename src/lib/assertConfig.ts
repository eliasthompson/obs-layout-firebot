import type { ScenesConfig } from '@/types/ScenesConfig';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Check the shape a layout config read from a Firebot variable or a file must have before it is used. */
export const assertConfig: (config: unknown) => asserts config is ScenesConfig = (config) => {
  if (!isObject(config)) throw new Error('layout config must be an object');
  if (typeof config.container !== 'string' || !config.container) {
    throw new Error('config.container must name the container scene');
  }
  if (!isObject(config.participants)) throw new Error('config.participants must be an object');
  if (!isObject(config.scenes)) throw new Error('config.scenes must be an object');
};
