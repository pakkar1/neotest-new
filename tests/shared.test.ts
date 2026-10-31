import { describe, expect, it } from 'vitest';
import {
  isEmptyValue,
  normalizeKey,
  normalizeText,
  scoreObjective,
} from '../src/shared/answers';
import {
  cronbachAlpha,
  describeDiscrimination,
  groupStats,
  mean,
  median,
  pointBiserial,
  scoreDistribution,
} from '../src/shared/stats';
import { addMinutes, formatDuration, isExpired, minutesBetween } from '../src/shared/time';
import { hasPermission, homePathFor } from '../src/shared/permissions';
import { hashExamToken, normalizeExamToken } from '../api/_lib/ids';

describe('penilaian objektif', () => {
  it('menilai pilihan ganda tunggal', () => {
    const key = normalizeKey({ id: 'q', questionId: 'q', type: 'mcq', correct: 'B', points: 1 });
    expect(scoreObjective(key, 'B')).toEqual({ score: 1, correct: true, blank: false });
    expect(scoreObjective(key, 'A')).toEqual({ score: 0, correct: false, blank: false });
    expect(scoreObjective(key, null)).toEqual({ score: 0, correct: false, blank: true });
  });

  it('pilihan ganda kompleks harus sama persis (tanpa skor parsial)', () => {
    const key = normalizeKey({
      id: 'q2', questionId: 'q2', type: 'complex', correct: ['A', 'C'], points: 2,
    });
    expect(scoreObjective(key, ['C', 'A']).score).toBe(2);
    expect(scoreObjective(key, ['A']).score).toBe(0);
    expect(scoreObjective(key, ['A', 'B', 'C']).score).toBe(0);
  });

  it('menjodohkan memberi skor parsial proporsional', () => {
    const key = normalizeKey({
      id: 'q3', questionId: 'q3', type: 'matching', correct: { p1: 'p1', p2: 'p2' }, points: 4,
    });
    expect(scoreObjective(key, { p1: 'p1', p2: 'p2' }).score).toBe(4);
    expect(scoreObjective(key, { p1: 'p1', p2: 'p1' }).score).toBe(2);
  });

  it('isian singkat mengabaikan kapitalisasi dan tanda baca', () => {
    const key = normalizeKey({
      id: 'q4', questionId: 'q4', type: 'short', correct: ['Jakarta'], points: 1,
    });
    expect(scoreObjective(key, '  JAKARTA! ').score).toBe(1);
    expect(scoreObjective(key, 'Bandung').score).toBe(0);
  });

  it('mendeteksi jawaban kosong', () => {
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue({ p1: '' })).toBe(true);
    expect(isEmptyValue('x')).toBe(false);
    expect(normalizeText('  Buku-buku  ')).toBe('buku buku');
  });
});

describe('statistik', () => {
  it('mean, median, distribusi', () => {
    expect(mean([10, 20, 30])).toBe(20);
    expect(median([1, 3, 2, 4])).toBe(2.5);
    const dist = scoreDistribution([45, 55, 70, 85, 95, 100]);
    expect(dist.map((d) => d.count)).toEqual([1, 1, 1, 1, 2]);
  });

  it('point-biserial bernilai positif untuk butir yang searah', () => {
    const items = [1, 1, 1, 0, 0, 0, 1, 0, 1, 0];
    const totals = [90, 85, 80, 40, 35, 30, 88, 45, 92, 38];
    const r = pointBiserial(items, totals);
    expect(r).toBeGreaterThan(0.8);
  });

  it('cronbach alpha dihitung dari matriks respons', () => {
    const perfectlyCorrelated = [
      [1, 1],
      [1, 1],
      [0, 0],
      [0, 0],
      [1, 1],
    ];
    const result = cronbachAlpha(perfectlyCorrelated);
    expect(result.alpha).not.toBeNull();
    expect(result.alpha!).toBeGreaterThan(0.9);

    const mixed = [
      [1, 1, 1, 0],
      [1, 1, 0, 0],
      [1, 0, 1, 1],
      [0, 1, 0, 1],
      [1, 1, 1, 1],
      [0, 0, 1, 0],
    ];
    const mixedResult = cronbachAlpha(mixed);
    expect(mixedResult.alpha).not.toBeNull();
    expect(mixedResult.alpha!).toBeGreaterThanOrEqual(-1);
    expect(mixedResult.alpha!).toBeLessThanOrEqual(1);
  });

  it('mengelompokkan statistik per kelas', () => {
    const rows = [
      { studentId: 'a', classId: 'c1', sessionId: 's1', score: 80, maxScore: 100, percent: 80, status: 'final' },
      { studentId: 'b', classId: 'c1', sessionId: 's1', score: 60, maxScore: 100, percent: 60, status: 'final' },
      { studentId: 'c', classId: 'c2', sessionId: 's1', score: 90, maxScore: 100, percent: 90, status: 'final' },
    ];
    const out = groupStats(rows, 'classId', { c1: 'Kelas 1', c2: 'Kelas 2' }, 70);
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.key === 'c1')?.mean).toBe(70);
    expect(out.find((g) => g.key === 'c2')?.passRate).toBe(100);
  });

  it('label daya pembeda', () => {
    expect(describeDiscrimination(0.45)).toContain('Sangat baik');
    expect(describeDiscrimination(-0.1)).toContain('Negatif');
    expect(describeDiscrimination(null)).toContain('Tidak dihitung');
  });
});

describe('waktu & token', () => {
  it('menghitung selisih menit dengan benar', () => {
    const start = '2026-01-01T08:00:00.000Z';
    expect(minutesBetween(start, addMinutes(start, 45))).toBe(45);
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(59)).toBe('00:59');
    expect(isExpired('2020-01-01T00:00:00.000Z')).toBe(true);
  });

  it('hash token konsisten dan tidak menyimpan plaintext', () => {
    const a = hashExamToken('ABCD-2345', 'pepper');
    const b = hashExamToken('abcd2345', 'pepper');
    expect(a).toBe(b);
    expect(a).not.toContain('ABCD');
    expect(normalizeExamToken('ab-cd 23 45')).toBe('ABCD2345');
  });
});

describe('RBAC', () => {
  it('matriks izin dasar', () => {
    expect(hasPermission(['student'], 'exam.take')).toBe(true);
    expect(hasPermission(['student'], 'user.manage')).toBe(false);
    expect(hasPermission(['teacher'], 'result.grade')).toBe(true);
    expect(hasPermission(['teacher'], 'audit.read')).toBe(false);
    expect(hasPermission(['proctor'], 'token.issue')).toBe(true);
    expect(hasPermission(['proctor'], 'result.publish')).toBe(false);
    expect(hasPermission(['admin'], 'user.manage')).toBe(true);
    expect(hasPermission(['superadmin'], 'audit.read')).toBe(true);
  });

  it('halaman awal sesuai peran', () => {
    expect(homePathFor(['student'])).toBe('/siswa');
    expect(homePathFor(['proctor'])).toBe('/proktor');
    expect(homePathFor(['admin'])).toBe('/admin');
  });
});
