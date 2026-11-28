import { learnerGrammarReason } from './learner-grammar-reasons.mjs';

/**
 * Build a Review card from a checked, wrong fixed-answer question.
 *
 * Rules:
 * - The corrected answer is always a full sentence, never a single word.
 *   If a full sentence cannot be built (for example, a Yes/No concept check),
 *   log and return null rather than creating an unanswerable card.
 * - Gap items keep their authored gap prompt — including any bracketed hint or
 *   word count ("___ (drive)", "___ (3 words)") — instead of stripping it.
 * - Explanations use the item's own authored reason.
 */

export function parts(value) {
  if (Array.isArray(value)) return value.every((part) => typeof part === 'string') ? value : [];
  return typeof value === 'string' ? value.split(/\s*\.{3}\s*/) : [];
}

/** Collapse unnatural space before a leading contraction ("I 'm" -> "I'm"). */
function fixContractionSpacing(sentence) {
  return sentence
    .replace(/\s+('(?:m|re|ve|ll|s|d)\b)/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Substitute answer value(s) into a gapped prompt to build the full sentence.
 * Strips parenthesised exercise hints ("___ (drive)", "___ (3 words)") ONLY
 * from the completed sentence — never from the learner's prompt.
 *
 * Handles:
 * - Single blank ("She's ___ engineer." + "an" -> "She's an engineer.")
 * - Multi-blank arrays ("Where ___ your car ___ (make)?" + ["was", "made"])
 * - Split-clause single-string keys ("___ I ___ (can / borrow) your charger?" + "Can I borrow")
 */
export function buildFullSentence(prompt, value) {
  const text = String(prompt ?? '').trim();
  if (!text) return null;
  const blankMatches = text.match(/_{2,}/g) ?? [];
  if (!blankMatches.length) return null;

  const values = parts(value).map((entry) => entry.trim()).filter(Boolean);
  if (!values.length) return null;

  if (values.length === blankMatches.length) {
    let index = 0;
    const filled = text.replace(/_{2,}(?:\s*\([^)]*\))?/g, () => values[index++]);
    return /_{2,}/.test(filled) ? null : fixContractionSpacing(filled);
  }

  // Handle patterns like "___ I ___ (can / borrow) your charger?" where the key
  // is a single string containing the fixed word between the two gaps ("Can I borrow").
  if (blankMatches.length === 2 && values.length === 1) {
    const pattern = /_{2,}(?:\s*\([^)]*\))?\s+([^_]+?)\s+_{2,}(?:\s*\([^)]*\))?/;
    const match = pattern.exec(text);
    if (match) {
      const middle = match[1].trim();
      const escapedMiddle = middle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const middleRegex = new RegExp(`\\b${escapedMiddle}\\b`, 'i');
      if (middleRegex.test(values[0])) {
        const filled = text.replace(pattern, values[0]);
        return /_{2,}/.test(filled) ? null : fixContractionSpacing(filled);
      }
    }
  }

  return null;
}

/**
 * True when `text` is a complete sentence rather than a single-word or bare
 * fragment answer ("Yes", "No", "an", "walk", "left", "the viewpoint").
 */
export function isFullSentence(text) {
  const clean = String(text ?? '').trim();
  if (!clean || /_{2,}/.test(clean)) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  // Must end with sentence punctuation or contain a finite-looking clause (subject + verb).
  return /[.!?]["'”’]?$/.test(clean);
}

/**
 * True when a prompt is answerable: either it has no gap (fix/rewrite/reorder),
 * or it has options (>= 2) or an inline hint / word count in brackets.
 */
export function isAnswerablePrompt(prompt, options = []) {
  const text = String(prompt ?? '').trim();
  if (!text) return false;
  if (!/_{2,}/.test(text)) return true;
  if (Array.isArray(options) && options.length >= 2) return true;
  return /_{2,}\s*\([^)]+\)/.test(text) || /\([^)]+\)\s*_{2,}/.test(text);
}

/** Same normalisation as writing feedback and existing weekly cards. */
export function normalizeReviewKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemExplanation(item) {
  const fromGrammar = item && typeof item.id === 'string' && typeof item.reason === 'string'
    ? learnerGrammarReason(item)
    : null;
  const raw = fromGrammar ?? item?.reason ?? item?.feedback ?? '';
  return String(raw).trim();
}

