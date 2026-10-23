// Deletes the backups `obs:deploy` made of OBS's scene collection files, beyond the newest few of each (3 unless --keep
// says otherwise), after listing them and asking. This is destructive: deleted files skip the recycle bin, so an older
// version of a collection is gone for good once its backup is. Only the tools' own timestamped backups are touched;
// OBS's own `<collection>.json.bak`, the collections themselves, and every other file stay. It prunes every collection
// in OBS's folder, or only the file --collection (or OBS_SCENE_COLLECTION) names. --dry-run lists what it would delete.
//
//   obs-layout-firebot obs:prune [--keep 3] [--collection <file>] [--config config/scenes.ts] [--yes] [--dry-run]
import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { obsScenesDir } from '../lib/environment';
import { parseKeep, pruneBackups } from '../lib/pruneBackups';

export const obsPrune = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: {
      collection: { type: 'string' },
      // Taken like every command takes it, so project scripts can pass it; the backups do not depend on the config
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      keep: { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });
  const named = values.collection ?? process.env.OBS_SCENE_COLLECTION;
  const dir = obsScenesDir();
  const files =
    named !== undefined
      ? [named]
      : existsSync(dir)
        ? readdirSync(dir)
            .filter((file) => extname(file) === '.json')
            .map((file) => join(dir, file))
        : [];

  await pruneBackups(files, { keep: parseKeep(values.keep), dryRun: values['dry-run'], yes: values.yes });
};
