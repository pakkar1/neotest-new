import type { ZodTypeAny, z } from 'zod';
import type { ApiRequest } from './http';
import { errors } from './errors';
import { getStore } from './store';
import type { StoreQuery, Where } from './store/types';
import type { AuthContext } from './auth';
import { serverNowIso } from './clock';
import { newId, searchKeyOf } from './ids';
import type { Paginated } from '../../src/shared/types';

export interface ListOptions {
  collection: string;
  auth: AuthContext;
  schoolId?: string | null;
  where?: Where[];
  searchFields?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
  orderBy?: { field: string; dir: 'asc' | 'desc' }[];
  extraFilter?: (doc: Record<string, unknown>) => boolean;
  includeDeleted?: boolean;
}

const MAX_PAGE_SIZE = 100;
const MAX_SCAN = 2000;

/**
 * Daftar data dengan pagination. Query didorong ke database (schoolId,
 * searchKey berawalan, limit/offset) agar Hemat pembacaan Firestore.
 */
export async function listCollection<T extends { id: string }>(
  options: ListOptions,
): Promise<Paginated<T>> {
  const store = await getStore();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, options.pageSize ?? 20));
  const scopeWhere: Where[] = [...(options.where ?? [])];
  if (options.schoolId !== undefined && options.schoolId !== null) {
    scopeWhere.push({ field: 'schoolId', op: '==', value: options.schoolId });
  }
  if (!options.includeDeleted) {
    scopeWhere.push({ field: 'deletedAt', op: '==', value: null });
  }
  const search = options.search?.trim() ? searchKeyOf(options.search.trim()) : '';

  if (options.extraFilter) {
    const rows = await store.query<T>(options.collection, {
      where: scopeWhere,
      limit: MAX_SCAN,
    });
    const filtered = rows.filter((row) =>
      options.extraFilter!(row as unknown as Record<string, unknown>),
    );
    const searched = search
      ? filtered.filter((row) => {
          const key = String((row as Record<string, unknown>).searchKey ?? '');
          return key.includes(search);
        })
      : filtered;
    const sorted = sortRows(searched, options.orderBy);
    const total = sorted.length;
    return {
      items: sorted.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  const query: StoreQuery = {
    where: scopeWhere,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
  if (search) query.search = search;
  if (options.orderBy?.length) query.orderBy = options.orderBy;
  const [items, total] = await Promise.all([
    store.query<T>(options.collection, query),
    store.count(options.collection, { where: scopeWhere, ...(search ? { search } : {}) }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

function sortRows<T extends { id: string }>(
  rows: T[],
  orderBy?: { field: string; dir: 'asc' | 'desc' }[],
): T[] {
  const sorted = [...rows];
  if (!orderBy?.length) {
    sorted.sort((a, b) => (a.id < b.id ? -1 : 1));
    return sorted;
  }
  sorted.sort((a, b) => {
    for (const o of orderBy) {
      const av = (a as Record<string, unknown>)[o.field] as string | number;
      const bv = (b as Record<string, unknown>)[o.field] as string | number;
      if (av === bv) continue;
      const cmp = (av ?? '') > (bv ?? '') ? 1 : -1;
      return o.dir === 'asc' ? cmp : -cmp;
    }
    return a.id < b.id ? -1 : 1;
  });
  return sorted;
}

export function parsePage(req: ApiRequest): { page: number; pageSize: number } {
  const page = Number(req.query.page ?? '1');
  const pageSize = Number(req.query.pageSize ?? '20');
  return {
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 20,
  };
}

export async function getScopedDoc<T extends { id: string; schoolId?: string | null }>(
  collection: string,
  id: string,
  auth: AuthContext,
  options: { allowMissingSchool?: boolean } = {},
): Promise<T> {
  const store = await getStore();
  const doc = await store.getDoc<T>(collection, id);
  if (!doc) throw errors.notFound('Data tidak ditemukan.');
  const schoolId = (doc as { schoolId?: string | null }).schoolId;
  if (!options.allowMissingSchool && schoolId && !auth.roles.includes('superadmin') && auth.schoolId !== schoolId) {
    throw errors.forbidden('Data milik sekolah lain.');
  }
  return doc;
}

export function buildSearchKey(fields: (string | undefined | null)[]): string {
  return searchKeyOf(fields.filter(Boolean).join(' '));
}

export async function createRecord<T extends { id: string }>(
  collection: string,
  payload: Record<string, unknown>,
  options: { searchFields?: string[]; extra?: Record<string, unknown> } = {},
): Promise<T> {
  const store = await getStore();
  const now = serverNowIso();
  const id = (payload.id as string) || newId(collection.slice(0, 4));
  const doc = {
    ...payload,
    ...(options.extra ?? {}),
    id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...(options.searchFields
      ? { searchKey: buildSearchKey(options.searchFields.map((f) => payload[f] as string)) }
      : {}),
  } as unknown as T;
  return store.create<T>(collection, id, doc);
}

export async function updateRecord<T extends { id: string }>(
  collection: string,
  id: string,
  patch: Record<string, unknown>,
  options: { searchFields?: string[] } = {},
): Promise<T> {
  const store = await getStore();
  const existing = await store.getDoc<T>(collection, id);
  if (!existing) throw errors.notFound('Data tidak ditemukan.');
  const merged = { ...(existing as unknown as Record<string, unknown>), ...patch };
  const next: Record<string, unknown> = {
    ...patch,
    updatedAt: serverNowIso(),
    deletedAt: merged.deletedAt ?? null,
  };
  if (options.searchFields) {
    next.searchKey = buildSearchKey(options.searchFields.map((f) => merged[f] as string));
  }
  return store.update<T>(collection, id, next as Partial<T>);
}

export async function softDeleteRecord(
  collection: string,
  id: string,
): Promise<void> {
  const store = await getStore();
  const existing = await store.getDoc<{ id: string }>(collection, id);
  if (!existing) throw errors.notFound('Data tidak ditemukan.');
  await store.update(collection, id, {
    deletedAt: serverNowIso(),
    updatedAt: serverNowIso(),
  } as never);
}

export async function parseBody<T extends ZodTypeAny>(
  schema: T,
  body: unknown,
): Promise<z.infer<T>> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw errors.validation(
      result.error.issues[0]?.message ?? 'Data tidak valid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data as z.infer<T>;
}

export function requireResource<T>(value: T | null | undefined, message = 'Data tidak ditemukan.'): T {
  if (value === null || value === undefined) throw errors.notFound(message);
  return value;
}
