/**
 * Speech synthesis for the Weeks 1–4 listening tracks, on ElevenLabs.
 *
 * The tracks used to come from OpenAI's Realtime API. They now come from
 * ElevenLabs' text-to-speech endpoint, which is a plain HTTP POST per line:
 *
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 *        ?output_format=pcm_24000
 *   xi-api-key: <key>
 *   { text, model_id, voice_settings: { stability, similarity_boost, style, speed } }
 *   -> raw PCM16LE, mono, 24 kHz
 *
 * PCM output matters: it keeps the per-line boundaries the captions are built
 * from, and the existing PCM -> WAV -> loudnorm MP3 steps work unchanged.
 *
 * The accent is the voice, not an instruction. Each speaker is one of seven
 * custom ElevenLabs voices with its own British/Irish regional accent
 * (`accent` below is documentation for reviewers), so no prompt tries to talk
 * the model into an accent, and the recorded accent stays consistent across
 * tracks. `speed` is the only delivery control, and it is what gives B1 learners
 * a slightly slower pace.
 *
 * `eleven_multilingual_v2` is the default because it honours `speed` and reads
 * authored scripts verbatim. `eleven_v3` is more expressive but ignores `speed`
 * and adds its own pauses, so it is not used for graded listening material.
 *
 * The API cannot be exercised without an ELEVENLABS_API_KEY, so
 * `synthesiseTurn` accepts an injectable `fetch`: tests drive a fake, and the
 * real request path is checked by the manual GitHub Actions workflow.
 */

import { spawn } from 'node:child_process';

export const TTS_PROVIDER = 'elevenlabs';
export const TTS_MODEL = 'eleven_multilingual_v2';
export const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

/**
 * Raw PCM16LE at 24 kHz. 44.1 kHz is a paid-tier format, 22.05 kHz works too;
 * 24 kHz matches what the old pipeline used, so the WAV headers and the cue
 * timings carry over exactly.
 */
export const OUTPUT_FORMAT = 'pcm_24000';

/** B1 learners: slightly slower than a natural pace, without sounding robotic. */
export const B1_SPEECH_RATE = 0.9;

export const PCM_SAMPLE_RATE = 24_000;
export const PCM_BYTES_PER_SAMPLE = 2;

/**
 * One custom voice per speaker: seven British and Irish voices with different
 * regional accents, and no two speakers sharing a voice inside one track.
 *
 * The IDs are fixed by the course spec. `name` and `accent` are for reviewers;
 * only `voice` and an optional `settings` override reach the API.
 *
 * `settings` is per speaker, on purpose: one scene needs a warmer register than
 * another, and that is a property of the character, not of the track. Week 3 is
 * two flatmates who get on well, so Dan and Marta sit at a lower stability (more
 * expressive, less even) with some style (more life in the line) than the
 * default voices. Everything unset falls back to VOICE_SETTINGS.
 */
export const SPEAKER_VOICES = {
  Host: { voice: 'sp7QaEHmiNEd5HgrXuOo', name: 'Jack Anthony', accent: 'southern English' },
  Ellie: { voice: 'VGEVi3E0hARQ99wIXvJG', name: 'Jenny', accent: 'Scottish' },
  Aisha: { voice: 'jUPSOpRcPt8GMPsWx5fy', name: 'Ruby B', accent: 'London' },
  Tom: { voice: 'EtGAAwTx6aMveVbqUxuU', name: 'Joseph', accent: 'northern English' },
  Dan: {
    voice: 'sBU90Bu4NCleWDoNkGog',
    name: 'Richard',
    accent: 'Welsh',
    // Friendly, warm flatmate: a little less even, a little more animated.
    settings: { stability: 0.38, style: 0.25 },
  },
  Marta: {
    voice: 'FmIJwVFU62n8jITpotTp',
    name: 'Susie',
    accent: 'West Midlands',
    settings: { stability: 0.38, style: 0.25 },
  },
  Joanne: { voice: 'ZR8ruiC9tbg7bV9RmBmC', name: 'Miri', accent: 'Yorkshire' },
};

/**
 * Voice settings shared by every line. Stability sits mid-range so repeated
 * lines sound the same without flattening the delivery; `speed` comes from the
 * pace profile below, and any per-speaker override is applied on top.
 */
