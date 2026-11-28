import { expect as baseExpect, test } from './helpers/isolated-test.mjs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertE2ESupabaseApiTarget } from '../../scripts/assert-e2e-supabase-target.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { canUseReadingGateFixture, signInExistingLearner } from './helpers/reading-gate.mjs';
import { openWeekTask } from './helpers/week-tasks.mjs';

// The real isolated Storage and server refreshes can take longer than a local
// render. Still require each observable state; do not skip or mock the save.
const expect = baseExpect.configure({ timeout: 20_000 });
// Every fixture is synthetic and requires the explicitly pinned E2E project.
const canUseFixture = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY && canUseReadingGateFixture);

async function fakeMicrophone(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    window.AudioContext = class {
      constructor() { this.state = 'running'; }
      createAnalyser() { return { fftSize: 64, frequencyBinCount: 32, getByteFrequencyData() {} }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { this.state = 'closed'; return Promise.resolve(); }
    };
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith('audio/webm'); }
      constructor() { this.mimeType = 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['synthetic recording'], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    };
  });
}

/** Keep real capture, storage, RLS and SQL; stub only the paid provider check. */
async function fakeChecks(page, admin, userId, responses = []) {
  await page.route('**/api/week/speaking/check', async (route) => {
    const { takeId } = route.request().postDataJSON();
    const next = responses.shift();
    if (next === 'quota') return route.fulfill({ status: 429, json: { error: 'Daily practice limit reached.' } });
    const take = await admin.from('week_speaking_takes').select('kind,sequence,source_take_id').eq('id', takeId).eq('user_id', userId).single();
    if (take.error) throw take.error;
    const checkId = randomUUID();
    const reserved = await admin.rpc('reserve_week_speaking_check', { p_user_id: userId, p_take_id: takeId, p_check_id: checkId });
    if (reserved.error) return route.fulfill({ status: 409, json: { error: 'No checks remain.' } });
    if (next === 'failed') {
      const failed = await admin.rpc('finish_week_speaking_check', {
        p_user_id: userId, p_check_id: checkId, p_status: 'failed', p_transcript: null, p_feedback: null,
      });
      if (failed.error || failed.data !== true) throw failed.error || new Error('Could not close the failed check');
      return route.fulfill({ status: 503, json: { error: 'The check is unavailable. Please try again.' } });
    }
    const isPractice = take.data.kind === 'structure';
    const transcript = isPractice ? 'Although I was nervous, I moved.'
      : take.data.kind === 'first' ? 'Before last year I worked in a small shop, and when I moved to a new city, I did not know anyone at all.'
        : take.data.sequence === 1 ? "Since then, I've made some friends."
          : take.data.sequence === 2 ? "Since then, I've made friends and When I look back on my first week I smile."
            : "Since then, I've made friends, and I am happier now.";
    const feedback = isPractice ? { transcript, structure: 'although', used: true } : {
      transcript,
      improvedResponse: "Before last year, I worked in a small shop. When I look back on moving to a new city, it was hard at first. Since then, I've met friendly neighbours.",
      highlights: [
        { substring: "Since then, I've", label: 'Present perfect', explanation: 'Connects the past change to now.' },
        { substring: 'When I look back on', label: 'Looking back', explanation: 'Introduces your reflection clearly.' },
      ],
      showExampleFirst: false,
      areas: {
        grammar_and_vocabulary: { score: 4, strength: 'Clear past simple verbs.', improvement: 'Add present perfect for results now.' },
        discourse_management: { score: 4, strength: 'Your story follows a clear order.', improvement: 'Use although to join contrasting points.' },
        pronunciation: null,
        interactive_communication: null,
      },
      structure: { original: transcript, upgraded: 'Although I was nervous, I moved to a new city.', explanation: 'Use although to show a contrast.', structure: 'although' },
      cuePoints: [{ label: take.data.kind === 'first' ? 'The change' : 'Now', quote: take.data.kind === 'first' ? 'moved to a new city' : "I've made" }],
      fluency: { wordCount: 24, seconds: 30 + take.data.sequence, wordsPerMinute: 48, pauses: 1 },
      soundTips: [{ word: 'moved', label: 'Past ending /d/', tip: 'Here -ed sounds like /d/.' }],
    };
    const finished = await admin.rpc('finish_week_speaking_check', {
      p_user_id: userId, p_check_id: checkId, p_status: 'succeeded', p_transcript: transcript, p_feedback: feedback,
    });
    if (finished.error || !finished.data) throw finished.error || new Error('Could not finish the fake check');
    await route.fulfill({ status: 200, json: { ...feedback, takeId, weekRecorded: take.data.kind === 'first' ? true : null } });
  });
}

