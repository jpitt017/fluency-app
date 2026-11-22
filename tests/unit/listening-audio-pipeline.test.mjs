import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the workflow saves only the review artefacts and requires the ElevenLabs secret', () => {
  assert.match(workflow, /ELEVENLABS_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI/);
  assert.match(workflow, /mode: voice-check|voice-check/);
});
