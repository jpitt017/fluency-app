import { chromium } from '/home/user/fluency-app/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch({
  executablePath: '/tmp/chr112/chromium',
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr112/lib' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  timeout: 30000,
});
const p = await b.newPage();
await p.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 20000 });
console.log('TITLE:', await p.title());
await b.close();
