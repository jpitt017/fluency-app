import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const sections = [
  ['Reading', 'reading-practice'],
  ['Listening', 'listening-practice'],
  ['Speaking', 'speaking-practice'],
  ['Writing', 'writing-practice'],
  ['Grammar', 'grammar-practice'],
  ['Vocabulary', 'vocabulary-practice'],
];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function expectSection(page, id) {
  const heading = page.locator(`#${id} h2`).first();
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  // A sticky header must not cover the focused heading on a phone.
  await expect.poll(async () => {
    const header = await page.locator('body > header').boundingBox();
    const bounds = await heading.boundingBox();
    return bounds.y - (header.y + header.height);
  }).toBeGreaterThanOrEqual(0);
}

test('week links focus each section on a phone and respect reduced motion', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [, id] of sections) {
    await page.goto(`/week/1#${id}`);
    await expectSection(page, id);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  }

  // Changing between section hashes on the same page also moves focus.
  await page.goto('/week/1#reading-practice');
  await page.evaluate(() => { window.location.hash = '#writing-practice'; });
  await expectSection(page, 'writing-practice');

  // A future week has no authored sections yet: a deep link lands on the
  // "coming soon" explanation, rather than leaving focus at page top.
  await page.goto('/week/5#grammar-practice');
  const unavailable = page.locator('#week-activities-unavailable h2');
  await expect(unavailable).toHaveText('Week 5 activities are coming soon');
  await expect(unavailable).toBeFocused();
  await expect(unavailable).toBeInViewport();

  // A normal visit has no forced focus, and other existing hashes are untouched.
  await page.goto('/week/1');
  await expect(page.locator('#grammar-practice h2').first()).not.toBeFocused();
  await page.goto('/week/1#listening-questions');
  await expect(page.locator('#listening-practice h2').first()).not.toBeFocused();
});

test('deep links use smooth scrolling when reduced motion is not requested', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.weekLinkScrolls = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (this.id === 'listening-practice') window.weekLinkScrolls.push(options?.behavior);
      return original.call(this, options);
    };
  });
  await page.goto('/week/1#listening-practice');
  await expectSection(page, 'listening-practice');
  expect(await page.evaluate(() => window.weekLinkScrolls)).toContain('smooth');
});

test('signed-in dashboard cards open the matching section of the current week', async ({ page }) => {
  test.skip(!url || !key, 'Live test needs the service key');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'dashboard-week-links');
  try {
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
    // A signed-in learner's current week is authoritative, even if a query
    // parameter asks to view another week.
    await page.goto('/dashboard?week=4');
    await expect(page.getByText(/^Week 1:/)).toBeVisible();

    for (const [label, id] of sections) {
      const card = page.getByRole('link', { name: new RegExp(`^${label}\\b`) });
      await expect(card).toHaveAttribute('href', `/week/1#${id}`);
      await card.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/week/1#${id}$`));
      await expectSection(page, id);
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard\?week=4$/);
    }
    // Review and free-practice destinations still exist separately.
    await expect(page.getByRole('link', { name: /Practise your mistakes/ }).first()).toHaveAttribute('href', '/review');
  } finally {
    await deleteTestUser(admin, user.id);
  }
});