export const VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0,
  use_speaker_boost: true,
};

/**
 * The pace and pause profile a run uses.
 *
 * `b1` is the original: 0.9 speed, 0.35 s between lines, 0.6 s between
 * paragraphs. `warm` is the slower, roomier reading for a conversational scene:
 * 0.8 speed with longer gaps, so learners get a beat between turns. Both are
 * exported so the workflow can pass one by name and the tests can pin both.
 */
export const PACE_PROFILES = {
  b1: { speed: B1_SPEECH_RATE, linePauseSeconds: 0.35, paragraphPauseSeconds: 0.6 },
  warm: { speed: 0.8, linePauseSeconds: 0.55, paragraphPauseSeconds: 0.9 },
};

export const DEFAULT_PACE = 'b1';

/** Resolves a profile name, or a partial object, into a complete pace. */
export function resolvePace(pace = DEFAULT_PACE) {
  if (pace && typeof pace === 'object') {
    return { ...PACE_PROFILES[DEFAULT_PACE], ...pace };
  }
  const profile = PACE_PROFILES[pace];
  if (!profile) {
    throw new Error(`Unknown pace "${pace}": use one of ${Object.keys(PACE_PROFILES).join(', ')}`);
  }
  return { ...profile };
}

/** The settings actually sent for a speaker: defaults, then the voice's override. */
export function voiceSettingsFor(speaker, rate) {
  const config = SPEAKER_VOICES[speaker];
  if (!config) throw new Error(`No voice configured for speaker "${speaker}"`);
  return { ...VOICE_SETTINGS, ...(config.settings ?? {}), speed: rate };
}

/** How long a silent gap is inserted between two spoken lines (the `b1` pace). */
export const LINE_PAUSE_SECONDS = PACE_PROFILES.b1.linePauseSeconds;
/** A little longer where the script starts a new paragraph (the `b1` pace). */
export const PARAGRAPH_PAUSE_SECONDS = PACE_PROFILES.b1.paragraphPauseSeconds;

/**
 * Splits an authored script ("Host: …\n\nEllie: …") into speaker turns.
 *
 * Only `Speaker: ` prefixes where the name matches a known voice are treated as
 * turns, so a colon inside a sentence cannot start a new speaker. Week 4 is a
 * single-voice monologue written without any prefix; it becomes one speaker,
 * Joanne, split at paragraph breaks so no single request is too large.
 *
 * @returns {{speaker: string, text: string, index: number, newParagraph: boolean}[]}
 */
export function parseScript(script, fallbackSpeaker) {
  const paragraphs = script
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  /** @type {{speaker: string, text: string, index: number, newParagraph: boolean}[]} */
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const pieces = paragraph
      .split(/\n/)
      .map((piece) => piece.trim())
      .filter(Boolean);
    let sawSpeakerPrefix = false;
    for (const piece of pieces) {
      const match = /^([A-Z][A-Za-z]{1,20}):\s*([\s\S]+)$/.exec(piece);
      const name = match?.[1];
      if (name && SPEAKER_VOICES[name]) {
        sawSpeakerPrefix = true;
        lines.push({ speaker: name, text: match[2].trim(), index: 0, newParagraph: true });
      } else if (sawSpeakerPrefix) {
        lines[lines.length - 1].text = `${lines[lines.length - 1].text} ${piece}`.trim();
      } else {
        lines.push({ speaker: fallbackSpeaker, text: piece, index: 0, newParagraph: true });
      }
    }
  });

  return lines.map((line, position) => ({
    ...line,
    index: position + 1,
    newParagraph: position > 0 && line.newParagraph,
  }));
}

/** Voices must be unique inside a track: learners rely on it to tell speakers apart. */
export function assertDistinctVoices(lines) {
  const used = new Map();
  for (const line of lines) {
    const speakerVoice = SPEAKER_VOICES[line.speaker];
    if (!speakerVoice) throw new Error(`No voice configured for speaker "${line.speaker}"`);
    const existing = used.get(speakerVoice.voice);
    if (existing && existing !== line.speaker) {
      throw new Error(`Speakers "${existing}" and "${line.speaker}" share the voice ${speakerVoice.voice}`);
    }
    used.set(speakerVoice.voice, line.speaker);
  }
}

