import {
  COURSE_ASSESSMENTS,
  COURSE_MODULES,
  COURSE_OVERVIEW,
  COURSE_SESSIONS,
  type CourseAssessmentSpec,
  type SessionBlockSpec,
} from './course-architecture';

export type CefrSkill = 'Listening' | 'Reading' | 'Spoken Interaction' | 'Spoken Production' | 'Writing';
export type CurriculumStage = 'Input & Context' | 'Grammar & Mechanics' | 'Guided Fluency Drills' | 'CEFR Can-Do Checkpoint';

export interface CefrObjective {
  id: string;
  skill: CefrSkill;
  can_do: string;
}

export interface CurriculumLesson {
  lesson_number: number;
  session_number: number;
  session_id: string;
  course_hour: number;
  stage: CurriculumStage;
  unit_title: string;
  title: string;
  duration_minutes: number;
  objective_ids: string[];
  grammar: string[];
  vocabulary: string[];
  type: 'dialogue' | 'guided_practice' | 'ai_roleplay';
  objectives: string;
  pronunciation_focus: string;
  grammar_lexis: string;
  listening_focus: string;
  speaking_pragmatics: string;
  homework: string;
  milestone?: string;
  blocks: SessionBlockSpec[];
}

export interface CurriculumModule {
  module_number: number;
  module_id: string;
  title: string;
  theme: string;
  core_focus: string;
  session_range: string;
  estimated_hours: number;
  cefr_objectives: CefrObjective[];
  target_grammar: string[];
  target_vocabulary: string[];
  lessons: CurriculumLesson[];
  checkpoint_task: {
    type: 'ai_roleplay';
    prompt: string;
    min_duration_seconds: number;
    rubric_criteria: string[];
  };
}

export interface B1Curriculum {
  course_id: string;
  title: string;
  level: 'B1' | 'B1 → B2';
  total_hours: number;
  total_sessions: number;
  weeks: number;
  hours_per_week: number;
  assessments: CourseAssessmentSpec[];
  modules: CurriculumModule[];
}

export const curriculumStages: CurriculumStage[] = [
  'Input & Context',
  'Grammar & Mechanics',
  'Guided Fluency Drills',
  'CEFR Can-Do Checkpoint',
];

const skills: CefrSkill[] = ['Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing'];
const skillSuffix: Record<CefrSkill, string> = {
  Listening: 'L',
  Reading: 'R',
  'Spoken Interaction': 'SI',
  'Spoken Production': 'SP',
  Writing: 'WR',
};

export const b1Curriculum: B1Curriculum = {
  course_id: 'cefr_b1_b2_64h',
  title: COURSE_OVERVIEW.title,
  level: 'B1 → B2',
  total_hours: COURSE_OVERVIEW.total_hours,
  total_sessions: COURSE_OVERVIEW.total_sessions,
  weeks: COURSE_OVERVIEW.weeks,
  hours_per_week: COURSE_OVERVIEW.hours_per_week,
  assessments: COURSE_ASSESSMENTS,
  modules: COURSE_MODULES.map((mod) => {
    const objectives: CefrObjective[] = skills.map((skill) => ({
      id: `B1_M${mod.module_number}_${skillSuffix[skill]}`,
      skill,
      can_do:
        skill === 'Spoken Interaction'
          ? mod.can_do_interaction
          : skill === 'Writing'
            ? mod.can_do_writing
            : skill === 'Listening'
              ? mod.can_do_listening
              : skill === 'Reading'
                ? mod.can_do_reading
                : mod.can_do_production,
    }));

    const moduleSessions = COURSE_SESSIONS.filter((s) => s.module_number === mod.module_number);

    const lessons: CurriculumLesson[] = moduleSessions.map((session, idx) => {
      const stage = curriculumStages[idx] ?? 'CEFR Can-Do Checkpoint';
      const objectiveSkills: CefrSkill[] =
        idx === 0
          ? ['Listening', 'Reading']
          : idx === 1
            ? ['Reading', 'Spoken Production', 'Writing']
            : idx === 2
              ? ['Listening', 'Spoken Interaction', 'Spoken Production']
              : skills;

      return {
        lesson_number: session.module_session_number,
        session_number: session.session_number,
        session_id: session.id,
        course_hour: session.course_hour_end,
        stage,
        unit_title: session.unit_title,
        title: session.title,
        duration_minutes: session.duration_minutes,
        objective_ids: objectives
          .filter((objective) => objectiveSkills.includes(objective.skill))
          .map((objective) => objective.id),
        grammar: [...mod.target_grammar],
        vocabulary: [...mod.target_vocabulary],
        type: idx === 0 ? 'dialogue' : idx === 3 ? 'ai_roleplay' : 'guided_practice',
        objectives: session.objectives,
        pronunciation_focus: session.pronunciation_focus,
        grammar_lexis: session.grammar_lexis,
        listening_focus: session.listening_focus,
        speaking_pragmatics: session.speaking_pragmatics,
        homework: session.homework,
        milestone: session.milestone,
        blocks: session.blocks,
      };
    });

    return {
      module_number: mod.module_number,
      module_id: mod.id,
      title: mod.title,
      theme: mod.theme,
      core_focus: mod.core_focus,
      session_range: `Sessions ${mod.session_start}–${mod.session_end}`,
      estimated_hours: mod.hours,
      cefr_objectives: objectives,
      target_grammar: [...mod.target_grammar],
      target_vocabulary: [...mod.target_vocabulary],
      lessons,
      checkpoint_task: {
        type: 'ai_roleplay',
        prompt: `Complete a Module ${mod.module_number} (${mod.title}) speaking task. ${mod.can_do_interaction}`,
        min_duration_seconds: 120,
        rubric_criteria: [
          'Fluency & Coherence',
          'Lexical Resource',
          'Grammatical Range & Accuracy',
          'Global Pronunciation / Prosody',
        ],
      },
    };
  }),
};

export function getLessonActivity(stage: CurriculumStage, title: string) {
  switch (stage) {
    case 'Input & Context':
      return {
        instruction: `Work through all four 120-minute blocks for ${title}: Connected Speech & Prosody, Global Lexis & Grammar, Multi-Accent Listening, and Cross-Cultural Speaking.`,
        task: 'Complete the self-checks in each timed block and submit a speaking or writing response in the Lesson Labs.',
      };
    case 'Grammar & Mechanics':
      return {
        instruction: 'Consolidate the unit’s functional grammar and high-frequency collocations, then test them in listening and spoken interaction.',
        task: 'Write or speak two original examples applying the session’s target structures.',
      };
    case 'Guided Fluency Drills':
      return {
        instruction: 'Combine connected speech prosody with multi-accent listening comprehension and structured debate framing.',
        task: 'Deliver a timed spoken response incorporating the session’s discourse markers and vocabulary.',
      };
    case 'CEFR Can-Do Checkpoint':
      return {
        instruction: 'Synthesize the module’s pronunciation, grammar, listening, and cross-cultural speaking targets in an unscripted checkpoint.',
        task: 'Submit a 2-minute spoken or written checkpoint response for B1→B2 rubric evaluation.',
      };
  }
}