export function practiceErrorCard({ userId, item, answer, category }) {
  if (!item) return null;
  const keyParts = parts(item.key).map((value) => value.trim());
  if (!keyParts.length || keyParts.some((value) => !value)) return null;

  const prompt = String(item.prompt ?? '').trim();
  const normalizedKey = normalizeReviewKey(prompt);
  if (!normalizedKey) return null;

  const isQuestion = item.reviewKind === 'question' || item.step === 'Meaning';
  const hasBlanks = /_{2,}/.test(prompt);

  // Build the full corrected sentence. Never create a card with a one-word
  // answer or an unfillable blank.
  let corrected = null;
  if (hasBlanks) {
    corrected = buildFullSentence(prompt, item.key);
  } else if (!isQuestion && keyParts.length === 1) {
    corrected = fixContractionSpacing(keyParts[0]);
  }

  if (!corrected || !isFullSentence(corrected)) {
    if (!isQuestion) {
      console.warn('[week-practice-review] Skipping Review card: cannot build a full sentence.', {
        id: item.id ?? null,
        prompt,
        key: item.key,
      });
    }
    return null;
  }

  const answerParts = parts(answer);
  let shownPrompt;
  let cardFormat;
  if (hasBlanks) {
    // Keep the authored gap prompt (and any bracketed hint like "(drive)") so
    // the card is always answerable — choice cards also render option buttons.
    shownPrompt = prompt;
    cardFormat = 'cloze';
  } else if (item.reviewKind === 'reorder') {
    shownPrompt = answerParts.join(' ... ').trim();
    cardFormat = 'fix_sentence';
  } else {
    shownPrompt = item.reviewPrompt ?? prompt;
    cardFormat = 'fix_sentence';
  }

  if (!shownPrompt) return null;
  if (hasBlanks && !isAnswerablePrompt(shownPrompt, item.options)) {
    console.warn('[week-practice-review] Skipping Review card: gap has neither options nor a hint.', {
      id: item.id ?? null,
      prompt: shownPrompt,
    });
    return null;
  }

  const context = item.reviewKind === 'reorder' ? prompt : item.reviewContext ?? null;
  const explanation = itemExplanation(item) || 'Check the grammar form in this sentence.';

  return {
    user_id: userId,
    category,
    prompt_sentence: shownPrompt,
    corrected_sentence: corrected,
    explanation,
    context_sentence: context,
    card_format: cardFormat,
    // Use the authored prompt, not the learner's changing answer, to deduplicate.
    normalized_key: normalizedKey,
    due_at: new Date().toISOString(),
  };
}

/**
 * Build a Review card for a weekly reading or listening gap item
 * (L1-X3, L2-X3, L3-X3, L4-X2, L4-X3, R4-X3). Includes the full sentence
 * from the clip or text and the word-count hint after the gap.
 */
export function inputGapReviewCard({ userId, question, sourceSentence, reason, category = 'word_choice' }) {
  if (!question || typeof question.key !== 'string' || !question.key.trim()) return null;
  const key = question.key.trim();
  const wordCount = key.split(/\s+/).filter(Boolean).length;
  const wordCountHint = `(${wordCount} ${wordCount === 1 ? 'word' : 'words'})`;

  let sentenceWithGap = null;
  let fullSentence = null;

  if (typeof sourceSentence === 'string' && sourceSentence.trim()) {
    const cleanSource = sourceSentence.trim();
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(cleanSource)) {
      sentenceWithGap = cleanSource.replace(regex, `___ ${wordCountHint}`);
      fullSentence = cleanSource;
    }
  }

  if (!sentenceWithGap || !fullSentence) {
    const quoted = /"([^"]+)"/.exec(String(question.question ?? ''));
    const rawPrompt = quoted ? quoted[1].trim() : String(question.question ?? '').trim();
    if (!/_{2,}/.test(rawPrompt)) return null;
    sentenceWithGap = /_{2,}\s*\(\d+\s+words?\)/i.test(rawPrompt)
      ? rawPrompt
      : rawPrompt.replace(/_{2,}/, `___ ${wordCountHint}`);
    fullSentence = buildFullSentence(sentenceWithGap, key);
  }

  if (!sentenceWithGap || !fullSentence || !isFullSentence(fullSentence)) {
    console.warn('[week-practice-review] Skipping input gap Review card: cannot build full sentence.', {
      id: question.id ?? null,
    });
    return null;
  }

  const normalizedKey = normalizeReviewKey(question.question ?? sentenceWithGap);
  if (!normalizedKey) return null;

  return {
    user_id: userId,
    category,
    prompt_sentence: sentenceWithGap,
    corrected_sentence: fullSentence,
    explanation: String(reason ?? question.reason ?? '').trim() || `Complete the sentence using ${wordCount} ${wordCount === 1 ? 'word' : 'words'}.`,
    context_sentence: null,
    card_format: 'cloze',
    normalized_key: normalizedKey,
    due_at: new Date().toISOString(),
  };
}
