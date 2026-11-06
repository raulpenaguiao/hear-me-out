"use client";

import { FileAudio, Mic, Upload } from "lucide-react";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import {
  ACCEPT_ATTRIBUTE,
  baseMimeType,
  fileExtension,
  formatByExtension,
  formatByMimeType,
} from "@/lib/audio-formats";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isRecordingSupported, Recorder } from "./recorder";
import type { AudioSelection } from "./types";

const noopSubscribe = () => () => undefined;

/** Reads duration from file metadata; resolves null if unknown. */
function probeDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timeout = window.setTimeout(() => done(null), 8000);
    audio.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : null);
    };
    audio.onerror = () => {
      window.clearTimeout(timeout);
      done(null);
    };
    audio.src = url;
  });
}

export function AudioPicker({
  maxBytes,
  maxDurationSeconds,
  value,
  onChange,
  disabled,
}: {
  maxBytes: number;
  maxDurationSeconds: number;
  value: AudioSelection | null;
  onChange: (value: AudioSelection | null) => void;
  disabled?: boolean;
}) {
  // null while server-rendering; true/false once known in the browser.
  const supported = useSyncExternalStore<boolean | null>(noopSubscribe, isRecordingSupported, () => null);
  const [chosenMode, setMode] = useState<"record" | "upload">("record");
  const mode = supported === false ? "upload" : chosenMode;
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const previewUrl = useMemo(() => (value ? URL.createObjectURL(value.blob) : null), [value]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const ext = fileExtension(file.name);
    const format = (file.type ? formatByMimeType(file.type) : null) ?? (ext ? formatByExtension(ext) : null);
    if (!format) {
      setError("Formato não suportado. Usa MP3, M4A, AAC, WAV ou WebM/Opus.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`O ficheiro é demasiado grande (máximo ${formatBytes(maxBytes)}).`);
      return;
    }
    const duration = await probeDuration(file);
    if (duration !== null && duration > maxDurationSeconds) {
      setError(`O áudio é demasiado longo (máximo ${Math.round(maxDurationSeconds / 60)} minutos).`);
      return;
    }
    onChange({
      blob: file,
      mimeType: file.type && formatByMimeType(file.type) ? baseMimeType(file.type) : format.mimeType,
      fileName: file.name,
      durationSeconds: duration,
      source: "file",
    });
  }

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors",
      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-4">
      {supported !== false && (
        <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label="Origem do áudio">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "record"}
            className={tabClass(mode === "record")}
            onClick={() => {
              setMode("record");
              onChange(null);
            }}
            disabled={disabled}
          >
            <Mic className="size-4" aria-hidden /> Gravar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={tabClass(mode === "upload")}
            onClick={() => {
              setMode("upload");
              onChange(null);
            }}
            disabled={disabled}
          >
            <Upload className="size-4" aria-hidden /> Carregar ficheiro
          </button>
        </div>
      )}

      {supported === false && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
          Este navegador não permite gravar aqui. Podes carregar um ficheiro de áudio gravado noutra app.
        </p>
      )}

      {mode === "record" && supported ? (
        <Recorder
          maxDurationSeconds={maxDurationSeconds}
          onRecorded={(selection) => onChange(selection)}
          onReset={() => onChange(null)}
        />
      ) : null}

      {mode === "upload" ? (
        <label
          htmlFor={inputId}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/50 px-4 py-8 text-center transition-colors hover:border-primary/60",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <FileAudio className="size-8 text-primary" aria-hidden />
          <span className="font-medium">Escolhe um ficheiro de áudio</span>
          <span className="text-xs text-muted-foreground">
            MP3, M4A, AAC, WAV ou WebM/Opus · até {formatBytes(maxBytes)}
          </span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            disabled={disabled}
            data-testid="audio-file-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {value && previewUrl ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-accent/60 p-4" data-testid="audio-preview">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{value.fileName}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatDuration(value.durationSeconds)} · {formatBytes(value.blob.size)}
            </span>
          </div>
          <audio controls src={previewUrl} preload="metadata" />
        </div>
      ) : null}
    </div>
  );
}
