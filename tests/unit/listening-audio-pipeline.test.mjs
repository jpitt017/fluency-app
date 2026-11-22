import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  B1_SPEECH_RATE,
  OUTPUT_FORMAT,
  SPEAKER_VOICES,
  TTS_MODEL,
  TTS_PROVIDER,
  assembleTrack,
  assertDistinctVoices,
  assertKnownSpeakers,
  buildSpeechRequest,
  buildTrackVtt,
  encodeMp3,
  parseScript,
  pcmDurationSeconds,
  pcmToWav,
  scheduleTrack,
  synthesiseTurn,
} from '../../scripts/lib/course-audio/tts.mjs';
import {
  defaultSpeakerFor,
  estimateDurationSeconds,
  generateListeningTrial,
  generateVoiceCheck,
  listeningTrialAudioKey,
  readListeningWeeks,
  VOICE_CHECK_LINE,
} from '../../scripts/lib/course-audio/listening-trial.mjs';

const tts = readFileSync(new URL('../../scripts/lib/course-audio/tts.mjs', import.meta.url), 'utf8');
const cli = readFileSync(new URL('../../scripts/generate-course-audio.mjs', import.meta.url), 'utf8');
const publish = readFileSync(new URL('../../scripts/lib/course-audio/publish.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/course-audio.yml', import.meta.url), 'utf8');

const SCRIPT = `Host: Welcome back. Today we are talking about work.

Ellie: I started a new job last month.
It is going well.

Host: Good to hear. And you, Tom?
`;

/** PCM16 mono at 24 kHz, so one second is 48 kB. */
function fakePcm(seconds) {
  return Buffer.alloc(Math.round(seconds * 24_000) * 2, 1);
}

/** Just enough of fetch to drive one request. */
function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  impl.calls = calls;
  return impl;
}

function audioResponse(bytes = fakePcm(1)) {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
}

test('the pipeline synthesises with ElevenLabs, not OpenAI', () => {
  assert.equal(TTS_PROVIDER, 'elevenlabs');
  assert.equal(TTS_MODEL, 'eleven_multilingual_v2');
  for (const source of [tts, cli, publish]) {
    assert.doesNotMatch(source, /api\.openai\.com/);
    assert.doesNotMatch(source, /OPENAI_API_KEY/);
    assert.doesNotMatch(source, /gpt-4o-mini-tts|gpt-realtime/);
  }
  assert.match(tts, /api\.elevenlabs\.io/);
  assert.match(cli, /ELEVENLABS_API_KEY/);
});

test('the workflow asks for ELEVENLABS_API_KEY and never for OPENAI_API_KEY', () => {
  assert.match(workflow, /ELEVENLABS_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI/);
});

test('SPEAKER_VOICES is exactly the seven approved ElevenLabs voices', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SPEAKER_VOICES).map(([role, config]) => [role, config.voice])),
    {
      Host: 'sp7QaEHmiNEd5HgrXuOo',
      Ellie: 'VGEVi3E0hARQ99wIXvJG',
      Aisha: 'jUPSOpRcPt8GMPsWx5fy',
      Tom: 'EtGAAwTx6aMveVbqUxuU',
      Dan: 'sBU90Bu4NCleWDoNkGog',
      Marta: 'FmIJwVFU62n8jITpotTp',
      Joanne: 'ZR8ruiC9tbg7bV9RmBmC',
    },
  );
  // The accent is carried by the voice: no config may reintroduce a prompt field.
  for (const config of Object.values(SPEAKER_VOICES)) {
    assert.equal(config.instructions, undefined);
    assert.equal(config.voice.startsWith('sk_'), false);
  }
});

test('the request carries the voice id, the PCM format and the B1 speed, and no accent instructions', () => {
  const request = buildSpeechRequest('Ellie', 'Hello there.');
  assert.equal(
    request.url,
    `https://api.elevenlabs.io/v1/text-to-speech/VGEVi3E0hARQ99wIXvJG?output_format=${OUTPUT_FORMAT}`,
  );
  assert.equal(OUTPUT_FORMAT, 'pcm_24000');
  assert.equal(request.body.text, 'Hello there.');
  assert.equal(request.body.model_id, 'eleven_multilingual_v2');
  assert.equal(request.body.voice_settings.speed, B1_SPEECH_RATE);
  assert.equal(B1_SPEECH_RATE < 1, true, 'B1 pace is slower than natural');
  assert.equal(request.body.instructions, undefined);
  assert.equal(JSON.stringify(request.body).match(/accent|instruction/i), null);
});

