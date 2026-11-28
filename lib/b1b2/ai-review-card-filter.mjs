import { answersEquivalent, normalizeDiffWord } from './contractions.mjs';

/**
 * Filter and narrow AI writing/speaking corrections before creating Review cards.
 *
 * Rules:
 * - Only create a card for a correction fixing ONE grammar or vocabulary point:
 *   changed part <= 4 words (by word diff), original <= 25 words, and category
 *   not coherence, organisation, or style.
 * - For a long sentence, show only the clause with the mistake, with the rest
 *   as context.
 */

export const MAX_CARD_ORIGINAL_WORDS = 25;
export const MAX_CARD_CHANGED_WORDS = 4;
export const LONG_SENTENCE_CLAUSE_THRESHOLD = 14;

export const EXCLUDED_CARD_CATEGORIES = new Set([
  'coherence',
  'organisation',
  'organization',
  'style',
]);

export function wordCount(text) {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

/** LCS word diff ignoring case and leading/trailing punctuation. */
export function computeNormalizedWordDiff(original, corrected) {
  const a = String(original ?? '').trim().split(/\s+/).filter(Boolean);
  const b = String(corrected ?? '').trim().split(/\s+/).filter(Boolean);
  const m = a.length;
  const n = b.length;

  const normA = a.map(normalizeDiffWord);
  const normB = b.map(normalizeDiffWord);

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (normA[i - 1] && normA[i - 1] === normB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const tokens = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && normA[i - 1] && normA[i - 1] === normB[j - 1]) {
      tokens.push({ type: 'same', text: b[j - 1], origIndex: i - 1, corrIndex: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.push({ type: 'added', text: b[j - 1], corrIndex: j - 1 });
      j -= 1;
    } else {
      tokens.push({ type: 'removed', text: a[i - 1], origIndex: i - 1 });
      i -= 1;
    }
  }

  return tokens.reverse();
}

/** Summarise contiguous diff hunks between original and corrected text. */
export function analyzeCorrectionDiff(original, corrected) {
  const tokens = computeNormalizedWordDiff(original, corrected);
  const hunks = [];
  let current = null;

  for (const token of tokens) {
    if (token.type === 'same') {
      if (current) {
        hunks.push(current);
        current = null;
      }
      continue;
    }
    if (!current) current = { removed: [], added: [] };
    if (token.type === 'removed') current.removed.push(normalizeDiffWord(token.text));
    if (token.type === 'added') current.added.push(normalizeDiffWord(token.text));
  }
  if (current) hunks.push(current);

  const changedWords = hunks.reduce(
    (sum, hunk) => sum + Math.max(hunk.removed.length, hunk.added.length),
    0,
  );

  // Detect a pure word-order move (e.g. "always I go" -> "I always go"):
  // 2 hunks whose removed and added words are the exact same small multiset.
  let isPureWordMove = false;
  if (hunks.length === 2) {
    const removed = [...hunks[0].removed, ...hunks[1].removed].filter(Boolean).sort();
    const added = [...hunks[0].added, ...hunks[1].added].filter(Boolean).sort();
    if (
      removed.length > 0
      && removed.length <= 2
      && removed.length === added.length
      && removed.every((word, idx) => word === added[idx])
    ) {
      isPureWordMove = true;
    }
  }

  return {
    tokens,
    hunks,
    hunkCount: hunks.length,
    changedWords,
    isPureWordMove,
  };
}

function splitClauses(sentence) {
  const parts = sentence
    .split(/(?<=[,;—–])\s+|(?=\s+(?:and|but|so|because|while|although|though|when|which)\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts;
}

function capitaliseClause(clause) {
  const trimmed = clause.replace(/^[,;—–\s]+/, '').trim();
  if (!trimmed) return trimmed;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

/**
 * For a long multi-clause sentence, isolate the single clause containing the
 * mistake so the card stays short and keeps the full sentence as context.
 */
export function extractErrorClause(original, corrected) {
  const origClean = String(original ?? '').trim();
  const corrClean = String(corrected ?? '').trim();
  if (wordCount(origClean) < LONG_SENTENCE_CLAUSE_THRESHOLD) {
    return { promptClause: origClean, correctedClause: corrClean, contextSentence: null };
  }

  // Split primarily on strong punctuation boundaries (", ", "; ", " — ") first
  // so clauses remain grammatically intact.
  const punctPartsOrig = origClean.split(/(?<=[,;—–])\s+/).map((p) => p.trim()).filter(Boolean);
  const punctPartsCorr = corrClean.split(/(?<=[,;—–])\s+/).map((p) => p.trim()).filter(Boolean);

  const pairs = punctPartsOrig.length >= 2 && punctPartsOrig.length === punctPartsCorr.length
    ? punctPartsOrig.map((part, index) => [part, punctPartsCorr[index]])
    : (() => {
        const a = splitClauses(origClean);
        const b = splitClauses(corrClean);
        return a.length >= 2 && a.length === b.length ? a.map((part, index) => [part, b[index]]) : [];
      })();

  if (pairs.length < 2) {
    return { promptClause: origClean, correctedClause: corrClean, contextSentence: null };
  }

  const changedIndices = [];
  for (let i = 0; i < pairs.length; i += 1) {
    if (!answersEquivalent(pairs[i][0], pairs[i][1])) {
      changedIndices.push(i);
    }
  }

  if (changedIndices.length !== 1) {
    return { promptClause: origClean, correctedClause: corrClean, contextSentence: null };
  }

  const [origClause, corrClause] = pairs[changedIndices[0]];
  let cleanOrigClause = origClause.replace(/[,;—–]+$/, '').trim();
  let cleanCorrClause = corrClause.replace(/[,;—–]+$/, '').trim();
  const lead = /^(and|but|so)\s+/i.exec(cleanOrigClause);
  if (lead && new RegExp(`^${lead[1]}\\s+`, 'i').test(cleanCorrClause)) {
    const trimmedOrig = cleanOrigClause.slice(lead[0].length).trim();
    const trimmedCorr = cleanCorrClause.slice(lead[0].length).trim();
    if (wordCount(trimmedOrig) >= 3 && wordCount(trimmedCorr) >= 3) {
      cleanOrigClause = trimmedOrig;
      cleanCorrClause = trimmedCorr;
    }
  }
  if (wordCount(cleanOrigClause) < 3 || wordCount(cleanCorrClause) < 3) {
    return { promptClause: origClean, correctedClause: corrClean, contextSentence: null };
  }

  return {
    promptClause: capitaliseClause(cleanOrigClause),
    correctedClause: capitaliseClause(cleanCorrClause),
    contextSentence: origClean,
  };
}

function isExcludedCategory(category, otherLabel) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (EXCLUDED_CARD_CATEGORIES.has(cat)) return true;
  if (cat === 'other' && otherLabel) {
    const label = String(otherLabel).trim().toLowerCase();
    for (const banned of EXCLUDED_CARD_CATEGORIES) {
      if (label.includes(banned)) return true;
    }
  }
  return false;
}

/**
 * Decide whether an AI writing/speaking correction should become a Review card.
 * Returns `{ ok: true, promptSentence, correctedSentence, contextSentence }` or
 * `{ ok: false, reason }` (in which case the correction stays in feedback only).
 *
 * @param {{ original: string, corrected: string, category: string, otherLabel?: string | null, contextSentence?: string | null }} params
 */
export function evaluateAiCorrectionForCard({
  original,
  corrected,
  category,
  otherLabel = null,
  contextSentence = null,
}) {
  const origClean = String(original ?? '').trim();
  const corrClean = String(corrected ?? '').trim();

  if (isExcludedCategory(category, otherLabel)) {
    return { ok: false, reason: 'excluded_category' };
  }
  if (!origClean || !corrClean || wordCount(origClean) < 3 || wordCount(corrClean) < 2) {
    return { ok: false, reason: 'too_short' };
  }
  if (answersEquivalent(origClean, corrClean)) {
    return { ok: false, reason: 'no_change' };
  }
  const diff = analyzeCorrectionDiff(origClean, corrClean);
  if (diff.hunkCount === 0) {
    return { ok: false, reason: 'no_change' };
  }
  if (diff.hunkCount > 1 && !diff.isPureWordMove) {
    return { ok: false, reason: 'multi_point' };
  }
  const effectiveChanged = diff.isPureWordMove ? Math.ceil(diff.changedWords / 2) : diff.changedWords;
  if (effectiveChanged > MAX_CARD_CHANGED_WORDS) {
    return { ok: false, reason: 'too_many_words' };
  }

  // Requirement 7b: for a long sentence, narrow to just the clause with the
  // mistake and keep the full sentence as context; reject if still > 25 words.
  const extracted = extractErrorClause(origClean, corrClean);
  if (wordCount(extracted.promptClause) > MAX_CARD_ORIGINAL_WORDS) {
    return { ok: false, reason: 'too_long' };
  }

  return {
    ok: true,
    promptSentence: extracted.promptClause,
    correctedSentence: extracted.correctedClause,
    contextSentence: extracted.contextSentence ?? contextSentence ?? null,
    changedWords: effectiveChanged,
    hunkCount: diff.hunkCount,
  };
}
