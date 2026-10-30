export interface ObsLastUsed {
  /** The folder, under OBS's `profiles` folder, of the profile OBS last had loaded. */
  profileDir?: string;
  /** The file, under OBS's `scenes` folder, of the scene collection OBS last had loaded. */
  sceneCollectionFile?: string;
}

/**
 * Read which profile and scene collection OBS last had loaded, and loads again on its next start, from the `[Basic]`
 * section of its `user.ini` (OBS 31 and later) or `global.ini` (earlier).
 *
 * @param text - The INI file's text.
 * @returns The profile folder and the collection file, each left out when the file does not name it.
 */
export const readObsLastUsed = (text: string): ObsLastUsed => {
  const lastUsed: ObsLastUsed = {};
  let section = '';
  for (const line of text.split(/\r?\n/u)) {
    const header = /^\s*\[(.*)\]\s*$/u.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const setting = /^([^=]+)=(.+)$/u.exec(line);
    if (section !== 'Basic' || !setting) continue;
    if (setting[1] === 'ProfileDir') lastUsed.profileDir = setting[2];
    if (setting[1] === 'SceneCollectionFile') lastUsed.sceneCollectionFile = setting[2];
  }
  return lastUsed;
};
