#!/usr/bin/env node
/**
 * Audio pipeline for Fluency Studio.
 *
 * Speaking audio (ElevenLabs):
 *   --speaking-voice-check Week 1 model + two shadowing chunks, Aisha at B1;
 *                           padded and measured, with no Storage/approval writes
 *   --speaking-generate     all 16 model/chunk clips, private review upload only
 *   --speaking-release 1,2  copy selected weeks to the public bucket behind the
 *                           existing production two-key approval guard
 *
 * Weeks 1-4 listening (the current production path, ElevenLabs voices):
 *   --voice-check       the reviewed lines -> private review bucket: Tom's first
 *                       two Week 2 lines, Marta's three longest Week 3 turns and
 *                       Ellie's longest Week 1 answer, at the course pace and
 *                       settings
 *   --voice-sample N    three of Week N's own lines per speaker, at the given
 *                       pace and with that speaker's voice settings, so a
 *                       warmer or slower reading can be approved before the
 *                       whole track is re-recorded
 *   --delete-probes     delete the three storage-check probe objects by exact
 *                       name, through the Storage API (dry run unless --confirm)
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
  AUDIO_BUCKET,
  DEFAULT_REVIEW_BUCKET,
  SPEAKER_VOICES,
  TTS_MODEL,
  defaultSpeakerFor,
  estimateDurationSeconds,
  generateClip,
  generateListeningTrial,
  generateVoiceCheck,
  publishReleasedTrial,
  readListeningWeeks,
  week3SampleLines,
} from './lib/course-audio/listening-trial.mjs';
import {
  buildUtterances,
  encodeMp3Buffer,
  parseScript,
  resolvePace,
  pcmToWav,
  synthesiseTurn,
} from './lib/course-audio/tts.mjs';
import {
  generateSpeakingTrials,
  generateSpeakingVoiceCheck,
  publishSpeakingWeek,
} from './lib/course-audio/speaking-trial.mjs';

/**
 * The voice settings a summary reports, read from the config.
 *
 * A hand-written list here went stale the moment Tom's settings changed, and a
 * summary that misstates the settings is worse than no summary.
 */
function describedVoiceSettings() {
  const overridden = [];
  const defaults = [];
  for (const [speaker, config] of Object.entries(SPEAKER_VOICES)) {
    if (!config.settings) {
      defaults.push(speaker);
      continue;
    }
    const parts = [];
    if (config.settings.stability !== undefined) parts.push(`stability ${config.settings.stability}`);
    if (config.settings.style !== undefined) parts.push(`style ${config.settings.style}`);
    if (config.settings.speed !== undefined) parts.push(`speed ${config.settings.speed}`);
    overridden.push(`${speaker} (${config.name}) ${parts.join(', ')}`);
  }
  const tail = defaults.length ? `; ${defaults.join(' and ')} unchanged on the defaults.` : '.';
  return `Voices: ${overridden.join('; ')}${tail}`;
}
import {
  REVIEW_LINK_SECONDS,
  deleteProbeObjects,
  deleteReleasedFiles,
  releaseTrial,
  revokeTrial,
  signReviewUrl,
} from './lib/course-audio/publish.mjs';
import { checkApprovalTarget, isApprovalBypassRequested } from './lib/course-audio/environment.mjs';
import { PROBE_OBJECTS, assertTrialWeek, isConfirmed, reviewObjectKeys } from './lib/course-audio/delete-guard.mjs';
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
/** One or more clip names, e.g. `--only tom-two-lines` or `--only a,b`. */
function nameListArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs at least one clip name`);
  const names = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!names.length) throw new Error(`${flag} needs at least one clip name`);
  return names;
}

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
  const estimate = estimateDurationSeconds(lines);
  return {
    lines,
    speakers,
    voices: speakers.map((name) => `${name}=${SPEAKER_VOICES[name].voice} (${SPEAKER_VOICES[name].accent})`),
    estimate: Math.round(estimate.seconds),
    estimateWpm: Math.round(estimate.words / (estimate.seconds / 60)),
    sentences: buildUtterances(lines).length,
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
      console.log(
        `  ${info.lines.length} lines / ${info.sentences} sentences, ${info.speakers.length} speaker(s), ` +
          `~${info.estimate}s (~${info.estimateWpm} wpm) at the B1 pace`,
      );
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
      `  ${result.lines} lines / ${result.sentences} sentences -> ${result.mp3Path} ` +
        `(${result.durationSeconds}s, ${result.words} words, ${result.wordsPerMinute} wpm, ${result.cues} caption cues)`,
    );
    console.log(`  uploaded unreleased: ${result.audioKey}`);
    console.log(`  approved? no - run --review ${spec.week} to listen, then --release ${spec.week}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendSummary(
        `| Week ${spec.week} | ${result.durationSeconds}s | ${result.wordsPerMinute} wpm | ` +
          `${result.speakers.join(', ')} | \`${result.audioKey}\` | unreleased |`,
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
    const state = data.released ? 'already released' : 'unreleased - learners cannot hear it yet';
    lines.push(`Week ${week}: ${data.duration_seconds ?? '?'}s, ${state}`);
    if (signedLinksInLog()) {
      // The `review` mode exists to hand out a link, so it prints one. Nothing
      // else does, and it never goes in the summary.
      const url = await signReviewUrl(client, reviewObjectKeys(week)[0]);
      lines.push(`  link (valid ${REVIEW_LINK_SECONDS / 60} minutes): ${url}`);
    }
    summary.push({
      label: `Week ${week}`,
      detail: `${Math.round(Number(data.duration_seconds ?? 0))}s, ${state}`,
    });
  }
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendSummary(
      ...reviewReport({
        title: 'Listening track review',
        artifact: 'review',
        rows: summary,
        footer: 'Nothing is released until you run mode: release for a week.',
      }),
    );
  }
}

