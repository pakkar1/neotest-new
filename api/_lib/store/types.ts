export type WhereOp =
  | '=='
  | '!='
  | 'in'
  | 'not-in'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'array-contains'
  | 'array-contains-any';

export interface Where {
  field: string;
  op: WhereOp;
  value: unknown;
}

export interface StoreQuery {
  where?: Where[];
  /** Pencarian berawalan pada field `searchKey` (sudah dinormalisasi). */
  search?: string;
  orderBy?: { field: string; dir: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}

export interface StoreTx {
  getDoc<T extends { id: string }>(collection: string, id: string): Promise<T | null>;
  query<T extends { id: string }>(collection: string, query: StoreQuery): Promise<T[]>;
  set<T extends { id: string }>(collection: string, id: string, doc: T): Promise<void>;
  update<T extends { id: string }>(collection: string, id: string, patch: Partial<T>): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
}

export interface Store {
  readonly mode: 'demo' | 'firebase';
  getDoc<T extends { id: string }>(collection: string, id: string): Promise<T | null>;
  query<T extends { id: string }>(collection: string, query: StoreQuery): Promise<T[]>;
  count(collection: string, query?: StoreQuery): Promise<number>;
  set<T extends { id: string }>(collection: string, id: string, doc: T): Promise<void>;
  create<T extends { id: string }>(collection: string, id: string, doc: T): Promise<T>;
  update<T extends { id: string }>(collection: string, id: string, patch: Partial<T>): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
  batch(fn: (tx: StoreTx) => Promise<void>): Promise<void>;
  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>;
}

export const COLLECTIONS = [
  'schools',
  'academicYears',
  'classes',
  'subjects',
  'rooms',
  'users',
  'userProfiles',
  'students',
  'teachers',
  'proctors',
  'questionBanks',
  'questions',
  'answerKeys',
  'stimuli',
  'examTypes',
  'examForms',
  'examFormVersions',
  'versionQuestions',
  'examSchedules',
  'examSessions',
  'examParticipants',
  'examAttempts',
  'responses',
  'examResults',
  'itemStats',
  'examTokens',
  'incidents',
  'auditLogs',
  'loginAttempts',
  'appSettings',
  'quotaCounters',
  'idempotency',
  'demoMeta',
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];
