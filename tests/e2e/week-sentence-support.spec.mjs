import { openWeekTask } from './helpers/week-tasks.mjs';
import { test, expect } from './helpers/isolated-test.mjs';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

// A stuck action must fail with its locator call log instead of eating the
// whole test budget.
test.use({ actionTimeout: 30_000 });

const grammarPrompt = "Tell me about something you used to do as a child that you don't do now.";
const vocabularyPrompt = 'Write about something that was difficult at first, but now feels normal.';
const grammarExample = 'I used to ride my bike to school. I walk to work now.';
const vocabularyExample1 = 'It took me a few weeks to get used to working from home.';
const vocabularyExample2 = 'It took me a long time to get used to the cold weather.';

async function openGrammarUseIt(page) {
  const grammar = page.getByRole('region', { name: 'Grammar practice' });
  await expect(grammar.getByText(/Step \d of 5:/)).toBeVisible();
  for (let i = 0; i < 5; i += 1) {
    if (await grammar.getByText('Step 4 of 5: Use it').isVisible()) break;
    await grammar.getByRole('button', { name: 'Next step', exact: true }).click();
  }
  await expect(grammar.getByText('Step 4 of 5: Use it')).toBeVisible();
  return { grammar, item: grammar.getByText(grammarPrompt, { exact: true }).locator('..') };
}

async function openVocabularySentences(page, prompt = vocabularyPrompt) {
  await openWeekTask(page, 'vocabulary-practice');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
  await expect(vocabulary.getByText(/Step \d of 7:/)).toBeVisible();
  for (let i = 0; i < 6; i += 1) {
    if (await vocabulary.getByText('Step 7 of 7: Your sentences').isVisible()) break;
    await vocabulary.getByRole('button', { name: 'Next step', exact: true }).click();
  }
  await expect(vocabulary.getByText('Step 7 of 7: Your sentences')).toBeVisible();
  return { vocabulary, item: vocabulary.getByText(prompt, { exact: true }).locator('..') };
}

test('grammar guidance and staged vocabulary examples work for a signed-out learner', async ({ page }) => {
  await page.goto('/week/1');
  const { grammar, item } = await openGrammarUseIt(page);
  await expect(grammar.getByText('An example by an imaginary learner')).toBeVisible();
  await expect(grammar.getByText(/Since I started my new job, I have made some good friends/)).toBeVisible();
  await expect(item.getByText(/Pattern:/)).toBeVisible();
  await expect(item.getByText(grammarExample)).toHaveCount(0);
  await item.getByRole('button', { name: 'Show an example' }).click();
  await expect(item.getByText(grammarExample)).toBeVisible();
  await item.getByRole('button', { name: 'Help me start' }).click();
  await expect(item.getByRole('button', { name: 'When I was a child, I used to ______ .' })).toBeVisible();
  await item.getByRole('button', { name: 'When I was a child, I used to ______ .' }).click();
  await expect(item.getByRole('textbox')).toHaveValue('When I was a child, I used to ______ .');

  const { item: vocabItem } = await openVocabularySentences(page);
  await expect(vocabItem.getByText(/Pattern:/)).toBeVisible();
  await expect(vocabItem.getByText(vocabularyExample1)).toHaveCount(0);
  await expect(vocabItem.getByText(vocabularyExample2)).toHaveCount(0);
  await vocabItem.getByRole('button', { name: 'Show an example' }).click();
  await expect(vocabItem.getByText(vocabularyExample1)).toBeVisible();
  await expect(vocabItem.getByText(vocabularyExample2)).toHaveCount(0);
  await vocabItem.getByRole('button', { name: 'Show an example' }).click();
  await expect(vocabItem.getByText(vocabularyExample2)).toBeVisible();
  await expect(vocabItem.getByRole('button', { name: 'Show an example' })).toBeDisabled();
  await vocabItem.getByRole('button', { name: 'Help me start' }).click();
  await expect(vocabItem.getByRole('textbox')).toHaveValue('I got used to ______ .');
});

