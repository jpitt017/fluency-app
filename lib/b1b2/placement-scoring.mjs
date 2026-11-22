/** Score a complete v2 diagnostic on the server. */
export function scorePlacement(answers, key) {
  if (key.length !== 24) throw new Error('Placement questions are unavailable.');
  if (!Array.isArray(answers) || answers.length !== 24 || !answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)) {
    throw new Error('Provide 24 valid answers.');
  }
  const score = key.reduce((total, correct, index) => total + (correct === answers[index] ? 1 : 0), 0);
  return { score, total: 24, placement: score <= 11 ? 'foundation' : score <= 18 ? 'stage1' : 'stage2' };
}
