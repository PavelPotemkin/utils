import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  HttpError,
  ApiError,
  ResponseValidationError,
  NetworkError,
  ValidationError,
} from "../src/errors";

describe("Errors", () => {
  describe("HttpError", () => {
    it("is an Error", () => {
      const err = new HttpError("test");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("HttpError");
      expect(err.message).toBe("test");
    });
  });

  describe("ApiError", () => {
    it("creates with status info", () => {
      const err = new ApiError({
        status: 404,
        statusText: "Not Found",
        body: { message: "User not found" },
        endpoint: "/users/123",
      });

      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(404);
      expect(err.statusText).toBe("Not Found");
      expect(err.endpoint).toBe("/users/123");
      expect(err.message).toBe("[404] /users/123: User not found");
    });

    it("uses statusText when body has no message", () => {
      const err = new ApiError({
        status: 500,
        statusText: "Internal Server Error",
        body: null,
        endpoint: "/api",
      });

      expect(err.message).toBe("[500] /api: Internal Server Error");
    });

    it("isBadRequest", () => {
      const err = new ApiError({
        status: 400,
        statusText: "Bad Request",
        body: null,
        endpoint: "/",
      });
      expect(err.isBadRequest).toBe(true);
      expect(err.isNotFound).toBe(false);
    });

    it("isUnauthorized", () => {
      const err = new ApiError({
        status: 401,
        statusText: "Unauthorized",
        body: null,
        endpoint: "/",
      });
      expect(err.isUnauthorized).toBe(true);
    });

    it("isNotFound", () => {
      const err = new ApiError({
        status: 404,
        statusText: "Not Found",
        body: null,
        endpoint: "/",
      });
      expect(err.isNotFound).toBe(true);
    });

    it("isServerError", () => {
      const err = new ApiError({
        status: 502,
        statusText: "Bad Gateway",
        body: null,
        endpoint: "/",
      });
      expect(err.isServerError).toBe(true);
    });

    it("isRateLimited", () => {
      const err = new ApiError({
        status: 429,
        statusText: "Too Many Requests",
        body: null,
        endpoint: "/",
      });
      expect(err.isRateLimited).toBe(true);
    });
  });

  describe("ResponseValidationError", () => {
    it("creates with zod error", () => {
      const schema = z.object({ name: z.string() });
      const parsed = schema.safeParse({ name: 123 });

      if (parsed.success) throw new Error("should fail");

      const err = new ResponseValidationError({
        zodError: parsed.error,
        endpoint: "/users",
        rawData: { name: 123 },
      });

      expect(err).toBeInstanceOf(HttpError);
      expect(err.name).toBe("ResponseValidationError");
      expect(err.endpoint).toBe("/users");
      expect(err.rawData).toEqual({ name: 123 });
      expect(err.zodError).toBe(parsed.error);
    });
  });

  describe("NetworkError", () => {
    it("creates with cause", () => {
      const cause = new Error("ECONNREFUSED");
      const err = new NetworkError({
        cause,
        endpoint: "/api",
      });

      expect(err).toBeInstanceOf(HttpError);
      expect(err.name).toBe("NetworkError");
      expect(err.cause).toBe(cause);
      expect(err.endpoint).toBe("/api");
      expect(err.message).toBe("Network error for /api: ECONNREFUSED");
    });
  });

  describe("ValidationError", () => {
    it("creates with default message", () => {
      const err = new ValidationError();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("ValidationError");
      expect(err.message).toBe("Invalid data");
    });

    it("creates with custom message", () => {
      const err = new ValidationError("email is required");
      expect(err.message).toBe("email is required");
    });
  });
});
