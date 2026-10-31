import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { trackDeletes, trackReads, trackWrites, setQuotaFlushHandler } from '../quota';
import type { Store, StoreQuery, StoreTx, Where } from './types';

type Doc = Record<string, unknown> & { id: string };

const MAX_PAGE = 1000;

function buildApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, '\n'),
      }),
    });
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_PROJECT_ID) {
    return initializeApp({ credential: applicationDefault() });
  }
  throw new Error(
    'Kredensial Firebase Admin tidak ditemukan. Isi FIREBASE_SERVICE_ACCOUNT_JSON atau FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
  );
}

export class FirestoreStore implements Store {
  readonly mode = 'firebase' as const;
  private dbInstance: Firestore | null = null;

  private db(): Firestore {
    if (this.dbInstance) return this.dbInstance;
    buildApp();
    this.dbInstance = getFirestore();
    this.dbInstance.settings({ ignoreUndefinedProperties: true });
    setQuotaFlushHandler(async ({ date, reads, writes, deletes }) => {
      await this.db()
        .collection('quotaCounters')
        .doc(date)
        .set(
          {
            id: date,
            date,
            reads: FieldValue.increment(reads),
            writes: FieldValue.increment(writes),
            deletes: FieldValue.increment(deletes),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
    });
    return this.dbInstance;
  }

  private ref(collection: string, id: string) {
    return this.db().collection(collection).doc(id);
  }

  private applyWhere(query: Query, where: Where[]): Query {
    let q = query;
    for (const w of where) {
      q = q.where(w.field, w.op as never, w.value as never);
    }
    return q;
  }

  private async runQuery<T extends Doc>(collection: string, q: StoreQuery): Promise<T[]> {
    const base = this.db().collection(collection);
    let query: Query = base;
    query = this.applyWhere(query, q.where ?? []);
    const limit = q.limit ?? 1000;
    const offset = q.offset ?? 0;

    if (q.search) {
      const s = q.search.toLowerCase();
      query = query
        .where('searchKey', '>=', s)
        .where('searchKey', '<=', `${s}\uf8ff`)
        .orderBy('searchKey');
    } else if (q.orderBy?.length) {
      for (const o of q.orderBy) query = query.orderBy(o.field, o.dir);
    }

    if (offset) query = query.offset(offset);

    const out: T[] = [];
    let cursor: unknown = null;
    while (out.length < limit) {
      const pageSize = Math.min(MAX_PAGE, limit - out.length);
      let pageQuery = query.limit(pageSize);
      // orderBy wajib ada untuk startAfter; tambahkan default createdAt.
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const snap = await pageQuery.get();
      trackReads(snap.size + 1);
      for (const doc of snap.docs) out.push({ ...(doc.data() as T), id: doc.id });
      if (snap.size < pageSize) break;
      cursor = snap.docs[snap.docs.length - 1];
      if (!q.orderBy?.length && !q.search) break;
    }
    return out;
  }

  async getDoc<T extends Doc>(collection: string, id: string): Promise<T | null> {
    const snap = await this.ref(collection, id).get();
    trackReads(1);
    if (!snap.exists) return null;
    return { ...(snap.data() as T), id: snap.id };
  }

  async query<T extends Doc>(collection: string, q: StoreQuery): Promise<T[]> {
    const rows = await this.runQuery<T>(collection, q);
    if (q.search && q.orderBy?.length) return sortRows(rows, q.orderBy);
    return rows;
  }

  async count(collection: string, q: StoreQuery = {}): Promise<number> {
    let query: Query = this.db().collection(collection);
    query = this.applyWhere(query, q.where ?? []);
    if (q.search) {
      const s = q.search.toLowerCase();
      query = query.where('searchKey', '>=', s).where('searchKey', '<=', `${s}\uf8ff`);
    }
    const snap = await query.count().get();
    trackReads(1);
    return snap.data().count;
  }

  async set<T extends Doc>(collection: string, id: string, doc: T): Promise<void> {
    await this.ref(collection, id).set({ ...doc, id });
    trackWrites(1);
  }

  async create<T extends Doc>(collection: string, id: string, doc: T): Promise<T> {
    return this.transaction(async (tx) => {
      const existing = await tx.getDoc<T>(collection, id);
      if (existing) throw new Error(`DUPLICATE:${collection}/${id}`);
      await tx.set(collection, id, doc);
      return doc;
    });
  }

  async update<T extends Doc>(collection: string, id: string, patch: Partial<T>): Promise<T> {
    await this.ref(collection, id).set(patch as Record<string, unknown>, { merge: true });
    trackWrites(1);
    const next = await this.getDoc<T>(collection, id);
    if (!next) throw new Error(`NOT_FOUND:${collection}/${id}`);
    return next;
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.ref(collection, id).delete();
    trackDeletes(1);
  }

  async batch(fn: (tx: StoreTx) => Promise<void>): Promise<void> {
    await this.transaction(fn);
  }

  async transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    const result = await this.db().runTransaction(async (t) => {
      const wrapper: StoreTx = {
        getDoc: async <D extends Doc>(c: string, id: string) => {
          const snap = await t.get(this.ref(c, id));
          trackReads(1);
          return snap.exists ? ({ ...(snap.data() as D), id: snap.id } as D) : null;
        },
        query: async <D extends Doc>(c: string, q: StoreQuery) => {
          let query: Query = this.db().collection(c);
          query = this.applyWhere(query, q.where ?? []);
          if (q.search) {
            const s = q.search.toLowerCase();
            query = query
              .where('searchKey', '>=', s)
              .where('searchKey', '<=', `${s}\uf8ff`);
          }
          if (q.orderBy?.length) for (const o of q.orderBy) query = query.orderBy(o.field, o.dir);
          const snap = await t.get(query.limit(q.limit ?? 500));
          trackReads(snap.size + 1);
          return snap.docs.map((d) => ({ ...(d.data() as D), id: d.id }));
        },
        set: async <D extends Doc>(c: string, id: string, doc: D) => {
          t.set(this.ref(c, id), { ...doc, id });
          trackWrites(1);
        },
        update: async <D extends Doc>(c: string, id: string, patch: Partial<D>) => {
          t.set(this.ref(c, id), patch as Record<string, unknown>, { merge: true });
          trackWrites(1);
        },
        remove: async (c: string, id: string) => {
          t.delete(this.ref(c, id));
          trackDeletes(1);
        },
      };
      return fn(wrapper);
    });
    return result;
  }
}


function sortRows<T extends Doc>(rows: T[], orderBy: { field: string; dir: 'asc' | 'desc' }[]): T[] {
  return [...rows].sort((a, b) => {
    for (const o of orderBy) {
      const av = a[o.field] as string | number;
      const bv = b[o.field] as string | number;
      if (av === bv) continue;
      const cmp = (av ?? '') > (bv ?? '') ? 1 : -1;
      return o.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}
