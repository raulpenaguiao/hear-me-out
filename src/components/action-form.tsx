"use client";

import { useActionState, type ReactNode } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import { FormMessage } from "./ui/form";

/**
 * Progressive-enhancement form bound to a server action returning FormState.
 * Works without JavaScript; with JS it shows inline errors/success messages.
 */
export function ActionForm({
  action,
  children,
  className,
  messagePosition = "bottom",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  messagePosition?: "top" | "bottom";
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const message = <FormMessage error={state.error} success={state.success} />;
  return (
    <form action={formAction} className={cn("flex flex-col gap-4", className)}>
      {messagePosition === "top" ? message : null}
      {children}
      {messagePosition === "bottom" ? message : null}
    </form>
  );
}
