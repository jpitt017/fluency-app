/**
 * Weeks 1–4 listening pipeline: script -> per-speaker AI trial audio -> MP3 +
 * WebVTT -> private review bucket, unreleased.
 *
 * Split out of scripts/generate-course-audio.mjs so the flow can be tested with
 * fakes. The CLI wrapper reads the authored scripts from
 * supabase-b1-b2/content/curriculum/weeks-01-04-details.json.
 *
 * Three entry points, in the order they are used:
 *   generateVoiceCheck   a few real lines per speaker, at the course pace and
 *                        with that speaker's settings, uploaded for a listen
 *   generateListeningTrial   the whole week (only after the voices are approved)
 *   publishReleasedTrial   copy the reviewed MP3/VTT to the public bucket
 *
 * A track is synthesised one sentence at a time (see `buildUtterances` in
 * ./tts.mjs) so that the 0.5 s / 0.7 s / 1.0 s pauses land on sentence, speaker
 * and paragraph boundaries, and each caption cue is one sentence.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  B1_SPEECH_RATE,
  DEFAULT_PACE,
  SPEAKER_VOICES,
  TTS_MODEL,
  assembleTrack,
  assertDistinctVoices,
  buildTrackVtt,
  buildUtterances,
  countWords,
  rateForSpeaker,
  encodeMp3,
  splitSentences,
  stripSpeakerPrefix,
  parseScript,
  pauseSecondsFor,
  pcmDurationSeconds,
  pcmToWav,
  resolvePace,
  scheduleTrack,
  silence,
  synthesiseTurn,
  voiceSettingsFor,
  wordsPerMinute,
} from './tts.mjs';
import {
  downloadFromReview,
  publishToPublicBucket,
  recordUnreleasedTrial,
  reviewObjectKeys,
  uploadToBucket,
} from './publish.mjs';
import { DEFAULT_REVIEW_BUCKET, TRIAL_PREFIX, AUDIO_BUCKET } from './delete-guard.mjs';

export const DEFAULT_CURRICULUM = 'supabase-b1-b2/content/curriculum/weeks-01-04-details.json';

/**
 * The course pace's default rate, for callers that do not pass one.
 * Kept named so the CLI can print it without importing PACE_PROFILES.
 */
export const COURSE_RATE = B1_SPEECH_RATE;

export function listeningTrialAudioKey(week) {
  return `${TRIAL_PREFIX}week-${week}-listening.mp3`;
}

export function listeningTrialCaptionsKey(week) {
  return `${TRIAL_PREFIX}week-${week}-listening.vtt`;
}

/** The single voice of a one-person script (Week 4) is the guide. */
export function defaultSpeakerFor(weekSpec) {
  if (/joanne/i.test(weekSpec.speakers ?? '')) return 'Joanne';
  const first = Object.keys(SPEAKER_VOICES).find((name) => new RegExp(`\\b${name}\\b`, 'i').test(weekSpec.speakers ?? ''));
  if (!first) throw new Error(`Week ${weekSpec.week} lists no known speaker: ${weekSpec.speakers}`);
  return first;
}

export async function readListeningWeeks(file = DEFAULT_CURRICULUM) {
  const document = JSON.parse(await readFile(file, 'utf8'));
  const weeks = document?.listening?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) {
    throw new Error(`No listening weeks found in ${file}`);
  }
  return weeks;
}

/**
 * The longest spoken line of one speaker in a week: the read with the most words
 * to judge a voice's warmth and energy on. Ties keep the earlier line, so the
 * choice is stable between runs.
 *
 * @returns {{speaker: string, text: string, words: number, lineIndex: number}|null}
 */
export function longestLineFor(weekSpec, speaker) {
  const lines = parseScript(weekSpec.script, defaultSpeakerFor(weekSpec));
  let best = null;
  for (const line of lines) {
    if (line.speaker !== speaker) continue;
    const words = countWords(line.text);
    if (!best || words > best.words) {
      best = { speaker, text: line.text, words, lineIndex: line.index };
    }
  }
  return best;
}

