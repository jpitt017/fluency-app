#!/usr/bin/env node
/**
 * Audio pipeline for Fluency Studio.
 *
 * Weeks 1-4 listening (the current production path, ElevenLabs voices):
 *   --voice-check       one short line per speaker -> private review bucket, so
 *                       the seven accents can be compared before anything else
 *                       is recorded
 *   --week 1            synthesise one AI trial track: MP3 + WebVTT, one voice per
 *                       speaker, B1 pace, unreleased upload to `course-audio-review`
 *   --weeks 1,2,3,4     the same for several weeks
 *   --list              show the approval state of the Weeks 1-4 tracks
 *   --review 1          print 1-hour signed listening links for a review pass
 *   --release 1         approve a reviewed track: copy it to `course-audio` and
 *                       set audio_url + released = true
 *   --revoke 1          un-approve it again (learners fall back to "Audio coming soon")
 *   --delete-trial      delete a week's files and clear the row (dry run unless --confirm)
 *   --dry-run           parse the scripts and report speakers/length, generate nothing
 *
 * Voices come from ElevenLabs (`eleven_multilingual_v2`). The accent is the
 * custom voice, never an instruction, and `speed` sets the B1 pace.
 *
 * Legacy Modules 1-8 path (same provider):
 *   1. Vocabulary items -> ElevenLabs TTS (`--vocab-only`, British English)
 *      uploaded to Supabase Storage (`course-audio` bucket) or S3/CDN.
 *   2. Listening tracks -> Export clean actor recording scripts (`--export-scripts`)
 *      first so real speakers / voice actors record multi-accent tracks last, then
 *      upload actor-recorded MP3s + WebVTT captions (`--upload-dir <dir>`).
 *
 * Usage:
 *   node scripts/generate-course-audio.mjs --voice-check
 *   node scripts/generate-course-audio.mjs --weeks 1,2,3,4
 *   node scripts/generate-course-audio.mjs --review 1
 *   node scripts/generate-course-audio.mjs --release 1
 *   node scripts/generate-course-audio.mjs --week 1 --dry-run
 *   node scripts/generate-course-audio.mjs --export-scripts
 *   node scripts/generate-course-audio.mjs --module 2 --vocab-only
 *   node scripts/generate-course-audio.mjs --module 2 --upload-dir ./recordings
 */

import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_REVIEW_BUCKET,
  SPEAKER_VOICES,
  TTS_MODEL,
  VOICE_CHECK_LINE,
  defaultSpeakerFor,
  estimateDurationSeconds,
  generateListeningTrial,
  generateVoiceCheck,
  publishReleasedTrial,
  readListeningWeeks,
} from './lib/course-audio/listening-trial.mjs';
import {
  B1_SPEECH_RATE,
  encodeMp3Buffer,
  parseScript,
  pcmToWav,
  synthesiseTurn,
} from './lib/course-audio/tts.mjs';
import {
  REVIEW_LINK_SECONDS,
  deleteReleasedFiles,
  releaseTrial,
  revokeTrial,
  signReviewUrl,
} from './lib/course-audio/publish.mjs';
import { checkApprovalTarget, isApprovalBypassRequested } from './lib/course-audio/environment.mjs';
import { assertTrialWeek, isConfirmed, reviewObjectKeys } from './lib/course-audio/delete-guard.mjs';
import { runTrialDeletion } from './lib/course-audio/delete-plan.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const runAll = args.includes('--all');
const vocabOnly = args.includes('--vocab-only');
const exportScripts = args.includes('--export-scripts');
const moduleIdx = args.indexOf('--module');
const targetModule = moduleIdx !== -1 ? Number(args[moduleIdx + 1]) : 1;
const uploadIdx = args.indexOf('--upload-dir');
const uploadDir = uploadIdx !== -1 ? args[uploadIdx + 1] : null;

/**
 * Week numbers, strictly. Each entry must be a plain run of digits: anything else
 * (letters, signs, decimals, exponents, `..`) is refused rather than coerced, so a
 * crafted value cannot reach a storage path.
 */
function listArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a week number`);
  return value.split(',').map((part) => {
    const trimmed = part.trim();
    if (!/^[0-9]{1,2}$/.test(trimmed)) {
      throw new Error(`${flag}: "${part}" is not a week number`);
    }
    return Number(trimmed);
  });
}

/**
 * Deletion is dry by default: without this it only reports what it would remove.
 * `--confirm` on its own, or `--confirm=true` / `--confirm true`, arms it.
 */
function confirmRequested() {
  const index = args.findIndex((arg) => arg === '--confirm' || arg.startsWith('--confirm='));
  if (index === -1) return false;
  const arg = args[index];
  if (arg.includes('=')) return isConfirmed(arg.slice(arg.indexOf('=') + 1));
  const next = args[index + 1];
  if (next === undefined || next.startsWith('--')) return true;
  return isConfirmed(next);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
const s3Bucket = process.env.AUDIO_S3_BUCKET;
const publicBaseUrl = process.env.AUDIO_PUBLIC_BASE_URL;

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * The legacy Modules 1-8 material asks for a spread of accents. The Seven
 * lesson voices are British and Irish, so this picks the closest regional voice
 * and otherwise falls back to the Host; the accent is carried by the voice
 * itself, and no prompt tries to talk the model into one. Anything outside the
 * UK/Ireland set can only arrive through human actor recordings.
 */
function selectVoiceForAccent(accentLabel = '') {
  const label = String(accentLabel);
  if (/welsh|cardiff/i.test(label)) return 'Dan';
  if (/scottish|edinburgh|glasgow/i.test(label)) return 'Ellie';
  if (/yorkshire|leeds/i.test(label)) return 'Joanne';
  if (/midlands|birmingham/i.test(label)) return 'Marta';
  if (/northern|manchester|liverpool|geordie|newcastle/i.test(label)) return 'Tom';
  if (/london|mle|multicultural/i.test(label)) return 'Aisha';
  return 'Host';
}

/**
 * Legacy Modules 1-8 vocabulary audio: one line of text -> MP3 bytes.
 *
 * Uses the same ElevenLabs voice set and the same PCM -> WAV -> loudnorm MP3
 * path as the Weeks 1-4 tracks, so there is one synthesiser in the repository.
 */
async function synthesizeMp3(text, accentLabel = 'British') {
  if (!elevenLabsKey) throw new Error('ELEVENLABS_API_KEY is required to synthesise audio.');
  const speaker = selectVoiceForAccent(accentLabel);
  const turn = await synthesiseTurn({ speaker, text, apiKey: elevenLabsKey });
  return encodeMp3Buffer(pcmToWav(turn.pcm));
}

function buildVtt(body, durationSeconds) {
  const cues = body
    .split(/(?=\b[A-Z][A-Z0-9 ]{1,18}:)|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const totalWords = cues.reduce((sum, c) => sum + c.split(/\s+/).filter(Boolean).length, 0) || 1;
  const totalDur = durationSeconds || Math.max(12, Math.round(totalWords / 2.3));
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  let cursor = 0;
  const out = ['WEBVTT', ''];
  cues.forEach((c, idx) => {
    const words = c.split(/\s+/).filter(Boolean).length || 1;
    const span = (words / totalWords) * totalDur;
    const end = idx === cues.length - 1 ? totalDur : cursor + span;
    out.push(`${idx + 1}`, `${fmt(cursor)} --> ${fmt(end)}`, c, '');
    cursor = end;
  });
  return Buffer.from(out.join('\n'), 'utf8');
}

async function uploadBuffer(key, buffer, contentType, supabase) {
  if (s3Bucket) {
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' });
    await s3.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : `https://${s3Bucket}.s3.amazonaws.com/${key}`;
  }

  if (supabase) {
    const { error } = await supabase.storage.from('course-audio').upload(key, buffer, {
      contentType,
      upsert: true,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('course-audio').getPublicUrl(key);
    return data.publicUrl;
  }

  const localPath = path.join(process.cwd(), 'public', 'audio', key);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
  return `/audio/${key}`;
}

async function exportRecordingCueSheets() {
  const contentDir = path.join(process.cwd(), 'supabase-b1-b2/content/curriculum');
  const files = (await readdir(contentDir))
    .filter((f) => /^modules-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  const lines = [
    '# Voice Actor Recording Scripts (Modules 1–8)',
    '',
    'Record multi-accent listening tracks using human speakers after script review.',
    'Save each finished file to `<recordings-dir>/<audioRef>` and upload with:',
    '`node scripts/generate-course-audio.mjs --module <N> --upload-dir <recordings-dir>`',
    '',
  ];

  for (const file of files) {
    const doc = JSON.parse(await readFile(path.join(contentDir, file), 'utf8'));
    for (const mod of doc.modules) {
      for (const inp of mod.inputs.filter((i) => i.kind === 'listening')) {
        lines.push(`## Module ${mod.number}: ${inp.title}`);
        lines.push(`- **Target file:** \`${inp.audioRef}\``);
        lines.push(`- **Status:** \`${inp.audioStatus || 'actor_pending'}\``);
        lines.push(`- **Duration target:** ~${inp.seconds || 90}s`);
        lines.push(
          `- **Speakers:** ${(inp.speaker_accents || []).map((s) => `${s.speaker} (${s.label} · ${s.accent})`).join(', ')}`,
        );
        lines.push('');
        lines.push('```text');
        lines.push(inp.body);
        lines.push('```');
        lines.push('');
      }
    }
  }

  process.stdout.write(lines.join('\n'));
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function processModule(supabase, moduleNum) {
  const { data: mod } = await supabase
    .from('modules')
    .select('id, module_number, title')
    .eq('module_number', moduleNum)
    .single();

  if (!mod) throw new Error(`Module ${moduleNum} not found`);

  const { data: inputs } = await supabase
    .from('content_inputs')
    .select('id, kind, title, accent, speaker_accents, body, duration_seconds, audio_url')
    .eq('module_id', mod.id);

  const { data: decks } = await supabase.from('vocab_decks').select('id').eq('module_id', mod.id);
  const deckIds = (decks ?? []).map((d) => d.id);
  const { data: vocabItems } = deckIds.length
    ? await supabase.from('vocab_items').select('id, term, example, audio_url').in('deck_id', deckIds)
    : { data: [] };

  console.log(`Module ${moduleNum} (${mod.title}): ${inputs?.length ?? 0} inputs, ${vocabItems?.length ?? 0} vocab items.`);
  if (dryRun) return;

  if (!vocabOnly) {
    for (const inp of inputs ?? []) {
      const baseKey = `module-${moduleNum}/${slugify(inp.title)}`;

      // Prefer human-recorded actor tracks from --upload-dir when provided
      if (uploadDir) {
        const candidatePath = path.join(uploadDir, `${baseKey}.mp3`);
        if (await fileExists(candidatePath)) {
          const audioBuffer = await readFile(candidatePath);
          const url = await uploadBuffer(`${baseKey}.mp3`, audioBuffer, 'audio/mpeg', supabase);
          await uploadBuffer(`${baseKey}.vtt`, buildVtt(inp.body, inp.duration_seconds), 'text/vtt; charset=utf-8', supabase);
          await supabase.from('content_inputs').update({ audio_url: url }).eq('id', inp.id);
          console.log(`Uploaded human-recorded input + VTT: ${baseKey}.mp3 -> ${url}`);
          continue;
        }
      }

      if (!elevenLabsKey) continue;
      if (inp.audio_url && /^https?:\/\//i.test(inp.audio_url)) continue;

      const accents = Array.isArray(inp.speaker_accents) ? inp.speaker_accents : [];
      let audioBuffer;
      if (accents.length > 1) {
        const segments = inp.body.split(/(?=\b[A-Z][A-Z0-9 ]{1,18}:)/g).map((s) => s.trim()).filter(Boolean);
        const partBuffers = [];
        for (let i = 0; i < segments.length; i++) {
          const cleanLine = segments[i].replace(/^[A-Z][A-Z0-9 ]{1,18}:\s*/, '');
          const accentLabel = accents[i % accents.length]?.label || inp.accent || 'British';
          partBuffers.push(await synthesizeMp3(cleanLine, accentLabel));
        }
        audioBuffer = Buffer.concat(partBuffers);
      } else {
        audioBuffer = await synthesizeMp3(inp.body, inp.accent ?? 'British');
      }

      const url = await uploadBuffer(`${baseKey}.mp3`, audioBuffer, 'audio/mpeg', supabase);
      await uploadBuffer(`${baseKey}.vtt`, buildVtt(inp.body, inp.duration_seconds), 'text/vtt; charset=utf-8', supabase);
      await supabase.from('content_inputs').update({ audio_url: url }).eq('id', inp.id);
      console.log(`Uploaded TTS input + VTT: ${baseKey}.mp3 -> ${url}`);
    }
  }

  if (elevenLabsKey) {
    for (const item of vocabItems ?? []) {
      if (item.audio_url && /^https?:\/\//i.test(item.audio_url)) continue;
      const mp3 = await synthesizeMp3(`${item.term}. ${item.example}`, 'British');
      const key = `module-${moduleNum}/${slugify(item.term)}.mp3`;
      const url = await uploadBuffer(key, mp3, 'audio/mpeg', supabase);
      await supabase.from('vocab_items').update({ audio_url: url }).eq('id', item.id);
      console.log(`Uploaded vocab: ${key} -> ${url}`);
    }
  }
}

/** Supabase service-role client, or a clear failure when the env is incomplete. */
function requireSupabase() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to upload and approve audio.');
  }
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function describeWeek(weekSpec) {
  const fallback = defaultSpeakerFor(weekSpec);
  const lines = parseScript(weekSpec.script, fallback);
  const speakers = [...new Set(lines.map((line) => line.speaker))];
  return {
    lines,
    speakers,
    voices: speakers.map((name) => `${name}=${SPEAKER_VOICES[name].voice} (${SPEAKER_VOICES[name].accent})`),
    estimate: Math.round(estimateDurationSeconds(lines)),
  };
}

async function generateWeeks(weeks) {
  const specs = await readListeningWeeks();
  const wanted = specs.filter((spec) => weeks.includes(spec.week));
  if (wanted.length !== weeks.length) {
    const known = specs.map((spec) => spec.week).join(', ');
    throw new Error(`Only Weeks ${known} have authored listening scripts; asked for ${weeks.join(', ')}`);
  }

  if (dryRun) {
    for (const spec of wanted) {
      const info = describeWeek(spec);
      console.log(`Week ${spec.week}: ${spec.title}`);
      console.log(`  ${info.lines.length} lines, ${info.speakers.length} speaker(s), ~${info.estimate}s at B1 pace`);
      for (const voice of info.voices) console.log(`  voice: ${voice}`);
    }
    console.log('Dry run: no audio generated, nothing uploaded, nothing released.');
    return;
  }

  if (!elevenLabsKey) throw new Error('Set ELEVENLABS_API_KEY to synthesise the AI trial tracks.');
  const client = requireSupabase();
  const outputDir = path.join(process.cwd(), 'audio-out', 'weeks-01-04');
  await mkdir(outputDir, { recursive: true });
  let uploaded = 0;

  for (const spec of wanted) {
    console.log(`Week ${spec.week}: ${spec.title} (${TTS_MODEL})`);
    const result = await generateListeningTrial({
      weekSpec: spec,
      outputDir,
      apiKey: elevenLabsKey,
      client,
      upload: true,
      log: (message) => console.log(message),
    });
    uploaded += 1;
    console.log(
      `  ${result.lines} lines -> ${result.mp3Path} (${result.durationSeconds}s, ${result.cues} caption cues)`,
    );
    console.log(`  uploaded unreleased: ${result.audioKey}`);
    console.log(`  approved? no - run --review ${spec.week} to listen, then --release ${spec.week}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendSummary(
        `| Week ${spec.week} | ${result.durationSeconds}s | ${result.speakers.join(', ')} | \`${result.audioKey}\` | unreleased |`,
      );
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendSummary('', `Generated ${uploaded} AI trial track(s). None is released to learners.`, '');
  }
  console.log(`Done. ${uploaded} track(s) uploaded as source "ai-trial", none released.`);
}

async function appendSummary(...rows) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, rows.join('\n') + '\n', { flag: 'a' });
}

async function listTrialState() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('listening_audio_trials')
    .select('week, source, released, audio_url, captions_url, duration_seconds, model, generated_at, released_at')
    .order('week');
  if (error) throw new Error(`Could not read listening_audio_trials: ${error.message}`);
  if (!data?.length) {
    console.log('No listening audio rows yet. Run --weeks 1,2,3,4 first.');
    return;
  }
  for (const row of data) {
    const state = row.released ? 'RELEASED' : 'unreleased';
    console.log(
      `Week ${row.week}: ${state} · source=${row.source ?? '-'} · ${row.duration_seconds ?? '?'}s · audio=${
        row.audio_url ? 'set' : 'not set'
      } · ${row.model ?? '-'} · generated ${row.generated_at ?? '-'}`,
    );
  }
}

/**
 * `delete` mode. Removes generated trial audio from the public bucket and clears
 * the URLs on the approval row, so the week keeps saying "Audio coming soon."
 *
 * Three guards, enforced in scripts/lib/course-audio/delete-guard.mjs:
 *   - only Weeks 1-4 and only paths under weeks-01-04/ai-trial/ (no `..`);
 *   - a dry run unless `--confirm` is passed;
 *   - a released week is refused, because deleting it would break a live page.
 */
async function deleteTrialFiles(weeks, confirmed) {
  if (!weeks.length) throw new Error('--delete-trial needs at least one week');
  for (const week of weeks) assertTrialWeek(week);
  const client = requireSupabase();
  const result = await runTrialDeletion(weeks, client, { confirmed });

  for (const line of result.previews) console.log(line);
  if (!result.confirmed) {
    console.log('Dry run: nothing was deleted. Re-run with --confirm to remove these files.');
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendSummary('# AI trial deletion - dry run', '', ...result.previews.map((line) => `- ${line}`), '', 'Nothing was deleted. Re-run with confirm enabled to remove these files.');
    }
    return;
  }

  console.log(`Deleted ${result.deleted.length} file(s). Approval rows cleared and still unreleased.`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendSummary('# AI trial files deleted', '', ...result.previews.map((line) => `- ${line}`));
  }
}

