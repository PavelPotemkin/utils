import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { HttpClient } from "../src/http-client";
import { ApiError, NetworkError, ResponseValidationError } from "../src/errors";
import { isOk, isErr } from "../src/result";

vi.mock("axios", () => {
  const mockAxiosInstance = {
    request: vi.fn(),
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
    },
    AxiosError: class AxiosError extends Error {
      response?: { status: number; statusText: string; data: unknown };
      constructor(
        message: string,
        _code?: string,
        _config?: unknown,
        _request?: unknown,
        response?: { status: number; statusText: string; data: unknown },
      ) {
        super(message);
        this.name = "AxiosError";
        this.response = response;
      }
    },
  };
});

describe("HttpClient", () => {
  let client: HttpClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = new HttpClient({
      baseURL: "https://api.example.com",
      headers: { "X-Custom": "test" },
      timeout: 5000,
    });
    const axios = await import("axios");
    const instance = axios.default.create();
    mockRequest = instance.request as ReturnType<typeof vi.fn>;
  });

  describe("constructor", () => {
    it("creates axios instance with config", async () => {
      const axios = await import("axios");
      expect(axios.default.create).toHaveBeenCalledWith({
        baseURL: "https://api.example.com",
        headers: { "X-Custom": "test" },
        timeout: 5000,
      });
    });
  });

  describe("get", () => {
    it("returns Ok with data", async () => {
      mockRequest.mockResolvedValue({ data: { id: 1, name: "test" } });

      const result = await client.get("/users/1");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ id: 1, name: "test" });
      }

      expect(mockRequest).toHaveBeenCalledWith({
        method: "GET",
        url: "/users/1",
        data: undefined,
        params: undefined,
        headers: undefined,
      });
    });

    it("serializes query params", async () => {
      mockRequest.mockResolvedValue({ data: [] });

      await client.get("/users", {
        params: { page: 1, tags: ["a", "b"], empty: null },
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: "1", tags: "a,b" },
        }),
      );
    });

    it("validates response with zod schema", async () => {
      const schema = z.object({ id: z.number(), name: z.string() });
      mockRequest.mockResolvedValue({ data: { id: 1, name: "test" } });

      const result = await client.get("/users/1", { schema });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ id: 1, name: "test" });
      }
    });

    it("returns ResponseValidationError on schema mismatch", async () => {
      const schema = z.object({ id: z.number(), name: z.string() });
      mockRequest.mockResolvedValue({ data: { id: "not-number" } });

      const result = await client.get("/users/1", { schema });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ResponseValidationError);
        expect((result.error as ResponseValidationError).endpoint).toBe(
          "/users/1",
        );
      }
    });
  });

  describe("post", () => {
    it("sends body and returns data", async () => {
      mockRequest.mockResolvedValue({ data: { id: 1 } });

      const result = await client.post("/users", { name: "John" });

      expect(isOk(result)).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: "/users",
          data: { name: "John" },
        }),
      );
    });
  });

  describe("put", () => {
    it("sends PUT request", async () => {
      mockRequest.mockResolvedValue({ data: { updated: true } });

      const result = await client.put("/users/1", { name: "Jane" });

      expect(isOk(result)).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  describe("patch", () => {
    it("sends PATCH request", async () => {
      mockRequest.mockResolvedValue({ data: { patched: true } });

      const result = await client.patch("/users/1", { name: "Jane" });

      expect(isOk(result)).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  describe("delete", () => {
    it("sends DELETE request", async () => {
      mockRequest.mockResolvedValue({ data: null });

      const result = await client.delete("/users/1");

      expect(isOk(result)).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("error handling", () => {
    it("returns ApiError for HTTP errors", async () => {
      const { AxiosError } = await import("axios");
      const axiosError = new AxiosError("Not Found", "404", undefined, undefined, {
        status: 404,
        statusText: "Not Found",
        data: { message: "User not found" },
      });

      mockRequest.mockRejectedValue(axiosError);

      const result = await client.get("/users/999");

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ApiError);
        const apiErr = result.error as ApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.endpoint).toBe("/users/999");
      }
    });

    it("returns NetworkError for connection errors", async () => {
      mockRequest.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await client.get("/users/1");

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(NetworkError);
        expect((result.error as NetworkError).endpoint).toBe("/users/1");
      }
    });

    it("handles non-Error throws", async () => {
      mockRequest.mockRejectedValue("string error");

      const result = await client.get("/users/1");

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(NetworkError);
      }
    });
  });

  describe("custom headers per request", () => {
    it("passes request-level headers", async () => {
      mockRequest.mockResolvedValue({ data: {} });

      await client.get("/protected", {
        headers: { Authorization: "Bearer token123" },
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Authorization: "Bearer token123" },
        }),
      );
    });
  });
});
