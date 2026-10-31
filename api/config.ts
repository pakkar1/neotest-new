import { endpoint, json } from './_lib/http';
import { dataDriver, demoStoreIsEphemeral, getStore } from './_lib/store';
import { serverNow } from './_lib/clock';
import type { School } from '../src/shared/types';

/**
 * Konfigurasi publik (aman untuk browser). Tidak berisi service account,
 * private key, atau secret server apa pun.
 */
export default endpoint(async () => {
  const driver = dataDriver();
  let schoolName: string | null = null;
  try {
    const store = await getStore();
    const schools = await store.query<School>('schools', {
      where: [{ field: 'active', op: '==', value: true }],
      limit: 1,
    });
    schoolName = schools[0]?.name ?? null;
  } catch {
    schoolName = null;
  }
  return json({
    appName: 'NeoTest',
    tagline: 'Powered by Pakkar',
    mode: driver,
    demo: driver === 'demo',
    demoEphemeral: demoStoreIsEphemeral(),
    demoPassword: driver === 'demo' ? 'NeoTest#2026' : null,
    schoolName,
    serverNow: serverNow().toISOString(),
    firebase:
      driver === 'firebase'
        ? {
            apiKey: process.env.NEOTEST_FIREBASE_API_KEY ?? '',
            authDomain: process.env.NEOTEST_FIREBASE_AUTH_DOMAIN ?? '',
            projectId: process.env.NEOTEST_FIREBASE_PROJECT_ID ?? '',
            appId: process.env.NEOTEST_FIREBASE_APP_ID ?? '',
          }
        : null,
    features: {
      appCheck: Boolean(process.env.VITE_FIREBASE_APPCHECK_KEY),
      recaptcha: Boolean(process.env.RECAPTCHA_SECRET_KEY),
    },
    limits: { reads: 50_000, writes: 20_000, note: 'Kuota harian Firestore Spark (perkiraan resmi Google).' },
  });
});
