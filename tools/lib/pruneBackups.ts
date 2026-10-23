// Deleting the tools' old backups, the step behind `obs:prune` and `firebot:prune`. Every file the tools replace is
// backed up next to it first, and nothing else ever removes those copies.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { staleBackups } from '@/lib/backups';

import { confirm } from './environment';

export interface PruneOptions {
  /** How many of each file's newest backups to keep. */
  keep: number;
  dryRun: boolean;
  /** Delete without asking. */
  yes: boolean;
}

/** Read `--keep`: a whole number of backups, 0 or more, default 3. */
export const parseKeep = (value: string | undefined) => {
  const keep = Number(value ?? '3');
  if (!Number.isInteger(keep) || keep < 0)
    throw new Error(`--keep takes a whole number, 0 or more, not "${String(value)}"`);
  return keep;
};

/**
 * Delete each file's backups beyond its newest few, after listing them and asking. Only backups the tools made of
 * those files are touched; deleted files skip the recycle bin, so they are gone for good.
 *
 * @param files - The files whose backups to prune, as paths.
 */
export const pruneBackups = async (files: readonly string[], { keep, dryRun, yes }: PruneOptions) => {
  const stale = files.flatMap((file) => {
    const dir = dirname(file);
    return existsSync(dir) ? staleBackups(basename(file), readdirSync(dir), keep).map((name) => join(dir, name)) : [];
  });
  if (!stale.length) {
    console.log(`nothing to prune: no file has more than ${String(keep)} backups`);
    return;
  }

  const bytes = stale.reduce((total, path) => total + statSync(path).size, 0);
  for (const path of stale) console.log(`${dryRun ? 'WOULD DELETE' : 'DELETE'}  ${path}`);
  const summary = `${String(stale.length)} backups, ${(bytes / 1024 / 1024).toFixed(1)} MB, keeping the newest ${String(keep)} of each file`;
  if (dryRun) {
    console.log(`dry run: would delete ${summary}`);
    return;
  }
  if (!(await confirm(`Delete these ${summary}? They do not go to the recycle bin.`, yes))) {
    console.log('nothing deleted');
    return;
  }
  for (const path of stale) rmSync(path);
  console.log(`deleted ${summary}`);
};
