import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as levelGuard from '../../lib/b1b2/level-guard.mjs';
import * as speakingFeedback from '../../lib/b1b2/speaking-feedback.mjs';
import * as improvedTtsConfig from '../../lib/b1b2/improved-tts-config.mjs';
import * as weekWritingSupport from '../../lib/curriculum/week-writing-support.mjs';
import * as aiReviewCardFilter from '../../lib/b1b2/ai-review-card-filter.mjs';
import * as diffModule from '../../lib/b1b2/diff.ts';
import { B1_SPEECH_RATE, SPEAKER_VOICES, VOICE_SETTINGS } from '../../scripts/lib/course-audio/tts.mjs';
import { BENCHMARK_SENTENCES, LIVE_GROQ_MODEL, runLiveGroqSuite } from '../../scripts/eval-prompts.mjs';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const assessments = JSON.parse(read('supabase-b1-b2/content/curriculum/assessments.json'));

function transpileLoad(path, modules, extraGlobals = {}) {
  const compiled = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected import ${name} in ${path}`);
      return modules[name];
    },
    process: { env: {} },
    crypto: { randomUUID },
    Blob,
    Buffer,
    URL,
    Date,
    Set,
    Map,
    console: { error() {}, warn() {} },
    ...extraGlobals,
  });
  return exports;
}

const promptGuard = transpileLoad('lib/b1b2/prompt-guard.ts', {});
const feedbackSchema = transpileLoad('lib/b1b2/feedback-schema.ts', {
  zod: require('zod'),
  './diff': diffModule,
  './ai-review-card-filter.mjs': aiReviewCardFilter,
  './prompt-guard': promptGuard,
  './level-guard.mjs': levelGuard,
  './speaking-feedback.mjs': speakingFeedback,
});

test('writing feedback marks four 0-5 areas, has no overall score, caps Content under 80 words for Weeks 1-8, warns over 150 words ("Try to keep to 100–120 words."), and caps corrections at 3 with week grammar first', () => {
  const shortText = 'Hi Alex, thanks for your message. I moved into the flat last month and I really enjoy living near the park.';
  const rawWriting = {
    score: 95,
    areas: {
      content: { score: 5, strength: 'You answered Alex warmly and mentioned your flat.', improvement: 'Cover all four notes in your reply.' },
      communicative_achievement: { score: 4, strength: 'Your friendly email tone suits a flatmate well.', improvement: 'Add a short closing line at the end.' },
      organisation: { score: 4, strength: 'Your sentences connect in a sensible order.', improvement: 'Group your points into two short paragraphs.' },
      language: { score: 4, strength: 'Your everyday vocabulary is easy to follow.', improvement: 'Check modal verbs when explaining flat rules.' },
    },
    corrected: shortText,
    notes: ['Clear opening greeting.'],
    corrections: [
      { original: 'a', corrected_sentence: 'b', error_category: 'spelling', explanation: 'Check spelling.', severity: 'minor' },
      { original: 'c', corrected_sentence: 'd', error_category: 'article', explanation: 'Add an article.', severity: 'minor' },
      { original: 'e', corrected_sentence: 'f', error_category: 'modal_verb', explanation: 'Use have to for a flat rule.', severity: 'major' },
      { original: 'g', corrected_sentence: 'h', error_category: 'preposition', explanation: 'Use in with month.', severity: 'minor' },
    ],
  };

  const under80 = feedbackSchema.validateWritingFeedback(rawWriting, shortText, { weekNumber: 3 });
  assert.equal(Object.hasOwn(under80, 'score'), false);
  assert.equal(Object.hasOwn(under80, 'rubric'), false);
  assert.equal(under80.contentCappedUnder100, true);
  assert.equal(under80.areas.content.score, 3, 'under 80 words must cap Content at 3 for Weeks 1-8');
  assert.equal(under80.wordCountTip, null);
  assert.equal(under80.corrections.length, 3, 'at most 3 corrections per text');
  assert.equal(under80.corrections[0].error_category, 'modal_verb', 'Week 3 modal grammar comes first');

  // Placement samples opt out of the Content cap.
  const placementSample = feedbackSchema.validateWritingFeedback(rawWriting, shortText, {
    skipUnder100Cap: true,
  });
  assert.equal(placementSample.areas.content.score, 5);

  // 105 words (inside 100-120 target for Weeks 1-8) is NOT capped and has no over-limit warning.
  const mediumText = Array.from({ length: 105 }, () => 'word').join(' ') + '.';
  const onTarget = feedbackSchema.validateWritingFeedback(rawWriting, mediumText, { weekNumber: 1 });
  assert.equal(onTarget.contentCappedUnder100, false);
  assert.equal(onTarget.areas.content.score, 5);
  assert.equal(onTarget.wordCountTip, null);

  // Over 150 words gets "Try to keep to 100–120 words." for Weeks 1-8.
  const longText = Array.from({ length: 155 }, () => 'word').join(' ') + '.';
  const over150 = feedbackSchema.validateWritingFeedback(rawWriting, longText, { weekNumber: 1 });
  assert.equal(over150.wordCountTip, 'Try to keep to 100–120 words.');
  assert.equal(over150.notes[0], 'Try to keep to 100–120 words.');
});

test('Weeks 1-4 curriculum has Week 3 email+4 notes, Week 4 call for articles, 4 speaking parts per week, and 0-5 B1-B2 descriptors', () => {
  const [w1, w2, w3, w4] = details.weeks;
  assert.equal(w1.writing.inputEmail, undefined);
  assert.equal(w2.writing.inputEmail, undefined);
  assert.equal(w3.writing.inputEmail.from, 'Alex');
  assert.deepEqual(w3.writing.inputEmail.notes, [
    'Explain a shared job',
    'Tell Alex one rule',
    "Say what's optional",
    'Give some advice',
  ]);
  assert.ok(w4.writing.callForArticles.heading.includes('Articles wanted'));
  assert.ok(w4.writing.callForArticles.body.length > 20);

  for (const week of details.weeks) {
    assert.equal(week.speaking.parts.questionsAboutYou.length, 2);
    assert.equal(week.speaking.parts.discussAndDecide.options.length, 5);
    assert.ok(week.speaking.parts.discussAndDecide.decisionTask.length > 10);
    assert.equal(week.speaking.parts.followUpQuestions.length, 2);
  }

  assert.deepEqual(
    assessments.speakingDescriptors.criteria.map((c) => c.label),
    ['Grammar and vocabulary', 'Discourse management', 'Pronunciation', 'Interactive communication'],
  );
  assert.deepEqual(
    assessments.writingDescriptors.criteria.map((c) => c.label),
    ['Content', 'Communicative achievement', 'Organisation', 'Language'],
  );
  for (const doc of [assessments.speakingDescriptors, assessments.writingDescriptors]) {
    for (const c of doc.criteria) {
      assert.ok(c.question.endsWith('?'));
      assert.ok(c.band5 && c.band3 && c.band1);
    }
  }
});

test('speaking feedback never lets AI mark Pronunciation, marks Interactive communication only in Discuss and decide, and drops non-exact highlights', () => {
  const transcript =
    'Before last year I worked in a small shop in my town. Last autumn I started an evening computing course because I wanted a new job. At first studying after work was tiring, so my sister helped me plan my week. Since then I have learned a lot and I feel much more confident.';
  const improved =
    "Before last year, I worked in a small shop in my town. Last autumn, I started an evening course because I wanted a better job. Although studying after work was tiring, my sister helped me plan my week. Since then, I've learned a lot and I feel more confident.";

  const rawSpeaking = {
    feedback: 'You explained the change in your life clearly.',
    improvedResponse: improved,
    highlights: [
      { substring: "Since then, I've learned", label: 'Present perfect', explanation: 'Connects a past change to how things are now.' },
      { substring: 'Although studying after work was tiring', label: 'Contrast linker', explanation: 'Joins a hard part with what helped you.' },
      { substring: 'This phrase is not in the text', label: 'Hallucinated', explanation: 'Must be dropped.' },
    ],
    areas: {
      grammar_and_vocabulary: { score: 4, strength: 'You used past simple and present perfect clearly.', improvement: 'Watch commas after time phrases.' },
      discourse_management: { score: 4, strength: 'Your story follows a clear time order.', improvement: 'Link the hard part and what helped with although.' },
      pronunciation: { score: 2, strength: 'Clear sounds.', improvement: 'Work on vowels.' },
      interactive_communication: { score: 4, strength: 'You asked your partner what they think.', improvement: 'Respond to one more idea before deciding.' },
    },
    corrections: [],
    tips: [],
    errorPatterns: [],
  };

  const monologue = feedbackSchema.validateSpeakingFeedback(rawSpeaking, transcript, {
    weekNumber: 1,
    includeInteractive: false,
  });
  assert.equal(monologue.areas.pronunciation, null);
  assert.equal(monologue.areas.interactive_communication, null);
  assert.equal(monologue.areas.grammar_and_vocabulary.score, 4);
  assert.equal(monologue.areas.discourse_management.score, 4);
  assert.equal(monologue.showExampleFirst, false);
  assert.deepEqual(
    monologue.highlights.map((h) => h.substring),
    ["Since then, I've learned", 'Although studying after work was tiring'],
  );

  const discussion = feedbackSchema.validateSpeakingFeedback(rawSpeaking, transcript, {
    weekNumber: 1,
    includeInteractive: true,
  });
  assert.equal(discussion.areas.pronunciation, null);
  assert.equal(discussion.areas.interactive_communication?.score, 4);

  // Under ~20 words triggers showExampleFirst + prompt message.
  const veryShort = feedbackSchema.validateSpeakingFeedback(rawSpeaking, 'I changed my job.', {
    weekNumber: 1,
  });
  assert.equal(veryShort.showExampleFirst, true);
  assert.equal(veryShort.examplePromptMessage, 'Try again using this example to help you.');

  // Retry highlight usage detection + cue checklist.
  const used = speakingFeedback.detectUsedHighlights(
    "Since then, I've learned new skills at work.",
    monologue.highlights,
  );
  assert.deepEqual(used, [
    { substring: "Since then, I've learned", label: 'Present perfect', used: true },
    { substring: 'Although studying after work was tiring', label: 'Contrast linker', used: false },
  ]);

  const checklist = speakingFeedback.cueChecklistFromEvidence(
    [
      { label: 'Before', quote: 'I worked in a small shop' },
      { label: 'The change', quote: 'non-verbatim quote' },
      { label: 'Now', quote: 'I feel much more confident' },
    ],
    transcript,
    ['Before', 'The change', 'Now'],
  );
  assert.deepEqual(checklist, [
    { label: 'Before', covered: true, quote: 'I worked in a small shop' },
    { label: 'The change', covered: false },
    { label: 'Now', covered: true, quote: 'I feel much more confident' },
  ]);
});

test('B1-B2 level guard flags C1+ words, enforces <= 20-word sentences, and keeps clear learner sentences', () => {
  const bloated =
    'Furthermore, the ubiquitous smartphone has meticulously transformed how individuals communicate in contemporary society, which consequently creates unprecedented challenges for families every single evening.';
  const outBefore = levelGuard.findOutOfListWords(bloated, { weekNumber: 4 });
  assert.ok(outBefore.includes('ubiquitous'));
  assert.ok(outBefore.includes('meticulously') || outBefore.includes('unprecedented'));

  const simplified = levelGuard.simplifyToB1B2(bloated, {
    weekNumber: 4,
    maxSentenceWords: 20,
  });
  assert.equal(levelGuard.maxSentenceWordCount(simplified) <= 20, true, `got: ${simplified}`);
  assert.equal(levelGuard.findOutOfListWords(simplified, { weekNumber: 4 }).includes('furthermore'), false);
  assert.equal(levelGuard.findOutOfListWords(simplified, { weekNumber: 4 }).includes('ubiquitous'), false);

  const learner = 'I usually cook dinner at home. Yesterday I went to the library.';
  const overEdited = 'I normally prepare my evening meal at home. Yesterday I visited the local library.';
  const preserved = levelGuard.preserveClearLearnerSentences(learner, overEdited, []);
  assert.equal(preserved, learner);
});

test('improved-tts is feature-flagged OFF by default, enforces 2/day and 40k/month caps when enabled, logs inputChars, and labels browser voice "Computer voice"', async () => {
  // 1. Flag off by default + approved British voice + 2/day + 40,000/month defaults.
  assert.equal(improvedTtsConfig.isImprovedAnswerTtsEnabled(undefined), false);
  assert.equal(improvedTtsConfig.isImprovedAnswerTtsEnabled(''), false);
  assert.equal(improvedTtsConfig.isImprovedAnswerTtsEnabled('false'), false);
  assert.equal(improvedTtsConfig.isImprovedAnswerTtsEnabled('true'), true);
  assert.equal(improvedTtsConfig.isImprovedAnswerTtsEnabled('1'), true);
  assert.equal(improvedTtsConfig.DAILY_TTS_LIMIT, 2);
  assert.equal(improvedTtsConfig.DEFAULT_MONTHLY_TTS_CHAR_LIMIT, 40_000);
  assert.equal(improvedTtsConfig.resolveMonthlyTtsCharLimit(undefined), 40_000);
  assert.equal(improvedTtsConfig.resolveMonthlyTtsCharLimit('120'), 120);
  assert.equal(improvedTtsConfig.DEFAULT_APPROVED_BRITISH_VOICE_ID, SPEAKER_VOICES.Host.voice);
  assert.equal(improvedTtsConfig.DEFAULT_APPROVED_BRITISH_VOICE_ID, 'sp7QaEHmiNEd5HgrXuOo');
  assert.equal(improvedTtsConfig.B1_TTS_SPEED, B1_SPEECH_RATE);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(improvedTtsConfig.APPROVED_BRITISH_VOICES).map(([k, v]) => [k, v.voice]),
    ),
    Object.fromEntries(Object.entries(SPEAKER_VOICES).map(([k, v]) => [k, v.voice])),
  );

  const defaultVoice = improvedTtsConfig.resolveApprovedBritishVoice(undefined);
  assert.equal(defaultVoice.voiceId, 'sp7QaEHmiNEd5HgrXuOo');
  assert.deepEqual(defaultVoice.voiceSettings, { ...VOICE_SETTINGS, speed: 0.8 });

  const unapprovedFallback = improvedTtsConfig.resolveApprovedBritishVoice('unapproved-voice-999');
  assert.equal(unapprovedFallback.voiceId, 'sp7QaEHmiNEd5HgrXuOo');

  const approvedOverride = improvedTtsConfig.resolveApprovedBritishVoice('Aisha');
  assert.equal(approvedOverride.voiceId, SPEAKER_VOICES.Aisha.voice);
  assert.equal(approvedOverride.voiceSettings.stability, 0.35);
  assert.equal(approvedOverride.voiceSettings.style, 0.3);
  assert.equal(approvedOverride.voiceSettings.speed, 0.8);

  // Europe/Madrid midnight & month-start helpers handle CET (UTC+1) and CEST (UTC+2).
  assert.equal(
    improvedTtsConfig.madridDayStartIso(new Date('2026-11-28T10:30:00.000Z')),
    '2026-11-27T23:00:00.000Z',
  );
  assert.equal(
    improvedTtsConfig.madridDayStartIso(new Date('2026-07-15T00:30:00.000Z')),
    '2026-07-14T22:00:00.000Z',
  );
  assert.equal(
    improvedTtsConfig.madridMonthStartIso(new Date('2026-11-28T10:30:00.000Z')),
    '2026-10-31T23:00:00.000Z',
  );

  // Browser en-GB fallback is labelled simply "Computer voice" and staff dashboard shows monthly TTS chars.
  const improvedCardSource = read('components/b1b2/ImprovedAnswerCard.tsx');
  assert.match(improvedCardSource, />[\s\r\n]*Computer voice[\s\r\n]*</);
  const dashboardSource = read('src/app/dashboard/page.tsx');
  assert.match(dashboardSource, /TTS characters this month:/);

  // 2. Route behaviour: 204 when feature flag is off by default; when enabled, 2/day + monthly char cap + cached replay.
  const userId = '11111111-1111-4111-8111-111111111111';
  const storedObjects = new Map();
  const takes = new Map();
  for (let i = 1; i <= 4; i++) {
    const id = `22222222-2222-4222-8222-22222222222${i}`;
    takes.set(id, { improvedResponse: `Since then, I've made good friends in town ${i}.` });
  }
  const loggedSyntheses = [];
  let extraMonthlyChars = 0;
  const fetchedUrls = [];
  const fetchedBodies = [];
  let countShouldError = false;
  const envVars = { ELEVENLABS_API_KEY: 'fake-eleven-key' };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    rpc(name) {
      assert.notEqual(name, 'consume_ai_usage', 'TTS must spend zero AI usage units');
      throw new Error(`Unexpected supabase.rpc(${name})`);
    },
  };
  const admin = {
    from(table) {
      if (table === 'ai_request_logs') {
        const filters = {};
        let isCountHead = false;
        const logChain = {
          select(cols, opts) {
            isCountHead = Boolean(opts?.count === 'exact' && opts?.head === true);
            if (!isCountHead) assert.equal(cols, 'input_chars');
            return logChain;
          },
          eq(col, val) {
            filters[col] = val;
            return logChain;
          },
          gte(col, val) {
            filters[col] = val;
            assert.equal(filters.endpoint, '/api/speaking/improved-tts');
            assert.equal(filters.cache_hit, false);
            assert.equal(filters.status_code, 200);
            if (isCountHead) {
              assert.equal(filters.user_id, userId);
              if (countShouldError) {
                return Promise.resolve({ count: null, error: { message: 'db unavailable' } });
              }
              return Promise.resolve({ count: loggedSyntheses.length, error: null });
            }
            const rows = loggedSyntheses.map((entry) => ({ input_chars: entry.inputChars }));
            if (extraMonthlyChars > 0) rows.push({ input_chars: extraMonthlyChars });
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return logChain;
      }
      assert.equal(table, 'week_speaking_takes');
      let targetId = null;
      const chain = {
        select() { return chain; },
        eq(col, val) {
          if (col === 'id') targetId = val;
          return chain;
        },
        async maybeSingle() {
          const feedback = takes.get(targetId);
          return feedback
            ? { data: { id: targetId, user_id: userId, feedback }, error: null }
            : { data: null, error: null };
        },
        update(patch) {
          return {
            eq(_c1, idVal) {
              return {
                eq: async () => {
                  takes.set(idVal, patch.feedback);
                  return { error: null };
                },
              };
            },
          };
        },
      };
      return chain;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'speaking-recordings');
        return {
          async download(path) {
            const bytes = storedObjects.get(path);
            return bytes
              ? { data: new Blob([bytes], { type: 'audio/mpeg' }), error: null }
              : { data: null, error: { message: 'not found' } };
          },
          async upload(path, body) {
            storedObjects.set(path, body);
            return { error: null };
          },
        };
      },
    },
  };

  const proxySource = read('src/proxy.ts');
  assert.equal(proxySource.includes('/api/speaking/improved-tts'), false, 'TTS playback must not be an AI-unit route');
  const speechSource = read('lib/b1b2/speech.ts');
  assert.match(speechSource, /res\.status === 429/, 'client speech helper must fall back smoothly on 429');

  const route = transpileLoad(
    'src/app/api/speaking/improved-tts/route.ts',
    {
      'next/server': {
        NextResponse: class FakeResponse {
          constructor(body, init = {}) {
            this.body = body;
            this.status = init.status ?? 200;
            this.headers = init.headers ?? {};
          }
          static json(body, init = {}) {
            return { body, status: init.status ?? 200, headers: init.headers ?? {} };
          }
        },
      },
      '@/utils/supabase/server': { createServerSupabase: async () => supabase },
      '@/utils/supabase/admin': { createAdminSupabase: () => admin },
      '@/lib/b1b2/observability': {
        async logAiRequest(_client, entry, isSignedIn) {
          assert.equal(isSignedIn, true);
          loggedSyntheses.push(entry);
        },
      },
      '@/lib/b1b2/improved-tts-config.mjs': improvedTtsConfig,
    },
    {
      process: { env: envVars },
      fetch: async (url, init) => {
        fetchedUrls.push(url);
        fetchedBodies.push(JSON.parse(init.body));
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      },
    },
  );

  // Off by default: returns 204 immediately and NEVER calls ElevenLabs.
  const firstId = '22222222-2222-4222-8222-222222222221';
  const disabledRes = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${firstId}` });
  assert.equal(disabledRes.status, 204);
  assert.equal(disabledRes.headers['X-TTS-Disabled'], '1');
  assert.equal(fetchedUrls.length, 0);

  // Enable flag: synthesize 2 takes (2-a-day cap), logging inputChars.
  envVars.IMPROVED_ANSWER_TTS_ENABLED = 'true';
  for (let i = 1; i <= 2; i++) {
    const id = `22222222-2222-4222-8222-22222222222${i}`;
    const res = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${id}` });
    assert.equal(res.status, 200);
    assert.equal(res.headers['X-TTS-Daily-Limit'], '2');
    assert.equal(res.headers['X-TTS-Remaining-Day'], String(2 - i));
    assert.equal(takes.get(id).ttsAudioPath, `${userId}/tts/take/${id}.mp3`);
  }
  assert.equal(fetchedUrls.length, 2);
  assert.ok(
    fetchedUrls.every((u) => u.includes('/v1/text-to-speech/sp7QaEHmiNEd5HgrXuOo?')),
    'all syntheses must use the approved British Host voice by default',
  );
  assert.equal(fetchedBodies[0].model_id, 'eleven_multilingual_v2');
  assert.equal(fetchedBodies[0].voice_settings.speed, 0.8);
  assert.equal(loggedSyntheses.length, 2);
  assert.ok(loggedSyntheses[0].inputChars > 20, 'inputChars must be logged');

  // 3rd new uncached take on the same day is blocked with 429 (2/day cap) and does NOT call ElevenLabs.
  const thirdId = '22222222-2222-4222-8222-222222222223';
  const third = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${thirdId}` });
  assert.equal(third.status, 429);
  assert.equal(third.body.reason, 'daily_limit');
  assert.equal(third.headers['X-TTS-Daily-Limit'], '2');
  assert.equal(third.headers['X-TTS-Remaining-Day'], '0');
  assert.equal(fetchedUrls.length, 2);

  // Cached replay still succeeds even after hitting 2/day!
  const cachedReplay = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${firstId}` });
  assert.equal(cachedReplay.status, 200);
  assert.equal(cachedReplay.headers['X-TTS-Cache'], 'HIT');
  assert.equal(fetchedUrls.length, 2);

  // Monthly total character cap (default 40,000, configurable via ELEVENLABS_MONTHLY_CHAR_LIMIT):
  loggedSyntheses.length = 0;
  envVars.ELEVENLABS_MONTHLY_CHAR_LIMIT = '100';
  extraMonthlyChars = 90;
  const monthBlocked = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${thirdId}` });
  assert.equal(monthBlocked.status, 429);
  assert.equal(monthBlocked.body.reason, 'monthly_char_limit');
  assert.equal(monthBlocked.headers['X-TTS-Monthly-Char-Limit'], '100');
  assert.equal(fetchedUrls.length, 2);

  // DB count failure fails closed with 204 so browser Web Speech takes over safely.
  countShouldError = true;
  const closedOnError = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${thirdId}` });
  assert.equal(closedOnError.status, 204);
  assert.equal(fetchedUrls.length, 2);
});

