import { readFileSync } from 'node:fs';

const file = process.env.E2E_AI_MOCK_AUDIT_FILE;
if (!file) throw new Error('Missing E2E_AI_MOCK_AUDIT_FILE; refusing to skip the AI network audit.');

const events = readFileSync(file, 'utf8').split('\n').filter(Boolean);
if (events.some((event) => event !== 'mock' && event !== 'blocked')) {
  throw new Error('The E2E AI network audit contains an unknown event.');
}
if (events.includes('blocked')) throw new Error('An E2E process attempted to contact a live AI provider.');
const mocked = events.filter((event) => event === 'mock').length;
if (process.argv.includes('--require-mock') && mocked === 0) {
  throw new Error('The AI logging test did not exercise the offline provider mock.');
}
console.log(`E2E AI provider audit: ${mocked} mocked request(s), 0 live-provider attempts.`);
