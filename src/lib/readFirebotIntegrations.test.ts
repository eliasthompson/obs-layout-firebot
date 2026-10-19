import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readFirebotIntegrations } from '@/lib/readFirebotIntegrations';

let profileDir: string;

beforeEach(() => {
  profileDir = mkdtempSync(join(tmpdir(), 'firebot-profile-'));
});
afterEach(() => {
  rmSync(profileDir, { recursive: true, force: true });
});

describe('readFirebotIntegrations', () => {
  it('reads the profile integrations file', () => {
    writeFileSync(join(profileDir, 'integrations.json'), '{"OBS":{}}');

    expect(readFirebotIntegrations(profileDir)).toBe('{"OBS":{}}');
  });

  it('returns undefined when there is no file', () => {
    expect(readFirebotIntegrations(profileDir)).toBeUndefined();
  });
});
