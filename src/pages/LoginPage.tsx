import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import { useAuth } from '../services/auth';
import { ApiClientError } from '../services/api';
import { homePathFor } from '../shared/permissions';
import { NeoTestWordmark } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { usePageTitle } from '../hooks';
import type { Role } from '../shared/types';

const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin Sekolah',
  teacher: 'Guru',
  proctor: 'Proktor',
  student: 'Siswa',
};

interface DemoAccount {
  email: string;
  name: string;
  roles: Role[];
  available: boolean;
}

export default function LoginPage() {
  usePageTitle('Masuk');
  const { status, user, config, login, loginWithFirebase, error: authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!config?.demo) return;
    let active = true;
    import('../services/api').then(({ apiRequest }) =>
      apiRequest<{ accounts: DemoAccount[]; note?: string }>('/api/auth', {
        query: { action: 'demo-accounts' },
      })
        .then((res) => {
          if (!active) return;
          setAccounts(res.accounts.filter((a) => a.available));
          setDemoNote(res.note ?? null);
        })
        .catch(() => {
          if (active) setAccounts([]);
        }),
    );
    return () => {
      active = false;
    };
  }, [config?.demo]);

  if (status === 'ready' && user) {
    const redirectTo =
      (location.state as { from?: string } | null)?.from ?? homePathFor(user.roles);
    return <Navigate to={redirectTo} replace />;
  }

  const isFirebase = config?.mode === 'firebase';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!identifier.trim() || !password) {
      setFormError('Isi email/username dan kata sandi terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      const signedIn = isFirebase
        ? await loginWithFirebase(identifier.trim(), password)
        : await login(identifier.trim(), password);
      const redirectTo =
        (location.state as { from?: string } | null)?.from ?? homePathFor(signedIn.roles);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(
          err.status === 401 || err.code === 'UNAUTHENTICATED'
            ? 'Email/username atau kata sandi salah. Periksa kembali.'
            : err.message,
        );
      } else if (err instanceof Error && err.message.includes('auth/')) {
        setFormError('Email atau kata sandi Firebase tidak valid.');
      } else {
        setFormError('Tidak dapat masuk. Periksa koneksi internet lalu coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const useDemo = (email: string) => {
    setIdentifier(email);
    setPassword(config?.demoPassword ?? '');
    setFormError(null);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panel brand */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-10 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(900px 500px at 15% 0%, rgba(59,150,246,0.55), transparent 60%), radial-gradient(700px 500px at 100% 100%, rgba(30,84,168,0.8), transparent 60%)',
          }}
        />
        <div className="relative">
          <NeoTestWordmark inverted subtitle="Ujian Sekolah Terpadu" />
        </div>
        <div className="relative max-w-lg">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-100">
            <Sparkles className="h-3.5 w-3.5" /> Powered by Pakkar
          </p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            Ujian sekolah yang rapi,<br />
            cepat, dan dapat diawasi.
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-navy-100">
            Bank soal, paket ujian dengan snapshot permanen, token sesi, pengawasan ruang, hingga analisis butir
            soal — dalam satu aplikasi ringan yang berjalan di hosting gratis.
          </p>
          <ul className="mt-6 space-y-3 text-[13.5px] text-navy-100">
            {[
              { icon: <ShieldCheck className="h-4 w-4" />, text: 'Peran & izin ditegakkan di server, bukan di browser.' },
              { icon: <Timer className="h-4 w-4" />, text: 'Timer berbasis jam server dengan autosave tahan putus koneksi.' },
              { icon: <KeyRound className="h-4 w-4" />, text: 'Token mulai & kirim yang di-hash, dapat dicabut, dan tercatat di audit log.' },
              { icon: <Users className="h-4 w-4" />, text: 'Dirancang untuk ribuan peserta dengan kuota Firestore yang terkendali.' },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-200">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-[11.5px] leading-relaxed text-navy-300">
          <p>{now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p className="mt-1">
            NeoTest bukan aplikasi resmi Kemendikdasmen dan tidak menggunakan logo instansi mana pun.
          </p>
        </div>
      </section>

      {/* Panel form */}
      <section className="flex flex-col bg-[#f7f9fc]">
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <NeoTestWordmark />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-6">
              <h2 className="text-[26px] font-bold leading-tight text-navy-900">Masuk ke akun Anda</h2>
              <p className="mt-1 text-[13.5px] text-slate-500">
                {config?.schoolName ? (
                  <>
                    Lingkungan: <span className="font-medium text-slate-700">{config.schoolName}</span>
                    {config.demo ? ' (DEMO)' : ''}
                  </>
                ) : (
                  'Gunakan akun yang diberikan administrator sekolah.'
                )}
              </p>
            </div>

            {config?.demo ? (
              <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-3 text-[12.5px] text-orange-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Info className="h-4 w-4" /> Lingkungan demonstrasi
                </p>
                <p className="mt-1 leading-relaxed">
                  Data bersifat contoh dan password demo hanya berlaku di mode demo. Jangan gunakan untuk ujian
                  sungguhan.
                </p>
              </div>
            ) : null}

            {config?.demoEphemeral ? (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
                Penyimpanan demo di Vercel bersifat sementara (<code>/tmp</code>) dan dapat ter-reset saat
                instance didaur ulang.
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              <div>
                <label className="label" htmlFor="identifier">
                  Email atau username
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="identifier"
                    className="input pl-9"
                    type={isFirebase ? 'email' : 'text'}
                    autoComplete="username"
                    inputMode="email"
                    placeholder="nama@sekolah.sch.id"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Kata sandi
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    className="input pl-9 pr-10"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                    disabled={submitting}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsLock ? (
                  <p className="mt-1 text-[11.5px] font-medium text-amber-700">Caps Lock sedang aktif.</p>
                ) : null}
              </div>

              {formError ?? authError ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[12.5px] text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError ?? authError}</span>
                </div>
              ) : null}

              <Button type="submit" block size="lg" loading={submitting} iconRight={<ArrowRight className="h-4 w-4" />}>
                Masuk
              </Button>
            </form>

            {accounts.length > 0 ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                    Akun demo cepat
                  </p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                    DEMO
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {accounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => useDemo(account.email)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-medium text-slate-800">{account.name}</span>
                        <span className="block truncate text-[11px] text-slate-500">{account.email}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">
                          {ROLE_LABEL[account.roles[0]]}
                        </span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      </span>
                    </button>
                  ))}
                </div>
                {demoNote ? <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{demoNote}</p> : null}
                {config?.demoPassword ? (
                  <p className="mt-2 border-t border-dashed border-slate-200 pt-2 text-[11.5px] text-slate-600">
                    Password demo: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{config.demoPassword}</code>{' '}
                    (hanya untuk demonstrasi).
                  </p>
                ) : null}
              </div>
            ) : null}

            {status === 'loading' ? (
              <p className="mt-4 flex items-center gap-1.5 text-[12px] text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memeriksa sesi…
              </p>
            ) : null}

            <p className="mt-6 text-center text-[11.5px] leading-relaxed text-slate-500">
              Lupa kata sandi? Hubungi administrator sekolah. Tidak ada akun admin default dan tidak ada endpoint
              super admin publik.
            </p>
          </div>
        </div>
        <footer className="px-6 py-4 text-center text-[11px] text-slate-400 lg:text-left">
          NeoTest · Powered by Pakkar · Bukan aplikasi resmi Kemendikdasmen
        </footer>
      </section>
    </div>
  );
}