test('each of Weeks 2–4 shows its own imaginary learner model', async ({ page }) => {
  const models = [
    "I'm going to learn to cook next month. I'm meeting my cousin on Saturday to make our first meal. If I had more time, I would learn to bake too.",
    "In our flat, you have to wash your dishes. You mustn't leave the front door open. You don't have to cook for everyone. What time do you usually leave home?",
    "The old market in my town was built a hundred years ago. Fresh bread is sold there every morning. My town is quieter than the city nearby, and it's the friendliest place I know.",
  ];
  for (let week = 2; week <= 4; week += 1) {
    await page.goto(`/week/${week}`);
    const grammar = page.getByRole('region', { name: 'Grammar practice' });
    for (let step = 0; step < 3; step += 1) await grammar.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(grammar.getByText('An example by an imaginary learner')).toBeVisible();
    await expect(grammar.getByText(models[week - 2], { exact: true })).toBeVisible();
    await expect(grammar.getByText(/Pattern:/).first()).toBeVisible();
    if (week === 2) {
      const item = grammar.getByText('What would you do if you had a free year with no work or study?', { exact: true }).locator('..');
      await item.getByRole('button', { name: 'Help me start' }).click();
      const starter = 'If I had more money, I would ______ .';
      await item.getByRole('button', { name: starter, exact: true }).click();
      await expect(item.getByRole('textbox')).toHaveValue(starter);
    }
  }
});

test('Week 4 vocabulary reveals the revised first example before the unchanged second example', async ({ page }) => {
  const first = "In my town, it's a tradition to have a big festival in August, and visitors are invited to join.";
  const second = "It's a local custom to eat grapes at midnight on New Year's Eve.";
  await page.goto('/week/4');
  const { vocabulary, item } = await openVocabularySentences(page, 'Tell a visitor about a custom or tradition in your town.');
  await vocabulary.getByRole('tab', { name: 'Go to item 2 of 2' }).click();
  await expect(item).toBeVisible();
  await expect(item.getByText(first)).toHaveCount(0);
  await expect(item.getByText(second)).toHaveCount(0);
  await item.getByRole('button', { name: 'Show an example' }).click();
  await expect(item.getByText(first)).toBeVisible();
  await expect(item.getByText(second)).toHaveCount(0);
  await item.getByRole('button', { name: 'Show an example' }).click();
  await expect(item.getByText(second)).toBeVisible();
  await expect(item.getByRole('button', { name: 'Show an example' })).toBeDisabled();
});

