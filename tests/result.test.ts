import { describe, it, expect } from "vitest";
import { Ok, Err, isOk, isErr, unwrap, type Result } from "../src/result";

describe("Result", () => {
  describe("Ok", () => {
    it("creates ok result", () => {
      const result = Ok(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it("works with complex types", () => {
      const result = Ok({ name: "test", items: [1, 2, 3] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("test");
        expect(result.value.items).toEqual([1, 2, 3]);
      }
    });
  });

  describe("Err", () => {
    it("creates error result", () => {
      const error = new Error("fail");
      const result = Err(error);
      expect(result).toEqual({ ok: false, error });
    });

    it("works with custom error types", () => {
      class CustomError extends Error {
        code = 404;
      }
      const result = Err(new CustomError("not found"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CustomError);
        expect(result.error.code).toBe(404);
      }
    });
  });

  describe("isOk", () => {
    it("returns true for Ok", () => {
      expect(isOk(Ok("value"))).toBe(true);
    });

    it("returns false for Err", () => {
      expect(isOk(Err(new Error("fail")))).toBe(false);
    });
  });

  describe("isErr", () => {
    it("returns true for Err", () => {
      expect(isErr(Err(new Error("fail")))).toBe(true);
    });

    it("returns false for Ok", () => {
      expect(isErr(Ok(42))).toBe(false);
    });
  });

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      expect(unwrap(Ok(42))).toBe(42);
    });

    it("throws error for Err", () => {
      const error = new Error("unwrap failed");
      expect(() => unwrap(Err(error))).toThrow("unwrap failed");
    });

    it("preserves error type when throwing", () => {
      class CustomError extends Error {
        code = 500;
      }
      const err = new CustomError("server error");
      const result: Result<string, CustomError> = Err(err);

      try {
        unwrap(result);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CustomError);
        expect((e as CustomError).code).toBe(500);
      }
    });
  });
});
