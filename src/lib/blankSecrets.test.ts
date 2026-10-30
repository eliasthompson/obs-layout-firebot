import { describe, expect, it } from 'vitest';

import { blankIniSecrets, blankJsonSecrets, isSecretSetting } from '@/lib/blankSecrets';

describe('isSecretSetting', () => {
  it.each(['key', 'stream_key', 'apiKey', 'password', 'passwd', 'client_secret', 'Token', 'RefreshToken'])(
    'takes %s for a secret',
    (name) => {
      expect(isSecretSetting(name)).toBe(true);
    },
  );

  it.each(['keyint_sec', 'stream_key_link', 'key_color', 'service', 'server', 'Name'])(
    'takes %s for an ordinary setting',
    (name) => {
      expect(isSecretSetting(name)).toBe(false);
    },
  );
});

describe('blankJsonSecrets', () => {
  it('blanks a stream key and keeps the rest of the file as it was', () => {
    const text =
      '{"settings":{"service":"Twitch","key":"live_123","stream_key_link":"https://x"},"type":"rtmp_common"}';

    expect(blankJsonSecrets(text)).toEqual({
      text: '{"settings":{"service":"Twitch","key":"","stream_key_link":"https://x"},"type":"rtmp_common"}',
      blanked: ['key'],
    });
  });

  it('keeps indentation, numbers too large for JavaScript, and escaped quotes', () => {
    const text = '{\n    "id": 12345678901234567890,\n    "note": "a \\"key\\": \\"x\\"",\n    "token": "a\\"b"\n}';

    expect(blankJsonSecrets(text)).toEqual({
      text: '{\n    "id": 12345678901234567890,\n    "note": "a \\"key\\": \\"x\\"",\n    "token": ""\n}',
      blanked: ['token'],
    });
  });

  it('leaves secret settings that are empty or not strings, and strings that are not their values', () => {
    const text = '{"key":"","password":42,"tokens":["a"],"list":["key","value"],"apiKey":null,"keys":{"x":"y"}}';

    expect(blankJsonSecrets(text)).toEqual({ text, blanked: [] });
  });
});

describe('blankIniSecrets', () => {
  it('blanks secret settings by section and keeps the BOM, line endings, and every other line', () => {
    const text = '﻿[General]\r\nName=Eliance 2026\r\n\r\n[Auth]\r\nType=Twitch\r\nToken=abc\r\nRefreshToken = def\r\n';

    expect(blankIniSecrets(text)).toEqual({
      text: '﻿[General]\r\nName=Eliance 2026\r\n\r\n[Auth]\r\nType=Twitch\r\nToken=\r\nRefreshToken =\r\n',
      blanked: ['[Auth] Token', '[Auth] RefreshToken'],
    });
  });

  it('leaves empty secrets, comments, and settings before any section alone', () => {
    const text = 'Key=\n; Token=abc\nPassword=  \nOther=1';

    expect(blankIniSecrets(text)).toEqual({ text, blanked: [] });
  });

  it('names a secret before any section with an empty section', () => {
    expect(blankIniSecrets('Token=abc').blanked).toEqual(['[] Token']);
  });
});
