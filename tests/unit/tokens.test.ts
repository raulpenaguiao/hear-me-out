import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  generateToken,
  hashToken,
  isWellFormedToken,
  issueToken,
  parseTokenSegment,
  safeEqualHex,
  TOKEN_LENGTH,
} from "@/lib/tokens";
import { TEST_SECRETS } from "../helpers/memory-repo";

describe("token generation", () => {
  it("produces 256-bit base64url tokens", () => {
    const token = generateToken();
    expect(token).toHaveLength(TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats across many generations", () => {
    const tokens = new Set(Array.from({ length: 2000 }, generateToken));
    expect(tokens.size).toBe(2000);
  });

  it("validates token shape", () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${generateToken()}x`)).toBe(false);
    expect(isWellFormedToken("a".repeat(42) + "!")).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
  });
});

describe("token hashing", () => {
  it("is deterministic and keyed", () => {
    const token = generateToken();
    const a = hashToken(token, "rss", TEST_SECRETS.hashSecret);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token, "rss", TEST_SECRETS.hashSecret)).toBe(a);
    expect(hashToken(token, "rss", `${TEST_SECRETS.hashSecret}-other`)).not.toBe(a);
  });

  it("is domain separated between web and rss tokens", () => {
    const token = generateToken();
    expect(hashToken(token, "web", TEST_SECRETS.hashSecret)).not.toBe(
      hashToken(token, "rss", TEST_SECRETS.hashSecret),
    );
  });

  it("does not contain the plaintext token", () => {
    const token = generateToken();
    expect(hashToken(token, "web", TEST_SECRETS.hashSecret)).not.toContain(token);
  });

  it("compares hashes in constant time", () => {
    const h = hashToken(generateToken(), "web", TEST_SECRETS.hashSecret);
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, h.replace(/.$/, h.endsWith("0") ? "1" : "0"))).toBe(false);
    expect(safeEqualHex(h, "abcd")).toBe(false);
  });
});

describe("token encryption", () => {
  it("round-trips", () => {
    const token = generateToken();
    const ct = encryptToken(token, "web", TEST_SECRETS.encryptionKey);
    expect(ct).not.toContain(token);
    expect(ct.startsWith("v1.")).toBe(true);
    expect(decryptToken(ct, "web", TEST_SECRETS.encryptionKey)).toBe(token);
  });

  it("uses a fresh IV each time", () => {
    const token = generateToken();
    expect(encryptToken(token, "web", TEST_SECRETS.encryptionKey)).not.toBe(
      encryptToken(token, "web", TEST_SECRETS.encryptionKey),
    );
  });

  it("rejects tampering, wrong kind and wrong key", () => {
    const token = generateToken();
    const ct = encryptToken(token, "rss", TEST_SECRETS.encryptionKey);
    const parts = ct.split(".");
    const data = Buffer.from(parts[2]!, "base64url");
    data[0] = data[0]! ^ 0xff;
    parts[2] = data.toString("base64url");
    expect(() => decryptToken(parts.join("."), "rss", TEST_SECRETS.encryptionKey)).toThrow();
    expect(() => decryptToken(ct, "web", TEST_SECRETS.encryptionKey)).toThrow();
    expect(() => decryptToken(ct, "rss", Buffer.alloc(32, 9).toString("base64"))).toThrow();
    expect(() => decryptToken("garbage", "rss", TEST_SECRETS.encryptionKey)).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => encryptToken(generateToken(), "web", Buffer.alloc(16).toString("base64"))).toThrow();
  });
});

describe("issueToken", () => {
  it("returns a consistent token/hash/ciphertext triple", () => {
    const issued = issueToken("rss", TEST_SECRETS);
    expect(issued.hash).toBe(hashToken(issued.token, "rss", TEST_SECRETS.hashSecret));
    expect(decryptToken(issued.ciphertext, "rss", TEST_SECRETS.encryptionKey)).toBe(issued.token);
  });
});

describe("parseTokenSegment", () => {
  const token = generateToken();
  it("accepts bare tokens and tokens with extensions", () => {
    expect(parseTokenSegment(token)).toEqual({ token, ext: null });
    expect(parseTokenSegment(`${token}.mp3`)).toEqual({ token, ext: "mp3" });
    expect(parseTokenSegment(`${token}.XML`)).toEqual({ token, ext: "xml" });
  });
  it("rejects malformed input", () => {
    expect(parseTokenSegment("abc")).toBeNull();
    expect(parseTokenSegment(`${token}.mp3.exe`)).toBeNull();
    expect(parseTokenSegment(`${token}%2F..`)).toBeNull();
    expect(parseTokenSegment("%E0%A4%A")).toBeNull();
    expect(parseTokenSegment(`../${token}`)).toBeNull();
  });
});
