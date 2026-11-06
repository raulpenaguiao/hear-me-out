import { ChevronRight, FileAudio } from "lucide-react";
import Link from "next/link";
import { formatDate, formatDuration } from "@/lib/format";
import type { EpisodeSummary } from "@/server/services/episodes";
import { Badge } from "../ui/card";

export function EpisodeRow({ episode, showChannel = false }: { episode: EpisodeSummary; showChannel?: boolean }) {
  return (
    <li>
      <Link
        href={`/painel/episodios/${episode.id}`}
        className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <FileAudio className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{episode.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {showChannel ? `${episode.channelTitle} · ` : ""}
            {episode.status === "published"
              ? `Publicado a ${formatDate(episode.publishedAt)}`
              : `Criado a ${formatDate(episode.createdAt)}`}
            {episode.durationSeconds !== null ? ` · ${formatDuration(episode.durationSeconds)}` : ""}
          </span>
        </span>
        {episode.status === "published" ? (
          <Badge tone="success">Publicado</Badge>
        ) : (
          <Badge tone="warning">{episode.hasAudio ? "Rascunho" : "Sem áudio"}</Badge>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
