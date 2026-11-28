import { expect, test } from './helpers/isolated-test.mjs';
import { grammarPositionKey } from '../../lib/curriculum/grammar-practice-position.mjs';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const step = (region, direction) => region.getByRole('button', { name: `${direction} step`, exact: true });
const item = (region, direction) => region.getByRole('button', { name: `${direction} item`, exact: true });
const tab = (region, n, total) => region.getByRole('tab', { name: `Go to item ${n} of ${total}`, exact: true });

async function position(region, stepTitle, n, total) {
  await expect(region.getByRole('heading', { name: new RegExp(`Step [1-5] of 5: ${stepTitle}`) })).toBeVisible();
  await expect(region.getByRole('heading', { name: `Item ${n} of ${total}` })).toBeVisible();
  await expect(region.getByRole('tabpanel')).toHaveCount(1);
  await expect(tab(region, n, total)).toHaveAttribute('aria-selected', 'true');
}

async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function submit(page, button, path) {
  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === path && result.request().method() === 'POST', { timeout: 30_000 }),
    button.click(),
  ]);
  expect(response.ok(), `${path} returned HTTP ${response.status()}`).toBe(true);
}

for (const width of [375, 1280]) {
  test(`${width}px: grammar navigation restores the chosen step and item`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const hydrationErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|did not match/i.test(message.text())) hydrationErrors.push(message.text());
    });
    await page.goto('/week/1');
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });

    // The original See it presentation and Use it boxes are not paginated.
    await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
    await expect(grammar.locator('p.whitespace-pre-line')).toBeVisible();
    await expect(grammar.getByRole('radio')).toHaveCount(6);
    await expect(grammar.getByRole('tablist')).toHaveCount(0);
    await step(grammar, 'Next').click();
    await position(grammar, 'Practise', 1, 11);
    await expect(item(grammar, 'Previous')).toBeDisabled();
    const choice = grammar.getByRole('radio', { name: 'moved', exact: true });
    expect((await choice.locator('..').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await fits(page);

    await tab(grammar, 8, 11).click();
    await position(grammar, 'Practise', 8, 11);
    await page.reload();
    await position(grammar, 'Practise', 8, 11);
    await item(grammar, 'Next').click();
    await position(grammar, 'Practise', 9, 11);
    await item(grammar, 'Previous').click();
    await position(grammar, 'Practise', 8, 11);

    await step(grammar, 'Next').click();
    await position(grammar, 'Fix it', 1, 6);
    await tab(grammar, 5, 6).click();
    await page.reload();
    await position(grammar, 'Fix it', 5, 6);
    await expect(grammar.getByRole('textbox')).toHaveCount(1);
    await fits(page);
    await step(grammar, 'Previous').click();
    await position(grammar, 'Practise', 8, 11);
    await step(grammar, 'Next').click();
    await position(grammar, 'Fix it', 5, 6);
    await step(grammar, 'Next').click();
    await expect(grammar.getByRole('heading', { name: 'Step 4 of 5: Use it' })).toBeVisible();
    await expect(grammar.getByRole('textbox')).toHaveCount(2);
    await expect(grammar.getByRole('tablist')).toHaveCount(0);
    await page.reload();
    await expect(grammar.getByRole('heading', { name: 'Step 4 of 5: Use it' })).toBeVisible();
    await step(grammar, 'Previous').click();
    await position(grammar, 'Fix it', 5, 6);
    await step(grammar, 'Previous').click();
    await position(grammar, 'Practise', 8, 11);

    // Separate weeks never overwrite one another's position.
    await page.goto('/week/2');
    await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
    await step(grammar, 'Next').click();
    await tab(grammar, 3, 11).click();
    await page.goto('/week/1');
    await position(grammar, 'Practise', 8, 11);
    expect(hydrationErrors).toEqual([]);
  });

  test(`${width}px: checked marks, reasons, selected items and Finish survive reload`, async ({ page }) => {
    test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner and server storage');
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width === 375 ? 667 : 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // A signed-out position cannot become a different learner's position.
    await page.goto('/week/1');
    let grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    await step(grammar, 'Next').click();
    await tab(grammar, 6, 11).click();
    const { admin, user } = await createReadingLearner(page, `grammar-position-${width}`);
    try {
      await page.goto('/week/1');
      grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
      await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
      // No local position yet: the server's saved answers open Practise. Its
      // initially selected question must stay selected after it is checked.
      for (const [id, answer] of [['W1-M1', 'No'], ['W1-M2', 'waiting'], ['W1-M3', 'Yes']]) {
        const response = await page.request.post('/api/week/grammar/mark', { data: { week: 1, id, answer } });
        expect(response.ok(), `marking ${id}: HTTP ${response.status()}`).toBe(true);
      }
      await page.reload();
      await position(grammar, 'Practise', 1, 11);

      await grammar.getByRole('radio', { name: 'moved', exact: true }).check();
      await submit(page, grammar.getByRole('button', { name: 'Check', exact: true }), '/api/week/grammar/mark');
      await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toContainText('"Three years ago" is a finished time.');
      await expect(grammar.getByRole('status').filter({ hasText: 'Saved ✓' })).toBeVisible();
      await page.reload();
      await position(grammar, 'Practise', 1, 11);
      await expect(grammar.getByRole('radio', { name: 'moved', exact: true })).toBeChecked();
      await item(grammar, 'Next').click();
      await grammar.getByRole('radio', { name: 'made', exact: true }).check();
      await submit(page, grammar.getByRole('button', { name: 'Check', exact: true }), '/api/week/grammar/mark');
      await expect(grammar.getByRole('status').filter({ hasText: 'Not quite.' })).toContainText('"Since then" means up to now.');
      await expect(grammar.getByRole('status').filter({ hasText: 'Saved ✓' })).toBeVisible();

      // This remains item 2 even though the first unanswered item is now 3.
      await page.reload();
      await position(grammar, 'Practise', 2, 11);
      await expect(grammar.getByRole('radio', { name: 'made', exact: true })).toBeChecked();
      await expect(grammar.getByRole('status').filter({ hasText: 'Not quite.' })).toContainText('"Since then" means up to now.');
      await grammar.getByRole('radio', { name: 'have made', exact: true }).check();
      await submit(page, grammar.getByRole('button', { name: 'Check', exact: true }), '/api/week/grammar/mark');
      await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
      await expect(grammar.getByRole('status').filter({ hasText: 'Saved ✓' })).toBeVisible();

      await step(grammar, 'Next').click();
      await position(grammar, 'Fix it', 1, 6);
      await grammar.getByRole('textbox', { name: 'Your answer' }).fill('I moved to Leeds in 2023.');
      await submit(page, grammar.getByRole('button', { name: 'Check', exact: true }), '/api/week/grammar/mark');
      await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toContainText('"In 2023" is a finished time, so use the past simple.');
      await expect(grammar.getByRole('status').filter({ hasText: 'Saved ✓' })).toBeVisible();
      await page.reload();
      await position(grammar, 'Fix it', 1, 6);
      await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveValue('I moved to Leeds in 2023.');
      await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toContainText('"In 2023" is a finished time, so use the past simple.');

      await tab(grammar, 4, 6).click();
      await page.reload();
      await position(grammar, 'Fix it', 4, 6);
      await tab(grammar, 1, 6).click();
      await step(grammar, 'Next').click();
      await step(grammar, 'Next').click();
      await submit(page, grammar.getByRole('button', { name: 'Finish grammar' }), '/api/week/practice/finish');
      const summary = grammar.getByRole('status').filter({ hasText: 'You answered' });
      await expect(summary).toHaveText('You answered 6 of 22. 6 were right. Great work! You know this grammar well. You can come back and finish the other questions.');
      await page.reload();
      await expect(grammar.getByRole('heading', { name: 'Step 5 of 5: Remember' })).toBeVisible();
      await expect(summary).toHaveText('You answered 6 of 22. 6 were right. Great work! You know this grammar well. You can come back and finish the other questions.');
      await step(grammar, 'Previous').click();
      await step(grammar, 'Previous').click();
      await position(grammar, 'Fix it', 1, 6);
      await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveValue('I moved to Leeds in 2023.');
      await fits(page);
    } finally {
      await removeReadingLearner(admin, user);
    }
  });
}

