/**
 * HTTP Range header parsing (RFC 9110 §14). Only single byte ranges are
 * served; multi-range requests fall back to a full 200 response, which the
 * RFC permits.
 */

export interface ByteRange {
  start: number;
  /** Inclusive end offset. */
  end: number;
}

export type RangeParseResult =
  | { type: "none" }
  | { type: "range"; range: ByteRange }
  | { type: "unsatisfiable" };

export function parseRangeHeader(header: string | null, size: number): RangeParseResult {
  if (!header) return { type: "none" };
  const trimmed = header.trim();
  const match = /^bytes\s*=\s*(.+)$/i.exec(trimmed);
  if (!match) return { type: "none" }; // unknown unit: ignore the header

  const specs = match[1]!.split(",").map((s) => s.trim()).filter(Boolean);
  if (specs.length !== 1) return { type: "none" };
  const spec = specs[0]!;

  const parts = /^(\d*)\s*-\s*(\d*)$/.exec(spec);
  if (!parts) return { type: "none" };
  const [, startRaw, endRaw] = parts as unknown as [string, string, string];

  if (size <= 0) return { type: "unsatisfiable" };

  if (startRaw === "") {
    // Suffix range: last N bytes.
    if (endRaw === "") return { type: "none" };
    const suffix = Number(endRaw);
    if (!Number.isSafeInteger(suffix) || suffix === 0) return { type: "unsatisfiable" };
    const start = Math.max(0, size - suffix);
    return { type: "range", range: { start, end: size - 1 } };
  }

  const start = Number(startRaw);
  if (!Number.isSafeInteger(start)) return { type: "none" };
  if (start >= size) return { type: "unsatisfiable" };

  let end = endRaw === "" ? size - 1 : Number(endRaw);
  if (!Number.isSafeInteger(end)) return { type: "none" };
  if (end < start) return { type: "none" }; // syntactically invalid: ignore
  end = Math.min(end, size - 1);
  return { type: "range", range: { start, end } };
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

export function rangeLength(range: ByteRange): number {
  return range.end - range.start + 1;
}
