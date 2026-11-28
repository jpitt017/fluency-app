import coreWordList from './b1b2-wordlist.json' with { type: 'json' };
import detailsJson from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json' with { type: 'json' };
import vocabExercisesJson from '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json' with { type: 'json' };

export const MAX_B1B2_SENTENCE_WORDS = 20;
export const MAX_CORRECTIONS_PER_TEXT = 3;

export const LEVEL_RULES_PROMPT_BLOCK = [
  'B1–B2 LEVEL RULES FOR EVERY REWRITE, IMPROVED VERSION, AND CORRECTION:',
  '- Use B1–B2 words only (everyday Oxford 3000 words plus this week\'s vocabulary). Never use C1+ words, idioms, or very formal phrasing (never use words like "subsequently", "furthermore", "moreover", "commence", "endeavour", "facilitate", "utilize", "ubiquitous", "paramount", "plethora", "myriad", "meticulous", "albeit", "notwithstanding", "reside", "purchase", or idioms like "a blessing in disguise").',
  '- Keep every sentence at most 20 words.',
  '- Use only grammar from Weeks 1–4 (past simple, present perfect, past continuous, past perfect, modals of obligation/permission/advice, present/past simple passive, comparatives/superlatives, articles, and relative clauses with who/which/where/that) or the current week. Never use negative inversion ("Not only did..."), cleft sentences ("What struck me was..."), or advanced passives ("is said to have been...").',
  '- Keep clear, correct learner sentences as they are. Do not rewrite a sentence that is already natural and accurate.',
  '- Never add filler clauses with no meaning (never add phrases like "which is something I want to talk about"). Every change must fix a real error or add one target structure from this week.',
  '- Return at most 3 corrections per text, putting mistakes with this week\'s grammar first.',
].join('\n');

export const C1_BLOCKED_WORDS = new Set([
  'albeit',
  'ameliorate',
  'ameliorated',
  'ameliorating',
  'assist',
  'assisted',
  'assisting',
  'assistance',
  'bolster',
  'bolstered',
  'bolstering',
  'commence',
  'commenced',
  'commences',
  'commencing',
  'consequently',
  'conundrum',
  'conundrums',
  'delve',
  'delved',
  'delves',
  'delving',
  'embark',
  'embarked',
  'embarking',
  'endeavour',
  'endeavoured',
  'endeavouring',
  'endeavours',
  'endeavor',
  'endeavored',
  'endeavoring',
  'endeavors',
  'ephemeral',
  'exacerbate',
  'exacerbated',
  'exacerbating',
  'facilitate',
  'facilitated',
  'facilitates',
  'facilitating',
  'fastidious',
  'foster',
  'fostered',
  'fostering',
  'furthermore',
  'garner',
  'garnered',
  'hitherto',
  'indispensable',
  'meticulous',
  'meticulously',
  'mitigate',
  'mitigated',
  'mitigating',
  'moreover',
  'myriad',
  'nevertheless',
  'notwithstanding',
  'numerous',
  'obtain',
  'obtained',
  'obtaining',
  'obtains',
  'ostensibly',
  'paramount',
  'pertaining',
  'plethora',
  'pragmatic',
  'prior',
  'proliferate',
  'purchase',
  'purchased',
  'purchases',
  'purchasing',
  'quintessential',
  'require',
  'required',
  'requires',
  'requiring',
  'reside',
  'resided',
  'resides',
  'residing',
  'subsequently',
  'substantial',
  'substantially',
  'sufficient',
  'sufficiently',
  'tapestry',
  'testament',
  'thus',
  'ubiquitous',
  'unprecedented',
  'utilise',
  'utilised',
  'utilises',
  'utilising',
  'utilize',
  'utilized',
  'utilizes',
  'utilizing',
  'whilst',
  'yield',
  'yielded',
  'yielding',
]);

