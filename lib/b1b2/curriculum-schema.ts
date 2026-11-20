import { z } from 'zod';

export const SpeakerAccentSchema = z.object({
  speaker: z.string().trim().min(1),
  accent: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Expected BCP-47 tag such as en-GB'),
  label: z.string().trim().min(2),
});

export const VocabItemSchema = z.object({
  term: z.string().trim().min(1),
  pos: z.string().trim().min(1),
  definition: z.string().trim().min(5),
  example: z.string().trim().min(8),
  collocations: z.array(z.string().trim().min(2)).min(1, 'Each vocabulary item needs at least one collocation'),
  translation: z.string().trim().min(1),
  ipa: z.string().trim().optional(),
  band: z.enum(['B1', 'B2']).optional(),
  audioRef: z.string().trim().min(5, 'Each vocabulary item needs an audioRef path'),
  audioUrl: z.string().trim().optional(),
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
    lesson: z.number().int().min(1).max(8),
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
    number: z.number().int().min(1).max(8),
    title: z.string().trim().min(3),
    summary: z.string().trim().min(15),
    hours: z.number().int().min(1).max(20),
    releaseStage: z.enum(['live', 'beta', 'draft']).default('live'),
    vocabularyTopic: z.string().trim().min(3),
    grammar: z.array(GrammarPointSchema).length(2),
    vocab: z.array(VocabItemSchema).min(8).max(16),
    inputs: z.array(ContentInputSchema).min(2),
    speaking: z.array(SpeakingTaskSchema).length(3),
    writing: WritingTaskSchema,
    lessons: z.array(LessonTemplateSchema).length(8),
  })
  .superRefine((mod, ctx) => {
    const hasListening = mod.inputs.some((i) => i.kind === 'listening');
    const hasReading = mod.inputs.some((i) => i.kind === 'reading');
    if (!hasListening || !hasReading) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Module ${mod.number} must include at least one listening and one reading input`,
      });
    }

    const terms = new Set<string>();
    for (const v of mod.vocab) {
      const key = v.term.toLowerCase();
      if (terms.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Module ${mod.number} has duplicate vocab term "${v.term}"`,
        });
      }
      terms.add(key);
    }
  });

export const ModulesDocSchema = z.object({
  course_slug: z.literal('english-b1-b2'),
  modules: z.array(ModuleSchema).min(1),
});

export const CourseDocSchema = z.object({
  course_slug: z.literal('english-b1-b2'),
  course: z.object({
    slug: z.literal('english-b1-b2'),
    title: z.string().trim().min(3),
    subtitle: z.string().trim().min(10),
    description: z.string().trim().min(20),
    level_from: z.literal('B1'),
    level_to: z.literal('B2'),
    total_hours: z.number().int().positive(),
    weekly_hours: z.number().positive(),
    duration_weeks: z.number().int().positive(),
    daily_minutes_min: z.number().int().positive(),
    daily_minutes_max: z.number().int().positive(),
    daily_flow: z
      .array(
        z.object({
          block: z.string().trim().min(1),
          minutes: z.number().int().positive(),
          label: z.string().trim().min(1),
          description: z.string().trim().min(5),
        }),
      )
      .length(5),
    skill_balance: z
      .array(
        z.object({
          skill: z.string().trim().min(1),
          hours: z.number().positive(),
        }),
      )
      .min(6),
  }),
  checkpoints: z
    .array(
      z.object({
        code: z.string().trim().min(3),
        module: z.number().int().min(1).max(8),
        title: z.string().trim().min(3),
        timing: z.string().trim().min(3),
        description: z.string().trim().min(10),
        minutes: z.number().int().positive(),
        skills: z.array(z.string().trim().min(2)).min(1),
        tasks: z
          .array(
            z.object({
              kind: z.string().trim().min(2),
              title: z.string().trim().min(2),
              detail: z.string().trim().min(5),
              minutes: z.number().int().positive(),
            }),
          )
          .min(2),
      }),
    )
    .min(4),
  badges: z
    .array(
      z.object({
        code: z.string().trim().min(2),
        title: z.string().trim().min(2),
        icon: z.string().trim().min(1),
        xp: z.number().int().positive(),
        description: z.string().trim().min(5),
        criteria: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
});
