import { describe, expect, expectTypeOf, it } from "vitest";
import { HttpError, isHttpError } from "../src";

const http = (status: number, data?: unknown, method: "GET" | "POST" = "GET") =>
  new HttpError({ kind: "http", method, endpoint: "/x", status, data });

describe("HttpError", () => {
  it("is an Error with name, kind and request info", () => {
    const e = http(404, { message: "User not found", code: "NOT_FOUND" });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(HttpError);
    expect(e.name).toBe("HttpError");
    expect(e.kind).toBe("http");
    expect(e.method).toBe("GET");
    expect(e.endpoint).toBe("/x");
    expect(e.status).toBe(404);
    expect(e.data).toEqual({ message: "User not found", code: "NOT_FOUND" });
  });

  it("default message uses body.message, code comes from body.code", () => {
    const e = http(400, { message: "bad amount", code: "BAD_AMOUNT" });
    expect(e.message).toBe("GET /x: HTTP 400: bad amount");
    expect(e.code).toBe("BAD_AMOUNT");
  });

  it("default message without a body message, explicit message and code win", () => {
    expect(http(500).message).toBe("GET /x: HTTP 500: request failed");
    expect(http(500, { message: "" }).message).toBe("GET /x: HTTP 500: request failed");
    expect(http(500, { code: 5 }).code).toBeUndefined();
    const e = new HttpError({
      kind: "http",
      method: "GET",
      endpoint: "/x",
      status: 418,
      message: "custom",
      code: "C",
      data: { code: "IGNORED" },
    });
    expect(e.message).toBe("custom");
    expect(e.code).toBe("C");
  });

  it("default messages for the other kinds", () => {
    const m = (kind: "network" | "timeout" | "aborted" | "parse" | "validation") =>
      new HttpError({ kind, method: "POST", endpoint: "/p" }).message;
    expect(m("network")).toBe("POST /p: network error");
    expect(m("timeout")).toBe("POST /p: timed out");
    expect(m("aborted")).toBe("POST /p: request canceled");
    expect(m("parse")).toBe("POST /p: response is not JSON");
    expect(m("validation")).toBe("POST /p: response does not match schema");
  });

  it("keeps cause", () => {
    const cause = new Error("offline");
    const e = new HttpError({ kind: "network", method: "GET", endpoint: "/x", cause });
    expect(e.cause).toBe(cause);
    expect("cause" in new HttpError({ kind: "network", method: "GET", endpoint: "/x" })).toBe(
      false,
    );
  });

  it("status getters only for kind http", () => {
    expect(http(400).isBadRequest).toBe(true);
    expect(http(401).isUnauthorized).toBe(true);
    expect(http(404).isNotFound).toBe(true);
    expect(http(429).isRateLimited).toBe(true);
    expect(http(500).isServerError).toBe(true);
    expect(http(503).isServerError).toBe(true);
    expect(http(499).isServerError).toBe(false);
    expect(http(200).isNotFound).toBe(false);
    const parse = new HttpError({ kind: "parse", method: "GET", endpoint: "/x", status: 404 });
    expect(parse.isNotFound).toBe(false);
    expect(parse.isServerError).toBe(false);
  });

  it("retryable policy", () => {
    const r = (
      kind: "http" | "network" | "timeout" | "aborted" | "parse" | "validation",
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      status?: number,
    ) => new HttpError({ kind, method, endpoint: "/x", status }).retryable;
    expect(r("http", "POST", 429)).toBe(true);
    expect(r("http", "GET", 429)).toBe(true);
    for (const status of [408, 500, 502, 503, 504]) {
      expect(r("http", "GET", status)).toBe(true);
      expect(r("http", "PUT", status)).toBe(true);
      expect(r("http", "DELETE", status)).toBe(true);
      expect(r("http", "POST", status)).toBe(false);
      expect(r("http", "PATCH", status)).toBe(false);
    }
    expect(r("http", "GET", 400)).toBe(false);
    expect(r("http", "GET", 501)).toBe(false);
    expect(r("network", "GET")).toBe(true);
    expect(r("timeout", "DELETE")).toBe(true);
    expect(r("network", "POST")).toBe(false);
    expect(r("timeout", "PATCH")).toBe(false);
    expect(r("aborted", "GET")).toBe(false);
    expect(r("parse", "GET", 200)).toBe(false);
    expect(r("validation", "GET", 200)).toBe(false);
    expect(
      new HttpError({ kind: "http", method: "POST", endpoint: "/x", status: 500, retryable: true })
        .retryable,
    ).toBe(true);
  });
});

describe("isHttpError", () => {
  const network = new HttpError({ kind: "network", method: "GET", endpoint: "/x" });

  it("checks the class and optional kinds", () => {
    expect(isHttpError(http(404))).toBe(true);
    expect(isHttpError(new Error("x"))).toBe(false);
    expect(isHttpError(null)).toBe(false);
    expect(isHttpError({ kind: "http" })).toBe(false);
    expect(isHttpError(http(404), "http")).toBe(true);
    expect(isHttpError(network, "http")).toBe(false);
    expect(isHttpError(network, "network", "timeout")).toBe(true);
  });

  it("narrows types: http has status, validation has issues", () => {
    const e: unknown = http(404);
    if (isHttpError(e, "http")) {
      expectTypeOf(e.status).toEqualTypeOf<number>();
      expectTypeOf(e.kind).toEqualTypeOf<"http">();
      expect(e.status >= 400).toBe(true);
    }
    if (isHttpError(e, "validation")) {
      expectTypeOf(e.issues).toEqualTypeOf<ReadonlyArray<import("../src").ValidationIssue>>();
    }
    if (isHttpError(e, "network", "timeout")) {
      expectTypeOf(e.kind).toEqualTypeOf<"network" | "timeout">();
      expectTypeOf(e.status).toEqualTypeOf<number | undefined>();
    }
    if (isHttpError(e)) {
      expectTypeOf(e).toEqualTypeOf<HttpError>();
    }
  });
});
