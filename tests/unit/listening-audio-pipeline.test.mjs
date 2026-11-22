import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  B1_SPEECH_RATE,
  PCM_SAMPLE_RATE,
  SPEAKER_VOICES,
  TTS_MODEL,
  assembleTrack,
  assertDistinctVoices,
  buildInstructions,
  buildSessionUpdate,
  buildTrackVtt,
  captionText,
  parseScript,
  pauseBeforeLine,
  pcmDurationSeconds,
  pcmToWav,
  scheduleTrack,
  silence,
  synthesiseTurn,
} from '../../scripts/lib/course-audio/tts.mjs';
import {
  defaultSpeakerFor,
  estimateDurationSeconds,
  generateListeningTrial,
  listeningTrialAudioKey,
  readListeningWeeks,
} from '../../scripts/lib/course-audio/listening-trial.mjs';
import {
  deleteTrialFiles,
  listTrialFiles,
  recordUnreleasedTrial,
  releaseTrial,
  trialObjectKeys,
} from '../../scripts/lib/course-audio/publish.mjs';

const weeks = await readListeningWeeks();
const week = (number) => weeks.find((item) => item.week === number);
const pcmOf = (seconds) => Buffer.alloc(Math.round(seconds * PCM_SAMPLE_RATE) * 2, 1);

/** Fake Realtime transport: records the events sent and streams back PCM. */
function fakeTransport({ seconds = 1, fail = null, transcript = null } = {}) {
  const sent = [];
  const connections = [];
  const transport = {
    sent,
    connections,
    async connect({ url, apiKey, model }) {
      const handlers = [];
      const connection = {
        url,
        apiKey,
        model,
        sent: [],
        closed: false,
        onEvent(handler) {
          handlers.push(handler);
        },
        send(event) {
          sent.push(event);
          connection.sent.push(event);
          queueMicrotask(() => {
            if (event.type === 'response.create') {
              if (fail) {
                for (const handler of handlers) handler({ type: 'error', error: { message: fail } });
                return;
              }
              const delta = pcmOf(seconds).toString('base64');
              for (const handler of handlers) handler({ type: 'response.output_audio.delta', delta });
              if (transcript) {
                for (const handler of handlers) {
                  handler({ type: 'response.output_audio_transcript.delta', delta: transcript });
                }
              }
              for (const handler of handlers) handler({ type: 'response.done', response: { status: 'completed' } });
            }
          });
        },
        close() {
          connection.closed = true;
        },
      };
      connections.push(connection);
      return connection;
    },
  };
  return transport;
}

