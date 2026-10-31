import { round2 } from '../../../src/shared/answers';
import type { ItemStat } from '../../../src/shared/stats';
import type { QuestionType } from '../../../src/shared/types';
import { compositeId } from '../ids';
import { serverNowIso } from '../clock';

/**
 * Agregat statistik butir soal yang diperbarui saat submit (O(1) per soal).
 * Dengan cara ini analisis butir tidak perlu memindai seluruh respons peserta
 * setiap kali halaman analitik dibuka — penting untuk kuota Firestore Spark.
 */
export interface ItemStatAggregate {
  id: string;
  schoolId: string;
  scheduleId: string;
  formVersionId: string;
  questionId: string;
  type: QuestionType;
  points: number;
  n: number;
  answered: number;
  correct: number;
  blank: number;
  optionCounts: Record<string, number>;
  sumScore: number;
  sumScoreSq: number;
  sumTotal: number;
  sumTotalSq: number;
  sumTotalIfCorrect: number;
  sumTotalIfWrong: number;
  sumTimeMs: number;
  timeSamples: number;
  updatedAt: string;
}

export interface ItemRowInput {
  questionId: string;
  type: QuestionType;
  points: number;
  value: unknown;
  score: number;
  blank: boolean;
  totalScore: number;
  timeSpentMs?: number;
}

export function aggregateId(scheduleId: string, questionId: string): string {
  return compositeId(scheduleId, questionId);
}

export function emptyAggregate(meta: {
  schoolId: string;
  scheduleId: string;
  formVersionId: string;
  questionId: string;
  type: QuestionType;
  points: number;
}): ItemStatAggregate {
  return {
    id: aggregateId(meta.scheduleId, meta.questionId),
    schoolId: meta.schoolId,
    scheduleId: meta.scheduleId,
    formVersionId: meta.formVersionId,
    questionId: meta.questionId,
    type: meta.type,
    points: meta.points,
    n: 0,
    answered: 0,
    correct: 0,
    blank: 0,
    optionCounts: {},
    sumScore: 0,
    sumScoreSq: 0,
    sumTotal: 0,
    sumTotalSq: 0,
    sumTotalIfCorrect: 0,
    sumTotalIfWrong: 0,
    sumTimeMs: 0,
    timeSamples: 0,
    updatedAt: serverNowIso(),
  };
}

export function applyRow(agg: ItemStatAggregate, row: ItemRowInput): ItemStatAggregate {
  const next: ItemStatAggregate = {
    ...agg,
    optionCounts: { ...agg.optionCounts },
    n: agg.n + 1,
    answered: agg.answered + (row.blank ? 0 : 1),
    blank: agg.blank + (row.blank ? 1 : 0),
    correct: agg.correct + (row.blank ? 0 : row.score >= row.points && row.points > 0 ? 1 : 0),
    sumScore: agg.sumScore + row.score,
    sumScoreSq: agg.sumScoreSq + row.score * row.score,
    sumTotal: agg.sumTotal + row.totalScore,
    sumTotalSq: agg.sumTotalSq + row.totalScore * row.totalScore,
    sumTimeMs: agg.sumTimeMs + (row.timeSpentMs ?? 0),
    timeSamples: agg.timeSamples + (row.timeSpentMs ? 1 : 0),
    updatedAt: serverNowIso(),
  };
  const fullyCorrect = !row.blank && row.points > 0 && row.score >= row.points;
  if (fullyCorrect) next.sumTotalIfCorrect += row.totalScore;
  else next.sumTotalIfWrong += row.totalScore;

  for (const id of extractOptionIds(row.value)) {
    next.optionCounts[id] = (next.optionCounts[id] ?? 0) + 1;
  }
  return next;
}

