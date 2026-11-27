import { expect, test } from './helpers/isolated-test.mjs';
import { readFileSync } from 'node:fs';

const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

test('the model stays hidden before a first saved recording', async ({ page }) => {
  const response = await page.goto('/week/1#speaking-practice');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '3. Listen to the model' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show the script' })).toHaveCount(0);
  await expect(page.getByText(details.weeks[0].speaking.model, { exact: false })).toHaveCount(0);
  await expect(page.getByText(/focus question|tap the phrases you hear/i)).toHaveCount(0);
});
