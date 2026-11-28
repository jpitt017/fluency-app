import { answersEquivalent } from '../b1b2/contractions.mjs';
import {
  buildFullSentence,
  isFullSentence,
  normalizeReviewKey,
  parts,
} from './week-practice-review.mjs';
import { learnerGrammarReason } from './learner-grammar-reasons.mjs';
import {
  LEARNER_GRAMMAR_ALTERNATIVES,
  nearlyRightGrammarFeedback,
} from './learner-grammar-marking.mjs';
import { markInputAnswer } from './input-marking.mjs';

const CHOOSE_VERB_TERMS = Object.freeze({
  'V1-C1': 'take a risk',
  'V1-C2': 'make progress',
  'V1-C3': 'make a change',
  'V2-C1': 'set a goal',
  'V2-C2': 'meet a deadline',
  'V2-C3': 'put (something) off',
  'V3-C1': 'make an effort',
  'V3-C2': 'keep a promise',
  'V3-C3': 'get in touch',
  'V4-C1': 'miss a connection',
  'V4-C2': 'travel light',
  'V4-C3': 'stop overnight',
});

const WORD_FORM_TERMS = Object.freeze({
  'V1-F1': 'make a big decision',
  'V1-F2': 'adapt',
  'V2-F1': 'ambition',
  'V2-F2': 'achieve',
  'V3-F1': 'rely on',
  'V3-F2': 'politely',
  'V4-F1': 'culture',
  'V4-F2': 'tradition',
});

function hasGenericExplanation(text) {
  const clean = String(text ?? '').trim();
  return !clean
    || /^Write the (?:sentence|answer) again with this correction:/i.test(clean)
    || /^The answer is /i.test(clean);
}

function toSafePracticeItem(item) {
  const hasOptions = Array.isArray(item.options) && item.options.length >= 2;
  const hasBlanks = /_{2,}/.test(item.prompt);
  return {
    id: item.id,
    prompt: item.prompt,
    options: hasOptions ? [...item.options] : [],
    kind: hasOptions ? 'choice' : hasBlanks ? 'gap' : 'fix',
  };
}

function collectCandidateAnswers({ prompt, key, accepted = [], extraAlternatives = [] }) {
  const hasBlanks = /_{2,}/.test(prompt);
  const candidates = [];
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
  };

  const rawValues = [];
  if (Array.isArray(key)) {
    rawValues.push(key);
    add(key.join(' ... '));
    add(key.join(' '));
    add(key.join(', '));
  } else if (typeof key === 'string' && key.trim()) {
    rawValues.push(key);
    add(key);
  }

  for (const entry of accepted) {
    if (Array.isArray(entry)) {
      rawValues.push(entry);
      add(entry.join(' ... '));
      add(entry.join(' '));
    } else if (typeof entry === 'string' && entry.trim()) {
      rawValues.push(entry);
      add(entry);
    }
  }

  for (const alt of extraAlternatives) {
    if (typeof alt === 'string' && alt.trim()) {
      rawValues.push(alt);
      add(alt);
    }
  }

  const fullSentences = [];
  if (hasBlanks) {
    for (const raw of rawValues) {
      const full = buildFullSentence(prompt, raw);
      if (full) {
        fullSentences.push(full);
        add(full);
      }
    }
  }

  // Deduplicate case-insensitively while preserving order.
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const k = c.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(c);
    }
  }
  return { all: unique, fullSentences };
}

/** Try to expand a bare gap answer (e.g. "has left" or "was, made") into the full prompt sentence. */
export function expandGapAttempt(prompt, attempt) {
  if (typeof prompt !== 'string' || !/_{2,}/.test(prompt)) return null;
  const trimmed = String(attempt ?? '').trim();
  if (!trimmed) return null;
  const blankCount = (prompt.match(/_{2,}/g) ?? []).length;
  if (blankCount === 1) {
    return buildFullSentence(prompt, trimmed);
  }
  if (blankCount === 2) {
    if (/\.\.\./.test(trimmed)) return buildFullSentence(prompt, parts(trimmed));
    if (trimmed.includes(',')) {
      const split = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      if (split.length === 2) return buildFullSentence(prompt, split);
    }
    const direct = buildFullSentence(prompt, trimmed);
    if (direct) return direct;
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 2) return buildFullSentence(prompt, words);
  }
  return null;
}

/**
 * Create a reusable enricher & deterministic Review checker from the authored
 * Weeks 1–4 content JSONs.
 */
