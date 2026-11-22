/**
 * Weeks 1–4 listening pipeline: script -> per-speaker AI trial audio -> MP3 +
 * WebVTT -> private review bucket, unreleased.
 *
 * Split out of scripts/generate-course-audio.mjs so the flow can be tested with
 * fakes. The CLI wrapper reads the authored scripts from
 * supabase-b1-b2/content/curriculum/weeks-01-04-details.json.
 *
 * Three entry points, in the order they are used:
 *   generateVoiceCheck   one short line per speaker, uploaded for a listen
 *   generateListeningTrial   the whole week (only after the voices are approved)
 *   publishReleasedTrial   copy the reviewed MP3/VTT to the public bucket
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  B1_SPEECH_RATE,
  SPEAKER_VOICES,
  TTS_MODEL,
  assembleTrack,
  assertDistinctVoices,
  buildTrackVtt,
  encodeMp3,
  parseScript,
  pauseBeforeLine,
  pcmDurationSeconds,
  pcmToWav,
  scheduleTrack,
  silence,
  synthesiseTurn,
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
 * One line per speaker, used to audition the seven voices before a full week is
 * synthesised. Written for accent comparison: same words, same length, no
 * content a speaker has to act.
 */
export const VOICE_CHECK_LINE =
  'Right, so this is the voice check: a short, ordinary sentence read at the pace we would use for a B1 listening track.';

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
 * Auditions the voices: one clip per speaker, uploaded to the review bucket and
 * returned as signed links so a reviewer can compare accents side by side.
 * Nothing here touches a week's track or its approval row.
 */
export async function generateVoiceCheck(options) {
  const { outputDir, apiKey, client = null, upload = false, encoder = encodeMp3, log = () => {} } = options;
  const rate = options.rate ?? B1_SPEECH_RATE;
  const speakers = options.speakers ?? Object.keys(SPEAKER_VOICES);
  const results = [];
  await mkdir(outputDir, { recursive: true });

  for (const speaker of speakers) {
    if (!SPEAKER_VOICES[speaker]) throw new Error(`No voice configured for speaker "${speaker}"`);
    log(`  ${speaker} (${SPEAKER_VOICES[speaker].name}, ${SPEAKER_VOICES[speaker].accent})`);
    const turn = await synthesiseTurn({
      speaker,
      text: VOICE_CHECK_LINE,
      apiKey,
      rate,
      fetchImpl: options.fetchImpl,
      log,
    });
    const wav = pcmToWav(turn.pcm);
    const key = `${TRIAL_PREFIX}voice-check-${speaker}.mp3`;
    const mp3Path = path.join(outputDir, `voice-check-${speaker}.mp3`);
    await encoder(wav, mp3Path);
    const entry = {
      speaker,
      name: SPEAKER_VOICES[speaker].name,
      accent: SPEAKER_VOICES[speaker].accent,
      voice: SPEAKER_VOICES[speaker].voice,
      key,
      mp3Path,
      durationSeconds: Number(pcmDurationSeconds(turn.pcm).toFixed(2)),
      url: null,
    };
    if (upload) {
      if (!client) throw new Error('Uploading a voice check needs a Supabase service-role client');
      await uploadToBucket(client, {
        bucket: DEFAULT_REVIEW_BUCKET,
        key,
        contentType: 'audio/mpeg',
        body: await readFile(mp3Path),
      });
    }
    results.push(entry);
  }
  return results;
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
    rate = B1_SPEECH_RATE,
    model = TTS_MODEL,
    encoder = encodeMp3,
    reviewBucket = DEFAULT_REVIEW_BUCKET,
    log = () => {},
  } = options;

  const speakerFallback = defaultSpeakerFor(weekSpec);
  const lines = parseScript(weekSpec.script, speakerFallback);
  if (!lines.length) throw new Error(`Week ${weekSpec.week} has an empty listening script`);
  assertDistinctVoices(lines);

  const turns = [];
  for (const line of lines) {
    log(`  ${line.index}/${lines.length} ${line.speaker} (${SPEAKER_VOICES[line.speaker].voice})`);
    const turn = await synthesiseTurn({
      speaker: line.speaker,
      text: line.text,
      apiKey,
      rate,
      fetchImpl: options.fetchImpl,
      log,
    });
    turns.push({ ...turn, newParagraph: line.newParagraph, index: line.index });
  }

  const timing = scheduleTrack(turns, {
    lineIndexes: turns.map((turn) => turn.index),
    paragraphStarts: turns.map((turn) => turn.newParagraph),
  });
  const pcm = assembleTrack(turns);
  const wav = pcmToWav(pcm);
  const vtt = buildTrackVtt(timing);

  const mp3Path = path.join(outputDir, `week-${weekSpec.week}-listening.mp3`);
  const vttPath = path.join(outputDir, `week-${weekSpec.week}-listening.vtt`);
  await writeFile(vttPath, vtt, 'utf8');

  const result = {
    week: weekSpec.week,
    title: weekSpec.title,
    speakers: lines.map((line) => line.speaker).filter((name, position, all) => all.indexOf(name) === position),
    voices: Object.fromEntries(lines.map((line) => [line.speaker, SPEAKER_VOICES[line.speaker].voice])),
    lines: lines.length,
    cues: timing.cues.length,
    durationSeconds: Number(timing.durationSeconds.toFixed(2)),
    mp3Path,
    vttPath,
    audioKey: listeningTrialAudioKey(weekSpec.week),
    captionsKey: listeningTrialCaptionsKey(weekSpec.week),
    reviewBucket,
    model,
    rate,
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

/** Total length including the pauses, used by --dry-run. */
export function estimateDurationSeconds(lines, rate = B1_SPEECH_RATE) {
  const wordsPerSecond = (150 * rate) / 60;
  let total = 0;
  lines.forEach((line, position) => {
    total += pauseBeforeLine(position + 1, line.newParagraph);
    total += line.text.split(/\s+/).filter(Boolean).length / wordsPerSecond;
  });
  return total;
}

export { AUDIO_BUCKET, DEFAULT_REVIEW_BUCKET, SPEAKER_VOICES, TTS_MODEL, pcmDurationSeconds, silence };
