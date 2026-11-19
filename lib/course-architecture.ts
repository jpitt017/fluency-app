export type BlockType = 'pronunciation' | 'language' | 'listening' | 'speaking';

export interface BlockExercise {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface SessionBlockSpec {
  block_number: 1 | 2 | 3 | 4;
  window: string;
  start_minute: number;
  end_minute: number;
  block_type: BlockType;
  title: string;
  description: string;
  focus: string;
  procedure: string[];
  materials: string[];
  content: {
    text: string;
    key_points: string[];
    model_extract?: string;
    exercises: BlockExercise[];
  };
}

export interface CourseSessionSpec {
  id: string;
  session_number: number;
  module_number: number;
  module_session_number: 1 | 2 | 3 | 4;
  course_hour_end: number;
  unit_title: string;
  title: string;
  duration_minutes: 120;
  description: string;
  objectives: string;
  pronunciation_focus: string;
  grammar_lexis: string;
  listening_focus: string;
  speaking_pragmatics: string;
  homework: string;
  milestone?: string;
  blocks: SessionBlockSpec[];
}

export interface CourseModuleSpec {
  id: string;
  module_number: number;
  title: string;
  theme: string;
  core_focus: string;
  hours: 8;
  session_start: number;
  session_end: number;
  target_grammar: string[];
  target_vocabulary: string[];
  can_do_interaction: string;
  can_do_writing: string;
  can_do_listening: string;
  can_do_reading: string;
  can_do_production: string;
}

export interface CourseAssessmentSpec {
  id: string;
  sort_order: number;
  name: string;
  weight_percent: number;
  session_reference: string;
  description: string;
}

export const COURSE_ID = '11111111-1111-1111-1111-000000000001';

export const moduleUuid = (moduleNumber: number) =>
  `22222222-2222-2222-2222-${String(moduleNumber).padStart(12, '0')}`;

export const sessionUuid = (sessionNumber: number) =>
  `66666666-6666-4666-8666-${String(sessionNumber).padStart(12, '0')}`;

export const COURSE_OVERVIEW = {
  id: COURSE_ID,
  title: 'Global English Fluency: B1 → B2',
  subtitle: '64-Hour Upper-Intermediate Communication & Global Intelligibility Programme',
  entry_level: 'CEFR B1 (Independent)',
  exit_level: 'CEFR B2 (Upper-Intermediate)',
  total_hours: 64,
  total_sessions: 32,
  session_duration_minutes: 120,
  weeks: 16,
  hours_per_week: 4,
  standard_session_flow: [
    {
      block_number: 1 as const,
      window: '00–25 min',
      duration: '25 min',
      title: 'Global Intelligibility: Connected Speech & Prosody Lab',
      block_type: 'pronunciation' as const,
    },
    {
      block_number: 2 as const,
      window: '25–65 min',
      duration: '40 min',
      title: 'High-Frequency Global Lexis: Collocations & Functional Grammar',
      block_type: 'language' as const,
    },
    {
      block_number: 3 as const,
      window: '65–95 min',
      duration: '30 min',
      title: 'International Media & Multi-Accent Listening Comprehension',
      block_type: 'listening' as const,
    },
    {
      block_number: 4 as const,
      window: '95–120 min',
      duration: '25 min',
      title: 'Structured Debates, Case Studies & Cross-Cultural Speaking Tasks',
      block_type: 'speaking' as const,
    },
  ],
  b2_rubric_criteria: [
    {
      name: 'Fluency & Coherence',
      description:
        'Ability to speak at length with natural flow, linking ideas clearly and maintaining a coherent argument without excessive hesitation.',
    },
    {
      name: 'Lexical Resource',
      description:
        'Range and control of vocabulary, including collocations, idioms, and topic-specific lexis appropriate to B2 global communication.',
    },
    {
      name: 'Grammatical Range & Accuracy',
      description:
        'Range of structures and accuracy of control, including complex sentences, conditionals, modals, and reported speech.',
    },
    {
      name: 'Global Pronunciation / Prosody',
      description:
        'Intelligibility to international listeners: sentence stress, thought-group chunking, connected speech, weak forms, and intonation.',
    },
  ],
};

export const COURSE_ASSESSMENTS: CourseAssessmentSpec[] = [
  {
    id: '44444444-4444-4444-4444-000000000001',
    sort_order: 1,
    name: 'Active Participation & Weekly Audio Journals / Shadowing Logs',
    weight_percent: 25,
    session_reference: 'Ongoing (Sessions 1–32)',
    description:
      'Consistent engagement in debates and weekly audio journals or shadowing logs submitted across all 16 weeks.',
  },
  {
    id: '44444444-4444-4444-4444-000000000002',
    sort_order: 2,
    name: 'Mid-Course Cross-Cultural Negotiation & Diagnostic Check',
    weight_percent: 15,
    session_reference: 'Hour 32 (Session 16)',
    description:
      'Multi-party negotiation role-play followed by a 30-minute diagnostic speaking check evaluating B1+ progression.',
  },
  {
    id: '44444444-4444-4444-4444-000000000003',
    sort_order: 3,
    name: 'Final Multi-Accent Listening Assessment',
    weight_percent: 25,
    session_reference: 'Hour 62 (Session 31)',
    description:
      '45-minute comprehension exam of authentic global audio clips (podcasts, panel debates, news reports across multiple accents) without transcripts.',
  },
  {
    id: '44444444-4444-4444-4444-000000000004',
    sort_order: 4,
    name: 'Final B2 Global Speaking Capstone',
    weight_percent: 35,
    session_reference: 'Hours 63–64 (Session 32)',
    description:
      '20-minute paired capstone: (1) spontaneous networking & opinion exchange, (2) 2-minute monologue analyzing a global trend or dilemma, (3) collaborative cross-cultural problem-solving task.',
  },
];

export const COURSE_MODULES: CourseModuleSpec[] = [
  {
    id: moduleUuid(1),
    module_number: 1,
    title: 'Cross-Cultural Connections & Identity',
    theme: 'Cross-Cultural Connections & Identity',
    core_focus: 'Narrative tenses; word stress & rhythm; storytelling; intercultural small talk & rapport',
    hours: 8,
    session_start: 1,
    session_end: 4,
    target_grammar: ['Past continuous & past perfect', 'Used to / would for past habits', 'Idioms & phrasal verbs for adaptation'],
    target_vocabulary: ['roots, heritage, assimilate, perspective, turning point', "step out of one's comfort zone, broaden one's horizons, settle in, get the hang of"],
    can_do_interaction: 'Break the ice across cultures, navigate high-context vs. low-context styles, and build genuine rapport without relying on regional slang.',
    can_do_writing: 'Write a structured personal milestone narrative using narrative tenses and cultural adaptation lexis.',
    can_do_listening: 'Follow interviews with expatriates, digital nomads, and international students across varied global accents.',
    can_do_reading: 'Extract nuance and personal turning points from cross-cultural profiles and migration stories.',
    can_do_production: 'Deliver a clear, rhythmically chunked personal milestone story with natural sentence stress.',
  },
  {
    id: moduleUuid(2),
    module_number: 2,
    title: 'Technology, AI & Digital Society',
    theme: 'Technology, AI & Digital Society',
    core_focus: 'Passive voice & speculation modals; weak forms (/ə/); evaluating tech ethics & media literacy',
    hours: 8,
    session_start: 5,
    session_end: 8,
    target_grammar: ['Modals of deduction & speculation (must have, might be, could well lead to)', 'Passive voice across tenses for objective reporting'],
    target_vocabulary: ['automation, algorithmic bias, digital literacy, breakthrough', 'echo chamber, algorithm, screen fatigue, data privacy'],
    can_do_interaction: 'Debate which human skills remain irreplaceable in an AI-driven economy using speculation modals.',
    can_do_writing: 'Write an objective, passive-voiced summary evaluating technology ethics, privacy, and attention habits.',
    can_do_listening: 'Understand tech podcast excerpts and TED-style talks on digital minimalism and online communities.',
    can_do_reading: 'Critically evaluate articles on algorithmic bias, automation, and digital wellbeing.',
    can_do_production: 'Present reasoned arguments about AI breakthroughs while reducing function words with the schwa (/ə/).',
  },
  {
    id: moduleUuid(3),
    module_number: 3,
    title: 'Climate, Sustainability & Urban Futures',
    theme: 'Climate, Sustainability & Urban Futures',
    core_focus: 'Future perfect/continuous & conditionals; linking & elision; pitching green solutions',
    hours: 8,
    session_start: 9,
    session_end: 12,
    target_grammar: ['Future continuous & future perfect (By 2040, cities will have transitioned...)', 'Zero, first, second, third & mixed conditionals'],
    target_vocabulary: ['carbon footprint, circular economy, renewable grid, greenwashing', 'urban resilience, low-emission zone, retrofitting'],
    can_do_interaction: 'Evaluate urban sustainability initiatives (Copenhagen, Singapore, Medellín, Barcelona) and defend a green city proposal in Q&A.',
    can_do_writing: 'Write a concise green city policy proposal using future perfect milestones and conditional outcomes.',
    can_do_listening: 'Follow urban planning briefings and environmental policy discussions at natural connected-speech pace.',
    can_do_reading: 'Synthesize comparative case studies on urban sustainability and climate policy.',
    can_do_production: 'Deliver a 3-minute collaborative green city pitch using natural catenation and /t/-/d/ elision.',
  },
  {
    id: moduleUuid(4),
    module_number: 4,
    title: 'Global Work, Leadership & Remote Teams',
    theme: 'Global Work, Leadership & Remote Teams',
    core_focus: 'Diplomatic modals & indirect questions; intonation for politeness; cross-cultural negotiations',
    hours: 8,
    session_start: 13,
    session_end: 16,
    target_grammar: ['Indirect questions (I was wondering if we might...)', 'Diplomatic hedging (To some extent, I agree, however...)'],
    target_vocabulary: ['delegate, streamline, touch base, follow up on, align on, bottleneck', 'direct vs. indirect feedback, consensus, trade-off'],
    can_do_interaction: 'Conduct multi-party cross-cultural negotiations and soften requests or feedback using fall-rise intonation.',
    can_do_writing: 'Draft diplomatic international workplace messages aligning remote teams and resolving bottlenecks.',
    can_do_listening: 'Recognize direct (Dutch/German) vs. indirect (East Asian/British) pragmatic cues in workplace dialogues.',
    can_do_reading: 'Analyze cross-cultural workplace case studies and negotiation briefs.',
    can_do_production: 'Complete the Hour 32 mid-course diagnostic speaking check with clear diplomatic prosody.',
  },
  {
    id: moduleUuid(5),
    module_number: 5,
    title: 'Health, Psychology & Modern Lifestyles',
    theme: 'Health, Psychology & Modern Lifestyles',
    core_focus: 'Gerunds/infinitives & reporting verbs; thought-group pausing; discussing wellbeing & habits',
    hours: 8,
    session_start: 17,
    session_end: 20,
    target_grammar: ['Gerunds vs. infinitives after complex verbs (regret, stop, remember, go on)', 'Reporting verbs (demonstrate, urge, warn against, attribute to)'],
    target_vocabulary: ['resilience, burnout, mindfulness, cognitive load', 'hygge, ikigai, right-to-disconnect, Blue Zones, longevity'],
    can_do_interaction: 'Compare global work-life balance models and use rising vs. falling question tags accurately.',
    can_do_writing: 'Summarize scientific findings on public health and longevity using accurate reporting verbs.',
    can_do_listening: 'Follow global health documentaries and expert panel discussions on preventative wellbeing.',
    can_do_reading: 'Interpret research summaries on burnout, cognitive load, and 4-day workweek trials.',
    can_do_production: 'Discuss lifestyle habits and psychological resilience with deliberate thought-group pausing.',
  },
  {
    id: moduleUuid(6),
    module_number: 6,
    title: 'Media, Misinformation & Global Culture',
    theme: 'Media, Misinformation & Global Culture',
    core_focus: 'Reported speech & cleft sentences; decoding international English accents; critical analysis',
    hours: 8,
    session_start: 21,
    session_end: 24,
    target_grammar: ['Reported speech with tense backshifting & distancing (allegedly, reportedly)', 'Cleft sentences (What concerns experts most is... / It wasn\'t X that..., it was...)'],
    target_vocabulary: ['sensationalism, bias, fact-checking, viral', 'framing, media literacy, World Englishes, cultural preservation'],
    can_do_interaction: 'Compare framing and bias across competing news reports and debate cultural globalization vs. local preservation.',
    can_do_writing: 'Write a critical media analysis using reported speech, distancing adverbs, and cleft emphasis.',
    can_do_listening: 'Decode North American, British/Irish, Australian/NZ, Indian, and proficient European/Asian English speakers.',
    can_do_reading: 'Identify sensationalism, unverified claims, and ideological framing in news articles.',
    can_do_production: 'Use contrastive stress in cleft sentences to highlight key evidence clearly.',
  },
  {
    id: moduleUuid(7),
    module_number: 7,
    title: 'Economics, Innovation & Social Change',
    theme: 'Economics, Innovation & Social Change',
    core_focus: 'Relative clauses & cause/effect connectors; stress-timing; debating inequality & global trade',
    hours: 8,
    session_start: 25,
    session_end: 28,
    target_grammar: ['Defining & non-defining relative clauses', 'Advanced discourse markers (nonetheless, conversely, owing to, in light of)'],
    target_vocabulary: ['supply chain, fair trade, social enterprise, grassroots, disparity', 'CSR, ethical consumerism, signposting, rhetorical question'],
    can_do_interaction: 'Evaluate CSR and fair-trade case studies and debate inequality with nuanced concessions.',
    can_do_writing: 'Compose a structured persuasive argument connecting economic causes and social impacts.',
    can_do_listening: 'Track multi-clause economic arguments and keynote speeches with complex signposting.',
    can_do_reading: 'Analyze social enterprise and global supply-chain case studies.',
    can_do_production: 'Deliver a structured 3-minute persuasive talk maintaining steady stress-timed rhythm.',
  },
  {
    id: moduleUuid(8),
    module_number: 8,
    title: 'Fluency Synthesis & B2 Global Capstone',
    theme: 'Fluency Synthesis & B2 Global Capstone',
    core_focus: 'Integrated B2+ idioms & hedging; shadowing mastery; final multi-accent & speaking assessment',
    hours: 8,
    session_start: 29,
    session_end: 32,
    target_grammar: ['Cumulative B2 grammar synthesis', 'Hedging devices & nuanced qualification'],
    target_vocabulary: ['High-utility global idioms', 'Keynote shadowing prosody & B2→C1 transition phrases'],
    can_do_interaction: 'Complete spontaneous networking and collaborative cross-cultural problem-solving under B2 Capstone conditions.',
    can_do_writing: 'Produce a cohesive B2 synthesis reflection and personalized C1 study roadmap.',
    can_do_listening: 'Pass the 45-minute Hour 62 Multi-Accent Listening Exam across podcasts, panels, and news without transcripts.',
    can_do_reading: 'Synthesize cross-disciplinary global trend briefs for rapid speaking preparation.',
    can_do_production: 'Deliver an uninterrupted 2-minute analytical monologue with natural shadowing-honed prosody.',
  },
];

interface RawSessionSeed {
  session_number: number;
  module_number: number;
  module_session_number: 1 | 2 | 3 | 4;
  unit_title: string;
  title: string;
  milestone?: string;
  pronunciation_focus: string;
  pronunciation_extract: string;
  pronunciation_points: string[];
  pronunciation_q: BlockExercise[];
  grammar_lexis: string;
  language_points: string[];
  language_q: BlockExercise[];
  listening_focus: string;
  listening_extract: string;
  listening_points: string[];
  listening_q: BlockExercise[];
  speaking_pragmatics: string;
  speaking_points: string[];
  speaking_q: BlockExercise[];
  objectives: string;
  homework: string;
}

const RAW_SESSIONS: RawSessionSeed[] = [
  // MODULE 1: Cross-Cultural Connections & Identity (Sessions 1-4)
  {
    session_number: 1,
    module_number: 1,
    module_session_number: 1,
    unit_title: 'Global Identities & Personal Milestones',
    title: 'Global Identities & Cultural Roots',
    pronunciation_focus: 'Sentence stress and thought-group chunking for clear international intelligibility.',
    pronunciation_extract: 'When I moved abroad / for the very first time, / my whole perspective / began to shift.',
    pronunciation_points: [
      'Pause briefly at natural clause boundaries (thought groups).',
      'Stress content words (nouns, main verbs, adjectives) while keeping grammar words light.',
    ],
    pronunciation_q: [
      {
        question: 'In "When I moved abroad / for the very first time", which words carry primary sentence stress?',
        options: ['When, I, for, the', 'moved, abroad, very, first, time', 'I, for, time', 'When, the, first'],
        answer: 'moved, abroad, very, first, time',
        explanation: 'Content words carry nuclear and secondary stress, while function words stay unstressed.',
      },
      {
        question: 'Why does thought-group chunking improve international intelligibility?',
        options: [
          'It forces listeners to translate word by word.',
          'It breaks complex ideas into digestible rhythmic units with clear pauses.',
          'It removes all pauses from spoken English.',
        ],
        answer: 'It breaks complex ideas into digestible rhythmic units with clear pauses.',
        explanation: 'Chunking gives global listeners processing time between meaning units.',
      },
    ],
    grammar_lexis: 'Narrative tenses (past continuous, past perfect, used to / would); cultural identity lexis: roots, heritage, assimilate, perspective, turning point.',
    language_points: [
      'Use past perfect ("had never lived abroad") to anchor events prior to a main past milestone.',
      'Contrast "used to" (past states/habits) with "would" (repeated past actions only).',
    ],
    language_q: [
      {
        question: 'Which sentence correctly uses the past perfect for an earlier background event?',
        options: [
          'Before I moved to Lisbon, I never tasted pastéis de nata.',
          'Before I moved to Lisbon, I had never lived outside my hometown.',
          'Before I had moved to Lisbon, I was never living abroad.',
        ],
        answer: 'Before I moved to Lisbon, I had never lived outside my hometown.',
        explanation: 'Past perfect ("had never lived") marks the experience preceding the move ("moved").',
      },
      {
        question: 'Which word best fits: "Reconnecting with her family ___ gave her a deeper sense of belonging"?',
        options: ['heritage', 'assimilate', 'perspective', 'milestone'],
        answer: 'heritage',
        explanation: 'Heritage refers to cultural traditions, ancestry, and family background.',
      },
    ],
    listening_focus: 'Personal narratives from multilingual speakers reflecting on heritage and identity.',
    listening_extract: '"Growing up between two languages meant I used to switch accents depending on who was at the dinner table. The real turning point came when I realized my mixed heritage wasn\'t a barrier—it was a bridge."',
    listening_points: [
      'Track timeline shifts signaled by narrative tenses.',
      'Notice how speakers mark a "turning point" with slower tempo and extra vocal stress.',
    ],
    listening_q: [
      {
        question: 'How did the speaker view their mixed heritage after the turning point?',
        options: ['As a barrier to fitting in', 'As a bridge connecting different worlds', 'As something to hide at work'],
        answer: 'As a bridge connecting different worlds',
        explanation: 'The speaker explicitly reframes mixed heritage from a barrier into a bridge.',
      },
      {
        question: 'What does "used to switch accents" indicate here?',
        options: ['A one-time event', 'A repeated past habit that changed', 'A future intention'],
        answer: 'A repeated past habit that changed',
        explanation: '"Used to" expresses past habits or routines.',
      },
    ],
    speaking_pragmatics: 'Sharing personal milestone stories across cultures without relying on regional slang.',
    speaking_points: [
      'Set the scene (past continuous) → introduce the turning point (past simple) → reflect on the shift in perspective.',
      'Choose globally transparent phrasing instead of local idioms.',
    ],
    speaking_q: [
      {
        question: 'Which opening best sets the scene for a cross-cultural milestone story?',
        options: [
          'I was studying in Madrid when a chance conversation completely changed my career plans.',
          'I study in Madrid and it was dead good, innit.',
          'Career plans changed by Madrid.',
        ],
        answer: 'I was studying in Madrid when a chance conversation completely changed my career plans.',
        explanation: 'Past continuous + past simple is clear, vivid, and globally intelligible.',
      },
      {
        question: 'When speaking to an international audience, what should you avoid?',
        options: ['Thought-group pauses', 'Opaque regional slang', 'Clear timeline markers'],
        answer: 'Opaque regional slang',
        explanation: 'Global English prioritizes clarity across diverse linguistic backgrounds.',
      },
    ],
    objectives: 'Use narrative tenses accurately and chunk sentences into clear thought groups when describing cultural roots.',
    homework: 'Record a 90-second audio journal about a personal turning point, marking thought-group slashes (/) in a short self-transcript.',
  },
  {
    session_number: 2,
    module_number: 1,
    module_session_number: 2,
    unit_title: 'Global Identities & Personal Milestones',
    title: 'Personal Milestones & Intercultural Rapport',
    pronunciation_focus: 'Word stress, contrastive emphasis, and rhythmic pacing in storytelling.',
    pronunciation_extract: 'It wasn\'t just the language / that surprised me — / it was how people / built trust.',
    pronunciation_points: [
      'Place extra pitch height on contrasting ideas ("language" vs. "trust").',
      'Maintain steady rhythmic beats across stressed syllables.',
    ],
    pronunciation_q: [
      {
        question: 'In "It wasn\'t just the LANGUAGE, it was how people built TRUST", why are "language" and "trust" emphasized?',
        options: ['To show contrastive emphasis between two ideas', 'Because they are function words', 'To speak faster'],
        answer: 'To show contrastive emphasis between two ideas',
        explanation: 'Contrastive stress directs the listener to the key comparison.',
      },
      {
        question: 'Which word has stress on the second syllable?',
        options: ['heritage', 'perspective', 'culture'],
        answer: 'perspective',
        explanation: 'per-SPEC-tive has primary stress on the second syllable.',
      },
    ],
    grammar_lexis: 'Combining past simple, past continuous, and past perfect; intercultural lexis: assimilate, perspective, rapport, high-context, low-context.',
    language_points: [
      'High-context communication relies heavily on shared context, silence, and implied meaning.',
      'Low-context communication values explicit, direct verbal explanation.',
    ],
    language_q: [
      {
        question: 'Which describes a low-context communication preference?',
        options: [
          'Expecting listeners to read between the lines',
          'Stating expectations explicitly and directly in words',
          'Avoiding written follow-ups',
        ],
        answer: 'Stating expectations explicitly and directly in words',
        explanation: 'Low-context styles prioritize explicit verbal clarity.',
      },
      {
        question: 'Choose the most accurate verb: "It took six months to ___ into the new neighbourhood without losing my own traditions."',
        options: ['assimilate', 'perspective', 'heritage'],
        answer: 'assimilate',
        explanation: '"Assimilate" means to integrate into a wider society or culture.',
      },
    ],
    listening_focus: 'Cross-cultural small-talk dialogues comparing high-context and low-context rapport building.',
    listening_extract: '"In my first international team, I kept waiting for explicit praise. Later I realized my colleague\'s quiet follow-up questions were actually her way of showing deep engagement and respect."',
    listening_points: [
      'Identify pragmatic misunderstandings caused by differing rapport norms.',
      'Notice open-ended rapport questions ("What brought you to...?", "How have you found...?").',
    ],
    listening_q: [
      {
        question: 'What did the speaker eventually realize about her colleague\'s follow-up questions?',
        options: [
          'They signaled impatience',
          'They were a way of showing engagement and respect',
          'They meant the project was cancelled',
        ],
        answer: 'They were a way of showing engagement and respect',
        explanation: 'Different cultures express engagement through different conversational signals.',
      },
      {
        question: 'Which question builds genuine intercultural rapport without slang?',
        options: [
          'What sparked your interest in working internationally?',
          'What\'s the craic with your gig?',
          'Do you make good money here?',
        ],
        answer: 'What sparked your interest in working internationally?',
        explanation: 'Open, respectful, slang-free questions invite genuine conversation.',
      },
    ],
    speaking_pragmatics: 'Breaking the ice across cultures—comparing high-context vs. low-context styles and building rapport.',
    speaking_points: [
      'Use open-ended curiosity prompts and active summarizing ("So it sounds like...").',
      'Adapt directness smoothly depending on your conversation partner.',
    ],
    speaking_q: [
      {
        question: 'Which phrase demonstrates active listening in intercultural small talk?',
        options: [
          'So it sounds like moving cities was a real turning point for you.',
          'Anyway, let me talk about myself now.',
          'That is totally irrelevant.',
        ],
        answer: 'So it sounds like moving cities was a real turning point for you.',
        explanation: 'Paraphrasing confirms understanding and builds warmth.',
      },
      {
        question: 'Why avoid heavy regional slang during an initial cross-cultural icebreaker?',
        options: [
          'It can exclude international speakers who have learned global English.',
          'It is grammatically illegal.',
          'It makes sentences too short.',
        ],
        answer: 'It can exclude international speakers who have learned global English.',
        explanation: 'Shared intelligibility builds trust faster than insider slang.',
      },
    ],
    objectives: 'Compare high-context and low-context communication styles and sustain natural rapport in intercultural small talk.',
    homework: 'Write a 150-word reflection comparing a high-context and low-context interaction you have experienced or observed.',
  },
  {
    session_number: 3,
    module_number: 1,
    module_session_number: 3,
    unit_title: 'Travel, Adaptation & Culture Shock',
    title: 'Travel & Consonant Cluster Clarity',
    pronunciation_focus: 'Vowel clarity and eliminating intrusive syllable additions in consonant clusters.',
    pronunciation_extract: 'Stepping out of my comfort zone / helped me settle in / and get the hang of / strict schedules.',
    pronunciation_points: [
      'Avoid adding an extra vowel before initial clusters like /st/, /sp/, /sk/ (e.g., "es-step" → "step").',
      'Keep final clusters crisp without dropping meaning-carrying endings (-ed, -ts, -ks).',
    ],
    pronunciation_q: [
      {
        question: 'What is an "intrusive syllable addition" in English consonant clusters?',
        options: [
          'Inserting an extra vowel sound such as "e-speak" instead of "speak"',
          'Linking a final consonant to the next vowel',
          'Speaking more quietly at the end of a phrase',
        ],
        answer: 'Inserting an extra vowel sound such as "e-speak" instead of "speak"',
        explanation: 'Epenthetic vowels add an unintended syllable before clusters like /sp/ or /st/.',
      },
      {
        question: 'Which word begins with a 3-consonant cluster?',
        options: ['street', 'travel', 'adapt'],
        answer: 'street',
        explanation: '"street" begins with /str-/.',
      },
    ],
    grammar_lexis: 'Idioms and phrasal verbs for adaptation: step out of one\'s comfort zone, broaden one\'s horizons, settle in, get the hang of.',
    language_points: [
      '"Settle in" = feel comfortable and established in a new place or job.',
      '"Get the hang of something" = learn how to do something smoothly after practice.',
    ],
    language_q: [
      {
        question: 'Complete the sentence: "At first the metro map looked confusing, but I soon ___ it."',
        options: ['got the hang of', 'broadened my horizons', 'assimilated'],
        answer: 'got the hang of',
        explanation: '"Get the hang of" means to become familiar and skilled with something.',
      },
      {
        question: 'Which idiom means expanding your worldview through new experiences?',
        options: ["broaden one's horizons", 'settle down', 'burn out'],
        answer: "broaden one's horizons",
        explanation: 'Travel and cultural exchange broaden one\'s horizons.',
      },
    ],
    listening_focus: 'Short travel anecdotes from international students navigating new cities and routines.',
    listening_extract: '"The first fortnight felt overwhelming—even buying groceries seemed like a puzzle. Once I stopped translating every sign and started asking neighbours for tips, I finally began to settle in."',
    listening_points: [
      'Listen for time transitions ("the first fortnight" → "once I stopped...").',
      'Spot adaptation collocations in context.',
    ],
    listening_q: [
      {
        question: 'What helped the student start settling in?',
        options: [
          'Translating every single sign word-for-word',
          'Asking neighbours for practical local tips',
          'Staying indoors for a month',
        ],
        answer: 'Asking neighbours for practical local tips',
        explanation: 'Local interaction eased the transition.',
      },
      {
        question: 'What does "fortnight" mean in international/British English?',
        options: ['Four nights', 'Two weeks (14 days)', 'A month'],
        answer: 'Two weeks (14 days)',
        explanation: 'A fortnight is fourteen nights / two weeks.',
      },
    ],
    speaking_pragmatics: 'Describing travel challenges and practical adaptation strategies clearly.',
    speaking_points: [
      'Use clear problem → adjustment → takeaway structure.',
      'Monitor initial /s/+consonant clusters in key words like "strategy", "schedule", "stress".',
    ],
    speaking_q: [
      {
        question: 'Which response best uses adaptation lexis?',
        options: [
          'Working abroad forced me to step out of my comfort zone, which broadened my horizons.',
          'Working abroad was very zone and horizon.',
          'I went out comfort and got hang.',
        ],
        answer: 'Working abroad forced me to step out of my comfort zone, which broadened my horizons.',
        explanation: 'Both idioms are used naturally and accurately.',
      },
      {
        question: 'Which structure works best for a 60-second travel reflection?',
        options: ['Challenge → strategy → lesson learned', 'Random list of dates', 'Single-word answers'],
        answer: 'Challenge → strategy → lesson learned',
        explanation: 'Structured narratives keep listeners engaged.',
      },
    ],
    objectives: 'Eliminate intrusive vowel additions in consonant clusters and use core adaptation idioms accurately.',
    homework: 'Shadow a 45-second travel clip focusing on /st/, /sp/, and /str/ clusters and submit a 60-second clean take.',
  },
  {
    session_number: 4,
    module_number: 1,
    module_session_number: 4,
    unit_title: 'Travel, Adaptation & Culture Shock',
    title: 'Adaptation, Culture Shock & Expat Stories',
    milestone: 'Module 1 Synthesis',
    pronunciation_focus: 'Consolidating vowel clarity, cluster accuracy, and narrative thought groups.',
    pronunciation_extract: 'Culture shock isn\'t a failure / to adapt; / it\'s simply a natural phase / of transition.',
    pronunciation_points: [
      'Keep lax /ɪ/ vs. tense /iː/ distinct ("live" vs. "leave", "sit" vs. "seat").',
      'Deliver multi-clause reflections smoothly without mid-phrase stumbles.',
    ],
    pronunciation_q: [
      {
        question: 'Why does /ɪ/ vs. /iː/ clarity matter in global communication?',
        options: [
          'It prevents confusion between minimal pairs like "live/leave" and "ship/sheep".',
          'It changes past tense into future tense.',
          'It is only used in poetry.',
        ],
        answer: 'It prevents confusion between minimal pairs like "live/leave" and "ship/sheep".',
        explanation: 'Vowel contrast preserves lexical precision across accents.',
      },
      {
        question: 'Where should the main pause fall in "Culture shock isn\'t a failure to adapt; it\'s a natural phase"?',
        options: ['After "adapt"', 'After "Culture"', 'After "a"'],
        answer: 'After "adapt"',
        explanation: 'The semicolon marks a major clause boundary.',
      },
    ],
    grammar_lexis: 'Integrated narrative tenses + adaptation idioms & phrasal verbs (settle in, get the hang of, step out of one\'s comfort zone).',
    language_points: [
      'Distinguish the honeymoon, frustration, adjustment, and acceptance stages of culture shock.',
      'Combine narrative tenses to contrast initial expectations with reality.',
    ],
    language_q: [
      {
        question: 'Which sentence combines narrative tenses accurately?',
        options: [
          'By the time I got the hang of local etiquette, I had already been living there for four months.',
          'By the time I got the hang of local etiquette, I live there four months.',
          'I was get the hang of local etiquette after four months.',
        ],
        answer: 'By the time I got the hang of local etiquette, I had already been living there for four months.',
        explanation: 'Past perfect continuous highlights duration leading up to a past milestone.',
      },
      {
        question: 'What does "culture shock" refer to?',
        options: [
          'Disorientation experienced when encountering an unfamiliar way of life',
          'A bad flight connection',
          'An electrical fault in a hotel',
        ],
        answer: 'Disorientation experienced when encountering an unfamiliar way of life',
        explanation: 'Culture shock is the normal psychological response to unfamiliar cultural norms.',
      },
    ],
    listening_focus: 'Interviews with expatriates, digital nomads, and international students from diverse backgrounds.',
    listening_extract: '"People assume digital nomads live on permanent holiday, whereas in reality you\'re constantly rebuilding routines—finding reliable Wi-Fi, navigating local customs, and managing time-zone fatigue."',
    listening_points: [
      'Compare contrasting viewpoints across three interviewees (expat engineer, digital nomad, exchange student).',
      'Note discourse markers of contrast ("whereas", "in reality").',
    ],
    listening_q: [
      {
        question: 'According to the digital nomad, what is the reality behind the lifestyle?',
        options: [
          'A permanent holiday with no deadlines',
          'Constantly rebuilding routines and handling time-zone fatigue',
          'Never needing to speak to locals',
        ],
        answer: 'Constantly rebuilding routines and handling time-zone fatigue',
        explanation: 'The speaker contrasts the stereotype with practical daily demands.',
      },
      {
        question: 'Which connector introduces the contrast in the extract?',
        options: ['whereas', 'therefore', 'furthermore'],
        answer: 'whereas',
        explanation: '"Whereas" explicitly contrasts two ideas.',
      },
    ],
    speaking_pragmatics: 'Cross-cultural advice clinic: interviewing peers and recommending realistic adaptation strategies.',
    speaking_points: [
      'Ask empathetic follow-ups and give concrete, culturally aware recommendations.',
      'Synthesize Module 1 narrative tenses and idioms in a 2-minute spoken checkpoint.',
    ],
    speaking_q: [
      {
        question: 'Which follow-up best explores an interviewee\'s adaptation process?',
        options: [
          'What was the hardest habit to get the hang of during your first month?',
          'Did you like the weather yes or no?',
          'Why didn\'t you stay home?',
        ],
        answer: 'What was the hardest habit to get the hang of during your first month?',
        explanation: 'Open questions elicit rich narrative detail.',
      },
      {
        question: 'Which Module 1 skills should appear in your end-of-module checkpoint?',
        options: [
          'Narrative tenses, adaptation idioms, and clear thought-group chunking',
          'Passive voice and future perfect only',
          'Single-word answers without pauses',
        ],
        answer: 'Narrative tenses, adaptation idioms, and clear thought-group chunking',
        explanation: 'Module 1 integrates all three pillars.',
      },
    ],
    objectives: 'Synthesize Module 1 narrative tenses, adaptation lexis, and vowel/cluster clarity in an unscripted expat interview.',
    homework: 'Submit your Module 1 Audio Journal (2 minutes): interview summary or personal story of stepping out of your comfort zone.',
  },

  // MODULE 2: Technology, AI & Digital Society (Sessions 5-8)
  {
    session_number: 5,
    module_number: 2,
    module_session_number: 1,
    unit_title: 'Artificial Intelligence & The Future of Work',
    title: 'Artificial Intelligence & Weak Forms (/ə/)',
    pronunciation_focus: 'Weak forms and the schwa (/ə/)—reducing function words (can, have, to, for, of) so key content words stand out in fast speech.',
    pronunciation_extract: 'AI can (/kən/) automate routine tasks, / but humans have (/həv/) to (/tə/) focus on empathy and judgment.',
    pronunciation_points: [
      'Pronounce unstressed "can" as /kən/, "to" as /tə/, "for" as /fə(r)/, and "of" as /əv/.',
      'Use full strong forms only at the end of a clause or for explicit contrast ("Yes, it CAN").',
    ],
    pronunciation_q: [
      {
        question: 'In connected speech, how is "to" normally pronounced in "need to adapt"?',
        options: ['/tuː/ with full length', '/tə/ using the schwa', '/tɔː/'],
        answer: '/tə/ using the schwa',
        explanation: 'Unstressed function words reduce to /ə/ so content words pop out.',
      },
      {
        question: 'When does "can" keep its strong vowel /kæn/?',
        options: [
          'When it is stressed for contrast or at the end of a short answer ("Yes, we can.")',
          'Before every verb in every sentence',
          'Never in English',
        ],
        answer: 'When it is stressed for contrast or at the end of a short answer ("Yes, we can.")',
        explanation: 'Final or contrastive auxiliaries take strong forms.',
      },
    ],
    grammar_lexis: 'Tech collocations (automation, algorithmic bias, digital literacy, breakthrough) & intro to speculation modals.',
    language_points: [
      'Combine collocations naturally: "pose algorithmic bias", "achieve a breakthrough", "require digital literacy".',
      'Use "could well lead to" for strong, reasoned probability.',
    ],
    language_q: [
      {
        question: 'Which collocation describes unfair patterns embedded in automated decision systems?',
        options: ['algorithmic bias', 'screen fatigue', 'digital minimalism'],
        answer: 'algorithmic bias',
        explanation: 'Algorithmic bias refers to skewed outcomes produced by biased training data or design.',
      },
      {
        question: 'Which modal phrase expresses strong likelihood about future tech trends?',
        options: ['could well lead to', 'must have been yesterday', 'used to lead'],
        answer: 'could well lead to',
        explanation: '"Could well" upgrades possibility to strong likelihood.',
      },
    ],
    listening_focus: 'Short tech briefings explaining AI breakthroughs and workplace automation.',
    listening_extract: '"Advances in generative models could well lead to faster diagnostics, yet without strong digital literacy, teams risk trusting flawed outputs blindly."',
    listening_points: [
      'Catch reduced function words (/kən/, /tə/, /əv/) inside rapid tech commentary.',
      'Separate factual claims from modal speculation.',
    ],
    listening_q: [
      {
        question: 'What risk does the speaker highlight alongside faster AI diagnostics?',
        options: [
          'Teams trusting flawed outputs without digital literacy',
          'Electricity becoming completely free',
          'Doctors forgetting how to read',
        ],
        answer: 'Teams trusting flawed outputs without digital literacy',
        explanation: 'Digital literacy is needed to audit AI outputs.',
      },
      {
        question: 'Which weak form appears in "Advances in generative models"?',
        options: ['Unstressed "in" and reduced second/third syllables', 'Stressed "in"', 'Silent "models"'],
        answer: 'Unstressed "in" and reduced second/third syllables',
        explanation: 'Content words "advances" and "models" carry the rhythmic beats.',
      },
    ],
    speaking_pragmatics: 'Framing balanced tech evaluations using speculation modals rather than extreme absolutes.',
    speaking_points: [
      'Qualify predictions with "might be", "could well lead to", and "is likely to".',
      'Keep function words light so key technical terms land clearly.',
    ],
    speaking_q: [
      {
        question: 'Which statement sounds most balanced and B2-appropriate?',
        options: [
          'Automation could well reshape entry-level roles, though new oversight jobs might emerge.',
          'AI will 100% destroy every job tomorrow.',
          'Automation maybe good maybe bad.',
        ],
        answer: 'Automation could well reshape entry-level roles, though new oversight jobs might emerge.',
        explanation: 'Nuanced modal hedging signals B2 academic/professional register.',
      },
      {
        question: 'Why are weak forms essential when discussing complex tech topics?',
        options: [
          'They create rhythm and highlight the important content words.',
          'They eliminate all nouns.',
          'They make speech sound robotic.',
        ],
        answer: 'They create rhythm and highlight the important content words.',
        explanation: 'Contrast between weak function words and stressed content words guides listener attention.',
      },
    ],
    objectives: 'Reduce unstressed function words with /ə/ and deploy core AI/workplace collocations accurately.',
    homework: 'Practice reading a 100-word AI news paragraph aloud, circling every schwa (/ə/) reduction, and record one shadowing take.',
  },
  {
    session_number: 6,
    module_number: 2,
    module_session_number: 2,
    unit_title: 'Artificial Intelligence & The Future of Work',
    title: 'The Future of Work & Tech Speculation',
    pronunciation_focus: 'Weak forms in modal chains ("must have been", "might have led to", "could well be").',
    pronunciation_extract: 'They must have (/məstəv/) tested the model / before launching it globally.',
    pronunciation_points: [
      'Blend modal + "have" smoothly as /məstəv/ or /maɪtəv/ (never "must of" in writing!).',
      'Stress the lexical verb ("tested", "launching") rather than the auxiliary.',
    ],
    pronunciation_q: [
      {
        question: 'How is "must have" typically reduced in natural connected speech?',
        options: ['/məstəv/', '/mʌst hæv/ with a long pause', '/mʊst hɒv/'],
        answer: '/məstəv/',
        explanation: 'The auxiliary "have" weakens to /əv/ after modals.',
      },
      {
        question: 'Which written form is grammatically correct?',
        options: ['It must have been automated.', 'It must of been automated.', 'It must has been automated.'],
        answer: 'It must have been automated.',
        explanation: '"Have" reduces in speech to /əv/, which is spelled "have" in writing.',
      },
    ],
    grammar_lexis: 'Modals of deduction and speculation (must have, might be, could well lead to) with workplace technology vocabulary.',
    language_points: [
      'Past deduction: "must have + past participle" (near certainty) vs. "might/could have + pp" (possibility).',
      'Future/present speculation: "might be + -ing" or "could well lead to + noun".',
    ],
    language_q: [
      {
        question: 'Which sentence expresses strong past deduction based on evidence?',
        options: [
          'The hiring algorithm must have absorbed historical bias from past CVs.',
          'The hiring algorithm might absorb bias tomorrow.',
          'The hiring algorithm can absorbed bias.',
        ],
        answer: 'The hiring algorithm must have absorbed historical bias from past CVs.',
        explanation: '"Must have + past participle" expresses logical deduction about the past.',
      },
      {
        question: 'Which skill is most clearly framed as "irreplaceable" by human empathy?',
        options: [
          'Negotiating sensitive workplace conflicts with emotional intelligence',
          'Sorting identical spreadsheets by date',
          'Checking spelling in short memos',
        ],
        answer: 'Negotiating sensitive workplace conflicts with emotional intelligence',
        explanation: 'High-empathy interpersonal judgment remains uniquely human.',
      },
    ],
    listening_focus: 'Panel discussion on human-AI collaboration and skills that remain irreplaceable.',
    listening_extract: '"When the system flagged forty candidates unfairly, engineers realized the training set must have reflected older hiring patterns. Empathy and ethical judgment remain irreplaceable."',
    listening_points: [
      'Distinguish evidence-based deduction ("must have") from open speculation ("might").',
      'Note turn-taking phrases in a group panel.',
    ],
    listening_q: [
      {
        question: 'Why did the engineers conclude the training set reflected older patterns?',
        options: [
          'Because the system flagged forty candidates unfairly',
          'Because the office Wi-Fi went down',
          'Because candidates wrote in cursive',
        ],
        answer: 'Because the system flagged forty candidates unfairly',
        explanation: 'The unfair flags served as evidence for their past deduction.',
      },
      {
        question: 'Which two qualities does the speaker call irreplaceable?',
        options: ['Empathy and ethical judgment', 'Speed and storage capacity', 'Typing speed and formatting'],
        answer: 'Empathy and ethical judgment',
        explanation: 'Both require human context and moral reasoning.',
      },
    ],
    speaking_pragmatics: 'Structured group discussion: "Which human skills remain irreplaceable in an AI-driven economy?"',
    speaking_points: [
      'Build on a peer\'s argument ("Building on that point...", "That could well lead to...").',
      'Support every claim with one concrete workplace example.',
    ],
    speaking_q: [
      {
        question: 'Which phrase builds constructively on another speaker\'s point in a group debate?',
        options: [
          'Building on Maya\'s point about ethical judgment, that could well become a core leadership skill.',
          'You are completely wrong, listen to me.',
          'No comment.',
        ],
        answer: 'Building on Maya\'s point about ethical judgment, that could well become a core leadership skill.',
        explanation: 'Referencing peers and speculating clearly elevates group discussion.',
      },
      {
        question: 'In the discussion prompt, what is the central question?',
        options: [
          'Which human skills remain irreplaceable in an AI-driven economy?',
          'How to assemble a desktop computer',
          'History of the telegraph',
        ],
        answer: 'Which human skills remain irreplaceable in an AI-driven economy?',
        explanation: 'This is the Session 5–6 core speaking prompt.',
      },
    ],
    objectives: 'Debate the future of work using deduction/speculation modals and smooth modal weak forms.',
    homework: 'Write a 150-word position note on one irreplaceable human skill using at least two speculation modals.',
  },
  {
    session_number: 7,
    module_number: 2,
    module_session_number: 3,
    unit_title: 'Social Media, Privacy & Attention',
    title: 'Algorithms, Echo Chambers & Objective Reporting',
    pronunciation_focus: 'Weak forms in passive auxiliaries ("is being tracked", "has been shared", "was designed").',
    pronunciation_extract: 'Personal data is (/ɪz/) often collected / before users have (/həv/) read the terms.',
    pronunciation_points: [
      'Keep passive auxiliaries ("is", "was", "has been") light and rhythmic.',
      'Stress the past participle ("collected", "designed", "amplified") where the meaning lives.',
    ],
    pronunciation_q: [
      {
        question: 'In "User attention is monetized by algorithms", which words receive the strongest stress?',
        options: ['User, attention, monetized, algorithms', 'is, by', 'by, attention'],
        answer: 'User, attention, monetized, algorithms',
        explanation: 'Nouns and the main participle carry meaning and stress.',
      },
      {
        question: 'In "has been shared", which word carries primary lexical stress?',
        options: ['shared', 'has', 'been'],
        answer: 'shared',
        explanation: 'Auxiliaries "has been" stay reduced (/həz bɪn/).',
      },
    ],
    grammar_lexis: 'Passive voice across tenses for objective reporting; digital habits vocabulary: echo chamber, algorithm, screen fatigue, data privacy.',
    language_points: [
      'Present continuous passive: "User feeds are being curated in real time."',
      'Present perfect passive: "Millions of profiles have been exposed."',
    ],
    language_q: [
      {
        question: 'Which sentence uses the passive voice objectively to describe an ongoing process?',
        options: [
          'Recommendations are currently being tailored by engagement algorithms.',
          'Engagement algorithms tailoring recommendations right now.',
          'Recommendations was tailored every second.',
        ],
        answer: 'Recommendations are currently being tailored by engagement algorithms.',
        explanation: '"Are being + past participle" expresses present continuous passive.',
      },
      {
        question: 'What is an "echo chamber" online?',
        options: [
          'An environment where users mainly encounter opinions that reinforce their own beliefs',
          'A hardware microphone defect',
          'A quiet study room',
        ],
        answer: 'An environment where users mainly encounter opinions that reinforce their own beliefs',
        explanation: 'Algorithms can isolate users inside ideological echo chambers.',
      },
    ],
    listening_focus: 'Tech podcast excerpt analyzing how recommendation engines shape attention and polarization.',
    listening_extract: '"Once outrage is rewarded by the feed, balanced nuance gets pushed aside. Over time, users are drawn into tighter echo chambers without even noticing."',
    listening_points: [
      'Spot passive constructions used for objective cause-and-effect explanations.',
      'Identify key digital-habit terms in rapid podcast speech.',
    ],
    listening_q: [
      {
        question: 'According to the podcast, what happens when outrage is rewarded by a feed?',
        options: [
          'Balanced nuance is pushed aside and users drift into echo chambers.',
          'Screen fatigue immediately disappears.',
          'Algorithms stop collecting data.',
        ],
        answer: 'Balanced nuance is pushed aside and users drift into echo chambers.',
        explanation: 'Engagement-driven feeds amplify outrage over nuance.',
      },
      {
        question: 'Which passive phrase appears in the excerpt?',
        options: ['is rewarded / are drawn into', 'rewards / draws', 'rewarding / drawing'],
        answer: 'is rewarded / are drawn into',
        explanation: 'Both describe systemic effects objectively.',
      },
    ],
    speaking_pragmatics: 'Reporting tech issues neutrally and proposing practical data-privacy safeguards.',
    speaking_points: [
      'Use passive reporting frames ("It has been found that...", "Data is routinely collected...") to sound objective.',
      'Avoid vague complaints; name specific mechanisms (algorithms, permissions, notifications).',
    ],
    speaking_q: [
      {
        question: 'Which phrasing sounds most objective in a tech briefing?',
        options: [
          'Location data is frequently shared with third-party brokers unless permissions are restricted.',
          'They steal all our stuff all the time, it\'s crazy!',
          'Data bad, privacy gone.',
        ],
        answer: 'Location data is frequently shared with third-party brokers unless permissions are restricted.',
        explanation: 'Passive voice + precise lexis achieves objective reporting.',
      },
      {
        question: 'What does "screen fatigue" refer to?',
        options: [
          'Physical and mental exhaustion from prolonged digital device use',
          'A cracked phone display',
          'Slow Wi-Fi speeds',
        ],
        answer: 'Physical and mental exhaustion from prolonged digital device use',
        explanation: 'Screen fatigue affects focus, sleep, and eyes.',
      },
    ],
    objectives: 'Use passive voice across tenses for objective tech reporting and unpack algorithmic echo chambers.',
    homework: 'Rewrite 5 active news sentences about social media privacy into objective passive voice and record yourself reading them.',
  },
  {
    session_number: 8,
    module_number: 2,
    module_session_number: 4,
    unit_title: 'Social Media, Privacy & Attention',
    title: 'Digital Minimalism, Privacy & Attention',
    milestone: 'Module 2 Synthesis',
    pronunciation_focus: 'Blending weak forms and pausing cleanly in TED-style informative summaries.',
    pronunciation_extract: 'Digital minimalism isn\'t about / rejecting technology; / it\'s about choosing tools / with intention.',
    pronunciation_points: [
      'Contrast unstressed connectors ("about", "with") against crisp key nouns ("intention", "attention").',
      'Use brief dramatic pauses before key takeaways.',
    ],
    pronunciation_q: [
      {
        question: 'Why pause right after "rejecting technology;" in a talk?',
        options: [
          'To contrast what digital minimalism is NOT with what it IS',
          'Because you forgot the next word',
          'To make the sentence ungrammatical',
        ],
        answer: 'To contrast what digital minimalism is NOT with what it IS',
        explanation: 'Pausing sharpens rhetorical contrast.',
      },
      {
        question: 'Which function words reduce to weak forms in "choosing tools for your focus"?',
        options: ['for (/fə/), your (/jə/)', 'choosing, tools', 'tools, focus'],
        answer: ['for (/fə/), your (/jə/)'][0],
        explanation: 'Prepositions and possessive determiners weaken when unstressed.',
      },
    ],
    grammar_lexis: 'Consolidating passive voice, speculation modals, and digital habit lexis (data privacy, screen fatigue, echo chamber).',
    language_points: [
      'Combine passive reporting ("Attention has been treated as a commodity") with modal recommendations ("Platforms ought to be audited").',
    ],
    language_q: [
      {
        question: 'Which sentence combines passive voice and a modal accurately?',
        options: [
          'Default privacy settings should be simplified for everyday users.',
          'Default privacy settings should simplified for everyday users.',
          'Default privacy settings ought to simplifying.',
        ],
        answer: 'Default privacy settings should be simplified for everyday users.',
        explanation: 'Modal + be + past participle forms the modal passive.',
      },
      {
        question: 'What is the core idea of digital minimalism?',
        options: [
          'Using technology intentionally around clear personal values rather than passive scrolling',
          'Throwing away all computers permanently',
          'Opening ten new social accounts daily',
        ],
        answer: 'Using technology intentionally around clear personal values rather than passive scrolling',
        explanation: 'Intentional curation replaces mindless attention capture.',
      },
    ],
    listening_focus: 'Tech podcast excerpts and TED-style talks exploring digital minimalism and online communities.',
    listening_extract: '"When we switched our community off algorithmic feeds into a weekly moderated forum, screen fatigue dropped and thoughtful replies doubled."',
    listening_points: [
      'Summarize main claims and supporting evidence from TED-style talks.',
      'Compare positive online communities with attention-extractive platforms.',
    ],
    listening_q: [
      {
        question: 'What happened when the community moved away from algorithmic feeds?',
        options: [
          'Screen fatigue dropped and thoughtful replies doubled.',
          'Everyone deleted their accounts immediately.',
          'Posts became shorter and angrier.',
        ],
        answer: 'Screen fatigue dropped and thoughtful replies doubled.',
        explanation: 'Intentional design improved engagement quality.',
      },
      {
        question: 'Which listening skill is tested in TED-style excerpts?',
        options: [
          'Separating thesis claims from illustrative evidence',
          'Memorizing every article and preposition',
          'Ignoring speaker tone',
        ],
        answer: 'Separating thesis claims from illustrative evidence',
        explanation: 'B2 listeners track argument structure.',
      },
    ],
    speaking_pragmatics: 'Evaluating tech ethics and pitching a healthy digital-habit charter.',
    speaking_points: [
      'Synthesize pros, cons, and realistic policy or personal boundaries.',
      'Complete Module 2 speaking evaluation with weak-form control and objective passives.',
    ],
    speaking_q: [
      {
        question: 'Which recommendation best addresses both data privacy and screen fatigue?',
        options: [
          'Disable non-essential push notifications and audit app data permissions monthly.',
          'Keep every notification active overnight.',
          'Share passwords publicly.',
        ],
        answer: 'Disable non-essential push notifications and audit app data permissions monthly.',
        explanation: 'Practical boundaries protect both attention and privacy.',
      },
      {
        question: 'Which Module 2 target structures belong in your Module 2 audio journal?',
        options: [
          'Speculation modals, passive voice, and weak-form reductions',
          'Past continuous only',
          'Imperative recipes',
        ],
        answer: 'Speculation modals, passive voice, and weak-form reductions',
        explanation: 'These form the core linguistic focus of Module 2.',
      },
    ],
    objectives: 'Evaluate digital minimalism and tech ethics fluently using passive reporting, speculation modals, and /ə/ weak forms.',
    homework: 'Record a 2-minute tech-ethics audio journal evaluating one social platform feature and proposing a privacy/attention reform.',
  },

  // MODULE 3: Climate, Sustainability & Urban Futures (Sessions 9-12)
  {
    session_number: 9,
    module_number: 3,
    module_session_number: 1,
    unit_title: 'Environmental Challenges & Solutions',
    title: 'Urban Sustainability & Connected Speech',
    pronunciation_focus: 'Connected speech—catenation and elision (consonant-to-vowel linking and natural /t/ or /d/ drops in next step, must be, climate change).',
    pronunciation_extract: 'The next step (/nek-step/) / must be (/mʌs-bi/) / transforming urban transport / to fight climate change.',
    pronunciation_points: [
      'Catenation: link a final consonant smoothly onto the next vowel ("an_urban_approach").',
      'Elision: drop /t/ or /d/ smoothly between consonants ("nex(t) step", "mus(t) be", "worl(d) leaders").',
    ],
    pronunciation_q: [
      {
        question: 'What happens to the /t/ in "next step" in natural connected speech?',
        options: [
          'It is commonly elided (dropped) between /ks/ and /st/.',
          'It becomes a loud extra syllable.',
          'It turns into /r/.',
        ],
        answer: 'It is commonly elided (dropped) between /ks/ and /st/.',
        explanation: 'Elision simplifies heavy consonant clusters across word boundaries.',
      },
      {
        question: 'Which phrase shows consonant-to-vowel catenation?',
        options: ['clean_energy', 'next_step', 'must_be'],
        answer: 'clean_energy',
        explanation: 'Final /n/ links smoothly onto the initial vowel of "energy".',
      },
    ],
    grammar_lexis: 'Sustainability lexis (carbon footprint, circular economy, renewable grid, greenwashing) & future continuous.',
    language_points: [
      'Circular economy: designing products to be repaired, reused, and recycled rather than discarded.',
      'Greenwashing: misleading marketing that exaggerates environmental benefits.',
    ],
    language_q: [
      {
        question: 'Which term describes misleading claims that make a product sound greener than it really is?',
        options: ['greenwashing', 'circular economy', 'renewable grid'],
        answer: 'greenwashing',
        explanation: 'Greenwashing masks weak environmental performance with eco-branding.',
      },
      {
        question: 'Which sentence uses the future continuous for an in-progress future trend?',
        options: [
          'By 2035, European cities will be expanding car-free superblocks rapidly.',
          'By 2035, European cities expanding car-free superblocks.',
          'European cities will expanded car-free zones.',
        ],
        answer: 'By 2035, European cities will be expanding car-free superblocks rapidly.',
        explanation: '"Will be + -ing" describes an action in progress at a future point.',
      },
    ],
    listening_focus: 'Briefings on urban climate challenges and city-level transitions.',
    listening_extract: '"Cutting a city\'s carbon footprint requires more than planting trees; municipalities will be overhauling transit, retrofitting buildings, and connecting neighbourhoods to a renewable grid."',
    listening_points: [
      'Recognize linked phrases and elided /t/-/d/ sounds at natural speed.',
      'Capture concrete infrastructure actions.',
    ],
    listening_q: [
      {
        question: 'According to the briefing, what must cities do besides planting trees?',
        options: [
          'Overhaul transit, retrofit buildings, and connect to a renewable grid',
          'Build wider urban motorways',
          'Replace buses with private taxis',
        ],
        answer: 'Overhaul transit, retrofit buildings, and connect to a renewable grid',
        explanation: 'Systemic infrastructure drives lasting emissions reductions.',
      },
      {
        question: 'What does "carbon footprint" measure?',
        options: [
          'Total greenhouse gas emissions caused by an activity, person, or city',
          'Walking trails in a forest',
          'Soil quality in parks',
        ],
        answer: 'Total greenhouse gas emissions caused by an activity, person, or city',
        explanation: 'Carbon footprint quantifies total emissions impact.',
      },
    ],
    speaking_pragmatics: 'Diagnosing local urban sustainability challenges with connected-speech fluency.',
    speaking_points: [
      'Practice "next step", "must be", "cold climate", and "clean energy" smoothly in full sentences.',
      'Contrast genuine circular-economy reforms with corporate greenwashing.',
    ],
    speaking_q: [
      {
        question: 'Which spoken sentence accurately uses sustainability lexis?',
        options: [
          'Moving from single-use packaging to a circular economy is the next step for our city.',
          'Greenwashing is the best way to build a renewable grid.',
          'Our carbon footprint is circular.',
        ],
        answer: 'Moving from single-use packaging to a circular economy is the next step for our city.',
        explanation: 'Clearly pairs circular economy with practical municipal action.',
      },
      {
        question: 'Why practice elision in listening AND speaking?',
        options: [
          'It helps you decode fast native/global speech and sound smoother without over-articulating every cluster.',
          'It removes all vowels from English.',
          'It is only for written essays.',
        ],
        answer: 'It helps you decode fast native/global speech and sound smoother without over-articulating every cluster.',
        explanation: 'Natural linking and elision aid both flow and listening comprehension.',
      },
    ],
    objectives: 'Apply catenation and /t/-/d/ elision naturally while discussing carbon footprints, circular economies, and greenwashing.',
    homework: 'Record 5 connected-speech sentences ("next step", "must be", "climate change", "clean energy", "green economy") focusing on linking and elision.',
  },
  {
    session_number: 10,
    module_number: 3,
    module_session_number: 2,
    unit_title: 'Environmental Challenges & Solutions',
    title: 'Future Forecasts & Green City Case Studies',
    pronunciation_focus: 'Connected speech across future timelines ("will have transitioned", "will be running").',
    pronunciation_extract: 'By 2040, / leading cities will have (/wɪləv/) transitioned / to a fully renewable grid.',
    pronunciation_points: [
      'Link "will have" smoothly (/wɪləv/) before the past participle ("transitioned", "replaced").',
      'Keep key milestone dates ("By 2040") crisp and clearly chunked.',
    ],
    pronunciation_q: [
      {
        question: 'How does "will have" flow in connected speech in "cities will have transitioned"?',
        options: ['/wɪləv/', '/wɪl hæv/ with a hard glottal stop', '/wʊd əv/'],
        answer: '/wɪləv/',
        explanation: '"Will have" links and reduces smoothly to /wɪləv/.',
      },
      {
        question: 'Which part of "will have transitioned" carries the strongest word stress?',
        options: ['transitioned (-ZI-)', 'will', 'have'],
        answer: 'transitioned (-ZI-)',
        explanation: 'The main verb carries lexical stress.',
      },
    ],
    grammar_lexis: 'Future continuous vs. future perfect ("By 2040, cities will have transitioned..."); urban sustainability case studies.',
    language_points: [
      'Future perfect ("will have + past participle"): completed milestone BEFORE a future deadline.',
      'Future continuous ("will be + -ing"): ongoing state AT a future point.',
    ],
    language_q: [
      {
        question: 'Which sentence expresses a completed milestone by 2040?',
        options: [
          'By 2040, Copenhagen will have phased out fossil-fuel district heating.',
          'By 2040, Copenhagen will be phase out heating.',
          'In 2040, Copenhagen phases out yesterday.',
        ],
        answer: 'By 2040, Copenhagen will have phased out fossil-fuel district heating.',
        explanation: 'Future perfect highlights completion before the deadline.',
      },
      {
        question: 'Which four cities are featured in the Module 3 urban sustainability workshop?',
        options: [
          'Copenhagen, Singapore, Medellín, and Barcelona',
          'London, Tokyo, Cairo, and Toronto',
          'Berlin, Sydney, Seoul, and Lima',
        ],
        answer: 'Copenhagen, Singapore, Medellín, and Barcelona',
        explanation: 'These four global cities exemplify cycling grids, biophilic design, cable-car transit, and superblocks.',
      },
    ],
    listening_focus: 'Comparative urban case-study clips: Copenhagen, Singapore, Medellín, and Barcelona.',
    listening_extract: '"Barcelona\'s superblocks reclaim street space from through-traffic for pedestrians and shade trees, while Medellín\'s hillside cable cars connected isolated neighbourhoods to jobs in minutes."',
    listening_points: [
      'Map each city to its signature urban innovation (cycling, vertical greenery, cable cars, superblocks).',
      'Listen for future projections paired with concrete metrics.',
    ],
    listening_q: [
      {
        question: 'What urban challenge did Medellín\'s cable-car network solve?',
        options: [
          'Connecting steep hillside neighbourhoods quickly to city-centre transit and jobs',
          'Replacing ocean ferries',
          'Cooling underground subways',
        ],
        answer: 'Connecting steep hillside neighbourhoods quickly to city-centre transit and jobs',
        explanation: 'Metrocable dramatically cut commute times for hillside communities.',
      },
      {
        question: 'How do Barcelona\'s superblocks transform neighbourhoods?',
        options: [
          'They reduce through-traffic and return street space to pedestrians and green shade.',
          'They turn every plaza into a highway.',
          'They ban bicycles.',
        ],
        answer: 'They reduce through-traffic and return street space to pedestrians and green shade.',
        explanation: 'Superblocks prioritize people, trees, and local air quality.',
      },
    ],
    speaking_pragmatics: 'Case study workshop: evaluating urban sustainability initiatives (Copenhagen, Singapore, Medellín, Barcelona).',
    speaking_points: [
      'Compare feasibility, equity, and climate impact across cities.',
      'Project outcomes to 2035/2040 using future continuous and future perfect.',
    ],
    speaking_q: [
      {
        question: 'When evaluating a green city case study, which criterion checks social fairness?',
        options: [
          'Whether low-income outer districts gain equal access to clean transit and cooling parks',
          'Whether the brochure uses green fonts',
          'Whether only luxury towers benefit',
        ],
        answer: 'Whether low-income outer districts gain equal access to clean transit and cooling parks',
        explanation: 'Equitable access ensures sustainability benefits the whole city.',
      },
      {
        question: 'Which forecast accurately uses future perfect?',
        options: [
          'By 2035, Singapore will have expanded rooftop greenery across hundreds of public blocks.',
          'By 2035, Singapore will expanding greenery.',
          'Singapore has expanded by 2035.',
        ],
        answer: 'By 2035, Singapore will have expanded rooftop greenery across hundreds of public blocks.',
        explanation: '"Will have expanded" marks completion by 2035.',
      },
    ],
    objectives: 'Contrast future continuous and future perfect while evaluating real-world urban sustainability case studies.',
    homework: 'Compare two of the four case-study cities in a 150-word brief with two future-perfect projections for 2040.',
  },
  {
    session_number: 11,
    module_number: 3,
    module_session_number: 3,
    unit_title: 'Hypothetical Scenarios & Global Policy',
    title: 'Climate Policy & Conditionals Lab',
    pronunciation_focus: 'Connected speech in conditional reductions ("would have", "hadn\'t invested", "if it weren\'t for").',
    pronunciation_extract: 'If cities had (/həd/) invested earlier, / emissions would have (/wʊdəv/) fallen faster.',
    pronunciation_points: [
      'Reduce "would have" to /wʊdəv/ and "had" in rapid third conditionals.',
      'Use rising intonation at the end of the "if"-clause to signal the result clause is coming.',
    ],
    pronunciation_q: [
      {
        question: 'In a conditional sentence starting with "If...", how does pitch usually behave at the comma?',
        options: [
          'A slight rise or level sustain signaling the sentence isn\'t finished yet',
          'A sharp final drop as if ending a paragraph',
          'Complete silence for 5 seconds',
        ],
        answer: 'A slight rise or level sustain signaling the sentence isn\'t finished yet',
        explanation: 'Non-final rising contour tells the listener a consequence clause follows.',
      },
      {
        question: 'How is "would have" pronounced in fast third-conditional speech?',
        options: ['/wʊdəv/', '/wʊd hæv/ always separated', '/wɪl əv/'],
        answer: '/wʊdəv/',
        explanation: 'Auxiliary "have" reduces to /əv/.',
      },
    ],
    grammar_lexis: 'Zero, first, second, and third conditionals (plus mixed conditionals) to debate policy outcomes.',
    language_points: [
      '2nd conditional: hypothetical present/future ("If cities taxed congestion, traffic would drop").',
      '3rd conditional: unreal past ("If they had built rail earlier, sprawl wouldn\'t have grown").',
      'Mixed conditional: past policy → present consequence ("If we had modernized the grid in 2010, energy would be cheaper today").',
    ],
    language_q: [
      {
        question: 'Which sentence is a mixed conditional linking a past decision to a present result?',
        options: [
          'If the city had invested in bike lanes a decade ago, commuters would face far less congestion today.',
          'If it rains, streets get wet.',
          'If we ban plastics tomorrow, oceans will improve.',
        ],
        answer: 'If the city had invested in bike lanes a decade ago, commuters would face far less congestion today.',
        explanation: 'Past perfect ("had invested") + "would + base verb today" links past action to present state.',
      },
      {
        question: 'Which conditional debates a likely real-world policy outcome next year?',
        options: [
          'First conditional ("If the council subsidizes heat pumps, adoption will rise.")',
          'Zero conditional',
          'Third conditional',
        ],
        answer: 'First conditional ("If the council subsidizes heat pumps, adoption will rise.")',
        explanation: 'First conditional models realistic future cause and effect.',
      },
    ],
    listening_focus: 'Global climate policy debate comparing carbon pricing, transit subsidies, and clean-energy mandates.',
    listening_extract: '"If governments had priced industrial carbon twenty years ago, clean hydrogen would already be cost-competitive. Still, if we redirect fossil subsidies now, we\'ll accelerate the transition."',
    listening_points: [
      'Spot switches between mixed conditionals (regret/retrospective) and first conditionals (actionable policy).',
    ],
    listening_q: [
      {
        question: 'What does the speaker say would be true today if carbon had been priced 20 years ago?',
        options: [
          'Clean hydrogen would already be cost-competitive.',
          'Cities would have no electricity.',
          'Fossil subsidies would double.',
        ],
        answer: 'Clean hydrogen would already be cost-competitive.',
        explanation: 'Mixed conditional links past inaction to current cost.',
      },
      {
        question: 'What actionable step does the second sentence propose?',
        options: [
          'Redirecting fossil subsidies now to accelerate the transition',
          'Waiting another twenty years',
          'Stopping public transit',
        ],
        answer: 'Redirecting fossil subsidies now to accelerate the transition',
        explanation: 'First conditional frames immediate policy impact.',
      },
    ],
    speaking_pragmatics: 'Policy debate using zero, first, second, third, and mixed conditionals to weigh trade-offs.',
    speaking_points: [
      'Respond to counterarguments with "Even if..., we would still need to...".',
      'Avoid mixing up "would" inside the "if"-clause.',
    ],
    speaking_q: [
      {
        question: 'Which sentence is grammatically accurate?',
        options: [
          'If municipalities restricted SUVs in city centres, air quality would improve.',
          'If municipalities would restrict SUVs, air quality would improve.',
          'If municipalities restrict SUVs, air quality would have improved.',
        ],
        answer: 'If municipalities restricted SUVs in city centres, air quality would improve.',
        explanation: 'In standard 2nd conditionals, use past simple in the "if"-clause and "would" in the result clause.',
      },
      {
        question: 'Why are mixed conditionals valuable in policy debates?',
        options: [
          'They connect historical policy choices directly to today\'s realities.',
          'They avoid mentioning time altogether.',
          'They only work for weather forecasts.',
        ],
        answer: 'They connect historical policy choices directly to today\'s realities.',
        explanation: 'Mixed conditionals explain present consequences of past actions.',
      },
    ],
    objectives: 'Debate environmental policy outcomes accurately using first, second, third, and mixed conditionals.',
    homework: 'Write 4 policy statements (one each of 1st, 2nd, 3rd, and mixed conditional) preparing for Session 12\'s green city pitch.',
  },
  {
    session_number: 12,
    module_number: 3,
    module_session_number: 4,
    unit_title: 'Hypothetical Scenarios & Global Policy',
    title: 'Green City Pitch & Q&A Defense',
    milestone: 'Module 3 Synthesis & Pitch',
    pronunciation_focus: 'Full connected speech integration (linking + elision + non-final pitch) during persuasive pitches.',
    pronunciation_extract: 'If we implement this plan, / our neighbourhood will have cut / transport emissions by forty percent.',
    pronunciation_points: [
      'Deliver pitch signposts ("First", "Turning to funding", "To conclude") with deliberate pauses.',
      'Maintain crisp numbers and percentages during Q&A defense.',
    ],
    pronunciation_q: [
      {
        question: 'During a 3-minute pitch, how should you deliver key numbers like "40 percent by 2035"?',
        options: [
          'Slightly slower with clear stress and a short pause afterwards',
          'As fast as possible so nobody hears them',
          'In a whisper',
        ],
        answer: 'Slightly slower with clear stress and a short pause afterwards',
        explanation: 'Metrics anchor persuasion and need acoustic clarity.',
      },
      {
        question: 'Which phrase links smoothly with catenation?',
        options: ['implement_a_plan', 'cut_by', 'green_city'],
        answer: 'implement_a_plan',
        explanation: 'Final /t/ links cleanly onto "a".',
      },
    ],
    grammar_lexis: 'Integrated conditionals, future perfect/continuous, and sustainability lexis (circular economy, renewable grid, carbon footprint).',
    language_points: [
      'Structure a 3-minute pitch: Problem → Solution → 2035/2040 Milestone (future perfect) → Conditional impact.',
    ],
    language_q: [
      {
        question: 'Which closing line best synthesizes Module 3 grammar for a pitch?',
        options: [
          'If we fund this grid upgrade today, our district will have cut emissions in half by 2035.',
          'If we fund this upgrade, emissions cuts maybe.',
          'Emissions had cut by 2035.',
        ],
        answer: 'If we fund this grid upgrade today, our district will have cut emissions in half by 2035.',
        explanation: 'Combines 1st conditional action with a future perfect milestone.',
      },
      {
        question: 'How should you handle a tough budget question in Q&A defense?',
        options: [
          'Acknowledge the concern, explain phased funding, and highlight long-term savings.',
          'Ignore the question completely.',
          'Say "That\'s not my problem."',
        ],
        answer: 'Acknowledge the concern, explain phased funding, and highlight long-term savings.',
        explanation: 'Professional Q&A defense validates the question before answering with evidence.',
      },
    ],
    listening_focus: 'Peer green-city pitches and challenging stakeholder Q&A questions.',
    listening_extract: '"That sounds ambitious, yet if upfront retrofitting costs rise, how would low-income tenants be protected from higher rents?"',
    listening_points: [
      'Anticipate stakeholder objections (cost, equity, timeline, greenwashing risks).',
    ],
    listening_q: [
      {
        question: 'What stakeholder concern is raised in the Q&A extract?',
        options: [
          'Protecting low-income tenants from rent increases caused by retrofitting costs',
          'Choosing paint colours for buses',
          'Banning bicycles from parks',
        ],
        answer: 'Protecting low-income tenants from rent increases caused by retrofitting costs',
        explanation: 'Real policy Q&A addresses equity and affordability.',
      },
      {
        question: 'What is the ideal duration of the collaborative pitch in Session 12?',
        options: ['3 minutes plus Q&A defense', '15 seconds', '45 minutes'],
        answer: '3 minutes plus Q&A defense',
        explanation: 'The syllabus specifies a 3-minute green city proposal with Q&A defense.',
      },
    ],
    speaking_pragmatics: 'Collaborative pitch: designing and presenting a 3-minute green city proposal with Q&A defense.',
    speaking_points: [
      'Deliver clear signposted sections and handle rapid Q&A smoothly.',
      'Integrate connected speech, conditionals, and future-perfect outcomes.',
    ],
    speaking_q: [
      {
        question: 'Which Q&A response shows strong B2 poise?',
        options: [
          'That is a fair concern; if we pair retrofits with rent-stabilization grants, tenants won\'t carry the upfront cost.',
          'Nobody cares about rent.',
          'Next question please.',
        ],
        answer: 'That is a fair concern; if we pair retrofits with rent-stabilization grants, tenants won\'t carry the upfront cost.',
        explanation: 'Validates the objection and answers with a clear conditional safeguard.',
      },
      {
        question: 'Which signposting phrase transitions smoothly to expected results?',
        options: [
          'Looking ahead to 2035, here is what this proposal will have achieved...',
          'Stuff happens later...',
          'Anyway, moving on randomly...',
        ],
        answer: 'Looking ahead to 2035, here is what this proposal will have achieved...',
        explanation: 'Clear signposting guides listeners into the future perfect projection.',
      },
    ],
    objectives: 'Design, present, and defend a 3-minute green city proposal using conditionals, future timelines, and connected speech.',
    homework: 'Record your 3-minute Green City Pitch (or Q&A reflection) as your Module 3 Audio Journal.',
  },

  // MODULE 4: Global Work, Leadership & Remote Teams (Sessions 13-16)
  {
    session_number: 13,
    module_number: 4,
    module_session_number: 1,
    unit_title: 'Navigating International Workplaces',
    title: 'International Workplaces & Diplomatic Intonation',
    pronunciation_focus: 'Intonation for politeness and diplomacy—using fall-rise contours to soften requests and feedback.',
    pronunciation_extract: 'Could we possibly ↘↗ touch base tomorrow / to align on the timeline?',
    pronunciation_points: [
      'Use a fall-rise contour (↘↗) on polite requests and partial agreement ("To some extent ↘↗...").',
      'Flat falling pitch on imperatives ("Send this now ↘") can sound abrupt across cultures.',
    ],
    pronunciation_q: [
      {
        question: 'How does a fall-rise intonation contour affect a workplace request?',
        options: [
          'It softens the request and sounds collaborative rather than abrupt.',
          'It makes the speaker sound angry.',
          'It turns a statement into a past tense.',
        ],
        answer: 'It softens the request and sounds collaborative rather than abrupt.',
        explanation: 'Fall-rise pitch signals openness, tact, and room for dialogue.',
      },
      {
        question: 'Which request sounds more diplomatic in tone?',
        options: [
          '"Would you mind sending the draft by Thursday?" with a gentle rise-fall/fall-rise',
          '"Send the draft Thursday." with a sharp drop',
          '"Draft. Now."',
        ],
        answer: '"Would you mind sending the draft by Thursday?" with a gentle rise-fall/fall-rise',
        explanation: 'Polite framing + soft intonation preserves goodwill.',
      },
    ],
    grammar_lexis: 'Global business collocations and phrasal verbs: delegate, streamline, touch base, follow up on, align on, bottleneck.',
    language_points: [
      'Touch base = briefly reconnect to check status; align on = reach shared agreement; bottleneck = step slowing the workflow.',
    ],
    language_q: [
      {
        question: 'Which term describes a single stage that slows down an entire remote workflow?',
        options: ['bottleneck', 'delegate', 'touch base'],
        answer: 'bottleneck',
        explanation: 'A bottleneck restricts throughput across a team process.',
      },
      {
        question: 'Choose the best phrasal verb: "Let\'s ___ the client feedback before Friday\'s release."',
        options: ['follow up on', 'delegate out', 'bottleneck'],
        answer: 'follow up on',
        explanation: '"Follow up on" means to check progress or respond to an earlier item.',
      },
    ],
    listening_focus: 'Remote stand-up call between Berlin, Tokyo, London, and São Paulo teammates.',
    listening_extract: '"I hear what you\'re saying about speeding up QA, though if we don\'t align on sign-off criteria first, we might create a bigger bottleneck later."',
    listening_points: [
      'Hear how fall-rise intonation cushions pushback ("I hear what you\'re saying...").',
      'Track action items: who delegates, who follows up, and what needs alignment.',
    ],
    listening_q: [
      {
        question: 'What risk does the speaker warn against if the team skips aligning on sign-off criteria?',
        options: [
          'Creating a bigger bottleneck later in the workflow',
          'Running out of coffee',
          'Losing internet access',
        ],
        answer: 'Creating a bigger bottleneck later in the workflow',
        explanation: 'Skipping alignment creates rework and delays.',
      },
      {
        question: 'How does the speaker open their disagreement diplomatically?',
        options: ['"I hear what you\'re saying about..."', '"That makes zero sense."', '"Stop talking."'],
        answer: '"I hear what you\'re saying about..."',
        explanation: 'Acknowledging the other view lowers defensiveness.',
      },
    ],
    speaking_pragmatics: 'Making softened requests, delegating clearly, and resolving remote workflow bottlenecks.',
    speaking_points: [
      'Pair business phrasal verbs with diplomatic modals ("Could we...", "Might it help to...").',
    ],
    speaking_q: [
      {
        question: 'Which sentence delegates a task clearly and respectfully?',
        options: [
          'Could you take the lead on streamlining the onboarding checklist and follow up with me on Wednesday?',
          'Do checklist now.',
          'Streamline something maybe.',
        ],
        answer: 'Could you take the lead on streamlining the onboarding checklist and follow up with me on Wednesday?',
        explanation: 'Clear ownership, clear deadline, polite modal framing.',
      },
      {
        question: 'What does "align on priorities" mean?',
        options: [
          'Ensure everyone agrees on which tasks matter most and in what order',
          'Format text in a document',
          'Schedule a holiday',
        ],
        answer: 'Ensure everyone agrees on which tasks matter most and in what order',
        explanation: 'Alignment prevents duplicated or conflicting effort.',
      },
    ],
    objectives: 'Use fall-rise diplomatic intonation and global workplace phrasal verbs to coordinate remote teams.',
    homework: 'Record 4 softened remote-team requests using fall-rise contours and target phrasal verbs (touch base, align on, streamline, follow up on).',
  },
  {
    session_number: 14,
    module_number: 4,
    module_session_number: 2,
    unit_title: 'Navigating International Workplaces',
    title: 'Global Feedback Styles & Remote Team Alignment',
    pronunciation_focus: 'Controlling pitch range when delivering constructive feedback across cultures.',
    pronunciation_extract: 'One small adjustment / that might help ↘↗ / is clarifying the deadline upfront.',
    pronunciation_points: [
      'Avoid overly sharp downward stress on words like "wrong" or "problem"; frame around "adjustment" or "next step".',
    ],
    pronunciation_q: [
      {
        question: 'Why avoid heavy downward pitch on blunt negative words in cross-cultural feedback?',
        options: [
          'It can sound confrontational to indirect-feedback cultures, even when well-intentioned.',
          'It changes nouns into verbs.',
          'It is impossible to hear over Zoom.',
        ],
        answer: 'It can sound confrontational to indirect-feedback cultures, even when well-intentioned.',
        explanation: 'Tone carries major pragmatic weight in international teams.',
      },
      {
        question: 'Which pitch contour keeps feedback constructive?',
        options: ['Warm fall-rise on qualifiers ("that might help")', 'Monotone robotic delivery', 'Shouting key nouns'],
        answer: 'Warm fall-rise on qualifiers ("that might help")',
        explanation: 'Softens suggestions while keeping clarity.',
      },
    ],
    grammar_lexis: 'Direct vs. indirect feedback pragmatics (Dutch/German directness vs. East Asian/British indirectness); workplace collocations.',
    language_points: [
      'Direct cultures separate feedback from personal warmth; indirect cultures use softeners ("perhaps", "a bit", "I wonder if") to protect face.',
      'Code-switching between styles prevents misreading bluntness as hostility or politeness as agreement.',
    ],
    language_q: [
      {
        question: 'In a comparison of workplace feedback styles, which pair tends toward more indirect, softened critique?',
        options: [
          'East Asian and British communication norms',
          'Dutch and German communication norms',
          'Emergency air-traffic control',
        ],
        answer: 'East Asian and British communication norms',
        explanation: 'Both often wrap critique in diplomatic softeners, whereas Dutch/German styles favour explicit directness.',
      },
      {
        question: 'What might a British speaker actually mean by "That\'s an interesting approach, though we could perhaps explore one other option"?',
        options: [
          'They have serious reservations and want to change direction.',
          'They think the proposal is completely perfect as written.',
          'They didn\'t read the document.',
        ],
        answer: 'They have serious reservations and want to change direction.',
        explanation: 'British understatement often signals disagreement gently.',
      },
    ],
    listening_focus: 'Two feedback role-plays: a direct Dutch/German review vs. an indirect British/East Asian review.',
    listening_extract: '"When Henrik wrote \'This section is unclear,\' I thought he was annoyed—until I realized he was simply saving time and being helpful."',
    listening_points: [
      'Decode both direct clarity and indirect hedging accurately without misjudging intent.',
    ],
    listening_q: [
      {
        question: 'What caused the initial misunderstanding in the listening extract?',
        options: [
          'The listener mistook direct Dutch/German clarity for personal annoyance.',
          'The email went to spam.',
          'The project was in another language.',
        ],
        answer: 'The listener mistook direct Dutch/German clarity for personal annoyance.',
        explanation: 'Recognizing cultural feedback norms prevents misinterpretation.',
      },
      {
        question: 'What is the safest strategy in a multicultural remote team?',
        options: [
          'Combine respectful warmth with explicit, unambiguous action items.',
          'Use maximum sarcasm.',
          'Never give feedback.',
        ],
        answer: 'Combine respectful warmth with explicit, unambiguous action items.',
        explanation: 'Clarity + respect works well across both direct and indirect cultures.',
      },
    ],
    speaking_pragmatics: 'Delivering and decoding direct vs. indirect feedback in simulated international 1-on-1s.',
    speaking_points: [
      'Pair empathy ("I appreciate the effort on...") with explicit next steps ("Specifically, let\'s revise...").',
    ],
    speaking_q: [
      {
        question: 'Which feedback sentence balances warmth and explicit clarity?',
        options: [
          'Thanks for pulling the data together; to help the client decide quickly, could we put the budget summary on page one?',
          'Page one is bad.',
          'Maybe change stuff sometime if you feel like it.',
        ],
        answer: 'Thanks for pulling the data together; to help the client decide quickly, could we put the budget summary on page one?',
        explanation: 'Appreciates effort, explains purpose, and gives a crystal-clear action.',
      },
      {
        question: 'Why might indirect feedback fail if it is TOO vague?',
        options: [
          'Teammates from direct cultures may miss that an urgent change is needed.',
          'It uses too many verbs.',
          'It makes emails shorter.',
        ],
        answer: 'Teammates from direct cultures may miss that an urgent change is needed.',
        explanation: 'Over-hedging can obscure the actual action required.',
      },
    ],
    objectives: 'Navigate direct vs. indirect feedback cultures smoothly and calibrate remote feedback tone.',
    homework: 'Rewrite one blunt critique and one overly vague critique into balanced cross-cultural feedback.',
  },
  {
    session_number: 15,
    module_number: 4,
    module_session_number: 3,
    unit_title: 'Cross-Cultural Negotiation & Conflict Resolution',
    title: 'Indirect Questions & Diplomatic Hedging',
    pronunciation_focus: 'Intonation in embedded indirect questions (avoiding sharp yes/no pitch spikes).',
    pronunciation_extract: 'I was wondering if we might ↘↗ / split the delivery into two phases.',
    pronunciation_points: [
      'Keep indirect question intonation smooth and conversational rather than interrogative.',
    ],
    pronunciation_q: [
      {
        question: 'Which intonation fits "I was wondering if we might revisit the deadline"?',
        options: [
          'Smooth statement-like contour with a gentle fall-rise on the request',
          'Loud barking emphasis on every word',
          'Sharp high rise as if shouting "WHAT?!"',
        ],
        answer: 'Smooth statement-like contour with a gentle fall-rise on the request',
        explanation: 'Indirect questions use statement word order and gentle prosody.',
      },
      {
        question: 'In indirect questions ("Could you tell me when the report is due?"), what happens to word order?',
        options: [
          'Subject comes before the verb ("the report is due"), not inverted ("is the report due").',
          'Verb always moves to the very end.',
          'Auxiliary "do" must be added.',
        ],
        answer: 'Subject comes before the verb ("the report is due"), not inverted ("is the report due").',
        explanation: 'Indirect questions keep declarative word order inside the embedded clause.',
      },
    ],
    grammar_lexis: 'Indirect questions and diplomatic hedging ("I was wondering if we might...", "To some extent, I agree, however...").',
    language_points: [
      'Concession + pivot: "To some extent, I agree; however, we also need to protect margins."',
      'Exploratory indirect framing: "I was wondering if we might...", "Would you be open to...?"',
    ],
    language_q: [
      {
        question: 'Which indirect question is grammatically correct?',
        options: [
          'I was wondering if we might extend the pilot by two weeks.',
          'I was wondering if might we extend the pilot by two weeks?',
          'I was wondering could we extending the pilot.',
        ],
        answer: 'I was wondering if we might extend the pilot by two weeks.',
        explanation: 'Embedded clause keeps subject + modal ("we might extend").',
      },
      {
        question: 'Which phrase shows diplomatic hedging before introducing a counter-proposal?',
        options: [
          'To some extent, I agree; however, our timeline won\'t allow a full redesign.',
          'That is completely impossible, period.',
          'Actually no.',
        ],
        answer: 'To some extent, I agree; however, our timeline won\'t allow a full redesign.',
        explanation: 'Validates shared ground before stating the constraint.',
      },
    ],
    listening_focus: 'Contract negotiation dialogue between a vendor and an international client resolving scope creep.',
    listening_extract: '"To some extent, I see why adding extra languages appeals to marketing; however, I was wondering if we might phase them into Q3 so we don\'t compromise launch quality."',
    listening_points: [
      'Track each party\'s underlying priority vs. stated position.',
      'Note hedging expressions used to keep negotiations constructive.',
    ],
    listening_q: [
      {
        question: 'What compromise does the speaker propose?',
        options: [
          'Phasing the extra languages into Q3 to protect initial launch quality',
          'Cancelling the launch permanently',
          'Dropping marketing from the team',
        ],
        answer: 'Phasing the extra languages into Q3 to protect initial launch quality',
        explanation: 'Phasing satisfies both quality and scope goals.',
      },
      {
        question: 'Which two target structures appear in the extract?',
        options: [
          'Diplomatic hedging ("To some extent...") and indirect question ("I was wondering if we might...")',
          'Third conditional and past perfect',
          'Imperatives and slang',
        ],
        answer: 'Diplomatic hedging ("To some extent...") and indirect question ("I was wondering if we might...")',
        explanation: 'Both structures anchor Session 15.',
      },
    ],
    speaking_pragmatics: 'De-escalating conflict and proposing win-win trade-offs with indirect questions and hedging.',
    speaking_points: [
      'Separate people from the problem; ask exploratory "what if" questions.',
    ],
    speaking_q: [
      {
        question: 'Which opener best de-escalates a budget disagreement?',
        options: [
          'Would you be open to exploring how we could trim 10% of scope while keeping your core deliverables?',
          'Pay more or we walk away right now.',
          'Your budget makes no sense.',
        ],
        answer: 'Would you be open to exploring how we could trim 10% of scope while keeping your core deliverables?',
        explanation: 'Invites collaborative problem-solving.',
      },
      {
        question: 'Why use hedging in conflict resolution?',
        options: [
          'It leaves room for compromise without losing clarity on your constraints.',
          'It hides the topic completely.',
          'It avoids all nouns.',
        ],
        answer: 'It leaves room for compromise without losing clarity on your constraints.',
        explanation: 'Diplomatic hedging pairs tact with firm boundaries.',
      },
    ],
    objectives: 'Frame proposals with indirect questions and diplomatic hedging to de-escalate workplace conflict.',
    homework: 'Draft 5 negotiation lines (2 indirect questions, 2 concession-and-pivot hedges, 1 trade-off proposal) for Session 16.',
  },
  {
    session_number: 16,
    module_number: 4,
    module_session_number: 4,
    unit_title: 'Cross-Cultural Negotiation & Conflict Resolution',
    title: 'Cross-Cultural Negotiation & Mid-Course Diagnostic (Hour 32)',
    milestone: 'Mid-Course Diagnostic (Hour 32 · 15% Assessment)',
    pronunciation_focus: 'Diagnostic prosody check: sentence stress, weak forms, linking, and diplomatic intonation under real-time pressure.',
    pronunciation_extract: 'To some extent, I agree; / however, / if we align on priorities now, / we\'ll avoid a bottleneck later.',
    pronunciation_points: [
      'Demonstrate steady pacing, natural fall-rise diplomacy, and clear thought-group pauses.',
    ],
    pronunciation_q: [
      {
        question: 'What does the Hour 32 Mid-Course Assessment consist of?',
        options: [
          'A multi-party cross-cultural negotiation role-play followed by a 30-minute diagnostic speaking check (15% of course grade)',
          'A written vocabulary spelling test only',
          'A silent reading exam',
        ],
        answer: 'A multi-party cross-cultural negotiation role-play followed by a 30-minute diagnostic speaking check (15% of course grade)',
        explanation: 'Exact specification from the Course Architecture assessment breakdown.',
      },
      {
        question: 'Which prosody features are evaluated at Hour 32?',
        options: [
          'Thought-group chunking, weak forms (/ə/), connected speech, and diplomatic fall-rise intonation',
          'Speed reading silently',
          'Handwriting neatness',
        ],
        answer: 'Thought-group chunking, weak forms (/ə/), connected speech, and diplomatic fall-rise intonation',
        explanation: 'Covers all pronunciation labs from Modules 1–4.',
      },
    ],
    grammar_lexis: 'Cumulative Modules 1–4 synthesis: narrative tenses, modals, passives, conditionals, indirect questions, and hedging.',
    language_points: [
      'Use conditional trade-offs ("If your team covers X, we could absorb Y") inside multi-party negotiation.',
    ],
    language_q: [
      {
        question: 'Which trade-off line best combines Module 3 conditionals with Module 4 diplomacy?',
        options: [
          'I was wondering if we might split the testing window—if your office handles Asia-Pacific hours, we could cover European sign-off.',
          'You do everything or nothing.',
          'If we had did it, we align.',
        ],
        answer: 'I was wondering if we might split the testing window—if your office handles Asia-Pacific hours, we could cover European sign-off.',
        explanation: 'Combines indirect framing with a clear 2nd conditional trade-off.',
      },
      {
        question: 'What weight does the Mid-Course Diagnostic carry in the overall course assessment?',
        options: ['15%', '50%', '5%'],
        answer: '15%',
        explanation: 'Assessment breakdown: 25% participation/logs, 15% Hour 32 mid-course, 25% Hour 62 listening, 35% B2 capstone.',
      },
    ],
    listening_focus: 'Multi-party negotiation audio tracking three competing stakeholder priorities (budget, deadline, quality).',
    listening_extract: '"If engineering needs ten more days for security audits, could marketing launch a beta preview for early partners in the meantime?"',
    listening_points: [
      'Identify common ground across three speakers with different priorities.',
    ],
    listening_q: [
      {
        question: 'How does the speaker bridge engineering\'s delay and marketing\'s launch target?',
        options: [
          'Proposing a limited beta preview while security audits finish',
          'Skipping security audits entirely',
          'Firing the marketing team',
        ],
        answer: 'Proposing a limited beta preview while security audits finish',
        explanation: 'Creative phasing resolves competing deadlines.',
      },
      {
        question: 'Why are multi-party negotiations harder than 1-on-1 dialogues?',
        options: [
          'You must track and synthesize multiple constraints simultaneously while keeping turn-taking polite.',
          'Nobody is allowed to ask questions.',
          'Only past tense is permitted.',
        ],
        answer: 'You must track and synthesize multiple constraints simultaneously while keeping turn-taking polite.',
        explanation: 'Multi-party mediation is a core B2 communication skill.',
      },
    ],
    speaking_pragmatics: 'Multi-party negotiation role-play followed by a 30-minute diagnostic speaking check (Hour 32).',
    speaking_points: [
      'Summarize areas of agreement, propose conditional compromises, and reflect on personal B1→B2 progress.',
    ],
    speaking_q: [
      {
        question: 'What is the purpose of the 30-minute diagnostic speaking check after the role-play?',
        options: [
          'Evaluate Modules 1–4 progress across fluency, lexis, grammar, and prosody and set second-half targets',
          'End the course early',
          'Test memorization of dictionary pages',
        ],
        answer: 'Evaluate Modules 1–4 progress across fluency, lexis, grammar, and prosody and set second-half targets',
        explanation: 'Mid-course diagnostics guide targeted improvement in Modules 5–8.',
      },
      {
        question: 'Which phrase cleanly summarizes multi-party agreement?',
        options: [
          'So, to confirm where we\'ve aligned: we\'ll phase the launch and touch base on Friday.',
          'Whatever, goodbye.',
          'Nobody agreed on anything.',
        ],
        answer: 'So, to confirm where we\'ve aligned: we\'ll phase the launch and touch base on Friday.',
        explanation: 'Explicitly confirms shared next steps.',
      },
    ],
    objectives: 'Complete the Hour 32 multi-party cross-cultural negotiation and mid-course diagnostic speaking check.',
    homework: 'Submit your Mid-Course Diagnostic reflection & 2-minute audio journal identifying one pronunciation and one grammar target for Weeks 9–16.',
  },

  // MODULE 5: Health, Psychology & Modern Lifestyles (Sessions 17-20)
  {
    session_number: 17,
    module_number: 5,
    module_session_number: 1,
    unit_title: 'Wellbeing, Burnout & Work-Life Balance',
    title: 'Wellbeing, Burnout & Question Tag Intonation',
    pronunciation_focus: 'Question tag intonation (rising intonation for genuine inquiry vs. falling intonation for shared consensus).',
    pronunciation_extract: 'Constant notifications increase cognitive load, don\'t they? ↘ (consensus) vs. You haven\'t tried a digital sunset yet, have you? ↗ (genuine inquiry)',
    pronunciation_points: [
      'Falling tag intonation (↘): you expect agreement / shared consensus.',
      'Rising tag intonation (↗): you genuinely aren\'t sure and want confirmation.',
    ],
    pronunciation_q: [
      {
        question: 'When a speaker says "Burnout affects creativity, doesn\'t it? ↘" with FALLING intonation, what do they mean?',
        options: [
          'They are inviting shared agreement / consensus.',
          'They have no idea and are guessing.',
          'They disagree completely.',
        ],
        answer: 'They are inviting shared agreement / consensus.',
        explanation: 'Falling tags seek confirmation of a shared view.',
      },
      {
        question: 'When do you use RISING intonation (↗) on a question tag?',
        options: [
          'When asking a genuine question to check uncertain information',
          'When reading a shopping list',
          'When stating your own birthday',
        ],
        answer: 'When asking a genuine question to check uncertain information',
        explanation: 'Rising pitch turns the tag into a real information check.',
      },
    ],
    grammar_lexis: 'Gerunds vs. infinitives after complex verbs (regret, stop, remember, go on); psychology/wellbeing vocabulary (resilience, burnout, mindfulness, cognitive load).',
    language_points: [
      '"Stop checking email" (quit the habit) vs. "Stop to breathe" (pause in order to breathe).',
      '"Remember to disconnect" (future duty) vs. "Remember feeling exhausted" (past memory).',
    ],
    language_q: [
      {
        question: 'What is the difference between "I stopped checking Slack at 8pm" and "I stopped to check Slack"?',
        options: [
          'The first means quitting the habit; the second means pausing another task in order to check Slack.',
          'They mean the exact same thing.',
          'The second is past perfect.',
        ],
        answer: 'The first means quitting the habit; the second means pausing another task in order to check Slack.',
        explanation: 'Gerund vs. infinitive changes meaning after stop, remember, regret, and go on.',
      },
      {
        question: 'Which term describes the total mental effort held in working memory at one time?',
        options: ['cognitive load', 'resilience', 'mindfulness'],
        answer: 'cognitive load',
        explanation: 'Excessive multitasking drives up cognitive load and accelerates burnout.',
      },
    ],
    listening_focus: 'Workplace psychology interview on burnout recovery and rebuilding resilience.',
    listening_extract: '"I regret ignoring the early signs of burnout. Once I stopped replying to messages at midnight and remembered to take proper lunches, my focus bounced back."',
    listening_points: [
      'Spot meaning-changing gerund/infinitive verbs in personal wellbeing stories.',
    ],
    listening_q: [
      {
        question: 'What does "I regret ignoring the early signs" express?',
        options: [
          'Sorrow about a past action',
          'Giving polite bad news right now',
          'A future plan',
        ],
        answer: 'Sorrow about a past action',
        explanation: '"Regret + -ing" looks back on a past choice.',
      },
      {
        question: 'Which habit helped restore the speaker\'s focus?',
        options: [
          'Stopping midnight replies and taking proper lunch breaks',
          'Working 14 hours straight',
          'Drinking more espresso at 11pm',
        ],
        answer: 'Stopping midnight replies and taking proper lunch breaks',
        explanation: 'Clear recovery boundaries lowered cognitive load.',
      },
    ],
    speaking_pragmatics: 'Discussing burnout, resilience, and cognitive load using natural question tags.',
    speaking_points: [
      'Vary rising and falling tags to check assumptions vs. build conversational rapport.',
    ],
    speaking_q: [
      {
        question: 'Which sentence uses "go on + infinitive" correctly?',
        options: [
          'She started with mindfulness workshops and went on to redesign her team\'s schedule.',
          'She went on to redesigning for hours.',
          'She regret to ignore burnout.',
        ],
        answer: 'She started with mindfulness workshops and went on to redesign her team\'s schedule.',
        explanation: '"Go on + to-infinitive" means moving on to a new, subsequent action.',
      },
      {
        question: 'What does "resilience" mean in psychology?',
        options: [
          'The capacity to recover and adapt constructively after stress or setbacks',
          'Never feeling tired',
          'Refusing all feedback',
        ],
        answer: 'The capacity to recover and adapt constructively after stress or setbacks',
        explanation: 'Resilience is adaptive recovery, not invulnerability.',
      },
    ],
    objectives: 'Contrast gerunds vs. infinitives after complex verbs and use rising vs. falling question-tag intonation accurately.',
    homework: 'Write 6 paired sentences showing the meaning contrast for stop, remember, and regret (-ing vs. to-infinitive) and record them with tag questions.',
  },
  {
    session_number: 18,
    module_number: 5,
    module_session_number: 2,
    unit_title: 'Wellbeing, Burnout & Work-Life Balance',
    title: 'Global Work-Life Balance & Habit Shifts',
    pronunciation_focus: 'Thought-group pausing and question tags in comparative lifestyle discussions.',
    pronunciation_extract: 'Right-to-disconnect laws / protect evening recovery, / don\'t they? ↘',
    pronunciation_points: [
      'Chunk unfamiliar cultural terms ("hygge", "ikigai") cleanly with brief pauses before explanations.',
    ],
    pronunciation_q: [
      {
        question: 'When introducing a borrowed cultural term like "ikigai", what helps international listeners?',
        options: [
          'Saying the term clearly, pausing briefly, then giving a concise gloss ("a sense of purpose")',
          'Rushing past it without context',
          'Spelling it out letter by letter every time',
        ],
        answer: 'Saying the term clearly, pausing briefly, then giving a concise gloss ("a sense of purpose")',
        explanation: 'Appositive pausing keeps cross-cultural vocabulary accessible.',
      },
      {
        question: 'Which tag correctly matches "Nobody wants constant burnout, ___?"',
        options: ['do they?', 'don\'t they?', 'isn\'t it?'],
        answer: 'do they?',
        explanation: 'Negative subject "nobody" takes an affirmative plural tag ("do they?").',
      },
    ],
    grammar_lexis: 'Complex gerund/infinitive structures + global wellbeing concepts: 4-day workweek trials, hygge, ikigai, right-to-disconnect laws.',
    language_points: [
      'Hygge (Danish): cosy, unhurried togetherness; Ikigai (Japanese): intersection of passion, mission, vocation, and profession.',
    ],
    language_q: [
      {
        question: 'What do "right-to-disconnect" laws establish?',
        options: [
          'Employees\' legal right not to answer work messages outside contracted hours',
          'Mandatory midnight check-ins',
          'A ban on smartphones in offices',
        ],
        answer: 'Employees\' legal right not to answer work messages outside contracted hours',
        explanation: 'Several countries protect off-hours rest through right-to-disconnect legislation.',
      },
      {
        question: 'Which sentence correctly uses "remember + -ing"?',
        options: [
          'I remember feeling much calmer during our four-day workweek pilot.',
          'I remember to feeling calmer last year.',
          'I stopped to working at 6pm.',
        ],
        answer: 'I remember feeling much calmer during our four-day workweek pilot.',
        explanation: '"Remember + -ing" recalls a past experience.',
      },
    ],
    listening_focus: 'Global panel comparing 4-day workweek trials in the UK/Iceland with Japanese ikigai and Nordic hygge.',
    listening_extract: '"Across the four-day week trial, firms didn\'t just cut hours—they stopped holding pointless status meetings, and staff went on to maintain 100% of output with lower burnout."',
    listening_points: [
      'Evaluate evidence from workweek trials vs. cultural habits.',
    ],
    listening_q: [
      {
        question: 'How did companies maintain output during the 4-day workweek trial?',
        options: [
          'By eliminating pointless status meetings and focusing deep-work blocks',
          'By doubling unpaid overtime',
          'By closing customer support',
        ],
        answer: 'By eliminating pointless status meetings and focusing deep-work blocks',
        explanation: 'Smarter workflow design compensated for fewer hours.',
      },
      {
        question: 'What does "ikigai" emphasize?',
        options: [
          'Purposeful living aligning what you love, are good at, the world needs, and can be paid for',
          'Working seven days a week',
          'Interior lighting only',
        ],
        answer: 'Purposeful living aligning what you love, are good at, the world needs, and can be paid for',
        explanation: 'Ikigai translates roughly as "reason for being".',
      },
    ],
    speaking_pragmatics: 'Comparing global approaches to work-life balance (4-day workweek trials, hygge, ikigai, right-to-disconnect laws).',
    speaking_points: [
      'Debate which policy or habit is most transferable to your own local context.',
    ],
    speaking_q: [
      {
        question: 'Which comparative point best evaluates a 4-day workweek for different sectors?',
        options: [
          'Knowledge teams can streamline meetings easily, whereas hospitals require staggered shift coverage.',
          'Every job on earth is identical.',
          'Nobody likes rest.',
        ],
        answer: 'Knowledge teams can streamline meetings easily, whereas hospitals require staggered shift coverage.',
        explanation: 'Distinguishing sector constraints shows B2 analytical depth.',
      },
      {
        question: 'Which tag question invites genuine curiosity in a seminar?',
        options: [
          'Your company hasn\'t piloted a 4-day week yet, has it? ↗',
          'Coffee is hot, isn\'t it? ↘',
          'Monday is Monday.',
        ],
        answer: 'Your company hasn\'t piloted a 4-day week yet, has it? ↗',
        explanation: 'Rising intonation checks genuine unknown information.',
      },
    ],
    objectives: 'Compare international work-life balance models fluently using complex verb patterns and calibrated question tags.',
    homework: 'Record a 90-second voice note comparing two global work-life concepts and recommending one habit shift for your sector.',
  },
  {
    session_number: 19,
    module_number: 5,
    module_session_number: 3,
    unit_title: 'Public Health & Longevity',
    title: 'Blue Zones & Reporting Scientific Findings',
    pronunciation_focus: 'Thought-group pausing and primary stress in academic reporting sentences.',
    pronunciation_extract: 'Longitudinal studies demonstrate / that daily social connection / strongly predicts longevity.',
    pronunciation_points: [
      'Pause cleanly right after the reporting verb + "that" boundary when clauses are long.',
      'Stress multi-syllable reporting verbs accurately (DEM-on-strate, at-TRIB-ute).',
    ],
    pronunciation_q: [
      {
        question: 'Where is the main word stress in "attribute" when used as a verb ("Researchers attribute longevity to...")?',
        options: ['at-TRIB-ute (second syllable)', 'AT-trib-ute (first syllable)', 'at-trib-UTE (third syllable)'],
        answer: 'at-TRIB-ute (second syllable)',
        explanation: 'Verb "atTRIBute" stresses the second syllable; noun "ATtribute" stresses the first.',
      },
      {
        question: 'Why pause briefly before a long "that"-clause in spoken summaries?',
        options: [
          'It separates the source/claim frame from the research finding for clarity.',
          'It deletes the reporting verb.',
          'It turns the statement into a question.',
        ],
        answer: 'It separates the source/claim frame from the research finding for clarity.',
        explanation: 'Thought-group pausing helps listeners process complex syntax.',
      },
    ],
    grammar_lexis: 'Reporting verbs for summarizing scientific findings (demonstrate, urge, warn against, attribute to); Blue Zones and preventative health lexis.',
    language_points: [
      'Pattern control: "demonstrate that + clause", "urge citizens to + verb", "warn against + -ing/noun", "attribute X to Y".',
    ],
    language_q: [
      {
        question: 'Which sentence uses the preposition and verb pattern for "warn against" accurately?',
        options: [
          'Epidemiologists warn against relying on ultra-processed foods.',
          'Epidemiologists warn against to rely on processed foods.',
          'Epidemiologists attribute against processed foods.',
        ],
        answer: 'Epidemiologists warn against relying on ultra-processed foods.',
        explanation: '"Warn against" is followed by a gerund (-ing) or noun phrase.',
      },
      {
        question: 'What are "Blue Zones"?',
        options: [
          'Regions globally with unusually high proportions of healthy centenarians and active longevity',
          'Subway zones in major cities',
          'Deep ocean trenches',
        ],
        answer: 'Regions globally with unusually high proportions of healthy centenarians and active longevity',
        explanation: 'Examples include Okinawa, Sardinia, Ikaria, Nicoya, and Loma Linda.',
      },
    ],
    listening_focus: 'Science documentary excerpt examining Blue Zones lifestyle factors.',
    listening_extract: '"Researchers attribute longevity in Okinawa and Sardinia not to extreme gym routines, but to natural daily movement, plant-forward diets, and tightly knit social circles."',
    listening_points: [
      'Separate causal attributions ("attribute X to Y") from misconceptions.',
    ],
    listening_q: [
      {
        question: 'What do researchers attribute Blue Zone longevity to?',
        options: [
          'Natural daily movement, plant-forward diets, and strong social circles',
          'Extreme marathon training only',
          'Living completely alone',
        ],
        answer: 'Natural daily movement, plant-forward diets, and strong social circles',
        explanation: 'Everyday habits and community ties drive preventative health.',
      },
      {
        question: 'Which reporting verb signals strong empirical evidence?',
        options: ['demonstrate', 'guess', 'rumour'],
        answer: 'demonstrate',
        explanation: '"Demonstrate" indicates clear evidence from data or studies.',
      },
    ],
    speaking_pragmatics: 'Summarizing public-health evidence accurately without overstating causation.',
    speaking_points: [
      'Use "Studies demonstrate that..." and "Clinicians urge..." to attribute claims clearly.',
    ],
    speaking_q: [
      {
        question: 'Which verb pattern correctly completes "Public health officials ___ communities to invest in walkable streets"?',
        options: ['urge', 'attribute', 'warn against'],
        answer: 'urge',
        explanation: '"Urge + object + to-infinitive" is the standard pattern.',
      },
      {
        question: 'Why avoid "proves 100%" when summarizing observational health studies?',
        options: [
          'Observational findings demonstrate associations rather than absolute single-cause proof.',
          'Because "prove" is not a verb.',
          'Because studies never use data.',
        ],
        answer: 'Observational findings demonstrate associations rather than absolute single-cause proof.',
        explanation: 'Precise reporting verbs match scientific nuance.',
      },
    ],
    objectives: 'Summarize Blue Zones and preventative health research using accurate reporting-verb grammar and thought-group pausing.',
    homework: 'Write a 140-word health brief using demonstrate, urge, warn against, and attribute to.',
  },
  {
    session_number: 20,
    module_number: 5,
    module_session_number: 4,
    unit_title: 'Public Health & Longevity',
    title: 'Public Health Panels & Preventative Longevity',
    milestone: 'Module 5 Synthesis',
    pronunciation_focus: 'Thought-group pausing and vocal contrast when synthesizing opposing panelist viewpoints.',
    pronunciation_extract: 'While Dr. Patel urged / earlier screening, / Dr. Lindqvist warned against / medicalizing normal ageing.',
    pronunciation_points: [
      'Use contrasting pitch peaks on paired subjects/verbs ("Patel urged" vs. "Lindqvist warned").',
    ],
    pronunciation_q: [
      {
        question: 'In "While Dr. Patel urged earlier screening, Dr. Lindqvist warned against...", which words should carry contrastive stress?',
        options: [
          'Patel / urged / screening vs. Lindqvist / warned / medicalizing',
          'While / against',
          'Dr. / normal',
        ],
        answer: 'Patel / urged / screening vs. Lindqvist / warned / medicalizing',
        explanation: 'Stressing the contrasting speakers and stances guides listeners smoothly.',
      },
      {
        question: 'How does thought-group pausing improve panel summaries?',
        options: [
          'It clearly separates Speaker A\'s recommendation from Speaker B\'s caution.',
          'It merges both opinions into one run-on sentence.',
          'It removes all pauses.',
        ],
        answer: 'It clearly separates Speaker A\'s recommendation from Speaker B\'s caution.',
        explanation: 'Pauses delineate attributions.',
      },
    ],
    grammar_lexis: 'Consolidating reporting verbs, gerunds/infinitives, and preventative public-health vocabulary.',
    language_points: [
      'Synthesize preventative care, urban walkability, sleep hygiene, and social prescribing.',
    ],
    language_q: [
      {
        question: 'Which sentence correctly synthesizes two Module 5 structures?',
        options: [
          'Clinicians warn against neglecting sleep and urge adults to maintain regular movement.',
          'Clinicians warn against to neglect sleep and urge adults maintaining movement.',
          'Clinicians attribute to neglect sleep.',
        ],
        answer: 'Clinicians warn against neglecting sleep and urge adults to maintain regular movement.',
        explanation: '"Warn against + -ing" and "urge + object + to-infinitive" are both exact.',
      },
      {
        question: 'What is "preventative health"?',
        options: [
          'Measures that reduce disease risk before illness develops (diet, screening, exercise, clean air)',
          'Emergency surgery only',
          'Ignoring medical advice',
        ],
        answer: 'Measures that reduce disease risk before illness develops (diet, screening, exercise, clean air)',
        explanation: 'Focuses on upstream lifestyle and screening.',
      },
    ],
    listening_focus: 'Global health documentaries and expert panel discussions on longevity and preventative policy.',
    listening_extract: '"Panelists agreed that longevity policy fails if it treats health solely as an individual willpower test; neighbourhood walkability and affordable fresh food matter just as much."',
    listening_points: [
      'Distinguish individual lifestyle advice from structural public-health policy.',
    ],
    listening_q: [
      {
        question: 'What limitation do the panelists identify in "individual willpower" health campaigns?',
        options: [
          'Environmental factors like walkable neighbourhoods and affordable fresh food heavily shape outcomes.',
          'Individual habits don\'t matter at all.',
          'Longevity only depends on vitamins.',
        ],
        answer: 'Environmental factors like walkable neighbourhoods and affordable fresh food heavily shape outcomes.',
        explanation: 'Environment and policy interact with personal habits.',
      },
      {
        question: 'What kind of listening texts define Sessions 19–20?',
        options: [
          'Global health documentaries and expert panel discussions',
          'Fictional fairy tales',
          'Airport gate announcements',
        ],
        answer: 'Global health documentaries and expert panel discussions',
        explanation: 'Matches the Module 5 curriculum.',
      },
    ],
    speaking_pragmatics: 'Panel synthesis & policy roundtable: designing a community longevity initiative.',
    speaking_points: [
      'Summarize documentary evidence with reporting verbs, then recommend community-level habits.',
    ],
    speaking_q: [
      {
        question: 'Which policy recommendation best reflects Blue Zones evidence?',
        options: [
          'Create car-light walkable plazas and intergenerational community hubs to reduce isolation.',
          'Require citizens to stay indoors.',
          'Remove all benches from parks.',
        ],
        answer: 'Create car-light walkable plazas and intergenerational community hubs to reduce isolation.',
        explanation: 'Supports natural movement and social connectedness.',
      },
      {
        question: 'Which Module 5 grammar item should appear in your spoken summary?',
        options: [
          'Reporting verbs (demonstrate, attribute to, warn against, urge) and complex gerunds/infinitives',
          'Only imperatives',
          'Only past continuous',
        ],
        answer: 'Reporting verbs (demonstrate, attribute to, warn against, urge) and complex gerunds/infinitives',
        explanation: 'Core Module 5 targets.',
      },
    ],
    objectives: 'Synthesize expert panel discussions on longevity using reporting verbs, gerunds/infinitives, and clear thought-group pausing.',
    homework: 'Record a 2-minute Module 5 Audio Journal summarizing a health documentary insight and one personal/community habit change.',
  },

  // MODULE 6: Media, Misinformation & Global Culture (Sessions 21-24)
  {
    session_number: 21,
    module_number: 6,
    module_session_number: 1,
    unit_title: 'Media Literacy & Critical Thinking',
    title: 'Contrastive Stress, Clefts & Media Framing',
    pronunciation_focus: 'Contrastive stress and cleft sentences ("What concerns experts most is...", "It wasn\'t the data that misled people, it was...").',
    pronunciation_extract: 'It wasn\'t the DATA / that misled readers, / it was the HEADLINE.',
    pronunciation_points: [
      'Hit the focused element in an "It-cleft" or "Wh-cleft" with a crisp pitch peak.',
      'De-accent the already-known relative clause ("that misled readers").',
    ],
    pronunciation_q: [
      {
        question: 'In "It wasn\'t the data that misled people, it was the framing", which two words take primary contrastive stress?',
        options: ['data and framing', 'it and was', 'that and the'],
        answer: 'data and framing',
        explanation: 'Cleft sentences spotlight the contrasted focus nouns.',
      },
      {
        question: 'What is the purpose of a Wh-cleft like "What concerns experts most is..."?',
        options: [
          'To build anticipation and spotlight the key issue immediately after "is"',
          'To ask a yes/no question',
          'To avoid naming any issue',
        ],
        answer: 'To build anticipation and spotlight the key issue immediately after "is"',
        explanation: 'Wh-clefts structure emphasis cleanly in speech and writing.',
      },
    ],
    grammar_lexis: 'It-clefts & Wh-clefts; media literacy lexis (sensationalism, bias, fact-checking, viral).',
    language_points: [
      'Framing: choosing certain angles, adjectives, or images to steer emotional reaction.',
      'Sensationalism: prioritizing shock or outrage over verified proportion.',
    ],
    language_q: [
      {
        question: 'Which term describes presenting news in an exaggerated way to provoke shock and clicks?',
        options: ['sensationalism', 'fact-checking', 'backshifting'],
        answer: 'sensationalism',
        explanation: 'Sensationalism trades accuracy for emotional impact.',
      },
      {
        question: 'Which cleft sentence correctly emphasizes the headline?',
        options: [
          'What triggered the viral backlash was the misleading headline.',
          'What triggered the viral backlash were misleading.',
          'It was the headline who triggered.',
        ],
        answer: 'What triggered the viral backlash was the misleading headline.',
        explanation: 'Wh-cleft takes singular "was" agreeing with the clause.',
      },
    ],
    listening_focus: 'Comparing two competing news broadcasts covering the exact same global policy announcement.',
    listening_extract: '"Notice how Outlet A describes the regulation as a \'bold safeguard,\' whereas Outlet B calls it a \'job-killing freeze.\' What differs isn\'t the underlying data—it\'s the framing."',
    listening_points: [
      'Spot loaded adjectives and selective omissions across two reports.',
    ],
    listening_q: [
      {
        question: 'What differs between Outlet A and Outlet B according to the analysis?',
        options: [
          'The framing and loaded adjectives, even though the underlying data is the same',
          'The country where the law was passed',
          'The date of the announcement',
        ],
        answer: 'The framing and loaded adjectives, even though the underlying data is the same',
        explanation: 'Word choice reveals editorial framing.',
      },
      {
        question: 'Which phrase is an example of loaded negative framing?',
        options: ['"job-killing freeze"', '"2.4% annual adjustment"', '"published on Tuesday"'],
        answer: '"job-killing freeze"',
        explanation: 'Emotionally charged adjectives steer reader judgment.',
      },
    ],
    speaking_pragmatics: 'Analyzing two news reports on the same global event to identify framing and bias.',
    speaking_points: [
      'Use cleft sentences ("What stands out in Report B is...") to pinpoint bias precisely.',
    ],
    speaking_q: [
      {
        question: 'Which spoken critique best uses a cleft sentence to diagnose media bias?',
        options: [
          'What makes the second article biased is that it omits every independent fact-check.',
          'The second article bad because short.',
          'It is fact-check who omitted.',
        ],
        answer: 'What makes the second article biased is that it omits every independent fact-check.',
        explanation: 'Clear Wh-cleft focusing on selective omission.',
      },
      {
        question: 'What should a reader do before resharing a viral claim?',
        options: [
          'Verify the primary source through independent fact-checking',
          'Share immediately if the headline feels dramatic',
          'Read only the comments',
        ],
        answer: 'Verify the primary source through independent fact-checking',
        explanation: 'Lateral reading and source verification stop misinformation.',
      },
    ],
    objectives: 'Use cleft sentences with contrastive stress to expose media framing, bias, and sensationalism.',
    homework: 'Compare two headlines on the same global news story and write/record 3 cleft sentences highlighting differences in framing.',
  },
  {
    session_number: 22,
    module_number: 6,
    module_session_number: 2,
    unit_title: 'Media Literacy & Critical Thinking',
    title: 'Reported Speech, Distancing & Fact-Checking',
    pronunciation_focus: 'Vocal neutrality and stress on distancing adverbs ("al-LEG-ed-ly", "re-PORT-ed-ly", "sources CLAIM").',
    pronunciation_extract: 'The leaked memo was reportedly / drafted months earlier, / though officials deny the claim.',
    pronunciation_points: [
      'Give distancing markers ("reportedly", "sources claim") clear rhythmic weight so attribution is never lost.',
    ],
    pronunciation_q: [
      {
        question: 'Why emphasize distancing words like "allegedly" or "sources claim" in spoken news summaries?',
        options: [
          'To signal clearly that the claim is unverified rather than proven fact',
          'To show you agree 100% with the rumour',
          'To speak faster',
        ],
        answer: 'To signal clearly that the claim is unverified rather than proven fact',
        explanation: 'Prosody reinforces epistemic caution.',
      },
      {
        question: 'Which syllable carries main stress in "allegedly"?',
        options: ['al-LEG-ed-ly (second syllable)', 'AL-legedly (first)', 'al-leged-LY (last)'],
        answer: 'al-LEG-ed-ly (second syllable)',
        explanation: '/əˈledʒɪdli/ stresses the second syllable.',
      },
    ],
    grammar_lexis: 'Reported speech with tense backshifting and distancing language (allegedly, reportedly, sources claim).',
    language_points: [
      'Backshift in past reporting: "We will audit the feed" → "Executives promised they would audit the feed."',
      'Distancing language protects journalistic accuracy when facts remain disputed.',
    ],
    language_q: [
      {
        question: 'Which sentence correctly applies tense backshifting in reported speech?',
        options: [
          'The spokesperson stated that the platform had updated its verification policy the week before.',
          'The spokesperson stated that the platform will updated policy yesterday.',
          'The spokesperson said the platform update policy last week.',
        ],
        answer: 'The spokesperson stated that the platform had updated its verification policy the week before.',
        explanation: 'Past simple backshifts to past perfect ("had updated"), and "last week" shifts to "the week before".',
      },
      {
        question: 'Which word means "claimed to have happened without yet being proven"?',
        options: ['allegedly', 'undeniably', 'permanently'],
        answer: 'allegedly',
        explanation: '"Allegedly" marks an unproven allegation.',
      },
    ],
    listening_focus: 'Fact-checking podcast tracing how an unverified clip went viral before corrections appeared.',
    listening_extract: '"Early posts claimed the video had been filmed during yesterday\'s summit, yet reverse-image checks proved it had actually circulated three years earlier."',
    listening_points: [
      'Notice tense backshifting distinguishing early claims from verified timelines.',
    ],
    listening_q: [
      {
        question: 'How did fact-checkers debunk the viral summit clip?',
        options: [
          'Reverse-image checks showed it had circulated three years earlier.',
          'They guessed based on the music.',
          'They asked random commenters.',
        ],
        answer: 'Reverse-image checks showed it had circulated three years earlier.',
        explanation: 'Reverse-image/metadata checks verify provenance.',
      },
      {
        question: 'Why does the podcast use "had been filmed" and "had circulated"?',
        options: [
          'To place both reported events prior to the viral posts and checks',
          'To predict next year\'s summit',
          'To give an imperative command',
        ],
        answer: 'To place both reported events prior to the viral posts and checks',
        explanation: 'Past perfect anchors earlier timelines in reported accounts.',
      },
    ],
    speaking_pragmatics: 'Presenting a balanced fact-check briefing distinguishing verified facts from reported claims.',
    speaking_points: [
      'Report multiple sources neutrally using backshifted tenses and distancing adverbs.',
    ],
    speaking_q: [
      {
        question: 'Which briefing sentence handles an unverified claim responsibly?',
        options: [
          'Witnesses reportedly saw outages at noon, though the provider said engineers were still investigating the cause.',
          'The provider lied and broke everything on purpose!',
          'Outages happened maybe, whatever.',
        ],
        answer: 'Witnesses reportedly saw outages at noon, though the provider said engineers were still investigating the cause.',
        explanation: 'Balances "reportedly" with backshifted attribution ("said... were still investigating").',
      },
      {
        question: 'When is tense backshifting optional in English?',
        options: [
          'When reporting a general truth or statement that clearly remains valid right now',
          'Never under any circumstances',
          'Only in poetry',
        ],
        answer: 'When reporting a general truth or statement that clearly remains valid right now',
        explanation: 'Still-true facts can keep present tense, though backshifting is always safe in formal reporting.',
      },
    ],
    objectives: 'Apply tense backshifting and distancing language accurately when fact-checking viral media claims.',
    homework: 'Write a 150-word fact-check summary of a news claim using 3 reported speech structures and 2 distancing markers.',
  },
  {
    session_number: 23,
    module_number: 6,
    module_session_number: 3,
    unit_title: 'World Englishes & Global Pop Culture',
    title: 'World Englishes: Decoding Global Accents',
    pronunciation_focus: 'Accent awareness & global intelligibility: recognizing key vowel, /r/, and rhythm patterns across World Englishes.',
    pronunciation_extract: 'International conferences run on / diverse World Englishes — / clarity comes from / pacing, stress, and open listening.',
    pronunciation_points: [
      'Rhotic (/r/ pronounced after vowels: North American, Irish, Scottish, Indian) vs. non-rhotic (Southern British, Australian, NZ).',
      'Syllable-timed vs. stress-timed rhythm patterns in proficient European and Asian English speakers.',
    ],
    pronunciation_q: [
      {
        question: 'Which accent group is typically NON-rhotic (dropping post-vocalic /r/ in "car" or "park")?',
        options: [
          'Standard Southern British and Australian/New Zealand English',
          'General American and Irish English',
          'Canadian English',
        ],
        answer: 'Standard Southern British and Australian/New Zealand English',
        explanation: 'RP/Southern British and Aus/NZ drop /r/ unless followed by a vowel.',
      },
      {
        question: 'What makes a speaker globally intelligible across World Englishes?',
        options: [
          'Clear word stress, thought-group pausing, and consonant clarity—not mimicking one regional accent',
          'Speaking as fast as possible with local slang',
          'Imitating only 19th-century royalty',
        ],
        answer: 'Clear word stress, thought-group pausing, and consonant clarity—not mimicking one regional accent',
        explanation: 'Global intelligibility values clarity across all proficient varieties.',
      },
    ],
    grammar_lexis: 'Lexis for linguistic & cultural diversity (World Englishes, lingua franca, local idiom, cultural hybridity, dubbing vs. subtitling).',
    language_points: [
      'English as a Lingua Franca (ELF): communication among speakers of varied native and non-native backgrounds.',
    ],
    language_q: [
      {
        question: 'What does "English as a Lingua Franca" refer to?',
        options: [
          'English used as a shared bridge language among speakers with different first languages',
          'A dialect spoken only in one village',
          'Machine translation software',
        ],
        answer: 'English used as a shared bridge language among speakers with different first languages',
        explanation: 'Most global English interactions occur among multilingual international speakers.',
      },
      {
        question: 'Which varieties are included in Session 23–24\'s accent exposure?',
        options: [
          'North American, British/Irish, Australian/New Zealand, Indian, and proficient European/Asian speakers',
          'Only one city accent',
          'Silent text only',
        ],
        answer: 'North American, British/Irish, Australian/New Zealand, Indian, and proficient European/Asian speakers',
        explanation: 'Directly mirrors the Module 6 PDF specification.',
      },
    ],
    listening_focus: 'Training the ear to understand diverse global English varieties—North American, British/Irish, Australian/NZ, Indian, and proficient European/Asian speakers in international conferences.',
    listening_extract: '"At last year\'s Mumbai tech summit, panelists from Dublin, Melbourne, Bengaluru, Zurich, and Seoul debated AI ethics seamlessly—each keeping their own accent while pacing key terms clearly."',
    listening_points: [
      'Decode unfamiliar vowel shifts or flapping/retroflex consonants using context and stress cues.',
    ],
    listening_q: [
      {
        question: 'How did panelists from five regions communicate seamlessly at the summit?',
        options: [
          'Each kept their authentic accent while pacing key terms and thought groups clearly.',
          'They all used a synthetic voice changer.',
          'They read only from slides without speaking.',
        ],
        answer: 'Each kept their authentic accent while pacing key terms and thought groups clearly.',
        explanation: 'Clarity and accommodation beat accent erasure.',
      },
      {
        question: 'When decoding an unfamiliar accent in real time, what helps most?',
        options: [
          'Focusing on stressed content words and clause context rather than panicking over one vowel',
          'Stopping listening at the first unfamiliar sound',
          'Interrupting after every syllable',
        ],
        answer: 'Focusing on stressed content words and clause context rather than panicking over one vowel',
        explanation: 'Top-down context + stressed anchors rapidly tune the ear.',
      },
    ],
    speaking_pragmatics: 'Accommodating international listeners in Q&A without sacrificing your own voice.',
    speaking_points: [
      'Practice comprehension-checking and gentle paraphrasing in multi-accent exchanges.',
    ],
    speaking_q: [
      {
        question: 'Which clarification request is polite and constructive in an international conference?',
        options: [
          'Could you just clarify that last figure—did you mean 15 or 50 percent?',
          'Speak properly, I can\'t understand your accent.',
          'Ignore the number and guess.',
        ],
        answer: 'Could you just clarify that last figure—did you mean 15 or 50 percent?',
        explanation: 'Targets the specific ambiguity respectfully.',
      },
      {
        question: 'Why does exposure to multiple accents prepare learners for the Hour 62 exam?',
        options: [
          'The Hour 62 Final Multi-Accent Listening Assessment tests podcasts, panels, and news across diverse accents without transcripts.',
          'The exam is only written multiple choice.',
          'Only one narrator speaks in the exam.',
        ],
        answer: 'The Hour 62 Final Multi-Accent Listening Assessment tests podcasts, panels, and news across diverse accents without transcripts.',
        explanation: 'Builds ear adaptability ahead of Module 8.',
      },
    ],
    objectives: 'Decode diverse World Englishes varieties confidently and apply listener-friendly pacing in international exchanges.',
    homework: 'Listen to two 3-minute conference/podcast clips in two distinct global English accents and note 3 pronunciation features you noticed.',
  },
  {
    session_number: 24,
    module_number: 6,
    module_session_number: 4,
    unit_title: 'World Englishes & Global Pop Culture',
    title: 'Global Pop Culture vs. Local Preservation',
    milestone: 'Module 6 Synthesis',
    pronunciation_focus: 'Integrating contrastive stress and multi-accent listening agility in cultural debates.',
    pronunciation_extract: 'What streaming platforms offer / is global reach, / yet local cinema preserves / irreplaceable nuance.',
    pronunciation_points: [
      'Maintain crisp contrast between global reach and local nuance using cleft emphasis.',
    ],
    pronunciation_q: [
      {
        question: 'Which words carry primary contrastive stress in "What streaming offers is reach, yet local cinema preserves nuance"?',
        options: ['reach and nuance (plus streaming vs. local cinema)', 'what and yet', 'is and offers'],
        answer: 'reach and nuance (plus streaming vs. local cinema)',
        explanation: 'Contrasted concepts take the sharpest pitch peaks.',
      },
      {
        question: 'Why use cleft sentences in cultural debates?',
        options: [
          'They sharpen thesis claims and highlight subtle distinctions cleanly.',
          'They replace all adjectives.',
          'They avoid giving examples.',
        ],
        answer: 'They sharpen thesis claims and highlight subtle distinctions cleanly.',
        explanation: 'Clefts elevate B2 argumentative precision.',
      },
    ],
    grammar_lexis: 'Integrated cleft sentences, reported speech, and global culture vocabulary (cinema, music, cuisine, fusion, authenticity, homogenization).',
    language_points: [
      'Evaluate cultural exchange vs. homogenization across cinema, music, and cuisine.',
    ],
    language_q: [
      {
        question: 'What does "cultural homogenization" warn against?',
        options: [
          'Local traditions, languages, and art forms being flattened into identical global commercial templates',
          'Translating local novels into English',
          'Teaching traditional recipes to tourists',
        ],
        answer: 'Local traditions, languages, and art forms being flattened into identical global commercial templates',
        explanation: 'Homogenization erodes local diversity.',
      },
      {
        question: 'Which sentence combines reported speech with cultural debate lexis?',
        options: [
          'Independent directors argued that global streaming funds had helped regional films reach wider audiences.',
          'Directors said global funds help yesterday.',
          'What directors argued was biasly.',
        ],
        answer: 'Independent directors argued that global streaming funds had helped regional films reach wider audiences.',
        explanation: 'Correctly backshifts "had helped" inside reported speech.',
      },
    ],
    listening_focus: 'Roundtable debate featuring film critics and chefs from Seoul, Lagos, Dublin, and Barcelona on global pop culture vs. local heritage.',
    listening_extract: '"Subtitles broke down the old barrier—audiences didn\'t need a Hollywood remake to love Korean or Catalan cinema; they wanted authentic local stories."',
    listening_points: [
      'Synthesize arguments across multi-accent speakers without relying on transcripts.',
    ],
    listening_q: [
      {
        question: 'According to the critic, what changed global audiences\' openness to regional cinema?',
        options: [
          'Subtitles removed the barrier, letting authentic local stories travel without remakes.',
          'Films stopped using dialogue.',
          'Cinemas banned local languages.',
        ],
        answer: 'Subtitles removed the barrier, letting authentic local stories travel without remakes.',
        explanation: 'Authenticity travels globally when translation barriers drop.',
      },
      {
        question: 'Which cultural domains are discussed in Session 24?',
        options: ['Cinema, music, and cuisine', 'Only tax law', 'Only aerospace engineering'],
        answer: 'Cinema, music, and cuisine',
        explanation: 'Matches the PDF Module 6 discussion focus.',
      },
    ],
    speaking_pragmatics: 'Structured debate: cultural globalization vs. local preservation in cinema, music, and cuisine.',
    speaking_points: [
      'Cite concrete examples from two regions and defend a balanced synthesis.',
    ],
    speaking_q: [
      {
        question: 'Which stance exemplifies nuanced B2 argumentation on globalization?',
        options: [
          'Global platforms can fund local artists, provided distribution doesn\'t pressure them to strip away regional identity.',
          'Everything global is evil.',
          'Food and music never mix.',
        ],
        answer: 'Global platforms can fund local artists, provided distribution doesn\'t pressure them to strip away regional identity.',
        explanation: 'Balances opportunity with preservation conditions.',
      },
      {
        question: 'Which Module 6 structures belong in your Module 6 Audio Journal?',
        options: [
          'Cleft sentences, reported speech with distancing, and media/culture lexis',
          'Only present simple routines',
          'Only shopping imperatives',
        ],
        answer: 'Cleft sentences, reported speech with distancing, and media/culture lexis',
        explanation: 'Consolidates Module 6.',
      },
    ],
    objectives: 'Debate cultural globalization vs. local preservation across cinema, music, and cuisine using clefts and reported speech.',
    homework: 'Record a 2-minute Module 6 Audio Journal analyzing one global cultural trend (film, music, or food) and its local impact.',
  },

  // MODULE 7: Economics, Innovation & Social Change (Sessions 25-28)
  {
    session_number: 25,
    module_number: 7,
    module_session_number: 1,
    unit_title: 'Global Trade, Entrepreneurship & Ethics',
    title: 'Stress-Timing & Relative Clauses in Global Trade',
    pronunciation_focus: 'Stress-timing mastery—maintaining steady rhythmic beats across complex multi-clause B2 arguments.',
    pronunciation_extract: 'The SUPPLY chain, / which SPANs three CONtinents, / depends on FAIRer WAges.',
    pronunciation_points: [
      'Keep equal rhythmic intervals between stressed beats even when unstressed syllables multiply inside relative clauses.',
      'Mark non-defining relative clauses (", which spans three continents,") with slight pitch drop and boundary pauses.',
    ],
    pronunciation_q: [
      {
        question: 'What is "stress-timing" in spoken English?',
        options: [
          'Stressed syllables occur at roughly regular rhythmic intervals while unstressed syllables compress in between.',
          'Every syllable has identical duration and loudness.',
          'You pause after every single word.',
        ],
        answer: 'Stressed syllables occur at roughly regular rhythmic intervals while unstressed syllables compress in between.',
        explanation: 'Stress-timing keeps multi-clause B2 arguments fluid and rhythmic.',
      },
      {
        question: 'How do commas around a non-defining relative clause (", which...") affect speech?',
        options: [
          'They correspond to brief boundary pauses and a slightly lower parenthetical pitch.',
          'They require shouting the clause.',
          'They delete the verb.',
        ],
        answer: 'They correspond to brief boundary pauses and a slightly lower parenthetical pitch.',
        explanation: 'Prosodic parenthesis signals non-essential extra information.',
      },
    ],
    grammar_lexis: 'Defining and non-defining relative clauses; economic and social impact vocabulary (supply chain, fair trade, social enterprise, grassroots, disparity).',
    language_points: [
      'Defining ("Companies that audit suppliers...") vs. non-defining ("Fair trade, which guarantees minimum prices, ...").',
      'Never use "that" after a comma in non-defining relative clauses.',
    ],
    language_q: [
      {
        question: 'Which sentence uses a non-defining relative clause accurately?',
        options: [
          'Social enterprises, which reinvest profits into community goals, are reshaping local services.',
          'Social enterprises, that reinvest profits into community goals, are reshaping services.',
          'Social enterprises, what reinvest profits, are growing.',
        ],
        answer: 'Social enterprises, which reinvest profits into community goals, are reshaping local services.',
        explanation: 'Non-defining clauses use "which/who" (never "that") inside commas.',
      },
      {
        question: 'What does "grassroots" mean in social change?',
        options: [
          'Initiatives driven from the ground up by ordinary citizens and local communities',
          'Policies written exclusively by central banks',
          'Botanical farming only',
        ],
        answer: 'Initiatives driven from the ground up by ordinary citizens and local communities',
        explanation: 'Grassroots movements originate locally.',
      },
    ],
    listening_focus: 'Economic documentary segment on global supply chains, fair trade, and wage disparity.',
    listening_extract: '"Coffee farmers, who often absorb the sharpest price shocks in the supply chain, gained predictable income once cooperatives partnered with certified fair-trade roasters."',
    listening_points: [
      'Track main clause vs. embedded relative-clause detail smoothly.',
    ],
    listening_q: [
      {
        question: 'What problem did fair-trade partnerships solve for coffee farmers in the clip?',
        options: [
          'They stabilized income against sharp supply-chain price shocks.',
          'They eliminated coffee roasting.',
          'They stopped exports completely.',
        ],
        answer: 'They stabilized income against sharp supply-chain price shocks.',
        explanation: 'Predictable pricing shields producers from volatility.',
      },
      {
        question: 'In "Coffee farmers, who often absorb...", is the relative clause defining or non-defining?',
        options: ['Non-defining (adds extra context inside commas)', 'Defining', 'Conditional'],
        answer: 'Non-defining (adds extra context inside commas)',
        explanation: 'Commas + "who" add supplementary commentary.',
      },
    ],
    speaking_pragmatics: 'Explaining complex economic chains using multi-clause relative structures and steady rhythmic beats.',
    speaking_points: [
      'Pack clear detail into relative clauses without losing your main-clause verb.',
    ],
    speaking_q: [
      {
        question: 'Which spoken sentence maintains clear grammar across a multi-clause argument?',
        options: [
          'A grassroots cooperative that controls its own roasting keeps far more value inside the local economy.',
          'A grassroots cooperative which it controls roasting keeping value.',
          'Value kept by grassroots that.',
        ],
        answer: 'A grassroots cooperative that controls its own roasting keeps far more value inside the local economy.',
        explanation: 'Clean defining relative clause + singular main verb "keeps".',
      },
      {
        question: 'What does "disparity" mean in economic discussion?',
        options: ['A marked, often unfair gap or inequality', 'Equal distribution', 'Rapid shipment'],
        answer: 'A marked, often unfair gap or inequality',
        explanation: 'E.g., income or regional disparity.',
      },
    ],
    objectives: 'Maintain steady stress-timed rhythm across complex defining and non-defining relative clauses about global trade.',
    homework: 'Practice rhythmic clapping/shadowing on 5 multi-clause trade sentences with relative clauses.',
  },
  {
    session_number: 26,
    module_number: 7,
    module_session_number: 2,
    unit_title: 'Global Trade, Entrepreneurship & Ethics',
    title: 'Ethical Consumerism & CSR Case Studies',
    pronunciation_focus: 'Stress-timing and parenthetical clarity when critiquing corporate case studies.',
    pronunciation_extract: 'Corporate social responsibility, / when backed by independent audits, / can meaningfully cut supply-chain disparity.',
    pronunciation_points: [
      'Keep parenthetical qualifiers ("when backed by independent audits") crisp without slowing the entire argument down.',
    ],
    pronunciation_q: [
      {
        question: 'Where should rhythmic beats land in "Ethical consumerism relies on transparent supply chains"?',
        options: [
          'ETH-ical con-SUM-erism re-LIES on trans-PAR-ent sup-PLY CHAINS',
          'on, and, the',
          'Every syllable equally',
        ],
        answer: 'ETH-ical con-SUM-erism re-LIES on trans-PAR-ent sup-PLY CHAINS',
        explanation: 'Primary word stresses anchor the beat.',
      },
      {
        question: 'What happens to "on" and "by" in stress-timed speech?',
        options: ['They stay short and unstressed between content beats.', 'They take double stress.', 'They are deleted from writing.'],
        answer: 'They stay short and unstressed between content beats.',
        explanation: 'Short function words preserve steady rhythmic timing.',
      },
    ],
    grammar_lexis: 'Relative clauses + CSR & social enterprise case studies (ethical consumerism, fair trade, disparity, accountability).',
    language_points: [
      'Evaluate whether CSR initiatives change core business practices or merely polish PR.',
    ],
    language_q: [
      {
        question: 'What distinguishes a "social enterprise" from traditional charity?',
        options: [
          'It generates commercial revenue while pursuing a measurable social or environmental mission.',
          'It forbids all revenue.',
          'It distributes profits solely to passive shareholders.',
        ],
        answer: 'It generates commercial revenue while pursuing a measurable social or environmental mission.',
        explanation: 'Social enterprises blend sustainable business models with social impact.',
      },
      {
        question: 'Choose the best relative pronoun: "The factory ___ workers formed a cooperative doubled safety compliance."',
        options: ['whose', 'which', 'what'],
        answer: 'whose',
        explanation: '"Whose" shows possession ("the factory\'s workers").',
      },
    ],
    listening_focus: 'Two CSR case studies: an apparel brand publishing tier-2 supplier wages vs. a cosmetics brand accused of performative pledges.',
    listening_extract: '"Consumers who want ethical goods shouldn\'t have to decode vague badges; true CSR publishes living-wage audits across every tier of the supply chain."',
    listening_points: [
      'Identify verifiable accountability metrics in CSR reports.',
    ],
    listening_q: [
      {
        question: 'What differentiates verifiable CSR from vague marketing according to the clip?',
        options: [
          'Publishing living-wage audits across every tier of the supply chain',
          'Printing nicer badges on packaging',
          'Using green logos',
        ],
        answer: 'Publishing living-wage audits across every tier of the supply chain',
        explanation: 'Tier-by-tier transparency proves real impact.',
      },
      {
        question: 'Which relative clause appears in the extract?',
        options: ['"who want ethical goods"', '"across every tier"', '"shouldn\'t have to"'],
        answer: '"who want ethical goods"',
        explanation: 'Defining relative clause specifying which consumers.',
      },
    ],
    speaking_pragmatics: 'Evaluating ethical consumerism and corporate social responsibility (CSR) case studies.',
    speaking_points: [
      'Weigh consumer responsibility vs. corporate regulation in a structured case-study critique.',
    ],
    speaking_q: [
      {
        question: 'Which evaluation balances consumer action and regulation?',
        options: [
          'Ethical consumerism nudges brands forward, yet binding supply-chain rules remain essential for systemic change.',
          'Only shoppers can fix global trade.',
          'Audits do nothing.',
        ],
        answer: 'Ethical consumerism nudges brands forward, yet binding supply-chain rules remain essential for systemic change.',
        explanation: 'Combines market pressure with structural regulation.',
      },
      {
        question: 'Which relative adverb correctly completes "The region ___ the cooperative operates saw lower youth migration"?',
        options: ['where', 'which', 'whom'],
        answer: 'where',
        explanation: '"Where" refers to location ("in which").',
      },
    ],
    objectives: 'Evaluate ethical consumerism and CSR case studies using varied relative clauses and fluent stress-timing.',
    homework: 'Write a 150-word CSR case-study evaluation using 2 defining and 1 non-defining relative clause.',
  },
  {
    session_number: 27,
    module_number: 7,
    module_session_number: 3,
    unit_title: 'Persuasive Rhetoric & Public Speaking',
    title: 'Discourse Markers & Persuasive Signposting',
    pronunciation_focus: 'Pausing, pitch drop, and emphasis on advanced discourse markers (nonetheless, conversely, owing to, in light of).',
    pronunciation_extract: 'Global trade lifted millions out of poverty. / NONETHELESS, / regional disparities remain stark.',
    pronunciation_points: [
      'Give front-positioned discourse markers ("Nonetheless,", "Conversely,", "In light of this,") a clean pause afterwards so the pivot lands.',
    ],
    pronunciation_q: [
      {
        question: 'What should follow a fronted discourse marker like "Conversely," in a persuasive speech?',
        options: [
          'A crisp micro-pause so the listener prepares for the contrasting point',
          'Running the next five words together with no breath',
          'Dropping the volume completely',
        ],
        answer: 'A crisp micro-pause so the listener prepares for the contrasting point',
        explanation: 'Signposting pauses act like spoken punctuation.',
      },
      {
        question: 'Which marker introduces a direct contrast/opposite trend?',
        options: ['Conversely', 'Owing to', 'Moreover'],
        answer: 'Conversely',
        explanation: '"Conversely" introduces an opposite perspective or pattern.',
      },
    ],
    grammar_lexis: 'Advanced discourse markers for contrast, concession, and cause/effect: nonetheless, conversely, owing to, in light of.',
    language_points: [
      'Prepositional markers ("owing to", "in light of") take a noun phrase or -ing form—never a bare finite verb clause.',
      'Adverbial connectors ("nonetheless", "conversely") link full sentences or follow a semicolon.',
    ],
    language_q: [
      {
        question: 'Which sentence uses "owing to" grammatically?',
        options: [
          'Owing to rising shipping costs, local sourcing has regained momentum.',
          'Owing to shipping costs rose, local sourcing grew.',
          'Owing to because of costs, sourcing grew.',
        ],
        answer: 'Owing to rising shipping costs, local sourcing has regained momentum.',
        explanation: '"Owing to" is a preposition and takes a noun phrase ("rising shipping costs").',
      },
      {
        question: 'What does "in light of" mean?',
        options: [
          'Taking new evidence or circumstances into consideration',
          'During daytime hours only',
          'Instead of',
        ],
        answer: 'Taking new evidence or circumstances into consideration',
        explanation: '"In light of recent data..." introduces a reasoned update.',
      },
    ],
    listening_focus: 'Keynote speech excerpt demonstrating signposting, rhetorical questions, and concession pivots.',
    listening_extract: '"Owing to automation, output has surged; nonetheless, who captures those gains? In light of widening disparity, innovation must serve workers, not only shareholders."',
    listening_points: [
      'Notice how rhetorical questions hook listeners before the core thesis.',
    ],
    listening_q: [
      {
        question: 'What role does "who captures those gains?" play in the keynote excerpt?',
        options: [
          'A rhetorical question focusing attention on fair distribution before stating the thesis',
          'A quiz expecting audience members to shout numbers',
          'A grammatical error',
        ],
        answer: 'A rhetorical question focusing attention on fair distribution before stating the thesis',
        explanation: 'Rhetorical questions frame stakes vividly.',
      },
      {
        question: 'Which concession marker pivots from productivity surge to inequality?',
        options: ['nonetheless', 'owing to', 'for example'],
        answer: 'nonetheless',
        explanation: '"Nonetheless" signals concession + counter-claim.',
      },
    ],
    speaking_pragmatics: 'Drafting and vocalizing persuasive signposts and rhetorical questions for a 3-minute talk.',
    speaking_points: [
      'Combine hook → concession ("nonetheless") → causal evidence ("owing to / in light of") → call to action.',
    ],
    speaking_q: [
      {
        question: 'Which transition moves cleanly from problem evidence to proposed reform?',
        options: [
          'In light of these supply-chain gaps, what policy shift can close them?',
          'Anyway, next slide whatever.',
          'Because of therefore reform.',
        ],
        answer: 'In light of these supply-chain gaps, what policy shift can close them?',
        explanation: 'Pairs "in light of" with an engaging rhetorical question.',
      },
      {
        question: 'Which marker shows concession ("despite that fact")?',
        options: ['nonetheless', 'owing to', 'namely'],
        answer: 'nonetheless',
        explanation: '"Nonetheless" = in spite of that.',
      },
    ],
    objectives: 'Control advanced contrast, concession, and cause/effect discourse markers with deliberate vocal signposting.',
    homework: 'Outline your 3-minute persuasive talk for Session 28 using all 4 markers (nonetheless, conversely, owing to, in light of) and 2 rhetorical questions.',
  },
  {
    session_number: 28,
    module_number: 7,
    module_session_number: 4,
    unit_title: 'Persuasive Rhetoric & Public Speaking',
    title: '3-Minute Persuasive Talk & Rhetoric Workshop',
    milestone: 'Module 7 Persuasive Talk',
    pronunciation_focus: 'Full stress-timed rhetoric delivery: pacing, rhetorical pauses, and vocal variety across a 3-minute talk.',
    pronunciation_extract: 'Ask yourselves: / if a supply chain / cannot guarantee safe wages, / can we truly call it innovative?',
    pronunciation_points: [
      'Pause 1 second after a rhetorical question so the audience reflects before your answer.',
      'Keep stress-timed beats steady in your closing call to action.',
    ],
    pronunciation_q: [
      {
        question: 'Why pause briefly right after asking a rhetorical question in a 3-minute speech?',
        options: [
          'To let the question resonate with listeners before you deliver your answer',
          'To check your watch awkwardly',
          'To lower clarity',
        ],
        answer: 'To let the question resonate with listeners before you deliver your answer',
        explanation: 'Deliberate silence amplifies rhetorical force.',
      },
      {
        question: 'How does stress-timing help a 3-minute persuasive talk?',
        options: [
          'It creates confident, predictable rhythm even in long complex sentences.',
          'It eliminates all punctuation.',
          'It makes every word sound identical.',
        ],
        answer: 'It creates confident, predictable rhythm even in long complex sentences.',
        explanation: 'Rhythmic control signals B2 public-speaking command.',
      },
    ],
    grammar_lexis: 'Integrated Module 7 rhetoric: discourse markers, relative clauses, and social-impact lexis.',
    language_points: [
      'Rule of three, signposting ("First... Turning to... In light of..."), and clear closing synthesis.',
    ],
    language_q: [
      {
        question: 'Which closing sentence demonstrates strong B2 rhetorical structure?',
        options: [
          'In light of the evidence, social enterprises that empower grassroots producers aren\'t charity—they are smarter economics.',
          'Social enterprises good, thank you.',
          'Owing to they empower, it nice.',
        ],
        answer: 'In light of the evidence, social enterprises that empower grassroots producers aren\'t charity—they are smarter economics.',
        explanation: 'Combines discourse marker, relative clause, and punchy contrast.',
      },
      {
        question: 'What is the target duration for the Module 7 persuasive talk?',
        options: ['3 minutes', '30 seconds', '20 minutes'],
        answer: '3 minutes',
        explanation: 'Sessions 27–28 culminate in a structured 3-minute persuasive talk.',
      },
    ],
    listening_focus: 'Peer persuasive talks evaluated for signposting clarity, rhetorical hooks, and logical connectors.',
    listening_extract: '"First, let\'s look at the human cost; conversely, let\'s examine what happens when Fair-Trade cooperatives own processing locally."',
    listening_points: [
      'Log each speaker\'s thesis, signposts, discourse markers, and rhetorical hook.',
    ],
    listening_q: [
      {
        question: 'Which signposting strategy appears in the peer extract?',
        options: [
          'Ordinal framing ("First...") paired with a contrasting marker ("conversely...")',
          'Unstructured rambling',
          'Reading bullet fragments without verbs',
        ],
        answer: 'Ordinal framing ("First...") paired with a contrasting marker ("conversely...")',
        explanation: 'Clear signposts let listeners follow complex structure effortlessly.',
      },
      {
        question: 'What should peer feedback focus on after a 3-minute talk?',
        options: [
          'Clarity of signposting, discourse marker accuracy, and rhythmic pacing',
          'Whether the speaker memorized a script robotically',
          'Shoe choice',
        ],
        answer: 'Clarity of signposting, discourse marker accuracy, and rhythmic pacing',
        explanation: 'Targets communicative effectiveness.',
      },
    ],
    speaking_pragmatics: 'Delivering a structured 3-minute persuasive talk on a global social issue using signposting and rhetorical questions.',
    speaking_points: [
      'Maintain eye contact / camera presence, steady rhythm, and clear transitions.',
    ],
    speaking_q: [
      {
        question: 'If you lose your place mid-talk, what is the best B2 recovery strategy?',
        options: [
          'Pause calmly, use a signpost ("To put that concisely..."), and continue to your next main point.',
          'Apologize five times and stop speaking.',
          'Speak twice as fast.',
        ],
        answer: 'Pause calmly, use a signpost ("To put that concisely..."), and continue to your next main point.',
        explanation: 'Composed signposting preserves authority.',
      },
      {
        question: 'Which social issues fit Module 7 best?',
        options: [
          'Global trade equity, fair wages, social entrepreneurship, and economic disparity',
          'Favourite pizza toppings',
          'Alphabet song memorization',
        ],
        answer: 'Global trade equity, fair wages, social entrepreneurship, and economic disparity',
        explanation: 'Aligns with Module 7 global themes.',
      },
    ],
    objectives: 'Deliver a 3-minute persuasive talk on a global social issue using signposting, rhetorical questions, and discourse markers.',
    homework: 'Record a polished 3-minute take of your persuasive talk for your Module 7 Audio Journal.',
  },

  // MODULE 8: Fluency Synthesis & B2 Global Capstone (Sessions 29-32)
  {
    session_number: 29,
    module_number: 8,
    module_session_number: 1,
    unit_title: 'Intensive Shadowing & Fluency Integration',
    title: 'Keynote Shadowing Mastery & Prosody Integration',
    pronunciation_focus: 'End-to-end shadowing of international keynote speakers (TED / UN / global podcasts), integrating connected speech, thought-group pausing, and vocal emphasis.',
    pronunciation_extract: 'Progress isn\'t inevitable; / it is built / through deliberate choices, / shared accountability, / and cross-border trust.',
    pronunciation_points: [
      'Mirror timing, breath pauses, weak forms, linking, and pitch arcs simultaneously—not just individual words.',
      'Compare 0.85x accuracy shadowing with 1.0x full-speed delivery.',
    ],
    pronunciation_q: [
      {
        question: 'What makes "end-to-end shadowing" different from repeating isolated vocabulary?',
        options: [
          'You track real-time rhythm, thought-group pausing, weak forms, linking, and vocal emphasis simultaneously.',
          'You mute the speaker and read silently.',
          'You speak only vowels.',
        ],
        answer: 'You track real-time rhythm, thought-group pausing, weak forms, linking, and vocal emphasis simultaneously.',
        explanation: 'Shadowing integrates every prosodic layer into automatic speech muscle memory.',
      },
      {
        question: 'What sources are recommended for Session 29 shadowing?',
        options: [
          'International keynote speakers from TED, the UN, and global podcasts',
          'Robotic text-to-speech monotone beeps',
          'Single-syllable flashcards',
        ],
        answer: 'International keynote speakers from TED, the UN, and global podcasts',
        explanation: 'Authentic global keynotes model B2–C1 prosody.',
      },
    ],
    grammar_lexis: 'Integrated B2+ idioms and diplomatic hedging devices paired with high-impact keynote phrasing.',
    language_points: [
      'Idioms & hedging in synthesis: "bridge the divide", "level the playing field", "broadly speaking", "it stands to reason that".',
    ],
    language_q: [
      {
        question: 'Which idiom means creating fairer starting conditions for everyone?',
        options: ['level the playing field', 'miss the boat', 'cost an arm and a leg'],
        answer: 'level the playing field',
        explanation: 'Common in global policy, education, and economic discourse.',
      },
      {
        question: 'Which hedging phrase introduces a balanced generalization?',
        options: ['Broadly speaking', 'With 1000% certainty', 'Never ever'],
        answer: 'Broadly speaking',
        explanation: 'Signals nuanced generalization.',
      },
    ],
    listening_focus: 'UN / TED-style keynote extracts across multiple international speakers.',
    listening_extract: '"Broadly speaking, technology alone rarely levels the playing field; it is inclusive policy and local investment that turn breakthroughs into shared prosperity."',
    listening_points: [
      'Map breath groups and pitch peaks directly onto the speaker\'s transcript before shadowing.',
    ],
    listening_q: [
      {
        question: 'What does the keynote speaker argue turns breakthroughs into shared prosperity?',
        options: [
          'Inclusive policy and local investment alongside technology',
          'Hardware speed alone',
          'Ignoring regional differences',
        ],
        answer: 'Inclusive policy and local investment alongside technology',
        explanation: 'Policy and investment determine who benefits.',
      },
      {
        question: 'Which grammar structure adds emphasis to "inclusive policy and local investment"?',
        options: ['An "it-cleft" sentence ("it is X that turns...")', 'A past continuous verb', 'A question tag'],
        answer: 'An "it-cleft" sentence ("it is X that turns...")',
        explanation: 'Recycles Module 6 cleft focus naturally.',
      },
    ],
    speaking_pragmatics: 'Shadowing-to-spontaneous transfer: shifting from a 60-second shadowed keynote into original B2 commentary.',
    speaking_points: [
      'Carry the keynote\'s pacing and vocal energy straight into your own unscripted follow-up.',
    ],
    speaking_q: [
      {
        question: 'Why follow shadowing immediately with 60 seconds of unscripted speaking?',
        options: [
          'It transfers the rhythmic flow and prosody directly into spontaneous production.',
          'It erases everything you practiced.',
          'It makes you forget grammar.',
        ],
        answer: 'It transfers the rhythmic flow and prosody directly into spontaneous production.',
        explanation: 'Immediate transfer locks in fluency.',
      },
      {
        question: 'Which four features are combined during end-to-end shadowing?',
        options: [
          'Connected speech, weak forms, thought-group pausing, and vocal emphasis',
          'Silent reading, typing, spelling, and underlining',
          'Only vowel length',
        ],
        answer: 'Connected speech, weak forms, thought-group pausing, and vocal emphasis',
        explanation: 'Synthesizes all Modules 1–7 prosody labs.',
      },
    ],
    objectives: 'Shadow international keynote speakers end-to-end and carry integrated prosody into spontaneous B2 commentary.',
    homework: 'Complete a 2-part Shadowing Log: 60s mirrored keynote clip + 60s spontaneous response using the same pacing.',
  },
  {
    session_number: 30,
    module_number: 8,
    module_session_number: 2,
    unit_title: 'Intensive Shadowing & Fluency Integration',
    title: 'Cumulative B2 Grammar, Hedging & Idioms Synthesis',
    pronunciation_focus: 'Self-monitoring prosody under complex B2 syntax (conditionals + relative clauses + hedging).',
    pronunciation_extract: 'To a certain extent, / cities that invest early / will have built / far stronger resilience.',
    pronunciation_points: [
      'Avoid rushing through embedded clauses; use steady beats and light weak forms.',
    ],
    pronunciation_q: [
      {
        question: 'When speaking a complex sentence with both hedging and a relative clause, what keeps it intelligible?',
        options: [
          'Thought-group pauses at clause boundaries and steady stress-timing',
          'Saying it in one breathless rush',
          'Whispering the verbs',
        ],
        answer: 'Thought-group pauses at clause boundaries and steady stress-timing',
        explanation: 'Structural chunking keeps complex B2 syntax easy to follow.',
      },
      {
        question: 'Where do weak forms appear in "will have built far stronger resilience"?',
        options: ['"will have" (/wɪləv/)', '"built"', '"resilience"'],
        answer: '"will have" (/wɪləv/)',
        explanation: 'Auxiliaries reduce while content words stay prominent.',
      },
    ],
    grammar_lexis: 'Cumulative review of B2 grammar structures (narrative tenses, modals, passives, future perfect, conditionals, indirect questions, gerunds/infinitives, reported speech, clefts, relative clauses), hedging devices, and high-utility global idioms.',
    language_points: [
      'Cross-module fluency toolkit: combine 2+ B2 structures naturally in a single cohesive answer.',
    ],
    language_q: [
      {
        question: 'Which response integrates hedging, a conditional, and a global idiom smoothly?',
        options: [
          'To a certain extent, remote hubs help bridge the divide; however, if firms neglect mentorship, junior staff could fall behind.',
          'Remote hubs good if firms neglect.',
          'Bridge divide maybe yes.',
        ],
        answer: 'To a certain extent, remote hubs help bridge the divide; however, if firms neglect mentorship, junior staff could fall behind.',
        explanation: 'Blends hedging, idiom, 1st conditional, and modal speculation.',
      },
      {
        question: 'Which grammar structures belong to the cumulative Modules 1–7 review?',
        options: [
          'Conditionals, reported speech, clefts, passive voice, indirect questions, relative clauses, and discourse markers',
          'Present simple affirmative only',
          'Counting 1 to 20',
        ],
        answer: 'Conditionals, reported speech, clefts, passive voice, indirect questions, relative clauses, and discourse markers',
        explanation: 'Full B1→B2 grammatical range.',
      },
    ],
    listening_focus: 'Multi-topic rapid-fire listening synthesis (AI, climate, remote work, media, economics).',
    listening_extract: '"What struck observers wasn\'t just how quickly cities adapted, but how grassroots groups—who had long pushed for cleaner transit—helped turn emergency pilots into permanent policy."',
    listening_points: [
      'Recognize stacked B2 grammar (Wh-cleft + non-defining relative clause + past perfect) in fast speech.',
    ],
    listening_q: [
      {
        question: 'Who helped turn emergency transit pilots into permanent policy?',
        options: [
          'Grassroots groups who had long pushed for cleaner transit',
          'Airlines',
          'Car manufacturers',
        ],
        answer: 'Grassroots groups who had long pushed for cleaner transit',
        explanation: 'Explicitly stated inside the relative clause.',
      },
      {
        question: 'What are the 4 CEFR B2 rubric criteria evaluated in the final assessment?',
        options: [
          'Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Global Pronunciation/Prosody',
          'Spelling, Handwriting, Singing, and Typing',
          'Only Vocabulary',
        ],
        answer: 'Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Global Pronunciation/Prosody',
        explanation: 'Matches the Course Architecture rubric.',
      },
    ],
    speaking_pragmatics: 'Dress rehearsal for the 3-part B2 Speaking Capstone: spontaneous networking, 2-min monologue, and collaborative negotiation.',
    speaking_points: [
      'Practice timed 2-minute analytical monologues with clear thesis, two developed arguments, concession, and conclusion.',
    ],
    speaking_q: [
      {
        question: 'What is the ideal structure for a 2-minute analytical monologue?',
        options: [
          'Thesis & framing → Two evidence-backed points → Nuanced concession/counterpoint → Concise takeaway',
          'List ten unrelated words',
          'Speak for 15 seconds and stop',
        ],
        answer: 'Thesis & framing → Two evidence-backed points → Nuanced concession/counterpoint → Concise takeaway',
        explanation: 'Ensures coherence and full 2-minute development.',
      },
      {
        question: 'Why include a concession ("To some extent...", "Nonetheless...") in your monologue?',
        options: [
          'It demonstrates B2 critical balance rather than one-sided oversimplification.',
          'It contradicts your own thesis by accident.',
          'It wastes time.',
        ],
        answer: 'It demonstrates B2 critical balance rather than one-sided oversimplification.',
        explanation: 'Concession elevates both Coherence and Grammatical Range.',
      },
    ],
    objectives: 'Synthesize B2 grammar, hedging devices, and global idioms in timed dress-rehearsal speaking tasks.',
    homework: 'Complete a timed 2-minute mock monologue on a global trend and self-score against the 4 B2 rubric criteria.',
  },
  {
    session_number: 31,
    module_number: 8,
    module_session_number: 3,
    unit_title: 'Final B2 Global Assessment & Roadmap',
    title: 'Final Multi-Accent Listening Assessment (Hour 62)',
    milestone: 'Final Listening Exam (Hour 62 · 25% Assessment)',
    pronunciation_focus: 'Decoding multi-accent connected speech, elision, weak forms, and contrastive stress without transcripts.',
    pronunciation_extract: 'Listen for nuclear stress, / discourse signposts, / and attitude intonation / across unfamiliar accents.',
    pronunciation_points: [
      'Rely on acoustic anchors (stressed content words + discourse markers) rather than expecting transcript support.',
    ],
    pronunciation_q: [
      {
        question: 'How long is the Final Multi-Accent Listening Exam and what percentage of the course grade does it carry?',
        options: [
          '45 minutes · 25% of the final grade (Hour 62)',
          '10 minutes · 5%',
          '3 hours · 90%',
        ],
        answer: '45 minutes · 25% of the final grade (Hour 62)',
        explanation: 'Matches the PDF assessment specification.',
      },
      {
        question: 'Are transcripts available during the Final Multi-Accent Listening Exam?',
        options: [
          'No — comprehension is tested across authentic global clips without transcripts.',
          'Yes, full word-for-word scripts are provided first.',
          'Only translations are given.',
        ],
        answer: 'No — comprehension is tested across authentic global clips without transcripts.',
        explanation: 'Tests authentic B2 real-world listening.',
      },
    ],
    grammar_lexis: 'Cross-syllabus recognition: modality, reported distancing, cleft emphasis, discourse markers, and global lexis in authentic audio.',
    language_points: [
      'Distinguish fact vs. speculation vs. speaker attitude across fast multi-speaker clips.',
    ],
    language_q: [
      {
        question: 'If a panelist says "Sources reportedly claimed the trial cut emissions, though independent data hasn\'t confirmed it", what is the speaker\'s stance?',
        options: [
          'Cautious skepticism pending independent verification',
          'Unconditional endorsement',
          'Total topic change',
        ],
        answer: 'Cautious skepticism pending independent verification',
        explanation: 'Distancing + "though" signals unconfirmed status.',
      },
      {
        question: 'Which types of authentic audio appear in the Hour 62 Listening Exam?',
        options: [
          'Podcasts, panel debates, and news reports across multiple global English accents',
          'Alphabet chants only',
          'Single-word dictation only',
        ],
        answer: 'Podcasts, panel debates, and news reports across multiple global English accents',
        explanation: 'Directly specified in Sessions 31–32.',
      },
    ],
    listening_focus: 'Multi-Accent Listening Exam (45 min): comprehension of authentic global audio clips (podcasts, panel debates, news reports across multiple accents) without transcripts.',
    listening_extract: '"Across podcasts from Toronto, Dublin, Singapore, and Johannesburg, B2 listeners track main arguments, implied attitudes, and fine-grained factual detail on first or second hearing."',
    listening_points: [
      'Use note-taking shorthand for speaker names, attitudes, numbers, and causal links.',
    ],
    listening_q: [
      {
        question: 'Which note-taking strategy works best during a 45-minute multi-speaker listening exam?',
        options: [
          'Create columns per speaker and jot stressed keywords, attitudes (+/−), and connectors',
          'Try to transcribe every "the" and "a" word-for-word',
          'Write nothing at all',
        ],
        answer: 'Create columns per speaker and jot stressed keywords, attitudes (+/−), and connectors',
        explanation: 'Structured keyword notes keep pace with natural speech.',
      },
      {
        question: 'What should you listen for to catch a speaker\'s implied attitude?',
        options: [
          'Hedging words, question-tag pitch, and contrastive emphasis',
          'Background music volume',
          'Speaker height',
        ],
        answer: 'Hedging words, question-tag pitch, and contrastive emphasis',
        explanation: 'Pragmatics and prosody reveal stance.',
      },
    ],
    speaking_pragmatics: 'Post-exam debrief and final calibration warm-up ahead of the Hour 63–64 B2 Speaking Capstone.',
    speaking_points: [
      'Review listening takeaways and warm up spontaneous fluency for Session 32.',
    ],
    speaking_q: [
      {
        question: 'How does Session 31 prepare you for Session 32?',
        options: [
          'It completes the 45-minute Multi-Accent Listening Exam (Hour 62) and primes active global topics for the Speaking Capstone.',
          'It cancels Session 32.',
          'It switches to a different language.',
        ],
        answer: 'It completes the 45-minute Multi-Accent Listening Exam (Hour 62) and primes active global topics for the Speaking Capstone.',
        explanation: 'Completes the listening milestone before the final speaking capstone.',
      },
      {
        question: 'In a panel debate clip, what signals a speaker is about to concede a point before disagreeing?',
        options: [
          'Phrases like "To some extent...", "Granted...", or fall-rise intonation',
          'Saying "Goodbye"',
          'Clearing their throat silently',
        ],
        answer: 'Phrases like "To some extent...", "Granted...", or fall-rise intonation',
        explanation: 'Concession markers preview a pivot.',
      },
    ],
    objectives: 'Complete the 45-minute Hour 62 Multi-Accent Listening Assessment across global podcasts, panels, and news without transcripts.',
    homework: 'Lightly review your Module 1–8 hedging, idioms, and prosody notes ahead of the Session 32 B2 Speaking Capstone.',
  },
  {
    session_number: 32,
    module_number: 8,
    module_session_number: 4,
    unit_title: 'Final B2 Global Assessment & Roadmap',
    title: 'Final B2 Global Speaking Capstone & C1 Roadmap (Hours 63–64)',
    milestone: 'Final B2 Speaking Capstone (Hours 63–64 · 35% Assessment)',
    pronunciation_focus: 'Full B2 Global Pronunciation & Prosody evaluation: sentence stress, thought-group chunking, connected speech, weak forms, and diplomatic intonation.',
    pronunciation_extract: 'Deliver every capstone part with / steady stress-timed flow, / clear thought groups, / and adaptable international clarity.',
    pronunciation_points: [
      'Prioritize natural rhythm, clear nuclear stress, and polite interactive intonation across all three capstone parts.',
    ],
    pronunciation_q: [
      {
        question: 'What are the 3 parts of the 20-minute paired B2 Speaking Capstone?',
        options: [
          'Part 1: Spontaneous networking & opinion exchange (4 min); Part 2: Individual 2-min monologue analyzing a global trend/dilemma (4 min); Part 3: Collaborative cross-cultural problem-solving & compromise (6 min)',
          'Part 1: Reading aloud; Part 2: Spelling; Part 3: Silent writing',
          'Only a 1-minute introduction',
        ],
        answer: 'Part 1: Spontaneous networking & opinion exchange (4 min); Part 2: Individual 2-min monologue analyzing a global trend/dilemma (4 min); Part 3: Collaborative cross-cultural problem-solving & compromise (6 min)',
        explanation: 'Exact 3-part B2 Speaking Capstone structure from the Course Architecture PDF.',
      },
      {
        question: 'What weight does the Final B2 Global Speaking Capstone carry?',
        options: ['35%', '10%', '5%'],
        answer: '35%',
        explanation: 'The capstone is the largest single assessment component (35%).',
      },
    ],
    grammar_lexis: 'Full CEFR B2 rubric synthesis across Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Global Pronunciation/Prosody.',
    language_points: [
      'Deploy complex sentences, conditionals, reported distancing, relative clauses, hedging, and B2+ idioms naturally.',
    ],
    language_q: [
      {
        question: 'What personalized deliverable accompanies your final B2 rubric feedback?',
        options: [
          'Detailed CEFR B2 evaluation across the 4 rubric criteria plus a personalized C1 study plan',
          'A blank sheet of paper',
          'A refund receipt',
        ],
        answer: 'Detailed CEFR B2 evaluation across the 4 rubric criteria plus a personalized C1 study plan',
        explanation: 'Every learner exits with a concrete B2→C1 roadmap.',
      },
      {
        question: 'Which skill distinguishes Part 3 of the Speaking Capstone?',
        options: [
          'Collaborative cross-cultural problem-solving requiring active negotiation and compromise',
          'Speaking alone without listening to your partner',
          'Memorizing a dictionary list',
        ],
        answer: 'Collaborative cross-cultural problem-solving requiring active negotiation and compromise',
        explanation: 'Tests interactive mediation and diplomatic compromise.',
      },
    ],
    listening_focus: 'Active interactive listening during paired Part 1 networking and Part 3 cross-cultural problem-solving.',
    listening_extract: '"Building on your concern about cost, what if we pilot the remote-first schedule in two departments before rolling it out globally?"',
    listening_points: [
      'Listen closely to your partner\'s constraints in Part 3 so your compromise genuinely integrates their priorities.',
    ],
    listening_q: [
      {
        question: 'What shows strong interactive listening during Part 3 of the Capstone?',
        options: [
          'Referencing your partner\'s exact concern and proposing a middle-ground trade-off',
          'Waiting silently only to repeat your original speech',
          'Interrupting mid-sentence to change the topic',
        ],
        answer: 'Referencing your partner\'s exact concern and proposing a middle-ground trade-off',
        explanation: 'Interactive alignment is central to B2 Spoken Interaction.',
      },
      {
        question: 'In Part 2, how long is each individual analytical monologue?',
        options: ['2 minutes per speaker (4 min total per pair)', '30 seconds', '15 minutes'],
        answer: '2 minutes per speaker (4 min total per pair)',
        explanation: 'Each candidate delivers a 2-minute monologue analyzing a global trend or dilemma.',
      },
    ],
    speaking_pragmatics: 'B2 Speaking Capstone (20 min per pair): Part 1 Networking (4 min), Part 2 Monologue (4 min), Part 3 Collaborative Problem-Solving (6 min) + Individual Feedback & C1 Study Plan.',
    speaking_points: [
      'Balance spontaneous fluency, structured monologue coherence, and diplomatic negotiation.',
    ],
    speaking_q: [
      {
        question: 'Which approach maximizes your score across all 4 CEFR B2 rubric criteria?',
        options: [
          'Speak fluently with clear signposting, precise collocations, varied complex grammar, and intelligible prosody',
          'Use only 3-word sentences to avoid any mistake',
          'Ignore your partner in Part 3',
        ],
        answer: 'Speak fluently with clear signposting, precise collocations, varied complex grammar, and intelligible prosody',
        explanation: 'B2 rewards ambitious, well-controlled communication.',
      },
      {
        question: 'What is the next CEFR milestone mapped out in your individual feedback?',
        options: ['A personalized C1 study plan', 'CEFR A1', 'No further learning'],
        answer: 'A personalized C1 study plan',
        explanation: 'Bridges your B2 achievement toward C1 proficiency.',
      },
    ],
    objectives: 'Demonstrate CEFR B2 global fluency across all 3 Speaking Capstone parts and establish a personalized C1 study plan.',
    homework: 'Review your B2 rubric feedback and launch Week 1 of your personalized C1 study plan.',
  },
];

function buildBlocks(seed: RawSessionSeed): SessionBlockSpec[] {
  return [
    {
      block_number: 1,
      window: '00–25 min',
      start_minute: 0,
      end_minute: 25,
      block_type: 'pronunciation',
      title: 'Global Intelligibility: Connected Speech & Prosody Lab',
      description: seed.pronunciation_focus,
      focus: seed.pronunciation_focus,
      procedure: [
        'Warm-up ear calibration: contrast model phrasing against robotic word-by-word delivery.',
        `Targeted drill on Session ${seed.session_number} prosody: ${seed.pronunciation_focus}`,
        'Back-chaining and rhythmic shadowing on the model extract.',
        'Record a 30-second self-check take and compare stress/pausing against the model.',
      ],
      materials: ['Model audio extract', 'Stress & chunking guide', 'Voice recorder'],
      content: {
        text: `${seed.pronunciation_focus} Model extract: "${seed.pronunciation_extract}"`,
        key_points: seed.pronunciation_points,
        model_extract: seed.pronunciation_extract,
        exercises: seed.pronunciation_q,
      },
    },
    {
      block_number: 2,
      window: '25–65 min',
      start_minute: 25,
      end_minute: 65,
      block_type: 'language',
      title: 'High-Frequency Global Lexis: Collocations & Functional Grammar',
      description: seed.grammar_lexis,
      focus: seed.grammar_lexis,
      procedure: [
        'Guided discovery: inspect target structures and high-frequency collocations in context.',
        'Form, meaning, and pragmatics check using concept questions.',
        'Controlled transformation and error-repair drills.',
        'Personalized production: build 3 original sentences anchored to global topics.',
      ],
      materials: ['Collocation & grammar matrix', 'Contrastive examples', 'Writing Lab'],
      content: {
        text: seed.grammar_lexis,
        key_points: seed.language_points,
        exercises: seed.language_q,
      },
    },
    {
      block_number: 3,
      window: '65–95 min',
      start_minute: 65,
      end_minute: 95,
      block_type: 'listening',
      title: 'International Media & Multi-Accent Listening Comprehension',
      description: seed.listening_focus,
      focus: seed.listening_focus,
      procedure: [
        'Pre-listening prediction: activate topic vocabulary and anticipate accent/register cues.',
        'First listen for gist: identify speaker stance, main claim, and key turning points.',
        'Second listen for detail: capture evidence, target lexis, and pragmatic nuances.',
        'Post-listening oral summary without reading the script.',
      ],
      materials: ['Global media extract', 'Accent decoding notes', 'Comprehension check'],
      content: {
        text: seed.listening_focus,
        key_points: seed.listening_points,
        model_extract: seed.listening_extract,
        exercises: seed.listening_q,
      },
    },
    {
      block_number: 4,
      window: '95–120 min',
      start_minute: 95,
      end_minute: 120,
      block_type: 'speaking',
      title: 'Structured Debates, Case Studies & Cross-Cultural Speaking Tasks',
      description: seed.speaking_pragmatics,
      focus: seed.speaking_pragmatics,
      procedure: [
        'Task framing: 3-minute structured planning using Session lexis and discourse markers.',
        'Timed speaking task / debate / cross-cultural role-play in pairs or Speaking Lab.',
        'Self-assessment against B2 criteria (Fluency, Lexis, Grammar, Prosody).',
        'Targeted reformulation and homework audio journal launch.',
      ],
      materials: ['Debate / case-study prompt', '2-minute timer', 'B2 CEFR rubric'],
      content: {
        text: seed.speaking_pragmatics,
        key_points: seed.speaking_points,
        exercises: seed.speaking_q,
      },
    },
  ];
}

export const COURSE_SESSIONS: CourseSessionSpec[] = RAW_SESSIONS.map((seed) => ({
  id: sessionUuid(seed.session_number),
  session_number: seed.session_number,
  module_number: seed.module_number,
  module_session_number: seed.module_session_number,
  course_hour_end: seed.session_number * 2,
  unit_title: seed.unit_title,
  title: seed.title,
  duration_minutes: 120,
  description: `${seed.unit_title} — ${seed.objectives}`,
  objectives: seed.objectives,
  pronunciation_focus: seed.pronunciation_focus,
  grammar_lexis: seed.grammar_lexis,
  listening_focus: seed.listening_focus,
  speaking_pragmatics: seed.speaking_pragmatics,
  homework: seed.homework,
  milestone: seed.milestone,
  blocks: buildBlocks(seed),
}));

export function getModuleByNumber(moduleNumber: number): CourseModuleSpec | undefined {
  return COURSE_MODULES.find((m) => m.module_number === moduleNumber);
}

export function getSessionsForModule(moduleNumber: number): CourseSessionSpec[] {
  return COURSE_SESSIONS.filter((s) => s.module_number === moduleNumber);
}

export function getSessionByNumber(sessionNumber: number): CourseSessionSpec | undefined {
  return COURSE_SESSIONS.find((s) => s.session_number === sessionNumber);
}

export function getSessionByModuleAndLesson(moduleNumber: number, lessonNumber: number): CourseSessionSpec | undefined {
  return COURSE_SESSIONS.find(
    (s) => s.module_number === moduleNumber && s.module_session_number === lessonNumber,
  );
}
