import { round2 } from './answers';

export interface ScoreRow {
  studentId: string;
  classId: string;
  sessionId: string;
  score: number;
  maxScore: number;
  percent: number;
  status: string;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round2(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return round2(Math.sqrt(variance));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return round2(sorted[idx]);
}

export interface Distribution {
  label: string;
  count: number;
}

/** Distribusi nilai dalam 5 pita: <50, 50-64, 65-79, 80-89, 90-100. */
export function scoreDistribution(percents: number[]): Distribution[] {
  const bands = [
    { label: '< 50', min: -Infinity, max: 49.999 },
    { label: '50–64', min: 50, max: 64.999 },
    { label: '65–79', min: 65, max: 79.999 },
    { label: '80–89', min: 80, max: 89.999 },
    { label: '90–100', min: 90, max: 100.001 },
  ];
  return bands.map((b) => ({
    label: b.label,
    count: percents.filter((p) => p >= b.min && p <= b.max).length,
  }));
}

export interface GroupStat {
  key: string;
  label: string;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  passRate: number | null;
}

export function groupStats(
  rows: ScoreRow[],
  groupBy: 'classId' | 'sessionId',
  labels: Record<string, string>,
  passingScore?: number,
): GroupStat[] {
  const groups = new Map<string, ScoreRow[]>();
  for (const row of rows) {
    const key = row[groupBy];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return [...groups.entries()].map(([key, list]) => {
    const values = list.map((r) => r.percent);
    return {
      key,
      label: labels[key] ?? key,
      count: list.length,
      mean: mean(values),
      median: median(values),
      min: values.length ? round2(Math.min(...values)) : 0,
      max: values.length ? round2(Math.max(...values)) : 0,
      passRate:
        typeof passingScore === 'number' && values.length
          ? round2((values.filter((v) => v >= passingScore).length / values.length) * 100)
          : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Analisis butir soal                                                */
/* ------------------------------------------------------------------ */

export interface ItemResponseRow {
  questionId: string;
  studentId: string;
  value: unknown;
  score: number;
  maxPoints: number;
  correct: boolean;
  blank: boolean;
}

export interface ItemStat {
  questionId: string;
  answered: number;
  blank: number;
  correct: number;
  difficulty: number;
  interpretation: 'mudah' | 'sedang' | 'sulit';
  discrimination: number | null;
  discriminationLabel: string;
  optionDistribution: { optionId: string; count: number; percent: number }[];
  recommendation: 'pertahankan' | 'tinjau' | 'revisi';
  note?: string;
}

/**
 * Tingkat kesukaran = proporsi skor benar terhadap peserta yang menjawab (P).
 * Daya pembeda = korelasi point-biserial antara skor butir (0/1) dan skor total
 * peserta. Point-biserial dipakai karena stabil untuk jumlah peserta kecil
 * dan tidak memerlukan pemotongan kelompok atas/bawah yang arbitrer.
 * Jika n < 10, nilai tidak dilaporkan (null) dan diberi catatan keterbatasan.
 */
export function itemAnalysis(
  items: ItemResponseRow[],
  totalScores: Map<string, number>,
  thresholds = { easy: 0.8, hard: 0.3, minSample: 10 },
): ItemStat[] {
  const byQuestion = new Map<string, ItemResponseRow[]>();
  for (const row of items) {
    if (!byQuestion.has(row.questionId)) byQuestion.set(row.questionId, []);
    byQuestion.get(row.questionId)!.push(row);
  }

  const out: ItemStat[] = [];
  for (const [questionId, rows] of byQuestion) {
    const n = rows.length;
    const answeredRows = rows.filter((r) => !r.blank);
    const correct = rows.filter((r) => r.correct).length;
    const blank = rows.filter((r) => r.blank).length;
    const difficulty = n > 0 ? round2(correct / n) : 0;
    const interpretation: ItemStat['interpretation'] =
      difficulty > thresholds.easy ? 'mudah' : difficulty < thresholds.hard ? 'sulit' : 'sedang';

    let discrimination: number | null = null;
    if (n >= thresholds.minSample) {
      const xs = rows.map((r) => (r.correct ? 1 : 0));
      const ys = rows.map((r) => totalScores.get(r.studentId) ?? 0);
      discrimination = pointBiserial(xs, ys);
    }

    const optionCounts = new Map<string, number>();
    for (const r of rows) {
      const ids = extractOptionIds(r.value);
      for (const id of ids) optionCounts.set(id, (optionCounts.get(id) ?? 0) + 1);
    }
    const totalOptionPicks = [...optionCounts.values()].reduce((a, b) => a + b, 0) || 1;
    const optionDistribution = [...optionCounts.entries()]
      .map(([optionId, count]) => ({
        optionId,
        count,
        percent: round2((count / answeredRows.length || 0) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const dLabel = describeDiscrimination(discrimination);
    const rec = recommend(difficulty, discrimination, interpretation);
    out.push({
      questionId,
      answered: answeredRows.length,
      blank,
      correct,
      difficulty,
      interpretation,
      discrimination,
      discriminationLabel: dLabel,
      optionDistribution: optionDistribution.length
        ? optionDistribution
        : [],
      recommendation: rec,
      note:
        n < thresholds.minSample
          ? `Sampel hanya ${n} respons (< ${thresholds.minSample}); statistik belum stabil.`
          : totalOptionPicks === 0
            ? undefined
            : undefined,
    });
  }
  return out;
}

function extractOptionIds(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

export function pointBiserial(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mX = x.reduce((a, b) => a + b, 0) / n;
  const mY = y.reduce((a, b) => a + b, 0) / n;
  const sX = Math.sqrt(x.reduce((a, b) => a + (b - mX) ** 2, 0) / n);
  const sY = Math.sqrt(y.reduce((a, b) => a + (b - mY) ** 2, 0) / n);
  if (sX === 0 || sY === 0) return null;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (x[i] - mX) * (y[i] - mY);
  cov /= n;
  return round2(cov / (sX * sY));
}

export function describeDiscrimination(d: number | null): string {
  if (d === null) return 'Tidak dihitung (sampel kecil / varians nol)';
  if (d >= 0.4) return 'Sangat baik';
  if (d >= 0.3) return 'Baik';
  if (d >= 0.2) return 'Cukup';
  if (d >= 0) return 'Rendah';
  return 'Negatif / perlu ditinjau';
}

export function recommend(
  difficulty: number,
  discrimination: number | null,
  interpretation: ItemStat['interpretation'],
): ItemStat['recommendation'] {
  if (discrimination !== null && discrimination < 0) return 'revisi';
  if (discrimination !== null && discrimination < 0.2) return 'tinjau';
  if (interpretation === 'mudah' && difficulty >= 0.95) return 'tinjau';
  return 'pertahankan';
}

/** Cronbach's alpha untuk butir dikotomi (0/1). */
export function cronbachAlpha(matrix: number[][]): { alpha: number | null; note: string } {
  const n = matrix.length;
  if (n < 2) return { alpha: null, note: 'Minimal 2 peserta diperlukan.' };
  const k = matrix[0].length;
  if (k < 2) return { alpha: null, note: 'Minimal 2 butir diperlukan.' };
  const itemVars: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = matrix.map((row) => row[j]);
    const m = col.reduce((a, b) => a + b, 0) / n;
    itemVars.push(col.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  }
  const totals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const mT = totals.reduce((a, b) => a + b, 0) / n;
  const varT = totals.reduce((a, b) => a + (b - mT) ** 2, 0) / n;
  if (varT === 0) return { alpha: null, note: 'Varians total nol; alpha tidak dapat dihitung.' };
  const sumItemVars = itemVars.reduce((a, b) => a + b, 0);
  const alpha = (k / (k - 1)) * (1 - sumItemVars / varT);
  return {
    alpha: round2(alpha),
    note: `Dihitung dengan ${n} peserta dan ${k} butir objektif. Interpretasi alpha bergantung pada homogenitas butir; jangan dipakai untuk butir uraian.`,
  };
}
