/**
 * Finish snapshots are server-derived from saved, checked attempts. This gate
 * is shared by the week page and dashboard so a learner who answered every
 * required item cannot lose the Review handoff by closing the tab before Finish.
 *
 * Completion rows and Review cards already have unique keys; finishPractice
 * treats duplicate Review inserts as success. That makes concurrent page loads
 * idempotent as well as later visits after a partial failure.
 */
export async function finishAnsweredPracticeSummaries({
  week,
  userId,
  client,
  admin,
  plans,
  readAttempts,
  finishPractice,
}) {
  if (!Number.isInteger(week) || week < 1 || !userId || !client || !admin) return [];

  const completionResult = await client
    .from('week_skill_completions')
    .select('skill')
    .eq('user_id', userId)
    .eq('week_number', week);
  if (completionResult.error || !Array.isArray(completionResult.data)) return [];

  const completed = new Set(completionResult.data.map((row) => row.skill));
  const created = [];
  for (const skill of ['grammar', 'vocabulary']) {
    const plan = plans[skill];
    if (!plan || completed.has(skill)) continue;

    const table = skill === 'grammar' ? 'week_grammar_attempts' : 'week_vocabulary_attempts';
    const attemptResult = await readAttempts(client, table, userId, week);
    if (attemptResult.error) continue;
    const known = new Set(plan.items.filter((item) => item.counted).map((item) => item.id));
    const answered = new Set(attemptResult.rows
      .filter((row) => known.has(row.item_id) && typeof row.correct === 'boolean')
      .map((row) => row.item_id));
    if (!known.size || [...known].some((itemId) => !answered.has(itemId))) continue;

    const result = await finishPractice({ admin, client, userId, skill, week });
    if (result.ok) {
      completed.add(skill);
      created.push(skill);
    }
  }
  return created;
}