function extractOptionIds(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

/** Point-biserial dari agregat (tanpa memindai respons per peserta). */
export function discriminationFromAggregate(agg: ItemStatAggregate): number | null {
  if (agg.n < 10) return null;
  const wrong = agg.n - agg.correct;
  if (agg.correct === 0 || wrong === 0) return null;
  const p = agg.correct / agg.n;
  const q = 1 - p;
  const mP = agg.sumTotalIfCorrect / agg.correct;
  const mQ = agg.sumTotalIfWrong / wrong;
  const meanTotal = agg.sumTotal / agg.n;
  const variance = agg.sumTotalSq / agg.n - meanTotal * meanTotal;
  if (variance <= 0) return null;
  const sd = Math.sqrt(variance);
  return round2(((mP - mQ) / sd) * Math.sqrt(p * q));
}

export function toItemStat(agg: ItemStatAggregate): ItemStat {
  const difficulty = agg.n > 0 ? round2(agg.correct / agg.n) : 0;
  const interpretation: ItemStat['interpretation'] =
    difficulty > 0.8 ? 'mudah' : difficulty < 0.3 ? 'sulit' : 'sedang';
  const discrimination = discriminationFromAggregate(agg);
  const label =
    discrimination === null
      ? 'Tidak dihitung (sampel kecil / varians nol)'
      : discrimination >= 0.4
        ? 'Sangat baik'
        : discrimination >= 0.3
          ? 'Baik'
          : discrimination >= 0.2
            ? 'Cukup'
            : discrimination >= 0
              ? 'Rendah'
              : 'Negatif / perlu ditinjau';
  const answered = agg.answered || 1;
  const optionDistribution = Object.entries(agg.optionCounts)
    .map(([optionId, count]) => ({ optionId, count, percent: round2((count / answered) * 100) }))
    .sort((a, b) => b.count - a.count);
  let recommendation: ItemStat['recommendation'] = 'pertahankan';
  if (discrimination !== null && discrimination < 0) recommendation = 'revisi';
  else if (discrimination !== null && discrimination < 0.2) recommendation = 'tinjau';
  else if (interpretation === 'mudah' && difficulty >= 0.95) recommendation = 'tinjau';
  return {
    questionId: agg.questionId,
    answered: agg.answered,
    blank: agg.blank,
    correct: agg.correct,
    difficulty,
    interpretation,
    discrimination,
    discriminationLabel: label,
    optionDistribution,
    recommendation,
    note: agg.n < 10 ? `Sampel hanya ${agg.n} respons (<10); statistik belum stabil.` : undefined,
  };
}

export function cronbachFromAggregates(
  aggs: ItemStatAggregate[],
): { alpha: number | null; note: string; items: number; respondents: number } {
  const dichotomous = aggs.filter((a) => a.type !== 'essay' && a.type !== 'matching' && a.n >= 2);
  if (dichotomous.length < 2) {
    return { alpha: null, note: 'Minimal 2 butir objektif diperlukan untuk menghitung alpha.', items: 0, respondents: 0 };
  }
  const n = Math.min(...dichotomous.map((a) => a.n));
  if (n < 2) return { alpha: null, note: 'Jumlah peserta tidak memadai.', items: dichotomous.length, respondents: n };
  const totalVariance = (() => {
    const first = dichotomous[0];
    const meanTotal = first.sumTotal / first.n;
    return first.sumTotalSq / first.n - meanTotal * meanTotal;
  })();
  if (totalVariance <= 0) {
    return { alpha: null, note: 'Varians skor total nol.', items: dichotomous.length, respondents: n };
  }
  const itemVars = dichotomous.map((a) => {
    const mean = a.sumScore / a.n;
    return Math.max(0, a.sumScoreSq / a.n - mean * mean);
  });
  const k = itemVars.length;
  const sumVars = itemVars.reduce((x, y) => x + y, 0);
  const alpha = (k / (k - 1)) * (1 - sumVars / totalVariance);
  return {
    alpha: round2(alpha),
    note: `Dihitung dari ${n} peserta dan ${k} butir objektif. Alpha hanya bermakna bila butir cukup homogen; jangan diterapkan pada butir uraian.`,
    items: k,
    respondents: n,
  };
}
