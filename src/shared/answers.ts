import type { QuestionKey, QuestionType } from './types';

/** Kunci seragam untuk dinilai: mcq -> optionId, complex -> id[], dst. */
export interface NormalizedKey {
  type: QuestionType;
  value: string | string[] | boolean | Record<string, string>;
  points: number;
}

export function normalizeKey(key: QuestionKey): NormalizedKey {
  const points = typeof key.points === 'number' && key.points > 0 ? key.points : 1;
  switch (key.type) {
    case 'mcq':
      return { type: key.type, value: String(key.correct ?? ''), points };
    case 'complex':
      return {
        type: key.type,
        value: Array.isArray(key.correct) ? key.correct.map(String) : [],
        points,
      };
    case 'truefalse':
      return { type: key.type, value: Boolean(key.correct), points };
    case 'matching': {
      const value: Record<string, string> = {};
      const raw = key.correct;
      if (Array.isArray(raw)) {
        for (const pair of raw) {
          if (Array.isArray(pair) && pair.length === 2) value[String(pair[0])] = String(pair[1]);
        }
      } else if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) value[k] = String(v);
      }
      return { type: key.type, value, points };
    }
    case 'short':
      return {
        type: key.type,
        value: Array.isArray(key.correct) ? key.correct.map(String) : [String(key.correct ?? '')],
        points,
      };
    case 'essay':
      return { type: key.type, value: (key.correct ?? '') as string, points };
    default:
      return { type: 'mcq', value: '', points: 1 };
  }
}

export function isObjective(type: QuestionType): boolean {
  return type !== 'essay';
}

/**
 * Penilaian objektif deterministik di sisi server.
 * Mengembalikan skor parsial (0..points) dan status benar/salah/kosong.
 */
export function scoreObjective(
  key: NormalizedKey,
  value: unknown,
): { score: number; correct: boolean; blank: boolean } {
  const blankCheck = isEmptyValue(value);
  if (blankCheck) return { score: 0, correct: false, blank: true };

  switch (key.type) {
    case 'mcq': {
      const ok = String(value) === String(key.value);
      return { score: ok ? key.points : 0, correct: ok, blank: false };
    }
    case 'complex': {
      const expected = new Set(key.value as string[]);
      const given = new Set((Array.isArray(value) ? value : []).map(String));
      if (expected.size === 0) return { score: 0, correct: false, blank: false };
      const equal = expected.size === given.size && [...expected].every((v) => given.has(v));
      return { score: equal ? key.points : 0, correct: equal, blank: false };
    }
    case 'truefalse': {
      const ok = Boolean(value) === Boolean(key.value);
      return { score: ok ? key.points : 0, correct: ok, blank: false };
    }
    case 'matching': {
      const expected = key.value as Record<string, string>;
      const given = (value ?? {}) as Record<string, string>;
      const leftIds = Object.keys(expected);
      if (leftIds.length === 0) return { score: 0, correct: false, blank: false };
      let hit = 0;
      for (const id of leftIds) if (String(given[id]) === String(expected[id])) hit++;
      const score = (hit / leftIds.length) * key.points;
      return {
        score: round2(score),
        correct: hit === leftIds.length,
        blank: false,
      };
    }
    case 'short': {
      const accepted = (key.value as string[]).map(normalizeText);
      const ok = accepted.includes(normalizeText(String(value)));
      return { score: ok ? key.points : 0, correct: ok, blank: false };
    }
    default:
      return { score: 0, correct: false, blank: false };
  }
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every((v) => isEmptyValue(v));
  return false;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
