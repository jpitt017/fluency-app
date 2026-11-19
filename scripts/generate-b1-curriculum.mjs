import { mkdir, writeFile } from 'node:fs/promises';
import {
  COURSE_ASSESSMENTS,
  COURSE_MODULES,
  COURSE_OVERVIEW,
  COURSE_SESSIONS,
} from '../lib/course-architecture.ts';

const curriculumStages = [
  'Input & Context',
  'Grammar & Mechanics',
  'Guided Fluency Drills',
  'CEFR Can-Do Checkpoint',
];
const skills = ['Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing'];
const skillSuffix = {
  Listening: 'L',
  Reading: 'R',
  'Spoken Interaction': 'SI',
  'Spoken Production': 'SP',
  Writing: 'WR',
};

const course = {
  course_id: 'cefr_b1_b2_64h',
  title: COURSE_OVERVIEW.title,
  level: 'B1 → B2',
  total_hours: COURSE_OVERVIEW.total_hours,
  total_sessions: COURSE_OVERVIEW.total_sessions,
  weeks: COURSE_OVERVIEW.weeks,
  hours_per_week: COURSE_OVERVIEW.hours_per_week,
  assessments: COURSE_ASSESSMENTS,
  modules: COURSE_MODULES.map((mod) => {
    const objectives = skills.map((skill) => ({
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
    const lessons = moduleSessions.map((session, idx) => {
      const stage = curriculumStages[idx] ?? 'CEFR Can-Do Checkpoint';
      const objectiveSkills =
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
        objective_ids: objectives.filter((o) => objectiveSkills.includes(o.skill)).map((o) => o.id),
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

await mkdir('content/curriculum', { recursive: true });
await writeFile('content/curriculum/b1-64h.json', `${JSON.stringify(course, null, 2)}\n`);
console.log(
  `Generated ${course.modules.length} modules and ${course.modules.reduce((total, m) => total + m.lessons.length, 0)} sessions (${course.total_hours}h).`,
);
