/**
 * Domain error carrying an HTTP status and a safe, user-facing (pt-PT)
 * message. Internal details are never included in the message.
 */
export class ServiceError extends Error {
  constructor(
    readonly code:
      "not_found" | "invalid_input" | "rate_limited" | "conflict" | "upload_invalid" | "internal",
    message: string,
    readonly status: number = codeToStatus(code),
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function codeToStatus(code: ServiceError["code"]): number {
  switch (code) {
    case "not_found":
      return 404;
    case "invalid_input":
    case "upload_invalid":
      return 400;
    case "rate_limited":
      return 429;
    case "conflict":
      return 409;
    default:
      return 500;
  }
}

export const notFoundError = () => new ServiceError("not_found", "Não encontrado.");
export const rateLimitedError = () =>
  new ServiceError("rate_limited", "Demasiados pedidos. Tenta novamente dentro de alguns minutos.");
export const internalError = () =>
  new ServiceError("internal", "Ocorreu um erro inesperado. Tenta novamente.");
