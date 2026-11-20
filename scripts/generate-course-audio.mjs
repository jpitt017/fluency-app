#!/usr/bin/env node
/**
 * Audio pipeline for Fluency Studio (Modules 1-8):
 *   1. Vocabulary items -> OpenAI TTS (`--vocab-only`, British English) uploaded to
 *      Supabase Storage (`course-audio` bucket) or S3/CDN.
 *   2. Listening tracks -> Export clean actor recording scripts (`--export-scripts`)
 *      first so real speakers / voice actors record multi-accent tracks last, then
 *      upload actor-recorded MP3s + WebVTT captions (`--upload-dir <dir>`).
 *
 * Usage:
 *   node scripts/generate-course-audio.mjs --export-scripts
 *   node scripts/generate-course-audio.mjs --module 2 --vocab-only
 *   node scripts/generate-course-audio.mjs --module 2 --upload-dir ./recordings
 *   node scripts/generate-course-audio.mjs --all --dry-run
 */

import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const runAll = args.includes('--all');
const vocabOnly = args.includes('--vocab-only');
const exportScripts = args.includes('--export-scripts');
const moduleIdx = args.indexOf('--module');
const targetModule = moduleIdx !== -1 ? Number(args[moduleIdx + 1]) : 1;
const uploadIdx = args.indexOf('--upload-dir');
const uploadDir = uploadIdx !== -1 ? args[uploadIdx + 1] : null;

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

async function main() {
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
