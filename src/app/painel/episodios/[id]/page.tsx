import { EyeOff, Send, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ReplaceAudio } from "@/components/episodes/replace-audio";
import { Notice, PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { uploadLimits } from "@/lib/env";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { requirePublisher } from "@/server/auth";
import { orNotFound, uuidParamOr404 } from "@/server/page-helpers";
import { getEpisode } from "@/server/services/episodes";
import { deleteEpisodeAction, setEpisodeStatusAction, updateEpisodeAction } from "../../actions";

export const metadata: Metadata = { title: "Episódio" };

export default async function EpisodePage({ params, searchParams }: PageProps<"/painel/episodios/[id]">) {
  const { ctx } = await requirePublisher();
  const id = uuidParamOr404((await params).id);
  const [episode, query] = await Promise.all([orNotFound(getEpisode(ctx, id)), searchParams]);
  const limits = uploadLimits();
  const published = episode.status === "published";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={episode.title}
        back={{ href: `/painel/canais/${episode.channelId}`, label: episode.channelTitle }}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {published ? <Badge tone="success">Publicado</Badge> : <Badge tone="warning">Rascunho</Badge>}
            {published ? <span>a {formatDate(episode.publishedAt)}</span> : null}
          </span>
        }
      />

      {query.publicado ? (
        <Notice>Publicado! Já aparece na página do canal e no feed RSS.</Notice>
      ) : null}
      {query.guardado ? <Notice>Rascunho guardado. Publica quando quiseres.</Notice> : null}

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <CardTitle>Áudio</CardTitle>
          {episode.hasAudio ? (
            <>
              <audio
                controls
                preload="metadata"
                src={`/api/publisher/episodes/${episode.id}/audio?v=${encodeURIComponent(episode.updatedAt)}`}
                data-testid="owner-audio"
              />
              <p className="text-xs text-muted-foreground">
                {formatDuration(episode.durationSeconds)} · {formatBytes(episode.audioSizeBytes)} ·{" "}
                {episode.audioMimeType}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Este episódio ainda não tem áudio.</p>
          )}
          <ReplaceAudio
            episodeId={episode.id}
            hasAudio={episode.hasAudio}
            maxBytes={limits.audioMaxBytes}
            maxDurationSeconds={limits.audioMaxDurationSeconds}
          />
        </Card>

        <Card>
          <CardTitle className="mb-1">{published ? "Publicado" : "Publicar"}</CardTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            {published
              ? "Quem tem o link do canal pode ouvir este episódio, e ele aparece no feed RSS."
              : "Enquanto for rascunho, só tu o vês."}
          </p>
          <ActionForm action={setEpisodeStatusAction}>
            <input type="hidden" name="episodeId" value={episode.id} />
            <input type="hidden" name="status" value={published ? "draft" : "published"} />
            {published ? (
              <SubmitButton variant="outline" pendingLabel="Um momento…" className="w-fit">
                <EyeOff aria-hidden />
                Despublicar
              </SubmitButton>
            ) : (
              <SubmitButton disabled={!episode.hasAudio} pendingLabel="A publicar…" className="w-fit">
                <Send aria-hidden />
                Publicar agora
              </SubmitButton>
            )}
          </ActionForm>
        </Card>

        <Card>
          <CardTitle className="mb-4">Detalhes</CardTitle>
          <ActionForm action={updateEpisodeAction}>
            <input type="hidden" name="episodeId" value={episode.id} />
            <Field label="Título" htmlFor="title">
              <Input id="title" name="title" defaultValue={episode.title} maxLength={200} required />
            </Field>
            <Field label="Descrição" htmlFor="description">
              <Textarea
                id="description"
                name="description"
                defaultValue={episode.description}
                maxLength={10000}
                rows={5}
              />
            </Field>
            <SubmitButton pendingLabel="A guardar…" className="w-fit">
              Guardar
            </SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle className="mb-1">Apagar episódio</CardTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Remove o episódio e o ficheiro de áudio. Sai do feed de imediato.
          </p>
          <ActionForm action={deleteEpisodeAction}>
            <input type="hidden" name="episodeId" value={episode.id} />
            <ConfirmSubmit
              label="Apagar episódio"
              icon={<Trash2 aria-hidden />}
              confirmLabel="Apagar definitivamente"
              message="Tens a certeza? Não há volta atrás."
            />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
