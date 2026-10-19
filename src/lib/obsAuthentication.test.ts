import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { authenticationResponse, sha256Base64 } from '@/lib/obsAuthentication';

describe('sha256Base64', () => {
  it('hashes text to base64', () => {
    expect(sha256Base64('abc')).toBe(createHash('sha256').update('abc').digest('base64'));
  });
});

describe('authenticationResponse', () => {
  it('hashes the password with the salt, then with the challenge, as obs-websocket requires', () => {
    const secret = sha256Base64('pw' + 'salt');

    expect(authenticationResponse('pw', 'salt', 'challenge')).toBe(sha256Base64(secret + 'challenge'));
  });
});
