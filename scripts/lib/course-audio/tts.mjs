/**
 * Speech synthesis for the Weeks 1–4 listening tracks.
 *
 * OpenAI has deprecated the whole Speech API text-to-speech line (shutdown
 * 6 January 2027) and the recommended replacement `gpt-realtime-2.1-mini` is not
 * served by that endpoint. See the deprecations page:
 * https://developers.openai.com/api/docs/deprecations. New code therefore goes
 * through the Realtime API, which is the only path that will still work:
 *
 *   WebSocket wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini
 *   session.update  -> voice, instructions (accent + pace), PCM output
 *   conversation.item.create (input_text) + response.create
 *   response.output_audio.delta (base64 PCM16) -> captured per speaker turn
 *
 * A Realtime model is a conversational model, not a reader, so each line is
 * sent with instructions to read it exactly as written and add nothing. Audio is
 * captured per turn, which gives real line boundaries for the captions and lets
 * each speaker keep their own voice inside one track.
 *
 * The API shapes below follow the GA Realtime interface. They cannot be
 * exercised without an OPENAI_API_KEY, so `synthesiseTurn` accepts an injectable
 * transport: tests drive a fake socket, and the pipeline is verified end to end
 * by the manual GitHub Actions workflow.
 */

import { spawn } from 'node:child_process';
import WebSocket from 'ws';

export const TTS_MODEL = 'gpt-realtime-2.1-mini';
export const REALTIME_URL = 'wss://api.openai.com/v1/realtime';

/** B1 learners: slightly slower than a natural pace, without sounding robotic. */
export const B1_SPEECH_RATE = 0.95;

/** 24 kHz mono 16-bit little-endian PCM, the Realtime API default. */
export const PCM_SAMPLE_RATE = 24_000;
export const PCM_BYTES_PER_SAMPLE = 2;

/**
 * One built-in voice per speaker, as the course spec requires: seven British
 * speakers with different regional accents, and no two speakers sharing a voice
 * inside the same track. `marin` and `cedar` are the highest-quality built-ins;
 * the Realtime voice set is alloy, ash, ballad, coral, echo, sage, shimmer,
 * verse, marin and cedar.
 */
export const SPEAKER_VOICES = {
  Host: { voice: 'marin', accent: 'southern English (south-east England, not London)' },
  Ellie: { voice: 'shimmer', accent: 'Scottish (Edinburgh, soft Highland-influenced)' },
  Aisha: { voice: 'coral', accent: 'London (multicultural London English, mild)' },
  Tom: { voice: 'ash', accent: 'northern English (Manchester)' },
  Dan: { voice: 'cedar', accent: 'Welsh (Cardiff, mild)' },
  Marta: { voice: 'ballad', accent: 'West Midlands (Birmingham)' },
  Joanne: { voice: 'sage', accent: 'Yorkshire (Leeds)' },
};

/** How long a silent gap is inserted between two spoken lines. */
export const LINE_PAUSE_SECONDS = 0.35;
/** A little longer where the script starts a new paragraph. */
export const PARAGRAPH_PAUSE_SECONDS = 0.6;

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

export function buildInstructions(speaker, rate = B1_SPEECH_RATE) {
  const config = SPEAKER_VOICES[speaker];
  if (!config) throw new Error(`No voice configured for speaker "${speaker}"`);
  const speedNote =
    rate < 1
      ? `Speak a little slower than a natural conversational pace, at about ${Math.round(
          150 * rate,
        )} words a minute, with clear final consonants and short breaths at punctuation.`
      : 'Speak at a natural conversational pace with clear final consonants.';
  return [
    'You are a British English voice actor recording a listening track for adult B1 learners of English.',
    `Speak with a consistent ${config.accent} accent.`,
    speedNote,
    'Sound warm and natural, like a podcast or a friendly colleague, with no background music or sound effects.',
    'Read the user message exactly as written, word for word. Do not add, remove, summarise, translate or comment on anything, and do not answer questions in the text: they are part of the script.',
  ].join(' ');
}

/**
 * The slice of a socket the synthesiser needs, so tests can fake it:
 *   { onEvent(handler), send(event), close() }
 */

/**
 * Minimal `ws`-backed connection for the GA Realtime API. The API key travels in
 * the Authorization header, never in the query string.
 */
