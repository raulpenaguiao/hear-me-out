/**
 * Minimal, strict XML serialization helpers used by the RSS generator.
 *
 * We generate XML ourselves instead of using an RSS library so we have full
 * control over podcast-specific elements (itunes:*, podcast:*) and so every
 * user-provided string passes through exactly one escaping function.
 */

// Characters that are illegal in XML 1.0 documents even when escaped:
// C0 controls except TAB, LF, CR; lone surrogates; U+FFFE and U+FFFF.
const INVALID_XML_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripInvalidXmlChars(value: string): string {
  return value.replace(INVALID_XML_CHARS, "");
}

/** Escapes text for use in XML element content and attribute values. */
export function escapeXml(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type XmlAttributes = Record<string, string | number | boolean | null | undefined>;

export interface XmlNode {
  name: string;
  attributes?: XmlAttributes;
  /** Text content (escaped) or child nodes. */
  children?: string | XmlNode[];
}

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

function assertName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid XML name: ${name}`);
  }
}

function serializeAttributes(attributes: XmlAttributes | undefined): string {
  if (!attributes) return "";
  let out = "";
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    assertName(key);
    out += ` ${key}="${escapeXml(String(value))}"`;
  }
  return out;
}

export function serializeNode(node: XmlNode, indent = 0, pretty = true): string {
  assertName(node.name);
  const pad = pretty ? "  ".repeat(indent) : "";
  const nl = pretty ? "\n" : "";
  const attrs = serializeAttributes(node.attributes);
  const { children } = node;

  if (children === undefined || (Array.isArray(children) && children.length === 0)) {
    return `${pad}<${node.name}${attrs}/>`;
  }
  if (typeof children === "string") {
    return `${pad}<${node.name}${attrs}>${escapeXml(children)}</${node.name}>`;
  }
  const inner = children.map((child) => serializeNode(child, indent + 1, pretty)).join(nl);
  return `${pad}<${node.name}${attrs}>${nl}${inner}${nl}${pad}</${node.name}>`;
}

export function serializeDocument(root: XmlNode, pretty = true): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializeNode(root, 0, pretty)}\n`;
}

/** Helper to build optional nodes without noisy conditionals. */
export function el(name: string, children?: string | XmlNode[] | null, attributes?: XmlAttributes): XmlNode {
  return { name, attributes, children: children ?? undefined };
}
