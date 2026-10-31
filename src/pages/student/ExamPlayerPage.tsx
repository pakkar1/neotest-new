import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudOff,
  Flag,
  Loader2,
  Lock,
  LogOut,
  Send,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useOnlineStatus, usePageTitle } from '../../hooks';
import { NeoTestWordmark } from '../../components/Logo';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../services/auth';
import type { AttemptView, VersionQuestion } from '../../shared/types';

type AnswerValue = string | string[] | boolean | Record<string, string> | null;

interface LocalAnswer {
  value: AnswerValue;
  flagged: boolean;
}

interface CurrentResponse {
  view: AttemptView | null;
  autoClosed: boolean;
  message?: string;
}

const PENDING_KEY = 'neotest.pending';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export default function ExamPlayerPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const online = useOnlineStatus();
  usePageTitle('Mengerjakan Ujian');

  const [view, setView] = useState<AttemptView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitToken, setSubmitToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const deadlineRef = useRef<number>(0);
  const seqRef = useRef<number>(1);
  const dirtyRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const savingRef = useRef(false);
  const submittedRef = useRef(false);
  const lastSignalRef = useRef(0);

  const syncFromView = useCallback((next: AttemptView) => {
    setView(next);
    setAnswers((prev) => {
      const merged: Record<string, LocalAnswer> = {};
      for (const question of next.questions) {
        const saved = next.responses.find((r) => r.questionId === question.id);
        merged[question.id] = prev[question.id] && dirtyRef.current.has(question.id)
          ? prev[question.id]
          : { value: (saved?.value as AnswerValue) ?? null, flagged: saved?.flagged ?? false };
      }
      return merged;
    });
    deadlineRef.current = Date.parse(next.serverNow) + next.remainingMs;
    setRemaining(next.remainingMs);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiRequest<CurrentResponse>('/api/attempts', { query: { action: 'current' } });
      if (!res.view) {
        if (res.message) toast.warning(res.message);
        navigate('/siswa', { replace: true });
        return;
      }
      if (attemptId && res.view.attempt.id !== attemptId) {
        navigate(`/siswa/ujian/${res.view.attempt.id}`, { replace: true });
      }
      syncFromView(res.view);
      setLastSavedAt(res.view.attempt.lastSavedAt ?? null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        navigate('/siswa', { replace: true });
        return;
      }
      setLoadError(err instanceof ApiClientError ? err.message : 'Gagal memuat ujian.');
    }
  }, [attemptId, navigate, syncFromView, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Simpan jawaban yang belum terkirim saat tab ditutup.
  useEffect(() => {
    if (!view) return;
    try {
      const payload = { attemptId: view.attempt.id, answers, at: Date.now() };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch {
      // abaikan
    }
  }, [answers, view]);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = deadlineRef.current - Date.now();
      setRemaining(Math.max(0, left));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const flush = useCallback(async () => {
    if (!view || savingRef.current) return;
    const queue = Array.from(dirtyRef.current);
    if (queue.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      for (const questionId of queue) {
        const answer = answersRef.current[questionId];
        if (!answer) continue;
        try {
          const res = await apiRequest<{ savedAt: string; seq: number; serverNow: string; remainingMs: number }>(
            '/api/attempts',
            {
              method: 'POST',
              query: { action: 'save' },
              body: {
                attemptId: view.attempt.id,
                questionId,
                value: answer.value,
                flagged: answer.flagged,
                seq: seqRef.current++,
              },
            },
          );
          dirtyRef.current.delete(questionId);
          setDirty(dirtyRef.current.size);
          setLastSavedAt(res.savedAt);
          deadlineRef.current = Date.parse(res.serverNow) + res.remainingMs;
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 409) {
            dirtyRef.current.clear();
            setDirty(0);
            toast.warning(err.message);
            navigate(`/siswa/hasil/${view.attempt.id}`, { replace: true });
            return;
          }
          setSaveFailed(true);
          break;
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [navigate, toast, view]);

  const answersRef = useRef<Record<string, LocalAnswer>>({});
  answersRef.current = answers;

  useEffect(() => {
    if (dirty === 0) return;
    const handler = setTimeout(() => void flush(), 900);
    return () => clearTimeout(handler);
  }, [dirty, flush]);

  useEffect(() => {
    if (online && saveFailed) void flush();
  }, [online, saveFailed, flush]);

  // Kehilangan fokus dicatat sebagai sinyal pengawasan (tidak menggugurkan).
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'hidden' || !view || submittedRef.current) return;
      const now = Date.now();
      if (now - lastSignalRef.current < 30_000) return;
      lastSignalRef.current = now;
      void apiRequest('/api/attempts', {
        method: 'POST',
        query: { action: 'signal' },
        body: { attemptId: view.attempt.id, type: 'focus_loss' },
      }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [view]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current.size > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const questions = view?.questions ?? [];
  const question: VersionQuestion | undefined = questions[index];
  const total = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => isAnswered(answers[q.id]?.value ?? null)).length,
    [answers, questions],
  );
  const flaggedCount = useMemo(
    () => questions.filter((q) => answers[q.id]?.flagged).length,
    [answers, questions],
  );

  const update = (questionId: string, patch: Partial<LocalAnswer>) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? { value: null, flagged: false };
      return { ...prev, [questionId]: { ...current, ...patch } };
    });
    dirtyRef.current.add(questionId);
    setDirty(dirtyRef.current.size);
    const existing = timersRef.current.get(questionId);
    if (existing) clearTimeout(existing);
    timersRef.current.set(questionId, setTimeout(() => void flush(), 1200));
  };

  const nextQuestion = () => {
    if (index < total - 1) setIndex(index + 1);
  };
  const prevQuestion = () => {
    if (index > 0) setIndex(index - 1);
  };

  const timeUp = remaining <= 0 && view !== null;

  const submit = async () => {
    if (!view) return;
    if (!submitToken.trim()) {
      setSubmitError('Masukkan token kirim dari proktor.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await flush();
      await apiRequest('/api/attempts', {
        method: 'POST',
        query: { action: 'submit' },
        body: { attemptId: view.attempt.id, token: submitToken.trim().toUpperCase(), reason: 'manual' },
      });
      submittedRef.current = true;
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // abaikan
      }
      toast.success('Jawaban berhasil dikirim.');
      navigate(`/siswa/hasil/${view.attempt.id}?selesai=1`, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'ALREADY_SUBMITTED') {
          navigate(`/siswa/hasil/${view.attempt.id}`, { replace: true });
          return;
        }
        setSubmitError(err.message);
      } else {
        setSubmitError('Tidak dapat mengirim jawaban. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 text-[15px] font-semibold text-navy-900">Ujian tidak dapat dimuat</p>
          <p className="mt-1 text-[13px] text-slate-500">{loadError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/siswa')}>
              Kembali
            </Button>
            <Button onClick={() => void load()}>Coba lagi</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!view || !question) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f7fb] text-slate-500">
        <Loader2 className="h-7 w-7 animate-spin text-brand-700" />
        <p className="text-sm">Menyiapkan naskah ujian…</p>
      </div>
    );
  }

  const saveLabel = !online
    ? 'Offline — jawaban tersimpan di perangkat'
    : saveFailed
      ? 'Gagal menyimpan — mencoba lagi'
      : saving || dirty > 0
        ? 'Menyimpan…'
        : lastSavedAt
          ? `Tersimpan ${new Date(lastSavedAt).toLocaleTimeString('id-ID')}`
          : 'Semua jawaban tersimpan';

  const minSubmitLeft = Math.max(
    0,
    (view.examType.minSubmitMinutes ?? 0) * 60_000 - (Date.now() - Date.parse(view.attempt.startedAt)),
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f5fa]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5">
          <NeoTestWordmark compact subtitle="Ujian" />
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-[13px] font-semibold text-navy-900">{view.schedule.title}</p>
            <p className="text-[11px] text-slate-500">
              {view.subjectName} · {view.session.roomName} · {user?.displayName} ({user?.participantNo})
            </p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[15px] font-bold tabular-nums ${
              remaining < 300_000 ? 'bg-red-50 text-red-700' : 'bg-navy-50 text-navy-900'
            }`}
            title="Waktu tersisa berdasarkan jam server"
          >
            <Timer className="h-4 w-4" />
            {formatClock(remaining)}
          </div>
          <div className="hidden items-center gap-1.5 text-[11.5px] text-slate-500 md:flex">
            {online ? <Wifi className="h-3.5 w-3.5 text-green-600" /> : <WifiOff className="h-3.5 w-3.5 text-red-600" />}
            <span className={saveFailed ? 'text-red-600' : ''}>
              {saving ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
              {saveLabel}
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Send className="h-4 w-4" />}
            onClick={() => {
              setSubmitError(null);
              setSubmitOpen(true);
            }}
          >
            Kirim jawaban
          </Button>
          <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmLeave(true)}>
            Keluar
          </Button>
        </div>
        {!online ? (
          <div className="flex items-center gap-1.5 bg-amber-50 px-4 py-1 text-[11.5px] text-amber-900">
            <CloudOff className="h-3.5 w-3.5" /> Koneksi terputus. Jawaban disimpan sementara di perangkat dan akan
            disinkronkan saat koneksi pulih.
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 px-3 py-3 lg:flex-row">
        <main className="flex-1">
          <div className="rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-navy-800 px-2 py-1 text-[12px] font-semibold text-white">
                  Soal {index + 1} / {total}
                </span>
                <span className="text-[11.5px] uppercase tracking-wide text-slate-500">
                  {question.type === 'mcq'
                    ? 'Pilihan ganda'
                    : question.type === 'complex'
                      ? 'Pilihan ganda kompleks'
                      : question.type === 'truefalse'
                        ? 'Benar / Salah'
                        : question.type === 'matching'
                          ? 'Menjodohkan'
                          : question.type === 'short'
                            ? 'Isian singkat'
                            : 'Uraian'}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{question.points} poin</span>
              </div>
              <button
                type="button"
                onClick={() => update(question.id, { flagged: !answers[question.id]?.flagged })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium ${
                  answers[question.id]?.flagged
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Flag className="h-3.5 w-3.5" />
                {answers[question.id]?.flagged ? 'Ditandai' : 'Tandai'}
              </button>
            </div>

            <div className="px-4 py-4 sm:px-6">
              {question.stimulus ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                    {question.stimulus.title}
                  </p>
                  <div
                    className="rich-content text-[13.5px] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(question.stimulus.content) }}
                  />
                </div>
              ) : null}
              <div
                className="rich-content text-[14.5px] leading-relaxed text-slate-800"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(question.content) }}
              />

              {question.type === 'truefalse' ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[14px] font-medium text-slate-800">
                  {question.statement}
                </div>
              ) : null}

              <div className="mt-4">
                {question.type === 'mcq' ? (
                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => {
                      const selected = answers[question.id]?.value === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={timeUp}
                          onClick={() => update(question.id, { value: option.id })}
                          className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition ${
                            selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                          } disabled:opacity-70`}
                        >
                          <span
                            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold ${
                              selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-500'
                            }`}
                          >
                            {String.fromCharCode(65 + optionIndex)}
                          </span>
                          <span
                            className="rich-content flex-1 text-[13.5px] leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(option.text) }}
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === 'complex' ? (
                  <div className="space-y-2">
                    <p className="text-[11.5px] text-slate-500">Pilih semua jawaban yang benar (boleh lebih dari satu).</p>
                    {question.options.map((option, optionIndex) => {
                      const current = Array.isArray(answers[question.id]?.value)
                        ? (answers[question.id]?.value as string[])
                        : [];
                      const selected = current.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition ${
                            selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-700"
                            checked={selected}
                            disabled={timeUp}
                            onChange={(e) =>
                              update(question.id, {
                                value: e.target.checked ? [...current, option.id] : current.filter((v) => v !== option.id),
                              })
                            }
                          />
                          <span className="flex-1">
                            <span className="mr-1 text-[12px] font-semibold text-slate-500">{String.fromCharCode(65 + optionIndex)}.</span>
                            <span
                              className="rich-content text-[13.5px] leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(option.text) }}
                            />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === 'truefalse' ? (
                  <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                    {[true, false].map((value) => {
                      const selected = answers[question.id]?.value === value;
                      return (
                        <button
                          key={String(value)}
                          type="button"
                          disabled={timeUp}
                          onClick={() => update(question.id, { value })}
                          className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-[14px] font-semibold transition ${
                            selected
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {value ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                          {value ? 'Benar' : 'Salah'}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === 'matching' ? (
                  <MatchingAnswer
                    question={question}
                    value={(answers[question.id]?.value as Record<string, string>) ?? {}}
                    disabled={timeUp}
                    onChange={(value) => update(question.id, { value })}
                  />
                ) : null}

                {question.type === 'short' ? (
                  <Input
                    value={typeof answers[question.id]?.value === 'string' ? (answers[question.id]?.value as string) : ''}
                    onChange={(e) => update(question.id, { value: e.target.value })}
                    disabled={timeUp}
                    placeholder="Tulis jawaban singkat…"
                    className="max-w-md"
                  />
                ) : null}

                {question.type === 'essay' ? (
                  <div>
                    <textarea
                      className="input min-h-[180px] w-full"
                      value={typeof answers[question.id]?.value === 'string' ? (answers[question.id]?.value as string) : ''}
                      onChange={(e) => update(question.id, { value: e.target.value })}
                      disabled={timeUp}
                      placeholder="Tulis jawaban uraian Anda di sini…"
                    />
                    <p className="mt-1 text-right text-[11px] text-slate-400">
                      {typeof answers[question.id]?.value === 'string'
                        ? (answers[question.id]?.value as string).length
                        : 0}{' '}
                      karakter
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan jawaban…
                  </>
                ) : dirty > 0 ? (
                  <>
                    <CloudOff className="h-3.5 w-3.5 text-amber-600" /> Ada perubahan belum tersimpan
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Jawaban soal ini tersimpan di server
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={index === 0} onClick={prevQuestion} icon={<ArrowLeft className="h-4 w-4" />}>
                  Sebelumnya
                </Button>
                <Button size="sm" disabled={index >= total - 1} onClick={nextQuestion} iconRight={<ArrowRight className="h-4 w-4" />}>
                  Berikutnya
                </Button>
              </div>
            </div>
          </div>
        </main>

        <aside className="w-full shrink-0 lg:w-[280px]">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card lg:sticky lg:top-[76px]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Navigasi soal</p>
              <span className="text-[11px] text-slate-500">
                {answeredCount}/{total}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
              {questions.map((q, i) => {
                const answered = isAnswered(answers[q.id]?.value ?? null);
                const flagged = answers[q.id]?.flagged;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Soal ${i + 1}${answered ? ' (dijawab)' : ''}${flagged ? ' (ditandai)' : ''}`}
                    className={`relative grid h-9 place-items-center rounded-lg border text-[12.5px] font-semibold transition ${
                      i === index
                        ? 'border-navy-800 bg-navy-800 text-white'
                        : answered
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {i + 1}
                    {flagged ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <p className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-brand-100 ring-1 ring-brand-300" /> Dijawab ({answeredCount})
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-white ring-1 ring-slate-300" /> Belum dijawab ({total - answeredCount})
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Ditandai ({flaggedCount})
              </p>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500">
              Jawaban tersimpan otomatis. Anda tetap dapat mengubah jawaban sampai menekan “Kirim jawaban”.
            </div>
            <Button
              block
              className="mt-3"
              variant="secondary"
              icon={<Lock className="h-4 w-4" />}
              onClick={() => setSubmitOpen(true)}
            >
              Selesai & kirim
            </Button>
          </div>
        </aside>
      </div>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        size="sm"
        title="Kirim jawaban sekarang?"
        description={`${answeredCount} dari ${total} soal sudah dijawab. Setelah dikirim, jawaban tidak dapat diubah.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)} disabled={submitting}>
              Periksa lagi
            </Button>
            <Button loading={submitting} onClick={() => void submit()} icon={<Send className="h-4 w-4" />}>
              Kirim jawaban
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {answeredCount < total ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Masih ada {total - answeredCount} soal belum dijawab{flaggedCount > 0 ? ` dan ${flaggedCount} soal ditandai` : ''}.
            </p>
          ) : null}
          <div>
            <label className="label" htmlFor="submit-token">
              Token kirim dari proktor
            </label>
            <Input
              id="submit-token"
              value={submitToken}
              onChange={(e) => setSubmitToken(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              className="text-center font-mono text-lg tracking-[0.2em]"
              autoFocus
            />
          </div>
          {minSubmitLeft > 0 ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-navy-50 p-2 text-[12px] text-navy-800">
              <Timer className="mt-0.5 h-4 w-4 shrink-0" />
              Anda baru dapat mengirim setelah {Math.ceil(minSubmitLeft / 60000)} menit lagi (aturan minimal waktu
              pengerjaan, diperiksa server).
            </p>
          ) : null}
          {submitError ? <p className="rounded-lg bg-red-50 p-2 text-[12.5px] text-red-800">{submitError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        size="sm"
        title="Keluar dari halaman ujian?"
        description="Waktu tetap berjalan. Anda dapat kembali selama sesi masih terbuka."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              Tetap di sini
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void flush();
                navigate('/siswa');
              }}
            >
              Keluar
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-slate-600">
          Jawaban yang belum tersimpan akan dicoba dikirim sebelum keluar. Jangan menutup browser bila indikator masih
          “Menyimpan…”.
        </p>
      </Modal>

      {timeUp ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-pop">
            <Timer className="mx-auto h-10 w-10 text-red-600" />
            <p className="mt-2 text-lg font-bold text-navy-900">Waktu pengerjaan habis</p>
            <p className="mt-1 text-[13px] text-slate-500">
              Jawaban Anda akan difinalisasi oleh server. Jika belum terkirim, mintalah bantuan proktor untuk
              memastikan hasil tercatat.
            </p>
            <Button className="mt-4" onClick={() => void submit()} loading={submitting}>
              Kirim dengan token
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchingAnswer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: VersionQuestion;
  value: Record<string, string>;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-slate-500">Pilih pasangan yang sesuai untuk setiap pernyataan.</p>
      {question.pairs.map((pair) => (
        <div key={pair.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2.5 sm:flex-row sm:items-center">
          <span className="flex-1 text-[13px] text-slate-800">{pair.left}</span>
          <select
            className="input !w-full cursor-pointer sm:!w-64"
            value={value[pair.id] ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [pair.id]: e.target.value })}
          >
            <option value="">Pilih pasangan…</option>
            {question.pairs.map((option) => (
              <option key={option.id} value={option.id}>
                {option.right}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
