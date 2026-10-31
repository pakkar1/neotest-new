import fs from 'node:fs';
import path from 'node:path';

process.env.NEOTEST_DATA_DRIVER = 'demo';
process.env.NEOTEST_SESSION_SECRET = 'test-session-secret-please-change-32chars';
process.env.NEOTEST_TOKEN_PEPPER = 'test-token-pepper-16chars';
const dataFile = path.join(process.cwd(), '.data', 'vitest-neotest.json');
process.env.NEOTEST_DATA_FILE = dataFile;
try {
  fs.rmSync(dataFile, { force: true });
} catch {
  // abaikan
}
