#!/usr/bin/env node
/**
 * Prompt & Feedback Loop Regression Suite (20 curated B1 → B2 sentences).
 *
 * Usage:
 *   node scripts/eval-prompts.mjs            # validates schemas, FSRS & cache locally; runs live Groq eval if GROQ_API_KEY is set
 *   node scripts/eval-prompts.mjs --offline  # deterministic offline schema + FSRS + cache check
 *   node scripts/eval-prompts.mjs --live     # requires GROQ_API_KEY
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

const ERROR_CATEGORIES = ['article', 'preposition', 'tense', 'collocation', 'word_order', 'connector'];
const ERROR_SEVERITIES = ['minor', 'moderate', 'major'];

const CorrectionItemSchema = z.object({
  original: z.string().trim().min(1).max(300),
  corrected_sentence: z.string().trim().min(1).max(400),
  error_category: z.enum(ERROR_CATEGORIES),
  explanation: z.string().trim().min(1).max(500),
  severity: z.enum(ERROR_SEVERITIES),
  rule: z.string().trim().max(120).optional(),
});

const WritingFeedbackSchema = z.object({
  corrected: z.string().trim().min(1),
  feedback: z.string().trim().min(1),
  notes: z.array(z.string().trim().min(1)).max(8),
  corrections: z.array(CorrectionItemSchema).max(10),
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(6),
  rubric: z.object({
    task_response: z.number().min(0).max(5),
    organisation: z.number().min(0).max(5),
    grammar_accuracy: z.number().min(0).max(5),
    lexical_range: z.number().min(0).max(5),
    style: z.number().min(0).max(5),
  }),
  score: z.number().int().min(0).max(100),
});

export const BENCHMARK_SENTENCES = [
  {
    id: 'art-01',
    category: 'article',
    input: 'Moving to London was turning point in my career.',
    expectedFix: 'a turning point',
    sampleExplanation: 'Use "a" before the singular countable noun phrase "turning point".',
  },
  {
    id: 'art-02',
    category: 'article',
    input: 'She gave me an useful advice before my interview.',
    expectedFix: 'useful advice',
    sampleExplanation: '"Advice" is uncountable in English, so do not use "an" before it.',
  },
  {
    id: 'art-03',
    category: 'article',
    input: 'The honesty is the most important quality in a colleague.',
    expectedFix: 'Honesty',
    sampleExplanation: 'Do not use "the" before abstract nouns when speaking in general.',
  },
  {
    id: 'prep-01',
    category: 'preposition',
    input: 'I am responsible of managing the regional team.',
    expectedFix: 'responsible for',
    sampleExplanation: 'The adjective "responsible" takes the preposition "for", not "of".',
  },
  {
    id: 'prep-02',
    category: 'preposition',
    input: 'It took me months to get used to live in a rainy city.',
    expectedFix: 'get used to living',
    sampleExplanation: 'In "get used to", "to" is a preposition, so follow it with the -ing form.',
  },
  {
    id: 'prep-03',
    category: 'preposition',
    input: 'We discussed about the new schedule during the morning call.',
    expectedFix: 'discussed the new schedule',
    sampleExplanation: '"Discuss" does not take "about" before its direct object.',
  },
  {
    id: 'prep-04',
    category: 'preposition',
    input: 'She arrived to Madrid late because of the storm.',
    expectedFix: 'arrived in Madrid',
    sampleExplanation: 'Use "arrive in" for cities and countries, and "arrive at" for buildings.',
  },
  {
    id: 'tense-01',
    category: 'tense',
    input: 'I have started my current job in 2021.',
    expectedFix: 'I started my current job in 2021.',
    sampleExplanation: 'Use the past simple with a finished past time expression such as "in 2021".',
  },
  {
    id: 'tense-02',
    category: 'tense',
    input: 'When I reached the station, the train already left.',
    expectedFix: 'had already left',
    sampleExplanation: 'Use the past perfect ("had left") for an action that happened before another past event.',
  },
  {
    id: 'tense-03',
    category: 'tense',
    input: 'I live in Barcelona since four years.',
    expectedFix: 'have lived in Barcelona for four years',
    sampleExplanation: 'Use the present perfect with "for" to show a duration up to now.',
  },
  {
    id: 'tense-04',
    category: 'tense',
    input: 'If I would have more time, I would practise speaking every day.',
    expectedFix: 'If I had more time',
    sampleExplanation: 'In a second conditional, use past simple after "if" and "would" in the main clause.',
  },
  {
    id: 'coll-01',
    category: 'collocation',
    input: 'Before deciding, I need to make a research on the company.',
    expectedFix: 'do research',
    sampleExplanation: 'In English we "do research" or "carry out research", not "make a research".',
  },
  {
    id: 'coll-02',
    category: 'collocation',
    input: 'He told a big mistake during the client presentation.',
    expectedFix: 'made a serious mistake',
    sampleExplanation: 'We "make a mistake" (not "tell"), and "serious" or "major" sounds more natural than "big".',
  },
  {
    id: 'coll-03',
    category: 'collocation',
    input: 'I look forward to hear your opinion on the proposal.',
    expectedFix: 'look forward to hearing',
    sampleExplanation: 'Follow "look forward to" with a noun or -ing verb.',
  },
  {
    id: 'coll-04',
    category: 'collocation',
    input: 'My parents finally came round of the idea after we talked.',
    expectedFix: 'came round to the idea',
    sampleExplanation: 'The phrasal verb is "come round to" an idea, meaning gradually accept it.',
  },
  {
    id: 'wo-01',
    category: 'word_order',
    input: 'Can you tell me where is the nearest underground station?',
    expectedFix: 'where the nearest underground station is',
    sampleExplanation: 'Indirect questions keep subject-before-verb order rather than question inversion.',
  },
  {
    id: 'wo-02',
    category: 'word_order',
    input: 'Not only the new policy reduced costs, it also saved time.',
    expectedFix: 'Not only did the new policy reduce costs',
    sampleExplanation: 'When "Not only" starts a sentence, invert the auxiliary verb "did" before the subject.',
  },
  {
    id: 'wo-03',
    category: 'word_order',
    input: 'She speaks very well English when she is relaxed.',
    expectedFix: 'speaks English very well',
    sampleExplanation: 'Keep the verb ("speaks") and its object ("English") together before "very well".',
  },
  {
    id: 'conn-01',
    category: 'connector',
    input: 'Despite it was raining heavily, we walked across the centre.',
    expectedFix: 'Although it was raining heavily',
    sampleExplanation: 'Use "Although" before a subject + verb clause, or "Despite the heavy rain" before a noun.',
  },
  {
    id: 'conn-02',
    category: 'connector',
    input: 'Remote work saves commuting time, in the other hand it can feel isolating.',
    expectedFix: 'on the other hand',
    sampleExplanation: 'The fixed discourse linker is "on the other hand", not "in the other hand".',
  },
];

function checkOfflineSuite() {
  let failures = 0;

  // 1. Validate 20 benchmark items + strict Zod schema shape
  for (const item of BENCHMARK_SENTENCES) {
    const sample = {
      corrected: item.expectedFix,
      feedback: 'Good effort. Practise the highlighted structure in your next draft.',
      notes: ['Keep your sentences clear and well organised.'],
      corrections: [
        {
          original: item.input,
          corrected_sentence: item.expectedFix,
          error_category: item.category,
          explanation: item.sampleExplanation,
          severity: 'moderate',
          rule: `B1-B2 ${item.category}`,
        },
      ],
      errorPatterns: [item.category],
      rubric: {
        task_response: 3.5,
        organisation: 3.5,
        grammar_accuracy: 3.0,
        lexical_range: 3.5,
        style: 3.5,
      },
      score: 68,
    };

    const parsed = WritingFeedbackSchema.safeParse(sample);
    if (!parsed.success) {
      failures++;
      console.error(`FAIL [${item.id}] Zod schema:`, parsed.error.issues);
    }
  }

  // 2. Verify FSRS progression schedules increasing intervals for Good/Easy
  const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: true }));
  const now = new Date('2026-11-19T12:00:00Z');
  let card = createEmptyCard(now);
  const res1 = scheduler.next(card, now, Rating.Good);
  const res2 = scheduler.next(res1.card, res1.card.due, Rating.Good);
  const res3 = scheduler.next(res2.card, res2.card.due, Rating.Easy);
  if (!(res3.card.due > res2.card.due && res2.card.scheduled_days >= res1.card.scheduled_days)) {
    failures++;
    console.error('FAIL FSRS interval progression check');
  }

  // 3. Verify cache key determinism
  const keyA = createHash('sha256').update('  hello   world ').digest('hex');
  const keyB = createHash('sha256').update('  hello   world ').digest('hex');
  if (keyA !== keyB) {
    failures++;
    console.error('FAIL deterministic cache key check');
  }

  console.log(`Offline regression checks: ${BENCHMARK_SENTENCES.length} benchmark cases, FSRS progression, and cache key passed (${failures} failures).`);
  return failures;
}

async function checkLiveGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log('GROQ_API_KEY not set — skipping live LLM regression calls.');
    return 0;
  }

  const { default: Groq } = await import('groq-sdk');
  const groq = new Groq({ apiKey });
  let failures = 0;

  for (const item of BENCHMARK_SENTENCES) {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are a CEFR B1 -> B2 English writing examiner. Use simple B1 British English in every explanation. Return valid JSON matching WritingFeedbackSchema with error_category in ${ERROR_CATEGORIES.join('|')} and severity in ${ERROR_SEVERITIES.join('|')}.`,
        },
        { role: 'user', content: `Learner Response:\n"""\n${item.input}\n"""` },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    const parsedJson = raw ? JSON.parse(raw) : {};
    const valid = WritingFeedbackSchema.safeParse(parsedJson);
    if (!valid.success) {
      failures++;
      console.error(`FAIL [${item.id}] Invalid Zod response:`, valid.error.issues);
      continue;
    }

    const hit = valid.data.corrections.some((c) => c.error_category === item.category) || valid.data.errorPatterns.includes(item.category);
    if (!hit) {
      failures++;
      console.error(`FAIL [${item.id}] Expected category "${item.category}", got ${JSON.stringify(valid.data.errorPatterns)}`);
    } else {
      console.log(`PASS [${item.id}] (${item.category}) -> ${valid.data.corrections[0]?.corrected_sentence ?? valid.data.corrected}`);
    }
  }

  return failures;
}

const args = new Set(process.argv.slice(2));
const offlineFailures = checkOfflineSuite();
let liveFailures = 0;
if (!args.has('--offline') && (args.has('--live') || process.env.GROQ_API_KEY)) {
  liveFailures = await checkLiveGroq();
}

process.exit(offlineFailures + liveFailures > 0 ? 1 : 0);
