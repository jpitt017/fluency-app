import 'server-only';
import Groq from 'groq-sdk';
import { sanitizeLearnerText } from '@/lib/b1b2/prompt-guard';

/** Shared by speaking transcription and issue reporting. */
export async function transcribeAudio(audio: File): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Speech service is not configured.');
  const result = await new Groq({ apiKey }).audio.transcriptions.create({
    file: audio, model: 'whisper-large-v3-turbo', language: 'en', response_format: 'json',
  });
  return sanitizeLearnerText(result.text, 4000).text;
}
