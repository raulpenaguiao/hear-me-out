import { describe, expect, it } from "vitest";
import {
  channelInputSchema,
  completeUploadSchema,
  createUploadSchema,
  episodeInputSchema,
  safeRedirectPath,
  signUpSchema,
} from "@/lib/validation";

describe("episode validation", () => {
  it("trims and requires a title", () => {
    expect(episodeInputSchema.parse({ title: "  Olá  " })).toEqual({ title: "Olá", description: "" });
    expect(episodeInputSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("limits lengths", () => {
    expect(episodeInputSchema.safeParse({ title: "a".repeat(201) }).success).toBe(false);
    expect(episodeInputSchema.safeParse({ title: "a", description: "a".repeat(10001) }).success).toBe(false);
    expect(episodeInputSchema.safeParse({ title: "a".repeat(200), description: "a".repeat(10000) }).success).toBe(true);
  });

  it("returns pt-PT messages", () => {
    const result = episodeInputSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Dá um título ao episódio.");
  });
});

describe("channel validation", () => {
  it("applies defaults", () => {
    expect(channelInputSchema.parse({ title: "Peripécias" })).toEqual({
      title: "Peripécias",
      description: "",
      authorName: null,
      category: "Society & Culture",
      explicit: false,
      published: true,
    });
  });
  it("rejects unknown categories", () => {
    expect(channelInputSchema.safeParse({ title: "x", category: "Gambling" }).success).toBe(false);
  });
});

describe("upload validation", () => {
  it("requires positive integer sizes and a valid target", () => {
    const base = { kind: "audio", episodeId: crypto.randomUUID(), fileName: "a.mp3", contentType: "audio/mpeg" };
    expect(createUploadSchema.safeParse({ ...base, size: 10 }).success).toBe(true);
    expect(createUploadSchema.safeParse({ ...base, size: 0 }).success).toBe(false);
    expect(createUploadSchema.safeParse({ ...base, size: 1.5 }).success).toBe(false);
    expect(createUploadSchema.safeParse({ ...base, episodeId: "1; drop table", size: 10 }).success).toBe(false);
    expect(createUploadSchema.safeParse({ ...base, kind: "video", size: 10 }).success).toBe(false);
  });

  it("normalises durations", () => {
    expect(completeUploadSchema.parse({ durationSeconds: 12.6 })).toEqual({ durationSeconds: 13 });
    expect(completeUploadSchema.parse({})).toEqual({ durationSeconds: null });
    expect(completeUploadSchema.safeParse({ durationSeconds: -1 }).success).toBe(false);
    expect(completeUploadSchema.safeParse({ durationSeconds: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});

describe("auth validation", () => {
  it("normalises e-mails and enforces password length", () => {
    expect(signUpSchema.parse({ email: " Ana@Example.PT ", password: "12345678" }).email).toBe("ana@example.pt");
    expect(signUpSchema.safeParse({ email: "ana@example.pt", password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "not-an-email", password: "12345678" }).success).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/painel/canais", "/painel/canais"],
    ["https://evil.example", "/painel"],
    ["//evil.example", "/painel"],
    ["/\\evil.example", "/painel"],
    [undefined, "/painel"],
    [["/a"], "/painel"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
