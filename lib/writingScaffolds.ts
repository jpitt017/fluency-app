export interface WritingScaffold {
  keywords: string[];
  starters: string[];
  modelExample: string;
}

export function getWritingScaffold(blockNumber: number): WritingScaffold {
  if (blockNumber === 4) {
    return {
      keywords: ['heritage', 'perspective', 'background', 'connect'],
      starters: [
        'Growing up in my hometown shaped my perspective because...',
        'In my professional life, my cultural background helps me connect with...',
      ],
      modelExample:
        'Growing up in a bilingual family gave me an open perspective on communication. In my current role, my cultural background helps me connect easily with international colleagues.',
    };
  }
  if (blockNumber === 8) {
    return {
      keywords: ['turning point', 'used to', 'realised', 'growth'],
      starters: [
        'Before that turning point, I used to feel...',
        'Looking back, I realised that this challenge helped my personal growth by...',
      ],
      modelExample:
        'Before moving abroad, I used to feel nervous speaking English at work. Looking back, that turning point helped my personal growth because I realised mistakes are part of learning.',
    };
  }
  if (blockNumber === 12) {
    return {
      keywords: ['settle in', 'get the hang of', 'broaden horizons', 'advice'],
      starters: [
        'My best piece of advice to help you settle in is...',
        'It takes a few weeks to get the hang of local routines, so...',
      ],
      modelExample:
        'My best piece of advice to help you settle in is to join a local hobby group early on. It takes time to get the hang of a new city, but stepping outside your routine will really broaden your horizons.',
    };
  }
  return {
    keywords: ['adaptability', 'culture shock', 'balance', 'confident'],
    starters: [
      'When I first experienced culture shock, I learned that...',
      'True adaptability means finding a healthy balance between...',
    ],
    modelExample:
      'When I first experienced culture shock, I learned that patience is essential. Today, I feel much more confident because adaptability means finding a healthy balance between new habits and my own roots.',
  };
}