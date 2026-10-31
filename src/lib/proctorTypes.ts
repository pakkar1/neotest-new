import type { ExamSession } from '../shared/types';

/** Bentuk ringkasan sesi dari api/_lib/services/sessions.ts */
export interface SessionSummary {
  session: ExamSession;
  schedule: { id: string; title: string; date: string; startTime: string; endTime: string; formVersionId: string };
  room: { id: string; name: string };
  proctor: { id: string; fullName: string };
  subjectName: string;
  scheduleStatus: string;
  counts: {
    scheduled: number;
    inProgress: number;
    awaitingSubmit: number;
    submitted: number;
    finished: number;
    absent: number;
    total: number;
  };
  activeStartToken?: { id: string; expiresAt: string; revokedAt: string | null } | null;
  activeSubmitToken?: { id: string; expiresAt: string; revokedAt: string | null } | null;
}

export interface ParticipantRow {
  id: string;
  participantNo: string;
  fullName: string;
  className: string;
  status: string;
  attendance: string;
  attemptId: string | null;
  attemptStatus: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  lastSavedAt: string | null;
}

export interface TokenRow {
  id: string;
  kind: 'start' | 'submit';
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  uses: number;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export interface IncidentRow {
  id: string;
  sessionId: string;
  studentId?: string | null;
  type: string;
  description: string;
  action?: string;
  reportedBy: string;
  reportedByName?: string;
  createdAt: string;
}