const C1_PHRASE_REPLACEMENTS = [
  [/\bat the end of the day\b/gi, 'in the end'],
  [/\ba blessing in disguise\b/gi, 'good in the end'],
  [/\bhit the nail on the head\b/gi, 'was completely right'],
  [/\bstep(?:ped|ping)? out of (?:my|your|our|their|his|her) comfort zone\b/gi, 'tried something new'],
  [/\bby the same token\b/gi, 'in the same way'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bpertaining to\b/gi, 'about'],
  [/\bwith regard to\b/gi, 'about'],
  [/\bin regards? to\b/gi, 'about'],
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin spite of the fact that\b/gi, 'although'],
];

const C1_WORD_REPLACEMENTS = new Map([
  ['albeit', 'although'],
  ['ameliorate', 'improve'],
  ['ameliorated', 'improved'],
  ['ameliorating', 'improving'],
  ['assist', 'help'],
  ['assisted', 'helped'],
  ['assisting', 'helping'],
  ['assistance', 'help'],
  ['bolster', 'support'],
  ['bolstered', 'supported'],
  ['commence', 'start'],
  ['commenced', 'started'],
  ['commences', 'starts'],
  ['commencing', 'starting'],
  ['consequently', 'so'],
  ['conundrum', 'problem'],
  ['delve', 'look'],
  ['delved', 'looked'],
  ['embark', 'start'],
  ['embarked', 'started'],
  ['endeavour', 'try'],
  ['endeavoured', 'tried'],
  ['endeavor', 'try'],
  ['endeavored', 'tried'],
  ['ephemeral', 'short'],
  ['exacerbate', 'make worse'],
  ['exacerbated', 'made worse'],
  ['facilitate', 'help'],
  ['facilitated', 'helped'],
  ['facilitates', 'helps'],
  ['fastidious', 'careful'],
  ['foster', 'build'],
  ['fostered', 'built'],
  ['furthermore', 'also'],
  ['garner', 'get'],
  ['garnered', 'got'],
  ['hitherto', 'until now'],
  ['indispensable', 'very important'],
  ['meticulous', 'very careful'],
  ['meticulously', 'carefully'],
  ['mitigate', 'reduce'],
  ['mitigated', 'reduced'],
  ['moreover', 'also'],
  ['myriad', 'many'],
  ['nevertheless', 'however'],
  ['notwithstanding', 'despite'],
  ['numerous', 'many'],
  ['obtain', 'get'],
  ['obtained', 'got'],
  ['obtaining', 'getting'],
  ['obtains', 'gets'],
  ['ostensibly', 'seemingly'],
  ['paramount', 'very important'],
  ['pertaining', 'related'],
  ['plethora', 'lot'],
  ['pragmatic', 'practical'],
  ['prior', 'earlier'],
  ['purchase', 'buy'],
  ['purchased', 'bought'],
  ['purchases', 'buys'],
  ['purchasing', 'buying'],
  ['quintessential', 'typical'],
  ['require', 'need'],
  ['required', 'needed'],
  ['requires', 'needs'],
  ['requiring', 'needing'],
  ['reside', 'live'],
  ['resided', 'lived'],
  ['resides', 'lives'],
  ['residing', 'living'],
  ['subsequently', 'after that'],
  ['substantial', 'large'],
  ['substantially', 'a lot'],
  ['sufficient', 'enough'],
  ['sufficiently', 'enough'],
  ['tapestry', 'mix'],
  ['testament', 'sign'],
  ['thus', 'so'],
  ['ubiquitous', 'everywhere'],
  ['unprecedented', 'unusual'],
  ['utilise', 'use'],
  ['utilised', 'used'],
  ['utilises', 'uses'],
  ['utilising', 'using'],
  ['utilize', 'use'],
  ['utilized', 'used'],
  ['utilizes', 'uses'],
  ['utilizing', 'using'],
  ['whilst', 'while'],
  ['yield', 'give'],
  ['yielded', 'gave'],
]);

