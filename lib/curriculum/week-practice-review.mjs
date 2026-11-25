import { REVIEW_QUESTION_PREFIX } from '../b1b2/review-card-format.mjs';

/** Build a repair card from a checked, wrong fixed-answer question.
 *
 * The answer key stays on the server. A multi-blank key is a list, not a
 * string: dropping it used to leave a wrong answer out of Review altogether.
 */
function parts(value) {
  if (Array.isArray(value)) return value.every((part) => typeof part === 'string') ? value : [];
  return typeof value === 'string' ? value.split(/\s*\.{3}\s*/) : [];
}

function fillBlanks(prompt, values) {
  const count = (prompt.match(/_{2,}/g) ?? []).length;
  if (!count || count !== values.length) return null;
  let index = 0;
  // A parenthesised verb after a gap is an exercise hint, not part of the
  // completed sentence ("___ (drive)" -> "were driving").
  return prompt.replace(/_{2,}(?:\s*\([^)]*\))?/g, () => values[index++]);
}

export function practiceErrorCard({ userId, item, answer, category }) {
  const keyParts = parts(item.key).map((value) => value.trim());
  if (!keyParts.length || keyParts.some((value) => !value)) return null;
  const prompt = String(item.prompt ?? '').trim();
  const normalizedKey = normalizeKey(prompt);
  if (!normalizedKey) return null;

  const answerParts = parts(answer);
  const isQuestion = item.reviewKind === 'question' || item.step === 'Meaning';
  const shownPrompt = isQuestion ? REVIEW_QUESTION_PREFIX + prompt : fillBlanks(prompt, answerParts) ?? prompt;
  const corrected = fillBlanks(prompt, keyParts) ?? keyParts.join(' ... ');
  const correction = keyParts.join(' ... ').replace(/[.!?]+$/, '');
  return {
    user_id: userId,
    category,
    prompt_sentence: shownPrompt,
    corrected_sentence: corrected,
    explanation: isQuestion ? `The answer is ${correction}.` : `Write the answer again with this correction: ${correction}.`,
    context_sentence: null,
    card_format: 'fix_sentence',
    // Use the authored prompt, not the learner's changing answer, to deduplicate.
    normalized_key: normalizedKey,
    due_at: new Date().toISOString(),
  };
}

/** Same normalisation as writing feedback and existing weekly cards. */
function normalizeKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