async function record(page, buttonName) {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
}

test('weekly versions, model, phrase card, three comparisons and deletion survive reload', async ({ page }) => {
  test.skip(!canUseFixture, 'Isolated E2E Supabase admin credentials are unavailable.');
  test.setTimeout(240_000);
  const target = assertE2ESupabaseApiTarget();
  const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  const learner = await createTestUser(admin, 'week-speaking-feedback');
  try {
    await fakeMicrophone(page);
    await signInExistingLearner(page, learner);
    await fakeChecks(page, admin, learner.id);
    await page.goto('/week/1');
    await openWeekTask(page, 'speaking-practice');
    await expect(page.getByRole('heading', { name: '3. Your answer, improved' })).toHaveCount(0);
    await expect(page.getByText("Since then, I've", { exact: true })).toHaveCount(0);

    await record(page, 'Start recording');
    await expect(page.getByText('First recording version 1 of 3 is ready to keep.')).toBeVisible();
    await page.reload();
    await openWeekTask(page, 'speaking-practice');
    await expect(page.getByRole('button', { name: 'Record again (2 left)' })).toBeVisible();
    await record(page, 'Record again (2 left)');
    await expect(page.getByText('First recording version 2 of 3 is ready to keep.')).toBeVisible();
    await record(page, 'Record again (1 left)');
    await expect(page.getByText('First recording version 3 of 3 is ready to keep.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record again (0 left)' })).toBeDisabled();
    expect((await admin.from('week_speaking_checks').select('id').eq('user_id', learner.id)).data).toHaveLength(0);
    expect((await admin.from('week_output_submissions').select('skill').eq('user_id', learner.id).eq('skill', 'speaking')).data).toHaveLength(0);

    await page.getByRole('button', { name: 'Keep and check this recording' }).click();
    await expect(page.getByText('Your kept first recording counts for Week 1.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Build a better sentence' })).toHaveCount(1);
    await expect(page.getByLabel('Fluency information').getByText(/48 words a minute/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Your answer, improved' })).toBeVisible();
    const flow = await admin.from('week_speaking_flows').select('*').eq('user_id', learner.id).eq('week_number', 1).single();
    const firstTakes = await admin.from('week_speaking_takes').select('*').eq('user_id', learner.id).eq('kind', 'first').order('sequence');
    expect(firstTakes.data).toHaveLength(3);
    expect(flow.data.first_take_id).toBe(firstTakes.data[2].id);
    expect(firstTakes.data.filter((row) => row.transcript)).toHaveLength(1);
    expect((await admin.from('week_output_submissions').select('skill').eq('user_id', learner.id).eq('skill', 'speaking')).data).toHaveLength(1);

    await record(page, 'Say it again');
    await expect(page.getByText('We found although in your transcript. This checks the pattern, not all your grammar or pronunciation.')).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Another example' }).click();
    await expect(page.getByRole('button', { name: 'Listen to the model', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Listen to the model', exact: true }).click();
    await page.getByRole('button', { name: 'Show the script' }).click();
    await expect(page.getByText('The change — Introduces the change.')).toBeVisible();
    await page.getByLabel('Structure 1 (optional)').selectOption("Since then, I've");
    await page.getByLabel('Structure 2 (optional)').selectOption('When I look back on');
    await expect(page.getByLabel('Take with you card')).toContainText("Since then, I've");
    await expect(page.getByLabel('Take with you card')).toContainText('When I look back on');

    for (const index of [1, 2, 3]) {
      await record(page, `Record try ${index}`);
      await expect(page.getByRole('heading', { name: `Try ${index}`, exact: true })).toBeVisible();
      const comparison = page.getByLabel(`Compare try ${index} with the previous recording`);
      const previousPhrase = index === 1 ? 'none found' : index === 2 ? "Since then, I've" : "Since then, I've · When I look back on";
      const nextPhrase = index === 2 ? "Since then, I've · When I look back on" : "Since then, I've";
      const previousSeconds = index === 1 ? 33 : 30 + index - 1;
      const previousPoint = index === 1 ? 'The change' : 'Now';
      await expect(comparison.locator('p').filter({ hasText: 'Phrases found:' }))
        .toHaveText(`Phrases found: ${previousPhrase} → ${nextPhrase}`);
      await expect(comparison.locator('p').filter({ hasText: 'Time:' }))
        .toHaveText(`Time: ${previousSeconds} seconds → ${30 + index} seconds`);
      await expect(comparison.locator('p').filter({ hasText: 'Cue-card points found:' }))
        .toHaveText(`Cue-card points found: ${previousPoint} → Now`);
    }
    await expect(page.getByText('You have used all five checks for this task.')).toBeVisible();
    await page.reload();
    await openWeekTask(page, 'speaking-practice');
    await expect(page.getByText('5 of 5 weekly checks used.')).toBeVisible();
    const allTakes = await admin.from('week_speaking_takes').select('id,recording_path,kind').eq('user_id', learner.id);
    expect(allTakes.data).toHaveLength(7);
    const html = await page.content();
    for (const take of allTakes.data) expect(html).not.toContain(take.recording_path);
    expect((await admin.from('week_speaking_checks').select('id').eq('user_id', learner.id)).data).toHaveLength(5);

    const deletion = await page.request.post('/api/account/delete-data', { data: { confirm: 'DELETE' } });
    expect(deletion.status()).toBe(200);
    expect((await admin.from('week_speaking_takes').select('id').eq('user_id', learner.id)).data).toHaveLength(0);
    for (const take of allTakes.data) {
      const downloaded = await admin.storage.from('speaking-recordings').download(take.recording_path);
      expect(downloaded.error).toBeTruthy();
    }
  } finally { await deleteTestUser(admin, learner.id); }
});

test('saved recordings recover from quota, provider and sentence-practice errors after reload', async ({ page }) => {
  test.skip(!canUseFixture, 'Isolated E2E Supabase admin credentials are unavailable.');
  test.setTimeout(240_000);
  const target = assertE2ESupabaseApiTarget();
  const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  const learner = await createTestUser(admin, 'week-speaking-recovery');
  try {
    await fakeMicrophone(page);
    await signInExistingLearner(page, learner);
    const responses = ['quota', 'failed'];
    await fakeChecks(page, admin, learner.id, responses);
    let failCapture = true;
    await page.route('**/api/week/speaking/capture', (route) => {
      if (!failCapture) return route.continue();
      failCapture = false;
      return route.fulfill({ status: 503, json: { error: 'We could not save this recording. Please try again.' } });
    });
    await page.goto('/week/1');
    await openWeekTask(page, 'speaking-practice');
    await record(page, 'Start recording');
    await expect(page.getByRole('alert').filter({ hasText: 'We could not save this recording.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
    await record(page, 'Start recording');
    await expect(page.getByText('First recording version 1 of 3 is ready to keep.')).toBeVisible();

    await page.getByRole('button', { name: 'Keep and check this recording' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Daily practice limit reached.' })).toBeVisible();
    await expect(page.getByText('0 of 5 weekly checks used.')).toBeVisible();
    await page.reload();
    await openWeekTask(page, 'speaking-practice');
    await expect(page.getByRole('button', { name: 'Keep and check this recording' })).toBeEnabled();
    await page.getByRole('button', { name: 'Keep and check this recording' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The check is unavailable.' })).toBeVisible();
    await expect(page.getByText('1 of 5 weekly checks used.')).toBeVisible();
    await page.getByRole('button', { name: 'Keep and check this recording' }).click();
    await expect(page.getByText('Your kept first recording counts for Week 1.')).toBeVisible();
    await expect(page.getByText('2 of 5 weekly checks used.')).toBeVisible();

    failCapture = true;
    const point = page.getByRole('region', { name: 'Build a better sentence' }).first();
    await record(page, 'Say it again');
    await expect(point.getByRole('alert')).toContainText('We could not save this recording.');
    await expect(point.getByRole('button', { name: 'Say it again' })).toBeEnabled();
    responses.push('failed');
    await record(page, 'Say it again');
    try {
      await expect(point.getByRole('button', { name: 'Check this saved sentence again' })).toBeVisible();
    } catch (error) {
      // Preserve useful synthetic-fixture diagnostics in CI annotations even
      // where browser artifacts or live job logs cannot be downloaded.
      const state = await admin.from('week_speaking_takes').select('kind,status').eq('user_id', learner.id);
      const visibleText = await point.allTextContents();
      throw new Error(`Saved sentence did not become recheckable; takes=${JSON.stringify(state.data)}, UI=${JSON.stringify(visibleText)}`, { cause: error });
    }
    await expect(page.getByText('3 of 5 weekly checks used.')).toBeVisible();
    await page.reload();
    await openWeekTask(page, 'speaking-practice');
    await page.getByRole('button', { name: 'Check this saved sentence again' }).click();
    await expect(page.getByText('We found although in your transcript. This checks the pattern, not all your grammar or pronunciation.')).toBeVisible();
    await expect(page.getByText('4 of 5 weekly checks used.')).toBeVisible();
  } finally { await deleteTestUser(admin, learner.id); }
});

test('the speaking lab offers one sentence point, transcript-based fluency and neutral sound practice', async ({ page }) => {
  test.skip(!canUseFixture, 'Isolated E2E Supabase admin credentials are unavailable.');
  test.setTimeout(120_000);
  const target = assertE2ESupabaseApiTarget();
  const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  const learner = await createTestUser(admin, 'speaking-lab-feedback');
  try {
    await fakeMicrophone(page);
    await signInExistingLearner(page, learner);
    let transcriptions = 0;
    await page.route('**/api/speaking/evaluate', (route) => route.fulfill({ status: 200, json: {
      transcript: 'I moved to a new city.', score: 78,
      structure: { original: 'I moved to a new city.', upgraded: 'Although I was nervous, I moved to a new city.', explanation: 'Use although to show a contrast.', structure: 'although' },
      fluency: { wordCount: 6, seconds: 10, wordsPerMinute: 36, pauses: 1 },
      soundTips: [{ word: 'moved', label: 'Past ending /d/', tip: 'The -ed ending sounds like /d/.' }, { word: 'city', label: 'A sound to practise', tip: 'Listen and compare.' }],
    } }));
    await page.route('**/api/speaking/transcribe', (route) => { transcriptions++; return route.fulfill({ status: 200, json: { transcript: 'Although I was nervous, I moved to a new city.' } }); });
    await page.goto('/labs#speaking');
    const lab = page.locator('#speaking');
    await lab.getByRole('button', { name: 'Start recording' }).click();
    await lab.getByRole('button', { name: 'Stop recording' }).click();
    await expect(lab.getByRole('heading', { name: 'Build a better sentence' })).toHaveCount(1);
    await expect(lab.getByText('About 36 words a minute.', { exact: false })).toBeVisible();
    await expect(lab.getByText(/1 pause over one second/)).toBeVisible();
    await record(page, 'Say it again');
    await expect(lab.getByText(/We found although in your transcript/)).toBeVisible();
    expect(transcriptions).toBe(1);
    await lab.getByText('Practise these sounds', { exact: true }).click();
    await expect(lab.getByText(/We do not know how you pronounced them/)).toBeVisible();
    await expect(lab.getByRole('button', { name: 'Listen to moved' })).toBeVisible();
    await lab.getByRole('button', { name: 'Record moved' }).click();
    await lab.getByRole('button', { name: 'Stop recording' }).click();
    await expect(lab.getByLabel('Your recording of moved')).toBeVisible();
    expect(transcriptions).toBe(1); // sound comparison stays on-device
  } finally { await deleteTestUser(admin, learner.id); }
});