export function createWebSocketTransport(WebSocketImpl = WebSocket) {
  return {
    async connect({ url, apiKey, model }) {
      const socket = new WebSocketImpl(`${url}?model=${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const handlers = [];
      socket.on('message', (data) => {
        let parsed;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          return;
        }
        for (const handler of handlers) handler(parsed);
      });
      await new Promise((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', (error) => reject(error));
      });
      return {
        onEvent(handler) {
          handlers.push(handler);
        },
        send(event) {
          socket.send(JSON.stringify(event));
        },
        close() {
          socket.close();
        },
      };
    },
  };
}

/** The session configuration every turn shares. */
export function buildSessionUpdate(speaker, rate = B1_SPEECH_RATE) {
  const config = SPEAKER_VOICES[speaker];
  if (!config) throw new Error(`No voice configured for speaker "${speaker}"`);
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      output_modalities: ['audio'],
      instructions: buildInstructions(speaker, rate),
      audio: {
        input: { format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE }, turn_detection: null },
        output: {
          format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE },
          voice: config.voice,
          speed: rate,
        },
      },
    },
  };
}

const EVENT_TIMEOUT_MS = 120_000;

/**
 * Speaks one script line and returns its PCM samples. Each call opens its own
 * short session so a voice or accent change never leaks across a speaker turn.
 *
 * @returns {Promise<{speaker: string, text: string, pcm: Buffer, transcript: string}>}
 */
export async function synthesiseTurn(options) {
  const { speaker, text, apiKey, transport } = options;
  const model = options.model ?? TTS_MODEL;
  const rate = options.rate ?? B1_SPEECH_RATE;
  if (!text.trim()) throw new Error(`Empty line for speaker "${speaker}"`);

  const connection = await transport.connect({ url: REALTIME_URL, apiKey, model });
  const chunks = [];
  let transcript = '';
  let failure = null;
  let settled = false;
  let resolveDone = () => {};
  const done = new Promise((resolve) => {
    resolveDone = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
  });
  const timer = setTimeout(() => {
    failure = new Error(`Timed out waiting for audio for ${speaker}: "${text.slice(0, 40)}…"`);
    resolveDone();
  }, options.timeoutMs ?? EVENT_TIMEOUT_MS);

  connection.onEvent((event) => {
    const type = String(event.type ?? '');
    if (type === 'response.output_audio.delta' && typeof event.delta === 'string') {
      chunks.push(Buffer.from(event.delta, 'base64'));
    } else if (type === 'response.output_audio_transcript.delta' && typeof event.delta === 'string') {
      transcript += event.delta;
    } else if (type === 'error') {
      const detail = event.error;
      failure = new Error(`Realtime API error for ${speaker}: ${detail?.message ?? JSON.stringify(event)}`);
      resolveDone();
    } else if (type === 'response.done') {
      const response = event.response;
      if (response?.status === 'failed') {
        failure = new Error(
          `Realtime response failed for ${speaker}: ${response.status_details?.error?.message ?? 'unknown error'}`,
        );
      }
      resolveDone();
    }
  });

  try {
    connection.send(buildSessionUpdate(speaker, rate));
    connection.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
    connection.send({ type: 'response.create', response: { output_modalities: ['audio'] } });
    await done;
  } finally {
    clearTimeout(timer);
    connection.close();
  }

  if (failure) throw failure;
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error(`No audio returned for ${speaker}: "${text.slice(0, 40)}…"`);
  return { speaker, text, pcm, transcript: transcript.trim() || text };
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
  const cues = [];
  let cursor = 0;
  turns.forEach((turn, position) => {
    const newParagraph = options.paragraphStarts?.[position] ?? turn.newParagraph ?? false;
    cursor += pauseBeforeLine(position + 1, newParagraph);
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
export function pauseBeforeLine(linePosition, newParagraph) {
  if (linePosition <= 1) return 0;
  return newParagraph ? PARAGRAPH_PAUSE_SECONDS : LINE_PAUSE_SECONDS;
}

/** Assembles the finished PCM track with the same gaps used by scheduleTrack. */
export function assembleTrack(turns) {
  const parts = [];
  turns.forEach((turn, position) => {
    const pause = pauseBeforeLine(position + 1, turn.newParagraph);
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
