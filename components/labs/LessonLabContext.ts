export type LessonLabSkill = 'Spoken Interaction' | 'Spoken Production' | 'Writing';
export type LessonLabMode = 'free' | 'drill' | 'checkpoint';

export interface LessonLabContext {
  moduleId?: number;
  lessonId?: number;
  prompt: string;
  targetGrammar?: string[];
  targetVocabulary?: string[];
  cefrSkill?: LessonLabSkill;
  mode?: LessonLabMode;
  durationSeconds?: number;
  minWords?: number;
  maxWords?: number;
  onComplete?: (result: { transcript?: string; text?: string; score?: number; passed?: boolean; rubric?: Record<string, unknown> }) => void;
}
