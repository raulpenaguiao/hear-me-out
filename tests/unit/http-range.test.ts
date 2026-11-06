import { describe, expect, it } from "vitest";
import { contentRangeHeader, parseRangeHeader } from "@/lib/http-range";

describe("parseRangeHeader", () => {
  const size = 1000;

  it("returns none without a header", () => {
    expect(parseRangeHeader(null, size)).toEqual({ type: "none" });
  });

  it.each([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=0-", { start: 0, end: 999 }],
    ["bytes=500-", { start: 500, end: 999 }],
    ["bytes=-100", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    ["bytes=900-5000", { start: 900, end: 999 }],
    ["bytes=999-999", { start: 999, end: 999 }],
    ["BYTES = 10 - 20", { start: 10, end: 20 }],
  ])("parses %s", (header, range) => {
    expect(parseRangeHeader(header, size)).toEqual({ type: "range", range });
  });

  it.each(["bytes=1000-", "bytes=5000-6000", "bytes=-0"])("reports %s as unsatisfiable", (header) => {
    expect(parseRangeHeader(header, size)).toEqual({ type: "unsatisfiable" });
  });

  it.each(["items=0-10", "bytes=abc", "bytes=10-5", "bytes=0-10,20-30", "bytes=-", "bytes=1.5-2"])(
    "ignores invalid or multi-range header %s",
    (header) => {
      expect(parseRangeHeader(header, size)).toEqual({ type: "none" });
    },
  );

  it("treats empty objects as unsatisfiable", () => {
    expect(parseRangeHeader("bytes=0-", 0)).toEqual({ type: "unsatisfiable" });
  });

  it("formats Content-Range", () => {
    expect(contentRangeHeader({ start: 0, end: 99 }, 1000)).toBe("bytes 0-99/1000");
  });
});
