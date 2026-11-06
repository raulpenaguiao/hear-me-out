"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonVariantProps } from "./ui/button";

export function CopyButton({
  value,
  label = "Copiar",
  copiedLabel = "Copiado!",
  variant = "outline",
  size = "sm",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
} & ButtonVariantProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers without async clipboard permissions.
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant={variant} size={size} onClick={copy} aria-live="polite">
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
