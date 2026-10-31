import path from 'node:path';
import { JsonStore } from './jsonStore';
import { FirestoreStore } from './firestoreStore';
import { buildDemoDatabase } from '../demoSeed';
import type { Store } from './types';

let storePromise: Promise<Store> | null = null;

export function dataDriver(): 'demo' | 'firebase' {
  const explicit = (process.env.NEOTEST_DATA_DRIVER ?? '').toLowerCase();
  if (explicit === 'demo' || explicit === 'firebase') return explicit;
  const hasCredentials =
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) ||
    Boolean(
      process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY,
    );
  return hasCredentials ? 'firebase' : 'demo';
}

export function demoStoreIsEphemeral(): boolean {
  return Boolean(process.env.VERCEL) && dataDriver() === 'demo';
}

function demoFilePath(): string {
  if (process.env.NEOTEST_DATA_FILE) return path.resolve(process.env.NEOTEST_DATA_FILE);
  if (process.env.VERCEL) return '/tmp/neotest-demo.json';
  return path.join(process.cwd(), '.data', 'neotest-demo.json');
}

export async function getStore(): Promise<Store> {
  if (!storePromise) {
    const driver = dataDriver();
    if (driver === 'firebase') {
      const firestore = new FirestoreStore();
      storePromise = Promise.resolve(firestore);
    } else {
      const store = new JsonStore(demoFilePath(), async () => buildDemoDatabase(), demoStoreIsEphemeral());
      storePromise = store.init().then(() => store);
    }
  }
  return storePromise;
}

/** Reset data demo (hanya berlaku pada driver demo). */
export async function resetDemoStore(): Promise<void> {
  const store = await getStore();
  if (store.mode !== 'demo') throw new Error('Reset demo hanya tersedia pada driver demo.');
  await (store as JsonStore).reset(async () => buildDemoDatabase());
}

/** Digunakan skrip dan pengujian. */
export function resetStoreForTests(): void {
  storePromise = null;
}

export type { Store } from './types';
