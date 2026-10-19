// Entry of the bundle Firebot loads from <profile>/scripts/obs-layout.js. Firebot's legacy script loader calls
// getScriptManifest, getDefaultParameters, and run on the CommonJS exports.
import { join } from 'node:path';

import { createRun, getDefaultParameters, getScriptManifest } from '@/lib/firebotScript';

export { getDefaultParameters, getScriptManifest };

// The script sits in the profile's scripts folder, next to the profile's integrations.json
export const run = createRun({ profileDir: join(__dirname, '..') });
