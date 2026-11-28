/** Transcript-based speaking help. None of these rules diagnose pronunciation. */
import { isCommonB1B2Word } from './level-guard.mjs';

export const MAX_IMPROVED_HIGHLIGHTS = 3;

const CONNECTORS = ['although', 'which', 'so that', 'because of'];
// Prefer the week's grammar when it has a conservatively detectable pattern.
// Other weeks deliberately fall back to the four checked connectors rather
// than pretending a transcript regex can grade an arbitrary grammar point.
const WEEK_STRUCTURES = {
  1: 'present perfect', 2: 'time or if clause', 3: 'modal', 4: 'passive',
  5: 'modal', 8: 'conditional', 14: 'future perfect', 15: 'although',
  17: 'past modal', 18: 'passive', 21: 'conditional', 22: 'which', 24: 'so that',
};
const PARTICIPLE = '(?:[a-z]+ed|been|become|begun|built|bought|chosen|come|done|driven|eaten|felt|found|given|gone|got|had|heard|held|known|left|made|met|read|run|said|seen|sold|spoken|taken|taught|thought|told|won|written)';

const MEANINGLESS_FILLER_PATTERNS = [
  /,?\s*\bwhich is something (?:that )?i (?:want|would like|wanted|am going|'m going) to (?:talk|speak|tell you) about\b/gi,
  /,?\s*\bwhich is (?:a topic|something) (?:that )?(?:is )?(?:very |really )?(?:interesting|important|nice|good) to (?:talk about|mention|discuss|say)\b/gi,
  /[,.]?\s*\b(?:and )?that is (?:all|everything|what) i (?:wanted|want) to (?:say|talk about)(?: today)?\b/gi,
  /,?\s*\bas i (?:just )?mentioned in my answer\b/gi,
];

export function hasMeaninglessFiller(text) {
  const source = String(text || '');
  return MEANINGLESS_FILLER_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(source);
  });
}

export function stripMeaninglessFiller(text) {
  let out = String(text || '');
  for (const pattern of MEANINGLESS_FILLER_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '');
  }
  return out
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fix obvious ASR / speech-to-text transcription mistakes before feedback and sound tips,
 * returning `{ cleanedTranscript, repairedWords }` so repaired tokens are never marked
 * as learner errors or selected for sound tips.
 */
export function cleanTranscriptionArtifacts(rawTranscript, aiTranscriptionFixes = null) {
  let cleaned = String(rawTranscript || '');
  const repairedSet = new Set();

  const recordPhraseWords = (phrase) => {
    const tokens = String(phrase || '').match(/[a-z0-9]+/gi) || [];
    for (const tok of tokens) repairedSet.add(tok.toLowerCase());
  };

  // Spoken slash/stroke between nouns/formats: e.g. "TV stroke podcast" -> "TV/podcast"
  cleaned = cleaned.replace(
    /\b([A-Za-z0-9]{2,20})\s+stroke\s+([A-Za-z0-9]{2,20})\b/gi,
    (_match, left, right) => {
      repairedSet.add('stroke');
      repairedSet.add(String(left).toLowerCase());
      repairedSet.add(String(right).toLowerCase());
      return `${left}/${right}`;
    },
  );

  // Contextual Whisper homophone: "a state in rural England" / "around a state in..." -> "an estate..."
  cleaned = cleaned.replace(
    /\b(around|on|near|in|at|from|visit(?:ed|ing)?|set\s+on|based\s+on)\s+a\s+state(\s+(?:in\s+(?:rural|the\s+country|the\s+countryside|england|scotland|wales|ireland|britain|yorkshire|devon|cornwall|[a-z]+)|outside\s+[a-z]+|with\s+(?:houses|gardens|fields|cottages|buildings|woods|farms)))\b/gi,
    (_match, prep, tail) => {
      repairedSet.add('state');
      repairedSet.add('estate');
      return `${prep} an estate${tail}`;
    },
  );

  // Optional AI-spotted short ASR homophone fixes ({ heard, intended })
  if (Array.isArray(aiTranscriptionFixes)) {
    for (const item of aiTranscriptionFixes.slice(0, 4)) {
      if (!item || typeof item !== 'object') continue;
      const heard = typeof item.heard === 'string' ? item.heard.trim() : '';
      const intended = typeof item.intended === 'string' ? item.intended.trim() : '';
      if (!heard || !intended || heard.toLowerCase() === intended.toLowerCase()) continue;
      const heardWords = heard.split(/\s+/);
      const intendedWords = intended.split(/\s+/);
      if (heardWords.length > 4 || intendedWords.length > 4) continue;
      const escaped = heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, intended);
        recordPhraseWords(heard);
        recordPhraseWords(intended);
      }
    }
  }

  return {
    cleanedTranscript: cleaned.replace(/\s{2,}/g, ' ').trim(),
    repairedWords: Array.from(repairedSet),
  };
}

