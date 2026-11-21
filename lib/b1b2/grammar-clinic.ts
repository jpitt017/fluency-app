export interface ClinicItem {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface ClinicTopic {
  slug: string;
  title: string;
  errorCategories: string[];
  summary: string;
  coreRules: string[];
  contrastExamples: Array<{ weak: string; strong: string; why: string }>;
  items: ClinicItem[];
}

export const GRAMMAR_CLINIC_TOPICS: ClinicTopic[] = [
  {
    slug: 'present-simple-continuous',
    title: 'Present simple & present continuous',
    errorCategories: ['tense_aspect', 'verb_tense'],
    summary:
      'Taught here from Week 1 rather than the main 16-week sequence. Separate permanent routines and stative verbs from temporary situations happening now.',
    coreRules: [
      'Use present simple for habits, routines, timetables, and permanent facts (I commute by train).',
      'Use present continuous for actions happening right now or temporary projects this week/month (I am covering for a colleague this week).',
      'Keep stative verbs (know, believe, belong, prefer, seem, understand) in simple forms rather than -ing.',
    ],
    contrastExamples: [
      {
        weak: 'I am knowing the manager since last year.',
        strong: 'I have known the manager since last year.',
        why: 'Know is a stative verb; use simple/perfect forms, not continuous.',
      },
      {
        weak: 'Usually I am working from home on Fridays.',
        strong: 'Usually I work from home on Fridays.',
        why: 'Repeated weekly habits take the present simple.',
      },
    ],
    items: [
      {
        id: 'psc-1',
        prompt: 'At the moment, our team ___ a new onboarding guide for clients.',
        options: ['prepares', 'is preparing', 'has preparing'],
        answer: 'is preparing',
        explanation: 'A temporary project happening around now takes the present continuous.',
      },
      {
        id: 'psc-2',
        prompt: 'She ___ what the report means, so no extra summary is needed.',
        options: ['is understanding', 'understands', 'understanding'],
        answer: 'understands',
        explanation: 'Understand is a stative verb and normally takes the simple form.',
      },
      {
        id: 'psc-3',
        prompt: 'Which sentence describes a permanent routine?',
        options: [
          'The studio opens at nine every weekday.',
          'The studio is opening early this morning.',
          'The studio is belonging to a local group.',
        ],
        answer: 'The studio opens at nine every weekday.',
        explanation: 'Regular schedules and timetables use the present simple.',
      },
      {
        id: 'psc-4',
        prompt: 'I normally take the bus, but this month I ___ to work.',
        options: ['walk', 'am walking', 'walked'],
        answer: 'am walking',
        explanation: 'Contrast between a normal habit (take) and a temporary change (am walking).',
      },
    ],
  },
  {
    slug: 'articles',
    title: 'Articles (a, an, the, zero article)',
    errorCategories: ['article'],
    summary:
      'Control singular countable nouns and distinguish first mention (a/an), shared or specific reference (the), and general plurals/uncountables (zero article).',
    coreRules: [
      'Every singular countable noun needs a determiner (a challenge, the proposal, my report — never bare "challenge").',
      'Use "a/an" by sound on first mention (an honest answer, a university degree).',
      'Use zero article for general plural and uncountable statements (Information travels fast; Cities need green spaces).',
    ],
    contrastExamples: [
      {
        weak: 'Moving to Manchester was turning point in my career.',
        strong: 'Moving to Manchester was a turning point in my career.',
        why: '"Turning point" is a singular countable noun introduced for the first time.',
      },
      {
        weak: 'The public transport is essential for the modern cities.',
        strong: 'Public transport is essential for modern cities.',
        why: 'General statements about uncountable/plural nouns omit "the".',
      },
    ],
    items: [
      {
        id: 'art-1',
        prompt: 'It was ___ honest mistake that taught everyone a useful lesson.',
        options: ['a', 'an', 'the'],
        answer: 'an',
        explanation: 'Honest begins with a vowel sound, so it takes "an".',
      },
      {
        id: 'art-2',
        prompt: '___ teamwork matters more than individual speed on long projects.',
        options: ['The', 'A', 'No article'],
        answer: 'No article',
        explanation: 'General uncountable nouns take zero article.',
      },
      {
        id: 'art-3',
        prompt: 'Could you send me ___ summary we discussed yesterday morning?',
        options: ['a', 'the', 'no article'],
        answer: 'the',
        explanation: 'Both speaker and listener know which specific summary is meant.',
      },
      {
        id: 'art-4',
        prompt: 'She applied for ___ university fellowship in Edinburgh.',
        options: ['a', 'an', 'no article'],
        answer: 'a',
        explanation: 'University starts with a /j/ consonant sound, so use "a".',
      },
    ],
  },
  {
    slug: 'quantifiers',
    title: 'Quantifiers & countability',
    errorCategories: ['quantifier'],
    summary:
      'Match countable plurals (many, a few, several) and uncountable nouns (much, a little, a great deal of) accurately.',
    coreRules: [
      'Use few / a few with plural countables; little / a little with uncountable nouns.',
      '"A few / a little" means some (positive); "few / little" means hardly any (negative).',
      'Uncountable nouns like advice, information, equipment, research, and feedback never take -s or "many".',
    ],
    contrastExamples: [
      {
        weak: 'We received many useful feedbacks after the workshop.',
        strong: 'We received a great deal of useful feedback after the workshop.',
        why: 'Feedback is uncountable in English.',
      },
      {
        weak: 'There are little options left before Friday.',
        strong: 'There are few options left before Friday.',
        why: 'Options is plural countable, so use "few", not "little".',
      },
    ],
    items: [
      {
        id: 'qnt-1',
        prompt: 'We only have ___ time before the live lesson starts, so let us focus on key points.',
        options: ['a few', 'a little', 'many'],
        answer: 'a little',
        explanation: 'Time is uncountable here; "a little" means a small positive amount.',
      },
      {
        id: 'qnt-2',
        prompt: 'The coordinator gave us several pieces of useful ___.',
        options: ['advices', 'advice', 'an advice'],
        answer: 'advice',
        explanation: 'Advice is uncountable and never takes a plural -s.',
      },
      {
        id: 'qnt-3',
        prompt: '___ residents attended the meeting, so the council postponed the vote.',
        options: ['Very few', 'Very little', 'Much'],
        answer: 'Very few',
        explanation: 'Residents is plural countable and the meaning is "hardly any".',
      },
      {
        id: 'qnt-4',
        prompt: 'There was not ___ evidence to support the headline.',
        options: ['many', 'enough', 'a few'],
        answer: 'enough',
        explanation: 'Enough works cleanly with uncountable nouns like evidence.',
      },
    ],
  },
  {
    slug: 'prepositions',
    title: 'Prepositions & dependent prepositions',
    errorCategories: ['preposition'],
    summary:
      'Fix high-frequency B1 preposition slips with time/place expressions and common verb/adjective pairings.',
    coreRules: [
      'Time: at + clock time/night; on + days/dates; in + months/years/periods.',
      'Learn verb + preposition as a chunk: depend on, focus on, insist on, apologise for, suffer from.',
      'Learn adjective + preposition chunks: responsible for, interested in, aware of, keen on.',
    ],
    contrastExamples: [
      {
        weak: 'Success depends of how regularly you practise.',
        strong: 'Success depends on how regularly you practise.',
        why: '"Depend" always pairs with "on", never "of".',
      },
      {
        weak: 'I am responsible of checking the final draft.',
        strong: 'I am responsible for checking the final draft.',
        why: '"Responsible" takes "for".',
      },
    ],
    items: [
      {
        id: 'prp-1',
        prompt: 'Our project team is responsible ___ updating the weekly brief.',
        options: ['of', 'for', 'to'],
        answer: 'for',
        explanation: 'The fixed collocation is "responsible for + noun / -ing".',
      },
      {
        id: 'prp-2',
        prompt: 'The speaking checkpoint takes place ___ Friday afternoon.',
        options: ['in', 'on', 'at'],
        answer: 'on',
        explanation: 'Parts of a specific day (Friday afternoon) take "on".',
      },
      {
        id: 'prp-3',
        prompt: 'Many commuters complain ___ overcrowded trains during peak hours.',
        options: ['about', 'of', 'for'],
        answer: 'about',
        explanation: '"Complain about" introduces the issue you are unhappy with.',
      },
      {
        id: 'prp-4',
        prompt: 'She insisted ___ checking every source before publishing.',
        options: ['to', 'on', 'for'],
        answer: 'on',
        explanation: '"Insist on + -ing" is the standard B2 verb pattern.',
      },
    ],
  },
  {
    slug: 'subject-verb-agreement',
    title: 'Subject–verb agreement',
    errorCategories: ['subject_verb_agreement'],
    summary:
      'Keep verb forms locked to the true head noun, especially with long noun phrases, indefinite pronouns, and "the number of".',
    coreRules: [
      'Indefinite pronouns (everyone, someone, nobody, each, neither) take a singular verb.',
      '"The number of + plural noun" takes a singular verb; "a number of + plural noun" takes a plural verb.',
      'Ignore intervening prepositional phrases when matching the subject to its verb.',
    ],
    contrastExamples: [
      {
        weak: 'The quality of these three recordings are impressive.',
        strong: 'The quality of these three recordings is impressive.',
        why: 'The head subject is singular ("quality"), not "recordings".',
      },
      {
        weak: 'Everyone in both groups have submitted their draft.',
        strong: 'Everyone in both groups has submitted their draft.',
        why: '"Everyone" always takes a singular verb ("has").',
      },
    ],
    items: [
      {
        id: 'sva-1',
        prompt: 'The main advantage of short daily sessions ___ steady recall.',
        options: ['is', 'are', 'were'],
        answer: 'is',
        explanation: 'The head noun "advantage" is singular.',
      },
      {
        id: 'sva-2',
        prompt: 'Nobody in the seminar ___ ready to skip the revision week.',
        options: ['look', 'looks', 'are looking'],
        answer: 'looks',
        explanation: '"Nobody" is grammatically singular.',
      },
      {
        id: 'sva-3',
        prompt: 'The number of participants joining online ___ grown since September.',
        options: ['have', 'has', 'are'],
        answer: 'has',
        explanation: '"The number of ..." takes a singular verb ("has").',
      },
      {
        id: 'sva-4',
        prompt: 'A number of practical examples ___ included in the handout.',
        options: ['was', 'is', 'were'],
        answer: 'were',
        explanation: '"A number of ..." means "several" and takes a plural verb.',
      },
    ],
  },
  {
    slug: 'verb-forms',
    title: 'Verb forms, auxiliaries & irregulars',
    errorCategories: ['verb_form', 'word_form'],
    summary:
      'Eliminate B1 form errors after modals, auxiliaries (did/have), and common gerund/infinitive complements.',
    coreRules: [
      'After modal verbs (can, should, must, might, would) and did/doesn’t, always use the bare infinitive.',
      'After prepositions (without, before, instead of, look forward to), always use the -ing form.',
      'Check irregular past participles after have/has/had and passive be (written, spoken, chosen, taken).',
    ],
    contrastExamples: [
      {
        weak: 'She did not went to the afternoon workshop.',
        strong: 'She did not go to the afternoon workshop.',
        why: 'After "did not", use the base verb "go".',
      },
      {
        weak: 'I look forward to hear from you soon.',
        strong: 'I look forward to hearing from you soon.',
        why: 'Here "to" is a preposition, so it must be followed by "-ing".',
      },
    ],
    items: [
      {
        id: 'vfm-1',
        prompt: 'He could ___ the instructions earlier if he had asked.',
        options: ['have checked', 'checked', 'checking'],
        answer: 'have checked',
        explanation: 'Modal + have + past participle expresses past possibility.',
      },
      {
        id: 'vfm-2',
        prompt: 'Instead of ___ immediately, she paused to organise her notes.',
        options: ['reply', 'to reply', 'replying'],
        answer: 'replying',
        explanation: 'Prepositions such as "instead of" take a verb in the -ing form.',
      },
      {
        id: 'vfm-3',
        prompt: 'Several key points were ___ clearly in the closing summary.',
        options: ['wrote', 'written', 'writing'],
        answer: 'written',
        explanation: 'Passive voice requires the past participle ("written").',
      },
      {
        id: 'vfm-4',
        prompt: 'Did the trainer ___ any extra reading for next Tuesday?',
        options: ['suggested', 'suggest', 'suggesting'],
        answer: 'suggest',
        explanation: 'Questions with "did" use the bare infinitive.',
      },
    ],
  },
  {
    slug: 'zero-second-conditionals',
    title: 'Zero & second conditionals',
    errorCategories: ['conditional', 'tense_aspect', 'verb_form'],
    summary:
      'Moved here from Week 2 review so Tuesday grammar focuses on intentions, arrangements, and future time clauses. Separate general truths (zero) from imagined situations and diplomatic advice (second).',
    coreRules: [
      'Zero conditional uses present simple + present simple for facts and habits that are always true (If you heat water to 100°C, it boils).',
      'Second conditional uses past simple + would + infinitive for unlikely or imagined present/future situations (If I had more time, I would learn design).',
      'Use "If I were you, I would..." as a polite, diplomatic way to offer advice.',
    ],
    contrastExamples: [
      {
        weak: 'If I would have more free evenings, I will join a choir.',
        strong: 'If I had more free evenings, I would join a choir.',
        why: 'Never put "would" inside the if-clause; use past simple in the condition and "would" in the result.',
      },
      {
        weak: 'If I am you, I ask the manager tomorrow.',
        strong: 'If I were you, I would ask the manager tomorrow.',
        why: 'Use "If I were you, I would..." for hypothetical advice.',
      },
    ],
    items: [
      {
        id: 'zsc-1',
        prompt: 'If you ___ the heating on overnight, the flat gets far too warm.',
        options: ['leave', 'left', 'would leave'],
        answer: 'leave',
        explanation: 'A general cause-and-effect habit takes the zero conditional (present simple + present simple).',
      },
      {
        id: 'zsc-2',
        prompt: 'If I had a shorter commute, I ___ more time to cook in the evenings.',
        options: ['have', 'will have', 'would have'],
        answer: 'would have',
        explanation: 'An imagined present situation takes past simple in the if-clause and "would" in the result.',
      },
      {
        id: 'zsc-3',
        prompt: 'Which sentence gives advice most diplomatically?',
        options: [
          'If I were you, I would check the contract before signing.',
          'If I am you, I check the contract before signing.',
          'If I would be you, I checked the contract.',
        ],
        answer: 'If I were you, I would check the contract before signing.',
        explanation: '"If I were you, I would..." is the standard polite second-conditional frame.',
      },
      {
        id: 'zsc-4',
        prompt: 'When the library ___ busy before exams, students usually book a quiet desk online.',
        options: ['gets', 'got', 'would get'],
        answer: 'gets',
        explanation: 'Zero conditional / general rule uses present simple in both clauses.',
      },
    ],
  },
  {
    slug: 'comparatives-superlatives',
    title: 'Comparatives & superlatives',
    errorCategories: ['comparison', 'adjective_adverb', 'word_form'],
    summary:
      'Moved here from Week 4 review so Week 4 focuses on present/past passives and visitor guides. Control short -er/-est forms, longer more/most forms, and equal comparisons.',
    coreRules: [
      'Short adjectives take -er / -est (quieter, the quietest); two-syllable -y adjectives change y to i (busier, the busiest).',
      'Longer adjectives take more / the most (more welcoming, the most memorable); never combine more + -er ("more easier").',
      'Use "as + adjective + as" for equal comparisons and "the + superlative + in + place" (not "of the city").',
    ],
    contrastExamples: [
      {
        weak: 'Taking the tram is more easier than driving in the centre.',
        strong: 'Taking the tram is much easier than driving in the centre.',
        why: 'Avoid double comparatives: "easy" becomes "easier", not "more easier".',
      },
      {
        weak: 'This is the oldest market of the town.',
        strong: 'This is the oldest market in the town.',
        why: 'Places after a superlative take "in", not "of".',
      },
    ],
    items: [
      {
        id: 'cmp-1',
        prompt: 'The riverside path is much ___ than the main shopping street on Saturdays.',
        options: ['quieter', 'more quieter', 'most quiet'],
        answer: 'quieter',
        explanation: '"Quiet" takes "-er" ("quieter"); never add "more" as well.',
      },
      {
        id: 'cmp-2',
        prompt: 'The historic market hall is the oldest public building ___ the town.',
        options: ['of', 'in', 'from'],
        answer: 'in',
        explanation: 'Use "in" (not "of") with places after a superlative.',
      },
      {
        id: 'cmp-3',
        prompt: 'The winter festival was not ___ crowded as the summer parade.',
        options: ['as', 'so much', 'more'],
        answer: 'as',
        explanation: 'Equal/unequal comparison with "not ... as" uses "not as + adjective + as".',
      },
      {
        id: 'cmp-4',
        prompt: 'Which comparison uses the irregular adverb form accurately?',
        options: [
          'Our second visit went far better than the first.',
          'Our second visit went more well than the first.',
          'Our second visit went gooder than the first.',
        ],
        answer: 'Our second visit went far better than the first.',
        explanation: 'The comparative of "well" (and "good") is "better".',
      },
    ],
  },
];

export function findClinicTopicsForErrors(categories: string[]): ClinicTopic[] {
  const set = new Set(categories.map((c) => c.toLowerCase()));
  return GRAMMAR_CLINIC_TOPICS.filter((topic) =>
    topic.errorCategories.some((cat) => set.has(cat)),
  );
}
