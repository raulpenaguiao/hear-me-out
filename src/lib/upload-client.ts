"use client";

/**
 * Browser-side upload flow:
 *   1. ask the server for a presigned URL (server validates type/size/ownership)
 *   2. PUT the file directly to storage (R2) with progress reporting
 *   3. ask the server to verify and attach the stored object
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("Sem ligação. Verifica a tua internet e tenta novamente.", 0);
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string } }
    | null;
  if (!res.ok || !data || (data as { error?: unknown }).error) {
    const err = (data as { error?: { code: string; message: string } } | null)?.error;
    throw new ApiError(err?.message ?? "Ocorreu um erro inesperado.", res.status, err?.code);
  }
  return data as T;
}

interface CreatedUpload {
  uploadId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

function putWithProgress(
  upload: CreatedUpload,
  body: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError("O envio do ficheiro falhou. Tenta novamente.", xhr.status));
    };
    xhr.onerror = () =>
      reject(new ApiError("O envio do ficheiro falhou. Verifica a tua ligação.", 0));
    xhr.onabort = () => reject(new ApiError("Envio cancelado.", 0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export type UploadTarget = { kind: "audio"; episodeId: string } | { kind: "cover"; channelId: string };

export async function uploadFile(opts: {
  target: UploadTarget;
  body: Blob;
  fileName: string;
  contentType: string;
  durationSeconds?: number | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const created = await apiPost<CreatedUpload>("/api/publisher/uploads", {
    ...opts.target,
    fileName: opts.fileName,
    contentType: opts.contentType,
    size: opts.body.size,
  });
  await putWithProgress(created, opts.body, opts.onProgress, opts.signal);
  await apiPost(`/api/publisher/uploads/${created.uploadId}/complete`, {
    durationSeconds:
      opts.durationSeconds !== undefined && opts.durationSeconds !== null && Number.isFinite(opts.durationSeconds)
        ? opts.durationSeconds
        : null,
  });
}