/** A deliberately conservative, observable check, not a grammar or pronunciation score. */
export function structureUsed(text, structure) {
  const source = String(text || '').replace(/[’]/g, "'").toLowerCase();
  switch (structure) {
    case 'although': return /\balthough\b/.test(source);
    case 'which': return /\bwhich\b/.test(source);
    case 'so that': return /\bso\s+that\b/.test(source);
    case 'because of': return /\bbecause\s+of\b/.test(source);
    case 'present perfect':
      return new RegExp(`\\b(?:have|has|i've|you've|we've|they've|he's|she's|it's)\\s+(?:not\\s+|never\\s+|already\\s+|just\\s+)?(?:[a-z]+\\s+)?${PARTICIPLE}\\b`).test(source);
    case 'time or if clause':
      return /\b(?:if|when|as soon as)\b[^.!?]{0,160}\b(?:will|shall|\w+'ll)\b|\b(?:will|shall|\w+'ll)\b[^.!?]{0,160}\b(?:if|when|as soon as)\b/.test(source);
    case 'modal': return /\b(?:should|shouldn't|must|mustn't|have to|has to|don't have to|doesn't have to|need to|can|can't|cannot|could|couldn't|may|might)\b/.test(source);
    case 'passive': return new RegExp(`\\b(?:am|is|are|was|were|be|been|being)\\s+(?:[a-z]+\\s+)?${PARTICIPLE}\\b`).test(source);
    case 'conditional':
      return /\b(?:if|unless|provided(?:\s+that)?|as\s+long\s+as)\b[^.!?]{0,160}\b(?:will|shall|would|could|might|\w+'(?:ll|d))\b|\b(?:will|shall|would|could|might|\w+'(?:ll|d))\b[^.!?]{0,160}\b(?:if|unless|provided(?:\s+that)?|as\s+long\s+as)\b/.test(source);
    case 'future perfect':
      return new RegExp(`\\b(?:will|shall|\\w+'ll)\\s+have\\s+(?:[a-z]+\\s+)?${PARTICIPLE}\\b`).test(source);
    case 'past modal':
      return new RegExp(`\\b(?:should|could|might|must|would|may)(?:n't)?\\s+have\\s+(?:[a-z]+\\s+)?${PARTICIPLE}\\b`).test(source);
    default: return false;
  }
}

export function sentenceList(text) {
  return String(text || '').trim().split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

/** Only accept an actual whole transcript sentence and one supported structure — never add filler. */
export function structurePoint(raw, transcript, weekNumber) {
  const sentences = sentenceList(transcript);
  if (!sentences.length) return null;
  const point = raw && typeof raw === 'object' ? raw : {};
  const original = typeof point.original === 'string'
    ? sentences.find((sentence) => sentence.toLocaleLowerCase('en-GB') === point.original.trim().toLocaleLowerCase('en-GB'))
    : null;
  const upgraded = typeof point.upgraded === 'string' ? point.upgraded.trim().replace(/\s+/g, ' ') : '';
  const explanation = typeof point.explanation === 'string' ? point.explanation.trim().replace(/\s+/g, ' ') : '';
  const structure = typeof point.structure === 'string' ? point.structure.trim().toLowerCase() : '';
  const allowed = [...CONNECTORS, WEEK_STRUCTURES[Number(weekNumber)]].filter(Boolean);
  if (original && original.length <= 400 && upgraded.length <= 450 && upgraded.length > 0
    && !hasMeaninglessFiller(upgraded)
    && sentenceList(upgraded).length === 1 && explanation.length > 0 && explanation.length <= 140
    && sentenceList(explanation).length === 1 && !/[\r\n]/.test(point.explanation)
    && !/\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*)\b/i.test(explanation) && allowed.includes(structure)
    && upgraded.toLowerCase() !== original.toLowerCase() && structureUsed(upgraded, structure)) {
    return { original, upgraded, explanation, structure };
  }
  return null;
}

