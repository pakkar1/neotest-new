import { useParams } from 'react-router-dom';
import { PrintFooter, PrintLayout, PrintLetterhead, SignatureBlock } from '../../layouts/PrintLayout';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest } from '../../services/api';
import { formatDateId, formatDateTimeId, jakartaClock } from '../../shared/time';
import type { School } from '../../shared/types';

interface AttendanceDocument {
  school: School;
  schedule: {
    title: string;
    date: string;
    dateLabel: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    academicYear: string;
  };
  session: { code: string; roomName: string; startsAt: string; endsAt: string; status: string };
  proctorName: string;
  participants: { participantNo: string; fullName: string; className: string; attendance: string; signature?: string }[];
  printedAt: string;
  printedBy: string;
}

const ATTENDANCE_LABEL: Record<string, string> = {
  present: 'Hadir',
  excused: 'Izin',
  absent: 'Tidak hadir',
};

export default function AttendancePrintPage() {
  usePageTitle('Daftar Hadir');
  const { sessionId = '' } = useParams();
  const doc = useAsync(
    () => apiRequest<AttendanceDocument>('/api/reports', { query: { resource: 'attendance', sessionId } }),
    [sessionId],
    { enabled: Boolean(sessionId) },
  );

  if (doc.loading) return <LoadingState label="Menyiapkan daftar hadir…" />;
  if (doc.error) return <ErrorState message={doc.error} onRetry={() => void doc.reload()} />;
  if (!doc.data) return null;

  const data = doc.data;
  const hadir = data.participants.filter((p) => p.attendance === 'present').length;

  return (
    <PrintLayout title="Daftar Hadir Peserta Ujian" backTo="/proktor">
      <PrintLetterhead
        school={data.school}
        title="Daftar Hadir Peserta Ujian"
        subtitle={`${data.schedule.title} — ${data.schedule.subjectName}`}
      />

      <table className="mb-3 w-full border-collapse text-[9.5pt]">
        <tbody>
          <tr>
            <td className="w-40 py-0.5">Hari / Tanggal</td>
            <td className="py-0.5">: {data.schedule.dateLabel}</td>
            <td className="w-32 py-0.5">Ruang</td>
            <td className="py-0.5">: {data.session.roomName}</td>
          </tr>
          <tr>
            <td className="py-0.5">Waktu</td>
            <td className="py-0.5">
              : {data.schedule.startTime} – {data.schedule.endTime}
            </td>
            <td className="py-0.5">Sesi</td>
            <td className="py-0.5">: {data.session.code}</td>
          </tr>
          <tr>
            <td className="py-0.5">Mata Pelajaran</td>
            <td className="py-0.5">: {data.schedule.subjectName}</td>
            <td className="py-0.5">Tahun Ajaran</td>
            <td className="py-0.5">: {data.schedule.academicYear || '—'}</td>
          </tr>
          <tr>
            <td className="py-0.5">Proktor</td>
            <td className="py-0.5">: {data.proctorName || '—'}</td>
            <td className="py-0.5">Jumlah Peserta</td>
            <td className="py-0.5">: {data.participants.length} orang</td>
          </tr>
        </tbody>
      </table>

      <table className="print-table">
        <thead>
          <tr>
            <th className="w-10">No</th>
            <th className="w-28">No. Peserta</th>
            <th>Nama Peserta</th>
            <th className="w-20">Kelas</th>
            <th className="w-24">Status</th>
            <th className="w-32">Tanda Tangan</th>
          </tr>
        </thead>
        <tbody>
          {data.participants.map((p, index) => (
            <tr key={`${p.participantNo}-${p.fullName}`} className="avoid-break">
              <td className="text-center">{index + 1}</td>
              <td className="text-center">{p.participantNo}</td>
              <td>{p.fullName}</td>
              <td className="text-center">{p.className}</td>
              <td className="text-center">{ATTENDANCE_LABEL[p.attendance] ?? p.attendance}</td>
              <td className="h-8">{p.signature ? <span className="italic">{p.signature}</span> : null}</td>
            </tr>
          ))}
          {data.participants.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center italic">
                Belum ada peserta yang terdaftar pada sesi ini.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <p className="mt-2 text-[9pt]">
        Rekap: {hadir} dari {data.participants.length} peserta dinyatakan hadir.
      </p>

      <div className="mt-6">
        <SignatureBlock
          left={{ title: 'Proktor Ruang', name: data.proctorName }}
          right={{
            title: 'Kepala Sekolah',
            name: data.school.letterhead?.headmasterName ?? '',
            nip: data.school.letterhead?.headmasterNip,
          }}
        />
      </div>

      <p className="mt-3 text-[8.5pt] text-slate-500">
        Sesi dimulai {formatDateTimeId(data.session.startsAt)} dan berakhir {jakartaClock(new Date(data.session.endsAt))}.
        Daftar hadir dihasilkan {formatDateId(data.printedAt)} oleh {data.printedBy}.
      </p>
      <PrintFooter note="Dokumen ini dihasilkan dari data resmi NeoTest dan hanya sah bila ditandatangani" />
    </PrintLayout>
  );
}
