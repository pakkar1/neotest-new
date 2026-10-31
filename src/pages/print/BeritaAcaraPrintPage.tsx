import { useParams } from 'react-router-dom';
import { PrintFooter, PrintLayout, PrintLetterhead, SignatureBlock } from '../../layouts/PrintLayout';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest } from '../../services/api';
import { formatDateId, formatDateTimeId } from '../../shared/time';
import type { IncidentReport, School } from '../../shared/types';

interface BeritaAcaraDocument {
  school: School;
  schedule: { title: string; dateLabel: string; startTime: string; endTime: string; examTypeName: string };
  session: { code: string; roomName: string; status: string; openedAt: string | null; closedAt: string | null };
  proctorName: string;
  counts: { scheduled: number; present: number; absent: number; started: number; submitted: number };
  actual: { firstStartAt: string | null; lastSubmitAt: string | null; durationMinutes: number };
  incidents: IncidentReport[];
  notes: string;
  headmaster: { name: string; nip: string };
  printedAt: string;
  printedBy: string;
}

const INCIDENT_LABEL: Record<string, string> = {
  listrik: 'Gangguan listrik',
  internet: 'Gangguan internet',
  perangkat: 'Gangguan perangkat',
  kecurangan: 'Indikasi kecurangan',
  lainnya: 'Lainnya',
};

export default function BeritaAcaraPrintPage() {
  usePageTitle('Berita Acara');
  const { sessionId = '' } = useParams();
  const doc = useAsync(
    () => apiRequest<BeritaAcaraDocument>('/api/reports', { query: { resource: 'berita-acara', sessionId } }),
    [sessionId],
    { enabled: Boolean(sessionId) },
  );

  if (doc.loading) return <LoadingState label="Menyiapkan berita acara…" />;
  if (doc.error) return <ErrorState message={doc.error} onRetry={() => void doc.reload()} />;
  if (!doc.data) return null;

  const data = doc.data;
  const { counts, actual, session } = data;

  return (
    <PrintLayout title="Berita Acara Pelaksanaan Ujian" backTo="/proktor">
      <PrintLetterhead school={data.school} title="Berita Acara Pelaksanaan Ujian" subtitle={data.school.name} />

      <p className="text-[10.5pt] leading-relaxed">
        Pada hari ini, <strong>{data.schedule.dateLabel}</strong>, telah dilaksanakan ujian{' '}
        <strong>{data.schedule.title}</strong> ({data.schedule.examTypeName}) yang dilaksanakan secara komputerisasi
        menggunakan aplikasi NeoTest pada ruang <strong>{session.roomName}</strong> (kode sesi {session.code}) mulai
        pukul {data.schedule.startTime} sampai dengan {data.schedule.endTime}. Berita acara ini disusun berdasarkan
        data pelaksanaan yang tercatat oleh sistem.
      </p>

      <h3 className="mt-4 text-[11pt] font-bold">A. Rekapitulasi Peserta</h3>
      <table className="print-table mt-1">
        <tbody>
          <tr>
            <td className="w-8 text-center">1.</td>
            <td>Peserta yang dijadwalkan</td>
            <td className="w-24 text-center">{counts.scheduled} orang</td>
          </tr>
          <tr>
            <td className="text-center">2.</td>
            <td>Peserta yang hadir (diperiksa kehadirannya)</td>
            <td className="text-center">{counts.present} orang</td>
          </tr>
          <tr>
            <td className="text-center">3.</td>
            <td>Peserta yang tidak hadir</td>
            <td className="text-center">{counts.absent} orang</td>
          </tr>
          <tr>
            <td className="text-center">4.</td>
            <td>Peserta yang memulai mengerjakan</td>
            <td className="text-center">{counts.started} orang</td>
          </tr>
          <tr>
            <td className="text-center">5.</td>
            <td>Peserta yang menyelesaikan dan mengirim jawaban</td>
            <td className="text-center">{counts.submitted} orang</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-4 text-[11pt] font-bold">B. Waktu Pelaksanaan</h3>
      <table className="print-table mt-1">
        <tbody>
          <tr>
            <td className="w-8 text-center">1.</td>
            <td>Sesi dibuka</td>
            <td className="w-48">{formatDateTimeId(session.openedAt)}</td>
          </tr>
          <tr>
            <td className="text-center">2.</td>
            <td>Peserta pertama mulai</td>
            <td>{formatDateTimeId(actual.firstStartAt)}</td>
          </tr>
          <tr>
            <td className="text-center">3.</td>
            <td>Pengiriman terakhir</td>
            <td>{formatDateTimeId(actual.lastSubmitAt)}</td>
          </tr>
          <tr>
            <td className="text-center">4.</td>
            <td>Durasi pelaksanaan efektif</td>
            <td>{actual.durationMinutes > 0 ? `${actual.durationMinutes} menit` : '—'}</td>
          </tr>
          <tr>
            <td className="text-center">5.</td>
            <td>Sesi ditutup</td>
            <td>{formatDateTimeId(session.closedAt)}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-4 text-[11pt] font-bold">C. Kejadian / Insiden</h3>
      {data.incidents.length === 0 ? (
        <p className="mt-1 text-[10pt] italic">Tidak ada insiden yang dicatat selama pelaksanaan ujian.</p>
      ) : (
        <table className="print-table mt-1">
          <thead>
            <tr>
              <th className="w-8">No</th>
              <th className="w-24">Waktu</th>
              <th className="w-36">Jenis</th>
              <th>Uraian</th>
              <th className="w-40">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {data.incidents.map((incident, index) => (
              <tr key={incident.id} className="avoid-break">
                <td className="text-center">{index + 1}</td>
                <td>{formatDateTimeId(incident.createdAt)}</td>
                <td>{INCIDENT_LABEL[incident.type] ?? incident.type}</td>
                <td>{incident.description}</td>
                <td>{incident.action || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="mt-4 text-[11pt] font-bold">D. Catatan</h3>
      <p className="mt-1 min-h-[3rem] border border-slate-300 p-2 text-[10pt] leading-relaxed">
        {data.notes || 'Tidak ada catatan tambahan dari proktor.'}
      </p>

      <p className="mt-4 text-[10.5pt] leading-relaxed">
        Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
      </p>

      <div className="mt-6">
        <SignatureBlock
          left={{ title: 'Proktor Ruang', name: data.proctorName }}
          right={{
            title: 'Kepala Sekolah',
            name: data.headmaster.name,
            nip: data.headmaster.nip,
            stamp: data.school.letterhead?.stampNote,
          }}
        />
      </div>

      <p className="mt-4 text-[8.5pt] text-slate-500">
        Dibuat otomatis oleh NeoTest pada {formatDateId(data.printedAt)} oleh {data.printedBy}.
      </p>
      <PrintFooter note="Dokumen ini dihasilkan dari data pelaksanaan resmi NeoTest" />
    </PrintLayout>
  );
}
