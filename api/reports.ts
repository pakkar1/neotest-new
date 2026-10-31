import { endpoint, json, type ApiResponse } from './_lib/http';
import { requireAuth } from './_lib/auth';
import { errors } from './_lib/errors';
import { getStore } from './_lib/store';
import { hasPermission } from '../src/shared/permissions';
import type { ExamSchedule, ExamSession, ExamType, Subject } from '../src/shared/types';
import { buildAttendanceDocument, buildBeritaAcara } from './_lib/services/sessions';
import {
  buildExamResultsReport,
  buildItemAnalysis,
  exportResultsCsv,
} from './_lib/services/reports';

export default endpoint(async (req) => {
  const auth = await requireAuth(req);
  const resource = req.query.resource ?? 'results';
  if (req.method !== 'GET') throw errors.validation('Laporan hanya mendukung GET.');

  if (resource === 'schedules') {
    if (!hasPermission(auth.roles, 'analysis.read') && !hasPermission(auth.roles, 'result.read')) {
      throw errors.forbidden();
    }
    const store = await getStore();
    const schedules = await store.query<ExamSchedule>('examSchedules', {
      where: auth.schoolId ? [{ field: 'schoolId', op: '==', value: auth.schoolId }] : [],
      limit: 300,
    });
    const [sessions, subjects, types] = await Promise.all([
      store.query<ExamSession>('examSessions', {
        where: auth.schoolId ? [{ field: 'schoolId', op: '==', value: auth.schoolId }] : [],
        limit: 500,
      }),
      store.query<Subject>('subjects', {
        where: auth.schoolId ? [{ field: 'schoolId', op: '==', value: auth.schoolId }] : [],
        limit: 300,
      }),
      store.query<ExamType>('examTypes', {
        where: auth.schoolId ? [{ field: 'schoolId', op: '==', value: auth.schoolId }] : [],
        limit: 300,
      }),
    ]);
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
    const typeMap = new Map(types.map((t) => [t.id, t.name]));
    const teacherSubjects = auth.teacher?.subjectIds ?? [];
    const items = schedules
      .filter((s) => !auth.roles.includes('teacher') || teacherSubjects.length === 0 || teacherSubjects.includes(s.subjectId))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((s) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        subjectId: s.subjectId,
        subjectName: subjectMap.get(s.subjectId) ?? '',
        examTypeName: typeMap.get(s.examTypeId) ?? '',
        participantCount: s.participantCount,
        sessionCount: sessions.filter((x) => x.scheduleId === s.id).length,
      }));
    return json({ items });
  }

  if (resource === 'results') {
    const scheduleId = req.query.scheduleId;
    if (!scheduleId) throw errors.validation('scheduleId wajib diisi.');
    return json(
      await buildExamResultsReport(auth, scheduleId, {
        classId: req.query.classId || undefined,
        sessionId: req.query.sessionId || undefined,
      }),
    );
  }

  if (resource === 'item-analysis') {
    const scheduleId = req.query.scheduleId;
    if (!scheduleId) throw errors.validation('scheduleId wajib diisi.');
    return json(await buildItemAnalysis(auth, scheduleId));
  }

  if (resource === 'attendance') {
    const sessionId = req.query.sessionId;
    if (!sessionId) throw errors.validation('sessionId wajib diisi.');
    return json(await buildAttendanceDocument(auth, sessionId));
  }

  if (resource === 'berita-acara') {
    const sessionId = req.query.sessionId;
    if (!sessionId) throw errors.validation('sessionId wajib diisi.');
    return json(await buildBeritaAcara(auth, sessionId));
  }

  if (resource === 'export-results') {
    const scheduleId = req.query.scheduleId;
    if (!scheduleId) throw errors.validation('scheduleId wajib diisi.');
    const { filename, csv } = await exportResultsCsv(auth, scheduleId);
    const response: ApiResponse = {
      raw: csv,
      contentType: 'text/csv; charset=utf-8',
      headers: { 'Content-Disposition': `attachment; filename="${filename}"` },
    };
    return response;
  }

  throw errors.validation(`Laporan "${resource}" tidak dikenal.`);
});
