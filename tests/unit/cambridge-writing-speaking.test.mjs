import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as levelGuard from '../../lib/b1b2/level-guard.mjs';
import * as speakingFeedback from '../../lib/b1b2/speaking-feedback.mjs';
import * as diffModule from '../../lib/b1b2/diff.ts';

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

test('improved-tts route requires auth, spends zero AI units, caches MP3 per attempt in Storage, and delete-data removes cached TTS paths', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const takeId = '22222222-2222-4222-8222-222222222222';
  const storedObjects = new Map();
  let feedbackState = { improvedResponse: "Since then, I've made good friends in my town." };
  let elevenLabsCalls = 0;

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  };
  const admin = {
    from(table) {
      assert.equal(table, 'week_speaking_takes');
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        async maybeSingle() {
          return { data: { id: takeId, user_id: userId, feedback: feedbackState }, error: null };
        },
        update(patch) {
          feedbackState = patch.feedback;
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
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
            return bytes ? { data: new Blob([bytes], { type: 'audio/mpeg' }), error: null } : { data: null, error: { message: 'not found' } };
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
    },
    {
      process: { env: { ELEVENLABS_API_KEY: 'fake-eleven-key' } },
      fetch: async () => {
        elevenLabsCalls += 1;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      },
    },
  );

  const req = { url: `https://example.test/api/speaking/improved-tts?kind=take&id=${takeId}` };
  const first = await route.GET(req);
  assert.equal(first.status, 200);
  assert.equal(elevenLabsCalls, 1);
  assert.equal(feedbackState.ttsAudioPath, `${userId}/tts/take/${takeId}.mp3`);

  const second = await route.GET(req);
  assert.equal(second.status, 200);
  assert.equal(elevenLabsCalls, 1, 'second playback must serve cached audio without re-synthesizing');
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