/**
 * Signed review URLs are 1-hour, single-purpose links into a private bucket.
 * They are printed to the step log only when the run asks for it (the `review`
 * mode does: its whole job is handing out links for an existing track). Generate
 * and voice-check runs must not print them: nothing needs a link on the way in,
 * and a link in a log is a link in a screenshot.
 */
function signedLinksInLog() {
  const raw = process.env.SIGNED_LINKS_IN_LOG;
  return raw === '1' || raw === 'true';
}

/**
 * Summary rows for tracks and clips.
 *
 * The summary never contains a signed URL. GitHub redacts the token when it
 * renders the page, so a link there is unusable for a reviewer, and the artifact
 * is the supported way to listen. What the table does carry is everything a
 * person needs to approve a recording: what it is, how long, and whether it is
 * live.
 *
 * @param {{title: string, artifact: string, rows: {label: string, detail: string}[], footer?: string}} report
 */
function reviewReport(report) {
  const rows = [
    `# ${report.title}`,
    '',
    `Download from the **\`${report.artifact}\`** artifact on this run (kept for 3 days): ${runUrl()}`,
    '',
    '| Track | Length | State |',
    '| --- | --- | --- |',
  ];
  for (const row of report.rows) rows.push(`| ${row.label} | ${row.detail} |`);
  if (report.footer) rows.push('', report.footer);
  return rows;
}

/**
 * Auditions the lines a listening review asks for by name, at the course pace
 * and with each speaker's own settings.
 *
 * One MP3 per request: Tom's first two Week 2 lines, Marta's three longest Week 3
 * turns and Ellie's longest Week 1 answer. Each clip's words per minute is
 * reported, measured from the assembled timeline (words actually spoken over the
 * wall-clock length, pauses included), not estimated.
 *
 * The MP3s go to ./voice-check/, which the workflow uploads as the
 * `voice-check` artifact for three days: that is the route to listen to them,
 * because GitHub redacts a signed token from anything it renders.
 */
