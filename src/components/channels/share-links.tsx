import { ExternalLink, Globe, Rss } from "lucide-react";
import { CopyButton } from "../copy-button";

function LinkRow({
  icon,
  label,
  url,
  hint,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  url: string;
  hint: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-primary">
        {icon}
        {label}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code
          className="block min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2.5 font-mono text-xs"
          data-testid={testId}
          title={url}
        >
          {url}
        </code>
        <div className="flex gap-2">
          <CopyButton value={url} />
          {testId === "web-url" ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"
            >
              <ExternalLink className="size-4" aria-hidden />
              Abrir
            </a>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ShareLinks({ webUrl, rssUrl }: { webUrl: string; rssUrl: string }) {
  return (
    <div className="flex flex-col gap-5">
      <LinkRow
        icon={<Globe aria-hidden />}
        label="Link da página"
        url={webUrl}
        testId="web-url"
        hint="Quem tiver este link pode ouvir no navegador, sem conta. A página também mostra o link RSS."
      />
      <LinkRow
        icon={<Rss aria-hidden />}
        label="Link RSS (para apps de podcasts)"
        url={rssUrl}
        testId="rss-url"
        hint="Cola este link numa app de podcasts que aceite feeds RSS personalizados."
      />
    </div>
  );
}