test('live prompt eval is wired exclusively to Groq (groq-sdk + GROQ_API_KEY + openai/gpt-oss-20b) without running live network calls', async () => {
  const evalSource = read('scripts/eval-prompts.mjs');
  const ciWorkflow = read('.github/workflows/ci.yml');

  // Static audit: Groq SDK + GROQ_API_KEY only, manual workflow_dispatch gate, zero OpenAI SDK/key.
  assert.equal(LIVE_GROQ_MODEL, 'openai/gpt-oss-20b');
  assert.match(evalSource, /await import\('groq-sdk'\)/);
  assert.match(evalSource, /process\.env\.GROQ_API_KEY/);
  assert.doesNotMatch(evalSource, /OPENAI_API_KEY/);
  assert.doesNotMatch(evalSource, /from\s+['"]openai['"]|import\(['"]openai['"]\)/);
  assert.match(
    ciWorkflow,
    /live-prompt-evals:[\s\S]*?if:\s*github\.event_name == 'workflow_dispatch' && inputs\.live_prompt_evals == true/,
  );
  assert.match(ciWorkflow, /GROQ_API_KEY:\s*\$\{\{\s*secrets\.GROQ_API_KEY\s*\}\}/);
  assert.doesNotMatch(ciWorkflow, /OPENAI_API_KEY/);

  // Dry-run the full live Groq suite against an in-memory fake Groq client (0 network calls, 0 quota spent).
  const recordedCalls = [];
  const fakeGroq = {
    chat: {
      completions: {
        async create(payload) {
          recordedCalls.push(payload);
          assert.equal(payload.model, 'openai/gpt-oss-20b');
          assert.deepEqual(payload.response_format, { type: 'json_object' });
          const sys = payload.messages[0]?.content ?? '';
          const usr = payload.messages[1]?.content ?? '';

          if (sys.includes('"fixed": boolean')) {
            return {
              choices: [{ message: { content: JSON.stringify({ fixed: false, reason: 'Error remains.' }) } }],
            };
          }

          if (sys.includes('speaking coach for Week')) {
            const includeInteractive = !sys.includes('"interactive_communication": null');
            const improvedResponse =
              "When I moved town, I didn't know anyone. Since then, I've joined a sports club and made good friends.";
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      feedback: 'Clear B1 ideas.',
                      improvedResponse,
                      highlights: [
                        {
                          substring: "Since then, I've joined",
                          label: 'Present perfect',
                          explanation: 'Links the past change to now.',
                        },
                      ],
                      areas: {
                        grammar_and_vocabulary: { score: 4, strength: 'Clear words.', improvement: 'Check past forms.' },
                        discourse_management: { score: 4, strength: 'Logical order.', improvement: 'Add one linker.' },
                        pronunciation: null,
                        interactive_communication: includeInteractive
                          ? { score: 4, strength: 'Good turn-taking.', improvement: 'Ask one follow-up.' }
                          : null,
                      },
                      corrections: [],
                    }),
                  },
                },
              ],
            };
          }

          // Writing single-sentence benchmark + 3 B1 writing texts.
          const matchedBench = BENCHMARK_SENTENCES.find((item) => {
            const snippet = item.input.replace(/<[^>]*>/g, '').trim().slice(-28);
            return usr.includes(snippet);
          });
          const isZeroError = Boolean(matchedBench?.zeroError);
          const cats = matchedBench?.expectedCategories ?? [matchedBench?.category ?? 'preposition'];

          const body = isZeroError
            ? {
                corrected: 'I usually work from home on Fridays.',
                feedback: 'Clear and accurate sentence.',
                notes: ['Good structure.'],
                corrections: [],
                errorPatterns: [],
                areas: {
                  content: { score: 5, strength: 'Clear message.', improvement: 'Keep going.' },
                  communicative_achievement: { score: 4, strength: 'Natural tone.', improvement: 'Keep this style.' },
                  organisation: { score: 4, strength: 'Smooth link.', improvement: 'Good flow.' },
                  language: { score: 5, strength: 'Accurate grammar.', improvement: 'Try new phrases.' },
                },
              }
            : {
                corrected: 'I am responsible for the design team.',
                feedback: 'Good effort. Check the highlighted pattern.',
                notes: ['Review the preposition and verb form.'],
                corrections: cats.slice(0, 2).map((cat) => ({
                  original: 'sample phrase',
                  corrected_sentence: 'I am responsible for the design team.',
                  error_category: cat,
                  explanation: 'Check this pattern.',
                  severity: 'moderate',
                })),
                errorPatterns: cats.slice(0, 4),
                areas: {
                  content: { score: 4, strength: 'Clear idea.', improvement: 'Add one detail.' },
                  communicative_achievement: { score: 4, strength: 'Good tone.', improvement: 'Stay consistent.' },
                  organisation: { score: 4, strength: 'Logical order.', improvement: 'Add a linker.' },
                  language: { score: 3, strength: 'Clear words.', improvement: 'Check prepositions.' },
                },
              };
          return { choices: [{ message: { content: JSON.stringify(body) } }] };
        },
      },
    },
  };

  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  let gateFailures;
  try {
    gateFailures = await runLiveGroqSuite(fakeGroq);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }

  assert.equal(gateFailures, 0);
  // 60 benchmark sentences + 2 rewrite injections + 3 B1 writing texts + 5 B1 speaking transcripts = 70 Groq calls.
  assert.equal(recordedCalls.length, 70);
});

