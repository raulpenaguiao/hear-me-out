"use client";

import { Home, Mic, Radio, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/painel", label: "Início", icon: Home, exact: true },
  { href: "/painel/canais", label: "Os meus canais", short: "Canais", icon: Radio },
  { href: "/painel/gravar", label: "Novo episódio", short: "Gravar", icon: Mic, primary: true },
  { href: "/painel/conta", label: "Conta", icon: UserRound },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
              "primary" in item && item.primary
                ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                : active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
          const label = "short" in item ? item.short : item.label;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    "primary" in item && item.primary && "bg-primary text-primary-foreground",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