const CORE_WORDS = new Set(coreWordList);

function tokenizeWords(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, ' ');
  return (normalized.match(/[\p{L}\p{N}]+(?:[''-][\p{L}\p{N}]+)*/gu) ?? []);
}

const WEEK_WORD_SETS = new Map();
const ALL_WEEKS_WORDS = new Set();

function collectStrings(value, into) {
  if (!value) return;
  if (typeof value === 'string') {
    for (const token of tokenizeWords(value)) {
      const lower = token.toLowerCase();
      if (!C1_BLOCKED_WORDS.has(lower)) into.add(lower);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into);
    return;
  }
  if (typeof value === 'object') {
    for (const val of Object.values(value)) collectStrings(val, into);
  }
}

for (const week of detailsJson.weeks ?? []) {
  const set = new Set();
  collectStrings(week.vocabulary, set);
  collectStrings(week.linkers, set);
  collectStrings(week.speaking?.usefulPhrases, set);
  collectStrings(week.writing?.usefulLanguage, set);
  const vWeek = (vocabExercisesJson.weeks ?? []).find((entry) => entry.week === week.number);
  if (vWeek) collectStrings(vWeek, set);
  WEEK_WORD_SETS.set(week.number, set);
  for (const w of set) ALL_WEEKS_WORDS.add(w);
}

export function getWeekVocabularySet(weekNumber) {
  if (Number.isInteger(weekNumber) && WEEK_WORD_SETS.has(weekNumber)) {
    return WEEK_WORD_SETS.get(weekNumber);
  }
  return ALL_WEEKS_WORDS;
}

function inDictionary(candidate, extraSet, weekSet) {
  return CORE_WORDS.has(candidate) || weekSet.has(candidate) || extraSet.has(candidate);
}

