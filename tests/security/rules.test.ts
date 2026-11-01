import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { remoteFor } from '../../src/data/firebase';

// Runs only under the emulator: npm run test:rules
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const row = (over: Record<string, unknown> = {}) => ({
  data: { name: 'x' },
  updatedAt: 1,
  device: 'd',
  syncedAt: serverTimestamp(),
  ...over,
});

describe.runIf(emulator)('firestore rules', () => {
  let env: RulesTestEnvironment;
  const owner = () => env.authenticatedContext('owner').firestore();
  const stranger = () => env.authenticatedContext('stranger').firestore();
  const anonymous = () => env.unauthenticatedContext().firestore();

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-tackle-box',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterAll(() => env.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), 'users/owner/gear/a'), { ...row(), syncedAt: Timestamp.now() }),
    );
  });

  it('lets the owner read and write their own data', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'users/owner/gear/a')));
    await assertSucceeds(getDocs(collection(owner(), 'users/owner/gear')));
    await assertSucceeds(setDoc(doc(owner(), 'users/owner/gear/b'), row()));
    await assertSucceeds(setDoc(doc(owner(), 'users/owner/gear/a'), row({ data: null })));
  });

  it('accepts every sync table', async () => {
    for (const table of ['orders', 'stockLog', 'settings', 'trips']) {
      await assertSucceeds(setDoc(doc(owner(), `users/owner/${table}/x`), row()));
    }
    const bytes = Bytes.fromUint8Array(new Uint8Array(100));
    await assertSucceeds(setDoc(doc(owner(), 'users/owner/photos/x'), row({ bytes })));
  });

  it('keeps out signed-out visitors entirely', async () => {
    await assertFails(getDoc(doc(anonymous(), 'users/owner/gear/a')));
    await assertFails(getDocs(collection(anonymous(), 'users/owner/gear')));
    await assertFails(setDoc(doc(anonymous(), 'users/owner/gear/b'), row()));
  });

  it('keeps out another signed-in account', async () => {
    await assertFails(getDoc(doc(stranger(), 'users/owner/gear/a')));
    await assertFails(getDocs(collection(stranger(), 'users/owner/gear')));
    await assertFails(setDoc(doc(stranger(), 'users/owner/gear/a'), row()));
    await assertFails(updateDoc(doc(stranger(), 'users/owner/gear/a'), { updatedAt: 2 }));
  });

  it('never allows hard deletes, even for the owner', async () => {
    await assertFails(deleteDoc(doc(owner(), 'users/owner/gear/a')));
  });

  it('rejects tables outside the app', async () => {
    await assertFails(setDoc(doc(owner(), 'users/owner/secrets/x'), row()));
    await assertFails(getDoc(doc(owner(), 'users/owner/secrets/x')));
  });

  it('rejects anything outside a user folder', async () => {
    await assertFails(setDoc(doc(owner(), 'public/x'), row()));
    await assertFails(getDoc(doc(owner(), 'public/x')));
    await assertFails(setDoc(doc(owner(), 'users/owner'), row()));
    await assertFails(setDoc(doc(owner(), 'users/owner/gear/a/nested/x'), row()));
  });

  it('rejects malformed documents', async () => {
    const target = doc(owner(), 'users/owner/gear/c');
    await assertFails(setDoc(target, row({ extra: true })));
    await assertFails(setDoc(target, row({ updatedAt: 'now' })));
    await assertFails(setDoc(target, row({ data: 'text' })));
    await assertFails(setDoc(target, row({ syncedAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(target, { data: {}, updatedAt: 1 }));
  });

  it('allows binary only on photos, within the size limit', async () => {
    const small = Bytes.fromUint8Array(new Uint8Array(10));
    const large = Bytes.fromUint8Array(new Uint8Array(950 * 1024));
    await assertFails(setDoc(doc(owner(), 'users/owner/gear/c'), row({ bytes: small })));
    await assertFails(setDoc(doc(owner(), 'users/owner/photos/c'), row({ bytes: large })));
  });

  it('the real adapter uploads, downloads and tombstones through the rules', async () => {
    const remote = remoteFor(owner() as unknown as Firestore, 'owner');
    const bytes = new Uint8Array([9, 8, 7]).buffer;
    await env.clearFirestore();
    expect(await remote.isEmpty()).toBe(true);

    await remote.push([
      {
        table: 'gear',
        id: 'g1',
        data: { id: 'g1', spec: { weightG: 5 }, note: undefined },
        updatedAt: 10,
        device: 'a',
      },
      { table: 'orders', id: '3', data: { id: 3, item: 'i' }, updatedAt: 11, device: 'a' },
    ]);
    await remote.push([
      { table: 'photos', id: 'g1', data: { gearId: 'g1', type: 'image/jpeg', bytes }, updatedAt: 12, device: 'a' },
    ]);
    expect(await remote.isEmpty()).toBe(false);

    const first = await remote.pull(0);
    expect(first.docs.map((d) => `${d.table}/${d.id}`).sort()).toEqual(['gear/g1', 'orders/3', 'photos/g1']);
    expect(first.cursor).toBeGreaterThan(0);
    const photo = first.docs.find((d) => d.table === 'photos');
    expect(new Uint8Array(photo?.data?.bytes as ArrayBuffer)).toEqual(new Uint8Array([9, 8, 7]));

    await remote.push([{ table: 'gear', id: 'g1', data: null, updatedAt: 20, device: 'a' }]);
    await remote.push([{ table: 'orders', id: '3', data: null, updatedAt: 21, device: 'a' }]);
    expect(await remote.isEmpty()).toBe(true);
    const after = await remote.pull(0);
    expect(after.docs.find((d) => d.id === 'g1' && d.table === 'gear')?.data).toBeNull();
  });

  it('the adapter cannot read another account', async () => {
    const remote = remoteFor(stranger() as unknown as Firestore, 'owner');
    await expect(remote.pull(0)).rejects.toThrow();
    await expect(remote.push([{ table: 'gear', id: 'x', data: {}, updatedAt: 1 }])).rejects.toThrow();
  });
});
