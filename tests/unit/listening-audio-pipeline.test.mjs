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
  PACE_PROFILES,
  VOICE_SETTINGS,
  rateForSpeaker,
  assembleTrack,
  assertDistinctVoices,
  assertKnownSpeakers,
  buildSpeechRequest,
  buildTrackVtt,
  buildUtterances,
  countWords,
  encodeMp3,
  parseScript,
  pauseSecondsFor,
  pcmDurationSeconds,
  pcmToWav,
  resolvePace,
  scheduleTrack,
  splitSentences,
  synthesiseTurn,
  voiceSettingsFor,
  wordsPerMinute,
} from '../../scripts/lib/course-audio/tts.mjs';
import {
  defaultSpeakerFor,
  estimateDurationSeconds,
  generateClip,
  generateListeningTrial,
  generateVoiceCheck,
  listeningTrialAudioKey,
  longestLineFor,
  readListeningWeeks,
  week3SampleLines,
} from '../../scripts/lib/course-audio/listening-trial.mjs';
import {
  generateSpeakingTrials,
  generateSpeakingVoiceCheck,
  publishSpeakingWeek,
  readSpeakingClipSpecs,
  SPEAKING_WEEK_SPEAKERS,
  speakingClipKey,
} from '../../scripts/lib/course-audio/speaking-trial.mjs';

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
      Tom: 'gpYTodEbX9z98axldaGD',
      Dan: 'sBU90Bu4NCleWDoNkGog',
      Marta: 'piJjfIKBZRMkss1Ifoyo',
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

test('the reviewed characters carry their own voice settings, and Week 1 keeps the defaults', () => {
  const expected = {
    // Reviewed twice for pace and energy: quicker than the course pace, with the
    // lowest stability and the highest style on the course.
    Tom: { stability: 0.25, style: 0.7, speed: 0.95 },
    Aisha: { stability: 0.35, style: 0.3 },
    Dan: { stability: 0.38, style: 0.25 },
    Marta: { stability: 0.3, style: 0.4 },
    // Reviewed for energy: stability down, style up, speed unchanged.
    Joanne: { stability: 0.25, style: 0.6, speed: 0.75 },
  };
  for (const [speaker, override] of Object.entries(expected)) {
    const request = buildSpeechRequest(speaker, 'Hello there.');
    assert.deepEqual(
      request.body.voice_settings,
      { ...VOICE_SETTINGS, ...override, speed: override.speed ?? B1_SPEECH_RATE },
      `${speaker} sends ${override.stability}/${override.style}`,
    );
    assert.equal(request.body.voice_settings.similarity_boost, 0.8);
    assert.equal(request.body.voice_settings.use_speaker_boost, true);
    // The character, not the week: the same settings wherever they speak.
    assert.deepEqual(voiceSettingsFor(speaker, 0.8), { ...VOICE_SETTINGS, ...override, speed: override.speed ?? 0.8 });
  }
  for (const speaker of ['Host', 'Ellie']) {
    assert.deepEqual(
      buildSpeechRequest(speaker, 'Hello there.').body.voice_settings,
      { ...VOICE_SETTINGS, speed: B1_SPEECH_RATE },
      `${speaker} keeps the default settings`,
    );
  }
  // The pace still comes from the caller, not from the voice.
  assert.equal(voiceSettingsFor('Host', 0.8).speed, 0.8);
  assert.equal(voiceSettingsFor('Host', 0.8).stability, 0.45);
});

test("only the voices with their own rate override the pace's speed", () => {
  // A character may carry their own rate: Joanne was measured too fast at 0.8 so
  // she reads at 0.75, and Tom was reviewed as too slow so he reads at 0.95.
  // Marta's voice needs the warmth in the *delivery*, not a slower tempo, so she
  // keeps the course speed.
  assert.equal(voiceSettingsFor('Joanne', 0.8).speed, 0.75);
  assert.equal(voiceSettingsFor('Joanne', 0.9).speed, 0.75, 'her rate wins over any pace');
  assert.equal(rateForSpeaker('Joanne', 'b1'), 0.75);
  assert.equal(voiceSettingsFor('Tom', 0.8).speed, 0.95);
  assert.equal(voiceSettingsFor('Tom', 0.9).speed, 0.95, 'his rate wins over any pace');
  assert.equal(rateForSpeaker('Tom', 'b1'), 0.95);
  for (const speaker of ['Host', 'Ellie', 'Aisha', 'Dan', 'Marta']) {
    assert.equal(rateForSpeaker(speaker, 'b1'), 0.8, `${speaker} keeps the course speed`);
  }
  // Her energy settings are her own and unrelated to the rate override.
  const joanne = voiceSettingsFor('Joanne', 0.8);
  assert.equal(joanne.stability, 0.25);
  assert.equal(joanne.style, 0.6);
  assert.equal(joanne.similarity_boost, 0.8);
  assert.equal(buildSpeechRequest('Joanne', 'Welcome to York!').body.voice_settings.speed, 0.75);
  assert.equal(buildSpeechRequest('Tom', 'I am!').body.voice_settings.speed, 0.95);
});

