#!/usr/bin/env node
/**
 * Automated CI curriculum validator for `supabase-b1-b2/content/curriculum/*.json`.
 *
 * Checks:
 *  1. Strict Zod schema conformance (course.json + weeks-*.json)
 *  2. 16 weeks × 7 days (Mon–Sun) = 112 daily sessions
 *  3. Core vocabulary count 128–160 with unique terms, example, >=1 collocation, en-GB audioRef
 *  4. 16 listening tracks (30–65 min total) with transcripts, accent, speaker_accents, audioRef
 *  5. 16 reading texts (3,600–5,200 words total) matching Month 1–4 word-count ladders
 *  6. Every grammar item & comprehension question has an answer present in options
 *  7. Week 1 bundled MP3 references exist on disk under public/audio/
 *  8. Checkpoints cover Weeks 4, 8, 12, 16
 *  9. British-English spelling guard & unedited placeholder guard
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-curriculum.mjs
 */

import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CourseDocSchema, ModulesDocSchema } from '../lib/b1b2/curriculum-schema.ts';

const contentDir = path.join(process.cwd(), 'supabase-b1-b2/content/curriculum');

const US_SPELLING_REGEX =
  /\b(color|colors|favorite|favor|favors|organize|organized|organizing|realize|realized|realizing|center|centers|traveler|travelers|traveling|traveled|defense|offense|labor|behavior|neighbor|program|programs)\b/gi;

const PHASE_LADDERS = [
  { weeks: [1, 2, 3, 4], listenMin: 110, listenMax: 140, readMin: 150, readMax: 215, speakMin: 45, speakMax: 65, writeMin: 120, writeMax: 150 },
  { weeks: [5, 6, 7, 8], listenMin: 135, listenMax: 180, readMin: 200, readMax: 300, speakMin: 115, speakMax: 135, writeMin: 150, writeMax: 180 },
  { weeks: [9, 10, 11, 12], listenMin: 165, listenMax: 200, readMin: 240, readMax: 300, speakMin: 165, speakMax: 195, writeMin: 180, writeMax: 200 },
  { weeks: [13, 14, 15, 16], listenMin: 195, listenMax: 250, readMin: 250, readMax: 350, speakMin: 175, speakMax: 195, writeMin: 200, writeMax: 220 },
];