test('invalid stored positions fall back safely, and blocked storage still allows navigation', async ({ page }) => {
  const key = grammarPositionKey(1, null);
  await page.goto('/week/1');
  const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
  await page.evaluate((storageKey) => localStorage.setItem(storageKey, '{not json'), key);
  await page.reload();
  await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
  await page.evaluate((storageKey) => localStorage.setItem(storageKey, JSON.stringify({
    step: 'Fix it', items: { 'Fix it': 'removed-item' },
  })), key);
  await page.reload();
  await position(grammar, 'Fix it', 1, 6);
  await item(grammar, 'Next').click();
  await position(grammar, 'Fix it', 2, 6);

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.reload();
  await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
  await step(grammar, 'Next').click();
  await item(grammar, 'Next').click();
  await position(grammar, 'Practise', 2, 11);
});

test('an adaptive hidden rewrite returns to the remembered item when its branch reopens', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner and server storage');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { admin, user } = await createReadingLearner(page, 'grammar-position-adaptive');
  try {
    await page.goto('/week/1');
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    await step(grammar, 'Next').click();
    await step(grammar, 'Next').click();
    await tab(grammar, 5, 6).click(); // W1-R2, an optional rewrite.
    await step(grammar, 'Previous').click();
    const answers = [
      ['W1-C1', 'moved'], ['W1-C2', 'have made'], ['W1-C3', 'had left'],
      ['W1-C4', 'was cooking'], ['W1-C5', 'Have ... lived'], ['W1-C6', 'left'],
      ['W1-G1', 'were driving'], ['W1-G2', 'had gone'], ['W1-G3', 'have known'],
      ['W1-G4', 'spent'], ['W1-G5', "hadn't slept"],
    ];
    for (const [id, answer] of answers) {
      const response = await page.request.post('/api/week/grammar/mark', { data: { week: 1, id, answer } });
      expect(response.ok(), `marking ${id}: HTTP ${response.status()}`).toBe(true);
      expect((await response.json()).correct, id).toBe(true);
    }
    await page.reload();
    await step(grammar, 'Next').click();
    await position(grammar, 'Fix it', 1, 3); // Rewrite is no longer visible.
    for (const [id, answer] of [['W1-C1', 'have moved'], ['W1-C2', 'made']]) {
      const response = await page.request.post('/api/week/grammar/mark', { data: { week: 1, id, answer } });
      expect(response.ok(), `marking ${id}: HTTP ${response.status()}`).toBe(true);
      expect((await response.json()).correct, id).toBe(false);
    }
    await page.reload();
    await position(grammar, 'Fix it', 5, 6);
    await expect(grammar.getByText('First the film started. Then we arrived. (When ... already)', { exact: true })).toBeVisible();
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('successful data deletion clears only this learner’s browser positions', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in learner');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'grammar-position-delete');
  try {
    await page.goto('/week/1');
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    await step(grammar, 'Next').click();
    await tab(grammar, 3, 11).click();
    const own = grammarPositionKey(1, user.id);
    const other = grammarPositionKey(1, 'different-learner');
    await page.evaluate(({ otherKey }) => localStorage.setItem(otherKey, 'keep'), { otherKey: other });
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), own)).not.toBeNull();

    // Intercept the delete route: this checks the browser cleanup without
    // deleting any real data other than the disposable test account in finally.
    await page.route('**/api/account/delete-data', (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: body.phase === 'begin'
        ? { pending: true, receipt: 'fixture-receipt' }
        : { deleted: true, removedAudioFiles: 0 } });
    });
    await page.goto('/privacy');
    await page.getByRole('button', { name: 'Delete my learning data & recordings' }).click();
    await page.getByPlaceholder('DELETE').fill('DELETE');
    await page.getByRole('button', { name: 'Confirm erasure' }).click();
    await expect(page.getByText('Your learning data and recordings have been deleted.')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), own)).toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), other)).toBe('keep');
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('blocked browser storage stops deletion before files are removed and can recover', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in learner');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'data-deletion-storage-blocked');
  const phases = [];
  try {
    await page.route('**/api/account/delete-data', (route) => {
      const body = route.request().postDataJSON();
      phases.push(body.phase);
      return route.fulfill({ status: 200, json: body.phase === 'begin'
        ? { pending: true, receipt: 'same-pending-fixture' }
        : { deleted: true } });
    });
    await page.goto('/privacy');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreFixtureStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key, value) {
        if (String(key).startsWith('learning-data-deletion:')) throw new Error('Synthetic blocked storage');
        return original.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'Delete my learning data & recordings' }).click();
    await page.getByPlaceholder('DELETE').fill('DELETE');
    await page.getByRole('button', { name: 'Confirm erasure' }).click();
    await expect(page.getByText('Deletion could not finish. Some files may already be gone. Please try again.')).toBeVisible();
    expect(phases).toEqual(['begin']);
    await page.evaluate(() => window.__restoreFixtureStorage());
    await page.getByRole('button', { name: 'Confirm erasure' }).click();
    await expect(page.getByText('Your learning data and recordings have been deleted.')).toBeVisible();
    expect(phases).toEqual(['begin', 'begin', 'finish']);
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('deletion retry keeps its receipt across reload and never starts a second job', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in learner');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'data-deletion-retry');
  const phases = [];
  try {
    await page.route('**/api/account/delete-data', (route) => {
      const body = route.request().postDataJSON();
      phases.push(body);
      if (body.phase === 'begin') return route.fulfill({ status: 200, json: { pending: true, receipt: 'signed-fixture-receipt' } });
      if (phases.filter((part) => part.phase === 'finish').length === 1) {
        return route.fulfill({ status: 503, json: { error: 'Some files may already be removed. Your deletion is pending; please retry.' } });
      }
      return route.fulfill({ status: 200, json: { deleted: true, alreadyCompleted: true } });
    });
    const confirm = async () => {
      await page.getByRole('button', { name: 'Delete my learning data & recordings' }).click();
      await page.getByPlaceholder('DELETE').fill('DELETE');
      await page.getByRole('button', { name: 'Confirm erasure' }).click();
    };
    await page.goto('/privacy');
    await confirm();
    await expect(page.getByText('Some files may already be removed. Your deletion is pending; please retry.')).toBeVisible();
    const key = `learning-data-deletion:${user.id}`;
    expect(await page.evaluate((item) => localStorage.getItem(item), key)).toBe('signed-fixture-receipt');
    await page.reload();
    await confirm();
    await expect(page.getByText('Your earlier deletion is complete. Data created afterwards was not deleted; start a new request if you want to erase it.')).toBeVisible();
    expect(phases.filter((part) => part.phase === 'begin')).toHaveLength(1);
    expect(phases.filter((part) => part.phase === 'finish').map((part) => part.receipt)).toEqual(['signed-fixture-receipt', 'signed-fixture-receipt']);
    expect(await page.evaluate((item) => localStorage.getItem(item), key)).toBeNull();
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('a stale deletion receipt requires a new explicit confirmation', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in learner');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'data-deletion-stale');
  const phases = [];
  try {
    await page.route('**/api/account/delete-data', (route) => {
      const body = route.request().postDataJSON();
      phases.push(body.phase);
      if (body.receipt === 'old-fixture-receipt') {
        return route.fulfill({ status: 409, json: { code: 'stale_receipt', error: 'Saved request no longer matches.' } });
      }
      return route.fulfill({ status: 200, json: body.phase === 'begin'
        ? { pending: true, receipt: 'new-fixture-receipt' }
        : { deleted: true } });
    });
    await page.goto('/privacy');
    const key = `learning-data-deletion:${user.id}`;
    await page.evaluate((item) => localStorage.setItem(item, 'old-fixture-receipt'), key);
    await page.getByRole('button', { name: 'Delete my learning data & recordings' }).click();
    await page.getByPlaceholder('DELETE').fill('DELETE');
    await page.getByRole('button', { name: 'Confirm erasure' }).click();
    await expect(page.getByText('This saved request could not be verified. Confirm again to start or resume deletion of your current data.')).toBeVisible();
    expect(phases).toEqual(['finish']);
    expect(await page.evaluate((item) => localStorage.getItem(item), key)).toBeNull();
    await page.getByRole('button', { name: 'Confirm erasure' }).click();
    await expect(page.getByText('Your learning data and recordings have been deleted.')).toBeVisible();
    expect(phases).toEqual(['finish', 'begin', 'finish']);
  } finally {
    await removeReadingLearner(admin, user);
  }
});
