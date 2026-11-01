import { describe, expect, it } from 'vitest';
import { fromCloud, limited, toCloud } from '../src/data/firebase';
import type { RemoteDoc } from '../src/data/sync';
import { readConfig } from '../src/syncClient';

describe('readConfig', () => {
  const full = { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' };

  it('keeps only the fields the app needs', () => {
    const raw = JSON.stringify({ ...full, measurementId: 'G-1', storageBucket: 'b' });
    expect(readConfig(raw)).toEqual(full);
  });

  it('leaves sync off when the config is missing or broken', () => {
    expect(readConfig(undefined)).toBeUndefined();
    expect(readConfig('')).toBeUndefined();
    expect(readConfig('not json')).toBeUndefined();
    expect(readConfig(JSON.stringify({ apiKey: 'k' }))).toBeUndefined();
  });
});

describe('limited', () => {
  it('gives up on work that never finishes', async () => {
    await expect(limited(new Promise(() => undefined), 5)).rejects.toThrow('同步逾時');
  });

  it('passes through results', async () => {
    await expect(limited(Promise.resolve(1), 5)).resolves.toBe(1);
  });
});

describe('cloud documents', () => {
  it('keeps photo bytes outside the data map and restores them', () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const doc: RemoteDoc = {
      table: 'photos',
      id: 'g',
      updatedAt: 5,
      device: 'd',
      data: { gearId: 'g', type: 'image/jpeg', updatedAt: 5, bytes },
    };
    const cloud = toCloud(doc) as unknown as Record<string, unknown>;
    expect(Object.keys(cloud.data as object)).not.toContain('bytes');
    const back = fromCloud('photos', 'g', cloud);
    expect(new Uint8Array(back.data?.bytes as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('writes tombstones with a null payload', () => {
    const doc: RemoteDoc = { table: 'gear', id: 'g', data: null, updatedAt: 5, device: 'd' };
    expect(toCloud(doc).data).toBeNull();
    expect(fromCloud('gear', 'g', { data: null, updatedAt: 5, device: 'd' }).data).toBeNull();
  });
});