test('the replaced voices keep their accent labels, which are what a reviewer reads', () => {
  assert.equal(SPEAKER_VOICES.Tom.name, 'Jack C');
  assert.equal(SPEAKER_VOICES.Tom.accent, 'northern English');
  assert.equal(SPEAKER_VOICES.Marta.name, 'Katie');
  assert.equal(SPEAKER_VOICES.Marta.accent, 'West Midlands', 'the new voice is a Midlands voice');
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
    { speaker: 'Host', text: 'One.', pcm: fakePcm(2), boundary: 'none' },
    { speaker: 'Ellie', text: 'Two.', pcm: fakePcm(3), boundary: 'speaker' },
  ];
  const timing = scheduleTrack(turns);
  assert.deepEqual(
    timing.cues.map((cue) => [cue.index, cue.speaker, +cue.start.toFixed(2), +cue.end.toFixed(2)]),
    [
      [1, 'Host', 0, 2],
      [2, 'Ellie', 2.7, 5.7],
    ],
  );
  assert.equal(+timing.durationSeconds.toFixed(2), 5.7);
  assert.equal(+timing.speechSeconds.toFixed(2), 5);
  const audio = assembleTrack(turns);
  assert.equal(+pcmDurationSeconds(audio).toFixed(2), +timing.durationSeconds.toFixed(2));
});

test('the course pace is 0.8 with 0.3 s / 0.7 s / 0.8 s pauses, and it is the default', () => {
  assert.deepEqual(PACE_PROFILES.b1, {
    speed: 0.8,
    sentencePauseSeconds: 0.3,
    speakerPauseSeconds: 0.7,
    paragraphPauseSeconds: 0.8,
  });
  assert.equal(B1_SPEECH_RATE, 0.8);
  assert.deepEqual(resolvePace(), PACE_PROFILES.b1, 'every week uses it unless told otherwise');
  assert.deepEqual(resolvePace('b1'), PACE_PROFILES.b1);
  assert.throws(() => resolvePace('warm'), /Unknown pace "warm"/, 'the old warm profile is gone');
  assert.throws(() => resolvePace('shouty'), /Unknown pace "shouty"/);
  assert.equal(pauseSecondsFor('none'), 0);
  assert.equal(pauseSecondsFor('sentence'), 0.3);
  assert.equal(pauseSecondsFor('speaker'), 0.7);
  assert.equal(pauseSecondsFor('paragraph'), 0.8);
  // Joanne reads her monologue with less air between sentences, and only she
  // does: the speaker and paragraph gaps stay the course's.
  assert.equal(pauseSecondsFor('sentence', 'b1', 'Joanne'), 0.15);
  assert.equal(pauseSecondsFor('speaker', 'b1', 'Joanne'), 0.7);
  assert.equal(pauseSecondsFor('paragraph', 'b1', 'Joanne'), 0.8);
  for (const speaker of ['Host', 'Ellie', 'Aisha', 'Tom', 'Dan', 'Marta']) {
    assert.equal(pauseSecondsFor('sentence', 'b1', speaker), 0.3, `${speaker} keeps 0.3 s`);
  }

  const turns = [
    { speaker: 'Dan', text: 'One.', pcm: fakePcm(2), boundary: 'none' },
    { speaker: 'Dan', text: 'Two.', pcm: fakePcm(2), boundary: 'sentence' },
    { speaker: 'Marta', text: 'Three.', pcm: fakePcm(2), boundary: 'speaker' },
    { speaker: 'Marta', text: 'Four.', pcm: fakePcm(2), boundary: 'paragraph' },
  ];
  const timing = scheduleTrack(turns);
  assert.deepEqual(
    timing.cues.map((cue) => [+cue.start.toFixed(2), +cue.end.toFixed(2)]),
    [
      [0, 2],
      [2.3, 4.3],
      [5.0, 7.0],
      [7.8, 9.8],
    ],
  );
  assert.equal(+timing.durationSeconds.toFixed(2), 9.8);
  assert.equal(+timing.speechSeconds.toFixed(2), 8);
  const audio = assembleTrack(turns);
  assert.equal(+pcmDurationSeconds(audio).toFixed(2), +timing.durationSeconds.toFixed(2));
});