async function reviewWeek(weeks) {
  const client = requireSupabase();
  const summary = [];
  const lines = [];
  for (const week of weeks) {
    const { data, error } = await client
      .from('listening_audio_trials')
      .select('week, released, duration_seconds')
      .eq('week', week)
      .maybeSingle();
    if (error) throw new Error(`Could not read week ${week}: ${error.message}`);
    if (!data) throw new Error(`Week ${week} has no generated track yet; run --week ${week} first.`);
    const [audioKey] = reviewObjectKeys(week);
    const url = await signReviewUrl(client, audioKey);
    const minutes = REVIEW_LINK_SECONDS / 60;
    lines.push(`Week ${week} review link (valid ${minutes} minutes, ${data.duration_seconds ?? '?'}s):`);
    lines.push(`  ${url}`);
    const state = data.released ? 'already released' : 'unreleased - learners cannot hear it yet';
    lines.push(`  state: ${state}`);
    summary.push(
      `### Week ${week} — ${Math.round(Number(data.duration_seconds ?? 0))}s, ${state}`,
      '',
      `[Listen to the Week ${week} track](${url}) — link valid for ${minutes} minutes.`,
      '',
      data.released
        ? 'Already approved, so it is live in /week/' + week + '.'
        : `Not live. Approve with mode: release, weeks: "${week}".`,
      '',
    );
  }
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) await appendSummary('# Listening trial review links', '', ...summary);
}

