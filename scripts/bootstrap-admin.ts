/**
 * Bootstrap super admin pertama NeoTest.
 *
 * Jalankan secara terkontrol di lingkungan server, misalnya:
 *   NEOTEST_DATA_DRIVER=firebase \
 *   FIREBASE_SERVICE_ACCOUNT_JSON='...' \
 *   npx tsx scripts/bootstrap-admin.ts --email admin@sekolah.sch.id \
 *     --name "Admin Utama" --school <id-atau-kode-sekolah>
 *
 * Tidak ada endpoint publik yang menjadikan pengguna biasa sebagai super admin.
 * Skrip menolak berjalan bila sudah ada super admin, kecuali --force.
 */
import 'dotenv/config';
import { getStore, dataDriver } from '../api/_lib/store';
import { generatePassword, hashPassword } from '../api/_lib/password';
import { newId, searchKeyOf } from '../api/_lib/ids';
import { syncUserProfile } from '../api/_lib/services/accounts';
import { serverNowIso } from '../api/_lib/clock';
import type { School, User } from '../src/shared/types';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.split('=').slice(1).join('=') : undefined;
}

async function main(): Promise<void> {
  const driver = dataDriver();
  const email = (arg('email') ?? process.env.NEOTEST_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  const name = arg('name') ?? process.env.NEOTEST_BOOTSTRAP_NAME ?? 'Super Admin';
  const schoolRef = arg('school') ?? process.env.NEOTEST_BOOTSTRAP_SCHOOL ?? '';
  const providedPassword = arg('password') ?? process.env.NEOTEST_BOOTSTRAP_PASSWORD;
  const force = process.argv.includes('--force');

  if (!email || !email.includes('@')) {
    console.error('❌ Gunakan --email <alamat@email> atau set NEOTEST_BOOTSTRAP_EMAIL.');
    process.exit(1);
  }
  if (driver === 'firebase') {
    const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0 && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.error(`❌ Kredensial Firebase Admin belum lengkap: ${missing.join(', ')}.`);
      process.exit(1);
    }
  }

  const store = await getStore();
  const existingSupers = await store.query<User>('users', {
    where: [{ field: 'roles', op: 'array-contains', value: 'superadmin' }],
    limit: 5,
  });
  if (existingSupers.length > 0 && !force) {
    console.log(
      `ℹ️  Sudah ada ${existingSupers.length} super admin. Gunakan --force untuk menambah administrator baru.`,
    );
    process.exit(0);
  }

  let schoolId: string | null = null;
  if (schoolRef) {
    const byId = await store.getDoc<School>('schools', schoolRef);
    const byCode = byId
      ? null
      : (await store.query<School>('schools', {
          where: [{ field: 'code', op: '==', value: schoolRef }],
          limit: 1,
        }))[0];
    const school = byId ?? byCode;
    if (!school) {
      console.error(`❌ Sekolah "${schoolRef}" tidak ditemukan. Buat sekolah terlebih dahulu sebagai super admin.`);
      process.exit(1);
    }
    schoolId = school.id;
  } else {
    const first = await store.query<School>('schools', {
      where: [{ field: 'deletedAt', op: '==', value: null }],
      limit: 1,
    });
    schoolId = first[0]?.id ?? null;
  }

  const existingByEmail = await store.query<User>('users', {
    where: [{ field: 'email', op: '==', value: email }],
    limit: 1,
  });

  const password = providedPassword ?? generatePassword();
  const now = serverNowIso();
  let uid: string | undefined = existingByEmail[0]?.uid;

  if (driver === 'firebase') {
    const { getAuth } = await import('firebase-admin/auth');
    try {
      const record = await getAuth().createUser({
        email,
        password,
        displayName: name,
        emailVerified: false,
      });
      uid = record.uid;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('email-exists') || message.toLowerCase().includes('already exists')) {
        const record = await getAuth().getUserByEmail(email);
        uid = record.uid;
        await getAuth().updateUser(uid, { password });
      } else {
        throw err;
      }
    }
  }

  const user: User = existingByEmail[0]
    ? {
        ...existingByEmail[0],
        displayName: name,
        roles: ['superadmin'],
        schoolId,
        active: true,
        deletedAt: null,
        updatedAt: now,
        ...(driver === 'demo' ? { passwordHash: hashPassword(password) } : {}),
        ...(uid ? { uid } : {}),
      }
    : {
        id: newId('user'),
        uid,
        email,
        displayName: name,
        roles: ['superadmin'],
        schoolId,
        active: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...(driver === 'demo' ? { passwordHash: hashPassword(password) } : {}),
      };

  await store.set('users', user.id, {
    ...user,
    searchKey: searchKeyOf(user.displayName, user.email),
  });
  await syncUserProfile(user);

  console.log('✅ Super admin siap.');
  console.log(`   Mode data : ${driver}`);
  console.log(`   User ID   : ${user.id}`);
  console.log(`   Email     : ${email}`);
  if (driver === 'demo') {
    console.log(`   Password  : ${password}`);
    console.log('   ⚠️  Simpan password ini; tidak ditampilkan ulang.');
  } else {
    console.log('   Password  : (diketahui oleh operator; Firebase Auth tidak menyimpan plaintext)');
  }
  if (driver === 'firebase') {
    console.log('   Ingat: aktifkan Firestore rules + indexes dari repositori ini.');
  }
}

main().catch((err) => {
  console.error('❌ Bootstrap gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