test('copied examples do not spend a check; the UI displays one rewrite and both feedback versions', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Signed-in writing needs an isolated service-key test user');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'sentence-support-ui');
  try {
    await page.goto('/week/1');
    const { item } = await openGrammarUseIt(page);
    await item.getByRole('button', { name: 'Show an example' }).click();
    await item.getByRole('textbox').fill(`${grammarExample} I still ride sometimes.`);
    await item.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(item.getByRole('status')).toHaveText('Try to write about your own life.');

    const { item: vocabItem } = await openVocabularySentences(page);
    await vocabItem.getByRole('button', { name: 'Show an example' }).click();
    await expect(vocabItem.getByText(vocabularyExample1)).toBeVisible();
    await vocabItem.getByRole('button', { name: 'Show an example' }).click();
    await vocabItem.getByRole('textbox').fill(vocabularyExample2);
    await vocabItem.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(vocabItem.getByRole('status')).toHaveText('Try to write about your own life.');
    // One task is open at a time: go back to grammar before touching its item.
    await openWeekTask(page, 'grammar-practice');
    const saved = await admin.from('week_sentence_practice').select('item_id').eq('user_id', user.id);
    if (saved.error) throw saved.error;
    expect(saved.data).toHaveLength(0);
    const used = await admin.from('ai_usage_events').select('endpoint').eq('user_id', user.id).eq('endpoint', '/api/review/check-rewrite');
    if (used.error) throw used.error;
    expect(used.data).toHaveLength(0);

    // UI rendering is exercised with a deterministic browser response; the
    // real route, quota and SQL persistence are tested independently.
    const requests = [];
    await page.route('**/api/week/sentence', async (route) => {
      const sent = route.request().postDataJSON();
      requests.push(sent);
      const first = { answer: 'I used play chess. Now I swim.', onTarget: false, feedback: { target: 'Add to after used.', otherPoints: ['Check the time.'], corrected: 'I used to play chess. Now I swim.' } };
      const second = { answer: 'I used to play chess. Now I swim every week.', onTarget: true, feedback: { target: 'You used this well.', otherPoints: [], improved: 'You added to.', stillToFix: 'Nothing else to fix.', corrected: 'I used to play chess. Now I swim every week.' } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ onTarget: sent.version === 2, first, second: sent.version === 2 ? second : null, addedToReview: false }) });
    });
    await item.getByRole('textbox').fill('I used play chess. Now I swim.');
    await item.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(item.getByRole('region', { name: 'Your first version' })).toContainText('Add to after used.');
    await expect(item.getByRole('region', { name: 'Your first version' })).toContainText('I used to play chess. Now I swim.');
    await item.getByRole('button', { name: 'Improve it' }).click();
    await item.getByRole('textbox').fill('I used to play chess. Now I swim every week.');
    await item.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(item.getByRole('region', { name: 'Your second version' })).toContainText('You added to.');
    await expect(item.getByRole('region', { name: 'Your second version' })).toContainText('Nothing else to fix.');
    await expect(item.getByText('You have checked this item twice.')).toBeVisible();
    await expect(item.getByRole('button', { name: 'Improve it' })).toHaveCount(0);
    expect(requests.map((entry) => entry.version)).toEqual([1, 2]);
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('saved versions reload, ideas stay in the same week, and deletion clears them', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Saved writing needs an isolated service-key test user');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'sentence-support-saved');
  const first = { target: 'Add to.', otherPoints: [], corrected: 'I used to play chess. Now I swim.' };
  const second = { target: 'Good.', otherPoints: [], improved: 'You added to.', stillToFix: 'Nothing else.', corrected: 'I used to play chess. Now I swim every week.' };
  try {
    const inserted = await admin.from('week_sentence_practice').insert([
      { user_id: user.id, week_number: 1, item_id: 'W1-U1', kind: 'grammar-use-it', first_answer: 'I used play chess. Now I swim.', first_feedback: first, first_on_target: false, second_answer: 'I used to play chess. Now I swim every week.', second_feedback: second, second_on_target: true },
      { user_id: user.id, week_number: 2, item_id: 'W2-U1', kind: 'grammar-use-it', first_answer: 'I will visit my aunt. We are meeting on Sunday.', first_feedback: { target: 'Good.', otherPoints: [], corrected: 'I will visit my aunt. We are meeting on Sunday.' }, first_on_target: true },
      { user_id: user.id, week_number: 1, item_id: 'V1-S1', kind: 'vocabulary-sentence', first_answer: 'A vocabulary answer.', first_feedback: { good: 'Good.', corrected: 'A vocabulary correction.', tip: 'Read it again.' }, first_on_target: true },
    ]);
    if (inserted.error) throw inserted.error;
    await page.goto('/week/1');
    const { item } = await openGrammarUseIt(page);
    await expect(item.getByRole('region', { name: 'Your first version' })).toContainText('I used play chess. Now I swim.');
    await expect(item.getByRole('region', { name: 'Your second version' })).toContainText('You added to.');
    await expect(item.getByText('You have checked this item twice.')).toBeVisible();

    await page.goto('/labs?week=1#writing');
    const writing = page.locator('#writing');
    await expect(writing.getByRole('heading', { name: 'Useful phrases' })).toBeVisible();
    await writing.locator('summary').filter({ hasText: 'Your grammar-practice sentences' }).click();
    await expect(writing).toContainText(second.corrected);
    await expect(writing).not.toContainText('We are meeting on Sunday.');
    await expect(writing).not.toContainText('A vocabulary correction.');
    await page.goto('/labs?week=2#writing');
    await page.locator('#writing').locator('summary').filter({ hasText: 'Your grammar-practice sentences' }).click();
    await expect(page.locator('#writing')).toContainText('We are meeting on Sunday.');
    await expect(page.locator('#writing')).not.toContainText(second.corrected);
    await page.goto('/labs#writing');
    await expect(page.getByRole('heading', { name: 'Useful phrases' })).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'Your grammar-practice sentences' })).toHaveCount(0);

    const deletion = await page.request.post('/api/account/delete-data', { data: { confirm: 'DELETE' } });
    expect(deletion.status()).toBe(200);
    const remaining = await admin.from('week_sentence_practice').select('item_id').eq('user_id', user.id);
    if (remaining.error) throw remaining.error;
    expect(remaining.data).toHaveLength(0);
    await page.goto('/labs?week=1#writing');
    await expect(page.locator('summary').filter({ hasText: 'Your grammar-practice sentences' })).toHaveCount(0);
  } finally {
    await removeReadingLearner(admin, user);
  }
});
