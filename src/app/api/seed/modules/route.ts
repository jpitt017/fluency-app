// Force deployment trigger - Diagnostic version
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CURRICULUM_DATA = [
  {
    module_number: 1,
    title: "Cross-Cultural Connections & Identity",
    hours: "8 hrs (Sessions 1–4)",
    global_theme: "Cross-Cultural Connections & Identity",
    focus: "Narrative tenses, word stress & rhythm, storytelling, intercultural small talk & rapport.",
    sessions: [
      { session_number: 1, title: "Global Identities & Personal Milestones (Part 1)", focus: "Sentence stress and thought-group chunking for clear international intelligibility." },
      { session_number: 2, title: "Global Identities & Personal Milestones (Part 2)", focus: "Narrative tenses (past continuous, past perfect, used to / would) & cultural identity lexis." },
      { session_number: 3, title: "Travel, Adaptation & Culture Shock (Part 1)", focus: "Vowel clarity and eliminating intrusive syllable additions in consonant clusters." },
      { session_number: 4, title: "Travel, Adaptation & Culture Shock (Part 2)", focus: "Idioms and phrasal verbs for adaptation (step out of comfort zone, broaden horizons)." }
    ]
  },
  {
    module_number: 2,
    title: "Technology, AI & Digital Society",
    hours: "8 hrs (Sessions 5–8)",
    global_theme: "Technology, AI & Digital Society",
    focus: "Passive voice & speculation modals, weak forms (/ə/), evaluating tech ethics & media literacy.",
    sessions: [
      { session_number: 5, title: "Artificial Intelligence & The Future of Work (Part 1)", focus: "Weak forms and the schwa (/ə/) for function word reduction in fast speech." },
      { session_number: 6, title: "Artificial Intelligence & The Future of Work (Part 2)", focus: "Modals of deduction and speculation (must have, might be, could well lead to)." },
      { session_number: 7, title: "Social Media, Privacy & Attention (Part 1)", focus: "Passive voice across tenses for objective reporting and tech habit lexis." },
      { session_number: 8, title: "Social Media, Privacy & Attention (Part 2)", focus: "Tech podcast analysis and digital minimalism discussions." }
    ]
  },
  {
    module_number: 3,
    title: "Climate, Sustainability & Urban Futures",
    hours: "8 hrs (Sessions 9–12)",
    global_theme: "Climate, Sustainability & Urban Futures",
    focus: "Future perfect/continuous & conditionals, linking & elision, pitching green solutions.",
    sessions: [
      { session_number: 9, title: "Environmental Challenges & Solutions (Part 1)", focus: "Connected speech — catenation and elision (consonant-to-vowel linking)." },
      { session_number: 10, title: "Environmental Challenges & Solutions (Part 2)", focus: "Future continuous and future perfect with urban sustainability lexis." },
      { session_number: 11, title: "Hypothetical Scenarios & Global Policy (Part 1)", focus: "Zero, first, second, and third conditionals (plus mixed conditionals)." },
      { session_number: 12, title: "Hypothetical Scenarios & Global Policy (Part 2)", focus: "Collaborative pitch workshop: designing and presenting a green city proposal." }
    ]
  },
  {
    module_number: 4,
    title: "Global Work, Leadership & Remote Teams",
    hours: "8 hrs (Sessions 13–16)",
    global_theme: "Global Work, Leadership & Remote Teams",
    focus: "Diplomatic modals & indirect questions, intonation for politeness, cross-cultural negotiations.",
    sessions: [
      { session_number: 13, title: "Navigating International Workplaces (Part 1)", focus: "Intonation for politeness and diplomacy—using fall-rise contours." },
      { session_number: 14, title: "Navigating International Workplaces (Part 2)", focus: "Global business collocations and direct vs. indirect feedback across cultures." },
      { session_number: 15, title: "Cross-Cultural Negotiation & Conflict Resolution (Part 1)", focus: "Indirect questions and diplomatic hedging." },
      { session_number: 16, title: "Cross-Cultural Negotiation & Conflict Resolution (Part 2)", focus: "Multi-party negotiation role-play and mid-course diagnostic check." }
    ]
  },
  {
    module_number: 5,
    title: "Health, Psychology & Modern Lifestyles",
    hours: "8 hrs (Sessions 17–20)",
    global_theme: "Health, Psychology & Modern Lifestyles",
    focus: "Gerunds/infinitives & reporting verbs, thought-group pausing, discussing wellbeing & habits.",
    sessions: [
      { session_number: 17, title: "Wellbeing, Burnout & Work-Life Balance (Part 1)", focus: "Question tag intonation (rising vs. falling contours for consensus)." },
      { session_number: 18, title: "Wellbeing, Burnout & Work-Life Balance (Part 2)", focus: "Gerunds vs. infinitives after complex verbs (regret, stop, remember)." },
      { session_number: 19, title: "Public Health & Longevity (Part 1)", focus: "Reporting verbs for summarizing scientific findings (demonstrate, urge, warn)." },
      { session_number: 20, title: "Public Health & Longevity (Part 2)", focus: "Global health documentaries and preventative health lexical sets." }
    ]
  },
  {
    module_number: 6,
    title: "Media, Misinformation & Global Culture",
    hours: "8 hrs (Sessions 21–24)",
    global_theme: "Media, Misinformation & Global Culture",
    focus: "Reported speech & cleft sentences, decoding international English accents, critical analysis.",
    sessions: [
      { session_number: 21, title: "Media Literacy & Critical Thinking (Part 1)", focus: "Contrastive stress and cleft sentences ('What concerns experts most is...')." },
      { session_number: 22, title: "Media Literacy & Critical Thinking (Part 2)", focus: "Reported speech with tense backshifting and distancing language (allegedly, reportedly)." },
      { session_number: 23, title: "World Englishes & Global Pop Culture (Part 1)", focus: "Training the ear to understand diverse global English varieties." },
      { session_number: 24, title: "World Englishes & Global Pop Culture (Part 2)", focus: "Cultural globalization vs. local preservation discussions." }
    ]
  },
  {
    module_number: 7,
    title: "Economics, Innovation & Social Change",
    hours: "8 hrs (Sessions 25–28)",
    global_theme: "Economics, Innovation & Social Change",
    focus: "Relative clauses & cause/effect connectors, stress-timing, debating inequality & global trade.",
    sessions: [
      { session_number: 25, title: "Global Trade, Entrepreneurship & Ethics (Part 1)", focus: "Stress-timing mastery across complex multi-clause B2 arguments." },
      { session_number: 26, title: "Global Trade, Entrepreneurship & Ethics (Part 2)", focus: "Defining/non-defining relative clauses and economic impact lexis." },
      { session_number: 27, title: "Persuasive Rhetoric & Public Speaking (Part 1)", focus: "Advanced discourse markers for contrast, concession, and cause/effect." },
      { session_number: 28, title: "Persuasive Rhetoric & Public Speaking (Part 2)", focus: "Delivering structured 3-minute persuasive talks with signposting." }
    ]
  },
  {
    module_number: 8,
    title: "Fluency Synthesis & B2 Global Capstone",
    hours: "8 hrs (Sessions 29–32)",
    global_theme: "Fluency Synthesis & B2 Global Capstone",
    focus: "Integrated B2+ idioms & hedging, shadowing mastery, final multi-accent & speaking assessment.",
    sessions: [
      { session_number: 29, title: "Intensive Shadowing & Fluency Integration (Part 1)", focus: "End-to-end shadowing of international keynote speakers (TED/UN)." },
      { session_number: 30, title: "Intensive Shadowing & Fluency Integration (Part 2)", focus: "Cumulative review of B2 grammar structures and hedging devices." },
      { session_number: 31, title: "Final B2 Global Assessment (Listening)", focus: "Multi-Accent Listening Exam comprehension across diverse global clips." },
      { session_number: 32, title: "Final B2 Global Assessment (Speaking Capstone)", focus: "Spontaneous international networking, individual monologue, and problem-solving." }
    ]
  }
];

export async function GET() {
  try {
    // Clear sessions and modules safely
    await supabaseAdmin.schema('course').from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.schema('course').from('modules').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    for (const mod of CURRICULUM_DATA) {
      const { data: moduleRecord, error: modError } = await supabaseAdmin
        .schema('course')
        .from('modules')
        .insert({
          module_number: mod.module_number,
          title: mod.title,
          hours: mod.hours,
          global_theme: mod.global_theme,
          focus: mod.focus
        })
        .select()
        .single();

      if (modError) {
        return NextResponse.json({ success: false, phase: `Module ${mod.module_number} insert`, error: modError }, { status: 500 });
      }

      const sessionsToInsert = mod.sessions.map(sess => ({
        module_id: moduleRecord.id,
        session_number: sess.session_number,
        title: sess.title,
        focus: sess.focus
      }));

      const { error: sessError } = await supabaseAdmin
        .schema('course')
        .from('sessions')
        .insert(sessionsToInsert);

      if (sessError) {
        return NextResponse.json({ 
          success: false, 
          phase: `Module ${mod.module_number} sessions insert`, 
          error: sessError,
          attemptedData: sessionsToInsert 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Successfully seeded all 8 modules and 32 sessions into the 'course' schema!" 
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
