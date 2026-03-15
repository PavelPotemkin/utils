import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  getDecimal,
  sanitizeFloatLine,
  trimTrailingZeroes,
  formatFloatLine,
  formatCount,
} from "../src/format";

describe("Format", () => {
  describe("getDecimal", () => {
    it("parses valid numbers", () => {
      expect(getDecimal("123.45")?.toNumber()).toBe(123.45);
      expect(getDecimal(42)?.toNumber()).toBe(42);
      expect(getDecimal("0")?.toNumber()).toBe(0);
    });

    it("returns undefined for invalid input", () => {
      expect(getDecimal("abc")).toBeUndefined();
      expect(getDecimal("")).toBeUndefined();
      expect(getDecimal(NaN)).toBeUndefined();
    });
  });

  describe("sanitizeFloatLine", () => {
    it("removes non-digit characters", () => {
      expect(sanitizeFloatLine("$1,234.56")).toBe("1234.56");
    });

    it("handles multiple dots", () => {
      expect(sanitizeFloatLine("12.34.56")).toBe("12.3456");
    });

    it("handles negative numbers", () => {
      expect(sanitizeFloatLine("-123.45")).toBe("-123.45");
    });

    it("removes leading zeros", () => {
      expect(sanitizeFloatLine("00123.45")).toBe("123.45");
    });

    it("removes trailing zeros in fractional part", () => {
      expect(sanitizeFloatLine("123.4500")).toBe("123.45");
    });
  });

  describe("trimTrailingZeroes", () => {
    it("trims trailing zeros", () => {
      expect(trimTrailingZeroes("1.200")).toBe("1.2");
      expect(trimTrailingZeroes("1.000")).toBe("1");
    });

    it("keeps number without fractional part", () => {
      expect(trimTrailingZeroes("42")).toBe("42");
    });

    it("handles no trailing zeros", () => {
      expect(trimTrailingZeroes("1.23")).toBe("1.23");
    });
  });

  describe("formatFloatLine", () => {
    it("formats number with default options", () => {
      expect(formatFloatLine(1234.5)).toBe("1234.5");
    });

    it("formats with accuracy", () => {
      expect(formatFloatLine(1234.5678, { accuracy: 2 })).toBe("1234.57");
    });

    it("formats with rounding", () => {
      expect(
        formatFloatLine(1.999, { accuracy: 2, rounding: Decimal.ROUND_DOWN }),
      ).toBe("1.99");
    });

    it("handles string input", () => {
      expect(formatFloatLine("1234.5")).toBe("1234.5");
    });

    it("handles Decimal input", () => {
      expect(formatFloatLine(new Decimal("1234.5"))).toBe("1234.5");
    });

    it("handles negative numbers", () => {
      expect(formatFloatLine(-123.456, { accuracy: 2 })).toBe("-123.46");
    });

    it("trims trailing zeros by default", () => {
      expect(formatFloatLine(1.1, { accuracy: 4 })).toBe("1.1");
    });

    it("keeps trailing zeros when trim=false", () => {
      expect(formatFloatLine(1.1, { accuracy: 4, trim: false })).toBe(
        "1.1000",
      );
    });

    it("handles zero", () => {
      expect(formatFloatLine(0)).toBe("0");
    });

    it("handles empty string", () => {
      expect(formatFloatLine("")).toBe("0");
    });

    it("handles floating point precision with accuracy", () => {
      expect(formatFloatLine(0.1 + 0.2, { accuracy: 1 })).toBe("0.3");
    });

    it("handles small values rounded to zero", () => {
      expect(formatFloatLine(0.001, { accuracy: 2 })).toBe("0");
    });

    it("handles rounding that changes whole part", () => {
      expect(formatFloatLine(999.995, { accuracy: 2 })).toBe("1000");
    });

    it("handles negative decimal", () => {
      expect(formatFloatLine(-0.5)).toBe("-0.5");
    });

    it("handles large numbers", () => {
      expect(formatFloatLine(1000000)).toBe("1000000");
    });
  });

  describe("formatCount", () => {
    it("formats thousands", () => {
      const result = formatCount(1500);
      expect(result.full).toBe("1.5K");
      expect(result.postfix).toBe("K");
    });

    it("formats millions", () => {
      const result = formatCount(2_500_000);
      expect(result.full).toBe("2.5M");
      expect(result.postfix).toBe("M");
    });

    it("formats billions", () => {
      const result = formatCount(3_000_000_000);
      expect(result.full).toBe("3B");
      expect(result.postfix).toBe("B");
    });

    it("formats numbers below 1000 without postfix", () => {
      const result = formatCount(42);
      expect(result.full).toBe("42");
      expect(result.postfix).toBe("");
    });

    it("handles string input", () => {
      const result = formatCount("1500");
      expect(result.full).toBe("1.5K");
    });

    it("handles Decimal input", () => {
      const result = formatCount(new Decimal(2500));
      expect(result.full).toBe("2.5K");
    });

    it("respects custom accuracy", () => {
      const result = formatCount(1234, { accuracy: 2 });
      expect(result.full).toBe("1.23K");
    });

    it("stores raw Decimal value", () => {
      const result = formatCount(1500);
      expect(result.raw).toBeInstanceOf(Decimal);
      expect(result.raw.toNumber()).toBe(1500);
    });

    it("handles zero", () => {
      const result = formatCount(0);
      expect(result.full).toBe("0");
      expect(result.postfix).toBe("");
    });

    it("handles exact boundaries", () => {
      expect(formatCount(1000).full).toBe("1K");
      expect(formatCount(1_000_000).full).toBe("1M");
      expect(formatCount(1_000_000_000).full).toBe("1B");
    });

    it("rounds small remainders", () => {
      expect(formatCount(1004).full).toBe("1K");
      expect(formatCount(1050).full).toBe("1.1K");
    });

    it("handles near-boundary values", () => {
      expect(formatCount(999).full).toBe("999");
      expect(formatCount(999999).full).toBe("1000K");
    });
  });
});