/**
 * Audition links for the seven voices. Each clip is one line, the same words for
 * every speaker, so the accents can be compared side by side before a full week
 * is recorded.
 */
async function voiceCheck() {
  if (!elevenLabsKey) throw new Error('Set ELEVENLABS_API_KEY to synthesise the voice check.');
  const client = requireSupabase();
  const outputDir = path.join(process.cwd(), 'audio-out', 'voice-check');
  console.log(`Voice check (${TTS_MODEL}, rate ${B1_SPEECH_RATE}): "${VOICE_CHECK_LINE}"`);
  const results = await generateVoiceCheck({
    outputDir,
    apiKey: elevenLabsKey,
    client,
    upload: true,
    log: (message) => console.log(message),
  });

  const summary = ['# Voice check — one line per speaker', '', '| Speaker | Voice | Accent | Length | Listen |', '| --- | --- | --- | --- | --- |'];
  for (const entry of results) {
    const url = await signReviewUrl(client, entry.key);
    console.log(`${entry.speaker} (${entry.name}, ${entry.accent}) ${entry.durationSeconds}s`);
    console.log(`  ${url}`);
    summary.push(
      `| ${entry.speaker} | ${entry.name} | ${entry.accent} | ${entry.durationSeconds}s | [listen](${url}) |`,
    );
  }
  summary.push('', `Links are valid for ${REVIEW_LINK_SECONDS / 60} minutes.`, '', 'Nothing is released: these clips are for approval only.');
  if (process.env.GITHUB_STEP_SUMMARY) await appendSummary(...summary);
  console.log(`\n${results.length} clips uploaded to ${DEFAULT_REVIEW_BUCKET}, unreleased. Links valid ${REVIEW_LINK_SECONDS / 60} minutes.`);
}

