import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { DesktopNav, MobileNav } from "@/components/nav";
import { requirePublisher } from "@/server/auth";

// Every dashboard page is per-user; never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Ouve Isto" } };

export default async function DashboardLayout({ children }: LayoutProps<"/painel">) {
  // Defence in depth: the proxy also redirects anonymous visitors.
  await requirePublisher();
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo href="/painel" />
          <DesktopNav />
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:pb-12">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
