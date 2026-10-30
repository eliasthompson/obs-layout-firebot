/** Setting names that hold a secret: a stream or API key, a password, a client secret, an auth token. */
const SECRET_SETTING = /(key|password|passwd|secret|token)$/iu;

/** A JSON string token, escapes included, and the colon after it when it is an object key. */
const JSON_STRING = /"(?:[^"\\]|\\.)*"(\s*:\s*)?/gu;

/** An INI line: a `[section]` header, or a `name=value` setting. */
const INI_SECTION = /^\s*\[(.*)\]\s*$/u;
const INI_SETTING = /^([^=;#[\s][^=]*)=(.*)$/u;

export interface BlankedText {
  text: string;
  /** Each secret setting that had a value, as its name, or `[section] name` in an INI file. */
  blanked: string[];
}

/** Whether a setting's name marks its value as a secret, such as `key`, `stream_key`, or `RefreshToken`. */
export const isSecretSetting = (name: string) => SECRET_SETTING.test(name);

/**
 * Blank the values of secret settings in JSON text, such as the stream key in OBS's `service.json`, leaving every
 * other character as it is, so the file keeps its formatting and a value too large for a JavaScript number keeps its
 * digits. Only string values are blanked; an empty one is left alone.
 *
 * @param text - The JSON text.
 * @returns The text with each secret value replaced by `""`, and the names of the settings blanked.
 */
export const blankJsonSecrets = (text: string): BlankedText => {
  const blanked: string[] = [];
  // A key's value starts right where the key's colon and the space after it end
  let key: string | undefined;
  let valueStart = -1;
  const blankedText = text.replace(JSON_STRING, (token: string, colon: string | undefined, offset: number) => {
    if (colon !== undefined) {
      key = JSON.parse(token.slice(0, token.length - colon.length)) as string;
      valueStart = offset + token.length;
      return token;
    }
    if (offset !== valueStart || key === undefined || !isSecretSetting(key) || token === '""') return token;
    blanked.push(key);
    return '""';
  });
  return { text: blankedText, blanked };
};

/**
 * Blank the values of secret settings in INI text, such as the account tokens in an OBS profile's `basic.ini`,
 * leaving every other line, and the line endings, as they are.
 *
 * @param text - The INI text.
 * @returns The text with each secret setting left with no value, and the settings blanked, as `[section] name`.
 */
export const blankIniSecrets = (text: string): BlankedText => {
  const blanked: string[] = [];
  let section = '';
  const blankedText = text
    .split(/(\r?\n)/u)
    .map((line) => {
      const header = INI_SECTION.exec(line);
      if (header) {
        section = header[1];
        return line;
      }
      const setting = INI_SETTING.exec(line);
      if (!setting || !isSecretSetting(setting[1].trim()) || !setting[2].trim()) return line;
      blanked.push(`[${section}] ${setting[1].trim()}`);
      return `${setting[1]}=`;
    })
    .join('');
  return { text: blankedText, blanked };
};
