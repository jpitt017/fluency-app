// Diagnostic: does anything cover the "Continue to Writing Sample →" button at Q24?
import { chromium } from '@playwright/test';

const BASE = process.env.PROD_BASE || 'https://fluency-app-nine.vercel.app';
const viewports = [
  { width: 1280, height: 720 },
  { width: 1069, height: 713 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];

const browser = await chromium.launch();
const out = {};

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const key = `${viewport.width}x${viewport.height}`;
  try {
    await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 1; i <= 24; i++) {
      await page.getByRole('heading', { name: `Question ${i} of 24` }).waitFor({ timeout: 20000 });
      await page.locator('main .space-y-2\\.5 > button').first().click();
      const next = page.getByRole('button', { name: i === 24 ? /Continue to Writing Sample/ : 'Next Question' });
      await next.scrollIntoViewIfNeeded();
      await next.click();
    }
    const proceeded = await page.getByRole('heading', { name: /Write a short text/ }).isVisible().catch(() => false);
    out[`${key}_proceeded`] = proceeded;

    // Go back and inspect Q24 layout precisely.
    await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 1; i <= 23; i++) {
      await page.getByRole('heading', { name: `Question ${i} of 24` }).waitFor({ timeout: 20000 });
      await page.locator('main .space-y-2\\.5 > button').first().click();
      await page.getByRole('button', { name: 'Next Question' }).click();
    }
    await page.getByRole('heading', { name: 'Question 24 of 24' }).waitFor({ timeout: 20000 });
    await page.locator('main .space-y-2\\.5 > button').first().click();
    const button = page.getByRole('button', { name: /Continue to Writing Sample/ });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    out[`${key}_button_box`] = JSON.stringify(box);
    out[`${key}_hits`] = await page.evaluate((b) => {
      const describe = (el) => (el ? `${el.tagName}:${(el.textContent || '').trim().slice(0, 40)}` : 'null');
      const points = {
        center: [b.x + b.width / 2, b.y + b.height / 2],
        bottomRight: [b.x + b.width - 6, b.y + b.height - 6],
        bottomCenter: [b.x + b.width / 2, b.y + b.height - 4],
      };
      return Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => {
        const el = document.elementFromPoint(x, y);
        const clickable = el?.closest('button, a');
        return [name, `${describe(el)} -> ${describe(clickable)}`];
      }));
    }, box);
    // Also report the floating reporter button box.
    const reporter = page.getByRole('button', { name: /Problem\? Tell us/ });
    out[`${key}_reporter_box`] = JSON.stringify(await reporter.boundingBox());
    out[`${key}_dialog_open`] = await page.evaluate(() => Boolean(document.querySelector('dialog[open]')));
  } catch (error) {
    out[`${key}_error`] = error.message.split('\n')[0].slice(0, 200);
  }
  await context.close();
}

await browser.close();
console.log(`::warning::LAYOUT ${JSON.stringify(out)}`);
