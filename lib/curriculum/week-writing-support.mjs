/**
 * Safe B1–B2 week writing and Practice (/labs) target helpers.
 * Never imports or serialises `modelAnswer` before the learner's first check;
 * `highlightModelAnswer` operates only on an already-unlocked `modelText`.
 */

import { C1_BLOCKED_WORDS } from '../b1b2/level-guard.mjs';

const PLAIN_WEEK_GRAMMAR = {
  1: [
    'Past stories: I moved last year · I had never lived alone before',
    "Past habits and life now: I used to… · Since then, I've…",
  ],
  2: [
    "Plans: I'm going to… · I'm meeting… on Monday",
    "Next steps and if-plans: When I finish…, I'll… · If I don't…, I'll…",
  ],
  3: [
    "Rules and what is optional: We have to… · You mustn't… · You don't have to…",
    'Friendly advice: You should… · Could you…?',
  ],
  4: [
    'Facts about a place: It was built in… · …is held every…',
    'Describing and comparing: a street where… · quieter than… · the best…',
  ],
};

/**
 * Returns plain-English grammar lines with one short example each (never bare C1/grammar terms).
 */
export function plainGrammarTargetsForWeek(weekNumber, rawGrammar = '') {
  const wk = Number(weekNumber);
  if (Number.isInteger(wk) && PLAIN_WEEK_GRAMMAR[wk]) {
    return PLAIN_WEEK_GRAMMAR[wk];
  }
  const source = String(rawGrammar || '').trim();
  if (!source) return [];
  const lower = source.toLowerCase();
  const out = [];
  if (lower.includes('going to') || lower.includes('arrangement') || lower.includes('plan')) {
    out.push("Plans: I'm going to… · I'm meeting… on Friday");
  }
  if (lower.includes('conditional') || lower.includes('when') || lower.includes('as soon as')) {
    out.push("If-plans: If it rains, we'll… · When I arrive, I'll…");
  }
  if (lower.includes('present perfect') || lower.includes('used to') || lower.includes('narrative')) {
    out.push("Past to now: I used to… · Since then, I've…");
  }
  if (lower.includes('have to') || lower.includes('must') || lower.includes('should') || lower.includes('modal')) {
    out.push("Rules and advice: We have to… · You should…");
  }
  if (lower.includes('passive')) {
    out.push('Facts: It was built in… · …is held every year');
  }
  if (lower.includes('comparative') || lower.includes('superlative') || lower.includes('relative')) {
    out.push('Comparing and describing: quieter than… · a place where…');
  }
  return out.slice(0, 2);
}