test('1e exact "TV stroke podcast" transcript cleans ASR artefacts, emits no filler, no "stroke" tip, and <= 3 changed highlights', () => {
  const exactTranscript =
    "All right, so my goal is to create a TV stroke podcast focused around a state in rural England. So what have I already arranged? I've written a pilot script, highlighted each of the individual characters within the story and written a one minute pilot. When it's done, I'd like to distribute it to some TV people to listen to on a podcast style format to give me their opinions. If it doesn't work out, I will look at the various different options as to whether to turn it into a story with like a storybook or maybe go down the podcast route instead of making it into a TV series.";

  const asr = speakingFeedback.cleanTranscriptionArtifacts(exactTranscript);
  assert.ok(asr.cleanedTranscript.includes('TV/podcast'), 'TV stroke podcast -> TV/podcast');
  assert.ok(asr.cleanedTranscript.includes('an estate in rural England'), 'a state -> an estate');
  assert.ok(asr.repairedWords.includes('stroke'));
  assert.ok(asr.repairedWords.includes('estate'));

  const validated = feedbackSchema.validateSpeakingFeedback(
    {
      feedback: 'You explained your TV/podcast plan and back-up options clearly.',
      nextStep: 'Use going to when you describe your next planned step.',
      improvedResponse:
        "My goal is to create a TV/podcast set on an estate in rural England. So far, I've written a one-minute pilot script and described each character in the story, which is something I want to talk about. When it's finished, I'm going to send it to TV people in a podcast-style format for their opinions. If that doesn't work out, I'll look at other options, like turning it into a storybook or a podcast.",
      highlights: [
        { substring: 'set on an estate', label: 'Natural phrase', explanation: 'Uses set on for the setting of a story.' },
        { substring: "I'm going to send it", label: 'Plan with going to', explanation: 'Uses going to for a decided plan.' },
        { substring: 'in a podcast-style format', label: 'Preposition fix', explanation: 'Uses in with format instead of on.' },
        { substring: 'which is something I want to talk about', label: 'Filler', explanation: 'Must be stripped.' },
        { substring: 'like turning it into a storybook', label: 'Extra fourth', explanation: 'Must be capped at 3.' },
      ],
      corrections: [
        {
          original: 'TV stroke podcast',
          corrected_sentence: 'TV/podcast',
          error_category: 'word_choice',
          explanation: 'Use a slash.',
          severity: 'minor',
        },
        {
          original: 'around a state in rural England',
          corrected_sentence: 'around an estate in rural England',
          error_category: 'word_choice',
          explanation: 'Use estate.',
          severity: 'minor',
        },
        {
          original: 'listen to on a podcast style format',
          corrected_sentence: 'listen to in a podcast-style format',
          error_category: 'preposition',
          explanation: 'Use in a format, not on a format.',
          severity: 'moderate',
        },
      ],
      areas: {
        grammar_and_vocabulary: { score: 4, strength: 'Clear vocabulary.', improvement: 'Use in with format.' },
        discourse_management: { score: 4, strength: 'Good sequence.', improvement: 'Keep clauses concise.' },
        pronunciation: null,
        interactive_communication: null,
      },
    },
    exactTranscript,
    { weekNumber: 2, includeInteractive: false },
  );

  assert.equal(speakingFeedback.hasMeaninglessFiller(validated.improvedResponse), false, 'no filler in improvedResponse');
  assert.equal(validated.improvedResponse.includes('which is something I want to talk about'), false);
  assert.ok(validated.highlights.length >= 1 && validated.highlights.length <= 3, 'at most 3 highlighted changes');
  for (const h of validated.highlights) {
    assert.ok(validated.improvedResponse.includes(h.substring), 'every highlight is an exact substring');
    assert.ok(h.explanation.length > 5, 'every highlight has a one-line B1 reason');
  }
  assert.equal(
    validated.corrections.some((c) => /stroke|\ba state\b/i.test(c.original)),
    false,
    'never correct ASR transcription slips',
  );

  const tips = speakingFeedback.soundTips(exactTranscript, {
    excludeWords: validated.repairedWords,
    weekNumber: 2,
  });
  assert.ok(tips.length <= 2, 'at most 2 sound tips');
  assert.equal(tips.some((t) => t.word.toLowerCase() === 'stroke'), false, 'never give a sound tip on "stroke"');
  for (const tip of tips) {
    assert.equal(levelGuard.isCommonB1B2Word(tip.word, 2), true, `${tip.word} must be on the B1-B2 word list`);
  }
});