/** Every speaker in a script must have an entry in SPEAKER_VOICES. */
export function assertKnownSpeakers(lines) {
  for (const line of lines) {
    if (!SPEAKER_VOICES[line.speaker]) throw new Error(`No voice configured for speaker "${line.speaker}"`);
  }
}

/**
 * The request body for one line. There is deliberately no `instructions` or
 * prompt field: the accent comes from the custom voice, and the text is read as
 * written.
 */
export function buildSpeechRequest(speaker, text, rate = B1_SPEECH_RATE) {
  const config = SPEAKER_VOICES[speaker];
  if (!config) throw new Error(`No voice configured for speaker "${speaker}"`);
  if (!text.trim()) throw new Error(`Empty line for speaker "${speaker}"`);
  return {
    url: `${TTS_URL}/${encodeURIComponent(config.voice)}?output_format=${OUTPUT_FORMAT}`,
    body: {
      text,
      model_id: TTS_MODEL,
      voice_settings: voiceSettingsFor(speaker, rate),
    },
  };
}

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Speaks one script line and returns its PCM samples.
 *
 * Retries only what is worth retrying: 429 and 5xx responses, with exponential
 * backoff, because a 300-line track will hit a rate limit sooner or later. 4xx
 * responses are configuration errors (bad key, unknown voice, gated format) and
 * fail immediately with the API's message so the workflow log says what to fix.
 *
 * @returns {Promise<{speaker: string, text: string, pcm: Buffer, transcript: string}>}
 */
export async function synthesiseTurn(options) {
  const {
    speaker,
    text,
    apiKey,
    fetchImpl = globalThis.fetch,
    attempts = 4,
    timeoutMs = REQUEST_TIMEOUT_MS,
    log = () => {},
  } = options;
  const rate = options.rate ?? B1_SPEECH_RATE;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const request = buildSpeechRequest(speaker, text, rate);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await withTimeout(
        fetchImpl(request.url, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/pcm' },
          body: JSON.stringify(request.body),
        }),
        timeoutMs,
        `${speaker}: "${text.slice(0, 40)}…"`,
      );
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      log(`    ${speaker}: request failed (${error.message}); retrying`);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok) {
      const pcm = Buffer.from(await response.arrayBuffer());
      if (!pcm.length) throw new Error(`No audio returned for ${speaker}: "${text.slice(0, 40)}…"`);
      if (pcm.length % PCM_BYTES_PER_SAMPLE !== 0) {
        throw new Error(`Audio for ${speaker} is not 16-bit PCM (${pcm.length} bytes)`);
      }
      return { speaker, text, pcm, transcript: text };
    }

    const detail = await safeText(response);
    lastError = new Error(
      `ElevenLabs ${response.status} for ${speaker}: ${detail.slice(0, 300) || response.statusText}`,
    );
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts) throw lastError;
    log(`    ${speaker}: HTTP ${response.status}; retrying in ${backoffMs(attempt) / 1000}s`);
    await sleep(backoffMs(attempt));
  }

  throw lastError ?? new Error(`Could not synthesise ${speaker}`);
}

