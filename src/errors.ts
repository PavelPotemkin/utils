import type { ValidationIssue } from "./schema";

/**
 * What went wrong:
 * - `http` — the server answered with a non-2xx status (`status`, `code`, `data`, `body`);
 * - `network` — no response: connection failed, request was dropped, or something before the adapter threw;
 * - `timeout` — `timeoutMs` (or axios `timeout`) elapsed;
 * - `aborted` — the caller's `signal` fired or the request was canceled through axios;
 * - `parse` — 2xx with a body that is not JSON while JSON was expected (`body`);
 * - `validation` — 2xx JSON that did not pass the schema (`data`, `issues`).
 */
export type HttpErrorKind = "http" | "network" | "timeout" | "aborted" | "parse" | "validation";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpErrorInit {
  kind: HttpErrorKind;
  method: HttpMethod;
  /** Request path as passed to the client (without base URL and query). */
  endpoint: string;
  /** Defaults to a message built from `kind`, `status` and `data.message`. */
  message?: string;
  status?: number;
  /** Defaults to `data.code` when it is a non-empty string. */
  code?: string;
  data?: unknown;
  body?: string;
  issues?: ReadonlyArray<ValidationIssue>;
  /** Defaults to the policy described on {@link HttpError.retryable}. */
  retryable?: boolean;
  cause?: unknown;
}

const IDEMPOTENT: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["GET", "PUT", "DELETE"]);
const TRANSIENT_STATUS: ReadonlySet<number> = new Set([408, 500, 502, 503, 504]);

/** `message` field of a JSON error body, when it is a non-empty string. */
export function messageOf(data: unknown): string | undefined {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return undefined;
}

function codeOf(data: unknown): string | undefined {
  if (data && typeof data === "object" && "code" in data) {
    const code = (data as { code: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return undefined;
}

function defaultRetryable(kind: HttpErrorKind, method: HttpMethod, status?: number): boolean {
  if (kind === "http") {
    if (status === 429) return true;
    return status !== undefined && TRANSIENT_STATUS.has(status) && IDEMPOTENT.has(method);
  }
  return (kind === "network" || kind === "timeout") && IDEMPOTENT.has(method);
}

function defaultMessage(init: HttpErrorInit): string {
  const prefix = `${init.method} ${init.endpoint}`;
  switch (init.kind) {
    case "http":
      return `${prefix}: HTTP ${init.status ?? "?"}: ${messageOf(init.data) ?? "request failed"}`;
    case "network":
      return `${prefix}: network error`;
    case "timeout":
      return `${prefix}: timed out`;
    case "aborted":
      return `${prefix}: request canceled`;
    case "parse":
      return `${prefix}: response is not JSON`;
    case "validation":
      return `${prefix}: response does not match schema`;
  }
}

/** The only error class of the library; `kind` tells what happened. */
export class HttpError extends Error {
  override readonly name = "HttpError";
  readonly kind: HttpErrorKind;
  readonly method: HttpMethod;
  /** Request path as passed to the client (without base URL and query). */
  readonly endpoint: string;
  /** HTTP status for `http`, `parse` and `validation`. */
  readonly status?: number;
  /** `code` from a JSON error body. */
  readonly code?: string;
  /** Parsed response body. For `validation` — the data that failed the schema. */
  readonly data?: unknown;
  /** Raw response text, when the adapter returned text (real network). Mock adapters returning objects leave it empty. */
  readonly body?: string;
  /** Schema issues for `validation`. */
  readonly issues?: ReadonlyArray<ValidationIssue>;
  /**
   * Repeating the same request is safe and may succeed:
   * - `http` 429 — any method (the server did not process the request);
   * - `http` 408, 500, 502, 503, 504, `network`, `timeout` — only `GET`, `PUT`, `DELETE`;
   * - everything else — `false`. `POST`/`PATCH` outcomes after a lost response must be reconciled, not repeated blindly.
   */
  readonly retryable: boolean;

  constructor(init: HttpErrorInit) {
    super(
      init.message ?? defaultMessage(init),
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.kind = init.kind;
    this.method = init.method;
    this.endpoint = init.endpoint;
    this.status = init.status;
    this.code = init.code ?? codeOf(init.data);
    this.data = init.data;
    this.body = init.body;
    this.issues = init.issues;
    this.retryable = init.retryable ?? defaultRetryable(init.kind, init.method, init.status);
  }

  get isBadRequest(): boolean {
    return this.kind === "http" && this.status === 400;
  }

  get isUnauthorized(): boolean {
    return this.kind === "http" && this.status === 401;
  }

  get isNotFound(): boolean {
    return this.kind === "http" && this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.kind === "http" && this.status === 429;
  }

  get isServerError(): boolean {
    return this.kind === "http" && this.status !== undefined && this.status >= 500;
  }
}

/** `HttpError` narrowed by kind: `http` always has `status`, `validation` always has `issues`. */
export type HttpErrorOf<K extends HttpErrorKind> = HttpError & {
  readonly kind: K;
} & (K extends "http" ? { readonly status: number } : unknown) &
  (K extends "validation" ? { readonly issues: ReadonlyArray<ValidationIssue> } : unknown);

/**
 * Type guard for `HttpError`, optionally of the given kinds:
 * `isHttpError(e)`, `isHttpError(e, "http")`, `isHttpError(e, "network", "timeout")`.
 */
export function isHttpError(error: unknown): error is HttpError;
export function isHttpError<K extends HttpErrorKind>(
  error: unknown,
  ...kinds: [K, ...K[]]
): error is HttpErrorOf<K>;
export function isHttpError(error: unknown, ...kinds: HttpErrorKind[]): boolean {
  if (!(error instanceof HttpError)) return false;
  return kinds.length === 0 || kinds.includes(error.kind);
}
