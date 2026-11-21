import { z } from 'zod';

export const SpeakerAccentSchema = z.object({
  speaker: z.string().trim().min(1),
  accent: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Expected BCP-47 tag such as en-GB'),
  label: z.string().trim().min(2),
});

export const VocabGapFillSchema = z
  .object({
    prompt: z.string().trim().min(5),
    options: z.array(z.string().trim().min(1)).min(2),
    answer: z.string().trim().min(1),
    explanation: z.string().trim().min(5),
  })
  .refine((item) => item.options.includes(item.answer), {
    message: 'Vocab gap-fill answer must match one of its options exactly',
  });

export const VocabItemSchema = z.object({
  term: z.string().trim().min(1),
  pos: z.string().trim().min(1),
  definition: z.string().trim().min(5),
  example: z.string().trim().min(8),
  collocations: z.array(z.string().trim().min(2)).min(1, 'Each vocabulary item needs at least one collocation'),
  wordFamily: z.array(z.string().trim().min(2)).optional(),
  note: z.string().trim().min(3).optional(),
  ukUsNote: z.string().trim().min(3).optional(),
  gapFill: VocabGapFillSchema.optional(),
  sentencePrompt: z.string().trim().min(8).optional(),
  translation: z.string().trim().min(1),
  ipa: z.string().trim().optional(),
  band: z.enum(['B1', 'B2']).optional(),
  audioRef: z.string().trim().min(5, 'Each vocabulary item needs an audioRef path'),
  audioUrl: z.string().trim().optional(),
});

export const VocabPackSchema = z.object({
  collocations: z
    .array(
      z.object({
        phrase: z.string().trim().min(2),
        example: z.string().trim().min(8),
        note: z.string().trim().optional(),
      }),
    )
    .min(1),
  wordFamilies: z
    .array(
      z.object({
        base: z.string().trim().min(2),
        forms: z.array(z.string().trim().min(2)).min(2),
        example: z.string().trim().min(8),
        note: z.string().trim().optional(),
      }),
    )
    .min(1),
  linkingExpressions: z
    .array(
      z.object({
        expression: z.string().trim().min(3),
        functionLabel: z.string().trim().min(2),
        example: z.string().trim().min(8),
      }),
    )
    .min(1),
});

export const GrammarItemSchema = z
  .object({
    prompt: z.string().trim().min(5),
    options: z.array(z.string().trim().min(1)).min(2),
    answer: z.string().trim().min(1),
    explanation: z.string().trim().min(5),
    difficulty: z.number().int().min(1).max(3).default(1),
  })
  .refine((item) => item.options.includes(item.answer), {
    message: 'Grammar item answer must match one of its options exactly',
  });

export const GrammarPointSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9-]+$/),
  role: z.enum(['main', 'light']).default('main'),
  name: z.string().trim().min(3),
  explanation: z.string().trim().min(15),
  keyPoints: z.array(z.string().trim().min(5)).min(1),
  example: z.string().trim().min(8),
  items: z.array(GrammarItemSchema).min(3),
});

export const InputQuestionSchema = z
  .object({
    prompt: z.string().trim().min(5),
    options: z.array(z.string().trim().min(1)).min(2),
    answer: z.string().trim().min(1),
  })
  .refine((q) => q.options.includes(q.answer), {
    message: 'Input comprehension question answer must match one of its options exactly',
  });

export const ContentInputSchema = z
  .object({
    kind: z.enum(['listening', 'reading']),
    lesson: z.number().int().min(1).max(7),
    title: z.string().trim().min(3),
    source: z.string().trim().min(3),
    accent: z.string().trim().optional(),
    speaker_accents: z.array(SpeakerAccentSchema).optional(),
    seconds: z.number().int().positive().optional(),
    body: z.string().trim().min(40),
    audioRef: z.string().trim().min(5).optional(),
    audioStatus: z.enum(['bundled', 'actor_pending', 'actor_recorded', 'tts']).optional(),
    audioUrl: z.string().trim().optional(),
    questions: z.array(InputQuestionSchema).min(1),
  })
  .superRefine((inp, ctx) => {
    if (inp.kind === 'listening') {
      if (!inp.accent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Listening input "${inp.title}" must specify accent`,
        });
      }
      if (!inp.speaker_accents || inp.speaker_accents.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Listening input "${inp.title}" must specify speaker_accents`,
        });
      }
      if (!inp.audioRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Listening input "${inp.title}" must specify audioRef`,
        });
      }
      if (!inp.seconds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Listening input "${inp.title}" must specify duration seconds`,
        });
      }
    }
  });

export const SpeakingTaskSchema = z.object({
  kind: z.enum(['prompt_card', 'role_play', 'shadowing', 'monologue', 'interview']),
  title: z.string().trim().min(3),
  prompt: z.string().trim().min(15),
  seconds: z.number().int().min(30).max(600),
  phrases: z.array(z.string().trim().min(3)).min(1),
  linkers: z.array(z.string().trim().min(2)).min(1),
  terms: z.array(z.string().trim().min(2)).min(1),
});

