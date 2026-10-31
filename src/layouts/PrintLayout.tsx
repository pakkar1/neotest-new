import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { NeoTestLogo } from '../components/Logo';
import type { School } from '../shared/types';

export function PrintLayout({
  children,
  title,
  backTo,
}: {
  children: ReactNode;
  title: string;
  backTo?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-200 py-4 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-3 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-2 px-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        >
          Kembali
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-500">{title}</span>
          <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Cetak / Simpan PDF
          </Button>
        </div>
      </div>
      <div className="print-page">{children}</div>
    </div>
  );
}

export function PrintLetterhead({
  school,
  title,
  subtitle,
  logoFallback = true,
}: {
  school: School;
  title: string;
  subtitle?: string;
  logoFallback?: boolean;
}) {
  return (
    <>
      <div className="print-letterhead">
        {school.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logoUrl} alt={`Logo ${school.name}`} className="h-16 w-16 object-contain" />
        ) : logoFallback ? (
          <div className="h-14 w-14">
            <NeoTestLogo className="h-14 w-14" />
          </div>
        ) : null}
        <div className="flex-1 text-center">
          {school.letterhead.authorityLine ? (
            <p className="text-[11pt] uppercase tracking-wide">{school.letterhead.authorityLine}</p>
          ) : null}
          <h1 className="uppercase">{school.name}</h1>
          <p className="text-[9.5pt] leading-snug">
            {school.address} — {school.city}, {school.province}
          </p>
          <p className="text-[9.5pt]">
            NPSN {school.npsn} · Telp. {school.phone || '—'} · {school.email}
          </p>
        </div>
        {school.logoUrl ? <div className="h-14 w-14" /> : null}
      </div>
      <div className="mb-4 text-center">
        <h2 className="text-[13pt] font-bold uppercase tracking-wide">{title}</h2>
        {subtitle ? <p className="text-[10pt]">{subtitle}</p> : null}
      </div>
    </>
  );
}

export function SignatureBlock({
  left,
  right,
}: {
  left: { title: string; name: string; nip?: string };
  right: { title: string; name: string; nip?: string; stamp?: string };
}) {
  return (
    <div className="signature-grid avoid-break">
      <div className="signature-box">
        <p>{left.title}</p>
        <div className="signature-space" />
        <p className="font-semibold underline">{left.name || '………………………………'}</p>
        {left.nip ? <p>NIP. {left.nip}</p> : null}
      </div>
      <div className="signature-box">
        <p>{right.title}</p>
        <div className="signature-space" />
        <p className="font-semibold underline">{right.name || '………………………………'}</p>
        {right.nip ? <p>NIP. {right.nip}</p> : null}
        {right.stamp ? <p className="mt-1 text-[8.5pt] italic text-slate-500">{right.stamp}</p> : null}
      </div>
    </div>
  );
}

export function PrintFooter({ note }: { note: string }) {
  return (
    <p className="mt-6 border-t border-slate-300 pt-2 text-[8.5pt] italic text-slate-500">
      {note} · Dicetak dari NeoTest — Powered by Pakkar
    </p>
  );
}