function backoffMs(attempt) {
  return Math.min(30_000, 2_000 * 2 ** (attempt - 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${Math.round(ms / 1000)}s waiting for ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function safeText(response) {
  try {
    return (await response.text()).replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/** Mono PCM16 little-endian -> a complete 44-byte-header WAV file. */
export function pcmToWav(pcm, sampleRate = PCM_SAMPLE_RATE) {
  const byteRate = sampleRate * PCM_BYTES_PER_SAMPLE;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(PCM_BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Silence inserted between lines, so turns do not run into each other. */
export function silence(seconds, sampleRate = PCM_SAMPLE_RATE) {
  return Buffer.alloc(Math.round(seconds * sampleRate) * PCM_BYTES_PER_SAMPLE);
}

export function pcmDurationSeconds(pcm, sampleRate = PCM_SAMPLE_RATE) {
  return pcm.length / PCM_BYTES_PER_SAMPLE / sampleRate;
}

/**
 * Lays the lines out on the finished timeline. The pauses inserted between
 * lines are the same ones added to the audio, so cue times match what a learner
 * hears.
 *
 * @returns {{cues: {index: number, speaker: string, text: string, start: number, end: number}[], durationSeconds: number}}
 */
export function scheduleTrack(turns, options = {}) {
  const sampleRate = options.sampleRate ?? PCM_SAMPLE_RATE;
  const pace = resolvePace(options.pace);
  const cues = [];
  let cursor = 0;
  turns.forEach((turn, position) => {
    const newParagraph = options.paragraphStarts?.[position] ?? turn.newParagraph ?? false;
    cursor += pauseBeforeLine(position + 1, newParagraph, pace);
    const duration = pcmDurationSeconds(turn.pcm, sampleRate);
    cues.push({
      index: options.lineIndexes?.[position] ?? position + 1,
      speaker: turn.speaker,
      text: turn.text,
      start: cursor,
      end: cursor + duration,
    });
    cursor += duration;
  });
  return { cues, durationSeconds: cursor };
}

/**
 * Total gap in seconds before the given line position (1-based, as in the
 * published captions), used to build the audio.
 */
export function pauseBeforeLine(linePosition, newParagraph, pace = PACE_PROFILES[DEFAULT_PACE]) {
  if (linePosition <= 1) return 0;
  const resolved = resolvePace(pace);
  return newParagraph ? resolved.paragraphPauseSeconds : resolved.linePauseSeconds;
}

/** Assembles the finished PCM track with the same gaps used by scheduleTrack. */
export function assembleTrack(turns, pace = PACE_PROFILES[DEFAULT_PACE]) {
  const parts = [];
  turns.forEach((turn, position) => {
    const pause = pauseBeforeLine(position + 1, turn.newParagraph, pace);
    if (pause > 0) parts.push(silence(pause));
    parts.push(turn.pcm);
  });
  return Buffer.concat(parts);
}

function vttTimestamp(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}.${String(millis).padStart(3, '0')}`;
}

/** Cue text is the spoken line without its speaker prefix, on one line. */
export function captionText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * WebVTT with one cue per speaker turn, each tagged with the speaker's name in a
 * voice span, so captions stay readable with several voices.
 */
export function buildTrackVtt(timing) {
  const lines = ['WEBVTT', '', 'NOTE Listening track captions generated by scripts/generate-course-audio.mjs', ''];
  timing.cues.forEach((cue) => {
    lines.push(String(cue.index));
    lines.push(`${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)}`);
    lines.push(`<v ${cue.speaker}>${captionText(cue.text)}</v>`);
    lines.push('');
  });
  return lines.join('\n');
}

/** Removes one leading speaker label if a transcript happens to include it. */
export function stripSpeakerPrefix(text) {
  return text.replace(/^[A-Z][A-Za-z]{1,20}:\s*/, '');
}

/** ffmpeg one-pass loudness normalisation, so every track sits at the same level. */
export const LOUDNESS_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11';

/** Default encoder: 128 kbps mono MP3, loudness-normalised. */
export function spawnFfmpeg(wavBuffer, outFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'wav',
        '-i',
        'pipe:0',
        '-af',
        LOUDNESS_FILTER,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-ac',
        '1',
        outFile,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error('ffmpeg is not installed; install it to encode the MP3 tracks')
          : error,
      );
    });
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim().slice(0, 400)}`));
    });
    child.stdin.end(wavBuffer);
  });
}

/** Encodes the assembled WAV as MP3. Injectable so tests can skip ffmpeg. */
export async function encodeMp3(wavBuffer, outFile, runner = spawnFfmpeg) {
  await runner(wavBuffer, outFile);
}

/**
 * The same encoding, returned as a Buffer. The legacy Modules 1–8 vocabulary
 * upload needs bytes for a storage key rather than a file on disk.
 */
export function spawnFfmpegToBuffer(wavBuffer) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'wav',
        '-i',
        'pipe:0',
        '-af',
        LOUDNESS_FILTER,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-ac',
        '1',
        '-f',
        'mp3',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error('ffmpeg is not installed; install it to encode the MP3 audio')
          : error,
      );
    });
    child.once('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim().slice(0, 400)}`));
    });
    child.stdin.end(wavBuffer);
  });
}

/** MP3 bytes for one snippet of speech; injectable so tests can skip ffmpeg. */
export async function encodeMp3Buffer(wavBuffer, runner = spawnFfmpegToBuffer) {
  return runner(wavBuffer);
}
