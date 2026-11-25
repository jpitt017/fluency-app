/** Fixed-answer marking; callers must keep the exercise bank on the server. */
function normalize(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
}

// One inserted, missing or replaced letter in one word of at least six letters.
function oneLetterOff(answer, target) {
  const a = answer.split(' '), b = target.split(' ');
  if (a.length !== b.length) return false;
  let changed = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (changed || b[i].length < 6 || !/^[a-z]+$/.test(a[i]) || !/^[a-z]+$/.test(b[i]) || Math.abs(a[i].length - b[i].length) > 1) return false;
    let x = 0, y = 0, errors = 0;
    while (x < a[i].length && y < b[i].length) {
      if (a[i][x] === b[i][y]) { x++; y++; continue; }
      if (++errors > 1) return false;
      if (a[i].length > b[i].length) x++;
      else if (a[i].length < b[i].length) y++;
      else { x++; y++; }
    }
    errors += (a[i].length - x) + (b[i].length - y);
    if (errors !== 1) return false;
    changed = true;
  }
  return changed;
}

/** Mark only a submitted, known item. No unrelated answer keys are returned. */
export function markVocabularyAnswer(week, id, answer) {
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 500) throw new Error('Please answer this question.');
  let item = week.match.items.find(entry => entry.id === id);
  if (item) {
    if (!week.match.items.some(entry => entry.meaning === answer)) throw new Error('Please choose a meaning.');
    return { correct: answer === item.meaning, feedback: answer === item.meaning ? 'That is right.' : 'Not quite. Try again.' };
  }
  item = week.text.items.find(entry => entry.id === id);
  if (item) {
    if (!week.text.wordBox.includes(answer)) throw new Error('Please choose a word from the box.');
    const correct = answer === item.key;
    // The authored reason explains why the word fits the gap, so a wrong pick
    // teaches something instead of only saying no. It stays server-side until
    // this item is checked, and is the same line a reload restores.
    return { correct, feedback: item.reason ?? (correct ? 'That is right.' : 'Not quite. Try again.') };
  }
  item = [...week.chooseVerb, ...week.wordForms].find(entry => entry.id === id);
  if (item) {
    if (!item.options.includes(answer)) throw new Error('Please choose an answer.');
    return { correct: answer === item.options[item.answer_index], feedback: item.reason };
  }
  item = week.typeTheWord.items.find(entry => entry.id === id);
  if (item) {
    const input = normalize(answer);
    const accepted = item.accept.map(normalize);
    const exact = accepted.includes(input);
    const nearly = !exact && accepted.some(key => oneLetterOff(input, key));
    return { correct: exact || nearly, nearly, feedback: exact ? 'That is right.' : nearly ? `Nearly! Check the spelling: ${item.key}` : `Not quite. The answer is: ${item.key}` };
  }
  throw new Error('Question not found.');
}
