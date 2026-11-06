import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@/lib/validation";
import { ServiceError } from "./services/errors";

/** Validates a UUID route param, rendering the 404 page if malformed. */
export function uuidParamOr404(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
}

/** Awaits a service call, rendering the 404 page for not_found errors. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }
}
