import { defineConfig } from '@playwright/test';
import path from 'node:path';

// These tests are deliberately separate from the normal suite: CI runs the
// actual old and new production builds against successive schemas on the pinned
// isolated Supabase project, while holding its shared-project lock.
const pair = process.env.E2E_ROLLOUT_PAIR;
if (!['new-app-old-schema', 'old-app-new-schema'].includes(pair)) {
  throw new Error('E2E_ROLLOUT_PAIR must select one explicitly staged deployment order');
}
if (pair === 'old-app-new-schema' && (!process.env.E2E_OLD_APP_DIR || !path.isAbsolute(process.env.E2E_OLD_APP_DIR))) {
  throw new Error('The old application must be built in an absolute isolated directory');
}

export default defineConfig({
  testDir: './tests/rollout',
  timeout: 180_000,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:3000', headless: true },
  webServer: {
    command: pair === 'old-app-new-schema' ? 'npm --prefix "$E2E_OLD_APP_DIR" run start' : 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
