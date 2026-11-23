/**
 * Weeks 1–4 listening audio: which track a learner may hear, and how to
 * describe it.
 *
 * Real voice actors are the plan for these four tracks. Until those recordings
 * exist, approved weeks play a synthetic (AI) trial recording. Two rules keep
 * that honest and reversible:
 *
 * 1. A track plays only when it is scheduled here AND its
 *    `listening_audio_trials` row is `released`. Every row starts
 *    `unreleased`, so shipping this code plays nothing.
 * 2. The label always says the voice is synthetic, as the listening
 *    production notes and OpenAI's usage policy require.
 *
 * The module is deliberately client-safe: no network, no `server-only`, no
 * environment reads, no transcript or answer data.
 */

export const AI_TRIAL_LABEL = 'AI voice – trial recording';
export const AI_TRIAL_SOURCE = 'ai-trial';

export interface TrialSpeaker {
  speaker: string;
  accent: string;
}

export interface TrialTrack {
  week: number;
  title: string;
  seconds: number;
  hosts: readonly TrialSpeaker[];
}

/** Mirrors the four authored listening scripts in weeks-01-04-details.json. */
export const TRIAL_TRACKS: readonly TrialTrack[] = [
  {
    week: 1,
    title: '"Fresh Starts" podcast',
    seconds: 150,
    hosts: [
      { speaker: 'Host', accent: 'southern English' },
      { speaker: 'Ellie', accent: 'Scottish' },
    ],
  },
  {
    week: 2,
    title: 'Plans in the office kitchen',
    seconds: 140,
    hosts: [
      { speaker: 'Aisha', accent: 'London' },
      { speaker: 'Tom', accent: 'northern English' },
    ],
  },
  {
    week: 3,
    title: "A new flatmate's first day",
    seconds: 140,
    hosts: [
      { speaker: 'Dan', accent: 'Welsh' },
      { speaker: 'Marta', accent: 'West Midlands' },
    ],
  },
  {
    week: 4,
    title: 'A walking tour of York',
    seconds: 135,
    hosts: [{ speaker: 'Joanne', accent: 'Yorkshire' }],
  },
];

export const TRIAL_WEEKS: readonly number[] = TRIAL_TRACKS.map((track) => track.week);

/** Storage keys inside the public `course-audio` bucket. Derived, never user input. */
export function trialAudioKey(week: number): string {
  return `weeks-01-04/ai-trial/week-${week}-listening.mp3`;
}

export function trialCaptionsKey(week: number): string {
  return `weeks-01-04/ai-trial/week-${week}-listening.vtt`;
}

export function isTrialWeek(week: number): boolean {
  return TRIAL_WEEKS.includes(week);
}

export function trialTrack(week: number): TrialTrack | null {
  return TRIAL_TRACKS.find((track) => track.week === week) ?? null;
}

/** "Host (southern English) · Ellie (Scottish)" — accent metadata for learners. */
export function describeTrialSpeakers(week: number): string | null {
  const hosts = trialTrack(week)?.hosts;
  if (!hosts?.length) return null;
  return hosts.map((host) => `${host.speaker} (${host.accent})`).join(' · ');
}

export interface TrialRow {
  week: number;
  audio_url: string | null;
  captions_url?: string | null;
  source?: string | null;
  released?: boolean | null;
}

export interface PlayableTrial {
  week: number;
  audioUrl: string;
  captionsUrl: string | null;
  label: string;
  speakers: string | null;
  /**
   * How many listens the page *suggests*: one for the main idea, one for detail.
   * It is guidance, not a limit — the player no longer stops at it, and the count
   * is reported to the teacher so repeated listening is visible.
   */
  playsSuggested: number;
}

/**
 * The suggested number of listens. Kept as a name so the guidance sentence and
 * the counting agree; it must never be used to block playback.
 */
export const TRIAL_PLAYS_SUGGESTED = 2;

/**
 * Fails closed. A week with no scheduled trial, a missing row, a row that is
 * still `unreleased`, a row that is not the AI trial, or a row without an
 * uploaded `audio_url` all return null, so the page keeps saying
 * "Audio coming soon." instead of leaking an unapproved recording.
 */
export function resolveTrialAudio(week: number, rows: readonly TrialRow[] | null | undefined): PlayableTrial | null {
  if (!isTrialWeek(week)) return null;
  const row = rows?.find((item) => item.week === week);
  if (!row) return null;
  if (row.source !== AI_TRIAL_SOURCE) return null;
  if (row.released !== true) return null;
  const audioUrl = row.audio_url?.trim();
  if (!audioUrl) return null;
  return {
    week,
    audioUrl,
    captionsUrl: row.captions_url?.trim() || null,
    label: AI_TRIAL_LABEL,
    speakers: describeTrialSpeakers(week),
    playsSuggested: TRIAL_PLAYS_SUGGESTED,
  };
}

export function trialPlayKey(week: number): string {
  return `fluency:listening-trial-plays:week-${week}`;
}

/**
 * Reading a stored counter must never throw, even when storage is blocked.
 *
 * There is no upper clamp any more: the old one capped the count at the play
 * limit so a tampered counter could not unlock a third listen. With no limit to
 * unlock, clamping would only hide how often the track was really played, which
 * is the number the teacher now sees. A sane upper bound stays so a corrupt value
 * cannot overflow the display.
 */
export const PLAYS_COUNT_MAX = 1000;

export function playsUsed(raw: string | null | undefined): number {
  const parsed = Number.parseInt(String(raw ?? '0'), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, PLAYS_COUNT_MAX);
}

/** A play is worth reporting to the teacher only when it is a real number in range. */
export function isReportablePlay(week: unknown, count: unknown): boolean {
  return (
    Number.isInteger(week) && (week as number) >= 1 && (week as number) <= 4 &&
    Number.isInteger(count) && (count as number) >= 1 && (count as number) <= PLAYS_COUNT_MAX
  );
}