function matchesMorphology(word, extraSet, weekSet) {
  if (inDictionary(word, extraSet, weekSet)) return true;

  // Possessive 's
  if (word.endsWith("'s") && word.length > 3) {
    const stem = word.slice(0, -2);
    if (matchesMorphology(stem, extraSet, weekSet)) return true;
  }

  // UK <-> US common spelling variants
  const spellingVariants = [];
  if (word.endsWith('ise')) spellingVariants.push(`${word.slice(0, -3)}ize`);
  if (word.endsWith('ised')) spellingVariants.push(`${word.slice(0, -4)}ized`, `${word.slice(0, -4)}ise`, `${word.slice(0, -4)}ize`);
  if (word.endsWith('ising')) spellingVariants.push(`${word.slice(0, -5)}izing`, `${word.slice(0, -5)}ise`, `${word.slice(0, -5)}ize`);
  if (word.endsWith('isation')) spellingVariants.push(`${word.slice(0, -7)}ization`, `${word.slice(0, -7)}ise`);
  if (word.includes('our')) spellingVariants.push(word.replace('our', 'or'));
  if (word.endsWith('re') && word.length > 4) spellingVariants.push(`${word.slice(0, -2)}er`);
  if (word.endsWith('lling') && word.length > 6) spellingVariants.push(`${word.slice(0, -4)}ing`, word.slice(0, -4));
  if (word.endsWith('lled') && word.length > 5) spellingVariants.push(`${word.slice(0, -3)}ed`, word.slice(0, -3));
  for (const variant of spellingVariants) {
    if (!C1_BLOCKED_WORDS.has(variant) && inDictionary(variant, extraSet, weekSet)) return true;
  }

  // Regular inflections (-s, -es, -ies, -ed, -d, -ied, -ing, -er, -est, -ly, -ness, -ment, -ful, -less, -able)
  const stems = [];
  if (word.endsWith('ies') && word.length > 4) stems.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ied') && word.length > 4) stems.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ier') && word.length > 4) stems.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('iest') && word.length > 5) stems.push(`${word.slice(0, -4)}y`);
  if (word.endsWith('ily') && word.length > 4) stems.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 3) stems.push(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) stems.push(word.slice(0, -1));
  if (word.endsWith('ed') && word.length > 3) {
    const base = word.slice(0, -2);
    stems.push(base, `${base}e`);
    if (base.length >= 3 && base.at(-1) === base.at(-2)) stems.push(base.slice(0, -1));
  }
  if (word.endsWith('ing') && word.length > 4) {
    const base = word.slice(0, -3);
    stems.push(base, `${base}e`);
    if (base.length >= 3 && base.at(-1) === base.at(-2)) stems.push(base.slice(0, -1));
  }
  if (word.endsWith('er') && word.length > 3) {
    const base = word.slice(0, -2);
    stems.push(base, `${base}e`);
    if (base.length >= 3 && base.at(-1) === base.at(-2)) stems.push(base.slice(0, -1));
  }
  if (word.endsWith('est') && word.length > 4) {
    const base = word.slice(0, -3);
    stems.push(base, `${base}e`);
    if (base.length >= 3 && base.at(-1) === base.at(-2)) stems.push(base.slice(0, -1));
  }
  if (word.endsWith('ly') && word.length > 3) {
    stems.push(word.slice(0, -2), `${word.slice(0, -2)}e`);
    if (word.endsWith('ally') && word.length > 5) stems.push(word.slice(0, -4));
    if (word.endsWith('bly') && word.length > 4) stems.push(`${word.slice(0, -3)}ble`);
  }
  for (const suffix of ['ness', 'ment', 'ful', 'less', 'able']) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      const base = word.slice(0, -suffix.length);
      stems.push(base, `${base}e`);
      if (base.endsWith('i')) stems.push(`${base.slice(0, -1)}y`);
    }
  }

  for (const stem of stems) {
    if (stem.length >= 2 && !C1_BLOCKED_WORDS.has(stem) && inDictionary(stem, extraSet, weekSet)) {
      return true;
    }
  }

  // Productive B1 prefixes (un-, re-, dis-, non-, pre-, mid-, over-, under-)
  for (const prefix of ['un', 're', 'dis', 'non', 'pre', 'mid', 'over', 'under']) {
    if (word.startsWith(prefix) && word.length >= prefix.length + 3) {
      const rest = word.slice(prefix.length);
      if (!C1_BLOCKED_WORDS.has(rest) && matchesMorphology(rest, extraSet, weekSet)) return true;
    }
  }

  return false;
}

