/**
 * Estimasi pemakaian Firestore untuk skenario ujian.
 * Ini MODEL ESTIMASI, bukan metrik resmi. Angka aktual bergantung pada
 * perilaku pengguna, cache, dan implementasi Firebase.
 *
 * Contoh:
 *   npx tsx scripts/quota-estimate.ts --students 600 --sessions 3 \
 *     --questions 40 --duration 90 --save-interval 20
 */
interface Params {
  students: number;
  sessions: number;
  questions: number;
  durationMinutes: number;
  saveIntervalSeconds: number;
  staffRefreshes: number;
}

function readNumber(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${flag}`);
  if (idx !== -1 && process.argv[idx + 1]) {
    const v = Number(process.argv[idx + 1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return fallback;
}

const p: Params = {
  students: readNumber('students', 500),
  sessions: readNumber('sessions', 3),
  questions: readNumber('questions', 40),
  durationMinutes: readNumber('duration', 90),
  saveIntervalSeconds: readNumber('save-interval', 25),
  staffRefreshes: readNumber('staff-refreshes', 4),
};

const perStudent = p.students / p.sessions;
const savesPerStudent = Math.ceil((p.durationMinutes * 60) / p.saveIntervalSeconds);

// Baca/tulis per peserta
const startReads = 1 + 1 + p.questions + 1; // user+participant+questions+token
const startWrites = 3; // attempt + participant + token use
const saveReads = savesPerStudent * 2; // attempt + response
const saveWrites = savesPerStudent * 1;
const submitReads = p.questions * 3 + 2; // version q + key + response + attempt
const submitWrites = p.questions * 2 + 5; // itemStats + result + attempt + participant

const totalStartReads = startReads * p.students;
const totalStartWrites = startWrites * p.students;
const totalSaveReads = saveReads * p.students;
const totalSaveWrites = saveWrites * p.students;
const totalSubmitReads = submitReads * p.students;
const totalSubmitWrites = submitWrites * p.students;

// Staf: proktor polling setiap 20 detik selama sesi, 2 halaman ringan
const pollSeconds = 20;
const polls = Math.ceil((p.durationMinutes * 60) / pollSeconds);
const staffPerSession = 2;
const staffReads = polls * staffPerSession * p.questions > 0 ? polls * staffPerSession * (2 + 20) : 0;
const reportReads = p.students + 100 * p.staffRefreshes;

const reads = totalStartReads + totalSaveReads + totalSubmitReads + staffReads + reportReads;
const writes = totalStartWrites + totalSaveWrites + totalSubmitWrites;

const FREE = { reads: 50_000, writes: 20_000 };

const pct = (v: number, max: number) => `${((v / max) * 100).toFixed(1)}%`;

console.log('=== NeoTest — Estimasi Pemakaian Firestore (per hari ujian) ===');
console.log(`Peserta total        : ${p.students}`);
console.log(`Sesi (gelombang)     : ${p.sessions}  → ${Math.round(perStudent)} peserta/sesi`);
console.log(`Soal per ujian       : ${p.questions}`);
console.log(`Durasi ujian         : ${p.durationMinutes} menit`);
console.log(`Interval autosave    : ${p.saveIntervalSeconds} detik (${savesPerStudent} simpan/peserta)`);
console.log('');
console.log('Rincian operasi:');
console.log(`  Mulai ujian        : ${totalStartReads.toLocaleString('id-ID')} baca / ${totalStartWrites.toLocaleString('id-ID')} tulis`);
console.log(`  Autosave jawaban   : ${totalSaveReads.toLocaleString('id-ID')} baca / ${totalSaveWrites.toLocaleString('id-ID')} tulis`);
console.log(`  Submit & penilaian : ${totalSubmitReads.toLocaleString('id-ID')} baca / ${totalSubmitWrites.toLocaleString('id-ID')} tulis`);
console.log(`  Dashboard staf     : ${staffReads.toLocaleString('id-ID')} baca`);
console.log(`  Laporan/analisis   : ${reportReads.toLocaleString('id-ID')} baca`);
console.log('');
console.log(`TOTAL PERKIRAAN      : ${reads.toLocaleString('id-ID')} baca (${pct(reads, FREE.reads)} kuota harian Spark)`);
console.log(`                     : ${writes.toLocaleString('id-ID')} tulis (${pct(writes, FREE.writes)} kuota harian Spark)`);
console.log('');
if (reads > FREE.reads || writes > FREE.writes) {
  console.log('⚠️  Skenario melewati kuota gratis Spark untuk satu hari.');
  console.log('    Opsi: bagi ujian ke beberapa hari, perbesar interval autosave (30–45 detik),');
  console.log('    kurangi polling dashboard, atau tingkatkan ke paket berbayar (Blaze).');
  if (writes > FREE.writes) {
    console.log('    Penulisan adalah batas paling ketat: kurangi frekuensi autosave dan hindari menyimpan per detik.');
  }
} else {
  console.log('✅ Perkiraan masih di bawah kuota Spark untuk satu hari ujian.');
  console.log('    Tetap pantau Firebase Console; estimasi ini bukan metrik resmi.');
}
console.log('');
console.log('Catatan: autosave hanya menulis saat jawaban berubah (debounce), sehingga angka riil');
console.log('biasanya lebih rendah. Analisis butir dihitung dari agregat O(1) per submit, bukan scan ulang.');
