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
  encodeMp3,
  splitSentences,
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

/** The speaker named in the first line of a week's script. */
function firstSpeaker(weekSpec) {
  return parseScript(weekSpec.script, defaultSpeakerFor(weekSpec))[0]?.speaker ?? null;
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

/** The authored line that starts with `prefix`, verbatim (first match). */
export function lineStartingWith(weekSpec, speaker, prefix) {
  const lines = parseScript(weekSpec.script, defaultSpeakerFor(weekSpec));
  const line = lines.find((item) => item.speaker === speaker && item.text.startsWith(prefix));
  if (!line) throw new Error(`Week ${weekSpec.week} has no ${speaker} line starting "${prefix}"`);
  return { speaker, text: line.text, words: countWords(line.text), lineIndex: line.index };
}

/**
 * The opening block of a week's script: every authored paragraph up to the
 * first blank line. Week 4 is a monologue whose opening block is the guide's
 * greeting and the Minster stop.
 */
export function openingBlock(weekSpec) {
  const blocks = String(weekSpec.script).split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const speaker = firstSpeaker(weekSpec);
  return { speaker, text: blocks[0], words: countWords(blocks[0].replace(/^[A-Z][A-Za-z]+:\s*/, '')) };
}

/**
 * The speakers of every week that has an authored script, in week order.
 * `--voice-check` reads this: a review of all four weeks needs every voice that
 * actually speaks, which is all seven.
 */
export function allSpeakers(weekSpecs) {
  const seen = [];
  for (const spec of weekSpecs) {
    for (const line of parseScript(spec.script, defaultSpeakerFor(spec))) {
      if (line.speaker && !seen.includes(line.speaker)) seen.push(line.speaker);
    }
  }
  return seen;
}

/**
 * The voice check: a few *real* lines per speaker, at the course pace and with
 * that speaker's own settings, so the voice a reviewer approves is the voice the
 * track will use.
 *
 * Every speaker gets one or more lines; the clip is their lines joined as one
 * continuous read, one MP3 per speaker:
 *
 *   voice-check-<Speaker>.mp3   one clip per speaker, every line they read
 *   ellie-longest.mp3           Ellie's longest Week 1 answer
 *   tom-two-lines.mp3           Tom's first two Week 2 lines
 *   aisha-oh-thats-great.mp3    Aisha's "Oh, that's great" line from Week 2
 *   week-3-three-lines.mp3      Marta's three longest Week 3 turns, then Dan's
 *   joanne-opening.mp3          Joanne's opening paragraph of Week 4
 *
 * The step clips are what a listening review asks for by name; the per-speaker
 * clip is there so no voice is left unheard. Nothing here touches a track or an
 * approval row.
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

  // Week 3: the three longest Marta turns (her short interjections are not a
  // fair read of a voice), then Dan's first two lines so the pair is heard
  // together.
  const martaLongest = parseScript(week3.script, defaultSpeakerFor(week3))
    .filter((line) => line.speaker === 'Marta')
    .sort((a, b) => countWords(b.text) - countWords(a.text) || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((line) => ({ speaker: line.speaker, text: line.text, words: countWords(line.text), lineIndex: line.index }));
  const danFirstTwo = parseScript(week3.script, defaultSpeakerFor(week3))
    .filter((line) => line.speaker === 'Dan')
    .slice(0, 2)
    .map((line) => ({ speaker: line.speaker, text: line.text, words: countWords(line.text), lineIndex: line.index }));

  const named = [
    { key: 'ellie-longest', title: "Ellie's longest Week 1 answer", lines: [longestLineFor(week1, 'Ellie')] },
    { key: 'tom-two-lines', title: "Tom's first two Week 2 lines", lines: parseScript(week2.script, defaultSpeakerFor(week2)).filter((line) => line.speaker === 'Tom').slice(0, 2).map((line) => ({ speaker: line.speaker, text: line.text, words: countWords(line.text), lineIndex: line.index })) },
    { key: 'aisha-oh-thats-great', title: 'Aisha — "Oh, that\'s great"', lines: [lineStartingWith(week2, 'Aisha', "Oh, that's great")] },
    { key: 'week-3-three-lines', title: "Week 3: Marta's three longest turns, then Dan", lines: [...martaLongest, ...danFirstTwo] },
    { key: 'joanne-opening', title: "Joanne's opening paragraph of Week 4", lines: [openingBlock(week4)] },
  ];

  const speakers = allSpeakers(weekSpecs);
  const perSpeaker = speakers.map((speaker) => {
    const lines = [];
    for (const spec of weekSpecs) {
      for (const line of parseScript(spec.script, defaultSpeakerFor(spec))) {
        if (line.speaker === speaker) {
          lines.push({ speaker, text: line.text, words: countWords(line.text), lineIndex: line.index, week: spec.week });
        }
      }
    }
    return { key: `voice-check-${speaker}`, title: `${speaker} — every authored line`, speaker, lines };
  });

  return { speakers, named, perSpeaker };
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
  for (const line of lines) {
    if (!SPEAKER_VOICES[line.speaker]) throw new Error(`No voice configured for speaker "${line.speaker}"`);
    const planned = planUtterances(line, line.speaker);
    for (const utterance of planned) {
      log(`    ${utterance.speaker}: "${utterance.text.slice(0, 48)}${utterance.text.length > 48 ? '…' : ''}"`);
      const turn = await synthesiseTurn({
        speaker: utterance.speaker,
        text: utterance.text,
        apiKey,
        rate: resolved.speed,
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
 * speaker gap are never confused.
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
  const clips = [];
  for (const entry of plan.named) {
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
  for (const entry of plan.perSpeaker) {
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
      rate: resolved.speed,
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
  const wordsPerSecond = (SPEAKING_WPM_AT_SPEED_1 * resolved.speed) / 60;
  let speech = 0;
  let total = 0;
  for (const utterance of utterances) {
    total += pauseSecondsFor(utterance.boundary, resolved);
    const seconds = utterance.words / wordsPerSecond;
    speech += seconds;
    total += seconds;
  }
  return { seconds: total, speechSeconds: speech, words: utterances.reduce((sum, item) => sum + item.words, 0) };
}

export { AUDIO_BUCKET, DEFAULT_REVIEW_BUCKET, SPEAKER_VOICES, TTS_MODEL, pcmDurationSeconds, silence };
