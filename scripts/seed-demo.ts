/**
 * Membangun ulang data DEMO pada driver demo (berkas JSON).
 * Tidak pernah menyentuh data Firestore / produksi.
 */
import 'dotenv/config';
import { dataDriver, resetDemoStore } from '../api/_lib/store';
import { DEMO_PASSWORD } from '../api/_lib/demoSeed';

async function main(): Promise<void> {
  if (dataDriver() !== 'demo') {
    console.error('❌ NEOTEST_DATA_DRIVER bukan "demo". Skrip ini menolak menyentuh data produksi.');
    process.exit(1);
  }
  await resetDemoStore();
  console.log('✅ Data DEMO dibangun ulang.');
  console.log(`   Password akun demo: ${DEMO_PASSWORD}`);
  console.log('   Akun: superadmin@neotest.demo, admin@neotest.demo, guru@neotest.demo,');
  console.log('         proktor@neotest.demo, siswa01@neotest.demo … siswa24@neotest.demo');
}

main().catch((err) => {
  console.error('❌ Gagal:', err);
  process.exit(1);
});
