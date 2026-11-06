"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadFile } from "@/lib/upload-client";
import { AudioPicker } from "../audio/audio-picker";
import type { AudioSelection } from "../audio/types";
import { Button } from "../ui/button";
import { FormMessage } from "../ui/form";

export function ReplaceAudio({
  episodeId,
  hasAudio,
  maxBytes,
  maxDurationSeconds,
}: {
  episodeId: string;
  hasAudio: boolean;
  maxBytes: number;
  maxDurationSeconds: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasAudio);
  const [audio, setAudio] = useState<AudioSelection | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload aria-hidden />
        Substituir áudio
      </Button>
    );
  }

  async function save() {
    if (!audio) return;
    setError(null);
    setProgress(0);
    try {
      await uploadFile({
        target: { kind: "audio", episodeId },
        body: audio.blob,
        fileName: audio.fileName,
        contentType: audio.mimeType,
        durationSeconds: audio.durationSeconds,
        onProgress: setProgress,
      });
      setAudio(null);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocorreu um erro inesperado.");
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <div className="flex flex-col gap-4">
      <AudioPicker
        maxBytes={maxBytes}
        maxDurationSeconds={maxDurationSeconds}
        value={audio}
        onChange={setAudio}
        disabled={busy}
      />
      <FormMessage error={error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={!audio || busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {busy ? `A enviar… ${Math.round((progress ?? 0) * 100)}%` : "Guardar áudio"}
        </Button>
        {hasAudio ? (
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