function getPhaseLadder(weekNumber) {
  return PHASE_LADDERS.find((p) => p.weeks.includes(weekNumber));
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const courseRaw = JSON.parse(await readFile(path.join(contentDir, 'course.json'), 'utf8'));
  const courseDoc = CourseDocSchema.parse(courseRaw);

  const checkpointModules = new Set(courseDoc.checkpoints.map((c) => c.module));
  for (const requiredWeek of [4, 8, 12, 16]) {
    if (!checkpointModules.has(requiredWeek)) {
      throw new Error(`course.json checkpoints missing tie-in for Week ${requiredWeek}`);
    }
  }

  const weekFiles = (await readdir(contentDir))
    .filter((f) => /^weeks-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  if (weekFiles.length === 0) {
    throw new Error('No weeks-XX-YY.json files found in supabase-b1-b2/content/curriculum');
  }

  const seenWeeks = new Set();
  const seenVocab = new Map();
  let totalLessons = 0;
  let totalVocab = 0;
  let totalGrammarItems = 0;
  let totalQuestions = 0;
  let totalListeningSeconds = 0;
  let totalReadingWords = 0;
  const bundledAudioMissing = [];
  const spellingIssues = [];

  for (const file of weekFiles) {
    const raw = JSON.parse(await readFile(path.join(contentDir, file), 'utf8'));
    const doc = ModulesDocSchema.parse(raw);

    for (const week of doc.modules) {
      if (seenWeeks.has(week.number)) {
        throw new Error(`Duplicate week number ${week.number} across curriculum files`);
      }
      seenWeeks.add(week.number);

      totalLessons += week.lessons.length;
      totalVocab += week.vocab.length;
      for (const v of week.vocab) {
        const key = v.term.toLowerCase();
        if (seenVocab.has(key)) {
          throw new Error(`Duplicate vocab term "${v.term}" in Week ${seenVocab.get(key)} and Week ${week.number}`);
        }
        seenVocab.set(key, week.number);
      }

      totalGrammarItems += week.grammar.reduce((n, g) => n + g.items.length, 0);
      totalQuestions += week.inputs.reduce((n, i) => n + i.questions.length, 0);

      // Monday vocabPack check (collocations, word families, linking expressions across all 16 weeks)
      if (!week.vocabPack) {
        throw new Error(`Week ${week.number} is missing vocabPack`);
      }
      const minCollocations = week.number >= 5 ? 5 : 4;
      if (week.vocabPack.collocations.length < minCollocations || week.vocabPack.collocations.length > 8) {
        throw new Error(
          `Week ${week.number} vocabPack.collocations length (${week.vocabPack.collocations.length}) outside ${minCollocations}–8`,
        );
      }
      if (week.vocabPack.wordFamilies.length < 2) {
        throw new Error(`Week ${week.number} vocabPack.wordFamilies must have at least 2 entries`);
      }
      const minLinkers = week.number >= 5 ? 2 : 1;
      if (week.vocabPack.linkingExpressions.length < minLinkers) {
        throw new Error(`Week ${week.number} vocabPack.linkingExpressions must have at least ${minLinkers} entries`);
      }

      // Main + light grammar check (Weeks 1-15) vs Week 16 personal error-log review
      if (week.number <= 15 && !week.lightGrammar) {
        throw new Error(`Week ${week.number} is missing lightGrammar`);
      }
      if (week.number === 16 && week.lightGrammar) {
        throw new Error('Week 16 must have lightGrammar: null (uses personal error log)');
      }

      // Per-phase skill ladder checks
      const ladder = getPhaseLadder(week.number);
      if (!ladder) {
        throw new Error(`No phase ladder configured for Week ${week.number}`);
      }
      if (week.writing.wordMin !== ladder.writeMin || week.writing.wordMax !== ladder.writeMax) {
        throw new Error(
          `Week ${week.number} writing range ${week.writing.wordMin}-${week.writing.wordMax} does not match phase target ${ladder.writeMin}-${ladder.writeMax}`,
        );
      }
      const primarySpeaking = week.speaking[0];
      if (!primarySpeaking || primarySpeaking.seconds < ladder.speakMin || primarySpeaking.seconds > ladder.speakMax) {
        throw new Error(
          `Week ${week.number} speaking seconds ${primarySpeaking?.seconds} outside phase target ${ladder.speakMin}-${ladder.speakMax}`,
        );
      }

      for (const inp of week.inputs) {
        if (inp.kind === 'listening' && inp.seconds) {
          totalListeningSeconds += inp.seconds;
          if (inp.seconds < ladder.listenMin || inp.seconds > ladder.listenMax) {
            throw new Error(
              `Week ${week.number} listening duration ${inp.seconds}s outside phase target ${ladder.listenMin}-${ladder.listenMax}s`,
            );
          }
        }
        if (inp.kind === 'reading') {
          const words = inp.body.trim().split(/\s+/).length;
          totalReadingWords += words;
          if (words < ladder.readMin || words > ladder.readMax) {
            throw new Error(
              `Week ${week.number} reading length ${words}w outside phase target ${ladder.readMin}-${ladder.readMax}w`,
            );
          }
        }
      }

      // Guard against unedited template strings
      const serialized = JSON.stringify(week);
      if (/\bREPLACE:/i.test(serialized)) {
        throw new Error(`Week ${week.number} still contains unedited REPLACE: template markers`);
      }

      // Check British English spelling in non-American prose
      const proseChunks = [
        week.summary,
        ...week.grammar.flatMap((g) => [g.explanation, g.example, ...g.keyPoints]),
        ...week.vocab.flatMap((v) => [v.definition, v.example]),
        ...week.vocabPack.collocations.flatMap((c) => [c.phrase, c.example]),
        ...week.vocabPack.wordFamilies.map((wf) => wf.example),
        ...week.vocabPack.linkingExpressions.flatMap((le) => [le.expression, le.example]),
        ...week.inputs
          .filter((i) => !/\bAmerican\b/i.test(i.accent ?? ''))
          .map((i) => i.body),
        week.writing.prompt,
      ];
      for (const chunk of proseChunks) {
        const hits = [...chunk.matchAll(US_SPELLING_REGEX)].map((m) => m[0]);
        if (hits.length) {
          spellingIssues.push(`Week ${week.number}: ${[...new Set(hits)].join(', ')}`);
        }
      }

      // Verify Week 1 bundled MP3s exist on disk
      if (week.number === 1) {
        for (const inp of week.inputs) {
          if (inp.audioStatus === 'bundled' && inp.audioRef) {
            const diskPath = path.join(process.cwd(), 'public/audio', inp.audioRef);
            if (!(await fileExists(diskPath))) {
              bundledAudioMissing.push(inp.audioRef);
            }
          }
        }
      }
    }
  }

  for (let w = 1; w <= 16; w++) {
    if (!seenWeeks.has(w)) {
      throw new Error(`Missing Week ${w} in curriculum JSON files`);
    }
  }

  if (totalVocab < 128 || totalVocab > 160) {
    throw new Error(`Core vocabulary total ${totalVocab} is outside the 128–160 syllabus target`);
  }

  const listenMinutes = totalListeningSeconds / 60;
  if (listenMinutes < 30 || listenMinutes > 65) {
    throw new Error(`Total listening duration ${listenMinutes.toFixed(1)}m is outside 30–65m target`);
  }

  if (totalReadingWords < 3600 || totalReadingWords > 5200) {
    throw new Error(`Total reading words ${totalReadingWords} is outside 3,600–5,200 target`);
  }

  if (bundledAudioMissing.length) {
    throw new Error(`Missing bundled Week 1 audio files: ${bundledAudioMissing.join(', ')}`);
  }

  if (spellingIssues.length) {
    throw new Error(`Unexpected US spelling in British-authored curriculum prose:\n${spellingIssues.join('\n')}`);
  }

  console.log(
    `Curriculum validation passed: ${seenWeeks.size} weeks, ${totalLessons} daily sessions, ` +
      `${totalVocab} unique vocab items, ${totalGrammarItems} grammar items, ${totalQuestions} input questions, ` +
      `${listenMinutes.toFixed(1)} min listening, ${totalReadingWords} reading words.`,
  );
}

main().catch((err) => {
  console.error('Curriculum validation failed:', err);
  process.exit(1);
});
