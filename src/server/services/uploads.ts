import { randomBytes } from "node:crypto";
import {
  imageFormatByMimeType,
  resolveDeclaredFormat,
  SNIFF_BYTES,
  sniffAudioFormat,
  sniffImageMimeType,
  sniffMatchesDeclared,
  fileExtension,
  formatByMimeType,
} from "@/lib/audio-formats";
import type { CreateUploadInput } from "@/lib/validation";
import { RATE_LIMITS } from "../rate-limit";
import { assertOwnsChannel } from "./channels";
import type { PublisherContext } from "./context";
import { internalError, notFoundError, rateLimitedError, ServiceError } from "./errors";

export const STAGING_PREFIX = "uploads/";

function finalKeyFor(upload: {
  kind: "audio" | "cover";
  channel_id: string;
  episode_id: string | null;
  storage_key: string;
}): string {
  const file = upload.storage_key.split("/").at(-1)!;
  return upload.kind === "audio"
    ? `audio/${upload.channel_id}/${upload.episode_id}/${file}`
    : `covers/${upload.channel_id}/${file}`;
}

export interface CreatedUpload {
  uploadId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Step 1 of an upload: validate the request, register a pending upload and
 * hand out a short-lived presigned PUT URL for a server-chosen storage key.
 */
export async function createUpload(ctx: PublisherContext, input: CreateUploadInput): Promise<CreatedUpload> {
  let channelId: string;
  let episodeId: string | null = null;
  let mimeType: string;
  let extension: string;

  if (input.kind === "audio") {
    const declared = resolveDeclaredFormat(input.fileName, input.contentType);
    if (!declared.ok) {
      throw new ServiceError(
        "invalid_input",
        "Formato de áudio não suportado. Usa MP3, M4A, AAC, WAV ou WebM/Opus.",
      );
    }
    if (input.size > ctx.limits.audioMaxBytes) {
      throw new ServiceError(
        "invalid_input",
        `O ficheiro é demasiado grande (máximo ${mb(ctx.limits.audioMaxBytes)}).`,
      );
    }
    const { data: episode, error } = await ctx.db
      .from("episodes")
      .select("id, channel_id")
      .eq("id", input.episodeId)
      .maybeSingle();
    if (error) throw internalError();
    if (!episode) throw notFoundError();
    channelId = episode.channel_id;
    episodeId = episode.id;
    mimeType = declared.format.mimeType;
    extension = declared.format.extension;
  } else {
    const image = imageFormatByMimeType(input.contentType);
    const ext = fileExtension(input.fileName);
    if (!image || (ext !== null && !image.extensions.includes(ext))) {
      throw new ServiceError("invalid_input", "Formato de imagem não suportado. Usa JPG, PNG ou WebP.");
    }
    if (input.size > ctx.limits.coverMaxBytes) {
      throw new ServiceError(
        "invalid_input",
        `A imagem é demasiado grande (máximo ${mb(ctx.limits.coverMaxBytes)}).`,
      );
    }
    await assertOwnsChannel(ctx, input.channelId);
    channelId = input.channelId;
    mimeType = image.mimeType;
    extension = image.extension;
  }

  if (!(await ctx.rateLimit(RATE_LIMITS.uploadUrl, ctx.userId))) throw rateLimitedError();

  // Server-chosen, unguessable staging key, never derived from the file name.
  // The client can only ever write under uploads/; verified objects are moved
  // to their final key (see completeUpload), so a presigned URL reused after
  // verification cannot alter published audio.
  const key = `${STAGING_PREFIX}${channelId}/${randomBytes(16).toString("hex")}.${extension}`;

  const expiresAt = new Date(Date.now() + ctx.limits.uploadUrlTtlSeconds * 1000);
  const { data: upload, error } = await ctx.admin
    .from("uploads")
    .insert({
      owner_id: ctx.userId,
      kind: input.kind,
      channel_id: channelId,
      episode_id: episodeId,
      storage_key: key,
      declared_mime_type: mimeType,
      declared_size_bytes: input.size,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !upload) throw internalError();

  const presigned = await ctx.storage.createUploadUrl({
    key,
    contentType: mimeType,
    contentLength: input.size,
    expiresInSeconds: ctx.limits.uploadUrlTtlSeconds,
  });

  return {
    uploadId: upload.id,
    url: presigned.url,
    method: presigned.method,
    headers: presigned.headers,
    expiresAt: presigned.expiresAt.toISOString(),
  };
}

export interface CompletedUpload {
  kind: "audio" | "cover";
  episodeId: string | null;
  channelId: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds: number | null;
}

/**
 * Step 2 of an upload: verify the object really exists in storage, has the
 * declared size, is within limits and its bytes match the declared format.
 * Only then attach it (transactionally) to the episode/channel.
 */
export async function completeUpload(
  ctx: PublisherContext,
  uploadId: string,
  opts: { durationSeconds: number | null },
): Promise<CompletedUpload> {
  const { data: upload, error } = await ctx.admin
    .from("uploads")
    .select(
      "id, kind, channel_id, episode_id, storage_key, declared_mime_type, declared_size_bytes, completed_at",
    )
    .eq("id", uploadId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (error) throw internalError();
  if (!upload || upload.completed_at) throw notFoundError();

  // Ownership of the target is re-checked through RLS as well as in SQL.
  await assertOwnsChannel(ctx, upload.channel_id);

  const reject = async (message: string): Promise<never> => {
    await ctx.storage.delete(upload.storage_key).catch(() => undefined);
    throw new ServiceError("upload_invalid", message);
  };

  const info = await ctx.storage.head(upload.storage_key);
  if (!info) {
    throw new ServiceError("upload_invalid", "O envio não foi concluído. Tenta novamente.");
  }
  const maxBytes = upload.kind === "audio" ? ctx.limits.audioMaxBytes : ctx.limits.coverMaxBytes;
  if (info.size !== Number(upload.declared_size_bytes) || info.size > maxBytes || info.size === 0) {
    return reject("O ficheiro recebido não corresponde ao ficheiro anunciado.");
  }

  const prefix = await ctx.storage.readPrefix(upload.storage_key, SNIFF_BYTES);
  if (!prefix) return reject("O envio não foi concluído. Tenta novamente.");

  let durationSeconds: number | null = null;
  if (upload.kind === "audio") {
    const declared = formatByMimeType(upload.declared_mime_type);
    if (!declared || !sniffMatchesDeclared(sniffAudioFormat(prefix), declared.id)) {
      return reject("O ficheiro não parece ser um áudio válido no formato indicado.");
    }
    if (opts.durationSeconds !== null) {
      if (opts.durationSeconds > ctx.limits.audioMaxDurationSeconds) {
        return reject(
          `O áudio é demasiado longo (máximo ${Math.round(ctx.limits.audioMaxDurationSeconds / 60)} minutos).`,
        );
      }
      durationSeconds = opts.durationSeconds;
    }
  } else if (sniffImageMimeType(prefix) !== upload.declared_mime_type) {
    return reject("O ficheiro não parece ser uma imagem válida no formato indicado.");
  }

  // Move out of the client-writable staging area, then re-verify the bytes
  // that will actually be served (closes the window between check and move).
  const finalKey = finalKeyFor(upload);
  try {
    await ctx.storage.move(upload.storage_key, finalKey);
  } catch {
    throw internalError();
  }
  const finalInfo = await ctx.storage.head(finalKey);
  const finalPrefix = await ctx.storage.readPrefix(finalKey, SNIFF_BYTES);
  const stillValid =
    finalInfo?.size === info.size &&
    finalPrefix !== null &&
    (upload.kind === "audio"
      ? sniffAudioFormat(finalPrefix) === sniffAudioFormat(prefix)
      : sniffImageMimeType(finalPrefix) === upload.declared_mime_type);
  if (!stillValid) {
    await ctx.storage.delete(finalKey).catch(() => undefined);
    throw new ServiceError("upload_invalid", "O ficheiro mudou durante a verificação. Tenta novamente.");
  }

  const { data: previousKey, error: rpcError } = await ctx.admin.rpc("complete_upload", {
    p_upload_id: upload.id,
    p_final_key: finalKey,
    p_owner_id: ctx.userId,
    p_mime_type: upload.declared_mime_type,
    p_size_bytes: info.size,
    // The generated types mark nullable function args as non-null.
    p_duration_seconds: durationSeconds as number,
  });
  if (rpcError) {
    await ctx.storage.delete(finalKey).catch(() => undefined);
    if (rpcError.code === "P0002") throw notFoundError();
    throw internalError();
  }
  if (previousKey && previousKey !== finalKey) {
    await ctx.storage.delete(previousKey).catch(() => undefined);
  }

  return {
    kind: upload.kind,
    episodeId: upload.episode_id,
    channelId: upload.channel_id,
    sizeBytes: info.size,
    mimeType: upload.declared_mime_type,
    durationSeconds,
  };
}