test('Labs targets load plain-English grammar with examples and <= 4 target words per week, empty with no week, and zero C1 terms across all weeks', () => {
  const labsSource = read('src/app/labs/page.tsx');
  assert.doesNotMatch(labsSource, /Hedging & concession|compelling evidence|concede a point|on balance/);

  const c1JargonRegex = /\b(?:hedging|concession|compelling|concede|inversion|cleft|fronting|ellipsis|subsequently|ubiquitous|narrative tenses|present continuous|conditionals)\b/i;
  for (const wk of details.weeks) {
    const grammarLines = weekWritingSupport.plainGrammarTargetsForWeek(wk.number, wk.writing.grammar);
    const words = weekWritingSupport.targetWordsForWeek(wk.writing.featuredWords, wk.writing.linkers);
    assert.ok(grammarLines.length >= 1 && grammarLines.length <= 2);
    for (const line of grammarLines) {
      assert.ok(line.includes(':'), `plain grammar line should include an example: ${line}`);
      assert.doesNotMatch(line, c1JargonRegex);
    }
    assert.ok(words.length >= 1 && words.length <= 4, `Week ${wk.number} has at most 4 target words`);
    for (const w of words) {
      assert.doesNotMatch(w, c1JargonRegex);
    }
  }
  // Week 2 specifically shows Plans example + Week 2 target words.
  const week2Grammar = weekWritingSupport.plainGrammarTargetsForWeek(2, details.weeks[1].writing.grammar);
  assert.ok(week2Grammar[0].startsWith('Plans:'));
  assert.deepEqual(
    weekWritingSupport.targetWordsForWeek(details.weeks[1].writing.featuredWords, details.weeks[1].writing.linkers),
    ['goal', 'intend to', 'career', 'look forward to'],
  );

  // Weeks 5-32 also never emit C1 terms.
  for (let wk = 5; wk <= 32; wk += 1) {
    for (const line of weekWritingSupport.plainGrammarTargetsForWeek(wk, '')) {
      assert.doesNotMatch(line, c1JargonRegex);
    }
  }

  // B1 writing helpers: 4 paragraph prompts with 2-3 starters each, task-matching grammar filter, and model highlights.
  for (const wk of details.weeks) {
    const paraPrompts = weekWritingSupport.buildParagraphPlanPrompts(
      wk.writing.planFrame,
      wk.writing.usefulLanguage,
      wk.number,
    );
    assert.equal(paraPrompts.length, 4);
    for (const p of paraPrompts) {
      assert.ok(p.starters.length >= 2 && p.starters.length <= 3);
    }
    const modelHighlights = weekWritingSupport.highlightModelAnswer(
      wk.writing.modelAnswer,
      wk.number,
      wk.writing.linkers,
    );
    assert.ok(modelHighlights.length >= 3);
    for (const h of modelHighlights) {
      assert.ok(wk.writing.modelAnswer.includes(h.substring));
      assert.ok(h.explanation.length > 5);
    }
  }
});

