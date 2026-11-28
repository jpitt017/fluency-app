/**
 * Configuration and daily-limit helpers for British TTS on "Your answer, improved".
 *
 * Voices and B1 pace mirror the reviewed ElevenLabs voices in
 * `scripts/lib/course-audio/tts.mjs` so learner playback always uses an
 * approved British/Irish voice by default (`Host` = Jack Anthony, southern English).
 */

export const DAILY_TTS_LIMIT = 2;
export const DEFAULT_MONTHLY_TTS_CHAR_LIMIT = 40_000;
export const IMPROVED_TTS_ENDPOINT = '/api/speaking/improved-tts';
export const ELEVEN_TTS_MODEL_ID = 'eleven_multilingual_v2';
export const B1_TTS_SPEED = 0.8;

/**
 * Feature flag for server-side ElevenLabs TTS on "Your answer, improved".
 * Off by default (`false`) so ElevenLabs is never called in production without
 * a commercial licence; only `'true'` or `'1'` enables it.
 */
export function isImprovedAnswerTtsEnabled(rawFlag) {
  if (typeof rawFlag !== 'string') return false;
  const normalized = rawFlag.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/**
 * Monthly total character limit across all learners for ElevenLabs improved-answer TTS.
 * Defaults to 40,000 characters when unset or invalid.
 */
export function resolveMonthlyTtsCharLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === null || String(rawLimit).trim() === '') {
    return DEFAULT_MONTHLY_TTS_CHAR_LIMIT;
  }
  const parsed = Number(String(rawLimit).trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MONTHLY_TTS_CHAR_LIMIT;
  }
  return Math.floor(parsed);
}

export const BASE_TTS_VOICE_SETTINGS = Object.freeze({
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0,
  use_speaker_boost: true,
});

export const APPROVED_BRITISH_VOICES = Object.freeze({
  Host: Object.freeze({
    voice: 'sp7QaEHmiNEd5HgrXuOo',
    name: 'Jack Anthony',
    accent: 'southern English',
    settings: Object.freeze({}),
  }),
  Ellie: Object.freeze({
    voice: 'VGEVi3E0hARQ99wIXvJG',
    name: 'Jenny',
    accent: 'Scottish',
    settings: Object.freeze({}),
  }),
  Aisha: Object.freeze({
    voice: 'jUPSOpRcPt8GMPsWx5fy',
    name: 'Ruby B',
    accent: 'London',
    settings: Object.freeze({ stability: 0.35, style: 0.3 }),
  }),
  Tom: Object.freeze({
    voice: 'gpYTodEbX9z98axldaGD',
    name: 'Jack C',
    accent: 'northern English',
    settings: Object.freeze({ stability: 0.25, style: 0.7, speed: 0.95 }),
  }),
  Dan: Object.freeze({
    voice: 'sBU90Bu4NCleWDoNkGog',
    name: 'Richard',
    accent: 'Welsh',
    settings: Object.freeze({ stability: 0.38, style: 0.25 }),
  }),
  Marta: Object.freeze({
    voice: 'piJjfIKBZRMkss1Ifoyo',
    name: 'Katie',
    accent: 'West Midlands',
    settings: Object.freeze({ stability: 0.3, style: 0.4 }),
  }),
  Joanne: Object.freeze({
    voice: 'ZR8ruiC9tbg7bV9RmBmC',
    name: 'Miri',
    accent: 'Yorkshire',
    settings: Object.freeze({ stability: 0.25, style: 0.6, speed: 0.75 }),
  }),
});

/** Default approved British voice (`Host` — Jack Anthony, southern English). */
export const DEFAULT_APPROVED_BRITISH_VOICE_ID = APPROVED_BRITISH_VOICES.Host.voice;

export const APPROVED_BRITISH_VOICE_IDS = Object.freeze(
  Object.values(APPROVED_BRITISH_VOICES).map((entry) => entry.voice),
);

/**
 * Resolves the ElevenLabs voice ID and reviewed B1 voice settings.
 * Defaults to the approved southern-English `Host` voice (`sp7QaEHmiNEd5HgrXuOo`)
 * and ignores unapproved voice IDs so unreviewed voices never reach learners.
 */
export function resolveApprovedBritishVoice(rawOverride) {
  const candidate = typeof rawOverride === 'string' ? rawOverride.trim() : '';
  const matched =
    Object.entries(APPROVED_BRITISH_VOICES).find(
      ([role, config]) =>
        role.toLowerCase() === candidate.toLowerCase() || config.voice === candidate,
    )?.[1] ?? APPROVED_BRITISH_VOICES.Host;

  return {
    voiceId: matched.voice,
    name: matched.name,
    accent: matched.accent,
    voiceSettings: {
      ...BASE_TTS_VOICE_SETTINGS,
      ...matched.settings,
      speed: matched.settings.speed ?? B1_TTS_SPEED,
    },
  };
}

const MADRID_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function formatMadridParts(date) {
  const map = {};
  for (const part of MADRID_PARTS.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return map;
}

/**
 * Start of the current calendar day in `Europe/Madrid` as an ISO-8601 UTC timestamp,
 * matching `date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'`.
 */
export function madridDayStartIso(now = new Date()) {
  const current = formatMadridParts(now);
  const year = Number(current.year);
  const month = Number(current.month);
  const day = Number(current.day);
  const baseUtcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  for (const offsetHours of [2, 1, 0, 3]) {
    const candidate = new Date(baseUtcMidnight - offsetHours * 3_600_000);
    const parts = formatMadridParts(candidate);
    if (
      Number(parts.year) === year &&
      Number(parts.month) === month &&
      Number(parts.day) === day &&
      parts.hour === '00' &&
      parts.minute === '00' &&
      parts.second === '00'
    ) {
      return candidate.toISOString();
    }
  }
  return new Date(baseUtcMidnight - 3_600_000).toISOString();
}

/**
 * Start of the current calendar month in `Europe/Madrid` as an ISO-8601 UTC timestamp.
 */
export function madridMonthStartIso(now = new Date()) {
  const current = formatMadridParts(now);
  const year = Number(current.year);
  const month = Number(current.month);
  const baseUtcMidnight = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);

  for (const offsetHours of [2, 1, 0, 3]) {
    const candidate = new Date(baseUtcMidnight - offsetHours * 3_600_000);
    const parts = formatMadridParts(candidate);
    if (
      Number(parts.year) === year &&
      Number(parts.month) === month &&
      Number(parts.day) === 1 &&
      parts.hour === '00' &&
      parts.minute === '00' &&
      parts.second === '00'
    ) {
      return candidate.toISOString();
    }
  }
  return new Date(baseUtcMidnight - 3_600_000).toISOString();
}