test('lines are split into sentences, but not on titles, initials or numbers', () => {
  assert.deepEqual(splitSentences('Oh no! OK. Is there a cleaning rota?'), [
    'Oh no!',
    'OK.',
    'Is there a cleaning rota?',
  ]);
  assert.deepEqual(
    splitSentences("They go out on Wednesday night. Oh, and you mustn't put glass in the green bin. The council won't collect it."),
    ['They go out on Wednesday night.', "Oh, and you mustn't put glass in the green bin.", "The council won't collect it."],
  );
  // One long sentence with a number inside stays whole.
  assert.deepEqual(
    splitSentences(
      'Work on the cathedral was started in the thirteenth century, and it was finished in 1472, so it took more than two hundred and fifty years to build.',
    ),
    [
      'Work on the cathedral was started in the thirteenth century, and it was finished in 1472, so it took more than two hundred and fifty years to build.',
    ],
  );
  // 3.5, Mr., Dr., e.g. and initials do not end a sentence.
  assert.deepEqual(splitSentences('Mr. Smith walked 3.5 miles. Dr. Jones agreed.'), [
    'Mr. Smith walked 3.5 miles.',
    'Dr. Jones agreed.',
  ]);
  assert.deepEqual(splitSentences('J. K. Rowling wrote it, e.g. in 1997.'), ['J. K. Rowling wrote it, e.g. in 1997.']);
  assert.deepEqual(splitSentences('Cost is approx. 20 pounds, etc. and no more.'), ['Cost is approx. 20 pounds, etc. and no more.']);
  // A closing quote stays with the sentence it closes.
  assert.deepEqual(splitSentences('"Come in." She did.'), ['"Come in."', 'She did.']);
  assert.deepEqual(splitSentences('   '), []);
  assert.equal(countWords('one two  three'), 3);
});

test('every sentence is one utterance, and the pause kind follows the boundary', () => {
  const lines = parseScript(
    'Host: One. Two!\n\nEllie: Three?\n\nHost: Four.\n\nHost: Five.',
    'Host',
  );
  const utterances = buildUtterances(lines);
  assert.deepEqual(
    utterances.map((utterance) => [utterance.speaker, utterance.text, utterance.boundary]),
    [
      ['Host', 'One.', 'none'],
      ['Host', 'Two!', 'sentence'],
      ['Ellie', 'Three?', 'speaker'],
      ['Host', 'Four.', 'speaker'],
      ['Host', 'Five.', 'paragraph'],
    ],
  );
  assert.deepEqual(
    utterances.map((utterance) => utterance.sentenceIndex),
    [1, 2, 1, 1, 1],
  );
});

test('one caption cue per sentence, timed to the sentence', () => {
  const lines = parseScript('Host: One. Two!\n\nEllie: Three.', 'Host');
  const utterances = buildUtterances(lines);
  const turns = utterances.map((utterance) => ({ ...utterance, pcm: fakePcm(1) }));
  const vtt = buildTrackVtt(scheduleTrack(turns));
  assert.equal(vtt.match(/-->/g)?.length, 3, 'three sentences, three cues');
  assert.match(vtt, /<v Host>One\.<\/v>/);
  assert.match(vtt, /<v Host>Two!<\/v>/);
  assert.match(vtt, /<v Ellie>Three\.<\/v>/);
});

