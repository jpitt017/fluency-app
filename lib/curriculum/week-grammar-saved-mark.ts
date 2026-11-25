import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { markLearnerGrammarAnswer } from './learner-grammar-marking.mjs';
import { matchesGrammarAnswer } from './grammar-marking.mjs';

/**
 * A saved false mark can predate a deterministic correction to the learner
 * marker. Re-evaluate it on read, without altering the stored attempt, so the
 * restored feedback and the next Finish agree. Never turn an old true into a
 * false; never invent a mark for an open-ended "Use it" sentence.
 */
export function effectiveGrammarMark(week: number, id: string, answer: unknown, stored: boolean): boolean {
  if (stored) return true;
  const item = details.weeks.find((entry) => entry.number === week)?.grammar.practice.items.find((entry) => entry.id === id);
  if (!item || item.step === 'Use it') return stored;

  if (item.step === 'Rewrite') {
    if (typeof answer !== 'string' || typeof item.key !== 'string') return stored;
    const accepted = [item.key, ...item.accepted.filter((value): value is string => typeof value === 'string')];
    return accepted.some((candidate) => matchesGrammarAnswer(candidate, answer, true));
  }
  try {
    return markLearnerGrammarAnswer(item, answer);
  } catch {
    // An old malformed attempt is not enough evidence to change its mark.
    return stored;
  }
}
