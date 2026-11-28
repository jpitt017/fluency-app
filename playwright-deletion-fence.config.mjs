import { defineConfig } from '@playwright/test';
import path from 'node:path';

// The contract briefly changes a flag on the explicitly pinned isolated E2E
// project. It must run alone, under the same CI lock as the schema rebuild.
const oldAppDir = process.env.E2E_OLD_APP_DIR;
if (oldAppDir && !path.isAbsolute(oldAppDir)) throw new Error('The old application directory must be absolute');
const servers = [{
  command: 'npm run start',
  url: 'http://127.0.0.1:3000',
  reuseExistingServer: false,
  timeout: 120_000,
}];
if (oldAppDir) servers.push({
  command: 'npm --prefix "$E2E_OLD_APP_DIR" run start -- --port 3001',
  url: 'http://127.0.0.1:3001',
  reuseExistingServer: false,
  timeout: 120_000,
});

export default defineConfig({
  testDir: './tests/deletion-contract',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', headless: true },
  webServer: servers,
});
