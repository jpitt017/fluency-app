#!/usr/bin/env node
/**
 * Generate a schema-valid skeleton module JSON from session-template.json
 * so authors / LLMs can draft a module and immediately run `npm run validate:curriculum`.
 *
 * Usage:
 *   node scripts/scaffold-module.mjs 2 --out /tmp/module-2-draft.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const modNum = Number(args[0]);
if (!Number.isInteger(modNum) || modNum < 1 || modNum > 8) {
  console.error('Usage: node scripts/scaffold-module.mjs <1..8> [--out path.json]');
  process.exit(1);
}

const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;

const raw = await readFile(path.join(process.cwd(), 'supabase-b1-b2/content/curriculum/session-template.json'), 'utf8');
const doc = JSON.parse(raw.replace(/module-2/g, `module-${modNum}`));
doc.modules[0].number = modNum;

const json = JSON.stringify(doc, null, 2) + '\n';
if (outPath) {
  await writeFile(outPath, json, 'utf8');
  console.log(`Wrote module ${modNum} skeleton to ${outPath}`);
} else {
  process.stdout.write(json);
}
