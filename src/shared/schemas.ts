import { z } from 'zod';

export const roleSchema = z.enum(['superadmin', 'admin', 'teacher', 'proctor', 'student']);

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email/username wajib diisi').max(120),
  password: z.string().min(1, 'Password wajib diisi').max(200),
});

export const schoolSchema = z.object({
  code: z.string().trim().min(2).max(20),
  npsn: z.string().trim().min(6).max(20),
  name: z.string().trim().min(3).max(120),
  level: z.enum(['SMP', 'MTs']),
  address: z.string().trim().min(3).max(240),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().email().max(120),
  logoUrl: z.string().trim().max(400).optional().default(''),
  active: z.boolean().default(true),
  letterhead: z
    .object({
      headmasterName: z.string().trim().max(120).default(''),
      headmasterNip: z.string().trim().max(40).default(''),
      authorityLine: z.string().trim().max(160).optional().default(''),
      stampNote: z.string().trim().max(120).optional().default(''),
    })
    .default({ headmasterName: '', headmasterNip: '' }),
});

export const academicYearSchema = z.object({
  schoolId: z.string().min(1),
  year: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Format tahun ajaran: 2025/2026'),
  semester: z.enum(['ganjil', 'genap']),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  active: z.boolean().default(false),
});

export const classSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  level: z.coerce.number().int().min(7).max(9),
  academicYearId: z.string().min(1),
  homeroomTeacherId: z.string().optional().default(''),
  active: z.boolean().default(true),
});

export const subjectSchema = z.object({
  schoolId: z.string().min(1),
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(80),
  level: z.enum(['SMP', 'MTs']),
  gradeLevel: z.coerce.number().int().min(7).max(9),
  active: z.boolean().default(true),
});

export const roomSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  capacity: z.coerce.number().int().min(1).max(200),
  location: z.string().trim().max(120).optional().default(''),
});

export const userCreateSchema = z.object({
  schoolId: z.string().min(1).nullable(),
  email: z.string().trim().email().max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya huruf, angka, titik, garis bawah, strip')
    .optional(),
  displayName: z.string().trim().min(2).max(120),
  roles: z.array(roleSchema).min(1),
  password: z.string().min(8, 'Minimal 8 karakter').max(128).optional(),
  phone: z.string().trim().max(30).optional().default(''),
  active: z.boolean().default(true),
});

export const studentSchema = z.object({
  schoolId: z.string().min(1),
  nisn: z.string().trim().regex(/^\d{6,12}$/, 'NISN harus 6–12 digit'),
  participantNo: z.string().trim().min(1).max(20),
  fullName: z.string().trim().min(2).max(120),
  gender: z.enum(['L', 'P']),
  classId: z.string().min(1),
  active: z.boolean().default(true),
});

export const teacherSchema = z.object({
  schoolId: z.string().min(1),
  nip: z.string().trim().max(30).optional().default(''),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(120),
  subjectIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

export const proctorSchema = z.object({
  schoolId: z.string().min(1),
  nip: z.string().trim().max(30).optional().default(''),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(120),
  roomIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

export const examTypeSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30),
  description: z.string().trim().max(500).optional().default(''),
  academicYearId: z.string().min(1),
  assessmentType: z.enum(['tka', 'pts', 'pas', 'ulangan', 'tryout']),
  durationMinutes: z.coerce.number().int().min(5).max(360),
  scoringMethod: z.enum(['auto', 'hybrid']).default('auto'),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  navigation: z.enum(['free', 'sequential']).default('free'),
  allowAnswerReview: z.boolean().default(true),
  minSubmitMinutes: z.coerce.number().int().min(0).max(300).default(45),
  resultPublish: z.enum(['immediate', 'manual', 'after_session', 'never']).default('after_session'),
  passingScore: z.coerce.number().min(0).max(100).default(70),
  active: z.boolean().default(true),
});

export const questionSchema = z.object({
  schoolId: z.string().min(1),
  bankId: z.string().min(1),
  subjectId: z.string().min(1),
  type: z.enum(['mcq', 'complex', 'truefalse', 'matching', 'short', 'essay']),
  stimulusId: z.string().nullable().optional(),
  content: z.string().trim().min(1, 'Isi soal wajib diisi').max(20000),
  options: z
    .array(z.object({ id: z.string().min(1), text: z.string().max(4000) }))
    .default([]),
  pairs: z.array(z.object({ id: z.string().min(1), left: z.string().max(1000), right: z.string().max(1000) })).default([]),
  statement: z.string().max(4000).optional().default(''),
  points: z.coerce.number().min(0.5).max(100),
  difficulty: z.enum(['mudah', 'sedang', 'sulit']),
  tags: z.array(z.string().max(40)).max(20).default([]),
  competency: z.string().max(160).optional().default(''),
  status: z.enum(['draft', 'review', 'ready']),
  explanation: z.string().max(8000).optional().default(''),
  key: z.object({
    correct: z.unknown(),
    rubric: z
      .array(z.object({ id: z.string(), criterion: z.string().max(500), points: z.coerce.number().min(0) }))
      .optional(),
  }),
});

export const formSchema = z.object({
  schoolId: z.string().min(1),
  examTypeId: z.string().min(1),
  subjectId: z.string().min(1),
  academicYearId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(''),
  questionIds: z.array(z.string()).min(1, 'Pilih minimal satu soal'),
  status: z.enum(['draft', 'review', 'ready']).default('draft'),
});

export const scheduleSchema = z.object({
  schoolId: z.string().min(1),
  examTypeId: z.string().min(1),
  formId: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  date: z.string().min(8),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  classIds: z.array(z.string()).min(1, 'Pilih minimal satu kelas'),
  sessions: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(30),
        roomId: z.string().min(1),
        proctorId: z.string().min(1),
        startsAt: z.string().min(10),
        endsAt: z.string().min(10),
      }),
    )
    .min(1),
  durationMinutes: z.coerce.number().int().min(5).max(360),
});

