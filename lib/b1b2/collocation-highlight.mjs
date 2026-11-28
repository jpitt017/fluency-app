/**
 * Highlight the whole collocation or target expression inside a full sentence.
 *
 * Handles inflected verbs ("take a risk" -> "took a risk", "leave a job" ->
 * "left her job"), pronouns/determiners ("set a goal" -> "set myself a goal",
 * "meet a deadline" -> "meet Friday's deadline"), and phrasal-verb objects
 * ("put (something) off" -> "put off" / "put it off").
 */

const VERB_FORMS = {
  achieve: ['achieve', 'achieves', 'achieved', 'achieving'],
  adapt: ['adapt', 'adapts', 'adapted', 'adapting'],
  apply: ['apply', 'applies', 'applied', 'applying'],
  arrange: ['arrange', 'arranges', 'arranged', 'arranging'],
  break: ['break', 'breaks', 'broke', 'broken', 'breaking'],
  catch: ['catch', 'catches', 'caught', 'catching'],
  clear: ['clear', 'clears', 'cleared', 'clearing'],
  come: ['come', 'comes', 'came', 'coming'],
  face: ['face', 'faces', 'faced', 'facing'],
  get: ['get', 'gets', 'got', 'gotten', 'getting'],
  have: ['have', 'has', 'had', 'having'],
  improve: ['improve', 'improves', 'improved', 'improving'],
  intend: ['intend', 'intends', 'intended', 'intending'],
  invite: ['invite', 'invites', 'invited', 'inviting'],
  keep: ['keep', 'keeps', 'kept', 'keeping'],
  leave: ['leave', 'leaves', 'left', 'leaving'],
  look: ['look', 'looks', 'looked', 'looking'],
  make: ['make', 'makes', 'made', 'making'],
  meet: ['meet', 'meets', 'met', 'meeting'],
  miss: ['miss', 'misses', 'missed', 'missing'],
  pop: ['pop', 'pops', 'popped', 'popping'],
  put: ['put', 'puts', 'putting'],
  regret: ['regret', 'regrets', 'regretted', 'regretting'],
  rely: ['rely', 'relies', 'relied', 'relying'],
  set: ['set', 'sets', 'setting'],
  stick: ['stick', 'sticks', 'stuck', 'sticking'],
  stop: ['stop', 'stops', 'stopped', 'stopping'],
  take: ['take', 'takes', 'took', 'taken', 'taking'],
  travel: ['travel', 'travels', 'travelled', 'traveled', 'travelling', 'traveling'],
  try: ['try', 'tries', 'tried', 'trying'],
  work: ['work', 'works', 'worked', 'working'],
};

const DETERMINER_WORDS = new Set(['a', 'an', 'the', 'your', 'my', 'her', 'his', 'our', 'their', 'this', 'that']);
const PLACEHOLDER_WORDS = new Set(['someone', 'something', 'somebody', 'sb', 'sth']);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordPattern(word) {
  const lower = word.toLowerCase();
  if (VERB_FORMS[lower]) {
    return `(?:${VERB_FORMS[lower].map(escapeRegex).join('|')})`;
  }
  if (DETERMINER_WORDS.has(lower)) {
    // Allow possessives ("her", "Friday's"), quantifiers ("a few", "good"), or pronouns ("myself a").
    return `(?:(?:[a-z’']+\\s+){0,2}(?:a|an|the|my|your|his|her|its|our|their|some|several|many|good|big|real|clear|new|local|famous|common|silly|another|[a-z]+['’]s)(?:\\s+[a-z]+){0,1})?`;
  }
  // Allow singular/plural nouns ("challenge"/"challenges", "promise"/"promises", "destination"/"destinations").
  if (lower.endsWith('y') && lower.length > 3) {
    return `(?:${escapeRegex(lower)}|${escapeRegex(lower.slice(0, -1))}ies)`;
  }
  if (lower.endsWith('s')) {
    return `(?:${escapeRegex(lower)}|${escapeRegex(lower.slice(0, -1))})`;
  }
  return `(?:${escapeRegex(lower)}(?:s|es)?)`;
}

/**
 * Find the exact substring of `sentence` matching `collocation`.
 * Returns `{ before, match, after }` or `null` if no match is found.
 */
export function findCollocationSpan(sentence, collocation) {
  if (typeof sentence !== 'string' || typeof collocation !== 'string') return null;
  const cleanCollocation = collocation
    .replace(/\+\s*-ing/gi, '')
    .replace(/\([^)]*\)/g, (group) => {
      const inner = group.slice(1, -1).trim().toLowerCase();
      return PLACEHOLDER_WORDS.has(inner) ? ' __SLOT__ ' : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanCollocation) return null;

  const rawWords = cleanCollocation.split(' ').filter(Boolean);
  const parts = [];
  for (let i = 0; i < rawWords.length; i += 1) {
    const token = rawWords[i];
    if (token === '__SLOT__' || PLACEHOLDER_WORDS.has(token.toLowerCase())) {
      parts.push(`(?:\\s+[A-Za-z'’]+){0,3}`);
      continue;
    }
    const lower = token.toLowerCase();
    if (DETERMINER_WORDS.has(lower)) {
      const next = rawWords[i + 1];
      if (next && next !== '__SLOT__') {
        // Optional determiner/modifier span between the previous word and the head noun.
        parts.push(`(?:\\s+(?:[A-Za-z'’]+\\s+){0,2})?`);
        continue;
      }
    }
    const pat = wordPattern(token);
    if (parts.length === 0) {
      parts.push(`\\b${pat}`);
    } else if (parts[parts.length - 1].includes('(?:\\s+')) {
      parts.push(`\\s*${pat}`);
    } else {
      // Allow up to 2 short modifiers (e.g. "making good progress", "get on really well with")
      parts.push(`\\s+(?:(?:[A-Za-z'’]+\\s+){0,2})?${pat}`);
    }
  }

  const pattern = `${parts.join('')}\\b`;
  try {
    const regex = new RegExp(pattern, 'i');
    const found = regex.exec(sentence);
    if (found && found[0].trim()) {
      return {
        start: found.index,
        end: found.index + found[0].length,
        before: sentence.slice(0, found.index),
        match: found[0],
        after: sentence.slice(found.index + found[0].length),
      };
    }
  } catch {
    // Fall through to simple literal search.
  }

  // Fallback: direct case-insensitive match of the cleaned collocation.
  const literal = cleanCollocation.replace(/__SLOT__/g, '').replace(/\s+/g, ' ').trim();
  if (!literal) return null;
  const idx = sentence.toLowerCase().indexOf(literal.toLowerCase());
  if (idx < 0) return null;
  return {
    start: idx,
    end: idx + literal.length,
    before: sentence.slice(0, idx),
    match: sentence.slice(idx, idx + literal.length),
    after: sentence.slice(idx + literal.length),
  };
}
