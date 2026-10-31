import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { Checkbox } from '../../components/ui/Field';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAsync, useOptions, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../services/auth';
import type { AppSettings } from '../../shared/types';

export default function SettingsPage() {
  usePageTitle('Pengaturan');
  const toast = useToast();
  const { user, config } = useAuth();
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? user?.schoolId ?? '';
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const settings = useAsync(
    () => apiRequest<{ doc: AppSettings | null }>('/api/admin', { query: { resource: 'settings', schoolId } }),
    [schoolId],
    { enabled: Boolean(schoolId) },
  );

  useEffect(() => {
    if (settings.data?.doc) setForm(settings.data.doc);
    else if (settings.data && !settings.data.doc) {
      setForm({
        id: `settings_${schoolId}`,
        schoolId,
        branding: { appName: 'NeoTest', tagline: 'Powered by Pakkar', primaryColor: '#0f2a54' },
        security: { maxFailedLogin: 10, tokenTtlDefaultMinutes: 120, submitTokenTtlMinutes: 30, allowStudentIpLock: false },
        quota: { enabled: true, dailyReadWarning: 40_000, dailyWriteWarning: 16_000 },
      });
    }
  }, [settings.data, schoolId]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ doc: AppSettings }>('/api/admin', {
        method: 'PATCH',
        query: { resource: 'settings' },
        body: {
          schoolId,
          branding: form.branding,
          security: form.security,
          quota: form.quota,
        },
      });
      setForm(res.doc);
      toast.success('Pengaturan disimpan.');
    } catch (err) {
      toast.error('Gagal menyimpan', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      await apiRequest('/api/admin', { method: 'POST', query: { resource: 'reset-demo' } });
      toast.success('Data demo dibangun ulang. Silakan muat ulang halaman.');
      setResetOpen(false);
    } catch (err) {
      toast.error('Gagal reset', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pengaturan"
        description="Branding, keamanan sesi, dan ambang kuota. Perubahan berlaku untuk sekolah aktif dan dicatat di audit log."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Pengaturan' }]}
        actions={
          <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()} disabled={!form}>
            Simpan pengaturan
          </Button>
        }
      />

      {settings.loading ? <LoadingState label="Memuat pengaturan…" /> : null}
      {settings.error ? <ErrorState message={settings.error} onRetry={() => void settings.reload()} /> : null}

      {form ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Branding" description="Nama aplikasi dan warna utama untuk halaman internal." />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nama aplikasi">
                <Input value={form.branding.appName} onChange={(e) => setForm({ ...form, branding: { ...form.branding, appName: e.target.value } })} />
              </Field>
              <Field label="Tagline">
                <Input value={form.branding.tagline} onChange={(e) => setForm({ ...form, branding: { ...form.branding, tagline: e.target.value } })} />
              </Field>
              <Field label="Warna utama" hint="Format hex, mis. #0f2a54">
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                    value={form.branding.primaryColor}
                    onChange={(e) => setForm({ ...form, branding: { ...form.branding, primaryColor: e.target.value } })}
                  />
                  <Input value={form.branding.primaryColor} onChange={(e) => setForm({ ...form, branding: { ...form.branding, primaryColor: e.target.value } })} />
                </div>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Keamanan sesi" description="Berlaku pada token ujian dan pembatasan login." actions={<ShieldCheck className="h-4 w-4 text-slate-400" />} />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Maks. percobaan login gagal">
                <Input
                  type="number"
                  min={3}
                  max={20}
                  value={form.security.maxFailedLogin}
                  onChange={(e) => setForm({ ...form, security: { ...form.security, maxFailedLogin: Number(e.target.value) } })}
                />
              </Field>
              <Field label="Masa berlaku token mulai (menit)" hint="Maksimal 240 menit.">
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={form.security.tokenTtlDefaultMinutes}
                  onChange={(e) => setForm({ ...form, security: { ...form.security, tokenTtlDefaultMinutes: Number(e.target.value) } })}
                />
              </Field>
              <Field label="Masa berlaku token kirim (menit)">
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={form.security.submitTokenTtlMinutes}
                  onChange={(e) => setForm({ ...form, security: { ...form.security, submitTokenTtlMinutes: Number(e.target.value) } })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Checkbox
                  label="Batasi peserta berdasarkan IP ruang"
                  description="Eksperimental. Bila diaktifkan, peserta hanya dapat mulai dari jaringan yang sama dengan proktor. Periksa dukungan jaringan sekolah sebelum memakai."
                  checked={form.security.allowStudentIpLock}
                  onChange={(e) => setForm({ ...form, security: { ...form.security, allowStudentIpLock: e.target.checked } })}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Ambang kuota" description="Peringatan internal saat pemakaian mendekati batas harian Firestore Spark." />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Peringatan bacaan harian">
                <Input
                  type="number"
                  min={1000}
                  step={1000}
                  value={form.quota.dailyReadWarning}
                  onChange={(e) => setForm({ ...form, quota: { ...form.quota, dailyReadWarning: Number(e.target.value) } })}
                />
              </Field>
              <Field label="Peringatan penulisan harian">
                <Input
                  type="number"
                  min={1000}
                  step={500}
                  value={form.quota.dailyWriteWarning}
                  onChange={(e) => setForm({ ...form, quota: { ...form.quota, dailyWriteWarning: Number(e.target.value) } })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Checkbox
                  label="Aktifkan pemantauan kuota"
                  description="Menghitung perkiraan bacaan/penulisan per permintaan. Bukan metrik resmi Firebase."
                  checked={form.quota.enabled}
                  onChange={(e) => setForm({ ...form, quota: { ...form.quota, enabled: e.target.checked } })}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Lingkungan" description="Informasi mode penyimpanan dan tindakan berbahaya." actions={<Settings2 className="h-4 w-4 text-slate-400" />} />
            <div className="mt-3 space-y-2 text-[12.5px] text-slate-600">
              <p>
                Mode data: <strong>{config?.mode === 'firebase' ? 'Firebase (produksi)' : 'Demo (JSON lokal)'}</strong>
              </p>
              <p>Toko demo pada Vercel bersifat sementara dan dapat ter-reset saat instance didaur ulang.</p>
              {config?.demo ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-800">
                    <AlertTriangle className="h-4 w-4" /> Reset data demo
                  </p>
                  <p className="mt-1 text-[11.5px] text-red-700">
                    Menghapus seluruh data demo dan membangun ulang dari seed. Tindakan ini tercatat di audit log.
                    Hanya tersedia pada mode demo dan untuk Super Admin.
                  </p>
                  <Button className="mt-2" size="sm" variant="danger" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setResetOpen(true)}>
                    Reset data demo
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <ConfirmDialog
        open={resetOpen}
        title="Reset seluruh data demo?"
        message="Semua perubahan pada data demo akan hilang dan diganti data contoh awal. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, reset"
        loading={resetting}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => void resetDemo()}
      />
    </div>
  );
}
