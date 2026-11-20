#!/usr/bin/env node
/**
 * Generate British / multi-accent audio files and WebVTT captions for curriculum
 * `content_inputs` and `vocab_items`, upload to Supabase Storage (`course-audio` bucket)
 * or S3/CDN, and persist canonical URLs to Postgres.
 *
 * Keeps large audio out of Git/Vercel bundles as modules 2-8 scale!
 *
 * Environment variables:
 *   OPENAI_API_KEY          - Required for TTS synthesis (gpt-4o-mini-tts)
 *   AUDIO_S3_BUCKET         - Optional S3 bucket (uses @aws-sdk/client-s3)
 *   AUDIO_PUBLIC_BASE_URL   - Optional CDN/S3 public base URL
 *   NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY - Supabase Storage + DB update
 *
 * Usage:
 *   node scripts/generate-course-audio.mjs --module 2 --dry-run
 *   node scripts/generate-course-audio.mjs --all
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const runAll = args.includes('--all');
const moduleIdx = args.indexOf('--module');
const targetModule = moduleIdx !== -1 ? Number(args[moduleIdx + 1]) : 1;

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
  if (dryRun || !openaiKey) return;

  for (const inp of inputs ?? []) {
    if (inp.audio_url && /^https?:\/\//i.test(inp.audio_url)) continue;

    // Synthesize multi-speaker segments with distinct accents when speaker_accents are present
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

    const baseKey = `module-${moduleNum}/${slugify(inp.title)}`;
    const url = await uploadBuffer(`${baseKey}.mp3`, audioBuffer, 'audio/mpeg', supabase);
    await uploadBuffer(`${baseKey}.vtt`, buildVtt(inp.body, inp.duration_seconds), 'text/vtt; charset=utf-8', supabase);
    await supabase.from('content_inputs').update({ audio_url: url }).eq('id', inp.id);
    console.log(`Uploaded input + VTT: ${baseKey}.mp3 -> ${url}`);
  }

  for (const item of vocabItems ?? []) {
    if (item.audio_url && /^https?:\/\//i.test(item.audio_url)) continue;
    const mp3 = await synthesizeMp3(`${item.term}. ${item.example}`, 'British');
    const key = `module-${moduleNum}/${slugify(item.term)}.mp3`;
    const url = await uploadBuffer(key, mp3, 'audio/mpeg', supabase);
    await supabase.from('vocab_items').update({ audio_url: url }).eq('id', item.id);
    console.log(`Uploaded vocab: ${key} -> ${url}`);
  }
}

async function main() {
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
