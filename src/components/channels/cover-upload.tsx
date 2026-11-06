"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IMAGE_ACCEPT_ATTRIBUTE, imageFormatByMimeType } from "@/lib/audio-formats";
import { formatBytes } from "@/lib/format";
import { uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../ui/button";

export function CoverUpload({ channelId, maxBytes }: { channelId: string; maxBytes: number }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!imageFormatByMimeType(file.type)) {
      setError("Usa uma imagem JPG, PNG ou WebP (idealmente quadrada, 1400×1400 ou maior).");
      return;
    }
    if (file.size > maxBytes) {
      setError(`A imagem é demasiado grande (máximo ${formatBytes(maxBytes)}).`);
      return;
    }
    setBusy(true);
    try {
      await uploadFile({
        target: { kind: "cover", channelId },
        body: file,
        fileName: file.name,
        contentType: file.type,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocorreu um erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "cursor-pointer",
          busy && "opacity-60",
        )}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
        {busy ? "A enviar…" : "Mudar capa"}
      </label>
      <input
        id={id}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="sr-only"
        disabled={busy}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
