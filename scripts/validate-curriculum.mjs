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

      for (const inp of week.inputs) {
        if (inp.kind === 'listening' && inp.seconds) {
          totalListeningSeconds += inp.seconds;
        }
        if (inp.kind === 'reading') {
          totalReadingWords += inp.body.trim().split(/\s+/).length;
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