test('words per minute is measured from the timeline, pauses included', () => {
  assert.equal(wordsPerMinute(140, 60), 140);
  assert.equal(wordsPerMinute(0, 0), 0);
  assert.equal(wordsPerMinute(230, 120), 115);
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
  // Week 1 is 25 sentences: one request and one caption cue each.
  assert.equal(result.sentences, 25);
  assert.equal(result.cues, 25);
  assert.equal(result.rate, 0.8, 'the reviewed speed');
  assert.ok(result.durationSeconds > 10, 'pauses are included in the length');
  assert.ok(result.words > 200);
  assert.equal(result.wordsPerMinute, Math.round((result.words / result.durationSeconds) * 60 * 10) / 10);
  assert.deepEqual(result.settings.Ellie, { ...VOICE_SETTINGS, speed: 0.8 }, 'Week 1 is unchanged');
  assert.equal(result.uploaded, true);
  assert.equal(result.reviewBucket, 'course-audio-review');

  assert.equal(path.basename(encoded.outFile), 'week-1-listening.mp3');
  assert.equal(encoded.wav.subarray(0, 4).toString(), 'RIFF');
  const vtt = await readFile(path.join(dir, 'week-1-listening.vtt'), 'utf8');
  assert.match(vtt, /^WEBVTT\n/);
  assert.equal(vtt.match(/-->/g)?.length, 25, 'one cue per sentence');

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
  assert.equal(rows[0].row.caption_cues, 25);
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

test('the voice check reads the three requested clips, at the course pace and settings', async (t) => {
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
    return new Response(fakePcm(2), { status: 200 });
  };
  const clips = await generateVoiceCheck({
    outputDir: dir,
    apiKey: 'k',
    client,
    upload: true,
    fetchImpl,
    encoder: async (wav, outFile) => writeFile(outFile, wav.subarray(0, 32)),
  });

  // Exactly the clips a review asked for, plus Joanne's opening paragraph, which
  // is the read her new settings and her shorter sentence gaps are judged on.
  assert.deepEqual(
    clips.map((clip) => clip.key.split('/').pop()),
    ['tom-two-lines.mp3', 'marta-three-turns.mp3', 'ellie-longest.mp3', 'joanne-opening.mp3'],
  );
  assert.equal(uploaded.length, 4);

  const byKey = Object.fromEntries(clips.map((clip) => [clip.key.split('/').pop(), clip]));
  const week1 = weeks.find((item) => item.week === 1);
  const week2 = weeks.find((item) => item.week === 2);
  const week3 = weeks.find((item) => item.week === 3);

  assert.deepEqual(
    byKey['tom-two-lines.mp3'].lines.map((line) => line.text),
    parseScript(week2.script, 'Aisha').filter((line) => line.speaker === 'Tom').slice(0, 2).map((line) => line.text),
  );
  assert.deepEqual(byKey['ellie-longest.mp3'].lines, [longestLineFor(week1, 'Ellie')]);

  const authored3 = parseScript(week3.script, 'Dan');
  const martaLongest = authored3
    .filter((line) => line.speaker === 'Marta')
    .sort((a, b) => countWords(b.text) - countWords(a.text) || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((line) => line.text);
  assert.deepEqual(
    byKey['marta-three-turns.mp3'].lines.map((line) => line.text),
    martaLongest,
    "Marta's three longest turns, in script order",
  );
  assert.deepEqual(byKey['marta-three-turns.mp3'].speakers, ['Marta']);
  // Her three longest turns, and no shorter interjection ("Perfect. Thanks, Dan."
  // is 3 words), which is what makes a fair clip to judge a voice on.
  assert.equal(byKey['marta-three-turns.mp3'].lines.some((line) => line.text.startsWith('Perfect. Thanks')), false);

  // Tom's reviewed settings and his own faster rate; Marta's approved settings at
  // the course speed; Ellie unchanged except for the pace; Joanne's new energy
  // settings with her unchanged rate.
  assert.deepEqual(byKey['tom-two-lines.mp3'].settings, { ...VOICE_SETTINGS, stability: 0.25, style: 0.7, speed: 0.95 });
  assert.deepEqual(byKey['marta-three-turns.mp3'].settings, { ...VOICE_SETTINGS, stability: 0.3, style: 0.4, speed: 0.8 });
  assert.deepEqual(byKey['ellie-longest.mp3'].settings, { ...VOICE_SETTINGS, speed: 0.8 });
  assert.deepEqual(byKey['joanne-opening.mp3'].settings, { ...VOICE_SETTINGS, stability: 0.25, style: 0.6, speed: 0.75 });
  for (const request of requests) {
    const tom = request.url.includes(SPEAKER_VOICES.Tom.voice);
    const joanneRequest = request.url.includes(SPEAKER_VOICES.Joanne.voice);
    assert.equal(request.body.voice_settings.speed, tom ? 0.95 : joanneRequest ? 0.75 : 0.8);
    assert.doesNotMatch(request.body.text, /^(Host|Ellie|Aisha|Tom|Dan|Marta|Joanne):\s/, 'no label reaches the voice');
  }
  assert.deepEqual(
    [...new Set(requests.map((request) => request.url))].sort(),
    [SPEAKER_VOICES.Ellie.voice, SPEAKER_VOICES.Marta.voice, SPEAKER_VOICES.Tom.voice, SPEAKER_VOICES.Joanne.voice]
      .map((voice) => `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_24000`)
      .sort(),
    'only the four auditioned voices are called',
  );

  // Words per minute is reported per clip, from the timeline.
  for (const clip of clips) {
    assert.ok(clip.words > 0);
    assert.ok(clip.durationSeconds > 0);
    assert.equal(clip.wordsPerMinute, Math.round((clip.words / clip.durationSeconds) * 60 * 10) / 10);
  }
  assert.deepEqual(uploaded.map((item) => item.contentType), Array(clips.length).fill('audio/mpeg'));
});

test('one named clip can be re-recorded on its own, and an unknown name is refused', async (t) => {
  // Tom's settings changed and the other two clips were already approved, so the
  // run must not spend the quota re-synthesising audio nobody asked to hear.
  const dir = await mkdtemp(path.join(tmpdir(), 'voice-only-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const requests = [];
  const uploaded = [];
  const client = {
    storage: {
      from: () => ({
        async upload(key) {
          uploaded.push(key);
          return { error: null };
        },
      }),
    },
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(fakePcm(2), { status: 200 });
  };
  const encoder = async (wav, outFile) => writeFile(outFile, wav.subarray(0, 32));

  const clips = await generateVoiceCheck({
    outputDir: dir,
    apiKey: 'k',
    client,
    upload: true,
    fetchImpl,
    encoder,
    onlyKeys: ['tom-two-lines'],
  });

  // Exactly one clip, one upload, and no audio for anyone else.
  assert.equal(clips.length, 1);
  assert.equal(clips[0].key, 'weeks-01-04/ai-trial/tom-two-lines.mp3');
  assert.deepEqual(uploaded, ['weeks-01-04/ai-trial/tom-two-lines.mp3']);
  assert.deepEqual(clips[0].speakers, ['Tom']);
  assert.ok(clips[0].words > 0 && clips[0].durationSeconds > 0);
  assert.ok(clips[0].wordsPerMinute > 0);

  // It is Tom's own first two Week 2 lines, and only his voice is called.
  const week2 = weeks.find((item) => item.week === 2);
  const tomLines = parseScript(week2.script, 'Aisha')
    .filter((line) => line.speaker === 'Tom')
    .slice(0, 2)
    .map((line) => line.text);
  assert.deepEqual(clips[0].lines.map((line) => line.text), tomLines);
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.ok(request.url.includes(SPEAKER_VOICES.Tom.voice), 'every request is Tom');
    assert.equal(request.body.voice_settings.stability, 0.25);
    assert.equal(request.body.voice_settings.style, 0.7);
    assert.equal(request.body.voice_settings.speed, 0.95);
  }

  // A typo must fail loudly instead of producing an empty, successful run.
  await assert.rejects(
    () =>
      generateVoiceCheck({
        outputDir: dir,
        apiKey: 'k',
        client,
        upload: false,
        fetchImpl,
        encoder,
        onlyKeys: ['tom-two-line'],
      }),
    /No voice-check clip named tom-two-line/,
  );
});

test('a multi-turn clip keeps a real gap between its turns', async (t) => {
  // Without a boundary between sampled lines, three turns would be spliced into
  // one breathless run and the clip would report a pace it does not have.
  const dir = await mkdtemp(path.join(tmpdir(), 'clip-gaps-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const week3 = weeks.find((item) => item.week === 3);
  const marta = parseScript(week3.script, 'Dan').filter((line) => line.speaker === 'Marta').slice(1, 3);
  const lines = marta.map((line) => ({ speaker: 'Marta', text: line.text, lineIndex: line.index }));

  const clip = await generateClip({
    key: 'gap-check',
    title: 'gap check',
    lines,
    outputDir: dir,
    apiKey: 'k',
    fetchImpl: async () => new Response(fakePcm(2), { status: 200 }),
    encoder: async (wav, outFile) => writeFile(outFile, wav.subarray(0, 32)),
  });

  const sentenceCount = lines.reduce((sum, line) => sum + splitSentences(line.text).length, 0);
  const expected =
    sentenceCount * 2 + // two seconds of PCM per sentence
    (sentenceCount - lines.length) * PACE_PROFILES.b1.sentencePauseSeconds +
    (lines.length - 1) * PACE_PROFILES.b1.paragraphPauseSeconds;
  assert.equal(clip.durationSeconds, +expected.toFixed(2), 'one paragraph gap between turns, sentences inside them');
});

test('the Week 3 sample reads three of each speaker\'s longest lines, at the course pace', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'week-sample-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const authoredPath = new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url);
  const before = readFileSync(authoredPath);
  const weekSpec = weeks.find((item) => item.week === 3);
  const authored = parseScript(weekSpec.script, 'Dan');
  assert.equal(new Set(authored.map((line) => line.speaker)).size, 2, 'week 3 is a two-hander');

  const chosen = week3SampleLines(weekSpec);
  assert.deepEqual(Object.keys(chosen), ['Dan', 'Marta']);
  for (const speaker of ['Dan', 'Marta']) {
    const own = authored.filter((line) => line.speaker === speaker);
    const longest = [...own]
      .sort((a, b) => countWords(b.text) - countWords(a.text) || a.index - b.index)
      .slice(0, 3)
      .sort((a, b) => a.index - b.index);
    assert.deepEqual(chosen[speaker].map((line) => line.text), longest.map((line) => line.text));
    assert.equal(chosen[speaker].length, 3);
  }
  // The short closes are what a reviewer must not have to judge her on.
  assert.equal(chosen.Marta.some((line) => line.text.startsWith('Perfect. Thanks')), false);

  const requests = [];
  const uploaded = [];
  const client = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'course-audio-review', 'samples are never public');
        return {
          async upload(key, body, options) {
            uploaded.push({ key, size: body.length, ...options });
            return { error: null };
          },
        };
      },
    },
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(fakePcm(2), { status: 200 });
  };
  const clips = [];
  for (const [speaker, lines] of Object.entries(chosen)) {
    clips.push(
      await generateClip({
        key: `week-3-sample-${speaker}`,
        title: `${speaker} — three lines`,
        lines,
        outputDir: dir,
        apiKey: 'k',
        client,
        upload: true,
        fetchImpl,
        encoder: async (wav, outFile) => writeFile(outFile, wav.subarray(0, 32)),
      }),
    );
  }

  assert.deepEqual(
    uploaded.map((item) => item.key),
    ['weeks-01-04/ai-trial/week-3-sample-Dan.mp3', 'weeks-01-04/ai-trial/week-3-sample-Marta.mp3'],
  );
  assert.deepEqual(clips.map((clip) => clip.speakers), [['Dan'], ['Marta']]);
  const SAMPLE_SETTINGS = {
    Dan: { stability: 0.38, style: 0.25 },
    Marta: { stability: 0.3, style: 0.4 },
  };
  for (const clip of clips) {
    const speaker = clip.speakers[0];
    assert.deepEqual(clip.settings, { ...VOICE_SETTINGS, ...SAMPLE_SETTINGS[speaker], speed: 0.8 });
    assert.deepEqual(clip.pace, resolvePace('b1'));
    // Three lines, each split into sentences: the request text is the sentences.
    assert.deepEqual(
      requests
        .filter((request) => request.url.includes(SPEAKER_VOICES[speaker].voice))
        .map((request) => request.body.text),
      clip.lines.flatMap((line) => splitSentences(line.text)),
    );
    assert.equal(clip.wordsPerMinute, Math.round((clip.words / clip.durationSeconds) * 60 * 10) / 10);
  }

  // The listening script is an input, never an output.
  assert.equal(readFileSync(authoredPath).equals(before), true, 'weeks-01-04-details.json is untouched');
  assert.doesNotMatch(cli, /writeFile\([^)]*weeks-01-04-details\.json/, 'the CLI never writes the authored script');
});

