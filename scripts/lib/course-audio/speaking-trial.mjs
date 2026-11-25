/**
 * Speaking model voice checks for Weeks 1–4. This mode only creates local
 * workflow-run files and never uploads to Storage or changes release state.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SPEAKER_VOICES,
  TTS_MODEL,
  encodeMp3,
  pcmToWav,
  resolvePace,
  silence,
  synthesiseTurn,
  wordsPerMinute,
  countWords,
} from './tts.mjs';

export const SPEAKING_CURRICULUM = 'supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
export const SPEAKING_PAUSE_SECONDS = 0.5;

/**
 * Build the Week 1 check: the authored full model and its first two authored
 * shadowing chunks, read by Aisha at the approved B1 speed.
 */
export async function generateSpeakingVoiceCheck(options) {
  const {
    apiKey,
    outputDir,
    curriculum = SPEAKING_CURRICULUM,
    speaker = 'Aisha',
    pace = 'b1',
    fetchImpl,
    encoder = encodeMp3,
    log = () => {},
  } = options;
  if (!SPEAKER_VOICES[speaker]) throw new Error(`No voice configured for speaker "${speaker}"`);
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const document = JSON.parse(await readFile(curriculum, 'utf8'));
  const week = document?.weeks?.find((item) => item.number === 1);
  const speaking = week?.speaking;
  if (!speaking?.model || !Array.isArray(speaking.shadowingChunks) || speaking.shadowingChunks.length < 2) {
    throw new Error('Week 1 speaking model and at least two shadowing chunks are required');
  }
  const resolvedPace = resolvePace(pace);
  const selections = [
    {
      key: 'week-1-speaking-model',
      title: 'Week 1 speaking model',
      text: speaking.model.replace(/^>\s*/, '').replace(/\s+/g, ' ').trim(),
    },
    ...speaking.shadowingChunks.slice(0, 2).map((item, index) => ({
      key: `week-1-shadowing-${index + 1}`,
      title: `Week 1 shadowing chunk ${index + 1}`,
      text: item.chunk,
    })),
  ];

  await mkdir(outputDir, { recursive: true });
  const clips = [];
  for (const selection of selections) {
    log(`  ${selection.title} — ${speaker}`);
    const turn = await synthesiseTurn({
      speaker,
      text: selection.text,
      apiKey,
      rate: resolvedPace.speed,
      fetchImpl,
      log,
    });
    const paddedPcm = Buffer.concat([
      silence(SPEAKING_PAUSE_SECONDS),
      turn.pcm,
      silence(SPEAKING_PAUSE_SECONDS),
    ]);
    const mp3Path = path.join(outputDir, `${selection.key}.mp3`);
    await encoder(pcmToWav(paddedPcm), mp3Path);
    const words = countWords(selection.text);
    const speechSeconds = turn.pcm.length / (2 * 24_000);
    const durationSeconds = paddedPcm.length / (2 * 24_000);
    clips.push({
      ...selection,
      speaker,
      voice: SPEAKER_VOICES[speaker].name,
      voiceId: SPEAKER_VOICES[speaker].voice,
      model: TTS_MODEL,
      pace: resolvedPace.speed,
      words,
      speechSeconds: Number(speechSeconds.toFixed(2)),
      durationSeconds: Number(durationSeconds.toFixed(2)),
      wordsPerMinute: wordsPerMinute(words, durationSeconds),
      speakingWordsPerMinute: wordsPerMinute(words, speechSeconds),
      leadingAndTrailingSilenceSeconds: SPEAKING_PAUSE_SECONDS,
      mp3Path,
    });
  }
  return clips;
}
