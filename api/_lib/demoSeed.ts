/**
 * Data DEMO NeoTest.
 *
 * Semua data di sini ditandai DEMO dan tidak boleh dicampur dengan data
 * produksi. Seed hanya dijalankan pada driver `demo` (berkas JSON), tidak
 * pernah pada mode Firebase. Nama sekolah, NPSN, dan orang bersifat fiktif.
 */
import { hashPassword } from './password';
import { compositeId, searchKeyOf } from './ids';
import { normalizeKey, scoreObjective, round2 } from '../../src/shared/answers';
import type {
  AcademicYear,
  AppSettings,
  ClassRoom,
  Difficulty,
  ExamAttempt,
  ExamForm,
  ExamParticipant,
  ExamResult,
  ExamRoom,
  ExamSchedule,
  ExamSession,
  ExamType,
  Proctor,
  Question,
  QuestionBank,
  QuestionKey,
  QuestionOption,
  QuestionStatus,
  QuestionType,
  ResponseValueDoc,
  School,
  Stimulus,
  Student,
  Subject,
  Teacher,
  User,
} from '../../src/shared/types';
import { applyRow, emptyAggregate, type ItemStatAggregate } from './services/itemStats';
import { jakartaDateKey } from '../../src/shared/time';

type Doc = Record<string, unknown> & { id: string };
type Collections = Record<string, Record<string, Doc>>;
export interface DemoDatabase {
  version: number;
  seededAt: string;
  collections: Collections;
}

export const DEMO_PASSWORD = 'NeoTest#2026';

const SCHOOL_ID = 'demo_school_smp1';
const AY_ID = 'demo_ay_2526';
const ADMIN_ID = 'demo_user_admin';
const TEACHER_ID = 'demo_user_guru';
const TEACHER2_ID = 'demo_user_guru2';
const PROCTOR_USER_ID = 'demo_user_proktor';
const PROCTOR2_USER_ID = 'demo_user_proktor2';

const now = new Date();
const iso = (d: Date) => d.toISOString();
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const wib = (dateKey: string, hhmm: string) => new Date(`${dateKey}T${hhmm}:00+07:00`);

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const STUDENT_NAMES = [
  'Aditya Pratama', 'Aisyah Nur Fadilah', 'Bagas Wicaksono', 'Citra Ayu Lestari',
  'Dimas Ardiansyah', 'Elsa Maharani', 'Fajar Ramadhan', 'Gita Puspitasari',
  'Hafiz Alfarizi', 'Indah Permata Sari', 'Joko Susilo', 'Kirana Wulandari',
  'Lukman Hakim', 'Maya Anggraini', 'Naufal Rizky', 'Olivia Rahmawati',
  'Putra Setiawan', 'Qonita Salsabila', 'Rafi Firmansyah', 'Siti Nurhaliza',
  'Teguh Prasetyo', 'Umi Kalsum', 'Vino Aditya', 'Wulan Sari Dewi',
];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

interface SeedQuestion {
  n: number;
  type: QuestionType;
  content: string;
  options?: string[];
  statement?: string;
  pairs?: [string, string][];
  points: number;
  difficulty: Difficulty;
  tags: string[];
  competency: string;
  status: QuestionStatus;
  explanation: string;
  key: unknown;
  stimulusId?: string;
}

function buildQuestion(
  subjectId: string,
  bankId: string,
  prefix: string,
  q: SeedQuestion,
  createdAt: string,
): { question: Question; key: QuestionKey } {
  const id = `demo_q_${prefix}_${pad(q.n)}`;
  const optionIds = (q.options ?? []).map((_, i) => String.fromCharCode(65 + i));
  const options: QuestionOption[] = (q.options ?? []).map((text, i) => ({
    id: optionIds[i],
    text: `<p>${text}</p>`,
  }));
  const pairs = (q.pairs ?? []).map(([left, right], i) => ({ id: `p${i + 1}`, left, right }));
  const question: Question = {
    id,
    schoolId: SCHOOL_ID,
    bankId,
    subjectId,
    type: q.type,
    stimulusId: q.stimulusId ?? null,
    content: `<p>${q.content}</p>`,
    options,
    pairs,
    statement: q.statement ?? '',
    acceptedCount: q.type === 'short' && Array.isArray(q.key) ? q.key.length : undefined,
    points: q.points,
    difficulty: q.difficulty,
    tags: q.tags,
    competency: q.competency,
    status: q.status,
    explanation: q.explanation,
    createdBy: TEACHER_ID,
    updatedBy: TEACHER_ID,
    createdAt,
    updatedAt: createdAt,
  };
  const key: QuestionKey = {
    id,
    questionId: id,
    type: q.type,
    correct: q.key,
    points: q.points,
  };
  return { question, key };
}

