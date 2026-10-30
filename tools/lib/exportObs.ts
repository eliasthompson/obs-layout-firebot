// Exporting OBS's setup into a project, the step behind `obs:export`: the scene collection file and the profile's
// settings files, copied into a folder laid out like OBS's own `basic` folder, so restoring is copying them back.
// Secret values are blanked on the way, so the export can be committed: the stream key in `service.json`, the account
// tokens in `basic.ini`, and any other setting named like a key, token, password, or secret. Everything else is copied
// character for character, so exporting an unchanged setup changes nothing.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

import { blankIniSecrets, blankJsonSecrets } from '@/lib/blankSecrets';

export interface ExportObsOptions {
  /** The scene collection file. */
  collectionPath: string;
  /** The profile folder. */
  profileDir: string;
  /** The folder to export into. */
  exportDir: string;
  dryRun: boolean;
}

/** Profile files worth keeping: its settings, as JSON or INI. Backups and anything else stay behind. */
const isProfileSettingsFile = (file: string) => ['.ini', '.json'].includes(extname(file));

/** A file's text with its secrets blanked, by the file's kind. */
const blankSecrets = (path: string) => {
  const text = readFileSync(path, 'utf8');
  return extname(path) === '.ini' ? blankIniSecrets(text) : blankJsonSecrets(text);
};

/**
 * Export the scene collection and the profile, writing only the files whose content changed, and removing exported
 * profile files the profile no longer has. Reports each file, and each secret blanked, by name only.
 */
export const exportObs = ({ collectionPath, profileDir, exportDir, dryRun }: ExportObsOptions) => {
  if (!existsSync(collectionPath)) throw new Error(`no scene collection file at ${collectionPath}`);
  if (!existsSync(profileDir)) throw new Error(`no profile folder at ${profileDir}`);

  const profileExportDir = join(exportDir, 'profiles', basename(profileDir));
  const profileFiles = readdirSync(profileDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isProfileSettingsFile(entry.name))
    .map((entry) => entry.name);
  const exports = [
    { from: collectionPath, to: join(exportDir, 'scenes', basename(collectionPath)) },
    ...profileFiles.map((file) => ({ from: join(profileDir, file), to: join(profileExportDir, file) })),
  ];
  const verb = dryRun ? 'would ' : '';
  let written = 0;

  for (const { from, to } of exports) {
    const { text, blanked } = blankSecrets(from);
    if (existsSync(to) && readFileSync(to, 'utf8') === text) continue;
    written += 1;
    const blanks = blanked.length ? `, blanking ${blanked.join(', ')}` : '';
    console.log(`${verb}write ${relative(process.cwd(), to)}${blanks}`);
    if (!dryRun) {
      mkdirSync(join(to, '..'), { recursive: true });
      writeFileSync(to, text);
    }
  }

  // An exported profile file the profile no longer has would restore a setting OBS dropped
  const stale = existsSync(profileExportDir)
    ? readdirSync(profileExportDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !profileFiles.includes(entry.name))
        .map((entry) => join(profileExportDir, entry.name))
    : [];
  for (const file of stale) {
    console.log(`${verb}remove ${relative(process.cwd(), file)}, which the profile no longer has`);
    if (!dryRun) rmSync(file);
  }

  const counts = `${String(written)} files ${dryRun ? 'would be ' : ''}written, ${String(stale.length)} removed`;
  console.log(!written && !stale.length ? 'the export is up to date' : `${dryRun ? 'dry run: ' : ''}${counts}`);
};
