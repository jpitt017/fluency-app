export const LEARNER_GRAMMAR_REASONS: Readonly<Record<string, string>>;

export function learnerGrammarReason(item: { id: string; reason?: string | null } | null | undefined): string | null;