async function releaseWeek(weeks) {
  // Check the target before any database work: a production release is refused
  // outright, so this must fail on the rule rather than on some later read.
  // The bypass is the workflow's two-key acknowledgement (ALLOW_PRODUCTION_RELEASE),
  // so a deliberate, reviewed release gets through and nothing else does.
  const verdict = checkApprovalTarget({ url: supabaseUrl, bypass: isApprovalBypassRequested() });
  if (!verdict.ok) throw new Error(verdict.reason);
  const client = requireSupabase();
  for (const week of weeks) {
    const { data, error } = await client
      .from('listening_audio_trials')
      .select('week, duration_seconds')
      .eq('week', week)
      .maybeSingle();
    if (error) throw new Error(`Could not read week ${week}: ${error.message}`);
    if (!data) throw new Error(`Week ${week} has no generated track; nothing to release.`);
    const { audioUrl, captionsUrl } = await publishReleasedTrial(client, week);
    await releaseTrial({ client, week, audioUrl, captionsUrl, url: supabaseUrl });
    console.log(`Week ${week}: released · ${audioUrl}`);
    console.log('  learners will see "AI voice – trial recording" and can play it twice.');
  }
}

async function revokeWeek(weeks) {
  const verdict = checkApprovalTarget({ url: supabaseUrl, bypass: isApprovalBypassRequested() });
  if (!verdict.ok) throw new Error(verdict.reason);
  const client = requireSupabase();
  for (const week of weeks) {
    await revokeTrial({ client, week, url: supabaseUrl });
    // Take the public copies down as well: the row no longer points at them, and
    // an unapproved track should not stay fetchable from a public bucket.
    const removed = await deleteReleasedFiles(client, week);
    console.log(
      `Week ${week}: revoked - the page shows "Audio coming soon." again` +
        (removed.length ? ` (removed ${removed.length} public file(s))` : ''),
    );
    console.log('  the private review copy is kept, so --release can put it back.');
  }
}

