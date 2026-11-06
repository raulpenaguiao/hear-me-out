import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secret bearer tokens for channel web pages and RSS feeds.
 *
 * - 32 bytes from the OS CSPRNG, encoded as base64url (43 characters).
 * - Looked up by HMAC-SHA256(secret, token). A database dump alone does not
 *   reveal usable tokens, and the hash cannot be brute-forced offline without
 *   the server-side secret.
 * - Additionally stored encrypted (AES-256-GCM) so the owner can view and copy
 *   their links later without us storing plaintext.
 */

export const TOKEN_BYTES = 32;
export const TOKEN_LENGTH = 43; // base64url length of 32 bytes, no padding
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type TokenKind = "web" | "rss";

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Cheap syntactic check so malformed input never reaches the database. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * Domain-separated keyed hash. The kind is part of the MAC input so a web
 * token can never match an RSS hash even if both columns were queried.
 */
export function hashToken(token: string, kind: TokenKind, secret: string): string {
  return createHmac("sha256", secret).update(`ouve-isto:${kind}:${token}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const CIPHER_VERSION = "v1";

function keyFromBase64(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

/** Encrypts a token with AES-256-GCM. Output: v1.<iv>.<ciphertext>.<tag> (base64url). */
export function encryptToken(token: string, kind: TokenKind, keyBase64: string): string {
  const key = keyFromBase64(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`ouve-isto:${kind}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv, ciphertext, tag]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptToken(payload: string, kind: TokenKind, keyBase64: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
    throw new Error("Unsupported token ciphertext format");
  }
  const [, ivPart, dataPart, tagPart] = parts as [string, string, string, string];
  const key = keyFromBase64(keyBase64);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(`ouve-isto:${kind}`));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!isWellFormedToken(plain)) {
    throw new Error("Decrypted token is malformed");
  }
  return plain;
}

export interface TokenSecrets {
  hashSecret: string;
  encryptionKey: string;
}

export interface IssuedToken {
  token: string;
  hash: string;
  ciphertext: string;
}

export function issueToken(kind: TokenKind, secrets: TokenSecrets): IssuedToken {
  const token = generateToken();
  return {
    token,
    hash: hashToken(token, kind, secrets.hashSecret),
    ciphertext: encryptToken(token, kind, secrets.encryptionKey),
  };
}

/**
 * Splits a URL path segment like "<token>.mp3" or "<token>.xml" into the token
 * and optional extension. Returns null if the token part is malformed.
 */
export function parseTokenSegment(segment: string): { token: string; ext: string | null } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const match = /^([A-Za-z0-9_-]+)(?:\.([a-z0-9]{1,5}))?$/i.exec(decoded);
  if (!match) return null;
  const token = match[1]!;
  if (!isWellFormedToken(token)) return null;
  return { token, ext: match[2]?.toLowerCase() ?? null };
}
