import axios, {
  type AxiosAdapter,
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { HttpClient, type HttpError, isErr, isOk, type Result } from "../src";
import { serializeParams } from "../src/http-client";

const baseURL = "https://api.test/api";

type Reply =
  | { status: number; data?: unknown; statusText?: string }
  | { networkError: true }
  | { hang: true };

/** Same pattern as portals-frontend `src/app/mocks/transport.ts`: objects in, AxiosError on >= 400. */
const mockAdapter = (
  handle: (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>,
): AxiosAdapter & { calls: InternalAxiosRequestConfig[] } => {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter = async (config: InternalAxiosRequestConfig) => {
    calls.push(config);
    const reply = await handle(config);
    if ("networkError" in reply) {
      throw new AxiosError("Mock response lost", AxiosError.ERR_NETWORK, config);
    }
    if ("hang" in reply) return new Promise<never>(() => {});
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: reply.statusText ?? (reply.status < 400 ? "OK" : "Mock API error"),
      headers: new AxiosHeaders({ "Content-Type": "application/json" }),
      config,
    };
    if (reply.status >= 400) {
      throw new AxiosError(
        response.statusText,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        response,
      );
    }
    return response;
  };
  return Object.assign(adapter, { calls });
};

const setup = (handle: Parameters<typeof mockAdapter>[0], timeoutMs?: number) => {
  const client = new HttpClient({ baseURL, headers: { "X-App": "test" }, timeoutMs });
  const adapter = mockAdapter(handle);
  client.axios.defaults.adapter = adapter;
  return { client, adapter };
};

const errorOf = <T>(result: Result<T, HttpError>): HttpError => {
  if (isOk(result)) throw new Error(`expected Err, got ${JSON.stringify(result.value)}`);
  return result.error;
};

const userSchema = z.object({ id: z.number(), name: z.string() });

describe("HttpClient: success", () => {
  it("creates an axios instance with base URL and default headers", () => {
    const client = new HttpClient({ baseURL, headers: { "X-App": "a" }, withCredentials: true });
    expect(client.axios.defaults.baseURL).toBe(baseURL);
    expect(client.axios.defaults.headers["X-App"]).toBe("a");
    expect(client.axios.defaults.withCredentials).toBe(true);
    expect(client.axios.defaults.timeout).toBe(0);
  });

  it("returns ok with JSON parsed from a text body (real adapters)", async () => {
    const { client, adapter } = setup(() => ({ status: 200, data: '{"id":1,"name":"a"}' }));
    const result = await client.get("/users/1");
    expect(result).toEqual({ ok: true, value: { id: 1, name: "a" } });
    const config = adapter.calls[0];
    if (!config) throw new Error("no request");
    expect(config.method).toBe("get");
    expect(config.url).toBe("/users/1");
    expect(config.baseURL).toBe(baseURL);
    expect(config.responseType).toBe("text");
    expect(config.headers.get("X-App")).toBe("test");
  });

  it("returns ok with an object body as is (mock adapters)", async () => {
    const { client } = setup(() => ({ status: 200, data: { id: 1, name: "a" } }));
    expect(await client.get("/users/1")).toEqual({ ok: true, value: { id: 1, name: "a" } });
  });

  it("empty body gives undefined", async () => {
    const { client } = setup(() => ({ status: 204, data: "" }));
    expect(await client.delete("/users/1")).toEqual({ ok: true, value: undefined });
  });

  it("validates with a schema and infers its type", async () => {
    const { client } = setup(() => ({ status: 200, data: { id: 1, name: "a", extra: true } }));
    const result = await client.get("/users/1", { schema: userSchema });
    expectTypeOf(result).toEqualTypeOf<Result<{ id: number; name: string }, HttpError>>();
    expect(result).toEqual({ ok: true, value: { id: 1, name: "a" } });
  });

  it("sends method, body, request headers and params", async () => {
    const { client, adapter } = setup(() => ({ status: 201, data: { id: 2 } }));
    await client.post("/users", { name: "b" }, { headers: { "Idempotency-Key": "k1" } });
    await client.put("/users/2", { name: "c" });
    await client.patch("/users/2", { name: "d" });
    await client.delete("/users/2");
    await client.get("/users", { params: { page: 1, tags: ["a", "b"], empty: null, none: [] } });
    const [post, put, patch, del, get] = adapter.calls;
    expect(post?.method).toBe("post");
    expect(JSON.parse(post?.data as string)).toEqual({ name: "b" });
    expect(post?.headers.get("Idempotency-Key")).toBe("k1");
    expect(post?.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(put?.method).toBe("put");
    expect(patch?.method).toBe("patch");
    expect(del?.method).toBe("delete");
    expect(get?.params).toEqual({ page: "1", tags: "a,b" });
    expect(get && axios.getUri(get)).toBe(`${baseURL}/users?page=1&tags=a,b`);
  });

  it("responseType text returns the raw string", async () => {
    const { client } = setup(() => ({ status: 200, data: "plain text" }));
    expect(await client.get("/txt", { responseType: "text" })).toEqual({
      ok: true,
      value: "plain text",
    });
  });
});

describe("HttpClient: errors", () => {
  it("schema mismatch → validation with data and issues", async () => {
    const { client } = setup(() => ({ status: 200, data: { id: "1" } }));
    const e = errorOf(await client.get("/users/1", { schema: userSchema }));
    expect(e.kind).toBe("validation");
    expect(e.status).toBe(200);
    expect(e.data).toEqual({ id: "1" });
    expect(e.issues?.map((i) => i.path.join("."))).toEqual(["id", "name"]);
    expect(e.message).toMatch(/^GET \/users\/1: response does not match schema: id: /);
    expect(e.retryable).toBe(false);
  });

  it("non-JSON 2xx → parse with raw body", async () => {
    const { client } = setup(() => ({ status: 200, data: "<html>oops</html>" }));
    const e = errorOf(await client.get("/users/1"));
    expect(e.kind).toBe("parse");
    expect(e.status).toBe(200);
    expect(e.body).toBe("<html>oops</html>");
    expect(e.data).toBeUndefined();
    expect(e.message).toBe("GET /users/1: HTTP 200: response is not JSON");
  });

  it("HTTP error with a JSON text body → http with status, code, data, body", async () => {
    const { client } = setup(() => ({
      status: 404,
      statusText: "Not Found",
      data: '{"code":"NOT_FOUND","message":"User not found"}',
    }));
    const e = errorOf(await client.get("/users/9"));
    expect(e.kind).toBe("http");
    expect(e.method).toBe("GET");
    expect(e.endpoint).toBe("/users/9");
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.data).toEqual({ code: "NOT_FOUND", message: "User not found" });
    expect(e.body).toBe('{"code":"NOT_FOUND","message":"User not found"}');
    expect(e.message).toBe("GET /users/9: HTTP 404: User not found");
    expect(e.isNotFound).toBe(true);
    expect(e.cause).toBeUndefined();
  });

  it("HTTP error with an object body (mock adapters) → data kept, no raw body", async () => {
    const { client } = setup(() => ({ status: 422, data: { error: "INSUFFICIENT_FUNDS" } }));
    const e = errorOf(await client.post("/bet", { amount: 1 }));
    expect(e.kind).toBe("http");
    expect(e.data).toEqual({ error: "INSUFFICIENT_FUNDS" });
    expect(e.body).toBeUndefined();
    expect(e.code).toBeUndefined();
    expect(e.message).toBe("POST /bet: HTTP 422: Mock API error");
  });

  it("HTTP error with a text body → statusText in message, body kept", async () => {
    const { client } = setup(() => ({
      status: 502,
      statusText: "Bad Gateway",
      data: "<html>502</html>",
    }));
    const e = errorOf(await client.get("/x"));
    expect(e.kind).toBe("http");
    expect(e.status).toBe(502);
    expect(e.data).toBeUndefined();
    expect(e.body).toBe("<html>502</html>");
    expect(e.message).toBe("GET /x: HTTP 502: Bad Gateway");
    expect(e.retryable).toBe(true);
    expect(e.isServerError).toBe(true);
  });

  it("429 is retryable for POST, 500 is not", async () => {
    const limited = setup(() => ({ status: 429, data: "" }));
    expect(errorOf(await limited.client.post("/x")).retryable).toBe(true);
    const failed = setup(() => ({ status: 500, data: "" }));
    expect(errorOf(await failed.client.post("/x")).retryable).toBe(false);
  });

  it("network error → network with cause", async () => {
    const { client } = setup(() => ({ networkError: true }));
    const e = errorOf(await client.get("/x"));
    expect(e.kind).toBe("network");
    expect(e.status).toBeUndefined();
    expect(e.message).toBe("GET /x: network error: Mock response lost");
    expect(e.cause).toBeInstanceOf(AxiosError);
    expect(e.retryable).toBe(true);
  });

  it("an adapter throwing a plain value → network", async () => {
    const { client } = setup(() => {
      throw "boom";
    });
    const e = errorOf(await client.post("/x"));
    expect(e.kind).toBe("network");
    expect(e.message).toBe("POST /x: network error: boom");
    expect(e.retryable).toBe(false);
  });

  it("timeoutMs → timeout even if the adapter ignores the signal", async () => {
    const { client, adapter } = setup(() => ({ hang: true }));
    const started = Date.now();
    const e = errorOf(await client.get("/slow", { timeoutMs: 30 }));
    expect(e.kind).toBe("timeout");
    expect(e.message).toBe("GET /slow: timed out after 30 ms");
    expect(e.retryable).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(adapter.calls[0]?.signal?.aborted).toBe(true);
  });

  it("config timeoutMs applies to every request, per-request 0 disables it", async () => {
    vi.useFakeTimers();
    try {
      let release: (() => void) | undefined;
      const { client } = setup(
        () =>
          new Promise<Reply>((resolve) => {
            release = () => resolve({ status: 200, data: "1" });
          }),
        50,
      );
      const timedOut = client.get("/a");
      await vi.advanceTimersByTimeAsync(60);
      expect(errorOf(await timedOut).kind).toBe("timeout");
      const unlimited = client.get("/b", { timeoutMs: 0 });
      await vi.advanceTimersByTimeAsync(10_000);
      release?.();
      expect(await unlimited).toEqual({ ok: true, value: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("signal abort → aborted, already aborted signal → no request", async () => {
    const { client, adapter } = setup(() => ({ hang: true }));
    const controller = new AbortController();
    const pending = client.get("/slow", { signal: controller.signal });
    controller.abort();
    const e = errorOf(await pending);
    expect(e.kind).toBe("aborted");
    expect(e.message).toBe("GET /slow: request canceled");
    expect(e.retryable).toBe(false);
    expect(adapter.calls).toHaveLength(1);

    const again = errorOf(await client.get("/slow", { signal: controller.signal }));
    expect(again.kind).toBe("aborted");
    expect(adapter.calls).toHaveLength(1);
  });

  it("axios cancellation from an interceptor → aborted", async () => {
    const { client } = setup(() => ({ status: 200, data: "1" }));
    client.axios.interceptors.request.use((config) => {
      const controller = new AbortController();
      controller.abort();
      config.signal = controller.signal;
      return config;
    });
    expect(errorOf(await client.get("/x")).kind).toBe("aborted");
  });

  it("axios own timeout (ECONNABORTED / ETIMEDOUT) → timeout, other ECONNABORTED → aborted", async () => {
    const reject = (code: string, message: string) =>
      setup((config) => {
        throw new AxiosError(message, code, config);
      }).client;
    expect(errorOf(await reject("ECONNABORTED", "timeout of 10ms exceeded").get("/x")).kind).toBe(
      "timeout",
    );
    expect(errorOf(await reject("ETIMEDOUT", "timeout").get("/x")).kind).toBe("timeout");
    expect(errorOf(await reject("ECONNABORTED", "Request aborted").get("/x")).kind).toBe("aborted");
  });

  it("an interceptor that throws → Err, the client never throws", async () => {
    const { client } = setup(() => ({ status: 200, data: "1" }));
    client.axios.interceptors.request.use(() => {
      throw new Error("no token");
    });
    const e = errorOf(await client.get("/x"));
    expect(e.kind).toBe("network");
    expect(e.message).toBe("GET /x: network error: no token");
  });

  it("a throwing schema → Err, the client never throws", async () => {
    const { client } = setup(() => ({ status: 200, data: "1" }));
    const e = errorOf(
      await client.get("/x", {
        schema: {
          safeParse: () => {
            throw new Error("schema bug");
          },
        },
      }),
    );
    expect(e.kind).toBe("network");
    expect(e.message).toBe("GET /x: unexpected error: schema bug");
    expect(e.retryable).toBe(false);
  });
});

describe("HttpClient: axios integration (portals-frontend patterns)", () => {
  it("request interceptors still apply", async () => {
    const { client, adapter } = setup(() => ({ status: 200, data: "{}" }));
    client.axios.interceptors.request.use((config) => {
      config.headers.set("Authorization", "tma token");
      config.headers.set("x-request-id", "r1");
      return config;
    });
    await client.get("/me");
    expect(adapter.calls[0]?.headers.get("Authorization")).toBe("tma token");
    expect(adapter.calls[0]?.headers.get("x-request-id")).toBe("r1");
  });

  it("defaults.adapter override with a fallback to the real adapter works", async () => {
    const client = new HttpClient({ baseURL });
    const fallback = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      data: '{"live":true}',
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    }));
    const real = axios.getAdapter(client.axios.defaults.adapter);
    expect(typeof real).toBe("function");
    client.axios.defaults.adapter = async (config) =>
      config.url === "/mocked"
        ? { data: { mocked: true }, status: 200, statusText: "OK", headers: {}, config }
        : fallback(config);
    expect(await client.get("/mocked")).toEqual({ ok: true, value: { mocked: true } });
    expect(await client.get("/other")).toEqual({ ok: true, value: { live: true } });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("direct client.axios calls are untouched by the client (JSON parsed by axios)", async () => {
    const { client } = setup(() => ({ status: 200, data: '{"nfts":[]}' }));
    const response = await client.axios.get<{ nfts: unknown[] }>("/nfts/owned");
    expect(response.data).toEqual({ nfts: [] });
  });

  it("methods can be wrapped on the instance (frontend api logging)", async () => {
    const { client } = setup(() => ({ status: 200, data: '{"id":"x"}' }));
    const seen: unknown[] = [];
    const original = client.get.bind(client);
    client.get = (async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      if (isErr(result)) seen.push(result.error);
      return result;
    }) as HttpClient["get"];
    const result = await client.get("/users/1", { schema: userSchema });
    expect(isErr(result)).toBe(true);
    expect(seen).toHaveLength(1);
  });
});

describe("serializeParams", () => {
  it("joins arrays with commas and skips empty values", () => {
    expect(
      serializeParams({
        a: 1,
        b: "x",
        c: true,
        d: ["p", 2, null, undefined],
        e: [],
        f: undefined,
        g: null,
        h: "",
      }),
    ).toEqual({ a: "1", b: "x", c: "true", d: "p,2", h: "" });
  });
});
