import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { el, escapeXml, serializeDocument, stripInvalidXmlChars } from "@/lib/xml";

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;",
    );
  });

  it("does not double-escape", () => {
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });

  it("keeps Portuguese characters and emoji intact", () => {
    expect(escapeXml("Peripécias — ação, coração 🎙️")).toBe("Peripécias — ação, coração 🎙️");
  });

  it("strips characters that are illegal in XML 1.0", () => {
    expect(stripInvalidXmlChars("a\u0000b\u0008c\u000Bd\u001Fe￾f")).toBe("abcdef");
    expect(stripInvalidXmlChars("tab\tnew\nline\r")).toBe("tab\tnew\nline\r");
    // Lone surrogates are removed, valid pairs kept.
    expect(stripInvalidXmlChars("x\uD800y")).toBe("xy");
    expect(stripInvalidXmlChars("x\uDC00y")).toBe("xy");
    expect(stripInvalidXmlChars("😀")).toBe("😀");
  });
});

describe("serializeDocument", () => {
  it("produces well-formed XML from hostile input", () => {
    const hostile = `]]></title><script>alert(1)</script>\u0000&"'<!--`;
    const xml = serializeDocument(
      el("root", [el("title", hostile), el("item", null, { url: hostile, empty: null })]),
    );
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
  });

  it("omits null/undefined attributes and self-closes empty elements", () => {
    expect(serializeDocument(el("a", null, { x: "1", y: undefined, z: null }), false)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<a x="1"/>\n',
    );
  });

  it("rejects invalid element names", () => {
    expect(() => serializeDocument(el("bad name", "x"))).toThrow();
    expect(() => serializeDocument(el("a", null, { "x y": "1" }))).toThrow();
  });
});
