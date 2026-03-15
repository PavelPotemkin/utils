import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateSchema, mustValue } from "../src/validation";
import { ValidationError } from "../src/errors";

describe("Validation", () => {
  describe("validateSchema", () => {
    it("returns parsed data for valid input", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = validateSchema(schema, { name: "John", age: 30 });
      expect(result).toEqual({ name: "John", age: 30 });
    });

    it("throws ValidationError for invalid input", () => {
      const schema = z.object({ name: z.string() });
      expect(() => validateSchema(schema, { name: 123 })).toThrow(
        ValidationError,
      );
    });

    it("includes field path in error message", () => {
      const schema = z.object({
        user: z.object({ email: z.string().email() }),
      });

      try {
        validateSchema(schema, { user: { email: "not-email" } });
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("user.email");
      }
    });

    it("applies transformations", () => {
      const schema = z.object({
        count: z.string().transform((val) => parseInt(val, 10)),
      });
      const result = validateSchema(schema, { count: "42" });
      expect(result).toEqual({ count: 42 });
    });
  });

  describe("mustValue", () => {
    it("returns value when not null/undefined", () => {
      expect(mustValue("hello", "missing")).toBe("hello");
      expect(mustValue(0, "missing")).toBe(0);
      expect(mustValue(false, "missing")).toBe(false);
      expect(mustValue("", "missing")).toBe("");
    });

    it("throws for null", () => {
      expect(() => mustValue(null, "value is null")).toThrow("value is null");
    });

    it("throws for undefined", () => {
      expect(() => mustValue(undefined, "value is undefined")).toThrow(
        "value is undefined",
      );
    });
  });
});
