import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The text of a Firebot profile's `integrations.json`, or `undefined` when there is none. */
export const readFirebotIntegrations = (profileDir: string): string | undefined => {
  try {
    return readFileSync(join(profileDir, 'integrations.json'), 'utf8');
  } catch {
    return undefined;
  }
};
