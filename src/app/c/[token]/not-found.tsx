import { LinkIcon } from "lucide-react";
import { LogoMark } from "@/components/logo";

export default function ChannelNotFound() {
  return (
    <main
      id="conteudo"
      className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <LinkIcon className="size-6" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Este link não está disponível</h1>
      <p className="text-muted-foreground">
        Pode ter sido escrito de forma incompleta, ou o autor pode ter gerado um link novo. Pede o link atual
        a quem to enviou.
      </p>
      <LogoMark className="mt-4 size-8" />
    </main>
  );
}
