import { expect, test } from '@playwright/test';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

// Capture real scroll requests while allowing the browser to scroll normally.
for (const [motion, behavior] of [['no-preference', 'smooth'], ['reduce', 'instant']]) {
  test(`phone keyboard: grammar navigation uses ${behavior} scrolling and focuses the step heading`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript(() => {
      window.practiceScrolls = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.id === 'grammar-practice' || this.id === 'vocabulary-practice') {
          window.practiceScrolls.push({ id: this.id, behavior: options?.behavior, block: options?.block });
        }
        return original.call(this, options);
      };
    });
    await page.goto('/week/1');
    expect(await page.evaluate(() => window.practiceScrolls)).toEqual([]);
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });

    async function activate(button) {
      await button.focus();
      await page.keyboard.press('Enter');
    }
    async function atTop(section) {
      await expect.poll(async () => Math.abs((await section.boundingBox()).y), { timeout: 8000 }).toBeLessThan(16);
    }
    async function lastScroll(id) {
      const calls = await page.evaluate(() => window.practiceScrolls);
      return calls.filter((call) => call.id === id).at(-1);
    }

    await activate(grammar.getByRole('button', { name: 'Next step', exact: true }));
    await expect(grammar.getByRole('heading', { name: 'Step 2 of 5: Practise' })).toBeFocused();
    await atTop(grammar);
    expect(await lastScroll('grammar-practice')).toEqual({ id: 'grammar-practice', behavior, block: 'start' });
    await page.keyboard.press('Tab');
    await expect(grammar.getByRole('tab', { name: 'Go to item 1 of 11' })).toBeFocused();
    await activate(grammar.getByRole('button', { name: 'Previous step', exact: true }));
    await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeFocused();
    await atTop(grammar);
    expect(await lastScroll('grammar-practice')).toEqual({ id: 'grammar-practice', behavior, block: 'start' });
  });

  test(`phone keyboard: vocabulary navigation uses ${behavior} scrolling`, async ({ page }) => {
    test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner to open vocabulary');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript(() => {
      window.practiceScrolls = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.id === 'vocabulary-practice') {
          window.practiceScrolls.push({ id: this.id, behavior: options?.behavior, block: options?.block });
        }
        return original.call(this, options);
      };
    });
    const { admin, user } = await createReadingLearner(page, `practice-navigation-${motion}`);
    try {
      await page.goto('/week/1');
      expect(await page.evaluate(() => window.practiceScrolls)).toEqual([]);
      const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });

      async function activate(button) {
        await button.focus();
        await page.keyboard.press('Enter');
      }
      async function atTop() {
        await expect.poll(async () => Math.abs((await vocabulary.boundingBox()).y), { timeout: 8000 }).toBeLessThan(16);
      }
      async function lastScroll() {
        const calls = await page.evaluate(() => window.practiceScrolls);
        return calls.filter((call) => call.id === 'vocabulary-practice').at(-1);
      }

      await activate(vocabulary.getByRole('button', { name: 'Next words →' }));
      await expect(vocabulary.getByText('Page 2 of', { exact: false })).toBeVisible();
      await expect(vocabulary.getByRole('heading', { name: 'Step 1 of 7: Words' })).toBeFocused();
      await atTop();
      expect(await lastScroll()).toEqual({ id: 'vocabulary-practice', behavior, block: 'start' });
      await page.keyboard.press('Tab');
      await expect(vocabulary.getByRole('button', { name: /Listen/ }).first()).toBeFocused();

      await activate(vocabulary.getByRole('button', { name: 'Next step', exact: true }));
      await expect(vocabulary.getByRole('heading', { name: 'Step 2 of 7: Match' })).toBeFocused();
      await atTop();
      expect(await lastScroll()).toEqual({ id: 'vocabulary-practice', behavior, block: 'start' });
      await activate(vocabulary.getByRole('button', { name: 'Previous step', exact: true }));
      await expect(vocabulary.getByRole('heading', { name: 'Step 1 of 7: Words' })).toBeFocused();
      await atTop();
      expect(await lastScroll()).toEqual({ id: 'vocabulary-practice', behavior, block: 'start' });
    } finally {
      await removeReadingLearner(admin, user);
    }
  });
}
