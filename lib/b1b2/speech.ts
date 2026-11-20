export type AccentPreference = 'auto' | 'en-GB' | 'en-US' | 'en-AU';

const ACCENT_TOKENS: { match: RegExp; lang: string; label: string }[] = [
  { match: /american|\bus\b/i, lang: 'en-US', label: 'American' },
  { match: /british|\buk\b/i, lang: 'en-GB', label: 'British' },
  { match: /australian/i, lang: 'en-AU', label: 'Australian' },
  { match: /irish/i, lang: 'en-IE', label: 'Irish' },
  { match: /canadian/i, lang: 'en-CA', label: 'Canadian' },
  { match: /south african/i, lang: 'en-ZA', label: 'South African' },
  { match: /indian/i, lang: 'en-IN', label: 'Indian' },
  { match: /nigerian/i, lang: 'en-NG', label: 'Nigerian' },
];

export function parseAccentLanguages(accentLabel?: string | null): string[] {
  if (!accentLabel) return ['en-GB', 'en-US'];
  const langs: string[] = [];
  for (const token of ACCENT_TOKENS) {
    if (token.match.test(accentLabel) && !langs.includes(token.lang)) {
      langs.push(token.lang);
    }
  }
  return langs.length ? langs : ['en-GB', 'en-US'];
}

export function loadEnglishVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }

  const synth = window.speechSynthesis;
  const existing = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (existing.length > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')));
    };

    synth.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, 350);
  });
}

export function pickVoiceForLang(
  voices: SpeechSynthesisVoice[],
  targetLang: string,
  speakerIndex = 0,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const exact = voices.filter((v) => v.lang.toLowerCase() === targetLang.toLowerCase());
  if (exact.length > 0) {
    return exact[speakerIndex % exact.length];
  }

  const base = targetLang.split('-')[0].toLowerCase();
  const baseMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  if (baseMatches.length > 0) {
    return baseMatches[speakerIndex % baseMatches.length];
  }

  return voices[speakerIndex % voices.length];
}

export async function speakPhrase(text: string, lang: 'en-GB' | 'en-US' | 'en-AU' = 'en-GB', rate = 0.95) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  const synth = window.speechSynthesis;
  const voices = await loadEnglishVoices();
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  const voice = pickVoiceForLang(voices, lang, 0);
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}