function cleanTargetPhrase(raw) {
  return String(raw || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\+\s*(?:noun|verb|-ing).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasBlockedC1Word(phrase) {
  const words = String(phrase || '').toLowerCase().match(/[a-z]+/g) || [];
  return words.some((w) => C1_BLOCKED_WORDS.has(w));
}

/**
 * Combines `featuredWords` and `linkers` from the selected week's writing content,
 * returning at most 4 clean B1–B2 target words/phrases.
 */
export function targetWordsForWeek(featuredWords = [], linkers = []) {
  const combined = [...(Array.isArray(featuredWords) ? featuredWords : []), ...(Array.isArray(linkers) ? linkers : [])];
  const seen = new Set();
  const result = [];
  for (const raw of combined) {
    const cleaned = cleanTargetPhrase(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key) || hasBlockedC1Word(cleaned)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length === 4) break;
  }
  return result;
}

const AUTHORED_PARAGRAPH_STARTERS = {
  1: [
    ['When I…, I had never… before', 'I used to…'],
    ['The biggest challenge I faced was…', 'It took me a while to get used to…'],
    ['Eventually,…', 'Since then, I’ve…'],
    ['I’ve been …ing for…', 'Now…'],
  ],
  2: [
    ['My goal is to…', 'I intend to…'],
    ['I’m meeting / starting… on…', 'I’m going to… in order to…'],
    ['When I finish…, I’ll…', 'If I don’t…, I’ll…'],
    ['I’m looking forward to…, but I’m worried about…', 'Should I…?', 'Thanks,'],
  ],
  3: [
    ['Welcome to the flat!', 'We all get on with each other…'],
    ['We have to…', 'You mustn’t… because…'],
    ['On the other hand,…', 'You don’t have to…, but…', 'You should…'],
    ['In fact,…', 'Apart from that,…', 'See you on…!'],
  ],
  4: [
    ['Last month I spent… in…', 'It’s one of the most…'],
    ['To begin with, we visited…', 'It was built in… / … is held every…'],
    ['a place where…', 'It’s quieter / busier than…'],
    ['All in all,…', 'If you go, set off early…'],
  ],
};

/**
 * Converts a display starter template (e.g. "My goal is to…") into clean text to insert.
 */
export function starterInsertText(template) {
  const normalized = String(template || '').trim();
  if (!normalized) return '';
  // Take first option when slash alternatives are shown ("I’m meeting / starting… on…")
  const singleChoice = normalized.includes(' / ')
    ? normalized.split(' / ')[0].trim()
    : normalized;
  const cleaned = singleChoice
    .replace(/\.{3}|…/g, ' ')
    .replace(/\s+([,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (/[!?]$/.test(cleaned)) return `${cleaned} `;
  if (cleaned.endsWith(',')) return `${cleaned} `;
  return `${cleaned} `;
}

/**
 * Pairs each of the 4 `planFrame` paragraph prompts with 2–3 tap-to-insert starters from `usefulLanguage`.
 */
export function buildParagraphPlanPrompts(planFrame = [], usefulLanguage = [], weekNumber = null) {
  const frames = Array.isArray(planFrame) ? planFrame.slice(0, 4) : [];
  if (!frames.length) return [];
  const phrases = Array.isArray(usefulLanguage) ? usefulLanguage : [];
  const wk = Number(weekNumber);
  const authored = Number.isInteger(wk) ? AUTHORED_PARAGRAPH_STARTERS[wk] : null;

  return frames.map((prompt, idx) => {
    let starters = [];
    if (authored?.[idx]) {
      starters = authored[idx];
    } else if (phrases.length > 0) {
      const perBucket = Math.max(2, Math.ceil(phrases.length / frames.length));
      const start = Math.min(idx * 2, Math.max(0, phrases.length - 2));
      starters = phrases.slice(start, start + Math.min(3, perBucket));
    }
    return {
      paragraph: idx + 1,
      prompt,
      starters: starters.slice(0, 3),
    };
  });
}

const WEEK_TASK_GRAMMAR_MATCHERS = {
  1: /\b(?:used to|would|had\s+(?:never\s+|already\s+)?[a-z]+|have\s+[a-z]+|has\s+[a-z]+|i've|we've|was\s+[a-z]+ing|were\s+[a-z]+ing|since\s+then|eventually|got\s+used\s+to|now\b)/i,
  2: /\b(?:will|'ll|going\s+to|am\s+[a-z]+ing|is\s+[a-z]+ing|are\s+[a-z]+ing|'m\s+[a-z]+ing|'re\s+[a-z]+ing|when\b|as\s+soon\s+as|if\b|intend\s+to|look(?:ing)?\s+forward\s+to|in\s+order\s+to|should\s+i)/i,
  3: /\b(?:have\s+to|has\s+to|don't\s+have\s+to|doesn't\s+have\s+to|must|mustn't|should|shouldn't|can\b|can't|could|on\s+the\s+other\s+hand|in\s+fact|apart\s+from\s+that|get\s+on\s+with)/i,
  4: /\b(?:was\s+[a-z]+|were\s+[a-z]+|is\s+[a-z]+|are\s+[a-z]+|which\b|where\b|[a-z]+er\s+than|more\s+[a-z]+\s+than|the\s+(?:best|most|oldest|biggest|quietest)|to\s+begin\s+with|all\s+in\s+all|set\s+off)/i,
};

/**
 * Filters a learner's saved grammar-practice sentences so only sentences that
 * genuinely match the selected week's writing task are offered (folded away).
 */
export function filterTaskMatchingGrammarIdeas(grammarIdeas = [], weekNumber = null, targetWords = []) {
  if (!Array.isArray(grammarIdeas) || !grammarIdeas.length) return [];
  const wk = Number(weekNumber);
  const matcher = Number.isInteger(wk) ? WEEK_TASK_GRAMMAR_MATCHERS[wk] : null;
  const wordMatchers = (Array.isArray(targetWords) ? targetWords : [])
    .map((w) => cleanTargetPhrase(w).toLowerCase())
    .filter((w) => w.length >= 3);

  return grammarIdeas.filter((sentence) => {
    const text = String(sentence || '').trim();
    if (!text) return false;
    if (matcher && matcher.test(text)) return true;
    const lower = text.toLowerCase();
    if (wordMatchers.some((w) => lower.includes(w))) return true;
    return !matcher;
  });
}

const MODEL_PATTERNS = [
  // Linkers & useful-language phrases across Weeks 1-4
  { weeks: [1], regex: /I had never [a-z]+(?:\s+[a-z]+){0,2} before/i, label: 'Past perfect', reason: 'Shows something was completely new before the change.' },
  { weeks: [1], regex: /I used to [a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Past habit (used to)', reason: 'Describes how life was before the change.' },
  { weeks: [1], regex: /would often [a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Past routine (would)', reason: 'Adds a repeated action from the past.' },
  { weeks: [1], regex: /The biggest challenge I faced was [a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Useful phrase', reason: 'Introduces the main difficulty clearly.' },
  { weeks: [1], regex: /Eventually,\s*I got used to [a-z]+(?:\s+[a-z]+){0,3}/i, label: 'Linker + featured phrase', reason: 'Moves the story forward and shows the new routine felt normal.' },
  { weeks: [1], regex: /Since then,\s*I[’']ve [a-z]+(?:\s+[a-z]+){0,3}/i, label: 'Linker + present perfect', reason: 'Connects the past change to results today.' },
  { weeks: [1], regex: /I[’']ve been [a-z]+ing(?:\s+[a-z]+){0,3}/i, label: 'Present perfect continuous', reason: 'Shows a regular habit that continues now.' },

  { weeks: [2], regex: /my goal is to [a-z]+(?:\s+[a-z]+){0,3}/i, label: 'Useful phrase', reason: 'States your main goal clearly at the start.' },
  { weeks: [2], regex: /I[’']m meeting [a-z]+(?:\s+[a-z]+){0,4}/i, label: 'Fixed arrangement', reason: 'Uses present continuous with a fixed day for a confirmed plan.' },
  { weeks: [2], regex: /I[’']m going to [a-z]+(?:\s+[a-z]+){0,2} in order to [a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Plan + purpose linker', reason: 'Explains your plan and its purpose with in order to.' },
  { weeks: [2], regex: /When I finish[^,.!?]+,\s*I[’']ll [a-z]+/i, label: 'Future time clause', reason: 'Uses present simple after when, then will for the next step.' },
  { weeks: [2], regex: /If I don[’']t [a-z]+[^,.!?]*,\s*I[’']ll [a-z]+/i, label: 'Back-up plan (first conditional)', reason: 'Explains a clear back-up plan with if + present simple, will.' },
  { weeks: [2], regex: /I intend to [a-z]+(?:\s+[a-z]+){0,3}/i, label: 'Featured phrase', reason: 'Shows a firm future intention naturally.' },
  { weeks: [2], regex: /I[’']m (?:really )?looking forward to [a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Featured phrase', reason: 'Shows what you feel pleased about.' },
  { weeks: [2], regex: /Should I [a-z]+[^?]+\?/i, label: 'Advice question', reason: 'Ends with one clear question asking Sam for advice.' },

  { weeks: [3], regex: /Welcome to the flat!/i, label: 'Useful phrase', reason: 'Opens the email with a warm, friendly tone.' },
  { weeks: [3], regex: /We have to [a-z]+(?:\s+[a-z]+){0,3}/i, label: 'Requirement (have to)', reason: 'Explains a shared flat job that everyone needs to do.' },
  { weeks: [3], regex: /You mustn[’']t [a-z]+(?:\s+[a-z]+){0,3}/i, label: "Rule (mustn't)", reason: 'States clearly what is not allowed in the flat.' },
  { weeks: [3], regex: /On the other hand,\s*you don[’']t have to [a-z]+(?:\s+[a-z]+){0,3}/i, label: "Contrast linker + optional", reason: "Contrasts a strict rule with something optional using don't have to." },
  { weeks: [3], regex: /You should [a-z]+(?:\s+[a-z]+){0,3}/i, label: 'Advice (should)', reason: 'Gives helpful, friendly advice to the new flatmate.' },
  { weeks: [3], regex: /In fact,/i, label: 'Linker', reason: 'Adds a helpful extra detail smoothly.' },
  { weeks: [3], regex: /Apart from that,/i, label: 'Required linker', reason: 'Moves smoothly to your friendly closing message.' },
  { weeks: [3], regex: /get on with each other/i, label: 'Featured phrase', reason: 'Describes friendly relationships in the flat.' },

  { weeks: [4], regex: /To begin with,\s*we visited [A-Za-z ]+/i, label: 'Opening linker', reason: 'Organises the first part of your visit clearly.' },
  { weeks: [4], regex: /which sits on [a-z ]+/i, label: 'Relative clause (which)', reason: 'Adds an interesting fact smoothly in the same sentence.' },
  { weeks: [4], regex: /was built in the [a-z ]+/i, label: 'Past passive', reason: 'Gives a historical fact about the building.' },
  { weeks: [4], regex: /a gun is fired/i, label: 'Present passive', reason: 'Describes a regular local tradition.' },
  { weeks: [4], regex: /a busy street where you (?:can )?find/i, label: 'Relative clause (where)', reason: 'Describes what visitors find in that place.' },
  { weeks: [4], regex: /harder than I expected/i, label: 'Comparative', reason: 'Compares the climb with what you expected.' },
  { weeks: [4], regex: /the best of the (?:whole )?trip/i, label: 'Superlative', reason: 'Highlights your favourite moment clearly.' },
  { weeks: [4], regex: /All in all,/i, label: 'Closing linker', reason: 'Signals your final recommendation clearly.' },
  { weeks: [4], regex: /set off early/i, label: 'Featured phrasal verb', reason: 'Gives visitors a practical travel tip.' },
];

/**
 * Finds non-overlapping key phrases (`usefulLanguage`, `linkers`, and the week's grammar)
 * inside an already-unlocked `modelAnswer`, each with a one-line B1 reason on tap.
 */
export function highlightModelAnswer(modelAnswer, weekNumber = null, linkers = []) {
  const text = String(modelAnswer || '');
  if (!text.trim()) return [];
  const wk = Number(weekNumber);
  const candidates = Number.isInteger(wk)
    ? MODEL_PATTERNS.filter((p) => p.weeks.includes(wk))
    : MODEL_PATTERNS;

  const occupied = [];
  const found = [];

  const tryAdd = (start, length, label, reason) => {
    const end = start + length;
    if (occupied.some(([s, e]) => start < e && end > s)) return;
    occupied.push([start, end]);
    found.push({
      substring: text.slice(start, end),
      label,
      explanation: reason,
      pos: start,
    });
  };

  for (const pattern of candidates) {
    const match = pattern.regex.exec(text);
    if (match?.[0] && typeof match.index === 'number') {
      tryAdd(match.index, match[0].length, pattern.label, pattern.reason);
    }
  }

  for (const rawLinker of Array.isArray(linkers) ? linkers : []) {
    const clean = cleanTargetPhrase(rawLinker);
    if (!clean) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(text);
    if (match?.[0] && typeof match.index === 'number') {
      tryAdd(match.index, match[0].length, 'Linking phrase', 'Connects your ideas smoothly between sentences.');
    }
  }

  return found
    .sort((a, b) => a.pos - b.pos)
    .slice(0, 6)
    .map(({ substring, label, explanation }) => ({ substring, label, explanation }));
}

export function wordRangeForWeek(weekNumber) {
  const wk = Number(weekNumber);
  if (!Number.isInteger(wk) || wk <= 8) {
    return { min: 100, max: 120, capUnder: 80, warnOver: 150 };
  }
  return { min: 120, max: 150, capUnder: 100, warnOver: 180 };
}
