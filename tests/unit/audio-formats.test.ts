import { describe, expect, it } from "vitest";
import {
  baseMimeType,
  resolveDeclaredFormat,
  sniffAudioFormat,
  sniffImageMimeType,
  sniffMatchesDeclared,
} from "@/lib/audio-formats";
import { fakeMp3, makeWav } from "../helpers/audio";

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const v of values) {
    if (typeof v === "string") for (const c of v) out.push(c.charCodeAt(0));
    else out.push(v);
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
}

describe("resolveDeclaredFormat", () => {
  it.each([
    ["story.mp3", "audio/mpeg", "audio/mpeg"],
    ["story.mp3", "audio/mp3", "audio/mpeg"],
    ["story.m4a", "audio/x-m4a", "audio/mp4"],
    ["story.m4a", "audio/mp4", "audio/mp4"],
    ["story.aac", "audio/aac", "audio/aac"],
    ["story.wav", "audio/wav", "audio/wav"],
    ["story.wav", "audio/x-wav", "audio/wav"],
    ["recording.webm", "audio/webm;codecs=opus", "audio/webm"],
    ["recording.webm", "video/webm", "audio/webm"],
    ["recording.ogg", "audio/ogg", "audio/ogg"],
    ["noext", "audio/mpeg", "audio/mpeg"],
  ])("accepts %s (%s) as %s", (name, type, expected) => {
    const result = resolveDeclaredFormat(name, type);
    expect(result.ok && result.format.mimeType).toBe(expected);
  });

  it.each([
    ["evil.exe", "audio/mpeg", "unsupported_extension"],
    ["song.mp3", "text/html", "unsupported_type"],
    ["song.mp3", "application/octet-stream", "unsupported_type"],
    ["song.wav", "audio/mpeg", "type_extension_mismatch"],
    ["song.html", "audio/mpeg", "unsupported_extension"],
  ])("rejects %s (%s)", (name, type, reason) => {
    const result = resolveDeclaredFormat(name, type);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("strips MIME parameters", () => {
    expect(baseMimeType("Audio/WebM; codecs=opus")).toBe("audio/webm");
  });
});

describe("sniffAudioFormat", () => {
  it("detects WAV", () => expect(sniffAudioFormat(makeWav(0.1))).toBe("wav"));
  it("detects MP3 with ID3", () => expect(sniffAudioFormat(fakeMp3())).toBe("mp3"));
  it("detects raw MP3 frames", () => expect(sniffAudioFormat(bytes(0xff, 0xfb, 0x90, 0x64))).toBe("mp3"));
  it("detects ADTS AAC", () => expect(sniffAudioFormat(bytes(0xff, 0xf1, 0x50, 0x80))).toBe("aac"));
  it("detects MP4/M4A", () => expect(sniffAudioFormat(bytes(0, 0, 0, 0x20, "ftypM4A "))).toBe("m4a"));
  it("detects WebM", () => expect(sniffAudioFormat(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("webm"));
  it("detects Ogg", () => expect(sniffAudioFormat(bytes("OggS"))).toBe("ogg"));

  it("rejects non-audio content", () => {
    expect(sniffAudioFormat(bytes("<!DOCTYPE html><html>"))).toBeNull();
    expect(sniffAudioFormat(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull();
    expect(sniffAudioFormat(bytes("MZ"))).toBeNull();
    expect(sniffAudioFormat(new Uint8Array(4))).toBeNull();
  });

  it("requires sniffed format to match the declared one", () => {
    expect(sniffMatchesDeclared("wav", "wav")).toBe(true);
    expect(sniffMatchesDeclared("wav", "mp3")).toBe(false);
    expect(sniffMatchesDeclared(null, "mp3")).toBe(false);
  });
});

describe("sniffImageMimeType", () => {
  it("detects JPEG, PNG and WebP", () => {
    expect(sniffImageMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageMimeType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageMimeType(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffImageMimeType(bytes("<svg"))).toBeNull();
  });
});