export function isAllowedB1B2Word(rawToken, options = {}) {
  const token = String(rawToken ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  if (!token) return true;
  if (/^\d+(?:[.,:]\d+)?(?:st|nd|rd|th|s|am|pm|m|km|kg|c)?$/i.test(token)) return true;
  if (token.length === 1) return true;

  const lower = token.toLowerCase();
  const learnerSet = options._learnerSet ?? new Set(tokenizeWords(options.learnerText ?? '').map((w) => w.toLowerCase()));
  const extraSet = options._extraSet ?? new Set((options.extraAllowedWords ?? []).map((w) => String(w).toLowerCase()));
  for (const w of learnerSet) extraSet.add(w);

  // If the learner themselves used this word (e.g. a proper noun, place, or hobby), allow it
  if (learnerSet.has(lower)) return true;
  if (C1_BLOCKED_WORDS.has(lower)) return false;

  const weekSet = getWeekVocabularySet(options.weekNumber);

  // Hyphenated compound: valid if the compound itself or all parts are allowed
  if (lower.includes('-')) {
    if (inDictionary(lower, extraSet, weekSet)) return true;
    const parts = lower.split('-').filter(Boolean);
    return parts.length > 1 && parts.every((part) => isAllowedB1B2Word(part, { ...options, _learnerSet: learnerSet, _extraSet: extraSet }));
  }

  return matchesMorphology(lower, extraSet, weekSet);
}

const EMPTY_WORD_SET = new Set();

/**
 * Checks whether a word belongs strictly to the B1–B2 core word list or
 * curriculum vocabulary (without treating arbitrary learner words as allowed).
 */
export function isCommonB1B2Word(rawToken, weekNumber = null) {
  const token = String(rawToken ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  if (!token || token.length < 2) return false;
  const lower = token.toLowerCase();
  if (C1_BLOCKED_WORDS.has(lower)) return false;
  const weekSet = getWeekVocabularySet(weekNumber);
  return matchesMorphology(lower, EMPTY_WORD_SET, weekSet);
}

export function findOutOfListWords(text, options = {}) {
  const tokens = tokenizeWords(text);
  if (!tokens.length) return [];
  const learnerSet = new Set(tokenizeWords(options.learnerText ?? '').map((w) => w.toLowerCase()));
  const extraSet = new Set((options.extraAllowedWords ?? []).map((w) => String(w).toLowerCase()));
  const outOfList = [];
  const seen = new Set();

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    if (!isAllowedB1B2Word(token, { ...options, _learnerSet: learnerSet, _extraSet: extraSet })) {
      seen.add(lower);
      outOfList.push(token);
    }
  }
  return outOfList;
}

export function splitSentences(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  return (text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countPlainWords(text) {
  return tokenizeWords(text).length;
}

export function maxSentenceWordCount(text) {
  const sentences = splitSentences(text);
  if (!sentences.length) return 0;
  return Math.max(...sentences.map((s) => countPlainWords(s)));
}

export function hasDisallowedAdvancedGrammar(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  for (const sentence of splitSentences(text)) {
    const clean = sentence.trim();
    // Negative / adverbial inversion
    if (/^(?:Not only|Seldom|Rarely|Hardly|Scarcely|Never before|Little)\s+(?:did|do|does|had|have|has|was|were|can|could|will|would|should)\b/i.test(clean)) {
      return true;
    }
    if (/^(?:Had I|Were I to|Should you require)\b/i.test(clean)) {
      return true;
    }
    // Artificial cleft sentences
    if (/^What (?:really |truly )?(?:struck|impressed|surprised|amazed|fascinated) me (?:most )?(?:was|is)\b/i.test(clean)) {
      return true;
    }
    if (/^It (?:was|is) not until\b[\s\S]+\bthat\b/i.test(clean)) {
      return true;
    }
    // Advanced reporting / perfect passives
    if (/\b(?:is|are|was|were)\s+(?:said|thought|believed|rumoured|reported|alleged)\s+to\s+have\s+been\b/i.test(clean)) {
      return true;
    }
    if (/\bhaving been\s+[a-z]+(?:ed|en)\b/i.test(clean)) {
      return true;
    }
  }
  return false;
}

function matchCase(source, replacement) {
  if (!source || !replacement) return replacement;
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function splitLongSentenceOnce(sentence, maxWords) {
  const words = countPlainWords(sentence);
  if (words <= maxWords) return [sentence];

  const endingMatch = /([.!?]+)$/.exec(sentence.trim());
  const ending = endingMatch ? endingMatch[1] : '.';
  const body = endingMatch ? sentence.trim().slice(0, -ending.length) : sentence.trim();

  // Prefer natural coordinating / clause boundaries near the middle
  const splitPatterns = [
    { re: /;\s+/g, joinRight: '' },
    { re: /\s+[—–]\s+/g, joinRight: '' },
    { re: /,\s+(?:and|but|so)\s+/gi, keepConjunction: false },
    { re: /,\s+(?:which|where)\s+/gi, pronoun: true },
    { re: /\s+(?:because|although|however|while|whereas)\s+/gi, keepWord: true },
  ];

  let bestSplit = null;
  let bestDistance = Infinity;

  for (const spec of splitPatterns) {
    for (const match of body.matchAll(spec.re)) {
      const idx = match.index ?? -1;
      if (idx <= 0) continue;
      const leftRaw = body.slice(0, idx).trim();
      const matched = match[0];
      let rightRaw = body.slice(idx + matched.length).trim();
      if (spec.pronoun) {
        const word = /which/i.test(matched) ? 'It' : 'There, it';
        rightRaw = `${word} ${rightRaw}`;
      } else if (spec.keepWord) {
        const connector = matched.trim();
        if (/^(?:because|although|while|whereas)$/i.test(connector)) {
          // Only split here if no coordinating boundary worked
          if (bestSplit) continue;
          if (/^although$/i.test(connector)) rightRaw = `However, ${rightRaw}`;
          else if (/^because$/i.test(connector)) rightRaw = `This is because ${rightRaw}`;
          else rightRaw = `${connector[0].toUpperCase()}${connector.slice(1)} ${rightRaw}`;
        } else {
          rightRaw = `${connector[0].toUpperCase()}${connector.slice(1)}, ${rightRaw}`;
        }
      }
      const leftCount = countPlainWords(leftRaw);
      const rightCount = countPlainWords(rightRaw);
      if (leftCount >= 4 && rightCount >= 4) {
        const distance = Math.abs(leftCount - rightCount);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSplit = [
            `${leftRaw.replace(/[,;:]$/, '')}.`,
            `${rightRaw[0].toUpperCase()}${rightRaw.slice(1)}${ending}`,
          ];
        }
      }
    }
    if (bestSplit) break;
  }

  if (bestSplit) {
    return bestSplit.flatMap((part) => (countPlainWords(part) > maxWords ? splitByCommaOrMidpoint(part, maxWords) : [part]));
  }
  return splitByCommaOrMidpoint(sentence, maxWords);
}

function splitByCommaOrMidpoint(sentence, maxWords) {
  if (countPlainWords(sentence) <= maxWords) return [sentence];
  const endingMatch = /([.!?]+)$/.exec(sentence.trim());
  const ending = endingMatch ? endingMatch[1] : '.';
  const body = endingMatch ? sentence.trim().slice(0, -ending.length) : sentence.trim();

  // Try comma near middle
  const commas = [...body.matchAll(/,\s+/g)];
  for (const comma of commas) {
    const idx = comma.index ?? -1;
    const left = body.slice(0, idx).trim();
    const right = body.slice(idx + comma[0].length).trim();
    const lc = countPlainWords(left);
    const rc = countPlainWords(right);
    if (lc >= 5 && lc <= maxWords && rc >= 4) {
      const rest = `${right[0].toUpperCase()}${right.slice(1)}${ending}`;
      return [`${left}.`, ...(countPlainWords(rest) > maxWords ? splitByCommaOrMidpoint(rest, maxWords) : [rest])];
    }
  }

  // Last-resort clean split at a conjunction (`and`, `but`, `so`) without comma, or at maxWords
  const tokens = body.split(/\s+/);
  let cut = Math.min(maxWords, Math.max(6, Math.floor(tokens.length / 2)));
  for (let i = Math.min(maxWords, tokens.length - 4); i >= 6; i--) {
    if (/^(?:and|but|so)$/i.test(tokens[i])) {
      const left = tokens.slice(0, i).join(' ').replace(/[,;:]$/, '');
      const rightTokens = tokens.slice(i + 1);
      if (rightTokens.length >= 3) {
        const right = rightTokens.join(' ');
        const rest = `${right[0].toUpperCase()}${right.slice(1)}${ending}`;
        return [`${left}.`, ...(countPlainWords(rest) > maxWords ? splitByCommaOrMidpoint(rest, maxWords) : [rest])];
      }
    }
  }
  const left = tokens.slice(0, cut).join(' ').replace(/[,;:]$/, '');
  const right = tokens.slice(cut).join(' ');
  if (!right) return [`${left}${ending}`];
  const rest = `${right[0].toUpperCase()}${right.slice(1)}${ending}`;
  return [`${left}.`, ...(countPlainWords(rest) > maxWords ? splitByCommaOrMidpoint(rest, maxWords) : [rest])];
}

export function enforceSentenceWordLimit(text, maxWords = MAX_B1B2_SENTENCE_WORDS) {
  if (typeof text !== 'string' || !text.trim()) return '';
  // Preserve paragraph breaks
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((para) => {
      const lines = para.split(/\n/);
      return lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          const sentences = splitSentences(trimmed);
          if (!sentences.length) return trimmed;
          return sentences
            .flatMap((sentence) => splitLongSentenceOnce(sentence, maxWords))
            .join(' ');
        })
        .join('\n');
    })
    .join('\n\n')
    .trim();
}

function rewriteAdvancedGrammar(text) {
  if (typeof text !== 'string' || !text.trim()) return text;
  let result = text;
  // "Not only did I move, but I also..." -> "I moved, and I also..."
  result = result.replace(
    /\bNot only did (I|you|we|they|he|she)\s+([a-z]+),\s*but\s+\1\s+also\b/gi,
    (_m, subj, verb) => `${subj[0].toUpperCase()}${subj.slice(1)} did ${verb}, and ${subj.toLowerCase()} also`,
  );
  // "What really struck me was X" -> "I really noticed X"
  result = result.replace(
    /\bWhat (?:really |truly )?(?:struck|impressed|surprised|amazed|fascinated) me (?:most )?(?:was|is)\s+/gi,
    'I really liked ',
  );
  return result;
}

export function simplifyToB1B2(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const maxWords = options.maxSentenceWords ?? MAX_B1B2_SENTENCE_WORDS;
  const learnerSet = new Set(tokenizeWords(options.learnerText ?? '').map((w) => w.toLowerCase()));

  let output = rewriteAdvancedGrammar(text);

  for (const [pattern, replacement] of C1_PHRASE_REPLACEMENTS) {
    output = output.replace(pattern, (matched) => matchCase(matched, replacement));
  }

  output = output.replace(/\b([A-Za-z]+)\b/g, (word) => {
    const lower = word.toLowerCase();
    if (learnerSet.has(lower)) return word;
    const replacement = C1_WORD_REPLACEMENTS.get(lower);
    return replacement ? matchCase(word, replacement) : word;
  });

  return enforceSentenceWordLimit(output, maxWords);
}

/**
 * Keep clear, accurate learner sentences unchanged when no correction targets them
 * and they already follow the B1–B2 length and word rules.
 */
export function preserveClearLearnerSentences(originalText, rewrittenText, corrections = [], options = {}) {
  if (typeof originalText !== 'string' || typeof rewrittenText !== 'string') return rewrittenText;
  const origSentences = splitSentences(originalText);
  const rewSentences = splitSentences(rewrittenText);
  if (!origSentences.length || origSentences.length !== rewSentences.length) {
    return rewrittenText;
  }

  const targetedNorms = new Set(
    (corrections ?? [])
      .map((c) => String(c?.original ?? '').toLowerCase().replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );

  const rebuilt = rewSentences.map((rew, idx) => {
    const orig = origSentences[idx];
    const normOrig = orig.toLowerCase().replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
    const isTargeted = [...targetedNorms].some(
      (target) => normOrig.includes(target) || target.includes(normOrig),
    );
    if (isTargeted) return rew;
    if (
      countPlainWords(orig) <= MAX_B1B2_SENTENCE_WORDS &&
      !hasDisallowedAdvancedGrammar(orig) &&
      findOutOfListWords(orig, { weekNumber: options.weekNumber }).length === 0 &&
      /^[A-Z]/.test(orig.trim()) &&
      /[.!?]$/.test(orig.trim())
    ) {
      return orig;
    }
    return rew;
  });

  return rebuilt.join(' ');
}
