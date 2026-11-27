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
      return new RegExp(`\\b(?:have|has|i've|you've|we've|they've|he's|she's|it's)\\s+(?:[a-z]+\\s+)?${PARTICIPLE}\\b`).test(source);
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

export function weekStructure(weekNumber) { return WEEK_STRUCTURES[Number(weekNumber)] || null; }
