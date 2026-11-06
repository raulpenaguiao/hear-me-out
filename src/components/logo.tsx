import Link from "next/link";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="var(--primary)" />
      <g fill="none" stroke="var(--primary-foreground)" strokeWidth="5" strokeLinecap="round">
        <path d="M20 26v12" />
        <path d="M28 20v24" />
        <path d="M36 16v32" />
        <path d="M44 24v16" />
      </g>
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark />
      <span className="text-lg">Ouve Isto</span>
    </Link>
  );
}
