import { describe, expect, it } from 'vitest';

import { enableScriptSettings } from '@/lib/enableScriptSettings';

describe('enableScriptSettings', () => {
  it('turns on the settings that are off or missing and keeps the rest', () => {
    const { file, changed } = enableScriptSettings({ settings: { runCustomScripts: false, theme: 'dark' } });

    expect(file).toEqual({ settings: { runCustomScripts: true, persistCustomVariables: true, theme: 'dark' } });
    expect(changed).toEqual(['runCustomScripts', 'persistCustomVariables']);
  });

  it('changes nothing when both are on', () => {
    const input = { settings: { runCustomScripts: true, persistCustomVariables: true } };

    expect(enableScriptSettings(input)).toEqual({ file: input, changed: [] });
  });

  it('creates the settings object of an empty file', () => {
    expect(enableScriptSettings({}).file).toEqual({
      settings: { runCustomScripts: true, persistCustomVariables: true },
    });
  });
});