async function voiceCheck(onlyKeys = null) {
  if (!elevenLabsKey) throw new Error('Set ELEVENLABS_API_KEY to synthesise the voice check.');
  const client = requireSupabase();
  const specs = await readListeningWeeks();
  const outputDir = path.join(process.cwd(), 'voice-check');
  const pace = resolvePace('b1');
  console.log(
    `Voice check (${TTS_MODEL}, speed ${pace.speed}, ${pace.sentencePauseSeconds}s / ` +
      `${pace.speakerPauseSeconds}s / ${pace.paragraphPauseSeconds}s pauses)` +
      (onlyKeys ? ` — only ${onlyKeys.join(', ')}` : ''),
  );
  const clips = await generateVoiceCheck({
    outputDir,
    apiKey: elevenLabsKey,
    client,
    upload: true,
    pace: 'b1',
    weekSpecs: specs,
    onlyKeys,
    log: (message) => console.log(message),
  });

  for (const clip of clips) {
    console.log(
      `${clip.title}: ${clip.words} words in ${clip.durationSeconds}s ` +
        `(${clip.wordsPerMinute} wpm wall clock, ${clip.speechSeconds}s speech) -> ${clip.mp3Path}`,
    );
  }
  const summary = reviewReport({
    title: 'Voice check — real lines, new pace',
    artifact: 'voice-check',
    rows: clips.map((clip) => ({
      label: clip.title,
      detail: `${clip.durationSeconds}s · ${clip.words} words · ${clip.wordsPerMinute} wpm`,
    })),
    footer: [
      describedVoiceSettings(),
      `Pace: ${pace.sentencePauseSeconds} s between sentences, ${pace.speakerPauseSeconds} s between` +
        ` speakers, ${pace.paragraphPauseSeconds} s between paragraphs.`,
      'Nothing is released: these clips are for approval only.',
    ].join(' '),
  });
  if (process.env.GITHUB_STEP_SUMMARY) await appendSummary(...summary);
  // Also as an annotation, so the measured pace is readable from the API on a
  // headless run: the step log sits behind a presigned blob URL that some
  // clients cannot fetch, and the step summary has no API endpoint.
  const measured = clips
    .map((clip) => `${clip.title}: ${clip.wordsPerMinute} wpm wall clock (${clip.speechSeconds} s speech)`)
    .join(' | ');
  console.log(`::notice title=Voice check pace::${measured.replace(/[\r\n]+/g, ' ').slice(0, 4000)}`);
  console.log(`\n${clips.length} clips uploaded to ${DEFAULT_REVIEW_BUCKET}, unreleased.`);
}

/** This run's page, so the summary can point at the artifact. */
function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return 'the **Artifacts** section of this run';
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

/**
 * Re-auditions one week's voices on their own lines.
 *
 * Same week, same script lines, but the pace and the per-speaker voice settings
 * can be changed and heard before a full track is re-recorded. One clip per
 * speaker; the three lines are that speaker's three longest turns, so a voice is
 * judged on a real answer rather than on "Oh no! OK.". Nothing is released and no
 * approval row is touched.
 */
async function voiceSample(week, mode = 'b1') {
  if (!elevenLabsKey) throw new Error('Set ELEVENLABS_API_KEY to synthesise the voice sample.');
  const client = requireSupabase();
  const specs = await readListeningWeeks();
  const spec = specs.find((item) => item.week === week);
  if (!spec) throw new Error(`No authored listening script for week ${week}`);

  const outputDir = path.join(process.cwd(), 'voice-samples');
  const pace = resolvePace(mode);
  console.log(
    `Week ${week} sample — ${spec.title} (speed ${pace.speed}, ${pace.sentencePauseSeconds}s / ` +
      `${pace.speakerPauseSeconds}s / ${pace.paragraphPauseSeconds}s pauses)`,
  );
  const chosen = week3SampleLines(spec);
  const clips = [];
  for (const [speaker, lines] of Object.entries(chosen)) {
    clips.push(
      await generateClip({
        key: `week-${week}-sample-${speaker}`,
        title: `${speaker} — three lines from Week ${week}`,
        lines,
        outputDir,
        apiKey: elevenLabsKey,
        client,
        upload: true,
        pace: mode,
        log: (message) => console.log(message),
      }),
    );
  }

  for (const clip of clips) {
    console.log(
      `  ${clip.speaker}: ${clip.words} words in ${clip.durationSeconds}s (${clip.wordsPerMinute} wpm) -> ${clip.mp3Path}`,
    );
  }
  const summary = reviewReport({
    title: `Week ${week} voice sample — ${spec.title}`,
    artifact: 'week-sample',
    rows: clips.map((clip) => ({
      label: `${clip.speaker} — ${clip.title}`,
      detail: `${clip.durationSeconds}s · ${clip.words} words · ${clip.wordsPerMinute} wpm`,
    })),
    footer: 'Three of each speaker\'s longest lines, at the course pace. Nothing is released and the full tracks are unchanged.',
  });
  if (process.env.GITHUB_STEP_SUMMARY) await appendSummary(...summary);
  console.log(`\n${clips.length} samples uploaded to ${DEFAULT_REVIEW_BUCKET}, unreleased.`);
}

/**
 * Deletes the three storage-check probe objects by exact name.
 *
 * They are a leftover from proving a bucket accepted an upload, not audio for
 * learners: a 400 kB MP3 and two 6-byte text files. The delete goes through the
 * Storage API (Supabase refuses direct deletes on storage.objects) and each
 * object is re-listed afterwards. Dry run unless --confirm.
 */
