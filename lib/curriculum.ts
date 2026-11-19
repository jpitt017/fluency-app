import curriculum from '@/content/curriculum/b1-64h.json';

export type CefrSkill = 'Listening' | 'Reading' | 'Spoken Interaction' | 'Spoken Production' | 'Writing';

export interface CefrObjective {
  id: string;
  skill: CefrSkill;
  can_do: string;
}

export interface CurriculumLesson {
  lesson_number: number;
  course_hour: number;
  stage: 'Input & Context' | 'Grammar & Mechanics' | 'Guided Fluency Drills' | 'CEFR Can-Do Checkpoint';
  title: string;
  duration_minutes: number;
  objective_ids: string[];
  grammar: string[];
  vocabulary: string[];
  type: 'dialogue' | 'guided_practice' | 'ai_roleplay';
}

export interface CurriculumModule {
  module_number: number;
  title: string;
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
  level: 'B1';
  total_hours: number;
  modules: CurriculumModule[];
}

export const b1Curriculum = curriculum as B1Curriculum;

export const curriculumStages = [
  'Input & Context',
  'Grammar & Mechanics',
  'Guided Fluency Drills',
  'CEFR Can-Do Checkpoint',
] as const;