test('an unknown speaker is refused before any request is sent', () => {
  assert.throws(() => buildSpeechRequest('Nobody', 'Hi.'), /No voice configured/);
  assert.throws(() => assertKnownSpeakers([{ speaker: 'Nobody', text: 'x' }]), /No voice configured/);
});

test('synthesiseTurn posts the line and returns PCM of the expected length', async () => {
  const fetchImpl = fakeFetch(() => audioResponse(fakePcm(2)));
  const turn = await synthesiseTurn({ speaker: 'Host', text: 'Welcome back.', apiKey: 'test-key', fetchImpl });
  assert.equal(fetchImpl.calls.length, 1);
  const [{ url, init }] = fetchImpl.calls;
  assert.match(url, /text-to-speech\/sp7QaEHmiNEd5HgrXuOo\?output_format=pcm_24000$/);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['xi-api-key'], 'test-key');
  assert.equal(JSON.parse(init.body).text, 'Welcome back.');
  assert.equal(pcmDurationSeconds(turn.pcm).toFixed(2), '2.00');
  assert.equal(turn.transcript, 'Welcome back.');
  assert.equal(turn.speaker, 'Host');
});

test('a missing key is refused without sending anything', async () => {
  const fetchImpl = fakeFetch(() => audioResponse());
  await assert.rejects(
    synthesiseTurn({ speaker: 'Host', text: 'Hi.', apiKey: '', fetchImpl }),
    /ELEVENLABS_API_KEY is not set/,
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('a 4xx configuration error fails immediately and names the reason', async () => {
  const fetchImpl = fakeFetch(
    () =>
      new Response(JSON.stringify({ detail: { message: "Output format 'pcm_44100' is only available on the Pro tier" } }), {
        status: 403,
      }),
  );
  await assert.rejects(
    synthesiseTurn({ speaker: 'Host', text: 'Hi.', apiKey: 'k', fetchImpl }),
    /ElevenLabs 403 for Host: .*Pro tier/,
  );
  assert.equal(fetchImpl.calls.length, 1, 'a 403 is not retried');
});

test('a rate limit is retried and the retry can succeed', async () => {
  const fetchImpl = fakeFetch((_url, _init, attempt) =>
    attempt === 1 ? new Response('slow down', { status: 429 }) : audioResponse(fakePcm(1)),
  );
  const logs = [];
  const turn = await synthesiseTurn({
    speaker: 'Host',
    text: 'Hi.',
    apiKey: 'k',
    fetchImpl,
    log: (message) => logs.push(message),
  });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(pcmDurationSeconds(turn.pcm).toFixed(2), '1.00');
  assert.match(logs.join('\n'), /HTTP 429; retrying/);
});

test('an empty body is an error rather than a silent zero-length track', async () => {
  const fetchImpl = fakeFetch(() => audioResponse(Buffer.alloc(0)));
  await assert.rejects(synthesiseTurn({ speaker: 'Host', text: 'Hi.', apiKey: 'k', fetchImpl }), /No audio returned/);
});

test('The script parser only treats known speaker labels as turns', () => {
  const lines = parseScript(SCRIPT, 'Host');
  assert.deepEqual(
    lines.map((line) => [line.index, line.speaker, line.text]),
    [
      [1, 'Host', 'Welcome back. Today we are talking about work.'],
      [2, 'Ellie', 'I started a new job last month. It is going well.'],
      [3, 'Host', 'Good to hear. And you, Tom?'],
    ],
  );
  // A colon inside a sentence must not start a new speaker: the fallback voice
  // keeps the line, rather than inventing a speaker called "Nothing".
  const prose = parseScript('Ellie: One thing: it depends.\n\nNothing here: just a colon.', 'Host');
  assert.deepEqual(prose.map((line) => line.speaker), ['Ellie', 'Host']);
});

test('week 4 is a single-voice monologue and stays one speaker', () => {
  const lines = parseScript('First paragraph.\n\nSecond paragraph.', 'Joanne');
  assert.equal(lines.length, 2);
  assert.deepEqual(new Set(lines.map((line) => line.speaker)), new Set(['Joanne']));
  assert.deepEqual(lines.map((line) => line.newParagraph), [false, true]);
});

test('two speakers cannot share a voice', () => {
  const shared = structuredClone([{ speaker: 'Host', text: 'a' }]);
  const lines = [{ speaker: 'Host', text: 'a' }, { speaker: 'Host', text: 'b' }];
  assert.doesNotThrow(() => assertDistinctVoices(lines));
  const copy = SPEAKER_VOICES.Tom.voice;
  try {
    SPEAKER_VOICES.Tom.voice = SPEAKER_VOICES.Host.voice;
    assert.throws(
      () => assertDistinctVoices([{ speaker: 'Host', text: 'a' }, { speaker: 'Tom', text: 'b' }]),
      /share the voice/,
    );
  } finally {
    SPEAKER_VOICES.Tom.voice = copy;
    assert.equal(shared[0].speaker, 'Host');
  }
});

test('PCM is wrapped in a valid mono 24 kHz WAV header', () => {
  const wav = pcmToWav(fakePcm(1));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt16LE(34), 16, '16-bit');
  assert.equal(wav.readUInt32LE(40), 24_000 * 2);
});

test('captions follow the audio timeline including the pauses', () => {
  const turns = [
    { speaker: 'Host', text: 'One.', pcm: fakePcm(2), newParagraph: false },
    { speaker: 'Ellie', text: 'Two.', pcm: fakePcm(3), newParagraph: false },
  ];
  const timing = scheduleTrack(turns);
  assert.deepEqual(
    timing.cues.map((cue) => [cue.index, cue.speaker, +cue.start.toFixed(2), +cue.end.toFixed(2)]),
    [
      [1, 'Host', 0, 2],
      [2, 'Ellie', 2.35, 5.35],
    ],
  );
  assert.equal(+timing.durationSeconds.toFixed(2), 5.35);
  const audio = assembleTrack(turns);
  assert.equal(+pcmDurationSeconds(audio).toFixed(2), +timing.durationSeconds.toFixed(2));
});

test('the WebVTT names each speaker in a voice span', () => {
  const vtt = buildTrackVtt({
    cues: [
      { index: 1, speaker: 'Host', text: 'One.', start: 0, end: 2 },
      { index: 2, speaker: 'Ellie', text: 'Two.', start: 2.35, end: 5.35 },
    ],
    durationSeconds: 5.35,
  });
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:00\.000 --> 00:00:02\.000\n<v Host>One\.<\/v>/);
  assert.match(vtt, /00:00:02\.350 --> 00:00:05\.350\n<v Ellie>Two\.<\/v>/);
});

test('encoding is injectable, so the tests never need ffmpeg', async () => {
  let called = 0;
  await encodeMp3(Buffer.from('wav'), 'out.mp3', async () => {
    called += 1;
  });
  assert.equal(called, 1);
});

test('an upload is retried through a transient storage 5xx', async () => {
  const { uploadToBucket } = await import('../../scripts/lib/course-audio/publish.mjs');
  const calls = [];
  const client = {
    storage: {
      from: () => ({
        async upload(key) {
          calls.push(key);
          return calls.length < 3 ? { error: { status: 520, message: '<none>' } } : { error: null };
        },
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/x.mp3' } }),
      }),
    },
  };
  const url = await uploadToBucket(client, {
    bucket: 'course-audio-review',
    key: 'weeks-01-04/ai-trial/voice-check-Host.mp3',
    contentType: 'audio/mpeg',
    body: Buffer.from('x'),
  });
  assert.equal(calls.length, 3, 'retried twice, then succeeded');
  assert.equal(url, null, 'a private bucket has no public URL');
});

test('an upload permission error is not retried', async () => {
  const { uploadToBucket } = await import('../../scripts/lib/course-audio/publish.mjs');
  const calls = [];
  const client = {
    storage: {
      from: () => ({
        async upload(key) {
          calls.push(key);
          return { error: { status: 403, message: 'row-level security' } };
        },
      }),
    },
  };
  await assert.rejects(
    uploadToBucket(client, {
      bucket: 'course-audio-review',
      key: 'weeks-01-04/ai-trial/voice-check-Host.mp3',
      contentType: 'audio/mpeg',
      body: Buffer.from('x'),
    }),
    /row-level security/,
  );
  assert.equal(calls.length, 1);
});

test('the workflow saves only the review artefacts and requires the ElevenLabs secret', () => {
  assert.match(workflow, /ELEVENLABS_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI/);
  assert.match(workflow, /mode: voice-check|voice-check/);
});

test('the voice-check clips travel as a `voice-check` artifact, on the Node 24 action', () => {
  // Signed links are redacted wherever GitHub renders them, so the MP3s have to
  // be downloadable. Same action major as the other Node 24 actions in the repo.
  const block = workflow.split('- name: Voice check clips for a listen')[1]?.split('- name:')[0];
  assert.ok(block, 'the voice check has an artifact step');
  assert.match(block, /uses: actions\/upload-artifact@v7/);
  assert.match(block, /name: voice-check\n/);
  assert.match(block, /path: voice-check\//);
  assert.match(block, /retention-days: 3/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/, 'every artifact step runs on Node 24');
});

test('a generate run attaches the tracks (MP3 + captions) as the `review` artifact for 3 days', () => {
  const block = workflow.split('- name: Tracks for a listen (MP3 + captions)')[1]?.split('- name:')[0];
  assert.ok(block, 'generate has an artifact step');
  assert.match(block, /if: \$\{\{ inputs\.mode == 'generate' && !inputs\.dry_run \}\}/);
  assert.match(block, /uses: actions\/upload-artifact@v7/);
  assert.match(block, /name: review\n/);
  assert.match(block, /audio-out\/weeks-01-04\/\*\.mp3/);
  assert.match(block, /audio-out\/weeks-01-04\/\*\.vtt/);
  assert.match(block, /retention-days: 3/);
  assert.doesNotMatch(workflow, /weeks-01-04-ai-trial-audio/, 'the old artifact is gone');
});

test('only the review mode prints a signed link, and never into the summary', () => {
  // Generate and voice-check runs must stay link-free in the log.
  const generateBlock = workflow.split('- name: Generate, upload unreleased, record approval state')[1]?.split('- name:')[0];
  assert.ok(generateBlock);
  assert.match(generateBlock, /SIGNED_LINKS_IN_LOG: ''/);
  const reviewBlock = workflow.split('- name: Review links (signed, valid 1 hour)')[1]?.split('- name:')[0];
  assert.match(reviewBlock, /SIGNED_LINKS_IN_LOG: '1'/);

  // And in the code, the summary builder cannot emit a URL at all.
  assert.match(cli, /function signedLinksInLog\(\)/);
  const report = cli.split('function reviewReport(report) {')[1].split('\n}')[0];
  assert.doesNotMatch(report, /signReviewUrl|signedUrl|signedURL|https?:\/\//, 'no URLs in the summary');
  // The one place a link is signed is guarded by the flag.
  const guarded = cli.split('if (signedLinksInLog()) {')[1]?.split('\n    }')[0] ?? '';
  assert.match(guarded, /signReviewUrl/);
  assert.equal((cli.match(/signReviewUrl\(/g) ?? []).length, 1, 'links are signed in exactly one place');
});

test('the CLI writes the voice-check clips to ./voice-check, which is not committed', () => {
  assert.match(cli, /path\.join\(process\.cwd\(\), 'voice-check'\)/);
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^\/voice-check\/$/m);
});
/* ---------------------------------------------------------------- end to end */

const weeks = await readListeningWeeks();
const week = (number) => weeks.find((item) => item.week === number);

/** A fake HTTP fetch that answers every line with `seconds` of PCM. */
function pcmFetch(seconds = 1) {
  return async () => new Response(fakePcm(seconds), { status: 200 });
}

test('a full week generates MP3 + WebVTT and uploads them to the private review bucket, unreleased', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'listening-trial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const uploaded = [];
  const rows = [];
  const client = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'course-audio-review', 'unapproved audio never goes to the public bucket');
        return {
          async upload(key, body, options) {
            uploaded.push({ bucket, key, size: body.length, ...options });
            return { error: null };
          },
          getPublicUrl() {
            assert.fail('a private bucket has no public URL to hand out');
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
    fetchImpl: pcmFetch(1),
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
  assert.equal(result.reviewBucket, 'course-audio-review');

  assert.equal(path.basename(encoded.outFile), 'week-1-listening.mp3');
  assert.equal(encoded.wav.subarray(0, 4).toString(), 'RIFF');
  const vtt = await readFile(path.join(dir, 'week-1-listening.vtt'), 'utf8');
  assert.match(vtt, /^WEBVTT\n/);
  assert.equal(vtt.match(/-->/g)?.length, 11);

  assert.equal(uploaded.length, 2);
  assert.deepEqual(
    uploaded.map((item) => item.key),
    [listeningTrialAudioKey(1), 'weeks-01-04/ai-trial/week-1-listening.vtt'],
  );
  assert.equal(uploaded[0].contentType, 'audio/mpeg');
  assert.equal(uploaded[1].contentType, 'text/vtt');

  // Recorded as an unreleased AI trial with no live audio URL and no public captions URL.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].table, 'listening_audio_trials');
  assert.equal(rows[0].row.week, 1);
  assert.equal(rows[0].row.source, 'ai-trial');
  assert.equal(rows[0].row.released, false);
  assert.equal(rows[0].row.audio_url, null, 'the live audioUrl must not be set before approval');
  assert.equal(rows[0].row.captions_url, null, 'captions stay private until approval');
  assert.equal(rows[0].row.caption_cues, 11);
  assert.equal(rows[0].row.model, 'eleven_multilingual_v2');
});

test('a rejected key stops the run before anything is uploaded', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'listening-trial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let uploads = 0;
  const client = {
    storage: { from: () => ({ upload: async () => (uploads++, { error: null }) }) },
    from: () => ({ upsert: async () => ({ error: null }) }),
  };
  const rejected = async () => new Response('{"detail":"invalid api key"}', { status: 401 });
  await assert.rejects(
    () =>
      generateListeningTrial({
        weekSpec: week(1),
        outputDir: dir,
        apiKey: 'bad-key',
        fetchImpl: rejected,
        client,
        upload: true,
      }),
    /ElevenLabs 401/,
  );
  assert.equal(uploads, 0, 'nothing is uploaded when synthesis fails');
});

test('the voice check records one clip per speaker with the same line', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'voice-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const requests = [];
  const uploaded = [];
  const client = {
    storage: {
      from: (bucket) => ({
        async upload(key, body, options) {
          assert.equal(bucket, 'course-audio-review');
          uploaded.push({ key, size: body.length, ...options });
          return { error: null };
        },
      }),
    },
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(fakePcm(6), { status: 200 });
  };
  const clips = await generateVoiceCheck({
    outputDir: dir,
    apiKey: 'k',
    client,
    upload: true,
    fetchImpl,
    encoder: async (wav, outFile) => writeFile(outFile, wav.subarray(0, 32)),
  });

  assert.equal(clips.length, 7);
  assert.deepEqual(clips.map((clip) => clip.speaker), Object.keys(SPEAKER_VOICES));
  assert.equal(new Set(requests.map((request) => request.body.text)).size, 1, 'the same line for every voice');
  assert.equal(requests[0].body.text, VOICE_CHECK_LINE);
  assert.equal(new Set(requests.map((request) => request.url)).size, 7, 'one distinct voice per clip');
  assert.deepEqual(
    uploaded.map((item) => item.key),
    Object.keys(SPEAKER_VOICES).map((speaker) => `weeks-01-04/ai-trial/voice-check-${speaker}.mp3`),
  );
  for (const clip of clips) {
    assert.equal(clip.url, null, 'nothing is public: the CLI signs links afterwards');
    assert.equal(clip.durationSeconds.toFixed(2), '6.00');
  }
});

test('the CLI estimate covers all four weeks and is close to two minutes', () => {
  for (const spec of weeks) {
    const lines = parseScript(spec.script, defaultSpeakerFor(spec));
    const seconds = estimateDurationSeconds(lines);
    assert.ok(seconds > 85 && seconds < 150, `week ${spec.week} estimates ${seconds}s`);
  }
});
