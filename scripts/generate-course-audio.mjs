#!/usr/bin/env node
/**
 * Audio pipeline for Fluency Studio.
 *
 * Weeks 1-4 listening (the current production path):
 *   --week 1            synthesise one AI trial track: MP3 + WebVTT, one voice per
 *                       speaker, B1 pace, unreleased upload to `course-audio`
 *   --weeks 1,2,3,4     the same for several weeks
 *   --list              show the approval state of the Weeks 1-4 tracks
 *   --review 1          print a time-limited listening link for a review pass
 *   --release 1         approve a reviewed track: set audio_url + released = true
 *   --revoke 1          un-approve it again (learners fall back to "Audio coming soon")
 *   --dry-run           parse the scripts and report speakers/length, generate nothing
 *
 * These flags use the Realtime API (gpt-realtime-2.1-mini); the Speech API models
 * are deprecated with a 6 January 2027 shutdown, see
 * https://developers.openai.com/api/docs/deprecations.
 *
 * Legacy Modules 1-8 path (unchanged):
 *   1. Vocabulary items -> OpenAI TTS (`--vocab-only`, British English) uploaded to
 *      Supabase Storage (`course-audio` bucket) or S3/CDN.
 *   2. Listening tracks -> Export clean actor recording scripts (`--export-scripts`)
 *      first so real speakers / voice actors record multi-accent tracks last, then
 *      upload actor-recorded MP3s + WebVTT captions (`--upload-dir <dir>`).
 *
 * Usage:
 *   node scripts/generate-course-audio.mjs --weeks 1,2,3,4
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
  SPEAKER_VOICES,
  TTS_MODEL,
  defaultSpeakerFor,
  estimateDurationSeconds,
  generateListeningTrial,
  listeningTrialAudioKey,
  readListeningWeeks,
} from './lib/course-audio/listening-trial.mjs';
import { createWebSocketTransport, parseScript } from './lib/course-audio/tts.mjs';
import { releaseTrial, signReviewUrl } from './lib/course-audio/publish.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const runAll = args.includes('--all');
const vocabOnly = args.includes('--vocab-only');
const exportScripts = args.includes('--export-scripts');
const moduleIdx = args.indexOf('--module');
const targetModule = moduleIdx !== -1 ? Number(args[moduleIdx + 1]) : 1;
const uploadIdx = args.indexOf('--upload-dir');
const uploadDir = uploadIdx !== -1 ? args[uploadIdx + 1] : null;

function listArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} needs a week number`);
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

const weekList = listArg('--week') ?? listArg('--weeks');
const reviewWeekList = listArg('--review');
const releaseWeekList = listArg('--release');
const revokeWeekList = listArg('--revoke');
const listTrials = args.includes('--list');
const weeksMode = Boolean(weekList || reviewWeekList || releaseWeekList || revokeWeekList || listTrials);
/** Long enough to finish a review pass, short enough not to circulate. */
const REVIEW_LINK_SECONDS = 60 * 60 * 24 * 7;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const s3Bucket = process.env.AUDIO_S3_BUCKET;
const publicBaseUrl = process.env.AUDIO_PUBLIC_BASE_URL;

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function selectVoiceForAccent(accentLabel = '') {
  if (/american|\bus\b/i.test(accentLabel) && !/british|\buk\b/i.test(accentLabel)) {
    return { voice: 'alloy', instructions: 'Speak in clear, natural General American English.' };
  }
  if (/irish/i.test(accentLabel)) {
    return { voice: 'shimmer', instructions: 'Speak in warm, natural Irish-accented English.' };
  }
  if (/australian/i.test(accentLabel)) {
    return { voice: 'echo', instructions: 'Speak in clear, natural Australian English.' };
  }
  return { voice: 'fable', instructions: 'Speak in clear, natural British English.' };
}

/**
 * Legacy Modules 1-8 vocabulary audio.
 *
 * This still posts to the Speech API, whose models are deprecated with a
 * 6 January 2027 shutdown; migrate it to the Realtime path used by the Weeks 1-4
 * tracks in scripts/lib/course-audio/tts.mjs before then. The Weeks 1-4
 * listening pipeline already uses the non-deprecated model.
 */
async function synthesizeMp3(text, accentLabel = 'British') {
  const { voice, instructions } = selectVoiceForAccent(accentLabel);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      instructions,
      input: text,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    throw new Error(`TTS synthesis failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
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

      if (!openaiKey) continue;
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

  if (openaiKey) {
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

  if (!openaiKey) throw new Error('Set OPENAI_API_KEY to synthesise the AI trial tracks.');
  const client = requireSupabase();
  const outputDir = path.join(process.cwd(), 'audio-out', 'weeks-01-04');
  await mkdir(outputDir, { recursive: true });
  const transport = createWebSocketTransport();
  let uploaded = 0;

  for (const spec of wanted) {
    console.log(`Week ${spec.week}: ${spec.title} (${TTS_MODEL})`);
    const result = await generateListeningTrial({
      weekSpec: spec,
      outputDir,
      apiKey: openaiKey,
      transport,
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

async function reviewWeek(weeks) {
  const client = requireSupabase();
  for (const week of weeks) {
    const { data, error } = await client
      .from('listening_audio_trials')
      .select('week, released, captions_url, duration_seconds')
      .eq('week', week)
      .maybeSingle();
    if (error) throw new Error(`Could not read week ${week}: ${error.message}`);
    if (!data) throw new Error(`Week ${week} has no generated track yet; run --week ${week} first.`);
    const url = await signReviewUrl(client, listeningTrialAudioKey(week), REVIEW_LINK_SECONDS);
    console.log(`Week ${week} review link (valid ${REVIEW_LINK_SECONDS / 86400} days, ${data.duration_seconds ?? '?'}s):`);
    console.log(`  ${url}`);
    if (data.captions_url) console.log(`  captions: ${data.captions_url}`);
    console.log(`  state: ${data.released ? 'already released' : 'unreleased - learners cannot hear it yet'}`);
  }
}

async function releaseWeek(weeks) {
  const client = requireSupabase();
  for (const week of weeks) {
    const { data, error } = await client
      .from('listening_audio_trials')
      .select('week, captions_url, duration_seconds')
      .eq('week', week)
      .maybeSingle();
    if (error) throw new Error(`Could not read week ${week}: ${error.message}`);
    if (!data) throw new Error(`Week ${week} has no generated track; nothing to release.`);
    const { data: publicUrl } = client.storage.from('course-audio').getPublicUrl(listeningTrialAudioKey(week));
    if (!publicUrl?.publicUrl) throw new Error(`Could not resolve the public URL for week ${week}.`);
    await releaseTrial({
      client,
      week,
      audioUrl: publicUrl.publicUrl,
      captionsUrl: data.captions_url ?? null,
    });
    console.log(`Week ${week}: released · learners will see "AI voice – trial recording" and can play it twice.`);
  }
}

async function revokeWeek(weeks) {
  const client = requireSupabase();
  for (const week of weeks) {
    const { error } = await client
      .from('listening_audio_trials')
      .update({ released: false, audio_url: null, released_at: null })
      .eq('week', week);
    if (error) throw new Error(`Could not revoke week ${week}: ${error.message}`);
    console.log(`Week ${week}: revoked - the page shows "Audio coming soon." again.`);
  }
}

async function main() {
  if (weeksMode) {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