/**
 * Argument parsing lives inside the guarded entry point, so a bad `--weeks`
 * value (letters, `..`, exponents) fails with the same clean annotation as any
 * other error instead of a bare stack trace.
 */
async function main() {
  const weekList = listArg('--week') ?? listArg('--weeks');
  const reviewWeekList = listArg('--review');
  const releaseWeekList = listArg('--release');
  const revokeWeekList = listArg('--revoke');
  const listTrials = args.includes('--list');
  const deleteTrial = args.includes('--delete-trial');
  const confirmDelete = confirmRequested();
  const checkVoices = args.includes('--voice-check');

  if (checkVoices) return voiceCheck();

  if (deleteTrial || listTrials || reviewWeekList || releaseWeekList || revokeWeekList || weekList) {
    if (deleteTrial) return deleteTrialFiles(weekList ?? [], confirmDelete);
    if (listTrials) return listTrialState();
    if (reviewWeekList) return reviewWeek(reviewWeekList);
    if (releaseWeekList) return releaseWeek(releaseWeekList);
    if (revokeWeekList) return revokeWeek(revokeWeekList);
    return generateWeeks(weekList ?? []);
  }

  if (exportScripts) {
    await exportRecordingCueSheets();
    return;
  }

  if (!supabaseUrl || !serviceKey) {
    console.log('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to sync audio assets with Postgres.');
    process.exit(0);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const modules = runAll ? [1, 2, 3, 4, 5, 6, 7, 8] : [targetModule];
  for (const m of modules) {
    await processModule(supabase, m);
  }
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  // One line, so GitHub Actions shows the reason on the failed step itself.
  const annotation = message.replace(/[\r\n]+/g, ' ').slice(0, 900).replace(/%/g, '%25');
  console.log(`::error::${annotation}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Course audio failed\n\n\`\`\`\n${message.slice(0, 4000)}\n\`\`\`\n`, {
      flag: 'a',
    }).catch(() => {});
  }
  process.exit(1);
});
