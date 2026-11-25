export type GapSegment =
  | { type: 'text'; text: string }
  | { type: 'gap'; gap: number; id: string };

export function parseGapText(
  body: string,
  items: { id: string; gap: number }[],
): GapSegment[];

export function gapsCoverItems(
  segments: GapSegment[],
  items: { id: string; gap: number }[],
): boolean;
