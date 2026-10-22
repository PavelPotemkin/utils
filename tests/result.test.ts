import { describe, expect, expectTypeOf, it } from "vitest";
import { type Err, err, isErr, isOk, type Ok, ok, type Result, unwrap } from "../src";

describe("Result", () => {
  it("ok / err build the two shapes", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    const e = new Error("boom");
    expect(err(e)).toEqual({ ok: false, error: e });
  });

  it("isOk / isErr narrow", () => {
    const results: Result<number, Error>[] = [ok(1), err(new Error("x"))];
    const [good, bad] = results as [Result<number, Error>, Result<number, Error>];
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
    if (isOk(good)) expectTypeOf(good.value).toEqualTypeOf<number>();
    if (isErr(bad)) expectTypeOf(bad.error).toEqualTypeOf<Error>();
  });

  it("unwrap returns the value or throws the error itself", () => {
    expect(unwrap(ok("v"))).toBe("v");
    const e = new TypeError("bad");
    expect(() => unwrap(err(e))).toThrow(e);
  });

  it("unwrap wraps a non-Error error into Error with cause", () => {
    try {
      unwrap(err("plain"));
      expect.unreachable();
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("unwrap() on Err: plain");
      expect((thrown as Error).cause).toBe("plain");
    }
  });

  it("types: ok/err are assignable to Result, default E is Error", () => {
    const a: Result<number> = ok(1);
    const b: Result<number> = err(new Error("x"));
    const c: Result<number, string> = err("x");
    expectTypeOf(ok(1)).toEqualTypeOf<Ok<number>>();
    expectTypeOf(err("x")).toEqualTypeOf<Err<string>>();
    expectTypeOf<Result<number>>().toEqualTypeOf<Ok<number> | Err<Error>>();
    expect([a.ok, b.ok, c.ok]).toEqual([true, false, false]);
  });

  it("types: a function returning ok() or err() infers a Result-compatible union", () => {
    const pick = (flag: boolean) => (flag ? ok(1) : err(new RangeError("r")));
    const r: Result<number, RangeError> = pick(true);
    expect(unwrap(r)).toBe(1);
  });
});
