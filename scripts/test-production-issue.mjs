#!/usr/bin/env node
/** Manual production smoke test. Creates a confirmed @example.test user, sends
 * exactly one issue, checks the saved delivery state and deletes all test data. */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from './lib/test-user.mjs';

const productionUrl = 'https://fluency-app-nine.vercel.app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url !== 'https://ebzmkhrssgnzmixfsuso.supabase.co' || !key) {
  throw new Error('The authorized production database and service key are required.');
}
const admin = createClient(url, key, { auth: { persistSession: false } });
let user;
let browser;
let outcome;
try {
  user = await createTestUser(admin, 'issue-prod-test');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${productionUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(dashboard|labs)/, { timeout: 30000 });
  await page.getByRole('button', { name: 'Problem? Tell us' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('What would you like to tell us?').selectOption('broken');
  await dialog.getByLabel('Tell us what happened').fill('Production alert test. Please ignore.');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await dialog.getByText("Thank you! We'll look at this soon.").waitFor({ timeout: 30000 });
  const { data, error } = await admin.from('issue_reports').select('type,email_sent_at,app_version').eq('user_id', user.id);
  if (error || data?.length !== 1 || data[0].type !== 'broken') throw new Error('Could not verify exactly one saved report.');
  outcome = data[0].email_sent_at
    ? `Resend accepted the alert at ${data[0].email_sent_at}; app version ${data[0].app_version}. Inbox delivery is not verified.`
    : `Alert is queued (email_sent_at is empty); app version ${data[0].app_version}. Check Vercel email settings and server logs.`;
} finally {
  if (browser) await browser.close();
  if (user) await deleteTestUser(admin, user.id);
}
console.log(`::notice title=Production issue test::${outcome} Test user and data deleted.`);
