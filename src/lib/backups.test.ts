import { describe, expect, it } from 'vitest';

import { backupName, staleBackups } from '@/lib/backups';

describe('backupName', () => {
  it('names a backup after the file and the time, safe for any file system', () => {
    expect(backupName('obs-layout.js', new Date('2026-10-23T05:54:00.510Z'))).toBe(
      'obs-layout.js.2026-10-23T05-54-00-510Z.bak',
    );
  });
});

describe('staleBackups', () => {
  const names = [
    'Eliance_2026.json',
    // OBS's own backup, an older naming, and a backup of another file are not the tools' backups of this one
    'Eliance_2026.json.bak',
    'Eliance_2026.json.20261018-014922.bak',
    'Untitled.json.2026-10-17T22-58-14-689Z.bak',
    'Eliance_2026.json.2026-10-23T06-34-57-497Z.bak',
    'Eliance_2026.json.2026-10-23T04-56-57-874Z.bak',
    'Eliance_2026.json.2026-10-23T05-53-53-779Z.bak',
    'Eliance_2026.json.2026-10-22T01-00-00-000Z.bak',
  ];

  it('picks the backups beyond the newest few, oldest first, and nothing else', () => {
    expect(staleBackups('Eliance_2026.json', names, 2)).toEqual([
      'Eliance_2026.json.2026-10-22T01-00-00-000Z.bak',
      'Eliance_2026.json.2026-10-23T04-56-57-874Z.bak',
    ]);
    expect(backupName('Eliance_2026.json', new Date('2026-10-22T01:00:00.000Z'))).toBe(
      'Eliance_2026.json.2026-10-22T01-00-00-000Z.bak',
    );
  });

  it('picks every backup when keeping none, and none when keeping as many as there are', () => {
    expect(staleBackups('Eliance_2026.json', names, 0)).toHaveLength(4);
    expect(staleBackups('Eliance_2026.json', names, 4)).toEqual([]);
    expect(staleBackups('Missing.json', names, 0)).toEqual([]);
  });
});
