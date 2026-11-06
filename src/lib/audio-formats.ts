/**
 * Supported audio formats, extension/MIME mapping and content sniffing.
 *
 * Client-supplied MIME types are treated as hints only: after an upload
 * completes, the server reads the first bytes of the object and verifies that
 * they match the declared container format.
 */

export type AudioFormatId = "mp3" | "aac" | "m4a" | "wav" | "webm" | "ogg";

export interface AudioFormat {
  id: AudioFormatId;
  /** Canonical MIME type stored in the database and used in RSS enclosures. */
  mimeType: string;
  /** Preferred file extension used in enclosure URLs. */
  extension: string;
  extensions: string[];
  /** MIME types browsers/clients commonly report for this format. */
  acceptedMimeTypes: string[];
  label: string;
}

export const AUDIO_FORMATS: readonly AudioFormat[] = [
  {
    id: "mp3",
    mimeType: "audio/mpeg",
    extension: "mp3",
    extensions: ["mp3"],
    acceptedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/mpeg3", "audio/x-mpeg-3"],
    label: "MP3",
  },
  {
    id: "m4a",
    mimeType: "audio/mp4",
    extension: "m4a",
    extensions: ["m4a", "mp4", "m4b"],
    acceptedMimeTypes: ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac-mp4", "video/mp4"],
    label: "M4A",
  },
  {
    id: "aac",
    mimeType: "audio/aac",
    extension: "aac",
    extensions: ["aac"],
    acceptedMimeTypes: ["audio/aac", "audio/x-aac", "audio/aacp"],
    label: "AAC",
  },
  {
    id: "wav",
    mimeType: "audio/wav",
    extension: "wav",
    extensions: ["wav"],
    acceptedMimeTypes: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"],
    label: "WAV",
  },
  {
    id: "webm",
    mimeType: "audio/webm",
    extension: "webm",
    extensions: ["webm", "weba"],
    acceptedMimeTypes: ["audio/webm", "video/webm"],
    label: "WebM/Opus",
  },
  {
    id: "ogg",
    mimeType: "audio/ogg",
    extension: "ogg",
    extensions: ["ogg", "oga", "opus"],
    acceptedMimeTypes: ["audio/ogg", "audio/opus", "application/ogg"],
    label: "Ogg/Opus",
  },
] as const;

export const ACCEPT_ATTRIBUTE = [
  ...new Set(AUDIO_FORMATS.flatMap((f) => [...f.acceptedMimeTypes, ...f.extensions.map((e) => `.${e}`)])),
].join(",");

/** Strips parameters, e.g. "audio/webm;codecs=opus" -> "audio/webm". */
export function baseMimeType(mime: string): string {
  return mime.split(";")[0]!.trim().toLowerCase();
}

export function fileExtension(fileName: string): string | null {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : null;
}

export function formatById(id: AudioFormatId): AudioFormat {
  const format = AUDIO_FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Unknown audio format ${id}`);
  return format;
}

export function formatByMimeType(mime: string): AudioFormat | null {
  const base = baseMimeType(mime);
  return AUDIO_FORMATS.find((f) => f.acceptedMimeTypes.includes(base)) ?? null;
}

export function formatByExtension(ext: string): AudioFormat | null {
  const lower = ext.toLowerCase();
  return AUDIO_FORMATS.find((f) => f.extensions.includes(lower)) ?? null;
}

export type DeclaredFormatResult =
  | { ok: true; format: AudioFormat }
  | { ok: false; reason: "unsupported_type" | "unsupported_extension" | "type_extension_mismatch" };

/**
 * Validates the declared MIME type and file extension of an upload request.
 * Both must be known and agree with each other. (Some browsers report
 * WebM/Opus recordings as video/webm and AAC-in-MP4 as video/mp4; those are
 * accepted and normalised.)
 */
export function resolveDeclaredFormat(fileName: string, mimeType: string): DeclaredFormatResult {
  const byMime = formatByMimeType(mimeType);
  if (!byMime) return { ok: false, reason: "unsupported_type" };
  const ext = fileExtension(fileName);
  if (!ext) return { ok: true, format: byMime };
  const byExt = formatByExtension(ext);
  if (!byExt) return { ok: false, reason: "unsupported_extension" };
  if (byExt.id !== byMime.id) return { ok: false, reason: "type_extension_mismatch" };
  return { ok: true, format: byMime };
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return "";
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function isMpegAudioFrame(b0: number, b1: number): boolean {
  // 11-bit frame sync, layer bits != 00 (00 is reserved; ADTS uses 00).
  return b0 === 0xff && (b1 & 0xe0) === 0xe0 && ((b1 >> 1) & 0x03) !== 0;
}

function isAdtsFrame(b0: number, b1: number): boolean {
  // 12-bit sync 0xFFF and layer bits == 00.
  return b0 === 0xff && (b1 & 0xf6) === 0xf0;
}

function skipId3(bytes: Uint8Array): number {
  if (ascii(bytes, 0, 3) !== "ID3" || bytes.length < 10) return 0;
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** Number of leading bytes the server reads to sniff an upload. */
export const SNIFF_BYTES = 4096;

/**
 * Detects the container format from the first bytes of a file.
 * Returns null for anything that is not a supported audio container.
 */
export function sniffAudioFormat(bytes: Uint8Array): AudioFormatId | null {
  if (bytes.length < 12) return null;

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "wav";
  if (ascii(bytes, 4, 4) === "ftyp") return "m4a";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (ascii(bytes, 0, 4) === "OggS") return "ogg";

  const offset = skipId3(bytes);
  if (offset > 0) {
    // ID3v2 is overwhelmingly used with MP3; if the frame after the tag is
    // within the sniffed window, use it to tell MP3 and ADTS AAC apart.
    if (bytes.length >= offset + 2) {
      if (isAdtsFrame(bytes[offset]!, bytes[offset + 1]!)) return "aac";
    }
    return "mp3";
  }
  if (isAdtsFrame(bytes[0]!, bytes[1]!)) return "aac";
  if (isMpegAudioFrame(bytes[0]!, bytes[1]!)) return "mp3";
  return null;
}

/** Whether the bytes actually stored match the format the client declared. */
export function sniffMatchesDeclared(sniffed: AudioFormatId | null, declared: AudioFormatId): boolean {
  return sniffed !== null && sniffed === declared;
}

// ---------------------------------------------------------------------------
// Cover images
// ---------------------------------------------------------------------------

export interface ImageFormat {
  mimeType: string;
  extension: string;
  extensions: string[];
}

export const IMAGE_FORMATS: readonly ImageFormat[] = [
  { mimeType: "image/jpeg", extension: "jpg", extensions: ["jpg", "jpeg"] },
  { mimeType: "image/png", extension: "png", extensions: ["png"] },
  { mimeType: "image/webp", extension: "webp", extensions: ["webp"] },
];

export const IMAGE_ACCEPT_ATTRIBUTE = IMAGE_FORMATS.flatMap((f) => [
  f.mimeType,
  ...f.extensions.map((e) => `.${e}`),
]).join(",");

export function imageFormatByMimeType(mime: string): ImageFormat | null {
  const base = baseMimeType(mime);
  return IMAGE_FORMATS.find((f) => f.mimeType === base) ?? null;
}

export function sniffImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a
  )
    return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}
