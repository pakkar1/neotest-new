import { endpoint, json } from './_lib/http';
import { serverNow } from './_lib/clock';
import { rateLimit } from './_lib/rateLimit';

/** Waktu resmi server untuk sinkronisasi tampilan timer siswa. */
export default endpoint(async (req) => {
  rateLimit({ key: `time:${req.ip}`, limit: 120, windowMs: 60_000 });
  return json({ serverNow: serverNow().toISOString(), timezone: 'Asia/Jakarta' });
});
