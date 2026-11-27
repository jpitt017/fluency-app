import { expect } from '@playwright/test';

/**
 * Open one task in the /week/[n] accordion without navigating.
 *
 * The week page keeps one task open at a time. Tests that need a task's body
 * call this first — it clicks the row's toggle button, which opens the task
 * without scrolling or moving focus, so assertions about scroll and focus stay
 * honest. Clicking the toggle of the already-open task is a no-op.
 */
export async function openWeekTask(page, anchor) {
  const toggle = page.locator(`#${anchor}-toggle`);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
