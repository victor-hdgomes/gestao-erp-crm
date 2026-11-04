export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "INTEGRATION_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTEGRATION_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError("VALIDATION_ERROR", message, details);
}

export function notFound(entity: string): AppError {
  return new AppError("NOT_FOUND", `${entity} não encontrado.`);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError("CONFLICT", message, details);
}

export function unprocessable(message: string, details?: unknown): AppError {
  return new AppError("UNPROCESSABLE", message, details);
}

export function forbidden(message = "Você não tem permissão para esta operação."): AppError {
  return new AppError("FORBIDDEN", message);
}

export function unauthorized(message = "Autenticação necessária."): AppError {
  return new AppError("UNAUTHORIZED", message);
}