test('the workflow offers a one-week voice sample and ships it as the `week-sample` artifact', () => {
  assert.match(
    workflow,
    /options: \[speaking-voice-check, speaking-generate, speaking-release, speaking-revoke, voice-check, voice-sample, generate, review, release, revoke, delete, delete-probes, list\]/,
  );
  assert.match(workflow, /description: 'voice-sample: pace profile \(b1 is the course pace\)'/);
  assert.match(workflow, /options: \[b1\]/, 'the warm profile is gone');

  const runBlock = workflow.split('- name: Voice sample — each speaker\'s three longest lines')[1]?.split('- name:')[0];
  assert.ok(runBlock, 'the mode has a step');
  assert.match(runBlock, /if: \$\{\{ inputs\.mode == 'voice-sample' \}\}/);
  assert.match(runBlock, /--voice-sample "\$\{\{ inputs\.weeks \}\}" --pace "\$\{\{ inputs\.pace \}\}"/);

  const artifact = workflow.split('- name: Voice sample clips for a listen')[1]?.split('- name:')[0];
  assert.ok(artifact, 'the sample travels as an artifact');
  assert.match(artifact, /uses: actions\/upload-artifact@v7/);
  assert.match(artifact, /name: week-sample\n/);
  assert.match(artifact, /path: voice-samples\//);
  assert.match(artifact, /retention-days: 3/);

  // Never a full re-record, and never a release, from the sample path.
  assert.match(cli, /--voice-sample takes exactly one week/);
  assert.match(cli, /path\.join\(process\.cwd\(\), 'voice-samples'\)/);
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^\/voice-samples\/$/m);
});