export const WritingTaskSchema = z
  .object({
    title: z.string().trim().min(3),
    prompt: z.string().trim().min(15),
    format: z.string().trim().min(3),
    wordMin: z.number().int().min(40),
    wordMax: z.number().int().max(600),
    outline: z.object({
      analyze: z.string().trim().min(5),
      plan: z.string().trim().min(5),
      draft: z.string().trim().min(5),
      improve: z.string().trim().min(5),
      review: z.string().trim().min(5),
    }),
  })
  .refine((w) => w.wordMax >= w.wordMin, {
    message: 'Writing wordMax must be >= wordMin',
  });

export const LessonTemplateSchema = z.object({
  dayOfWeek: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  requirement: z.enum(['required', 'either_wed_thu', 'optional']),
  outputRequired: z.boolean().default(false),
  minutes: z.number().int().min(10).max(45),
  title: z.string().trim().min(4),
  objective: z.string().trim().min(10),
  canDo: z.string().trim().min(10),
  skill: z.enum(['grammar', 'vocabulary', 'listening', 'reading', 'speaking', 'writing', 'review']),
  input: z.enum(['listening', 'reading']),
  outputTitle: z.string().trim().min(3),
  output: z.string().trim().min(10),
  targetSeconds: z.number().int().min(30).max(600).optional(),
  wordRange: z.tuple([z.number().int().min(20), z.number().int().max(500)]).optional(),
});

export const ModuleSchema = z
  .object({
    number: z.number().int().min(1).max(16),
    phase: z.string().trim().min(5).optional(),
    title: z.string().trim().min(3),
    summary: z.string().trim().min(15),
    hours: z.number().int().min(1).max(20),
    releaseStage: z.enum(['live', 'beta', 'draft']).default('live'),
    vocabularyTopic: z.string().trim().min(3),
    lightGrammar: z.string().trim().nullable().optional(),
    vocabPack: VocabPackSchema.optional(),
    grammar: z.array(GrammarPointSchema).min(1).max(2),
    vocab: z.array(VocabItemSchema).min(8).max(12),
    inputs: z.array(ContentInputSchema).min(2),
    speaking: z.array(SpeakingTaskSchema).min(1).max(3),
    writing: WritingTaskSchema,
    skillMix: z.record(z.string(), z.number().min(0).max(1)).optional(),
    lessons: z.array(LessonTemplateSchema).length(7),
  })
  .superRefine((mod, ctx) => {
    const terms = new Set(mod.vocab.map((v) => v.term.toLowerCase()));
    if (terms.size !== mod.vocab.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Week ${mod.number} contains duplicate vocabulary terms`,
      });
    }
    const listeningInputs = mod.inputs.filter((i) => i.kind === 'listening');
    const readingInputs = mod.inputs.filter((i) => i.kind === 'reading');
    if (listeningInputs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Week ${mod.number} needs at least 1 listening input`,
      });
    }
    if (readingInputs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Week ${mod.number} needs at least 1 reading input`,
      });
    }
    const days = mod.lessons.map((l) => l.dayOfWeek);
    if (days.join(',') !== 'Mon,Tue,Wed,Thu,Fri,Sat,Sun') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Week ${mod.number} lessons must be ordered Mon,Tue,Wed,Thu,Fri,Sat,Sun`,
      });
    }
  });

export const ModulesDocSchema = z.object({
  course_slug: z.string().trim().min(1),
  modules: z.array(ModuleSchema).min(1),
});

export const CourseDocSchema = z.object({
  course: z.object({
    slug: z.string().trim().min(1),
    title: z.string().trim().min(5),
    subtitle: z.string().trim().min(10),
    description: z.string().trim().min(20),
    cefr_from: z.string().trim().min(2),
    cefr_to: z.string().trim().min(2),
    total_hours: z.number().int().min(40),
    min_hours: z.number().int().min(30).optional(),
    duration_weeks: z.number().int().min(16).max(16).default(16),
    weekly_hours: z.number().positive(),
    daily_minutes_min: z.number().int().positive(),
    daily_minutes_max: z.number().int().positive(),
    live_lessons_per_week: z
      .object({
        count: z.number().int().min(1),
        minutes: z.array(z.number().int().positive()),
      })
      .optional(),
    positioning: z.string().trim().min(10).optional(),
    outcomes: z.array(z.string().trim().min(10)).min(4),
    daily_flow: z
      .array(
        z.object({
          day: z.string().trim().optional(),
          step: z.number().int().min(1).max(7),
          kind: z.string().trim().min(2),
          label: z.string().trim().min(2),
          minutes: z.number().int().positive(),
          requirement: z.enum(['required', 'either_wed_thu', 'optional']).optional(),
          description: z.string().trim().min(10),
        }),
      )
      .length(7),
  }),
  checkpoints: z
    .array(
      z.object({
        module: z.number().int().min(1).max(16),
        code: z.string().trim().min(3),
        title: z.string().trim().min(3),
        timing: z.string().trim().min(3),
        description: z.string().trim().min(10),
        minutes: z.number().int().positive(),
        skills: z.array(z.string().trim().min(2)).min(2),
        tasks: z.array(z.string().trim().min(5)).min(2),
      }),
    )
    .length(4),
  badges: z.array(
    z.object({
      code: z.string().trim().min(2),
      title: z.string().trim().min(2),
      description: z.string().trim().min(5),
      icon: z.string().trim().min(1),
      xp: z.number().int().nonnegative(),
      criteria: z.record(z.string(), z.unknown()),
    }),
  ),
});
