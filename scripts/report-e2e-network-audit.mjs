import { readFileSync } from 'node:fs';

const file = process.env.E2E_NETWORK_AUDIT_FILE;
if (!file) throw new Error('Missing E2E_NETWORK_AUDIT_FILE; refusing to skip the network audit.');

let content;
try {
  content = readFileSync(file, 'utf8');
} catch (error) {
  throw new Error(`Could not read the E2E network audit: ${error.message}`);
}

const events = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (events.length > 0) {
  console.error(`::error::E2E blocked ${events.length} browser request(s) to the live Supabase project.`);
  for (const event of events.slice(0, 20)) {
    console.error(`::error::${event.method} ${event.origin}${event.pathname} in ${event.test}`);
  }
  process.exitCode = 1;
} else {
  console.log('E2E network audit passed: 0 browser requests to the live Supabase project.');
}
