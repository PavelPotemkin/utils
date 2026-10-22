import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpClient, type HttpError, isOk, type Result } from "../src";

/** Real HTTP server + axios node adapter: the transport path without mocks. */
let server: Server;
let baseURL: string;
let closedSockets = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: string, type = "application/json") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    };
    switch (url.pathname) {
      case "/api/json":
        return send(200, JSON.stringify({ q: url.search, auth: req.headers.authorization }));
      case "/api/echo": {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => send(200, body));
        return;
      }
      case "/api/html":
        return send(200, "<html></html>", "text/html");
      case "/api/error":
        return send(409, JSON.stringify({ code: "CONFLICT", message: "Already exists" }));
      case "/api/gateway":
        return send(502, "<html>Bad Gateway</html>", "text/html");
      case "/api/empty":
        res.writeHead(204);
        return res.end();
      case "/api/slow":
        req.on("close", () => {
          closedSockets++;
        });
        return; // never answers
      default:
        return send(404, "");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const errorOf = <T>(result: Result<T, HttpError>): HttpError => {
  if (isOk(result)) throw new Error(`expected Err, got ${JSON.stringify(result.value)}`);
  return result.error;
};

describe("HttpClient over real HTTP", () => {
  it("GET JSON with params, schema and an interceptor header", async () => {
    const client = new HttpClient({ baseURL });
    client.axios.interceptors.request.use((config) => {
      config.headers.set("Authorization", "tma abc");
      return config;
    });
    const result = await client.get("/json", {
      params: { ids: [1, 2], skip: undefined },
      schema: z.object({ q: z.string(), auth: z.string() }),
    });
    expect(result).toEqual({ ok: true, value: { q: "?ids=1,2", auth: "tma abc" } });
  });

  it("POST sends JSON body", async () => {
    const client = new HttpClient({ baseURL });
    expect(await client.post("/echo", { a: [1, "x"] })).toEqual({
      ok: true,
      value: { a: [1, "x"] },
    });
  });

  it("204 gives undefined", async () => {
    const client = new HttpClient({ baseURL });
    expect(await client.delete("/empty")).toEqual({ ok: true, value: undefined });
  });

  it("non-JSON 2xx → parse with the raw text", async () => {
    const client = new HttpClient({ baseURL });
    const e = errorOf(await client.get("/html"));
    expect(e.kind).toBe("parse");
    expect(e.body).toBe("<html></html>");
    expect(await client.get("/html", { responseType: "text" })).toEqual({
      ok: true,
      value: "<html></html>",
    });
  });

  it("HTTP error with a JSON body", async () => {
    const client = new HttpClient({ baseURL });
    const e = errorOf(await client.post("/error", {}));
    expect(e.kind).toBe("http");
    expect(e.status).toBe(409);
    expect(e.code).toBe("CONFLICT");
    expect(e.data).toEqual({ code: "CONFLICT", message: "Already exists" });
    expect(e.body).toBe('{"code":"CONFLICT","message":"Already exists"}');
    expect(e.message).toBe("POST /error: HTTP 409: Already exists");
  });

  it("HTTP error with a text body", async () => {
    const client = new HttpClient({ baseURL });
    const e = errorOf(await client.get("/gateway"));
    expect(e.kind).toBe("http");
    expect(e.status).toBe(502);
    expect(e.body).toBe("<html>Bad Gateway</html>");
    expect(e.message).toBe("GET /gateway: HTTP 502: Bad Gateway");
  });

  it("timeoutMs → timeout and the socket is closed", async () => {
    const client = new HttpClient({ baseURL, timeoutMs: 5_000 });
    const before = closedSockets;
    const e = errorOf(await client.get("/slow", { timeoutMs: 50 }));
    expect(e.kind).toBe("timeout");
    await expect.poll(() => closedSockets).toBe(before + 1);
  });

  it("axios own timeout set on defaults → timeout", async () => {
    const client = new HttpClient({ baseURL });
    client.axios.defaults.timeout = 50;
    expect(errorOf(await client.get("/slow")).kind).toBe("timeout");
  });

  it("signal abort → aborted and the socket is closed", async () => {
    const client = new HttpClient({ baseURL });
    const controller = new AbortController();
    const before = closedSockets;
    const pending = client.get("/slow", { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    expect(errorOf(await pending).kind).toBe("aborted");
    await expect.poll(() => closedSockets).toBe(before + 1);
  });

  it("connection refused → network", async () => {
    const client = new HttpClient({ baseURL: "http://127.0.0.1:1/api" });
    const e = errorOf(await client.get("/x"));
    expect(e.kind).toBe("network");
    expect(e.retryable).toBe(true);
  });
});
