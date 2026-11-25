/**
 * Split a gap-fill body into text segments and numbered gaps.
 *
 * The authored bodies mark gaps as "(1) ___". Each marker becomes an
 * interactive gap tied to its bank item; everything else stays literal text.
 * A marker with no item (or an item with no marker) is left as text — the
 * caller checks completeness before rendering the interactive version, so a
 * mismatched bank can never produce a gap the server cannot mark.
 *
 * Pure and client-safe: no keys, no reasons, only what the learner reads.
 */
export function parseGapText(body, items) {
  const byGap = new Map(items.map((item) => [item.gap, item.id]));
  const segments = [];
  const pattern = /\((\d+)\)\s*___/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const gap = Number(match[1]);
    const id = byGap.get(gap);
    if (!id) continue; // no bank item: leave the marker as literal text
    if (match.index > cursor) segments.push({ type: 'text', text: body.slice(cursor, match.index) });
    segments.push({ type: 'gap', gap, id });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) segments.push({ type: 'text', text: body.slice(cursor) });
  return segments;
}

/** True when every bank item has exactly one interactive gap in the segments. */
export function gapsCoverItems(segments, items) {
  const gaps = segments.filter((segment) => segment.type === 'gap');
  return (
    gaps.length === items.length &&
    items.every((item) => gaps.filter((segment) => segment.id === item.id).length === 1)
  );
}
