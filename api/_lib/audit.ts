import { newId } from './ids';
import { serverNowIso } from './clock';
import { getStore } from './store';
import type { AuditLog, Role } from '../../src/shared/types';

export const AUDIT_ACTIONS = {
  loginSuccess: 'auth.login.success',
  loginFailed: 'auth.login.failed',
  logout: 'auth.logout',
  sessionOpen: 'session.open',
  sessionClose: 'session.close',
  tokenIssue: 'token.issue',
  tokenRevoke: 'token.revoke',
  tokenValidateFailed: 'token.validate.failed',
  attemptStart: 'attempt.start',
  attemptSubmit: 'attempt.submit',
  attemptExpire: 'attempt.expire',
  answerOverride: 'response.override',
  participantMove: 'participant.move',
  attendanceMark: 'attendance.mark',
  gradeChange: 'result.grade.change',
  resultPublish: 'result.publish',
  formPublish: 'form.publish',
  roleChange: 'user.role.change',
  userCreate: 'user.create',
  userDelete: 'user.delete',
  studentImport: 'student.import',
  demoReset: 'demo.reset',
  settingsChange: 'settings.change',
  incidentCreate: 'incident.create',
  printDocument: 'report.print',
} as const;

export interface AuditInput {
  schoolId: string | null;
  actorId: string;
  actorName: string;
  actorRole: Role | 'system';
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
  ip?: string;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const store = await getStore();
    const log: AuditLog = {
      id: newId('audit'),
      schoolId: input.schoolId,
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta,
      ip: input.ip,
      createdAt: serverNowIso(),
    };
    await store.set('auditLogs', log.id, log);
  } catch (err) {
    // Audit tidak boleh menggagalkan operasi utama, tetapi harus terlihat di log.
    console.error('[neotest] gagal menulis audit', input.action, err instanceof Error ? err.message : err);
  }
}
