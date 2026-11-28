/**
 * Contraction-aware normalisation and equivalence for learner marking.
 *
 * Treats contracted and full forms as equivalent across all weekly tasks and
 * Review cards without conflating distinct meanings (for example, `'s` matches
 * both `is` and `has`, and `'d` matches both `had` and `would`, while `is`
 * never matches `has` and `had` never matches `would`).
 */

const NEGATIVE_BASE = new Set([
  'do', 'does', 'did',
  'is', 'are', 'was', 'were',
  'have', 'has', 'had',
  'would', 'could', 'should', 'must', 'might', 'need', 'ought', 'dare',
]);

function expandWord(raw) {
  const word = raw.replace(/^'+|'+$/g, (match, offset, full) => {
    // Keep a leading apostrophe on standalone contractions like "'m", "'ve", "'s".
    if (offset === 0 && /^'(?:ve|d|s|m|re|ll)$/.test(full)) return match;
    return '';
  });
  if (!word) return [];

  if (word === "can't" || word === 'cannot') return ['can', 'not'];
  if (word === "won't") return ['will', 'not'];
  if (word === "shan't") return ['shall', 'not'];
  if (word === "n't") return ['not'];
  if (word === "let's") return ['let', 'us'];

  const neg = /^([a-z]+)n't$/.exec(word);
  if (neg && NEGATIVE_BASE.has(neg[1])) return [neg[1], 'not'];

  if (word === "'ve") return ['have'];
  if (word === "'m") return ['am'];
  if (word === "'re") return ['are'];
  if (word === "'ll") return ['will'];
  if (word === "'d") return ["'d"];
  if (word === "'s") return ["'s"];

  const suffix = /^([a-z0-9]+)'(ve|m|re|ll|d|s)$/.exec(word);
  if (suffix) {
    const [, base, ending] = suffix;
    if (ending === 've') return [base, 'have'];
    if (ending === 'm') return [base, 'am'];
    if (ending === 're') return [base, 'are'];
    if (ending === 'll') return [base, 'will'];
    if (ending === 'd') return [base, "'d"];
    if (ending === 's') return [base, "'s"];
  }

  return [word.replace(/^'+|'+$/g, '')].filter(Boolean);
}

/**
 * Tokenise a sentence or phrase into lowercase words with punctuation removed
 * and contractions expanded into comparable tokens. Pass `{ preserveCommas: true }`
 * when commas remain grammatically significant.
 */
export function tokenizeForMarking(text, { preserveCommas = false } = {}) {
  if (typeof text !== 'string') return [];
  let cleaned = text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    // Normalise "3 p.m." / "3 pm" / "6 a.m." to "3pm" / "6am".
    .replace(/\b(\d{1,2})\s*([ap])\.?\s*m\.?(?!\w)/g, '$1$2m')
    .replace(/\b([ap])\.m\.?(?!\w)/g, '$1m')
    // Keep decimal points between digits, remove other full stops.
    .replace(/(?<!\d)\.(?!\d)/g, ' ');

  if (preserveCommas) {
    cleaned = cleaned
      .replace(/,/g, ' , ')
      .replace(/[!?;:"()[\]{}—–\-/\\]+/g, ' ');
  } else {
    cleaned = cleaned.replace(/[,!?;:"()[\]{}—–\-/\\]+/g, ' ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const tokens = [];
  for (const part of cleaned.split(' ')) {
    if (preserveCommas && part === ',') {
      tokens.push(',');
      continue;
    }
    tokens.push(...expandWord(part));
  }
  return tokens;
}

/** Compare two token arrays with ambiguous `'s` and `'d` support. */
export function tokensEquivalent(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === right) continue;
    if ((left === "'s" && (right === 'is' || right === 'has'))
      || (right === "'s" && (left === 'is' || left === 'has'))) {
      continue;
    }
    if ((left === "'d" && (right === 'had' || right === 'would'))
      || (right === "'d" && (left === 'had' || left === 'would'))) {
      continue;
    }
    return false;
  }
  return true;
}

/** True when two learner/reference strings are equivalent under contraction rules. */
export function answersEquivalent(a, b, options = {}) {
  const left = tokenizeForMarking(a, options);
  const right = tokenizeForMarking(b, options);
  return left.length > 0 && tokensEquivalent(left, right);
}

/**
 * Normalise a single word for diff comparison: ignores capital letters and
 * leading/trailing punctuation while keeping internal apostrophes.
 */
export function normalizeDiffWord(word) {
  return String(word ?? '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/^(\d{0,2})([ap])\.m$/i, '$1$2m');
}
