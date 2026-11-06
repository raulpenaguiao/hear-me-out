import { z } from "zod";
import { PODCAST_CATEGORIES } from "./rss";

/** Shared input validation. Error messages are user-facing (pt-PT). */

const trimmed = (max: number, message: string) => z.string().trim().max(max, message);

export const uuidSchema = z.uuid("Identificador inválido.");

export const channelInputSchema = z.object({
  title: trimmed(120, "O nome pode ter no máximo 120 caracteres.").min(1, "Dá um nome ao canal."),
  description: trimmed(4000, "A descrição pode ter no máximo 4000 caracteres.").default(""),
  authorName: trimmed(120, "O nome do autor pode ter no máximo 120 caracteres.")
    .optional()
    .transform((v) => (v ? v : null)),
  category: z.enum(PODCAST_CATEGORIES).default("Society & Culture"),
  explicit: z.boolean().default(false),
  published: z.boolean().default(true),
});

export type ChannelInput = z.infer<typeof channelInputSchema>;

export const episodeInputSchema = z.object({
  title: trimmed(200, "O título pode ter no máximo 200 caracteres.").min(1, "Dá um título ao episódio."),
  description: trimmed(10000, "A descrição pode ter no máximo 10000 caracteres.").default(""),
});

export type EpisodeInput = z.infer<typeof episodeInputSchema>;

export const createEpisodeSchema = episodeInputSchema.extend({ channelId: uuidSchema });

export const episodeStatusSchema = z.enum(["draft", "published"]);

export const rotateTokensSchema = z.object({
  which: z.enum(["web", "rss", "both"]),
});

export const createUploadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("audio"),
    episodeId: uuidSchema,
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(100),
    size: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("cover"),
    channelId: uuidSchema,
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(100),
    size: z.number().int().positive(),
  }),
]);

export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const completeUploadSchema = z.object({
  durationSeconds: z
    .number()
    .finite()
    .nonnegative()
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === null ? null : Math.round(v))),
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Indica um e-mail válido.")
  .pipe(z.email("Indica um e-mail válido."));

export const passwordSchema = z
  .string()
  .min(8, "A palavra-passe deve ter pelo menos 8 caracteres.")
  .max(72, "A palavra-passe pode ter no máximo 72 caracteres.");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: trimmed(80, "O nome pode ter no máximo 80 caracteres.").optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Indica a palavra-passe.").max(72),
});

export const profileSchema = z.object({
  displayName: trimmed(80, "O nome pode ter no máximo 80 caracteres."),
});

/** Only allow same-origin relative redirects (prevents open redirects). */
export function safeRedirectPath(value: unknown, fallback = "/painel"): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  // Reject backslashes and control characters (URL parsers strip tabs/newlines,
  // turning "/\t/evil.example" into "//evil.example").
  if (!value.startsWith("/") || /[\\\u0000-\u001F\u007F]/.test(value)) return fallback;
  const base = "https://ouve-isto.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
