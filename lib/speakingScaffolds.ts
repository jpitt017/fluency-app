export interface SpeakingScaffold {
  modelPhrase: string;
  rhythmGuide: string;
  rpTip: string;
  freePrompt: string;
}

export function getSpeakingScaffold(blockNumber: number): SpeakingScaffold {
  if (blockNumber === 3) {
    return {
      modelPhrase: 'It is lovely to finally meet you in person after all our emails.',
      rhythmGuide: 'It is LOVELY to finally meet you | in PERSON | after all our EMAILS.',
      rpTip: 'RP Tip: Link "meet_you" smoothly and keep the final "r" in "after" silent unless linking to a vowel.',
      freePrompt: 'Introduce yourself to a new international colleague in 2-3 sentences without using local slang.',
    };
  }
  if (blockNumber === 7) {
    return {
      modelPhrase: 'I had been living abroad for two years when I finally felt at home.',
      rhythmGuide: 'I had been living ABROAD | for TWO years | when I FINALLY felt at home.',
      rpTip: 'RP Tip: Reduce "had been" to a quick, soft rhythm so your voice lands strongly on "ABROAD" and "FINALLY".',
      freePrompt: 'Describe a turning point in your life using "I had been..." and "when I...".',
    };
  }
  if (blockNumber === 11) {
    return {
      modelPhrase: 'Stepping outside my comfort zone helped me broaden my horizons.',
      rhythmGuide: 'Stepping OUTSIDE my comfort zone | helped me BROADEN | my HORIZONS.',
      rpTip: 'RP Tip: Keep vowel sounds clean and crisp in "comfort" and "broaden" without adding extra syllables.',
      freePrompt: 'Share one piece of advice for someone moving to a new city for the first time.',
    };
  }
  return {
    modelPhrase: 'At first, culture shock felt overwhelming, but patience helped me adapt.',
    rhythmGuide: 'At FIRST, | culture shock felt OVERWHELMING, | but PATIENCE helped me adapt.',
    rpTip: 'RP Tip: Pause briefly at the commas (|) to give your listener time to absorb each thought group.',
    freePrompt: 'Tell a short 30-second story about overcoming a cultural surprise or misunderstanding.',
  };
}

export function compareSpokenWords(target: string, spoken: string) {
  const cleanTarget = target
    .toLowerCase()
    .replace(/[.,!?;:'"()]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const cleanSpoken = spoken
    .toLowerCase()
    .replace(/[.,!?;:'"()]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const spokenSet = new Set(cleanSpoken);
  const results = cleanTarget.map((word) => ({
    word,
    matched: spokenSet.has(word),
  }));

  const matchedCount = results.filter((r) => r.matched).length;
  const score = cleanTarget.length
    ? Math.round((matchedCount / cleanTarget.length) * 100)
    : 0;

  return { results, score };
}