import type { ZodError } from "zod";

export class HttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export class ApiError extends HttpError {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly endpoint: string;

  constructor(params: {
    status: number;
    statusText: string;
    body: unknown;
    endpoint: string;
  }) {
    const apiMessage =
      params.body &&
      typeof params.body === "object" &&
      "message" in params.body &&
      typeof (params.body as Record<string, unknown>).message === "string"
        ? (params.body as Record<string, string>).message
        : params.statusText;

    super(`[${params.status}] ${params.endpoint}: ${apiMessage}`);
    this.name = "ApiError";
    this.status = params.status;
    this.statusText = params.statusText;
    this.body = params.body;
    this.endpoint = params.endpoint;
  }

  get isBadRequest() {
    return this.status === 400;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isServerError() {
    return this.status >= 500;
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

export class ResponseValidationError extends HttpError {
  readonly zodError: ZodError;
  readonly endpoint: string;
  readonly rawData: unknown;

  constructor(params: {
    zodError: ZodError;
    endpoint: string;
    rawData: unknown;
  }) {
    super(
      `Response validation failed for ${params.endpoint}: ${params.zodError.message}`,
    );
    this.name = "ResponseValidationError";
    this.zodError = params.zodError;
    this.endpoint = params.endpoint;
    this.rawData = params.rawData;
  }
}

export class NetworkError extends HttpError {
  readonly cause: Error;
  readonly endpoint: string;

  constructor(params: { cause: Error; endpoint: string }) {
    super(`Network error for ${params.endpoint}: ${params.cause.message}`);
    this.name = "NetworkError";
    this.cause = params.cause;
    this.endpoint = params.endpoint;
  }
}

export class ValidationError extends Error {
  constructor(message = "Invalid data") {
    super(message);
    this.name = "ValidationError";
  }
}