test('the speaking voice check reads the Week 1 model and first two chunks with Aisha and half-second pads', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'speaking-voice-check-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const requests = [];
  const fetchImpl = fakeFetch(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, arrayBuffer: async () => fakePcm(2) };
  });
  const clips = await generateSpeakingVoiceCheck({
    apiKey: 'test-key',
    outputDir,
    fetchImpl,
    encoder: async (wav, output) => writeFile(output, wav),
  });

  assert.deepEqual(clips.map((clip) => clip.key), [
    'weeks-01-04/ai-trial/speaking-week-1-model.mp3',
    'weeks-01-04/ai-trial/speaking-week-1-shadowing-1.mp3',
    'weeks-01-04/ai-trial/speaking-week-1-shadowing-2.mp3',
  ]);
  assert.equal(requests.length, 3);
  for (const [index, { url, body }] of requests.entries()) {
    assert.ok(url.includes(SPEAKER_VOICES.Aisha.voice));
    if (index === 0) assert.match(body.text, /^When I moved to a new city/);
    assert.equal(body.voice_settings.speed, 0.8);
  }
  assert.match(requests[1].body.text, /^It took me a few weeks/);
  assert.match(requests[2].body.text, /^I'd never run with a group/);

  for (const clip of clips) {
    assert.equal(clip.speaker, 'Aisha');
    assert.equal(clip.pace, 0.8);
    assert.equal(clip.leadingAndTrailingSilenceSeconds, 0.5);
    assert.equal(clip.speechSeconds, 2);
    assert.equal(clip.durationSeconds, 3);
    assert.equal(clip.wordsPerMinute, wordsPerMinute(clip.words, 3));
    assert.equal(clip.speakingWordsPerMinute, wordsPerMinute(clip.words, 2));
    const wav = await readFile(clip.mp3Path);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    const pcm = wav.subarray(44);
    assert.ok(pcm.subarray(0, 24_000).every((sample) => sample === 0), '0.5s leading silence');
    assert.ok(pcm.subarray(pcm.length - 24_000).every((sample) => sample === 0), '0.5s trailing silence');
  }
  assert.match(workflow, /speaking-voice-check/);
  assert.match(cli, /--speaking-voice-check/);
});

