/** Transcript-based speaking help. None of these rules diagnose pronunciation. */

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

/** Only accept an actual whole transcript sentence and one supported structure. */
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
    && sentenceList(upgraded).length === 1 && explanation.length > 0 && explanation.length <= 140
    && sentenceList(explanation).length === 1 && !/[\r\n]/.test(point.explanation)
    && !/\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*)\b/i.test(explanation) && allowed.includes(structure)
    && upgraded.toLowerCase() !== original.toLowerCase() && structureUsed(upgraded, structure)) {
    return { original, upgraded, explanation, structure };
  }

  // The model occasionally omits its point. For a complete statement, keep the
  // real sentence and add one relative clause rather than inventing an error.
  const statement = sentences.find((sentence) => /[.!]?$/.test(sentence) && !/[?]$/.test(sentence) && sentence.split(/\s+/).length >= 4 && sentence.length <= 300);
  if (!statement) return null;
  return {
    original: statement,
    upgraded: `${statement.replace(/[.!]+$/, '')}, which is something I want to talk about.`,
    explanation: 'Use which to add a little more information about an idea.',
    structure: 'which',
  };
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
  { id: 'th', pattern: /^(?!thomas$|thames$|thai$|thailand$|thyme$|thompson$|thomson$|anthony$|asthma$)[a-z]*th[a-z]*$/i, label: 'The th sound', tip: 'Place your tongue lightly between your teeth for the th sound.' },
  { id: 'vb', words: ['very', 'visit', 'visitor', 'vegetable', 'village', 'voice', 'vocabulary', 'love', 'leave', 'have', 'before', 'best', 'big', 'built', 'but', 'both'], label: 'The v and b sounds', tip: 'For v, touch your lower lip with your teeth; for b, close both lips.' },
];

/** At most two transcript words, picked by fixed rules, never as a diagnosis. */
export function soundTips(transcript) {
  const words = String(transcript || '').match(/\b[a-z]+\b/gi) || [];
  const found = [];
  const usedRules = new Set();
  for (const word of words) {
    const lower = word.toLowerCase();
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

/**
 * Validate 2–4 target-structure highlights on `improvedResponse`.
 * Strictly drops any highlight whose `substring` is not an exact substring of `improvedResponse`.
 */
export function validateImprovedHighlights(rawHighlights, improvedResponse, weekNumber = null) {
  const source = String(improvedResponse || '');
  if (!source.trim()) return [];

  const accepted = [];
  const occupiedRanges = [];

  function addCandidate(rawSub, rawLabel, rawExplanation, requireExactCase = true) {
    if (accepted.length >= 4) return;
    const sub = String(rawSub ?? '').trim();
    const label = String(rawLabel ?? '').trim().replace(/\s+/g, ' ');
    const explanation = String(rawExplanation ?? '').trim().replace(/\s+/g, ' ');
    if (sub.length < 3 || sub.length > 160) return;
    if (!label || label.length > 70) return;
    if (!explanation || explanation.length > 180) return;
    if (/\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*)\b/i.test(explanation)) return;

    let start = source.indexOf(sub);
    if (start < 0 && !requireExactCase) {
      start = source.toLocaleLowerCase('en-GB').indexOf(sub.toLocaleLowerCase('en-GB'));
    }
    // Strict spec rule: drop any highlight that isn't an exact substring of improvedResponse
    if (start < 0) return;
    const exactSubstring = source.slice(start, start + sub.length);
    const end = start + exactSubstring.length;

    if (occupiedRanges.some(([s, e]) => start < e && end > s)) return;
    occupiedRanges.push([start, end]);
    accepted.push({
      substring: exactSubstring,
      label,
      explanation: /[.!?]$/.test(explanation) ? explanation : `${explanation}.`,
    });
  }

  if (Array.isArray(rawHighlights)) {
    for (const item of rawHighlights) {
      if (!item || typeof item !== 'object') continue;
      addCandidate(item.substring, item.label, item.explanation, true);
    }
  }

  // If the AI omitted highlights on a real improved answer, extract exact verbatim matches from improvedResponse
  const wordCount = (source.match(/[\p{L}\p{N}]+/gu) || []).length;
  if (accepted.length < 2 && wordCount >= 10) {
    const wk = Number(weekNumber);
    const prioritized = [
      ...FALLBACK_PATTERNS.filter((p) => Number.isInteger(wk) && p.weeks.includes(wk)),
      ...FALLBACK_PATTERNS.filter((p) => !Number.isInteger(wk) || !p.weeks.includes(wk)),
    ];
    for (const pattern of prioritized) {
      if (accepted.length >= 3) break;
      const match = pattern.regex.exec(source);
      if (match?.[0]) {
        addCandidate(match[0], pattern.label, pattern.explanation, true);
      }
    }
  }

  return accepted.slice(0, 4);
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
