/** A backup's time: the ISO time with `:` and `.` as `-`, which every file system takes and which sorts by time. */
const BACKUP_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

/**
 * The name of the backup the tools make of a file before replacing it: the file, the time, and `.bak`, next to it.
 *
 * @param file - The file's name or path.
 * @param date - When it is backed up.
 * @returns The backup's name or path.
 */
export const backupName = (file: string, date: Date) => `${file}.${date.toISOString().replace(/[:.]/g, '-')}.bak`;

/**
 * Of a folder's file names, the tools' backups of one file beyond the newest `keep`, oldest first. Only names
 * `backupName` makes count, so a program's own backups, such as OBS's `<collection>.json.bak`, and anything else in
 * the folder are never among them.
 *
 * @param fileName - The backed-up file's name.
 * @param names - The names in its folder.
 * @param keep - How many of the newest backups to keep.
 * @returns The names of the backups to delete.
 */
export const staleBackups = (fileName: string, names: readonly string[], keep: number): string[] => {
  const prefix = `${fileName}.`;
  const backups = names
    .filter(
      (name) =>
        name.startsWith(prefix) && name.endsWith('.bak') && BACKUP_TIME.test(name.slice(prefix.length, -'.bak'.length)),
    )
    .sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
};
