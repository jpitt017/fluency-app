import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin environment variables are not configured');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    const sessions = [
      {
        id: '11111111-1111-1111-1111-000000000001',
        module_number: 1,
        session_number: 1,
        title: 'Session 1: Global Identities & Thought-Group Chunking'
      },
      {
        id: '11111111-1111-1111-1111-000000000002',
        module_number: 1,
        session_number: 2,
        title: 'Session 2: Personal Milestones & Narrative Tenses'
      },
      {
        id: '11111111-1111-1111-1111-000000000003',
        module_number: 1,
        session_number: 3,
        title: 'Session 3: Travel, Adaptation & Vowel Clarity'
      },
      {
        id: '11111111-1111-1111-1111-000000000004',
        module_number: 1,
        session_number: 4,
        title: 'Session 4: Culture Shock & Expat Storytelling Lab'
      }
    ];

    const { error: sessionError } = await supabase
      .schema('course')
      .from('sessions')
      .upsert(sessions, { onConflict: 'id' });

    if (sessionError) {
      throw new Error(`Session upsert failed: ${sessionError.message}`);
    }

    const blocks = [
      // --- SESSION 1 ---
      {
        session_id: '11111111-1111-1111-1111-000000000001',
        block_number: 1,
        title: 'Listening: International Intelligibility & Sentence Stress',
        content: 'Tune your ear to nuclear stress and thought-group chunking across diverse global accents. [Quiz: What is the primary purpose of thought-group chunking? A) Speaking as fast as possible B) Enhancing clarity through natural pauses C) Eliminating all consonants]',
        start_minute: 0,
        end_minute: 15
      },
      {
        session_id: '11111111-1111-1111-1111-000000000001',
        block_number: 2,
        title: 'Reading: Cultural Identity & High-Context Communication',
        content: 'Analyze a short essay contrasting high-context and low-context cultural communication styles. [Quiz: In low-context cultures, how is information primarily communicated? A) Implicitly through body language B) Explicitly via direct verbal statements C) Through artistic metaphor]',
        start_minute: 15,
        end_minute: 30
      },
      {
        session_id: '11111111-1111-1111-1111-000000000001',
        block_number: 3,
        title: 'Speaking: Breaking the Ice Without Slang',
        content: 'Practice initiating cross-cultural conversations using clear, globally neutral phrasing.',
        start_minute: 30,
        end_minute: 45
      },
      {
        session_id: '11111111-1111-1111-1111-000000000001',
        block_number: 4,
        title: 'Writing: Crafting a Personal Bio & Roots Statement',
        content: 'Draft a concise professional biography highlighting your cultural heritage and perspective.',
        start_minute: 45,
        end_minute: 60
      },

      // --- SESSION 2 ---
      {
        session_id: '11111111-1111-1111-1111-000000000002',
        block_number: 1,
        title: 'Reading: Memoirs of Migration and Life Transitions',
        content: 'Read excerpts from autobiographical texts featuring narrative tenses (past continuous, past perfect, used to / would). [Quiz: Which tense is best used for an ongoing background action interrupted by a sudden event? A) Past simple B) Past continuous C) Present perfect]',
        start_minute: 0,
        end_minute: 15
      },
      {
        session_id: '11111111-1111-1111-1111-000000000002',
        block_number: 2,
        title: 'Listening: Audio Diary of a Career Turning Point',
        content: 'Listen to an immigrant professional describe a pivotal career milestone and decode natural linking.',
        start_minute: 15,
        end_minute: 30
      },
      {
        session_id: '11111111-1111-1111-1111-000000000002',
        block_number: 3,
        title: 'Speaking: Narrating Your Own Turning Point',
        content: 'Record a 2-minute narrative detailing a major life milestone using accurate past tense structures.',
        start_minute: 30,
        end_minute: 45
      },
      {
        session_id: '11111111-1111-1111-1111-000000000002',
        block_number: 4,
        title: 'Writing: Reflective Journal Entry on Growth',
        content: 'Write a structured journal response incorporating unit vocabulary (roots, assimilate, perspective).',
        start_minute: 45,
        end_minute: 60
      },

      // --- SESSION 3 ---
      {
        session_id: '11111111-1111-1111-1111-000000000003',
        block_number: 1,
        title: 'Listening: Expat Interviews on Stepping Out of Comfort Zones',
        content: 'Listen to interviews with international assignees discussing initial adaptation hurdles.',
        start_minute: 0,
        end_minute: 15
      },
      {
        session_id: '11111111-1111-1111-1111-000000000003',
        block_number: 2,
        title: 'Reading: Cultural Adaptation Case Studies',
        content: 'Examine case studies featuring phrasal verbs for adaptation (settle in, get the hang of, broaden horizons). [Quiz: What does the phrasal verb "get the hang of" mean? A) To drop something B) To learn how to do something skillfully C) To lose patience]',
        start_minute: 15,
        end_minute: 30
      },
      {
        session_id: '11111111-1111-1111-1111-000000000003',
        block_number: 3,
        title: 'Speaking: Discussing Vowel Clarity & Avoiding Intrusive Sounds',
        content: 'Practice tongue twisters and sentence drills focusing on clean vowel production in consonant clusters.',
        start_minute: 30,
        end_minute: 45
      },
      {
        session_id: '11111111-1111-1111-1111-000000000003',
        block_number: 4,
        title: 'Writing: Advising a Newcomer (Empathetic Written Advice)',
        content: 'Compose an email response giving practical advice to a colleague moving to a foreign country.',
        start_minute: 45,
        end_minute: 60
      },

      // --- SESSION 4 ---
      {
        session_id: '11111111-1111-1111-1111-000000000004',
        block_number: 1,
        title: 'Reading: Academic Insights on Culture Shock Stages',
        content: 'Read a short psychological summary detailing the honeymoon, frustration, adjustment, and mastery phases. [Quiz: Which stage typically follows immediately after the initial "honeymoon" phase of culture shock? A) Mastery B) Frustration / Crisis C) Complete assimilation]',
        start_minute: 0,
        end_minute: 15
      },
      {
        session_id: '11111111-1111-1111-1111-000000000004',
        block_number: 2,
        title: 'Listening: Panel Discussion on Expat Identity & Belonging',
        content: 'Listen to a roundtable of digital nomads and international students discussing dual cultural identity.',
        start_minute: 15,
        end_minute: 30
      },
      {
        session_id: '11111111-1111-1111-1111-000000000004',
        block_number: 3,
        title: 'Speaking: The Expat Storytelling Lab Presentation',
        content: 'Deliver a structured 3-minute spoken summary of a culture shock challenge and how it was overcome.',
        start_minute: 30,
        end_minute: 45
      },
      {
        session_id: '11111111-1111-1111-1111-000000000004',
        block_number: 4,
        title: 'Writing: Module Synthesis Essay & Final Reflection',
        content: 'Synthesize core learnings into a polished final written reflection on personal and professional adaptability.',
        start_minute: 45,
        end_minute: 60
      }
    ];

    const { error: blockError } = await supabase
      .schema('course')
      .from('session_blocks')
      .upsert(blocks, { onConflict: 'session_id, block_number' });

    if (blockError) {
      throw new Error(`Block upsert failed: ${blockError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Module 1 enhanced with interactive knowledge checkpoints successfully!' 
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}