test('teacher review route lets teachers override 0-5 area marks including Pronunciation and rejects invalid marks', async () => {
  const teacherId = '33333333-3333-4333-8333-333333333333';
  const takeId = '44444444-4444-4444-8444-444444444444';
  let savedFeedback = {
    areas: {
      grammar_and_vocabulary: { score: 3, strength: 'Clear words.', improvement: 'Check past forms.' },
      discourse_management: { score: 3, strength: 'Good order.', improvement: 'Add linkers.' },
      pronunciation: null,
      interactive_communication: null,
    },
  };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: 'teacher' }, error: null }),
          }),
        }),
      };
    },
    rpc: async () => ({ data: 'review-1', error: null }),
  };
  const admin = {
    from(table) {
      assert.equal(table, 'week_speaking_takes');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { feedback: savedFeedback }, error: null }),
          }),
        }),
        update: (patch) => {
          savedFeedback = patch.feedback;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  const teacherRoute = transpileLoad('src/app/api/teacher/review/route.ts', {
    'next/server': {
      NextResponse: {
        json: (body, init = {}) => ({ body, status: init.status ?? 200 }),
      },
    },
    '@/utils/supabase/server': { createServerSupabase: async () => supabase },
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
    '@/lib/b1b2/feedback-schema': feedbackSchema,
  });

  const okRes = await teacherRoute.POST({
    json: async () => ({
      targetType: 'week_speaking_take',
      targetId: takeId,
      teacherStatus: 'overridden',
      areaMarks: { pronunciation: 4, grammar_and_vocabulary: 5 },
      teacherNotes: 'Clear stress and intonation.',
    }),
  });
  assert.equal(okRes.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(savedFeedback.teacherAreaMarks)), {
    pronunciation: 4,
    grammar_and_vocabulary: 5,
  });

  const badRes = await teacherRoute.POST({
    json: async () => ({
      targetType: 'week_speaking_take',
      targetId: takeId,
      teacherStatus: 'overridden',
      areaMarks: { pronunciation: 7 },
    }),
  });
  assert.equal(badRes.status, 400);
});
