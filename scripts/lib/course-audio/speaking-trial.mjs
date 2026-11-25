/**
 * Speaking model clips for Weeks 1–4. Generation stores files only in the
 * private review bucket; it does not create approval rows or public URLs.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SPEAKER_VOICES,
  TTS_MODEL,
  encodeMp3,
  pcmToWav,
  resolvePace,
  silence,
  synthesiseTurn,
  wordsPerMinute,
  countWords,
} from './tts.mjs';
import { DEFAULT_REVIEW_BUCKET, TRIAL_PREFIX } from './delete-guard.mjs';
import { downloadFromReview, uploadToBucket } from './publish.mjs';

export const SPEAKING_CURRICULUM = 'supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
export const SPEAKING_PAUSE_SECONDS = 0.5;
export const SPEAKING_WEEK_SPEAKERS = Object.freeze({ 1: 'Aisha', 2: 'Host', 3: 'Aisha', 4: 'Host' });

export function speakingClipKey(week, kind, index = null) {
  if (![1, 2, 3, 4].includes(week)) throw new Error(`Refusing speaking audio for week ${week}`);
  if (kind === 'model') return `${TRIAL_PREFIX}speaking-week-${week}-model.mp3`;
  if (kind === 'shadowing' && Number.isInteger(index) && index >= 1 && index <= 3) {
    return `${TRIAL_PREFIX}speaking-week-${week}-shadowing-${index}.mp3`;
  }
  throw new Error(`Refusing unknown speaking clip: week=${week}, kind=${kind}, index=${index}`);
}

/** Returns authored clip text and voice assignments for every week. */
export async function readSpeakingClipSpecs(curriculum = SPEAKING_CURRICULUM) {
  const document = JSON.parse(await readFile(curriculum, 'utf8'));
  const weeks = document?.weeks;
  if (!Array.isArray(weeks)) throw new Error(`No speaking weeks found in ${curriculum}`);
  return [1, 2, 3, 4].flatMap((weekNumber) => {
    const week = weeks.find((item) => item.number === weekNumber);
    const speaking = week?.speaking;
    if (!speaking?.model || !Array.isArray(speaking.shadowingChunks) || speaking.shadowingChunks.length < 3) {
      throw new Error(`Week ${weekNumber} needs a model answer and three shadowing chunks`);
    }
    const speaker = SPEAKING_WEEK_SPEAKERS[weekNumber];
    const modelText = speaking.model.replace(/^>\s*/, '').replace(/\s+/g, ' ').trim();
    return [
      { week: weekNumber, kind: 'model', index: null, speaker, title: `Week ${weekNumber} speaking model`, text: modelText },
      ...speaking.shadowingChunks.map((item, index) => ({
        week: weekNumber,
        kind: 'shadowing',
        index: index + 1,
        speaker,
        title: `Week ${weekNumber} shadowing chunk ${index + 1}`,
        text: item.chunk,
      })),
    ].map((clip) => ({ ...clip, key: speakingClipKey(weekNumber, clip.kind, clip.index) }));
  });
}

export async function generateSpeakingVoiceCheck(options) {
  const { outputDir, pace = 'b1', log = () => {} } = options;
  if (!options.apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
  const specs = (await readSpeakingClipSpecs(options.curriculum)).filter((clip) => clip.week === 1).slice(0, 3);
  if (specs.length !== 3) throw new Error('Week 1 speaking voice check needs its model and two shadowing chunks');
  await mkdir(outputDir, { recursive: true });
  const clips = [];
  for (const spec of specs) {
    log(`  ${spec.title} — ${spec.speaker}`);
    clips.push(await synthesizeClip(spec, { ...options, outputDir, pace, log }));
  }
  return clips;
}

async function synthesizeClip(spec, options) {
  const { apiKey, outputDir, pace = 'b1', fetchImpl, encoder = encodeMp3, log = () => {} } = options;
  const resolvedPace = resolvePace(pace);
  if (!SPEAKER_VOICES[spec.speaker]) throw new Error(`No voice configured for speaker "${spec.speaker}"`);
  const turn = await synthesiseTurn({
    speaker: spec.speaker,
    text: spec.text,
    apiKey,
    rate: resolvedPace.speed,
    fetchImpl,
    log,
  });
  const pcm = Buffer.concat([
    silence(SPEAKING_PAUSE_SECONDS),
    turn.pcm,
    silence(SPEAKING_PAUSE_SECONDS),
  ]);
  const mp3Path = path.join(outputDir, path.basename(spec.key));
  await encoder(pcmToWav(pcm), mp3Path);
  const words = countWords(spec.text);
  const speechSeconds = turn.pcm.length / (2 * 24_000);
  const durationSeconds = pcm.length / (2 * 24_000);
  return {
    ...spec,
    voice: SPEAKER_VOICES[spec.speaker].name,
    voiceId: SPEAKER_VOICES[spec.speaker].voice,
    model: TTS_MODEL,
    pace: resolvedPace.speed,
    words,
    speechSeconds: Number(speechSeconds.toFixed(2)),
    durationSeconds: Number(durationSeconds.toFixed(2)),
    wordsPerMinute: wordsPerMinute(words, durationSeconds),
    speakingWordsPerMinute: wordsPerMinute(words, speechSeconds),
    leadingAndTrailingSilenceSeconds: SPEAKING_PAUSE_SECONDS,
    mp3Path,
  };
}

/** Generate all 16 clips; the private bucket is the only Storage destination. */
export async function generateSpeakingTrials(options) {
  const { apiKey, outputDir, client, curriculum = SPEAKING_CURRICULUM, pace = 'b1', log = () => {} } = options;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
  if (!client) throw new Error('Generating speaking trials requires a Supabase client for private review upload');
  const specs = await readSpeakingClipSpecs(curriculum);
  await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const spec of specs) {
    log(`  ${spec.title} — ${spec.speaker}`);
    const result = await synthesizeClip(spec, { ...options, pace });
    const body = await readFile(result.mp3Path);
    await uploadToBucket(client, {
      bucket: DEFAULT_REVIEW_BUCKET,
      key: result.key,
      contentType: 'audio/mpeg',
      body,
    });
    results.push(result);
  }
  return results;
}

/** Copy one reviewed week's four clips from private review to the public bucket. */
export async function publishSpeakingWeek(client, week, log = () => {}) {
  const clips = [
    speakingClipKey(week, 'model'),
    ...[1, 2, 3].map((index) => speakingClipKey(week, 'shadowing', index)),
  ];
  for (const key of clips) {
    const audio = await downloadFromReview(client, key, DEFAULT_REVIEW_BUCKET);
    await uploadToBucket(client, {
      bucket: 'course-audio',
      key,
      contentType: 'audio/mpeg',
      body: audio,
    });
    log(`  copied ${key} to course-audio`);
  }
  return clips;
}