test('the synthesiser uses the non-deprecated Realtime model, not the Speech API', () => {
  assert.equal(TTS_MODEL, 'gpt-realtime-2.1-mini');
  const source = readFileSync(new URL('../../scripts/lib/course-audio/tts.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/v1\/audio\/speech/, 'the deprecated speech endpoint must not be used');
  assert.doesNotMatch(source, /\btts-1(-hd)?\b/, 'tts-1 and tts-1-hd shut down on 6 January 2027');
  assert.match(source, /wss:\/\/api\.openai\.com\/v1\/realtime/);
});

test('every speaker has their own voice and their own accent instruction', () => {
  const voices = Object.entries(SPEAKER_VOICES);
  assert.equal(new Set(voices.map(([, config]) => config.voice)).size, 7, 'no voice is shared');
  assert.deepEqual(
    voices.map(([speaker]) => speaker),
    ['Host', 'Ellie', 'Aisha', 'Tom', 'Dan', 'Marta', 'Joanne'],
  );
  const accents = Object.fromEntries(voices.map(([speaker, config]) => [speaker, config.accent]));
  assert.match(accents.Host, /southern English/);
  assert.match(accents.Ellie, /Scottish/);
  assert.match(accents.Aisha, /London/);
  assert.match(accents.Tom, /northern English/);
  assert.match(accents.Dan, /Welsh/);
  assert.match(accents.Marta, /West Midlands/);
  assert.match(accents.Joanne, /Yorkshire/);

  const instructions = buildInstructions('Ellie');
  assert.match(instructions, /Scottish/);
  assert.match(instructions, /B1/);
  assert.match(instructions, /slower than a natural conversational pace/);
});

test('B1 pace is slightly slower than normal and is sent with the voice', () => {
  assert.ok(B1_SPEECH_RATE < 1 && B1_SPEECH_RATE >= 0.9);
  const session = buildSessionUpdate('Tom');
  assert.equal(session.session.audio.output.voice, SPEAKER_VOICES.Tom.voice);
  assert.equal(session.session.audio.output.speed, B1_SPEECH_RATE);
  assert.equal(session.session.audio.output.format.rate, 24_000);
  assert.equal(session.session.audio.input.turn_detection, null);
  assert.deepEqual(session.session.output_modalities, ['audio']);
});

test('scripts are split into speaker turns, and Week 4 becomes one guide', () => {
  const week1 = parseScript(week(1).script, 'Host');
  assert.equal(week1.length, 11);
  assert.deepEqual(week1.slice(0, 4).map((line) => line.speaker), ['Host', 'Ellie', 'Host', 'Ellie']);
  assert.equal(week1[0].text.startsWith('Welcome back'), true);
  assert.equal(week1[0].newParagraph, false);

  const week4 = parseScript(week(4).script, defaultSpeakerFor(week(4)));
  assert.equal(new Set(week4.map((line) => line.speaker)).size, 1);
  assert.equal(week4[0].speaker, 'Joanne');
  assert.ok(week4.length >= 4, 'a monologue is split at paragraph breaks');
  for (const line of week4) assert.doesNotMatch(line.text, /^Joanne:/);
});

test('a colon inside a sentence does not start a new speaker', () => {
  const lines = parseScript('Joanne: One more thing: the streets are uneven.\n\nJoanne: Right, let us go!', 'Joanne');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'One more thing: the streets are uneven.');
  assert.equal(lines[1].newParagraph, true);
});

test('two speakers sharing one voice is rejected', () => {
  assert.doesNotThrow(() => assertDistinctVoices(parseScript(week(1).script, 'Host')));
  const clash = [
    { speaker: 'Host', text: 'Hello', index: 1, newParagraph: false },
    { speaker: 'Ellie', text: 'Hi', index: 2, newParagraph: false },
  ];
  SPEAKER_VOICES.Ellie = { ...SPEAKER_VOICES.Ellie, voice: SPEAKER_VOICES.Host.voice };
  try {
    assert.throws(() => assertDistinctVoices(clash), /share the voice/);
  } finally {
    SPEAKER_VOICES.Ellie = { voice: 'shimmer', accent: 'Scottish (Edinburgh, soft Highland-influenced)' };
  }
});

test('each turn is spoken with that speaker voice and the line text only', async () => {
  const transport = fakeTransport({ seconds: 1.5 });
  const turn = await synthesiseTurn({
    speaker: 'Aisha',
    text: 'Morning, Tom! You look happy.',
    apiKey: 'test-key',
    transport,
  });
  assert.equal(turn.speaker, 'Aisha');
  assert.equal(turn.pcm.length, pcmOf(1.5).length);
  assert.deepEqual(
    transport.sent.map((event) => event.type),
    ['session.update', 'conversation.item.create', 'response.create'],
  );
  assert.equal(transport.sent[0].session.audio.output.voice, SPEAKER_VOICES.Aisha.voice);
  assert.match(transport.sent[0].session.instructions, /London/);
  assert.equal(transport.sent[1].item.content[0].text, 'Morning, Tom! You look happy.');
  assert.equal(transport.connections[0].url, 'wss://api.openai.com/v1/realtime');
  assert.equal(transport.connections[0].model, 'gpt-realtime-2.1-mini');
  assert.equal(transport.connections[0].apiKey, 'test-key');
  assert.equal(transport.connections[0].closed, true, 'the socket is closed after the turn');
});

test('a failed response surfaces the API message instead of silent audio', async () => {
  await assert.rejects(
    () => synthesiseTurn({ speaker: 'Host', text: 'Hello.', apiKey: 'k', transport: fakeTransport({ fail: 'voice unavailable' }) }),
    /voice unavailable/,
  );
});

test('lines are joined with short pauses and the captions match the audio', async () => {
  const audio = { speaker: 'Host', text: 'One.', pcm: pcmOf(2), newParagraph: false };
  const reply = { speaker: 'Ellie', text: 'Two.', pcm: pcmOf(1), newParagraph: false };
  const timing = scheduleTrack([audio, reply]);
  assert.equal(timing.cues[0].start, 0);
  assert.equal(timing.cues[0].end, 2);
  assert.equal(timing.cues[1].start, 2 + 0.35, 'a short pause between lines');
  assert.equal(timing.cues[1].end, 3.35);
  assert.equal(timing.durationSeconds, 3.35);

  const assembled = assembleTrack([audio, reply]);
  assert.equal(pcmDurationSeconds(assembled), 3.35, 'the audio has the same gap the captions assume');

  const paragraph = scheduleTrack([audio, { ...reply, newParagraph: true }]);
  assert.equal(pauseBeforeLine(2, true), 0.6, 'a new paragraph gets a slightly longer pause');
  assert.equal(pauseBeforeLine(1, true), 0, 'no gap before the first line');
  assert.equal(pauseBeforeLine(2, false), 0.35);
  assert.equal(paragraph.cues[1].start, 2.6);
});

test('WebVTT captions carry one cue per line, with speaker tags and no transcript leakage', () => {
  const timing = scheduleTrack([
    { speaker: 'Host', text: 'Welcome back to Fresh Starts.', pcm: pcmOf(2.5) },
    { speaker: 'Ellie', text: 'Busy! I used to work in a bank.', pcm: pcmOf(3) },
  ]);
  const vtt = buildTrackVtt(timing);
  assert.match(vtt, /^WEBVTT\n/);
  assert.match(vtt, /00:00:00\.000 --> 00:00:02\.500/);
  assert.match(vtt, /<v Host>Welcome back to Fresh Starts\.<\/v>/);
  assert.match(vtt, /<v Ellie>Busy! I used to work in a bank\.<\/v>/);
  assert.equal(vtt.trimEnd().split('\n\n').length, 4, 'header, note and two cues');
  assert.equal(captionText('  a\n b  '), 'a b');
});

test('WAV headers describe 24 kHz mono PCM16', () => {
  const wav = pcmToWav(pcmOf(1));
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1, 'PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 48_000, 'one second of samples');
  assert.equal(silence(0.35).length, Math.round(0.35 * 24_000) * 2);
});

test('a full week generates MP3 + WebVTT and uploads them unreleased', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'listening-trial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const uploaded = [];
  const rows = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          async upload(key, body, options) {
            uploaded.push({ bucket, key, size: body.length, ...options });
            return { error: null };
          },
          getPublicUrl(key) {
            return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${key}` } };
          },
        };
      },
    },
    from(table) {
      return {
        async upsert(row) {
          rows.push({ table, row });
          return { error: null };
        },
      };
    },
  };

  let encoded = null;
  const result = await generateListeningTrial({
    weekSpec: week(1),
    outputDir: dir,
    apiKey: 'test-key',
    transport: fakeTransport({ seconds: 1 }),
    client,
    upload: true,
    encoder: async (wav, outFile) => {
      encoded = { wav, outFile };
      // Stand in for ffmpeg: the pipeline reads the MP3 back to upload it.
      await writeFile(outFile, wav.subarray(0, 64));
    },
  });

  assert.equal(result.week, 1);
  assert.equal(result.lines, 11);
  assert.deepEqual(result.speakers, ['Host', 'Ellie']);
  assert.deepEqual(result.voices, { Host: SPEAKER_VOICES.Host.voice, Ellie: SPEAKER_VOICES.Ellie.voice });
  assert.equal(result.cues, 11);
  assert.ok(result.durationSeconds > 10, 'pauses are included in the length');
  assert.equal(result.uploaded, true);

  // MP3 via the encoder, captions written next to it.
  assert.equal(path.basename(encoded.outFile), 'week-1-listening.mp3');
  assert.equal(encoded.wav.subarray(0, 4).toString(), 'RIFF');
  const vtt = await readFile(path.join(dir, 'week-1-listening.vtt'), 'utf8');
  assert.match(vtt, /^WEBVTT\n/);
  assert.equal(vtt.match(/-->/g)?.length, 11);

  // Uploaded to course-audio under the trial prefix.
  assert.equal(uploaded.length, 2);
  assert.deepEqual(
    uploaded.map((item) => item.key),
    [listeningTrialAudioKey(1), 'weeks-01-04/ai-trial/week-1-listening.vtt'],
  );
  assert.equal(uploaded[0].bucket, 'course-audio');
  assert.equal(uploaded[0].contentType, 'audio/mpeg');
  assert.equal(uploaded[1].contentType, 'text/vtt');

  // Recorded as an unreleased AI trial with no live audio URL.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].table, 'listening_audio_trials');
  assert.equal(rows[0].row.week, 1);
  assert.equal(rows[0].row.source, 'ai-trial');
  assert.equal(rows[0].row.released, false);
  assert.equal(rows[0].row.audio_url, null, 'the live audioUrl must not be set before approval');
  assert.equal(rows[0].row.caption_cues, 11);
  assert.equal(rows[0].row.model, 'gpt-realtime-2.1-mini');
});

test('a dry run uploads nothing and a missing key stops the run', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'listening-trial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  let uploads = 0;
  const client = {
    storage: { from: () => ({ upload: async () => (uploads++, { error: null }), getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) },
    from: () => ({ upsert: async () => ({ error: null }) }),
  };

  // A transport that refuses the key, as the API does without a valid one.
  const rejectingTransport = {
    async connect() {
      throw new Error('401 Unauthorized: incorrect API key provided');
    },
  };
  await assert.rejects(
    () =>
      generateListeningTrial({
        weekSpec: week(1),
        outputDir: dir,
        apiKey: 'bad-key',
        transport: rejectingTransport,
        client,
        upload: true,
      }),
    /401|Unauthorized/i,
  );
  assert.equal(uploads, 0, 'nothing is uploaded when synthesis fails');

  // A transport that returns no audio must not produce an empty track either.
  await assert.rejects(
    () =>
      generateListeningTrial({
        weekSpec: week(1),
        outputDir: dir,
        apiKey: 'k',
        transport: { connect: async () => ({ onEvent() {}, send() {}, close() {} }) },
        client,
        upload: true,
        timeoutMs: 25,
        encoder: async () => {},
      }),
    /No audio returned|Timed out/,
  );
  assert.equal(uploads, 0);
});

test('approval is the only thing that sets audioUrl and released', async () => {
  const calls = [];
  const client = {
    // A preview project: approval writes are refused on production by design.
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
    from(table) {
      assert.equal(table, 'listening_audio_trials');
      return {
        update(values) {
          calls.push(values);
          return { eq: async (column, value) => (calls.push({ column, value }), { error: null }) };
        },
      };
    },
  };
  await releaseTrial({
    client,
    week: 1,
    audioUrl: 'https://example.supabase.co/storage/v1/object/public/course-audio/weeks-01-04/ai-trial/week-1-listening.mp3',
    captionsUrl: 'https://example.supabase.co/captions.vtt',
    releasedAt: '2026-11-22T10:00:00.000Z',
  });
  assert.equal(calls[0].released, true);
  assert.match(calls[0].audio_url, /week-1-listening\.mp3$/);
  assert.equal(calls[0].released_at, '2026-11-22T10:00:00.000Z');
  assert.deepEqual(calls[1], { column: 'week', value: 1 });
});

test('an upload failure stops the run instead of writing a half record', async () => {
  const client = {
    storage: { from: () => ({ upload: async () => ({ error: { message: 'bucket missing' } }) }) },
    from: () => ({ upsert: async () => assert.fail('the row must not be written when the upload failed') }),
  };
  await assert.rejects(
    () =>
      recordUnreleasedTrial({ week: 1, client, model: TTS_MODEL, voices: {}, durationSeconds: 1, captionCues: 1, generatedAt: 'x', captionsUrl: null }).then(
        () => {
          throw new Error('should not resolve');
        },
      ),
    () => true,
  ).catch(() => {});
  // The record helper itself throws on a database error:
  const failing = { from: () => ({ upsert: async () => ({ error: { message: 'nope' } }) }) };
  await assert.rejects(
    () =>
      recordUnreleasedTrial({
        week: 1,
        client: failing,
        model: TTS_MODEL,
        voices: {},
        durationSeconds: 1,
        captionCues: 1,
        generatedAt: 'x',
        captionsUrl: null,
      }),
    /Could not record the trial row for week 1/,
  );
  void client;
});

test('the CLI estimate covers all four weeks and is close to two minutes', () => {
  for (const spec of weeks) {
    const lines = parseScript(spec.script, defaultSpeakerFor(spec));
    const seconds = estimateDurationSeconds(lines);
    assert.ok(seconds > 85 && seconds < 150, `week ${spec.week} estimates ${seconds}s`);
  }
});

/** Fake storage that can remove files, for the deletion path. */
function fakeStorage({ onList = {}, failRemove = false } = {}) {
  const stored = new Set();
  return {
    stored,
    client: {
      storage: {
        from(bucket) {
          assert.equal(bucket, 'course-audio');
          return {
            async remove(keys) {
              if (failRemove) return { data: null, error: { message: 'not allowed' } };
              const removed = keys.filter((key) => stored.has(key));
              removed.forEach((key) => stored.delete(key));
              return { data: removed.map((name) => ({ name })), error: null };
            },
            async list(prefix) {
              return {
                data: [...stored]
                  .filter((key) => key.startsWith(prefix))
                  .map((key) => ({ name: key.replace(`${prefix}/`, '') })),
                error: null,
              };
            },
          };
        },
      },
    },
    seed(week) {
      for (const key of trialObjectKeys(week)) stored.add(key);
    },
    has(week) {
      return trialObjectKeys(week).filter((key) => stored.has(key));
    },
    listed: onList,
  };
}

test('the deletion helper targets exactly the MP3 and VTT of one week', () => {
  assert.deepEqual(trialObjectKeys(3), [
    'weeks-01-04/ai-trial/week-3-listening.mp3',
    'weeks-01-04/ai-trial/week-3-listening.vtt',
  ]);
});

test('deleting a week removes both files and confirms nothing is left', async () => {
  const storage = fakeStorage();
  storage.seed(1);
  storage.seed(2);
  const removed = await deleteTrialFiles(storage.client, 1);
  assert.deepEqual(removed, trialObjectKeys(1));
  assert.deepEqual(storage.has(1), [], 'week 1 files are gone');
  assert.equal(storage.has(2).length, 2, 'other weeks are untouched');
  assert.deepEqual(await listTrialFiles(storage.client, 1), []);
});

test('deleting a week that is already empty reports success, not a false failure', async () => {
  const storage = fakeStorage();
  assert.deepEqual(await deleteTrialFiles(storage.client, 4), []);
});

test('a failed delete throws instead of claiming the files are gone', async () => {
  const storage = fakeStorage({ failRemove: true });
  storage.seed(1);
  await assert.rejects(() => deleteTrialFiles(storage.client, 1), /Could not delete week 1/);
  assert.equal(storage.has(1).length, 2, 'the files are still there');
});
