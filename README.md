# NeoTest — Powered by Pakkar

Aplikasi ujian digital untuk SMP/MTs: bank soal, paket ujian dengan snapshot immutable,
pelaksanaan ujian berbasis token, pengawasan proktor, penilaian otomatis, analisis butir soal,
dan dokumen cetak A4. Dibangun ringan agar tetap berjalan di **Vercel Hobby + Firebase Spark (gratis)**.

Stack: **React + TypeScript + Vite + Tailwind + React Router** di frontend, **Vercel Functions
(TypeScript) + Firebase Admin SDK** di backend. Firestore hanya diakses lewat API — kredensial
admin tidak pernah sampai ke browser.

> ⚠️ **Status kejujuran**: lapisan server (RBAC, token, waktu, penyimpanan jawaban, penilaian,
> laporan) diuji otomatis dengan 47 test. **Antarmuka browser belum diuji otomatis** (belum ada
> E2E/Playwright). Lihat [Batas & catatan](#batas--catatan) sebelum memakai di ujian sungguhan.

---

## Daftar isi

1. [Fitur](#fitur)
2. [Peran & hak akses](#peran--hak-akses)
3. [Menjalankan lokal](#menjalankan-lokal)
4. [Akun demo](#akun-demo)
5. [Variabel lingkungan](#variabel-lingkungan)
6. [Deploy ke Vercel + Firebase](#deploy-ke-vercel--firebase)
7. [Bootstrap admin pertama](#bootstrap-admin-pertama)
8. [Perintah](#perintah)
9. [Pengujian](#pengujian)
10. [Arsitektur & keamanan](#arsitektur--keamanan)
11. [Batas & catatan](#batas--catatan)

---

## Fitur

**Master data** — Sekolah (kop surat + kepala sekolah), tahun ajaran, kelas, mata pelajaran,
ruang ujian, jenis ujian, guru, proktor, akun & peran, siswa.
Siswa dapat diimpor/diekspor CSV dengan deteksi duplikat NISN & nomor peserta (dry-run dulu).

**Bank soal** — Pilihan ganda tunggal, PG kompleks, benar/salah, menjodohkan, isian singkat,
esai, plus soal stimulus. Bobot poin, tingkat kesulitan, tag, kompetensi, penjelasan, status
draf → ditinjau → siap. Impor/ekspor CSV. Rich text disanitasi di server (allowlist).

**Paket ujian** — Menyusun soal menjadi paket lalu **menerbitkan** (publish) yang membuat
snapshot soal immutable (`examFormVersions` + `versionQuestions`) dengan hash SHA-256.
Mengubah bank soal setelahnya **tidak** mengubah paket yang sudah terbit.

**Pelaksanaan** — Token mulai & token kirim per sesi/ruang: acak, di-hash sebelum disimpan,
berlaku per sesi, kedaluwarsa, dapat dicabut, dibatasi laju, dan tercatat di audit log.
Ruang peserta **ditentukan server** dari penugasan proktor — `roomId` dari browser diabaikan.
Timer memakai jam server. Autosave dengan debounce, buffer luring, indikator status simpan,
dan segel pengiriman **idempoten**.

**Pengawasan** — Daftar sesi per proktor, status peserta, terbitkan/cabut token, catat insiden,
pindahkan peserta, buka/tutup sesi, serta **daftar hadir** dan **berita acara** A4 siap cetak.

**Penilaian** — Objektif dinilai otomatis di server (PG kompleks tanpa skor parsial, menjodohkan
parsial proporsional, isian singkat normalisasi teks). Esai dinilai manual dengan rubrik.
Hasil dipublikasikan sesuai kebijakan jenis ujian; **kunci jawaban tidak pernah dikirim ke siswa**
sebelum hasil dipublikasikan dan pembahasan diizinkan.

**Analisis** — Rata-rata, median, standar deviasi, distribusi nilai, kelulusan vs KKM,
perbandingan per kelas & per sesi; analisis butir (tingkat kesukaran, daya pembeda 27% atas/bawah,
analisis distraktor, koefisien Cronbach's alpha). Ekspor CSV.

**Sistem** — Audit log, perkiraan kuota harian, pengaturan sekolah, dan halaman cetak terpisah.

---

## Peran & hak akses

| Peran | Ringkasan |
|---|---|
| **Super Admin** | Semua fitur + kelola sekolah, audit log, reset data demo. |
| **Admin Sekolah** | Seluruh data satu sekolah: master data, paket, jadwal, hasil, pengaturan. |
| **Guru** | Bank soal, paket ujian, hasil & penilaian untuk mata pelajaran/kelas yang diampu. |
| **Proktor** | Hanya sesi/ruang yang ditugaskan: token, kehadiran, insiden, dokumen cetak. |
| **Siswa** | Ujian yang dijadwalkan untuknya, dan hasil yang sudah dipublikasikan. |

Izin diperiksa **tiga lapis**: matriks peran di UI (hanya kenyamanan), **otorisasi di setiap
endpoint API** (lapisan yang mengikat), dan **Firestore rules** sebagai lapisan ketiga.
Jangan pernah menganggap pemeriksaan di UI sebagai keamanan.

---

## Menjalankan lokal

Prasyarat: **Node.js ≥ 20**.

```bash
npm install
cp .env.example .env      # opsional; tanpa .env otomatis memakai mode demo
npm run dev               # http://localhost:5173
```

Tanpa konfigurasi apa pun, aplikasi berjalan pada **mode demo**: data disimpan di
`.data/neotest-demo.json` dan dibangkitkan otomatis dari seed. Vite juga menjalankan
handler `api/*.ts` secara langsung, jadi tidak perlu `vercel dev`.

Mode demo **bukan untuk produksi**. Pada deployment Vercel tanpa Firebase, berkas demo
ditulis ke `/tmp` yang bersifat sementara dan **tidak dibagi antar-function** — data akan
hilang saat instance didaur ulang.

---

## Akun demo

Semua akun demo memakai password **`NeoTest#2026`** dan hanya dibuat pada mode demo.
Data demo diberi label **(DEMO)** dan terpisah dari data produksi.

| Email | Peran |
|---|---|
| `superadmin@neotest.demo` | Super Admin |
| `admin@neotest.demo` | Admin Sekolah |
| `guru@neotest.demo` / `guru2@neotest.demo` | Guru |
| `proktor@neotest.demo` / `proktor2@neotest.demo` | Proktor |
| `siswa01@neotest.demo` … `siswa24@neotest.demo` | Siswa |

Alur uji cepat: buka sesi sebagai **proktor**, terbitkan **token mulai**, lalu login sebagai
`siswa01` untuk memulai ujian. Token **kirim** dipakai saat menyerahkan jawaban — server menolak
pengiriman sebelum durasi minimal pengerjaan terpenuhi (default 45 menit, diatur per jenis ujian).

> Tidak ada akun admin bawaan pada mode produksi, dan **tidak ada endpoint publik** yang bisa
> menjadikan pengguna biasa sebagai super admin. Lihat [Bootstrap admin](#bootstrap-admin-pertama).

---

## Variabel lingkungan

Seluruh variabel didokumentasikan di [`.env.example`](.env.example) (tanpa nilai rahasia).
Ringkasannya:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEOTEST_DATA_DRIVER` | — | `demo` (default) atau `firebase`. |
| `NEOTEST_SESSION_SECRET` | produksi | Kunci penandatanganan sesi. `openssl rand -base64 48`. |
| `NEOTEST_TOKEN_PEPPER` | produksi | Pepper hash token ujian, **minimal 16 karakter**. |
| `NEOTEST_PUBLIC_ORIGIN` | produksi | Origin publik untuk CORS, mis. `https://neotest.vercel.app`. |
| `NEOTEST_ALLOWED_ORIGINS` | — | Origin tambahan, dipisah koma. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | mode firebase | Satu baris JSON service account (**atau** tiga variabel di bawah). |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | mode firebase | Alternatif pemisahan kredensial. |
| `NEOTEST_FIREBASE_API_KEY`, `NEOTEST_FIREBASE_AUTH_DOMAIN`, `NEOTEST_FIREBASE_PROJECT_ID`, `NEOTEST_FIREBASE_APP_ID` | mode firebase | Firebase Web SDK; dikirim ke browser lewat `/api/config` (memang publik). |
| `VITE_FIREBASE_APPCHECK_KEY` | opsional | reCAPTCHA v3 untuk App Check. |
| `CRON_SECRET` | opsional | Header `x-cron-secret` untuk sweep pengerjaan kedaluwarsa. |
| `NEOTEST_DATA_FILE` | — | Lokasi berkas data demo (default `.data/neotest-demo.json`). |

Kredensial Firebase Admin **hanya** dibaca di server. Jangan pernah memakai awalan `VITE_`
untuk nilai rahasia — semua variabel `VITE_*` ikut ter-bundle ke browser.

---

## Deploy ke Vercel + Firebase

### 1. Siapkan Firebase (Spark, gratis)

1. Buat project di [Firebase Console](https://console.firebase.google.com).
2. **Authentication** → aktifkan **Email/Password**.
3. **Firestore Database** → buat database (mode produksi).
4. **Project settings → Service accounts** → *Generate new private key* (untuk Admin SDK).
5. **Project settings → General → Your apps** → daftarkan Web app (untuk Firebase Web SDK).

### 2. Terapkan aturan & indeks

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.rules` mengasumsikan profil pengguna di `userProfiles/{uid}` yang ditulis oleh API.
Tanpa itu, aturan akan menolak akses.

### 3. Deploy ke Vercel

```bash
npm i -g vercel
vercel
```

Lalu isi *Environment Variables* di Vercel (Production & Preview) mengikuti tabel
[Variabel lingkungan](#variabel-lingkungan):

- `NEOTEST_DATA_DRIVER=firebase`
- `NEOTEST_SESSION_SECRET`, `NEOTEST_TOKEN_PEPPER`, `NEOTEST_PUBLIC_ORIGIN`
- kredensial Admin SDK dan Firebase Web SDK

`vercel.json` sudah mengatur rewrite SPA, header keamanan, dan cache aset. Handler di `api/`
otomatis menjadi Vercel Functions.

### 4. Bootstrap admin pertama

Jalankan [skrip bootstrap](#bootstrap-admin-pertama) dengan kredensial produksi.

### Catatan penting soal gratis

- **Vercel Hobby ditujukan untuk penggunaan non-komersial.** Untuk sekolah/lembaga yang
  menggunakannya secara komersial, gunakan paket berbayar. Periksa sendiri ToS terbaru Vercel.
- **Firestore Spark** membatasi ±50.000 bacaan dan ±20.000 penulisan per hari.
- Aplikasi ini **tidak** mengklaim lolos uji beban.

**Penting — kuota Spark tidak cukup untuk ujian besar dalam satu hari.** Model estimasi
`npm run quota:estimate` memperkirakan kebutuhan berikut (40 soal, 90 menit, autosave 25–45 detik):

| Skenario | Perkiraan bacaan | Perkiraan tulis | vs kuota Spark/hari |
|---|---|---|---|
| 500 siswa, 3 gelombang, autosave 25 s | 311.280 | 152.000 | ~6,2× baca · ~7,6× tulis |
| 2.000 siswa, 4 gelombang, autosave 45 s | 824.280 | 416.000 | ~16,5× baca · ~20,8× tulis |

Artinya desain aplikasi **sadar kuota** (snapshot dibaca sekali, autosave hanya saat jawaban
berubah, statistik diagregasi per submit, polling dashboard dibatasi), tetapi **Skema Spark
tidak akan menampung ujian 2.000 siswa dalam satu hari**. Pilihan realistis:

1. Bagi pelaksanaan ke beberapa hari, atau
2. Perbesar interval autosave (30–45 detik) dan kurangi polling dashboard, atau
3. Naikkan project ke paket **Blaze** (bayar sesuai pemakaian, ada kuota gratis bulanan).

Angka di atas adalah **model estimasi internal**, bukan metrik resmi Firebase. Ukur sendiri
di Firebase Console dengan skenario nyata sebelum ujian sesungguhnya.

---

## Bootstrap admin pertama

Tidak ada akun admin bawaan pada mode produksi. Buat super admin pertama secara terkontrol
dari mesin Anda (bukan dari endpoint publik):

```bash
NEOTEST_DATA_DRIVER=firebase \
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
npx tsx scripts/bootstrap-admin.ts \
  --email admin@sekolah.sch.id \
  --name "Admin Utama" \
  --school <id-atau-kode-sekolah>
```

Perilaku skrip:

- Menolak berjalan jika sudah ada super admin, kecuali diberi `--force`.
- Membuat password acak yang **hanya ditampilkan sekali** — simpan segera.
- Tidak pernah menampilkan atau menyimpan password dalam bentuk teks biasa.

Alternatif argumen: variabel `NEOTEST_BOOTSTRAP_EMAIL`, `NEOTEST_BOOTSTRAP_NAME`,
`NEOTEST_BOOTSTRAP_SCHOOL`, `NEOTEST_BOOTSTRAP_PASSWORD`.

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan + handler API (port 5173). |
| `npm run build` | Typecheck (`tsc -b`) lalu build produksi ke `dist/`. |
| `npm run preview` | Pratinjau hasil build + handler API (port 4173). |
| `npm run typecheck` | Typecheck saja. |
| `npm test` | Menjalankan seluruh test Vitest sekali jalan. |
| `npm run test:watch` | Vitest mode watch. |
| `npm run seed:demo` | Membangkitkan ulang data demo. |
| `npm run bootstrap:admin` | Membuat super admin pertama. |
| `npm run quota:estimate` | Memperkirakan bacaan/penulisan Firestore per skenario. |

---

## Pengujian

```bash
npm test        # 47 test, 2 berkas
```

| Area | Yang diuji |
|---|---|
| Autentikasi & RBAC | Password salah tidak membocorkan detail; siswa/guru/proktor ditolak dari area terlarang; admin tidak bisa membaca sekolah lain lewat `schoolId` palsu. |
| Token & identifikasi ruang | Proktor tidak bisa menerbitkan token untuk sesi proktor lain; token salah/dicabut/kedaluwarsa/beda sesi ditolak; `roomId` & `proctorId` dari browser diabaikan. |
| Penyimpanan jawaban | Urutan `seq` basi diabaikan; id soal dari view diterima apa adanya; nilai tidak valid ditolak; siswa lain tidak bisa menulis ke attempt orang lain. |
| Waktu & finalisasi | Submit ditolak sebelum durasi minimal; submit idempoten; penyimpanan setelah waktu habis ditolak dan jawaban dikunci; sweep memfinalisasi pengerjaan kedaluwarsa. |
| Kunci jawaban | Payload view peserta tidak memuat `correct`/`answerKeys`/`key`; kunci & pembahasan hanya muncul setelah publikasi dan bila kebijakan mengizinkan. |
| Penilaian | PG tunggal, PG kompleks tanpa skor parsial, menjodohkan parsial, isian singkat dengan normalisasi, deteksi jawaban kosong. |
| Statistik | Mean/median/distribusi, point-biserial, Cronbach's alpha, pengelompokan per kelas, label daya pembeda. |
| Laporan | Statistik dari data nyata; analisis butir; daftar hadir & berita acara dari database; isi CSV; ekspor. |
| Lain-lain | Impor siswa menolak duplikat dengan laporan kesalahan; pemisahan sekolah; dashboard & estimasi kuota; proktor hanya melihat sesinya. |

Test memakai berkas data sementara sendiri (`tests/setup.ts` mengarahkan `NEOTEST_DATA_FILE`),
jadi **tidak mengganggu data demo** yang sedang dipakai server pengembangan.

---

## Arsitektur & keamanan

```
src/shared/     Domain murni (tipe, izin, penilaian, statistik, skema Zod) dipakai FE & BE
src/            Halaman React, komponen UI, hook, layout
api/            Vercel Functions: auth, config, time, health, admin, exams,
                proctor, attempts, reports, results
api/_lib/       auth, audit, rateLimit, sanitize, clock, quota, store/, services/
tests/          Vitest (API + domain)
```

- **Satu sumber waktu** (`api/_lib/clock.ts`). Timer, masa berlaku token, dan syarat submit
  memakai jam server; mengubah jam perangkat tidak memperpanjang waktu ujian.
- **Token di-hash** (`tok_<sha256(token+pepper)>`). Plaintext token tidak pernah disimpan
  maupun dicatat di log.
- **Snapshot immutable** pada penerbitan paket, sehingga perubahan bank soal tidak mengubah
  ujian yang sudah berjalan.
- **Penilaian di server**: jawaban disanitasi per tipe soal, skor dihitung server, kunci
  jawaban tidak dikirim ke browser peserta.
- **Soft delete** pada data penting; penghapusan siswa ditolak saat ada ujian berjalan.
- **Audit log** untuk login, token, mulai/kirim, perubahan nilai, publikasi, impor, dan
  perubahan pengaturan.
- **Rate limit** pada login, mulai ujian, simpan jawaban, dan sinyal pengawasan.
- **Zod** memvalidasi setiap payload API; error dikembalikan dalam envelope seragam
  `{ error: { code, message, details } }`.

---

## Batas & catatan

Jujur soal apa yang belum terverifikasi:

- **UI belum diuji otomatis.** Tidak ada test E2E/browser. Semua halaman sudah dirender dan
  alur API-nya diuji, tetapi interaksi UI (termasuk tata letak cetak A4 dan perilaku luring)
  perlu dicek manual di Chrome/Edge versi lab.
- **Belum ada uji beban.** Angka kuota adalah *perkiraan internal* dari jumlah operasi API,
  bukan metrik resmi Firebase. Verifikasi di Firebase Console. Berdasarkan model estimasi,
  **Spark tidak cukup untuk 2.000 siswa dalam satu hari** (lihat tabel di atas).
- **Klaim "ringan"** mengacu pada ukuran bundle & jumlah query per halaman, bukan pada
  kapasitas pengguna serentak yang sudah terbukti.
- **Mode demo tidak persisten di Vercel.** Data `/tmp` per-function, hilang saat instance
  didaur ulang. Gunakan Firebase untuk data nyata.
- **App Check bersifat opsional** dan tidak diaktifkan secara default.
- **PDF** dihasilkan lewat dialog cetak browser ("Cetak / Simpan PDF"), bukan pustaka PDF
  sisi server.
- Mode demo memakai password demo bersama — **jangan pernah** mengaktifkannya untuk ujian
  sungguhan.

---

## Lisensi & atribusi

Aplikasi ini **tidak berafiliasi** dengan Kemendikdasmen atau instansi pemerintah mana pun,
dan tidak memuat logo resmi pemerintah. Nama "NeoTest — Powered by Pakkar" adalah merek
aplikasi ini sendiri.
