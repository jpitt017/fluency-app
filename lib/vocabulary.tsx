import React from 'react';
import VocabularyTooltip from '@/components/VocabularyTooltip';

// Sample dictionary of B1 British English terms and definitions
const DICTIONARY: Record<string, { definition: string; example: string }> = {
  assimilate: {
    definition: 'To absorb and integrate information or culture into one’s routine.',
    example: 'It takes time to assimilate new idioms when moving to London.',
  },
  'turning point': {
    definition: 'A time at which a decisive change in a situation occurs.',
    example: 'Starting this English course was a major turning point for my career.',
  },
  heritage: {
    definition: 'Valued objects and qualities such as cultural traditions passed down.',
    example: 'The museum celebrates the rich industrial heritage of Manchester.',
  },
  fluently: {
    definition: 'Expressing oneself easily and articulately in speech or writing.',
    example: 'She aims to speak naturally and fluently in professional settings.',
  },
};

export function renderWithVocabularyTooltips(text: string): React.ReactNode[] {
  if (!text) return [text];

  const terms = Object.keys(DICTIONARY);
  const regex = new RegExp(`(${terms.join('|')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const lower = part.toLowerCase();
    if (DICTIONARY[lower]) {
      const entry = DICTIONARY[lower];
      return (
        <VocabularyTooltip
          key={index}
          term={part}
          definition={entry.definition}
          example={entry.example}
        />
      );
    }
    return part;
  });
}