async function deleteProbes(confirmed) {
  if (!confirmed) {
    console.log('Probe objects (dry run: nothing is deleted):');
    for (const entry of PROBE_OBJECTS) console.log(`  ${entry.bucket}/${entry.key}`);
    console.log('Re-run with --confirm to delete exactly these three objects.');
    return;
  }
  const client = requireSupabase();
  const result = await deleteProbeObjects(client, (message) => console.log(message));
  console.log(
    `\nProbe cleanup: ${result.removed.length} deleted, ${result.missing.length} already gone, ` +
      `${result.checked} checked.`,
  );
  for (const entry of result.removed) console.log(`  ${entry.bucket}: ${entry.key}`);
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
async function speakingGenerate() {
  if (!elevenLabsKey) throw new Error('Set ELEVENLABS_API_KEY to generate speaking clips.');
  const client = requireSupabase();
  const outputDir = path.join(process.cwd(), 'audio-out', 'speaking-01-04');
  const clips = await generateSpeakingTrials({
    apiKey: elevenLabsKey,
    client,
    outputDir,
    pace: 'b1',
    log: (message) => console.log(message),
  });
  const rows = [
    '# Speaking audio review — Weeks 1–4',
    '',
    'All clips are unreleased in the private `course-audio-review` bucket. No approval rows or public URLs were changed.',
    '',
    '| Week | Clip | Voice | Words | Duration incl. pads | WPM incl. pads | Speech-only WPM | Review key |',
    '| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...clips.map((clip) => `| ${clip.week} | ${clip.title} | ${clip.speaker} (${clip.voice}) | ${clip.words} | ${clip.durationSeconds}s | ${clip.wordsPerMinute} | ${clip.speakingWordsPerMinute} | \`${clip.key}\` |`),
    '',
    'ElevenLabs `eleven_multilingual_v2`; B1 speed 0.8; 0.5s silence before and after every model/chunk clip.',
    'Nothing has been released. To publish a week later, use `speaking-release` with the existing production two-key acknowledgement when appropriate.',
  ];
  await writeFile(path.join(outputDir, 'review.md'), `${rows.join('\n')}\n`, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) await appendSummary(...rows);
  for (const clip of clips) {
    console.log(`Week ${clip.week} ${clip.title}: ${clip.speaker} (${clip.voice}), ${clip.words} words, ${clip.durationSeconds}s incl. pads, ${clip.wordsPerMinute} wpm wall clock (${clip.speakingWordsPerMinute} speech-only wpm) -> ${clip.key}`);
  }
  const wpmNotice = clips
    .map((clip) => `W${clip.week} ${clip.kind}${clip.index ? ` ${clip.index}` : ''}: ${clip.wordsPerMinute} wpm incl. pads (${clip.speakingWordsPerMinute} speech-only)`)
    .join(' | ');
  console.log(`::notice title=Speaking clip WPM::${wpmNotice.slice(0, 4000)}`);
  console.log(`${clips.length} speaking clips uploaded unreleased to ${DEFAULT_REVIEW_BUCKET}. No release or approval-state write occurred.`);
}

async function releaseSpeaking(weeks) {
  if (weeks.length !== 1) throw new Error('--speaking-release requires exactly one week per run');
  weeks.forEach((week) => assertTrialWeek(week));
  const verdict = checkApprovalTarget({ url: supabaseUrl, bypass: isApprovalBypassRequested() });
  if (!verdict.ok) throw new Error(verdict.reason);
  const client = requireSupabase();
  for (const week of weeks) {
    const keys = await publishSpeakingWeek(client, week, (message) => console.log(message));
    await setSpeakingWeekPublished(client, week, true);
    console.log(`Week ${week}: ${keys.length} speaking clips copied to public ${AUDIO_BUCKET}; learner audio URLs enabled.`);
  }
}

async function revokeSpeaking(weeks) {
  if (weeks.length !== 1) throw new Error('--speaking-revoke requires exactly one week per run');
  const [week] = weeks;
  assertTrialWeek(week);
  const verdict = checkApprovalTarget({ url: supabaseUrl, bypass: isApprovalBypassRequested() });
  if (!verdict.ok) throw new Error(verdict.reason);
  const client = requireSupabase();
  const { deleteReleasedFiles } = await import('./lib/course-audio/publish.mjs');
  const removed = await deleteReleasedFiles(client, week);
  await setSpeakingWeekPublished(client, week, false);
  console.log(`Week ${week}: speaking clips revoked; removed ${removed.length} public object(s), learner audio URLs cleared.`);
}

/** Persist learner playback URLs in the existing syllabus-week JSON payload. */
async function setSpeakingWeekPublished(client, week, released) {
  const { data, error } = await client.from('syllabus_week_details').select('payload').eq('week_number', week).maybeSingle();
  if (error || !data?.payload) throw new Error(`Could not load Week ${week} syllabus payload: ${JSON.stringify(error)}`);
  const payload = structuredClone(data.payload);
  if (!payload.speaking) throw new Error(`Week ${week} syllabus has no speaking section`);
  if (released) {
    const publicBase = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${AUDIO_BUCKET}/weeks-01-04/ai-trial`;
    payload.speaking.audioUrl = `${publicBase}/speaking-week-${week}-model.mp3`;
    payload.speaking.shadowingChunks = payload.speaking.shadowingChunks.map((chunk, index) => ({
      ...chunk, audioUrl: `${publicBase}/speaking-week-${week}-shadowing-${index + 1}.mp3`,
    }));
  } else {
    delete payload.speaking.audioUrl;
    payload.speaking.shadowingChunks = payload.speaking.shadowingChunks.map((chunk) => { const clean = { ...chunk }; delete clean.audioUrl; return clean; });
  }
  const update = await client.from('syllabus_week_details').update({ payload }).eq('week_number', week);
  if (update.error) throw new Error(`Could not update Week ${week} speaking URLs: ${JSON.stringify(update.error)}`);
}

async function speakingVoiceCheck() {
  if (!elevenLabsKey) throw new Error('Set ELEVENLABS_API_KEY to synthesise the speaking voice check.');
  const outputDir = path.join(process.cwd(), 'speaking-voice-check');
  const clips = await generateSpeakingVoiceCheck({
    apiKey: elevenLabsKey,
    outputDir,
    speaker: 'Aisha',
    pace: 'b1',
    log: (message) => console.log(message),
  });
  const rows = [
    '# Week 1 speaking voice check',
    '',
    'Download the `speaking-voice-check` artifact from this run. These are preview clips only; nothing was uploaded to Supabase Storage or released.',
    '',
    '| Clip | Voice | Words | Duration (incl. pads) | WPM (incl. pads) | Speech-only WPM |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...clips.map((clip) => `| ${clip.title} | ${clip.speaker} (${clip.voice}) | ${clip.words} | ${clip.durationSeconds}s | ${clip.wordsPerMinute} | ${clip.speakingWordsPerMinute} |`),
    '',
    'ElevenLabs model: `eleven_multilingual_v2`; B1 speed: 0.8; leading and trailing silence: 0.5s per clip.',
    'The WPM values use the generated audio duration; the wall-clock value includes both 0.5s pads.',
    'Approval is required before generating the remaining speaking tracks.',
  ];
  if (process.env.GITHUB_STEP_SUMMARY) await appendSummary(...rows);
  for (const clip of clips) {
    console.log(`${clip.title}: ${clip.words} words, ${clip.durationSeconds}s incl. pads, ${clip.wordsPerMinute} wpm wall clock (${clip.speakingWordsPerMinute} speech-only wpm) -> ${clip.mp3Path}`);
  }
  console.log('Speaking voice-check clips generated as workflow artifacts only. Nothing uploaded to Storage or released.');
}

async function main() {
  if (args.includes('--speaking-voice-check')) return speakingVoiceCheck();
  if (args.includes('--speaking-generate')) return speakingGenerate();
  const speakingReleaseWeekList = listArg('--speaking-release');
  if (speakingReleaseWeekList) return releaseSpeaking(speakingReleaseWeekList);
  const speakingRevokeWeekList = listArg('--speaking-revoke');
  if (speakingRevokeWeekList) return revokeSpeaking(speakingRevokeWeekList);
  const weekList = listArg('--week') ?? listArg('--weeks');
  const reviewWeekList = listArg('--review');
  const releaseWeekList = listArg('--release');
  const revokeWeekList = listArg('--revoke');
  const listTrials = args.includes('--list');
  const deleteTrial = args.includes('--delete-trial');
  const confirmDelete = confirmRequested();
  const checkVoices = args.includes('--voice-check');
  // `--only tom-two-lines` re-records one named clip instead of all of them.
  const onlyKeys = nameListArg('--only');
  const sampleWeekList = listArg('--voice-sample');
  const paceIdx = args.indexOf('--pace');
  const paceMode = paceIdx !== -1 ? args[paceIdx + 1] : 'b1';
  const deleteProbesFlag = args.includes('--delete-probes');

  if (checkVoices) return voiceCheck(onlyKeys);
  if (deleteProbesFlag) return deleteProbes(confirmDelete);
  if (sampleWeekList) {
    if (sampleWeekList.length !== 1) throw new Error('--voice-sample takes exactly one week');
    return voiceSample(sampleWeekList[0], paceMode);
  }

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