export function createReviewEnricher({
  details,
  vocabularyBank,
  vocabularyMeanings,
  inputReasons,
  vocabPractice,
}) {
  const meaningsByTerm = new Map();
  for (const week of vocabularyMeanings?.weeks ?? []) {
    for (const def of week.definitions ?? []) {
      meaningsByTerm.set(def.target.trim().toLowerCase(), def.definition);
    }
  }

  const vocabEntriesByTerm = new Map();
  for (const week of details?.weeks ?? []) {
    for (const group of ['core', 'collocations', 'optional']) {
      for (const entry of week.vocabulary?.[group] ?? []) {
        const key = entry.target.trim().toLowerCase();
        vocabEntriesByTerm.set(key, {
          week: week.number,
          group,
          target: entry.target,
          example: entry.example,
          collocation: entry.collocation ?? (group === 'collocations' ? entry.target : null),
          es: entry.es ?? null,
          extraExample: entry.extraExample ?? null,
          definition: meaningsByTerm.get(key) ?? null,
        });
      }
    }
    for (const family of week.vocabulary?.families ?? []) {
      const key = family.base.trim().toLowerCase();
      if (!vocabEntriesByTerm.has(key)) {
        vocabEntriesByTerm.set(key, {
          week: week.number,
          group: 'family',
          target: family.base,
          example: null,
          collocation: null,
          es: null,
          extraExample: null,
          definition: meaningsByTerm.get(key) ?? null,
        });
      }
    }
  }

  // Index all practice items & card records.
  const grammarRecords = [];
  const recordsByKey = new Map();
  const practiceById = new Map();

  const registerRecordKey = (key, record) => {
    const norm = normalizeReviewKey(key);
    if (norm && !recordsByKey.has(norm)) recordsByKey.set(norm, record);
  };

  for (const week of details?.weeks ?? []) {
    const ruleExamplesMap = week.grammar?.ruleExamples ?? {};
    for (const item of week.grammar?.practice?.items ?? []) {
      if (item.step === 'Meaning' || item.step === 'Use it') continue;
      const hasBlanks = /_{2,}/.test(item.prompt);
      const correctedSentence = hasBlanks
        ? buildFullSentence(item.prompt, item.key)
        : (typeof item.key === 'string' ? item.key.trim() : null);
      if (!correctedSentence || !isFullSentence(correctedSentence)) continue;

      const rule = item.rule ?? null;
      const ruleExamples = (rule && Array.isArray(ruleExamplesMap[rule])) ? ruleExamplesMap[rule] : [];
      const reason = learnerGrammarReason(item) ?? item.reason ?? '';
      const extraAlts = Object.hasOwn(LEARNER_GRAMMAR_ALTERNATIVES, item.id)
        ? LEARNER_GRAMMAR_ALTERNATIVES[item.id]
        : [];
      const candidates = collectCandidateAnswers({
        prompt: item.prompt,
        key: item.key,
        accepted: Array.isArray(item.accepted) ? item.accepted : [],
        extraAlternatives: extraAlts,
      });

      const record = {
        source: 'grammar',
        id: item.id,
        week: week.number,
        step: item.step,
        target: item.target,
        rule,
        prompt: item.prompt,
        options: Array.isArray(item.options) ? [...item.options] : [],
        key: item.key,
        correctedSentence,
        reason,
        ruleExamples,
        acceptedAnswers: candidates.all,
        rawItem: item,
      };
      grammarRecords.push(record);
      practiceById.set(record.id, record);
      registerRecordKey(item.prompt, record);
      if (item.id === 'W2-F2') registerRecordKey('I will visit my parents.', record);
    }
  }

  // Index vocabulary practice items from vocab-review-practice-weeks-01-04.json.
  const vocabPracticeByTerm = new Map();
  for (const item of vocabPractice?.items ?? []) {
    const correctedSentence = buildFullSentence(item.prompt, item.key);
    if (!correctedSentence || !isFullSentence(correctedSentence)) continue;
    const candidates = collectCandidateAnswers({
      prompt: item.prompt,
      key: item.key,
      accepted: Array.isArray(item.accepted) ? item.accepted : [],
    });
    const record = {
      source: 'vocab-practice',
      id: item.id,
      week: item.week,
      term: item.term,
      prompt: item.prompt,
      options: Array.isArray(item.options) ? [...item.options] : [],
      key: item.key,
      correctedSentence,
      reason: item.reason ?? '',
      acceptedAnswers: candidates.all,
    };
    practiceById.set(record.id, record);
    const termKey = item.term.trim().toLowerCase();
    const list = vocabPracticeByTerm.get(termKey) ?? [];
    list.push(record);
    vocabPracticeByTerm.set(termKey, list);
  }

  // Index vocabulary chooseVerb and wordForms items.
  for (const week of vocabularyBank?.weeks ?? []) {
    for (const item of [...(week.chooseVerb ?? []), ...(week.wordForms ?? [])]) {
      const key = item.options?.[item.answer_index];
      const correctedSentence = buildFullSentence(item.question, key);
      if (!correctedSentence || !isFullSentence(correctedSentence)) continue;
      const linkedTerm = CHOOSE_VERB_TERMS[item.id] ?? WORD_FORM_TERMS[item.id] ?? null;
      const vocabEntry = linkedTerm ? vocabEntriesByTerm.get(linkedTerm.toLowerCase()) ?? null : null;
      const candidates = collectCandidateAnswers({
        prompt: item.question,
        key,
        accepted: [],
      });
      const record = {
        source: 'vocabulary',
        id: item.id,
        week: week.week,
        term: linkedTerm,
        prompt: item.question,
        options: Array.isArray(item.options) ? [...item.options] : [],
        key,
        correctedSentence,
        reason: item.reason ?? '',
        collocation: vocabEntry?.collocation ?? null,
        meaning: vocabEntry?.definition ?? null,
        es: vocabEntry?.es ?? null,
        extraExample: vocabEntry?.extraExample ?? null,
        acceptedAnswers: candidates.all,
      };
      practiceById.set(record.id, record);
      registerRecordKey(item.question, record);
      registerRecordKey(correctedSentence, record);
    }
  }

  // Index reading and listening gap items (L1-X3, L2-X3, L3-X3, L4-X2, L4-X3, R4-X3).
  const inputReasonById = new Map((inputReasons?.items ?? []).map((entry) => [entry.id, entry]));
  for (const mode of ['listening', 'reading']) {
    for (const week of details?.[mode]?.weeks ?? []) {
      const sourceText = week.script ?? week.text ?? '';
      for (const question of week.questions ?? []) {
        if (!/_{2,}/.test(question.question)) continue;
        const reasonEntry = inputReasonById.get(question.id);
        const wordCount = question.key.trim().split(/\s+/).filter(Boolean).length;
        const countLabel = `(${wordCount} ${wordCount === 1 ? 'word' : 'words'})`;
        const quoted = /"([^"]+)"/.exec(question.question);
        let promptSentence = quoted ? quoted[1].trim() : question.question;
        let correctedSentence = buildFullSentence(promptSentence, question.key);
        if ((!correctedSentence || !isFullSentence(correctedSentence)) && reasonEntry?.sourceLine) {
          // Try extracting the full sentence from the clip/text (e.g. L4-X2).
          const sentences = sourceText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
          const containing = sentences.find((s) => s.includes(reasonEntry.sourceLine));
          if (containing) {
            const escaped = question.key.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            promptSentence = containing.replace(new RegExp(`\\b${escaped}\\b`, 'i'), `___ ${countLabel}`);
            correctedSentence = containing;
          }
        }
        if (!correctedSentence || !isFullSentence(correctedSentence)) continue;
        const candidates = collectCandidateAnswers({
          prompt: promptSentence,
          key: question.key,
          accepted: Array.isArray(question.accepted) ? question.accepted : [],
        });
        const record = {
          source: 'input',
          id: question.id,
          week: week.week,
          prompt: promptSentence,
          options: [],
          key: question.key,
          correctedSentence,
          reason: reasonEntry?.reason ?? '',
          acceptedAnswers: candidates.all,
          rawQuestion: question,
        };
        practiceById.set(record.id, record);
        registerRecordKey(question.question, record);
        registerRecordKey(promptSentence, record);
      }
    }
  }

  function grammarPracticeFor(record) {
    const picked = [];
    const seen = new Set([record.id]);
    const pushFrom = (items) => {
      for (const entry of items) {
        if (picked.length >= 3) break;
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        picked.push(toSafePracticeItem(entry));
      }
    };
    // 1. Same rule, same week.
    if (record.rule) {
      pushFrom(grammarRecords.filter((entry) => entry.week === record.week && entry.rule === record.rule));
      // 2. Same rule, other weeks (useful for Review items like W3-V2 / W4-V1).
      if (picked.length < 2) {
        pushFrom(grammarRecords.filter((entry) => entry.rule === record.rule));
      }
    }
    // 3. Same week & target fallback so every grammar card has 2-3 items.
    if (picked.length < 2) {
      pushFrom(grammarRecords.filter((entry) => entry.week === record.week && entry.target === record.target));
    }
    if (picked.length < 2) {
      pushFrom(grammarRecords.filter((entry) => entry.week === record.week));
    }
    return picked;
  }

  function vocabPracticeFor(term, excludeId = null) {
    if (!term) return [];
    const key = term.trim().toLowerCase();
    const list = vocabPracticeByTerm.get(key) ?? [];
    const picked = [];
    const seen = new Set(excludeId ? [excludeId] : []);
    for (const entry of list) {
      if (picked.length >= 3) break;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      picked.push(toSafePracticeItem(entry));
    }
    // Include matching chooseVerb/wordForms exercise from the week bank as a 3rd item when available.
    if (picked.length < 3) {
      for (const entry of practiceById.values()) {
        if (picked.length >= 3) break;
        if (entry.source !== 'vocabulary' || entry.term?.toLowerCase() !== key) continue;
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        picked.push(toSafePracticeItem(entry));
      }
    }
    return picked;
  }

  function matchErrorRecord(card) {
    if (!card) return null;
    const keysToTry = [
      card.normalized_key,
      card.prompt_sentence,
      card.context_sentence,
    ];
    for (const candidate of keysToTry) {
      if (!candidate) continue;
      const norm = normalizeReviewKey(candidate);
      if (norm && recordsByKey.has(norm)) return recordsByKey.get(norm);
    }
    return null;
  }

  function enrichErrorReviewCard(card) {
    const record = matchErrorRecord(card);
    const hasBlanks = /_{2,}/.test(String(card?.prompt_sentence ?? ''));

    if (!record) {
      return {
        itemId: null,
        kind: hasBlanks ? 'gap' : 'fix',
        instruction: hasBlanks ? 'Type the missing word(s)' : 'Rewrite the sentence',
        options: [],
        rule: card?.explanation ? { reason: card.explanation, examples: [] } : null,
        collocation: null,
        meaning: null,
        es: null,
        extraExample: null,
        practiceItems: [],
        displayCorrectedSentence: card?.corrected_sentence ?? '',
      };
    }

    const hasOptions = record.options.length >= 2;
    const kind = hasOptions ? 'choice' : hasBlanks ? 'gap' : 'fix';
    const instruction = hasOptions
      ? 'Choose the missing word(s)'
      : hasBlanks
        ? 'Type the missing word(s)'
        : 'Rewrite the sentence';

    const displayCorrectedSentence = isFullSentence(card?.corrected_sentence)
      ? card.corrected_sentence
      : record.correctedSentence;

    const effectiveReason = !hasGenericExplanation(card?.explanation)
      ? card.explanation
      : (record.reason || card?.explanation || '');

    const ruleExamples = record.source === 'grammar' ? record.ruleExamples : [];
    const practiceItems = record.source === 'grammar'
      ? grammarPracticeFor(record)
      : record.source === 'vocabulary' && record.term
        ? vocabPracticeFor(record.term, record.id)
        : [];

    return {
      itemId: record.id,
      kind,
      instruction,
      options: hasOptions ? [...record.options] : [],
      rule: effectiveReason || ruleExamples.length
        ? { reason: effectiveReason, examples: ruleExamples }
        : null,
      collocation: record.collocation ?? null,
      meaning: record.meaning ?? null,
      es: record.es ?? null,
      extraExample: record.extraExample ?? null,
      practiceItems,
      displayCorrectedSentence,
    };
  }

  function enrichVocabReviewCard(card) {
    const termKey = String(card?.term ?? '').trim().toLowerCase();
    const entry = vocabEntriesByTerm.get(termKey) ?? null;
    if (!entry) {
      return {
        collocation: card?.term ?? null,
        meaning: card?.definition ?? '',
        es: card?.translation_es ?? null,
        extraExample: null,
        practiceItems: [],
      };
    }
    return {
      collocation: entry.collocation ?? entry.target,
      meaning: entry.definition ?? card?.definition ?? '',
      // Requirement 3c: show Spanish equivalent ONLY when Spanish works differently.
      es: entry.es ?? null,
      extraExample: entry.extraExample ?? null,
      practiceItems: vocabPracticeFor(entry.target),
    };
  }

  /**
   * Deterministic server-side checker for Review cards (0 AI units).
   * Handles contraction equivalence, all authored `accepted` answers,
   * choice/gap bare answers as well as full sentences, and nearly-right notes.
   */
  function checkReviewCardAnswer(card, rawAttempt) {
    const attempt = String(rawAttempt ?? '').trim();
    if (!attempt) return { matched: false, fixed: false };

    const record = matchErrorRecord(card);
    const promptForGap = String(card?.prompt_sentence ?? record?.prompt ?? '');
    const expandedAttempt = /_{2,}/.test(promptForGap) ? expandGapAttempt(promptForGap, attempt) : null;

    // 1. Direct contraction-aware match against stored corrected_sentence.
    if (
      answersEquivalent(attempt, card.corrected_sentence)
      || (expandedAttempt && answersEquivalent(expandedAttempt, card.corrected_sentence))
    ) {
      return {
        matched: true,
        fixed: true,
        reason: 'This matches the correct answer.',
        expandedAttempt,
        canonicalCorrectedSentence: record?.correctedSentence ?? card.corrected_sentence,
      };
    }

    if (!record) {
      return { matched: false, fixed: false, expandedAttempt };
    }

    // 2. Match against any authored key / accepted answer (bare or full sentence).
    const matchesAccepted = record.acceptedAnswers.some((candidate) =>
      answersEquivalent(attempt, candidate)
      || (expandedAttempt && answersEquivalent(expandedAttempt, candidate)),
    );
    if (matchesAccepted) {
      return {
        matched: true,
        fixed: true,
        reason: 'This matches an accepted answer.',
        expandedAttempt,
        canonicalCorrectedSentence: record.correctedSentence,
      };
    }

    // 3. Grammar nearly-right guidance (e.g. W3-V2 "was closed").
    if (record.source === 'grammar') {
      const nearlyMsg = nearlyRightGrammarFeedback(record.rawItem, attempt)
        ?? (expandedAttempt ? nearlyRightGrammarFeedback(record.rawItem, expandedAttempt) : null);
      if (nearlyMsg) {
        return {
          matched: true,
          fixed: false,
          nearly: true,
          reason: nearlyMsg,
          expandedAttempt,
          canonicalCorrectedSentence: record.correctedSentence,
        };
      }
    }

    // 4. Reading/listening gap nearly-right guidance (L4-X3 / R4-X3 "more quiet").
    if (record.source === 'input' && record.rawQuestion) {
      try {
        const res = markInputAnswer(record.rawQuestion, attempt);
        if (res.correct) {
          return {
            matched: true,
            fixed: true,
            reason: 'This matches an accepted answer.',
            expandedAttempt,
            canonicalCorrectedSentence: record.correctedSentence,
          };
        }
        if (res.nearly) {
          return {
            matched: true,
            fixed: false,
            nearly: true,
            reason: res.reason,
            expandedAttempt,
            canonicalCorrectedSentence: record.correctedSentence,
          };
        }
      } catch {
        // Ignore and fall through to wrong/semantic check.
      }
    }

    // For choice/gap cards with a closed authored answer set, don't burn AI on wrong answers.
    const deterministicOnly = record.options.length >= 2 || record.source === 'input';
    return {
      matched: deterministicOnly,
      fixed: false,
      reason: record.reason || 'Compare your answer with the correct sentence below.',
      expandedAttempt,
      canonicalCorrectedSentence: record.correctedSentence,
    };
  }

  /**
   * Instant, deterministic (0 AI) checker for "Practise this rule" / "Practise this" items.
   * Never mutates any card schedule or database row.
   */
  function checkReviewPracticeItem(itemId, rawAnswer) {
    const record = practiceById.get(String(itemId ?? '').trim());
    if (!record) return null;
    const answer = String(rawAnswer ?? '').trim();
    if (!answer) return { error: 'Please answer this item first.' };

    const expanded = /_{2,}/.test(record.prompt) ? expandGapAttempt(record.prompt, answer) : null;
    const correct = record.acceptedAnswers.some((candidate) =>
      answersEquivalent(answer, candidate)
      || (expanded && answersEquivalent(expanded, candidate)),
    );

    if (correct) {
      return {
        correct: true,
        nearly: false,
        feedback: record.reason || 'That is right.',
        correctSentence: record.correctedSentence,
      };
    }

    if (record.source === 'grammar') {
      const nearlyMsg = nearlyRightGrammarFeedback(record.rawItem, answer)
        ?? (expanded ? nearlyRightGrammarFeedback(record.rawItem, expanded) : null);
      if (nearlyMsg) {
        return {
          correct: false,
          nearly: true,
          feedback: nearlyMsg,
          correctSentence: record.correctedSentence,
        };
      }
    }

    return {
      correct: false,
      nearly: false,
      feedback: record.reason || 'Compare your answer with the correct sentence.',
      correctSentence: record.correctedSentence,
    };
  }

  return {
    enrichErrorReviewCard,
    enrichVocabReviewCard,
    checkReviewCardAnswer,
    checkReviewPracticeItem,
    getRecordById: (id) => practiceById.get(id) ?? null,
  };
}
