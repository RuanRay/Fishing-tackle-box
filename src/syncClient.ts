import { signal } from '@preact/signals';
import { liveQuery } from 'dexie';
import { db } from './data/db';
import { syncNow, useCloudData, useLocalData } from './data/sync';
import type { Remote, SyncResult } from './data/sync';

export type SyncStatus = 'off' | 'signedOut' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error' | 'choose';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/** Only the fields sign-in and Firestore need; anything else in the config is dropped. */
export function readConfig(raw: unknown): FirebaseConfig | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const { apiKey, authDomain, projectId, appId } = JSON.parse(raw) as Partial<FirebaseConfig>;
    return apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : undefined;
  } catch {
    return undefined;
  }
}

const config = readConfig(import.meta.env.VITE_FIREBASE_CONFIG);
export const syncAvailable = !!config;

export const syncStatus = signal<SyncStatus>('off');
export const pendingCount = signal(0);
export const failedPhotos = signal(0);
export const accountEmail = signal<string | undefined>(undefined);

type Client = ReturnType<typeof import('./data/firebase').connect>;
let client: Client | undefined;
let remote: Remote | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

const SYNC_DELAY_MS = 2000;

function settle({ result, failed }: { result: SyncResult; failed: number }) {
  failedPhotos.value = failed;
  if (result === 'choose') syncStatus.value = 'choose';
  else syncStatus.value = failed ? 'error' : 'synced';
}

async function run() {
  if (!remote || syncStatus.value === 'choose') return;
  if (!navigator.onLine) {
    syncStatus.value = 'offline';
    return;
  }
  const current = remote;
  syncStatus.value = 'syncing';
  try {
    const outcome = await syncNow(current);
    if (remote === current) settle(outcome);
  } catch {
    if (remote === current) syncStatus.value = navigator.onLine ? 'error' : 'offline';
  }
}

export function requestSync(delay = SYNC_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => void run(), delay);
}

export async function startSync() {
  if (!config) return;
  syncStatus.value = 'signedOut';
  const { connect } = await import('./data/firebase');
  client = connect(config);
  client.watch((user) => {
    remote = user ? client?.remote(user.uid) : undefined;
    accountEmail.value = user?.email ?? undefined;
    if (user) requestSync(0);
    else syncStatus.value = 'signedOut';
  });
  liveQuery(() => db.outbox.count()).subscribe((count) => {
    pendingCount.value = count;
    if (!count || !remote) return;
    if (syncStatus.value === 'synced') syncStatus.value = 'pending';
    requestSync();
  });
  window.addEventListener('online', () => requestSync(0));
  window.addEventListener('offline', () => {
    if (remote) syncStatus.value = 'offline';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync(0);
  });
}

export const signIn = async (email: string, password: string) => {
  await client?.signIn(email, password);
};

export const signOut = async () => {
  await client?.signOut();
};

export async function resolveFirstSync(source: 'cloud' | 'device') {
  if (!remote) return;
  syncStatus.value = 'syncing';
  try {
    settle(await (source === 'cloud' ? useCloudData(remote) : useLocalData(remote)));
  } catch {
    syncStatus.value = 'error';
  }
}
