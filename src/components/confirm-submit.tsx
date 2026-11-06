"use client";

import { useState, type ReactNode } from "react";
import { SubmitButton } from "./submit-button";
import { Button, type ButtonVariantProps } from "./ui/button";

/**
 * Two-step destructive submit button: the first click reveals a confirmation
 * message and the real submit button. Must be rendered inside a <form>.
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  message,
  variant = "danger-outline",
  confirmVariant = "danger",
  icon,
}: {
  label: string;
  confirmLabel: string;
  message: ReactNode;
  variant?: ButtonVariantProps["variant"];
  confirmVariant?: ButtonVariantProps["variant"];
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm">
      <div className="text-danger">{message}</div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant={confirmVariant} size="sm" pendingLabel="Um momento…">
          {confirmLabel}
        </SubmitButton>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
