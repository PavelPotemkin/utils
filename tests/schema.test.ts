import { describe, expect, expectTypeOf, it } from "vitest";
import { z as z4 } from "zod";
import { z as z3 } from "zod/v3";
import type { ValidationIssue, ValidationSchema } from "../src";
import { formatIssues } from "../src/schema";

const accept = <T>(schema: ValidationSchema<T>) => schema;

describe("ValidationSchema is structural", () => {
  it("accepts zod 4 and infers the output type", () => {
    const schema = accept(z4.object({ id: z4.number(), at: z4.string().default("now") }));
    expectTypeOf(schema).toEqualTypeOf<ValidationSchema<{ id: number; at: string }>>();
    const bad = schema.safeParse({ id: "1" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.path).toEqual(["id"]);
  });

  it("accepts zod 3 and infers the output type", () => {
    const schema = accept(z3.object({ id: z3.number() }));
    expectTypeOf(schema).toEqualTypeOf<ValidationSchema<{ id: number }>>();
    const bad = schema.safeParse({});
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.path).toEqual(["id"]);
  });

  it("accepts a hand-written schema", () => {
    const positive: ValidationSchema<number> = {
      safeParse: (data) =>
        typeof data === "number" && data > 0
          ? { success: true, data }
          : { success: false, error: { issues: [{ message: "not positive", path: [] }] } },
    };
    expect(positive.safeParse(1)).toEqual({ success: true, data: 1 });
    expect(positive.safeParse(-1).success).toBe(false);
  });
});

describe("formatIssues", () => {
  it("shows up to three issues with paths", () => {
    const issues: ValidationIssue[] = [
      { message: "a", path: ["x", 0] },
      { message: "b", path: [] },
      { message: "c", path: ["y"] },
      { message: "d", path: ["z"] },
      { message: "e", path: ["w"] },
    ];
    expect(formatIssues(issues)).toBe("x.0: a; (root): b; y: c; … +2");
    expect(formatIssues(issues.slice(0, 1))).toBe("x.0: a");
  });
});