export function buildDemoDatabase(): DemoDatabase {
  const seededAt = iso(now);
  const C: Collections = {};
  const put = (col: string, doc: Doc) => {
    C[col] = C[col] ?? {};
    C[col][doc.id] = doc;
  };

  /* ---------------- Sekolah & konfigurasi ---------------- */
  const school: School = {
    id: SCHOOL_ID,
    code: 'DEMO-SMP1',
    npsn: '20500001',
    name: 'SMP Negeri 1 Nusantara (DEMO)',
    level: 'SMP',
    address: 'Jl. Pendidikan No. 1, Kelurahan Cerdas',
    city: 'Surabaya',
    province: 'Jawa Timur',
    phone: '031-5550101',
    email: 'info@smpn1nusantara.demo',
    logoUrl: '',
    active: true,
    letterhead: {
      headmasterName: 'Dra. Ratna Kusumawati, M.Pd.',
      headmasterNip: '19700512 199512 2 003',
      authorityLine: 'Pemerintah Kota Surabaya — Dinas Pendidikan',
      stampNote: 'Stempel sekolah',
    },
    createdAt: seededAt,
    updatedAt: seededAt,
  };
  put('schools', school as unknown as Doc);

  const ay: AcademicYear = {
    id: AY_ID,
    schoolId: SCHOOL_ID,
    year: '2025/2026',
    semester: 'ganjil',
    startDate: '2025-07-14',
    endDate: '2025-12-19',
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
  put('academicYears', ay as unknown as Doc);

  const subjectDefs: Pick<Subject, 'code' | 'name' | 'level' | 'gradeLevel'>[] = [
    { code: 'MAT', name: 'Matematika', level: 'SMP', gradeLevel: 9 },
    { code: 'BIN', name: 'Bahasa Indonesia', level: 'SMP', gradeLevel: 9 },
    { code: 'IPA', name: 'Ilmu Pengetahuan Alam', level: 'SMP', gradeLevel: 9 },
    { code: 'BIG', name: 'Bahasa Inggris', level: 'SMP', gradeLevel: 9 },
  ];
  const subjects: Subject[] = subjectDefs.map((s) => ({
    id: `demo_sub_${s.code.toLowerCase()}`,
    schoolId: SCHOOL_ID,
    ...s,
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  }));
  subjects.forEach((s) => put('subjects', s as unknown as Doc));

  const teachers: Teacher[] = [
    {
      id: 'demo_teacher_1',
      schoolId: SCHOOL_ID,
      userId: TEACHER_ID,
      nip: '19820314 200902 1 002',
      fullName: 'Ahmad Fauzi, S.Pd.',
      email: 'guru@neotest.demo',
      subjectIds: ['demo_sub_mat', 'demo_sub_ipa'],
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: 'demo_teacher_2',
      schoolId: SCHOOL_ID,
      userId: TEACHER2_ID,
      nip: '19871102 201201 2 001',
      fullName: 'Siti Rahmawati, S.Pd.',
      email: 'guru2@neotest.demo',
      subjectIds: ['demo_sub_bin', 'demo_sub_big'],
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ];
  teachers.forEach((t) => put('teachers', t as unknown as Doc));

  const rooms: ExamRoom[] = [1, 2, 3, 4].map((n) => ({
    id: `demo_room_${n}`,
    schoolId: SCHOOL_ID,
    name: `Ruang ${pad(n)}`,
    capacity: 20,
    location: `Gedung A - Lantai ${n <= 2 ? 1 : 2}`,
    createdAt: seededAt,
    updatedAt: seededAt,
  }));
  rooms.forEach((r) => put('rooms', r as unknown as Doc));

  const proctors: Proctor[] = [
    {
      id: 'demo_proctor_1',
      schoolId: SCHOOL_ID,
      userId: PROCTOR_USER_ID,
      nip: '19900115 201503 1 004',
      fullName: 'Budi Santoso, S.Kom.',
      email: 'proktor@neotest.demo',
      roomIds: ['demo_room_1', 'demo_room_2'],
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: 'demo_proctor_2',
      schoolId: SCHOOL_ID,
      userId: PROCTOR2_USER_ID,
      nip: '19920422 201801 2 005',
      fullName: 'Rina Wati, S.Pd.',
      email: 'proktor2@neotest.demo',
      roomIds: ['demo_room_3', 'demo_room_4'],
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ];
  proctors.forEach((p) => put('proctors', p as unknown as Doc));

  const classes: ClassRoom[] = [
    { id: 'demo_class_9a', name: '9A', level: 9, homeroomTeacherId: 'demo_teacher_1', grade: 9 },
    { id: 'demo_class_9b', name: '9B', level: 9, homeroomTeacherId: 'demo_teacher_2', grade: 9 },
    { id: 'demo_class_8a', name: '8A', level: 8, homeroomTeacherId: 'demo_teacher_1', grade: 8 },
    { id: 'demo_class_7a', name: '7A', level: 7, homeroomTeacherId: 'demo_teacher_2', grade: 7 },
  ].map(({ grade, ...c }) => ({
    ...c,
    schoolId: SCHOOL_ID,
    academicYearId: AY_ID,
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
    level: grade as 7 | 8 | 9,
  }));
  classes.forEach((c) => put('classes', c as unknown as Doc));

  /* ---------------- Akun ---------------- */
  const pwHash = hashPassword(DEMO_PASSWORD);
  const mkUser = (id: string, email: string, name: string, roles: User['roles'], extra: Partial<User> = {}): User => ({
    id,
    email,
    username: email.split('@')[0],
    displayName: name,
    roles,
    schoolId: SCHOOL_ID,
    active: true,
    passwordHash: pwHash,
    createdAt: seededAt,
    updatedAt: seededAt,
    ...extra,
  });

  const users: User[] = [
    mkUser('demo_user_super', 'superadmin@neotest.demo', 'Super Admin (DEMO)', ['superadmin']),
    mkUser(ADMIN_ID, 'admin@neotest.demo', 'Admin Sekolah (DEMO)', ['admin']),
    mkUser(TEACHER_ID, 'guru@neotest.demo', 'Ahmad Fauzi, S.Pd.', ['teacher']),
    mkUser(TEACHER2_ID, 'guru2@neotest.demo', 'Siti Rahmawati, S.Pd.', ['teacher']),
    mkUser(PROCTOR_USER_ID, 'proktor@neotest.demo', 'Budi Santoso, S.Kom.', ['proctor']),
    mkUser(PROCTOR2_USER_ID, 'proktor2@neotest.demo', 'Rina Wati, S.Pd.', ['proctor']),
  ];

  const students: Student[] = [];
  STUDENT_NAMES.forEach((name, idx) => {
    const n = idx + 1;
    const classId = n <= 12 ? 'demo_class_9a' : 'demo_class_9b';
    const userId = `demo_user_siswa${pad(n)}`;
    const email = `siswa${pad(n)}@neotest.demo`;
    users.push(mkUser(userId, email, name, ['student'], { username: `siswa${pad(n)}` }));
    students.push({
      id: `demo_stu_${pad(n)}`,
      schoolId: SCHOOL_ID,
      userId,
      nisn: `0051${pad(n, 3)}${pad(1000 + n, 4)}`.slice(0, 10),
      participantNo: pad(n),
      fullName: name,
      gender: n % 2 === 0 ? 'P' : 'L',
      classId,
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
  });
  users.forEach((u) => {
    put('users', {
      ...u,
      searchKey: searchKeyOf(u.displayName, u.email, u.username ?? ''),
    } as unknown as Doc);
  });
  students.forEach((s) => {
    put('students', {
      ...s,
      searchKey: searchKeyOf(s.fullName, s.nisn, s.participantNo),
    } as unknown as Doc);
  });

  /* ---------------- Bank soal & soal ---------------- */
  const banks: QuestionBank[] = [
    { id: 'demo_bank_mat', name: 'Bank Soal Matematika Kelas 9', subjectId: 'demo_sub_mat' },
    { id: 'demo_bank_bin', name: 'Bank Soal Bahasa Indonesia Kelas 9', subjectId: 'demo_sub_bin' },
    { id: 'demo_bank_ipa', name: 'Bank Soal IPA Kelas 9', subjectId: 'demo_sub_ipa' },
  ].map((b) => ({
    ...b,
    schoolId: SCHOOL_ID,
    academicYearId: AY_ID,
    description: 'Data DEMO — aman untuk latihan.',
    createdAt: seededAt,
    updatedAt: seededAt,
  }));
  banks.forEach((b) => put('questionBanks', b as unknown as Doc));

  const stimuli: Stimulus[] = [
    {
      id: 'demo_stim_bin_1',
      schoolId: SCHOOL_ID,
      title: 'Bacaan: Sampah Plastik di Laut',
      content:
        '<p>Setiap tahun, jutaan ton plastik berakhir di laut. Plastik tidak mudah terurai dan dapat terpecah menjadi mikroplastik yang membahayakan biota laut. Beberapa negara mulai membatasi penggunaan plastik sekali pakai dan mendorong penggunaan bahan alternatif yang dapat digunakan berulang.</p><p>Namun, upaya tersebut belum cukup tanpa partisipasi masyarakat. Pendidikan lingkungan sejak dini, pengelolaan sampah yang baik, dan pengurangan konsumsi plastik menjadi kunci utama.</p>',
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ];
  stimuli.forEach((s) => put('stimuli', s as unknown as Doc));

  const mathQuestions: SeedQuestion[] = [
    {
      n: 1, type: 'mcq', content: 'Hasil dari 2³ + 3² adalah …',
      options: ['15', '16', '17', '18'], points: 1, difficulty: 'mudah',
      tags: ['bilangan berpangkat'], competency: 'Bilangan', status: 'ready',
      explanation: '2³ = 8 dan 3² = 9, sehingga 8 + 9 = 17.',
      key: 'C',
    },
    {
      n: 2, type: 'mcq', content: 'Nilai x yang memenuhi persamaan 3x − 7 = 2x + 5 adalah …',
      options: ['10', '12', '14', '16'], points: 1, difficulty: 'sedang',
      tags: ['persamaan linear'], competency: 'Aljabar', status: 'ready',
      explanation: '3x − 2x = 5 + 7 sehingga x = 12.',
      key: 'B',
    },
    {
      n: 3, type: 'mcq', content: 'Sebuah roda berjari-jari 14 cm. Keliling roda tersebut adalah … (π = 22/7)',
      options: ['44 cm', '88 cm', '154 cm', '616 cm'], points: 1, difficulty: 'sedang',
      tags: ['lingkaran'], competency: 'Geometri', status: 'ready',
      explanation: 'K = 2πr = 2 × 22/7 × 14 = 88 cm.',
      key: 'B',
    },
    {
      n: 4, type: 'complex', content: 'Pilih semua pernyataan yang bernilai benar.',
      options: [
        'Bilangan 49 adalah bilangan kuadrat sempurna',
        'Hasil kali dua bilangan negatif selalu negatif',
        'Bilangan prima terkecil adalah 2',
        'Setiap bilangan bulat memiliki invers penjumlahan',
      ],
      points: 2, difficulty: 'sedang', tags: ['bilangan', 'penalaran'],
      competency: 'Bilangan', status: 'ready',
      explanation: 'Pernyataan pertama, ketiga, dan keempat benar. Hasil kali dua bilangan negatif adalah positif.',
      key: ['A', 'C', 'D'],
    },
    {
      n: 5, type: 'truefalse', content: 'Tentukan benar atau salah pernyataan berikut.',
      statement: 'Gradien garis y = 2x + 5 adalah 2.', points: 1, difficulty: 'mudah',
      tags: ['fungsi linear'], competency: 'Aljabar', status: 'ready',
      explanation: 'Bentuk umum y = mx + c, gradien m = 2.',
      key: true,
    },
    {
      n: 6, type: 'matching', content: 'Jodohkan bangun datar dengan rumus luasnya.',
      pairs: [
        ['Persegi', 's × s'],
        ['Lingkaran', 'π × r²'],
        ['Segitiga', '½ × a × t'],
        ['Trapesium', '½ × (a + b) × t'],
      ],
      points: 2, difficulty: 'sedang', tags: ['bangun datar'], competency: 'Geometri', status: 'ready',
      explanation: 'Setiap rumus luas sesuai dengan bangun datarnya.',
      key: { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' },
    },
    {
      n: 7, type: 'short', content: 'Hasil dari 12 × 8 adalah …',
      points: 1, difficulty: 'mudah', tags: ['operasi hitung'], competency: 'Bilangan', status: 'ready',
      explanation: '12 × 8 = 96.',
      key: ['96'],
    },
    {
      n: 8, type: 'mcq', content: 'Rata-rata dari data 6, 7, 8, 9, 10 adalah …',
      options: ['7', '8', '8,5', '9'], points: 1, difficulty: 'mudah',
      tags: ['statistika'], competency: 'Data dan Statistik', status: 'ready',
      explanation: 'Jumlah data 40 dibagi 5 sama dengan 8.',
      key: 'B',
    },
  ];

  const indoQuestions: SeedQuestion[] = [
    {
      n: 1, type: 'mcq', stimulusId: 'demo_stim_bin_1',
      content: 'Gagasan utama paragraf pertama bacaan tersebut adalah …',
      options: [
        'Plastik tidak dapat terurai sama sekali',
        'Dampak plastik terhadap laut dan upaya pembatasannya',
        'Negara-negara penghasil plastik terbesar',
        'Pendidikan lingkungan sejak dini',
      ],
      points: 1, difficulty: 'sedang', tags: ['gagasan utama'], competency: 'Membaca', status: 'ready',
      explanation: 'Paragraf pertama menjelaskan dampak plastik dan upaya pembatasan.',
      key: 'B',
    },
    {
      n: 2, type: 'mcq', stimulusId: 'demo_stim_bin_1',
      content: 'Makna kata "biota" dalam bacaan adalah …',
      options: ['tumbuhan', 'hewan', 'makhluk hidup', 'ekosistem'],
      points: 1, difficulty: 'sedang', tags: ['kosakata'], competency: 'Membaca', status: 'ready',
      explanation: 'Biota berarti makhluk hidup pada suatu area.',
      key: 'C',
    },
    {
      n: 3, type: 'complex', content: 'Pilih semua kalimat yang menggunakan ejaan yang benar.',
      options: [
        'Kami belajar di perpustakaan.',
        'Dia pergi ke Jakarta pada hari senin.',
        'Ibu membeli apel, jeruk, dan mangga.',
        'anak itu bermain di lapangan.',
      ],
      points: 2, difficulty: 'sedang', tags: ['ejaan'], competency: 'Kebahasaan', status: 'ready',
      explanation: 'Kalimat 1 dan 3 sesuai PUEBI; nama hari dan huruf awal kalimat harus berhuruf kapital.',
      key: ['A', 'C'],
    },
    {
      n: 4, type: 'truefalse', content: 'Tentukan benar atau salah pernyataan berikut.',
      statement: 'Teks eksposisi bertujuan mengajak pembaca melakukan sesuatu.', points: 1,
      difficulty: 'sedang', tags: ['jenis teks'], competency: 'Kebahasaan', status: 'ready',
      explanation: 'Teks eksposisi memaparkan informasi; teks persuasi yang mengajak.',
      key: false,
    },
    {
      n: 5, type: 'short', content: 'Lawan kata "optimis" adalah …',
      points: 1, difficulty: 'mudah', tags: ['antonim'], competency: 'Kebahasaan', status: 'ready',
      explanation: 'Antonim optimis adalah pesimis.',
      key: ['pesimis'],
    },
    {
      n: 6, type: 'essay',
      content: 'Tuliskan satu paragraf (80–120 kata) berisi pendapatmu tentang pentingnya mengurangi sampah plastik. Sertakan minimal dua alasan.',
      points: 10, difficulty: 'sulit', tags: ['menulis', 'argumentasi'], competency: 'Menulis', status: 'ready',
      explanation: 'Penilaian berdasarkan rubrik: isi, struktur, dan ejaan.',
      key: 'Rubrik penilaian uraian.',
    },
  ];

  const ipaQuestions: SeedQuestion[] = [
    {
      n: 1, type: 'mcq', content: 'Organel yang berperan sebagai tempat menghasilkan energi pada sel adalah …',
      options: ['ribosom', 'mitokondria', 'vakuola', 'nukleus'], points: 1, difficulty: 'mudah',
      tags: ['sel'], competency: 'Biologi', status: 'ready',
      explanation: 'Mitokondria adalah tempat respirasi sel yang menghasilkan ATP.',
      key: 'B',
    },
    {
      n: 2, type: 'truefalse', content: 'Tentukan benar atau salah pernyataan berikut.',
      statement: 'Perpindahan panas tanpa zat perantara disebut konveksi.', points: 1,
      difficulty: 'sedang', tags: ['kalor'], competency: 'Fisika', status: 'ready',
      explanation: 'Perpindahan panas tanpa zat perantara adalah radiasi.',
      key: false,
    },
    {
      n: 3, type: 'mcq', content: 'Zat yang memiliki pH < 7 bersifat …',
      options: ['basa', 'asam', 'netral', 'garam'], points: 1, difficulty: 'mudah',
      tags: ['asam basa'], competency: 'Kimia', status: 'ready',
      explanation: 'pH kurang dari 7 menunjukkan larutan asam.',
      key: 'B',
    },
  ];

  const allQuestions: Question[] = [];
  const allKeys: QuestionKey[] = [];
  const addBankQuestions = (prefix: string, bankId: string, subjectId: string, list: SeedQuestion[]) => {
    for (const q of list) {
      const { question, key } = buildQuestion(subjectId, bankId, prefix, q, seededAt);
      allQuestions.push(question);
      allKeys.push(key);
    }
  };
  addBankQuestions('mat', 'demo_bank_mat', 'demo_sub_mat', mathQuestions);
  addBankQuestions('bin', 'demo_bank_bin', 'demo_sub_bin', indoQuestions);
  addBankQuestions('ipa', 'demo_bank_ipa', 'demo_sub_ipa', ipaQuestions);

  allQuestions.forEach((q) => put('questions', q as unknown as Doc));
  allKeys.forEach((k) => put('answerKeys', k as unknown as Doc));

  const qi = (prefix: string, n: number) => `demo_q_${prefix}_${pad(n)}`;
  const matFormQuestionIds = mathQuestions.map((q) => qi('mat', q.n));
  const binFormQuestionIds = indoQuestions.map((q) => qi('bin', q.n));

  /* ---------------- Jenis ujian ---------------- */
  const examTypes: ExamType[] = [
    {
      id: 'demo_examtype_tka_mat',
      schoolId: SCHOOL_ID,
      name: 'Simulasi TKA — Matematika',
      code: 'TKA-MAT',
      description: 'Simulasi Tes Kemampuan Akademik mata pelajaran Matematika kelas 9.',
      academicYearId: AY_ID,
      assessmentType: 'tka',
      durationMinutes: 90,
      scoringMethod: 'auto',
      shuffleQuestions: false,
      shuffleOptions: true,
      navigation: 'free',
      allowAnswerReview: true,
      minSubmitMinutes: 45,
      resultPublish: 'after_session',
      passingScore: 70,
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: 'demo_examtype_pts_bin',
      schoolId: SCHOOL_ID,
      name: 'Penilaian Tengah Semester — Bahasa Indonesia',
      code: 'PTS-BIN',
      description: 'PTS Ganjil Bahasa Indonesia kelas 9.',
      academicYearId: AY_ID,
      assessmentType: 'pts',
      durationMinutes: 60,
      scoringMethod: 'hybrid',
      shuffleQuestions: true,
      shuffleOptions: true,
      navigation: 'free',
      allowAnswerReview: false,
      minSubmitMinutes: 30,
      resultPublish: 'manual',
      passingScore: 75,
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: 'demo_examtype_ipa',
      schoolId: SCHOOL_ID,
      name: 'Ulangan Harian — IPA',
      code: 'UH-IPA',
      description: 'Ulangan harian IPA bab sel dan kalor.',
      academicYearId: AY_ID,
      assessmentType: 'ulangan',
      durationMinutes: 45,
      scoringMethod: 'auto',
      shuffleQuestions: true,
      shuffleOptions: false,
      navigation: 'sequential',
      allowAnswerReview: false,
      minSubmitMinutes: 20,
      resultPublish: 'after_session',
      passingScore: 70,
      active: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ];
  examTypes.forEach((t) => put('examTypes', t as unknown as Doc));

  /* ---------------- Paket + versi tersegel ---------------- */
  const forms: ExamForm[] = [
    {
      id: 'demo_form_mat',
      schoolId: SCHOOL_ID,
      examTypeId: 'demo_examtype_tka_mat',
      subjectId: 'demo_sub_mat',
      academicYearId: AY_ID,
      name: 'Paket TKA Matematika — Set A',
      description: 'Paket DEMO berisi 8 soal objektif.',
      questionIds: matFormQuestionIds,
      status: 'published',
      currentVersionId: 'demo_formver_mat_v1',
      currentVersion: 1,
      totalPoints: mathQuestions.reduce((a, q) => a + q.points, 0),
      createdBy: TEACHER_ID,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: 'demo_form_bin',
      schoolId: SCHOOL_ID,
      examTypeId: 'demo_examtype_pts_bin',
      subjectId: 'demo_sub_bin',
      academicYearId: AY_ID,
      name: 'Paket PTS Bahasa Indonesia — Set A',
      description: 'Paket DEMO berisi 5 soal objektif dan 1 soal uraian.',
      questionIds: binFormQuestionIds,
      status: 'published',
      currentVersionId: 'demo_formver_bin_v1',
      currentVersion: 1,
      totalPoints: indoQuestions.reduce((a, q) => a + q.points, 0),
      createdBy: TEACHER2_ID,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ];
  forms.forEach((f) => put('examForms', f as unknown as Doc));

  const versionIdMat = 'demo_formver_mat_v1';
  const versionIdBin = 'demo_formver_bin_v1';
  [versionIdMat, versionIdBin].forEach((id, idx) => {
    const form = forms[idx];
    const type = examTypes[idx];
    put('examFormVersions', {
      id,
      formId: form.id,
      schoolId: SCHOOL_ID,
      version: 1,
      examTypeId: type.id,
      subjectId: form.subjectId,
      totalPoints: form.totalPoints ?? 0,
      questionIdsOrdered: form.questionIds,
      createdAt: seededAt,
      createdBy: form.createdBy,
      checksum: `demo-checksum-${idx + 1}`,
    } as unknown as Doc);
    form.questionIds.forEach((qid, order) => {
      const question = allQuestions.find((q) => q.id === qid)!;
      const stim = question.stimulusId ? stimuli.find((s) => s.id === question.stimulusId) : null;
      put('versionQuestions', {
        id: compositeId(id, qid),
        versionId: id,
        formId: form.id,
        questionId: qid,
        order,
        type: question.type,
        content: question.content,
        options: question.options,
        pairs: question.pairs,
        statement: question.statement,
        points: question.points,
        stimulus: stim ? { title: stim.title, content: stim.content } : null,
        tags: question.tags,
        competency: question.competency,
      } as unknown as Doc);
    });
  });

  /* ---------------- Jadwal & sesi ---------------- */
  const todayKey = jakartaDateKey(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = jakartaDateKey(yesterday);
  const inTwoDays = jakartaDateKey(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));

  const completedSchedule: ExamSchedule = {
    id: 'demo_schedule_mat_done',
    schoolId: SCHOOL_ID,
    examTypeId: 'demo_examtype_tka_mat',
    formId: 'demo_form_mat',
    formVersionId: versionIdMat,
    subjectId: 'demo_sub_mat',
    academicYearId: AY_ID,
    title: 'Simulasi TKA Matematika — Sesi Kemarin',
    date: yesterdayKey,
    startTime: '08:00',
    endTime: '10:00',
    classIds: ['demo_class_9a', 'demo_class_9b'],
    durationMinutes: 90,
    status: 'completed',
    sessionCount: 2,
    participantCount: 24,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
  const activeSchedule: ExamSchedule = {
    id: 'demo_schedule_bin_live',
    schoolId: SCHOOL_ID,
    examTypeId: 'demo_examtype_pts_bin',
    formId: 'demo_form_bin',
    formVersionId: versionIdBin,
    subjectId: 'demo_sub_bin',
    academicYearId: AY_ID,
    title: 'PTS Bahasa Indonesia — Siap Dilaksanakan',
    date: todayKey,
    startTime: '07:30',
    endTime: '12:00',
    classIds: ['demo_class_9a', 'demo_class_9b'],
    durationMinutes: 60,
    status: 'ongoing',
    sessionCount: 2,
    participantCount: 24,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
  const upcomingSchedule: ExamSchedule = {
    id: 'demo_schedule_ipa_soon',
    schoolId: SCHOOL_ID,
    examTypeId: 'demo_examtype_ipa',
    formId: 'demo_form_mat',
    formVersionId: versionIdMat,
    subjectId: 'demo_sub_mat',
    academicYearId: AY_ID,
    title: 'Ulangan Harian — Persiapan',
    date: inTwoDays,
    startTime: '09:00',
    endTime: '11:00',
    classIds: ['demo_class_9a'],
    durationMinutes: 45,
    status: 'scheduled',
    sessionCount: 1,
    participantCount: 12,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
  [completedSchedule, activeSchedule, upcomingSchedule].forEach((s) =>
    put('examSchedules', s as unknown as Doc),
  );

  const completedStarts = addMin(wib(yesterdayKey, '08:00'), 0);
  const activeStarts = new Date(now.getTime() - 10 * 60_000);
  const sessions: ExamSession[] = [
    {
      id: 'demo_session_mat_1',
      schoolId: SCHOOL_ID,
      scheduleId: completedSchedule.id,
      code: 'S1',
      roomId: 'demo_room_1',
      proctorId: 'demo_proctor_1',
      startsAt: iso(completedStarts),
      endsAt: iso(addMin(completedStarts, 90)),
      openedAt: iso(addMin(completedStarts, -10)),
      openedBy: PROCTOR_USER_ID,
      closedAt: iso(addMin(completedStarts, 95)),
      status: 'closed',
      participantCount: 12,
    },
    {
      id: 'demo_session_mat_2',
      schoolId: SCHOOL_ID,
      scheduleId: completedSchedule.id,
      code: 'S2',
      roomId: 'demo_room_2',
      proctorId: 'demo_proctor_1',
      startsAt: iso(addMin(completedStarts, 120)),
      endsAt: iso(addMin(completedStarts, 210)),
      openedAt: iso(addMin(completedStarts, 115)),
      openedBy: PROCTOR_USER_ID,
      closedAt: iso(addMin(completedStarts, 215)),
      status: 'closed',
      participantCount: 12,
    },
    {
      id: 'demo_session_bin_1',
      schoolId: SCHOOL_ID,
      scheduleId: activeSchedule.id,
      code: 'S1',
      roomId: 'demo_room_1',
      proctorId: 'demo_proctor_1',
      startsAt: iso(activeStarts),
      endsAt: iso(addMin(activeStarts, 120)),
      openedAt: iso(addMin(activeStarts, -5)),
      openedBy: PROCTOR_USER_ID,
      closedAt: null,
      status: 'open',
      participantCount: 12,
    },
    {
      id: 'demo_session_bin_2',
      schoolId: SCHOOL_ID,
      scheduleId: activeSchedule.id,
      code: 'S2',
      roomId: 'demo_room_2',
      proctorId: 'demo_proctor_1',
      startsAt: iso(addMin(activeStarts, 150)),
      endsAt: iso(addMin(activeStarts, 270)),
      openedAt: null,
      openedBy: null,
      closedAt: null,
      status: 'preparation',
      participantCount: 12,
    },
    {
      id: 'demo_session_ipa_1',
      schoolId: SCHOOL_ID,
      scheduleId: upcomingSchedule.id,
      code: 'S1',
      roomId: 'demo_room_3',
      proctorId: 'demo_proctor_2',
      startsAt: iso(wib(inTwoDays, '09:00')),
      endsAt: iso(wib(inTwoDays, '10:45')),
      openedAt: null,
      openedBy: null,
      closedAt: null,
      status: 'preparation',
      participantCount: 12,
    },
  ];
  sessions.forEach((s) => put('examSessions', s as unknown as Doc));

  const participants: ExamParticipant[] = [];
  students.forEach((student, idx) => {
    const inFirst = idx < 12;
    participants.push({
      id: `demo_part_mat_${pad(idx + 1)}`,
      schoolId: SCHOOL_ID,
      scheduleId: completedSchedule.id,
      sessionId: inFirst ? 'demo_session_mat_1' : 'demo_session_mat_2',
      examTypeId: completedSchedule.examTypeId,
      formVersionId: versionIdMat,
      studentId: student.id,
      classId: student.classId,
      participantNo: student.participantNo,
      fullName: student.fullName,
      roomId: inFirst ? 'demo_room_1' : 'demo_room_2',
      proctorId: 'demo_proctor_1',
      status: 'finished',
      attendance: 'present',
      startedAt: iso(addMin(completedStarts, (inFirst ? 0 : 120) + 3 + (idx % 4))),
      submittedAt: null,
      lastSeenAt: iso(addMin(completedStarts, (inFirst ? 0 : 120) + 70)),
    });
    participants.push({
      id: `demo_part_bin_${pad(idx + 1)}`,
      schoolId: SCHOOL_ID,
      scheduleId: activeSchedule.id,
      sessionId: inFirst ? 'demo_session_bin_1' : 'demo_session_bin_2',
      examTypeId: activeSchedule.examTypeId,
      formVersionId: versionIdBin,
      studentId: student.id,
      classId: student.classId,
      participantNo: student.participantNo,
      fullName: student.fullName,
      roomId: inFirst ? 'demo_room_1' : 'demo_room_2',
      proctorId: 'demo_proctor_1',
      status: 'scheduled',
      attendance: 'present',
      startedAt: null,
      submittedAt: null,
      lastSeenAt: null,
    });
  });
  students.slice(0, 12).forEach((student, idx) => {
    participants.push({
      id: `demo_part_ipa_${pad(idx + 1)}`,
      schoolId: SCHOOL_ID,
      scheduleId: upcomingSchedule.id,
      sessionId: 'demo_session_ipa_1',
      examTypeId: upcomingSchedule.examTypeId,
      formVersionId: versionIdMat,
      studentId: student.id,
      classId: student.classId,
      participantNo: student.participantNo,
      fullName: student.fullName,
      roomId: 'demo_room_3',
      proctorId: 'demo_proctor_2',
      status: 'scheduled',
      attendance: 'present',
    });
  });
  participants.forEach((p) => put('examParticipants', p as unknown as Doc));

  /* ---------------- Riwayat pengerjaan (jadwal selesai) ---------------- */
  const rand = lcg(20261023);
  const aggregates = new Map<string, ItemStatAggregate>();
  const keysById = new Map(allKeys.map((k) => [k.questionId, k]));
  const statQuestions = matFormQuestionIds.map((id) => allQuestions.find((q) => q.id === id)!);

  students.forEach((student, idx) => {
    const participant = participants.find((p) => p.studentId === student.id && p.scheduleId === completedSchedule.id)!;
    const started = new Date(participant.startedAt!);
    const durationMin = 58 + Math.floor(rand() * 28);
    const submitted = addMin(started, durationMin);
    const attemptId = `att__${completedSchedule.id}__${student.id}`;
    const ability = 0.92 - (idx % 12) * 0.055;

    let totalScore = 0;
    const scoresByQuestion = new Map<string, { score: number; value: unknown; blank: boolean; time: number }>();
    statQuestions.forEach((question, qi) => {
      const key = keysById.get(question.id)!;
      const norm = normalizeKey(key);
      const p = Math.min(0.96, Math.max(0.12, ability + (qi % 3 === 0 ? 0.04 : -0.03)));
      const roll = rand();
      let value: unknown = null;
      if (roll > 0.94) {
        value = null; // kosong
      } else if (roll < p) {
        value = correctValueFor(norm.type, norm.value, question);
      } else {
        value = wrongValueFor(norm.type, norm.value, question);
      }
      const result = scoreObjective(norm, value);
      totalScore += result.score;
      scoresByQuestion.set(question.id, {
        score: result.score,
        value,
        blank: result.blank,
        time: 45_000 + Math.floor(rand() * 120_000),
      });
    });

    const maxScore = statQuestions.reduce((a, q) => a + q.points, 0);
    const responseDocs: ResponseValueDoc[] = [];
    statQuestions.forEach((question, qi) => {
      const s = scoresByQuestion.get(question.id)!;
      if (!s.blank) {
        responseDocs.push({
          id: compositeId(attemptId, question.id),
          attemptId,
          scheduleId: completedSchedule.id,
          schoolId: SCHOOL_ID,
          studentId: student.id,
          questionId: question.id,
          value: s.value,
          seq: qi + 1,
          flagged: false,
          updatedAt: iso(submitted),
          timeSpentMs: s.time,
        });
      }
      const meta = {
        schoolId: SCHOOL_ID,
        scheduleId: completedSchedule.id,
        formVersionId: versionIdMat,
        questionId: question.id,
        type: question.type,
        points: question.points,
      };
      const agg = aggregates.get(question.id) ?? emptyAggregate(meta);
      aggregates.set(
        question.id,
        applyRow(agg, {
          questionId: question.id,
          type: question.type,
          points: question.points,
          value: s.value,
          score: s.score,
          blank: s.blank,
          totalScore,
          timeSpentMs: s.time,
        }),
      );
    });
    responseDocs.forEach((r) => put('responses', r as unknown as Doc));

    const attempt: ExamAttempt = {
      id: attemptId,
      schoolId: SCHOOL_ID,
      scheduleId: completedSchedule.id,
      sessionId: participant.sessionId,
      roomId: participant.roomId,
      proctorId: participant.proctorId,
      studentId: student.id,
      classId: student.classId,
      examTypeId: completedSchedule.examTypeId,
      formId: 'demo_form_mat',
      formVersionId: versionIdMat,
      status: 'graded',
      startedAt: iso(started),
      endsAt: iso(addMin(started, 90)),
      submittedAt: iso(submitted),
      lastSavedAt: iso(addMin(submitted, -1)),
      autoSubmitted: false,
      focusLossCount: rand() > 0.7 ? 1 : 0,
      connectionLossCount: 0,
      score: round2(totalScore),
      maxScore,
      gradedAt: iso(addMin(submitted, 0)),
      gradedBy: 'system',
      resultStatus: 'published',
    };
    put('examAttempts', attempt as unknown as Doc);

    const result: ExamResult = {
      id: `res__${completedSchedule.id}__${student.id}`,
      schoolId: SCHOOL_ID,
      scheduleId: completedSchedule.id,
      sessionId: participant.sessionId,
      studentId: student.id,
      classId: student.classId,
      formVersionId: versionIdMat,
      examTypeId: completedSchedule.examTypeId,
      status: 'published',
      score: round2(totalScore),
      maxScore,
      percent: round2((totalScore / maxScore) * 100),
      correctCount: [...scoresByQuestion.values()].filter((s) => !s.blank && s.score > 0).length,
      wrongCount: [...scoresByQuestion.values()].filter((s) => !s.blank && s.score === 0).length,
      blankCount: [...scoresByQuestion.values()].filter((s) => s.blank).length,
      essayPending: 0,
      durationSec: durationMin * 60,
      submittedAt: iso(submitted),
      gradedBy: 'system',
      gradedAt: iso(submitted),
      publishedAt: iso(addMin(submitted, 60)),
    };
    put('examResults', result as unknown as Doc);

    // Update status peserta
    const updatedParticipant: ExamParticipant = {
      ...participant,
      status: 'finished',
      submittedAt: iso(submitted),
      lastSeenAt: iso(submitted),
    };
    put('examParticipants', updatedParticipant as unknown as Doc);
  });
  aggregates.forEach((agg) => put('itemStats', agg as unknown as Doc));

  // Satu peserta berhalangan hadir pada jadwal aktif (demonstrasi ketidakhadiran)
  const absent = participants.find((p) => p.id === 'demo_part_bin_24');
  if (absent) put('examParticipants', { ...absent, attendance: 'absent' } as unknown as Doc);

  /* ---------------- Insiden, audit, pengaturan ---------------- */
  put('incidents', {
    id: 'demo_incident_1',
    schoolId: SCHOOL_ID,
    scheduleId: completedSchedule.id,
    sessionId: 'demo_session_mat_1',
    roomId: 'demo_room_1',
    proctorId: 'demo_proctor_1',
    studentId: 'demo_stu_05',
    type: 'internet',
    description: 'Koneksi internet terputus ±3 menit pada salah satu unit komputer.',
    action: 'Peserta melanjutkan setelah koneksi pulih; jawaban tersimpan tidak hilang.',
    createdAt: iso(addMin(completedStarts, 40)),
    updatedAt: iso(addMin(completedStarts, 40)),
  } as unknown as Doc);

  const auditSamples = [
    ['auth.login.success', 'users', ADMIN_ID, 'Admin Sekolah (DEMO)', 'admin'],
    ['token.issue', 'examTokens', 'demo_session_mat_1', 'Budi Santoso, S.Kom.', 'proctor'],
    ['session.open', 'examSessions', 'demo_session_mat_1', 'Budi Santoso, S.Kom.', 'proctor'],
    ['attempt.submit', 'examAttempts', 'att__demo_schedule_mat_done__demo_stu_01', 'Sistem', 'system'],
    ['form.publish', 'examForms', 'demo_form_mat', 'Ahmad Fauzi, S.Pd.', 'teacher'],
  ] as const;
  auditSamples.forEach(([action, targetType, targetId, actorName, actorRole], i) => {
    put('auditLogs', {
      id: `demo_audit_${pad(i + 1)}`,
      schoolId: SCHOOL_ID,
      actorId: actorRole === 'system' ? 'system' : ADMIN_ID,
      actorName,
      actorRole,
      action,
      targetType,
      targetId,
      createdAt: iso(addMin(completedStarts, -60 + i * 15)),
    } as unknown as Doc);
  });

  const settings: AppSettings = {
    id: 'demo_settings_global',
    schoolId: SCHOOL_ID,
    branding: {
      appName: 'NeoTest',
      tagline: 'Powered by Pakkar',
      primaryColor: '#0f2a54',
    },
    security: {
      maxFailedLogin: 10,
      tokenTtlDefaultMinutes: 120,
      submitTokenTtlMinutes: 30,
      allowStudentIpLock: false,
    },
    quota: {
      enabled: true,
      dailyReadWarning: 40_000,
      dailyWriteWarning: 16_000,
    },
  };
  put('appSettings', settings as unknown as Doc);

  put('demoMeta', {
    id: 'info',
    seededAt,
    version: 1,
    note: 'Data DEMO fiktif. Jangan gunakan untuk ujian sebenarnya.',
  });

  for (const collection of Object.values(C)) {
    for (const doc of Object.values(collection)) {
      if (doc.deletedAt === undefined) doc.deletedAt = null;
    }
  }

  return { version: 1, seededAt, collections: C };
}

function correctValueFor(type: string, value: unknown, question: Question): unknown {
  switch (type) {
    case 'mcq':
      return value;
    case 'complex':
      return value;
    case 'truefalse':
      return value;
    case 'matching':
      return Object.fromEntries(question.pairs.map((p) => [p.id, p.id]));
    case 'short':
      return Array.isArray(value) ? value[0] : value;
    default:
      return null;
  }
}

function wrongValueFor(type: string, value: unknown, question: Question): unknown {
  switch (type) {
    case 'mcq': {
      const ids = question.options.map((o) => o.id);
      const correct = String(value);
      return ids.find((id) => id !== correct) ?? 'X';
    }
    case 'complex': {
      const correct = new Set((value as string[]) ?? []);
      const pick = question.options.filter((o) => !correct.has(o.id)).slice(0, 1).map((o) => o.id);
      return pick.length ? pick : ['A'];
    }
    case 'truefalse':
      return !value;
    case 'matching': {
      const pairs = question.pairs;
      const map: Record<string, string> = {};
      pairs.forEach((p, i) => {
        map[p.id] = pairs[(i + 1) % pairs.length].id;
      });
      return map;
    }
    case 'short':
      return 'jawaban-salah';
    default:
      return null;
  }
}

export function isDemoDatabase(db: unknown): db is DemoDatabase {
  return Boolean(db && typeof db === 'object' && 'collections' in (db as Record<string, unknown>));
}
