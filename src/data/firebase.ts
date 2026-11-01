import { initializeApp } from 'firebase/app';
import {
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  Bytes,
  collection,
  doc,
  getDocsFromServer,
  initializeFirestore,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { SYNC_TABLES } from './db';
import type { SyncTable } from './db';
import type { FirebaseConfig } from '../syncClient';
import type { Remote, RemoteDoc } from './sync';

/** Commit times can lag slightly behind the clock, so each pull re-reads a short window. */
const OVERLAP_MS = 60_000;

const TIMEOUT_MS = 45_000;

/**
 * Firestore waits quietly for a connection instead of failing, which would freeze sync on weak
 * signal. The server-only reads above also matter: a cached reply could look like an empty cloud.
 */
export function limited<T>(work: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('同步逾時')), ms);
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

/** Firestore refuses undefined, and optional fields are often undefined. */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

export function toCloud(d: RemoteDoc) {
  const base = { updatedAt: d.updatedAt, device: d.device ?? '', syncedAt: serverTimestamp() };
  if (!d.data) return { ...base, data: null };
  if (d.table !== 'photos') return { ...base, data: plain(d.data) };
  const { bytes, ...rest } = d.data;
  return { ...base, data: plain(rest), bytes: Bytes.fromUint8Array(new Uint8Array(bytes as ArrayBuffer)) };
}

export function fromCloud(table: SyncTable, id: string, raw: Record<string, unknown>): RemoteDoc {
  const data = raw.data as Record<string, unknown> | null;
  const bytes = raw.bytes as Bytes | undefined;
  return {
    table,
    id,
    updatedAt: raw.updatedAt as number,
    device: raw.device as string,
    data: data && bytes ? { ...data, bytes: bytes.toUint8Array().slice().buffer } : data,
  };
}

export function remoteFor(store: Firestore, uid: string): Remote {
  const col = (table: SyncTable) => collection(store, 'users', uid, table);
  return {
    uid,
    async isEmpty() {
      const found = await Promise.all(
        (['gear', 'orders', 'trips'] as const).map((t) =>
          limited(getDocsFromServer(query(col(t), where('data', '!=', null), limit(1)))),
        ),
      );
      return found.every((snap) => snap.empty);
    },
    async pull(since) {
      const from = Timestamp.fromMillis(Math.max(0, since - OVERLAP_MS));
      const snaps = await Promise.all(
        SYNC_TABLES.map(async (t) => ({
          table: t,
          snap: await limited(getDocsFromServer(query(col(t), where('syncedAt', '>', from)))),
        })),
      );
      let cursor = since;
      const docs: RemoteDoc[] = [];
      for (const { table, snap } of snaps) {
        for (const item of snap.docs) {
          const raw = item.data();
          docs.push(fromCloud(table, item.id, raw));
          cursor = Math.max(cursor, (raw.syncedAt as Timestamp).toMillis());
        }
      }
      return { docs, cursor };
    },
    async push(docs) {
      const batch = writeBatch(store);
      for (const d of docs) batch.set(doc(col(d.table), d.id), toCloud(d));
      await limited(batch.commit());
    },
  };
}

export function connect(config: FirebaseConfig) {
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const store = initializeFirestore(app, {});
  return {
    watch: (listener: (user: User | null) => void) => onAuthStateChanged(auth, listener),
    signIn: (email: string, password: string) => signInWithEmailAndPassword(auth, email, password),
    signOut: () => signOut(auth),
    remote: (uid: string) => remoteFor(store, uid),
  };
}
