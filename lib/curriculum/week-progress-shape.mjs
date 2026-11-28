/**
 * Pure mapping for the six weekly tasks. `minutes` is an estimate prorated
 * from the authored task duration and saved answer count, not a timer reading.
 */
export const WEEK_PROGRESS_TASKS = [
  { key: 'grammar', minutes: 10 },
  { key: 'vocabulary', minutes: 10 },
  { key: 'reading', minutes: 10 },
  { key: 'listening', minutes: 8 },
  { key: 'speaking', minutes: 12 },
  { key: 'writing', minutes: 10 },
];

/** @param {{
 * completions?: {skill: string, answered?: number}[], grammarItemIds?: string[], vocabularyItemIds?: string[],
 * grammarQuestionIds?: string[], vocabularyQuestionIds?: string[],
 * inputSubmissions?: {skill: string}[], inputAnswers?: {skill: string, item_id: string}[],
 * outputSubmissions?: {skill: string}[], speakingRecordings?: number, writingSubmissions?: number,
 * readingQuestionIds?: string[], listeningQuestionIds?: string[], readingTotal?: number, listeningTotal?: number,
 * grammarTotal?: number, vocabularyTotal?: number,
 * }} input
 */
export function makeWeekProgress(input = {}) {
  const {
    completions = [],
    grammarItemIds = [],
    vocabularyItemIds = [],
    grammarQuestionIds = [],
    vocabularyQuestionIds = [],
    inputSubmissions = [],
    inputAnswers = [],
    outputSubmissions = [],
    speakingRecordings = 0,
    writingSubmissions = 0,
    readingQuestionIds = [],
    listeningQuestionIds = [],
    readingTotal = 0,
    listeningTotal = 0,
    grammarTotal = 0,
    vocabularyTotal = 0,
  } = input;
  const uniqueCount = (values) => new Set(values.filter((value) => typeof value === 'string' && value.length)).size;
  const plannedCount = (values, ids) => {
    const allowed = new Set(ids);
    return uniqueCount(values.filter((value) => allowed.has(value)));
  };
  const has = (rows, skill) => rows.some((row) => row.skill === skill);
  const inputCount = (skill) => {
    const allowed = new Set(skill === 'reading' ? readingQuestionIds : listeningQuestionIds);
    return uniqueCount(inputAnswers.filter((row) => row.skill === skill && allowed.has(row.item_id)).map((row) => row.item_id));
  };
  const completion = (skill) => completions.find((row) => row.skill === skill);

  const raw = {
    grammar: { done: Boolean(completion('grammar')), itemsAnswered: Math.max(plannedCount(grammarItemIds, grammarQuestionIds), Number(completion('grammar')?.answered ?? 0)), total: grammarTotal },
    vocabulary: { done: Boolean(completion('vocabulary')), itemsAnswered: Math.max(plannedCount(vocabularyItemIds, vocabularyQuestionIds), Number(completion('vocabulary')?.answered ?? 0)), total: vocabularyTotal },
    reading: { done: has(inputSubmissions, 'reading'), itemsAnswered: inputCount('reading'), total: readingTotal },
    listening: { done: has(inputSubmissions, 'listening'), itemsAnswered: inputCount('listening'), total: listeningTotal },
    speaking: { done: has(outputSubmissions, 'speaking') || speakingRecordings > 0, itemsAnswered: has(outputSubmissions, 'speaking') || speakingRecordings > 0 ? 1 : 0, total: 1 },
    writing: { done: has(outputSubmissions, 'writing') || writingSubmissions > 0, itemsAnswered: has(outputSubmissions, 'writing') || writingSubmissions > 0 ? 1 : 0, total: 1 },
  };

  // When every input answer is saved, treat it as complete even if the separate
  // completion upsert was interrupted. The server loader also retries that
  // marker in the answer-save route so week unlocking and progress stay aligned.
  for (const skill of ['reading', 'listening']) {
    const task = raw[skill];
    if (task.total > 0 && task.itemsAnswered >= task.total) task.done = true;
  }

  return Object.fromEntries(WEEK_PROGRESS_TASKS.map(({ key, minutes }) => {
    const task = raw[key];
    const itemsAnswered = Math.min(task.itemsAnswered, task.total || task.itemsAnswered);
    const estimatedMinutes = task.total > 0 && itemsAnswered > 0
      ? Math.min(minutes, Math.ceil(minutes * itemsAnswered / task.total))
      : task.done ? minutes : 0;
    return [key, { done: task.done, itemsAnswered, minutes: estimatedMinutes }];
  }));
}
