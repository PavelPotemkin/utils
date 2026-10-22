import axios, { type AxiosInstance, type AxiosResponse, isAxiosError, isCancel } from "axios";
import { HttpError, type HttpErrorInit, type HttpMethod, messageOf } from "./errors";
import { err, ok, type Result } from "./result";
import { formatIssues, type ValidationSchema } from "./schema";

export interface HttpClientConfig {
  /** Passed to `axios.create`; a path prefix is kept. */
  baseURL: string;
  /** Default headers of every request. */
  headers?: Record<string, string>;
  /** Timeout of every request in ms, including reading the body; `0` — none (default: 0). */
  timeoutMs?: number;
  withCredentials?: boolean;
}

export interface RequestOptions<T> {
  /** Query parameters: arrays are joined with `,`; `undefined`, `null` and empty arrays are skipped. */
  params?: Record<string, unknown>;
  /** Response schema: zod 3/4 or anything with a compatible `safeParse`. */
  schema?: ValidationSchema<T>;
  headers?: Record<string, string>;
  /** Cancels the request → `kind: "aborted"`. */
  signal?: AbortSignal;
  /** Timeout of this request in ms, overrides `HttpClientConfig.timeoutMs`; `0` — none. */
  timeoutMs?: number;
  /**
   * `json` (default): the body is parsed as JSON, an empty body gives `undefined`, non-JSON → `kind: "parse"`.
   * `text`: the raw body string is the value.
   */
  responseType?: "json" | "text";
}

/** Query serialization: arrays joined with `,`; `undefined`, `null` and empty arrays are skipped. */
export function serializeParams(params: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const items = value.filter((item) => item !== undefined && item !== null);
      if (items.length === 0) continue;
      result[key] = items.map(String).join(",");
    } else {
      result[key] = String(value);
    }
  }
  return result;
}

type Fail = (
  kind: HttpErrorInit["kind"],
  detail: string,
  extra?: Omit<HttpErrorInit, "kind" | "method" | "endpoint" | "message">,
) => Result<never, HttpError>;

interface Body {
  /** Raw text when the adapter returned a string. */
  text?: string;
  /** Parsed JSON, or the value as the adapter returned it. */
  data?: unknown;
  json: boolean;
}

/** Splits what the adapter returned into raw text and parsed data. */
function readBody(raw: unknown): Body {
  if (typeof raw !== "string") return { data: raw, json: true };
  if (raw.trim() === "") return { text: raw, data: undefined, json: true };
  try {
    return { text: raw, data: JSON.parse(raw), json: true };
  } catch {
    return { text: raw, data: undefined, json: false };
  }
}

type StopReason = "timeout" | "aborted";

/** Rejects as soon as `signal` aborts, even if the adapter ignores the signal (custom and mock adapters). */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * HTTP client on top of axios that never throws: every method returns `Result<T, HttpError>`.
 * `axios` is public: interceptors, `defaults.adapter` (mocks) and direct calls keep working.
 */
export class HttpClient {
  readonly axios: AxiosInstance;
  private readonly timeoutMs: number;

  constructor(config: HttpClientConfig) {
    this.axios = axios.create({
      baseURL: config.baseURL,
      headers: config.headers,
      ...(config.withCredentials === undefined ? {} : { withCredentials: config.withCredentials }),
    });
    this.timeoutMs = config.timeoutMs ?? 0;
  }

  get<T = unknown>(path: string, options?: RequestOptions<T>): Promise<Result<T, HttpError>> {
    return this.request("GET", path, undefined, options);
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("POST", path, body, options);
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("PUT", path, body, options);
  }

  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("PATCH", path, body, options);
  }

  delete<T = unknown>(path: string, options?: RequestOptions<T>): Promise<Result<T, HttpError>> {
    return this.request("DELETE", path, undefined, options);
  }

  /** Performs a request. Never throws: any failure is `Err<HttpError>`. */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions<T> = {},
  ): Promise<Result<T, HttpError>> {
    const fail: Fail = (kind, detail, extra = {}) =>
      err(
        new HttpError({
          kind,
          method,
          endpoint: path,
          message: `${method} ${path}: ${detail}`,
          ...extra,
        }),
      );

    try {
      const userSignal = options.signal;
      if (userSignal?.aborted) return fail("aborted", "request canceled");

      const timeoutMs = options.timeoutMs ?? this.timeoutMs;
      const controller = new AbortController();
      // Own flag instead of `signal.reason`: the reason is missing in older WebViews (iOS < 15.4).
      let stopped: StopReason | undefined;
      const stop = (why: StopReason) => {
        if (stopped) return;
        stopped = why;
        controller.abort();
      };
      const timer =
        timeoutMs > 0 && Number.isFinite(timeoutMs)
          ? setTimeout(() => stop("timeout"), timeoutMs)
          : undefined;
      const onUserAbort = () => stop("aborted");
      userSignal?.addEventListener("abort", onUserAbort, { once: true });

      let response: AxiosResponse<unknown>;
      try {
        response = await raceAbort(
          this.axios.request<unknown>({
            method,
            url: path,
            data: body,
            params: options.params ? serializeParams(options.params) : undefined,
            headers: options.headers,
            signal: controller.signal,
            responseType: "text",
          }),
          controller.signal,
        );
      } catch (cause) {
        if (stopped === "aborted") return fail("aborted", "request canceled");
        if (stopped === "timeout") return fail("timeout", `timed out after ${timeoutMs} ms`);
        return this.failure(fail, cause);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        userSignal?.removeEventListener("abort", onUserAbort);
      }

      return this.success(fail, response, options);
    } catch (cause) {
      return fail("network", `unexpected error: ${errorText(cause)}`, { cause, retryable: false });
    }
  }

  private failure(fail: Fail, cause: unknown): Result<never, HttpError> {
    if (isCancel(cause)) return fail("aborted", "request canceled", { cause });
    if (isAxiosError(cause)) {
      const response = cause.response;
      if (response) {
        const status = response.status;
        const { text, data } = readBody(response.data);
        const detail = messageOf(data) ?? (response.statusText || "request failed");
        // No `cause`: the AxiosError carries request config with auth headers, everything useful is copied.
        return fail("http", `HTTP ${status}: ${detail}`, { status, data, body: text });
      }
      if (
        cause.code === "ETIMEDOUT" ||
        (cause.code === "ECONNABORTED" && /timeout/i.test(cause.message))
      ) {
        return fail("timeout", "timed out", { cause });
      }
      if (cause.code === "ECONNABORTED" || cause.code === "ERR_CANCELED") {
        return fail("aborted", "request canceled", { cause });
      }
    }
    return fail("network", `network error: ${errorText(cause)}`, { cause });
  }

  private success<T>(
    fail: Fail,
    response: AxiosResponse<unknown>,
    options: RequestOptions<T>,
  ): Result<T, HttpError> {
    const status = response.status;
    let value: unknown;
    let text: string | undefined;
    if (options.responseType === "text") {
      text = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      value = text;
    } else {
      const parsedBody = readBody(response.data);
      text = parsedBody.text;
      if (!parsedBody.json) {
        return fail("parse", `HTTP ${status}: response is not JSON`, { status, body: text });
      }
      value = parsedBody.data;
    }

    if (!options.schema) return ok(value as T);

    const parsed = options.schema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      return fail("validation", `response does not match schema: ${formatIssues(issues)}`, {
        status,
        data: value,
        body: text,
        issues,
      });
    }
    return ok(parsed.data);
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
