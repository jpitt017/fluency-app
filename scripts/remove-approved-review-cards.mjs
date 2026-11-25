import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/;
const APPROVAL_PHRASE = 'the learner approved these cards';

/**
 * Remove only individually approved, unchanged, unreviewed Review cards.
 * The hash identifies the owner without putting their ID or email in the
 * workflow inputs. Do not call this as part of a test or deployment.
 *
 * Preconditions are checked for *all* cards before the first DELETE. Each
 * DELETE repeats the ID, owner, updated-at and unreviewed-state filters, so
 * it cannot broaden to other records or delete a card changed since approval.
 */
export async function removeApprovedReviewCards(client, approval, confirmation) {
  if (confirmation !== APPROVAL_PHRASE) throw new Error('The explicit learner-approval confirmation is required.');
  if (!approval || typeof approval.ownerHash !== 'string' || !/^[0-9a-f]{64}$/.test(approval.ownerHash)
      || !Array.isArray(approval.cards) || approval.cards.length < 1 || approval.cards.length > 2) {
    throw new Error('Approval must identify one or two cards and the owner fingerprint.');
  }
  const cards = approval.cards.map((card) => {
    if (!card || !UUID.test(card.id) || typeof card.updatedAt !== 'string'
        || !TIMESTAMP.test(card.updatedAt) || !Number.isFinite(Date.parse(card.updatedAt))) {
      throw new Error('Approval contains an invalid card ID or timestamp.');
    }
    return { id: card.id.toLowerCase(), updatedAt: card.updatedAt };
  });
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error('Card IDs must be distinct.');

  function unchanged(query, card) {
    return query.eq('id', card.id).eq('updated_at', card.updatedAt)
      .eq('reps', 0).is('last_review_at', null).eq('mastered', false).eq('suspended', false);
  }

  // Read no other learner's answers or cards: each lookup is by an approved ID.
  const targets = [];
  for (const card of cards) {
    const { data, error } = await unchanged(
      client.from('error_review_cards').select('id,user_id'), card,
    ).maybeSingle();
    if (error || !data || data.id !== card.id || typeof data.user_id !== 'string' || !UUID.test(data.user_id)) {
      throw new Error('The approved cards are missing or have changed; no cards were removed.');
    }
    const owner = data.user_id.toLowerCase();
    const fingerprint = createHash('sha256').update(owner).digest('hex');
    if (fingerprint !== approval.ownerHash) throw new Error('The approved owner does not match; no cards were removed.');
    targets.push({ ...card, owner });
  }

  let removed = 0;
  for (const target of targets) {
    const { data, error } = await unchanged(
      client.from('error_review_cards').delete().eq('user_id', target.owner), target,
    ).select('id');
    if (error || data?.length !== 1 || data[0].id !== target.id) {
      throw new Error(`The removal stopped after ${removed} card(s); inspect their current state before retrying.`);
    }
    removed += 1;
  }
  return removed;
}

async function main() {
  // GitHub stores dispatch inputs in its event file; do not echo them or pass
  // them in shell arguments/logs. They contain card IDs, never learner answers.
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const approval = JSON.parse(event.inputs?.approval ?? 'null');
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (url.protocol !== 'https:' || url.hostname !== 'ebzmkhrssgnzmixfsuso.supabase.co'
      || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('The approved production project is not configured.');
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('The service role is not configured.');
  const client = createClient(url.toString(), key, { auth: { persistSession: false } });
  const count = await removeApprovedReviewCards(client, approval, event.inputs?.confirmation);
  console.log(`Removed ${count} approved Review card(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Only our fixed messages can be logged, never parsing/provider details,
    // learner answers, account IDs, card IDs or other input values.
    const messages = new Set([
      'The explicit learner-approval confirmation is required.',
      'Approval must identify one or two cards and the owner fingerprint.',
      'Approval contains an invalid card ID or timestamp.',
      'Card IDs must be distinct.',
      'The approved cards are missing or have changed; no cards were removed.',
      'The approved owner does not match; no cards were removed.',
      'The approved production project is not configured.',
      'The service role is not configured.',
    ]);
    const message = error instanceof Error ? error.message : '';
    console.error(messages.has(message) || /^The removal stopped after [0-2] card\(s\); inspect their current state before retrying\.$/.test(message)
      ? message : 'Review-card removal failed; inspect current state before retrying.');
    process.exitCode = 1;
  });
}