export const openSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const issueTokenSchema = z.object({
  kind: z.enum(['start', 'submit']),
  sessionId: z.string().min(1),
  ttlMinutes: z.coerce.number().int().min(1).max(240).optional(),
});

export const revokeTokenSchema = z.object({
  tokenId: z.string().min(1),
});

export const startExamSchema = z.object({
  scheduleId: z.string().min(1),
  sessionId: z.string().min(1),
  token: z.string().trim().min(4).max(40),
});

export const saveResponseSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  value: z.unknown(),
  seq: z.coerce.number().int().min(0),
  flagged: z.boolean().optional(),
  timeSpentMs: z.coerce.number().int().min(0).max(6 * 60 * 60 * 1000).optional(),
});

export const submitAttemptSchema = z.object({
  attemptId: z.string().min(1),
  token: z.string().trim().min(4).max(40),
  reason: z.enum(['manual', 'timeout', 'proctor']).default('manual'),
});

export const expireAttemptSchema = z.object({
  attemptId: z.string().min(1),
});

export const incidentSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().optional().nullable(),
  type: z.enum(['listrik', 'internet', 'perangkat', 'kecurangan', 'lainnya']),
  description: z.string().trim().min(3).max(1000),
  action: z.string().trim().max(500).optional().default(''),
});

export const moveParticipantSchema = z.object({
  participantId: z.string().min(1),
  targetSessionId: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
});

export const gradeEssaySchema = z.object({
  attemptId: z.string().min(1),
  scores: z.record(z.string(), z.coerce.number().min(0)),
  reason: z.string().trim().max(300).optional().default(''),
});

export const importStudentsSchema = z.object({
  schoolId: z.string().min(1),
  classId: z.string().min(1).optional(),
  rows: z
    .array(
      z.object({
        nisn: z.string().trim(),
        participantNo: z.string().trim(),
        fullName: z.string().trim(),
        gender: z.string().trim(),
        className: z.string().trim(),
        email: z.string().trim().optional().default(''),
      }),
    )
    .min(1)
    .max(2000),
  dryRun: z.boolean().default(true),
});

export const publishFormSchema = z.object({
  formId: z.string().min(1),
});

export const settingsSchema = z.object({
  schoolId: z.string().min(1).nullable(),
  branding: z
    .object({
      appName: z.string().trim().min(2).max(60),
      tagline: z.string().trim().max(100),
      primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .optional(),
  security: z
    .object({
      maxFailedLogin: z.coerce.number().int().min(1).max(50),
      tokenTtlDefaultMinutes: z.coerce.number().int().min(1).max(240),
      submitTokenTtlMinutes: z.coerce.number().int().min(1).max(120),
      allowStudentIpLock: z.boolean(),
    })
    .optional(),
  quota: z
    .object({
      enabled: z.boolean(),
      dailyReadWarning: z.coerce.number().int().min(1000),
      dailyWriteWarning: z.coerce.number().int().min(100),
    })
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type ExamTypeInput = z.infer<typeof examTypeSchema>;
