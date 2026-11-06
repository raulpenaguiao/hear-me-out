"use client";

import { Loader2, Send, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiPost, uploadFile } from "@/lib/upload-client";
import { AudioPicker } from "../audio/audio-picker";
import type { AudioSelection } from "../audio/types";
import { Button } from "../ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "../ui/form";

type Phase = "idle" | "creating" | "uploading" | "publishing";

export function NewEpisodeForm({
  channels,
  defaultChannelId,
  maxBytes,
  maxDurationSeconds,
}: {
  channels: Array<{ id: string; title: string }>;
  defaultChannelId: string;
  maxBytes: number;
  maxDurationSeconds: number;
}) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(defaultChannelId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audio, setAudio] = useState<AudioSelection | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Reuse the draft if a later step fails, so retrying never duplicates it.
  const draftRef = useRef<{ id: string; channelId: string; uploaded: boolean } | null>(null);

  const busy = phase !== "idle";

  async function submit(publish: boolean) {
    setError(null);
    if (!title.trim()) {
      setError("Dá um título ao episódio.");
      return;
    }
    if (!audio) {
      setError("Grava ou escolhe um ficheiro de áudio primeiro.");
      return;
    }
    try {
      if (!draftRef.current || draftRef.current.channelId !== channelId) {
        setPhase("creating");
        const created = await apiPost<{ id: string }>("/api/publisher/episodes", {
          channelId,
          title,
          description,
        });
        draftRef.current = { id: created.id, channelId, uploaded: false };
      }
      const draft = draftRef.current;

      if (!draft.uploaded) {
        setPhase("uploading");
        setProgress(0);
        await uploadFile({
          target: { kind: "audio", episodeId: draft.id },
          body: audio.blob,
          fileName: audio.fileName,
          contentType: audio.mimeType,
          durationSeconds: audio.durationSeconds,
          onProgress: setProgress,
        });
        draft.uploaded = true;
      }

      if (publish) {
        setPhase("publishing");
        await apiPost(`/api/publisher/episodes/${draft.id}/status`, { status: "published" });
      }
      router.push(`/painel/episodios/${draft.id}?${publish ? "publicado=1" : "guardado=1"}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocorreu um erro inesperado.");
      setPhase("idle");
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(true);
      }}
    >
      {channels.length > 1 ? (
        <Field label="Canal" htmlFor="channel">
          <Select
            id="channel"
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
            }}
            disabled={busy}
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          Canal: <span className="font-medium text-foreground">{channels[0]?.title}</span>
        </p>
      )}

      <AudioPicker
        maxBytes={maxBytes}
        maxDurationSeconds={maxDurationSeconds}
        value={audio}
        onChange={(value) => {
          setAudio(value);
          if (draftRef.current) draftRef.current.uploaded = false;
        }}
        disabled={busy}
      />

      <Field label="Título" htmlFor="title">
        <Input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Ex.: A vez em que perdi o comboio"
          required
          disabled={busy}
        />
      </Field>

      <Field label="Descrição (opcional)" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={10000}
          rows={3}
          placeholder="Umas linhas sobre esta história…"
          disabled={busy}
        />
      </Field>

      {phase === "uploading" ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span>A enviar áudio…</span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Progresso do envio"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : null}

      <FormMessage error={error} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" onClick={() => void submit(false)} disabled={busy}>
          <Save aria-hidden />
          Guardar rascunho
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {phase === "creating" && "A criar…"}
          {phase === "uploading" && "A enviar…"}
          {phase === "publishing" && "A publicar…"}
          {phase === "idle" && "Publicar"}
        </Button>
      </div>
    </form>
  );
}