test('speaking generation creates and uploads all 16 authored clips unreleased with speaker assignments and WPM', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'speaking-trials-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const requests = [];
  const uploads = [];
  const client = {
    storage: {
      from: (bucket) => ({
        upload: async (key, body, options) => {
          uploads.push({ bucket, key, body, options });
          return { error: null };
        },
      }),
    },
  };
  const clips = await generateSpeakingTrials({
    apiKey: 'test-key',
    client,
    outputDir,
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(fakePcm(2));
    },
    encoder: async (wav, output) => writeFile(output, wav),
  });
  const specs = await readSpeakingClipSpecs();

  assert.equal(clips.length, 16);
  assert.equal(uploads.length, 16);
  assert.equal(requests.length, 16);
  assert.deepEqual(Object.keys(SPEAKING_WEEK_SPEAKERS).map(Number), [1, 2, 3, 4]);
  assert.deepEqual(clips.map((clip) => clip.key), specs.map((spec) => spec.key));
  for (const [index, clip] of clips.entries()) {
    assert.equal(clip.speaker, SPEAKING_WEEK_SPEAKERS[clip.week]);
    assert.equal(clip.pace, 0.8);
    assert.equal(clip.durationSeconds, 3, 'two-second mocked speech plus two half-second pads');
    assert.equal(clip.wordsPerMinute, wordsPerMinute(clip.words, 3));
    assert.equal(clip.speakingWordsPerMinute, wordsPerMinute(clip.words, 2));
    assert.equal(requests[index].body.voice_settings.speed, 0.8);
    assert.ok(requests[index].url.includes(SPEAKER_VOICES[clip.speaker].voice));
    assert.equal(uploads[index].bucket, 'course-audio-review');
    assert.equal(uploads[index].key, clip.key);
    const wav = await readFile(clip.mp3Path);
    const pcm = wav.subarray(44);
    assert.ok(pcm.subarray(0, 24_000).every((sample) => sample === 0));
    assert.ok(pcm.subarray(pcm.length - 24_000).every((sample) => sample === 0));
  }
  assert.deepEqual(clips.filter((clip) => clip.kind === 'model').map((clip) => clip.speaker), [
    'Aisha', 'Host', 'Aisha', 'Host',
  ]);
});

