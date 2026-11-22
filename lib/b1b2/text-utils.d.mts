export function countWords(text: string | null | undefined): number;
export function writingTaskStatus(
  text: string | null | undefined,
  minimum?: number,
  target?: number,
): { words: number; meetsMinimum: boolean; meetsTarget: boolean; message: string };
export function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs?: number,
  timeoutMessage?: string,
): Promise<Response>;
