import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { projectLearnerGrammar } from './grammar-marking.mjs';
import { grammarUseItSupport } from './week-sentence-support';

/**
 * The learner's grammar practice: five steps instead of the teacher page's nine.
 *
 * The teacher's nine steps are an authoring structure. Learners get the same
 * items and the same reasons grouped into five they can act on:
 *
 *   1 See it      teacher steps 1-2  notice text + meaning checks
 *   2 Practise     steps 3-4         choose + complete
 *   3 Fix it       steps 5-6         find the mistake + rewrite
 *   4 Use it       step 8            sentences of your own (AI feedback)
 *   5 Remember     steps 7 and 9      extra point + spaced review
 *
 * The adaptive rules stay: after Practise, a learner below 60% on choose and
 * complete gets the extra items, and one at 90% or above skips the rewrite.
 * They are applied silently — no step is skipped by leaving a hole in the
 * numbering, and nothing tells the learner they are on a branch.
 */
export type GrammarTarget = 'Main' | 'Light' | 'Extra' | 'Review';

export type LearnerGrammarItem = {
  id: string;
  step: string;
  target: GrammarTarget;
  prompt: string;
  options: string[];
  blankCount: number;
  /** Rewrite items cannot be marked against one fixed answer. */
  needsAi: boolean;
  /** Learner-facing guidance only; the examples arrive one at a time. */
  useItSupport?: { pattern: string; starters: string[] };
};

export type LearnerGrammarStep = {
  number: number;
  title: 'See it' | 'Practise' | 'Fix it' | 'Use it' | 'Remember';
  instruction: string;
  items: LearnerGrammarItem[];
  /** True when the adaptive rules decide which of the items appear. */
  adaptive?: 'extra-if-below-60' | 'skip-rewrite-at-90';
};

export type LearnerGrammar = {
  notice: string;
  /** A short example by an imaginary learner, shown before the Use it boxes. */
  useItModel: string | null;
  steps: LearnerGrammarStep[];
};

const INSTRUCTIONS: Record<LearnerGrammarStep['title'], string> = {
  'See it': 'Read the short text, then answer what each form means.',
  Practise: 'Choose the right form, then complete each sentence.',
  'Fix it': 'Find the mistake, then write the sentence again correctly.',
  'Use it': 'Write 2–3 sentences about your own life. The app will check them.',
  Remember: 'Try one more point from this week, then an item from an earlier week.',
};

const LEARNER_STEPS: { number: number; title: LearnerGrammarStep['title']; matches: RegExp }[] = [
  { number: 1, title: 'See it', matches: /^(Notice|Meaning)$/ },
  { number: 2, title: 'Practise', matches: /^(Choose|Complete)$/ },
  { number: 3, title: 'Fix it', matches: /^(Fix|Rewrite)$/ },
  { number: 4, title: 'Use it', matches: /^Use it$/ },
  // 'Review (Week 1)', 'Review (Week 2)' and Week 1's 'Review (clinic)' are all
  // the same idea, so they match on the prefix rather than a fixed list. An
  // exact list here silently dropped two items per week the first time.
  { number: 5, title: 'Remember', matches: /^(Light|Extra|Review)\b/ },
];

/**
 * Teacher step labels are not all used by every week: a week can carry 'Extra'
 * items for the below-60% branch and a 'Light' item for the extra point, and
 * both belong to Remember. `Review (clinic)` is Week 1's stand-in for earlier
 * course grammar.
 */
export function learnerGrammar(weekNumber: number): LearnerGrammar | null {
  const practice = details.weeks.find((week) => week.number === weekNumber)?.grammar.practice;
  if (!practice) return null;
  const projected = projectLearnerGrammar(practice) as {
    notice: string;
    items: Omit<LearnerGrammarItem, 'target' | 'needsAi'>[];
  };
  const targets = new Map(
    (practice.items as { id: string; target?: GrammarTarget }[]).map((item) => [item.id, item.target ?? 'Main']),
  );
  const useItSupport = grammarUseItSupport(weekNumber);
  const steps = LEARNER_STEPS.map((definition) => {
    const items = projected.items
      .filter((item) => definition.matches.test(String(item.step)))
      .map((item) => {
        const step = String(item.step);
        const support = step === 'Use it' ? useItSupport?.items.find((entry) => entry.id === item.id) : undefined;
        if (step === 'Use it' && weekNumber <= 4 && !support) {
          throw new Error(`Missing Use it support for ${item.id}`);
        }
        return {
          ...item,
          target: targets.get(item.id) ?? 'Main',
          needsAi: step === 'Rewrite' || step === 'Use it',
          // Never serialize the example list in the initial page payload.
          useItSupport: support ? { pattern: support.pattern, starters: [...support.starters] } : undefined,
        };
      });
    const adaptive: LearnerGrammarStep['adaptive'] | undefined =
      definition.title === 'Practise'
        ? 'extra-if-below-60'
        : definition.title === 'Fix it'
          ? 'skip-rewrite-at-90'
          : undefined;
    return { number: definition.number, title: definition.title, instruction: INSTRUCTIONS[definition.title], items, adaptive };
  }).filter((step) => step.items.length > 0);

  // Nothing may be dropped on the way from the teacher page to the learner one:
  // the brief is to keep every item and every reason. Fail loudly rather than
  // ship a shorter practice than the author wrote.
  const mapped = steps.reduce((total, step) => total + step.items.length, 0);
  if (mapped !== projected.items.length) {
    const known = new Set(steps.flatMap((step) => step.items.map((item) => item.id)));
    const lost = projected.items.filter((item) => !known.has(item.id)).map((item) => `${item.id} (${item.step})`);
    throw new Error(`Grammar step mapping dropped ${lost.length} item(s): ${lost.join(', ')}`);
  }
  return { notice: projected.notice, useItModel: useItSupport?.model ?? null, steps };
}
