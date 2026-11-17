import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const module1Sessions = [
  {
    session_id: '11111111-1111-1111-1111-000000000001',
    title: 'Global Identities & Personal Milestones',
    theme: 'Cross-Cultural Connections & Identity',
    objectives: 'Master sentence stress, narrative tenses, and cross-cultural rapport-building.',
    pronunciation_focus: 'Sentence stress and thought-group chunking for clear international intelligibility.',
    grammar_lexis: 'Narrative tenses (past continuous, past perfect, used to / would); roots, heritage, assimilate, perspective, turning point.',
    listening_focus: 'Comprehending personal narratives of cultural transition.',
    speaking_pragmatics: 'High-context vs. low-context communication styles and building genuine rapport.',
  },
  {
    session_id: '11111111-1111-1111-1111-000000000002',
    title: 'Travel, Adaptation & Culture Shock',
    theme: 'Cross-Cultural Connections & Identity',
    objectives: 'Eliminate intrusive syllable additions and master idioms for adaptation.',
    pronunciation_focus: 'Vowel clarity and eliminating intrusive syllable additions in consonant clusters.',
    grammar_lexis: 'Idioms and phrasal verbs for adaptation (step out of one\'s comfort zone, broaden one\'s horizons, settle in, get the hang of).',
    listening_focus: 'Interviews with expatriates, digital nomads, and international students.',
    speaking_pragmatics: 'Discussing coping mechanisms and cultural adaptation strategies.',
  },
];

export async function GET() {
  const results = [];

  for (const session of module1Sessions) {
    // 1. Upsert session metadata into 'sessions' table
    const { error: sessionError } = await supabaseAdmin
      .schema('course')
      .from('sessions')
      .upsert({
        id: session.session_id,
        module_number: 1,
        title: session.title,
        theme: session.theme,
      }, { onConflict: 'id' });

    if (sessionError) {
      results.push({ session: session.title, error: sessionError.message });
      continue;
    }

    // 2. Trigger lesson plan generation
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/lessons/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.session_id,
          title: session.title,
          theme: session.theme,
          objectives: session.objectives,
          pronunciationFocus: session.pronunciation_focus,
          grammarLexis: session.grammar_lexis,
          listeningFocus: session.listening_focus,
          speakingPragmatics: session.speaking_pragmatics,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        results.push({ session: session.title, status: 'Success' });
      } else {
        results.push({ session: session.title, error: data.error });
      }
    } catch (err: any) {
      results.push({ session: session.title, error: err.message });
    }
  }

  return NextResponse.json({ message: 'Module 1 seeding completed', results });
}
