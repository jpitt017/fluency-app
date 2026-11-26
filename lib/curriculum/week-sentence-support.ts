import 'server-only';
import grammarSupport from '../../supabase-b1-b2/content/curriculum/grammar-use-it-support-weeks-01-04.json';
import vocabularySupport from '../../supabase-b1-b2/content/curriculum/vocab-sentence-support-weeks-01-04.json';

/** These are teaching examples, not marking keys. Only send one when requested. */
export function grammarUseItSupport(week: number) {
  return grammarSupport.weeks.find((entry) => entry.week === week) ?? null;
}

export function sentenceSupport(week: number, id: string) {
  const grammar = grammarUseItSupport(week);
  const grammarItem = grammar?.items.find((entry) => entry.id === id);
  if (grammarItem && grammar) {
    return { kind: 'grammar-use-it' as const, ...grammarItem, model: grammar.model };
  }
  if (!id.startsWith(`V${week}-`)) return null;
  const vocabularyItem = vocabularySupport.items.find((entry) => entry.id === id);
  return vocabularyItem ? { kind: 'vocabulary-sentence' as const, ...vocabularyItem } : null;
}

/** Everything learners are shown as an example for an item, including the weekly model. */
export function sentenceExamples(week: number, id: string): string[] {
  const support = sentenceSupport(week, id);
  if (!support) return [];
  return support.kind === 'grammar-use-it' ? [support.model, ...support.examples] : support.examples;
}
