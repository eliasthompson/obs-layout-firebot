import { describe, expect, it } from 'vitest';

import { readObsLastUsed } from '@/lib/readObsLastUsed';

describe('readObsLastUsed', () => {
  it('reads the profile folder and collection file from the [Basic] section', () => {
    const text =
      '﻿[General]\r\nProfileDir=Elsewhere\r\n\r\n[Basic]\r\nProfile=Eliance 2026\r\nProfileDir=Eliance_2026\r\n' +
      'SceneCollection=Eliance 2026\r\nSceneCollectionFile=Eliance_2026.json\r\n\r\n[Other]\r\nProfileDir=Nope\r\n';

    expect(readObsLastUsed(text)).toEqual({ profileDir: 'Eliance_2026', sceneCollectionFile: 'Eliance_2026.json' });
  });

  it('leaves out what the file does not name, or names with no value', () => {
    expect(readObsLastUsed('[Basic]\nProfileDir=\nGeometry=x')).toEqual({});
    expect(readObsLastUsed('')).toEqual({});
  });
});
