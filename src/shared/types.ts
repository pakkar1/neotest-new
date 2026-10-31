/**
 * Domain model NeoTest.
 * Tipe ini dipakai bersama oleh frontend, Vercel Functions, dan skrip.
 * Semua koleksi di Firestore memakai `id` sebagai ID dokumen stabil.
 */

export type Role = 'superadmin' | 'admin' | 'teacher' | 'proctor' | 'student';

export const ROLES: Role[] = ['superadmin', 'admin', 'teacher', 'proctor', 'student'];

export type Semester = 'ganjil' | 'genap';
export type QuestionType =
  | 'mcq'
  | 'complex'
  | 'truefalse'
  | 'matching'
  | 'short'
  | 'essay';

export type QuestionStatus = 'draft' | 'review' | 'ready';
export type Difficulty = 'mudah' | 'sedang' | 'sulit';

export interface BaseDoc {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  /** Kunci pencarian berawalan yang sudah dinormalisasi (huruf kecil). */
  searchKey?: string;
}

/* ------------------------------------------------------------------ */
/* Sekolah & pengaturan                                                */
/* ------------------------------------------------------------------ */

export interface Letterhead {
  headmasterName: string;
  headmasterNip: string;
  /** Teks tambahan pada ruang tanda tangan, mis. "Dinas Pendidikan Kota ..." */
  authorityLine?: string;
  /** Keterangan stempel (dicetak sebagai ruang stempel). */
  stampNote?: string;
}

export interface School extends BaseDoc {
  code: string;
  npsn: string;
  name: string;
  level: 'SMP' | 'MTs';
  address: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  logoUrl?: string;
  active: boolean;
  letterhead: Letterhead;
}

export interface AcademicYear extends BaseDoc {
  schoolId: string;
  year: string;
  semester: Semester;
  startDate: string;
  endDate: string;
  active: boolean;
}

export interface ClassRoom extends BaseDoc {
  schoolId: string;
  name: string;
  level: 7 | 8 | 9;
  academicYearId: string;
  homeroomTeacherId?: string;
  active: boolean;
}

export interface Subject extends BaseDoc {
  schoolId: string;
  code: string;
  name: string;
  level: 'SMP' | 'MTs';
  gradeLevel: 7 | 8 | 9;
  active: boolean;
}

export interface ExamRoom extends BaseDoc {
  schoolId: string;
  name: string;
  capacity: number;
  location?: string;
}

/* ------------------------------------------------------------------ */
/* Akun & roster                                                       */
/* ------------------------------------------------------------------ */

export interface User extends BaseDoc {
  /** UID Firebase Auth (diisi server pada mode Firebase). */
  uid?: string;
  email: string;
  username?: string;
  displayName: string;
  roles: Role[];
  schoolId: string | null;
  active: boolean;
  phone?: string;
  lastLoginAt?: string;
  /** Hanya ada di driver demo (JSON). Tidak pernah dikembalikan API. */
  passwordHash?: string;
}

export interface Student extends BaseDoc {
  schoolId: string;
  userId: string;
  nisn: string;
  participantNo: string;
  fullName: string;
  gender: 'L' | 'P';
  classId: string;
  active: boolean;
}

export interface Teacher extends BaseDoc {
  schoolId: string;
  userId: string;
  nip: string;
  fullName: string;
  email: string;
  subjectIds: string[];
  active: boolean;
}