test('speaking release copies only one week from private to public and does not write approval rows', async () => {
  const operations = [];
  const client = {
    storage: {
      from: (bucket) => ({
        download: async (key) => {
          operations.push(['download', bucket, key]);
          return { data: new Blob([`audio:${key}`]), error: null };
        },
        upload: async (key) => {
          operations.push(['upload', bucket, key]);
          return { error: null };
        },
        getPublicUrl: (key) => ({ data: { publicUrl: `https://audio.test/${key}` } }),
      }),
    },
  };
  const keys = await publishSpeakingWeek(client, 2);
  assert.deepEqual(keys, [
    speakingClipKey(2, 'model'),
    speakingClipKey(2, 'shadowing', 1),
    speakingClipKey(2, 'shadowing', 2),
    speakingClipKey(2, 'shadowing', 3),
  ]);
  assert.deepEqual(operations.map(([op, bucket, key]) => [op, bucket, key]), keys.flatMap((key) => [
    ['download', 'course-audio-review', key],
    ['upload', 'course-audio', key],
  ]));
  assert.throws(() => speakingClipKey(5, 'model'), /Refusing speaking audio/);
});

test('the speaking mode exposes private generation and gated release, with a review artifact', () => {
  assert.match(workflow, /options: \[speaking-voice-check, speaking-generate, speaking-release,/);
  assert.match(workflow, /name: speaking-review\n/);
  assert.match(workflow, /path: audio-out\/speaking-01-04\//);
  assert.match(workflow, /inputs\.mode == 'speaking-release'/);
  assert.match(workflow, /node scripts\/generate-course-audio\.mjs --speaking-release/);
  const releaseStep = workflow.split('- name: Release approved speaking clips')[1]?.split('- name:')[0];
  assert.ok(releaseStep, 'speaking release is a separate explicit workflow mode');
  assert.match(releaseStep, /ALLOW_PRODUCTION_RELEASE: \$\{\{ inputs\.allow_production_release && inputs\.production_ack == 'release to learners'/);
  const cliRelease = cli.split('async function releaseSpeaking')[1]?.split('async function speakingVoiceCheck')[0];
  assert.ok(cliRelease);
  assert.match(cliRelease, /checkApprovalTarget\(\{ url: supabaseUrl, bypass: isApprovalBypassRequested\(\) \}\)/);
  assert.match(cliRelease, /if \(!verdict\.ok\) throw new Error\(verdict\.reason\)/);
  assert.match(cli, /--speaking-generate/);
  assert.match(cli, /--speaking-release/);
  assert.match(cli, /::notice title=Speaking clip WPM::/);
});

test('the dry-run estimate covers all four weeks and lands in the reviewed pace window', () => {
  for (const spec of weeks) {
    const lines = parseScript(spec.script, defaultSpeakerFor(spec));
    const estimate = estimateDurationSeconds(lines);
    assert.ok(estimate.seconds > 85 && estimate.seconds < 175, `week ${spec.week} estimates ${Math.round(estimate.seconds)}s`);
    assert.ok(estimate.words > 200, `week ${spec.week} has ${estimate.words} words`);
    assert.ok(estimate.speechSeconds < estimate.seconds, 'the pauses are part of the length');
  }
});
