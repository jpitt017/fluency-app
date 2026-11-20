/**
 * Canonical audio URL resolution & WebVTT caption generation.
 *
 * Audio assets can live in:
 * 1. An explicit CDN / S3 URL (`https://...`)
 * 2. Supabase Storage `course-audio` bucket when `NEXT_PUBLIC_AUDIO_STORAGE=supabase`
 *    or `NEXT_PUBLIC_AUDIO_CDN_URL` is configured
 * 3. Local `/audio/...` path during development / bundled Module 1 starter audio
 */
export function resolveAudioUrl(audioUrl: string | null | undefined): string | null {
  if (!audioUrl) return null;
  const trimmed = audioUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const cdnBase = process.env.NEXT_PUBLIC_AUDIO_CDN_URL?.replace(/\/$/, '');
  const relativeKey = trimmed.replace(/^\/?audio\//, '').replace(/^\//, '');

  if (cdnBase) {
    return `${cdnBase}/${relativeKey}`;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (process.env.NEXT_PUBLIC_AUDIO_STORAGE === 'supabase' && supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/course-audio/${relativeKey}`;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function formatVttTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Generates an accessible WebVTT caption track Data URL from a transcript
 * so <audio> elements have <track kind="captions"> support out of the box.
 */
export function buildTranscriptVttDataUrl(
  body: string,
  durationSeconds?: number | null,
): string {
  const rawCues = body
    .split(/(?=\b[A-Z][A-Z0-9 ]{1,18}:)|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const cues = rawCues.length ? rawCues : [body.trim()];
  const totalWords = cues.reduce((sum, c) => sum + c.split(/\s+/).filter(Boolean).length, 0) || 1;
  const totalDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : Math.max(12, Math.round(totalWords / 2.3));

  let cursor = 0;
  const lines = ['WEBVTT', ''];
  cues.forEach((cue, idx) => {
    const words = cue.split(/\s+/).filter(Boolean).length || 1;
    const span = (words / totalWords) * totalDuration;
    const start = cursor;
    const end = idx === cues.length - 1 ? totalDuration : cursor + span;
    cursor = end;
    lines.push(`${idx + 1}`);
    lines.push(`${formatVttTime(start)} --> ${formatVttTime(end)}`);
    lines.push(cue);
    lines.push('');
  });

  return `data:text/vtt;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`;
}