export interface Proctor extends BaseDoc {
  schoolId: string;
  userId: string;
  nip?: string;
  fullName: string;
  email: string;
  roomIds: string[];
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Bank soal                                                           */
/* ------------------------------------------------------------------ */

export interface Stimulus extends BaseDoc {
  schoolId: string;
  title: string;
  /** HTML tersanitasi */
  content: string;
  imageUrl?: string;
  tableHtml?: string;
}

export interface QuestionOption {
  id: string;
  /** HTML tersanitasi (boleh berisi teks/gambar) */
  text: string;
}

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

/**
 * Soal tanpa kunci jawaban. Kunci disimpan terpisah di koleksi `answerKeys`
 * dan hanya dapat dibaca jalur server.
 */
export interface Question extends BaseDoc {
  schoolId: string;
  bankId: string;
  subjectId: string;
  type: QuestionType;
  stimulusId?: string | null;
  /** HTML tersanitasi */
  content: string;
  options: QuestionOption[];
  pairs: MatchPair[];
  /** Untuk truefalse: pernyataan yang dinilai. */
  statement?: string;
  /** Untuk short: jumlah jawaban yang diterima (untuk UI), kunci ada di answerKeys. */
  acceptedCount?: number;
  points: number;
  difficulty: Difficulty;
  tags: string[];
  competency?: string;
  status: QuestionStatus;
  explanation?: string;
  createdBy: string;
  updatedBy?: string;
}

export interface QuestionKey {
  id: string;
  questionId: string;
  type: QuestionType;
  /** mcq: optionId; complex: optionId[]; truefalse: boolean; matching: [leftId,rightId][]; short: string[]; essay: rubric[] */
  correct: unknown;
  points: number;
  rubric?: { id: string; criterion: string; points: number }[];
}

export interface QuestionBank extends BaseDoc {
  schoolId: string;
  name: string;
  subjectId: string;
  academicYearId: string;
  description?: string;
}

/* ------------------------------------------------------------------ */
/* Jenis ujian, paket, jadwal, sesi                                    */
/* ------------------------------------------------------------------ */

export type AssessmentType = 'tka' | 'pts' | 'pas' | 'ulangan' | 'tryout';
export type NavigationMode = 'free' | 'sequential';
export type ResultPublishMode = 'immediate' | 'manual' | 'after_session' | 'never';
export type ScoringMethod = 'auto' | 'hybrid';

export interface ExamType extends BaseDoc {
  schoolId: string;
  name: string;
  code: string;
  description: string;
  academicYearId: string;
  assessmentType: AssessmentType;
  durationMinutes: number;
  scoringMethod: ScoringMethod;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  navigation: NavigationMode;
  allowAnswerReview: boolean;
  /** Waktu minimal (menit) sejak mulai sebelum token submit boleh dipakai. */
  minSubmitMinutes: number;
  resultPublish: ResultPublishMode;
  passingScore: number;
  active: boolean;
}

export type FormStatus = 'draft' | 'review' | 'ready' | 'published' | 'archived';

export interface ExamForm extends BaseDoc {
  schoolId: string;
  examTypeId: string;
  subjectId: string;
  academicYearId: string;
  name: string;
  description?: string;
  questionIds: string[];
  status: FormStatus;
  currentVersionId?: string | null;
  currentVersion?: number;
  totalPoints?: number;
  createdBy: string;
}

export interface ExamFormVersion {
  id: string;
  formId: string;
  schoolId: string;
  version: number;
  examTypeId: string;
  subjectId: string;
  totalPoints: number;
  questionIdsOrdered: string[];
  createdAt: string;
  createdBy: string;
  checksum: string;
}

/** Snapshot soal pada saat paket diterbitkan. Tidak memuat kunci jawaban. */
export interface VersionQuestion {
  id: string;
  versionId: string;
  formId: string;
  questionId: string;
  order: number;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  pairs: MatchPair[];
  statement?: string;
  points: number;
  stimulus?: { title: string; content: string; imageUrl?: string; tableHtml?: string } | null;
  tags: string[];
  competency?: string;
}

export type ScheduleStatus =
  | 'preparation'
  | 'scheduled'
  | 'ongoing'
  | 'completed'
  | 'cancelled';

export interface ExamSchedule extends BaseDoc {
  schoolId: string;
  examTypeId: string;
  formId: string;
  formVersionId: string;
  subjectId: string;
  academicYearId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  classIds: string[];
  durationMinutes: number;
  status: ScheduleStatus;
  sessionCount: number;
  participantCount: number;
}

export type SessionStatus = 'preparation' | 'open' | 'closed';

export interface ExamSession {
  id: string;
  schoolId: string;
  scheduleId: string;
  code: string;
  roomId: string;
  proctorId: string;
  startsAt: string;
  endsAt: string;
  openedAt?: string | null;
  openedBy?: string | null;
  closedAt?: string | null;
  status: SessionStatus;
  participantCount: number;
  startTokenId?: string | null;
  submitTokenId?: string | null;
}

export type ParticipantStatus =
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_submit'
  | 'submitted'
  | 'finished';

export type AttendanceStatus = 'present' | 'absent' | 'excused';

export interface ExamParticipant {
  id: string;
  schoolId: string;
  scheduleId: string;
  sessionId: string;
  examTypeId: string;
  formVersionId: string;
  studentId: string;
  classId: string;
  participantNo: string;
  fullName: string;
  roomId: string;
  proctorId: string;
  status: ParticipantStatus;
  attendance: AttendanceStatus;
  startedAt?: string | null;
  submittedAt?: string | null;
  lastSeenAt?: string | null;
  movedFrom?: { roomId: string; sessionId: string; at: string; by: string } | null;
}

/* ------------------------------------------------------------------ */
/* Pengerjaan                                                          */
/* ------------------------------------------------------------------ */

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired' | 'graded';

export interface ExamAttempt {
  id: string;
  schoolId: string;
  scheduleId: string;
  sessionId: string;
  roomId: string;
  proctorId: string;
  studentId: string;
  classId: string;
  examTypeId: string;
  formId: string;
  formVersionId: string;
  status: AttemptStatus;
  startedAt: string;
  endsAt: string;
  submittedAt?: string | null;
  lastSavedAt?: string | null;
  submitTokenId?: string | null;
  autoSubmitted?: boolean;
  focusLossCount: number;
  connectionLossCount: number;
  clientUserAgent?: string;
  score?: number | null;
  maxScore?: number | null;
  gradedAt?: string | null;
  gradedBy?: string | null;
  resultStatus?: 'pending' | 'final' | 'published';
}

export interface ResponseValueDoc {
  id: string;
  attemptId: string;
  scheduleId: string;
  schoolId: string;
  studentId: string;
  questionId: string;
  /** mcq: string; complex: string[]; truefalse: boolean; matching: Record<string,string>; short: string; essay: string */
  value: unknown;
  seq: number;
  flagged?: boolean;
  updatedAt: string;
  timeSpentMs?: number;
}

export type TokenKind = 'start' | 'submit';

export interface ExamToken {
  id: string;
  kind: TokenKind;
  schoolId: string;
  scheduleId: string;
  sessionId: string;
  roomId: string;
  examTypeId: string;
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revokedBy?: string | null;
  rotatedFrom?: string | null;
  uses: number;
  lastUsedAt?: string | null;
}

export interface TokenIssueResult {
  tokenId: string;
  /** Plaintext hanya sekali, untuk proktor berwenang. */
  token: string;
  kind: TokenKind;
  expiresAt: string;
  sessionId: string;
  roomId: string;
}

/* ------------------------------------------------------------------ */
/* Hasil & analisis                                                    */
/* ------------------------------------------------------------------ */

export interface ExamResult {
  id: string;
  schoolId: string;
  scheduleId: string;
  sessionId: string;
  studentId: string;
  classId: string;
  formVersionId: string;
  examTypeId: string;
  status: 'pending_grading' | 'final' | 'published';
  score: number;
  maxScore: number;
  percent: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  essayPending: number;
  durationSec: number;
  submittedAt: string | null;
  gradedBy?: string | null;
  gradedAt?: string | null;
  publishedAt?: string | null;
  manualScores?: Record<string, number>;
}

export interface IncidentReport extends BaseDoc {
  schoolId: string;
  scheduleId: string;
  sessionId: string;
  roomId: string;
  proctorId: string;
  studentId?: string | null;
  type: 'listrik' | 'internet' | 'perangkat' | 'kecurangan' | 'lainnya';
  description: string;
  action?: string;
  createdAtCustom?: string;
}

export interface AuditLog {
  id: string;
  schoolId: string | null;
  actorId: string;
  actorName: string;
  actorRole: Role | 'system';
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface AppSettings {
  id: string;
  schoolId: string | null;
  branding: {
    appName: string;
    tagline: string;
    primaryColor: string;
  };
  security: {
    maxFailedLogin: number;
    tokenTtlDefaultMinutes: number;
    submitTokenTtlMinutes: number;
    allowStudentIpLock: boolean;
  };
  quota: {
    enabled: boolean;
    dailyReadWarning: number;
    dailyWriteWarning: number;
  };
}

/* ------------------------------------------------------------------ */
/* API helper types                                                    */
/* ------------------------------------------------------------------ */

export interface SessionUser {
  id: string;
  uid?: string;
  email: string;
  displayName: string;
  roles: Role[];
  schoolId: string | null;
  schoolName?: string;
  studentId?: string;
  participantNo?: string;
  classId?: string;
}

export interface AuthSession {
  user: SessionUser;
  mode: 'demo' | 'firebase';
  token: string;
  expiresAt?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface QuotaSnapshot {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
  estimated: boolean;
  warning?: string | null;
  limits: { reads: number; writes: number };
}

export interface DashboardStats {
  role: Role;
  cards: { key: string; label: string; value: string; hint?: string; tone?: string }[];
  upcoming: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    sessionCount: number;
  }[];
  activity: { id: string; action: string; actor: string; at: string; targetType: string }[];
  quota?: QuotaSnapshot;
}

/* ------------------------------------------------------------------ */
/* Tampilan pengerjaan ujian                                           */
/* ------------------------------------------------------------------ */

export interface AttemptView {
  attempt: ExamAttempt;
  participant: ExamParticipant;
  schedule: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  };
  session: { id: string; code: string; roomName: string; proctorName: string };
  examType: Pick<
    ExamType,
    | 'id'
    | 'name'
    | 'navigation'
    | 'allowAnswerReview'
    | 'minSubmitMinutes'
    | 'resultPublish'
    | 'shuffleQuestions'
    | 'shuffleOptions'
  >;
  subjectName: string;
  questions: VersionQuestion[];
  responses: {
    questionId: string;
    value: unknown;
    flagged: boolean;
    seq: number;
    updatedAt: string;
  }[];
  serverNow: string;
  remainingMs: number;
  totalPoints: number;
}

export interface AttemptReviewQuestion {
  question: VersionQuestion;
  value: unknown;
  score: number | null;
  maxPoints: number;
  correct: boolean | null;
  blank: boolean;
  key: unknown;
  explanation?: string;
  essayPending?: boolean;
}

export interface AttemptReview {
  attempt: ExamAttempt;
  result: ExamResult | null;
  questions: AttemptReviewQuestion[];
  allowReview: boolean;
  message?: string;
}

export interface StudentExamCard {
  participant: ExamParticipant;
  schedule: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  };
  session: { id: string; code: string; roomName: string; proctorName: string; status: SessionStatus; startsAt: string; endsAt: string };
  examType: { id: string; name: string; assessmentType: string; navigation: NavigationMode; minSubmitMinutes: number };
  subjectName: string;
  attempt: Pick<ExamAttempt, 'id' | 'status' | 'startedAt' | 'endsAt' | 'submittedAt' | 'lastSavedAt'> | null;
  resultPublished: boolean;
}

/* ------------------------------------------------------------------ */
/* Konfigurasi aplikasi (publik)                                       */
/* ------------------------------------------------------------------ */

export interface AppConfig {
  appName: string;
  tagline: string;
  mode: 'demo' | 'firebase';
  demo: boolean;
  demoEphemeral: boolean;
  demoPassword: string | null;
  schoolName: string | null;
  serverNow: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  } | null;
  features: { appCheck: boolean; recaptcha: boolean };
  limits: { reads: number; writes: number; note: string };
}

export interface OptionItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface OptionsResponse {
  schoolId: string;
  classes: { id: string; name: string; level: number; academicYearId: string }[];
  subjects: { id: string; name: string; code: string }[];
  academicYears: { id: string; year: string; semester: Semester; active: boolean }[];
  rooms: { id: string; name: string; capacity: number }[];
  proctors: { id: string; name: string; roomIds: string[] }[];
  teachers: { id: string; name: string }[];
  schools: { id: string; name: string; code: string }[];
}
