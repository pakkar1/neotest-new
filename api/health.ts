import { endpoint, json } from './_lib/http';
import { dataDriver, demoStoreIsEphemeral, getStore } from './_lib/store';
import { serverNow } from './_lib/clock';

export default endpoint(async () => {
  const driver = dataDriver();
  let database = 'ok';
  let demoInfo: Record<string, unknown> | null = null;
  try {
    const store = await getStore();
    const schools = await store.query<{ id: string }>('schools', { limit: 1 });
    if (schools.length === 0) database = 'empty';
    if (driver === 'demo') {
      const meta = await store.getDoc<{ id: string; seededAt?: string }>('demoMeta', 'info');
      demoInfo = {
        seededAt: meta?.seededAt ?? null,
        ephemeral: demoStoreIsEphemeral(),
        warning: demoStoreIsEphemeral()
          ? 'Data demo pada deployment Vercel disimpan di /tmp dan dapat direset saat instance didaur ulang.'
          : null,
      };
    }
  } catch (err) {
    database = err instanceof Error ? `error: ${err.message}` : 'error';
  }
  return json({
    ok: database === 'ok' || database === 'empty',
    app: 'NeoTest',
    version: '1.0.0',
    mode: driver,
    database,
    demo: demoInfo,
    serverNow: serverNow().toISOString(),
  });
});
