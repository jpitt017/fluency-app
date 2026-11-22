/**
 * Weeks 1–4 listening pipeline: script -> per-speaker AI trial audio -> MP3 +
 * WebVTT -> upload to the `course-audio` bucket, unreleased.
 *
 * Split out of scripts/generate-course-audio.mjs so the flow can be tested with
 * fakes. The CLI wrapper reads the authored scripts from
 * supabase-b1-b2/content/curriculum/weeks-01-04-details.json.
 */

import { readFile, writeFile } from 'node:fs/promises';
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
import { recordUnreleasedTrial, uploadToBucket } from './publish.mjs';

export const DEFAULT_CURRICULUM = 'supabase-b1-b2/content/curriculum/weeks-01-04-details.json';

export function listeningTrialAudioKey(week) {
  return `weeks-01-04/ai-trial/week-${week}-listening.mp3`;
}

export function listeningTrialCaptionsKey(week) {
  return `weeks-01-04/ai-trial/week-${week}-listening.vtt`;
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
 * Runs one week: synthesises every line with its own voice, joins the lines with
 * short pauses, writes the MP3 and WebVTT, and (unless this is a dry run)
 * uploads both and records an unreleased trial row.
 */
export async function generateListeningTrial(options) {
  const {
    weekSpec,
    outputDir,
    apiKey,
    transport,
    client = null,
    upload = false,
    rate = B1_SPEECH_RATE,
    model = TTS_MODEL,
    encoder = encodeMp3,
    /** Per-line ceiling for one spoken turn; lowered by tests. */
    timeoutMs = undefined,
    log = () => {},
  } = options;

  const speakerFallback = defaultSpeakerFor(weekSpec);
  const lines = parseScript(weekSpec.script, speakerFallback);
  if (!lines.length) throw new Error(`Week ${weekSpec.week} has an empty listening script`);
  assertDistinctVoices(lines);

  const turns = [];
  for (const line of lines) {
    log(`  ${line.index}/${lines.length} ${line.speaker} (${SPEAKER_VOICES[line.speaker].voice})`);
    const turn = await synthesiseTurn({ speaker: line.speaker, text: line.text, apiKey, transport, rate, model, timeoutMs });
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
    const audioUrl = await uploadToBucket(client, { key: result.audioKey, contentType: 'audio/mpeg', body: mp3 });
    const captionsUrl = await uploadToBucket(client, {
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
      captionsUrl,
    });
    result.uploaded = true;
    result.audioUrl = audioUrl;
    result.captionsUrl = captionsUrl;
  } else {
    await encoder(wav, mp3Path);
  }

  return result;
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

export { SPEAKER_VOICES, TTS_MODEL, pcmDurationSeconds, silence };
