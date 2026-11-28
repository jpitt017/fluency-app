import { answersEquivalent, normalizeDiffWord } from './contractions.mjs';

export interface DiffToken {
  type: 'same' | 'removed' | 'added';
  text: string;
}

function tokenizeWords(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

/**
 * Word-level LCS diff between original and revised text.
 * Compares words ignoring capital letters and punctuation so harmless casing
 * or trailing full stops are never highlighted as errors.
 */
export function computeWordDiff(original: string, revised: string): DiffToken[] {
  const a = tokenizeWords(original);
  const b = tokenizeWords(revised);
  const normA = a.map(normalizeDiffWord);
  const normB = b.map(normalizeDiffWord);
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        normA[i] && normA[i] === normB[j]
          ? 1 + dp[i + 1][j + 1]
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (normA[i] && normA[i] === normB[j]) {
      tokens.push({ type: 'same', text: b[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      tokens.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < n) {
    tokens.push({ type: 'removed', text: a[i++] });
  }
  while (j < m) {
    tokens.push({ type: 'added', text: b[j++] });
  }
  return tokens;
}

export function normalizeSentenceForCompare(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sentencesEquivalentForReview(a: string, b: string): boolean {
  return answersEquivalent(a, b);
}
