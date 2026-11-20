#!/usr/bin/env node
/**
 * Pre-generate British / multi-accent audio files for curriculum content_inputs
 * and vocab_items, upload to S3 or Supabase Storage (course-audio bucket),
 * and update `audio_url` in Postgres.
 *
 * Environment variables:
 *   OPENAI_API_KEY          - Required for TTS synthesis (gpt-4o-mini-tts / tts-1)
 *   AUDIO_S3_BUCKET         - Optional S3 bucket (uses @aws-sdk/client-s3)
 *   AUDIO_PUBLIC_BASE_URL   - Optional CDN/S3 public base URL
 *   NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY - Optional Supabase Storage + DB update
 *
 * Usage:
 *   node scripts/generate-course-audio.mjs --module 1 --dry-run
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
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
    return 'alloy';
  }
  if (/australian/i.test(accentLabel)) {
    return 'echo';
  }
  // Deliberately prefer British / non-US voice profiles by default
  return 'fable';
}

async function synthesizeMp3(text, voice) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    throw new Error(`TTS synthesis failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadBuffer(key, buffer, supabase) {
  if (s3Bucket) {
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' });
    await s3.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: 'audio/mpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : `https://${s3Bucket}.s3.amazonaws.com/${key}`;
  }

  if (supabase) {
    const { error } = await supabase.storage.from('course-audio').upload(key, buffer, {
      contentType: 'audio/mpeg',
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

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.log('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to sync audio assets with Postgres.');
    process.exit(0);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: mod } = await supabase
    .from('modules')
    .select('id, module_number, title')
    .eq('module_number', targetModule)
    .single();

  if (!mod) throw new Error(`Module ${targetModule} not found`);

  const { data: inputs } = await supabase
    .from('content_inputs')
    .select('id, kind, title, accent, body, audio_url')
    .eq('module_id', mod.id);

  const { data: decks } = await supabase
    .from('vocab_decks')
    .select('id')
    .eq('module_id', mod.id);

  const deckIds = (decks ?? []).map((d) => d.id);
  const { data: vocabItems } = deckIds.length
    ? await supabase.from('vocab_items').select('id, term, example, audio_url').in('deck_id', deckIds)
    : { data: [] };

  console.log(`Module ${targetModule}: ${inputs?.length ?? 0} inputs, ${vocabItems?.length ?? 0} vocab items.`);

  if (dryRun || !openaiKey) {
    console.log(dryRun ? 'Dry run complete.' : 'OPENAI_API_KEY missing; skipping synthesis.');
    return;
  }

  for (const inp of inputs ?? []) {
    if (inp.audio_url) continue;
    const voice = selectVoiceForAccent(inp.accent ?? 'British');
    const mp3 = await synthesizeMp3(inp.body, voice);
    const key = `module-${targetModule}/${slugify(inp.title)}.mp3`;
    const url = await uploadBuffer(key, mp3, supabase);
    await supabase.from('content_inputs').update({ audio_url: url }).eq('id', inp.id);
    console.log(`Uploaded input: ${key} -> ${url}`);
  }

  for (const item of vocabItems ?? []) {
    if (item.audio_url) continue;
    const mp3 = await synthesizeMp3(`${item.term}. ${item.example}`, 'fable');
    const key = `module-${targetModule}/${slugify(item.term)}.mp3`;
    const url = await uploadBuffer(key, mp3, supabase);
    await supabase.from('vocab_items').update({ audio_url: url }).eq('id', item.id);
    console.log(`Uploaded vocab: ${key} -> ${url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
