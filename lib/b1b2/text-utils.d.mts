export function countWords(text: string | null | undefined): number;
export function writingWordCounter(
  text: string,
  minimum?: number,
  maximum?: number,
  target?: number,
): { words: number; label: string; minimum: number; maximum: number; target: number; meetsMinimum: boolean; overMaximum: boolean };

export function writingHint(words: number, minimum?: number): string | null;

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