/** Only gaps between Whisper speech segments are measurable; do not infer pauses inside one segment. */
export function fluencyFromWhisper(transcript, result) {
  const wordCount = (String(transcript || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
  const duration = Number(result?.duration);
  const seconds = Number.isFinite(duration) && duration > 0 && duration <= 3600 ? Math.round(duration * 10) / 10 : null;
  const rawSegments = Array.isArray(result?.segments) ? result.segments : null;
  const segments = rawSegments?.filter((segment) => segment && Number.isFinite(segment.start) && Number.isFinite(segment.end)
    && segment.start >= 0 && segment.end >= segment.start).sort((a, b) => a.start - b.start) ?? null;
  let pauses = null;
  if (segments?.length) {
    pauses = 0;
    let previousEnd = segments[0].end;
    for (const segment of segments.slice(1)) {
      if (segment.start - previousEnd > 1) pauses += 1;
      previousEnd = Math.max(previousEnd, segment.end);
    }
  }
  return { wordCount, seconds, wordsPerMinute: seconds ? Math.round(wordCount * 60 / seconds) : null, pauses };
}

const SOUND_RULES = [
  { id: 'stress-comfortable', words: ['comfortable'], label: 'Word stress', tip: 'Stress the first part: COMF-tuh-bul.' },
  { id: 'stress-vegetable', words: ['vegetable'], label: 'Word stress', tip: 'Stress the first part: VEJ-tuh-bul.' },
  { id: 'stress-interesting', words: ['interesting'], label: 'Word stress', tip: 'Stress the first part: IN-truh-sting.' },
  { id: 'ed-t', words: ['asked', 'danced', 'finished', 'helped', 'looked', 'passed', 'stopped', 'talked', 'walked', 'watched', 'worked'], label: 'Past ending /t/', tip: 'After this sound, the -ed ending sounds like a short /t/, without another syllable.' },
  { id: 'ed-d', words: ['arrived', 'called', 'changed', 'cleaned', 'enjoyed', 'lived', 'loved', 'moved', 'opened', 'played'], label: 'Past ending /d/', tip: 'After this sound, the -ed ending sounds like a short /d/, without another syllable.' },
  { id: 'ed-id', words: ['decided', 'ended', 'invited', 'needed', 'started', 'visited', 'waited', 'wanted'], label: 'Past ending /ɪd/', tip: 'Here -ed adds a short extra syllable: /ɪd/.' },
  { id: 'ship-sheep', words: ['ship', 'sheep', 'sit', 'seat', 'fill', 'feel', 'leave'], label: 'Short and long vowels', tip: 'Compare a short vowel in ship with a longer vowel in sheep.' },
  { id: 's-cluster', pattern: /^(?!sword$)s(?:p|t|k|m|n|l|w|q|c[ahklou])[a-z]+$/i, label: 'Starting with s', tip: 'Start with /s/, then move to the next sound. Try not to add a vowel before it.' },
  { id: 'th', pattern: /^(?!thomas$|thames$|thai$|thailand$|thyme$|thompson$|thomson$|anthony$|asthma$|the$|that$|this$|there$|their$|they$|them$|then$|than$|these$|those$|with$|within$|whether$)[a-z]*th[a-z]*$/i, label: 'The th sound', tip: 'Place your tongue lightly between your teeth for the th sound.' },
  { id: 'vb', words: ['very', 'visit', 'visitor', 'vegetable', 'village', 'voice', 'vocabulary', 'love', 'leave', 'have', 'before', 'best', 'big', 'built', 'but', 'both'], label: 'The v and b sounds', tip: 'For v, touch your lower lip with your teeth; for b, close both lips.' },
];

const DICTATION_ARTIFACT_WORDS = new Set(['stroke', 'slash', 'comma', 'colon', 'semicolon']);

/**
 * At most two common B1–B2 wordlist words from the cleaned transcript,
 * never including ASR-repaired words or dictation artefacts, and never as a diagnosis.
 */
export function soundTips(transcript, options = {}) {
  const { cleanedTranscript, repairedWords } = cleanTranscriptionArtifacts(transcript);
  const excludeSet = new Set([
    ...DICTATION_ARTIFACT_WORDS,
    ...repairedWords.map((w) => w.toLowerCase()),
    ...Array.from(options?.excludeWords ?? [], (w) => String(w).toLowerCase()),
  ]);
  const weekNumber = options?.weekNumber ?? null;
  const words = String(cleanedTranscript || '').match(/\b[a-z]+\b/gi) || [];
  const found = [];
  const usedRules = new Set();
  for (const word of words) {
    const lower = word.toLowerCase();
    if (excludeSet.has(lower)) continue;
    if (!isCommonB1B2Word(lower, weekNumber)) continue;
    const rule = SOUND_RULES.find((item) => !usedRules.has(item.id)
      && (item.words?.includes(lower) || item.pattern?.test(lower)));
    if (!rule || found.some((item) => item.word.toLowerCase() === lower)) continue;
    usedRules.add(rule.id);
    found.push({ word, label: rule.label, tip: rule.tip });
    if (found.length === 2) break;
  }
  return found;
}

/** Evidence must be quoted from the transcript, not invented by the model. */
export function cuePointEvidence(raw, transcript, labels) {
  if (!Array.isArray(raw) || !Array.isArray(labels)) return [];
  const normalizedTranscript = String(transcript || '').toLocaleLowerCase('en-GB').replace(/\s+/g, ' ');
  const evidence = [];
  for (const label of labels) {
    const item = raw.find((entry) => entry && entry.label === label && typeof entry.quote === 'string');
    const quote = item?.quote?.trim().replace(/\s+/g, ' ') || '';
    if (quote.length >= 3 && quote.length <= 220 && normalizedTranscript.includes(quote.toLocaleLowerCase('en-GB'))) {
      evidence.push({ label, quote });
    }
  }
  return evidence;
}

/** Cue points covered as a ✓ / ✗ checklist across all cue-card labels, never a mark. */
export function cueChecklistFromEvidence(rawCuePoints, transcript, labels) {
  if (!Array.isArray(labels) || !labels.length) return [];
  const verified = cuePointEvidence(rawCuePoints, transcript, labels);
  const byLabel = new Map(verified.map((entry) => [entry.label, entry.quote]));
  return labels.map((label) => {
    const quote = byLabel.get(label);
    return quote ? { label, covered: true, quote } : { label, covered: false };
  });
}

const FALLBACK_PATTERNS = [
  { weeks: [1], regex: /\bsince then,\s*(?:i've|i have|we've|we have)\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Present perfect with since then', explanation: 'Connects a past change to how things are now.' },
  { weeks: [1], regex: /\b(?:i've|i have|we've|we have)\s+(?:already\s+|never\s+)?[a-z]+(?:ed|en|t|d|n)\b(?:\s+[a-z]+){0,2}/i, label: 'Present perfect', explanation: 'Shows a past event with a result now.' },
  { weeks: [1], regex: /\bused to\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Past habit with used to', explanation: 'Talks about something that was true in the past.' },
  { weeks: [1], regex: /\bgot used to\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Get used to', explanation: 'Shows how something new slowly felt normal.' },
  { weeks: [2], regex: /\b(?:i'm|i am|we're|we are)\s+going to\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Plan with going to', explanation: 'Shows an intention or plan you have already decided.' },
  { weeks: [2], regex: /\blooking forward to\s+[a-z]+ing(?:\s+[a-z]+){0,2}/i, label: 'Look forward to + -ing', explanation: 'Talks about something in the future you feel pleased about.' },
  { weeks: [2], regex: /\b(?:if|when|as soon as)\s+[^,.!?]{3,35},\s*(?:i'll|we'll|i will|we will)\s+[a-z]+/i, label: 'Future time or if clause', explanation: 'Uses present simple after if or when for the future.' },
  { weeks: [3], regex: /\b(?:have to|has to)\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Rule with have to', explanation: 'Explains something that is required.' },
  { weeks: [3], regex: /\b(?:don't|doesn't)\s+have to\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: "Optional with don't have to", explanation: 'Shows that something is optional, not forbidden.' },
  { weeks: [3], regex: /\bmustn't\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: "Rule with mustn't", explanation: 'Says clearly what is not allowed.' },
  { weeks: [3], regex: /\bshould\s+[a-z]+(?:\s+[a-z]+){0,2}/i, label: 'Advice with should', explanation: 'Gives friendly, practical advice.' },
  { weeks: [4], regex: new RegExp(`\\b(?:is|are|was|were)\\s+${PARTICIPLE}(?:\\s+(?:in|by|every)\\s+[a-z0-9]+)?`, 'i'), label: 'Present or past passive', explanation: 'Focuses on the place or event rather than who did it.' },
  { weeks: [4], regex: /\b(?:which|where)\s+[a-z]+(?:\s+[a-z]+){1,3}/i, label: 'Relative clause', explanation: 'Adds useful extra information smoothly.' },
  { weeks: [1, 4], regex: /\b(?:quieter|busier|easier|harder|better|bigger|friendlier|more\s+[a-z]+)\s+than\b/i, label: 'Comparative with than', explanation: 'Compares two places, times, or situations clearly.' },
  { weeks: [1, 2, 3, 4], regex: /\balthough\s+[a-z']+(?:\s+[a-z']+){1,3}/i, label: 'Contrast with although', explanation: 'Joins two contrasting ideas in one clear sentence.' },
  { weeks: [1, 2, 3, 4], regex: /\bso that\s+[a-z']+(?:\s+[a-z']+){1,3}/i, label: 'Purpose with so that', explanation: 'Explains the purpose or reason for an action.' },
  { weeks: [1, 2, 3, 4], regex: /\bhowever,\s+[a-z']+(?:\s+[a-z']+){1,3}/i, label: 'Contrast with however', explanation: 'Links a contrasting point clearly.' },
];

function normalizeForDiffCheck(text) {
  return String(text || '')
    .replace(/[’]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'/\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeWithPositions(text) {
  const tokens = [];
  const regex = /[A-Za-z0-9]+(?:['’/-][A-Za-z0-9]+)*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      raw: match[0],
      norm: match[0].replace(/[’]/g, "'").toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Compute word-level diff spans between `learnerTranscript` and `improvedResponse`,
 * returning changed/added phrases in `improvedResponse` along with the `before` phrase.
 */
export function diffChangedSpans(learnerTranscript, improvedResponse, excludeWords = []) {
  const sourceTokens = tokenizeWithPositions(String(learnerTranscript || ''));
  const targetTokens = tokenizeWithPositions(String(improvedResponse || ''));
  if (!sourceTokens.length || !targetTokens.length) return [];

  const excludeSet = new Set(Array.from(excludeWords ?? [], (w) => String(w).toLowerCase()));
  const m = sourceTokens.length;
  const n = targetTokens.length;

  // LCS dynamic programming on word tokens
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (sourceTokens[i].norm === targetTokens[j].norm) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (sourceTokens[i].norm === targetTokens[j].norm) {
      ops.push({ type: 'eq', sIdx: i, tIdx: j });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', sIdx: i });
      i += 1;
    } else {
      ops.push({ type: 'ins', tIdx: j });
      j += 1;
    }
  }
  while (i < m) { ops.push({ type: 'del', sIdx: i }); i += 1; }
  while (j < n) { ops.push({ type: 'ins', tIdx: j }); j += 1; }

  const spans = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === 'eq') {
      k += 1;
      continue;
    }
    const delIndices = [];
    const insIndices = [];
    const prevEq = k > 0 && ops[k - 1].type === 'eq' ? ops[k - 1] : null;
    while (k < ops.length && ops[k].type !== 'eq') {
      if (ops[k].type === 'del') delIndices.push(ops[k].sIdx);
      if (ops[k].type === 'ins') insIndices.push(ops[k].tIdx);
      k += 1;
    }
    const nextEq = k < ops.length && ops[k].type === 'eq' ? ops[k] : null;

    let tFirst;
    let tLast;
    let sFirst = delIndices.length ? delIndices[0] : (prevEq ? prevEq.sIdx : null);
    let sLast = delIndices.length ? delIndices[delIndices.length - 1] : (nextEq ? nextEq.sIdx : null);

    if (insIndices.length > 0) {
      tFirst = insIndices[0];
      tLast = insIndices[insIndices.length - 1];
      // Expand 1 context word on short 1-word preposition/article fixes so the tap target reads naturally
      if (tLast === tFirst && nextEq) {
        tLast = nextEq.tIdx;
        if (sLast !== null && nextEq.sIdx > sLast) sLast = nextEq.sIdx;
      }
      if (tLast - tFirst < 1 && prevEq) {
        tFirst = prevEq.tIdx;
        if (sFirst !== null && prevEq.sIdx < sFirst) sFirst = prevEq.sIdx;
      }
    } else if (delIndices.length > 0 && prevEq && nextEq) {
      // Pure deletion (e.g. "various different options" -> "various options")
      tFirst = prevEq.tIdx;
      tLast = nextEq.tIdx;
      sFirst = prevEq.sIdx;
      sLast = nextEq.sIdx;
    } else {
      continue;
    }

    if (tLast - tFirst > 8) {
      tLast = tFirst + 7;
    }

    const changedWords = [
      ...delIndices.map((idx) => sourceTokens[idx].norm),
      ...insIndices.map((idx) => targetTokens[idx].norm),
    ];
    if (changedWords.length > 0 && changedWords.every((w) => excludeSet.has(w))) {
      continue;
    }

    const start = targetTokens[tFirst].start;
    const end = targetTokens[tLast].end;
    const substring = String(improvedResponse).slice(start, end).trim();
    const before =
      sFirst !== null && sLast !== null && sLast >= sFirst
        ? String(learnerTranscript).slice(sourceTokens[sFirst].start, sourceTokens[Math.min(sLast, sFirst + 8)].end).trim()
        : '';

    if (substring.length >= 3 && normalizeForDiffCheck(substring) !== normalizeForDiffCheck(before)) {
      spans.push({ substring, before, start, end });
    }
  }

  return spans;
}

function describeDiffSpan(substring, before, weekNumber) {
  const wk = Number(weekNumber);
  const prioritized = [
    ...FALLBACK_PATTERNS.filter((p) => Number.isInteger(wk) && p.weeks.includes(wk)),
    ...FALLBACK_PATTERNS.filter((p) => !Number.isInteger(wk) || !p.weeks.includes(wk)),
  ];
  for (const pattern of prioritized) {
    if (pattern.regex.test(substring)) {
      return { label: pattern.label, explanation: pattern.explanation };
    }
  }
  if (before) {
    return {
      label: 'Clearer phrasing',
      explanation: `Replaces "${before}" with a more natural B1 phrase.`,
    };
  }
  return {
    label: 'Useful phrase',
    explanation: 'Makes your sentence clearer and easier to follow.',
  };
}

/**
 * Validate at most 3 changed highlights on `improvedResponse`.
 * - Strictly drops any highlight that is not an exact substring of `improvedResponse` or contains filler.
 * - When `options.learnerTranscript` is provided, requires every highlight to be an actual change
 *   compared with `learnerTranscript` (never highlighting unchanged text or ASR fixes), and fills
 *   missing highlights from word diff + `corrections` up to `MAX_IMPROVED_HIGHLIGHTS` (3).
 */
export function validateImprovedHighlights(rawHighlights, improvedResponse, weekNumber = null, options = {}) {
  const source = String(improvedResponse || '');
  if (!source.trim()) return [];

  const learnerTranscript = typeof options?.learnerTranscript === 'string' ? options.learnerTranscript : null;
  const normLearner = learnerTranscript !== null ? normalizeForDiffCheck(learnerTranscript) : null;
  const excludeSet = new Set(Array.from(options?.excludeWords ?? [], (w) => String(w).toLowerCase()));
  const corrections = Array.isArray(options?.corrections) ? options.corrections : [];
  const diffSpans =
    learnerTranscript !== null
      ? diffChangedSpans(learnerTranscript, source, options?.excludeWords ?? [])
      : [];

  const accepted = [];
  const occupiedRanges = [];

  function findBeforeForRange(start, end) {
    const match = diffSpans.find((d) => start < d.end && end > d.start);
    return match?.before || undefined;
  }

  function addCandidate(rawSub, rawLabel, rawExplanation, requireExactCase = true, rawBefore = undefined) {
    if (accepted.length >= MAX_IMPROVED_HIGHLIGHTS) return;
    const sub = String(rawSub ?? '').trim();
    const label = String(rawLabel ?? '').trim().replace(/\s+/g, ' ');
    const explanation = String(rawExplanation ?? '').trim().replace(/\s+/g, ' ');
    if (sub.length < 3 || sub.length > 160) return;
    if (!label || label.length > 70) return;
    if (!explanation || explanation.length > 180) return;
    if (hasMeaninglessFiller(sub) || hasMeaninglessFiller(explanation)) return;
    if (/\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*)\b/i.test(explanation)) return;

    const subWords = sub.match(/[a-z0-9]+/gi) || [];
    if (subWords.length > 0 && subWords.every((w) => excludeSet.has(w.toLowerCase()))) return;

    let start = source.indexOf(sub);
    if (start < 0 && !requireExactCase) {
      start = source.toLocaleLowerCase('en-GB').indexOf(sub.toLocaleLowerCase('en-GB'));
    }
    if (start < 0) return;
    const exactSubstring = source.slice(start, start + sub.length);
    const end = start + exactSubstring.length;

    // When learnerTranscript is provided, only highlight phrases that actually changed!
    if (normLearner !== null) {
      const normSub = normalizeForDiffCheck(exactSubstring);
      if (!normSub || normLearner.includes(normSub)) return;
    }

    if (occupiedRanges.some(([s, e]) => start < e && end > s)) return;
    occupiedRanges.push([start, end]);
    const before = typeof rawBefore === 'string' && rawBefore.trim()
      ? rawBefore.trim()
      : findBeforeForRange(start, end);
    accepted.push({
      substring: exactSubstring,
      label,
      explanation: /[.!?]$/.test(explanation) ? explanation : `${explanation}.`,
      ...(before ? { before } : {}),
    });
  }

  if (Array.isArray(rawHighlights)) {
    for (const item of rawHighlights) {
      if (!item || typeof item !== 'object') continue;
      addCandidate(item.substring, item.label, item.explanation, true, item.before);
    }
  }

  // Pair corrections whose fixed wording appears in improvedResponse
  for (const corr of corrections) {
    if (accepted.length >= MAX_IMPROVED_HIGHLIGHTS) break;
    if (!corr || typeof corr !== 'object') continue;
    const corrected = String(corr.corrected_sentence ?? '').trim().replace(/[.!?]+$/, '');
    if (corrected && source.includes(corrected)) {
      addCandidate(corrected, 'Error fix', corr.explanation, true, corr.original);
    }
  }

  // Fallback to word-level diff when model highlights + corrections yielded no valid changed span
  if (learnerTranscript !== null && accepted.length === 0) {
    for (const span of diffSpans) {
      if (accepted.length >= MAX_IMPROVED_HIGHLIGHTS) break;
      const meta = describeDiffSpan(span.substring, span.before, weekNumber);
      addCandidate(span.substring, meta.label, meta.explanation, true, span.before);
    }
  }

  // Fallback pattern scan only when learnerTranscript was not supplied
  const wordCount = (source.match(/[\p{L}\p{N}]+/gu) || []).length;
  if (learnerTranscript === null && accepted.length < 2 && wordCount >= 10) {
    const wk = Number(weekNumber);
    const prioritized = [
      ...FALLBACK_PATTERNS.filter((p) => Number.isInteger(wk) && p.weeks.includes(wk)),
      ...FALLBACK_PATTERNS.filter((p) => !Number.isInteger(wk) || !p.weeks.includes(wk)),
    ];
    for (const pattern of prioritized) {
      if (accepted.length >= MAX_IMPROVED_HIGHLIGHTS) break;
      const match = pattern.regex.exec(source);
      if (match?.[0]) {
        addCandidate(match[0], pattern.label, pattern.explanation, true);
      }
    }
  }

  return accepted.slice(0, MAX_IMPROVED_HIGHLIGHTS);
}

const ANCHOR_PATTERNS = [
  [/\bsince then\b/i, /\bsince then\b/i],
  [/\bused to\b/i, /\b(?:used to|didn't use to)\b/i],
  [/\bgot? used to\b/i, /\bg[eo]t(?:ting)? used to\b/i],
  [/\blook(?:ing)? back on\b/i, /\blook(?:ed|ing|s)? back on\b/i],
  [/\bface(?:d|s|ing)? a challenge\b/i, /\bface(?:d|s|ing)? [a-z ]*challenge\b/i],
  [/\bgoing to\b/i, /\bgoing to\s+[a-z]+\b/i],
  [/\blook(?:ing)? forward to\b/i, /\blook(?:ed|ing|s)? forward to\b/i],
  [/\bintend(?:s|ed)? to\b/i, /\bintend(?:s|ed|ing)? to\b/i],
  [/\bdon't have to|doesn't have to\b/i, /\b(?:don't|doesn't|did not|do not) have to\b/i],
  [/\bhave to|has to\b/i, /\b(?:have to|has to|had to)\b/i],
  [/\bmustn't|must not\b/i, /\b(?:mustn't|must not)\b/i],
  [/\bshould(?:n't)?\b/i, /\bshould(?:n't| not)?\s+[a-z]+\b/i],
  [/\balthough\b/i, /\balthough\b/i],
  [/\bso that\b/i, /\bso\s+that\b/i],
  [/\bbecause of\b/i, /\bbecause\s+of\b/i],
  [/\bhowever\b/i, /\bhowever\b/i],
  [/\bon the other hand\b/i, /\bon the other hand\b/i],
  [/\bapart from that\b/i, /\bapart from that\b/i],
  [/\bto begin with\b/i, /\bto begin with\b/i],
  [/\ball in all\b/i, /\ball in all\b/i],
  [/\bwhich\b/i, /\bwhich\b/i],
  [/\bwhere\b/i, /\bwhere\s+[a-z']+/i],
];

/**
 * Check which highlighted structures from "Your answer, improved" / "Take with you"
 * the learner used in their retry transcript.
 */
export function detectUsedHighlights(retryTranscript, highlights) {
  if (!Array.isArray(highlights) || !highlights.length) return [];
  const normTranscript = String(retryTranscript || '').replace(/[’]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

  return highlights
    .filter((h) => h && typeof h.substring === 'string' && h.substring.trim())
    .map((h) => {
      const sub = h.substring.trim();
      const label = typeof h.label === 'string' && h.label.trim() ? h.label.trim() : sub;
      const normSub = sub.replace(/[’]/g, "'").toLowerCase().replace(/\s+/g, ' ');

      let used = Boolean(normTranscript && normTranscript.includes(normSub));
      if (!used && normTranscript) {
        for (const [subTest, transcriptTest] of ANCHOR_PATTERNS) {
          if (subTest.test(normSub) && transcriptTest.test(normTranscript)) {
            used = true;
            break;
          }
        }
      }
      if (!used && normTranscript) {
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('present perfect') && structureUsed(normTranscript, 'present perfect')) used = true;
        else if ((lowerLabel.includes('if ') || lowerLabel.includes('time clause') || lowerLabel.includes('conditional')) && (structureUsed(normTranscript, 'time or if clause') || structureUsed(normTranscript, 'conditional'))) used = true;
        else if (lowerLabel.includes('passive') && structureUsed(normTranscript, 'passive')) used = true;
        else if (lowerLabel.includes('comparative') && /\b(?:[a-z]+er|more\s+[a-z]+|less\s+[a-z]+)\s+than\b/i.test(normTranscript)) used = true;
      }

      return { substring: sub, label, used };
    });
}

export function isShortOrOffTopicTranscript(transcript, offTopic = false) {
  const words = (String(transcript || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
  return words < 20 || Boolean(offTopic);
}

export function weekStructure(weekNumber) { return WEEK_STRUCTURES[Number(weekNumber)] || null; }
