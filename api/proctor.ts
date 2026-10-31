import { endpoint, json, type ApiRequest, type ApiResponse } from './_lib/http';
import { requireAuth, type AuthContext } from './_lib/auth';
import { errors } from './_lib/errors';
import { getStore } from './_lib/store';
import { parseBody } from './_lib/rest';
import { incidentSchema, issueTokenSchema, moveParticipantSchema, revokeTokenSchema } from '../src/shared/schemas';
import { hasPermission } from '../src/shared/permissions';
import {
  createIncident,
  getSessionSummary,
  setParticipantAttendance,
  listIncidents,
  listSessionParticipants,
  listSessionsForProctor,
  moveParticipant,
  openSession,
  closeSession,
} from './_lib/services/sessions';
import { issueSessionToken, revokeSessionToken } from './_lib/services/tokens';
import type { ExamToken } from '../src/shared/types';

function requireProctorAccess(auth: AuthContext): void {
  if (
    !auth.roles.includes('proctor') &&
    !auth.roles.includes('admin') &&
    !auth.roles.includes('superadmin')
  ) {
    throw errors.forbidden('Hanya proktor atau administrator yang dapat mengakses modul ini.');
  }
}

async function handleTokens(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  requireProctorAccess(auth);
  if (req.method === 'GET') {
    const sessionId = req.query.sessionId;
    if (!sessionId) throw errors.validation('sessionId wajib diisi.');
    await getSessionSummary(auth, sessionId);
    const store = await getStore();
    const tokens = await store.query<ExamToken>('examTokens', {
      where: [{ field: 'sessionId', op: '==', value: sessionId }],
      limit: 50,
    });
    return json({
      items: tokens
        .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))
        .map((t) => ({
          id: t.id,
          kind: t.kind,
          issuedAt: t.issuedAt,
          expiresAt: t.expiresAt,
          revokedAt: t.revokedAt,
          uses: t.uses,
          lastUsedAt: t.lastUsedAt,
          status: t.revokedAt
            ? 'revoked'
            : new Date(t.expiresAt).getTime() <= Date.now()
              ? 'expired'
              : 'active',
        })),
      note: 'Token asli tidak pernah disimpan. Nilai token hanya ditampilkan sekali saat diterbitkan.',
    });
  }
  if (req.method === 'POST' && req.query.action === 'issue') {
    const body = await parseBody(issueTokenSchema, req.body);
    const result = await issueSessionToken(auth, {
      kind: body.kind,
      sessionId: body.sessionId,
      ttlMinutes: body.ttlMinutes,
      ip: req.ip,
    });
    return json(result, 201);
  }
  if (req.method === 'POST' && req.query.action === 'revoke') {
    const body = await parseBody(revokeTokenSchema, req.body);
    await revokeSessionToken(auth, body.tokenId, req.ip);
    return json({ ok: true });
  }
  throw errors.validation('Aksi token tidak dikenal.');
}

export default endpoint(async (req) => {
  const resource = req.query.resource ?? '';
  const auth = await requireAuth(req);
  const action = req.query.action ?? '';

  if (resource === 'sessions' && req.method === 'GET') {
    requireProctorAccess(auth);
    if (req.query.id) {
      return json(await getSessionSummary(auth, req.query.id));
    }
    const sessions = await listSessionsForProctor(auth, {
      date: req.query.date,
      all: req.query.all === '1',
    });
    return json({ items: sessions });
  }

  if (resource === 'participants' && req.method === 'GET') {
    requireProctorAccess(auth);
    const sessionId = req.query.sessionId;
    if (!sessionId) throw errors.validation('sessionId wajib diisi.');
    return json(
      await listSessionParticipants(auth, sessionId, {
        classId: req.query.classId,
        status: req.query.status,
        search: req.query.q,
      }),
    );
  }

  if (resource === 'tokens') return handleTokens(auth, req);

  if (resource === 'incidents') {
    if (req.method === 'GET') {
      const sessionId = req.query.sessionId;
      if (!sessionId) throw errors.validation('sessionId wajib diisi.');
      return json({ items: await listIncidents(auth, sessionId) });
    }
    if (req.method === 'POST') {
      const body = await parseBody(incidentSchema, req.body);
      const incident = await createIncident(auth, body, req.ip);
      return json({ doc: incident }, 201);
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'attendance' && req.method === 'POST') {
    const body = (req.body ?? {}) as { participantId?: string; attendance?: string };
    if (!body.participantId) throw errors.validation('participantId wajib diisi.');
    if (!['present', 'absent', 'excused'].includes(String(body.attendance))) {
      throw errors.validation('Status kehadiran tidak valid.');
    }
    const doc = await setParticipantAttendance(
      auth,
      {
        participantId: body.participantId,
        attendance: body.attendance as 'present' | 'absent' | 'excused',
      },
      req.ip,
    );
    return json({ doc });
  }

  if (resource === 'move' && req.method === 'POST') {
    const body = await parseBody(moveParticipantSchema, req.body);
    const participant = await moveParticipant(auth, body, req.ip);
    return json({ doc: participant });
  }

  if (resource === 'session-control' && req.method === 'POST') {
    requireProctorAccess(auth);
    const sessionId = (req.body as { sessionId?: string }).sessionId ?? req.query.id ?? '';
    if (!sessionId) throw errors.validation('sessionId wajib diisi.');
    if (action === 'open') return json(await openSession(auth, sessionId, req.ip));
    if (action === 'close') return json(await closeSession(auth, sessionId, req.ip));
    throw errors.validation('Aksi sesi tidak dikenal.');
  }

  if (resource === 'can-manage' && req.method === 'GET') {
    return json({
      canIssue: hasPermission(auth.roles, 'token.issue'),
      canOpen: hasPermission(auth.roles, 'session.open'),
      proctor: auth.proctor
        ? { id: auth.proctor.id, name: auth.proctor.fullName, roomIds: auth.proctor.roomIds }
        : null,
    });
  }

  throw errors.validation(`Resource proktor "${resource}" tidak dikenal.`);
});
