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
  './prompt-guard': promptGuard,
  './level-guard.mjs': levelGuard,
  './speaking-feedback.mjs': speakingFeedback,
});

test('writing feedback marks four 0-5 areas, has no overall score, caps Content under 100 words, warns over 180 words, and caps corrections at 3 with week grammar first', () => {
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

  const under100 = feedbackSchema.validateWritingFeedback(rawWriting, shortText, { weekNumber: 3 });
  assert.equal(Object.hasOwn(under100, 'score'), false);
  assert.equal(Object.hasOwn(under100, 'rubric'), false);
  assert.equal(under100.contentCappedUnder100, true);
  assert.equal(under100.areas.content.score, 3, 'under 100 words must cap Content at 3');
  assert.equal(under100.wordCountTip, null);
  assert.equal(under100.corrections.length, 3, 'at most 3 corrections per text');
  assert.equal(under100.corrections[0].error_category, 'modal_verb', 'Week 3 modal grammar comes first');

  // Placement samples (60-100 words) opt out of the 120-150 under-100 Content cap.
  const placementSample = feedbackSchema.validateWritingFeedback(rawWriting, shortText, {
    skipUnder100Cap: true,
  });
  assert.equal(placementSample.areas.content.score, 5);

  const mediumText = Array.from({ length: 135 }, () => 'word').join(' ') + '.';
  const onTarget = feedbackSchema.validateWritingFeedback(rawWriting, mediumText, { weekNumber: 1 });
  assert.equal(onTarget.contentCappedUnder100, false);
  assert.equal(onTarget.areas.content.score, 5);
  assert.equal(onTarget.wordCountTip, null);

  const longText = Array.from({ length: 185 }, () => 'word').join(' ') + '.';
  const over180 = feedbackSchema.validateWritingFeedback(rawWriting, longText, { weekNumber: 1 });
  assert.equal(over180.wordCountTip, 'Try to keep to 120–150 words.');
  assert.equal(over180.notes[0], 'Try to keep to 120–150 words.');
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

test('improved-tts defaults to the approved British voice, enforces a 5-a-day synthesis limit, keeps cached replays unlimited, and spends zero AI units', async () => {
  // 1. Approved British voice contract matches course-audio pipeline constants.
  assert.equal(improvedTtsConfig.DAILY_TTS_LIMIT, 5);
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

  // Europe/Madrid midnight helper handles CET (UTC+1) and CEST (UTC+2).
  assert.equal(
    improvedTtsConfig.madridDayStartIso(new Date('2026-11-28T10:30:00.000Z')),
    '2026-11-27T23:00:00.000Z',
  );
  assert.equal(
    improvedTtsConfig.madridDayStartIso(new Date('2026-07-15T00:30:00.000Z')),
    '2026-07-14T22:00:00.000Z',
  );

  // 2. Route behaviour: auth, default British voice URL, 5/day synthesis limit, unlimited cache replays, 0 AI units.
  const userId = '11111111-1111-4111-8111-111111111111';
  const storedObjects = new Map();
  const takes = new Map();
  for (let i = 1; i <= 6; i++) {
    const id = `22222222-2222-4222-8222-22222222222${i}`;
    takes.set(id, { improvedResponse: `Since then, I've made good friends in town ${i}.` });
  }
  const loggedSyntheses = [];
  const fetchedUrls = [];
  const fetchedBodies = [];
  let countShouldError = false;

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
        const countChain = {
          select(_cols, opts) {
            assert.equal(opts?.count, 'exact');
            assert.equal(opts?.head, true);
            return countChain;
          },
          eq(col, val) {
            filters[col] = val;
            return countChain;
          },
          gte(col, val) {
            filters[col] = val;
            assert.equal(filters.user_id, userId);
            assert.equal(filters.endpoint, '/api/speaking/improved-tts');
            assert.equal(filters.cache_hit, false);
            assert.equal(filters.status_code, 200);
            if (countShouldError) {
              return Promise.resolve({ count: null, error: { message: 'db unavailable' } });
            }
            return Promise.resolve({ count: loggedSyntheses.length, error: null });
          },
        };
        return countChain;
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
      process: { env: { ELEVENLABS_API_KEY: 'fake-eleven-key' } },
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

  // Synthesize 5 distinct takes: all 5 succeed with the approved British voice and count down 4 -> 0.
  for (let i = 1; i <= 5; i++) {
    const id = `22222222-2222-4222-8222-22222222222${i}`;
    const res = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${id}` });
    assert.equal(res.status, 200);
    assert.equal(res.headers['X-TTS-Daily-Limit'], '5');
    assert.equal(res.headers['X-TTS-Remaining-Day'], String(5 - i));
    assert.equal(takes.get(id).ttsAudioPath, `${userId}/tts/take/${id}.mp3`);
  }
  assert.equal(fetchedUrls.length, 5);
  assert.ok(
    fetchedUrls.every((u) => u.includes('/v1/text-to-speech/sp7QaEHmiNEd5HgrXuOo?')),
    'all syntheses must use the approved British Host voice by default',
  );
  assert.equal(fetchedBodies[0].model_id, 'eleven_multilingual_v2');
  assert.equal(fetchedBodies[0].voice_settings.speed, 0.8);
  assert.equal(loggedSyntheses.length, 5);

  // 6th new uncached take on the same day is blocked with 429 and does NOT call ElevenLabs.
  const sixthId = '22222222-2222-4222-8222-222222222226';
  const sixth = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${sixthId}` });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.headers['X-TTS-Daily-Limit'], '5');
  assert.equal(sixth.headers['X-TTS-Remaining-Day'], '0');
  assert.equal(fetchedUrls.length, 5, '6th synthesis must not call ElevenLabs');

  // Replaying an already-cached take STILL succeeds (unlimited cached replays) even after hitting 5/day!
  const firstId = '22222222-2222-4222-8222-222222222221';
  const cachedReplay = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${firstId}` });
  assert.equal(cachedReplay.status, 200);
  assert.equal(cachedReplay.headers['X-TTS-Cache'], 'HIT');
  assert.equal(fetchedUrls.length, 5, 'cached replay must not call ElevenLabs');

  // DB count failure fails closed with 204 so browser Web Speech takes over safely.
  countShouldError = true;
  const closedOnError = await route.GET({ url: `https://example.test/api/speaking/improved-tts?kind=take&id=${sixthId}` });
  assert.equal(closedOnError.status, 204);
  assert.equal(fetchedUrls.length, 5);
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
  // 60 benchmark sentences + 2 rewrite injections + 3 B1 writing texts + 4 B1 speaking transcripts = 69 Groq calls.
  assert.equal(recordedCalls.length, 69);
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
