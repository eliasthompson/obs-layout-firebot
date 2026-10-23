// Deletes the backups `firebot:deploy` and `firebot:restart` made of the Firebot profile files they replace (the
// script, the presets, and the settings), beyond the newest few of each (3 unless --keep says otherwise), after listing
// them and asking. This is destructive: deleted files skip the recycle bin, so an older script, preset list, or
// settings file is gone for good once its backup is. Only the tools' own timestamped backups of those three files are
// touched; the files themselves, Firebot's own backups, and every other file stay. --dry-run lists what it would
// delete.
//
//   obs-layout-firebot firebot:prune [--keep 3] [--config config/scenes.ts] [--profile-dir <Firebot profile folder>]
//     [--yes] [--dry-run]
import { parseArgs } from 'node:util';

import { firebotProfileDir, firebotProfileFiles, loadOptionalConfig } from '../lib/environment';
import { parseKeep, pruneBackups } from '../lib/pruneBackups';

export const firebotPrune = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      keep: { type: 'string' },
      'profile-dir': { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });
  const profileDir = firebotProfileDir(await loadOptionalConfig(values.config), values['profile-dir']);

  await pruneBackups(Object.values(firebotProfileFiles(profileDir)), {
    keep: parseKeep(values.keep),
    dryRun: values['dry-run'],
    yes: values.yes,
  });
};