/**
 * The voice check: the lines a listening review asks for by name, read at the
 * course pace with each speaker's own settings, so what is approved is exactly
 * what the track will use.
 *
 * One MP3 per request, each line verbatim:
 *
 *   tom-two-lines.mp3       Tom's first two Week 2 lines
 *   marta-three-turns.mp3   Marta's three longest Week 3 turns
 *   ellie-longest.mp3       Ellie's longest Week 1 answer
 *
 * Three speakers, one per week that changed or that carries the new pace, so a
 * single listen covers the two replaced voices and the shorter sentence gaps.
 * Nothing here touches a track or an approval row.
 */
export function voiceCheckScript(weekSpecs) {
  const week = (number) => weekSpecs.find((spec) => spec.week === number);
  const week1 = week(1);
  const week2 = week(2);
  const week3 = week(3);
  const week4 = week(4);
  if (!week1 || !week2 || !week3 || !week4) {
    throw new Error('The voice check reads Weeks 1-4; all four scripts must be present');
  }

  const toLine = (line) => ({
    speaker: line.speaker,
    text: line.text,
    words: countWords(line.text),
    lineIndex: line.index,
  });

  // Marta's three *longest* turns: her short interjections ("Ha! OK.") are not a
  // fair read of a voice, and the order is script order so the clip flows.
  const martaTurns = parseScript(week3.script, defaultSpeakerFor(week3))
    .filter((line) => line.speaker === 'Marta')
    .sort((a, b) => countWords(b.text) - countWords(a.text) || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map(toLine);

  const tomTwo = parseScript(week2.script, defaultSpeakerFor(week2))
    .filter((line) => line.speaker === 'Tom')
    .slice(0, 2)
    .map(toLine);

  return {
    speakers: [...new Set([...tomTwo, ...martaTurns].map((line) => line.speaker))],
    clips: [
      { key: 'tom-two-lines', title: "Tom's first two Week 2 lines", lines: tomTwo },
      { key: 'marta-three-turns', title: "Marta's three longest Week 3 turns", lines: martaTurns },
      { key: 'ellie-longest', title: "Ellie's longest Week 1 answer", lines: [longestLineFor(week1, 'Ellie')] },
    ],
  };
}

/**
 * Synthesises a set of lines as one continuous clip, sentence by sentence with
 * the course pauses, and uploads it to the private review bucket.
 *
 * Returns the clip with its words, length and words per minute, so a review can
 * report the pace of each clip instead of guessing it.
 */
export async function generateClip(options) {
  const {
    key,
    lines,
    title,
    outputDir,
    apiKey,
    client = null,
    upload = false,
    pace = DEFAULT_PACE,
    encoder = encodeMp3,
    prefix = '',
    log = () => {},
  } = options;
  const resolved = resolvePace(pace);
  await mkdir(outputDir, { recursive: true });

  const turns = [];
  for (const [linePosition, line] of lines.entries()) {
    if (!SPEAKER_VOICES[line.speaker]) throw new Error(`No voice configured for speaker "${line.speaker}"`);
    const planned = planUtterances({ ...line, text: stripSpeakerPrefix(line.text) }, line.speaker);
    for (const utterance of planned) {
      // A sampled line is one authored turn, so the first sentence of every line
      // after the first starts on a turn boundary: the same gap the track would
      // put before it. Without this, sampled lines would be spliced together
      // with no silence at all and the clip would report a pace it does not have.
      if (linePosition > 0 && utterance.boundary === 'none') utterance.boundary = 'paragraph';
      log(`    ${utterance.speaker}: "${utterance.text.slice(0, 48)}${utterance.text.length > 48 ? '…' : ''}"`);
      const turn = await synthesiseTurn({
        speaker: utterance.speaker,
        text: utterance.text,
        apiKey,
        rate: rateForSpeaker(utterance.speaker, resolved),
        fetchImpl: options.fetchImpl,
        log,
      });
      turns.push({ ...turn, boundary: utterance.boundary, words: utterance.words });
    }
  }
  const timing = scheduleTrack(turns, { pace: resolved });
  const wav = pcmToWav(assembleTrack(turns, resolved));
  const mp3Path = path.join(outputDir, `${prefix}${key}.mp3`);
  await encoder(wav, mp3Path);
  if (upload) {
    if (!client) throw new Error('Uploading a clip needs a Supabase service-role client');
    await uploadToBucket(client, {
      bucket: DEFAULT_REVIEW_BUCKET,
      key: `${TRIAL_PREFIX}${key}.mp3`,
      contentType: 'audio/mpeg',
      body: await readFile(mp3Path),
    });
  }
  const words = turns.reduce((total, turn) => total + turn.words, 0);
  const durationSeconds = Number(timing.durationSeconds.toFixed(2));
  return {
    key: `${TRIAL_PREFIX}${key}.mp3`,
    title,
    speaker: lines[0]?.speaker ?? null,
    speakers: [...new Set(lines.map((line) => line.speaker))],
    lines,
    words,
    durationSeconds,
    speechSeconds: Number(timing.speechSeconds.toFixed(2)),
    wordsPerMinute: wordsPerMinute(words, durationSeconds),
    mp3Path,
    settings: voiceSettingsFor(lines[0].speaker, resolved.speed),
    pace: resolved,
  };
}

/**
 * The utterances for one authored line, as if it were read on its own: the
 * first sentence has no gap before it, the rest use the sentence pause. A clip
 * made of several lines is built line by line so that a sentence gap and a
 * speaker gap are never confused; the caller re-tags each later line's first
 * sentence as a paragraph start, so sampled turns keep a real gap between them.
 */
function planUtterances(line, speaker) {
  const sentences = splitSentences(line.text);
  return sentences.map((text, position) => ({
    speaker,
    text,
    boundary: position === 0 ? 'none' : 'sentence',
    lineIndex: line.lineIndex ?? 0,
    sentenceIndex: position + 1,
    sentenceCount: sentences.length,
    words: countWords(text),
  }));
}

/**
 * Auditions the seven voices on real lines from the weeks they speak in. One MP3
 * per speaker plus the named step clips; nothing is released and no approval row
 * is touched.
 */
export async function generateVoiceCheck(options) {
  const { outputDir, apiKey, client = null, upload = false, pace = DEFAULT_PACE, log = () => {} } = options;
  const specs = options.weekSpecs ?? (await readListeningWeeks(options.curriculum));
  const plan = voiceCheckScript(specs);
  // A single named clip can be re-recorded on its own: when one character's
  // settings change, re-synthesising the other eleven clips would spend the
  // ElevenLabs quota to produce audio nobody asked to hear again.
  const only = options.onlyKeys ?? null;
  const entries = only ? plan.clips.filter((entry) => only.includes(entry.key)) : plan.clips;
  const clips = [];
  for (const entry of entries) {
    log(`  ${entry.title}`);
    clips.push(
      await generateClip({
        ...entry,
        outputDir,
        apiKey,
        client,
        upload,
        pace,
        encoder: options.encoder,
        fetchImpl: options.fetchImpl,
        log,
      }),
    );
  }
  // An unknown name would otherwise produce an empty run that looks like success.
  // A clip's `key` is its storage path, so compare on the name inside it.
  if (only) {
    const produced = new Set(clips.map((clip) => path.basename(clip.key, '.mp3')));
    const missing = only.filter((key) => !produced.has(key));
    if (missing.length) throw new Error(`No voice-check clip named ${missing.join(', ')}`);
  }
  return clips;
}

/**
 * The Week 3 sample: the three requested lines, read by the two flatmates at
 * the course pace, as one clip per speaker so the pair can be compared side by
 * side.
 */
export function week3SampleLines(weekSpec, perSpeaker = 3) {
  const authored = parseScript(weekSpec.script, defaultSpeakerFor(weekSpec));
  const result = {};
  for (const speaker of ['Dan', 'Marta']) {
    const own = authored.filter((line) => line.speaker === speaker);
    if (!own.length) throw new Error(`Week ${weekSpec.week} has no lines for ${speaker}`);
    const chosen = speechyLines(own, perSpeaker);
    result[speaker] = chosen.map((line) => ({ speaker, text: line.text, words: countWords(line.text), lineIndex: line.index }));
  }
  return result;
}

/**
 * The `perSpeaker` longest lines, in script order: an interjection like "Ha! OK."
 * is a poor second of audio to judge a voice on.
 */
function speechyLines(lines, count) {
  return [...lines]
    .sort((a, b) => countWords(b.text) - countWords(a.text) || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index);
}

/**
 * Runs one week: synthesises every line with its own voice, joins the lines with
 * short pauses, writes the MP3 and WebVTT, and (unless this is a dry run)
 * uploads both to the private review bucket and records an unreleased trial row.
 */
export async function generateListeningTrial(options) {
  const {
    weekSpec,
    outputDir,
    apiKey,
    client = null,
    upload = false,
    pace = options.rate != null ? { ...resolvePace(DEFAULT_PACE), speed: options.rate } : DEFAULT_PACE,
    model = TTS_MODEL,
    encoder = encodeMp3,
    reviewBucket = DEFAULT_REVIEW_BUCKET,
    log = () => {},
  } = options;
  const resolved = resolvePace(pace);

  const speakerFallback = defaultSpeakerFor(weekSpec);
  const lines = parseScript(weekSpec.script, speakerFallback);
  if (!lines.length) throw new Error(`Week ${weekSpec.week} has an empty listening script`);
  assertDistinctVoices(lines);

  // One request per sentence: that is the only way the 0.5 s sentence pause can
  // sit inside a line and the 0.7 s speaker pause between turns.
  const utterances = buildUtterances(lines);
  const turns = [];
  for (const utterance of utterances) {
    log(`  ${utterance.sentenceIndex}/${utterance.sentenceCount} line ${utterance.lineIndex} ${utterance.speaker}`);
    const turn = await synthesiseTurn({
      speaker: utterance.speaker,
      text: utterance.text,
      apiKey,
      rate: rateForSpeaker(utterance.speaker, resolved),
      fetchImpl: options.fetchImpl,
      log,
    });
    turns.push({ ...turn, ...utterance });
  }

  const timing = scheduleTrack(turns, { pace: resolved });
  const pcm = assembleTrack(turns, resolved);
  const wav = pcmToWav(pcm);
  const vtt = buildTrackVtt(timing);
  const words = utterances.reduce((total, utterance) => total + utterance.words, 0);
  const durationSeconds = Number(timing.durationSeconds.toFixed(2));

  const mp3Path = path.join(outputDir, `week-${weekSpec.week}-listening.mp3`);
  const vttPath = path.join(outputDir, `week-${weekSpec.week}-listening.vtt`);
  await writeFile(vttPath, vtt, 'utf8');

  const result = {
    week: weekSpec.week,
    title: weekSpec.title,
    speakers: lines.map((line) => line.speaker).filter((name, position, all) => all.indexOf(name) === position),
    voices: Object.fromEntries(lines.map((line) => [line.speaker, SPEAKER_VOICES[line.speaker].voice])),
    lines: lines.length,
    sentences: utterances.length,
    words,
    cues: timing.cues.length,
    durationSeconds,
    speechSeconds: Number(timing.speechSeconds.toFixed(2)),
    wordsPerMinute: wordsPerMinute(words, durationSeconds),
    speakingWordsPerMinute: wordsPerMinute(words, timing.speechSeconds),
    mp3Path,
    vttPath,
    audioKey: listeningTrialAudioKey(weekSpec.week),
    captionsKey: listeningTrialCaptionsKey(weekSpec.week),
    reviewBucket,
    model,
    rate: resolved.speed,
    rates: Object.fromEntries(
      [...new Set(lines.map((line) => line.speaker))].map((speaker) => [speaker, rateForSpeaker(speaker, resolved)]),
    ),
    pace: resolved,
    settings: Object.fromEntries(
      [...new Set(lines.map((line) => line.speaker))].map((speaker) => [speaker, voiceSettingsFor(speaker, resolved.speed)]),
    ),
    uploaded: false,
    audioUrl: null,
    captionsUrl: null,
  };

  if (upload) {
    if (!client) throw new Error('Uploading needs a Supabase service-role client');
    // Encode before uploading: the MP3 is the artefact that must exist.
    await encoder(wav, mp3Path);
    const mp3 = await readFile(mp3Path);
    const captions = Buffer.from(vtt, 'utf8');
    await uploadToBucket(client, { bucket: reviewBucket, key: result.audioKey, contentType: 'audio/mpeg', body: mp3 });
    await uploadToBucket(client, {
      bucket: reviewBucket,
      key: result.captionsKey,
      contentType: 'text/vtt',
      body: captions,
    });
    await recordUnreleasedTrial({
      week: weekSpec.week,
      client,
      model,
      voices: result.voices,
      durationSeconds: result.durationSeconds,
      captionCues: result.cues,
      generatedAt: new Date().toISOString(),
    });
    result.uploaded = true;
  } else {
    await encoder(wav, mp3Path);
  }

  return result;
}

/**
 * Copies a reviewed week from the private review bucket to the public bucket.
 *
 * The approval row still says unreleased after this, so a copy on its own does
 * not make the track playable: `--release` sets the URL. Returns the public URLs
 * for that step.
 */
export async function publishReleasedTrial(client, week, bucket = DEFAULT_REVIEW_BUCKET) {
  const [audioKey, captionsKey] = reviewObjectKeys(week);
  const audio = await downloadFromReview(client, audioKey, bucket);
  let captions = null;
  try {
    captions = await downloadFromReview(client, captionsKey, bucket);
  } catch {
    // Captions are optional: a track can ship without them.
    captions = null;
  }
  return publishToPublicBucket(client, week, { audio, captions });
}

/**
 * How fast the voices actually read at speed 1.0, in words a minute.
 *
 * Not a guess: the 2026-11-22 trial ran at speed 0.9 and its MP3s came out at
 * 168-182 words a minute *including* the old pauses, which means roughly
 * 180-205 wpm of speech once the gaps are taken out. 200 sits in the middle.
 * The number is only used by --dry-run; a real run reports the wpm it measured
 * from the audio.
 */
export const SPEAKING_WPM_AT_SPEED_1 = 200;

/**
 * Rough length and pace before anything is synthesised, used by --dry-run.
 *
 * Speech is estimated at `SPEAKING_WPM_AT_SPEED_1` scaled by the pace's speed,
 * and every pause is added exactly as the real timeline adds it. It is an
 * estimate: the wpm reported after a real run is measured, not predicted.
 */
export function estimateDurationSeconds(lines, pace = DEFAULT_PACE) {
  const resolved = resolvePace(pace);
  const utterances = buildUtterances(lines);
  let speech = 0;
  let total = 0;
  for (const utterance of utterances) {
    total += pauseSecondsFor(utterance.boundary, resolved);
    // A character may carry their own speed, so the estimate follows the rate
    // the voice will actually be spoken at, not the profile's.
    const wordsPerSecond = (SPEAKING_WPM_AT_SPEED_1 * rateForSpeaker(utterance.speaker, resolved)) / 60;
    const seconds = utterance.words / wordsPerSecond;
    speech += seconds;
    total += seconds;
  }
  return { seconds: total, speechSeconds: speech, words: utterances.reduce((sum, item) => sum + item.words, 0) };
}

export { AUDIO_BUCKET, DEFAULT_REVIEW_BUCKET, SPEAKER_VOICES, TTS_MODEL, pcmDurationSeconds, silence };
